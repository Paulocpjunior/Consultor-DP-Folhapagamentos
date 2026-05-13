// services/folha/autonomosSpaParser.ts
// Parser do relatório de autônomos do Sistema de Promoção Assistencial (SPA Saúde).
//
// Regra dual (memória do projeto, definida pelo CEO Paulo):
//   - Coluna H "I.N.S.S. (S.P.A.)" > 0  →  evento 4991 (CONTRIB. INDIVIDUAL - AUTONOMO)
//     SAGE aplica 20% patronal por dentro a partir do Vlr.Fat.
//   - Coluna H == 0  →  evento 4998 (AUTÔNOMO CONT. IN 87)
//     SAGE aplica 11% retenção INSS por dentro a partir do Vlr.Fat.
//
// Ambos eventos são Vencimento/Valor no SAGE. O INSS retido (9860) é gerado
// automaticamente pelo SAGE como desconto.
//
// Layout do XLS (validado com INSS_04_2026.xls — Sistema de Promoção Assistencial):
//   A=Credenciado | F=Vlr.Fat. | G=I.N.S.S. | H=I.N.S.S. (S.P.A.) |
//   I=I.R. | J=Glosas | K=Vlr.Líquido | L=Dt.Pagto. | M=I.N.S.S. Outra Fte
//
// Dados a partir da L16, com linhas pares VAZIAS (1 dado, 1 vazia, 1 dado...).
// Linhas de totalizadores ("Débito: ...", "Crédito: ...") são descartadas.

import * as XLSX from 'xlsx';
import type { Lancamento } from './folhaTypes';

const PARSER_ID = 'autonomos-spa';
const PARSER_VERSAO = '1.0.0';

// Posições das colunas (0-indexed) no layout fixo do SPA
const COL_NOME = 0;       // A — Credenciado
const COL_VLR_FAT = 5;    // F — Vlr.Fat.
const COL_INSS = 6;       // G — I.N.S.S. (calculado pelo cliente, informativo)
const COL_INSS_SPA = 7;   // H — I.N.S.S. (S.P.A.) — define 4991 vs 4998
const COL_INSS_OUTRA = 12; // M — I.N.S.S. Outra Fte (informativo, sinaliza duplo vínculo)

const RX_TOTALIZADOR = /^(d[ée]bito|cr[ée]dito|total|subtotal|saldo)\s*:/i;

export interface AutonomoSpa {
    linha: number;              // 1-indexed na planilha (debug)
    nome: string;
    vlrFat: number;             // valor bruto pago no mês
    inssArquivo: number;        // INSS na coluna G (informativo)
    inssSpa: number;            // INSS SPA na coluna H (informativo)
    inssOutraFte: number;       // INSS outra fonte na coluna M (informativo)
    codigoEvento: '4991' | '4998';
    aliquotaSage: number;       // 20 (4991) ou 11 (4998) — só pra UI mostrar
    alerta?: string;            // sinal pra revisar antes de exportar
}

export interface ResultadoAutonomosSpa {
    parser: string;
    versao: string;
    processado_em: string;
    competencia?: string;
    autonomos: AutonomoSpa[];
    descartadas: { linha: number; nome: string; motivo: string }[];
    alertas: string[];
}

export interface ContextoAutonomosSpa {
    aba: string;
    linhaCabecalho: number;
    empresaNome: string;
    codigoSage: string;
}

function lerNumero(v: unknown): number {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
        const s = v.trim().replace(/\./g, '').replace(',', '.');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

export async function parsearAutonomosSpa(
    arquivo: File | ArrayBuffer | Uint8Array,
    contexto: ContextoAutonomosSpa,
): Promise<ResultadoAutonomosSpa> {
    let buffer: ArrayBuffer | Uint8Array;
    if (arquivo instanceof File) {
        buffer = await arquivo.arrayBuffer();
    } else {
        buffer = arquivo;
    }

    const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
    const ws = wb.Sheets[contexto.aba];
    if (!ws) {
        throw new Error(`Aba "${contexto.aba}" não encontrada.`);
    }

    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
        header: 1,
        defval: null,
        blankrows: true,
    });

    // Competência: relê L9 (1-indexed; rows é 0-indexed)
    let competencia: string | undefined;
    for (let i = 7; i <= 11; i++) {
        const txt = String(rows[i]?.[0] ?? '');
        const m = txt.match(/(\d{2})\s*\/\s*(\d{4})/);
        if (m) {
            competencia = `${m[1]}/${m[2]}`;
            break;
        }
    }

    const autonomos: AutonomoSpa[] = [];
    const descartadas: { linha: number; nome: string; motivo: string }[] = [];

    // Dados começam imediatamente após o cabeçalho
    const linhaInicioDados = contexto.linhaCabecalho + 1;
    for (let i = linhaInicioDados; i <= rows.length; i++) {
        const idx = i - 1; // rows é 0-indexed; i é 1-indexed
        const row = rows[idx];
        if (!row) continue;

        const nomeRaw = row[COL_NOME];
        if (nomeRaw === null || nomeRaw === undefined) continue;
        const nome = String(nomeRaw).trim();
        if (!nome) continue;

        // Descarta totalizadores ("Débito: ...", "Crédito: ...", "Total: ...")
        if (RX_TOTALIZADOR.test(nome)) {
            descartadas.push({ linha: i, nome, motivo: 'totalizador agregado' });
            continue;
        }

        const vlrFat = lerNumero(row[COL_VLR_FAT]);
        if (vlrFat <= 0) {
            // Linha com nome mas sem valor — ignora silenciosamente
            // (não é erro: SPA pode ter autônomo cadastrado sem faturamento no mês)
            continue;
        }

        const inssArquivo = lerNumero(row[COL_INSS]);
        const inssSpa = lerNumero(row[COL_INSS_SPA]);
        const inssOutraFte = lerNumero(row[COL_INSS_OUTRA]);
        const temInssSpa = inssSpa > 0;

        const codigoEvento: '4991' | '4998' = temInssSpa ? '4991' : '4998';
        const aliquotaSage = temInssSpa ? 20 : 11;

        // Alertas: padrões observados que valem revisão antes de exportar
        let alerta: string | undefined;
        if (!temInssSpa && inssArquivo === 0 && inssOutraFte > 0) {
            alerta = `Possível duplo vínculo (INSS Outra Fte = R$ ${inssOutraFte.toFixed(2)}).`;
        } else if (!temInssSpa && inssArquivo === 0 && inssOutraFte === 0) {
            alerta = 'Sem INSS no relatório nem em outra fonte. Revisar.';
        } else if (!temInssSpa && inssArquivo > 0) {
            const esperado = Math.round(vlrFat * 0.11 * 100) / 100;
            if (Math.abs(inssArquivo - esperado) > 0.01) {
                alerta = `INSS no relatório R$ ${inssArquivo.toFixed(2)} ≠ 11% calculado R$ ${esperado.toFixed(2)} (provável teto).`;
            }
        }

        autonomos.push({
            linha: i,
            nome,
            vlrFat: Math.round(vlrFat * 100) / 100,
            inssArquivo: Math.round(inssArquivo * 100) / 100,
            inssSpa: Math.round(inssSpa * 100) / 100,
            inssOutraFte: Math.round(inssOutraFte * 100) / 100,
            codigoEvento,
            aliquotaSage,
            alerta,
        });
    }

    const alertas: string[] = [];
    alertas.push(
        `${autonomos.length} autônomo(s) processado(s) — ` +
        `${autonomos.filter(a => a.codigoEvento === '4991').length} em 4991 (20%), ` +
        `${autonomos.filter(a => a.codigoEvento === '4998').length} em 4998 (11%).`,
    );
    if (descartadas.length) {
        alertas.push(`${descartadas.length} linha(s) de totalizador descartada(s).`);
    }
    const comAlerta = autonomos.filter(a => a.alerta).length;
    if (comAlerta > 0) {
        alertas.push(`${comAlerta} autônomo(s) com alerta — revisar antes de exportar.`);
    }

    return {
        parser: PARSER_ID,
        versao: PARSER_VERSAO,
        processado_em: new Date().toISOString(),
        competencia,
        autonomos,
        descartadas,
        alertas,
    };
}

/**
 * Converte o resultado em Lancamento[] (o formato que o gerador de TXT consome).
 * Cada autônomo vira 1 lançamento. matriculasMap mapeia nome → matrícula SAGE.
 * Autônomos sem matrícula cadastrada são listados em `semMatricula` — não saem no TXT.
 */
export function paraLancamentos(
    resultado: ResultadoAutonomosSpa,
    contexto: ContextoAutonomosSpa,
    matriculasMap: Record<string, string>,
): { lancamentos: Lancamento[]; semMatricula: string[] } {
    const lancamentos: Lancamento[] = [];
    const semMatricula: string[] = [];

    for (const a of resultado.autonomos) {
        const matricula = matriculasMap[a.nome] ?? null;
        if (!matricula) {
            semMatricula.push(a.nome);
            continue;
        }
        const ehPJ = matricula.trim().toUpperCase() === 'PJ';
        if (ehPJ) continue;

        const descricao = a.codigoEvento === '4991'
            ? 'CONTRIB. INDIVIDUAL - AUTONOMO'
            : 'AUTÔNOMO CONT. IN 87';

        lancamentos.push({
            empresa: contexto.empresaNome,
            codigoSage: contexto.codigoSage,
            funcionario: a.nome,
            matricula,
            coluna: `Vlr.Fat (linha ${a.linha})`,
            evento: a.codigoEvento,
            descricao_evento: descricao,
            tipo: 'V',
            rv: 'V',
            valor: a.vlrFat,
            origem: 'coluna',
            obs: a.alerta ?? null,
        });
    }

    return { lancamentos, semMatricula };
}
