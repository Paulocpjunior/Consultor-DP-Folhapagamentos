// services/folha/apontamentoParser.ts
// Parser client-side do apontamento de folha (lê xlsx via SheetJS).
// Princípio: parser nomeado pelo cliente + origem.

import * as XLSX from 'xlsx';
import type { ApontamentoParseado, EmpresaApontamento, FuncionarioApontamento } from './folhaTypes';

const PARSER_ID = 'apontamento-folha-multi';
const PARSER_VERSAO = '2.0.0';

/**
 * Cabeçalhos aceitos na coluna A para identificar uma aba como apontamento.
 * Já normalizados (lowercase, sem acentos) — comparar com `norm()`.
 */
const NAME_HEADERS = new Set([
    'nome',
    'nome completo',
    'funcionario',
    'funcionarios',
    'colaborador',
    'colaboradores',
    'empregado',
    'empregados',
]);

/** Normaliza string para comparação (lowercase, sem acentos). */
export function norm(s: unknown): string {
    return String(s ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

/** Trim tolerante a null/undefined/NaN. */
export function trimOrNull(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}

/** Converte célula (number ou string pt-BR) para number; null se vazio/NaN. */
export function toNumber(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/\./g, '').replace(',', '.').trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Lê um arquivo xlsx e devolve a estrutura bruta do apontamento.
 * Cada sheet é tratada como uma empresa.
 * Cabeçalho aceito em A1: NOME, Funcionário, Colaborador, Empregado, etc.
 */
export async function parseApontamentoFile(file: File | Blob): Promise<ApontamentoParseado> {
    const buffer = await file.arrayBuffer();
    return parseApontamentoBuffer(buffer);
}

export function parseApontamentoBuffer(buffer: ArrayBuffer | Uint8Array): ApontamentoParseado {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const empresas: EmpresaApontamento[] = [];

    for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: null,
            blankrows: false,
        });

        if (!rows.length) continue;

        const header = (rows[0] as unknown[]).map((c) =>
            c === null || c === undefined ? '' : String(c).trim()
        );
        if (!header.length || !NAME_HEADERS.has(norm(header[0]))) {
            // sheet ignorada — A1 não é um cabeçalho de nome reconhecido
            continue;
        }

        const funcionarios: FuncionarioApontamento[] = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i] as unknown[];
            const nome = trimOrNull(r[0]);
            if (!nome) continue;
            if (/^total/i.test(nome)) continue;

            const celulas: Record<string, unknown> = {};
            for (let c = 1; c < header.length; c++) {
                const colName = header[c];
                if (!colName) continue;
                celulas[colName] = r[c] ?? null;
            }

            funcionarios.push({
                nome,
                celulas,
                obs: trimOrNull(celulas['OBS']),
            });
        }

        empresas.push({
            nome: sheetName,
            colunas: header.slice(1).filter((c): c is string => Boolean(c)),
            funcionarios,
        });
    }

    return {
        parser: PARSER_ID,
        versao: PARSER_VERSAO,
        processado_em: new Date().toISOString(),
        empresas,
    };
}
