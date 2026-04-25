// services/folha/mapeamentoIrbGroupDefault.ts
// Mapeamento default do IRB-GROUP — usado na 1ª execução (bootstrap do Firestore).
// Este objeto é gravado automaticamente em `folha_mapeamentos/IRB-GROUP` quando
// o documento ainda não existir. Depois pode ser editado pela UI admin.

import type { MapeamentoApontamento } from './folhaTypes';

export const MAPEAMENTO_IRB_GROUP_DEFAULT: MapeamentoApontamento = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: 'IRB-GROUP',
    empresa_base: '0229',
    competencia_default: '03/2026',
    observacoes: [
        'Parser: IRB-GROUP__apontamento-folha (cliente + origem, nunca IOB SAGE).',
        'Cada sheet do xlsx representa uma empresa do grupo IRB.',
        'Códigos sugeridos com base no catálogo IOB SAGE empresa 0229.',
        'Revisar com a contadora antes da 1ª exportação em produção.',
    ],
    empresas: {
        Flanacar: { codigo_sage: '0229', ativa: true },
        Unike: { codigo_sage: '0229', ativa: true },
        LAV: { codigo_sage: '0229', ativa: true },
    },
    mapeamento_colunas: {
        'DESCONTO VR': {
            evento: '5000',
            descricao_evento: 'DESC. VALE ALIMENTAÇÃO',
            tipo: 'D',
            rv: 'V',
            ignorar_se_zero: true,
            nota: 'Valor R$10 = funcionário recebe VR; 0 = não recebe (ignorado).',
        },
        'DESCONTO VT': {
            evento: '5779',
            descricao_evento: 'VALE TRANSPORTE',
            tipo: 'D',
            rv: 'V',
            ignorar_se_zero: true,
        },
        'TT HORAS 60% (horas)': {
            evento: '0811',
            descricao_evento: 'HORA EXTRA 60%',
            tipo: 'V',
            rv: 'R',
            ignorar_se_zero: true,
            nota: 'Valor em HORAS (coeficiente 1,60 aplicado pelo SAGE).',
        },
        'TT HORAS 100% (horas)': {
            evento: '0820',
            descricao_evento: 'HORA EXTRA 100%',
            tipo: 'V',
            rv: 'R',
            ignorar_se_zero: true,
        },
        'TT HORAS NOTURNA 20%': {
            evento: '1118',
            descricao_evento: 'ADICIONAL NOTURNO 20%',
            tipo: 'V',
            rv: 'R',
            ignorar_se_zero: true,
            nota: 'Rotina 020 (horas), coeficiente 0,20.',
        },
        'TT HORAS - ATRASO (horas)': {
            evento: '5850',
            descricao_evento: 'FALTAS E ATRASOS (T/H)',
            tipo: 'D',
            rv: 'R',
            ignorar_se_zero: true,
            nota: 'Lançado em horas; rotina 020.',
        },
        ATRASOS: {
            evento: '8920',
            descricao_evento: 'FALTAS (VALOR)',
            tipo: 'D',
            rv: 'V',
            ignorar_se_zero: true,
            nota: 'Quando o atraso já vem calculado em valor.',
        },
    },
    regras_descontos_empresa: {
        coluna: 'DESCONTOS EMPRESA',
        campo_obs: 'OBS',
        evento_padrao: {
            evento: '5001',
            descricao_evento: 'ASSISTENCIA MEDICA',
            tipo: 'D',
            rv: 'V',
        },
        regras: [
            {
                quando_obs_contem: [
                    'co-participação convênio',
                    'co-participacao convenio',
                    'coparticipação',
                    'coparticipacao',
                ],
                evento: '5022',
                descricao_evento: 'CONVENIO COPARTICIPAÇ',
                tipo: 'D',
                rv: 'V',
            },
            {
                quando_obs_contem: [
                    'convênio médico - dependente',
                    'convenio medico - dependente',
                    'dependente bemmais',
                    'dependente bem mais',
                ],
                evento: '5021',
                descricao_evento: 'CONVENIO DEPENDENTE',
                tipo: 'D',
                rv: 'V',
            },
            {
                quando_obs_contem: ['convênio', 'convenio', 'médico', 'medico'],
                evento: '5001',
                descricao_evento: 'ASSISTENCIA MEDICA',
                tipo: 'D',
                rv: 'V',
            },
        ],
    },
    matriculas: {
        Flanacar: {},
        Unike: {},
        LAV: {},
    },
};
