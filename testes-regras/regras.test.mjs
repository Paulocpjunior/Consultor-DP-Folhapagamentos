import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'users/col'), { role: 'colaborador' });
    await setDoc(doc(db, 'users/adm'), { role: 'admin' });
    await setDoc(doc(db, 'users/pen'), { role: 'pendente' });
    // Carteira: o colaborador e o admin de teste trabalham na Emp1.
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['Emp1'], atualizadoPor: 'adm' });
    await setDoc(doc(db, 'carteira_acessos/adm'), { uid: 'adm', empresaIds: ['Emp1'], atualizadoPor: 'adm' });
    await setDoc(doc(db, 'cadastro_tabelas_legais/t1'), { tipo: 'inss', vigencia: '2026-01', norma: 'Portaria X', atualizadoPor: 'adm' });
  });
});
afterAll(async () => env?.cleanup());
const col = () => env.authenticatedContext('col').firestore();
const adm = () => env.authenticatedContext('adm').firestore();
const pen = () => env.authenticatedContext('pen').firestore();
const ficha = (uid, extra = {}) => ({ empresaId: 'Emp1', cpf: '52998224725', matriculaEsocial: 'E_77', situacao: 'ativo', dados: { nome: 'X' }, atualizadoPor: uid, atualizadoEm: serverTimestamp(), ...extra });

describe('regras dos cadastros', () => {
  it('funcionários', async () => {
    await assertSucceeds(setDoc(doc(col(), 'cadastro_funcionarios/Emp1_52998224725_E_77'), ficha('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_funcionarios/Outra_52998224725_E_77'), ficha('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_funcionarios/Emp1_52998224725_E_78'), ficha('adm')));
    await assertFails(setDoc(doc(pen(), 'cadastro_funcionarios/Emp1_52998224725_E_79'), ficha('pen')));
    await assertFails(getDoc(doc(pen(), 'cadastro_funcionarios/Emp1_52998224725_E_77')));
    await assertSucceeds(getDoc(doc(col(), 'cadastro_funcionarios/Emp1_52998224725_E_77')));
    await assertSucceeds(updateDoc(doc(col(), 'cadastro_funcionarios/Emp1_52998224725_E_77'), { dados: { nome: 'Y' }, atualizadoPor: 'col' }));
    await assertFails(deleteDoc(doc(col(), 'cadastro_funcionarios/Emp1_52998224725_E_77')));
    await assertSucceeds(deleteDoc(doc(adm(), 'cadastro_funcionarios/Emp1_52998224725_E_77')));
  });
  it('sindicatos', async () => {
    await assertSucceeds(setDoc(doc(col(), 'cadastro_sindicatos/11222333000181'), { cnpj: '11222333000181', nome: 'S', atualizadoPor: 'col' }));
    await assertFails(setDoc(doc(col(), 'cadastro_sindicatos/11222333000181'), { cnpj: '99', nome: 'S', atualizadoPor: 'col' }));
    await assertFails(deleteDoc(doc(col(), 'cadastro_sindicatos/11222333000181')));
    await assertSucceeds(deleteDoc(doc(adm(), 'cadastro_sindicatos/11222333000181')));
  });
  it('tabelas legais: criar com norma; alterar e apagar só admin', async () => {
    await assertSucceeds(setDoc(doc(col(), 'cadastro_tabelas_legais/t2'), { tipo: 'irrf', vigencia: '2026-01', norma: 'Lei Y de 2025', atualizadoPor: 'col' }));
    await assertFails(setDoc(doc(col(), 'cadastro_tabelas_legais/t3'), { tipo: 'irrf', vigencia: '2026-01', norma: '', atualizadoPor: 'col' }));
    await assertFails(setDoc(doc(col(), 'cadastro_tabelas_legais/t1'), { tipo: 'inss', vigencia: '2026-02', norma: 'Portaria X', atualizadoPor: 'col' }));
    await assertFails(deleteDoc(doc(col(), 'cadastro_tabelas_legais/t1')));
    await assertSucceeds(setDoc(doc(adm(), 'cadastro_tabelas_legais/t1'), { tipo: 'inss', vigencia: '2026-02', norma: 'Portaria X', atualizadoPor: 'adm' }));
    await assertSucceeds(deleteDoc(doc(adm(), 'cadastro_tabelas_legais/t2')));
  });
  it('auditoria: só inclusão, com o próprio autor', async () => {
    const ref = await assertSucceeds(addDoc(collection(col(), 'cadastro_audit'), { autor: 'col', acao: 'criar' }));
    await assertFails(addDoc(collection(col(), 'cadastro_audit'), { autor: 'adm', acao: 'criar' }));
    await assertFails(updateDoc(doc(adm(), 'cadastro_audit', ref.id), { acao: 'x' }));
    await assertFails(deleteDoc(doc(adm(), 'cadastro_audit', ref.id)));
  });
  it('horários', async () => {
    const h = (uid, extra = {}) => ({ empresaId: 'Emp1', codigo: '001', atualizadoPor: uid, ...extra });
    await assertSucceeds(setDoc(doc(col(), 'cadastro_horarios/Emp1_001'), h('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_horarios/Outra_001'), h('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_horarios/Emp1_002'), h('adm')));
    await assertFails(setDoc(doc(pen(), 'cadastro_horarios/Emp1_003'), h('pen')));
    await assertFails(deleteDoc(doc(col(), 'cadastro_horarios/Emp1_001')));
    await assertSucceeds(deleteDoc(doc(adm(), 'cadastro_horarios/Emp1_001')));
  });
  it('afastamentos', async () => {
    const a = (uid, extra = {}) => ({ empresaId: 'Emp1', cpf: '52998224725', dtInicio: '2026-05-04', atualizadoPor: uid, ...extra });
    await assertSucceeds(setDoc(doc(col(), 'cadastro_afastamentos/Emp1_52998224725_M-1_2026-05-04'), a('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_afastamentos/Emp1_52998224725_M-1_2026-05-05'), a('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_afastamentos/Emp2_52998224725_M-1_2026-05-04'), a('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_afastamentos/Emp1_11111111111_M-1_2026-05-04'), a('col')));
    await assertSucceeds(getDoc(doc(col(), 'cadastro_afastamentos/Emp1_52998224725_M-1_2026-05-04')));
    await assertFails(deleteDoc(doc(col(), 'cadastro_afastamentos/Emp1_52998224725_M-1_2026-05-04')));
    await assertSucceeds(deleteDoc(doc(adm(), 'cadastro_afastamentos/Emp1_52998224725_M-1_2026-05-04')));
  });
  it('rubricas', async () => {
    const r = (uid, extra = {}) => ({ empresaId: 'Emp1', codRubr: '1', atualizadoPor: uid, ...extra });
    await assertSucceeds(setDoc(doc(col(), 'cadastro_rubricas/Emp1_FP_1'), r('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_rubricas/Emp2_FP_1'), r('col')));
    await assertFails(setDoc(doc(col(), 'cadastro_rubricas/Emp1_FP_2'), r('adm')));
    await assertSucceeds(updateDoc(doc(col(), 'cadastro_rubricas/Emp1_FP_1'), { eventoIob: '0002', atualizadoPor: 'col' }));
    await assertFails(deleteDoc(doc(col(), 'cadastro_rubricas/Emp1_FP_1')));
    await assertSucceeds(deleteDoc(doc(adm(), 'cadastro_rubricas/Emp1_FP_1')));
    await assertSucceeds(getDoc(doc(col(), 'folha_catalogo/iob_sage')));
  });
  it('movimento do cálculo', async () => {
    const m = (uid, extra = {}) => ({ empresaId: 'Emp1', fichaId: 'Emp1_52998224725_M1', competencia: '2026-09', movimento: { horasExtras50: 10 }, atualizadoPor: uid, ...extra });
    const id = 'calculo_movimentos/Emp1_52998224725_M1_2026-09';
    await assertSucceeds(setDoc(doc(col(), id), m('col')));
    await assertFails(setDoc(doc(col(), id), m('adm')));
    await assertFails(setDoc(doc(col(), 'calculo_movimentos/Emp1_52998224725_M1_2026-10'), m('col')));
    await assertFails(setDoc(doc(col(), 'calculo_movimentos/Emp1_52998224725_M1_2026-13'), m('col', { competencia: '2026-13' })));
    await assertFails(setDoc(doc(col(), 'calculo_movimentos/Emp2_52998224725_M1_2026-09'), m('col', { fichaId: 'Emp2_52998224725_M1' })));
    await assertFails(setDoc(doc(col(), id), m('col', { movimento: 'x' })));
    await assertFails(setDoc(doc(pen(), id), m('pen')));
    await assertSucceeds(updateDoc(doc(col(), id), { movimento: { faltasDias: 1 }, atualizadoPor: 'col' }));
    await assertSucceeds(getDoc(doc(col(), id)));
    await assertFails(deleteDoc(doc(col(), id)));
    await assertSucceeds(deleteDoc(doc(adm(), id)));
  });
  it('enquadramento previdenciário', async () => {
    const e = (uid, extra = {}) => ({ empresaId: 'Emp1', vigencia: '2026-01', regime: 'normal', rat: 2, fap: 1, atualizadoPor: uid, ...extra });
    const id = 'cadastro_enquadramentos/Emp1_2026-01';
    await assertSucceeds(setDoc(doc(col(), id), e('col')));
    await assertFails(setDoc(doc(col(), id), e('adm')));
    await assertFails(setDoc(doc(col(), 'cadastro_enquadramentos/Emp1_2026-02'), e('col')));
    await assertFails(setDoc(doc(col(), id), e('col', { regime: 'outro' })));
    await assertFails(setDoc(doc(col(), 'cadastro_enquadramentos/Emp1_2026-13'), e('col', { vigencia: '2026-13' })));
    await assertFails(setDoc(doc(pen(), id), e('pen')));
    await assertSucceeds(updateDoc(doc(col(), id), { fap: 1.1, atualizadoPor: 'col' }));
    await assertFails(deleteDoc(doc(col(), id)));
    await assertSucceeds(deleteDoc(doc(adm(), id)));
  });
  it('coleções existentes: empresa só da carteira; o resto fechado', async () => {
    await assertSucceeds(getDoc(doc(col(), 'empresas/Emp1')));
    await assertFails(getDoc(doc(col(), 'empresas/x')));
    await assertFails(getDoc(doc(col(), 'qualquer/x')));
  });
});
