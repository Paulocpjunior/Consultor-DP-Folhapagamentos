// services/folha/mapeamentoWaldesaDefault.ts
//
// Parametrização default do grupo Waldesa:
//   - WALDESA MOTOMERCANTIL LTDA (CNPJ 05.049.535/0001-70, SAGE 0026)
//   - WALDESA COMÉRCIO            (CNPJ 61.082.673/0001-22, SAGE 0027)
//
// Layout: WIDE clássico (1 linha = 1 funcionário, cada coluna é um evento).
// Processado pelo `apontamentoParser` legado (não é Template Padrão).
//
// Estrutura do XLSX (mesma para as duas empresas):
//   L1: título "<NOME EMPRESA>  <CNPJ>" (apenas A1)
//   L2: cabeçalho real (CÓDIGO, FUNCIONÁRIOS, SALÁRIO, FUNÇÃO, +eventos)
//   L3+: dados (1 linha por funcionário)
//
// Alguns cabeçalhos têm o código IOB SAGE embutido (ex.: "COMISSÃO  770",
// "ATRASOS  5850"). Outros foram resolvidos por consulta direta ao
// catálogo IOB (CONVÊNIO MÉDICO → 5001, H. E 100% → 0820, etc).
//
// Convenções operacionais (confirmadas com a contadora):
//   - CONTRIBUIÇÃO ASSISTENCIAL marca SIM/NÃO. Quando SIM, gera lançamento
//     5840 com valor fixo R$ 30,00. NÃO → não gera.
//   - SALÁRIO/FUNÇÃO da planilha são informativos (SAGE calcula salário
//     pelo cadastro). regra_salario = null.
//   - ATRASOS 5850 vem como HH:MM:SS (Excel guarda como fração de dia).
//     extrairValor() converte automaticamente quando rv='R' e n<1.
//   - DIFERENÇA 13º: código pendente — deixar coluna sem mapeamento até
//     a contadora informar (o app simplesmente não gera lançamento).

import type { MapeamentoApontamento, RegraColuna } from './folhaTypes';

// ─── Identificadores ────────────────────────────────────────────────────────
export const WALDESA_MOTO_CNPJ          = '05049535000170';
export const WALDESA_MOTO_CODIGO_SAGE   = '0026';
export const WALDESA_MOTO_RAZAO_SOCIAL  = 'WALDESA MOTOMERCANTIL LTDA';
export const WALDESA_MOTO_NOME_FANTASIA = 'WALDESA MOTOMERCANTIL';

export const WALDESA_COM_CNPJ           = '61082673000122';
export const WALDESA_COM_CODIGO_SAGE    = '0027';
export const WALDESA_COM_RAZAO_SOCIAL   = 'WALDESA COMERCIO LTDA';
export const WALDESA_COM_NOME_FANTASIA  = 'WALDESA COMERCIO';

// ─── Eventos ────────────────────────────────────────────────────────────────
// Regras de coluna comuns às duas empresas (a Moto adiciona CONVÊNIO DEPENDENTE 3).

const REGRA_CONVENIO_MEDICO: RegraColuna = {
    evento: '5001',
    descricao_evento: 'ASSISTENCIA MEDICA',
    tipo: 'D',
    rv: 'V',
    ignorar_se_zero: true,
};

const REGRA_CONVENIO_DEPENDENTE: RegraColuna = {
    evento: '5021',
    descricao_evento: 'CONVENIO DEPENDENTE',
    tipo: 'D',
    rv: 'V',
    ignorar_se_zero: true,
};

const REGRA_COMISSAO: RegraColuna = {
    evento: '0770',
    descricao_evento: 'COMISSÃO',
    tipo: 'V',
    rv: 'V',
    ignorar_se_zero: true,
};

const REGRA_DSR_COMISSOES: RegraColuna = {
    evento: '1220',
    descricao_evento: 'D.S.R. S/ COMISSÕES',
    tipo: 'V',
    rv: 'V',
    ignorar_se_zero: true,
};

const REGRA_PREMIO: RegraColuna = {
    evento: '0034',
    descricao_evento: 'PREMIO VALOR',
    tipo: 'V',
    rv: 'V',
    ignorar_se_zero: true,
};

const REGRA_CONTRIB_ASSIST: RegraColuna = {
    evento: '5840',
    descricao_evento: 'CONTRIB. ASSISTENCIAL',
    tipo: 'D',
    rv: 'V',
    valor_fixo: 30.00,
    condicao_celula: { igual_a: ['SIM', 'S'] },
    nota: 'Quando SIM, gera lançamento de R$ 30,00. NÃO/vazio = ignora.',
};

const REGRA_ATRASOS: RegraColuna = {
    evento: '5850',
    descricao_evento: 'FALTAS E ATRASOS (T/H)',
    tipo: 'D',
    rv: 'R', // horas (extrairValor converte HH:MM:SS automaticamente)
    ignorar_se_zero: true,
};

const REGRA_FALTAS: RegraColuna = {
    evento: '5650',
    descricao_evento: 'FALTAS (DIAS)',
    tipo: 'D',
    rv: 'R', // dias
    ignorar_se_zero: true,
};

const REGRA_DSR_FALTAS: RegraColuna = {
    evento: '5651',
    descricao_evento: 'DESCONTO DSR',
    tipo: 'D',
    rv: 'R', // dias
    ignorar_se_zero: true,
};

const REGRA_HE_60: RegraColuna = {
    evento: '0811',
    descricao_evento: 'HORA EXTRA 60%',
    tipo: 'V',
    rv: 'R', // horas
    ignorar_se_zero: true,
};

const REGRA_HE_100: RegraColuna = {
    evento: '0820',
    descricao_evento: 'HORA EXTRA 100%',
    tipo: 'V',
    rv: 'R', // horas
    ignorar_se_zero: true,
};

const REGRA_AD_NOTURNO: RegraColuna = {
    evento: '0211',
    descricao_evento: 'ADICIONAL NOTURNO 25%',
    tipo: 'V',
    rv: 'R', // horas
    ignorar_se_zero: true,
    nota: 'Confirmar com sindicato Waldesa o % (25/30/37). Default 25%.',
};

const REGRA_VT: RegraColuna = {
    evento: '5780',
    descricao_evento: 'VALE TRANSPORTE',
    tipo: 'D',
    rv: 'R',
    valor_fixo: 1,
    condicao_celula: { igual_a: ['SIM', 'S'] },
    nota:
        'Coluna VT marca SIM/NÃO. Quando SIM, gera lançamento de 5780 com ' +
        'referência=1; SAGE calcula o desconto (6% s/ salário) pelo cadastro. ' +
        'NÃO/vazio = ignora.',
};

// ─── Mapeamento WALDESA MOTOMERCANTIL ───────────────────────────────────────
export const MAPEAMENTO_WALDESA_MOTO_DEFAULT: MapeamentoApontamento = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: WALDESA_MOTO_CNPJ,
    empresa_base: WALDESA_MOTO_CODIGO_SAGE,
    competencia_default: '',
    observacoes: [
        'Layout WIDE — 1 linha = 1 funcionário (apontamentoParser legado).',
        'Aba: nome da competência (ex.: "04-2026"). Cabeçalho na linha 2.',
        'Coluna CÓDIGO = matrícula. Coluna FUNCIONÁRIOS = nome.',
        'SALÁRIO/FUNÇÃO da planilha são informativos — não viram evento.',
        'CONTRIBUIÇÃO ASSISTENCIAL (SIM/NÃO) → 5840 R$ 30,00 quando SIM.',
        'ATRASOS 5850 vem como HH:MM:SS — convertido para horas decimais.',
        'DIFERENÇA 13º: código pendente — coluna sem mapeamento por enquanto.',
    ],
    empresas: {
        // Chave = nome da aba detectada (ex.: "04-2026", "05-2026", etc).
        // O parser usa o nome do mapa para casamento de empresa por aba —
        // a chave real é resolvida por matchEmpresa.acharEmpresaPorNome
        // (que cruza com a coleção `empresas` via CNPJ/razão social).
        [WALDESA_MOTO_NOME_FANTASIA]: {
            codigo_sage: WALDESA_MOTO_CODIGO_SAGE,
            ativa: true,
        },
    },
    mapeamento_colunas: {
        'CONVÊNIO MÉDICO':           REGRA_CONVENIO_MEDICO,
        'CONVÊNIO DEPENDENTE 1':     REGRA_CONVENIO_DEPENDENTE,
        'CONVÊNIO DEPENDENTE 2':     REGRA_CONVENIO_DEPENDENTE,
        'CONVÊNIO DEPENDENTE 3':     REGRA_CONVENIO_DEPENDENTE,
        'COMISSÃO  770':             REGRA_COMISSAO,
        'DSR S/ COMISSÕES 1220':     REGRA_DSR_COMISSOES,
        'PRÊMIO':                    REGRA_PREMIO,
        'CONTRIBUIÇÃO ASSISTENCIAL': REGRA_CONTRIB_ASSIST,
        'ATRASOS  5850':             REGRA_ATRASOS,
        'FALTAS  5650':              REGRA_FALTAS,
        'DSR        5651':           REGRA_DSR_FALTAS,
        'H. E 60%      811':         REGRA_HE_60,
        'H. E  100%':                REGRA_HE_100,
        'ADICIONAL NOTURNO':         REGRA_AD_NOTURNO,
        'VT':                        REGRA_VT,
        // 'DIFERENÇA 13º': pendente — adicionar quando contadora confirmar código.
    },
    regras_descontos_empresa: {
        coluna: '',
        campo_obs: 'OBSERVAÇÕES',
        evento_padrao: {
            evento: '',
            descricao_evento: '',
            tipo: 'D',
            rv: 'V',
        },
        regras: [],
    },
    regra_salario: null,
    matriculas: {
        [WALDESA_MOTO_NOME_FANTASIA]: {},
    },
};

// ─── Mapeamento WALDESA COMÉRCIO ────────────────────────────────────────────
// Diferenças vs Moto:
//   - Só 2 colunas de CONVÊNIO DEPENDENTE (não tem a 3)
//   - Cabeçalho "DESCONTO DE CONTRIBUIÇÃO ASSISTENCIAL" em vez de só "CONTRIBUIÇÃO ASSISTENCIAL"
//   - Tem coluna DSR 5651 normal (diferente da Moto)

export const MAPEAMENTO_WALDESA_COM_DEFAULT: MapeamentoApontamento = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: WALDESA_COM_CNPJ,
    empresa_base: WALDESA_COM_CODIGO_SAGE,
    competencia_default: '',
    observacoes: [
        'Layout WIDE — 1 linha = 1 funcionário (apontamentoParser legado).',
        'Aba: nome da competência (ex.: "04-2026"). Cabeçalho na linha 2.',
        'Coluna CÓDIGO = matrícula. Coluna FUNCIONÁRIOS = nome.',
        'SALÁRIO/FUNÇÃO da planilha são informativos — não viram evento.',
        'DESCONTO DE CONTRIBUIÇÃO ASSISTENCIAL (SIM/NÃO) → 5840 R$ 30,00 quando SIM.',
        'ATRASOS 5850 vem como HH:MM:SS — convertido para horas decimais.',
        'DIFERENÇA 13º: código pendente — coluna sem mapeamento por enquanto.',
    ],
    empresas: {
        [WALDESA_COM_NOME_FANTASIA]: {
            codigo_sage: WALDESA_COM_CODIGO_SAGE,
            ativa: true,
        },
    },
    mapeamento_colunas: {
        'CONVÊNIO MÉDICO':                       REGRA_CONVENIO_MEDICO,
        'CONVÊNIO DEPENDENTE 1':                 REGRA_CONVENIO_DEPENDENTE,
        'CONVÊNIO DEPENDENTE 2':                 REGRA_CONVENIO_DEPENDENTE,
        'COMISSÃO 770':                          REGRA_COMISSAO,
        'DSR S/ COMISSÕES 1220':                 REGRA_DSR_COMISSOES,
        'PRÊMIO':                                REGRA_PREMIO,
        'DESCONTO DE CONTRIBUIÇÃO ASSISTENCIAL': REGRA_CONTRIB_ASSIST,
        'ATRASOS  5850':                         REGRA_ATRASOS,
        'FALTAS  5650':                          REGRA_FALTAS,
        'DSR      5651':                         REGRA_DSR_FALTAS,
        'H. E 60%      811':                     REGRA_HE_60,
        'H. E  100%':                            REGRA_HE_100,
        'ADICIONAL NOTURNO':                     REGRA_AD_NOTURNO,
        'VT':                                    REGRA_VT,
        // 'DIFERENÇA 13º': pendente.
    },
    regras_descontos_empresa: {
        coluna: '',
        campo_obs: 'OBSERVAÇÕES',
        evento_padrao: {
            evento: '',
            descricao_evento: '',
            tipo: 'D',
            rv: 'V',
        },
        regras: [],
    },
    regra_salario: null,
    matriculas: {
        [WALDESA_COM_NOME_FANTASIA]: {},
    },
};
