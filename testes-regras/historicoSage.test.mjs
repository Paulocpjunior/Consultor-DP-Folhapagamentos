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
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'empresas/A'), { cnpj: 'A', criadoPor: 'ges' });
    await setDoc(doc(db, 'empresas/B'), { cnpj: 'B', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/adm'), { uid: 'adm', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'historico_sage/A_111_M1_2024'), hist('A_111_M1', '2024', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function hist(fichaId, ano, u, extra = {}) { return { empresaId: fichaId.split('_')[0], fichaId, ano, nome: 'X', linhas: [{ codigo: '1', tipo: 'provento', meses: [100, null] }], gravadoPor: u, ...extra }; }

describe('historico_sage', () => {
  it('grava e regrava quem pode na empresa, com o id da ficha e do ano', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'historico_sage/A_111_M1_2023'), hist('A_111_M1', '2023', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'historico_sage/A_111_M1_2024'), hist('A_111_M1', '2024', 'col', { linhas: [] })));
    await assertFails(setDoc(doc(fs('col2'), 'historico_sage/A_111_M1_2023'), hist('A_111_M1', '2023', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'historico_sage/A_111_M1_2022'), hist('A_111_M1', '2023', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'historico_sage/A_111_M1_23'), hist('A_111_M1', '23', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'historico_sage/A_111_M1_2023'), hist('A_111_M1', '2023', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'historico_sage/A_111_M1_2023'), hist('A_111_M1', '2023', 'col', { linhas: 'x' })));
    // Ficha de outra empresa com o empresaId trocado.
    await assertFails(setDoc(doc(fs('col'), 'historico_sage/B_111_M1_2023'), hist('B_111_M1', '2023', 'col', { empresaId: 'A' })));
    await assertFails(setDoc(doc(fs('col'), 'historico_sage/A_2023'), hist('A', '2023', 'col')));
  });

  it('lê pela empresa quem pode nela; só o admin apaga', async () => {
    await assertSucceeds(getDocs(query(collection(fs('col'), 'historico_sage'), where('empresaId', '==', 'A'), where('ano', '==', '2024'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'historico_sage'), where('empresaId', '==', 'A'), where('ano', '==', '2024'))));
    await assertFails(deleteDoc(doc(fs('col'), 'historico_sage/A_111_M1_2024')));
    await assertSucceeds(deleteDoc(doc(fs('adm'), 'historico_sage/A_111_M1_2024')));
  });
});
