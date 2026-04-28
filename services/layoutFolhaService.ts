// services/layoutFolhaService.ts
//
// Firestore CRUD pra layouts de folha por empresa.
// Coleção: folha_layouts/{cnpj-só-dígitos}

import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import type { LayoutFolha } from '../types/layoutFolha';

const COLLECTION = 'folha_layouts';

export function cnpjKey(cnpj: string): string {
  return (cnpj ?? '').replace(/\D/g, '');
}

/** Busca o layout de uma empresa pelo CNPJ. null se não existe. */
export async function getLayoutFolha(cnpj: string): Promise<LayoutFolha | null> {
  if (!db) return null;
  const key = cnpjKey(cnpj);
  if (!key) return null;
  const ref = doc(db, COLLECTION, key);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as LayoutFolha;
}

/** Cria/atualiza o layout. Mescla com o existente. */
export async function saveLayoutFolha(
  layout: Omit<LayoutFolha, 'updatedAt' | 'createdAt' | 'version'> & {
    createdAt?: number;
    version?: number;
  }
): Promise<void> {
  if (!db) {
    console.warn('[layoutFolhaService] Firestore não configurado.');
    return;
  }
  const now = Date.now();
  const payload: LayoutFolha = {
    ...layout,
    cnpj: cnpjKey(layout.cnpj),
    createdAt: layout.createdAt ?? now,
    updatedAt: now,
    version: layout.version ?? 1,
  };
  await setDoc(doc(db, COLLECTION, payload.cnpj), payload, { merge: true });
}

/** Mescla matrículas no layout (preserva as existentes). */
export async function saveMatriculasLayout(
  cnpj: string,
  matriculas: Record<string, string>
): Promise<void> {
  if (!db) return;
  const existing = await getLayoutFolha(cnpj);
  if (!existing) {
    console.warn('[layoutFolhaService] Layout não existe pra esse CNPJ.');
    return;
  }
  const merged = { ...(existing.matriculas ?? {}), ...matriculas };
  await setDoc(
    doc(db, COLLECTION, cnpjKey(cnpj)),
    { matriculas: merged, updatedAt: Date.now() },
    { merge: true }
  );
}

export async function listLayouts(): Promise<LayoutFolha[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => d.data() as LayoutFolha);
}
