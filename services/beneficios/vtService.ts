// services/beneficios/vtService.ts
//
// Itinerário do vale-transporte de cada funcionário: vt_itinerarios/{fichaId} (a ficha começa pelo id da empresa).

import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { ItinerarioVt } from './vtECoparticipacao';

const COL = 'vt_itinerarios';

export async function listarItinerarios(empresaId: string): Promise<ItinerarioVt[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return s.docs.map(d => { const x = d.data(); return { empresaId: x.empresaId, fichaId: x.fichaId, linhas: x.linhas ?? [], diasSemana: x.diasSemana ?? [1, 2, 3, 4, 5] }; });
}

export async function salvarItinerario(i: ItinerarioVt, u: Usuario): Promise<void> {
    await setDoc(doc(db, COL, i.fichaId), {
        empresaId: i.empresaId, fichaId: i.fichaId, linhas: JSON.parse(JSON.stringify(i.linhas)), diasSemana: i.diasSemana,
        atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    });
}
