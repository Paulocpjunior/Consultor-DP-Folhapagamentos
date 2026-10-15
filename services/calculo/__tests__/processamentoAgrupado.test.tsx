// @vitest-environment jsdom
// Processamento agrupado: a folha da empresa igual à da tela, o resumo por empresa, a gravação e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { calcularMensal } from '../motorMensal';
import { OPCOES_FERIAS_PADRAO } from '../motorFerias';
import { calcularFolhaMensal, type DadosFolhaEmpresa } from '../folhaDaEmpresa';
import { linhaComFalha, linhaDaEmpresa, planilhaAgrupada, totaisAgrupados } from '../processamentoAgrupado';
import { resumirFolha } from '../../relatorios/resumoFolha';

const srv = vi.hoisted(() => ({ afast: {} as Record<string, unknown[]>, fichas: {} as Record<string, unknown[]>, encerradas: new Set<string>(), gravadas: [] as unknown[][], falha: new Set<string>() }));
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async (id: string) => { if (srv.falha.has(id)) throw new Error('sem permissão'); return srv.fichas[id] ?? []; },
    listarAfastamentos: async (id: string) => srv.afast[id] ?? [], listarEnquadramentos: async () => [], listarTabelas: async () => TAB, listarTabelasDsr: async () => [],
    mensagemErro: (e: unknown) => (e as Error).message,
}));
vi.mock('../convocacoesService', () => ({ listarConvocacoes: async () => [] }));
vi.mock('../movimentosService', () => ({ listarMovimentos: async () => [], listarMovimentosDaEmpresa: async () => ({}) }));
vi.mock('../folhaGravadaService', () => ({ lerFolhaGravada: async () => null, gravarFolha: async (...a: unknown[]) => { srv.gravadas.push(a); } }));
vi.mock('../../fimDeMes/fechamentoService', () => ({ lerFechamento: async (id: string) => (srv.encerradas.has(id) ? { situacao: 'encerrado' } : null) }));
vi.mock('../../obras/lotacoesService', () => ({ listarLotacoes: async () => [] }));
vi.mock('../../sindicatos/convencoesService', () => ({ listarConvencoes: async () => [] }));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => EMPRESAS }));
vi.mock('xlsx', () => ({ utils: { book_new: () => ({}), book_append_sheet: () => undefined, aoa_to_sheet: () => ({}) }, writeFile: () => undefined }));
import { processarEmpresa } from '../processamentoAgrupadoService';
import ProcessamentoAgrupadoPanel from '../../../components/calculo/ProcessamentoAgrupadoPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha = (id: string, empresa: string, salario: string): FichaFuncionario => ({ ...fichaVazia({ id: empresa, cnpj: '44388152000189' }), id, cpf: '52998224725',
    dados: { nome: `PESSOA ${id}`, admissao: '2025-01-02', salario, unidadeSalario: '5', horasSemanais: '44', categoria: '101', regimeTrabalhista: '1' } });
const EMPRESAS = [
    { id: 'E1', cnpj: '44388152000189', razaoSocial: 'ALFA LTDA', nomeFantasia: 'ALFA', codigoSage: '0001', criadoPor: 'u' },
    { id: 'E2', cnpj: '29463877000109', razaoSocial: 'BETA LTDA', nomeFantasia: 'BETA', codigoSage: '0002', criadoPor: 'u' },
    { id: 'E3', cnpj: '11222333000181', razaoSocial: 'GAMA LTDA', nomeFantasia: 'GAMA', codigoSage: '0003', criadoPor: 'u' },
] as never[];
const USUARIO = { id: 'u', email: 'dp@x' };
afterEach(() => { cleanup(); srv.afast = {}; srv.fichas = {}; srv.encerradas.clear(); srv.gravadas.length = 0; srv.falha.clear(); });

describe('folha da empresa (a mesma conta da tela)', () => {
    it('cada funcionário da competência sai igual ao motor mensal', () => {
        const f = ficha('f1', 'E1', '3000.00');
        const d: DadosFolhaEmpresa = { fichas: [f], afastamentos: [], tabelas: TAB, movimentosEmpresa: {}, convencaoDe: () => undefined, opcoesFerias: OPCOES_FERIAS_PADRAO };
        const [r] = calcularFolhaMensal(d, '2026-10', '2026-10', {});
        const direto = calcularMensal({ competencia: '2026-10', pagamento: '2026-10', ficha: f, tabelas: TAB, movimento: undefined, afastamentos: [], feriasDoMes: undefined, folhaPagaNoAdiantamento: null, convocacoes: undefined });
        expect(r.totais).toEqual(direto.totais);
        expect(r.situacao).toBe('calculado');
        expect(calcularFolhaMensal(d, '10/2026', '2026-10', {})).toEqual([]);
    });
});

describe('resumo por empresa', () => {
    it('linha, falha, totais e planilha', () => {
        const f = ficha('f1', 'E1', '3000.00');
        const rs = calcularFolhaMensal({ fichas: [f], afastamentos: [], tabelas: TAB, movimentosEmpresa: {}, convencaoDe: () => undefined, opcoesFerias: OPCOES_FERIAS_PADRAO }, '2026-10', '2026-10', {});
        const l = linhaDaEmpresa({ empresa: { id: 'E1', nome: 'ALFA', codigoSage: '0001' }, competencia: '2026-10', pagamento: '2026-10', resultados: rs, resumo: resumirFolha(rs), encerrada: false, gravacao: 'nao-pedida', avisos: ['aviso x'] });
        expect(l).toMatchObject({ situacao: 'ok', funcionarios: 1, calculados: 1, proventos: rs[0].totais.proventos, liquido: rs[0].totais.liquido, mensagens: ['aviso x'] });
        expect(l.patronal).toBeUndefined();
        const falha = linhaComFalha({ id: 'E2', nome: 'BETA', codigoSage: '0002' }, '2026-10', 'sem permissão');
        const t = totaisAgrupados([l, falha]);
        expect([t.empresas, t.ok, t.pendencias, t.liquido]).toEqual([2, 1, 1, l.liquido]);
        const p = planilhaAgrupada([l, falha]);
        expect(p).toHaveLength(4);
        expect(p[1].slice(0, 6)).toEqual(['0001', 'ALFA', '2026-10', '2026-10', 'Calculada', '—']);
        expect(p[2][4]).toBe('Não processada');
        expect(p[3][1]).toBe('Total (2 empresas)');
    });
});

describe('processamento de cada empresa', () => {
    const o = { competencia: '2026-10', gravar: true, provisoes: true, usuario: USUARIO, tabelas: TAB, convencoes: [] };
    it('calcula, grava com a competência aberta e calcula as provisões', async () => {
        srv.fichas.E1 = [ficha('f1', 'E1', '3000.00'), ficha('f2', 'E1', '2500.00')];
        const l = await processarEmpresa(EMPRESAS[0], o);
        expect(l).toMatchObject({ situacao: 'ok', funcionarios: 2, gravacao: 'gravada', pagamento: '2026-11' });
        expect(l.provisao).toBeDefined();
        expect(srv.gravadas).toHaveLength(1);
        expect(l.mensagens.join(' ')).toMatch(/sem enquadramento/i);
    });
    it('competência encerrada não é regravada; empresa sem funcionários; falha de leitura não para', async () => {
        srv.fichas.E1 = [ficha('f1', 'E1', '3000.00')];
        srv.encerradas.add('E1');
        expect((await processarEmpresa(EMPRESAS[0], o)).gravacao).toBe('encerrada');
        expect(srv.gravadas).toHaveLength(0);
        expect(await processarEmpresa(EMPRESAS[1], o)).toMatchObject({ situacao: 'sem-funcionarios', gravacao: 'sem-calculo' });
        srv.falha.add('E3');
        expect(await processarEmpresa(EMPRESAS[2], o)).toMatchObject({ situacao: 'falhou', mensagens: ['Dados não lidos: sem permissão'] });
    });
});

describe('tela do processamento agrupado', () => {
    it('processa as empresas marcadas e mostra o total', async () => {
        srv.fichas.E1 = [ficha('f1', 'E1', '3000.00')];
        srv.fichas.E2 = [ficha('f2', 'E2', '2000.00')];
        const ATIVA = { id: 'E1', nome: 'ALFA', cnpj: '44388152000189', codigoSage: '0001', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ProcessamentoAgrupadoPanel usuario={USUARIO} /></EmpresaAtivaProvider>);
        await screen.findByLabelText('Processar GAMA');
        fireEvent.click(screen.getByLabelText('Processar GAMA'));
        fireEvent.click(screen.getByText('Processar 2 empresa(s)'));
        const res = await screen.findByLabelText('Resultado do processamento');
        await waitFor(() => expect(res.textContent).toMatch(/2 empresa\(s\) · 2 calculada\(s\)/));
        expect(res.textContent).toMatch(/ALFA/);
        expect(res.textContent).toMatch(/BETA/);
        expect(res.textContent).not.toMatch(/GAMA/);
        expect(srv.gravadas).toHaveLength(0);
        fireEvent.click(screen.getByText('Planilha (Excel)'));
    });
});

describe('13º em lote (rotina anual)', () => {
    const base = { competencia: '2026-11', gravar: false, provisoes: false, usuario: USUARIO, tabelas: TAB, convencoes: [] };
    it('1ª e 2ª parcelas de cada empresa, como na tela do 13º; não grava', async () => {
        srv.fichas.E1 = [ficha('E1_1', 'E1', '3000.00'), ficha('E1_2', 'E1', '4000.00')];
        const p1 = await processarEmpresa(EMPRESAS[0], { ...base, folha: '13-1a' });
        expect(p1).toMatchObject({ competencia: '2026-13', pagamento: '2026-11', situacao: 'ok', funcionarios: 2, gravacao: 'nao-pedida', proventos: 350000, liquido: 350000 });
        const p2 = await processarEmpresa(EMPRESAS[0], { ...base, folha: '13-2a', gravar: true });
        expect(p2).toMatchObject({ pagamento: '2026-12', situacao: 'ok', funcionarios: 2, proventos: 700000 });
        expect(p2.inssSegurados).toBeGreaterThan(0);
        expect(srv.gravadas).toEqual([]);
    });
    it('parcela única da empresa e a 1ª parcela já paga com as férias ficam fora da 1ª', async () => {
        srv.fichas.E1 = [ficha('E1_1', 'E1', '3000.00'), ficha('E1_2', 'E1', '4000.00')];
        srv.afast.E1 = [{ id: 'E1_1_2026-07-06', fichaId: 'E1_1', motivo: '15', dtInicio: '2026-07-06', dtFim: '2026-07-25', adiantar13: 'S' }];
        const p1 = await processarEmpresa(EMPRESAS[0], { ...base, folha: '13-1a' });
        expect([p1.funcionarios, p1.proventos]).toEqual([1, 200000]);
        expect(p1.mensagens.join(' ')).toMatch(/1 funcionário\(s\) já receberam a 1ª parcela com as férias/);
        const unica = { ...EMPRESAS[0] as object, parametrosFolha: { parcelaUnica13: [2026] } } as never;
        const u1 = await processarEmpresa(unica, { ...base, folha: '13-1a' });
        expect([u1.funcionarios, u1.mensagens[0]]).toEqual([0, 'Parcela única em 2026 (parâmetro da empresa): sem 1ª parcela; o 13º sai inteiro na 2ª.']);
        const u2 = await processarEmpresa(unica, { ...base, folha: '13-2a' });
        expect(u2.funcionarios).toBe(2);
    });
});
