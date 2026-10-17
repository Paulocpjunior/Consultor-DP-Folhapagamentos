// Ficha financeira pelo histórico de holerites do SAGE (dados fictícios).
import { describe, expect, it } from 'vitest';
import { ehTotalizador, historicoDoHolerith, mesesDoHistorico, tipoDoLancamento, type HistoricoSageAno } from '../historicoSage';
import { fichasFinanceiras, mesesSemFolha, type FolhaDoMes } from '../relatoriosAnuais';
import { fichaFinanceiraPdf } from '../relatoriosAnuaisPdf';
import { naturezasDosEventos } from '../../calculo/movimentosDoBackup';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

const ficha = (id: string, codigoIob: string, nome: string, admissao: string, dataDesligamento = ''): FichaFuncionario => {
    const f = fichaVazia({ id: 'E1', cnpj: '11222333000181' });
    return { ...f, id, cpf: '52998224725', dados: { ...f.dados, nome, codigoIob, admissao, dataDesligamento } } as FichaFuncionario;
};
const COLS = ['final', 'codfun', 'anomes', 'codeven', 'ref', 'valor', 'vl_ven', 'vl_des', 'descricao'];
const l = (fin: string, codfun: string, anomes: string, codeven: string, valor: string, descricao: string, ven = '0', des = '0') => [fin, codfun, anomes, codeven, '', valor, ven, des, descricao];

describe('tipo do lançamento do SAGE', () => {
    it('tpRubr do S-1010, depois a coluna do valor, a natureza e a descrição', () => {
        expect(tipoDoLancamento({ tpRubr: '2', vlVen: 100, descricao: 'X' })).toBe('desconto');
        expect(tipoDoLancamento({ tpRubr: '3', descricao: 'X' })).toBe('informativo');
        expect(tipoDoLancamento({ vlDes: 100, natRubr: '1000', descricao: 'X' })).toBe('desconto');
        expect(tipoDoLancamento({ vlVen: 100, vlDes: 100, natRubr: '9201', descricao: 'X' })).toBe('desconto');
        expect(tipoDoLancamento({ natRubr: '9901', descricao: 'X' })).toBe('informativo');
        expect(tipoDoLancamento({ natRubr: '1003', descricao: 'DESCONTO?' })).toBe('provento');
        expect(tipoDoLancamento({ descricao: 'DESC. VALE TRANSPORTE' })).toBe('desconto');
        expect(tipoDoLancamento({ descricao: 'I.R.R.F.' })).toBe('provento');
        expect(tipoDoLancamento({ descricao: 'IRRF' })).toBe('desconto');
        expect(tipoDoLancamento({ descricao: 'DESCANSO SEMANAL REMUNERADO' })).toBe('provento');
        expect(tipoDoLancamento({ descricao: 'BASE INSS' })).toBe('informativo');
        expect(tipoDoLancamento({ descricao: 'SALARIO' })).toBe('provento');
        expect(ehTotalizador('TOTAL DE VENCIMENTOS')).toBe(true);
        expect(ehTotalizador('Líquido a receber')).toBe(true);
        expect(ehTotalizador('SALARIO')).toBe(false);
    });
});

describe('ficha financeira pelo holerith', () => {
    const ana = ficha('E1_52998224725_M1', '000052', 'ANA', '2020-03-02', '2024-06-10');
    const ana2 = ficha('E1_52998224725_M2', '52', 'ANA', '2024-08-01');
    const s1010 = { colunas: ['codrubr', 'natrubr', 'tprubr', 'inivalid', 'fimvalid'], linhas: [['1', '1000', '1', '2018-01', ''], ['901', '9201', '', '2018-01', ''], ['950', '9901', '3', '2018-01', '']] };
    const eventos = { colunas: ['codeven', 'rubesocial'], linhas: [['1', '1'], ['901', '901'], ['950', '950']] };
    const nat = naturezasDosEventos(eventos, s1010);

    it('valor em centavos por evento e mês, no vínculo em vigor; totais do SAGE ficam de fora', () => {
        const holerith = { colunas: COLS, linhas: [
            l('1', '52', '202403', '1', '3000.00', 'SALARIO'), l('1', '52', '202403', '901', '240.00', 'INSS'),
            l('1', '52', '202403', '950', '3000.00', 'BASE INSS'), l('1', '52', '202403', '999', '2760.00', 'LIQUIDO'),
            l('3', '52', '202403', '1', '150,50', 'SALARIO'),
            l('1', '000052', '202409', '1', '3100.00', 'SALARIO'), l('1', '52', '202409', '77', '0.00', 'NADA', '0', '10.00'),
            l('1', '53', '202409', '1', '1000.00', 'SALARIO'), l('1', '52', '202212', '1', '2800.00', 'SALARIO'),
        ] };
        const r = historicoDoHolerith(holerith, nat, [ana, ana2], 'E1', { desde: '2023-01' });
        expect(r.anos.map(a => [a.fichaId, a.ano, a.nome])).toEqual([['E1_52998224725_M1', '2024', 'ANA'], ['E1_52998224725_M2', '2024', 'ANA']]);
        expect(r.anos[0].linhas.map(x => [x.codigo, x.tipo, x.meses[2]])).toEqual([['1', 'provento', 315050], ['901', 'desconto', 24000], ['950', 'informativo', 300000]]);
        // Sem `valor`, vale a coluna preenchida (vl_des = desconto).
        expect(r.anos[1].linhas.map(x => [x.codigo, x.tipo, x.meses[8]])).toEqual([['1', 'provento', 310000], ['77', 'desconto', 1000]]);
        expect(r.semFicha).toBe(1);
        expect(r.finalidades).toEqual({ 1: 6, 3: 1 });
        expect(mesesDoHistorico(r.anos[0])).toEqual([2]);
        // Totais por finalidade (folha × outra finalidade), sem o informativo e sem o totalizador do SAGE.
        expect(r.anos[0].comNaturezas).toBe(true);
        expect(r.anos[0].porFinalidade?.['1'][2]).toEqual({ proventos: 300000, descontos: 24000, porNatureza: { 1000: 300000, 9201: 24000 } });
        expect(r.anos[0].porFinalidade?.['3'][2]).toEqual({ proventos: 15050, descontos: 0, porNatureza: { 1000: 15050 } });
        expect(r.anos[0].porFinalidade?.['1'].filter(x => x !== null)).toHaveLength(1);
    });

    it('sem as colunas de valor: avisa e não monta nada', () => {
        const r = historicoDoHolerith({ colunas: ['codfun', 'anomes', 'codeven', 'ref'], linhas: [['52', '202403', '1', '30']] }, nat, [ana], 'E1');
        expect(r.anos).toEqual([]);
        expect(r.avisos[0]).toMatch(/sem as colunas/);
    });
});

describe('ficha financeira com o histórico do SAGE', () => {
    const hol = (comp: string, sal: number): ResultadoCalculo => ({
        fichaId: 'f1', nome: 'BRUNO', competencia: comp, pagamento: '', situacao: 'calculado',
        verbas: [{ codigo: 'SAL', descricao: 'Salário', referencia: '30', tipo: 'provento', valor: sal, inss: true, irrf: true, fgts: true }],
        bases: { inss: sal, fgts: sal, irrf: sal }, totais: { proventos: sal, descontos: 0, liquido: sal }, fgts: Math.round(sal * 0.08), memoria: [], avisos: [], erros: [],
    } as unknown as ResultadoCalculo);
    const folhas: FolhaDoMes[] = [{ competencia: '2026-03', holerites: [hol('2026-03', 300000)] }];
    const historico: HistoricoSageAno[] = [
        { empresaId: 'E1', fichaId: 'f1', ano: '2026', nome: 'BRUNO', linhas: [
            { codigo: '1', descricao: 'SALARIO', tipo: 'provento', meses: [290000, 290000, 290000, ...Array(9).fill(null)] },
            { codigo: '901', descricao: 'INSS', tipo: 'desconto', meses: [23200, 23200, 23200, ...Array(9).fill(null)] },
            { codigo: '950', descricao: 'BASE INSS', tipo: 'informativo', meses: [290000, 290000, 290000, ...Array(9).fill(null)] },
        ] },
        { empresaId: 'E1', fichaId: 'f9', ano: '2026', nome: 'CARLA', linhas: [{ codigo: '1', descricao: 'SALARIO', tipo: 'provento', meses: [100000, ...Array(11).fill(null)] }] },
        { empresaId: 'E1', fichaId: 'f1', ano: '2025', nome: 'BRUNO', linhas: [{ codigo: '1', descricao: 'SALARIO', tipo: 'provento', meses: Array(12).fill(1) }] },
    ];

    it('a folha gravada vale no mês dela; o SAGE preenche os outros, com totais e líquido', () => {
        const fs = fichasFinanceiras('2026', folhas, undefined, historico);
        expect(fs.map(f => [f.nome, f.mesesComFolha, f.mesesSage])).toEqual([['BRUNO', [2], [0, 1]], ['CARLA', [], [0]]]);
        const b = fs[0];
        expect(b.linhas.map(x => [x.codigo, x.tipo, !!x.sage])).toEqual([
            ['SAL', 'provento', false], ['1', 'provento', true], ['901', 'desconto', true],
            ['', 'total', false], ['', 'total', false], ['', 'total', false],
            ['', 'base', false], ['', 'base', false], ['', 'base', false], ['', 'base', false], ['950', 'base', true],
        ]);
        // Março do SAGE some: a folha gravada vale.
        expect(b.linhas[1].meses.slice(0, 4)).toEqual([290000, 290000, null, null]);
        expect(b.linhas.find(x => x.descricao === 'Líquido')!.meses.slice(0, 4)).toEqual([266800, 266800, 300000, null]);
        expect(b.linhas.find(x => x.descricao === 'Base do INSS')!.meses.slice(0, 3)).toEqual([null, null, 300000]);
        expect(fichasFinanceiras('2026', folhas, 'f9', historico).map(f => f.nome)).toEqual(['CARLA']);
        expect(mesesSemFolha('2026', folhas, '2026-05', historico)).toEqual(['Abr', 'Mai']);
        const doc = fichaFinanceiraPdf(fs, '2026', { empresa: { razaoSocial: 'EMPRESA', cnpj: '11222333000181' }, titulo: 'Ficha financeira', previa: false }, 'obs', () => '');
        expect(doc.getNumberOfPages()).toBe(2);
    });
});
