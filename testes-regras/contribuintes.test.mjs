import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, where } from 'firebase/firestore';
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
    await setDoc(doc(db, 'pagamentos_ci/A_2026-08'), pag('2026-08', 'col'));
    await setDoc(doc(db, 'contribuintes_individuais/A_52998224725'), cad('52998224725', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function cad(cpf, u, extra = {}) { return { empresaId: 'A', cpf, nome: 'X', categoria: '701', atualizadoPor: u, ...extra }; }
function pag(competencia, u, extra = {}) { return { empresaId: 'A', competencia, lancamentos: [], resultados: [], gravadoPor: u, ...extra }; }

describe('contribuintes_individuais', () => {
  it('cadastra quem pode na empresa, com o id da empresa e do CPF; não apaga; lê pela empresa', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'contribuintes_individuais/A_39053344705'), cad('39053344705', 'col')));
    await assertFails(setDoc(doc(fs('col2'), 'contribuintes_individuais/A_39053344705'), cad('39053344705', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'contribuintes_individuais/A_11111111111'), cad('39053344705', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'contribuintes_individuais/A_123'), cad('123', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'contribuintes_individuais/A_39053344705'), cad('39053344705', 'outro')));
    await assertFails(deleteDoc(doc(fs('ges'), 'contribuintes_individuais/A_52998224725')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'contribuintes_individuais'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'contribuintes_individuais'), where('empresaId', '==', 'A'))));
  });
});

describe('pagamentos_ci', () => {
  it('grava, regrava e apaga com o mês aberto; encerrado não muda; lê quem pode na empresa', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'pagamentos_ci/A_2026-09'), pag('2026-09', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'pagamentos_ci/A_2026-09'), pag('2026-09', 'col', { lancamentos: [{ valor: 1 }] })));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_ci/A_2026-09'), pag('2026-09', 'col', { resultados: 'x' })));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_ci/A_2026-07'), pag('2026-09', 'col')));
    await assertFails(setDoc(doc(fs('col2'), 'pagamentos_ci/A_2026-09'), pag('2026-09', 'col2')));
    await assertFails(setDoc(doc(fs('ges'), 'pagamentos_ci/A_2026-08'), pag('2026-08', 'ges')));
    await assertFails(deleteDoc(doc(fs('ges'), 'pagamentos_ci/A_2026-08')));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'pagamentos_ci/A_2026-09')));
    await assertSucceeds(getDoc(doc(fs('col'), 'pagamentos_ci/A_2026-08')));
    await assertSucceeds(getDoc(doc(fs('col'), 'pagamentos_ci/A_2026-10')));
    await assertFails(getDoc(doc(fs('col2'), 'pagamentos_ci/A_2026-08')));
  });
});
