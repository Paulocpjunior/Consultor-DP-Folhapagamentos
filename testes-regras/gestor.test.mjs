import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadString, getBytes } from 'firebase/storage';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

const M = 'junior@spassessoriacontabil.com.br';
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dp',
    firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['adm2', 'admin'], ['col', 'colaborador'], ['pen', 'pendente']]) await setDoc(doc(db, `users/${u}`), { uid: u, role, name: u });
    await setDoc(doc(db, 'empresas/e1'), { cnpj: '1', razaoSocial: 'A', nomeFantasia: 'A', codigoSage: '1', criadoPor: 'col' });
    await uploadString(ref(c.storage(), 'certificados/1/a.pfx'), 'x');
  });
});
afterAll(async () => env?.cleanup());
const ctx = (u, token = {}) => env.authenticatedContext(u, token);
const fs = (u, t) => ctx(u, t).firestore();

describe('gestor acima do admin', () => {
  it('criação do perfil: só pendente; gestor só o master verificado', async () => {
    await assertSucceeds(setDoc(doc(fs('novo'), 'users/novo'), { uid: 'novo', role: 'pendente' }));
    await assertFails(setDoc(doc(fs('n2'), 'users/n2'), { uid: 'n2', role: 'admin' }));
    await assertFails(setDoc(doc(fs('n3'), 'users/n3'), { uid: 'n3', role: 'gestor' }));
    await assertFails(setDoc(doc(fs('n4', { email: M, email_verified: false }), 'users/n4'), { uid: 'n4', role: 'gestor' }));
    await assertSucceeds(setDoc(doc(fs('mst', { email: M, email_verified: true }), 'users/mst'), { uid: 'mst', role: 'gestor', email: M }));
  });
  it('master já cadastrado como admin vira gestor sozinho', async () => {
    await assertSucceeds(updateDoc(doc(fs('adm', { email: M, email_verified: true }), 'users/adm'), { role: 'gestor' }));
    await assertFails(updateDoc(doc(fs('adm2'), 'users/adm2'), { role: 'gestor' }));
  });
  it('admin: aprova e rebaixa colaborador; não toca em admin/gestor nem promove', async () => {
    await assertSucceeds(updateDoc(doc(fs('adm'), 'users/pen'), { role: 'colaborador', approvedAt: serverTimestamp(), approvedBy: 'adm' }));
    await assertSucceeds(updateDoc(doc(fs('adm'), 'users/col'), { role: 'pendente' }));
    await assertFails(updateDoc(doc(fs('adm'), 'users/pen'), { role: 'admin' }));
    await assertFails(updateDoc(doc(fs('adm'), 'users/adm2'), { role: 'colaborador' }));
    await assertFails(updateDoc(doc(fs('adm'), 'users/ges'), { role: 'colaborador' }));
    await assertFails(updateDoc(doc(fs('adm'), 'users/adm'), { role: 'gestor' }));
    await assertFails(updateDoc(doc(fs('adm'), 'users/col'), { name: 'outro' }));
    await assertFails(deleteDoc(doc(fs('adm'), 'users/adm2')));
    await assertSucceeds(deleteDoc(doc(fs('adm'), 'users/pen')));
  });
  it('gestor: promove, rebaixa e exclui qualquer um', async () => {
    await assertSucceeds(updateDoc(doc(fs('ges'), 'users/col'), { role: 'admin' }));
    await assertSucceeds(updateDoc(doc(fs('ges'), 'users/adm'), { role: 'gestor' }));
    await assertSucceeds(updateDoc(doc(fs('ges'), 'users/adm2'), { role: 'colaborador' }));
    await assertSucceeds(deleteDoc(doc(fs('ges'), 'users/adm2')));
  });
  it('gestor não muda nem apaga o próprio perfil; master só se promove a gestor', async () => {
    await assertFails(updateDoc(doc(fs('ges'), 'users/ges'), { role: 'colaborador' }));
    await assertFails(deleteDoc(doc(fs('ges'), 'users/ges')));
    await assertFails(updateDoc(doc(fs('adm', { email: M, email_verified: true }), 'users/adm'), { role: 'colaborador' }));
    await assertFails(updateDoc(doc(fs('adm', { email: M, email_verified: true }), 'users/adm'), { role: 'gestor', name: 'x' }));
    await assertFails(updateDoc(doc(fs('pen', { email: M, email_verified: false }), 'users/pen'), { role: 'gestor' }));
    await assertSucceeds(updateDoc(doc(fs('pen', { email: M, email_verified: true }), 'users/pen'), { role: 'gestor' }));
  });
  it('colaborador e pendente não mudam papel de ninguém', async () => {
    await assertFails(updateDoc(doc(fs('col'), 'users/col'), { role: 'admin' }));
    await assertFails(updateDoc(doc(fs('pen'), 'users/pen'), { role: 'colaborador' }));
  });
  it('gestor e admin continuam com os poderes de admin e aprovados', async () => {
    await assertSucceeds(getDoc(doc(fs('ges'), 'empresas/e1')));
    await assertSucceeds(setDoc(doc(fs('ges'), 'folha_catalogo/x'), { a: 1 }));
    await assertSucceeds(setDoc(doc(fs('adm'), 'folha_catalogo/y'), { a: 1 }));
    await assertFails(setDoc(doc(fs('col'), 'folha_catalogo/z'), { a: 1 }));
  });
  it('excluir empresa: só gestor (nem o criador nem o admin)', async () => {
    await assertFails(deleteDoc(doc(fs('col'), 'empresas/e1')));
    await assertFails(deleteDoc(doc(fs('adm'), 'empresas/e1')));
    await assertSucceeds(deleteDoc(doc(fs('ges'), 'empresas/e1')));
  });
  it('Storage: certificados antigos só o gestor lê; ninguém grava; resto fechado', async () => {
    await assertFails(getBytes(ref(ctx('col').storage(), 'certificados/1/a.pfx')));
    await assertFails(getBytes(ref(ctx('adm').storage(), 'certificados/1/a.pfx')));
    await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), 'certificados/1/a.pfx')));
    await assertSucceeds(getBytes(ref(ctx('ges').storage(), 'certificados/1/a.pfx')));
    await assertFails(uploadString(ref(ctx('ges').storage(), 'certificados/1/c.pfx'), 'z'));
    await assertFails(uploadString(ref(ctx('adm').storage(), 'certificados/1/b.pfx'), 'y'));
    await assertFails(uploadString(ref(ctx('ges').storage(), 'outra/x.txt'), 'z'));
  });
});
