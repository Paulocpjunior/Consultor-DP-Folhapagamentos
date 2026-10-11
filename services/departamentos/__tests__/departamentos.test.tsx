// @vitest-environment jsdom
// Departamentos: o da ficha (ou o do IOB), validação, criação a partir das fichas e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { contarPorDepartamento, departamentoDa, departamentosDasFichas, departamentoVazio, validarDepartamento } from '../departamentos';

const ficha = (id: string, dados: Record<string, string>) => ({ id, empresaId: 'E1', cnpj: '', cpf: '', matriculaEsocial: id, situacao: 'ativo', dados, dependentes: [], origens: {}, pendenciasImportacao: [] });
const srv = vi.hoisted(() => ({ gravados: [] as unknown[], criados: [] as unknown[] }));
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [ficha('a', { nome: 'ANA', departamentoIob: '10' }), ficha('b', { nome: 'BIA', departamentoIob: '10', departamento: 'OBRAS' }), ficha('c', { nome: 'CAIO' })],
    mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../departamentosService', () => ({
    listarDepartamentos: async () => srv.gravados,
    salvarDepartamento: async (d: unknown) => { srv.gravados.push(d); },
    criarDepartamentos: async (l: unknown[]) => { srv.criados.push(...l); srv.gravados.push(...l); },
    excluirDepartamento: async () => undefined,
}));
import DepartamentosPanel from '../../../components/departamentos/DepartamentosPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); srv.gravados.length = 0; srv.criados.length = 0; });
const ATIVA = { id: 'E1', nome: 'X', cnpj: '44.388.152/0001-89', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };

describe('departamentos', () => {
    it('o da ficha vale sobre o do IOB; criação a partir das fichas; contagem', () => {
        const fs = [ficha('a', { departamentoIob: '10' }), ficha('b', { departamentoIob: '10', departamento: 'OBRAS' }), ficha('c', {})];
        expect(fs.map(departamentoDa)).toEqual(['10', 'OBRAS', '']);
        expect(departamentosDasFichas(fs, [{ ...departamentoVazio('E1'), codigo: 'OBRAS', nome: 'Obras' }], 'E1').map(d => [d.codigo, d.nome])).toEqual([['10', 'Departamento 10']]);
        expect([...contarPorDepartamento(fs)]).toEqual([['10', 1], ['OBRAS', 1], ['(sem departamento)', 1]]);
        expect(validarDepartamento({ ...departamentoVazio('E1'), codigo: 'a b', nome: '' }).join()).toMatch(/Código.*nome/);
    });
    it('tela: traz os departamentos das fichas e grava um novo', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><DepartamentosPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText('Trazer das fichas (2)'));
        await screen.findByText(/2 departamento\(s\) criados/);
        expect(srv.criados.map(d => (d as { codigo: string }).codigo)).toEqual(['10', 'OBRAS']);
        fireEvent.click(screen.getByText('+ Novo departamento'));
        fireEvent.change(screen.getByLabelText('Código do departamento'), { target: { value: 'ADM' } });
        fireEvent.change(screen.getByLabelText('Nome do departamento'), { target: { value: 'Administrativo' } });
        fireEvent.change(screen.getByLabelText('Centro de custo'), { target: { value: '1.01' } });
        fireEvent.click(screen.getByText('Gravar'));
        await screen.findByText('Departamento gravado.');
        expect(srv.gravados.at(-1)).toMatchObject({ codigo: 'ADM', nome: 'Administrativo', centroCusto: '1.01' });
    });
});
