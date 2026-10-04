// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const salvarCarteira = vi.fn(async () => undefined);
vi.mock('../../auth/authService', () => ({
    listUsers: async () => [
        { uid: 'eu', name: 'Eu Mesmo', email: 'eu@x', role: 'admin' },
        { uid: 'c1', name: 'Carla Colab', email: 'c@x', role: 'colaborador' },
        { uid: 'a2', name: 'Otto Admin', email: 'a@x', role: 'admin' },
        { uid: 'p1', name: 'Paulo Pend', email: 'p@x', role: 'pendente' },
    ],
    approveUser: vi.fn(), setRole: vi.fn(),
}));
vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [
        { id: 'A', cnpj: '11222333000181', razaoSocial: 'ALFA LTDA', nomeFantasia: 'Alfa', codigoSage: '0001', criadoPor: 'g' },
        { id: 'B', cnpj: '11444777000161', razaoSocial: 'BETA LTDA', nomeFantasia: 'Beta', codigoSage: '0002', criadoPor: 'g' },
        { id: 'M', cnpj: '22333444000155', razaoSocial: 'MINHA LTDA', nomeFantasia: 'Minha', codigoSage: '0003', criadoPor: 'eu' },
    ],
}));
vi.mock('../carteiraService', () => ({
    listarCarteiras: async () => new Map([['c1', ['A', 'Z']], ['a2', ['B']]]),
    lerCarteira: async () => ['A', 'B'],
    salvarCarteira: (...a: unknown[]) => salvarCarteira(...(a as [])),
}));
vi.mock('../../cadastros/cadastrosService', () => ({ mensagemErro: (e: Error) => e.message }));

import AdminUsersPanel from '../../../components/auth/AdminUsersPanel';

afterEach(() => { cleanup(); salvarCarteira.mockClear(); });
const linha = (nome: string) => screen.getByText(nome).closest('tr')!;

describe('carteira na tela de usuários', () => {
    it('admin: carteira só de colaborador; empresa fora da carteira dele fica travada; salva o que mudou', async () => {
        render(<AdminUsersPanel currentUser={{ id: 'eu', uid: 'eu', name: 'Eu Mesmo', email: 'eu@x', role: 'admin' } as never} />);
        await waitFor(() => expect(within(linha('Carla Colab')).getByText(/2 empresa\(s\)/)).toBeTruthy());
        expect(within(linha('Otto Admin')).queryByRole('button', { name: 'Carteira' })).toBeNull();
        expect(within(linha('Paulo Pend')).queryByRole('button', { name: 'Carteira' })).toBeNull();
        fireEvent.click(within(linha('Carla Colab')).getByRole('button', { name: 'Carteira' }));
        const modal = screen.getByRole('dialog', { name: 'Carteira do colaborador' });
        expect((within(modal).getByLabelText('Alfa') as HTMLInputElement).checked).toBe(true);
        expect((within(modal).getByLabelText('Minha') as HTMLInputElement).disabled).toBe(true);
        expect(within(modal).getByText(/1 empresa\(s\) desta carteira estão fora da sua visão/)).toBeTruthy();
        fireEvent.click(within(modal).getByLabelText('Beta'));
        expect(within(modal).getByText('Ao salvar: 1 incluída(s), 0 retirada(s).')).toBeTruthy();
        fireEvent.click(within(modal).getByRole('button', { name: 'Salvar carteira' }));
        await waitFor(() => expect(salvarCarteira).toHaveBeenCalledTimes(1));
        expect(salvarCarteira).toHaveBeenCalledWith({ uid: 'c1', nome: 'Carla Colab', email: 'c@x' }, ['A', 'Z'], ['A', 'Z', 'B'], { id: 'eu', email: 'eu@x' });
    });

    it('gestor: monta a carteira de admins também, e a busca filtra', async () => {
        render(<AdminUsersPanel currentUser={{ id: 'eu', uid: 'eu', name: 'Eu Mesmo', email: 'eu@x', role: 'gestor' } as never} />);
        await waitFor(() => expect(within(linha('Otto Admin')).getByRole('button', { name: 'Carteira' })).toBeTruthy());
        fireEvent.click(within(linha('Otto Admin')).getByRole('button', { name: 'Carteira' }));
        const modal = screen.getByRole('dialog', { name: 'Carteira do colaborador' });
        expect((within(modal).getByLabelText('Minha') as HTMLInputElement).disabled).toBe(false);
        fireEvent.change(within(modal).getByLabelText('Buscar empresa'), { target: { value: 'alfa' } });
        expect(within(modal).queryByLabelText('Beta')).toBeNull();
        fireEvent.click(within(modal).getByRole('button', { name: /Marcar as 1 da lista/ }));
        fireEvent.click(within(modal).getByRole('button', { name: 'Salvar carteira' }));
        await waitFor(() => expect(salvarCarteira).toHaveBeenCalledWith(expect.objectContaining({ uid: 'a2' }), ['B'], ['B', 'A'], { id: 'eu', email: 'eu@x' }));
    });
});
