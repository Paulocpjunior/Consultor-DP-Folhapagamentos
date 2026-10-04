// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrazosPanel from '../../../components/prazos/PrazosPanel';
import { fichaVazia } from '../../cadastros/funcionarios';

vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [
        { id: 'emp1', cnpj: '11222333000181', razaoSocial: 'EMPRESA UM', nomeFantasia: 'Um', codigoSage: '0001', criadoPor: 'u' },
        { id: 'emp2', cnpj: '11444777000161', razaoSocial: 'EMPRESA DOIS', nomeFantasia: 'Dois', codigoSage: '0002', criadoPor: 'u' },
    ],
}));
vi.mock('../../cadastros/cadastrosService', async orig => ({
    ...(await orig<typeof import('../../cadastros/cadastrosService')>()),
    listarTodosFuncionariosAtivos: async () => [
        { ...fichaVazia({ id: 'emp1', cnpj: '' }), id: 'f1', cpf: '1', matriculaEsocial: 'A', dados: { nome: 'ANA EXPERIENCIA', admissao: '2026-08-01', tipoContrato: '2', fimContrato: '2026-10-29' } },
        { ...fichaVazia({ id: 'emp2', cnpj: '' }), id: 'f2', cpf: '2', matriculaEsocial: 'B', dados: { nome: 'BRUNO FERIAS', admissao: '2024-01-10' } },
    ],
    listarTodosAfastamentos: async () => [],
    listarSindicatos: async () => [],
}));

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-04T12:00:00')); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('painel de prazos', () => {
    it('mostra vencimentos com ajuste de dia útil e os prazos dos funcionários, com filtro por empresa', async () => {
        render(<PrazosPanel />);
        expect(screen.getAllByText('16/11/2026').length).toBeGreaterThan(0);
        expect(screen.getAllByText(/15\/11\/2026: Proclamação da República/).length).toBe(2);
        await waitFor(() => expect(screen.getByText('ANA EXPERIENCIA')).toBeTruthy());
        expect(screen.getByText('Fim do contrato de experiência')).toBeTruthy();
        expect(screen.getByText('Férias vencidas (pagamento em dobro)')).toBeTruthy();
        expect(screen.getByText('Vencidos: 1')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        expect(screen.queryByText('BRUNO FERIAS')).toBeNull();
        expect(screen.getByText('ANA EXPERIENCIA')).toBeTruthy();
    });
});
