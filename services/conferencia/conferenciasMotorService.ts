// services/conferencia/conferenciasMotorService.ts
//
// Firestore da homologação do motor: conferencias_motor/{empresa}_{AAAA-MM}, uma por competência conferida com o
// eSocial do IOB. Gravar de novo a mesma competência substitui o resultado (vale a última conferência).

import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { RegistroConferenciaMotor } from './homologacaoMotor';

const COL = 'conferencias_motor';

export async function listarConferenciasMotor(empresaId: string): Promise<RegistroConferenciaMotor[]> {
    const snap = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return snap.docs.map(d => {
        const x = d.data() as Omit<RegistroConferenciaMotor, 'atualizadoEm'> & { atualizadoEm?: { toDate?: () => Date } };
        return { ...x, atualizadoEm: x.atualizadoEm?.toDate?.() ?? null };
    }).sort((a, b) => a.competencia.localeCompare(b.competencia));
}

export async function gravarConferenciasMotor(empresaId: string, resumos: { competencia: string; zerada: boolean; confere: number; diverge: number; pendentes: number }[], arquivos: string[], u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    for (const r of resumos) {
        lote.set(doc(db, COL, `${empresaId}_${r.competencia}`), {
            empresaId, competencia: r.competencia, zerada: r.zerada, confere: r.confere, diverge: r.diverge, pendentes: r.pendentes,
            arquivos: arquivos.slice(0, 50), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
        });
    }
    await lote.commit();
}
