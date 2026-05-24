export type EventoTipo =
    | 'S-1200'  // Remuneração
    | 'S-1210'  // Pagamentos
    | 'S-1299'  // Fechamento
    | 'S-2200'  // Admissão
    | 'S-2300'  // TSV - Início
    | 'S-2299'; // Desligamento

export type EventoStatus = 'pendente' | 'transmitido' | 'rejeitado' | 'processado';

export type FgtsStatus = 'em_dia' | 'atrasado' | 'parcial';

export interface EventoEsocial {
    id: string;
    empresaId: string;
    tipo: EventoTipo;
    descricao: string;
    competencia: string; // YYYY-MM
    status: EventoStatus;
    dataEnvio?: string;
    dataProcessamento?: string;
    protocolo?: string;
    erros?: string[];
    funcionarioNome?: string;
    funcionarioCpf?: string;
    criadoEm: any;
    atualizadoEm?: any;
}

export interface FgtsDigitalRegistro {
    id: string;
    empresaId: string;
    competencia: string; // YYYY-MM
    funcionarioNome: string;
    funcionarioCpf: string;
    valorDevido: number;
    valorRecolhido: number;
    status: FgtsStatus;
    dataVencimento: string;
    dataRecolhimento?: string;
}

export interface ObrigacaoTrabalhista {
    id: string;
    nome: string;
    sigla: string;
    tipo: 'esocial' | 'fgts' | 'dctfweb' | 'inss';
    diaVencimento: number;
    descricao: string;
    competencia: string;
    status: 'pendente' | 'cumprida' | 'atrasada';
}

export interface EmpresaEsocialResumo {
    empresaId: string;
    razaoSocial: string;
    cnpj: string;
    totalEventos: number;
    pendentes: number;
    rejeitados: number;
    transmitidos: number;
    fgtsStatus: FgtsStatus;
    fgtsDevidoTotal: number;
    fgtsRecolhidoTotal: number;
    proximoVencimento?: string;
}

export interface TeseRecuperacao {
    id: string;
    empresaId: string;
    tipo: 'inss_verbas_indenizatorias' | 'fgts_verbas_indenizatorias' | 'cpp_plr';
    titulo: string;
    descricao: string;
    valorEstimado: number;
    periodo: string;
    status: 'identificada' | 'em_analise' | 'aprovada' | 'recuperada';
    fundamentoLegal: string;
    criadoEm: any;
}

export interface DashboardResumo {
    totalEmpresas: number;
    eventosPendentes: number;
    eventosRejeitados: number;
    fgtsAtrasado: number;
    tesesTotalEstimado: number;
}

export const EVENTO_LABELS: Record<EventoTipo, string> = {
    'S-1200': 'Remuneração do Trabalhador',
    'S-1210': 'Pagamentos de Rendimentos do Trabalho',
    'S-1299': 'Fechamento dos Eventos Periódicos',
    'S-2200': 'Cadastramento Inicial / Admissão',
    'S-2300': 'Trabalhador Sem Vínculo - Início',
    'S-2299': 'Desligamento',
};

export const EVENTO_PRAZOS: Record<EventoTipo, { diaLimite: number; descricao: string }> = {
    'S-1200': { diaLimite: 15, descricao: 'Até dia 15 do mês seguinte' },
    'S-1210': { diaLimite: 15, descricao: 'Até dia 15 do mês seguinte' },
    'S-1299': { diaLimite: 15, descricao: 'Até dia 15 do mês seguinte' },
    'S-2200': { diaLimite: 1, descricao: 'Até o dia anterior ao início da prestação de serviços' },
    'S-2300': { diaLimite: 7, descricao: 'Até 7 dias após início da prestação de serviços' },
    'S-2299': { diaLimite: 10, descricao: 'Até 10 dias após a data de desligamento' },
};

export const STATUS_COLORS: Record<EventoStatus, string> = {
    pendente: 'amber',
    transmitido: 'blue',
    rejeitado: 'red',
    processado: 'green',
};
