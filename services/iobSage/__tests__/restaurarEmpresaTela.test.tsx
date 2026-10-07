// @vitest-environment jsdom
// Tela "Restaurar a empresa no Consultor": plano de outro backup não grava.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Restauracao } from '../restauracao';

const m = vi.hoisted(() => ({ resolver: null as ((p: unknown) => void) | null }));
vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [{ id: 'emp1', cnpj: '11222333000181', razaoSocial: 'SP LTDA', nomeFantasia: 'SP', codigoSage: '1200', criadoPor: 'g' }],
}));
vi.mock('../restaurarEmpresaService', () => ({
    lerParametros: () => ({ fpas: '', codigoTerceiros: '', terceiros: 0, historicoDesde: '2024-01', fapDesde: '2025-01', sexagesimal: false, criarFichas: true, mapeamento: {} }),
    salvarParametros: () => {},
    carregarExistentes: async () => ({ fichas: [], afastamentos: [], enquadramentos: [], movimentos: {} }),
    gravarRestauracao: vi.fn(),
}));
vi.mock('../restaurarEmpresa', async orig => ({
    ...(await orig<typeof import('../restaurarEmpresa')>()),
    planejarRestauracao: () => new Promise(r => { m.resolver = r; }),
}));
import RestaurarEmpresaNoConsultor from '../../../components/iobSage/RestaurarEmpresaNoConsultor';

const rest = (n: string) => ({ grupos: ['f1200'], tabelas: [], backups: [{}], nome: n } as unknown as Restauracao);
const plano = { etapas: [{ titulo: 'Vínculos pelo eSocial', resumo: '1 XML', avisos: [] }], fichas: [{}], enquadramentos: [], afastamentos: [], movimentos: [], origem: [] };
afterEach(cleanup);

describe('restaurar empresa: plano antigo', () => {
    it('com outro backup aberto durante o preparo, o resultado antigo é descartado', async () => {
        const u = { id: 'u', email: 'e' };
        const { rerender } = render(<RestaurarEmpresaNoConsultor restauracao={rest('a')} arquivos={['a.backup']} usuario={u} podeRestaurar />);
        await waitFor(() => expect(screen.getByRole('option', { name: /1200 · SP/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa do backup'), { target: { value: '1200' } });
        fireEvent.click(screen.getByRole('button', { name: 'Preparar a restauração' }));
        await waitFor(() => expect(m.resolver).not.toBeNull());
        rerender(<RestaurarEmpresaNoConsultor restauracao={rest('b')} arquivos={['b.backup']} usuario={u} podeRestaurar />);
        await act(async () => { m.resolver!(plano); });
        expect(screen.queryByRole('button', { name: /Gravar tudo/ })).toBeNull();

        // Sem troca, o plano aparece e pode ser gravado.
        m.resolver = null;
        fireEvent.click(screen.getByRole('button', { name: 'Preparar a restauração' }));
        await waitFor(() => expect(m.resolver).not.toBeNull());
        await act(async () => { m.resolver!(plano); });
        expect(screen.getByRole('button', { name: 'Gravar tudo (1)' })).toBeTruthy();
    });
});
