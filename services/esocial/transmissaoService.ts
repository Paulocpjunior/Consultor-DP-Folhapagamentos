// services/esocial/transmissaoService.ts
//
// Registro dos lotes transmitidos pelo cofre do CFI:
//   esocial_envios/{auto}  { empresaId, cnpj, tpAmb, grupo, protocolo, dhRecepcao, transmissor, certificado,
//                            situacao, cdResposta, descResposta, ocorrencias, eventos[], enviadoPor, enviadoPorEmail,
//                            enviadoEm, consultadoEm?, consultadoPorEmail? }
// Só Ids, tipos, recibos e ocorrências: o conteúdo dos eventos não é gravado.
// A auditoria do CFI (dp_esocial_envio_log) é a contraprova.

import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { aceito, type Certificado, type Ocorrencia, type RetornoConsulta, type RetornoEnvio, type TpAmb } from './transmissao';

const COL = 'esocial_envios';

export type SituacaoEnvio = 'enviado' | 'em-processamento' | 'processado' | 'recusado';
export interface EventoEnviado { id: string; tipo: string; perApur: string | null; cdResposta?: number | null; descResposta?: string; nrRecibo?: string; ocorrencias?: Ocorrencia[]; totalizadores?: string[] }
export interface Envio {
    id: string; empresaId: string; cnpj: string; tpAmb: TpAmb; grupo: number; protocolo: string; dhRecepcao: string; transmissor: string;
    certificado: Certificado; situacao: SituacaoEnvio; cdResposta: number | null; descResposta: string; ocorrencias: Ocorrencia[];
    eventos: EventoEnviado[]; enviadoPorEmail: string; enviadoEm: string | null; consultadoEm: string | null; consultadoPorEmail?: string;
}

const iso = (t: unknown) => (t as Timestamp | null)?.toDate?.()?.toISOString() ?? null;

export async function listarEnvios(empresaId: string): Promise<Envio[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId), orderBy('enviadoEm', 'desc')));
    return s.docs.map(d => {
        const x = d.data();
        return { ...(x as Envio), id: d.id, enviadoEm: iso(x.enviadoEm), consultadoEm: iso(x.consultadoEm) };
    });
}

/** Grava o lote logo depois da resposta do envio (recebido ou não). */
export async function registrarEnvio(p: { empresaId: string; cnpj: string; certificado: Certificado; retorno: RetornoEnvio }, u: Usuario): Promise<string> {
    const r = p.retorno;
    const ref = await addDoc(collection(db, COL), {
        empresaId: p.empresaId, cnpj: p.cnpj, tpAmb: r.tpAmb, grupo: r.grupo, protocolo: r.protocolo || '', dhRecepcao: r.dhRecepcao || '',
        transmissor: r.transmissor || '', certificado: p.certificado, situacao: r.recebido ? 'enviado' : 'recusado',
        cdResposta: r.cdResposta, descResposta: r.descResposta || '', ocorrencias: r.ocorrencias ?? [],
        eventos: r.eventos.map(e => ({ id: e.id, tipo: e.tipo, perApur: e.perApur ?? null })),
        enviadoPor: u.id, enviadoPorEmail: u.email, enviadoEm: serverTimestamp(),
    });
    return ref.id;
}

/** Junta o resultado da consulta aos eventos do lote. */
export function mesclarConsulta(eventos: EventoEnviado[], r: RetornoConsulta): EventoEnviado[] {
    const porId = new Map(r.eventos.map(e => [e.id, e]));
    return eventos.map(e => {
        const x = porId.get(e.id);
        return x ? { ...e, cdResposta: x.cdResposta, descResposta: x.descResposta, nrRecibo: x.nrRecibo, ocorrencias: x.ocorrencias, totalizadores: x.totalizadores } : e;
    });
}

export async function registrarConsulta(envio: Envio, r: RetornoConsulta, u: Usuario): Promise<void> {
    await updateDoc(doc(db, COL, envio.id), {
        situacao: r.situacao, cdResposta: r.cdResposta, descResposta: r.descResposta || '', ocorrencias: r.ocorrencias ?? [],
        eventos: mesclarConsulta(envio.eventos, r), consultadoEm: serverTimestamp(), consultadoPor: u.id, consultadoPorEmail: u.email,
    });
}

/** Resumo do lote para a tela. */
export function resumoEnvio(e: Pick<Envio, 'eventos'>): { aceitos: number; recusados: number; aguardando: number } {
    let aceitos = 0, recusados = 0, aguardando = 0;
    for (const x of e.eventos) {
        if (x.cdResposta === undefined || x.cdResposta === null) aguardando++;
        else if (aceito({ cdResposta: x.cdResposta, nrRecibo: x.nrRecibo ?? '' })) aceitos++;
        else recusados++;
    }
    return { aceitos, recusados, aguardando };
}
