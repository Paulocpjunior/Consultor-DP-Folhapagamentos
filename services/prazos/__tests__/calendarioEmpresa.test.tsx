// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const st = vi.hoisted(() => ({ listar: vi.fn(), marcar: vi.fn(), desmarcar: vi.fn() }));
vi.mock('../obrigacoesStatusService', () => ({ listarMarcacoes: st.listar, marcarObrigacao: st.marcar, desmarcarObrigacao: st.desmarcar }));
vi.mock('../../cadastros/cadastrosService', () => ({ mensagemErro: (e: Error) => e.message }));
import CalendarioEmpresa from '../../../components/prazos/CalendarioEmpresa';
import { sindicatoVazio } from '../../cadastros/sindicatos';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const ficha = (cpf: string, sindicato: string) => ({ empresaId: 'E1', cpf, situacao: 'ativo', dados: { sindicato } }) as never;
const sind = (cnpj: string, nome: string, extra = {}) => ({ ...sindicatoVazio(), id: cnpj, cnpj, nome, ...extra });
const usuario = { id: 'u1', email: 'ana@x.com' };
const props = {
    empresa: { id: 'E1', nome: 'ALFA', competencia: '2026-09' },
    fichas: [ficha('1', '11222333000181'), ficha('2', '11444777000161'), ficha('3', '99999999000191')],
    sindicatos: [sind('11222333000181', 'SIND COMERCIO', { guiaDia: '10', guiaMeses: 'todos', guiaDescricao: 'Assistencial' }), sind('11444777000161', 'SIND SEM GUIA')],
    usuario, hoje: '2026-10-21',
};

describe('calendário da empresa ativa', () => {
    it('lista as obrigações da competência, destaca atraso, guia do sindicato e marcações', async () => {
        st.listar.mockResolvedValue(new Map([['s1299-2026-09', { status: 'entregue', atualizadoPorEmail: 'bia@x.com', atualizadoEm: '2026-10-14T12:00:00Z' }]]));
        render(<CalendarioEmpresa {...props} />);
        await waitFor(() => expect(st.listar).toHaveBeenCalledWith('E1', '2026-09'));
        expect(screen.getByText(/Calendário da empresa: ALFA · competência 09\/2026/)).toBeTruthy();
        const fgts = screen.getByText('FGTS Digital: guia mensal').closest('tr')!;
        expect(within(fgts).getByText('20/10/2026')).toBeTruthy();
        expect(within(fgts).getByText('atrasada há 1 dia(s)')).toBeTruthy();
        const guia = screen.getByText(/Guia sindical: Assistencial — SIND COMERCIO/).closest('tr')!;
        expect(within(guia).getByText('09/10/2026')).toBeTruthy(); // 10/10/2026 é sábado: antecipa
        const reinf = screen.getByText('EFD-Reinf: fechamento do mês').closest('tr')!;
        expect(within(reinf).getByText('Fiscal (o DP acompanha)')).toBeTruthy();
        const s1299 = screen.getByText('eSocial: fechamento dos periódicos (S-1299)').closest('tr')!;
        await waitFor(() => expect(within(s1299).getByText('entregue')).toBeTruthy());
        expect(within(s1299).getByText(/bia@x.com · 14\/10\/2026/)).toBeTruthy();
        expect(screen.getByText(/sem guia no cadastro: SIND SEM GUIA/)).toBeTruthy();
        expect(screen.getByText(/não está cadastrado: 99.999.999\/0001-91/)).toBeTruthy();
        expect(screen.getByText('Entregues: 1')).toBeTruthy();
    });

    it('marca entregue, "não se aplica" com motivo e desfaz', async () => {
        st.listar.mockResolvedValue(new Map([['s1299-2026-09', { status: 'entregue' }]]));
        st.marcar.mockResolvedValue(undefined);
        st.desmarcar.mockResolvedValue(undefined);
        render(<CalendarioEmpresa {...props} />);
        await screen.findByRole('button', { name: 'Marcar entregue: FGTS Digital: guia mensal' });
        fireEvent.click(screen.getByRole('button', { name: 'Marcar entregue: FGTS Digital: guia mensal' }));
        await waitFor(() => expect(st.marcar).toHaveBeenCalledWith('E1', '2026-09', expect.objectContaining({ id: 'fgts-2026-09' }), 'entregue', '', undefined, usuario));

        vi.spyOn(window, 'prompt').mockReturnValueOnce('').mockReturnValueOnce('sem retenção no mês');
        fireEvent.click(screen.getByRole('button', { name: 'Não se aplica: EFD-Reinf: fechamento do mês' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Informe o motivo'));
        fireEvent.click(screen.getByRole('button', { name: 'Não se aplica: EFD-Reinf: fechamento do mês' }));
        await waitFor(() => expect(st.marcar).toHaveBeenCalledWith('E1', '2026-09', expect.objectContaining({ id: 'reinf-2026-09' }), 'nao-se-aplica', 'sem retenção no mês', undefined, usuario));

        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(within(screen.getByText('eSocial: fechamento dos periódicos (S-1299)').closest('tr')!).getByRole('button', { name: 'Desfazer' }));
        await waitFor(() => expect(st.desmarcar).toHaveBeenCalledWith('E1', expect.objectContaining({ id: 's1299-2026-09' }), { status: 'entregue' }, usuario));
    });

    it('sem usuário não mostra os botões; erro de leitura aparece', async () => {
        st.listar.mockRejectedValue(new Error('Sem permissão nesta empresa.'));
        render(<CalendarioEmpresa {...props} usuario={undefined} />);
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sem permissão'));
        expect(screen.queryByRole('button', { name: /Marcar entregue/ })).toBeNull();
    });
});
