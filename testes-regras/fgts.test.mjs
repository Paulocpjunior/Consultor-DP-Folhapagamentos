import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
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
    await setDoc(doc(db, 'empresas/A'), { cnpj: '29463877000109', codigoSage: '1', razaoSocial: 'A', nomeFantasia: 'A', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const reg = { empresaId: 'A', competencia: '2026-09', funcionarioNome: 'TOTAL EMPRESA (SERPRO)', funcionarioCpf: '', valorDevido: 2400, valorRecolhido: 0, status: 'atrasado', dataVencimento: '2026-10-20', consultadoEm: '2026-10-25' };

describe('consulta de FGTS', () => {
  it('quem tem a empresa na carteira grava a procuração do FGTS Digital, não os dados cadastrais', async () => {
    await assertSucceeds(updateDoc(doc(fs('col'), 'empresas/A'), { procuracaoFgts: { perfil: 'consulta', validaAte: '2027-10-01', observacao: '' } }));
    await assertFails(updateDoc(doc(fs('col'), 'empresas/A'), { razaoSocial: 'OUTRA' }));
    await assertFails(updateDoc(doc(fs('col2'), 'empresas/A'), { procuracaoFgts: { perfil: 'consulta', validaAte: '2027-10-01' } }));
  });
  it('o aviso do SERPRO por empresa e mês: cria e atualiza no mesmo id', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_fgts/serpro_A_2026-09'), reg));
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_fgts/serpro_A_2026-09'), { ...reg, status: 'em_dia', valorRecolhido: 2400 }));
    await assertFails(setDoc(doc(fs('col2'), 'esocial_fgts/serpro_A_2026-10'), { ...reg, competencia: '2026-10' }));
  });
});
