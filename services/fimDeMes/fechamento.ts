// services/fimDeMes/fechamento.ts
//
// Fim de mês: a competência da empresa é encerrada depois da lista de conferência e fica somente
// leitura (movimentos e afastamentos, pelas regras do Firestore). Alterar um período encerrado exige
// o gestor do DP: o colaborador pede a reabertura com o motivo e o gestor aprova (reabre) ou recusa.
// Aqui fica a parte pura: situação, lista de conferência e competências pendentes.

export type SituacaoPeriodo = 'aberto' | 'encerrado' | 'reaberto';

export interface EventoFechamento { acao: 'encerrado' | 'reaberto'; porEmail: string; em: string; motivo?: string }

export interface Fechamento {
    id: string;
    empresaId: string;
    competencia: string;
    situacao: Exclude<SituacaoPeriodo, 'aberto'>;
    encerradoPorEmail?: string;
    encerradoEm?: Date;
    checklist: Record<string, boolean>;
    reabertoPorEmail?: string;
    reabertoEm?: Date;
    motivoReabertura?: string;
    historico?: EventoFechamento[];
}

export interface PedidoReabertura {
    id: string;
    empresaId: string;
    empresaNome: string;
    competencia: string;
    motivo: string;
    situacao: 'pendente' | 'aprovado' | 'recusado';
    pedidoPorEmail: string;
    pedidoEm?: Date;
    decididoPorEmail?: string;
    decididoEm?: Date;
    resposta?: string;
}

export const idFechamento = (empresaId: string, competencia: string) => `${empresaId}_${competencia}`;

/** O que se confere antes de encerrar o mês (todos obrigatórios). */
export const ITENS_FECHAMENTO: { id: string; rotulo: string; detalhe: string }[] = [
    { id: 'movimento', rotulo: 'Movimento do mês salvo', detalhe: 'Horas extras, faltas, lançamentos e benefícios de todos os funcionários gravados no Cálculo.' },
    { id: 'holerites', rotulo: 'Holerites e resumo conferidos', detalhe: 'Folha calculada sem erros, holerites e resumo da folha conferidos.' },
    { id: 'pagamentos', rotulo: 'Pagamentos feitos', detalhe: 'Adiantamento e folha pagos (arquivo bancário ou recibos assinados).' },
    { id: 'esocial', rotulo: 'eSocial transmitido', detalhe: 'S-1200 e S-1210 aceitos e o S-1299 (fechamento) transmitido.' },
    { id: 'guias', rotulo: 'Guias emitidas', detalhe: 'DCTFWeb (INSS e IRRF) e FGTS Digital emitidos.' },
    { id: 'cliente', rotulo: 'Cliente atendido', detalhe: 'Pacote da folha enviado ao cliente.' },
];

export const checklistCompleto = (c: Record<string, boolean>) => ITENS_FECHAMENTO.every(i => c[i.id] === true);

export const situacaoDe = (f: Pick<Fechamento, 'situacao'> | null | undefined): SituacaoPeriodo => f?.situacao ?? 'aberto';

export const ROTULO_SITUACAO: Record<SituacaoPeriodo, string> = { aberto: 'Aberto', encerrado: 'Encerrado', reaberto: 'Reaberto' };

const somarMes = (c: string, n: number) => {
    const [a, m] = c.split('-').map(Number);
    const t = a * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

/** Pode encerrar: competência válida e já começada (não se encerra mês futuro). */
export const podeEncerrar = (competencia: string, hoje: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia) && competencia <= hoje.slice(0, 7);

/**
 * Competências que deviam estar encerradas: do início da obrigação (o mês em que o motor foi ativado na empresa)
 * até o mês anterior ao de hoje, sem fechamento encerrado. O mês corrente ainda está em andamento.
 */
export function competenciasPendentes(desde: string | undefined, fechamentos: Pick<Fechamento, 'competencia' | 'situacao'>[], hoje: string): string[] {
    if (!desde || !/^\d{4}-\d{2}$/.test(desde)) return [];
    const ate = somarMes(hoje.slice(0, 7), -1);
    const encerradas = new Set(fechamentos.filter(f => f.situacao === 'encerrado').map(f => f.competencia));
    const out: string[] = [];
    for (let c = desde; c <= ate && out.length < 120; c = somarMes(c, 1)) if (!encerradas.has(c)) out.push(c);
    return out;
}

/** Mensagem para quem tenta alterar um período encerrado. */
export const MSG_ENCERRADO = (competencia: string) =>
    `A competência ${competencia.split('-').reverse().join('/')} está encerrada (Fim de mês). Para alterar, peça a reabertura ao gestor do DP em Fim de mês.`;
