import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadString, getBytes, deleteObject } from 'firebase/storage';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dp',
    firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});
const S = '11222333000181';
const conv = (u, extra = {}) => ({ sindicatoCnpj: S, vigenciaInicio: '2026-05-01', vigenciaFim: '2027-04-30', tipo: 'CCT', pisos: [], atualizadoPor: u, atualizadoEm: serverTimestamp(), ...extra });
const check = (u, extra = {}) => ({ empresaId: 'A', convencaoId: `${S}_2026-05-01`, itens: { o1: { cumprido: true, obs: '', porEmail: 'x', em: 'y' } }, atualizadoPor: u, atualizadoEm: serverTimestamp(), ...extra });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['adm', 'admin'], ['col', 'colaborador'], ['col2', 'colaborador'], ['pen', 'pendente']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'empresas/A'), { cnpj: 'A', criadoPor: 'adm' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'adm' });
    await setDoc(doc(db, `convencoes_coletivas/${S}_2026-05-01`), conv('col'));
    await setDoc(doc(db, `convencao_checklist/A_${S}_2026-05-01`), check('col'));
    await uploadString(ref(c.storage(), `convencoes/${S}/2026-05-01-1.pdf`), 'x', 'raw', { contentType: 'application/pdf' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const st = u => env.authenticatedContext(u).storage();

describe('convenções coletivas', () => {
  it('aprovado lê, cadastra e corrige; pendente não; apagar só o admin', async () => {
    await assertSucceeds(getDoc(doc(fs('col2'), `convencoes_coletivas/${S}_2026-05-01`)));
    await assertFails(getDoc(doc(fs('pen'), `convencoes_coletivas/${S}_2026-05-01`)));
    await assertSucceeds(setDoc(doc(fs('col2'), `convencoes_coletivas/${S}_2027-05-01`), conv('col2', { vigenciaInicio: '2027-05-01', vigenciaFim: '2028-04-30' })));
    await assertSucceeds(setDoc(doc(fs('col'), `convencoes_coletivas/${S}_2026-05-01`), conv('col', { pisos: [{ descricao: 'Geral', cbo: '', valor: 200000 }] })));
    await assertFails(setDoc(doc(fs('pen'), `convencoes_coletivas/${S}_2028-05-01`), conv('pen', { vigenciaInicio: '2028-05-01' })));
    await assertFails(deleteDoc(doc(fs('col'), `convencoes_coletivas/${S}_2026-05-01`)));
    await assertSucceeds(deleteDoc(doc(fs('adm'), `convencoes_coletivas/${S}_2026-05-01`)));
  });
  it('formato: id do sindicato e da vigência, datas e autor', async () => {
    await assertFails(setDoc(doc(fs('col'), `convencoes_coletivas/outro`), conv('col')));
    await assertFails(setDoc(doc(fs('col'), `convencoes_coletivas/123_2026-05-01`), conv('col', { sindicatoCnpj: '123' })));
    await assertFails(setDoc(doc(fs('col'), `convencoes_coletivas/${S}_2026-05-01`), conv('col', { vigenciaFim: '30/04/2027' })));
    await assertFails(setDoc(doc(fs('col'), `convencoes_coletivas/${S}_2026-05-01`), conv('outro')));
  });
  it('checklist: quem pode na empresa marca; outra pessoa não; nada se apaga', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), `convencao_checklist/A_${S}_2026-05-01`)));
    await assertFails(getDoc(doc(fs('col2'), `convencao_checklist/A_${S}_2026-05-01`)));
    await assertSucceeds(setDoc(doc(fs('col'), `convencao_checklist/A_${S}_2026-05-01`), check('col', { itens: {} })));
    await assertFails(setDoc(doc(fs('col2'), `convencao_checklist/A_${S}_2026-05-01`), check('col2')));
    await assertFails(setDoc(doc(fs('col'), `convencao_checklist/A_errado`), check('col')));
    await assertFails(deleteDoc(doc(fs('col'), `convencao_checklist/A_${S}_2026-05-01`)));
  });
  it('PDF no Storage: aprovado lê e envia PDF; não sobrescreve nem apaga; outro tipo não', async () => {
    await assertSucceeds(getBytes(ref(st('col2'), `convencoes/${S}/2026-05-01-1.pdf`)));
    await assertFails(getBytes(ref(st('pen'), `convencoes/${S}/2026-05-01-1.pdf`)));
    await assertSucceeds(uploadString(ref(st('col'), `convencoes/${S}/2026-05-01-2.pdf`), 'x', 'raw', { contentType: 'application/pdf' }));
    await assertFails(uploadString(ref(st('col'), `convencoes/${S}/2026-05-01-1.pdf`), 'y', 'raw', { contentType: 'application/pdf' }));
    await assertFails(uploadString(ref(st('col'), `convencoes/${S}/a.exe`), 'x', 'raw', { contentType: 'application/octet-stream' }));
    await assertFails(uploadString(ref(st('col'), `convencoes/123/a.pdf`), 'x', 'raw', { contentType: 'application/pdf' }));
    await assertFails(deleteObject(ref(st('col'), `convencoes/${S}/2026-05-01-1.pdf`)));
    await assertFails(uploadString(ref(st('pen'), `convencoes/${S}/x.pdf`), 'x', 'raw', { contentType: 'application/pdf' }));
  });
});
