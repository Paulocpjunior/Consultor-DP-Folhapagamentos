// services/esocial/recibosEsocial.ts
//
// Recibos dos S-1200 e S-1210 já aceitos pelo eSocial, para a retificação
// (Paulo, 07/10/2026: "pode seguir com a retificação do S-1200"). O evento
// retificador leva indRetif 2 e o nrRecibo do que está valendo. O recibo vem:
//   - do download de eventos do eSocial (o que o IOB transmitiu), no envelope
//     retornoEventoCompleto; ou
//   - dos envios do próprio Consultor (esocial_envios), depois da consulta.
// Vale o processado por último. Do S-1200 original guardamos também o
// ideDmDev de cada matrícula: o retificador repete o mesmo demonstrativo,
// porque o S-1210 (do IOB ou nosso) aponta para ele.
//
// O S-1210 é um só por beneficiário e mês, e aponta para o demonstrativo do
// S-1200. Por isso a ordem é: excluir o S-1210 aceito (S-3000), retificar o
// S-1200 e reenviar o S-1210 com TODOS os pagamentos do mês (Codex no PR
// #100). Do S-1210 baixado guardamos os pagamentos e as informações de IR,
// para o reenvio não perder o que não é desta folha.

import { lerZip } from '../implantacao/zip';
import type { Envio } from './transmissaoService';
import type { FichaFuncionario } from '../cadastros/funcionarios';

export type TipoPeriodico = 'S-1200' | 'S-1210';
export interface ReciboEvento {
    tipo: TipoPeriodico;
    cpf: string;
    /** Período do evento: competência no S-1200; mês do pagamento no S-1210. */
    perApur: string;
    nrRecibo: string;
    processadoEm: string;
    origem: string;
    /** Só no S-1200: matrícula → ideDmDev de cada demonstrativo dela (folha, férias…), na ordem do evento. */
    demonstrativos?: Record<string, string[]>;
    /** Só no S-1210 baixado: os pagamentos (infoPgto) e as informações de IR (infoIRComplem), em XML sem namespace. */
    pagamentos?: PagamentoS1210[];
    irComplem?: string[];
    /** Só no S-1210 baixado: o envelope do download, para a cópia guardada antes da exclusão. */
    xmlOrigem?: string;
    /** Quando o Consultor excluiu este evento (S-3000 aceito) e nada foi aceito depois. */
    excluidoEm?: string;
}
export interface PagamentoS1210 { tpPgto: string; perRef: string; ideDmDev: string; xml: string }

export const reciboValido = (r: string) => /^1\.\d\.\d{19}$/.test(r);
const filhos = (e: Element, n: string) => Array.from(e.children).filter(c => c.localName === n);
const no = (e: Element | null | undefined, caminho: string) => caminho.split('/').reduce<Element | undefined>((p, n) => p && filhos(p, n)[0], e ?? undefined);
const val = (e: Element | null | undefined, caminho: string) => no(e, caminho)?.textContent?.trim() ?? '';
const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const escXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** O elemento em XML sem prefixo nem namespace, para entrar no evento novo (o eSocial não usa atributos dentro do evento). */
export function semNamespace(e: Element): string {
    const filhosEl = Array.from(e.children);
    const dentro = filhosEl.length ? filhosEl.map(semNamespace).join('') : escXml(e.textContent?.trim() ?? '');
    return `<${e.localName}>${dentro}</${e.localName}>`;
}

/** S-1200 e S-1210 aceitos (com recibo) de um XML do download do eSocial. */
export function lerRecibosXml(xml: string, arquivo: string, raizCnpj: string): ReciboEvento[] {
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return [];
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return [];
    const r: ReciboEvento[] = [];
    for (const el of Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === 'evtRemun' || e.localName === 'evtPgtos')) {
        if (val(el, 'ideEmpregador/nrInsc').slice(0, 8) !== raizCnpj) continue;
        if (val(el, 'ideEvento/tpAmb') && val(el, 'ideEvento/tpAmb') !== '1') continue;
        if (el.localName === 'evtRemun' && val(el, 'ideEvento/indApuracao') === '2') continue;
        let env: Element | null = el.parentElement;
        while (env && env.localName !== 'retornoEventoCompleto') env = env.parentElement;
        const ret = env ? no(env, 'recibo/eSocial/retornoEvento') : undefined;
        const nrRecibo = ret ? val(ret, 'recibo/nrRecibo') : '';
        if (!ret || !['201', '202'].includes(val(ret, 'processamento/cdResposta')) || !reciboValido(nrRecibo)) continue;
        const tipo: TipoPeriodico = el.localName === 'evtRemun' ? 'S-1200' : 'S-1210';
        const demonstrativos: Record<string, string[]> = {};
        const extra: Partial<ReciboEvento> = {};
        if (tipo === 'S-1210') {
            const benef = no(el, 'ideBenef');
            extra.pagamentos = benef ? filhos(benef, 'infoPgto').map(pg => ({ tpPgto: val(pg, 'tpPgto'), perRef: val(pg, 'perRef'), ideDmDev: val(pg, 'ideDmDev'), xml: semNamespace(pg) })) : [];
            extra.irComplem = benef ? filhos(benef, 'infoIRComplem').map(semNamespace) : [];
            extra.xmlOrigem = new XMLSerializer().serializeToString(env!);
        }
        if (tipo === 'S-1200') {
            for (const dm of filhos(el, 'dmDev')) {
                const ide = val(dm, 'ideDmDev');
                for (const est of filhos(no(dm, 'infoPerApur') ?? dm, 'ideEstabLot')) for (const rem of filhos(est, 'remunPerApur')) {
                    const mat = val(rem, 'matricula');
                    if (mat && ide && !demonstrativos[mat]?.includes(ide)) demonstrativos[mat] = [...(demonstrativos[mat] ?? []), ide];
                }
            }
        }
        r.push({
            tipo, cpf: digitos(val(el, tipo === 'S-1200' ? 'ideTrabalhador/cpfTrab' : 'ideBenef/cpfBenef')), perApur: val(el, 'ideEvento/perApur'),
            nrRecibo, processadoEm: val(ret, 'processamento/dhProcessamento'), origem: `download do eSocial (${arquivo})`,
            ...(tipo === 'S-1200' ? { demonstrativos } : extra),
        });
    }
    return r;
}

function decodificar(bytes: Uint8Array): string {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('windows-1252').decode(bytes); }
}

/** Recibos de .xml e .zip (inclusive zip dentro de zip). */
export async function lerRecibosArquivos(arquivos: { nome: string; bytes: Uint8Array }[], cnpj: string): Promise<ReciboEvento[]> {
    const raiz = digitos(cnpj).slice(0, 8);
    const fila = [...arquivos]; const r: ReciboEvento[] = []; let abertos = 0;
    while (fila.length) {
        const a = fila.shift()!;
        if (/\.zip$/i.test(a.nome)) {
            if (abertos++ > 50) continue;
            try { for (const x of await lerZip(a.bytes)) fila.push({ nome: `${a.nome}/${x.nome}`, bytes: x.bytes }); } catch { /* zip ilegível: sem recibo */ }
        } else if (/\.xml$/i.test(a.nome)) {
            const xml = decodificar(a.bytes);
            if (/evtRemun|evtPgtos/.test(xml)) r.push(...lerRecibosXml(xml, a.nome, raiz));
        }
    }
    return r;
}

/** Recibos dos S-1200 e S-1210 que o Consultor transmitiu e o eSocial aceitou (esocial_envios, depois da consulta). */
export function recibosDosEnvios(envios: Envio[], fichas: FichaFuncionario[]): ReciboEvento[] {
    const porFicha = new Map(fichas.map(f => [f.id, f]));
    const r: ReciboEvento[] = [];
    for (const e of envios) {
        if (e.tpAmb !== 1) continue;
        for (const ev of e.eventos) {
            if ((ev.tipo !== 'S-1200' && ev.tipo !== 'S-1210') || !ev.nrRecibo || !reciboValido(ev.nrRecibo) || !ev.perApur) continue;
            if (ev.cdResposta !== 201 && ev.cdResposta !== 202) continue;
            const f = ev.ref ? porFicha.get(ev.ref) : undefined;
            if (!f) continue;
            r.push({ tipo: ev.tipo, cpf: digitos(f.cpf), perApur: ev.perApur, nrRecibo: ev.nrRecibo, processadoEm: e.consultadoEm ?? e.enviadoEm ?? '', origem: `transmitido pelo Consultor (protocolo ${e.protocolo})` });
        }
    }
    return r;
}

/**
 * Instante para comparar recibos: o envio do Consultor vem em UTC ("Z") e o
 * dhProcessamento do download, na hora de Brasília sem fuso (sem horário de
 * verão desde 2019, -03:00).
 */
export function instante(t: string): number {
    if (!t) return 0;
    const s = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00` : t;
    const ms = Date.parse(/([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : `${s}-03:00`);
    return Number.isFinite(ms) ? ms : 0;
}

/** Exclusão (S-3000) aceita: quando e, nos envios novos, de quem e de que mês (ref "exclui:recibo:cpf:AAAA-MM"). */
export interface Exclusao { em: string; cpf: string; perApur: string }

/** Exclusões (S-3000) que o Consultor transmitiu e o eSocial aceitou, por recibo excluído. */
export function exclusoesDosEnvios(envios: Envio[]): Map<string, Exclusao> {
    const m = new Map<string, Exclusao>();
    for (const e of envios) {
        if (e.tpAmb !== 1) continue;
        for (const ev of e.eventos) {
            const [alvo = '', cpf = '', perApur = ''] = ev.ref?.startsWith('exclui:') ? ev.ref.slice(7).split(':') : [];
            if (ev.tipo === 'S-3000' && reciboValido(alvo) && ev.nrRecibo && (ev.cdResposta === 201 || ev.cdResposta === 202)) m.set(alvo, { em: e.consultadoEm ?? e.enviadoEm ?? '', cpf, perApur });
        }
    }
    return m;
}

/**
 * O recibo que vale (processado por último) de cada CPF, por tipo e período.
 * O mesmo recibo lido do download e dos envios vira um só. Excluído pelo
 * Consultor, volta marcado (excluidoEm): o S-1210 vai de novo como original.
 * Um S-1210 excluído cujo recibo não foi carregado (tela reaberta sem o
 * download) volta só com a marca, sem os pagamentos: o reenvio fica bloqueado.
 */
export function recibosVigentes(recibos: ReciboEvento[], tipo: TipoPeriodico, perApur: string, exclusoes = new Map<string, Exclusao>()): Map<string, ReciboEvento> {
    const depois = (a: string, b: string) => instante(a) > instante(b);
    const porRecibo = new Map<string, ReciboEvento>();
    for (const r of recibos) {
        if (r.tipo !== tipo || r.perApur !== perApur || !r.cpf) continue;
        const a = porRecibo.get(r.nrRecibo);
        porRecibo.set(r.nrRecibo, a ? { ...a, ...r, ...(a.pagamentos && !r.pagamentos ? { pagamentos: a.pagamentos, irComplem: a.irComplem, xmlOrigem: a.xmlOrigem } : {}),
            demonstrativos: a.demonstrativos ?? r.demonstrativos, processadoEm: depois(a.processadoEm, r.processadoEm) ? a.processadoEm : r.processadoEm,
            origem: a.origem === r.origem ? a.origem : `${a.origem}; ${r.origem}` } : r);
    }
    const m = new Map<string, ReciboEvento>();
    const comDemonstrativos = new Map<string, ReciboEvento>();
    for (const r of porRecibo.values()) {
        if (r.demonstrativos && Object.keys(r.demonstrativos).length && (!comDemonstrativos.has(r.cpf) || depois(r.processadoEm, comDemonstrativos.get(r.cpf)!.processadoEm))) comDemonstrativos.set(r.cpf, r);
        const a = m.get(r.cpf);
        if (!a || depois(r.processadoEm, a.processadoEm)) m.set(r.cpf, r);
    }
    // Marca de exclusão sem o recibo excluído carregado: só leva pagamentos do próprio recibo excluído, nunca os
    // de uma versão mais antiga do mesmo mês (o reenvio sairia com um conjunto de pagamentos desatualizado).
    if (tipo === 'S-1210') for (const [nrRecibo, ex] of exclusoes) {
        if (!ex.cpf || ex.perApur !== perApur) continue;
        const a = m.get(ex.cpf);
        if (!a || (a.nrRecibo !== nrRecibo && depois(ex.em, a.processadoEm))) {
            m.set(ex.cpf, { tipo, cpf: ex.cpf, perApur, nrRecibo, processadoEm: ex.em, origem: 'excluído pelo Consultor (S-3000)' });
        }
    }
    for (const [cpf, r] of m) {
        let v = r;
        // O retificador do Consultor repete os demonstrativos do original do IOB: o recibo mais novo pode não trazê-los.
        // Vale o recibo mais novo que os traz (não a soma de versões: uma retificação do IOB pode ter tirado algum).
        if (!v.demonstrativos && comDemonstrativos.has(cpf)) v = { ...v, demonstrativos: comDemonstrativos.get(cpf)!.demonstrativos };
        // Os pagamentos e o IR só do próprio recibo: o de uma versão anterior (o baixado antes de o Consultor reenviar)
        // não tem o que o reenvio acrescentou, e o S-1210 voltaria sem eles. Sem o conteúdo do que vale, o reenvio pede o download.
        const c = porRecibo.get(v.nrRecibo);
        if (!v.pagamentos && c?.pagamentos) v = { ...v, pagamentos: c.pagamentos, irComplem: c.irComplem, xmlOrigem: c.xmlOrigem };
        if (exclusoes.has(v.nrRecibo)) v = { ...v, excluidoEm: exclusoes.get(v.nrRecibo)!.em || 'excluído' };
        m.set(cpf, v);
    }
    return m;
}
