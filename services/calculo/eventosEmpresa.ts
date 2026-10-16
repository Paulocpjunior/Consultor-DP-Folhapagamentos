// services/calculo/eventosEmpresa.ts
//
// Tabela de eventos da empresa (o que ainda prende ao SAGE, item 2): o catálogo geral do Consultor veio de outro cliente
// do IOB, e cada empresa tem a sua tabela de eventos no SAGE (o triênio da SP é o 1015, que não está no geral). A tabela
// da empresa entra por planilha (o modelo exportado daqui, preenchido pela "Relação de Eventos" do SAGE) ou pelo JSON do
// script que lê o PDF da relação, e vale só para ela: substitui o catálogo geral ou o completa. Puro.

import * as XLSX from 'xlsx';
import type { EventoIobSage, IncidenciasEvento } from '../folha/folhaTypes';

export type ModoTabelaEventos = 'substitui' | 'completa';
export interface TabelaEventosEmpresa {
    empresaId: string;
    eventos: EventoIobSage[];
    /** substitui: só a tabela da empresa vale; completa: a da empresa por cima do catálogo geral. */
    modo: ModoTabelaEventos;
    origem: string;
    atualizadoPor: string; atualizadoPorEmail: string;
    atualizadoEm?: Date | null;
}

export const COLUNAS_PLANILHA = ['Código', 'Descrição', 'Tipo (V/D)', 'R/V', 'Coeficiente', 'Rotina', 'INSS', 'IRRF', 'FGTS', 'INSS férias', 'IRRF férias', 'Rend. tributável', 'RAIS'] as const;
const INC: [keyof IncidenciasEvento, (typeof COLUNAS_PLANILHA)[number]][] = [['in', 'INSS'], ['ir', 'IRRF'], ['fg', 'FGTS'], ['inf', 'INSS férias'], ['irf', 'IRRF férias'], ['rt', 'Rend. tributável'], ['vr', 'RAIS']];

const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const codigoEvento = (c: string) => c.trim().replace(/\D/g, '').padStart(4, '0');

/** Linhas do modelo de planilha (cabeçalho + um evento por linha). */
export function planilhaEventos(eventos: EventoIobSage[]): (string | number)[][] {
    return [[...COLUNAS_PLANILHA], ...eventos.map(e => [e.codigo, e.descricao, e.tipo, e.rv, e.coeficiente, e.ro, ...INC.map(([k]) => e.incidencias[k])])];
}

const sn = (v: unknown): 'S' | 'N' => (/^(s|sim|x|1|true)$/i.test(String(v ?? '').trim()) ? 'S' : 'N');
const num = (v: unknown) => { const t = String(v ?? '').trim().replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.'); const n = Number(t); return Number.isFinite(n) ? n : NaN; };

export interface LeituraTabelaEventos { eventos: EventoIobSage[]; erros: string[] }

/** Valida e normaliza os eventos lidos (código de 4 dígitos, tipo V/D, R/V, rotina de 3 dígitos), sem repetir código. */
function normalizar(brutos: Partial<EventoIobSage>[], linhaInicial: number): LeituraTabelaEventos {
    const erros: string[] = [];
    const vistos = new Map<string, number>();
    const eventos: EventoIobSage[] = [];
    brutos.forEach((b, i) => {
        const linha = i + linhaInicial;
        const digitos = String(b.codigo ?? '').trim().replace(/\D/g, '');
        if (!digitos || digitos.length > 4) { erros.push(`Linha ${linha}: código "${b.codigo ?? ''}" inválido (até 4 dígitos).`); return; }
        const codigo = digitos.padStart(4, '0');
        if (!b.descricao?.trim()) { erros.push(`Linha ${linha} (${codigo}): sem descrição.`); return; }
        const tipo = String(b.tipo ?? '').trim().toUpperCase().charAt(0);
        if (tipo !== 'V' && tipo !== 'D') { erros.push(`Linha ${linha} (${codigo}): tipo "${b.tipo ?? ''}" (V = vencimento, D = desconto).`); return; }
        const rv = String(b.rv ?? 'V').trim().toUpperCase().charAt(0) || 'V';
        if (rv !== 'R' && rv !== 'V') { erros.push(`Linha ${linha} (${codigo}): R/V "${b.rv}" (R = referência, V = valor).`); return; }
        const coef = b.coeficiente === undefined || String(b.coeficiente).trim() === '' ? 0 : num(b.coeficiente);
        if (!Number.isFinite(coef)) { erros.push(`Linha ${linha} (${codigo}): coeficiente "${b.coeficiente}" inválido.`); return; }
        const ro = String(b.ro ?? '000').trim().replace(/\D/g, '').padStart(3, '0');
        if (!/^\d{3}$/.test(ro)) { erros.push(`Linha ${linha} (${codigo}): rotina "${b.ro}" com 3 dígitos.`); return; }
        if (vistos.has(codigo)) { erros.push(`Linha ${linha}: código ${codigo} repetido (linha ${vistos.get(codigo)}).`); return; }
        vistos.set(codigo, linha);
        const inc = b.incidencias ?? ({} as Partial<IncidenciasEvento>);
        eventos.push({ codigo, descricao: b.descricao.trim(), tipo, rv, coeficiente: coef, ro,
            incidencias: { ir: sn(inc.ir), in: sn(inc.in), irf: sn(inc.irf), inf: sn(inc.inf), fg: sn(inc.fg), rt: sn(inc.rt), vr: sn(inc.vr) } });
    });
    return { eventos: eventos.sort((a, b) => a.codigo.localeCompare(b.codigo)), erros };
}

/** Lê a tabela de eventos da empresa: JSON do script (catálogo ou lista) ou planilha XLSX/XLS/CSV no modelo daqui. */
export function lerTabelaEventos(nome: string, conteudo: ArrayBuffer): LeituraTabelaEventos {
    const ext = nome.toLowerCase().split('.').pop() ?? '';
    if (ext === 'json') {
        let j: unknown;
        try { j = JSON.parse(new TextDecoder('utf-8').decode(conteudo).replace(/^﻿/, '')); } catch { throw new Error('JSON inválido.'); }
        const lista = Array.isArray(j) ? j : (j as { eventos?: unknown }).eventos;
        if (!Array.isArray(lista) || !lista.length) throw new Error('O JSON não traz a lista "eventos".');
        return normalizar(lista as Partial<EventoIobSage>[], 1);
    }
    const wb = ext === 'csv' ? XLSX.read(new TextDecoder('utf-8').decode(conteudo).replace(/^﻿/, ''), { type: 'string', raw: true }) : XLSX.read(conteudo, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('Planilha vazia.');
    const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' });
    if (!linhas.length) throw new Error('Planilha sem eventos.');
    const col = (l: Record<string, unknown>, nomeCol: string) => { const k = Object.keys(l).find(x => chave(x) === chave(nomeCol)); return k ? l[k] : undefined; };
    if (!Object.keys(linhas[0]).some(k => chave(k) === chave('Código')) || !Object.keys(linhas[0]).some(k => chave(k) === chave('Descrição')))
        throw new Error('A planilha precisa das colunas do modelo (Código, Descrição, Tipo (V/D), R/V, Coeficiente, Rotina e as incidências). Exporte o modelo nesta tela.');
    return normalizar(linhas.map(l => ({
        codigo: String(col(l, 'Código') ?? ''), descricao: String(col(l, 'Descrição') ?? ''), tipo: String(col(l, 'Tipo (V/D)') ?? col(l, 'Tipo') ?? '') as EventoIobSage['tipo'],
        rv: String(col(l, 'R/V') ?? 'V') as EventoIobSage['rv'], coeficiente: col(l, 'Coeficiente') as number, ro: String(col(l, 'Rotina') ?? '000'),
        incidencias: Object.fromEntries(INC.map(([k, c]) => [k, sn(col(l, c))])) as unknown as IncidenciasEvento,
    })), 2);
}

/** O catálogo que vale para a empresa: o geral, a tabela dela por cima (completa) ou só a dela (substitui). */
export function eventosDaEmpresa(geral: EventoIobSage[], tabela: Pick<TabelaEventosEmpresa, 'eventos' | 'modo'> | null | undefined): EventoIobSage[] {
    if (!tabela?.eventos.length) return geral;
    if (tabela.modo === 'substitui') return tabela.eventos;
    const mapa = new Map(geral.map(e => [e.codigo, e]));
    for (const e of tabela.eventos) mapa.set(e.codigo, e);
    return [...mapa.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export interface ComparacaoTabela { novos: string[]; diferentes: string[]; iguais: number; soNoGeral: number }
/** O que a tabela da empresa muda em relação ao catálogo geral (para a prévia da importação). */
export function compararComGeral(geral: EventoIobSage[], empresa: EventoIobSage[]): ComparacaoTabela {
    const g = new Map(geral.map(e => [e.codigo, e]));
    const novos: string[] = []; const diferentes: string[] = []; let iguais = 0;
    for (const e of empresa) {
        const x = g.get(e.codigo);
        if (!x) novos.push(e.codigo);
        else if (JSON.stringify({ ...x, codigo: '' }) !== JSON.stringify({ ...e, codigo: '' })) diferentes.push(e.codigo);
        else iguais++;
    }
    const naEmpresa = new Set(empresa.map(e => e.codigo));
    return { novos, diferentes, iguais, soNoGeral: geral.filter(e => !naEmpresa.has(e.codigo)).length };
}

/** Códigos usados nos lançamentos automáticos das fichas que não estão no catálogo da empresa. */
export function codigosAusentes(eventos: EventoIobSage[], fichas: { dados: { nome?: string }; lancamentosAutomaticos?: { codigoEvento: string }[] }[]): { codigo: string; fichas: string[] }[] {
    const tem = new Set(eventos.map(e => e.codigo));
    const faltam = new Map<string, string[]>();
    for (const f of fichas) for (const l of f.lancamentosAutomaticos ?? []) {
        const c = codigoEvento(l.codigoEvento);
        if (!tem.has(c)) faltam.set(c, [...new Set([...(faltam.get(c) ?? []), f.dados.nome ?? ''])]);
    }
    return [...faltam.entries()].map(([codigo, fichas]) => ({ codigo, fichas })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}
