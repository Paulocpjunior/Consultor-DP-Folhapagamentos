import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-folha', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'empresas/A'), { cnpj: 'A', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'demissoes_previas/p1'), previa('col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const cen = { tipo: '02', aviso: 'indenizado', data: '2026-10-05' };
const res = { tipo: '02', aviso: 'indenizado', data: '2026-10-05', liquido: 100000, custoTotal: 200000, multaFgts: 50000, multaEstimada: true };
const previa = (u, extra = {}) => ({ empresaId: 'A', fichaId: 'f1', nome: 'ANA', cenarios: [cen, { ...cen, tipo: '07' }], resumos: [res, res], saldoFgts: null, adiantamento13: null,
  observacao: '', situacao: 'previa', escolhido: null, criadoPor: u, criadoPorEmail: `${u}@x`, criadoEm: serverTimestamp(), ...extra });

describe('demissoes_previas', () => {
  it('quem pode na empresa lê e cria; outro não', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), 'demissoes_previas/p1')));
    await assertFails(getDoc(doc(fs('col2'), 'demissoes_previas/p1')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'demissoes_previas'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'demissoes_previas'), where('empresaId', '==', 'A'))));
    await assertSucceeds(setDoc(doc(fs('col'), 'demissoes_previas/n'), previa('col')));
    await assertSucceeds(setDoc(doc(fs('ges'), 'demissoes_previas/g'), previa('ges')));
    await assertFails(setDoc(doc(fs('col2'), 'demissoes_previas/n2'), previa('col2')));
  });
  it('formato: autor, situação inicial, cenários e resumos', async () => {
    await assertFails(setDoc(doc(fs('col'), 'demissoes_previas/x'), previa('outro')));
    await assertFails(setDoc(doc(fs('col'), 'demissoes_previas/x'), previa('col', { situacao: 'escolhida' })));
    await assertFails(setDoc(doc(fs('col'), 'demissoes_previas/x'), previa('col', { resumos: [res] })));
    await assertFails(setDoc(doc(fs('col'), 'demissoes_previas/x'), previa('col', { cenarios: [] , resumos: [] })));
    await assertFails(setDoc(doc(fs('col'), 'demissoes_previas/x'), previa('col', { extra: 1 })));
    await assertFails(setDoc(doc(fs('col'), 'demissoes_previas/x'), previa('col', { saldoFgts: 'mil' })));
  });
  it('muda só a situação e o escolhido; os números não; nada se apaga', async () => {
    const ok = { situacao: 'escolhida', escolhido: 1, atualizadoPor: 'col', atualizadoPorEmail: 'col@x', atualizadoEm: serverTimestamp() };
    await assertSucceeds(updateDoc(doc(fs('col'), 'demissoes_previas/p1'), ok));
    await assertFails(updateDoc(doc(fs('col'), 'demissoes_previas/p1'), { ...ok, escolhido: 5 }));
    await assertFails(updateDoc(doc(fs('col'), 'demissoes_previas/p1'), { ...ok, resumos: [res, { ...res, liquido: 1 }] }));
    await assertFails(updateDoc(doc(fs('col'), 'demissoes_previas/p1'), { ...ok, atualizadoPor: 'ges' }));
    await assertFails(updateDoc(doc(fs('col2'), 'demissoes_previas/p1'), { ...ok, atualizadoPor: 'col2' }));
    await assertFails(deleteDoc(doc(fs('col'), 'demissoes_previas/p1')));
    await assertFails(deleteDoc(doc(fs('ges'), 'demissoes_previas/p1')));
  });
});
