// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompletarPeloIobModal from '../../../components/cadastros/CompletarPeloIobModal';
import { fichaVazia, idFuncionario, type FichaFuncionario } from '../funcionarios';
import type { Empresa } from '../../empresas/empresasTypes';

const svc = vi.hoisted(() => ({ gravarImportacao: vi.fn(), mensagemErro: (e: unknown) => String(e) }));
vi.mock('../cadastrosService', () => svc);

// Backup restaurado de mentira: uma tabela de funcionários com duas empresas.
const COLUNAS = ['EMPRESA', 'CODIGO', 'NOME', 'CPF', 'MATRICULA', 'DTADMISSAO', 'BANCO'];
const LINHAS = [
    ['0229', '17', 'ANA', '529.982.247-25', 'M1', '01/03/2025', '341'],
    ['229', '18', 'CARLA', '39053344705', 'M3', '10/04/2025', '001'],
    ['0300', '5', 'DE OUTRA EMPRESA', '11144477735', 'X', '01/01/2020', ''],
];
const rest = vi.hoisted(() => ({ abrirRestauracao: vi.fn() }));
vi.mock('../../iobSage/restauracao', () => rest);

const EMP = { id: 'emp1', cnpj: '11222333000181', razaoSocial: 'EMPRESA UM', nomeFantasia: 'Um', codigoSage: '229', criadoPor: 'u' } as Empresa;
const ana: FichaFuncionario = { ...fichaVazia(EMP), id: idFuncionario('emp1', '52998224725', 'M1'), cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dados: { nome: 'ANA', admissao: '2025-03-01' }, origens: { nome: 'eSocial: a.xml' } };
const usuario = { id: 'u1', email: 'a@b.c' };

beforeEach(() => {
    svc.gravarImportacao.mockReset().mockResolvedValue(undefined);
    rest.abrirRestauracao.mockReset().mockResolvedValue({
        arquivos: [], backups: [], dbfs: [], grupos: [], avisos: [],
        tabelas: [
            { id: 't0', origem: 'dbf', grupo: 'dados', tabela: 'EMPRESAS', colunas: ['CODIGO', 'RAZAO'], registros: 2, bytes: null, arquivo: 'a.zip' },
            { id: 't1', origem: 'dbf', grupo: 'dados', tabela: 'FUNCIONARIOS', colunas: COLUNAS, registros: 3, bytes: null, arquivo: 'a.zip' },
        ],
        lerTabela: async (_t: unknown, ao: (v: (string | null)[]) => boolean | void) => { for (const l of LINHAS) if (ao(l) === false) break; return LINHAS.length; },
    });
});
afterEach(cleanup);

describe('completar pelo backup do IOB', () => {
    it('propõe tabela e de/para, filtra a empresa, completa e cria só com a opção ligada', async () => {
        const onGravado = vi.fn();
        render(<CompletarPeloIobModal empresa={EMP} usuario={usuario} existentes={[ana]} onFechar={() => {}} onGravado={onGravado} />);
        fireEvent.change(screen.getByLabelText('Arquivos do backup do IOB'), { target: { files: [new File(['x'], 'backup.zip')] } });
        await waitFor(() => expect((screen.getByLabelText('Tabela de funcionários') as HTMLSelectElement).value).toBe('t1'));
        expect((screen.getByLabelText('Coluna para CPF') as HTMLSelectElement).value).toBe('CPF');
        expect((screen.getByLabelText('Coluna para Matrícula do eSocial') as HTMLSelectElement).value).toBe('MATRICULA');
        expect((screen.getByLabelText('Coluna da empresa') as HTMLSelectElement).value).toBe('EMPRESA');
        expect((screen.getByLabelText('Código da empresa no IOB') as HTMLInputElement).value).toBe('229');

        fireEvent.click(screen.getByText('Comparar com as fichas'));
        await waitFor(() => expect(screen.getByText(/linha\(s\) lida\(s\)/)).toBeTruthy());
        expect(screen.getByText(/linha\(s\) lida\(s\)/).textContent).toBe('2 linha(s) lida(s)');
        expect(screen.getByText(/Código no IOB \(sequencial\): 17; Banco \(código\): 341/)).toBeTruthy();
        expect(screen.getByText(/Linha 2: CARLA/).textContent).toContain('criação de fichas novas desligada');

        fireEvent.click(screen.getByLabelText(/Criar ficha para quem não tem/));
        fireEvent.click(screen.getByText('Comparar com as fichas'));
        await waitFor(() => expect(screen.getByText('Ficha nova')).toBeTruthy());
        fireEvent.click(screen.getByText('Gravar 2 ficha(s)'));
        await waitFor(() => expect(onGravado).toHaveBeenCalled());
        const [resultados, u, arquivos, , fonte] = svc.gravarImportacao.mock.calls[0];
        expect(u).toBe(usuario);
        expect(fonte).toBe('Backup IOB');
        expect(arquivos).toEqual(['backup.zip', 'dados.FUNCIONARIOS']);
        expect(resultados.map((r: { ficha: FichaFuncionario; novo: boolean }) => [r.ficha.matriculaEsocial, r.novo, r.ficha.dados.codigoIob, r.ficha.origens.codigoIob])).toEqual([
            ['M1', false, '17', 'IOB: dados.FUNCIONARIOS'],
            ['M3', true, '18', 'IOB: dados.FUNCIONARIOS'],
        ]);
        expect(resultados[0].ficha.dados.nome).toBe('ANA');
    });

    it('sem CPF nem matrícula no de/para não compara', async () => {
        render(<CompletarPeloIobModal empresa={EMP} usuario={usuario} existentes={[ana]} onFechar={() => {}} onGravado={() => {}} />);
        fireEvent.change(screen.getByLabelText('Arquivos do backup do IOB'), { target: { files: [new File(['x'], 'backup.zip')] } });
        await waitFor(() => expect((screen.getByLabelText('Tabela de funcionários') as HTMLSelectElement).value).toBe('t1'));
        fireEvent.change(screen.getByLabelText('Coluna para CPF'), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText('Coluna para Matrícula do eSocial'), { target: { value: '' } });
        expect(screen.getByRole('status').textContent).toContain('CPF ou da matrícula');
        expect(screen.getByText('Comparar com as fichas').hasAttribute('disabled')).toBe(true);
    });
});
