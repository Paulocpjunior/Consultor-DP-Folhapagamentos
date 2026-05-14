/**
 * templatePadraoDetector.ts — v2.1.0
 *
 * Detecta se uma planilha XLSX está no formato LONG do template padrão IOB SAGE
 * (1 linha por evento, com código SAGE já preenchido).
 *
 * Mudanças vs v2.0.0:
 *  - Match por palavras-chave normalizadas (acentos, parênteses, hífens removidos)
 *  - Aceita variações comuns dos cabeçalhos ("Nome do Funcionário", "Tipo (R/V)" etc.)
 *  - Coluna "Observação" agora é OPCIONAL (mas ainda lida se presente)
 *  - Cabeçalho buscado entre L1–L10 (não fixo em L4)
 *  - Funciona em qualquer aba do workbook (mantido)
 */

import * as XLSX from 'xlsx';

// ------- Tipos públicos -------

export interface ColunaTemplate {
  matricula: number;
  nome: number;
  codigoEvento: number;
  descricao: number | null;     // opcional
  tipo: number;
  referencia: number | null;    // opcional
  valor: number;
  observacao: number | null;    // opcional
}

export interface DeteccaoTemplate {
  ehTemplatePadrao: boolean;
  abaNome: string | null;
  linhaCabecalho: number | null;     // 1-indexed
  colunas: ColunaTemplate | null;
  motivoFalha?: string;              // para debug/log
}

// ------- Constantes -------

const COLUNAS_OBRIGATORIAS = ['matricula', 'nome', 'codigo_evento', 'tipo', 'valor'] as const;

const SINONIMOS: Record<string, string[]> = {
  matricula:      ['matricula', 'matricula funcionario', 'cod funcionario', 'codigo funcionario'],
  nome:           ['nome', 'nome funcionario', 'nome do funcionario', 'funcionario', 'colaborador', 'empregado'],
  codigo_evento:  ['codigo evento', 'cod evento', 'evento', 'codigo', 'cod', 'codigo sage', 'cod sage'],
  descricao:      ['descricao', 'descricao evento', 'descricao do evento', 'desc evento', 'desc'],
  tipo:           ['tipo', 'tipo r v', 'tipo rv', 'r v', 'rv', 'r/v', 'natureza'],
  referencia:     ['referencia', 'ref', 'qtd', 'quantidade', 'horas'],
  valor:          ['valor', 'valor r', 'valor rs', 'vlr', 'vl'],
  observacao:     ['observacao', 'obs', 'comentario', 'nota'],
};

const MAX_LINHAS_BUSCA_CABECALHO = 10;

// ------- Normalização -------

/** Tira acentos, parênteses, hífens, pontos, slashes; lowercase; colapsa espaços. */
export function normalizar(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[()\[\]{}\-_./\\,;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Dado um texto normalizado, retorna a chave do SINONIMOS que ele representa (ou null). */
function classificarCelula(textoNorm: string): keyof typeof SINONIMOS | null {
  if (!textoNorm) return null;
  for (const chave of Object.keys(SINONIMOS) as Array<keyof typeof SINONIMOS>) {
    if (SINONIMOS[chave].includes(textoNorm)) return chave;
  }
  // fallback: match parcial (começa com / contém) — protege contra " - " e ruído
  for (const chave of Object.keys(SINONIMOS) as Array<keyof typeof SINONIMOS>) {
    if (SINONIMOS[chave].some(sin => textoNorm === sin || textoNorm.startsWith(sin + ' ') || textoNorm.endsWith(' ' + sin))) {
      return chave;
    }
  }
  return null;
}

// ------- Núcleo -------

/** Tenta identificar a linha de cabeçalho + posições das colunas numa aba. */
function detectarCabecalhoNaAba(ws: XLSX.WorkSheet): {
  linha: number;
  colunas: ColunaTemplate;
} | null {
  // Converte para matriz com posições crus
  const matriz: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null });
  const limite = Math.min(matriz.length, MAX_LINHAS_BUSCA_CABECALHO);

  for (let i = 0; i < limite; i++) {
    const linha = matriz[i] ?? [];
    const mapeamento: Partial<Record<keyof typeof SINONIMOS, number>> = {};

    for (let j = 0; j < linha.length; j++) {
      const norm = normalizar(linha[j]);
      const chave = classificarCelula(norm);
      if (chave && mapeamento[chave] === undefined) {
        mapeamento[chave] = j;
      }
    }

    // Confere se todas as obrigatórias foram encontradas
    const todasObrigatorias = COLUNAS_OBRIGATORIAS.every(c => mapeamento[c] !== undefined);
    if (todasObrigatorias) {
      return {
        linha: i + 1, // 1-indexed
        colunas: {
          matricula:    mapeamento.matricula!,
          nome:         mapeamento.nome!,
          codigoEvento: mapeamento.codigo_evento!,
          descricao:    mapeamento.descricao    ?? null,
          tipo:         mapeamento.tipo!,
          referencia:   mapeamento.referencia   ?? null,
          valor:        mapeamento.valor!,
          observacao:   mapeamento.observacao   ?? null,
        },
      };
    }
  }
  return null;
}

/**
 * Ponto de entrada principal: recebe um WorkBook e devolve a detecção.
 * Tenta TODAS as abas — retorna a primeira que bater.
 */
export function detectarTemplatePadrao(wb: XLSX.WorkBook): DeteccaoTemplate {
  for (const nomeAba of wb.SheetNames) {
    const ws = wb.Sheets[nomeAba];
    if (!ws) continue;

    const achou = detectarCabecalhoNaAba(ws);
    if (achou) {
      return {
        ehTemplatePadrao: true,
        abaNome: nomeAba,
        linhaCabecalho: achou.linha,
        colunas: achou.colunas,
      };
    }
  }

  return {
    ehTemplatePadrao: false,
    abaNome: null,
    linhaCabecalho: null,
    colunas: null,
    motivoFalha: 'Nenhuma aba contém o cabeçalho esperado nas 10 primeiras linhas (Matrícula, Nome, Código Evento, Tipo, Valor).',
  };
}

// ------- Leitura das linhas de dados -------

export interface LinhaApontamento {
  matricula: string;
  nome: string;
  codigoEvento: string;          // sempre normalizado: 4 dígitos, padStart('0')
  descricao: string | null;
  tipo: 'R' | 'V' | null;        // R = Referência (proventos/descontos por hora/dia/%), V = Valor
  referencia: number | null;
  valor: number | null;
  observacao: string | null;
}

/** Normaliza código SAGE: aceita 5650, "5650", "0811", 811 → sempre devolve "5650"/"0811". */
export function normalizarCodigoSage(raw: unknown): string {
  if (raw == null) return '';
  const apenasDigitos = String(raw).replace(/\D/g, '');
  if (!apenasDigitos) return '';
  return apenasDigitos.padStart(4, '0');
}

/** Lê as linhas de dados, a partir da linha imediatamente seguinte ao cabeçalho. */
export function lerLinhasApontamento(
  wb: XLSX.WorkBook,
  deteccao: DeteccaoTemplate
): LinhaApontamento[] {
  if (!deteccao.ehTemplatePadrao || !deteccao.abaNome || !deteccao.colunas || !deteccao.linhaCabecalho) {
    return [];
  }
  const ws = wb.Sheets[deteccao.abaNome];
  const matriz: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: true, defval: null });
  const col = deteccao.colunas;
  const linhas: LinhaApontamento[] = [];

  for (let i = deteccao.linhaCabecalho; i < matriz.length; i++) {
    const linha = matriz[i] ?? [];

    const matricula    = linha[col.matricula]    != null ? String(linha[col.matricula]).trim() : '';
    const nome         = linha[col.nome]         != null ? String(linha[col.nome]).trim() : '';
    const codigoEvento = normalizarCodigoSage(linha[col.codigoEvento]);
    const tipoRaw      = linha[col.tipo] != null ? String(linha[col.tipo]).trim().toUpperCase() : '';
    const tipo: 'R' | 'V' | null = tipoRaw === 'R' ? 'R' : tipoRaw === 'V' ? 'V' : null;

    // Pula linhas totalmente vazias e linhas sem nome/matricula/codigo
    if (!matricula && !nome && !codigoEvento) continue;
    if (!codigoEvento) continue;

    linhas.push({
      matricula,
      nome,
      codigoEvento,
      descricao:  col.descricao  != null ? (linha[col.descricao]  != null ? String(linha[col.descricao]).trim()  : null) : null,
      tipo,
      referencia: col.referencia != null ? (toNumberOrNull(linha[col.referencia])) : null,
      valor:      toNumberOrNull(linha[col.valor]),
      observacao: col.observacao != null ? (linha[col.observacao] != null ? String(linha[col.observacao]).trim() : null) : null,
    });
  }
  return linhas;
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).replace(/\./g, '').replace(',', '.'); // BR → US
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
