// services/obras/lotacoesService.ts
//
// Obras e lotações tributárias da empresa: lotacoes/{empresaId}_{codigo}.

import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { idLotacao, lotacaoVazia, type Lotacao } from './lotacoes';

const COL = 'lotacoes';

export async function listarLotacoes(empresaId: string): Promise<Lotacao[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return s.docs.map(d => ({ ...lotacaoVazia(empresaId), ...(d.data() as Partial<Lotacao>) })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function salvarLotacao(l: Lotacao, u: Usuario): Promise<void> {
    const dados = JSON.parse(JSON.stringify({ ...l, codigo: l.codigo.trim() })) as Record<string, unknown>;
    await setDoc(doc(db, COL, idLotacao(l.empresaId, l.codigo)), { ...dados, atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
}

export async function excluirLotacao(l: Lotacao): Promise<void> {
    await deleteDoc(doc(db, COL, idLotacao(l.empresaId, l.codigo)));
}
