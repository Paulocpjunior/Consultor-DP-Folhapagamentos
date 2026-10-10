// services/esocial/transmissaoService.ts
//
// Registro dos lotes transmitidos pelo cofre do CFI:
//   esocial_envios/{auto}  { empresaId, cnpj, tpAmb, grupo, protocolo, dhRecepcao, transmissor, certificado,
//                            situacao, cdResposta, descResposta, ocorrencias, eventos[], enviadoPor, enviadoPorEmail,
//                            enviadoEm, consultadoEm?, consultadoPorEmail? }
// Só Ids, tipos, recibos e ocorrências: o conteúdo dos eventos não é gravado.
// A auditoria do CFI (dp_esocial_envio_log) é a contraprova.
//
// Saúde do eSocial (10/2026): o lote é registrado ANTES de sair ("transmitindo"). Se a resposta não volta
// (rede, CFI ou governo fora do ar), ele fica "sem resposta" — nunca some — e não se reenvia às cegas:
// confere-se no eSocial (download pelo Id) ou, passado o prazo, libera-se o reenvio ("não recebido").

import { addDoc, collection, doc, getDocs, increment, orderBy, query, serverTimestamp, updateDoc, where, type Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { aceito, type Certificado, type Ocorrencia, type RetornoConsulta, type RetornoEnvio, type TpAmb } from './transmissao';

const COL = 'esocial_envios';

export type SituacaoEnvio = 'transmitindo' | 'sem-resposta' | 'nao-recebido' | 'enviado' | 'em-processamento' | 'processado' | 'recusado';
/** Lote que ainda pode estar no governo sem resultado conhecido. */
export const SITUACOES_PENDENTES: SituacaoEnvio[] = ['transmitindo', 'sem-resposta', 'enviado', 'em-processamento'];
export interface EventoEnviado {
    id: string; tipo: string; perApur: string | null; /** Registro do Consultor que gerou o evento (ex.: id do afastamento). */ ref?: string;
    /** CPF do trabalhador (para o pré-voo não deixar o mesmo evento sair duas vezes). */ cpf?: string;
    cdResposta?: number | null; descResposta?: string; nrRecibo?: string; ocorrencias?: Ocorrencia[]; totalizadores?: string[];
}
export interface Envio {
    id: string; empresaId: string; cnpj: string; tpAmb: TpAmb; grupo: number; protocolo: string; dhRecepcao: string; transmissor: string;
    certificado: Certificado; situacao: SituacaoEnvio; cdResposta: number | null; descResposta: string; ocorrencias: Ocorrencia[];
    eventos: EventoEnviado[]; enviadoPorEmail: string; enviadoEm: string | null; consultadoEm: string | null; consultadoPorEmail?: string;
    /** Quantas consultas do protocolo já foram feitas (o intervalo da próxima cresce). */ consultas?: number;
    /** Resposta do envio gravada (sai de "transmitindo"). */ respondidoEm?: string | null;
    /** Falha do envio sem resposta do governo. */ erroEnvio?: string;
    verificadoEm?: string | null; verificadoPorEmail?: string;
}

const iso = (t: unknown) => (t as Timestamp | null)?.toDate?.()?.toISOString() ?? null;

export async function listarEnvios(empresaId: string): Promise<Envio[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId), orderBy('enviadoEm', 'desc')));
    return s.docs.map(d => {
        const x = d.data();
        return { ...(x as Envio), id: d.id, enviadoEm: iso(x.enviadoEm), consultadoEm: iso(x.consultadoEm), respondidoEm: iso(x.respondidoEm), verificadoEm: iso(x.verificadoEm) };
    });
}

/** Lotes ainda sem resultado da empresa (para a consulta automática). */
export async function listarPendentes(empresaId: string): Promise<Envio[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId), where('situacao', 'in', ['transmitindo', 'sem-resposta', 'enviado', 'em-processamento'])));
    return s.docs.map(d => {
        const x = d.data();
        return { ...(x as Envio), id: d.id, enviadoEm: iso(x.enviadoEm), consultadoEm: iso(x.consultadoEm), respondidoEm: iso(x.respondidoEm), verificadoEm: iso(x.verificadoEm) };
    });
}

/** 1º passo do envio: registra o lote antes de sair, com os eventos que vão nele. */
export async function registrarIntencao(p: { empresaId: string; cnpj: string; certificado: Certificado; tpAmb: TpAmb; grupo: number; eventos: EventoEnviado[] }, u: Usuario): Promise<string> {
    const ref = await addDoc(collection(db, COL), {
        empresaId: p.empresaId, cnpj: p.cnpj, tpAmb: p.tpAmb, grupo: p.grupo, protocolo: '', dhRecepcao: '', transmissor: '', certificado: p.certificado,
        situacao: 'transmitindo', cdResposta: null, descResposta: '', ocorrencias: [], consultas: 0,
        eventos: p.eventos.map(e => ({ id: e.id, tipo: e.tipo, perApur: e.perApur ?? null, ...(e.ref ? { ref: e.ref } : {}), ...(e.cpf ? { cpf: e.cpf } : {}) })),
        enviadoPor: u.id, enviadoPorEmail: u.email, enviadoEm: serverTimestamp(),
    });
    return ref.id;
}

/** 2º passo: a resposta do envio (recebido com protocolo, ou lote recusado). */
export async function concluirEnvio(envioId: string, r: RetornoEnvio): Promise<void> {
    await updateDoc(doc(db, COL, envioId), {
        situacao: r.recebido ? 'enviado' : 'recusado', protocolo: r.protocolo || '', dhRecepcao: r.dhRecepcao || '', transmissor: r.transmissor || '',
        grupo: r.grupo, cdResposta: r.cdResposta, descResposta: r.descResposta || '', ocorrencias: r.ocorrencias ?? [], respondidoEm: serverTimestamp(),
    });
}

/**
 * O envio falhou sem resposta do governo. Recusa do próprio CFI (4xx, antes de enviar): "não recebido", pode
 * transmitir de novo. Rede, tempo esgotado ou erro do servidor: "sem resposta" — pode ter chegado.
 */
export async function registrarFalhaEnvio(envioId: string, erro: unknown): Promise<'sem-resposta' | 'nao-recebido'> {
    const situacao = situacaoDaFalha(erro);
    await updateDoc(doc(db, COL, envioId), { situacao, erroEnvio: String((erro as Error)?.message ?? erro).slice(0, 500), respondidoEm: serverTimestamp() });
    return situacao;
}
export function situacaoDaFalha(erro: unknown): 'sem-resposta' | 'nao-recebido' {
    const st = (erro as { status?: number })?.status;
    return typeof st === 'number' && st >= 400 && st < 500 && st !== 408 ? 'nao-recebido' : 'sem-resposta';
}

/** Conferido no eSocial (download pelo Id): grava os recibos achados; com todos, o lote fica processado. */
export async function registrarVerificacao(envio: Envio, achados: Record<string, string>, u: Usuario): Promise<void> {
    const eventos = envio.eventos.map(e => (achados[e.id] ? { ...e, nrRecibo: achados[e.id], cdResposta: 201, descResposta: 'Confirmado no eSocial pelo download do evento.' } : e));
    const todos = eventos.every(e => !!e.nrRecibo);
    await updateDoc(doc(db, COL, envio.id), { eventos, ...(todos ? { situacao: 'processado' } : {}), verificadoEm: serverTimestamp(), verificadoPor: u.id, verificadoPorEmail: u.email });
}

/** Sem resposta e não achado no eSocial depois do prazo: libera o reenvio. */
export async function liberarReenvio(envio: Envio, u: Usuario): Promise<void> {
    await updateDoc(doc(db, COL, envio.id), { situacao: 'nao-recebido', verificadoEm: serverTimestamp(), verificadoPor: u.id, verificadoPorEmail: u.email });
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
        eventos: mesclarConsulta(envio.eventos, r), consultadoEm: serverTimestamp(), consultadoPor: u.id, consultadoPorEmail: u.email, consultas: increment(1),
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
