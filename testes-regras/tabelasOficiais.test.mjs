import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, collection, setDoc, getDocs, serverTimestamp, runTransaction } from 'firebase/firestore';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'users/col'), { uid: 'col', role: 'colaborador' }); });
});
afterAll(async () => env?.cleanup());

// Mesmo corpo de gravarTabelaOficial (services/cadastros/cadastrosService.ts).
const gravar = db => runTransaction(db, async tx => {
  const ref = doc(db, 'cadastro_tabelas_legais/oficial_inss_2026-01');
  if ((await tx.get(ref)).exists()) return false;
  tx.set(ref, { tipo: 'inss', vigencia: '2026-01', norma: 'Portaria teste', atualizadoPor: 'col', atualizadoPorEmail: 'c@x', atualizadoEm: serverTimestamp() });
  tx.set(doc(collection(db, 'cadastro_audit')), { colecao: 'cadastro_tabelas_legais', docId: ref.id, acao: 'criar', autor: 'col', quando: serverTimestamp() });
  return true;
});

describe('tabelas oficiais com id fixo (#90)', () => {
  it('colaborador grava pela transação; a segunda vez não grava nem cria duplicata', async () => {
    const db = env.authenticatedContext('col').firestore();
    expect(await assertSucceeds(gravar(db))).toBe(true);
    expect(await assertSucceeds(gravar(db))).toBe(false);
    expect((await getDocs(collection(db, 'cadastro_tabelas_legais'))).size).toBe(1);
  });
});
