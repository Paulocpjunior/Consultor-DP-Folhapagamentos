// @vitest-environment jsdom
// Tela do pedido de VT e da coparticipação (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as XLSX from 'xlsx';

const srv = vi.hoisted(() => ({ itinerarios: [] as unknown[], gravados: [] as unknown[], movimentos: [] as unknown[] }));
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [{ id: 'E1_52998224725_M1', empresaId: 'E1', cnpj: '44388152000189', cpf: '52998224725', matriculaEsocial: '1', situacao: 'ativo', dados: { nome: 'ANA', admissao: '2024-01-02', valeTransporte: 'S', valeTransporteCusto: '220.00' }, dependentes: [], origens: {}, pendenciasImportacao: [] }],
    listarAfastamentos: async () => [],
    mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../vtService', () => ({ listarItinerarios: async () => srv.itinerarios, salvarItinerario: async (i: unknown) => { srv.gravados.push(i); } }));
vi.mock('../../calculo/movimentosService', () => ({
    listarMovimentos: async () => [{ fichaId: 'E1_52998224725_M1', movimento: { horasExtras50: 1 } }],
    salvarMovimentos: async (...a: unknown[]) => { srv.movimentos.push(a); },
}));
import VtECoparticipacao from '../../../components/beneficios/VtECoparticipacao';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); srv.itinerarios = []; srv.gravados.length = 0; srv.movimentos.length = 0; vi.restoreAllMocks(); });
const ATIVA = { id: 'E1', nome: 'X', cnpj: '44388152000189', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
const tela = () => render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><VtECoparticipacao usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);

describe('pedido de VT e coparticipação (tela)', () => {
    it('grava o itinerário e mostra o pedido do mês seguinte', async () => {
        tela();
        fireEvent.click(await screen.findByText('ANA (sem itinerário)'));
        fireEvent.click(screen.getByText('+ Linha'));
        fireEvent.change(screen.getByLabelText('Operadora'), { target: { value: 'Metrô' } });
        const tarifa = screen.getByLabelText('Tarifa');
        fireEvent.change(tarifa, { target: { value: '5,20' } }); fireEvent.blur(tarifa);
        fireEvent.click(screen.getByText('Gravar o itinerário'));
        await screen.findByText('Itinerário de ANA gravado.');
        expect(srv.gravados[0]).toMatchObject({ fichaId: 'E1_52998224725_M1', diasSemana: [1, 2, 3, 4, 5], linhas: [{ operadora: 'Metrô', tarifa: 520, viagensDia: 2 }] });
        // 11/2026: 19 dias (21 úteis − Finados e Consciência Negra) × 2 viagens × R$ 5,20.
        expect(screen.getByText('Metrô: 38 × R$ 5,20')).toBeTruthy();
        expect(screen.getAllByText('R$ 197,60').length).toBeGreaterThan(0);
    });

    it('lê a planilha da coparticipação e lança no movimento da competência', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        tela();
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CPF', 'Valor'], ['529.982.247-25', 35.5]]), 'F');
        const arq = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'fatura.xlsx');
        Object.defineProperty(arq, 'arrayBuffer', { value: async () => XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) });
        fireEvent.change(await screen.findByLabelText('Planilha da coparticipação'), { target: { files: [arq] } });
        fireEvent.click(await screen.findByText('Lançar na folha de 10/2026'));
        await waitFor(() => expect(srv.movimentos).toHaveLength(1));
        const [empresaId, comp, itens] = srv.movimentos[0] as [string, string, { fichaId: string; depois: { lancamentos: { valor: number }[]; horasExtras50: number } }[]];
        expect([empresaId, comp, itens[0].fichaId, itens[0].depois.horasExtras50, itens[0].depois.lancamentos[0].valor]).toEqual(['E1', '2026-10', 'E1_52998224725_M1', 1, 3550]);
    });
});
