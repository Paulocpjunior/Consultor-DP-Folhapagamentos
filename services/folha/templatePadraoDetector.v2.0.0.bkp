// services/folha/templatePadraoDetector.ts
// Detector da assinatura do "Template Padrão" do app
// (template-apontamento-iob-sage-EMPRESA-NNNNNN.xlsx).
//
// v2.0.0 — Detecção pela ASSINATURA DO CABEÇALHO, não pelo nome da aba.
//   - Antes: exigia aba chamada "Lançamentos" → quebrou para clientes que
//     enviaram com nomes default do Excel ("Folha1", "Sheet1", etc.)
//   - Agora: varre todas as abas e procura, em qualquer uma delas, uma linha
//     (3..6) com a assinatura {Matrícula, Nome do Funcionário, Código Evento,
//     Valor (R$), ...}. Quando acha, devolve o nome da aba e a linha exata.
//
// O template tem layout fixo:
//   - A1: título "APONTAMENTO DE FOLHA — ..."
//   - A2: "Competência: MM/AAAA"
//   - Linha de cabeçalho (geralmente 4): 8 colunas
//     A=Matrícula | B=Nome do Funcionário | C=Código Evento |
//     D=Descrição Evento | E=Tipo (R/V) | F=Referência |
//     G=Valor (R$) | H=Observação
//   - Linha seguinte: dados (1 linha = 1 lançamento)
//
// Esse detector é CONSERVADOR: qualquer divergência retorna `false` e o app
// cai no parser legado (apontamentoParser.ts), que cuida dos clientes
// "criativos" (SPA Saúde, Ferrante, IRB-GROUP).

import * as XLSX from 'xlsx';

/** Linhas a varrer em busca do cabeçalho (1-indexed). Prioriza 4 (template original). */
const LINHAS_SCAN = [4, 3, 5, 6];

const CABECALHOS_ESPERADOS: Record<string, string[]> = {
    A: ['matricula', 'matrícula'],
    B: ['nome do funcionario', 'nome do funcionário', 'funcionario', 'funcionário'],
    C: ['codigo evento', 'código evento', 'codigo', 'código'],
    D: ['descricao evento', 'descrição evento', 'descricao', 'descrição'],
    E: ['tipo (r/v)', 'tipo r/v', 'tipo'],
    F: ['referencia', 'referência'],
    G: ['valor (r$)', 'valor r$', 'valor'],
    H: ['observacao', 'observação', 'obs'],
};

/** Abas auxiliares que NUNCA devem ser detectadas como aba de dados do template. */
const ABAS_AUXILIARES_PATTERNS: RegExp[] = [
    /tabela de eventos/i,
    /^instru[cç][oõ]es$/i,
    /^controles?$/i,
    /^legenda?$/i,
];

function normalizar(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .toLowerCase()
        .trim();
}

function ehAbaAuxiliar(nome: string): boolean {
    return ABAS_AUXILIARES_PATTERNS.some((rx) => rx.test(nome));
}

export interface ResultadoDeteccao {
    ehTemplatePadrao: boolean;
    razao: string;
    aba?: string;
    /** Linha do cabeçalho (1-indexed) — necessária pro parser saber onde começam os dados. */
    linhaCabecalho?: number;
    cabecalhosEncontrados?: Record<string, string>;
}

interface TentativaCabecalho {
    bate: boolean;
    cabecalhos: Record<string, string>;
    ausentes: string[];
}

/** Verifica se a linha indicada de uma aba bate com a assinatura do template. */
function verificarCabecalho(ws: XLSX.WorkSheet, linha: number): TentativaCabecalho {
    const cabecalhos: Record<string, string> = {};
    const ausentes: string[] = [];

    for (const [colLetra, opcoes] of Object.entries(CABECALHOS_ESPERADOS)) {
        const cellRef = `${colLetra}${linha}`;
        const cell = ws[cellRef];
        const valor = cell ? normalizar(cell.v) : '';
        cabecalhos[colLetra] = String(cell?.v ?? '');

        const bate = opcoes.some((esperado) => valor === esperado);
        if (!bate) {
            ausentes.push(`${cellRef}="${valor}" (esperava "${opcoes[0]}")`);
        }
    }

    return { bate: ausentes.length === 0, cabecalhos, ausentes };
}

/**
 * Detecta se um arquivo .xlsx é o Template Padrão do app, em qualquer aba.
 *
 * @param arquivo File ou ArrayBuffer
 * @returns Resultado com flag e razão (pra debug/log)
 */
export async function detectarTemplatePadrao(
    arquivo: File | ArrayBuffer | Uint8Array,
): Promise<ResultadoDeteccao> {
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
            ehTemplatePadrao: false,
            razao: `Não foi possível abrir o arquivo como xlsx: ${(e as Error).message}`,
        };
    }

    // Coleta as razões de cada aba pra debug útil se nada bater
    const tentativas: string[] = [];

    for (const nomeAba of wb.SheetNames) {
        if (ehAbaAuxiliar(nomeAba)) {
            tentativas.push(`"${nomeAba}" (auxiliar — pulada)`);
            continue;
        }

        const ws = wb.Sheets[nomeAba];
        let melhorTentativa: TentativaCabecalho | null = null;
        let melhorLinha = -1;

        for (const linha of LINHAS_SCAN) {
            const t = verificarCabecalho(ws, linha);
            if (t.bate) {
                return {
                    ehTemplatePadrao: true,
                    razao: `Template padrão detectado · aba "${nomeAba}" · cabeçalho na linha ${linha}`,
                    aba: nomeAba,
                    linhaCabecalho: linha,
                    cabecalhosEncontrados: t.cabecalhos,
                };
            }
            // Guarda a tentativa com menos ausentes pra reportar no fim
            if (!melhorTentativa || t.ausentes.length < melhorTentativa.ausentes.length) {
                melhorTentativa = t;
                melhorLinha = linha;
            }
        }

        if (melhorTentativa) {
            tentativas.push(
                `"${nomeAba}" linha ${melhorLinha}: ${melhorTentativa.ausentes.length} divergência(s) ` +
                `(ex.: ${melhorTentativa.ausentes.slice(0, 2).join('; ')})`,
            );
        }
    }

    return {
        ehTemplatePadrao: false,
        razao: tentativas.length > 0
            ? `Nenhuma aba bate com a assinatura do template padrão. Tentativas: ${tentativas.join(' | ')}`
            : 'Arquivo sem abas reconhecíveis.',
    };
}
