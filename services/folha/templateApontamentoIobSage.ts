// services/folha/templateApontamentoIobSage.ts
// Gera um template .xlsx pronto para importação no IOB SAGE FOLHAMATIC.
//
// Uso: o colaborador que recebe o apontamento por e-mail (sem planilha do
// cliente) baixa este arquivo, preenche linha a linha e importa direto no
// IOB SAGE — Folha de Pagamento → Importação de Lançamentos.
//
// Layout das colunas (na aba "Lançamentos"):
//   A. Matrícula        — 6 dígitos, texto. Ex.: 000123
//   B. Código Evento    — 4 dígitos, texto. Ex.: 0001
//   C. Descrição Evento — texto livre (apenas referência visual; o IOB usa o código)
//   D. Tipo (R/V)       — R = Referência (horas/qtde) | V = Valor em R$
//   E. Referência       — numérico (preenche quando Tipo = R)
//   F. Valor (R$)       — numérico (preenche quando Tipo = V)
//   G. Observação       — texto livre (opcional)
//
// O IOB SAGE FOLHAMATIC aceita lançamentos do tipo Referência OU Valor por linha.
// Não preencha as duas colunas (E e F) na mesma linha.

import * as XLSX from 'xlsx';

interface EventoExemplo {
    codigo: string;
    descricao: string;
    tipo: 'V' | 'D';
    rv: 'R' | 'V';
}

// Eventos mais usados no IOB SAGE FOLHAMATIC — suficientes para o dia-a-dia
// do apontamento manual recebido por e-mail.
const EVENTOS_REFERENCIA: EventoExemplo[] = [
    { codigo: '0001', descricao: 'SALÁRIO',                       tipo: 'V', rv: 'R' },
    { codigo: '0080', descricao: 'HORAS EXTRAS 50%',              tipo: 'V', rv: 'R' },
    { codigo: '0081', descricao: 'HORAS EXTRAS 60%',              tipo: 'V', rv: 'R' },
    { codigo: '0082', descricao: 'HORAS EXTRAS 100%',             tipo: 'V', rv: 'R' },
    { codigo: '0090', descricao: 'ADICIONAL NOTURNO',             tipo: 'V', rv: 'R' },
    { codigo: '0100', descricao: 'DSR S/ HORAS EXTRAS',           tipo: 'V', rv: 'V' },
    { codigo: '0110', descricao: 'ADICIONAL DE INSALUBRIDADE',    tipo: 'V', rv: 'R' },
    { codigo: '0111', descricao: 'ADICIONAL DE PERICULOSIDADE',   tipo: 'V', rv: 'R' },
    { codigo: '0120', descricao: 'COMISSÕES',                     tipo: 'V', rv: 'V' },
    { codigo: '0130', descricao: 'GRATIFICAÇÃO',                  tipo: 'V', rv: 'V' },
    { codigo: '0140', descricao: 'PRÊMIO',                        tipo: 'V', rv: 'V' },
    { codigo: '0200', descricao: 'SALÁRIO FAMÍLIA',               tipo: 'V', rv: 'R' },
    { codigo: '0210', descricao: 'AJUDA DE CUSTO',                tipo: 'V', rv: 'V' },
    { codigo: '0300', descricao: 'FÉRIAS',                        tipo: 'V', rv: 'R' },
    { codigo: '0310', descricao: '1/3 CONSTITUCIONAL FÉRIAS',     tipo: 'V', rv: 'V' },
    { codigo: '0400', descricao: '13º SALÁRIO',                   tipo: 'V', rv: 'R' },
    { codigo: '0410', descricao: 'ADIANTAMENTO 13º SALÁRIO',      tipo: 'V', rv: 'V' },
    { codigo: '0500', descricao: 'FALTAS (DESCONTO)',             tipo: 'D', rv: 'R' },
    { codigo: '0501', descricao: 'DSR S/ FALTAS',                 tipo: 'D', rv: 'R' },
    { codigo: '0510', descricao: 'ATRASOS / SAÍDAS ANTECIPADAS',  tipo: 'D', rv: 'R' },
    { codigo: '0600', descricao: 'INSS',                          tipo: 'D', rv: 'V' },
    { codigo: '0610', descricao: 'IRRF',                          tipo: 'D', rv: 'V' },
    { codigo: '0700', descricao: 'VALE TRANSPORTE (DESCONTO)',    tipo: 'D', rv: 'V' },
    { codigo: '0710', descricao: 'VALE REFEIÇÃO (DESCONTO)',      tipo: 'D', rv: 'V' },
    { codigo: '0720', descricao: 'VALE ALIMENTAÇÃO (DESCONTO)',   tipo: 'D', rv: 'V' },
    { codigo: '0730', descricao: 'PLANO DE SAÚDE (DESCONTO)',     tipo: 'D', rv: 'V' },
    { codigo: '0740', descricao: 'PLANO ODONTOLÓGICO (DESCONTO)', tipo: 'D', rv: 'V' },
    { codigo: '0800', descricao: 'PENSÃO ALIMENTÍCIA',            tipo: 'D', rv: 'V' },
    { codigo: '0900', descricao: 'ADIANTAMENTO QUINZENAL',        tipo: 'D', rv: 'V' },
    { codigo: '0910', descricao: 'EMPRÉSTIMO CONSIGNADO',         tipo: 'D', rv: 'V' },
];

/**
 * Cabeçalhos da aba de lançamentos. A ordem das colunas reflete o layout
 * de importação aceito pelo IOB SAGE FOLHAMATIC.
 */
const HEADERS_LANCAMENTOS = [
    'Matrícula',
    'Código Evento',
    'Descrição Evento',
    'Tipo (R/V)',
    'Referência',
    'Valor (R$)',
    'Observação',
];

interface GerarTemplateOpts {
    nomeEmpresa?: string;
    competencia?: string; // MM/AAAA
}

/**
 * Monta o workbook do template e retorna como ArrayBuffer pronto para download.
 */
export function gerarTemplateApontamentoXlsx(opts: GerarTemplateOpts = {}): ArrayBuffer {
    const wb = XLSX.utils.book_new();

    // ─── Aba 1: Lançamentos ────────────────────────────────────────────────
    const empresa = opts.nomeEmpresa?.trim() || 'EMPRESA';
    const competencia = opts.competencia?.trim() || '';

    const cabecalhoMeta: (string | number | null)[][] = [
        [`APONTAMENTO DE FOLHA — ${empresa}`, null, null, null, null, null, null],
        [competencia ? `Competência: ${competencia}` : 'Competência: __/____', null, null, null, null, null, null],
        [null, null, null, null, null, null, null],
        HEADERS_LANCAMENTOS,
    ];

    // 30 linhas em branco prontas para preenchimento manual.
    const linhasVazias: (string | number | null)[][] = [];
    for (let i = 0; i < 30; i++) {
        linhasVazias.push(['', '', '', '', null, null, '']);
    }

    // 2 linhas de exemplo, para o colaborador entender o preenchimento.
    const exemplos: (string | number | null)[][] = [
        ['000123', '0080', 'HORAS EXTRAS 50%', 'R', 10, null, 'Apontado pelo gestor'],
        ['000123', '0700', 'VALE TRANSPORTE (DESCONTO)', 'V', null, 88.50, ''],
    ];

    const aoaLancamentos = [
        ...cabecalhoMeta,
        ...exemplos,
        ...linhasVazias,
    ];

    const wsLanc = XLSX.utils.aoa_to_sheet(aoaLancamentos);

    // Larguras de coluna (em caracteres)
    wsLanc['!cols'] = [
        { wch: 12 }, // Matrícula
        { wch: 14 }, // Código Evento
        { wch: 34 }, // Descrição Evento
        { wch: 11 }, // Tipo
        { wch: 14 }, // Referência
        { wch: 14 }, // Valor
        { wch: 30 }, // Observação
    ];

    // Mesclar título nas duas primeiras linhas para destaque visual
    wsLanc['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
    ];

    XLSX.utils.book_append_sheet(wb, wsLanc, 'Lançamentos');

    // ─── Aba 2: Instruções ─────────────────────────────────────────────────
    const instrucoes: string[][] = [
        ['INSTRUÇÕES DE PREENCHIMENTO E IMPORTAÇÃO NO IOB SAGE FOLHAMATIC'],
        [''],
        ['1. Preencha apenas a aba "Lançamentos".'],
        ['2. Cada linha representa UM lançamento (um evento de um funcionário).'],
        ['3. Colunas obrigatórias: Matrícula, Código Evento, Tipo (R ou V) e o valor correspondente.'],
        [''],
        ['REGRAS POR COLUNA:'],
        ['• Matrícula: 6 dígitos, com zeros à esquerda. Ex.: 000123, 001045.'],
        ['• Código Evento: 4 dígitos. Consulte a aba "Tabela de Eventos" ou o cadastro do IOB.'],
        ['• Descrição Evento: campo informativo (não vai pro IOB) — ajuda a conferir.'],
        ['• Tipo (R/V):'],
        ['    R = Referência → preencha a coluna "Referência" (horas, dias, %, qtde).'],
        ['    V = Valor      → preencha a coluna "Valor (R$)".'],
        ['  Não preencha as duas colunas na mesma linha.'],
        ['• Referência: número (use ponto ou vírgula como separador decimal).'],
        ['• Valor (R$): número em reais (ex.: 1234.56).'],
        ['• Observação: opcional, livre para anotações internas.'],
        [''],
        ['EXEMPLO (já incluído nas duas primeiras linhas da aba Lançamentos):'],
        ['  Matrícula 000123 | Evento 0080 (HE 50%)   | Tipo R | Referência 10  → 10 horas extras 50%'],
        ['  Matrícula 000123 | Evento 0700 (VT desc.) | Tipo V | Valor 88,50    → R$ 88,50 de vale-transporte'],
        [''],
        ['COMO IMPORTAR NO IOB SAGE FOLHAMATIC:'],
        ['1. Abra o IOB SAGE FOLHAMATIC e selecione a empresa e a competência.'],
        ['2. Acesse: Folha de Pagamento → Movimento → Importação de Lançamentos.'],
        ['3. Selecione este arquivo .xlsx e confirme.'],
        ['4. Confira o relatório de inconsistências (matrículas inválidas, eventos inexistentes).'],
        ['5. Execute o cálculo da folha e revise os totais.'],
        [''],
        ['DICAS:'],
        ['• Salve sempre como .xlsx (Excel) — não converta para .xls antigo.'],
        ['• Não altere nem remova a linha de cabeçalho (linha 4 da aba Lançamentos).'],
        ['• Linhas em branco no meio da planilha são ignoradas pelo IOB.'],
        ['• Em caso de dúvida sobre o código do evento, peça ao DP a "tabela de eventos do cliente".'],
        [''],
        ['Em caso de erro na importação, verifique:'],
        ['• Matrícula existe no cadastro do IOB para a empresa/competência selecionada?'],
        ['• Código de evento está cadastrado e ativo?'],
        ['• Tipo (R/V) confere com o cadastro do evento no IOB?'],
    ];

    const wsInst = XLSX.utils.aoa_to_sheet(instrucoes);
    wsInst['!cols'] = [{ wch: 110 }];
    XLSX.utils.book_append_sheet(wb, wsInst, 'Instruções');

    // ─── Aba 3: Tabela de Eventos (referência) ─────────────────────────────
    const tabelaEventos: (string | number)[][] = [
        ['Código', 'Descrição', 'Tipo', 'R/V'],
        ...EVENTOS_REFERENCIA.map((e) => [
            e.codigo,
            e.descricao,
            e.tipo === 'V' ? 'Vencimento' : 'Desconto',
            e.rv === 'R' ? 'Referência' : 'Valor',
        ]),
    ];
    const wsEv = XLSX.utils.aoa_to_sheet(tabelaEventos);
    wsEv['!cols'] = [
        { wch: 10 }, // Código
        { wch: 38 }, // Descrição
        { wch: 14 }, // Tipo
        { wch: 14 }, // R/V
    ];
    XLSX.utils.book_append_sheet(wb, wsEv, 'Tabela de Eventos');

    // ─── Serialização ──────────────────────────────────────────────────────
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    return out;
}

/**
 * Nome de arquivo padrão para o template baixado.
 */
export function nomeArquivoTemplate(opts: GerarTemplateOpts = {}): string {
    const empresa = (opts.nomeEmpresa || 'EMPRESA')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
    const comp = (opts.competencia || '').replace(/[^0-9]/g, '');
    const sufixo = comp ? `-${comp.padStart(6, '0').slice(-6)}` : '';
    return `template-apontamento-iob-sage-${empresa}${sufixo}.xlsx`;
}

/**
 * Helper de download client-side do template.
 */
export function baixarTemplateApontamento(opts: GerarTemplateOpts = {}): void {
    const buffer = gerarTemplateApontamentoXlsx(opts);
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivoTemplate(opts);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
