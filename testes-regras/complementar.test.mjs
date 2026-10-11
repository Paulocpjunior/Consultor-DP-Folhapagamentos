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
    await setDoc(doc(db, 'fechamentos/A_2026-08'), { empresaId: 'A', competencia: '2026-08', situacao: 'encerrado', encerradoPor: 'col', checklist: {} });
    await setDoc(doc(db, 'folhas_complementares/A_2026-08_C'), comp('2026-08', 'C', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function comp(perApur, tpAcConv, u, extra = {}) { return { empresaId: 'A', perApur, tpAcConv, pagamento: perApur, resultados: [], gravadoPor: u, ...extra }; }

describe('folhas_complementares', () => {
  it('grava e regrava na competência aberta, com o id da empresa, competência e tipo, e autor', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'folhas_complementares/A_2026-09_C'), comp('2026-09', 'C', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'folhas_complementares/A_2026-09_C'), comp('2026-09', 'C', 'col', { pagamento: '2026-10' })));
    await assertFails(setDoc(doc(fs('col2'), 'folhas_complementares/A_2026-09_A'), comp('2026-09', 'A', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_complementares/A_2026-09_A'), comp('2026-09', 'A', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_complementares/A_2026-09_A'), comp('2026-09', 'C', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_complementares/A_2026-13_C'), comp('2026-13', 'C', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_complementares/A_2026-09_K'), comp('2026-09', 'K', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_complementares/A_2026-09_C'), comp('2026-09', 'C', 'col', { resultados: 'x' })));
  });
  it('competência encerrada: não muda nem sai, nem pelo gestor; lê e apaga quem pode na empresa', async () => {
    await assertFails(setDoc(doc(fs('ges'), 'folhas_complementares/A_2026-08_C'), comp('2026-08', 'C', 'ges')));
    await assertFails(deleteDoc(doc(fs('ges'), 'folhas_complementares/A_2026-08_C')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'folhas_complementares'), where('empresaId', '==', 'A'), where('perApur', '==', '2026-08'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'folhas_complementares'), where('empresaId', '==', 'A'), where('perApur', '==', '2026-08'))));
    await assertSucceeds(setDoc(doc(fs('col'), 'folhas_complementares/A_2026-09_J'), comp('2026-09', 'J', 'col')));
    await assertFails(deleteDoc(doc(fs('col2'), 'folhas_complementares/A_2026-09_J')));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'folhas_complementares/A_2026-09_J')));
  });
});
