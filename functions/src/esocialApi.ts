import axios from 'axios';
import * as https from 'https';
import { parseStringPromise } from 'xml2js';
import type { CertificadoInfo } from './certificado';

const ESOCIAL_PRODUCAO_ENVIO = 'https://webservices.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc';
const ESOCIAL_PRODUCAO_CONSULTA = 'https://webservices.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc';
const ESOCIAL_HOMOLOG_ENVIO = 'https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/enviarloteeventos/WsEnviarLoteEventos.svc';
const ESOCIAL_HOMOLOG_CONSULTA = 'https://webservices.producaorestrita.esocial.gov.br/servicos/empregador/consultarloteeventos/WsConsultarLoteEventos.svc';

function getUrls() {
  const amb = process.env.ESOCIAL_AMBIENTE || '2';
  return amb === '1'
    ? { envio: ESOCIAL_PRODUCAO_ENVIO, consulta: ESOCIAL_PRODUCAO_CONSULTA }
    : { envio: ESOCIAL_HOMOLOG_ENVIO, consulta: ESOCIAL_HOMOLOG_CONSULTA };
}

const RETRY_DELAYS = [2000, 4000, 8000];

async function comRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: any;
  for (let tentativa = 0; tentativa <= RETRY_DELAYS.length; tentativa++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isRetryable = err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNREFUSED' || err?.response?.status === 503 || err?.response?.status === 429;
      if (!isRetryable || tentativa >= RETRY_DELAYS.length) throw err;
      await new Promise(r => setTimeout(r, RETRY_DELAYS[tentativa]));
    }
  }
  throw lastError;
}

export interface RespostaEnvio {
  sucesso: boolean;
  protocolo?: string;
  codigoResposta?: string;
  descricaoResposta?: string;
  xmlResposta: string;
}

export interface RespostaConsulta {
  sucesso: boolean;
  status?: string;
  eventos?: Array<{
    id: string;
    status: string;
    descricao: string;
    recibo?: string;
  }>;
  xmlResposta: string;
}

function criarAgenteMTLS(certInfo: CertificadoInfo): https.Agent {
  return new https.Agent({
    cert: certInfo.certPem,
    key: certInfo.keyPem,
    rejectUnauthorized: true,
  });
}

function envelopeSoap(body: string, action: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Header/>
  <soap:Body>
    ${body}
  </soap:Body>
</soap:Envelope>`;
}

export async function enviarLote(
  loteXmlAssinado: string,
  certInfo: CertificadoInfo,
): Promise<RespostaEnvio> {
  const soapBody = `
    <EnviarLoteEventos xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0">
      <loteEventos>
        <![CDATA[${loteXmlAssinado}]]>
      </loteEventos>
    </EnviarLoteEventos>`;

  const soapEnvelope = envelopeSoap(soapBody, 'EnviarLoteEventos');
  const agent = criarAgenteMTLS(certInfo);
  const { envio: url } = getUrls();

  try {
    const response = await comRetry(() =>
      axios.post(url, soapEnvelope, {
        httpsAgent: agent,
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'SOAPAction': 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/v1_1_0/ServicoEnviarLoteEventos/EnviarLoteEventos',
        },
        timeout: 60000,
      })
    );

    const parsed = await parseStringPromise(response.data, { explicitArray: false });
    const retorno = extrairRetornoEnvio(parsed);

    return {
      sucesso: retorno.codigo === '201' || retorno.codigo === '202',
      protocolo: retorno.protocolo,
      codigoResposta: retorno.codigo,
      descricaoResposta: retorno.descricao,
      xmlResposta: response.data,
    };
  } catch (error: any) {
    return {
      sucesso: false,
      descricaoResposta: error?.message || 'Erro de conexão com eSocial',
      xmlResposta: error?.response?.data || '',
    };
  }
}

export async function consultarLote(
  protocolo: string,
  certInfo: CertificadoInfo,
): Promise<RespostaConsulta> {
  const soapBody = `
    <ConsultarLoteEventos xmlns="http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0">
      <consulta>
        <![CDATA[
          <eSocial xmlns="http://www.esocial.gov.br/schema/consulta/retornoProcessamento/v1_0_0">
            <consultaLoteEventos>
              <protocoloEnvio>${protocolo}</protocoloEnvio>
            </consultaLoteEventos>
          </eSocial>
        ]]>
      </consulta>
    </ConsultarLoteEventos>`;

  const soapEnvelope = envelopeSoap(soapBody, 'ConsultarLoteEventos');
  const agent = criarAgenteMTLS(certInfo);

  try {
    const { consulta: urlConsulta } = getUrls();
    const response = await comRetry(() => axios.post(urlConsulta, soapEnvelope, {
      httpsAgent: agent,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': 'http://www.esocial.gov.br/servicos/empregador/lote/eventos/envio/consulta/retornoProcessamento/v1_1_0/ServicoConsultarLoteEventos/ConsultarLoteEventos',
      },
      timeout: 60000,
    }));

    return {
      sucesso: true,
      xmlResposta: response.data,
    };
  } catch (error: any) {
    return {
      sucesso: false,
      xmlResposta: error?.response?.data || error?.message || '',
    };
  }
}

function extrairRetornoEnvio(parsed: any): { codigo: string; descricao: string; protocolo?: string } {
  try {
    const body = parsed?.['soap:Envelope']?.['soap:Body'] ||
                 parsed?.Envelope?.Body || {};
    const resp = body?.EnviarLoteEventosResponse?.EnviarLoteEventosResult ||
                 body?.['EnviarLoteEventosResponse']?.['EnviarLoteEventosResult'] || '';

    if (typeof resp === 'string' && resp.includes('<')) {
      const innerMatch = resp.match(/<cdResposta>(\d+)<\/cdResposta>/);
      const descMatch = resp.match(/<descResposta>([^<]*)<\/descResposta>/);
      const protMatch = resp.match(/<protocoloEnvio>([^<]*)<\/protocoloEnvio>/);
      return {
        codigo: innerMatch?.[1] || '0',
        descricao: descMatch?.[1] || 'Resposta não identificada',
        protocolo: protMatch?.[1],
      };
    }

    return { codigo: '0', descricao: 'Resposta inesperada' };
  } catch {
    return { codigo: '0', descricao: 'Erro ao interpretar resposta' };
  }
}
