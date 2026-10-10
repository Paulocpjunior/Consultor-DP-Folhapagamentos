import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, addDoc, collection, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';

let env;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-dp-fim', firestore: { rules: readFileSync(process.env.REGRAS ?? new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
});
const MOV = (comp, extra = {}) => ({ empresaId: 'A', fichaId: 'A_111_M1', competencia: comp, movimento: {}, atualizadoPor: 'col', ...extra });
const AFA = (dt, extra = {}) => ({ empresaId: 'A', fichaId: 'A_111_M1', cpf: '111', dtInicio: dt, motivo: '01', atualizadoPor: 'col', ...extra });
const FECHA = (u, extra = {}) => ({ empresaId: 'A', competencia: '2026-09', situacao: 'encerrado', encerradoPor: u, encerradoEm: serverTimestamp(), checklist: { holerites: true }, ...extra });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    for (const [u, role] of [['ges', 'gestor'], ['adm', 'admin'], ['col', 'colaborador'], ['col2', 'colaborador']]) await setDoc(doc(db, `users/${u}`), { uid: u, role });
    for (const e of ['A', 'B']) await setDoc(doc(db, `empresas/${e}`), { cnpj: e, criadoPor: 'ges' });
    for (const u of ['col', 'adm']) await setDoc(doc(db, `carteira_acessos/${u}`), { uid: u, empresaIds: ['A'], atualizadoPor: 'ges' });
    await setDoc(doc(db, 'calculo_movimentos/A_111_M1_2026-09'), MOV('2026-09'));
    await setDoc(doc(db, 'cadastro_afastamentos/A_111_M1_2026-09-10'), AFA('2026-09-10'));
    await setDoc(doc(db, 'fechamentos/A_2026-08'), { empresaId: 'A', competencia: '2026-08', situacao: 'encerrado', encerradoPor: 'col', checklist: {} });
    await setDoc(doc(db, 'calculo_movimentos/A_111_M1_2026-08'), MOV('2026-08'));
    await setDoc(doc(db, 'cadastro_afastamentos/A_111_M1_2026-08-05'), AFA('2026-08-05'));
    await setDoc(doc(db, 'fechamentos_pedidos/p1'), { empresaId: 'A', competencia: '2026-08', motivo: 'faltou lançar a hora extra', situacao: 'pendente', pedidoPor: 'col' });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();

describe('fechamentos', () => {
  it('lê o da empresa da carteira (mesmo sem fechamento ainda)', async () => {
    await assertSucceeds(getDoc(doc(fs('col'), 'fechamentos/A_2026-09')));
    await assertSucceeds(getDoc(doc(fs('col'), 'fechamentos/A_2026-08')));
    await assertFails(getDoc(doc(fs('col'), 'fechamentos/B_2026-08')));
    await assertFails(getDoc(doc(fs('col2'), 'fechamentos/A_2026-08')));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'fechamentos'), where('empresaId', '==', 'A'))));
    await assertFails(getDocs(query(collection(fs('col'), 'fechamentos'), where('empresaId', '==', 'B'))));
  });
  it('encerra quem trabalha na empresa, com autor e lista de conferência', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'fechamentos/A_2026-09'), FECHA('col')));
    await assertFails(setDoc(doc(fs('col2'), 'fechamentos/A_2026-07'), FECHA('col2', { competencia: '2026-07' })));
    await assertFails(setDoc(doc(fs('col'), 'fechamentos/A_2026-07'), FECHA('outro', { competencia: '2026-07' })));
    await assertFails(setDoc(doc(fs('col'), 'fechamentos/A_2026-07'), FECHA('col')));
    await assertFails(setDoc(doc(fs('col'), 'fechamentos/A_2026-07'), FECHA('col', { competencia: '2026-07', checklist: null })));
    await assertFails(setDoc(doc(fs('col'), 'fechamentos/A_2026-07'), FECHA('col', { competencia: '2026-07', situacao: 'reaberto' })));
  });
  it('só o gestor reabre, com o motivo; ninguém apaga; reencerra quem trabalha na empresa', async () => {
    const reabrir = (u, motivo = 'faltou lançar a hora extra') => updateDoc(doc(fs(u), 'fechamentos/A_2026-08'), { situacao: 'reaberto', reabertoPor: u, reabertoEm: serverTimestamp(), motivoReabertura: motivo });
    await assertFails(reabrir('col'));
    await assertFails(reabrir('adm'));
    await assertFails(reabrir('ges', 'curto'));
    await assertSucceeds(reabrir('ges'));
    await assertFails(deleteDoc(doc(fs('ges'), 'fechamentos/A_2026-08')));
    await assertFails(updateDoc(doc(fs('col'), 'fechamentos/A_2026-08'), { situacao: 'encerrado', encerradoPor: 'col', checklist: {}, empresaId: 'B' }));
    await assertSucceeds(updateDoc(doc(fs('col'), 'fechamentos/A_2026-08'), { situacao: 'encerrado', encerradoPor: 'col', encerradoEm: serverTimestamp(), checklist: {} }));
  });
});

describe('trava do período encerrado', () => {
  it('movimento do mês encerrado não muda; o do mês aberto, sim', async () => {
    await assertFails(setDoc(doc(fs('col'), 'calculo_movimentos/A_111_M1_2026-08'), MOV('2026-08', { movimento: { horasExtras50: 2 } })));
    await assertFails(deleteDoc(doc(fs('ges'), 'calculo_movimentos/A_111_M1_2026-08')));
    await assertSucceeds(setDoc(doc(fs('col'), 'calculo_movimentos/A_111_M1_2026-09'), MOV('2026-09', { movimento: { horasExtras50: 2 } })));
  });
  it('afastamento que começa no mês encerrado não muda nem é criado; reaberto, volta a mudar', async () => {
    await assertFails(setDoc(doc(fs('col'), 'cadastro_afastamentos/A_111_M1_2026-08-05'), AFA('2026-08-05', { motivo: '03' })));
    await assertFails(setDoc(doc(fs('col'), 'cadastro_afastamentos/A_111_M1_2026-08-20'), AFA('2026-08-20')));
    await assertFails(deleteDoc(doc(fs('ges'), 'cadastro_afastamentos/A_111_M1_2026-08-05')));
    await assertSucceeds(setDoc(doc(fs('col'), 'cadastro_afastamentos/A_111_M1_2026-09-10'), AFA('2026-09-10', { motivo: '03' })));
    await updateDoc(doc(fs('ges'), 'fechamentos/A_2026-08'), { situacao: 'reaberto', reabertoPor: 'ges', motivoReabertura: 'faltou lançar a hora extra' });
    await assertSucceeds(setDoc(doc(fs('col'), 'calculo_movimentos/A_111_M1_2026-08'), MOV('2026-08', { movimento: { horasExtras50: 2 } })));
    await assertSucceeds(setDoc(doc(fs('col'), 'cadastro_afastamentos/A_111_M1_2026-08-05'), AFA('2026-08-05', { motivo: '03' })));
  });
});

describe('pedidos de reabertura', () => {
  const pedido = (u, extra = {}) => ({ empresaId: 'A', empresaNome: 'Um', competencia: '2026-08', motivo: 'faltou lançar a hora extra', situacao: 'pendente', pedidoPor: u, pedidoPorEmail: `${u}@x`, pedidoEm: serverTimestamp(), ...extra });
  it('pede quem trabalha na empresa, só para período encerrado e com motivo', async () => {
    await assertSucceeds(addDoc(collection(fs('col'), 'fechamentos_pedidos'), pedido('col')));
    await assertFails(addDoc(collection(fs('col'), 'fechamentos_pedidos'), pedido('col', { competencia: '2026-09' })));
    await assertFails(addDoc(collection(fs('col'), 'fechamentos_pedidos'), pedido('col', { motivo: 'curto' })));
    await assertFails(addDoc(collection(fs('col'), 'fechamentos_pedidos'), pedido('col', { situacao: 'aprovado' })));
    await assertFails(addDoc(collection(fs('col'), 'fechamentos_pedidos'), pedido('outro')));
    await assertFails(addDoc(collection(fs('col2'), 'fechamentos_pedidos'), pedido('col2')));
  });
  it('o gestor decide (aprovando, reabre junto); colaborador e admin não; decidido não muda', async () => {
    await assertSucceeds(getDocs(query(collection(fs('ges'), 'fechamentos_pedidos'), where('situacao', '==', 'pendente'))));
    await assertSucceeds(getDocs(query(collection(fs('col'), 'fechamentos_pedidos'), where('empresaId', '==', 'A'))));
    const decidir = (u, s = 'aprovado') => updateDoc(doc(fs(u), 'fechamentos_pedidos/p1'), { situacao: s, decididoPor: u, decididoEm: serverTimestamp() });
    await assertFails(decidir('col'));
    await assertFails(decidir('adm'));
    await assertFails(updateDoc(doc(fs('ges'), 'fechamentos_pedidos/p1'), { situacao: 'aprovado', decididoPor: 'ges', motivo: 'outro motivo qualquer' }));
    const g = fs('ges');
    const b = writeBatch(g);
    b.update(doc(g, 'fechamentos_pedidos/p1'), { situacao: 'aprovado', decididoPor: 'ges', decididoEm: serverTimestamp() });
    b.update(doc(g, 'fechamentos/A_2026-08'), { situacao: 'reaberto', reabertoPor: 'ges', reabertoEm: serverTimestamp(), motivoReabertura: 'faltou lançar a hora extra', pedidoId: 'p1' });
    await assertSucceeds(b.commit());
    await assertFails(decidir('ges', 'recusado'));
    await assertFails(deleteDoc(doc(fs('ges'), 'fechamentos_pedidos/p1')));
  });
});
