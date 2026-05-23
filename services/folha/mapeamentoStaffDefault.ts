// services/folha/mapeamentoStaffDefault.ts
//
// Parametrização default da Staff Digital:
//   CNPJ: 06.255.895/0001-91 · SAGE 0146
//
// Layout: WIDE (1 linha = 1 funcionário, colunas são dados do mês).
// Processado pelo apontamentoParser legado.
//
// Estrutura do XLSX (abas mensais: "Jan", "Fev", ..., "Abr26"):
//   R0: título "0146 - STAFF Digital Servicos Administrativo..."
//   R2: "APONTAMENTO"
//   R4: período "25 de Março a 24 de Abril de 2026"
//   R5: cabeçalho (Funcionarios, Atrasos, 1, 0.8, 0.6, Faltas, Meta, OBS, ...)
//   R6+: dados (1 linha por funcionário, ~18 func)
//
// Sem matrículas na planilha — user cadastra pelo Wizard na 1ª execução.
// Sem códigos IOB — mapeamos as colunas mais comuns abaixo.
//
// Colunas NÃO mapeadas (processamento manual):
//   - OBS: texto livre com instruções variadas (férias, gratificações, etc.)
//   - 1 / 0.8 / 0.6: fatores do atraso (cálculo interno do cliente)
//   - Folha 13o: mês de referência do 13º (informativo)
//   - Vale: SIM/NAO sem valor definido (adiantamento sem R$ fixo)

import type { MapeamentoApontamento, RegraColuna } from './folhaTypes';

export const STAFF_CNPJ          = '06255895000191';
export const STAFF_CODIGO_SAGE   = '0146';
export const STAFF_RAZAO_SOCIAL  = 'STAFF DIGITAL SERVICOS ADMINISTRATIVOS';
export const STAFF_NOME_FANTASIA = 'STAFF DIGITAL';

const regra = (
    evento: string, descricao: string, tipo: 'V' | 'D', rv: 'R' | 'V',
): RegraColuna => ({
    evento, descricao_evento: descricao, tipo, rv, ignorar_se_zero: true,
});

const REGRA_VT: RegraColuna = {
    evento: '5780',
    descricao_evento: 'VALE TRANSPORTE',
    tipo: 'D',
    rv: 'R',
    valor_fixo: 1,
    condicao_celula: { igual_a: ['SIM', 'S'] },
    nota: 'VT SIM = referência 1; SAGE calcula 6%. Pausado/vazio = ignora.',
};

export const MAPEAMENTO_STAFF_DEFAULT: MapeamentoApontamento = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: STAFF_CNPJ,
    empresa_base: STAFF_CODIGO_SAGE,
    competencia_default: '',
    observacoes: [
        'Layout WIDE — 1 linha = 1 funcionário.',
        'Abas mensais: "Jan", "Fev", ..., "Abr26". Selecione a aba correta.',
        'SEM matrículas na planilha — cadastre pelo Wizard na 1ª vez.',
        'SEM códigos IOB — mapeamento manual abaixo.',
        'Atrasos vem como Excel time (fração de dia) — convertido p/ horas.',
        'OBS tem instruções mistas — processar manualmente.',
        'Colunas 1/0.8/0.6 são fatores de atraso — não mapeadas.',
    ],
    empresas: {
        [STAFF_NOME_FANTASIA]: {
            codigo_sage: STAFF_CODIGO_SAGE,
            ativa: true,
        },
    },
    mapeamento_colunas: {
        'Atrasos':          regra('5850', 'FALTAS E ATRASOS (T/H)', 'D', 'R'),
        'Faltas':           regra('5650', 'FALTAS (DIAS)',           'D', 'R'),
        'Meta':             regra('0034', 'PREMIO VALOR',            'V', 'V'),
        'VT':               REGRA_VT,
        '½ Seguro Vida':  regra('5662', 'SEGURO DE VIDA',         'D', 'V'),
    },
    regras_descontos_empresa: {
        coluna: '',
        campo_obs: 'OBS:',
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
