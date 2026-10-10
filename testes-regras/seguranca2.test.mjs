// Auditoria de 10/2026, 2ª parte: coleções da folha por CNPJ, sindicatos, log do eSocial e layouts de ponto.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where, addDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { describe, it, beforeEach, beforeAll, afterAll } from 'vitest';

const EMP = 'AAAAAAAAAAAAAAAAAAA1'; const CNPJ = '11222333000181';
const OUTRA = 'BBBBBBBBBBBBBBBBBBB2'; const CNPJ2 = '44388152000189';
let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['col', 'colaborador'], ['ata', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role, email: `${u}@x.com` });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: [EMP], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/ata'), { uid: 'ata', empresaIds: [OUTRA], atualizadoPor: 'ges' });
    await setDoc(doc(db, `empresas/${EMP}`), { criadoPor: 'ges', cnpj: CNPJ, codigoSage: '0001' });
    await setDoc(doc(db, `empresas/${OUTRA}`), { criadoPor: 'ges', cnpj: CNPJ2, codigoSage: '0002' });
    await setDoc(doc(db, `empresas_unicos/cnpj_${CNPJ}`), { chave: `cnpj_${CNPJ}`, empresaId: EMP, criadoPor: 'ges' });
    await setDoc(doc(db, `empresas_unicos/cnpj_${CNPJ2}`), { chave: `cnpj_${CNPJ2}`, empresaId: OUTRA, criadoPor: 'ges' });
    await setDoc(doc(db, `folha_mapeamentos/${CNPJ}`), { cliente: CNPJ, matriculas: { ANA: '1' } });
    await setDoc(doc(db, 'folha_mapeamentos/EDUCATI'), { cliente: 'EDUCATI' });
    await setDoc(doc(db, `ponto_layouts/${CNPJ}_0001`), { cnpj: CNPJ, cadastroSAGE: '0001' });
    await setDoc(doc(db, `cadastro_sindicatos/${CNPJ2}`), { cnpj: CNPJ2, nome: 'SIND', atualizadoPor: 'ges' });
    await setDoc(doc(db, 'esocial_audit/l1'), { empresaId: EMP, acao: 'x' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();

describe('folha por CNPJ: só da carteira', () => {
  it('mapeamento, seleção, perfil de colunas e histórico da empresa da carteira', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), `folha_mapeamentos/${CNPJ}`)));
    await assertSucceeds(setDoc(doc(fs('col'), `folha_selecoes_eventos/${CNPJ}`), { cliente: CNPJ, codigos: [] }));
    await assertSucceeds(setDoc(doc(fs('col'), `folha_perfis_colunas/${CNPJ}`), { cnpj: CNPJ }));
    await assertSucceeds(addDoc(collection(fs('col'), `folha_historico/${CNPJ}/exportacoes`), { quando: 1 }));
    await assertFails(deleteDoc(doc(fs('col'), `folha_mapeamentos/${CNPJ}`)));
  });
  it('de outra empresa, não lê nem grava', async () => {
    await assertFails(getDoc(doc(fs('ata'), `folha_mapeamentos/${CNPJ}`)));
    await assertFails(setDoc(doc(fs('ata'), `folha_mapeamentos/${CNPJ}`), { cliente: CNPJ }));
    await assertFails(getDocs(collection(fs('ata'), `folha_historico/${CNPJ}/exportacoes`)));
    await assertFails(setDoc(doc(fs('ata'), `folha_perfis_colunas/${CNPJ}`), { cnpj: CNPJ }));
  });
  it('CNPJ sem chave reservada: só o admin; modelo com nome: lê quem é aprovado, grava o admin', async () => {
    await assertFails(setDoc(doc(fs('col'), 'folha_mapeamentos/99888777000166'), { cliente: 'x' }));
    await assertSucceeds(setDoc(doc(fs('adm'), 'folha_mapeamentos/99888777000166'), { cliente: 'x' }));
    await assertSucceeds(getDoc(doc(fs('ata'), 'folha_mapeamentos/EDUCATI')));
    await assertFails(setDoc(doc(fs('ata'), 'folha_mapeamentos/EDUCATI'), { cliente: 'EDUCATI' }));
    await assertSucceeds(setDoc(doc(fs('adm'), 'folha_mapeamentos/EDUCATI'), { cliente: 'EDUCATI' }));
  });
  it('layouts de ponto pela empresa dona do CNPJ', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), `ponto_layouts/${CNPJ}_0001`)));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'ponto_layouts'), where('cnpj', '==', CNPJ))));
    await assertFails(getDocs(query(collection(fs('ata'), 'ponto_layouts'), where('cnpj', '==', CNPJ))));
    await assertFails(getDoc(doc(fs('ata'), `ponto_layouts/${CNPJ}_0001`)));
    await assertFails(setDoc(doc(fs('col'), `ponto_layouts/${CNPJ}_0002`), { cnpj: CNPJ2, cadastroSAGE: '0002' }));
    await assertSucceeds(setDoc(doc(fs('col'), `ponto_layouts/${CNPJ}_0002`), { cnpj: CNPJ, cadastroSAGE: '0002' }));
  });
});

describe('globais', () => {
  it('sindicato novo qualquer aprovado cadastra; mudar o existente é do admin', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'cadastro_sindicatos/55666777000188'), { cnpj: '55666777000188', nome: 'NOVO', atualizadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('col'), `cadastro_sindicatos/${CNPJ2}`), { nome: 'OUTRO', atualizadoPor: 'col' }));
    await assertSucceeds(updateDoc(doc(fs('adm'), `cadastro_sindicatos/${CNPJ2}`), { nome: 'OUTRO', atualizadoPor: 'adm' }));
  });
  it('log do eSocial (todas as empresas): só o admin lê', async () => {
    await assertFails(getDocs(collection(fs('col'), 'esocial_audit')));
    await assertSucceeds(getDocs(collection(fs('adm'), 'esocial_audit')));
  });
});
