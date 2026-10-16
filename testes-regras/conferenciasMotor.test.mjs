import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, deleteDoc, collection, query, where } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-folha', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'empresas/A'), { cnpj: 'A', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const reg = (u, extra = {}) => ({ empresaId: 'A', competencia: '2026-09', zerada: true, confere: 10, diverge: 0, pendentes: 0, arquivos: ['s1200.zip'], atualizadoPor: u, atualizadoPorEmail: `${u}@x`, ...extra });

describe('conferências do motor × IOB (homologação)', () => {
  it('quem trabalha na empresa grava e lê; id = empresa_competência; tipos conferidos; não apaga', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'conferencias_motor/A_2026-09'), reg('col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'conferencias_motor/A_2026-09'), reg('col', { zerada: false, diverge: 2 })));
    await assertSucceeds(getDoc(doc(fs('col'), 'conferencias_motor/A_2026-09')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'conferencias_motor'), where('empresaId', '==', 'A'))));
    await assertFails(getDoc(doc(fs('col2'), 'conferencias_motor/A_2026-09')));
    await assertFails(setDoc(doc(fs('col2'), 'conferencias_motor/A_2026-10'), reg('col2', { competencia: '2026-10' })));
    await assertFails(setDoc(doc(fs('col'), 'conferencias_motor/A_2026-10'), reg('col')));
    await assertFails(setDoc(doc(fs('col'), 'conferencias_motor/A_2026-13'), reg('col', { competencia: '2026-13' })));
    await assertFails(setDoc(doc(fs('col'), 'conferencias_motor/A_2026-09'), reg('col', { zerada: 'sim' })));
    await assertFails(setDoc(doc(fs('col'), 'conferencias_motor/A_2026-09'), reg('outro')));
    await assertFails(deleteDoc(doc(fs('col'), 'conferencias_motor/A_2026-09')));
  });
});
