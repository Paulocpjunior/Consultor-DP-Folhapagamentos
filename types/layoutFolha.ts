// types/layoutFolha.ts
//
// Modelo de "Layout de Folha" salvo no Firestore por EMPRESA (CNPJ).
// Distinto do MapeamentoApontamento (que é por CLIENTE/grupo).
//
// Use este modelo quando o cliente manda 1 empresa por arquivo, com
// estrutura de planilha própria (ex: SPA — A1='Funcionário', aba única).

/** Mesmas constantes do app (folhaTypes.TipoEvento) */
export type LayoutTipoEvento = 'V' | 'D';
/** Mesmas constantes do app (folhaTypes.ReferenciaValor) */
export type LayoutReferenciaValor = 'V' | 'R';

export interface ColumnMapping {
  columnLetter: string;       // 'A', 'B', ... — debug/UI
  columnIndex: number;        // 0-based
  headerLabel: string;        // texto original do cabeçalho
  /** Código do evento SAGE. null = ignorar a coluna. */
  eventCode: string | null;
  /** Descrição do evento (vai no Lancamento.descricao_evento) */
  eventLabel?: string;
  /** V=vencimento, D=desconto. Default: 'V' */
  tipo?: LayoutTipoEvento;
  /** V=valor (R$), R=referência (horas/quantidade). Default: 'V' */
  rv?: LayoutReferenciaValor;
  /** Não gera lançamento se valor=0/'-'. Default: true */
  skipIfEmpty?: boolean;
}

export type SheetMatchMode =
  | 'first_sheet'
  | 'sheet_name'
  | 'company_selected';

export interface LayoutFolha {
  cnpj: string;                 // só dígitos: '69259356000140'
  cnpjFormatted: string;        // '69.259.356/0001-40'
  razaoSocial: string;
  empresaSAGE: string;          // '0903'

  tipos: string[];              // ['Folha de Salario', '13o', ...]

  sheetMatching: {
    mode: SheetMatchMode;
    sheetName?: string;
  };

  headerRow: number;            // 1-based
  firstDataRow: number;         // 1-based
  employeeNameColumn: number;   // 0-based

  columns: ColumnMapping[];

  /** Matrículas memorizadas: nome (uppercase trim) → matrícula */
  matriculas?: Record<string, string>;

  createdAt: number;
  updatedAt: number;
  createdBy: string;
  version: number;
}
