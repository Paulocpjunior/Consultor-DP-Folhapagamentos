// services/folha/autonomosSpaDetector.ts
// Detecta arquivos do "Sistema de Promoção Assistencial" (SPA Saúde)
// usados pra importação de autônomos com retenção de INSS.
//
// Assinatura (validada com INSS_04_2026.xls):
//   - Arquivo .xls antigo (BIFF8) com 1 aba (geralmente "Recuperada_Planilha1")
//   - L1 contém "Sistema de Promoção Assistencial"
//   - L9 contém "Mes de Protocolo: MM/AAAA"
//   - L14 cabeçalho com colunas: Credenciado | Vlr.Fat. | I.N.S.S. |
//     I.N.S.S. (S.P.A.) | I.R. | Glosas | Vlr.Líquido | Dt.Pagto. | I.N.S.S. Outra Fte
//   - L16+ dados, pulando linhas pares vazias (1 dado, 1 vazia, ...)

import * as XLSX from 'xlsx';

const ASSINATURA_L1 = 'sistema de promo';     // normalizado (sem acento, lowercase)
const ASSINATURA_HEADER_OBRIGATORIOS = [
    'credenciado',
    'vlr.fat',
    'i.n.s.s',
];

function norm(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export interface ResultadoDeteccaoAutonomosSpa {
    ehAutonomosSpa: boolean;
    razao: string;
    aba?: string;
    linhaCabecalho?: number;
    competencia?: string;
}

export async function detectarAutonomosSpa(
    arquivo: File | ArrayBuffer | Uint8Array,
): Promise<ResultadoDeteccaoAutonomosSpa> {
    let buffer: ArrayBuffer | Uint8Array;
    if (arquivo instanceof File) {
        buffer = await arquivo.arrayBuffer();
    } else {
        buffer = arquivo;
    }

    let wb: XLSX.WorkBook;
    try {
        wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    } catch (e) {
        return {
            ehAutonomosSpa: false,
            razao: `Não foi possível abrir o arquivo: ${(e as Error).message}`,
        };
    }

    // Varre todas as abas procurando a assinatura
    for (const nomeAba of wb.SheetNames) {
        const ws = wb.Sheets[nomeAba];
        const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
            header: 1,
            defval: null,
            blankrows: true,
        });

        // L1: assinatura do gerador
        const l1 = norm(rows[0]?.[0]);
        if (!l1.includes(ASSINATURA_L1)) continue;

        // L14: cabeçalho com as colunas obrigatórias
        // Tolerante: tenta L14, L13, L15 (caso o gerador tenha variado uma linha)
        let linhaHeader = -1;
        for (const tentativa of [13, 12, 14, 15]) { // 0-indexed
            const row = (rows[tentativa] ?? []).map(c => norm(c));
            const temTodos = ASSINATURA_HEADER_OBRIGATORIOS.every(h =>
                row.some(c => c.includes(h))
            );
            if (temTodos) {
                linhaHeader = tentativa + 1; // 1-indexed
                break;
            }
        }

        if (linhaHeader === -1) {
            return {
                ehAutonomosSpa: false,
                razao: `Aba "${nomeAba}" tem assinatura SPA mas cabeçalho não bate em L13–L16.`,
            };
        }

        // L9: competência (informativo)
        let competencia: string | undefined;
        for (let i = 7; i <= 11; i++) {
            const txt = String(rows[i]?.[0] ?? '');
            const m = txt.match(/(\d{2})\s*\/\s*(\d{4})/);
            if (m) {
                competencia = `${m[1]}/${m[2]}`;
                break;
            }
        }

        return {
            ehAutonomosSpa: true,
            razao: `Autônomos SPA detectado · aba "${nomeAba}" · cabeçalho L${linhaHeader}` +
                   (competencia ? ` · competência ${competencia}` : ''),
            aba: nomeAba,
            linhaCabecalho: linhaHeader,
            competencia,
        };
    }

    return {
        ehAutonomosSpa: false,
        razao: 'Nenhuma aba contém "Sistema de Promoção Assistencial" na linha 1.',
    };
}
