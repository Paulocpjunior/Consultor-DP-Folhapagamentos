// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const svc = vi.hoisted(() => ({ listarTodosEnquadramentos: vi.fn(), gravarEnquadramentosEmLote: vi.fn(), mensagemErro: (e: unknown) => String(e) }));
const emp = vi.hoisted(() => ({ listarEmpresasVisiveis: vi.fn() }));
const rest = vi.hoisted(() => ({ abrirRestauracao: vi.fn() }));
vi.mock('../cadastrosService', () => svc);
vi.mock('../../empresas/empresasService', () => emp);
vi.mock('../../iobSage/restauracao', () => rest);
vi.mock('../../iobSage/backupPostgres', () => ({ fonteDeBlob: (f: File) => f }));
import CargaEnquadramentoIobModal from '../../../components/cadastros/CargaEnquadramentoIobModal';

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

const tab = (grupo: string, tabela: string, colunas: string[], linhas: (string | null)[][]) => ({ t: { id: `${grupo}/${tabela}`, origem: 'dbf', grupo, tabela, colunas, registros: linhas.length, bytes: 0, arquivo: '' }, linhas });
const TABELAS = [
    tab('FolhaWin.zip/FolhaWin/empresa', 'ES_S1005', ['CODEMPRESA', 'PERCSAT', 'RATAJUS', 'CNAEF20'], [['12', '2', '', '4711302'], ['13', '1', '', ''], ['14', '3', '', '']]),
    tab('FolhaWin.zip/FolhaWin/empresa/a', 'ES_S1005', ['CODEMPRESA', 'PERCSAT'], [['12', '3']]),
    tab('FolhaWin.zip/FolhaWin/empresa', 'ESOCIALEMPRESA', ['CODEMPRESA', 'ANOMESINI', 'ANOMESFIM', 'FAP', 'CNPJCPF'], [['12', '202501', '', '0,9800', '11222333000181'], ['13', '202501', '', '1,0000', '']]),
    tab('FolhaWin.zip/FolhaWin/empresa', 'ES_S1000', ['CODEMPRESA', 'FKCLASTRIB'], [['12', '99'], ['13', '01'], ['14', '99']]),
    tab('FolhaWin.zip/FolhaWin/empresa', 'TERC', ['FPAS', 'CODIGO', 'PERCENTUAL', 'DESC'], [['515', '0115', '5,8', 'Comércio']]),
    tab('f12', 'depto', ['fpas', 'codterc', 'percterc'], [['515', '0115', '5,8']]),
];
const restauracao = {
    tabelas: TABELAS.map(x => x.t),
    lerTabela: async (t: { id: string }, aoLinha: (v: (string | null)[]) => void) => { const x = TABELAS.find(y => y.t.id === t.id)!; x.linhas.forEach(aoLinha); return x.linhas.length; },
};
const EMPRESAS = [
    { id: 'A', nomeFantasia: 'ALFA', razaoSocial: 'ALFA LTDA', cnpj: '11222333000181', codigoSage: '12' },
    { id: 'B', nomeFantasia: 'BETA', razaoSocial: 'BETA LTDA', cnpj: '11444777000161', codigoSage: '13' },
    { id: 'C', nomeFantasia: 'GAMA', razaoSocial: 'GAMA LTDA', cnpj: '29463877000109', codigoSage: '14' },
];

describe('carga do enquadramento pelo backup do IOB', () => {
    it('propõe, separa por situação, aplica o FPAS padrão e grava os marcados', async () => {
        emp.listarEmpresasVisiveis.mockResolvedValue(EMPRESAS);
        rest.abrirRestauracao.mockResolvedValue(restauracao);
        svc.listarTodosEnquadramentos.mockResolvedValue([]);
        svc.gravarEnquadramentosEmLote.mockResolvedValue(undefined);
        const onGravado = vi.fn();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<CargaEnquadramentoIobModal usuario={{ id: 'u1', email: 'a@b' }} onFechar={() => {}} onGravado={onGravado} />);
        await waitFor(() => expect(emp.listarEmpresasVisiveis).toHaveBeenCalled());
        fireEvent.change(screen.getByLabelText('Arquivos do backup do IOB'), { target: { files: [new File(['x'], 'FolhaWin.zip')] } });
        await screen.findByRole('button', { name: 'Prontas (2)' });
        // ALFA usou a ES_S1005 da pasta "empresa" (RAT 2), não a cópia em "empresa/a".
        const alfa = screen.getByText('ALFA').closest('tr')!;
        expect(within(alfa).getByText('2% × 0,9800')).toBeTruthy();
        expect(within(alfa).getByText('515 · 0115 · 5,8%')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Com pendência (1)' }));
        const gama = screen.getByText('GAMA').closest('tr')!;
        expect(within(gama).getByText('sem FPAS')).toBeTruthy();
        expect(within(gama).queryByRole('checkbox')).toBeNull();
        fireEvent.change(screen.getByLabelText('Sugestão da TERC'), { target: { value: '0' } });
        expect((screen.getByLabelText('FPAS padrão') as HTMLInputElement).value).toBe('515');
        fireEvent.click(within(screen.getByText('GAMA').closest('tr')!).getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Gravar 3 enquadramento(s)' }));
        await waitFor(() => expect(onGravado).toHaveBeenCalled());
        const gravados = svc.gravarEnquadramentosEmLote.mock.calls[0][0];
        expect(gravados.map((e: { id: string }) => e.id).sort()).toEqual(['A_2025-01', 'B_2025-01', `C_${new Date().getFullYear() - 1}-01`]);
        expect(gravados.find((e: { id: string }) => e.id.startsWith('C_'))).toMatchObject({ regime: 'normal', fpas: '515', terceiros: 5.8, rat: 3 });
    });

    it('só o .backup da empresa (schema fNNNN): propõe pelo depto_ma', async () => {
        emp.listarEmpresasVisiveis.mockResolvedValue(EMPRESAS);
        const T2 = [
            tab('f13', 'esocialdadosficha_s1000', ['codigo', 'nrinsc', 'classtrib'], [['1', '11444777', '99']]),
            tab('f13', 'depto_ma', ['depsetsec', 'anomes', 'percterc', 'percsat', 'percfap', 'fpas', 'codterc'], [['1', '202601', '5,8', '1', '1,0000', '515', '0115']]),
            tab('f13', 'func', ['codfun', 'nome'], [['1', 'X']]),
        ];
        rest.abrirRestauracao.mockResolvedValue({ tabelas: T2.map(x => x.t), lerTabela: async (t: { id: string }, aoLinha: (v: (string | null)[]) => void) => { const x = T2.find(y => y.t.id === t.id)!; x.linhas.forEach(aoLinha); return x.linhas.length; } });
        svc.listarTodosEnquadramentos.mockResolvedValue([]);
        render(<CargaEnquadramentoIobModal usuario={{ id: 'u1', email: 'a@b' }} onFechar={() => {}} onGravado={() => {}} />);
        await waitFor(() => expect(emp.listarEmpresasVisiveis).toHaveBeenCalled());
        fireEvent.change(screen.getByLabelText('Arquivos do backup do IOB'), { target: { files: [new File(['x'], 'folha.backup')] } });
        await screen.findByRole('button', { name: 'Prontas (1)' });
        const beta = screen.getByText('BETA').closest('tr')!;
        expect(within(beta).getByText('1% × 1,0000')).toBeTruthy();
        expect(within(beta).getByText('515 · 0115 · 5,8%')).toBeTruthy();
    });

    it('backup sem as tabelas do eSocial avisa', async () => {
        emp.listarEmpresasVisiveis.mockResolvedValue(EMPRESAS);
        rest.abrirRestauracao.mockResolvedValue({ tabelas: [], lerTabela: async () => 0 });
        render(<CargaEnquadramentoIobModal usuario={{ id: 'u1', email: 'a@b' }} onFechar={() => {}} onGravado={() => {}} />);
        await waitFor(() => expect(emp.listarEmpresasVisiveis).toHaveBeenCalled());
        fireEvent.change(screen.getByLabelText('Arquivos do backup do IOB'), { target: { files: [new File(['x'], 'x.zip')] } });
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('não tem as tabelas do enquadramento'));
    });
});
