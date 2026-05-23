// services/folha/mapeamentoBetinhoDefault.ts
//
// Parametrização default da Casa da Criança Betinho:
//   CNPJ: 62.827.860/0001-73 · SAGE 0606
//
// Layout: WIDE (1 linha = 1 funcionário, cada coluna é um evento).
// Processado pelo apontamentoParser legado.
//
// Estrutura do XLSX ("Planilha1"):
//   R0: vazia
//   R1: título "Funcionarios Gerais" + competência "04 /2026"
//   R2: razão social + CNPJ
//   R3: vazia
//   R4: cabeçalho (Codigo, Nome_Completo, Admissao, Funcao, Salario, ...)
//   R5: códigos IOB dos eventos (1041, 1112, 863, ...)
//   R6+: dados (1 linha por funcionário, 121 func na planilha 04/2026)
//
// Coluna "Codigo" contém a matrícula do funcionário (campo_matricula).

import type { MapeamentoApontamento, RegraColuna } from './folhaTypes';

export const BETINHO_CNPJ          = '62827860000173';
export const BETINHO_CODIGO_SAGE   = '0606';
export const BETINHO_RAZAO_SOCIAL  = 'CASA DA CRIANCA BETINHO LAR ESCOLA';
export const BETINHO_NOME_FANTASIA = 'CASA DA CRIANCA BETINHO';

const regra = (
    evento: string, descricao: string, tipo: 'V' | 'D', rv: 'R' | 'V',
): RegraColuna => ({
    evento, descricao_evento: descricao, tipo, rv, ignorar_se_zero: true,
});

export const MAPEAMENTO_BETINHO_DEFAULT: MapeamentoApontamento = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: BETINHO_CNPJ,
    empresa_base: BETINHO_CODIGO_SAGE,
    competencia_default: '',
    observacoes: [
        'Layout WIDE — 1 linha = 1 funcionário (apontamentoParser legado).',
        'Aba: "Planilha1". Cabeçalho na linha 5 (R4).',
        'Coluna "Codigo" = matrícula (campo_matricula). Coluna "Nome_Completo" = nome.',
        'Linha R5 tem códigos IOB — ignorada pelo parser (nome vazio).',
        'SALÁRIO/ADMISSÃO/FUNÇÃO da planilha são informativos — não viram evento.',
        'VT vem como 0,06 (referência) — SAGE calcula pelo cadastro.',
        'CONT.ASSI não tem código na planilha — mapeado para 5840.',
    ],
    empresas: {
        [BETINHO_NOME_FANTASIA]: {
            codigo_sage: BETINHO_CODIGO_SAGE,
            ativa: true,
        },
    },
    campo_matricula: 'Codigo',
    mapeamento_colunas: {
        'Insalub':    regra('1041', 'INSALUBRIDADE',        'V', 'V'),
        'Ad.Not':     regra('1112', 'ADICIONAL NOTURNO 20%','V', 'R'),
        'HE70%':      regra('0863', 'HORA EXTRA 70%',       'V', 'R'),
        'Feriado':    regra('0870', 'FERIADO',               'V', 'R'),
        'premio':     regra('1123', 'PREMIO',                'V', 'V'),
        'Adiant':     regra('5610', 'ADIANTAMENTO (VALE)',   'D', 'V'),
        'Creche':     regra('0256', 'AUXILIO CRECHE',        'V', 'V'),
        'Falta':      regra('5650', 'FALTAS (DIAS)',         'D', 'R'),
        'DSR':        regra('5651', 'DESCONTO DSR',          'D', 'R'),
        'Atraso':     regra('5850', 'FALTAS E ATRASOS (T/H)','D', 'R'),
        'Gratif':     regra('1280', 'GRATIFICACAO',          'V', 'V'),
        'CONT.ASSI':  regra('5840', 'CONTRIB. ASSISTENCIAL', 'D', 'V'),
        'Sindic':     regra('5004', 'MENSALIDADE SINDICATO', 'D', 'V'),
        'Consig':     regra('8001', 'EMPRESTIMO CONSIGNADO', 'D', 'V'),
        'VT':         regra('5780', 'VALE TRANSPORTE',       'D', 'R'),
        'VR':         regra('5002', 'VALE REFEICAO',         'D', 'V'),
    },
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
    matriculas: {},
};
