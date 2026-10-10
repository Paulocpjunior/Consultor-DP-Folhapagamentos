// services/demissoes/efetivacaoService.ts
//
// Os passos manuais da efetivação de cada desligamento: rescisoes_efetivacao/{fichaId}_{data}. Cada passo guarda
// quem marcou, quando e uma observação (o número do requerimento do seguro, a data em que a guia foi paga).

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { PassoId } from './efetivacao';

const COL = 'rescisoes_efetivacao';
export interface PassoMarcado { feito: boolean; obs: string; porEmail: string; em: string }
export interface Efetivacao { empresaId: string; fichaId: string; data: string; passos: Partial<Record<PassoId, PassoMarcado>> }
export const idEfetivacao = (fichaId: string, data: string) => `${fichaId}_${data}`;

export async function lerEfetivacao(empresaId: string, fichaId: string, data: string): Promise<Efetivacao> {
    const s = await getDoc(doc(db, COL, idEfetivacao(fichaId, data)));
    const x = s.exists() ? s.data() : null;
    return { empresaId, fichaId, data, passos: (x?.passos as Efetivacao['passos']) ?? {} };
}

/** Marca (ou desmarca) um passo. Grava o documento inteiro com o autor da mudança. */
export async function marcarPasso(e: Efetivacao, passo: PassoId, feito: boolean, obs: string, u: Usuario): Promise<Efetivacao> {
    const passos = { ...e.passos, [passo]: { feito, obs: obs.slice(0, 300), porEmail: u.email, em: new Date().toISOString() } };
    await setDoc(doc(db, COL, idEfetivacao(e.fichaId, e.data)), { empresaId: e.empresaId, fichaId: e.fichaId, data: e.data, passos, atualizadoPor: u.id, atualizadoEm: serverTimestamp() });
    return { ...e, passos };
}
