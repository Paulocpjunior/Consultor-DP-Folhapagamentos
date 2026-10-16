// Crédito do Trabalhador, etapa 6: as consignações da API da Dataprev (formato do manual v1.7) entram na mesma prévia da
// importação do arquivo do Portal, e o extrato do trabalhador preenche garantia, saldo e data da consulta da rescisão.
// Dados fictícios.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acrescentarDoExtrato, aplicarExtrato, arquivoDaDataprev, buscarConsignacoesDataprev, conferirExtrato, consultarExtratoDataprev, instituicaoDoEmprestimo } from '../creditoTrabalhadorDataprev';
import { previaImportacao, sugerirColunas } from '../../calculo/importacaoConsignado';
import { validarContratos, type ContratoConsignado } from '../../calculo/consignado';
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
        { instFinanc: '', nrDoc: '', parcela: 0, inicio: '' }, // linha em branco: não conta como ausente
    ];
    const extrato = {
        cpf: '11144477735', nomeTrabalhador: 'ANA',
        emprestimos: [
            // Contrato com zeros à esquerda (15 posições) casa com o da ficha sem os zeros.
            { ifConcessora: { codigo: 341 }, contrato: '000000000012345', valorParcela: 250.5, valorSaldoDevedor: 4100.25, garantia: { temGarantias: true, percVerbaRescisoriaGarantia: 10 } },
            // temGarantias é a garantia do FGTS (manual v1.7): sem o percentual, a garantia da ficha fica como está.
            { ifConcessora: { codigo: '104' }, contrato: 'CX-9', valorSaldoDevedor: '1.500,00', garantia: { temGarantias: false } },
            { ifConcessora: { codigo: 237, descricao: 'BANCO NOVO' }, contrato: 'NOVO-1', competenciaInicioDesconto: '08/2026', competenciaFimDesconto: '07/2028',
                valorParcela: 80, valorSaldoDevedor: 900, garantia: { temGarantias: false, percVerbaRescisoriaGarantia: 0 } },
        ],
    };

    it('casa os contratos, mostra antes e depois e o que está só de um lado (linha em branco fora)', () => {
        const c = conferirExtrato(contratos, extrato, '2026-10-16');
        expect(c.total).toBe(3);
        expect(c.atualizacoes).toEqual([
            { indice: 0, instFinanc: '341', nrDoc: '12345', antes: { garantiaRescisao: undefined, saldoRescisao: undefined, consultaRescisao: undefined },
                depois: { garantiaRescisao: 10, saldoRescisao: 410025, consultaRescisao: '2026-10-16' } },
            { indice: 1, instFinanc: '104', nrDoc: 'CX-9', antes: { garantiaRescisao: 5, saldoRescisao: 100, consultaRescisao: '2026-09-01' },
                depois: { saldoRescisao: 150000, consultaRescisao: '2026-10-16' } },
        ]);
        // ST-1 já tem fim e a linha em branco não é contrato: nenhum dos dois é cobrado como ausente.
        expect(c.soNaFicha).toEqual([{ instFinanc: '001', nrDoc: 'BB-1' }]);
        expect(c.soNoExtrato).toEqual([{ instFinanc: '237', nrDoc: 'NOVO-1', instituicao: 'BANCO NOVO', parcela: 8000, inicio: '2026-08', fim: '2028-07', saldo: 90000, garantia: 0 }]);
        expect(c.avisos).toEqual([expect.stringMatching(/CX-9: o extrato não trouxe o percentual da garantia/)]);
        expect(c.camposRecebidos).toBeUndefined();
    });

    it('lê o extrato como lista de vínculos ou dentro de um envelope', () => {
        expect(conferirExtrato([], [extrato, { emprestimos: [{ ifConcessora: { codigo: 1 }, contrato: 'X-1', valorParcela: 10 }] }], '2026-10-16').total).toBe(4);
        expect(conferirExtrato([], { dados: extrato }, '2026-10-16').total).toBe(3);
        expect(conferirExtrato([], extrato.emprestimos, '2026-10-16').total).toBe(3);
    });

    it('resposta sem empréstimos: vazia não avisa; fora do formato mostra só os nomes dos campos', () => {
        expect(conferirExtrato(contratos, null, '2026-10-16')).toMatchObject({ total: 0, atualizacoes: [] });
        expect(conferirExtrato(contratos, null, '2026-10-16').camposRecebidos).toBeUndefined();
        const r = conferirExtrato([], { cpf: '11144477735', vinculos: 'x' }, '2026-10-16');
        expect(r.camposRecebidos).toEqual(['cpf', 'vinculos']);
        expect(JSON.stringify(r)).not.toContain('11144477735');
    });

    it('sem saldo nem garantia, não preenche e avisa', () => {
        const c = conferirExtrato([contratos[0]], { emprestimos: [{ ifConcessora: { codigo: 341 }, contrato: '12345', garantia: { temGarantias: true } }] }, '2026-10-16');
        expect(c.atualizacoes).toEqual([]);
        expect(c.avisos[0]).toMatch(/não trouxe o saldo devedor nem a garantia/);
    });

    it('aplicar muda só garantia, saldo e data da consulta, pelo contrato e não pela posição (Codex #281)', () => {
        const c = conferirExtrato(contratos, extrato, '2026-10-16');
        const novos = aplicarExtrato(contratos, c.atualizacoes);
        expect(novos[0]).toEqual({ ...contratos[0], garantiaRescisao: 10, saldoRescisao: 410025, consultaRescisao: '2026-10-16' });
        expect(novos[1]).toEqual({ ...contratos[1], saldoRescisao: 150000, consultaRescisao: '2026-10-16' });
        expect(novos.slice(2)).toEqual(contratos.slice(2));
        const semOPrimeiro = aplicarExtrato(contratos.slice(1), c.atualizacoes);
        expect(semOPrimeiro[0]).toEqual({ ...contratos[1], saldoRescisao: 150000, consultaRescisao: '2026-10-16' });
    });

    it('acrescenta os contratos só da Dataprev, nunca antes do mês atual, e tira a linha em branco', () => {
        const c = conferirExtrato(contratos, extrato, '2026-10-16');
        const novos = acrescentarDoExtrato(contratos, c.soNoExtrato, '2026-10', '2026-10-16');
        expect(novos).toHaveLength(5);
        expect(novos.at(-1)).toEqual({ instFinanc: '237', nrDoc: 'NOVO-1', parcela: 8000, inicio: '2026-10', fim: '2028-07', garantiaRescisao: 0, saldoRescisao: 90000,
            consultaRescisao: '2026-10-16', observacao: 'Extrato da Dataprev em 16/10/2026 (BANCO NOVO)' });
        expect(validarContratos(novos)).toEqual([]);
        // De novo: nada duplica.
        expect(acrescentarDoExtrato(novos, c.soNoExtrato, '2026-10', '2026-10-16')).toHaveLength(5);
    });

    it('aplicar e acrescentar juntos, como faz a ficha: nenhum grupo se perde (Codex #282)', () => {
        const c = conferirExtrato(contratos, extrato, '2026-10-16');
        const tudo = acrescentarDoExtrato(aplicarExtrato(contratos, c.atualizacoes), c.soNoExtrato, '2026-10', '2026-10-16');
        expect(tudo[0]).toMatchObject({ nrDoc: '12345', garantiaRescisao: 10, saldoRescisao: 410025 });
        expect(tudo[1]).toMatchObject({ nrDoc: 'CX-9', garantiaRescisao: 5, saldoRescisao: 150000 });
        expect(tudo.at(-1)).toMatchObject({ nrDoc: 'NOVO-1', parcela: 8000 });
        expect(validarContratos(tudo)).toEqual([]);
    });

    it('instituição fora do nome do manual: acha o código em outro campo; sem código, avisa e não grava (uso real 16/10/2026)', () => {
        expect(instituicaoDoEmprestimo({ ifConcessora: { codigo: 908, descricao: 'PARATI' } })).toEqual({ codigo: '908', descricao: 'PARATI' });
        expect(instituicaoDoEmprestimo({ instituicaoFinanceira: { codigo: '329', nome: 'QI' } })).toEqual({ codigo: '329', descricao: 'QI' });
        expect(instituicaoDoEmprestimo({ codigoIfConcessora: '908' })).toEqual({ codigo: '908' });
        expect(instituicaoDoEmprestimo({ ifConcessora: '908 - PARATI CFI' })).toEqual({ codigo: '908' });
        expect(instituicaoDoEmprestimo({ contrato: 'X', valorParcela: 10 })).toEqual({});
        // O extrato do primeiro uso real: contratos sem a instituição. Casam pelo número; os novos não entram na ficha.
        const real = { emprestimos: [
            { contrato: 'PKT447854676', valorParcela: 126.31, competenciaInicioDesconto: '07/2026', competenciaFimDesconto: '06/2027', valorSaldoDevedor: 977.04 },
            { contrato: '701924670', valorParcela: 190.79, competenciaInicioDesconto: '10/2026', competenciaFimDesconto: '12/2027', valorSaldoDevedor: 2085.1 },
        ] };
        const c = conferirExtrato([{ instFinanc: '908', nrDoc: '701924670', parcela: 19079, inicio: '2026-10' }], real, '2026-10-16');
        expect(c.atualizacoes).toEqual([{ indice: 0, instFinanc: '908', nrDoc: '701924670', antes: { garantiaRescisao: undefined, saldoRescisao: undefined, consultaRescisao: undefined },
            depois: { saldoRescisao: 208510, consultaRescisao: '2026-10-16' } }]);
        expect(c.soNoExtrato).toEqual([expect.objectContaining({ instFinanc: '', nrDoc: 'PKT447854676', parcela: 12631 })]);
        expect(c.avisos.join(' ')).toMatch(/1 contrato\(s\) sem o código da instituição.*PKT447854676.*Campos recebidos: contrato, valorParcela/);
        expect(acrescentarDoExtrato([], c.soNoExtrato, '2026-10', '2026-10-16')).toEqual([]);
    });
});
