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
    /** Só no S-1200: matrícula → ideDmDev do demonstrativo. */
    demonstrativos?: Record<string, string>;
}

export const reciboValido = (r: string) => /^1\.\d\.\d{19}$/.test(r);
const filhos = (e: Element, n: string) => Array.from(e.children).filter(c => c.localName === n);
const no = (e: Element | null | undefined, caminho: string) => caminho.split('/').reduce<Element | undefined>((p, n) => p && filhos(p, n)[0], e ?? undefined);
const val = (e: Element | null | undefined, caminho: string) => no(e, caminho)?.textContent?.trim() ?? '';
const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');

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
        const demonstrativos: Record<string, string> = {};
        if (tipo === 'S-1200') {
            for (const dm of filhos(el, 'dmDev')) {
                const ide = val(dm, 'ideDmDev');
                for (const est of filhos(no(dm, 'infoPerApur') ?? dm, 'ideEstabLot')) for (const rem of filhos(est, 'remunPerApur')) if (val(rem, 'matricula') && ide) demonstrativos[val(rem, 'matricula')] = ide;
            }
        }
        r.push({
            tipo, cpf: digitos(val(el, tipo === 'S-1200' ? 'ideTrabalhador/cpfTrab' : 'ideBenef/cpfBenef')), perApur: val(el, 'ideEvento/perApur'),
            nrRecibo, processadoEm: val(ret, 'processamento/dhProcessamento'), origem: `download do eSocial (${arquivo})`,
            ...(tipo === 'S-1200' ? { demonstrativos } : {}),
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

/** O recibo que vale (processado por último) de cada CPF, por tipo e período. */
export function recibosVigentes(recibos: ReciboEvento[], tipo: TipoPeriodico, perApur: string): Map<string, ReciboEvento> {
    const m = new Map<string, ReciboEvento>();
    const demonstrativos = new Map<string, Record<string, string>>();
    for (const r of recibos) {
        if (r.tipo !== tipo || r.perApur !== perApur || !r.cpf) continue;
        if (r.demonstrativos && Object.keys(r.demonstrativos).length) demonstrativos.set(r.cpf, { ...demonstrativos.get(r.cpf), ...r.demonstrativos });
        const a = m.get(r.cpf);
        if (!a || r.processadoEm > a.processadoEm) m.set(r.cpf, r);
    }
    // O retificador do Consultor repete o demonstrativo do original do IOB: o recibo mais novo pode não trazê-lo.
    for (const [cpf, r] of m) if (!r.demonstrativos && demonstrativos.has(cpf)) m.set(cpf, { ...r, demonstrativos: demonstrativos.get(cpf) });
    return m;
}
