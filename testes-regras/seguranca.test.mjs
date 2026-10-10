// Auditoria de 10/2026: ataques às regras que precisam falhar.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, getDocs, collection, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeEach, beforeAll, afterAll } from 'vitest';

const EMP = 'AAAAAAAAAAAAAAAAAAA1'; // empresa da vítima (id automático de 20 caracteres)
const MINHA = 'BBBBBBBBBBBBBBBBBBB2';
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['col', 'colaborador'], ['ata', 'colaborador'], ['pen', 'pendente']]) await setDoc(doc(db, `users/${u}`), { uid: u, role, email: `${u}@x.com`, name: u });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: [EMP], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/ata'), { uid: 'ata', empresaIds: [MINHA], atualizadoPor: 'ges' });
    await setDoc(doc(db, `empresas/${EMP}`), { criadoPor: 'ges', cnpj: '11222333000181', codigoSage: '0001', razaoSocial: 'V', nomeFantasia: 'V' });
    await setDoc(doc(db, `empresas/${MINHA}`), { criadoPor: 'ges', cnpj: '44388152000189', codigoSage: '0002', razaoSocial: 'M', nomeFantasia: 'M' });
    await setDoc(doc(db, `cadastro_funcionarios/${EMP}_52998224725_M1`), { empresaId: EMP, cpf: '52998224725', matriculaEsocial: 'M1', dados: { salario: '9999.00' }, atualizadoPor: 'ges' });
    await setDoc(doc(db, `calculo_movimentos/${EMP}_52998224725_M1_2026-09`), { empresaId: EMP, fichaId: `${EMP}_52998224725_M1`, competencia: '2026-09', movimento: {}, atualizadoPor: 'ges' });
    await setDoc(doc(db, 'cadastro_audit/a1'), { colecao: 'cadastro_funcionarios', docId: `${EMP}_52998224725_M1`, empresaId: EMP, acao: 'criar', alteracoes: [{ campo: 'salario', de: '', para: '9999.00' }], autor: 'ges' });
    await setDoc(doc(db, 'cadastro_audit/a2'), { colecao: 'cadastro_sindicatos', docId: '11222333000181', acao: 'criar', alteracoes: [], autor: 'ges' });
    await setDoc(doc(db, 'cadastro_audit/a3'), { colecao: 'carteira_acessos', docId: 'col', acao: 'carteira', alteracoes: [], autor: 'ges' });
  });
});
afterAll(async () => env?.cleanup());
const fs = (uid, token = {}) => env.authenticatedContext(uid, token).firestore();

describe('auditoria de cadastros: só da carteira', () => {
  it('colaborador de outra empresa não lê a auditoria das fichas', async () => {
    await assertFails(getDocs(collection(fs('ata'), 'cadastro_audit')));
    await assertFails(getDocs(query(collection(fs('ata'), 'cadastro_audit'), where('docId', '==', `${EMP}_52998224725_M1`))));
    await assertFails(getDoc(doc(fs('ata'), 'cadastro_audit/a1')));
    await assertFails(getDocs(query(collection(fs('ata'), 'cadastro_audit'), where('empresaId', '==', EMP))));
  });
  it('quem tem a empresa na carteira lê pela empresa; sindicato para todos; carteira só admin', async () => {
    await assertSucceeds(getDocs(query(collection(fs('col'), 'cadastro_audit'), where('empresaId', '==', EMP), where('docId', '==', `${EMP}_52998224725_M1`))));
    await assertSucceeds(getDoc(doc(fs('col'), 'cadastro_audit/a1')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'cadastro_audit'), where('colecao', '==', 'cadastro_sindicatos'), where('docId', '==', '11222333000181'))));
    await assertFails(getDoc(doc(fs('col'), 'cadastro_audit/a3')));
    await assertSucceeds(getDoc(doc(fs('adm'), 'cadastro_audit/a3')));
    await assertSucceeds(getDocs(collection(fs('ges'), 'cadastro_audit')));
  });
  it('não grava auditoria em nome de empresa fora da carteira', async () => {
    await assertFails(setDoc(doc(fs('ata'), 'cadastro_audit/f1'), { colecao: 'cadastro_funcionarios', docId: 'x', empresaId: EMP, acao: 'criar', alteracoes: [], autor: 'ata', quando: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(fs('col'), 'cadastro_audit/f2'), { colecao: 'cadastro_funcionarios', docId: 'x', empresaId: EMP, acao: 'criar', alteracoes: [], autor: 'col', quando: serverTimestamp() }));
  });
});

describe('usuários: lista só para admin', () => {
  it('pendente e colaborador não listam; admin lista', async () => {
    await assertFails(getDocs(collection(fs('pen'), 'users')));
    await assertFails(getDocs(collection(fs('col'), 'users')));
    await assertSucceeds(getDocs(collection(fs('adm'), 'users')));
  });
  it('perfil novo com o e-mail do próprio login', async () => {
    await assertFails(setDoc(doc(fs('n1', { email: 'n1@x.com', email_verified: true }), 'users/n1'), { uid: 'n1', role: 'pendente', email: 'outra@x.com', name: 'Outra pessoa' }));
    await assertSucceeds(setDoc(doc(fs('n2', { email: 'n2@x.com', email_verified: true }), 'users/n2'), { uid: 'n2', role: 'pendente', email: 'n2@x.com', name: 'N2' }));
  });
});

describe('ficha e movimento não mudam de empresa', () => {
  it('empresa com id que vira regex não é criada', async () => {
    const db = fs('ata');
    const b = writeBatch(db);
    b.set(doc(db, 'empresas/.*'), { criadoPor: 'ata', cnpj: '99999999000199', codigoSage: '9999', razaoSocial: 'X', nomeFantasia: 'X' });
    b.set(doc(db, 'empresas_unicos/sage_9999'), { chave: 'sage_9999', empresaId: '.*', criadoPor: 'ata' });
    b.set(doc(db, 'empresas_unicos/cnpj_99999999000199'), { chave: 'cnpj_99999999000199', empresaId: '.*', criadoPor: 'ata' });
    await assertFails(b.commit());
  });
  it('não puxa a ficha nem o movimento da vítima para outra empresa (nem com regex no id)', async () => {
    // Mesmo com uma empresa ".*" já existente (gravada por fora), a troca é recusada.
    await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), 'empresas/.*'), { criadoPor: 'ata', cnpj: '1', codigoSage: '1', razaoSocial: 'X', nomeFantasia: 'X' }); });
    await assertFails(updateDoc(doc(fs('ata'), `cadastro_funcionarios/${EMP}_52998224725_M1`), { empresaId: '.*', atualizadoPor: 'ata' }));
    await assertFails(updateDoc(doc(fs('ata'), `cadastro_funcionarios/${EMP}_52998224725_M1`), { empresaId: MINHA, atualizadoPor: 'ata' }));
    await assertFails(updateDoc(doc(fs('ata'), `calculo_movimentos/${EMP}_52998224725_M1_2026-09`), { empresaId: '.*', atualizadoPor: 'ata' }));
    await assertFails(setDoc(doc(fs('ata'), `cadastro_funcionarios/${EMP}_11144477735_M9`), { empresaId: '.*', cpf: '11144477735', matriculaEsocial: 'M9', dados: {}, atualizadoPor: 'ata' }));
  });
  it('quem tem a empresa edita a ficha (sem trocar a empresa)', async () => {
    await assertSucceeds(updateDoc(doc(fs('col'), `cadastro_funcionarios/${EMP}_52998224725_M1`), { 'dados.salario': '1.00', atualizadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('col'), `cadastro_funcionarios/${EMP}_52998224725_M1`), { empresaId: MINHA, atualizadoPor: 'col' }));
  });
});

describe('empresa: criadoPor não muda; formato de CNPJ e código', () => {
  it('quem cadastrou não passa a empresa para outro nem guarda o acesso trocando criadoPor', async () => {
    await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), `empresas/${MINHA}`), { criadoPor: 'ata', cnpj: '44388152000189', codigoSage: '0002', razaoSocial: 'M', nomeFantasia: 'M' }); });
    await assertFails(updateDoc(doc(fs('ata'), `empresas/${MINHA}`), { criadoPor: 'col' }));
    await assertSucceeds(updateDoc(doc(fs('ata'), `empresas/${MINHA}`), { razaoSocial: 'M2' }));
  });
  it('CNPJ com máscara ou id fora do padrão não cria empresa', async () => {
    const db = fs('ata');
    const nova = (id, cnpj, sage) => { const b = writeBatch(db);
      b.set(doc(db, `empresas/${id}`), { criadoPor: 'ata', cnpj, codigoSage: sage, razaoSocial: 'N', nomeFantasia: 'N' });
      b.set(doc(db, `empresas_unicos/sage_${sage}`), { chave: `sage_${sage}`, empresaId: id, criadoPor: 'ata' });
      b.set(doc(db, `empresas_unicos/cnpj_${cnpj}`), { chave: `cnpj_${cnpj}`, empresaId: id, criadoPor: 'ata' });
      return b.commit(); };
    await assertFails(nova('CCCCCCCCCCCCCCCCCCC3', '11.222.333.0001-81', '0003'));
    await assertSucceeds(nova('DDDDDDDDDDDDDDDDDDD4', '11444777000161', '0004'));
  });
});
