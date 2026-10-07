// services/esocial/transmissao.ts
//
// Transmissão de eventos do eSocial pelo cofre do CFI (Paulo, 05/10/2026:
// "pode seguir com a transmissão do esocial pelo cofre"). O DP monta o evento
// SEM assinatura; o CFI confere a carteira, assina com o A1 do cofre (por
// padrão o do escritório, procurador), envia o lote e consulta o resultado.
//
// O DP gera hoje os eventos que dependem só do período e de indicadores:
//   S-1299 (fechamento dos periódicos) e S-1298 (reabertura), leiaute S-1.3.
// Outros eventos (S-1200, S-2200…) entram como XML pronto — gerado pelo IOB
// ou outro sistema — e o CFI troca a assinatura pela do cofre.

import { callFiscal } from '../serpro/serproIntegrationService';

export type TpAmb = 1 | 2;
export const ROTULO_AMBIENTE: Record<TpAmb, string> = { 1: 'Produção', 2: 'Produção restrita (testes)' };
export const VER_PROC = 'ConsultorDP_1.0';
const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO_LEIAUTE = 'v_S_01_03_00';

const raiz = (cnpj: string) => {
    const d = cnpj.replace(/\D/g, '');
    if (d.length !== 14) throw new Error('CNPJ inválido.');
    return d.slice(0, 8);
};

/** Data e hora de Brasília como AAAAMMDDHHMMSS. */
function carimbo(agora: Date): string {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(agora).replace(/\D/g, '');
}

/**
 * Id do evento: "ID" + tipo de inscrição (1 = CNPJ) + inscrição com 14
 * posições (raiz do CNPJ completada com zeros à direita) + data e hora
 * (AAAAMMDDHHMMSS) + sequencial de 5 dígitos.
 */
export function idEvento(cnpj: string, agora = new Date(), seq = 1): string {
    return `ID1${raiz(cnpj).padEnd(14, '0')}${carimbo(agora)}${String(seq % 100000).padStart(5, '0')}`;
}

/** perApur do S-1299/S-1298: AAAA-MM (mensal) ou AAAA (anual, 13º). */
export function validarPerApur(perApur: string): 1 | 2 {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(perApur)) return 1;
    if (/^\d{4}$/.test(perApur)) return 2;
    throw new Error('Período de apuração no formato AAAA-MM (mensal) ou AAAA (13º).');
}

export interface InfoFech {
    /** Houve S-1200/S-1202/S-1207 no período. */
    evtRemun: boolean;
    /** Houve S-1210. */
    evtPgtos: boolean;
    /** Houve S-1260 (comercialização da produção rural). */
    evtComProd: boolean;
    /** Houve S-1270 (avulsos não portuários). */
    evtContratAvNP: boolean;
    /** Houve S-1280 (desoneração, Simples com atividade concomitante). */
    evtInfoComplPer: boolean;
    /** Pede a transmissão imediata da DCTFWeb. */
    transDCTFWeb: boolean;
}

const sn = (b: boolean) => (b ? 'S' : 'N');
const ideEvento = (perApur: string, tpAmb: TpAmb) =>
    `<ideEvento><indApuracao>${validarPerApur(perApur)}</indApuracao><perApur>${perApur}</perApur><tpAmb>${tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`;
const ideEmpregador = (cnpj: string) => `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz(cnpj)}</nrInsc></ideEmpregador>`;

/** S-1299: fechamento dos eventos periódicos (sem assinatura; o CFI assina). */
export function gerarS1299(p: { cnpj: string; perApur: string; tpAmb: TpAmb; info: InfoFech; id?: string }): { id: string; xml: string } {
    const id = p.id ?? idEvento(p.cnpj);
    const i = p.info;
    const xml = `<eSocial xmlns="${NS}/evtFechaEvPer/${VERSAO_LEIAUTE}"><evtFechaEvPer Id="${id}">`
        + ideEvento(p.perApur, p.tpAmb) + ideEmpregador(p.cnpj)
        + `<infoFech><evtRemun>${sn(i.evtRemun)}</evtRemun><evtPgtos>${sn(i.evtPgtos)}</evtPgtos><evtComProd>${sn(i.evtComProd)}</evtComProd>`
        + `<evtContratAvNP>${sn(i.evtContratAvNP)}</evtContratAvNP><evtInfoComplPer>${sn(i.evtInfoComplPer)}</evtInfoComplPer>`
        + `${i.transDCTFWeb ? '<transDCTFWeb>S</transDCTFWeb>' : ''}</infoFech>`
        + '</evtFechaEvPer></eSocial>';
    return { id, xml };
}

/** S-1298: reabertura dos eventos periódicos (sem assinatura; o CFI assina). */
export function gerarS1298(p: { cnpj: string; perApur: string; tpAmb: TpAmb; id?: string }): { id: string; xml: string } {
    const id = p.id ?? idEvento(p.cnpj);
    return { id, xml: `<eSocial xmlns="${NS}/evtReabreEvPer/${VERSAO_LEIAUTE}"><evtReabreEvPer Id="${id}">${ideEvento(p.perApur, p.tpAmb)}${ideEmpregador(p.cnpj)}</evtReabreEvPer></eSocial>` };
}

/** Texto livre para o XML (observação). */
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface AfastamentoS2230 {
    cpf: string; matriculaEsocial: string; dtInicio: string; dtFim: string; motivo: string;
    infoMesmoMtv?: string; tpAcidTransito?: string; observacao?: string; perAquisInicio?: string; perAquisFim?: string;
}

/**
 * S-2230: afastamento temporário (sem assinatura; o CFI assina), leiaute
 * S-1.3. Início e término no mesmo evento quando o término é conhecido
 * (férias). Férias (motivo 15) exigem o período aquisitivo (perAquis).
 */
export function gerarS2230(p: { cnpj: string; tpAmb: TpAmb; afastamento: AfastamentoS2230; id?: string }): { id: string; xml: string } {
    const a = p.afastamento;
    const cpf = a.cpf.replace(/\D/g, '');
    const data = /^\d{4}-\d{2}-\d{2}$/;
    if (cpf.length !== 11) throw new Error('S-2230: CPF do trabalhador inválido.');
    if (!a.matriculaEsocial.trim()) throw new Error('S-2230: informe a matrícula do eSocial na ficha.');
    if (!data.test(a.dtInicio)) throw new Error('S-2230: data de início inválida.');
    if (a.dtFim && (!data.test(a.dtFim) || a.dtFim < a.dtInicio)) throw new Error('S-2230: data de término inválida.');
    if (!/^\d{2}$/.test(a.motivo)) throw new Error('S-2230: motivo do afastamento (Tabela 18) com 2 dígitos.');
    if (a.motivo === '15' && (!a.perAquisInicio || !data.test(a.perAquisInicio))) throw new Error('S-2230: férias exigem o início do período aquisitivo.');
    const id = p.id ?? idEvento(p.cnpj);
    const perAquis = a.motivo === '15' && a.perAquisInicio
        ? `<perAquis><dtInicio>${a.perAquisInicio}</dtInicio>${a.perAquisFim && data.test(a.perAquisFim) ? `<dtFim>${a.perAquisFim}</dtFim>` : ''}</perAquis>` : '';
    const xml = `<eSocial xmlns="${NS}/evtAfastTemp/${VERSAO_LEIAUTE}"><evtAfastTemp Id="${id}">`
        + `<ideEvento><indRetif>1</indRetif><tpAmb>${p.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + ideEmpregador(p.cnpj)
        + `<ideVinculo><cpfTrab>${cpf}</cpfTrab><matricula>${esc(a.matriculaEsocial.trim())}</matricula></ideVinculo>`
        + '<infoAfastamento><iniAfastamento>'
        + `<dtIniAfast>${a.dtInicio}</dtIniAfast><codMotAfast>${a.motivo}</codMotAfast>`
        + (a.infoMesmoMtv === 'S' || a.infoMesmoMtv === 'N' ? `<infoMesmoMtv>${a.infoMesmoMtv}</infoMesmoMtv>` : '')
        + (a.tpAcidTransito && /^[123]$/.test(a.tpAcidTransito) ? `<tpAcidTransito>${a.tpAcidTransito}</tpAcidTransito>` : '')
        + (a.observacao?.trim() && a.motivo !== '15' ? `<observacao>${esc(a.observacao.trim().slice(0, 255))}</observacao>` : '')
        + perAquis
        + '</iniAfastamento>'
        + (a.dtFim ? `<fimAfastamento><dtTermAfast>${a.dtFim}</dtTermAfast></fimAfastamento>` : '')
        + '</infoAfastamento></evtAfastTemp></eSocial>';
    return { id, xml };
}

// ─── XML pronto ─────────────────────────────────────────────────────────────

const TIPO: Record<string, string> = {
    evtInfoEmpregador: 'S-1000', evtTabEstab: 'S-1005', evtTabRubrica: 'S-1010', evtTabLotacao: 'S-1020', evtTabProcesso: 'S-1070',
    evtRemun: 'S-1200', evtRmnRPPS: 'S-1202', evtBenPrRP: 'S-1207', evtPgtos: 'S-1210', evtAqProd: 'S-1250', evtComProd: 'S-1260',
    evtContratAvNP: 'S-1270', evtInfoComplPer: 'S-1280', evtReabreEvPer: 'S-1298', evtFechaEvPer: 'S-1299',
    evtAdmPrelim: 'S-2190', evtAdmissao: 'S-2200', evtAltCadastral: 'S-2205', evtAltContratual: 'S-2206', evtCAT: 'S-2210',
    evtMonit: 'S-2220', evtToxic: 'S-2221', evtAfastTemp: 'S-2230', evtCessao: 'S-2231', evtExpRisco: 'S-2240', evtReintegr: 'S-2298',
    evtDeslig: 'S-2299', evtTSVInicio: 'S-2300', evtTSVAltContr: 'S-2306', evtTSVTermino: 'S-2399', evtCdBenefIn: 'S-2400',
    evtCdBenefAlt: 'S-2405', evtCdBenIn: 'S-2410', evtCdBenAlt: 'S-2416', evtReativBen: 'S-2418', evtCdBenTerm: 'S-2420',
    evtProcTrab: 'S-2500', evtContProc: 'S-2501', evtConsolidContProc: 'S-2555', evtExclusao: 'S-3000', evtExcProcTrab: 'S-3500',
};

/** Grupo do lote: 1 = tabelas, 2 = não periódicos, 3 = periódicos. */
export function grupoDoTipo(tipo: string): 1 | 2 | 3 | null {
    const n = Number(tipo.slice(2));
    return n >= 1000 && n < 1200 ? 1 : n >= 1200 && n < 2000 ? 3 : n >= 2000 && n < 5000 ? 2 : null;
}
export const ROTULO_GRUPO = { 1: 'tabelas', 2: 'não periódicos', 3: 'periódicos' } as const;

export interface EventoLido { nome: string; xml: string; id: string; tipo: string; grupo: 1 | 2 | 3 | null; perApur: string; cpf: string; erro: string }

const pegar = (xml: string, tag: string) => (xml.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`)) || [])[1]?.trim() ?? '';

/**
 * Leitura rápida de um XML de evento para a tela conferir antes de enviar:
 * tipo, Id, período, CPF (só para exibir), empregador e ambiente. O CFI
 * confere de novo; aqui é para o erro aparecer antes de gastar o envio.
 */
export function lerEventoXml(nome: string, xml: string, empresa: { cnpj: string }, tpAmb: TpAmb): EventoLido {
    const texto = xml.replace(/^﻿/, '');
    const m = texto.match(/<(?:\w+:)?eSocial\b[^>]*>\s*<(?:\w+:)?(evt\w+)\b[^>]*\bId="([^"]*)"/);
    const elemento = m?.[1] ?? '';
    const tipo = TIPO[elemento] ?? '';
    const base = { nome, xml: texto, id: m?.[2] ?? '', tipo: tipo || elemento, grupo: tipo ? grupoDoTipo(tipo) : null, perApur: pegar(texto, 'perApur'), cpf: pegar(texto, 'cpfTrab') || pegar(texto, 'cpfBenef') };
    let erro = '';
    if (!m) erro = 'não é um evento do eSocial (<eSocial><evt… Id="…">)';
    else if (!tipo) erro = `<${elemento}> não é um evento que se transmite`;
    else if (!/^ID[12]\d{33}$/.test(base.id)) erro = 'Id fora do formato do eSocial';
    else {
        const nrInsc = pegar((texto.match(/<(?:\w+:)?ideEmpregador>([\s\S]*?)<\/(?:\w+:)?ideEmpregador>/) || [])[1] ?? '', 'nrInsc');
        const d = empresa.cnpj.replace(/\D/g, '');
        const amb = pegar(texto, 'tpAmb');
        if (nrInsc !== d.slice(0, 8) && nrInsc !== d) erro = `empregador ${nrInsc || '?'} não é a empresa ativa`;
        else if (amb !== String(tpAmb)) erro = `evento de ${amb === '1' ? 'produção' : amb === '2' ? 'produção restrita' : 'ambiente desconhecido'}; o envio está em ${ROTULO_AMBIENTE[tpAmb].toLowerCase()}`;
    }
    return { ...base, erro };
}

// ─── túnel do CFI ──────────────────────────────────────────────────────────

export type Certificado = 'escritorio' | 'empresa';
export interface Ocorrencia { tipo: number | null; codigo: string; descricao: string; localizacao: string }
export interface EventoDoLote { id: string; tipo: string; perApur: string | null }
export interface RetornoEnvio {
    cdResposta: number | null; descResposta: string; ocorrencias: Ocorrencia[]; protocolo: string; dhRecepcao: string;
    recebido: boolean; grupo: number; eventos: EventoDoLote[]; tpAmb: TpAmb; transmissor: string;
}
export interface ResultadoEvento { id: string; cdResposta: number | null; descResposta: string; ocorrencias: Ocorrencia[]; nrRecibo: string; totalizadores: string[] }
export interface RetornoConsulta {
    cdResposta: number | null; descResposta: string; ocorrencias: Ocorrencia[]; tempoEstimadoConclusao: number | null; protocolo: string;
    eventos: ResultadoEvento[]; situacao: 'em-processamento' | 'processado' | 'recusado'; tpAmb: TpAmb;
}

export const enviarLote = (p: { empresaId: string; cnpj: string; eventos: string[]; tpAmb: TpAmb; confirmoProducao?: boolean; certificado: Certificado }) =>
    callFiscal<RetornoEnvio>('/esocial/envio/lote', p);
export const consultarLote = (p: { empresaId: string; cnpj: string; protocolo: string; tpAmb: TpAmb; certificado: Certificado }) =>
    callFiscal<RetornoConsulta>('/esocial/envio/consulta', p);

/** Evento aceito pelo eSocial (201/202 com recibo). */
export const aceito = (r: Pick<ResultadoEvento, 'cdResposta' | 'nrRecibo'>) => !!r.nrRecibo && (r.cdResposta === 201 || r.cdResposta === 202);
