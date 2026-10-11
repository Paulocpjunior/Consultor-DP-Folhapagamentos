// @vitest-environment jsdom
// Integração contábil: lote da folha em partidas dobradas, contas padrão, centro de custo, encargos, provisões, arquivo e tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { ResultadoCalculo, Verba } from '../../calculo/motorMensal';
import { resumirFolha } from '../../relatorios/resumoFolha';
import type { Enquadramento } from '../../cadastros/enquadramento';
import { chaveDaVerba, configVazia, gerarLoteContabil, loteCsv, saldoDaConta, verbasDoLote, type ConfigContabil } from '../integracaoContabil';

const srv = vi.hoisted(() => ({ salvo: null as unknown, folha: null as unknown }));
vi.mock('../contabilService', () => ({ lerConfigContabil: async (id: string) => ({ empresaId: id, contas: {}, porCentroCusto: true }), salvarConfigContabil: async (c: unknown) => { srv.salvo = c; } }));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'E1', cnpj: '44388152000189', razaoSocial: 'ALFA', nomeFantasia: 'ALFA', codigoSage: '0001', criadoPor: 'u' }] }));
vi.mock('../../calculo/folhaGravadaService', () => ({ lerFolhaGravada: async () => srv.folha }));
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => FICHAS, listarAfastamentos: async () => [], listarTabelas: async () => [], listarEnquadramentos: async () => [], mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../../departamentos/departamentosService', () => ({ listarDepartamentos: async () => DEPTOS }));
vi.mock('../../obras/lotacoesService', () => ({ listarLotacoes: async () => [] }));
vi.mock('../../calculo/movimentosService', () => ({ listarMovimentosDaEmpresa: async () => ({}) }));
vi.mock('xlsx', () => ({ utils: { book_new: () => ({}), book_append_sheet: () => undefined, json_to_sheet: () => ({}) }, writeFile: () => undefined }));
import IntegracaoContabilPanel from '../../../components/contabil/IntegracaoContabilPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const v = (codigo: string, valor: number, tipo: 'provento' | 'desconto', descricao = codigo): Verba => ({ codigo, descricao, referencia: '', tipo, valor, inss: false, fgts: false, irrf: false });
const res = (fichaId: string, verbas: Verba[], fgts: number, baseInss: number): ResultadoCalculo => {
    const p = verbas.filter(x => x.tipo === 'provento').reduce((s, x) => s + x.valor, 0); const d = verbas.filter(x => x.tipo === 'desconto').reduce((s, x) => s + x.valor, 0);
    return { fichaId, nome: fichaId, competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado', verbas, bases: { inss: baseInss, fgts: baseInss, irrf: baseInss }, totais: { proventos: p, descontos: d, liquido: p - d }, fgts, memoria: [], avisos: [], erros: [] } as ResultadoCalculo;
};
const FICHAS: FichaFuncionario[] = [
    { ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'A', cpf: '1', dados: { nome: 'ANA', departamento: 'ADM' } },
    { ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'B', cpf: '2', dados: { nome: 'BIA', departamento: 'OBRA' } },
];
const DEPTOS = [{ empresaId: 'E1', codigo: 'ADM', nome: 'Adm', centroCusto: 'CC-ADM', ativo: true }, { empresaId: 'E1', codigo: 'OBRA', nome: 'Obra', centroCusto: '', ativo: true }];
const RES = [
    res('A', [v('SAL', 300000, 'provento', 'Salário'), v('SF', 6000, 'provento', 'Salário-família'), v('INSS', 25000, 'desconto'), v('IRRF', 10000, 'desconto'), v('ADIANT', 120000, 'desconto', 'Adiantamento')], 24000, 300000),
    res('B', [v('SAL', 200000, 'provento', 'Salário'), v('HE50', 20000, 'provento', 'Horas extras 50%'), v('INSS', 18000, 'desconto')], 17600, 220000),
];
const CONTAS = { SALARIOS_A_PAGAR: '2.1.01', DESP_SALARIOS: '4.1.01', OUTROS_DESCONTOS: '2.1.09', INSS_A_RECOLHER: '2.1.02', IRRF_A_RECOLHER: '2.1.03', FGTS_A_RECOLHER: '2.1.04', DESP_INSS: '4.1.02', DESP_FGTS: '4.1.03' };
const CFG: ConfigContabil = { ...configVazia('E1'), contas: { ...CONTAS, 'V:ADIANT': '1.1.05' } };
const ENQ: Enquadramento = { id: 'q', empresaId: 'E1', vigencia: '2026-01', regime: 'normal', fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1, terceiros: 5.8, observacao: '' } as Enquadramento;
afterEach(() => { cleanup(); srv.salvo = null; srv.folha = null; });

describe('lote contábil da folha', () => {
    it('partidas dobradas: proventos, descontos, salário-família no INSS, FGTS e patronal rateado; salários a pagar = líquido', () => {
        const l = gerarLoteContabil({ competencia: '2026-09', resultados: RES, fichas: FICHAS, departamentos: DEPTOS, config: CFG, resumo: resumirFolha(RES, ENQ) });
        expect(l.pendencias).toEqual([]);
        expect(l.data).toBe('2026-09-30');
        const de = (d: string, c: string, cc: string, h: RegExp) => l.lancamentos.find(x => x.debito === d && x.credito === c && x.centroCusto === cc && h.test(x.historico))?.valor;
        expect(de('4.1.01', '2.1.01', 'CC-ADM', /Salário$/)).toBe(300000);
        expect(de('2.1.02', '2.1.01', 'CC-ADM', /Salário-família/)).toBe(6000);
        expect(de('2.1.01', '1.1.05', 'CC-ADM', /Adiantamento/)).toBe(120000);
        expect(de('2.1.01', '2.1.03', 'CC-ADM', /IRRF/)).toBe(10000);
        expect(de('4.1.03', '2.1.04', '', /FGTS/)).toBe(17600);
        const liquido = RES.reduce((s, r) => s + r.totais.liquido, 0);
        expect(saldoDaConta(l, '2.1.01')).toBe(liquido);
        const pat = resumirFolha(RES, ENQ).encargos.patronal!;
        const patronal = l.lancamentos.filter(x => x.debito === '4.1.02').reduce((s, x) => s + x.valor, 0);
        expect(patronal).toBe(pat.patronal + pat.rat + pat.terceiros);
        expect(l.avisos.join(' ')).toMatch(/HE50 .*sem conta própria/);
        expect(l.avisos.join(' ')).toMatch(/Departamento OBRA sem centro de custo/);
        const debitos = l.lancamentos.reduce((s, x) => s + x.valor, 0);
        expect(l.total).toBe(debitos);
    });

    it('sem conta: pendência; sem centro de custo: tudo junto; sem enquadramento: aviso', () => {
        const l = gerarLoteContabil({ competencia: '2026-09', resultados: RES, fichas: FICHAS, departamentos: DEPTOS, config: { ...configVazia('E1'), porCentroCusto: false }, resumo: resumirFolha(RES) });
        expect(l.pendencias.join(' ')).toMatch(/Salários a pagar/);
        expect(l.lancamentos.every(x => x.centroCusto === '')).toBe(true);
        expect(l.avisos.join(' ')).toMatch(/Sem enquadramento/);
    });

    it('provisões: constituição e baixa nas contas próprias', () => {
        const mov = (c: number, b: number) => ({ anterior: { principal: 0, inss: 0, fgts: 0 }, constituicao: { principal: c, inss: 100, fgts: 80 }, baixa: { principal: b, inss: 0, fgts: 0 }, atual: { principal: 0, inss: 0, fgts: 0 } });
        const provisao = { competencia: '2026-09', encargos: null, avisos: [], totais: { ferias: mov(0, 0), decimo: mov(0, 0) },
            linhas: [{ fichaId: 'A', nome: 'ANA', matricula: '', situacao: 'ativo' as const, remuneracao: 0, diasVencidos: 0, avosFerias: 0, avos13: 0, ferias: mov(5000, 2000), decimo: mov(2500, 0), memoria: [], avisos: [] }] };
        const contas = { ...CONTAS, DESP_PROV_FERIAS: '4.2.1', PROV_FERIAS: '2.2.1', PROV_FERIAS_INSS: '2.2.2', PROV_FERIAS_FGTS: '2.2.3', DESP_PROV_13: '4.2.2', PROV_13: '2.2.4', PROV_13_INSS: '2.2.5', PROV_13_FGTS: '2.2.6' };
        const l = gerarLoteContabil({ competencia: '2026-09', resultados: [], fichas: FICHAS, departamentos: DEPTOS, config: { ...CFG, contas }, provisao });
        expect(l.pendencias).toEqual([]);
        const v1 = (d: string, c: string) => l.lancamentos.find(x => x.debito === d && x.credito === c)?.valor;
        expect([v1('4.2.1', '2.2.1'), v1('4.2.1', '2.2.2'), v1('4.2.1', '2.2.3'), v1('2.2.1', '4.2.1'), v1('4.2.2', '2.2.4')]).toEqual([5000, 100, 80, 2000, 2500]);
    });

    it('arquivo .csv, chaves das verbas e lista para o plano', () => {
        const l = gerarLoteContabil({ competencia: '2026-09', resultados: RES, fichas: FICHAS, departamentos: DEPTOS, config: CFG, resumo: resumirFolha(RES, ENQ) });
        const csv = loteCsv(l).split('\r\n');
        expect(csv[0]).toBe('Data;Conta débito;Conta crédito;Valor;Histórico;Centro de custo');
        expect(csv).toContain('30/09/2026;4.1.01;2.1.01;3000,00;Folha de pagamento 09/2026 – Salário;CC-ADM');
        expect(chaveDaVerba({ codigo: 'FV2024-03-01', descricao: 'x' })).toBe('V:FV');
        expect(chaveDaVerba({ codigo: 'LAN2', descricao: 'Bônus' })).toBe('V:LAN:BÔNUS');
        expect(verbasDoLote(RES).map(x => x.chave)).toEqual(['V:HE50', 'V:SAL', 'V:SF', 'V:ADIANT', 'V:INSS', 'V:IRRF']);
    });
});

describe('tela da integração contábil', () => {
    it('mostra as pendências, grava o plano e libera o arquivo', async () => {
        srv.folha = { empresaId: 'E1', competencia: '2026-09', pagamento: '2026-10', gravadoPorEmail: 'x', totais: {}, holerites: RES };
        const ATIVA = { id: 'E1', nome: 'ALFA', cnpj: '44388152000189', codigoSage: '0001', competencia: '2026-09', ativadaPor: 'x', ativadaEm: 1 };
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><IntegracaoContabilPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        const lote = await screen.findByLabelText('Lote contábil');
        expect(lote.textContent).toMatch(/Sem conta para Salários a pagar/);
        for (const [k, c] of Object.entries(CONTAS)) {
            const rot = (await import('../integracaoContabil')).CONTAS_FIXAS.find(x => x.chave === k)!.rotulo;
            fireEvent.change(screen.getByLabelText(`Conta ${rot}`), { target: { value: c } });
        }
        await waitFor(() => expect(screen.queryByText(/Sem conta para/)).toBeNull());
        expect(screen.getByText(/Conferência: saldo de salários a pagar/).textContent).toMatch(/✓/);
        expect((screen.getByText('Arquivo (.csv)') as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(screen.getByText('Gravar o plano'));
        await waitFor(() => expect(srv.salvo).toMatchObject({ empresaId: 'E1', porCentroCusto: true, contas: expect.objectContaining({ SALARIOS_A_PAGAR: '2.1.01' }) }));
        expect(await screen.findByText('Gravado')).toBeTruthy();
    });
});
