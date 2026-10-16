// @vitest-environment jsdom
// Folha do mês › Crédito do Trabalhador: o repasse da competência pela folha e pelas rescisões gravadas (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const lidos = vi.hoisted(() => [] as string[]);
const verba = (codigo: string, tipo: string, valor: number, inss: boolean, descFolha?: object) => ({ codigo, descricao: codigo, referencia: '', tipo, valor, inss, fgts: inss, irrf: inss, ...(descFolha ? { descFolha } : {}) });
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [{ id: 'f1', empresaId: 'E1', cnpj: '11222333000181', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dados: { nome: 'ANA', codigoIob: '000001', categoria: '101' }, dependentes: [], origens: {}, pendenciasImportacao: [], consignados: [{ instFinanc: '341', nrDoc: 'CT-1', parcela: 90000, inicio: '2026-01' }] }],
    mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../folhaGravadaService', () => ({ lerFolhaGravada: async (_e: string, c: string) => { lidos.push(`folha ${c}`); return { holerites: [{ fichaId: 'f1', nome: 'ANA', competencia: c, verbas: [verba('SAL', 'provento', 200000, true), verba('CONSIG', 'desconto', 61250, false, { instFinanc: '341', nrDoc: 'CT-1' })] }] }; } }));
vi.mock('../processosGravadosService', () => ({ lerProcesso: async (_e: string, tipo: string, c: string) => { lidos.push(`${tipo} ${c}`); return null; } }));
import ConsignadoRepassePanel from '../../../components/folha/ConsignadoRepassePanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); lidos.length = 0; });
const ATIVA = { id: 'E1', nome: 'ALFA', cnpj: '44.388.152/0001-89', codigoSage: '1200', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };

describe('Crédito do Trabalhador: repasse (tela)', () => {
    it('mostra o total, o vencimento da guia, a linha parcial com o motivo e lê a folha e a rescisão da competência', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ConsignadoRepassePanel /></EmpresaAtivaProvider>);
        expect(await screen.findByText('Desconto parcial')).toBeTruthy();
        expect(screen.getAllByText(/R\$\s?612,50/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/19\/11\/2026/).length).toBeGreaterThan(0);
        expect(screen.getByText(/Margem de 35% esgotada/)).toBeTruthy();
        expect(lidos).toEqual(expect.arrayContaining(['folha 2026-10', 'rescisao 2026-10']));
    });
});
