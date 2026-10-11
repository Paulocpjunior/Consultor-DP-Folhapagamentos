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
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['so', 'colaborador'], ['dest', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    for (const e of ['A', 'B']) await setDoc(doc(db, `empresas/${e}`), { cnpj: e, criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A', 'B'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/so'), { uid: 'so', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/dest'), { uid: 'dest', empresaIds: ['B'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'transferencias/A_111_M1_2026-10-01'), t('col', { fichaId: 'A_111_M1', data: '2026-10-01' }));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function t(u, extra = {}) { return { empresaId: 'A', destinoId: 'B', fichaId: 'A_111_M2', data: '2026-11-01', matricula: 'B1', situacao: 'efetivada', atualizadoPor: u, ...extra }; }

describe('transferências entre empresas do grupo', () => {
  it('grava quem pode nas duas empresas, com o id ficha_data; as duas leem; não apaga', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'transferencias/A_111_M2_2026-11-01'), t('col')));
    await assertFails(setDoc(doc(fs('so'), 'transferencias/A_111_M2_2026-11-01'), t('so')));
    await assertFails(setDoc(doc(fs('col'), 'transferencias/A_111_M2_2026-12-01'), t('col')));
    await assertFails(setDoc(doc(fs('col'), 'transferencias/B_111_M2_2026-11-01'), t('col', { fichaId: 'B_111_M2' })));
    await assertFails(setDoc(doc(fs('col'), 'transferencias/A_111_M2_2026-11-01'), t('outro')));
    await assertFails(setDoc(doc(fs('col'), 'transferencias/A_111_M1_2026-10-01'), t('col', { fichaId: 'A_111_M1', data: '2026-10-01', destinoId: 'C' })));
    await assertSucceeds(getDocs(query(collection(fs('so'), 'transferencias'), where('empresaId', '==', 'A'))));
    await assertSucceeds(getDocs(query(collection(fs('dest'), 'transferencias'), where('destinoId', '==', 'B'))));
    await assertFails(getDocs(query(collection(fs('dest'), 'transferencias'), where('empresaId', '==', 'A'))));
    await assertFails(deleteDoc(doc(fs('col'), 'transferencias/A_111_M1_2026-10-01')));
  });
});
