// @vitest-environment jsdom
// Tela "Trabalho intermitente": convocação com os dias do período, validação e gravação (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const srv = vi.hoisted(() => ({ gravadas: [] as unknown[] }));
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [
        { id: 'E1_52998224725_M1', empresaId: 'E1', cnpj: '44388152000189', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dados: { nome: 'JOAO', admissao: '2025-02-10', salario: '15.00', unidadeSalario: '1', categoria: '111' }, dependentes: [], origens: {}, pendenciasImportacao: [] },
        { id: 'E1_11144477735_M2', empresaId: 'E1', cnpj: '44388152000189', cpf: '11144477735', matriculaEsocial: 'M2', situacao: 'ativo', dados: { nome: 'ANA', admissao: '2024-01-02', categoria: '101' }, dependentes: [], origens: {}, pendenciasImportacao: [] },
    ],
    listarAfastamentos: async () => [],
    listarTabelas: async () => [],
    mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../convocacoesService', () => ({
    listarConvocacoes: async () => srv.gravadas,
    salvarConvocacao: async (c: unknown) => { srv.gravadas.push(c); },
    excluirConvocacao: async () => undefined,
    novoIdConvocacao: (f: string) => `${f}_k1`,
}));
import IntermitentesPanel from '../../../components/calculo/IntermitentesPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); srv.gravadas.length = 0; });
const ATIVA = { id: 'E1', nome: 'EMPRESA X', cnpj: '44.388.152/0001-89', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };

describe('trabalho intermitente (tela)', () => {
    it('só lista os intermitentes; monta os dias do período e grava a convocação aceita', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><IntermitentesPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        await screen.findByRole('option', { name: 'JOAO' });
        expect(screen.queryByRole('option', { name: 'ANA' })).toBeNull();
        fireEvent.change(screen.getByLabelText('Empregado intermitente'), { target: { value: 'E1_52998224725_M1' } });
        expect(screen.getByText('R$ 15,00')).toBeTruthy();
        fireEvent.click(screen.getByText('+ Nova convocação'));
        fireEvent.change(screen.getByLabelText('Enviada em'), { target: { value: '2026-10-01' } });
        fireEvent.change(screen.getByLabelText('Função'), { target: { value: 'Garçom' } });
        fireEvent.change(screen.getByLabelText('Início do período'), { target: { value: '2026-10-05' } });
        fireEvent.change(screen.getByLabelText('Fim do período'), { target: { value: '2026-10-09' } });
        fireEvent.click(screen.getByText('Incluir os dias'));
        expect(screen.getByText(/40 h × R\$ 15,00/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'aceita' } });
        fireEvent.change(screen.getByLabelText('Respondida em'), { target: { value: '2026-10-02' } });
        fireEvent.click(screen.getByText('Gravar a convocação'));
        await screen.findByText('Convocação gravada.');
        expect(srv.gravadas[0]).toMatchObject({ id: 'E1_52998224725_M1_k1', fichaId: 'E1_52998224725_M1', resposta: 'aceita', funcao: 'Garçom', dias: [{ data: '2026-10-05', horas: 8 }, { data: '2026-10-06', horas: 8 }, { data: '2026-10-07', horas: 8 }, { data: '2026-10-08', horas: 8 }, { data: '2026-10-09', horas: 8 }] });
    });
    it('não grava sem dias e com resposta sem data', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><IntermitentesPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        await screen.findByRole('option', { name: 'JOAO' });
        fireEvent.change(screen.getByLabelText('Empregado intermitente'), { target: { value: 'E1_52998224725_M1' } });
        fireEvent.click(screen.getByText('+ Nova convocação'));
        fireEvent.change(screen.getByLabelText('Resposta'), { target: { value: 'aceita' } });
        fireEvent.click(screen.getByText('Gravar a convocação'));
        expect((await screen.findByRole('alert')).textContent).toMatch(/Informe os dias.*data da resposta/);
        expect(srv.gravadas).toHaveLength(0);
    });
});
