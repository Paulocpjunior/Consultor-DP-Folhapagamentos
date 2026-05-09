// services/folha/inplafDetector.ts
// Detector da assinatura do layout INPLAF.
//
// Layout INPLAF (FOLHA_CONTA_BIL.xlsx):
//   - 1 aba (qualquer nome — geralmente "Planilha1")
//   - Linha 1: nome da empresa em A1 (ex.: "INPLAF - Industria de Plainas...")
//             + colunas finais com "PAGAMENTO " | MÊS_TEXTO | ANO
//   - Linha 2: data serial Excel (descartada)
//   - Linha 3: cabeçalho REAL com "CÓD." em A3, "NOME" em B3, "SALÁRIO" em C3,
//             "HORAS" em D3, "DSR" em E3 e nas colunas seguintes os eventos
//             com código IOB embutido no fim do nome (ex.: "FALTAS (DIA) 5650")
//   - Linhas 4+: dados (1 linha = 1 funcionário)
//   - Última linha: linha de controle "ok" (descartada)
//
// O detector é CONSERVADOR: qualquer divergência das âncoras retorna `false`.

import * as XLSX from 'xlsx';

function normalizar(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export interface ResultadoDeteccaoInplaf {
    ehLayoutInplaf: boolean;
    razao: string;
    aba?: string;
    /** Texto bruto de A1, útil pra extrair nome da empresa */
    a1?: string;
    /** Linha 1 inteira (pra extrair competência: PAGAMENTO + MÊS + ANO) */
    linhaTitulo?: unknown[];
    /** Linha 3 inteira (cabeçalhos reais) */
    linhaCabecalho?: unknown[];
}

/**
 * Detecta se o arquivo segue o layout INPLAF.
 *
 * Âncoras conservadoras:
 *   1. Existe ao menos uma aba com >= 4 linhas;
 *   2. Linha 3 tem em A "COD." (ou variação com acento) E em B "NOME";
 *   3. Linha 3 tem ao menos uma célula que termina com 4 dígitos (código IOB).
 *
 * As âncoras 2 e 3 juntas são suficientes — não casam com IRB-GROUP, VALUE,
 * Template Padrão, nem outros layouts conhecidos.
 */
export async function detectarLayoutInplaf(
    arquivo: File | ArrayBuffer | Uint8Array,
): Promise<ResultadoDeteccaoInplaf> {
    let buffer: ArrayBuffer | Uint8Array;
    if (arquivo instanceof File) {
        buffer = await arquivo.arrayBuffer();
    } else {
        buffer = arquivo;
    }

    let wb: XLSX.WorkBook;
    try {
        wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    } catch (e) {
        return {
            ehLayoutInplaf: false,
            razao: `Falha ao abrir xlsx: ${(e as Error).message}`,
        };
    }

    if (wb.SheetNames.length === 0) {
        return { ehLayoutInplaf: false, razao: 'Nenhuma aba encontrada.' };
    }

    // Tenta cada aba — primeira que casar vence.
    for (const nomeAba of wb.SheetNames) {
        const ws = wb.Sheets[nomeAba];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: null,
            blankrows: false,
        });
        if (rows.length < 4) continue;

        const linha1 = rows[0] ?? [];
        const linha3 = rows[2] ?? [];

        const a3 = normalizar(linha3[0]);
        const b3 = normalizar(linha3[1]);
        // Aceita "COD.", "CÓD.", "CODIGO", "CÓDIGO"
        const a3OK = a3.startsWith('cod');
        const b3OK = b3 === 'nome';
        if (!a3OK || !b3OK) continue;

        // Pelo menos uma coluna do cabeçalho deve terminar com 4 dígitos
        // (assinatura forte do layout: códigos IOB embutidos)
        const REGEX_COD = /\b(\d{4})\s*$/;
        const temCodigoEmbutido = linha3.some((c) => {
            if (c === null || c === undefined) return false;
            return REGEX_COD.test(String(c).trim());
        });
        if (!temCodigoEmbutido) continue;

        const a1 = linha1[0] ? String(linha1[0]).trim() : '';

        return {
            ehLayoutInplaf: true,
            razao: 'Cabeçalho na linha 3 com COD./NOME e códigos IOB embutidos.',
            aba: nomeAba,
            a1,
            linhaTitulo: linha1,
            linhaCabecalho: linha3,
        };
    }

    return {
        ehLayoutInplaf: false,
        razao: 'Nenhuma aba bate com a assinatura INPLAF (linha 3 com COD./NOME e códigos no fim).',
    };
}
