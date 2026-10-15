import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
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
    await setDoc(doc(db, `envios_funcionario/${ID}`), env1('col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const ID = 'A_2026-10_holerite_f1';
const canal = { ok: true, destino: 'b***@x.com', em: '2026-10-12T10:00:00Z', porEmail: 'col@x' };
const env1 = (u, extra = {}) => ({ empresaId: 'A', fichaId: 'f1', competencia: '2026-10', tipo: 'holerite', canais: { email: canal }, atualizadoPor: u, atualizadoEm: serverTimestamp(), ...extra });

describe('envios_funcionario', () => {
  it('quem pode na empresa lê, lista e grava; outro não; nada se apaga', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), `envios_funcionario/${ID}`)));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'envios_funcionario'), where('empresaId', '==', 'A'), where('competencia', '==', '2026-10'), where('tipo', '==', 'holerite'))));
    await assertFails(getDoc(doc(fs('col2'), `envios_funcionario/${ID}`)));
    await assertSucceeds(setDoc(doc(fs('col'), `envios_funcionario/${ID}`), { canais: { whatsapp: { ...canal, destino: '(**) *****-7777' } }, atualizadoPor: 'col', atualizadoEm: serverTimestamp(), empresaId: 'A', fichaId: 'f1', competencia: '2026-10', tipo: 'holerite' }, { merge: true }));
    await assertSucceeds(setDoc(doc(fs('col'), 'envios_funcionario/A_2026-10_aniversario_f2'), env1('col', { fichaId: 'f2', tipo: 'aniversario', canais: { email: { ...canal, ok: false, erro: 'caixa cheia' } } })));
    await assertFails(setDoc(doc(fs('col2'), 'envios_funcionario/A_2026-10_holerite_f3'), env1('col2', { fichaId: 'f3' })));
    await assertFails(deleteDoc(doc(fs('col'), `envios_funcionario/${ID}`)));
    await assertFails(deleteDoc(doc(fs('ges'), `envios_funcionario/${ID}`)));
  });
  it('formato: id, tipo, canais conhecidos, autor, empresa não muda', async () => {
    await assertFails(setDoc(doc(fs('col'), 'envios_funcionario/outro'), env1('col')));
    await assertFails(setDoc(doc(fs('col'), 'envios_funcionario/A_2026-10_ferias_f1'), env1('col', { tipo: 'ferias' })));
    // Holerite por e-mail por tipo (férias, 13º, adiantamento, rescisão).
    await assertSucceeds(setDoc(doc(fs('col'), 'envios_funcionario/A_2026-10_holerite-ferias_f1'), env1('col', { tipo: 'holerite-ferias' })));
    await assertSucceeds(setDoc(doc(fs('col'), 'envios_funcionario/A_2026-10_holerite-13-2a_f1'), env1('col', { tipo: 'holerite-13-2a' })));
    await assertFails(setDoc(doc(fs('col'), 'envios_funcionario/A_2026-10_holerite-plr_f1'), env1('col', { tipo: 'holerite-plr' })));
    await assertFails(setDoc(doc(fs('col'), `envios_funcionario/${ID}`), env1('col', { canais: { sms: canal } })));
    await assertFails(setDoc(doc(fs('col'), `envios_funcionario/${ID}`), env1('col', { canais: { email: { ...canal, cpf: '1' } } })));
    await assertFails(setDoc(doc(fs('col'), `envios_funcionario/${ID}`), env1('outro')));
    await assertFails(setDoc(doc(fs('ges'), `envios_funcionario/${ID}`), env1('ges', { empresaId: 'B' })));
    await assertFails(setDoc(doc(fs('col'), `envios_funcionario/${ID}`), env1('col', { extra: 1 })));
  });
});
