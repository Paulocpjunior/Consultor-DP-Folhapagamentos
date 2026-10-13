import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc, updateDoc, deleteDoc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';

// Marca do vigia da Saúde do eSocial (services/esocial/vigiaFechamento.ts): uma consulta por dia, empresa e competência.
let env;
const A = 'AAAAAAAAAAAAAAAAAAAA';
const B = 'BBBBBBBBBBBBBBBBBBBB';
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['col', 'colaborador'], ['col2', 'colaborador'], ['col3', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    for (const e of [A, B]) await setDoc(doc(db, `empresas/${e}`), { cnpj: '11222333000181', criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: [A], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col3'), { uid: 'col3', empresaIds: [A], atualizadoPor: 'ges' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const ID = `${A}_2026-09`;
const marca = (u, extra = {}) => ({ empresaId: A, competencia: '2026-09', dia: '2026-10-13', estado: 'rodando', tentativas: 1, tentativaEm: serverTimestamp(), por: u, porEmail: `${u}@x`, ...extra });
const antes = min => Timestamp.fromMillis(Date.now() - min * 60_000);
const gravarSemRegra = dados => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), `esocial_vigia_fechamento/${ID}`), dados));

describe('esocial_vigia_fechamento', () => {
  it('toma a marca na empresa da carteira; fora dela, não; lê mesmo antes de existir', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`)));
    await assertFails(getDoc(doc(fs('col'), `esocial_vigia_fechamento/${B}_2026-09`)));
    await assertFails(setDoc(doc(fs('col2'), `esocial_vigia_fechamento/${ID}`), marca('col2')));
    await assertFails(setDoc(doc(fs('col'), `esocial_vigia_fechamento/${B}_2026-09`), marca('col', { empresaId: B })));
    await assertFails(setDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`), marca('outro')));
    await assertFails(setDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`), marca('col', { competencia: '2026-08' }))); // id não confere
    await assertFails(setDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`), marca('col', { tentativaEm: Timestamp.now() }))); // hora do servidor
    await assertFails(setDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`), marca('col', { recibos: ['x'] }))); // campo fora da lista
    await assertSucceeds(setDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`), marca('col')));
    await assertSucceeds(getDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`)));
    await assertFails(getDoc(doc(fs('col2'), `esocial_vigia_fechamento/${ID}`)));
  });

  it('enquanto um consulta, ninguém toma a marca; só ele conclui; feito no dia não é tomado de novo', async () => {
    await gravarSemRegra(marca('col', { tentativaEm: antes(1) }));
    await assertFails(setDoc(doc(fs('col3'), `esocial_vigia_fechamento/${ID}`), marca('col3', { tentativas: 2 })));
    await assertFails(updateDoc(doc(fs('col3'), `esocial_vigia_fechamento/${ID}`), { estado: 'feito', por: 'col3' }));
    await assertFails(updateDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`), { estado: 'feito', tentativas: 3 }));
    await assertSucceeds(updateDoc(doc(fs('col'), `esocial_vigia_fechamento/${ID}`), { estado: 'feito', importados: 1, motivo: '', concluidoEm: serverTimestamp() }));
    await assertFails(setDoc(doc(fs('col3'), `esocial_vigia_fechamento/${ID}`), marca('col3', { tentativas: 2 })));
    await assertFails(setDoc(doc(fs('col3'), `esocial_vigia_fechamento/${ID}`), marca('col3', { tentativas: 1 })));
    await assertSucceeds(setDoc(doc(fs('col3'), `esocial_vigia_fechamento/${ID}`), marca('col3', { dia: '2026-10-14' }))); // dia seguinte
    await assertFails(deleteDoc(doc(fs('ges'), `esocial_vigia_fechamento/${ID}`)));
  });

  it('depois de falha ou de "rodando" abandonado, tenta de novo contando a tentativa', async () => {
    await gravarSemRegra(marca('col', { estado: 'falhou', tentativaEm: antes(61) }));
    await assertFails(setDoc(doc(fs('col3'), `esocial_vigia_fechamento/${ID}`), marca('col3', { tentativas: 1 })));
    await assertSucceeds(setDoc(doc(fs('col3'), `esocial_vigia_fechamento/${ID}`), marca('col3', { tentativas: 2 })));
    await gravarSemRegra(marca('col', { tentativaEm: antes(11) }));
    await assertSucceeds(setDoc(doc(fs('col3'), `esocial_vigia_fechamento/${ID}`), marca('col3', { tentativas: 2 })));
  });

  it('duas abas ao mesmo tempo: a transação deixa só uma tomar a marca', async () => {
    const tomar = u => { const db = fs(u); return runTransaction(db, async tx => {
      const ref = doc(db, `esocial_vigia_fechamento/${ID}`);
      const s = await tx.get(ref);
      if (s.exists() && s.data().dia === '2026-10-13') return false;
      tx.set(ref, marca(u));
      return true;
    }).catch(() => false); };
    const r = await Promise.all([tomar('col'), tomar('col3')]);
    expect(r.filter(Boolean)).toHaveLength(1);
  });
});
