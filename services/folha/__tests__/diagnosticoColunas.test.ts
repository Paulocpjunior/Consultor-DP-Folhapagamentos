/**
 * diagnosticoColunas.test.ts
 *
 * Rode com: npx vitest run services/folha/__tests__/diagnosticoColunas.test.ts
 *
 * Cenário real (SP Assessoria, aba "FOPAG"): a empresa passou a mandar a
 * planilha com outros títulos de coluna. O mapeamento gravado deixou de casar,
 * a exportação saiu com ZERO lançamentos e a única mensagem era
 * "Nenhum lançamento foi gerado a partir do apontamento" — sem dizer por quê.
 *
 * Estes testes travam o diagnóstico que passou a explicar o motivo.
 */

import { describe, it, expect } from 'vitest';
import {
    diagnosticarColunas,
    explicarZeroLancamentos,
    chavesDeColunasMapeadas,
    montarLancamentos,
} from '../apontamentoMapper';
import type {
    ApontamentoParseado,
    CatalogoEventos,
    EmpresaApontamento,
    FuncionarioApontamento,
    MapeamentoApontamento,
} from '../folhaTypes';

const catalogo: CatalogoEventos = {
    cliente: 'x',
    empresa: 'x',
    total_eventos: 2,
    total_vencimentos: 1,
    total_descontos: 1,
    legenda: { tp: {}, rv: {}, incidencias: {}, ro: {} },
    eventos: [
        {
            codigo: '5850', descricao: 'FALTAS E ATRASOS (T/H)', tipo: 'D', rv: 'R',
            coeficiente: 0, ro: '000',
            incidencias: { ir: 'N', in: 'N', irf: 'N', inf: 'N', fg: 'N', rt: 'N', vr: 'N' },
        },
        {
            codigo: '1112', descricao: 'ADICIONAL NOTURNO', tipo: 'V', rv: 'R',
            coeficiente: 0, ro: '000',
            incidencias: { ir: 'N', in: 'N', irf: 'N', inf: 'N', fg: 'N', rt: 'N', vr: 'N' },
        },
    ],
};

/** Funcionário do parser (obs é obrigatório no tipo). */
const func = (nome: string, celulas: Record<string, unknown>): FuncionarioApontamento =>
    ({ nome, celulas, obs: null });

const parsedCom = (empresas: EmpresaApontamento[]): ApontamentoParseado =>
    ({ parser: 'apontamento-folha', versao: '1', processado_em: '', empresas });

// Mapeamento gravado com a grafia ANTIGA das colunas.
const mapa: MapeamentoApontamento = {
    cliente: '00000000000191',
    empresa_base: '0001',
    competencia_default: '',
    empresas: { Planilha1: { codigo_sage: '0001', ativa: true } },
    mapeamento_colunas: {
        'ATRASOS 5850': { evento: '5850', descricao_evento: 'FALTAS E ATRASOS (T/H)', tipo: 'D', rv: 'R', ignorar_se_zero: true },
    },
    regras_descontos_empresa: {
        coluna: '',
        campo_obs: 'OBS',
        evento_padrao: { evento: '', descricao_evento: '', tipo: 'D', rv: 'V' },
        regras: [],
    },
    regra_salario: null,
    matriculas: { Planilha1: { 'MARIA DA SILVA': '101', 'JOAO SOUZA': '102' } },
};

// Aba com os títulos NOVOS — nenhum casa com o mapeamento acima.
const abaFopag: EmpresaApontamento = {
    nome: 'FOPAG',
    colunas: ['VT', 'Falta', 'Ad. Noturno 35%', 'Atraso'],
    funcionarios: [
        func('MARIA DA SILVA', { VT: 194.62, Falta: null, 'Ad. Noturno 35%': 1.5, Atraso: '-' }),
        func('JOAO SOUZA', { VT: 372.05, Falta: null, 'Ad. Noturno 35%': null, Atraso: 0.12 }),
    ],
};

const marcadas = new Set(['Falta', 'Ad. Noturno 35%', 'Atraso']);

describe('diagnosticarColunas', () => {
    it('aponta as colunas marcadas que estão fora do mapeamento', () => {
        const d = diagnosticarColunas(abaFopag, mapa, marcadas);
        expect(d.selecionadasSemRegra.sort()).toEqual(['Ad. Noturno 35%', 'Atraso', 'Falta']);
        expect(d.selecionadasOk).toEqual([]);
        expect(d.totalRegras).toBe(1);
    });

    it('separa "mapeada mas sem valor" de "mapeada e ok"', () => {
        const aba: EmpresaApontamento = {
            nome: 'FOPAG',
            colunas: ['ATRASOS 5850', 'Falta'],
            funcionarios: [
                func('MARIA DA SILVA', { 'ATRASOS 5850': 0, Falta: null }),
                func('JOAO SOUZA', { 'ATRASOS 5850': '-', Falta: null }),
            ],
        };
        const d = diagnosticarColunas(aba, mapa, new Set(['ATRASOS 5850', 'Falta']));
        // zerado + "-" → nenhum valor aproveitável
        expect(d.selecionadasSemValor).toEqual(['ATRASOS 5850']);
        expect(d.selecionadasSemRegra).toEqual(['Falta']);
        expect(d.selecionadasOk).toEqual([]);
    });

    it('casa a coluna mesmo com grafia/espaçamento diferente (NBSP)', () => {
        const aba: EmpresaApontamento = {
            nome: 'FOPAG',
            colunas: ['ATRASOS  5850'],
            funcionarios: [func('MARIA DA SILVA', { 'ATRASOS  5850': 1.15 })],
        };
        const d = diagnosticarColunas(aba, mapa, null);
        expect(d.selecionadasOk).toEqual(['ATRASOS  5850']);
        expect(d.selecionadasSemRegra).toEqual([]);
    });

    it('lista as mapeadas COM dados que ficaram desmarcadas', () => {
        const aba: EmpresaApontamento = {
            nome: 'FOPAG',
            colunas: ['ATRASOS 5850', 'Falta'],
            funcionarios: [func('MARIA DA SILVA', { 'ATRASOS 5850': 1.15, Falta: null })],
        };
        const d = diagnosticarColunas(aba, mapa, new Set(['Falta']));
        expect(d.mapeadasNaoSelecionadas).toEqual(['ATRASOS 5850']);
    });

    it('não acusa de "sem mapeamento" a coluna usada como matrícula', () => {
        const mapaComMatricula: MapeamentoApontamento = { ...mapa, campo_matricula: 'Codigo' };
        const aba: EmpresaApontamento = {
            nome: 'FOPAG',
            colunas: ['Codigo'],
            funcionarios: [func('MARIA DA SILVA', { Codigo: 101 })],
        };
        expect(diagnosticarColunas(aba, mapaComMatricula, null).selecionadasSemRegra).toEqual([]);
        expect(chavesDeColunasMapeadas(mapaComMatricula).has('Codigo')).toBe(true);
    });
});

describe('explicarZeroLancamentos', () => {
    const parsed = parsedCom([abaFopag]);

    it('nomeia as colunas problemáticas e a saída para resolver', () => {
        const txt = explicarZeroLancamentos(parsed, mapa, marcadas);
        expect(txt).toContain('Nenhum lançamento foi gerado');
        expect(txt).toContain('"Ad. Noturno 35%"');
        expect(txt).toContain('"Atraso"');
        expect(txt).toContain('Ajustar mapeamento de colunas');
        // A dúvida da operadora era "é por causa da senha do Excel?" — não é.
        expect(txt).toContain('senha');
    });

    it('diz quando o problema é não ter nada marcado', () => {
        const txt = explicarZeroLancamentos(parsed, mapa, new Set());
        expect(txt).toContain('Nenhuma coluna está marcada');
    });
});

describe('montarLancamentos — alerta de aba vazia', () => {
    it('explica a aba que não gerou nada, em vez de ficar em silêncio', () => {
        const parsed = parsedCom([abaFopag]);
        const r = montarLancamentos(parsed, mapa, catalogo, { colunasAtivas: marcadas });
        expect(r.lancamentos).toHaveLength(0);
        expect(r.alertas.some((a) => a.includes('não existem no mapeamento deste cliente'))).toBe(true);
    });

    it('continua gerando normalmente quando a coluna casa', () => {
        const aba: EmpresaApontamento = {
            nome: 'FOPAG',
            colunas: ['ATRASOS 5850'],
            funcionarios: [func('MARIA DA SILVA', { 'ATRASOS 5850': 1.15 })],
        };
        const parsed = parsedCom([aba]);
        const r = montarLancamentos(parsed, mapa, catalogo, { colunasAtivas: new Set(['ATRASOS 5850']) });
        expect(r.lancamentos).toHaveLength(1);
        expect(r.lancamentos[0]).toMatchObject({ evento: '5850', matricula: '101', valor: 1.15 });
        expect(r.alertas.some((a) => a.includes('nenhum lançamento gerado'))).toBe(false);
    });
});
