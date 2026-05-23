// services/folha/mapeamentoGessoGimenezDefault.ts
import type { MapeamentoApontamento, RegraColuna } from './folhaTypes';

export const GESSO_CNPJ          = '59461616000102';
export const GESSO_CODIGO_SAGE   = '0685';
export const GESSO_RAZAO_SOCIAL  = 'GESSO GIMENEZ';
export const GESSO_NOME_FANTASIA = 'GESSO GIMENEZ';

const REGRA_VT: RegraColuna = {
    evento: '5780',
    descricao_evento: 'VALE TRANSPORTE',
    tipo: 'D',
    rv: 'R',
    valor_fixo: 1,
    condicao_celula: { igual_a: ['SIM', 'S'] },
    nota: 'VT SIM = referência 1; SAGE calcula 6%.',
};

export const MAPEAMENTO_GESSO_DEFAULT: MapeamentoApontamento = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: GESSO_CNPJ,
    empresa_base: GESSO_CODIGO_SAGE,
    competencia_default: '',
    observacoes: [
        'Grade de presença transposta — funcionários como colunas, datas como linhas.',
        'Parser conta FALTOU/FERIAS por funcionário e extrai VALE/VT do rodapé.',
        'SEM matrículas — cadastre pelo Wizard na 1ª vez.',
    ],
    empresas: {
        [GESSO_NOME_FANTASIA]: { codigo_sage: GESSO_CODIGO_SAGE, ativa: true },
    },
    mapeamento_colunas: {
        'FALTAS': {
            evento: '5650', descricao_evento: 'FALTAS (DIAS)',
            tipo: 'D', rv: 'R', ignorar_se_zero: true,
        },
        'VALE': {
            evento: '5610', descricao_evento: 'ADIANTAMENTO (VALE)',
            tipo: 'D', rv: 'V', ignorar_se_zero: true,
        },
        'VT': REGRA_VT,
    },
    regras_descontos_empresa: {
        coluna: '', campo_obs: '',
        evento_padrao: { evento: '', descricao_evento: '', tipo: 'D', rv: 'V' },
        regras: [],
    },
    regra_salario: null,
    matriculas: {},
};
