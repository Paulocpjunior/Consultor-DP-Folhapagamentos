// @vitest-environment jsdom
// Fórmula própria por evento: o avaliador (sem eval), o "Lançar evento", a importação de valores e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { avaliarFormula, validarFormula, variaveisDaFormula } from '../formulaEvento';
import { lancarEvento } from '../lancarEvento';
import { aplicarValores, lerValoresIob } from '../importacaoValores';
import type { EventoIobSage } from '../../folha/folhaTypes';
import { fichaVazia } from '../../cadastros/funcionarios';

const ev = (codigo: string, descricao: string, x: Partial<EventoIobSage> = {}): EventoIobSage => ({ codigo, descricao, tipo: 'V', rv: 'R', ro: '020', coeficiente: 1.5, incidencias: { in: 'S', ir: 'S', fg: 'S' }, ...x } as EventoIobSage);
const SAL = { mensal: 330000, horasMes: 220 };

describe('avaliador', () => {
    it('contas, precedência, parênteses, vírgula decimal, MIN/MAX/ARRED e variáveis', () => {
        const v = { REF: 10, SALARIO: 3300, SALARIO_HORA: 15, SALARIO_DIA: 110, HORAS_MES: 220, COEF: 1.5 };
        const ok = (e: string) => { const r = avaliarFormula(e, v); if ('erro' in r) throw new Error(r.erro); return r.valor; };
        expect(ok('2 + 3 * 4')).toBe(14);
        expect(ok('(2 + 3) * 4')).toBe(20);
        expect(ok('SALARIO * 0,1')).toBeCloseTo(330);
        expect(ok('REF × SALARIO_HORA × 1,6')).toBeCloseTo(240);
        expect(ok('-2 + 5')).toBe(3);
        expect(ok('MIN(REF * 25; 200)')).toBe(200);
        expect(ok('max(1; 2; 3)')).toBe(3);
        expect(ok('ARRED(SALARIO / 7; 2)')).toBe(471.43);
        expect(ok('ARRED(10 / 3)')).toBe(3.33);
    });
    it('erros em português, sem executar código', () => {
        const v = { REF: 1 };
        const erro = (e: string) => { const r = avaliarFormula(e, v); return 'erro' in r ? r.erro : ''; };
        expect(erro('')).toMatch(/vazia/);
        expect(erro('REF +')).toMatch(/termina no meio/);
        expect(erro('(REF * 2')).toMatch(/fechar um parêntese/);
        expect(erro('REF / 0')).toMatch(/Divisão por zero/);
        expect(erro('SALARIO * 2')).toMatch(/"SALARIO" não é variável/);
        expect(erro('alert(1)')).toMatch(/"ALERT" não é variável/);
        expect(erro('REF; 2')).toMatch(/Sobrou/);
        expect(erro('1.234,56')).toMatch(/uma vírgula decimal/);
        expect(erro('REF ** 2')).toMatch(/fora de lugar/);
        expect(erro('constructor["x"]')).toMatch(/não permitido/);
        expect(validarFormula({ expressao: 'REF * 2', referencia: 'nenhuma' }).join(' ')).toMatch(/usa REF/);
        expect(validarFormula({ expressao: 'SALARIO * 0,05', referencia: 'nenhuma' })).toEqual([]);
        expect(variaveisDaFormula(12345, 'valor', SAL, 1).REF).toBe(123.45);
    });
});

describe('lançar evento e importação com fórmula', () => {
    it('a fórmula vale sobre a rotina e vai como avulso com as incidências do evento', () => {
        const he = ev('0010', 'HORA EXTRA 60%', { coeficiente: 1.6 });
        const r = lancarEvento(he, 10, SAL, {}, { expressao: 'REF * SALARIO_HORA * 1,7', referencia: 'horas' });
        if ('erro' in r) throw new Error(r.erro);
        expect(r.movimento.lancamentos).toEqual([expect.objectContaining({ descricao: '0010 HORA EXTRA 60%', valor: Math.round(10 * 15 * 1.7 * 100), tipo: 'provento', inss: true })]);
        expect(r.mensagem).toMatch(/fórmula REF \* SALARIO_HORA \* 1,7 com REF 10/);
        // Sem referência: só a fórmula.
        const b = lancarEvento(ev('0200', 'BONUS'), 0, SAL, {}, { expressao: 'SALARIO * 0,1', referencia: 'nenhuma' });
        expect('erro' in b ? b.erro : b.movimento.lancamentos?.[0].valor).toBe(33000);
        expect('erro' in lancarEvento(ev('0200', 'BONUS'), 0, null, {}, { expressao: 'SALARIO * 0,1', referencia: 'nenhuma' })).toBe(true);
        const ruim = lancarEvento(ev('0200', 'BONUS'), 0, SAL, {}, { expressao: 'SALARIO - 5000', referencia: 'nenhuma' });
        expect('erro' in ruim && ruim.erro).toMatch(/dá -R\$/);
    });
    it('importação de valores usa a fórmula da empresa', () => {
        const linha = `000123001000000010000000  ${'0'.repeat(14)}`;
        const ficha = { ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'A', cpf: 'A', situacao: 'ativo' as const, dados: { nome: 'ANA', codigoIob: '123', admissao: '2025-01-02', salario: '3300.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101' } };
        const a = aplicarValores({ linhas: lerValoresIob(linha).linhas, competencia: '2026-10', codigoEmpresa: '1', fichas: [ficha], eventos: [ev('0010', 'HORA EXTRA 60%', { coeficiente: 1.6 })], movimentos: {},
            formulas: { '0010': { expressao: 'REF * 100', referencia: 'horas' } } });
        expect(a.resultados[0].ok).toBe(true);
        expect(a.movimentos.A.lancamentos?.[0].valor).toBe(100000);
    });
});

const srv = vi.hoisted(() => ({ params: {} as Record<string, unknown> }));
vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [{ id: 'E1', parametrosFolha: srv.params }],
    atualizarParametrosFolha: async (_id: string, mudar: (p: unknown) => Record<string, unknown>) => { srv.params = mudar(srv.params); return srv.params; },
}));
import FormulasEventosEmpresa from '../../../components/folha/FormulasEventosEmpresa';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
afterEach(() => { cleanup(); srv.params = {}; vi.restoreAllMocks(); });

describe('tela', () => {
    it('inclui a fórmula com o exemplo e remove', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<EmpresaAtivaProvider ativa={{ id: 'E1', nome: 'ALFA', cnpj: '44388152000189', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 }} trocar={() => {}}>
            <FormulasEventosEmpresa eventos={[ev('0010', 'HORA EXTRA 60%')]} /></EmpresaAtivaProvider>);
        await waitFor(() => expect(screen.getByLabelText('Fórmula do evento')).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Evento da fórmula'), { target: { value: '10' } });
        fireEvent.change(screen.getByLabelText('Fórmula do evento'), { target: { value: 'REF * SALARIO_HORA * 1,6' } });
        expect(screen.getByLabelText('Exemplo da fórmula').textContent).toMatch(/R\$ 218,18/);
        fireEvent.click(screen.getByText('Incluir'));
        await waitFor(() => expect(srv.params).toEqual({ formulasEventos: { '0010': { expressao: 'REF * SALARIO_HORA * 1,6', referencia: 'horas' } } }));
        await waitFor(() => expect(screen.getByText('remover')).toBeTruthy());
        fireEvent.click(screen.getByText('remover'));
        await waitFor(() => expect(srv.params).toEqual({ formulasEventos: {} }));
    });
});
