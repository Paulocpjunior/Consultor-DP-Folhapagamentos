/**
 * Parsers de extratos bancários: OFX, CSV e auto-categorização.
 * Sem dependências externas — parsing manual.
 */

export interface TransacaoParsed {
    data: string;       // ISO date (YYYY-MM-DD)
    descricao: string;
    valor: number;
    tipo: 'credito' | 'debito';
}

// ─── Auto-categorização ───────────────────────────────────────────────────────

export function categorizar(descricao: string): string {
    const d = descricao.toUpperCase();
    if (/FGTS|CAIXA.*FUNDO/.test(d)) return 'FGTS';
    if (/INSS|PREV.*SOC|GPS/.test(d)) return 'INSS';
    if (/SALARIO|PAGTO.*FUNC|FOLHA/.test(d)) return 'Salário';
    if (/VALE.*TRANSP|VT\b/.test(d)) return 'Vale Transporte';
    if (/VALE.*ALIM|VA\b|PAT\b/.test(d)) return 'Vale Alimentação';
    if (/13.*SAL|DECIMO/.test(d)) return '13o Salário';
    if (/FERIAS/.test(d)) return 'Férias';
    if (/RESCIS/.test(d)) return 'Rescisão';
    if (/IRRF|IMPOSTO.*RENDA/.test(d)) return 'IRRF';
    return 'Outros';
}

// ─── OFX Parser ───────────────────────────────────────────────────────────────

/**
 * Parse OFX file content (SGML-based, not full XML).
 * Extracts <STMTTRN> blocks.
 */
export function parseOFX(content: string): TransacaoParsed[] {
    const transacoes: TransacaoParsed[] = [];

    // Split by STMTTRN blocks
    const blocks = content.split(/<STMTTRN>/i).slice(1);

    for (const block of blocks) {
        const endIdx = block.search(/<\/STMTTRN>/i);
        const trn = endIdx >= 0 ? block.substring(0, endIdx) : block;

        const trnType = extractTag(trn, 'TRNTYPE');
        const dtPosted = extractTag(trn, 'DTPOSTED');
        const trnAmt = extractTag(trn, 'TRNAMT');
        const memo = extractTag(trn, 'MEMO') || extractTag(trn, 'NAME') || '';

        if (!dtPosted || !trnAmt) continue;

        const valor = parseFloat(trnAmt.replace(',', '.'));
        if (isNaN(valor)) continue;

        const data = parseOFXDate(dtPosted);
        const tipo: 'credito' | 'debito' =
            trnType?.toUpperCase() === 'CREDIT' || valor > 0
                ? 'credito'
                : 'debito';

        transacoes.push({
            data,
            descricao: memo.trim(),
            valor: Math.abs(valor),
            tipo,
        });
    }

    return transacoes;
}

function extractTag(block: string, tag: string): string | null {
    // OFX tags can be: <TAG>value\n or <TAG>value</ ... >
    const regex = new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, 'i');
    const match = block.match(regex);
    return match ? match[1].trim() : null;
}

function parseOFXDate(d: string): string {
    // Format: YYYYMMDD or YYYYMMDDHHMMSS or YYYYMMDDHHMMSS.XXX[-X:XXX]
    const clean = d.replace(/\[.*\]/, '').trim();
    const year = clean.substring(0, 4);
    const month = clean.substring(4, 6);
    const day = clean.substring(6, 8);
    return `${year}-${month}-${day}`;
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

/**
 * Parse CSV bank statement. Tries common Brazilian bank formats:
 * - Columns: Data;Descrição;Valor (or Data;Histórico;Valor;Saldo)
 * - Separator: ; or ,
 * - Date formats: DD/MM/YYYY or DD/MM/YY
 */
export function parseCSV(content: string): TransacaoParsed[] {
    const lines = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    if (lines.length < 2) return [];

    // Detect separator
    const sep = lines[0].includes(';') ? ';' : ',';

    // Find header row (look for "data" column)
    let headerIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
        const cols = lines[i].split(sep).map((c) => c.trim().toLowerCase().replace(/"/g, ''));
        if (cols.some((c) => /^data$|^date$/.test(c))) {
            headerIdx = i;
            headers = cols;
            break;
        }
    }

    if (headerIdx === -1) {
        // Fallback: assume first row is header
        headerIdx = 0;
        headers = lines[0].split(sep).map((c) => c.trim().toLowerCase().replace(/"/g, ''));
    }

    // Map column indices
    const dataIdx = headers.findIndex((h) => /^data$|^date$/.test(h));
    const descIdx = headers.findIndex((h) =>
        /descri|hist|memo|lancamento|complemento/.test(h),
    );
    const valorIdx = headers.findIndex((h) => /valor|amount|vlr/.test(h));
    const tipoIdx = headers.findIndex((h) => /tipo|natureza|d\/c|dc/.test(h));

    if (dataIdx === -1 || valorIdx === -1) return [];

    const transacoes: TransacaoParsed[] = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
        if (cols.length <= Math.max(dataIdx, valorIdx)) continue;

        const dataRaw = cols[dataIdx];
        const descricao = descIdx >= 0 ? cols[descIdx] : '';
        const valorRaw = cols[valorIdx]
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^\d.\-]/g, '');
        const valor = parseFloat(valorRaw);

        if (isNaN(valor) || !dataRaw) continue;

        const data = parseCSVDate(dataRaw);
        if (!data) continue;

        let tipo: 'credito' | 'debito';
        if (tipoIdx >= 0) {
            const t = cols[tipoIdx].toUpperCase();
            tipo = t === 'C' || t === 'CREDITO' || t === 'CR' ? 'credito' : 'debito';
        } else {
            tipo = valor >= 0 ? 'credito' : 'debito';
        }

        transacoes.push({
            data,
            descricao: descricao.trim(),
            valor: Math.abs(valor),
            tipo,
        });
    }

    return transacoes;
}

function parseCSVDate(raw: string): string | null {
    // DD/MM/YYYY or DD/MM/YY
    const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!match) return null;

    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    let year = match[3];
    if (year.length === 2) {
        year = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    }

    return `${year}-${month}-${day}`;
}

// ─── Format detection ─────────────────────────────────────────────────────────

export type FileFormat = 'ofx' | 'csv' | 'pdf';

export function detectFormat(filename: string): FileFormat {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'ofx' || ext === 'qfx') return 'ofx';
    if (ext === 'csv' || ext === 'txt') return 'csv';
    return 'pdf';
}
