// services/ponto/pontoModelosService.ts
//
// CRUD do catalogo de modelos de ponto (Firestore: ponto_modelos/{id}).
// Padrao espelhado do folhaLayoutsService que ja existe no projeto.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { ModeloPonto } from '../../types/ponto';

const COLLECTION = 'ponto_modelos';

/** Lista todos os modelos disponiveis, ordenados por fabricante e nome. */
export async function listarModelos(): Promise<ModeloPonto[]> {
  const q = query(collection(db, COLLECTION), orderBy('fabricante'), orderBy('nome'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ModeloPonto, 'id'>) }));
}

/** Busca um modelo pelo id. */
export async function buscarModelo(id: string): Promise<ModeloPonto | null> {
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<ModeloPonto, 'id'>) };
}

/** Cria ou substitui um modelo. */
export async function salvarModelo(modelo: ModeloPonto): Promise<void> {
  const ref = doc(db, COLLECTION, modelo.id);
  const payload = {
    ...modelo,
    updatedAt: Date.now(),
    _serverUpdatedAt: serverTimestamp(),
  };
  await setDoc(ref, payload, { merge: false });
}

/** Atualiza apenas alguns campos do modelo (ex: adicionar entrada no deParaEventos). */
export async function atualizarModelo(id: string, patch: Partial<ModeloPonto>): Promise<void> {
  const ref = doc(db, COLLECTION, id);
  await updateDoc(ref, { ...patch, updatedAt: Date.now() });
}

/** Remove um modelo. Use com cuidado: se houver layouts apontando pra ele, vao quebrar. */
export async function removerModelo(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id));
}
