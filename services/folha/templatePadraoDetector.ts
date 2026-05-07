// services/folha/templatePadraoDetector.ts
// Detector da assinatura do "Template Padrão" do app
// (template-apontamento-iob-sage-EMPRESA-NNNNNN.xlsx).
//
// O template tem layout fixo:
//   - Aba "Lançamentos"
//   - A1: título "APONTAMENTO DE FOLHA — ..."
//   - A2: "Competência: MM/AAAA"
//   - Linha 4: cabeçalho com 8 colunas exatas:
//     A=Matrícula | B=Nome do Funcionário | C=Código Evento |
//     D=Descrição Evento | E=Tipo (R/V) | F=Referência |
//     G=Valor (R$) | H=Observação
//   - Linha 5+: dados (1 linha = 1 lançamento)
//
// Esse detector é CONSERVADOR: qualquer divergência de cabeçalho ou nome de aba
// retorna `false`, e o app cai no parser legado (apontamentoParser.ts), que é
// o que cuida dos clientes "criativos" (SPA Saúde, Ferrante, IRB-GROUP).

import * as XLSX from 'xlsx';

const ABA_ESPERADA = 'Lançamentos';
const LINHA_CABECALHO = 4; // 1-indexed (linha 4 no Excel)

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

function normalizar(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove acentos
        .toLowerCase()
        .trim();
}

export interface ResultadoDeteccao {
    ehTemplatePadrao: boolean;
    razao: string;
    aba?: string;
    cabecalhosEncontrados?: Record<string, string>;
}

/**
 * Detecta se um arquivo .xlsx é o Template Padrão do app.
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

    // 1) Procurar aba "Lançamentos" (case-sensitive primeiro, tolerante depois)
    let nomeAba: string | undefined = wb.SheetNames.find((n) => n === ABA_ESPERADA);
    if (!nomeAba) {
        nomeAba = wb.SheetNames.find((n) => normalizar(n) === normalizar(ABA_ESPERADA));
    }
    if (!nomeAba) {
        return {
            ehTemplatePadrao: false,
            razao: `Aba "${ABA_ESPERADA}" não encontrada. Abas no arquivo: ${wb.SheetNames.join(', ')}`,
        };
    }

    // 2) Verificar cabeçalho na linha 4
    const ws = wb.Sheets[nomeAba];
    const cabecalhosEncontrados: Record<string, string> = {};
    const ausentes: string[] = [];

    for (const [colLetra, opcoes] of Object.entries(CABECALHOS_ESPERADOS)) {
        const cellRef = `${colLetra}${LINHA_CABECALHO}`;
        const cell = ws[cellRef];
        const valor = cell ? normalizar(cell.v) : '';
        cabecalhosEncontrados[colLetra] = String(cell?.v ?? '');

        const bate = opcoes.some((esperado) => valor === esperado);
        if (!bate) {
            ausentes.push(`${cellRef}="${valor}" (esperava ${opcoes[0]})`);
        }
    }

    if (ausentes.length > 0) {
        return {
            ehTemplatePadrao: false,
            razao: `Cabeçalhos divergentes na linha ${LINHA_CABECALHO}: ${ausentes.join('; ')}`,
            aba: nomeAba,
            cabecalhosEncontrados,
        };
    }

    return {
        ehTemplatePadrao: true,
        razao: `Template padrão detectado · aba "${nomeAba}" · cabeçalho na linha ${LINHA_CABECALHO}`,
        aba: nomeAba,
        cabecalhosEncontrados,
    };
}
