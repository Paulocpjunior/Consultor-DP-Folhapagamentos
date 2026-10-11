import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocs, collection, deleteDoc, query, where } from 'firebase/firestore';
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
    await setDoc(doc(db, 'departamentos/A_OBRA01'), dep('A', 'OBRA01', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function dep(empresaId, codigo, u, extra = {}) { return { empresaId, codigo, nome: "Obra", centroCusto: "", ativo: true, atualizadoPor: u, ...extra }; }

describe('departamentos', () => {
  it('grava quem pode na empresa, com o id empresa_código; lê pela empresa; apaga quem pode', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'departamentos/A_OBRA02'), dep('A', 'OBRA02', 'col', { centroCusto: 'CC1' })));
    await assertFails(setDoc(doc(fs('col2'), 'departamentos/A_OBRA02'), dep('A', 'OBRA02', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'departamentos/A_OUTRA'), dep('A', 'OBRA02', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'departamentos/B_OBRA02'), dep('B', 'OBRA02', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'departamentos/A_OBRA02'), dep('A', 'OBRA02', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'departamentos/A_OBRA02'), dep('A', 'OBRA02', 'col', { nome: '' })));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'departamentos'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'departamentos'), where('empresaId', '==', 'A'))));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'departamentos/A_OBRA01')));
  });
});
