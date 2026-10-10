import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-crm', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
const A = '11222333000181', B = '99888777000166';
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['col', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'empresas/EA'), { cnpj: A, criadoPor: 'ges' });
    await setDoc(doc(db, `empresas_unicos/cnpj_${A}`), { empresaId: 'EA' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['EA'], atualizadoPor: 'ges' });
    for (const d of [A, B]) await setDoc(doc(db, `crm_dp/${d}`), { documento: d, nome: 'X', particularidades: 'paga dia 5', ativoNoCrm: true });
    await setDoc(doc(db, 'crm_dp_meta/sincronizacao'), { empresas: 2, colaboradores: [] });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();

describe('crm_dp', () => {
  it('colaborador lê só a empresa da carteira; não lista nem lê o resumo', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), `crm_dp/${A}`)));
    await assertFails(getDoc(doc(fs('col'), `crm_dp/${B}`)));
    await assertFails(getDocs(collection(fs('col'), 'crm_dp')));
    await assertFails(getDoc(doc(fs('col'), 'crm_dp_meta/sincronizacao')));
  });
  it('gestor e admin leem tudo; ninguém grava pelo app', async () => {
    await assertSucceeds(getDocs(collection(fs('adm'), 'crm_dp')));
    await assertSucceeds(getDoc(doc(fs('ges'), 'crm_dp_meta/sincronizacao')));
    await assertFails(setDoc(doc(fs('ges'), `crm_dp/${A}`), { nome: 'Y' }));
    await assertFails(setDoc(doc(fs('ges'), 'crm_dp_meta/sincronizacao'), { empresas: 1 }));
  });
  it('ligação responsável → usuário: gestor e admin, só no documento colaboradores; colaborador não', async () => {
    await assertSucceeds(setDoc(doc(fs('adm'), 'crm_dp_mapa/colaboradores'), { '637650': 'col' }, { merge: true }));
    await assertFails(setDoc(doc(fs('adm'), 'crm_dp_mapa/outro'), { '637650': 'col' }));
    await assertFails(setDoc(doc(fs('col'), 'crm_dp_mapa/colaboradores'), { '637650': 'col' }, { merge: true }));
    await assertFails(getDoc(doc(fs('col'), 'crm_dp_mapa/colaboradores')));
    await assertFails(deleteDoc(doc(fs('ges'), 'crm_dp_mapa/colaboradores')));
  });
});
