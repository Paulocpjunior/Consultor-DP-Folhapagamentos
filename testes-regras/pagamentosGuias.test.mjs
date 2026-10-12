import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-guias', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    for (const e of ['A', 'B']) await setDoc(doc(db, `empresas/${e}`), { cnpj: e, criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'fechamentos/A_2026-09'), { empresaId: 'A', competencia: '2026-09', situacao: 'encerrado', encerradoPor: 'col', checklist: {} });
    await setDoc(doc(db, 'pagamentos_guias/A_fgts-2026-08'), { empresaId: 'A', obrigacao: 'fgts-2026-08', competencia: '2026-08', valorDevido: 0, numeroDocumento: '', pagamento: null, atualizadoPor: 'ges' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const g = (e, ob, u, extra = {}) => ({ empresaId: e, obrigacao: ob, competencia: '2026-09', nome: 'DARF', vencimento: '2026-10-20', valorDevido: 123456, numeroDocumento: '07.01.26283.1234567-8', atualizadoPor: u, atualizadoEm: serverTimestamp(), ...extra });
const pg = (extra = {}) => ({ data: '2026-10-19', valorPago: 123456, autenticacao: 'A1B2', fonte: 'manual', ...extra });

describe('pagamentos_guias', () => {
  it('registra e dá baixa na guia da carteira, mesmo com a competência encerrada, com a marcação do calendário no mesmo lote', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'col')));
    const db = fs('col');
    const lote = writeBatch(db);
    lote.set(doc(db, 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'col', { pagamento: pg() }), { merge: true });
    lote.set(doc(db, 'obrigacoes_status/A_darf-2026-09'), { empresaId: 'A', obrigacao: 'darf-2026-09', competencia: '2026-09', nome: 'DARF', status: 'entregue', observacao: 'paga', atualizadoPor: 'col', atualizadoEm: serverTimestamp() });
    await assertSucceeds(lote.commit());
    await assertSucceeds(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'col', { pagamento: null })));
    await assertSucceeds(setDoc(doc(fs('col'), 'pagamentos_guias/A_guia-11222333000181-2026-09'), g('A', 'guia-11222333000181-2026-09', 'col', { valorDevido: 0, numeroDocumento: '' })));
    await assertSucceeds(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-13-2026'), g('A', 'darf-13-2026', 'col', { competencia: '2026-12', pagamento: pg({ fonte: 'fgts-digital' }) })));
    await assertSucceeds(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-13-2026'), g('A', 'darf-13-2026', 'col', { competencia: '2026-12', pagamento: pg({ fonte: 'receita' }) })));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-13-2026'), g('A', 'darf-13-2026', 'col', { competencia: '2026-12', pagamento: pg({ fonte: 'banco' }) })));
  });
  it('recusa outra empresa, autor errado, obrigação que não é guia, id errado e baixa inválida; não apaga', async () => {
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/B_darf-2026-09'), g('B', 'darf-2026-09', 'col')));
    await assertFails(setDoc(doc(fs('col2'), 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'col2')));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/A_dctfweb-2026-09'), g('A', 'dctfweb-2026-09', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/A_fgts-2026-09'), g('A', 'darf-2026-09', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'col', { valorDevido: 12.5 })));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'col', { pagamento: pg({ valorPago: 0 }) })));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'col', { pagamento: pg({ data: '19/10/2026' }) })));
    await assertFails(setDoc(doc(fs('col'), 'pagamentos_guias/A_darf-2026-09'), g('A', 'darf-2026-09', 'col', { pagamento: pg({ fonte: 'banco' }) })));
    await assertFails(deleteDoc(doc(fs('ges'), 'pagamentos_guias/A_fgts-2026-08')));
  });
  it('lê e lista só quem pode na empresa', async () => {
    await assertSucceeds(getDocs(query(collection(fs('col'), 'pagamentos_guias'), where('empresaId', '==', 'A'), where('competencia', '==', '2026-08'))));
    await assertFails(getDocs(query(collection(fs('col2'), 'pagamentos_guias'), where('empresaId', '==', 'A'), where('competencia', '==', '2026-08'))));
    await assertFails(getDoc(doc(fs('col2'), 'pagamentos_guias/A_fgts-2026-08')));
    await assertSucceeds(getDoc(doc(fs('ges'), 'pagamentos_guias/A_fgts-2026-08')));
  });
});
