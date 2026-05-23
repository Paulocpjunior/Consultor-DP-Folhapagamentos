// services/folha/mapeamentoFRClimatizacaoDefault.ts
import type { MapeamentoApontamento, RegraColuna } from './folhaTypes';

export const FR_CNPJ          = '08836321000132';
export const FR_CODIGO_SAGE   = '0813';
export const FR_RAZAO_SOCIAL  = 'FR CLIMATIZACAO EIRELI LTDA';
export const FR_NOME_FANTASIA = 'FR CLIMATIZAÇÃO';

const regra = (
    evento: string, descricao: string, tipo: 'V' | 'D', rv: 'R' | 'V',
): RegraColuna => ({
    evento, descricao_evento: descricao, tipo, rv, ignorar_se_zero: true,
});

export const MAPEAMENTO_FR_DEFAULT: MapeamentoApontamento = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: FR_CNPJ,
    empresa_base: FR_CODIGO_SAGE,
    competencia_default: '',
    observacoes: [
        'Layout WIDE com header em 2 linhas + seções de centro de custo.',
        'HE e Ad.Not em Excel time (fração de dia) → convertido p/ horas.',
        'CONTRIB ASSISTENCIAL vem como texto "1 por cento" → não mapeada.',
        'SEM matrículas na planilha — cadastre pelo Wizard na 1ª vez.',
    ],
    empresas: {
        [FR_NOME_FANTASIA]: { codigo_sage: FR_CODIGO_SAGE, ativa: true },
    },
    mapeamento_colunas: {
        'FALTAS DIAS':          regra('5650', 'FALTAS (DIAS)',           'D', 'R'),
        'DESCONTO DSR (DIAS)':  regra('5651', 'DESCONTO DSR',           'D', 'R'),
        'VALES':                regra('5610', 'ADIANTAMENTO (VALE)',     'D', 'V'),
        'DEVOLUCAO TRANSPORTE': regra('5790', 'DEVOLUCAO TRANSPORTE',   'D', 'V'),
        'DEVOLUCAO REFEICAO':   regra('5792', 'DEVOLUCAO VR',           'D', 'V'),
        'ANTECIPACAO':          regra('5610', 'ADIANTAMENTO (VALE)',     'D', 'V'),
        'HE 100%':              { ...regra('0820', 'HORA EXTRA 100%',        'V', 'R'), excelTime: true },
        'HE 60%':               { ...regra('0811', 'HORA EXTRA 60%',         'V', 'R'), excelTime: true },
        'Adicional Noturno 20%': { ...regra('0211', 'ADICIONAL NOTURNO 25%', 'V', 'R'), excelTime: true },
        'Hora Extra Noturna 80%': { ...regra('0825', 'HE NOTURNA 80%',      'V', 'R'), excelTime: true },
        'REEMBOLSO':            regra('0150', 'REEMBOLSO',              'V', 'V'),
        'BONIFICACAO':          regra('0034', 'PREMIO VALOR',           'V', 'V'),
        'DIF DISSIDIO':         regra('0170', 'DIF DISSIDIO',           'V', 'V'),
    },
    regras_descontos_empresa: {
        coluna: '', campo_obs: 'OBSERVACAO',
        evento_padrao: { evento: '', descricao_evento: '', tipo: 'D', rv: 'V' },
        regras: [],
    },
    regra_salario: null,
    matriculas: {},
};
