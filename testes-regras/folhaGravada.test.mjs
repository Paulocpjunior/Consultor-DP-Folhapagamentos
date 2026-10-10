import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'fechamentos/A_2026-08'), { empresaId: 'A', competencia: '2026-08', situacao: 'encerrado', encerradoPor: 'col', checklist: {} });
    await setDoc(doc(db, 'folhas_gravadas/A_2026-08'), { empresaId: 'A', competencia: '2026-08', gravadoPor: 'col' });
    await setDoc(doc(db, 'folhas_gravadas/A_2026-08/holerites/A_111_M1'), { empresaId: 'A', competencia: '2026-08', fichaId: 'A_111_M1', resultado: { totais: { liquido: 1 } } });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const resumo = (comp, u, extra = {}) => ({ empresaId: 'A', competencia: comp, pagamento: '2026-10', gravadoPor: u, ...extra });
const hol = comp => ({ empresaId: 'A', competencia: comp, fichaId: 'A_111_M1', resultado: { totais: { liquido: 2 } } });

describe('folhas_gravadas', () => {
  it('grava a folha da competência aberta, quem trabalha na empresa e com autor', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'folhas_gravadas/A_2026-09'), resumo('2026-09', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'folhas_gravadas/A_2026-09/holerites/A_111_M1'), hol('2026-09')));
    await assertFails(setDoc(doc(fs('col2'), 'folhas_gravadas/A_2026-09'), resumo('2026-09', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_gravadas/A_2026-09'), resumo('2026-09', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_gravadas/A_2026-07'), resumo('2026-09', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_gravadas/A_2026-09/holerites/B_111_M1'), { ...hol('2026-09'), fichaId: 'B_111_M1' }));
    await assertFails(setDoc(doc(fs('col'), 'folhas_gravadas/A_2026-09/holerites/A_111_M1'), hol('2026-10')));
  });
  it('competência encerrada: a folha gravada não muda nem sai, nem pelo gestor; lê quem pode na empresa', async () => {
    await assertFails(setDoc(doc(fs('ges'), 'folhas_gravadas/A_2026-08'), resumo('2026-08', 'ges')));
    await assertFails(setDoc(doc(fs('col'), 'folhas_gravadas/A_2026-08/holerites/A_111_M1'), hol('2026-08')));
    await assertFails(deleteDoc(doc(fs('ges'), 'folhas_gravadas/A_2026-08/holerites/A_111_M1')));
    await assertFails(deleteDoc(doc(fs('ges'), 'folhas_gravadas/A_2026-08')));
    await assertSucceeds(getDoc(doc(fs('col'), 'folhas_gravadas/A_2026-08')));
    await assertSucceeds(getDocs(collection(fs('col'), 'folhas_gravadas/A_2026-08/holerites')));
    await assertSucceeds(getDoc(doc(fs('col'), 'folhas_gravadas/A_2026-07')));
    await assertFails(getDoc(doc(fs('col2'), 'folhas_gravadas/A_2026-08')));
  });
});
