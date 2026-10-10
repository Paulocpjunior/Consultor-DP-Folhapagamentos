import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['col', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const sha = 'ab'.repeat(32);
const r = (u, extra = {}) => ({ sha256: sha, arquivo: 'folha.backup', tamanho: 1000, dataBackup: '2026-10-06', empresas: ['1200'], localGuarda: 'UNAS Pro 4', observacao: '', registradoPor: u, registradoPorEmail: 'x@y', registradoEm: serverTimestamp(), ...extra });

describe('backups_guarda', () => {
  it('só o gestor registra, com id = sha256 e campos válidos', async () => {
    await assertFails(setDoc(doc(fs('adm'), `backups_guarda/${sha}`), r('adm')));
    await assertFails(setDoc(doc(fs('col'), `backups_guarda/${sha}`), r('col')));
    await assertFails(setDoc(doc(fs('ges'), `backups_guarda/${'cd'.repeat(32)}`), r('ges')));
    await assertFails(setDoc(doc(fs('ges'), `backups_guarda/${sha}`), r('outro')));
    await assertFails(setDoc(doc(fs('ges'), `backups_guarda/${sha}`), r('ges', { localGuarda: '' })));
    await assertFails(setDoc(doc(fs('ges'), `backups_guarda/${sha}`), r('ges', { conteudo: 'x' })));
    await assertFails(setDoc(doc(fs('ges'), 'backups_guarda/naohex'), r('ges', { sha256: 'naohex' })));
    await assertSucceeds(setDoc(doc(fs('ges'), `backups_guarda/${sha}`), r('ges')));
  });
  it('ninguém altera nem apaga; admin e gestor leem; colaborador não', async () => {
    await env.withSecurityRulesDisabled(async c => setDoc(doc(c.firestore(), `backups_guarda/${sha}`), r('ges')));
    await assertFails(setDoc(doc(fs('ges'), `backups_guarda/${sha}`), r('ges', { arquivo: 'trocado' })));
    await assertFails(updateDoc(doc(fs('ges'), `backups_guarda/${sha}`), { localGuarda: 'outro' }));
    await assertFails(deleteDoc(doc(fs('ges'), `backups_guarda/${sha}`)));
    await assertSucceeds(getDocs(collection(fs('adm'), 'backups_guarda')));
    await assertSucceeds(getDoc(doc(fs('ges'), `backups_guarda/${sha}`)));
    await assertFails(getDocs(collection(fs('col'), 'backups_guarda')));
  });
});
