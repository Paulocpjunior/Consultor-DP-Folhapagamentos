// services/ponto/pontoLayoutsService.ts
//
// CRUD dos layouts de ponto por empresa (Firestore: ponto_layouts/{cnpj}_{cadastroSAGE}).
// Mesmo padrao do folhaLayoutsService: doc id e composto, normalizado.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { LayoutPonto } from '../../types/ponto';

const COLLECTION = 'ponto_layouts';

/** Normaliza CNPJ para so digitos. */
export function soDigitos(s: string): string {
  return String(s ?? '').replace(/\D/g, '');
}

/** Monta o id composto: 14 digitos do CNPJ + '_' + cadastro SAGE. */
export function montarIdLayout(cnpj: string, cadastroSAGE: string): string {
  const cnpjLimpo = soDigitos(cnpj);
  const sage = String(cadastroSAGE ?? '').trim();
  if (cnpjLimpo.length !== 14) {
    throw new Error(`CNPJ invalido: "${cnpj}" (esperado 14 digitos, recebeu ${cnpjLimpo.length})`);
  }
  if (!sage) {
    throw new Error('Cadastro SAGE obrigatorio para montar id do layout de ponto.');
  }
  return `${cnpjLimpo}_${sage}`;
}

/** Busca o layout salvo pra empresa. Retorna null se nao existir (1a importacao). */
export async function buscarLayout(cnpj: string, cadastroSAGE: string): Promise<LayoutPonto | null> {
  const id = montarIdLayout(cnpj, cadastroSAGE);
  const snap = await getDoc(doc(db, COLLECTION, id));
  if (!snap.exists()) return null;
  return snap.data() as LayoutPonto;
}

/** Salva (cria ou substitui) o layout da empresa. */
export async function salvarLayout(layout: LayoutPonto): Promise<void> {
  const id = montarIdLayout(layout.cnpj, layout.cadastroSAGE);
  const payload = { ...layout, updatedAt: Date.now() };
  await setDoc(doc(db, COLLECTION, id), payload, { merge: false });
}

/** Atualiza apenas o pisToMatricula (caso comum apos cadastrar matricula nova). */
export async function adicionarMatriculaPorPIS(
  cnpj: string,
  cadastroSAGE: string,
  pis: string,
  matricula: string,
): Promise<void> {
  const id = montarIdLayout(cnpj, cadastroSAGE);
  const ref = doc(db, COLLECTION, id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error(`Layout ${id} nao existe. Crie o layout antes de adicionar matricula.`);
  }
  const atual = snap.data() as LayoutPonto;
  const novo = { ...(atual.pisToMatricula ?? {}), [pis]: matricula };
  await updateDoc(ref, { pisToMatricula: novo, updatedAt: Date.now() });
}

/** Lista todos os layouts de uma empresa (pode ter mais de um cadastro SAGE). */
export async function listarLayoutsPorCnpj(cnpj: string): Promise<LayoutPonto[]> {
  const cnpjLimpo = soDigitos(cnpj);
  const q = query(collection(db, COLLECTION), where('cnpj', '==', cnpjLimpo));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as LayoutPonto);
}

/** Remove o layout. */
export async function removerLayout(cnpj: string, cadastroSAGE: string): Promise<void> {
  const id = montarIdLayout(cnpj, cadastroSAGE);
  await deleteDoc(doc(db, COLLECTION, id));
}
