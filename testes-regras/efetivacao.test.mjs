import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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
    await setDoc(doc(db, 'empresas/B'), { cnpj: 'B', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'rescisoes_efetivacao/f1_2026-10-20'), ef('col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const passo = { feito: true, obs: 'req 123', porEmail: 'col@x', em: '2026-10-21T10:00:00Z' };
const ef = (u, extra = {}) => ({ empresaId: 'A', fichaId: 'f1', data: '2026-10-20', passos: { seguro: passo }, atualizadoPor: u, atualizadoEm: serverTimestamp(), ...extra });

describe('rescisoes_efetivacao', () => {
  it('quem pode na empresa lê e marca; outro não; nada se apaga', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), 'rescisoes_efetivacao/f1_2026-10-20')));
    await assertFails(getDoc(doc(fs('col2'), 'rescisoes_efetivacao/f1_2026-10-20')));
    await assertSucceeds(setDoc(doc(fs('col'), 'rescisoes_efetivacao/f1_2026-10-20'), ef('col', { passos: { seguro: passo, fgts: passo } })));
    await assertSucceeds(setDoc(doc(fs('col'), 'rescisoes_efetivacao/f2_2026-10-20'), ef('col', { fichaId: 'f2' })));
    await assertFails(setDoc(doc(fs('col2'), 'rescisoes_efetivacao/f3_2026-10-20'), ef('col2', { fichaId: 'f3' })));
    await assertFails(deleteDoc(doc(fs('col'), 'rescisoes_efetivacao/f1_2026-10-20')));
    await assertFails(deleteDoc(doc(fs('ges'), 'rescisoes_efetivacao/f1_2026-10-20')));
  });
  it('formato: id = ficha_data, passos conhecidos, autor, empresa não muda', async () => {
    await assertFails(setDoc(doc(fs('col'), 'rescisoes_efetivacao/outro'), ef('col')));
    await assertFails(setDoc(doc(fs('col'), 'rescisoes_efetivacao/f1_2026-10-20'), ef('col', { passos: { xpto: passo } })));
    await assertFails(setDoc(doc(fs('col'), 'rescisoes_efetivacao/f1_2026-10-20'), ef('outro')));
    await assertFails(setDoc(doc(fs('ges'), 'rescisoes_efetivacao/f1_2026-10-20'), ef('ges', { empresaId: 'B' })));
    await assertFails(setDoc(doc(fs('col'), 'rescisoes_efetivacao/f1_2026-10-20'), ef('col', { extra: 1 })));
  });
});
