// Crédito do Trabalhador, etapa 6: as consignações da API da Dataprev (formato do manual v1.7) entram na mesma prévia da
// importação do arquivo do Portal, e o extrato do trabalhador preenche garantia, saldo e data da consulta da rescisão.
// Dados fictícios.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aplicarExtrato, arquivoDaDataprev, buscarConsignacoesDataprev, conferirExtrato, consultarExtratoDataprev, type RespostaExtrato } from '../creditoTrabalhadorDataprev';
import { previaImportacao, sugerirColunas } from '../../calculo/importacaoConsignado';
import type { ContratoConsignado } from '../../calculo/consignado';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';

vi.mock('../../serpro/serproIntegrationService', () => ({ callFiscal: vi.fn(async (path: string, body: object) => ({ path, body })) }));
import { callFiscal } from '../../serpro/serproIntegrationService';

const CNPJ = '11222333000181';
const ficha = (id: string, cpf: string, nome: string, consignados: ContratoConsignado[] = []): FichaFuncionario =>
    ({ ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id, cpf, matriculaEsocial: `M${id}`, situacao: 'ativo', dados: { nome, admissao: '2020-02-01' }, consignados });
const item = (cpf: string, contrato: string, parcela: number, extra: Record<string, unknown> = {}) => ({
    ifConcessora: { codigo: 341, descricao: 'BANCO EXEMPLO' }, contrato, cpf, matricula: '', inscricaoEmpregador: { codigo: 1, descricao: 'CNPJ' },
    numeroInscricaoEmpregador: `0${CNPJ}`, nomeTrabalhador: 'FULANO', nomeEmpregador: 'EMPRESA EXEMPLO', competenciaInicioDesconto: '10/2026',
    totalParcelas: 24, valorParcela: parcela, valorEmprestimo: 5000, valorLiberado: 4800, categoriaTrabalhador: { codigo: 101, descricao: 'Empregado' },
    competencia: '10/2026', dataAdmissao: '01/02/2020', ...extra,
});

afterEach(() => vi.mocked(callFiscal).mockClear());

describe('chamadas à plataforma', () => {
    it('consignações e extrato vão às rotas do governo com CNPJ e CPF só com dígitos', async () => {
        await buscarConsignacoesDataprev({ empresaId: 'e1', cnpj: '11.222.333/0001-81', competencia: '2026-10', certificado: 'empresa' });
        expect(callFiscal).toHaveBeenLastCalledWith('/credito-trabalhador/consignacoes', { empresaId: 'e1', cnpj: CNPJ, competencia: '2026-10', certificado: 'empresa' });
        await consultarExtratoDataprev({ empresaId: 'e1', cnpj: CNPJ, cpf: '111.444.777-35' });
        expect(callFiscal).toHaveBeenLastCalledWith('/credito-trabalhador/extrato', { empresaId: 'e1', cnpj: CNPJ, cpf: '11144477735' });
    });
});

describe('consignações da Dataprev na prévia da importação', () => {
    it('as colunas da API são reconhecidas e a inscrição de 15 posições confere com a raiz da empresa', () => {
        const arq = arquivoDaDataprev([item('11144477735', 'A1', 400), item('22255588846', 'B1', 350.5)]);
        const mapa = sugerirColunas(arq.colunas);
        expect(mapa).toEqual({ cpf: 'cpf', matricula: 'matricula', admissao: 'dataAdmissao', instFinanc: 'ifConcessora.codigo', nrDoc: 'contrato', parcela: 'valorParcela',
            competencia: 'competencia', nome: 'nomeTrabalhador', cnpj: 'numeroInscricaoEmpregador' });
        const fichas = [ficha('a', '11144477735', 'ANA', [{ instFinanc: '341', nrDoc: 'A1', parcela: 40000, inicio: '2026-03' }]), ficha('b', '22255588846', 'BRUNO')];
        const p = previaImportacao(arq, mapa, '2026-10', fichas, CNPJ);
        expect(p.pendencias).toEqual([]);
        expect(p.acoes.map(a => [a.nome, a.tipo, a.parcela])).toEqual([['BRUNO', 'novo', 35050], ['ANA', 'igual', 40000]]);
    });

    it('raiz com zeros à esquerda vale; inscrição de outro empregador é recusada', () => {
        const fichas = [ficha('a', '11144477735', 'ANA')];
        const comRaiz = arquivoDaDataprev([item('11144477735', 'A1', 400, { numeroInscricaoEmpregador: '000000011222333' })]);
        expect(previaImportacao(comRaiz, sugerirColunas(comRaiz.colunas), '2026-10', fichas, CNPJ).pendencias).toEqual([]);
        const outro = arquivoDaDataprev([item('11144477735', 'A1', 400, { numeroInscricaoEmpregador: '099888777000100' })]);
        expect(previaImportacao(outro, sugerirColunas(outro.colunas), '2026-10', fichas, CNPJ).pendencias[0].motivo).toBe('CNPJ de outro empregador.');
    });

    it('sem registros (LF): as colunas do manual vêm mesmo assim, e o contrato vigente aparece como fora da lista (Codex #281)', () => {
        const arq = arquivoDaDataprev([]);
        expect(arq.linhas).toEqual([]);
        const fichas = [ficha('a', '11144477735', 'ANA', [{ instFinanc: '341', nrDoc: 'A1', parcela: 40000, inicio: '2026-03' }])];
        const p = previaImportacao(arq, sugerirColunas(arq.colunas), '2026-10', fichas, CNPJ);
        expect(p.acoes.map(a => [a.nome, a.tipo, a.nrDoc])).toEqual([['ANA', 'ausente', 'A1']]);
    });
});

describe('extrato do trabalhador na ficha', () => {
    const contratos: ContratoConsignado[] = [
        { instFinanc: '341', nrDoc: '12345', parcela: 25050, inicio: '2026-05' },
        { instFinanc: '104', nrDoc: 'CX-9', parcela: 10000, inicio: '2026-01', garantiaRescisao: 5, saldoRescisao: 100, consultaRescisao: '2026-09-01' },
        { instFinanc: '001', nrDoc: 'BB-1', parcela: 9000, inicio: '2026-01' },
        { instFinanc: '033', nrDoc: 'ST-1', parcela: 9000, inicio: '2025-01', fim: '2026-04' },
    ];
    const extrato: RespostaExtrato['extrato'] = {
        cpf: '11144477735', nomeTrabalhador: 'ANA',
        emprestimos: [
            // Contrato com zeros à esquerda (15 posições) casa com o da ficha sem os zeros.
            { ifConcessora: { codigo: 341 }, contrato: '000000000012345', valorParcela: 250.5, valorSaldoDevedor: 4100.25, garantia: { temGarantias: true, percVerbaRescisoriaGarantia: 10 } },
            { ifConcessora: { codigo: '104' }, contrato: 'CX-9', valorSaldoDevedor: '1.500,00', garantia: { temGarantias: false } },
            { ifConcessora: { codigo: 237 }, contrato: 'NOVO-1', valorParcela: 80, valorSaldoDevedor: 900, garantia: { temGarantias: false } },
        ],
    };

    it('casa os contratos, mostra antes e depois e avisa o que está só de um lado', () => {
        const c = conferirExtrato(contratos, extrato, '2026-10-16');
        expect(c.atualizacoes).toEqual([
            { indice: 0, instFinanc: '341', nrDoc: '12345', antes: { garantiaRescisao: undefined, saldoRescisao: undefined, consultaRescisao: undefined },
                depois: { garantiaRescisao: 10, saldoRescisao: 410025, consultaRescisao: '2026-10-16' } },
            { indice: 1, instFinanc: '104', nrDoc: 'CX-9', antes: { garantiaRescisao: 5, saldoRescisao: 100, consultaRescisao: '2026-09-01' },
                depois: { garantiaRescisao: 0, saldoRescisao: 150000, consultaRescisao: '2026-10-16' } },
        ]);
        // ST-1 já tem fim: não é cobrado como ausente.
        expect(c.soNaFicha).toEqual([{ instFinanc: '001', nrDoc: 'BB-1' }]);
        expect(c.soNoExtrato).toEqual([{ instFinanc: '237', nrDoc: 'NOVO-1', parcela: 8000 }]);
        expect(c.avisos).toEqual([expect.stringMatching(/1 contrato\(s\) ativo\(s\) na Dataprev fora da ficha/)]);
    });

    it('sem saldo ou sem percentual da garantia, não preenche e avisa', () => {
        const c = conferirExtrato([contratos[0]], { emprestimos: [{ ifConcessora: { codigo: 341 }, contrato: '12345', garantia: { temGarantias: true } , valorSaldoDevedor: 10 }] }, '2026-10-16');
        expect(c.atualizacoes).toEqual([]);
        expect(c.avisos[0]).toMatch(/não trouxe o percentual da garantia/);
        expect(conferirExtrato(contratos, null, '2026-10-16').atualizacoes).toEqual([]);
    });

    it('aplicar muda só garantia, saldo e data da consulta dos contratos conferidos', () => {
        const c = conferirExtrato(contratos, extrato, '2026-10-16');
        const novos = aplicarExtrato(contratos, c.atualizacoes);
        expect(novos[0]).toEqual({ ...contratos[0], garantiaRescisao: 10, saldoRescisao: 410025, consultaRescisao: '2026-10-16' });
        expect(novos[1]).toEqual({ ...contratos[1], garantiaRescisao: 0, saldoRescisao: 150000, consultaRescisao: '2026-10-16' });
        expect(novos.slice(2)).toEqual(contratos.slice(2));
    });

    it('aplica pelo contrato, não pela posição: a lista mudou entre a consulta e o aplicar (Codex #281)', () => {
        const c = conferirExtrato(contratos, extrato, '2026-10-16');
        const semOPrimeiro = contratos.slice(1);
        const novos = aplicarExtrato(semOPrimeiro, c.atualizacoes);
        expect(novos[0]).toEqual({ ...contratos[1], garantiaRescisao: 0, saldoRescisao: 150000, consultaRescisao: '2026-10-16' });
        expect(novos.slice(1)).toEqual(contratos.slice(2));
    });
});
