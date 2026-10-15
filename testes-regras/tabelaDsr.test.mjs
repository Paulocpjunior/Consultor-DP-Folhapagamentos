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
    await setDoc(doc(db, 'cadastro_dsr/A_2025'), dsr('A', '2025', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const meses = Object.fromEntries(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => [m, { uteis: 26, descanso: 5 }]));
function dsr(empresaId, ano, u, extra = {}) { return { empresaId, ano, meses, faltasPelosDiasDoMes: false, descontarDsrNaFalta: false, observacao: '', atualizadoPor: u, ...extra }; }

describe('cadastro_dsr', () => {
  it('grava quem pode na empresa, com o id empresa_ano; lê pela empresa; só o admin apaga', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'cadastro_dsr/A_2026'), dsr('A', '2026', 'col')));
    await assertFails(setDoc(doc(fs('col2'), 'cadastro_dsr/A_2026'), dsr('A', '2026', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_dsr/A_2027'), dsr('A', '2026', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_dsr/A_26'), dsr('A', '26', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_dsr/A_2026'), dsr('A', '2026', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_dsr/A_2026'), dsr('A', '2026', 'col', { meses: { ...meses, '13': { uteis: 1, descanso: 0 } } })));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_dsr/A_2026'), dsr('A', '2026', 'col', { faltasPelosDiasDoMes: 'sim' })));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'cadastro_dsr'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'cadastro_dsr'), where('empresaId', '==', 'A'))));
    await assertFails(deleteDoc(doc(fs('col'), 'cadastro_dsr/A_2025')));
    await assertSucceeds(deleteDoc(doc(fs('ges'), 'cadastro_dsr/A_2025')));
  });
});
