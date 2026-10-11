// Folha por obra: rateio, encargos por obra com a CPRB (reoneração gradual) e o S-1200 com um ideEstabLot por obra.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calcularPatronal, enquadramentoVazio, fatorReoneracao, type Enquadramento } from '../../cadastros/enquadramento';
import { encargosPorLotacao, repartir, verbasPorLotacao } from '../folhaPorObra';
import { lotacaoVazia, type Lotacao } from '../lotacoes';
import { calcularMensal, lotacoesDoMes } from '../../calculo/motorMensal';
import { limparMovimento } from '../../calculo/movimento';
import { gerarEventosFolha, type ParametrosEsocialFolha } from '../../esocial/eventosFolha';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import type { Rubrica } from '../../cadastros/rubricas';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const CNPJ = '44388152000189';
const ENQ: Enquadramento = { ...enquadramentoVazio('E1'), id: 'E1_2025-01', vigencia: '2025-01', regime: 'normal', fpas: '507', codigoTerceiros: '0079', patronal: 20, rat: 3, fap: 1, terceiros: 5.8, cprb: true };
const OBRA: Lotacao = { ...lotacaoVazia('E1'), codigo: 'OBRA01', descricao: 'Edifício Aurora', cno: '900012345678', cnaePrep: '4120400', substituida: true, iniValid: '2026-01', recibo1020: '1.1', recibo1005: '1.2' };
const SUB: Lotacao = { ...lotacaoVazia('E1'), codigo: 'SUB01', descricao: 'Subempreitada', tipo: '02', cno: '900099988877', contratante: { tpInsc: '1', nrInsc: '11222333000181' }, iniValid: '2026-01', recibo1020: '1.3' };

describe('CPRB e reoneração gradual (Lei 14.973/2024)', () => {
    it('fator por ano: 0 até 2024, 25% em 2025, 50% em 2026, 75% em 2027, inteiro de 2028', () => {
        expect(['2024-12', '2025-01', '2026-06', '2027-12', '2028-01'].map(fatorReoneracao)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });
    it('2026: 10% da folha sem o 13º; RAT e terceiros inteiros; obra não substituída e sem CPRB, 20%', () => {
        const p = calcularPatronal(1_000_000, 0, ENQ, { competencia: '2026-12', decimoTerceiro: 100_000 });
        expect([p.patronal, p.rat, p.terceiros]).toEqual([90_000, 30_000, 58_000]);
        expect(p.memoria.join(' ')).toMatch(/reoneração gradual.*sem cota patronal sobre o 13º.*R-2060.*75%/);
        expect(calcularPatronal(1_000_000, 0, ENQ, { competencia: '2026-12', naoSubstituida: true }).patronal).toBe(200_000);
        expect(calcularPatronal(1_000_000, 0, { ...ENQ, cprb: false }, { competencia: '2026-12' }).patronal).toBe(200_000);
        expect(calcularPatronal(1_000_000, 0, ENQ, { competencia: '2024-12' }).patronal).toBe(0);
        expect(calcularPatronal(1_000_000, 0, ENQ, { competencia: '2026-12', rat: 2, fap: 0.5 }).rat).toBe(10_000);
    });
});

describe('rateio entre obras', () => {
    it('reparte o centavo para a obra com mais dias; descontos na principal', () => {
        expect(repartir(1000, [1, 2])).toEqual([333, 667]);
        expect(repartir(100, [0, 0])).toEqual([100, 0]);
        const v = verbasPorLotacao([{ codigo: 'SAL', tipo: 'provento' as const, valor: 300000 }, { codigo: 'INSS', tipo: 'desconto' as const, valor: 25000 }], [{ codigo: 'A', peso: 10 }, { codigo: 'B', peso: 20 }], 'P');
        expect(v).toEqual([{ codigo: 'A', verbas: [{ codigo: 'SAL', tipo: 'provento', valor: 100000 }] }, { codigo: 'B', verbas: [{ codigo: 'SAL', tipo: 'provento', valor: 200000 }, { codigo: 'INSS', tipo: 'desconto', valor: 25000 }] }]);
    });
    it('o movimento guarda o rateio e o plano de saúde do lançamento (antes, a limpeza tirava a operadora)', () => {
        const m = limparMovimento({ rateioLotacao: { OBRA01: 10, SUB01: 20, 'x/y': 3, ZERO: 0 }, lancamentos: [{ descricao: 'Coparticipação', tipo: 'desconto', valor: 4750, inss: false, fgts: false, irrf: false, planoSaude: { cnpjOper: '11222333000181', regANS: '123456' } }] });
        expect(m.rateioLotacao).toEqual({ OBRA01: 10, SUB01: 20 });
        expect(m.lancamentos?.[0].planoSaude).toEqual({ cnpjOper: '11222333000181', regANS: '123456' });
    });
});

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2026-01', norma: 'teste', observacao: '', valores: {},
    faixas: [{ ate: 162100, aliquota: 7.5, deducao: 0 }, { ate: 290284, aliquota: 9, deducao: 0 }, { ate: 435427, aliquota: 12, deducao: 0 }, { ate: 847555, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'teste', observacao: '', valores: { descontoSimplificado: 60720 }, faixas: [{ ate: 500000, aliquota: 0, deducao: 0 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const FICHA = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'PEDREIRO', admissao: '2024-03-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', lotacao: 'OBRA01' } } as FichaFuncionario;
const RUB: [string, string, string, '1' | '2', string][] = [['SAL', 'SALARIO', '1000', '1', '11'], ['INSS', 'INSS', '9201', '2', '31']];
const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp, cp]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: cp, codIncIRRF: tp === '1' ? '11' : '31', codIncFGTS: tp === '1' ? '11' : '00', codIncCPRP: '', observacao: '' } }] }));
const PARAMS: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { SAL: { codRubr: 'SAL', ideTabRubr: 'T1' }, INSS: { codRubr: 'INSS', ideTabRubr: 'T1' } } };

describe('folha por obra no motor, nos encargos e no S-1200', () => {
    const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [], movimento: { rateioLotacao: { OBRA01: 10, SUB01: 20 } } });
    it('o motor guarda as obras do mês: o rateio ou a obra da ficha', () => {
        expect(r.lotacoes).toEqual([{ codigo: 'OBRA01', peso: 10 }, { codigo: 'SUB01', peso: 20 }]);
        expect(lotacoesDoMes(FICHA)).toEqual([{ codigo: 'OBRA01', peso: 1 }]);
        expect(r.memoria.join()).toMatch(/Rateio entre obras/);
    });
    it('encargos por obra: obra própria substituída na CPRB (10% em 2026) e subempreitada na mesma regra', () => {
        const e = encargosPorLotacao([r], [OBRA, SUB], 'LOT01', ENQ, '2026-09');
        expect(e.map(x => [x.codigo, x.baseInss, x.patronal?.patronal])).toEqual([['OBRA01', 100000, 10000], ['SUB01', 200000, 20000]]);
        expect(e[1].inssSegurados).toBe(r.verbas.find(v => v.codigo === 'INSS')!.valor);
        const naoSubst = encargosPorLotacao([r], [{ ...OBRA, substituida: false }, SUB], 'LOT01', ENQ, '2026-09');
        expect(naoSubst[0].patronal?.patronal).toBe(20000);
    });
    it('S-1200 com um ideEstabLot por obra (CNO na obra própria), proventos pelos dias e INSS na principal; XSD', async () => {
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-10-05', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS, lotacoes: [OBRA, SUB], agora: new Date('2026-10-05T12:00:00Z') });
        const x = t.trabalhadores[0];
        expect(x.erros).toEqual([]);
        expect(x.s1200!.xml).toContain('<ideEstabLot><tpInsc>4</tpInsc><nrInsc>900012345678</nrInsc><codLotacao>OBRA01</codLotacao><remunPerApur><matricula>M1</matricula><itensRemun><codRubr>SAL</codRubr><ideTabRubr>T1</ideTabRubr><qtdRubr>10.00</qtdRubr><vrRubr>1000.00</vrRubr>');
        expect(x.s1200!.xml).toContain(`<ideEstabLot><tpInsc>1</tpInsc><nrInsc>${CNPJ}</nrInsc><codLotacao>SUB01</codLotacao><remunPerApur><matricula>M1</matricula><itensRemun><codRubr>SAL</codRubr><ideTabRubr>T1</ideTabRubr><qtdRubr>20.00</qtdRubr><vrRubr>2000.00</vrRubr>`);
        expect(x.s1200!.xml.match(/<codRubr>INSS<\/codRubr>/g)).toHaveLength(1);
        expect(await validarPeloXsd(x.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const semCadastro = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-10-05', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS, lotacoes: [OBRA] }).trabalhadores[0];
        expect(semCadastro.erros.join()).toMatch(/SUB01 não está em Cadastros › Obras e lotações/);
        const semRecibo = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-10-05', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS, lotacoes: [{ ...OBRA, recibo1005: undefined }, SUB] });
        expect(semRecibo.avisos.join()).toMatch(/sem o recibo do S-1005/);
    });
});
