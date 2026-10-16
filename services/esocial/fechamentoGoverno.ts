// services/esocial/fechamentoGoverno.ts
//
// Fechamento (S-1299) e reabertura (S-1298) transmitidos FORA do Consultor (IOB/Folhamatic), achados no eSocial
// pela conciliação da Saúde do eSocial, passam a ficar registrados em esocial_envios (Paulo, 13/10/2026: "pode
// seguir com os 3 itens"). É deles que o servidor (CFI e plataforma, dp-fechamento-esocial.js) acende o selo
// "DP/Folha — eSocial" do semáforo da DCTFWeb, com a mesma régua de um S-1299 do Consultor:
//   tpAmb 1, a raiz do CNPJ, eventos[] com tipo 'S-1299' e perApur 'AAAA-MM', lote 'processado', evento com
//   cdResposta 201/202 e nrRecibo; um S-1298 posterior (enviadoEm) derruba o selo.
//
// O registro é um por recibo, id "governo-<nrRecibo>" (as regras exigem): não duplica nem com dois usuários ao
// mesmo tempo. Marcado como vindo do governo (origem 'governo', importadoEm, importadoPor): sem protocolo, nunca é
// lote a consultar nem a reenviar. Só produção e só com recibo. A data é a da recepção no eSocial (recibo baixado
// pelo Id); se o download falhar, a do Id do evento (geração, logo antes do envio) — marcada em dataFonte.

import type { Usuario } from '../cadastros/cadastrosService';
import { baixarEventos, type ArquivoBaixado } from './downloadEventos';
import { instante, reciboValido } from './recibosEsocial';
import type { TpAmb } from './transmissao';
import type { Envio } from './transmissaoService';

export const ORIGEM_GOVERNO = 'governo';
export const TIPOS_FECHAMENTO = ['S-1299', 'S-1298'] as const;
export type TipoFechamento = (typeof TIPOS_FECHAMENTO)[number];

/** Registro importado do eSocial (transmitido fora do Consultor): não é lote do Consultor. */
export const doGoverno = (e: Pick<Envio, 'origem'>) => e.origem === ORIGEM_GOVERNO;
/** Id do documento em esocial_envios: um por recibo. */
export const idDoGoverno = (nrRecibo: string) => `governo-${nrRecibo}`;

export interface FechamentoAchado { tipo: TipoFechamento; id: string; nrRec: string }

/** Os S-1299/S-1298 do governo que ainda não estão registrados (nem pelo Consultor, nem importados antes). */
export function fechamentosParaImportar(governo: Partial<Record<string, { id: string; nrRec: string }[]>>, envios: Envio[], tpAmb: TpAmb): FechamentoAchado[] {
    if (tpAmb !== 1) return [];
    const recibos = new Set<string>();
    const ids = new Set<string>();
    for (const env of envios) for (const ev of env.eventos ?? []) { ids.add(ev.id); if (ev.nrRecibo) recibos.add(ev.nrRecibo); }
    const out: FechamentoAchado[] = [];
    for (const tipo of TIPOS_FECHAMENTO) {
        for (const i of governo[tipo] ?? []) {
            const nrRec = String(i?.nrRec ?? '').trim();
            // Sem recibo, não grava. O Id que o Consultor transmitiu é da conciliação (recibos do "sem resposta").
            if (!reciboValido(nrRec) || recibos.has(nrRec) || ids.has(i.id)) continue;
            recibos.add(nrRec);
            out.push({ tipo, id: i.id, nrRec });
        }
    }
    return out;
}

const tag = (xml: string, nome: string) => new RegExp(`<(?:\\w+:)?${nome}>([^<]*)</(?:\\w+:)?${nome}>`).exec(xml)?.[1]?.trim() ?? '';

/** O que importa do recibo (retornoEvento) baixado: recepção, resultado, ambiente e número. */
export function lerReciboDoGoverno(rec: string): { dhRecepcao: string; dhProcessamento: string; cdResposta: number | null; tpAmb: number | null; nrRecibo: string } {
    const cd = tag(rec, 'cdResposta');
    const amb = tag(rec, 'tpAmb');
    return { dhRecepcao: tag(rec, 'dhRecepcao'), dhProcessamento: tag(rec, 'dhProcessamento'), cdResposta: cd ? Number(cd) : null, tpAmb: amb ? Number(amb) : null, nrRecibo: tag(rec, 'nrRecibo') };
}

/** Data e hora de geração gravadas no Id do evento (ID + tpInsc + inscrição com 14 posições, letras do CNPJ alfanumérico
 * nas 12 primeiras + AAAAMMDDHHMMSS + sequencial), Brasília. */
export function dataDoId(id: string): string | null {
    const m = /^ID\d[A-Z0-9]{12}\d{2}(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\d{5}$/.exec(id ?? '');
    if (!m) return null;
    const ms = instante(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
    return ms ? new Date(ms).toISOString() : null;
}

/** O documento do fechamento achado no governo (sem os carimbos de servidor). `motivo`: não grava. */
export interface FechamentoDoGoverno {
    docId: string;
    dados: {
        empresaId: string; cnpj: string; tpAmb: 1; grupo: 3; protocolo: ''; dhRecepcao: string; transmissor: ''; situacao: 'processado';
        cdResposta: number; descResposta: string; ocorrencias: []; consultas: 0;
        eventos: [{ id: string; tipo: TipoFechamento; perApur: string; cdResposta: number; descResposta: string; nrRecibo: string }];
        origem: 'governo'; dataFonte: 'recibo' | 'id-do-evento';
    };
    /** ISO (UTC) da recepção no eSocial: vira o enviadoEm. */
    enviadoEm: string;
}

export function montarFechamentoDoGoverno(p: { empresa: { id: string; cnpj: string }; perApur: string; achado: FechamentoAchado; arquivo?: Pick<ArquivoBaixado, 'rec'> | null }): FechamentoDoGoverno | { motivo: string } {
    const { achado, perApur } = p;
    if (!reciboValido(achado.nrRec)) return { motivo: 'sem recibo válido' };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(perApur)) return { motivo: 'competência inválida' };
    const r = p.arquivo?.rec ? lerReciboDoGoverno(p.arquivo.rec) : null;
    if (r?.tpAmb !== null && r?.tpAmb !== undefined && r.tpAmb !== 1) return { motivo: 'recibo de outro ambiente' };
    if (r?.nrRecibo && r.nrRecibo !== achado.nrRec) return { motivo: 'o recibo baixado não confere' };
    if (r && r.cdResposta !== null && r.cdResposta !== 201 && r.cdResposta !== 202) return { motivo: `não aceito no eSocial (${r.cdResposta})` };
    const doRecibo = r ? instante(r.dhRecepcao || r.dhProcessamento) : 0;
    const enviadoEm = doRecibo ? new Date(doRecibo).toISOString() : dataDoId(achado.id);
    if (!enviadoEm) return { motivo: 'sem a data da recepção' };
    const cdResposta = r?.cdResposta ?? 201;
    const descResposta = `Transmitido fora do Consultor (IOB/Folhamatic): ${achado.tipo} importado do eSocial pela conciliação.`;
    return {
        docId: idDoGoverno(achado.nrRec),
        enviadoEm,
        dados: {
            empresaId: p.empresa.id, cnpj: p.empresa.cnpj, tpAmb: 1, grupo: 3, protocolo: '', dhRecepcao: r?.dhRecepcao ?? '', transmissor: '', situacao: 'processado',
            cdResposta, descResposta, ocorrencias: [], consultas: 0,
            eventos: [{ id: achado.id, tipo: achado.tipo, perApur, cdResposta, descResposta, nrRecibo: achado.nrRec }],
            origem: 'governo', dataFonte: doRecibo ? 'recibo' : 'id-do-evento',
        },
    };
}

export interface ResultadoImportacao { importados: { tipo: TipoFechamento; nrRecibo: string; enviadoEm: string }[]; ignorados: { nrRecibo: string; motivo: string }[]; erro?: string; pedidosHoje?: number | null }

export interface DepsImportacao {
    baixar?: (cnpj: string, ids: string[]) => Promise<{ arquivos: ArquivoBaixado[]; pedidosHoje?: number | null }>;
    gravar: (f: FechamentoDoGoverno, u: Usuario) => Promise<void>;
}

/**
 * Grava os S-1299/S-1298 do governo que faltam em esocial_envios. Só produção; idempotente pelo recibo. Baixa os
 * recibos pelo Id numa chamada só (a data e o código da recepção); download que falha não impede (data do Id).
 */
export async function importarFechamentosDoGoverno(p: {
    empresa: { id: string; cnpj: string }; perApur: string; tpAmb: TpAmb;
    governo: Partial<Record<string, { id: string; nrRec: string }[]>>; envios: Envio[]; usuario: Usuario;
}, deps: DepsImportacao): Promise<ResultadoImportacao> {
    const out: ResultadoImportacao = { importados: [], ignorados: [] };
    if (p.tpAmb !== 1) return out;
    const achados = fechamentosParaImportar(p.governo, p.envios, p.tpAmb);
    if (!achados.length) return out;
    let arquivos: ArquivoBaixado[] = [];
    if (deps.baixar) {
        try { const d = await deps.baixar(p.empresa.cnpj, achados.map(a => a.id)); arquivos = d.arquivos ?? []; out.pedidosHoje = d.pedidosHoje ?? null; }
        catch (e) { out.erro = `recibos não baixados (${(e as Error).message}); a data é a do Id do evento`; }
    }
    const porId = new Map(arquivos.map(a => [a.id, a]));
    for (const achado of achados) {
        const f = montarFechamentoDoGoverno({ empresa: p.empresa, perApur: p.perApur, achado, arquivo: porId.get(achado.id) });
        if ('motivo' in f) { out.ignorados.push({ nrRecibo: achado.nrRec, motivo: f.motivo }); continue; }
        try {
            await deps.gravar(f, p.usuario);
            out.importados.push({ tipo: achado.tipo, nrRecibo: achado.nrRec, enviadoEm: f.enviadoEm });
        } catch (e) {
            out.ignorados.push({ nrRecibo: achado.nrRec, motivo: `não gravado: ${(e as Error).message}` });
        }
    }
    return out;
}

/** Download padrão: o certificado do escritório, como a conciliação. */
export const baixarRecibosDoGoverno = (cnpj: string, ids: string[]) => baixarEventos(cnpj, ids, 'escritorio');
