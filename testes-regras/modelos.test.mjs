import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, where } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-folha', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['col', 'colaborador'], ['col2', 'colaborador'], ['pen', 'pendente']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    await setDoc(doc(db, 'empresas/A'), { cnpj: 'A', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'modelos_documentos/esc'), modelo('', 'ges'));
    await setDoc(doc(db, 'modelos_documentos/daA'), modelo('A', 'col'));
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const modelo = (empresaId, u, extra = {}) => ({ titulo: 'Contrato', categoria: 'contrato', corpo: '# X\n\n{{funcionario.nome}}', empresaId, origem: 'consultor', atualizadoPor: u, atualizadoPorEmail: `${u}@x`, ...extra });

describe('modelos_documentos', () => {
  it('do escritório: aprovados leem, gestor e admin gravam', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), 'modelos_documentos/esc')));
    await assertSucceeds(getDocs(query(collection(fs('col2'), 'modelos_documentos'), where('empresaId', '==', ''))));
    await assertFails(getDoc(doc(fs('pen'), 'modelos_documentos/esc')));
    await assertSucceeds(setDoc(doc(fs('adm'), 'modelos_documentos/novo'), modelo('', 'adm')));
    await assertFails(setDoc(doc(fs('col'), 'modelos_documentos/novo2'), modelo('', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'modelos_documentos/esc'), modelo('', 'col')));
    await assertFails(deleteDoc(doc(fs('col'), 'modelos_documentos/esc')));
    await assertSucceeds(deleteDoc(doc(fs('ges'), 'modelos_documentos/esc')));
  });
  it('da empresa: quem pode na empresa; não troca o dono', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), 'modelos_documentos/daA')));
    await assertFails(getDoc(doc(fs('col2'), 'modelos_documentos/daA')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'modelos_documentos'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'modelos_documentos'), where('empresaId', '==', 'A'))));
    await assertSucceeds(setDoc(doc(fs('col'), 'modelos_documentos/daA'), modelo('A', 'col', { titulo: 'Novo título' })));
    await assertFails(setDoc(doc(fs('col2'), 'modelos_documentos/outro'), modelo('A', 'col2')));
    await assertFails(setDoc(doc(fs('ges'), 'modelos_documentos/daA'), modelo('', 'ges')));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'modelos_documentos/daA')));
  });
  it('formato: autor, categoria, origem, campos e tamanho', async () => {
    await assertFails(setDoc(doc(fs('col'), 'modelos_documentos/x'), modelo('A', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'modelos_documentos/x'), modelo('A', 'col', { categoria: 'xpto' })));
    await assertFails(setDoc(doc(fs('col'), 'modelos_documentos/x'), modelo('A', 'col', { origem: 'xpto' })));
    await assertFails(setDoc(doc(fs('col'), 'modelos_documentos/x'), modelo('A', 'col', { titulo: '' })));
    await assertFails(setDoc(doc(fs('col'), 'modelos_documentos/x'), modelo('A', 'col', { extra: 1 })));
    await assertFails(setDoc(doc(fs('col'), 'modelos_documentos/x'), modelo('A', 'col', { corpo: 'x'.repeat(200001) })));
  });
});
