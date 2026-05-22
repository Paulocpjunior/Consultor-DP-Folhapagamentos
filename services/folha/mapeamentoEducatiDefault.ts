// services/folha/mapeamentoEducatiDefault.ts
// Parametrização default da EDUCATI (código SAGE 0162).
//
// Layout: TEMPLATE PADRÃO IOB SAGE (formato long — 1 linha = 1 lançamento).
// Reconhecido pelo `templatePadraoDetector` v2.1.0 e processado pelo
// `templatePadraoParser` v1.1.0. Como cada linha do XLSX já vem com
// matrícula, código de evento, descrição, R/V, referência e valor, NÃO
// precisamos de `mapeamento_colunas` — o parser produz `Lancamento[]`
// direto. Este arquivo serve como:
//
//   1. Documentação canônica do cliente (CNPJ, código SAGE, eventos
//      esperados, observações operacionais).
//   2. Seed para os scripts em `scripts/seed-empresa-educati.mjs` —
//      cadastram a empresa no Firestore e gravam o mapeamento em
//      `folha_mapeamentos/EDUCATI` na primeira execução.
//
// Layout da planilha (referência — aba "Lançamentos"):
//   A: Matrícula | B: Nome do Funcionário | C: Código Evento
//   D: Descrição Evento | E: Tipo (R/V) | F: Referência | G: Valor (R$)
//
// Eventos observados no apontamento 05/2026 (todos presentes no catálogo
// IOB SAGE após adição do 1010 DSR):
//   0033 HORA AULA           — V, R   (rotina 000)
//   0820 HORA EXTRA 100%     — V, R   (rotina 020, coef. 2)
//   1010 DSR                 — V, V   (rotina 060)
//   1080 D.S.R. S/ HORAS EX. — V, V   (rotina 060)
//   1490 HORA ATIVIDADE      — V, V   (rotina 060)
//   8920 FALTAS (VALOR)      — D, V   (rotina 060)
//
// Observação operacional: o evento 8920 "FALTAS (VALOR)" aparece na
// planilha com Tipo (R/V) = "R" e referência em horas (ex.: 4.00).
// Embora o catálogo oficial defina rv=V para esse código, o parser
// respeita o que vem da planilha — a contadora confirmou que para
// EDUCATI lança em horas. Não alterar sem revisão.

import type { MapeamentoApontamento } from './folhaTypes';

/**
 * Constantes públicas — usadas pelo seed e por documentação.
 * O CNPJ aqui é só REFERÊNCIA; o seed real lê do script
 * `scripts/seed-empresa-educati.mjs` (que pode receber via env var).
 */
export const EDUCATI_CODIGO_SAGE = '0162';
export const EDUCATI_CNPJ = '07067084000120';
export const EDUCATI_RAZAO_SOCIAL = 'EDUCATI';
export const EDUCATI_NOME_FANTASIA = 'EDUCATI';
/**
 * Chave do cliente no Firestore (folha_mapeamentos/<EDUCATI_CLIENTE>).
 * Convenção atual do app: CNPJ só dígitos (vide WizardMapeamentoMapas).
 */
export const EDUCATI_CLIENTE = EDUCATI_CNPJ;

/**
 * Catálogo de eventos esperados no apontamento da EDUCATI.
 * Documental — usado para validações futuras (ex.: alertar quando aparecer
 * um código fora desta lista, sugerindo cadastro prévio).
 */
export const EDUCATI_EVENTOS_ESPERADOS: ReadonlyArray<{
    codigo: string;
    descricao: string;
    tipo: 'V' | 'D';
    rv: 'R' | 'V';
    nota?: string;
}> = [
    { codigo: '0033', descricao: 'HORA AULA',            tipo: 'V', rv: 'R' },
    { codigo: '0820', descricao: 'HORA EXTRA 100%',      tipo: 'V', rv: 'R' },
    { codigo: '1010', descricao: 'DSR',                  tipo: 'V', rv: 'V' },
    { codigo: '1080', descricao: 'D.S.R. S/ HORAS EXTRAS', tipo: 'V', rv: 'V' },
    { codigo: '1490', descricao: 'HORA ATIVIDADE',       tipo: 'V', rv: 'V' },
    {
        codigo: '8920',
        descricao: 'FALTAS (VALOR)',
        tipo: 'D',
        rv: 'V',
        nota:
            'Planilha EDUCATI envia em Referência (horas) com Tipo=R. ' +
            'Parser respeita o que vem da planilha — não trocar para V automaticamente.',
    },
];

/**
 * Valor da hora-aula por matrícula (R$/hora). Usado pelo pós-processador
 * `aplicarValorHoraAulaEducati` para converter lançamentos do evento 0033
 * (HORA AULA) de referência em horas para valor em R$.
 *
 * Fórmula: `valor_rs = horas × EDUCATI_VALORES_HORA_AULA[matricula]`.
 *
 * Funcionários sem entrada nesta tabela mantêm o lançamento em horas
 * (rv=R) e geram alerta para revisão da contadora.
 */
export const EDUCATI_VALORES_HORA_AULA: Record<string, number> = {
    '000046': 33.95, // Eduardo Fernando do Nascimento Batata
    '000049': 33.95, // Paulo dos Santos
    '000052': 33.95, // Célia Cristina Pereira da Silva
    '000055': 33.95, // Flavio Lotto
    '000075': 34.35, // Gislene do Carmo Lima
    '000076': 34.35, // Euclides Contrucci de Oliveira
    '000077': 34.35, // Bruna Michelle Nogueira da Silva
};

/**
 * Mapeamento default da EDUCATI gravado em `folha_mapeamentos/EDUCATI`
 * no Firestore na 1ª execução do seed. Mantido por consistência com
 * os demais clientes (ex.: MAPEAMENTO_IRB_GROUP_DEFAULT), embora o
 * Template Padrão não exija `mapeamento_colunas`.
 *
 * `regra_salario: null` — para EDUCATI o SAGE calcula o salário
 * automaticamente a partir do cadastro do funcionário; não geramos
 * o evento 0001 SALÁRIO via app. Esta gravação explícita evita que
 * a migração silenciosa em `getMapeamento` reaplique o default.
 */
export const MAPEAMENTO_EDUCATI_DEFAULT: MapeamentoApontamento = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: EDUCATI_CLIENTE,
    empresa_base: EDUCATI_CODIGO_SAGE,
    competencia_default: '05/2026',
    observacoes: [
        'Layout: Template Padrão IOB SAGE (long, 1 linha = 1 lançamento).',
        'Reconhecido automaticamente pelo templatePadraoDetector v2.1.0.',
        'Aba de dados: "Lançamentos" — cabeçalho na linha 4.',
        'Competência atualizada a cada upload (lida da célula A2 do XLSX).',
        'SAGE calcula salário automaticamente — regra_salario desativada.',
    ],
    empresas: {
        EDUCATI: { codigo_sage: EDUCATI_CODIGO_SAGE, ativa: true },
    },
    mapeamento_colunas: {},
    regras_descontos_empresa: {
        coluna: '',
        campo_obs: '',
        evento_padrao: {
            evento: '',
            descricao_evento: '',
            tipo: 'D',
            rv: 'V',
        },
        regras: [],
    },
    regra_salario: null,
    valoresHoraAula: EDUCATI_VALORES_HORA_AULA,
    matriculas: {
        // chave = nome da aba detectada no XLSX da EDUCATI
        Lançamentos: {},
    },
};
