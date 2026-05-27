export interface ExtratoTransacao {
    id: string;
    empresaId: string;
    banco: string;
    periodo: string; // "MM/YYYY"
    data: string; // ISO date
    descricao: string;
    valor: number;
    tipo: 'credito' | 'debito';
    categoria: string;
    categoriaManual?: boolean;
    importadoPor: string;
    importadoEm: any; // serverTimestamp
    arquivo: string; // filename
}

export interface ConciliacaoItem {
    descricao: string;
    valorFolha: number;
    valorExtrato: number;
    diferenca: number;
    status: 'conciliado' | 'divergencia' | 'ausente_folha' | 'ausente_extrato';
}

export interface ConciliacaoResult {
    itens: ConciliacaoItem[];
    totalFolha: number;
    totalExtrato: number;
    diferenca: number;
    conciliados: number;
    divergencias: number;
    ausentesFolha: number;
    ausentesExtrato: number;
}

export type BancoOption =
    | 'Itaú'
    | 'Bradesco'
    | 'Santander'
    | 'Banco do Brasil'
    | 'Caixa'
    | 'Sicoob'
    | 'Sicredi'
    | 'Outro';

export const BANCOS: BancoOption[] = [
    'Itaú',
    'Bradesco',
    'Santander',
    'Banco do Brasil',
    'Caixa',
    'Sicoob',
    'Sicredi',
    'Outro',
];

export const CATEGORIAS_EXTRATO = [
    'FGTS',
    'INSS',
    'Salário',
    'Vale Transporte',
    'Vale Alimentação',
    '13o Salário',
    'Férias',
    'Rescisão',
    'IRRF',
    'Outros',
] as const;

export type CategoriaExtrato = (typeof CATEGORIAS_EXTRATO)[number];
