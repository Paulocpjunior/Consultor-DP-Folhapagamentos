import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    for (const e of ['A', 'B']) await setDoc(doc(db, `empresas/${e}`), { cnpj: e, criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    for (const e of ['A', 'B']) await setDoc(doc(db, `esocial_envios/env${e}`), { empresaId: e, protocolo: 'p', tpAmb: 2, eventos: [], situacao: 'enviado', enviadoPor: 'ges', enviadoEm: 1 });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const novo = (e, u, extra = {}) => ({ empresaId: e, cnpj: '1', protocolo: '1.2.3', tpAmb: 2, grupo: 3, eventos: [{ id: 'X', tipo: 'S-1299' }], situacao: 'enviado', enviadoPor: u, enviadoEm: serverTimestamp(), ...extra });

describe('esocial_envios', () => {
  it('lê só da carteira (consulta por empresa, ordenada)', async () => {
    await assertSucceeds(getDocs(query(collection(fs('col'), 'esocial_envios'), where('empresaId', '==', 'A'), orderBy('enviadoEm', 'desc'))));
    await assertFails(getDocs(query(collection(fs('col'), 'esocial_envios'), where('empresaId', '==', 'B'))));
    await assertFails(getDoc(doc(fs('col2'), 'esocial_envios/envA')));
  });
  it('registra o lote na empresa da carteira, com autor e ambiente válidos', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_envios/n1'), novo('A', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_envios/n2'), novo('A', 'col', { protocolo: '', situacao: 'recusado' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n3'), novo('B', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n4'), novo('A', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n5'), novo('A', 'col', { tpAmb: 3 })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n6'), novo('A', 'col', { eventos: Array(51).fill({}) })));
  });
  it('consulta só atualiza o resultado; ninguém apaga', async () => {
    await assertSucceeds(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'processado', eventos: [{ id: 'X', nrRecibo: '1' }], consultadoPor: 'col', consultadoEm: serverTimestamp() }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { protocolo: 'outro', consultadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'processado', consultadoPor: 'outro' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envB'), { situacao: 'processado', consultadoPor: 'col' }));
    await assertFails(deleteDoc(doc(fs('col'), 'esocial_envios/envA')));
    await assertFails(deleteDoc(doc(fs('ges'), 'esocial_envios/envA')));
  });
});
