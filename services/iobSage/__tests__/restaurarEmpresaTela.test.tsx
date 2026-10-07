// @vitest-environment jsdom
// Tela "Restaurar a empresa no Consultor": plano de outro backup não grava.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Restauracao } from '../restauracao';

const m = vi.hoisted(() => ({ resolver: null as ((p: unknown) => void) | null, salvos: [] as unknown[], param: null as unknown }));
vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [{ id: 'emp1', cnpj: '11222333000181', razaoSocial: 'SP LTDA', nomeFantasia: 'SP', codigoSage: '1200', criadoPor: 'g' }],
}));
vi.mock('../restaurarEmpresaService', () => ({
    lerParametros: () => ({ fpas: '', codigoTerceiros: '', terceiros: 0, historicoDesde: '2024-01', fapDesde: '2025-01', sexagesimal: false, criarFichas: true, mapeamento: {}, eventos: {} }),
    salvarParametros: (p: unknown) => { m.salvos.push(p); },
    carregarExistentes: async () => ({ fichas: [], afastamentos: [], enquadramentos: [], movimentos: {} }),
    gravarRestauracao: vi.fn(),
}));
vi.mock('../restaurarEmpresa', async orig => ({
    ...(await orig<typeof import('../restaurarEmpresa')>()),
    planejarRestauracao: (_r: unknown, _e: unknown, _x: unknown, p: unknown) => { m.param = p; return new Promise(r => { m.resolver = r; }); },
}));
import RestaurarEmpresaNoConsultor from '../../../components/iobSage/RestaurarEmpresaNoConsultor';

const rest = (n: string) => ({ grupos: ['f1200'], tabelas: [], backups: [{}], nome: n } as unknown as Restauracao);
const plano = { etapas: [{ titulo: 'Vínculos pelo eSocial', resumo: '1 XML', avisos: [] }], fichas: [{}], enquadramentos: [], afastamentos: [], movimentos: [], origem: [], eventosHistorico: [] as unknown[] };
const evento = (codeven: string, descricao: string, automatica: string | null) => ({ codeven, descricao, natRubr: '', classe: automatica, automatica, manual: false, linhas: 3, total: 12 });
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

describe('restaurar empresa: classificação dos eventos', () => {
    it('a equipe acerta vários eventos; o plano é refeito com o acerto salvo', async () => {
        const u = { id: 'u', email: 'e' };
        render(<RestaurarEmpresaNoConsultor restauracao={rest('c')} arquivos={['c.backup']} usuario={u} podeRestaurar />);
        await waitFor(() => expect(screen.getByRole('option', { name: /1200 · SP/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa do backup'), { target: { value: '1200' } });
        m.resolver = null;
        fireEvent.click(screen.getByRole('button', { name: 'Preparar a restauração' }));
        await waitFor(() => expect(m.resolver).not.toBeNull());
        await act(async () => { m.resolver!({ ...plano, eventosHistorico: [evento('130', 'HORAS EXTRAS', null), evento('5850', 'FALTAS E ATRASOS (T/H)', null), evento('140', 'FALTAS', 'faltasDias')] }); });
        expect(screen.getByRole('option', { name: /Automático: Faltas/ })).toBeTruthy();

        fireEvent.change(screen.getByLabelText('Classificação do evento 130'), { target: { value: 'horasExtras50' } });
        // O plano antigo não vale mais, mas a tabela continua para acertar os outros.
        expect(screen.queryByRole('button', { name: /Gravar tudo/ })).toBeNull();
        fireEvent.change(screen.getByLabelText('Classificação do evento 140'), { target: { value: 'ignorar' } });
        fireEvent.change(screen.getByLabelText('Classificação do evento 140'), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText('Classificação do evento 5850'), { target: { value: 'ignorar' } });

        m.resolver = null;
        fireEvent.click(screen.getByRole('button', { name: 'Preparar a restauração' }));
        await waitFor(() => expect(m.resolver).not.toBeNull());
        expect((m.param as { eventos: unknown }).eventos).toEqual({ 130: 'horasExtras50', 5850: 'ignorar' });
        expect((m.salvos.at(-1) as { eventos: unknown }).eventos).toEqual({ 130: 'horasExtras50', 5850: 'ignorar' });
    });
});
