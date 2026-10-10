import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await setDoc(doc(db, 'users/ges'), { uid: 'ges', role: 'gestor' });
    // Antiga, gravada fora do formato: código sem zeros e CNPJ com pontuação.
    await setDoc(doc(db, 'empresas/V'), { cnpj: '17.660.729/0001-97', razaoSocial: 'V', nomeFantasia: 'V', codigoSage: '93', criadoPor: 'outro' });
  });
});
afterAll(async () => env?.cleanup());
const chave = (k, id) => ({ chave: k, empresaId: id, criadoPor: 'ges', criadoEm: serverTimestamp() });

describe('proteger empresa antiga fora do formato', () => {
  it('só a chave, sem normalizar: recusa (era o "Missing or insufficient permissions")', async () => {
    await assertFails(setDoc(doc(env.authenticatedContext('ges').firestore(), 'empresas_unicos/sage_0093'), chave('sage_0093', 'V')));
  });
  it('normaliza o cadastro e reserva as chaves no mesmo lote: aceita', async () => {
    const db = env.authenticatedContext('ges').firestore();
    const b = writeBatch(db);
    b.set(doc(db, 'empresas_unicos/sage_0093'), chave('sage_0093', 'V'));
    b.set(doc(db, 'empresas_unicos/cnpj_17660729000197'), chave('cnpj_17660729000197', 'V'));
    b.update(doc(db, 'empresas/V'), { codigoSage: '0093', cnpj: '17660729000197', atualizadoEm: serverTimestamp() });
    await assertSucceeds(b.commit());
  });
});
