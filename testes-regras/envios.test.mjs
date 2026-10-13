import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
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
    for (const e of ['A', 'B']) await setDoc(doc(db, `empresas/${e}`), { cnpj: e, criadoPor: 'ges' });
    await setDoc(doc(db, 'carteira_acessos/col'), { uid: 'col', empresaIds: ['A'], atualizadoPor: 'ges' });
    for (const e of ['A', 'B']) await setDoc(doc(db, `esocial_envios/env${e}`), { empresaId: e, protocolo: 'p', tpAmb: 2, eventos: [{ id: 'X' }], situacao: 'enviado', enviadoPor: 'ges', enviadoEm: 1 });
  });
});
afterAll(async () => env?.cleanup());
const fs = u => env.authenticatedContext(u).firestore();
const novo = (e, u, extra = {}) => ({ empresaId: e, cnpj: '1', protocolo: '1.2.3', tpAmb: 2, grupo: 3, eventos: [{ id: 'X', tipo: 'S-1299' }], situacao: 'enviado', enviadoPor: u, enviadoEm: serverTimestamp(), ...extra });

describe('esocial_envios', () => {
  it('lê só da carteira (consulta por empresa, ordenada)', async () => {
    await assertSucceeds(getDocs(query(collection(fs('col'), 'esocial_envios'), where('empresaId', '==', 'A'), orderBy('enviadoEm', 'desc'))));
    await assertFails(getDocs(query(collection(fs('col'), 'esocial_envios'), where('empresaId', '==', 'B'))));
    await assertFails(getDoc(doc(fs('col2'), 'esocial_envios/envA')));
  });
  it('registra o lote na empresa da carteira, com autor e ambiente válidos', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_envios/n1'), novo('A', 'col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_envios/n2'), novo('A', 'col', { protocolo: '', situacao: 'recusado' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n3'), novo('B', 'col')));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n4'), novo('A', 'outro')));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n5'), novo('A', 'col', { tpAmb: 3 })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n6'), novo('A', 'col', { eventos: Array(51).fill({}) })));
  });
  it('consulta só atualiza o resultado; ninguém apaga', async () => {
    await assertSucceeds(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'processado', eventos: [{ id: 'X', nrRecibo: '1' }], consultadoPor: 'col', consultadoEm: serverTimestamp() }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { protocolo: 'outro', consultadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'processado', consultadoPor: 'outro' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envB'), { situacao: 'processado', consultadoPor: 'col' }));
    await assertFails(deleteDoc(doc(fs('col'), 'esocial_envios/envA')));
    await assertFails(deleteDoc(doc(fs('ges'), 'esocial_envios/envA')));
  });
  it('lote já processado não muda; a consulta não tira nem põe eventos (auditoria de 10/2026)', async () => {
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'processado', eventos: [], consultadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'processado', eventos: [{ id: 'X' }, { id: 'Y' }], consultadoPor: 'col' }));
    await assertSucceeds(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'processado', eventos: [{ id: 'X', nrRecibo: '1' }], consultadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'processado', eventos: [{ id: 'X', nrRecibo: '2' }], consultadoPor: 'col' }));
  });
});

describe('esocial_envios: saúde do eSocial (lote registrado antes de sair)', () => {
  const agora = () => Timestamp.fromMillis(Date.now());
  const antes = min => Timestamp.fromMillis(Date.now() - min * 60_000);
  const intencao = (u, extra = {}) => novo('A', u, { protocolo: '', situacao: 'transmitindo', enviadoEm: agora(), ...extra });
  it('cria "transmitindo" sem protocolo; com protocolo, não', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_envios/t1'), intencao('col')));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/t2'), intencao('col', { protocolo: '1.2' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/t3'), intencao('col', { situacao: 'processado' })));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/t4'), intencao('col', { situacao: 'sem-resposta' })));
  });
  it('a resposta do envio é gravada por quem transmitiu, uma vez', async () => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'esocial_envios/t1'), intencao('col')));
    await assertFails(updateDoc(doc(fs('ges'), 'esocial_envios/t1'), { situacao: 'enviado', protocolo: '1.2' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/t1'), { situacao: 'processado', protocolo: '1.2' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/t1'), { situacao: 'enviado', protocolo: '1.2', enviadoPor: 'ges' }));
    await assertSucceeds(updateDoc(doc(fs('col'), 'esocial_envios/t1'), { situacao: 'enviado', protocolo: '1.2', dhRecepcao: 'x', cdResposta: 201, respondidoEm: serverTimestamp() }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/t1'), { situacao: 'recusado', protocolo: '' }));
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'esocial_envios/t2'), intencao('col')));
    await assertSucceeds(updateDoc(doc(fs('col'), 'esocial_envios/t2'), { situacao: 'sem-resposta', erroEnvio: 'Failed to fetch', respondidoEm: serverTimestamp() }));
  });
  it('sem resposta: confere no eSocial e só libera o reenvio depois de 30 min', async () => {
    await env.withSecurityRulesDisabled(async c => {
      await setDoc(doc(c.firestore(), 'esocial_envios/s1'), intencao('col', { situacao: 'sem-resposta', enviadoEm: antes(10) }));
      await setDoc(doc(c.firestore(), 'esocial_envios/s2'), intencao('col', { situacao: 'sem-resposta', enviadoEm: antes(40) }));
      await setDoc(doc(c.firestore(), 'esocial_envios/s3'), intencao('col', { situacao: 'transmitindo', enviadoEm: antes(1) }));
    });
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/s1'), { situacao: 'nao-recebido', verificadoPor: 'col' }));
    await assertSucceeds(updateDoc(doc(fs('col'), 'esocial_envios/s1'), { situacao: 'processado', eventos: [{ id: 'X', tipo: 'S-1299', nrRecibo: '1.1.1' }], verificadoPor: 'col' }));
    await assertSucceeds(updateDoc(doc(fs('ges'), 'esocial_envios/s2'), { situacao: 'nao-recebido', verificadoPor: 'ges' }));
    await assertFails(updateDoc(doc(fs('col2'), 'esocial_envios/s2'), { situacao: 'sem-resposta', verificadoPor: 'col2' }));
    // Transmitindo recente é de quem está enviando: ninguém mexe pela verificação.
    await assertFails(updateDoc(doc(fs('ges'), 'esocial_envios/s3'), { situacao: 'sem-resposta', verificadoPor: 'ges' }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/s2'), { situacao: 'processado', protocolo: '9', verificadoPor: 'col' }));
  });
  it('a consulta conta as tentativas e não volta o lote para trás', async () => {
    await assertSucceeds(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'em-processamento', consultadoPor: 'col', consultas: 1 }));
    await assertFails(updateDoc(doc(fs('col'), 'esocial_envios/envA'), { situacao: 'nao-recebido', consultadoPor: 'col' }));
  });
});

describe('esocial_monitor (monitor do leiaute)', () => {
  it('todo aprovado lê; ninguém grava pelo app', async () => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'esocial_monitor/documentacao'), { versoes: ['S-1.3'] }));
    await assertSucceeds(getDoc(doc(fs('col2'), 'esocial_monitor/documentacao')));
    await assertFails(setDoc(doc(fs('ges'), 'esocial_monitor/documentacao'), { versoes: [] }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'esocial_monitor/documentacao')));
  });
});

describe('esocial_envios: S-1299/S-1298 transmitido fora do Consultor, importado do eSocial', () => {
  const REC = '1.1.0000000000000000123';
  const gov = (u, extra = {}, ev = {}) => ({
    empresaId: 'A', cnpj: '11222333000181', tpAmb: 1, grupo: 3, protocolo: '', dhRecepcao: '2026-10-10T10:00:00', transmissor: '', situacao: 'processado',
    cdResposta: 201, descResposta: 'importado', ocorrencias: [], consultas: 0, origem: 'governo', dataFonte: 'recibo',
    eventos: [{ id: 'ID1112223330001812026101010000000001', tipo: 'S-1299', perApur: '2026-09', cdResposta: 201, descResposta: 'importado', nrRecibo: REC, ...ev }],
    enviadoEm: Timestamp.fromDate(new Date('2026-10-10T13:00:00Z')), importadoEm: serverTimestamp(), importadoPor: u, importadoPorEmail: `${u}@x`, ...extra,
  });
  it('cria na empresa da carteira, um por recibo, só produção, aceito e sem protocolo', async () => {
    await assertSucceeds(setDoc(doc(fs('col'), `esocial_envios/governo-${REC}`), gov('col')));
    await assertSucceeds(setDoc(doc(fs('col'), 'esocial_envios/governo-1.1.0000000000000000124'), gov('col', {}, { tipo: 'S-1298', nrRecibo: '1.1.0000000000000000124', cdResposta: 202 })));
    // Idempotente: o mesmo recibo de novo é alteração, que não passa (lote processado não muda).
    await assertFails(setDoc(doc(fs('col'), `esocial_envios/governo-${REC}`), gov('col')));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-x'), gov('col'))); // id não é o do recibo
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-9.9.9'), gov('col', {}, { nrRecibo: '9.9.9' }))); // recibo inválido
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-'), gov('col', {}, { nrRecibo: '' }))); // sem recibo
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-1.1.0000000000000000125'), gov('col', { tpAmb: 2 }, { nrRecibo: '1.1.0000000000000000125' }))); // homologação
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-1.1.0000000000000000126'), gov('col', {}, { nrRecibo: '1.1.0000000000000000126', cdResposta: 401 }))); // recusado
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-1.1.0000000000000000127'), gov('col', {}, { nrRecibo: '1.1.0000000000000000127', tipo: 'S-1200' }))); // só fechamento
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-1.1.0000000000000000128'), gov('col', { protocolo: '1.2.3' }, { nrRecibo: '1.1.0000000000000000128' }))); // sem protocolo
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-1.1.0000000000000000129'), gov('col', { situacao: 'enviado' }, { nrRecibo: '1.1.0000000000000000129' }))); // nada a consultar
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-1.1.0000000000000000130'), gov('outro', {}, { nrRecibo: '1.1.0000000000000000130' }))); // autor
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/governo-1.1.0000000000000000131'), gov('col', { empresaId: 'B' }, { nrRecibo: '1.1.0000000000000000131' }))); // fora da carteira
    await assertFails(setDoc(doc(fs('col2'), 'esocial_envios/governo-1.1.0000000000000000132'), gov('col2', {}, { nrRecibo: '1.1.0000000000000000132' }))); // sem carteira
  });
  it('não se altera nem se apaga; lote do Consultor não se passa por importado', async () => {
    await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), `esocial_envios/governo-${REC}`), gov('col', { importadoEm: Timestamp.now() })));
    await assertFails(updateDoc(doc(fs('col'), `esocial_envios/governo-${REC}`), { situacao: 'enviado', consultadoPor: 'col' }));
    await assertFails(updateDoc(doc(fs('col'), `esocial_envios/governo-${REC}`), { eventos: [{ id: 'X', nrRecibo: REC }], verificadoPor: 'col' }));
    await assertFails(deleteDoc(doc(fs('col'), `esocial_envios/governo-${REC}`)));
    await assertFails(setDoc(doc(fs('col'), 'esocial_envios/n9'), novo('A', 'col', { origem: 'governo' })));
  });
});
