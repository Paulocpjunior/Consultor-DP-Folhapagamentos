import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-obr', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['col2', 'colaborador'], ['pen', 'pendente']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    for (const e of ['A', 'B']) await setDoc(doc(db, `empresas/${e}`), { cnpj: e, criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/pen'), { uid: 'pen', empresaIds: ['A'], atualizadoPor: 'ges' });
    for (const e of ['A', 'B']) await setDoc(doc(db, `obrigacoes_status/${e}_fgts-2026-09`), { empresaId: e, obrigacao: 'fgts-2026-09', competencia: '2026-09', status: 'entregue', atualizadoPor: 'ges' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const m = (e, ob, u, extra = {}) => ({ empresaId: e, obrigacao: ob, competencia: '2026-09', nome: 'x', status: 'entregue', atualizadoPor: u, atualizadoEm: serverTimestamp(), ...extra });

describe('obrigacoes_status', () => {
  it('lê só da carteira (consulta por empresa e competência)', async () => {
    await assertSucceeds(getDocs(query(collection(fs('col'), 'obrigacoes_status'), where('empresaId', '==', 'A'), where('competencia', '==', '2026-09'))));
    await assertFails(getDocs(query(collection(fs('col'), 'obrigacoes_status'), where('empresaId', '==', 'B'), where('competencia', '==', '2026-09'))));
    await assertFails(getDocs(query(collection(fs('col'), 'obrigacoes_status'), where('competencia', '==', '2026-09'))));
    await assertFails(getDoc(doc(fs('col2'), 'obrigacoes_status/A_fgts-2026-09')));
    await assertFails(getDoc(doc(fs('pen'), 'obrigacoes_status/A_fgts-2026-09')));
    await assertSucceeds(getDocs(query(collection(fs('ges'), 'obrigacoes_status'), where('empresaId', '==', 'B'), where('competencia', '==', '2026-09'))));
  });
  it('marca na empresa da carteira, com autor, status e id certos', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'obrigacoes_status/A_darf-2026-09'), m('A', 'darf-2026-09', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'obrigacoes_status/A_s1299-anual-2026'), m('A', 's1299-anual-2026', 'col', { competencia: '2026-12' })));
    await assertSucceeds(setDoc(doc(fs('col'), 'obrigacoes_status/A_guia-11222333000181-2026-09'), m('A', 'guia-11222333000181-2026-09', 'col', { status: 'nao-se-aplica', observacao: 'sem associados' })));
    await assertFails(setDoc(doc(fs('col'), 'obrigacoes_status/B_darf-2026-09'), m('B', 'darf-2026-09', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'obrigacoes_status/A_darf-2026-09'), m('A', 'darf-2026-09', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'obrigacoes_status/A_darf-2026-09'), m('A', 'darf-2026-09', 'col', { status: 'pago' })));
    await assertFails(setDoc(doc(fs('col'), 'obrigacoes_status/A_darf-2026-09'), m('A', 'fgts-2026-09', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'obrigacoes_status/A_darf-2026-09'), m('A', 'darf-2026-09', 'col', { competencia: '2026-13' })));
    await assertFails(setDoc(doc(fs('pen'), 'obrigacoes_status/A_darf-2026-09'), m('A', 'darf-2026-09', 'pen')));
    await assertFails(updateDoc(doc(fs('col'), 'obrigacoes_status/A_fgts-2026-09'), { empresaId: 'B', atualizadoPor: 'col' }));
    await assertSucceeds(updateDoc(doc(fs('col'), 'obrigacoes_status/A_fgts-2026-09'), { status: 'nao-se-aplica', atualizadoPor: 'col' }));
  });
  it('desfazer: quem trabalha na empresa', async () => {
    await assertFails(deleteDoc(doc(fs('col'), 'obrigacoes_status/B_fgts-2026-09')));
    await assertFails(deleteDoc(doc(fs('col2'), 'obrigacoes_status/A_fgts-2026-09')));
    await assertSucceeds(deleteDoc(doc(fs('col'), 'obrigacoes_status/A_fgts-2026-09')));
    await assertSucceeds(deleteDoc(doc(fs('ges'), 'obrigacoes_status/B_fgts-2026-09')));
  });
});
