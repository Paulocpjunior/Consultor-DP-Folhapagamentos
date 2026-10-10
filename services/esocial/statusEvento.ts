// services/esocial/statusEvento.ts
//
// Retorno visual do eSocial para um registro do Consultor (Paulo, 07/10/2026:
// "devemos criar um visual para os colaboradores que tenha um retorno visual
// do evento"). Hoje: o S-2230 de cada afastamento. A situação sai dos lotes
// transmitidos pelo cofre (esocial_envios, evento ligado ao afastamento por
// `ref`) ou, sem envio pelo Consultor, do recibo que veio do IOB.

import { aceito } from './transmissao';
import type { Envio, EventoEnviado } from './transmissaoService';
import type { Afastamento } from '../cadastros/afastamentos';

export type SituacaoEvento = 'nao-enviado' | 'iob' | 'aguardando' | 'aceito' | 'recusado';

interface Situacao {
    situacao: SituacaoEvento;
    rotulo: string;
    recibo: string;
    detalhe: string;
    /** Lote do último envio pelo Consultor (para consultar o retorno). */
    envio: Envio | null;
    evento: EventoEnviado | null;
}
export interface StatusEvento extends Situacao {
    /** Todos os envios deste registro, do mais recente ao mais antigo (histórico de protocolos, os dois ambientes). */
    historico: { envio: Envio; evento: EventoEnviado }[];
    /** O último envio na produção restrita (teste), à parte: não conta como entrega à produção. */
    teste: Situacao | null;
}

export const ROTULO_SITUACAO_EVENTO: Record<SituacaoEvento, string> = {
    'nao-enviado': 'Não enviado', iob: 'Enviado pelo IOB', aguardando: 'Enviado · aguardando retorno', aceito: 'Aceito pelo eSocial', recusado: 'Rejeitado pelo eSocial',
};

/** Situação pelo envio mais recente da lista (já ordenada). */
function pelaLista(lista: { envio: Envio; evento: EventoEnviado }[]): Situacao | null {
    const ultimo = lista[0];
    if (!ultimo) return null;
    const { envio, evento } = ultimo;
    const base = { envio, evento };
    const ocorr = [...(evento.ocorrencias ?? []), ...(envio.situacao === 'recusado' ? envio.ocorrencias : [])].map(o => `${o.codigo} ${o.descricao}`).join('; ');
    if (envio.situacao === 'transmitindo' || envio.situacao === 'sem-resposta') return { ...base, situacao: 'aguardando', rotulo: ROTULO_SITUACAO_EVENTO.aguardando, recibo: '', detalhe: 'Envio sem resposta: pode ter chegado ao eSocial. Não transmita de novo; confira em eSocial › Saúde do eSocial.' };
    if (envio.situacao === 'recusado') return { ...base, situacao: 'recusado', rotulo: ROTULO_SITUACAO_EVENTO.recusado, recibo: '', detalhe: `Lote recusado: ${envio.cdResposta ?? ''} ${envio.descResposta}${ocorr ? ` — ${ocorr}` : ''}`.trim() };
    if (evento.cdResposta === undefined || evento.cdResposta === null) return { ...base, situacao: 'aguardando', rotulo: ROTULO_SITUACAO_EVENTO.aguardando, recibo: '', detalhe: `Protocolo ${envio.protocolo}. Consulte o retorno.` };
    if (aceito({ cdResposta: evento.cdResposta, nrRecibo: evento.nrRecibo ?? '' })) return { ...base, situacao: 'aceito', rotulo: ROTULO_SITUACAO_EVENTO.aceito, recibo: evento.nrRecibo ?? '', detalhe: `Recibo ${evento.nrRecibo} · protocolo ${envio.protocolo}` };
    return { ...base, situacao: 'recusado', rotulo: ROTULO_SITUACAO_EVENTO.recusado, recibo: '', detalhe: `${evento.cdResposta} ${evento.descResposta ?? ''}${ocorr ? ` — ${ocorr}` : ''}`.trim() };
}

/**
 * Situação do S-2230 de um afastamento. `envios` como vem de listarEnvios (mais recente primeiro).
 * A situação é a da produção: um teste na produção restrita aparece à parte e
 * não esconde o envio de verdade.
 */
export function statusS2230(a: Pick<Afastamento, 'id' | 'recibos'>, envios: Envio[]): StatusEvento {
    // "Não recebido": o lote não chegou ao governo (liberado para reenvio), não conta como envio.
    const historico = envios.filter(envio => envio.situacao !== 'nao-recebido').flatMap(envio => envio.eventos.filter(e => e.ref === a.id && e.tipo === 'S-2230').map(evento => ({ envio, evento })))
        .sort((x, y) => (y.envio.enviadoEm ?? '').localeCompare(x.envio.enviadoEm ?? ''));
    const teste = pelaLista(historico.filter(x => x.envio.tpAmb !== 1));
    const producao = pelaLista(historico.filter(x => x.envio.tpAmb === 1));
    if (producao) return { ...producao, historico, teste };
    const vazio = { envio: null, evento: null, historico, teste };
    if (a.recibos?.length) return { ...vazio, situacao: 'iob', rotulo: ROTULO_SITUACAO_EVENTO.iob, recibo: a.recibos[a.recibos.length - 1], detalhe: `Recibo ${a.recibos[a.recibos.length - 1]} (importado do IOB)` };
    return { ...vazio, situacao: 'nao-enviado', rotulo: ROTULO_SITUACAO_EVENTO['nao-enviado'], recibo: '', detalhe: 'S-2230 ainda não transmitido à produção do eSocial.' };
}
