// services/ponto/pontoFixedWidthParser.ts
//
// Parser generico para formatos fixed-width de ponto eletronico (ACJEF, AFDT, AFD).
// Schema-driven: nao tem nada hardcoded sobre ACJEF aqui. O modelo do Firestore
// (ponto_modelos/{id}.schemas) define posicoes/tamanhos de cada tipo de registro.
//
// Por que schema-as-data?
//  - ACJEF e padrao legal mas DIMEP, Henry, Ahgora podem ter pequenas variacoes
//  - Ajuste de schema sem deploy: corrige posicao no Firestore e proxima importacao usa
//  - Mesmo parser serve pra AFDT e AFD se a gente decidir suportar depois

import type {
  ModeloPonto,
  LayoutPonto,
  RegistroSchema,
  CampoFixo,
  EventoApurado,
  MapeamentoEvento,
  ResultadoParsingPonto,
  FonteEvento,
} from '../../types/ponto';

// -------- Decoder de bytes -> string --------

/** Decodifica ArrayBuffer em string respeitando o encoding do modelo (default ISO-8859-1). */
export function decodeBuffer(buf: ArrayBuffer, encoding: string = 'iso-8859-1'): string {
  // TextDecoder suporta iso-8859-1 nativamente nos navegadores modernos e no Node 11+.
  const decoder = new TextDecoder(encoding, { fatal: false });
  return decoder.decode(buf);
}

// -------- Helpers de extracao de campo --------

function extrairCampoBruto(linha: string, campo: CampoFixo): string {
  // inicio e 1-based (igual ao spec da Portaria); JS string e 0-based
  const start = campo.inicio - 1;
  const end = start + campo.tamanho;
  return linha.substring(start, end);
}

function converterCampo(raw: string, tipo: CampoFixo['tipo']): string | number | Date | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  switch (tipo) {
    case 'string':
      return trimmed;
    case 'number': {
      const n = Number(trimmed);
      return Number.isFinite(n) ? n : null;
    }
    case 'data_ddmmaaaa': {
      // formato DDMMAAAA
      if (trimmed.length !== 8 || !/^\d{8}$/.test(trimmed)) return null;
      const dd = Number(trimmed.substring(0, 2));
      const mm = Number(trimmed.substring(2, 4));
      const aaaa = Number(trimmed.substring(4, 8));
      const d = new Date(aaaa, mm - 1, dd);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'hora_hhmm':
    case 'tempo_hhmm': {
      // formato HHMM (4 digitos): retorna em minutos para tempo_hhmm,
      // ou em fracao de hora (HH + MM/60) para hora_hhmm/tempo_hhmm.
      // Padronizamos em MINUTOS (mais facil de converter depois pra horas).
      if (trimmed.length !== 4 || !/^\d{4}$/.test(trimmed)) return null;
      const hh = Number(trimmed.substring(0, 2));
      const mm = Number(trimmed.substring(2, 4));
      return hh * 60 + mm; // minutos totais
    }
    default:
      return trimmed;
  }
}

/** Extrai todos os campos de uma linha conforme o schema. Retorna objeto chave->valor. */
function extrairRegistro(linha: string, schema: RegistroSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { __tipo: schema.tipo, __nome: schema.nome };
  for (const campo of schema.campos) {
    const raw = extrairCampoBruto(linha, campo);
    out[campo.nome] = converterCampo(raw, campo.tipo);
  }
  return out;
}

// -------- Identificacao do tipo de registro --------

/**
 * Le o tipo de registro de uma linha (caractere na posicao 10, padrao Portaria 1510).
 * Permite override por modelo se algum fabricante usar posicao diferente.
 */
function lerTipoRegistro(linha: string, posicaoTipo: number = 10): string | null {
  if (linha.length < posicaoTipo) return null;
  return linha.charAt(posicaoTipo - 1);
}

// -------- Conversao de unidade --------

/**
 * Converte o valor bruto extraido para a unidade que o IOB SAGE espera.
 * - Se o campo no arquivo veio em minutos (tempo_hhmm) e o SAGE quer horas: divide por 60.
 * - Se veio em centavos e SAGE quer R$: divide por 100.
 * Por simplicidade, hoje so tratamos minutos->horas; o resto fica passthrough.
 */
function converterParaUnidadeSAGE(
  valorBruto: unknown,
  campoSchemaTipo: CampoFixo['tipo'] | undefined,
  unidadeSAGE: MapeamentoEvento['unidade'],
): number {
  if (typeof valorBruto !== 'number') return 0;
  // tempo_hhmm e armazenado em minutos pelo extrator. Se SAGE quer horas, dividir.
  if (campoSchemaTipo === 'tempo_hhmm' && unidadeSAGE === 'horas') {
    return valorBruto / 60;
  }
  return valorBruto;
}

// -------- Resolucao de de-para (modelo + overrides do layout) --------

function resolverMapeamento(
  codigoOrigem: string,
  modelo: ModeloPonto,
  layout: LayoutPonto | null,
): MapeamentoEvento | null {
  const chave = String(codigoOrigem).toUpperCase().trim();
  const override = layout?.overridesDePara?.[chave];
  if (override) return override;
  return modelo.deParaEventos[chave] ?? null;
}

// -------- Parser principal --------

export interface ParseOptions {
  /** Nome do arquivo (vai pra fonte do evento). */
  nomeArquivo: string;
  /** CNPJ esperado (so digitos). Se o header trouxer outro, vira erro fatal. */
  cnpjEsperado: string;
  /** Posicao 1-based onde fica o caractere do tipo de registro. Default 10. */
  posicaoTipoRegistro?: number;
  /** Nome do campo no schema do tipo 1 que carrega o CNPJ do empregador. */
  nomeCampoCnpjHeader?: string;
  /** Nome do campo no schema do tipo 1 que carrega a razao social. */
  nomeCampoRazaoHeader?: string;
}

export function parsearArquivoFixedWidth(
  conteudo: string,
  modelo: ModeloPonto,
  layout: LayoutPonto | null,
  opts: ParseOptions,
): ResultadoParsingPonto {
  const resultado: ResultadoParsingPonto = {
    empresaCnpj: '',
    totalRegistros: 0,
    eventos: [],
    pisSemMatricula: [],
    avisos: [],
    erros: [],
  };

  if (!modelo.schemas || modelo.schemas.length === 0) {
    resultado.erros.push(
      `Modelo "${modelo.id}" nao tem schemas de registro definidos. Cadastre os schemas no Firestore antes de importar.`,
    );
    return resultado;
  }

  const schemasPorTipo = new Map<string, RegistroSchema>();
  for (const s of modelo.schemas) schemasPorTipo.set(s.tipo, s);

  const linhas = conteudo.split(/\r?\n/).filter((l) => l.length > 0);
  resultado.totalRegistros = linhas.length;

  const pisSemMatriculaSet = new Set<string>();
  let cnpjHeader: string | null = null;
  let razaoHeader: string | null = null;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const tipo = lerTipoRegistro(linha, opts.posicaoTipoRegistro ?? 10);
    if (!tipo) {
      resultado.avisos.push(`Linha ${i + 1}: nao foi possivel identificar tipo de registro`);
      continue;
    }
    const schema = schemasPorTipo.get(tipo);
    if (!schema) {
      resultado.avisos.push(`Linha ${i + 1}: tipo de registro "${tipo}" nao tem schema (ignorado)`);
      continue;
    }
    const registro = extrairRegistro(linha, schema);

    // Cabecalho: extrai CNPJ e razao para validacao
    if (tipo === '1') {
      const campoCnpj = opts.nomeCampoCnpjHeader ?? 'cnpj';
      const campoRazao = opts.nomeCampoRazaoHeader ?? 'razaoSocial';
      cnpjHeader = String(registro[campoCnpj] ?? '').replace(/\D/g, '');
      razaoHeader = registro[campoRazao] ? String(registro[campoRazao]) : null;
      continue;
    }

    // Registro de evento: gera EventoApurado se houver de-para
    if (schema.ehEvento) {
      const codCampo = schema.campoCodigoEvento ?? 'codEvento';
      const pisCampo = schema.campoPIS ?? 'pis';
      const qtdCampo = schema.campoQuantidade ?? 'quantidade';

      const codigoOrigem = String(registro[codCampo] ?? '').trim();
      const pis = String(registro[pisCampo] ?? '').trim();
      if (!codigoOrigem) {
        resultado.avisos.push(`Linha ${i + 1}: registro tipo "${tipo}" sem codigo de evento`);
        continue;
      }

      const mapeamento = resolverMapeamento(codigoOrigem, modelo, layout);
      if (!mapeamento) {
        resultado.avisos.push(
          `Linha ${i + 1}: codigo de evento "${codigoOrigem}" sem mapeamento no modelo "${modelo.id}". Cadastre em deParaEventos.`,
        );
        continue;
      }

      // Encontrar o campo de quantidade no schema para saber o tipo (tempo_hhmm vs number)
      const campoQtdSchema = schema.campos.find((c) => c.nome === qtdCampo);
      const valorBruto = registro[qtdCampo];
      const valorConvertido = converterParaUnidadeSAGE(valorBruto, campoQtdSchema?.tipo, mapeamento.unidade);

      const ignorarSeZero = mapeamento.ignorarSeZero !== false;
      if (ignorarSeZero && valorConvertido === 0) continue;

      const matricula = layout?.pisToMatricula?.[pis] ?? null;
      if (!matricula && pis) pisSemMatriculaSet.add(pis);

      const fonte: FonteEvento = {
        arquivo: opts.nomeArquivo,
        tipoArquivo: modelo.formato,
        nsr: typeof registro.nsr === 'number' ? registro.nsr : i + 1,
      };

      const evento: EventoApurado = {
        matricula,
        pis: pis || undefined,
        evento: mapeamento.eventoSAGE,
        descricao: mapeamento.descricao,
        valor: valorConvertido,
        unidade: mapeamento.unidade,
        rv: mapeamento.rv,
        origem: 'ponto',
        fonte,
      };
      resultado.eventos.push(evento);
    }
  }

  // Validacao cruzada: CNPJ do header tem que bater com o esperado
  if (cnpjHeader) {
    resultado.empresaCnpj = cnpjHeader;
    if (cnpjHeader !== opts.cnpjEsperado.replace(/\D/g, '')) {
      resultado.erros.push(
        `CNPJ do arquivo (${cnpjHeader}) nao bate com a empresa selecionada (${opts.cnpjEsperado}). ` +
          `Confirme que voce esta importando o arquivo da empresa certa.`,
      );
    }
  } else {
    resultado.erros.push('Nao foi possivel extrair CNPJ do cabecalho (registro tipo 1).');
  }
  if (razaoHeader) resultado.empresaRazaoSocial = razaoHeader;

  resultado.pisSemMatricula = Array.from(pisSemMatriculaSet);
  return resultado;
}
