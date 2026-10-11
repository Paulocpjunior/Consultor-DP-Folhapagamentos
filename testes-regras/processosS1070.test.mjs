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
    await setDoc(doc(db, 'processos_s1070/A_2_00000000000000000001'), proc('col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function proc(u, extra = {}) { return { empresaId: 'A', tpProc: '2', nrProc: '00000000000000000001', iniValid: '2026-01', ativo: true, atualizadoPor: u, ...extra }; }

describe('processos do S-1070', () => {
  it('grava quem pode na empresa, com o id empresa_tipo_número; lê pela empresa; não apaga', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'processos_s1070/A_1_12345678901234567'), proc('col', { tpProc: '1', nrProc: '12345678901234567' })));
    await assertFails(setDoc(doc(fs('col2'), 'processos_s1070/A_1_12345678901234567'), proc('col2', { tpProc: '1', nrProc: '12345678901234567' })));
    await assertFails(setDoc(doc(fs('col'), 'processos_s1070/A_3_12345678901234567'), proc('col', { tpProc: '3', nrProc: '12345678901234567' })));
    await assertFails(setDoc(doc(fs('col'), 'processos_s1070/A_1_123'), proc('col', { tpProc: '1', nrProc: '123' })));
    await assertFails(setDoc(doc(fs('col'), 'processos_s1070/A_1_99999999999999999'), proc('col', { tpProc: '1', nrProc: '12345678901234567' })));
    await assertFails(setDoc(doc(fs('col'), 'processos_s1070/A_1_12345678901234567'), proc('outro', { tpProc: '1', nrProc: '12345678901234567' })));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'processos_s1070'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'processos_s1070'), where('empresaId', '==', 'A'))));
    await assertFails(deleteDoc(doc(fs('col'), 'processos_s1070/A_2_00000000000000000001')));
  });
});
