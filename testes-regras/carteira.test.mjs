import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-cart', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['adm2', 'admin'], ['col', 'colaborador'], ['col2', 'colaborador'], ['pen', 'pendente']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    for (const e of ['A', 'B', 'C']) await setDoc(doc(db, `empresas/${e}`), { cnpj: e, razaoSocial: e, nomeFantasia: e, codigoSage: '1', criadoPor: 'ges' });
    await setDoc(doc(db, 'empresas/MINHA'), { cnpj: 'M', razaoSocial: 'M', nomeFantasia: 'M', codigoSage: '1', criadoPor: 'col' });
    await setDoc(doc(db, 'carteira_acessos/adm'), { uid: 'adm', empresaIds: ['A', 'B'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'adm' });
    for (const e of ['A', 'B', 'C']) {
      await setDoc(doc(db, `cadastro_funcionarios/${e}_123_X`), { empresaId: e, cpf: '123', matriculaEsocial: 'X', situacao: 'ativo', atualizadoPor: 'ges' });
      await setDoc(doc(db, `esocial_eventos/ev${e}`), { empresaId: e, status: 'pendente', criadoEm: 1 });
    }
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const cart = (uid, ids, por) => ({ uid, empresaIds: ids, atualizadoPor: por, atualizadoEm: serverTimestamp() });

describe('carteira do colaborador', () => {
  it('empresas: gestor lista todas; os outros leem a carteira e as que cadastraram', async () => {
    await assertSucceeds(getDocs(collection(fs('ges'), 'empresas')));
    await assertFails(getDocs(collection(fs('adm'), 'empresas')));
    await assertFails(getDocs(collection(fs('col'), 'empresas')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'empresas'), where('criadoPor', '==', 'col'))));
    await assertSucceeds(getDoc(doc(fs('col'), 'empresas/A')));
    await assertSucceeds(getDoc(doc(fs('col'), 'empresas/MINHA')));
    await assertFails(getDoc(doc(fs('col'), 'empresas/B')));
    await assertSucceeds(getDoc(doc(fs('adm'), 'empresas/B')));
    await assertFails(getDoc(doc(fs('adm'), 'empresas/C')));
    await assertFails(getDoc(doc(fs('col2'), 'empresas/A')));
    await assertFails(getDoc(doc(fs('pen'), 'empresas/A')));
  });
  it('empresa: admin edita só da carteira; colaborador só a que cadastrou', async () => {
    await assertSucceeds(updateDoc(doc(fs('adm'), 'empresas/A'), { nomeFantasia: 'A2' }));
    await assertFails(updateDoc(doc(fs('adm'), 'empresas/C'), { nomeFantasia: 'C2' }));
    await assertFails(updateDoc(doc(fs('col'), 'empresas/A'), { nomeFantasia: 'A3' }));
    await assertSucceeds(updateDoc(doc(fs('col'), 'empresas/MINHA'), { nomeFantasia: 'M2' }));
  });
  it('dados da empresa: só da carteira (consulta por empresa e "in")', async () => {
    await assertSucceeds(getDocs(query(collection(fs('col'), 'cadastro_funcionarios'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col'), 'cadastro_funcionarios'), where('empresaId', '==', 'B'))));
    await assertFails(getDocs(query(collection(fs('col'), 'cadastro_funcionarios'), where('situacao', '==', 'ativo'))));
    await assertSucceeds(getDocs(query(collection(fs('adm'), 'cadastro_funcionarios'), where('empresaId', 'in', ['A', 'B']), where('situacao', '==', 'ativo'))));
    await assertFails(getDocs(query(collection(fs('adm'), 'cadastro_funcionarios'), where('empresaId', 'in', ['A', 'C']))));
    await assertSucceeds(getDocs(query(collection(fs('ges'), 'cadastro_funcionarios'), where('situacao', '==', 'ativo'))));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'esocial_eventos'), where('empresaId', 'in', ['A']), orderBy('criadoEm', 'desc'))));
    await assertFails(getDocs(query(collection(fs('col'), 'esocial_eventos'), orderBy('criadoEm', 'desc'))));
    await assertSucceeds(getDoc(doc(fs('col'), 'cadastro_funcionarios/A_123_X')));
    await assertFails(getDoc(doc(fs('col'), 'cadastro_funcionarios/B_123_X')));
  });
  it('gravar dados: só na empresa da carteira (ou criada pelo usuário)', async () => {
    const f = (e, u) => ({ empresaId: e, cpf: '9', matriculaEsocial: 'Y', atualizadoPor: u });
    await assertSucceeds(setDoc(doc(fs('col'), 'cadastro_funcionarios/A_9_Y'), f('A', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_funcionarios/B_9_Y'), f('B', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'cadastro_funcionarios/MINHA_9_Y'), f('MINHA', 'col')));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_eventos/evA'), { empresaId: 'B' }));
    await assertFails(deleteDoc(doc(fs('adm'), 'cadastro_funcionarios/C_123_X')));
    await assertSucceeds(deleteDoc(doc(fs('adm'), 'cadastro_funcionarios/B_123_X')));
  });
  it('montar carteira: gestor qualquer uma; admin só de colaborador e com empresas dele', async () => {
    await assertSucceeds(setDoc(doc(fs('ges'), 'carteira_acessos/adm2'), cart('adm2', ['C'], 'ges')));
    await assertSucceeds(setDoc(doc(fs('adm'), 'carteira_acessos/col'), cart('col', ['A', 'B'], 'adm')));
    await assertFails(setDoc(doc(fs('adm'), 'carteira_acessos/col'), cart('col', ['A', 'C'], 'adm')));
    await assertSucceeds(setDoc(doc(fs('adm'), 'carteira_acessos/col2'), cart('col2', ['B'], 'adm')));
    await assertFails(setDoc(doc(fs('adm'), 'carteira_acessos/adm2'), cart('adm2', ['A'], 'adm')));
    await assertFails(setDoc(doc(fs('adm'), 'carteira_acessos/adm'), cart('adm', ['A', 'B', 'C'], 'adm')));
    await assertFails(setDoc(doc(fs('col'), 'carteira_acessos/col'), cart('col', ['A', 'B', 'C'], 'col')));
    await assertFails(setDoc(doc(fs('adm'), 'carteira_acessos/col2'), cart('col2', ['B'], 'outro')));
    await assertFails(deleteDoc(doc(fs('adm'), 'carteira_acessos/col')));
    await assertSucceeds(deleteDoc(doc(fs('ges'), 'carteira_acessos/col')));
  });
  it('admin remove empresa fora da carteira dele: recusado', async () => {
    await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), 'carteira_acessos/col2'), { uid: 'col2', empresaIds: ['A', 'C'], atualizadoPor: 'ges' }));
    await assertFails(setDoc(doc(fs('adm'), 'carteira_acessos/col2'), cart('col2', ['A'], 'adm')));
    await assertSucceeds(setDoc(doc(fs('adm'), 'carteira_acessos/col2'), cart('col2', ['C'], 'adm')));
  });
  it('ler carteira: a própria; admin e gestor leem e listam as dos outros', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), 'carteira_acessos/col')));
    await assertFails(getDoc(doc(fs('col'), 'carteira_acessos/adm')));
    await assertSucceeds(getDocs(collection(fs('adm'), 'carteira_acessos')));
    await assertFails(getDocs(collection(fs('col'), 'carteira_acessos')));
  });
});
