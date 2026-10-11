import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, where } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-processos', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'empresas/A'), { cnpj: 'A', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'fechamentos/A_2026-08'), { empresaId: 'A', competencia: '2026-08', situacao: 'encerrado', encerradoPor: 'col', checklist: {} });
    await setDoc(doc(db, 'processos_gravados/A_ferias_2026-08'), { empresaId: 'A', tipo: 'ferias', competencia: '2026-08', ano: '2026', gravadoPor: 'col' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const proc = (tipo, comp, u, extra = {}) => ({ empresaId: 'A', tipo, competencia: comp, ano: comp.slice(0, 4), gravadoPor: u, totais: {}, ...extra });
const hol = comp => ({ empresaId: 'A', competencia: comp, fichaId: 'A_111_M1', resultado: { totais: { liquido: 2 } } });

describe('processos_gravados', () => {
  it('grava férias, 13º e rescisão da competência aberta, de quem trabalha na empresa e com autor', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'processos_gravados/A_13-1a_2026-11'), proc('13-1a', '2026-11', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'processos_gravados/A_rescisao_2026-09'), proc('rescisao', '2026-09', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'processos_gravados/A_ferias_2026-09/holerites/A_111_M1_2026-09-01'), hol('2026-09')));
    await assertFails(setDoc(doc(fs('col'), 'processos_gravados/A_mensal_2026-09'), proc('mensal', '2026-09', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'processos_gravados/A_ferias_2026-09'), proc('ferias', '2026-09', 'col', { ano: '2025' })));
    await assertFails(setDoc(doc(fs('col'), 'processos_gravados/A_ferias_2026-09'), proc('ferias', '2026-09', 'outro')));
    await assertFails(setDoc(doc(fs('col2'), 'processos_gravados/A_ferias_2026-09'), proc('ferias', '2026-09', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'processos_gravados/A_ferias_2026-09/holerites/B_111_M1'), { ...hol('2026-09'), fichaId: 'B_111_M1' }));
    await assertFails(setDoc(doc(fs('col'), 'processos_gravados/A_ferias_2026-09/holerites/A_111_M1'), hol('2026-10')));
  });
  it('competência encerrada não muda nem sai; lê e lista quem pode na empresa', async () => {
    await assertFails(setDoc(doc(fs('ges'), 'processos_gravados/A_ferias_2026-08'), proc('ferias', '2026-08', 'ges')));
    await assertFails(deleteDoc(doc(fs('ges'), 'processos_gravados/A_ferias_2026-08')));
    await assertFails(setDoc(doc(fs('col'), 'processos_gravados/A_ferias_2026-08/holerites/A_111_M1'), hol('2026-08')));
    await assertSucceeds(getDoc(doc(fs('col'), 'processos_gravados/A_ferias_2026-08')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'processos_gravados'), where('empresaId', '==', 'A'), where('ano', '==', '2026'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'processos_gravados'), where('empresaId', '==', 'A'), where('ano', '==', '2026'))));
    await assertFails(getDoc(doc(fs('col2'), 'processos_gravados/A_ferias_2026-08')));
  });
});
