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
    'nome_completo',
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

/**
 * Normaliza chave de cabeçalho preservando acentos e caixa, mas:
 *   - Converte NBSP (U+00A0) e zero-width-space (U+200B) em espaço comum
 *   - Colapsa whitespace consecutivo em 1 espaço
 *   - Faz trim
 *
 * Necessário porque planilhas frequentemente vêm com NBSP (copy/paste de
 * PDF/HTML), o que faz as chaves "ATRASOS  5850" do mapeamento não casarem
 * com "ATRASOS<NBSP> 5850" da planilha — bug invisível ao olho humano.
 */
export function normalizarHeader(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/[\u00a0\u200b]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
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
    let s = String(v).trim();
    if (s === '') return null;
    if (s.includes(',')) {
        // Tem virgula: separador decimal pt-BR. Se tambem tem ponto, o ponto
        // e separador de milhar ("1.234,56"); senao so a virgula e decimal.
        s = s.includes('.')
            ? s.replace(/\./g, '').replace(',', '.')
            : s.replace(',', '.');
    }
    // Apenas ponto ("0.68", "7011.9", "0.027083..."): o ponto JA e o separador
    // decimal — nao remover. Antes, o replace(/\./g,'') destruia fracoes-de-dia
    // do Excel ([h]:mm:ss vira 0.027) e valores R$ com ponto decimal (90.96),
    // gerando numeros gigantes e lancamentos de hora perdidos (ex.: Waldesa).
    // Milhar com ponto e SEM decimais ("2.500") nao ocorre nestes layouts.
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
 * Tenta parsear uma aba como "grade de presença" — formato transposto onde
 * funcionários são COLUNAS e datas são LINHAS, com status por dia:
 *   "07:30 AS 17:15" (trabalhou), "FALTOU", "FERIAS", "FERIADO".
 * Rodapé: "VALE" (R$) e "VALE TRANSPORTE" (SIM/NAO).
 * Exemplo: Gesso Gimenez "CONTROLE DE HORARIO".
 *
 * Retorna EmpresaApontamento com colunas sintéticas (FALTAS, FERIAS, VALE,
 * VT) calculadas a partir da grade, ou null se o formato não bater.
 */
function tentarParsearGradePresenca(
    rows: unknown[][],
    sheetName: string,
): EmpresaApontamento | null {
    let tituloIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 6); r++) {
        const txt = norm(String((rows[r] as unknown[])?.[0] ?? ''));
        if (txt.includes('controle de horario') || txt.includes('controle de ponto')) {
            tituloIdx = r;
            break;
        }
        for (const cell of (rows[r] as unknown[] ?? [])) {
            const ct = norm(String(cell ?? ''));
            if (ct.includes('controle de horario') || ct.includes('controle de ponto')) {
                tituloIdx = r;
                break;
            }
        }
        if (tituloIdx >= 0) break;
    }
    if (tituloIdx < 0) return null;

    let empRow = -1;
    let empStartCol = -1;
    for (let r = tituloIdx + 1; r < Math.min(rows.length, tituloIdx + 6); r++) {
        const row = (rows[r] as unknown[]) || [];
        let nonEmpty = 0;
        let firstCol = -1;
        for (let c = 1; c < row.length; c++) {
            const v = String(row[c] ?? '').trim();
            if (v && !/^data$/i.test(v) && isNaN(Number(v))) {
                nonEmpty++;
                if (firstCol < 0) firstCol = c;
            }
        }
        if (nonEmpty >= 2) {
            empRow = r;
            empStartCol = firstCol;
            break;
        }
    }
    if (empRow < 0) return null;

    const headerRaw = (rows[empRow] as unknown[]) || [];
    const empNames: { col: number; nome: string }[] = [];
    for (let c = empStartCol; c < headerRaw.length; c++) {
        const nome = String(headerRaw[c] ?? '').trim();
        if (nome) empNames.push({ col: c, nome });
    }
    if (empNames.length < 2) return null;

    const faltas = new Map<number, number>();
    const ferias = new Map<number, number>();
    for (const e of empNames) { faltas.set(e.col, 0); ferias.set(e.col, 0); }

    for (let r = empRow + 1; r < rows.length; r++) {
        const row = (rows[r] as unknown[]) || [];
        const label = norm(String(row[0] ?? ''));
        if (label.includes('vale')) break;
        for (const e of empNames) {
            const v = norm(String(row[e.col] ?? ''));
            if (v.includes('faltou')) faltas.set(e.col, (faltas.get(e.col) ?? 0) + 1);
            else if (v.includes('ferias')) ferias.set(e.col, (ferias.get(e.col) ?? 0) + 1);
        }
    }

    const valeRow = rows.findIndex(
        (r) => norm(String((r as unknown[])?.[0] ?? '')).replace(/\s/g, '') === 'vale'
            && !norm(String((r as unknown[])?.[0] ?? '')).includes('transporte'),
    );
    const vtRow = rows.findIndex(
        (r) => norm(String((r as unknown[])?.[0] ?? '')).includes('vale transporte'),
    );

    const funcionarios: FuncionarioApontamento[] = empNames.map((e) => {
        const valeVal = valeRow >= 0 ? toNumber((rows[valeRow] as unknown[])?.[e.col]) : null;
        const vtVal = vtRow >= 0 ? String((rows[vtRow] as unknown[])?.[e.col] ?? '').trim() : '';
        const faltasDias = faltas.get(e.col) ?? 0;
        const feriasDias = ferias.get(e.col) ?? 0;
        const celulas: Record<string, unknown> = {};
        if (faltasDias > 0) celulas['FALTAS'] = faltasDias;
        if (feriasDias > 0) celulas['FERIAS'] = feriasDias;
        if (valeVal !== null && valeVal > 0) celulas['VALE'] = valeVal;
        if (vtVal) celulas['VT'] = vtVal;
        return { nome: e.nome, celulas, obs: null };
    });

    const colSet = new Set<string>();
    for (const f of funcionarios) for (const k of Object.keys(f.celulas)) colSet.add(k);

    return {
        nome: sheetName,
        colunas: [...colSet],
        funcionarios,
    };
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
    const workbook = XLSX.read(buffer, { type: 'array' });
    const empresas: EmpresaApontamento[] = [];
    const debug: string[] = [];

    // Se TODAS as abas estão na blacklist, ignora a blacklist — caso comum
    // de cliente com aba única chamada "Planilha1" ou "Sheet1".
    const todasBlacklisted = workbook.SheetNames.length > 0
        && workbook.SheetNames.every(isBlacklisted);

    for (const sheetName of workbook.SheetNames) {
        if (!todasBlacklisted && isBlacklisted(sheetName)) {
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

        // Grade de presença (transposta): funcionários como colunas, datas como linhas
        const gradeResult = tentarParsearGradePresenca(rows, sheetName);
        if (gradeResult) {
            empresas.push(gradeResult);
            debug.push(
                `[ok:grade-presenca] "${sheetName}" — ${gradeResult.funcionarios.length} ` +
                `funcionário(s), ${gradeResult.colunas.length} coluna(s) sintéticas ` +
                `(${gradeResult.colunas.join(', ')}).`
            );
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
        // normalizarHeader: NBSP/ZWSP → space + colapsa whitespace. Necessário
        // porque planilhas com headers vindos de copy/paste de PDF (ex.: Waldesa)
        // têm NBSP entre palavras, que torna invisível mas as chaves não casam
        // com o mapeamento gravado no Firestore.
        const headerRaw = (rows[headerRow] as unknown[]).map(normalizarHeader);

        // Two-level header: quando a linha de baixo tem mais colunas com
        // nomes específicos (ex.: FR Climatização — R2 tem "FUNCIONARIO" +
        // grupos "DESCONTOS"/"PROVENTOS"; R3 tem sub-headers "FALTAS HORAS",
        // "HE 100%", etc.), mescla os dois níveis e avança o início dos dados.
        let dataStartRow = headerRow + 1;
        if (dataStartRow < rows.length) {
            const nextRow = ((rows[dataStartRow] as unknown[]) || []).map(normalizarHeader);
            const curDataCols = headerRaw.filter((h, i) => i !== nameCol && !!h).length;
            const nxtDataCols = nextRow.filter((h, i) => i !== nameCol && !!h).length;
            if (nxtDataCols > curDataCols) {
                for (let c = 0; c < Math.max(headerRaw.length, nextRow.length); c++) {
                    if (c === nameCol) continue;
                    const sub = c < nextRow.length ? nextRow[c] : '';
                    if (sub) {
                        while (headerRaw.length <= c) headerRaw.push('');
                        headerRaw[c] = sub;
                    }
                }
                dataStartRow = headerRow + 2;
            }
        }

        // Colunas de dados = todas as colunas do cabeçalho com nome,
        // excluindo a coluna do próprio funcionário.
        const colunas: string[] = [];
        for (let c = 0; c < headerRaw.length; c++) {
            if (c === nameCol) continue;
            const name = headerRaw[c];
            if (name) colunas.push(name);
        }

        const funcionarios: FuncionarioApontamento[] = [];
        for (let i = dataStartRow; i < rows.length; i++) {
            const r = rows[i] as unknown[];
            if (!r) continue;
            const nome = trimOrNull(r[nameCol]);
            if (!nome) continue;
            // Linhas de totalizadores ("TOTAL", "Total geral", etc.) são ignoradas.
            if (/^(total|subtotal|incluir |excluir |observa|centro de custo)/i.test(nome)) continue;
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

// v2.3 - extrai valor tolerante para layouts tipo Ferrante:
// - String com % (ex "20%" Insalubridade) -> 20
// - Fração de dia Excel para rv='R' (ex 0.5833 = 14h) -> *24
// Converte horas decimais (ex.: 16.32 = 16h19) em referencia HH,MM posicional
// (16.19), arredondando ao minuto. Usada quando a regra tem ref_hhmm:true.
export function horasDecimalParaHHMM(horasDecimais: number): number {
    if (!Number.isFinite(horasDecimais) || horasDecimais <= 0) return horasDecimais;
    const totalMin = Math.round(horasDecimais * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return Number(`${h}.${String(m).padStart(2, '0')}`);
}

export function extrairValor(raw: unknown, rv?: string): number | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'string') {
        const m = raw.match(/(-?\d+(?:[,.]\d+)?)\s*%/);
        if (m) return Number(m[1].replace(',', '.'));
    }
    const n = toNumber(raw);
    if (n === null) return null;
    if (rv === 'R' && n > 0 && n < 1) return round2(n * 24);
    return n;
}
