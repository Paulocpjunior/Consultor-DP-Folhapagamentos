import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { carregarCertificado, buscarSenhaCertificado, extrairInfoCertificado } from './certificado';
import { gerarXmlEvento, gerarLoteEventos, type EventoTipo } from './xmlGenerator';
import { assinarXml, assinarLote } from './xmlSigner';
import { enviarLote, consultarLote } from './esocialApi';

admin.initializeApp();
const db = admin.firestore();

// ──── Transmitir evento ao eSocial ───────────────────────────────────────────

export const transmitirEvento = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login obrigatório');

    const { eventoId } = request.data;
    if (!eventoId) throw new HttpsError('invalid-argument', 'eventoId obrigatório');

    const eventoRef = db.collection('esocial_eventos').doc(eventoId);
    const eventoSnap = await eventoRef.get();
    if (!eventoSnap.exists) throw new HttpsError('not-found', 'Evento não encontrado');

    const evento = eventoSnap.data()!;
    const empresaSnap = await db.collection('empresas').doc(evento.empresaId).get();
    if (!empresaSnap.exists) throw new HttpsError('not-found', 'Empresa não encontrada');

    const empresa = empresaSnap.data()!;
    const cnpj = empresa.cnpj;
    const storagePath = empresa.certificado?.storagePath;
    if (!storagePath) throw new HttpsError('failed-precondition', 'Empresa sem certificado vinculado');

    await eventoRef.update({ status: 'transmitido', dataEnvio: admin.firestore.FieldValue.serverTimestamp() });

    try {
      const senha = await buscarSenhaCertificado(cnpj);
      const certInfo = await carregarCertificado(storagePath, senha);

      const xmlEvento = gerarXmlEvento({
        tipo: evento.tipo as EventoTipo,
        empresaCnpj: cnpj,
        competencia: evento.competencia,
        funcionarioNome: evento.funcionarioNome,
        funcionarioCpf: evento.funcionarioCpf,
      });

      const xmlAssinado = assinarXml(xmlEvento, certInfo);
      const xmlLote = gerarLoteEventos(cnpj, [xmlAssinado]);
      const loteAssinado = assinarLote(xmlLote, certInfo);
      const resposta = await enviarLote(loteAssinado, certInfo);

      if (resposta.sucesso) {
        await eventoRef.update({
          status: 'transmitido',
          protocolo: resposta.protocolo,
          dataEnvio: admin.firestore.FieldValue.serverTimestamp(),
          erros: [],
        });
      } else {
        await eventoRef.update({
          status: 'rejeitado',
          erros: [resposta.descricaoResposta || 'Erro desconhecido'],
        });
      }

      return {
        sucesso: resposta.sucesso,
        protocolo: resposta.protocolo,
        mensagem: resposta.descricaoResposta,
      };
    } catch (error: any) {
      await eventoRef.update({
        status: 'rejeitado',
        erros: [error?.message || 'Erro interno'],
      });
      throw new HttpsError('internal', error?.message || 'Erro ao transmitir');
    }
  },
);

// ──── Consultar resultado de um protocolo ────────────────────────────────────

export const consultarProtocolo = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login obrigatório');

    const { eventoId } = request.data;
    if (!eventoId) throw new HttpsError('invalid-argument', 'eventoId obrigatório');

    const eventoSnap = await db.collection('esocial_eventos').doc(eventoId).get();
    if (!eventoSnap.exists) throw new HttpsError('not-found', 'Evento não encontrado');

    const evento = eventoSnap.data()!;
    if (!evento.protocolo) throw new HttpsError('failed-precondition', 'Evento sem protocolo');

    const empresaSnap = await db.collection('empresas').doc(evento.empresaId).get();
    const empresa = empresaSnap.data()!;
    const storagePath = empresa.certificado?.storagePath;
    if (!storagePath) throw new HttpsError('failed-precondition', 'Empresa sem certificado');

    const senha = await buscarSenhaCertificado(empresa.cnpj);
    const certInfo = await carregarCertificado(storagePath, senha);
    const resposta = await consultarLote(evento.protocolo, certInfo);

    if (resposta.sucesso) {
      await db.collection('esocial_eventos').doc(eventoId).update({
        status: 'processado',
        dataProcessamento: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return resposta;
  },
);

// ──── Validar certificado (testar se abre corretamente) ──────────────────────

export const validarCertificado = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 30 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login obrigatório');

    const { empresaId } = request.data;
    if (!empresaId) throw new HttpsError('invalid-argument', 'empresaId obrigatório');

    const empresaSnap = await db.collection('empresas').doc(empresaId).get();
    if (!empresaSnap.exists) throw new HttpsError('not-found', 'Empresa não encontrada');

    const empresa = empresaSnap.data()!;
    const storagePath = empresa.certificado?.storagePath;
    if (!storagePath) throw new HttpsError('failed-precondition', 'Empresa sem certificado');

    try {
      const senha = await buscarSenhaCertificado(empresa.cnpj);
      const certInfo = await carregarCertificado(storagePath, senha);
      const info = extrairInfoCertificado(certInfo.cert);

      await db.collection('empresas').doc(empresaId).update({
        'certificado.validade': info.validoAte.split('T')[0],
        'certificado.emissor': info.emissor,
        'certificado.titular': info.cn,
      });

      return {
        valido: true,
        ...info,
      };
    } catch (error: any) {
      return {
        valido: false,
        erro: error?.message || 'Não foi possível abrir o certificado',
      };
    }
  },
);

// ──── Transmitir lote de eventos ─────────────────────────────────────────────

export const transmitirLote = onCall(
  { region: 'southamerica-east1', timeoutSeconds: 300 },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Login obrigatório');

    const { eventosIds } = request.data;
    if (!eventosIds || !Array.isArray(eventosIds) || eventosIds.length === 0) {
      throw new HttpsError('invalid-argument', 'eventosIds obrigatório (array)');
    }

    const resultados: Array<{ eventoId: string; sucesso: boolean; mensagem: string }> = [];

    for (const eventoId of eventosIds) {
      try {
        const resultado = await transmitirEventoInterno(eventoId);
        resultados.push({ eventoId, sucesso: resultado.sucesso, mensagem: resultado.mensagem || '' });
      } catch (error: any) {
        resultados.push({ eventoId, sucesso: false, mensagem: error?.message || 'Erro' });
      }
    }

    return { resultados };
  },
);

async function transmitirEventoInterno(eventoId: string) {
  const eventoRef = db.collection('esocial_eventos').doc(eventoId);
  const eventoSnap = await eventoRef.get();
  if (!eventoSnap.exists) return { sucesso: false, mensagem: 'Evento não encontrado' };

  const evento = eventoSnap.data()!;
  const empresaSnap = await db.collection('empresas').doc(evento.empresaId).get();
  if (!empresaSnap.exists) return { sucesso: false, mensagem: 'Empresa não encontrada' };

  const empresa = empresaSnap.data()!;
  const storagePath = empresa.certificado?.storagePath;
  if (!storagePath) return { sucesso: false, mensagem: 'Sem certificado' };

  const senha = await buscarSenhaCertificado(empresa.cnpj);
  const certInfo = await carregarCertificado(storagePath, senha);

  const xmlEvento = gerarXmlEvento({
    tipo: evento.tipo as EventoTipo,
    empresaCnpj: empresa.cnpj,
    competencia: evento.competencia,
    funcionarioNome: evento.funcionarioNome,
    funcionarioCpf: evento.funcionarioCpf,
  });

  const xmlAssinado = assinarXml(xmlEvento, certInfo);
  const xmlLote = gerarLoteEventos(empresa.cnpj, [xmlAssinado]);
  const loteAssinado = assinarLote(xmlLote, certInfo);
  const resposta = await enviarLote(loteAssinado, certInfo);

  await eventoRef.update({
    status: resposta.sucesso ? 'transmitido' : 'rejeitado',
    protocolo: resposta.protocolo || null,
    dataEnvio: admin.firestore.FieldValue.serverTimestamp(),
    erros: resposta.sucesso ? [] : [resposta.descricaoResposta || 'Erro'],
  });

  return { sucesso: resposta.sucesso, mensagem: resposta.descricaoResposta || '' };
}
