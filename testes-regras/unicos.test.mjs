import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    // A: protegida (com chaves); L1 e L2: antigas, repetindo o 0300 sem chave.
    await setDoc(doc(db, 'empresas/A'), { cnpj: '11222333000181', razaoSocial: 'A', nomeFantasia: 'A', codigoSage: '1200', criadoPor: 'col' });
    await setDoc(doc(db, 'empresas_unicos/sage_1200'), { chave: 'sage_1200', empresaId: 'A', criadoPor: 'col' });
    await setDoc(doc(db, 'empresas_unicos/cnpj_11222333000181'), { chave: 'cnpj_11222333000181', empresaId: 'A', criadoPor: 'col' });
    await setDoc(doc(db, 'empresas/L1'), { cnpj: '22333444000155', razaoSocial: 'L1', nomeFantasia: 'L1', codigoSage: '0300', criadoPor: 'col' });
    await setDoc(doc(db, 'empresas/L2'), { cnpj: '33444555000166', razaoSocial: 'L2', nomeFantasia: 'L2', codigoSage: '0300', criadoPor: 'col' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const emp = (cnpj, sage, u) => ({ cnpj, razaoSocial: 'X', nomeFantasia: 'X', codigoSage: sage, criadoPor: u, criadoEm: serverTimestamp() });
const chave = (k, id, u) => ({ chave: k, empresaId: id, criadoPor: u, criadoEm: serverTimestamp() });
function criar(db, id, cnpj, sage, u) {
  const b = writeBatch(db);
  b.set(doc(db, `empresas/${id}`), emp(cnpj, sage, u));
  b.set(doc(db, `empresas_unicos/sage_${sage}`), chave(`sage_${sage}`, id, u));
  b.set(doc(db, `empresas_unicos/cnpj_${cnpj}`), chave(`cnpj_${cnpj}`, id, u));
  return b.commit();
}

describe('código SAGE e CNPJ únicos', () => {
  it('cria empresa nova com as chaves no mesmo lote; sem chave, recusa', async () => {
    await assertSucceeds(criar(fs('col2'), 'NNNNNNNNNNNNNNNNNNN1', '44555666000177', '0500', 'col2'));
    await assertFails(setDoc(doc(fs('col2'), 'empresas/N2'), emp('55666777000188', '0600', 'col2')));
  });
  it('código SAGE ou CNPJ já reservados: recusa (mesmo fora da carteira)', async () => {
    await assertFails(criar(fs('col2'), 'D', '44555666000177', '1200', 'col2'));
    await assertFails(criar(fs('col2'), 'D', '11222333000181', '0700', 'col2'));
    await assertFails(setDoc(doc(fs('col2'), 'empresas_unicos/sage_1200'), chave('sage_1200', 'D', 'col2')));
  });
  it('trocar o código exige reservar o novo e libera o antigo; tomar o de outra recusa', async () => {
    const db = fs('col');
    const b = writeBatch(db);
    b.update(doc(db, 'empresas/A'), { codigoSage: '1201' });
    b.set(doc(db, 'empresas_unicos/sage_1201'), chave('sage_1201', 'A', 'col'));
    b.delete(doc(db, 'empresas_unicos/sage_1200'));
    await assertSucceeds(b.commit());
    await assertFails(updateDoc(doc(db, 'empresas/L1'), { codigoSage: '1201' }));
    await assertFails(updateDoc(doc(db, 'empresas/L1'), { codigoSage: '0999' }));
    await assertSucceeds(updateDoc(doc(db, 'empresas/L1'), { nomeFantasia: 'L1 novo' }));
  });
  it('chave não troca de dono nem é apagada enquanto a empresa usa', async () => {
    await assertFails(updateDoc(doc(fs('ges'), 'empresas_unicos/sage_1200'), { empresaId: 'L1' }));
    await assertFails(deleteDoc(doc(fs('ges'), 'empresas_unicos/sage_1200')));
  });
  it('empresas antigas: a primeira reserva o código repetido; a segunda fica de fora', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'empresas_unicos/sage_0300'), chave('sage_0300', 'L1', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'empresas_unicos/sage_0300'), chave('sage_0300', 'L2', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'empresas_unicos/sage_0999'), chave('sage_0999', 'L1', 'col')));
    await assertSucceeds(getDoc(doc(fs('col2'), 'empresas_unicos/sage_0300')));
  });
  it('excluir a empresa (gestor) libera as chaves no mesmo lote', async () => {
    const db = fs('ges');
    const b = writeBatch(db);
    b.delete(doc(db, 'empresas/A'));
    b.delete(doc(db, 'empresas_unicos/sage_1200'));
    b.delete(doc(db, 'empresas_unicos/cnpj_11222333000181'));
    await assertSucceeds(b.commit());
  });
});
