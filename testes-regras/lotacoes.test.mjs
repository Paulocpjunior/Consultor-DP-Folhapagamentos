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
    await setDoc(doc(db, 'lotacoes/A_OBRA01'), lot('A', 'OBRA01', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function lot(empresaId, codigo, u, extra = {}) { return { empresaId, codigo, tipo: '01', descricao: 'Obra', fpas: '507', codTercs: '0079', iniValid: '2026-10', atualizadoPor: u, ...extra }; }

describe('lotacoes', () => {
  it('grava quem pode na empresa, com o id empresa_código; lê pela empresa; apaga quem pode', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'lotacoes/A_OBRA02'), lot('A', 'OBRA02', 'col', { tipo: '02' })));
    await assertFails(setDoc(doc(fs('col2'), 'lotacoes/A_OBRA02'), lot('A', 'OBRA02', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'lotacoes/A_OUTRA'), lot('A', 'OBRA02', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'lotacoes/B_OBRA02'), lot('B', 'OBRA02', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'lotacoes/A_OBRA02'), lot('A', 'OBRA02', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'lotacoes/A_OBRA02'), lot('A', 'OBRA02', 'col', { tipo: '03' })));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'lotacoes'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'lotacoes'), where('empresaId', '==', 'A'))));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'lotacoes/A_OBRA01')));
  });
});
