// services/folha/apontamentoParser.ts
// Parser client-side do apontamento de folha (lê xlsx via SheetJS).
// Princípio: parser nomeado pelo cliente + origem.
//
// v2.2.0 — adicionada lista negra de "Planilha1..PlanilhaN" (abas auxiliares
//          padrão do Excel que clientes deixam no arquivo, ex.: SPA Saúde).
// v2.1.0 — busca inteligente do cabeçalho:
//   - Varre as primeiras 15 linhas e 30 colunas de cada aba procurando uma
//     célula com texto "Nome", "Funcionário", "Colaborador", "Empregado" etc.
//   - A linha onde for encontrado vira o cabeçalho; a coluna onde for
//     encontrado vira a coluna do nome do funcionário (não precisa ser A).
//   - Mantém compat com layouts antigos (cabeçalho em A1, nome em coluna A).
//   - Suporta layouts onde A1 é um título e o cabeçalho real fica abaixo
//     (ex.: SPA Saúde — aba "FOPAG", título em A1, cabeçalho na linha 3,
//     "Funcionário" na coluna C, dados a partir da linha 4).

import * as XLSX from 'xlsx';
import type { ApontamentoParseado, EmpresaApontamento, FuncionarioApontamento } from './folhaTypes';

const PARSER_ID = 'apontamento-folha-multi';
const PARSER_VERSAO = '2.2.0';

/** Quantas linhas iniciais escanear procurando o cabeçalho. */
const MAX_HEADER_ROWS = 15;
/** Quantas colunas iniciais escanear procurando o nome do funcionário. */
const MAX_HEADER_COLS = 30;

/**
 * Cabeçalhos aceitos como "coluna do nome do funcionário".
 * Já normalizados (lowercase, sem acentos) — comparar com `norm()`.
 */
const NAME_HEADERS = new Set([
    'nome',
    'nome completo',
    'nome do funcionario',
    'nome do colaborador',
    'nome do empregado',
    'funcionario',
    'funcionarios',
    'colaborador',
    'colaboradores',
    'empregado',
    'empregados',
    'servidor',
    'servidores',
]);

/** Nomes de abas que devem ser sempre ignoradas (lista negra exata, normalizada). */
const SHEET_BLACKLIST = new Set([
    'controles',
    'parametros',
    'parametro',
    'config',
    'configuracao',
    'configuracoes',
    'legenda',
    'legendas',
    'sumario',
    'resumo',
    'instrucoes',
    'instrucao',
    'observacoes',
    'observacao',
    'auxiliar',
    'auxiliares',
    'lista',
    'listas',
]);

/**
 * Padrões regex de nomes de abas que devem ser sempre ignorados.
 * "Planilha1", "Planilha2", "Plan1", "Sheet1", etc. — abas auxiliares
 * do Excel que clientes esquecem no arquivo.
 */
const SHEET_BLACKLIST_PATTERNS: RegExp[] = [
    /^planilha\d+$/i,
    /^plan\d+$/i,
    /^sheet\d+$/i,
    /^aba\d+$/i,
];

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

/** Verifica se um nome de aba está na lista negra. */
function isBlacklisted(sheetName: string): boolean {
    const n = norm(sheetName);
    if (SHEET_BLACKLIST.has(n)) return true;
    return SHEET_BLACKLIST_PATTERNS.some((rx) => rx.test(sheetName));
}

/**
 * Procura, nas primeiras `MAX_HEADER_ROWS` linhas e `MAX_HEADER_COLS` colunas,
 * uma célula que contenha um cabeçalho de nome de funcionário.
 * Retorna `{ headerRow, nameCol }` (índices 0-based) ou `null` se não achar.
 */
export function findHeader(
    rows: unknown[][]
): { headerRow: number; nameCol: number } | null {
    const maxRow = Math.min(rows.length, MAX_HEADER_ROWS);
    for (let r = 0; r < maxRow; r++) {
        const row = rows[r] || [];
        const maxCol = Math.min(row.length, MAX_HEADER_COLS);
        for (let c = 0; c < maxCol; c++) {
            if (NAME_HEADERS.has(norm(row[c]))) {
                return { headerRow: r, nameCol: c };
            }
        }
    }
    return null;
}

/**
 * Lê um arquivo xlsx e devolve a estrutura bruta do apontamento.
 * Cada sheet com cabeçalho válido vira uma empresa.
 */
export async function parseApontamentoFile(file: File | Blob): Promise<ApontamentoParseado> {
    const buffer = await file.arrayBuffer();
    return parseApontamentoBuffer(buffer);
}

export function parseApontamentoBuffer(buffer: ArrayBuffer | Uint8Array): ApontamentoParseado {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const empresas: EmpresaApontamento[] = [];
    const debug: string[] = [];

    for (const sheetName of workbook.SheetNames) {
        // Lista negra de abas auxiliares
        if (isBlacklisted(sheetName)) {
            debug.push(`[skip:blacklist] "${sheetName}"`);
            continue;
        }

        const ws = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: null,
            blankrows: false,
        });

        if (!rows.length) {
            debug.push(`[skip:vazia] "${sheetName}"`);
            continue;
        }

        const found = findHeader(rows);
        if (!found) {
            debug.push(
                `[skip:sem-header] "${sheetName}" — nenhum dos termos ` +
                `(${[...NAME_HEADERS].slice(0, 4).join(', ')}…) encontrado nas ` +
                `${Math.min(rows.length, MAX_HEADER_ROWS)} primeiras linhas.`
            );
            continue;
        }

        const { headerRow, nameCol } = found;
        const headerRaw = (rows[headerRow] as unknown[]).map((c) =>
            c === null || c === undefined ? '' : String(c).trim()
        );

        // Colunas de dados = todas as colunas do cabeçalho com nome,
        // excluindo a coluna do próprio funcionário.
        const colunas: string[] = [];
        for (let c = 0; c < headerRaw.length; c++) {
            if (c === nameCol) continue;
            const name = headerRaw[c];
            if (name) colunas.push(name);
        }

        const funcionarios: FuncionarioApontamento[] = [];
        for (let i = headerRow + 1; i < rows.length; i++) {
            const r = rows[i] as unknown[];
            if (!r) continue;
            const nome = trimOrNull(r[nameCol]);
            if (!nome) continue;
            // Linhas de totalizadores ("TOTAL", "Total geral", etc.) são ignoradas.
            if (/^total/i.test(nome)) continue;
            // Sub-totais por seção também aparecem com prefixos comuns.
            if (/^subtotal/i.test(nome)) continue;

            const celulas: Record<string, unknown> = {};
            for (let c = 0; c < headerRaw.length; c++) {
                if (c === nameCol) continue;
                const colName = headerRaw[c];
                if (!colName) continue;
                celulas[colName] = r[c] ?? null;
            }

            funcionarios.push({
                nome,
                celulas,
                obs: trimOrNull(celulas['OBS'] ?? celulas['Observação'] ?? celulas['Observacao']),
            });
        }

        // Aba sem funcionários (ex.: header reconhecido mas dados vazios)
        if (!funcionarios.length) {
            debug.push(
                `[skip:sem-dados] "${sheetName}" — header reconhecido na linha ` +
                `${headerRow + 1}, coluna ${nameCol + 1}, mas não há funcionários abaixo.`
            );
            continue;
        }

        debug.push(
            `[ok] "${sheetName}" — header L${headerRow + 1}, coluna ${nameCol + 1} ` +
            `("${headerRaw[nameCol]}"), ${funcionarios.length} funcionário(s), ` +
            `${colunas.length} coluna(s) de dados.`
        );

        empresas.push({
            nome: sheetName,
            colunas,
            funcionarios,
        });
    }

    // Log de debug útil pra rastrear por que abas foram ignoradas
    if (typeof console !== 'undefined') {
        console.log('[apontamentoParser]', debug.join('\n'));
    }

    return {
        parser: PARSER_ID,
        versao: PARSER_VERSAO,
        processado_em: new Date().toISOString(),
        empresas,
    };
}
