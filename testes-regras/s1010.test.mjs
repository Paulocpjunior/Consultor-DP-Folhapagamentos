import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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
    await setDoc(doc(db, 'esocial_s1010/A_p1'), ped('col'));
    await setDoc(doc(db, 'esocial_s1010/A_ok'), ped('col', { situacao: 'aplicado', recibo: '1.2.3' }));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const dados = { dscRubr: 'Horas extras 50%', natRubr: '1003', tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' };
const ped = (u, extra = {}) => ({
  empresaId: 'A', acao: 'inclusao', codRubr: 'CDPHE50', ideTabRubr: 'T1', iniValid: '2026-10', fimValid: '', novaIniValid: '', novaFimValid: '',
  dados, chaveVerba: 'HE50', situacao: 'rascunho', recibo: '', criadoPor: u, criadoPorEmail: `${u}@x`, atualizadoPor: u, atualizadoEm: serverTimestamp(), ...extra,
});

describe('esocial_s1010', () => {
  it('quem pode na empresa lê, cria e edita o rascunho; outro não; nada se apaga', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), 'esocial_s1010/A_p1')));
    await assertFails(getDoc(doc(fs('col2'), 'esocial_s1010/A_p1')));
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_s1010/A_p2'), ped('col')));
    await assertFails(setDoc(doc(fs('col2'), 'esocial_s1010/A_p3'), ped('col2')));
    await assertSucceeds(updateDoc(doc(fs('col'), 'esocial_s1010/A_p1'), { codRubr: 'CDPHE60', atualizadoPor: 'col' }));
    await assertSucceeds(updateDoc(doc(fs('ges'), 'esocial_s1010/A_p1'), { situacao: 'aplicado', recibo: '1.2.3', atualizadoPor: 'ges' }));
    await assertFails(deleteDoc(doc(fs('col'), 'esocial_s1010/A_p1')));
    await assertFails(deleteDoc(doc(fs('ges'), 'esocial_s1010/A_ok')));
  });
  it('aplicado e descartado são finais; empresa e autor não mudam', async () => {
    await assertFails(updateDoc(doc(fs('col'), 'esocial_s1010/A_ok'), { situacao: 'rascunho', atualizadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('ges'), 'esocial_s1010/A_p1'), { empresaId: 'B', atualizadoPor: 'ges' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_s1010/A_p1'), { criadoPor: 'outro', atualizadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_s1010/A_p1'), { codIncCP: '11', atualizadoPor: 'outro' }));
  });
  it('formato: id da empresa, operação, rubrica, validade e situação inicial', async () => {
    await assertFails(setDoc(doc(fs('col'), 'esocial_s1010/B_p9'), ped('col')));
    await assertFails(setDoc(doc(fs('col'), 'esocial_s1010/semEmpresa'), ped('col')));
    await assertFails(setDoc(doc(fs('col'), 'esocial_s1010/A_p9'), ped('col', { acao: 'apagar' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_s1010/A_p9'), ped('col', { codRubr: '' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_s1010/A_p9'), ped('col', { ideTabRubr: 'TABELA123' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_s1010/A_p9'), ped('col', { iniValid: '2026-13' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_s1010/A_p9'), ped('col', { situacao: 'aplicado' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_s1010/A_p9'), ped('outro')));
  });
});
