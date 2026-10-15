// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TabelaDsrCadastro from '../../../components/cadastros/TabelaDsrCadastro';
import type { Empresa } from '../../empresas/empresasTypes';

const svc = vi.hoisted(() => ({ listarTabelasDsr: vi.fn(), salvarTabelaDsr: vi.fn(), excluirTabelaDsr: vi.fn(), listarFechamentos: vi.fn() }));
vi.mock('../cadastrosService', () => ({ listarTabelasDsr: svc.listarTabelasDsr, salvarTabelaDsr: svc.salvarTabelaDsr, excluirTabelaDsr: svc.excluirTabelaDsr, mensagemErro: (e: unknown) => String(e) }));
vi.mock('../../fimDeMes/fechamentoService', () => ({ listarFechamentos: svc.listarFechamentos }));

const EMPRESAS = [
    { id: 'emp1', cnpj: '1', razaoSocial: 'S&P TESTE', nomeFantasia: '', codigoSage: '1200', criadoPor: 'u' },
    { id: 'emp2', cnpj: '2', razaoSocial: 'OUTRA', nomeFantasia: '', codigoSage: '0229', criadoPor: 'u' },
] as unknown as Empresa[];
const usuario = { id: 'u1', email: 'a@b.c' };
const ano = String(new Date().getFullYear());

beforeEach(() => {
    Object.values(svc).forEach(f => f.mockReset());
    svc.listarTabelasDsr.mockResolvedValue([]);
    svc.listarFechamentos.mockResolvedValue([]);
    svc.salvarTabelaDsr.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Tabela para D.S.R. (tela)', () => {
    it('cópia padrão pelo calendário, acerta um mês e grava; o Nº horas D.S.R. sai dos domingos e feriados', async () => {
        render(<TabelaDsrCadastro empresas={EMPRESAS} empresaInicial="emp1" usuario={usuario} isAdmin={false} />);
        fireEvent.change(await screen.findByLabelText('Ano da Tabela de DSR'), { target: { value: '2026' } });
        fireEvent.click(await screen.findByRole('button', { name: 'Cópia padrão' }));
        const nov = screen.getByLabelText('Domingos e feriados de NOV') as HTMLInputElement;
        expect(nov.value).toBe('7');
        expect((screen.getByLabelText('Dias úteis de JAN') as HTMLInputElement).value).toBe('26');
        expect(screen.getAllByText('36,67').length).toBeGreaterThan(0);
        fireEvent.change(nov, { target: { value: '6' } });
        fireEvent.change(screen.getByLabelText('Dias úteis de NOV'), { target: { value: '24' } });
        expect(screen.getByText(/Diferente do calendário/).textContent).toContain('NOV tabela 24 úteis/6 DSR, calendário 23/7');
        fireEvent.click(screen.getByLabelText(/Descontar faltas pelos dias do mês/));
        fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
        await waitFor(() => expect(svc.salvarTabelaDsr).toHaveBeenCalled());
        const [antes, t] = svc.salvarTabelaDsr.mock.calls[0];
        expect(antes).toBeNull();
        expect(t).toMatchObject({ empresaId: 'emp1', ano: '2026', faltasPelosDiasDoMes: true, descontarDsrNaFalta: false });
        expect(t.meses['11']).toEqual({ uteis: 24, descanso: 6 });
    });

    it('não grava soma errada nem mês encerrado; cópia entre empresas', async () => {
        svc.listarFechamentos.mockResolvedValue([{ id: 'x', empresaId: 'emp1', competencia: `${ano}-01`, situacao: 'encerrado', checklist: {} }]);
        const outra = { id: `emp2_${ano}`, empresaId: 'emp2', ano, faltasPelosDiasDoMes: false, descontarDsrNaFalta: true, observacao: '',
            meses: Object.fromEntries(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map(m => [m, { uteis: 20, descanso: 11 }])) };
        svc.listarTabelasDsr.mockImplementation(async (id: string) => (id === 'emp2' ? [outra] : []));
        render(<TabelaDsrCadastro empresas={EMPRESAS} empresaInicial="emp1" usuario={usuario} isAdmin={false} />);
        fireEvent.change(await screen.findByLabelText('Copiar a tabela da empresa'), { target: { value: 'emp2' } });
        fireEvent.click(screen.getByRole('button', { name: 'Copiar' }));
        await screen.findByText('Copiada da outra empresa: confira e grave.');
        expect((screen.getByLabelText('Dias úteis de MAR') as HTMLInputElement).value).toBe('20');
        fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
        const alerta = await screen.findByRole('alert');
        expect(alerta.textContent).toMatch(/devem somar os/);
        expect(alerta.textContent).toMatch(/Mês encerrado: JAN/);
        expect((screen.getByLabelText('Dias úteis de JAN') as HTMLInputElement).disabled).toBe(true);
        expect(svc.salvarTabelaDsr).not.toHaveBeenCalled();
    });
});
