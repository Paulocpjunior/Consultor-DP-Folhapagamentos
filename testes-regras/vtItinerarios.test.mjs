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
    await setDoc(doc(db, 'vt_itinerarios/A_111_M1'), iti('A_111_M1', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function iti(fichaId, u, extra = {}) { return { empresaId: fichaId.split('_')[0], fichaId, linhas: [], diasSemana: [1, 2], atualizadoPor: u, ...extra }; }

describe('vt_itinerarios', () => {
  it('grava quem pode na empresa, com o id da ficha; lê pela empresa; apaga quem pode', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'vt_itinerarios/A_222_M1'), iti('A_222_M1', 'col')));
    await assertFails(setDoc(doc(fs('col2'), 'vt_itinerarios/A_222_M1'), iti('A_222_M1', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'vt_itinerarios/A_333_M1'), iti('A_222_M1', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'vt_itinerarios/B_222_M1'), iti('B_222_M1', 'col', { empresaId: 'A' })));
    await assertFails(setDoc(doc(fs('col'), 'vt_itinerarios/A_222_M1'), iti('A_222_M1', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'vt_itinerarios/A_222_M1'), iti('A_222_M1', 'col', { linhas: 'x' })));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'vt_itinerarios'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'vt_itinerarios'), where('empresaId', '==', 'A'))));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'vt_itinerarios/A_111_M1')));
  });
});
