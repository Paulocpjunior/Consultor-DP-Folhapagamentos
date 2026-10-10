// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { checklistCompleto, competenciasPendentes, ITENS_FECHAMENTO, MSG_ENCERRADO, podeEncerrar, situacaoDe } from '../fechamento';
import FimDeMesPanel from '../../../components/fimDeMes/FimDeMesPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const srv = vi.hoisted(() => ({
    fech: null as unknown, todos: [] as unknown[], pedidos: [] as unknown[],
    encerrar: vi.fn(async (..._a: unknown[]) => undefined), reabrir: vi.fn(async (..._a: unknown[]) => undefined),
    pedir: vi.fn(async (..._a: unknown[]) => ({ id: 'p9' } as { id: string; erroEmail?: string })), recusar: vi.fn(async (..._a: unknown[]) => undefined),
}));
vi.mock('../fechamentoService', () => ({
    lerFechamento: async () => srv.fech, listarFechamentos: async () => srv.todos,
    listarPedidosPendentes: async () => srv.pedidos, listarPedidosDaEmpresa: async () => srv.pedidos,
    encerrarPeriodo: (...a: unknown[]) => srv.encerrar(...a), reabrirPeriodo: (...a: unknown[]) => srv.reabrir(...a),
    pedirReabertura: (...a: unknown[]) => srv.pedir(...a), recusarPedido: (...a: unknown[]) => srv.recusar(...a),
}));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'emp1', parametrosFolha: { motorHomologado: { desde: '2026-06', por: 'x', em: 'y' } } }] }));

const ATIVA = { id: 'emp1', nome: 'EMPRESA UM', cnpj: '11222333000181', codigoSage: '1200', competencia: '2026-09', ativadaPor: 'x', ativadaEm: 1 };
const COL = { uid: 'c1', email: 'dp@escritorio.com.br', role: 'colaborador' } as never;
const GES = { uid: 'g1', email: 'gestor@escritorio.com.br', role: 'gestor' } as never;
const tela = (u: unknown, sub?: 'fechamento' | 'pedidos') => render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><FimDeMesPanel currentUser={u as never} sub={sub} /></EmpresaAtivaProvider>);
const ENCERRADO = { id: 'emp1_2026-09', empresaId: 'emp1', competencia: '2026-09', situacao: 'encerrado', encerradoPorEmail: 'dp@escritorio.com.br', checklist: Object.fromEntries(ITENS_FECHAMENTO.map(i => [i.id, true])), historico: [] };

beforeEach(() => {
    srv.fech = null; srv.todos = []; srv.pedidos = [];
    for (const f of [srv.encerrar, srv.reabrir, srv.pedir, srv.recusar]) f.mockClear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-10T12:00:00'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('fim de mês: regras puras', () => {
    it('situação, lista completa e mês futuro', () => {
        expect(situacaoDe(null)).toBe('aberto');
        expect(situacaoDe({ situacao: 'reaberto' })).toBe('reaberto');
        expect(checklistCompleto({ movimento: true })).toBe(false);
        expect(checklistCompleto(Object.fromEntries(ITENS_FECHAMENTO.map(i => [i.id, true])))).toBe(true);
        expect(podeEncerrar('2026-10', '2026-10-10')).toBe(true);
        expect(podeEncerrar('2026-11', '2026-10-10')).toBe(false);
        expect(MSG_ENCERRADO('2026-09')).toContain('09/2026 está encerrada');
    });
    it('pendentes: do mês em que o motor foi ativado até o mês anterior, sem os encerrados', () => {
        expect(competenciasPendentes('2026-06', [{ competencia: '2026-07', situacao: 'encerrado' }, { competencia: '2026-08', situacao: 'reaberto' }], '2026-10-10')).toEqual(['2026-06', '2026-08', '2026-09']);
        expect(competenciasPendentes(undefined, [], '2026-10-10')).toEqual([]);
        expect(competenciasPendentes('2025-11', [], '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01']);
    });
});

describe('fim de mês: tela', () => {
    it('encerra só com a lista completa; avisa os meses pendentes', async () => {
        tela(COL);
        await waitFor(() => expect(screen.getByText(/Fim de mês pendente nesta empresa: 06\/2026, 07\/2026, 08\/2026/)).toBeTruthy());
        const botao = screen.getByRole('button', { name: 'Encerrar 09/2026' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        for (const i of ITENS_FECHAMENTO) fireEvent.click(screen.getByLabelText(i.rotulo));
        expect(botao.disabled).toBe(false);
        fireEvent.click(botao);
        await waitFor(() => expect(srv.encerrar).toHaveBeenCalledWith('emp1', '2026-09', expect.objectContaining({ movimento: true, cliente: true }), { id: 'c1', email: 'dp@escritorio.com.br' }));
        expect(screen.getByRole('status').textContent).toContain('09/2026 encerrada');
    });

    it('encerrado: o colaborador pede a reabertura com motivo (o gestor é avisado)', async () => {
        srv.fech = ENCERRADO;
        tela(COL);
        await waitFor(() => expect(screen.getByText(/Encerrada por dp@escritorio.com.br/)).toBeTruthy());
        expect((screen.getByLabelText('Movimento do mês salvo') as HTMLInputElement).disabled).toBe(true);
        const pedir = screen.getByRole('button', { name: 'Solicitar reabertura ao gestor' }) as HTMLButtonElement;
        fireEvent.change(screen.getByLabelText('Motivo da reabertura'), { target: { value: 'curto' } });
        expect(pedir.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Motivo da reabertura'), { target: { value: 'faltou a hora extra da ANA' } });
        srv.pedir.mockResolvedValueOnce({ id: 'p9', erroEmail: 'rota não publicada' });
        fireEvent.click(pedir);
        await waitFor(() => expect(srv.pedir).toHaveBeenCalledWith(expect.objectContaining({ empresaId: 'emp1', competencia: '2026-09', motivo: 'faltou a hora extra da ANA' }), expect.anything()));
        expect(screen.getByRole('status').textContent).toContain('o e-mail não saiu: rota não publicada');
    });

    it('encerrado: o gestor reabre direto, com motivo', async () => {
        srv.fech = ENCERRADO;
        tela(GES);
        fireEvent.change(await screen.findByLabelText('Motivo da reabertura'), { target: { value: 'retificar o S-1200 da ANA' } });
        fireEvent.click(screen.getByRole('button', { name: 'Reabrir 09/2026' }));
        await waitFor(() => expect(srv.reabrir).toHaveBeenCalledWith('emp1', '2026-09', 'retificar o S-1200 da ANA', { id: 'g1', email: 'gestor@escritorio.com.br' }));
    });

    it('pedidos: o gestor aprova (reabre) ou recusa com resposta', async () => {
        srv.pedidos = [
            { id: 'p1', empresaId: 'emp1', empresaNome: 'EMPRESA UM', competencia: '2026-08', motivo: 'faltou a hora extra', situacao: 'pendente', pedidoPorEmail: 'dp@escritorio.com.br' },
            { id: 'p2', empresaId: 'emp2', empresaNome: 'EMPRESA DOIS', competencia: '2026-08', motivo: 'faltou a falta', situacao: 'pendente', pedidoPorEmail: 'dp@escritorio.com.br' },
        ];
        tela(GES, 'pedidos');
        await waitFor(() => expect(screen.getByText('EMPRESA DOIS')).toBeTruthy());
        fireEvent.click(screen.getAllByRole('button', { name: 'Aprovar e reabrir' })[0]);
        await waitFor(() => expect(srv.reabrir).toHaveBeenCalledWith('emp1', '2026-08', 'faltou a hora extra', expect.anything(), 'p1'));
        const recusar = screen.getAllByRole('button', { name: 'Recusar' })[1] as HTMLButtonElement;
        expect(recusar.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Resposta ao pedido de EMPRESA DOIS'), { target: { value: 'lance no mês seguinte' } });
        fireEvent.click(recusar);
        await waitFor(() => expect(srv.recusar).toHaveBeenCalledWith('p2', 'lance no mês seguinte', expect.anything()));
    });

    it('colaborador vê os pedidos da empresa, sem os botões do gestor', async () => {
        srv.pedidos = [{ id: 'p1', empresaId: 'emp1', empresaNome: 'EMPRESA UM', competencia: '2026-08', motivo: 'faltou a hora extra', situacao: 'recusado', pedidoPorEmail: 'dp@escritorio.com.br', decididoPorEmail: 'gestor@escritorio.com.br', resposta: 'lance no mês seguinte' }];
        tela(COL, 'pedidos');
        await waitFor(() => expect(screen.getByText(/Recusado por gestor@escritorio.com.br: lance no mês seguinte/)).toBeTruthy());
        expect(screen.queryByRole('button', { name: 'Aprovar e reabrir' })).toBeNull();
    });
});
