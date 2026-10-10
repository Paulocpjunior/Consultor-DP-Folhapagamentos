// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';

const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (id: string, nome: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia(EMP), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo',
    dados: { nome, admissao: '2025-06-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', tipoContrato: '1', ...dados } });
const FICHAS = [ficha('M1', 'BRUNO'), ficha('M2', 'ANA'), ficha('M3', 'CAIO', { dataDesligamento: '2026-09-20' })];
const srv = vi.hoisted(() => ({ gravadas: [] as unknown[], situacoes: [] as unknown[] }));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'emp1', cnpj: '11222333000181', razaoSocial: 'EMPRESA UM LTDA', codigoSage: '1200' }], salvarContatoEnvio: vi.fn() }));
vi.mock('../../cadastros/cadastrosService', () => ({ listarFuncionarios: async () => FICHAS, listarAfastamentos: async () => [], listarTabelas: async () => TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` })),
    listarEnquadramentos: async () => [{ id: 'q', empresaId: 'emp1', vigencia: '2026-01', regime: 'normal', fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1, terceiros: 5.8, observacao: '' }],
    listarSindicatos: async () => [], mensagemErro: (e: unknown) => String(e) }));
vi.mock('../../calculo/movimentosService', () => ({ listarMovimentosDaEmpresa: async () => ({}) }));
vi.mock('../previasService', async orig => ({ ...(await orig<typeof import('../previasService')>()),
    listarPrevias: async () => [{ id: 'p0', empresaId: 'emp1', fichaId: 'M1', nome: 'BRUNO', cenarios: [{ tipo: '02', aviso: 'indenizado', data: '2026-10-05' }],
        resumos: [{ tipo: '02', aviso: 'indenizado', data: '2026-10-05', liquido: 500000, custoTotal: 900000, multaFgts: 100000, multaEstimada: true }], saldoFgts: null, adiantamento13: null, observacao: 'pedido do cliente', situacao: 'previa', escolhido: null, criadoPorEmail: 'dp@x' }],
    gravarPrevia: async (p: unknown) => { srv.gravadas.push(p); return 'n1'; }, mudarSituacaoPrevia: async (...a: unknown[]) => { srv.situacoes.push(a); } }));
vi.mock('../../pacoteCliente/spConnect', async orig => ({ ...(await orig<typeof import('../../pacoteCliente/spConnect')>()), templatesDoDp: async () => [] }));

import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
import DemissoesPanel from '../../../components/demissoes/DemissoesPanel';

const ATIVA = { id: 'emp1', nome: 'EMPRESA UM', cnpj: '11222333000181', codigoSage: '1200', competencia: '2026-10', ativadaPor: 'u', ativadaEm: 0 };
afterEach(() => { cleanup(); srv.gravadas.length = 0; srv.situacoes.length = 0; });
const tela = () => render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><DemissoesPanel usuario={{ id: 'u', email: 'dp@escritorio.com.br' }} /></EmpresaAtivaProvider>);

describe('Demissões (prévia)', () => {
    it('lista só quem tem vínculo e mostra os três cenários lado a lado com o custo', async () => {
        tela();
        await screen.findByLabelText(/BRUNO/, { selector: 'input' });
        expect(screen.queryByText('CAIO')).toBeNull();
        fireEvent.change(screen.getByLabelText('Data do cenário 1'), { target: { value: '2026-10-05' } });
        fireEvent.change(screen.getByLabelText('Data do cenário 2'), { target: { value: '2026-10-05' } });
        fireEvent.change(screen.getByLabelText('Data do cenário 3'), { target: { value: '2026-10-05' } });
        fireEvent.click(screen.getByLabelText(/BRUNO/, { selector: 'input' }));
        const prev = await screen.findByRole('region', { name: 'Prévia de BRUNO' });
        expect(within(prev).getByText(/Sem justa causa, por iniciativa do empregador/)).toBeTruthy();
        expect(within(prev).getByText(/Pedido de demissão/)).toBeTruthy();
        expect(within(prev).getByText('Custo total para a empresa')).toBeTruthy();
        expect(within(prev).getByText('Multa do FGTS (estimada)')).toBeTruthy();
        expect(within(prev).getAllByText(/Saca o FGTS · pode ter seguro/).length).toBe(1);
    });
    it('grava no histórico e muda a situação de uma prévia', async () => {
        tela();
        fireEvent.click(await screen.findByLabelText(/ANA/, { selector: 'input' }));
        await screen.findByRole('region', { name: 'Prévia de ANA' });
        fireEvent.click(screen.getByText('Gravar no histórico'));
        await waitFor(() => expect(srv.gravadas).toHaveLength(1));
        expect(srv.gravadas[0]).toMatchObject({ empresaId: 'emp1', fichaId: 'M2', nome: 'ANA' });
        expect((srv.gravadas[0] as { resumos: unknown[] }).resumos).toHaveLength(3);
        expect(await screen.findByText('pedido do cliente')).toBeTruthy();
        fireEvent.click(screen.getByText('Escolher 1'));
        await waitFor(() => expect(srv.situacoes[0]).toEqual(['p0', 'escolhida', { id: 'u', email: 'dp@escritorio.com.br' }, 0]));
    });
});
