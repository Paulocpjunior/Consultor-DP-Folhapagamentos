// services/departamentos/departamentosService.ts
//
// Departamentos da empresa: departamentos/{empresaId}_{codigo}.

import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { departamentoVazio, idDepartamento, type Departamento } from './departamentos';

const COL = 'departamentos';
const dados = (d: Departamento, u: Usuario) => ({ empresaId: d.empresaId, codigo: d.codigo.trim(), nome: d.nome.trim(), centroCusto: d.centroCusto.trim(), ativo: d.ativo,
    atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });

export async function listarDepartamentos(empresaId: string): Promise<Departamento[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return s.docs.map(d => ({ ...departamentoVazio(empresaId), ...(d.data() as Partial<Departamento>) })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function salvarDepartamento(d: Departamento, u: Usuario): Promise<void> {
    await setDoc(doc(db, COL, idDepartamento(d.empresaId, d.codigo)), dados(d, u));
}

export async function criarDepartamentos(lista: Departamento[], u: Usuario): Promise<void> {
    const lote = writeBatch(db);
    for (const d of lista) lote.set(doc(db, COL, idDepartamento(d.empresaId, d.codigo)), dados(d, u));
    await lote.commit();
}

export async function excluirDepartamento(d: Departamento): Promise<void> {
    await deleteDoc(doc(db, COL, idDepartamento(d.empresaId, d.codigo)));
}
