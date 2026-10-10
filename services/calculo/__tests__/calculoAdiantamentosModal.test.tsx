// @vitest-environment jsdom
// Modal "Cálculo de Adiantamentos": linhas por funcionário, totais e fixar o valor pago no movimento (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CalculoAdiantamentosModal, { linhasDoAdiantamento } from '../../../components/calculo/CalculoAdiantamentosModal';
import { calcularMensal } from '../motorMensal';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';

afterEach(cleanup);
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha = (id: string, nome: string, dados: FichaFuncionario['dados']): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo',
    dados: { nome, admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const fichas = [ficha('f1', 'ANA', { adiantamentoPct: '40' }), ficha('f2', 'BRUNO', {}), ficha('f3', 'CAIO', { adiantamentoPct: '40' })];
const calc = (f: FichaFuncionario, movimento = {}) => calcularMensal({ competencia: '2026-10', pagamento: '2026-10', ficha: f, tabelas: TAB, afastamentos: [], movimento, folhaPagaNoAdiantamento: null });
const resultados = [calc(fichas[0]), calc(fichas[1]), calc(fichas[2], { adiantamento: 50000 })];

describe('Cálculo de Adiantamentos', () => {
    it('linhas: quem tem percentual ou valor informado; o valor e o que se paga', () => {
        const l = linhasDoAdiantamento(resultados, fichas, { f3: { adiantamento: 50000 } }, '2026-10-20');
        expect(l.map(x => [x.nome, x.percentual, x.informado, x.adiantamento, x.aPagar, x.situacao])).toEqual([
            ['ANA', '40%', false, 120000, 120000, 'ok'], ['CAIO', '40%', true, 50000, 50000, 'ok']]);
    });

    it('totais, fixar o valor pago (só os calculados pela ficha) e as ações', () => {
        const onFixar = vi.fn(); const onRecibos = vi.fn(); const onArquivo = vi.fn();
        render(<CalculoAdiantamentosModal empresaNome="EMPRESA" competencia="2026-10" dataAdiantamento="2026-10-20" resultados={resultados} fichas={fichas} movs={{ f3: { adiantamento: 50000 } }}
            pendentes={0} onFixar={onFixar} onRecibos={onRecibos} onArquivo={onArquivo} onFechar={() => {}} />);
        expect(screen.getByText('Total (2)').closest('tr')!.textContent).toMatch(/1\.700,00/);
        fireEvent.click(screen.getByText('Fixar os valores no movimento (1)'));
        expect(onFixar).toHaveBeenCalledWith({ f1: 120000 });
        fireEvent.click(screen.getByText('Recibos (PDF)'));
        fireEvent.click(screen.getByText('Arquivo bancário'));
        expect([onRecibos.mock.calls.length, onArquivo.mock.calls.length]).toEqual([1, 1]);
    });

    it('com bloqueio (movimento por salvar), o arquivo bancário não sai', () => {
        render(<CalculoAdiantamentosModal empresaNome="EMPRESA" competencia="2026-10" dataAdiantamento="2026-10-20" resultados={resultados} fichas={fichas} movs={{}}
            pendentes={1} bloqueio="Salve o movimento antes." onFixar={() => {}} onRecibos={() => {}} onArquivo={() => {}} onFechar={() => {}} />);
        expect((screen.getByText('Arquivo bancário') as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getAllByText(/Salve o movimento antes/).length).toBeGreaterThan(0);
    });
});
