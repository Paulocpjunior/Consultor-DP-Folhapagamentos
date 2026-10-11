// services/calculo/estornoFolha.ts
//
// Estorno do cálculo (Utilitários › Estorno do Cálculo do SAGE): desfaz o processamento da folha do mês. No Consultor,
// o processamento é a folha gravada (folhas_gravadas/{empresa}_{AAAA-MM}); estornar apaga essa gravação e, se pedido,
// os lançamentos do movimento do mês. Só com a competência aberta no Fim de mês (encerrada, o gestor reabre antes).
// O estorno não mexe no eSocial: o plano avisa dos S-1200, S-1210 e S-1299 já aceitos, que pedem retificação ou
// exclusão (S-3000) e a reabertura (S-1298). Puro, sem Firebase.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Envio } from '../esocial/transmissaoService';
import { exclusoesDosEnvios, recibosDosEnvios, recibosVigentes } from '../esocial/recibosEsocial';
import type { FolhaGravada } from './folhaGravada';
import { limparMovimento, type MovimentoGravado } from './movimento';
import type { Movimento } from './motorMensal';

const mes = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const AGUARDANDO = new Set(['transmitindo', 'sem-resposta', 'enviado', 'em-processamento']);

/** Campos técnicos do movimento que o estorno mantém (encadeamento do arredondamento e IRRF gravado de outro sistema). */
const MANTIDOS: (keyof Movimento)[] = ['arredondamentoAnterior', 'arredondamentoFechado', 'irrfRendimentos', 'irrfDeducoes', 'irrfRetido'];

/** O movimento sem os lançamentos do mês: fica só o que o estorno mantém. */
export function movimentoEstornado(m: Movimento): Movimento {
    const out: Movimento = {};
    for (const k of MANTIDOS) if (m[k] !== undefined) (out as Record<string, unknown>)[k] = m[k];
    return limparMovimento(out);
}

/** Tem lançamento do mês (algo além do que o estorno mantém). */
export const temLancamento = (m: Movimento) => JSON.stringify(limparMovimento(m)) !== JSON.stringify(movimentoEstornado(m));

export interface PlanoEstorno {
    /** Motivo que impede o estorno ('' quando pode). */
    bloqueio: string;
    avisos: string[];
    /** Holerites da folha gravada que saem. */
    holerites: number;
    /** Movimentos com lançamento do mês (os que "zerar o movimento" limpa). */
    movimentos: MovimentoGravado[];
    s1200Aceitos: number;
    s1210Aceitos: number;
    fechadoNoEsocial: boolean;
}

export function planoDoEstorno(p: {
    competencia: string; encerrado: boolean; gravada: FolhaGravada | null; movimentos: MovimentoGravado[];
    envios: Envio[]; fichas: FichaFuncionario[];
}): PlanoEstorno {
    const movimentos = p.movimentos.filter(m => m.competencia === p.competencia && temLancamento(m.movimento));
    const r: PlanoEstorno = { bloqueio: '', avisos: [], holerites: p.gravada?.holerites.length ?? 0, movimentos, s1200Aceitos: 0, s1210Aceitos: 0, fechadoNoEsocial: false };
    if (p.encerrado) r.bloqueio = `Competência ${mes(p.competencia)} encerrada no Fim de mês: o gestor do DP reabre antes do estorno.`;
    else if (!p.gravada && !movimentos.length) r.bloqueio = `Nada a estornar em ${mes(p.competencia)}: sem folha gravada e sem lançamentos no movimento.`;

    // eSocial (produção): o que já foi aceito continua lá depois do estorno.
    const exclusoes = exclusoesDosEnvios(p.envios);
    const recibos = recibosDosEnvios(p.envios, p.fichas);
    const vivos = (tipo: 'S-1200' | 'S-1210', per: string) => [...recibosVigentes(recibos, tipo, per, exclusoes).values()].filter(x => !x.excluidoEm && !exclusoes.has(x.nrRecibo)).length;
    r.s1200Aceitos = vivos('S-1200', p.competencia);
    const pagamento = p.gravada?.pagamento && /^\d{4}-\d{2}$/.test(p.gravada.pagamento) ? p.gravada.pagamento : '';
    r.s1210Aceitos = pagamento ? vivos('S-1210', pagamento) : 0;
    const producao = p.envios.filter(e => e.tpAmb === 1 && e.situacao !== 'nao-recebido');
    const eventosDoMes = (tipo: string) => producao.flatMap(e => e.eventos.filter(x => x.tipo === tipo && x.perApur === p.competencia).map(x => ({ e, x })))
        .sort((a, b) => (b.e.enviadoEm ?? '').localeCompare(a.e.enviadoEm ?? ''));
    const aceitoEm = (tipo: string) => eventosDoMes(tipo).find(({ x }) => x.cdResposta === 201 || x.cdResposta === 202)?.e.enviadoEm ?? '';
    const fechado = aceitoEm('S-1299'); const reaberto = aceitoEm('S-1298');
    r.fechadoNoEsocial = !!fechado && !(reaberto && reaberto > fechado);
    const aguardando = eventosDoMes('S-1200').filter(({ e, x }) => AGUARDANDO.has(e.situacao) || (e.situacao === 'processado' && (x.cdResposta === undefined || x.cdResposta === null))).length;

    if (r.fechadoNoEsocial) r.avisos.push(`O movimento de ${mes(p.competencia)} está fechado no eSocial (S-1299 aceito): para corrigir lá, reabra com o S-1298 antes de retificar ou excluir.`);
    if (r.s1200Aceitos) r.avisos.push(`${r.s1200Aceitos} S-1200 de ${mes(p.competencia)} aceito(s) no eSocial: o estorno não os desfaz. Recalculada a folha, envie a retificação; para tirá-la do eSocial, exclua (S-3000) primeiro o S-1210 e depois o S-1200.`);
    if (r.s1210Aceitos) r.avisos.push(`${r.s1210Aceitos} S-1210 de ${mes(pagamento)} aceito(s) com o pagamento desta folha: o pagamento informado continua no eSocial.`);
    if (aguardando) r.avisos.push(`${aguardando} S-1200 de ${mes(p.competencia)} enviado(s) sem retorno: consulte o protocolo (eSocial › Saúde do eSocial) antes de estornar.`);
    if (r.s1200Aceitos || r.fechadoNoEsocial) r.avisos.push('A DCTFWeb e a guia do FGTS Digital da competência vêm do eSocial: confira se precisam ser refeitas depois da retificação.');
    if (p.gravada && !r.avisos.length) r.avisos.push('Nada desta competência foi aceito no eSocial pelo Consultor: o estorno só desfaz a gravação.');
    return r;
}
