import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, setDoc, getDocs, serverTimestamp, runTransaction } from 'firebase/firestore';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'users/col'), { uid: 'col', role: 'colaborador' }); await setDoc(doc(c.firestore(), 'users/adm'), { uid: 'adm', role: 'admin' }); });
});
afterAll(async () => env?.cleanup());

// Mesmo corpo de gravarTabelaOficial (services/cadastros/cadastrosService.ts).
const gravar = (db, u = 'col') => runTransaction(db, async tx => {
  const ref = doc(db, 'cadastro_tabelas_legais/oficial_inss_2026-01');
  if ((await tx.get(ref)).exists()) return false;
  tx.set(ref, { tipo: 'inss', vigencia: '2026-01', norma: 'Portaria teste', atualizadoPor: u, atualizadoPorEmail: 'c@x', atualizadoEm: serverTimestamp() });
  tx.set(doc(collection(db, 'cadastro_audit')), { colecao: 'cadastro_tabelas_legais', docId: ref.id, acao: 'criar', autor: u, quando: serverTimestamp() });
  return true;
});

describe('tabelas oficiais com id fixo (#90)', () => {
  it('colaborador não grava (tabela vale para todas as empresas: só admin)', async () => {
    await assertFails(gravar(env.authenticatedContext('col').firestore()));
  });
  it('admin grava pela transação; a segunda vez não grava nem cria duplicata', async () => {
    const db = env.authenticatedContext('adm').firestore();
    expect(await assertSucceeds(gravar(db, 'adm'))).toBe(true);
    expect(await assertSucceeds(gravar(db, 'adm'))).toBe(false);
    expect((await getDocs(collection(db, 'cadastro_tabelas_legais'))).size).toBe(1);
  });
});
