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

export interface StatusEvento {
    situacao: SituacaoEvento;
    rotulo: string;
    recibo: string;
    detalhe: string;
    /** Lote do último envio pelo Consultor (para consultar o retorno). */
    envio: Envio | null;
    evento: EventoEnviado | null;
    /** Todos os envios deste registro, do mais recente ao mais antigo (histórico de protocolos). */
    historico: { envio: Envio; evento: EventoEnviado }[];
}

export const ROTULO_SITUACAO_EVENTO: Record<SituacaoEvento, string> = {
    'nao-enviado': 'Não enviado', iob: 'Enviado pelo IOB', aguardando: 'Enviado · aguardando retorno', aceito: 'Aceito pelo eSocial', recusado: 'Rejeitado pelo eSocial',
};

/** Situação do S-2230 de um afastamento. `envios` como vem de listarEnvios (mais recente primeiro). */
export function statusS2230(a: Pick<Afastamento, 'id' | 'recibos'>, envios: Envio[]): StatusEvento {
    const historico = envios.flatMap(envio => envio.eventos.filter(e => e.ref === a.id && e.tipo === 'S-2230').map(evento => ({ envio, evento })))
        .sort((x, y) => (y.envio.enviadoEm ?? '').localeCompare(x.envio.enviadoEm ?? ''));
    const ultimo = historico[0];
    const base = { envio: ultimo?.envio ?? null, evento: ultimo?.evento ?? null, historico };
    if (ultimo) {
        const { envio, evento } = ultimo;
        const ocorr = [...(evento.ocorrencias ?? []), ...(envio.situacao === 'recusado' ? envio.ocorrencias : [])].map(o => `${o.codigo} ${o.descricao}`).join('; ');
        if (envio.situacao === 'recusado') return { ...base, situacao: 'recusado', rotulo: ROTULO_SITUACAO_EVENTO.recusado, recibo: '', detalhe: `Lote recusado: ${envio.cdResposta ?? ''} ${envio.descResposta}${ocorr ? ` — ${ocorr}` : ''}`.trim() };
        if (evento.cdResposta === undefined || evento.cdResposta === null) return { ...base, situacao: 'aguardando', rotulo: ROTULO_SITUACAO_EVENTO.aguardando, recibo: '', detalhe: `Protocolo ${envio.protocolo}. Consulte o retorno.` };
        if (aceito({ cdResposta: evento.cdResposta, nrRecibo: evento.nrRecibo ?? '' })) return { ...base, situacao: 'aceito', rotulo: ROTULO_SITUACAO_EVENTO.aceito, recibo: evento.nrRecibo ?? '', detalhe: `Recibo ${evento.nrRecibo} · protocolo ${envio.protocolo}` };
        return { ...base, situacao: 'recusado', rotulo: ROTULO_SITUACAO_EVENTO.recusado, recibo: '', detalhe: `${evento.cdResposta} ${evento.descResposta ?? ''}${ocorr ? ` — ${ocorr}` : ''}`.trim() };
    }
    if (a.recibos?.length) return { ...base, situacao: 'iob', rotulo: ROTULO_SITUACAO_EVENTO.iob, recibo: a.recibos[a.recibos.length - 1], detalhe: `Recibo ${a.recibos[a.recibos.length - 1]} (importado do IOB)` };
    return { ...base, situacao: 'nao-enviado', rotulo: ROTULO_SITUACAO_EVENTO['nao-enviado'], recibo: '', detalhe: 'S-2230 ainda não transmitido ao eSocial.' };
}
