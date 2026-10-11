import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocs, collection, deleteDoc, query, where } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-folha', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
const NR = '00012342920255020001';
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'empresas/A'), { cnpj: 'A', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/adm'), { uid: 'adm', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, `processos_trabalhistas/A_${NR}`), proc(NR, 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function proc(nr, u, extra = {}) { return { empresaId: 'A', nrProcTrab: nr, origem: '1', trabalhadores: [], pagamentos: [], atualizadoPor: u, ...extra }; }

describe('processos_trabalhistas', () => {
  it('grava e regrava quem pode na empresa, com o id da empresa e do número', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'processos_trabalhistas/A_123456789012345'), proc('123456789012345', 'col', { origem: '2' })));
    await assertSucceeds(setDoc(doc(fs('col'), `processos_trabalhistas/A_${NR}`), proc(NR, 'col', { pagamentos: [{ perApurPgto: '2026-09' }] })));
    await assertFails(setDoc(doc(fs('col2'), `processos_trabalhistas/A_${NR}`), proc(NR, 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'processos_trabalhistas/A_123'), proc('123', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'processos_trabalhistas/A_123456789012345'), proc(NR, 'col')));
    await assertFails(setDoc(doc(fs('col'), `processos_trabalhistas/A_${NR}`), proc(NR, 'col', { origem: '3' })));
    await assertFails(setDoc(doc(fs('col'), `processos_trabalhistas/A_${NR}`), proc(NR, 'outro')));
    await assertFails(setDoc(doc(fs('col'), `processos_trabalhistas/A_${NR}`), proc(NR, 'col', { trabalhadores: 'x' })));
  });

  it('lê pela empresa quem pode nela; só o admin apaga', async () => {
    await assertSucceeds(getDocs(query(collection(fs('col'), 'processos_trabalhistas'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'processos_trabalhistas'), where('empresaId', '==', 'A'))));
    await assertFails(deleteDoc(doc(fs('col'), `processos_trabalhistas/A_${NR}`)));
    await assertSucceeds(deleteDoc(doc(fs('adm'), `processos_trabalhistas/A_${NR}`)));
  });
});
