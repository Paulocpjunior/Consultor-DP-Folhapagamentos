import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
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
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const ev = { codigo: '1015', descricao: 'TRIÊNIO', tipo: 'V', rv: 'R', coeficiente: 1, ro: '040', incidencias: { ir: 'S', in: 'S', irf: 'S', inf: 'S', fg: 'S', rt: 'S', vr: 'S' } };
const tab = (u, extra = {}) => ({ empresaId: 'A', eventos: [ev], modo: 'completa', origem: 'eventos.xlsx', atualizadoPor: u, atualizadoPorEmail: `${u}@x`, ...extra });

describe('tabela de eventos da empresa', () => {
  it('quem trabalha na empresa grava, lê e apaga; id é a empresa; modo e lista conferidos', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'eventos_empresa/A'), tab('col')));
    await assertSucceeds(getDoc(doc(fs('col'), 'eventos_empresa/A')));
    await assertFails(getDoc(doc(fs('col2'), 'eventos_empresa/A')));
    await assertFails(setDoc(doc(fs('col2'), 'eventos_empresa/A'), tab('col2')));
    await assertFails(setDoc(doc(fs('col'), 'eventos_empresa/B'), tab('col')));
    await assertFails(setDoc(doc(fs('col'), 'eventos_empresa/A'), tab('col', { modo: 'outro' })));
    await assertFails(setDoc(doc(fs('col'), 'eventos_empresa/A'), tab('col', { eventos: [] })));
    await assertFails(setDoc(doc(fs('col'), 'eventos_empresa/A'), tab('outro')));
    await assertFails(deleteDoc(doc(fs('col2'), 'eventos_empresa/A')));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'eventos_empresa/A')));
  });
});
