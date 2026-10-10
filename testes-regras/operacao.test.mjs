import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['dono', 'colaborador'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'carteira_acessos/col'), { empresaIds: ['A'] });
    await setDoc(doc(db, 'empresas/A'), { cnpj: '11222333000181', razaoSocial: 'A', nomeFantasia: 'A', codigoSage: '1200', criadoPor: 'dono', contasPagamento: [{ id: 'c1', banco: '341', proximoNsa: 7 }] });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();

describe('campos de operação da empresa (auditoria 08/10/2026)', () => {
  it('colaborador com a empresa na carteira grava contas/NSA, contato de envio e parâmetros do eSocial', async () => {
    const db = fs('col');
    await assertSucceeds(updateDoc(doc(db, 'empresas/A'), { contasPagamento: [{ id: 'c1', banco: '341', proximoNsa: 8 }], atualizadoEm: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'empresas/A'), { contatoEnvio: { nome: 'Marta' }, atualizadoEm: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, 'empresas/A'), { esocialFolha: { codLotacao: 'L1' }, atualizadoEm: serverTimestamp() }));
    // NSA reservado em transação, como no app.
    await assertSucceeds(runTransaction(db, async tx => { const s = await tx.get(doc(db, 'empresas/A')); tx.update(doc(db, 'empresas/A'), { contasPagamento: s.data().contasPagamento.map(c => ({ ...c, proximoNsa: c.proximoNsa + 1 })), atualizadoEm: serverTimestamp() }); }));
  });
  it('dado cadastral continua fechado para o colaborador; misturar com campo de operação também', async () => {
    const db = fs('col');
    await assertFails(updateDoc(doc(db, 'empresas/A'), { razaoSocial: 'Outra' }));
    await assertFails(updateDoc(doc(db, 'empresas/A'), { contatoEnvio: { nome: 'x' }, nomeFantasia: 'y' }));
    await assertFails(updateDoc(doc(db, 'empresas/A'), { codigoSage: '9999', contasPagamento: [] }));
  });
  it('fora da carteira: recusa; quem cadastrou continua gravando tudo', async () => {
    await assertFails(updateDoc(doc(fs('col2'), 'empresas/A'), { contatoEnvio: { nome: 'x' } }));
    await assertSucceeds(updateDoc(doc(fs('dono'), 'empresas/A'), { nomeFantasia: 'A novo' }));
  });
});
