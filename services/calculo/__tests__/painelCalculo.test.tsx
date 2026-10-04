// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CalculoPanel from '../../../components/calculo/CalculoPanel';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const xlsx = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock('xlsx', async orig => ({ ...(await orig<typeof import('xlsx')>()), writeFile: xlsx.writeFile }));
vi.mock('../../empresas/empresasService', () => ({
    listarTodasEmpresas: async () => [{ id: 'emp1', cnpj: '11222333000181', razaoSocial: 'EMPRESA UM', nomeFantasia: 'Um', codigoSage: '0229', criadoPor: 'u' }],
}));
const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (id: string, nome: string, dados: FichaFuncionario['dados']): FichaFuncionario => ({ ...fichaVazia(EMP), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo', dados: { nome, admissao: '2024-01-02', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2025-05', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
vi.mock('../../cadastros/cadastrosService', () => ({
    mensagemErro: (e: unknown) => String(e),
    listarFuncionarios: async () => [ficha('f1', 'ANA', { salario: '2200.00' }), ficha('f2', 'BRUNO', { salario: '' }), ficha('f3', 'CAIO', { salario: '3000.00', admissao: '2030-01-01' })],
    listarAfastamentos: async () => [],
    listarTabelas: async () => [INSS, IR],
}));

afterEach(cleanup);

describe('aba Cálculo', () => {
    it('calcula a empresa, abre o holerite, aplica o movimento e exporta', async () => {
        render(<CalculoPanel />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        expect((screen.getByLabelText('Mês do pagamento') as HTMLInputElement).value).toBe('2026-04');
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        expect(screen.queryByText('CAIO')).toBeNull(); // admitido depois da competência
        expect(screen.getByText('BRUNO').closest('tr')!.textContent).toContain('erro');

        fireEvent.click(screen.getByText('ANA'));
        const holerite = screen.getByRole('region', { name: 'Holerite de ANA' });
        expect(within(holerite).getByText('Salário').closest('tr')!.textContent).toContain('2.200,00');
        fireEvent.change(within(holerite).getByLabelText('Horas extras 50%'), { target: { value: '10' } });
        await waitFor(() => expect(within(holerite).getByText('Horas extras 50%', { selector: 'td' })).toBeTruthy());
        expect(within(holerite).getByText('Horas extras 50%', { selector: 'td' }).closest('tr')!.textContent).toContain('150,00');
        expect(within(holerite).getByText('DSR sobre horas extras').closest('tr')!.textContent).toContain('28,85');
        expect(screen.getByText('(com movimento)')).toBeTruthy();

        fireEvent.click(within(holerite).getByText('Adicionar lançamento'));
        fireEvent.change(within(holerite).getByLabelText('Descrição do lançamento 1'), { target: { value: 'Vale-transporte' } });
        fireEvent.change(within(holerite).getByLabelText('Tipo do lançamento 1'), { target: { value: 'desconto' } });
        fireEvent.change(within(holerite).getByLabelText('Valor do lançamento 1'), { target: { value: '132,00' } });
        await waitFor(() => expect(within(holerite).getByText('Vale-transporte', { selector: 'td' })).toBeTruthy());

        fireEvent.click(screen.getByText('Exportar Excel'));
        expect(xlsx.writeFile).toHaveBeenCalledWith(expect.anything(), 'calculo-0229-2026-03.xlsx');
    });
});
