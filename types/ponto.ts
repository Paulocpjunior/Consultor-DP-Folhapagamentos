// types/ponto.ts
//
// Tipos do modulo de Ponto Eletronico do Consultor-DP.
//
// Arquitetura:
//  - ModeloPonto: definicao reutilizavel de "como ler" um formato de ponto
//    (ACJEF padrao, AFDT, planilha DIMEP, etc). Vive em Firestore: ponto_modelos/{id}.
//  - LayoutPonto: parametrizacao especifica de uma empresa (CNPJ + cadastro SAGE)
//    que aponta para um modelo + overrides. Vive em ponto_layouts/{cnpj}_{cadastroSAGE}.
//  - EventoApurado: unidade de evento normalizado, pronto para entrar no event bus
//    junto com eventos vindos da folha. E o que o exportador IOB SAGE consome.

// ===== Schemas de formato fixed-width (ACJEF, AFDT, AFD) =====

export type TipoCampo = 'string' | 'number' | 'data_ddmmaaaa' | 'hora_hhmm' | 'tempo_hhmm';

export interface CampoFixo {
  nome: string;
  inicio: number;   // posicao 1-based, igual ao spec da Portaria 1510
  tamanho: number;  // em caracteres
  tipo: TipoCampo;
}

export interface RegistroSchema {
  tipo: string;        // '1','2','3','4','5','9' — caractere na posicao 10 do registro
  nome: string;        // 'cabecalho', 'marcacao', 'evento', 'trailer'...
  ehEvento: boolean;   // true: gera EventoApurado; false: metadado (header/trailer)
  campos: CampoFixo[];

  // Se ehEvento=true, indica como mapear os campos para EventoApurado:
  campoCodigoEvento?: string;       // nome do campo que carrega o codigo (ex: 'codEvento')
  campoPIS?: string;                // nome do campo PIS
  campoQuantidade?: string;         // nome do campo com a quantidade/valor
  campoData?: string;               // nome do campo de data (opcional)
}

// ===== Layout de planilha (espelho de ponto: DIMEP, Henry, etc) =====

export interface LayoutPlanilha {
  abaModo: 'primeira_aba' | 'nome_aba';
  nomeAba?: string;
  linhaCabecalho: number;        // 1-based
  primeiraLinhaDados: number;    // 1-based
  colunaIdentificadorTipo: 'pis' | 'matricula';
  colunaIdentificadorIndice: number;
  colunaNomeFuncionario?: number;
  colunasEventos: Array<{
    indiceColuna: number;
    rotuloCabecalho: string;
    codigoOrigem: string;        // identificador interno (ex: 'HE_50', 'FALTA_DIA')
  }>;
}

// ===== De-para: codigo do fabricante -> evento IOB SAGE =====

export type UnidadeEvento = 'horas' | 'minutos' | 'dias' | 'valor_brl' | 'quantidade';
export type TipoLancamento = 'R' | 'V'; // Referencia (horas) ou Valor (R$)

export interface MapeamentoEvento {
  eventoSAGE: string;       // ex: '0810'
  descricao: string;        // ex: 'HORA EXTRA 50%'
  unidade: UnidadeEvento;
  rv: TipoLancamento;
  ignorarSeZero?: boolean;  // default true
}

// ===== ModeloPonto (Firestore: ponto_modelos/{id}) =====

export type FormatoPonto = 'acjef' | 'afdt' | 'afd' | 'xlsx_espelho' | 'csv_espelho';

export interface ModeloPonto {
  id: string;                      // 'acjef_p1510_v1', 'dimep_espelho_xlsx_v1'
  nome: string;                    // 'ACJEF Padrao (Portaria 1510)'
  fabricante: string;              // 'GENERICO', 'DIMEP', 'HENRY', 'AHGORA', 'TOPDATA', 'CONTROLID'
  formato: FormatoPonto;
  versao: string;                  // semver: '1.0.0'
  documentacao?: string;           // URL ou nota interna sobre a fonte do schema

  // Para formatos fixed-width (acjef, afdt, afd):
  schemas?: RegistroSchema[];
  encoding?: 'iso-8859-1' | 'utf-8'; // default iso-8859-1 (Portaria 1510)

  // Para formatos planilha:
  layoutPlanilha?: LayoutPlanilha;

  // De-para do codigo de evento do fabricante para IOB SAGE.
  // Chave: codigoOrigem em string (normalizado em UPPERCASE para comparacao).
  deParaEventos: Record<string, MapeamentoEvento>;

  createdAt: number;
  updatedAt: number;
  versaoSchema: number;
}

// ===== LayoutPonto (Firestore: ponto_layouts/{cnpj}_{cadastroSAGE}) =====

export interface LayoutPonto {
  cnpj: string;                    // so digitos
  cnpjFormatted: string;           // 'XX.XXX.XXX/XXXX-XX'
  razaoSocial: string;
  cadastroSAGE: string;            // ex: '0903'
  modeloId: string;                // FK para ponto_modelos

  // Overrides especificos do cliente, se algum codigo diferir do padrao do fabricante
  overridesDePara?: Record<string, MapeamentoEvento>;

  // PIS -> matricula SAGE. ACJEF traz PIS; SAGE quer matricula.
  // Mantido aqui por empresa, atualizado conforme novos PIS aparecem.
  pisToMatricula?: Record<string, string>;

  createdAt: number;
  updatedAt: number;
  createdBy: string;
  versao: number;
}

// ===== EventoApurado: unidade do event bus =====

export type OrigemEvento = 'folha' | 'ponto';

export interface FonteEvento {
  arquivo: string;                  // nome original do arquivo importado
  tipoArquivo: FormatoPonto | 'xlsx_folha';
  nsr?: number;                     // pra fixed-width: numero sequencial do registro
  linha?: number;                   // pra planilha: indice da linha (1-based)
  colunaOriginal?: string;          // pra planilha: rotulo do header
}

export interface EventoApurado {
  matricula: string | null;         // null = PIS sem matricula mapeada (pendente cadastro)
  pis?: string;                     // so presente em eventos vindos do ponto
  nomeFuncionario?: string;
  evento: string;                   // codigo IOB SAGE: '0810'
  descricao: string;                // 'HORA EXTRA 50%'
  valor: number;                    // ja convertido pra unidade SAGE
  unidade: UnidadeEvento;
  rv: TipoLancamento;
  origem: OrigemEvento;
  fonte: FonteEvento;
}

// ===== Resultado do parsing =====

export interface ResultadoParsingPonto {
  empresaCnpj: string;              // CNPJ extraido do header (validacao cruzada)
  empresaRazaoSocial?: string;
  competencia?: string;             // MM/AAAA derivado do periodo do arquivo
  periodoInicial?: Date;
  periodoFinal?: Date;
  totalRegistros: number;
  eventos: EventoApurado[];
  pisSemMatricula: string[];        // PIS distintos sem mapeamento -> abrir cadastro
  avisos: string[];                 // problemas nao-fatais
  erros: string[];                  // problemas fatais (header invalido, CNPJ nao bate)
}

// ===== Conflitos do merger =====

export interface ConflitoEvento {
  matricula: string;
  nomeFuncionario?: string;
  evento: string;
  descricao: string;
  unidade: UnidadeEvento;
  candidatos: Array<{
    origem: OrigemEvento;
    valor: number;
    fonte: FonteEvento;
  }>;
}

export type ResolucaoConflito =
  | { tipo: 'usar_origem'; origem: OrigemEvento }
  | { tipo: 'somar' }
  | { tipo: 'ignorar' }
  | { tipo: 'valor_customizado'; valor: number };

export interface ResultadoMerge {
  eventosResolvidos: EventoApurado[];   // sem conflito ou ja resolvidos
  conflitos: ConflitoEvento[];          // pendentes de decisao do usuario
}
