// services/demissoes/previasService.ts
//
// Histórico das prévias de rescisão: demissoes_previas/{auto}, por empresa. Guarda quem pediu, quando, os cenários
// (parâmetros) e o resumo de cada um (líquido e custo), para a equipe responder "quanto saía?" e, quando o cliente
// decide, saber qual cenário foi o escolhido. Nada se apaga: a prévia muda de situação.

import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { CenarioDemissao, ResumoCenario } from './previa';

const COL = 'demissoes_previas';
export type SituacaoPrevia = 'previa' | 'enviada' | 'escolhida' | 'descartada';
export const ROTULO_SITUACAO_PREVIA: Record<SituacaoPrevia, string> = { previa: 'Prévia', enviada: 'Enviada ao cliente', escolhida: 'Cenário escolhido', descartada: 'Descartada' };

export interface PreviaGravada {
    id: string; empresaId: string; fichaId: string; nome: string;
    cenarios: Omit<CenarioDemissao, 'id'>[]; resumos: ResumoCenario[];
    saldoFgts: number | null; adiantamento13: number | null; observacao: string;
    situacao: SituacaoPrevia; escolhido: number | null;
    criadoPorEmail: string; criadoEm?: Date;
}

const deDoc = (id: string, x: Record<string, unknown>): PreviaGravada => ({
    id, empresaId: String(x.empresaId ?? ''), fichaId: String(x.fichaId ?? ''), nome: String(x.nome ?? ''),
    cenarios: (x.cenarios as PreviaGravada['cenarios']) ?? [], resumos: (x.resumos as ResumoCenario[]) ?? [],
    saldoFgts: (x.saldoFgts as number | null) ?? null, adiantamento13: (x.adiantamento13 as number | null) ?? null, observacao: String(x.observacao ?? ''),
    situacao: (x.situacao as SituacaoPrevia) ?? 'previa', escolhido: (x.escolhido as number | null) ?? null,
    criadoPorEmail: String(x.criadoPorEmail ?? ''), criadoEm: (x.criadoEm as { toDate?: () => Date } | null)?.toDate?.(),
});

/** Prévias da empresa, da mais recente à mais antiga. */
export async function listarPrevias(empresaId: string): Promise<PreviaGravada[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return s.docs.map(d => deDoc(d.id, d.data())).sort((a, b) => (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0));
}

export async function gravarPrevia(p: Omit<PreviaGravada, 'id' | 'criadoPorEmail' | 'criadoEm' | 'situacao' | 'escolhido'>, u: Usuario): Promise<string> {
    const r = await addDoc(collection(db, COL), {
        empresaId: p.empresaId, fichaId: p.fichaId, nome: p.nome.slice(0, 120),
        cenarios: p.cenarios.map(c => ({ tipo: c.tipo, aviso: c.aviso, data: c.data })), resumos: p.resumos,
        saldoFgts: p.saldoFgts, adiantamento13: p.adiantamento13, observacao: p.observacao.slice(0, 1000),
        situacao: 'previa', escolhido: null, criadoPor: u.id, criadoPorEmail: u.email, criadoEm: serverTimestamp(),
    });
    return r.id;
}

/** Muda a situação (e o cenário escolhido): enviada ao cliente, escolhida, descartada. */
export const mudarSituacaoPrevia = (id: string, situacao: SituacaoPrevia, u: Usuario, escolhido: number | null = null) =>
    updateDoc(doc(db, COL, id), { situacao, escolhido, atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
