// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EnquadramentoCadastro from '../../../components/cadastros/EnquadramentoCadastro';
import type { Empresa } from '../../empresas/empresasTypes';

const svc = vi.hoisted(() => ({ listarEnquadramentos: vi.fn(), salvarEnquadramento: vi.fn(), excluirEnquadramento: vi.fn(), mensagemErro: (e: unknown) => String(e) }));
vi.mock('../cadastrosService', () => svc);
const EMP = { id: 'emp1', cnpj: '11222333000181', razaoSocial: 'EMPRESA UM', nomeFantasia: 'Um', codigoSage: '0229', criadoPor: 'u' } as Empresa;
afterEach(cleanup);

describe('Cadastros › Enquadramento', () => {
    it('lista, valida e grava um enquadramento normal', async () => {
        svc.listarEnquadramentos.mockResolvedValue([]);
        svc.salvarEnquadramento.mockResolvedValue(undefined);
        render(<EnquadramentoCadastro empresa={EMP} usuario={{ id: 'u1', email: 'a@b' }} isAdmin={false} />);
        await waitFor(() => expect(screen.getByText(/Nenhum enquadramento/)).toBeTruthy());
        fireEvent.click(screen.getByText('Novo enquadramento'));
        fireEvent.change(screen.getByLabelText('Vigência'), { target: { value: '2026-01' } });
        fireEvent.click(screen.getByText('Salvar'));
        expect(screen.getByRole('alert').textContent).toContain('RAT: 1, 2 ou 3%');
        fireEvent.change(screen.getByLabelText('RAT'), { target: { value: '2' } });
        fireEvent.change(screen.getByLabelText('FAP'), { target: { value: '1,1234' } });
        fireEvent.change(screen.getByLabelText('FPAS'), { target: { value: '515' } });
        fireEvent.change(screen.getByLabelText('Terceiros'), { target: { value: '5,8' } });
        fireEvent.click(screen.getByText('Salvar'));
        await waitFor(() => expect(svc.salvarEnquadramento).toHaveBeenCalledTimes(1));
        expect(svc.salvarEnquadramento.mock.calls[0][1]).toMatchObject({ empresaId: 'emp1', vigencia: '2026-01', regime: 'normal', patronal: 20, rat: 2, fap: 1.1234, fpas: '515', terceiros: 5.8 });
    });

    it('Simples (demais anexos) não pede RAT nem terceiros', async () => {
        svc.listarEnquadramentos.mockResolvedValue([{ id: 'emp1_2025-01', empresaId: 'emp1', vigencia: '2025-01', regime: 'simples', fpas: '', codigoTerceiros: '', patronal: 20, rat: 0, fap: 1, terceiros: 0, observacao: '' }]);
        render(<EnquadramentoCadastro empresa={EMP} usuario={{ id: 'u1', email: 'a@b' }} isAdmin={true} />);
        await waitFor(() => expect(screen.getByText('Sem contribuição patronal na folha.')).toBeTruthy());
        fireEvent.click(screen.getByText(/A partir de 01\/2025/));
        expect(screen.queryByLabelText('RAT')).toBeNull();
        expect(screen.queryByLabelText('Terceiros')).toBeNull();
        expect(screen.getByText('excluir')).toBeTruthy();
    });
});
