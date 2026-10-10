// services/esocial/filaEnvios.ts
//
// Saúde do eSocial, etapa 1: a fila dos lotes transmitidos. Cada lote passa por
//   transmitindo → enviado (protocolo) → em processamento → processado | recusado
// e, se a resposta do envio não volta, "sem resposta" (não se sabe se chegou) até ser conferido no eSocial
// ("processado") ou liberado ("não recebido"). A consulta do protocolo é automática, com intervalo crescente;
// lote parado além do normal vira alerta. Aqui só a parte pura (datas e regras); a tela e o vigia usam.

import type { Envio, SituacaoEnvio } from './transmissaoService';
import { aceito } from './transmissao';

export type Etapa = 'transmitindo' | 'sem-resposta' | 'aguardando' | 'processado' | 'com-recusa' | 'recusado' | 'nao-recebido';
export const ROTULO_ETAPA: Record<Etapa, string> = {
    transmitindo: 'Transmitindo', 'sem-resposta': 'Sem resposta do envio', aguardando: 'Aguardando o eSocial', processado: 'Processado',
    'com-recusa': 'Processado com recusa', recusado: 'Lote recusado', 'nao-recebido': 'Não recebido (liberado)',
};

/** "Transmitindo" além disto é envio interrompido (tela fechada, queda): passa a "sem resposta". */
export const LIMITE_TRANSMITINDO_MS = 3 * 60_000;
/** Intervalo entre consultas do protocolo: 15 s, 30 s, 1, 2, 5, 10 e depois a cada 30 min. */
export const INTERVALOS_CONSULTA_S = [15, 30, 60, 120, 300, 600, 1800];
/** Processamento normal do eSocial: minutos. Além disto, atenção; além de 24 h, crítico. */
export const PARADO_ATENCAO_MS = 30 * 60_000;
export const PARADO_CRITICO_MS = 24 * 3600_000;
/** Sem resposta: espera antes de liberar o reenvio sem achar no eSocial. */
export const ESPERA_LIBERAR_MS = 30 * 60_000;

const ms = (d?: string | null) => (d ? new Date(d).getTime() : NaN);

/** Situação levando em conta o tempo (transmitindo velho = sem resposta). */
export function situacaoAtual(e: Pick<Envio, 'situacao' | 'enviadoEm'>, agora: number): SituacaoEnvio {
    if (e.situacao === 'transmitindo' && (Number.isNaN(ms(e.enviadoEm)) || agora - ms(e.enviadoEm) > LIMITE_TRANSMITINDO_MS)) return 'sem-resposta';
    return e.situacao;
}

export function etapaDoEnvio(e: Envio, agora: number): Etapa {
    const s = situacaoAtual(e, agora);
    if (s === 'transmitindo' || s === 'sem-resposta' || s === 'recusado' || s === 'nao-recebido') return s;
    if (s === 'enviado' || s === 'em-processamento') return 'aguardando';
    return e.eventos.every(x => aceito({ cdResposta: x.cdResposta ?? null, nrRecibo: x.nrRecibo ?? '' })) ? 'processado' : 'com-recusa';
}

/** Quando consultar de novo o protocolo (só para lote enviado ou em processamento). */
export function proximaConsulta(e: Pick<Envio, 'situacao' | 'protocolo' | 'enviadoEm' | 'consultadoEm' | 'consultas'>): number | null {
    if (!(e.situacao === 'enviado' || e.situacao === 'em-processamento') || !e.protocolo) return null;
    const n = Math.max(0, e.consultas ?? (e.consultadoEm ? 1 : 0));
    const base = ms(e.consultadoEm) || ms(e.enviadoEm);
    if (Number.isNaN(base)) return 0;
    return base + INTERVALOS_CONSULTA_S[Math.min(n, INTERVALOS_CONSULTA_S.length - 1)] * 1000;
}
export const consultaVencida = (e: Parameters<typeof proximaConsulta>[0], agora: number) => { const p = proximaConsulta(e); return p !== null && p <= agora; };

export type Gravidade = 'critico' | 'atencao';
export interface Alerta { envioId: string; gravidade: Gravidade; titulo: string; detalhe: string; acao: 'verificar' | 'consultar' | 'corrigir' | 'nenhuma' }

const duracao = (m: number) => (m < 3600_000 ? `${Math.round(m / 60_000)} min` : m < 2 * 86400_000 ? `${Math.round(m / 3600_000)} h` : `${Math.round(m / 86400_000)} dias`);
const tipos = (e: Envio) => [...new Set(e.eventos.map(x => x.tipo))].join(', ');

/** Alertas da fila: sem resposta, parado no governo, recusas recentes. */
export function alertasDaFila(envios: Envio[], agora: number): Alerta[] {
    const out: Alerta[] = [];
    for (const e of envios) {
        const etapa = etapaDoEnvio(e, agora);
        const idade = agora - (ms(e.respondidoEm) || ms(e.enviadoEm));
        if (etapa === 'sem-resposta') {
            out.push({ envioId: e.id, gravidade: 'critico', titulo: `Lote de ${tipos(e)} sem resposta do envio`, acao: 'verificar',
                detalhe: `Não se sabe se chegou ao eSocial${e.erroEnvio ? ` (${e.erroEnvio})` : ''}. Não transmita de novo: confira no eSocial; se não estiver lá depois de ${duracao(ESPERA_LIBERAR_MS)}, libere o reenvio.` });
        } else if (etapa === 'aguardando' && idade > PARADO_ATENCAO_MS) {
            const critico = idade > PARADO_CRITICO_MS;
            out.push({ envioId: e.id, gravidade: critico ? 'critico' : 'atencao', titulo: `Lote de ${tipos(e)} parado há ${duracao(idade)}`, acao: 'consultar',
                detalhe: `Protocolo ${e.protocolo}: o eSocial ainda não devolveu o resultado${critico ? '. Acima de 24 h, confira a situação do ambiente nacional antes de qualquer reenvio' : ''}.` });
        } else if ((etapa === 'recusado' || etapa === 'com-recusa') && agora - (ms(e.consultadoEm) || ms(e.respondidoEm) || ms(e.enviadoEm)) < 7 * 86400_000) {
            const n = etapa === 'recusado' ? e.eventos.length : e.eventos.filter(x => !aceito({ cdResposta: x.cdResposta ?? null, nrRecibo: x.nrRecibo ?? '' })).length;
            out.push({ envioId: e.id, gravidade: 'atencao', titulo: `${n} evento(s) de ${tipos(e)} recusado(s)`, acao: 'corrigir',
                detalhe: etapa === 'recusado' ? `Lote recusado: ${e.cdResposta ?? ''} ${e.descResposta}`.trim() : 'Veja as ocorrências de cada evento, corrija na origem e transmita de novo.' });
        }
    }
    return out.sort((a, b) => (a.gravidade === b.gravidade ? 0 : a.gravidade === 'critico' ? -1 : 1));
}

export interface ResumoFila { porEtapa: Record<Etapa, number>; eventos: number; aceitos: number; recusados: number; aguardando: number }
export function resumoDaFila(envios: Envio[], agora: number): ResumoFila {
    const porEtapa = Object.fromEntries((Object.keys(ROTULO_ETAPA) as Etapa[]).map(k => [k, 0])) as Record<Etapa, number>;
    let eventos = 0, aceitos = 0, recusados = 0, aguardando = 0;
    for (const e of envios) {
        const et = etapaDoEnvio(e, agora);
        porEtapa[et]++;
        for (const x of e.eventos) {
            eventos++;
            if (et === 'recusado') recusados++;
            else if (x.cdResposta === undefined || x.cdResposta === null) { if (et !== 'nao-recebido') aguardando++; }
            else if (aceito({ cdResposta: x.cdResposta, nrRecibo: x.nrRecibo ?? '' })) aceitos++;
            else recusados++;
        }
    }
    return { porEtapa, eventos, aceitos, recusados, aguardando };
}

/** Pode liberar o reenvio de um lote sem resposta (prazo de espera passado). */
export const podeLiberar = (e: Envio, agora: number) => situacaoAtual(e, agora) === 'sem-resposta' && agora - (ms(e.respondidoEm) || ms(e.enviadoEm)) >= ESPERA_LIBERAR_MS;

/** Recibos achados no download do eSocial pelo Id (lote sem resposta): Id → nrRecibo dos aceitos. */
export function recibosDoDownload(arquivos: { id: string; rec: string }[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const a of arquivos) {
        const nr = /<(?:\w+:)?nrRecibo>([^<]+)<\/(?:\w+:)?nrRecibo>/.exec(a.rec ?? '')?.[1]?.trim();
        const cd = /<(?:\w+:)?cdResposta>(\d+)<\/(?:\w+:)?cdResposta>/.exec(a.rec ?? '')?.[1];
        if (a.id && nr && (!cd || cd === '201' || cd === '202')) out[a.id] = nr;
    }
    return out;
}
