// services/esocial/downloadEventos.ts
//
// Download de eventos do eSocial pelo túnel do CFI (/api/dp-integration/
// esocial/download/*). O CFI assina o pedido e abre a conexão com o A1 do
// escritório (procurador); aqui só chegam os XMLs.
//
// Cada evento baixado é remontado no formato do arquivo que o portal do
// eSocial entrega (retornoEventoCompleto: evento + recibo). Assim o .zip
// gerado entra direto nas importações que já existem: Cadastros ›
// Funcionários (S-2200/2205/2206/2299/3000), Afastamentos (S-2230),
// Incidências (S-1010) e a Conferência pós-folha (totalizadores).

import { callFiscal } from '../serpro/serproIntegrationService';
import { gerarZip } from '../implantacao/zip';

export type TipoConsulta = 'empregador' | 'tabela' | 'trabalhador';

export interface PedidoIdentificadores {
    cnpj: string; tipo: TipoConsulta; tpEvt?: string; perApur?: string; cpfTrab?: string; dtIni?: string; dtFim?: string; chEvt?: string;
    certificado?: 'escritorio' | 'empresa';
}
export interface Identificador { id: string; nrRec: string }
export interface RetornoIdentificadores {
    cdResposta: number | null; descResposta: string; qtdeTotal: number; dhUltimoEvtRetornado: string;
    identificadores: Identificador[]; pedidosHoje: number | null;
}
export interface ArquivoBaixado { cdResposta: number | null; descResposta: string; id: string; elemento: string; evt: string; rec: string }
export interface RetornoDownload { cdResposta: number | null; descResposta: string; arquivos: ArquivoBaixado[]; pedidosHoje: number | null }

export const consultarIdentificadores = (p: PedidoIdentificadores) => callFiscal<RetornoIdentificadores>('/esocial/download/identificadores', p);
export const baixarEventos = (cnpj: string, ids: string[], certificado?: 'escritorio' | 'empresa') =>
    callFiscal<RetornoDownload>('/esocial/download/eventos', { cnpj, ids, certificado });

/** Eventos que o DP usa, por grupo da consulta. Totalizadores do trabalhador vêm pela consulta do trabalhador. */
export const EVENTOS_EMPREGADOR = ['S-1299', 'S-1298', 'S-5011', 'S-5012', 'S-5013', 'S-1200', 'S-1210'];
export const EVENTOS_TABELA = ['S-1010', 'S-1000', 'S-1005', 'S-1020'];

const TIPO_POR_ELEMENTO: Record<string, string> = {
    evtInfoEmpregador: 'S-1000', evtTabEstab: 'S-1005', evtTabRubrica: 'S-1010', evtTabLotacao: 'S-1020',
    evtRemun: 'S-1200', evtPgtos: 'S-1210', evtReabreEvPer: 'S-1298', evtFechaEvPer: 'S-1299',
    evtAdmissao: 'S-2200', evtAltCadastral: 'S-2205', evtAltContratual: 'S-2206', evtAfastTemp: 'S-2230',
    evtReintegr: 'S-2298', evtDeslig: 'S-2299', evtTSVInicio: 'S-2300', evtTSVAltContr: 'S-2306', evtTSVTermino: 'S-2399',
    evtExclusao: 'S-3000', evtBasesTrab: 'S-5001', evtIrrfBenef: 'S-5002', evtBasesFGTS: 'S-5003',
    evtCS: 'S-5011', evtIrrf: 'S-5012', evtFGTS: 'S-5013',
};
export const tipoDoElemento = (elemento: string) => TIPO_POR_ELEMENTO[elemento] ?? elemento;

const semDeclaracao = (xml: string) => xml.replace(/^\s*<\?xml[^>]*\?>\s*/, '');

/** Evento + recibo no envelope retornoEventoCompleto, como o portal do eSocial entrega. */
export function montarRetornoCompleto(a: Pick<ArquivoBaixado, 'evt' | 'rec'>): string {
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + '<eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0"><retornoEventoCompleto>'
        + `<evento>${semDeclaracao(a.evt)}</evento>${a.rec ? `<recibo>${semDeclaracao(a.rec)}</recibo>` : ''}`
        + '</retornoEventoCompleto></eSocial>';
}

/** Trabalhador do evento (CPF), quando há — para a lista ficar legível. */
export function cpfDoEvento(evt: string): string {
    return (evt.match(/<cpfTrab>(\d{11})<\/cpfTrab>/) || evt.match(/<cpfBenef>(\d{11})<\/cpfBenef>/) || [])[1] ?? '';
}

export function nomeArquivo(a: ArquivoBaixado): string {
    const cpf = cpfDoEvento(a.evt);
    return `${tipoDoElemento(a.elemento)}_${cpf ? `${cpf}_` : ''}${a.id}.xml`;
}

/** .zip com um XML por evento baixado com sucesso (os com erro ficam fora e aparecem na tela). */
export function zipDosEventos(arquivos: ArquivoBaixado[]): Uint8Array {
    return gerarZip(arquivos.filter(a => a.evt).map(a => ({ nome: nomeArquivo(a), conteudo: montarRetornoCompleto(a) })));
}

/** Data em AAAA-MM-DD a partir do dhUltimoEvtRetornado, para continuar a consulta de onde parou. */
export const continuarDe = (dh: string) => (/^\d{4}-\d{2}-\d{2}/.test(dh) ? dh.slice(0, 10) : '');
