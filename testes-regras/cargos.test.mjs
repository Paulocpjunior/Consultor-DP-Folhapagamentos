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
    await setDoc(doc(db, 'cadastro_cargos/A_000001'), cargo('A', '000001', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function cargo(empresaId, codigo, u, extra = {}) { return { empresaId, codigo, nome: 'ASSISTENTE ADM II', cbo: '411010', inativo: false, atividades: [], atualizadoPor: u, ...extra }; }

describe('cadastro_cargos', () => {
  it('grava quem pode na empresa, com o id empresa_código, nome e CBO válidos; lê pela empresa; só o admin apaga', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'cadastro_cargos/A_000004'), cargo('A', '000004', 'col')));
    await assertFails(setDoc(doc(fs('col2'), 'cadastro_cargos/A_000004'), cargo('A', '000004', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_cargos/A_000005'), cargo('A', '000004', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_cargos/A_000004'), cargo('A', '000004', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_cargos/A_000004'), cargo('A', '000004', 'col', { cbo: '4110-10' })));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_cargos/A_000004'), cargo('A', '000004', 'col', { nome: '' })));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_cargos/A_abc'), cargo('A', 'abc', 'col')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'cadastro_cargos'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'cadastro_cargos'), where('empresaId', '==', 'A'))));
    await assertFails(deleteDoc(doc(fs('col'), 'cadastro_cargos/A_000001')));
    await assertSucceeds(deleteDoc(doc(fs('ges'), 'cadastro_cargos/A_000001')));
  });
});
