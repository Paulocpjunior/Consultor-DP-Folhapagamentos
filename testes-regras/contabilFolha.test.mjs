import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'contabil_folha/A'), cfg('A', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function cfg(empresaId, u, extra = {}) { return { empresaId, contas: { SALARIOS_A_PAGAR: '2.1.1' }, porCentroCusto: true, atualizadoPor: u, ...extra }; }

describe('plano de contas da folha', () => {
  it('grava e lê quem pode na empresa; id é a empresa; não apaga', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'contabil_folha/A'), cfg('A', 'col', { contas: { DESP_SALARIOS: '4.1.1' } })));
    await assertSucceeds(getDoc(doc(fs('col'), 'contabil_folha/A')));
    await assertFails(getDoc(doc(fs('col2'), 'contabil_folha/A')));
    await assertFails(setDoc(doc(fs('col2'), 'contabil_folha/A'), cfg('A', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'contabil_folha/B'), cfg('A', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'contabil_folha/A'), cfg('A', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'contabil_folha/A'), cfg('A', 'col', { contas: 'x' })));
    await assertFails(deleteDoc(doc(fs('col'), 'contabil_folha/A')));
  });
});
