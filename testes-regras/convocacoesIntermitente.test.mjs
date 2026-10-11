import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDocs, collection, deleteDoc, query, where } from 'firebase/firestore';
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
    await setDoc(doc(db, 'convocacoes_intermitente/A_111_M1_k1'), conv('A_111_M1', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
function conv(fichaId, u, extra = {}) { return { empresaId: fichaId.split('_')[0], fichaId, enviadaEm: '2026-03-01', resposta: 'aceita', respondidaEm: '2026-03-02', dias: [{ data: '2026-03-05', horas: 8 }], valorHora: 1500, atualizadoPor: u, ...extra }; }

describe('convocacoes_intermitente', () => {
  it('grava quem pode na empresa, com o id da ficha; lê pela empresa; apaga quem pode', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'convocacoes_intermitente/A_222_M1_k2'), conv('A_222_M1', 'col')));
    await assertFails(setDoc(doc(fs('col2'), 'convocacoes_intermitente/A_222_M1_k2'), conv('A_222_M1', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'convocacoes_intermitente/A_222_k2'), conv('A_222_M1', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'convocacoes_intermitente/B_222_M1_k2'), conv('B_222_M1', 'col', { empresaId: 'A' })));
    await assertFails(setDoc(doc(fs('col'), 'convocacoes_intermitente/A_222_M1_k2'), conv('A_222_M1', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'convocacoes_intermitente/A_222_M1_k2'), conv('A_222_M1', 'col', { resposta: 'talvez' })));
    await assertFails(setDoc(doc(fs('col'), 'convocacoes_intermitente/A_222_M1_k2'), conv('A_222_M1', 'col', { dias: 'x' })));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'convocacoes_intermitente'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'convocacoes_intermitente'), where('empresaId', '==', 'A'))));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'convocacoes_intermitente/A_111_M1_k1')));
  });
});
