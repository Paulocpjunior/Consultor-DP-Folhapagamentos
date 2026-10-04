import { describe, expect, it } from 'vitest';
import { avosDoAno, calcular13, com13, type Entrada13 } from '../motor13';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei 15.270/2025', observacao: '',
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }],
    valores: { deducaoDependente: 18959, descontoSimplificado: 60720, redutorAte: 500000, redutorMaximo: 31289, redutorLimite: 735000, redutorConstante: 97862, redutorCoeficiente: 133145 } };
const TABELAS = [INSS, IR];
const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia(EMP), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const afast = (a: Partial<Afastamento>): Afastamento => ({ ...afastamentoVazio(), id: 'a', fichaId: 'f1', ...a });
const calc = (p: Partial<Entrada13>) => calcular13({ ano: 2026, parcela: '2a', ficha: ficha(), afastamentos: [], tabelas: TABELAS, movimentos: {}, ...p });
const v = (r: ReturnType<typeof calcular13>, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('13º salário', () => {
    it('1ª parcela: metade, sem INSS e IRRF, com FGTS', () => {
        const r = calc({ parcela: '1a' });
        expect(r.pagamento).toBe('2026-11');
        expect(r.verbas.map(x => [x.codigo, x.valor])).toEqual([['13A', 150000]]);
        expect(r.fgts).toBe(12000);
        expect(r.totais.liquido).toBe(150000);
    });

    it('2ª parcela: integral − adiantamento − INSS do 13º − IRRF exclusivo (com o redutor)', () => {
        const r = calc({});
        expect(r.pagamento).toBe('2026-12');
        expect(v(r, '13')).toBe(300000);
        expect(v(r, '13ADT')).toBe(150000);
        expect(v(r, 'INSS13')).toBe(25341);
        expect(v(r, 'IRRF13')).toBe(0); // 23,83 zerado pelo redutor (13º até 5.000)
        expect(r.fgts).toBe(12000); // sobre 3.000 − 1.500
        expect(r.totais.liquido).toBe(300000 - 150000 - 25341);
        const semRedutor = calc({ opcoes: { simplificado: false, redutor: false } });
        expect(v(semRedutor, 'IRRF13')).toBe(2383); // (3.000 − 253,41) × 7,5% − 182,16
        const simpl = calc({ opcoes: { simplificado: true, redutor: false } });
        expect(v(simpl, 'IRRF13')).toBe(0); // 3.000 − 607,20 = 2.392,80: isento
        expect(r.avisos.join(' ')).toContain('SEM desconto simplificado e COM o redutor');
    });

    it('salário alto: IRRF sem redutor acima de 7.350; 1ª parcela informada', () => {
        const r = calc({ ficha: ficha({ salario: '8000.00' }), primeiraPaga: 350000 });
        const inss = v(r, 'INSS13');
        expect(inss).toBe(92960);
        expect(v(r, 'IRRF13')).toBe(Math.round((800000 - inss) * 0.275) - 90873);
        expect(v(r, '13ADT')).toBe(350000);
        expect(r.bases.fgts).toBe(450000);
    });

    it('avos: 15 dias contam, doença pelo INSS e faltas tiram, maternidade conta', () => {
        expect(avosDoAno(2026, ficha({ admissao: '2026-03-20' }), [], {}).filter(m => m.conta)).toHaveLength(9);
        expect(avosDoAno(2026, ficha({ admissao: '2026-03-17' }), [], {}).filter(m => m.conta)).toHaveLength(10);
        const doenca = avosDoAno(2026, ficha(), [afast({ dtInicio: '2026-06-01', dtFim: '2026-07-31', motivo: '03' })], {});
        expect(doenca.find(m => m.competencia === '2026-06')).toMatchObject({ dias: 15, conta: true });
        expect(doenca.find(m => m.competencia === '2026-07')).toMatchObject({ dias: 0, conta: false, motivo: 'INSS' });
        const faltas = avosDoAno(2026, ficha(), [], { '2026-02': { faltasDias: 14 } });
        expect(faltas.find(m => m.competencia === '2026-02')).toMatchObject({ dias: 14, conta: false, motivo: '14 falta(s)' });
        expect(avosDoAno(2026, ficha(), [afast({ dtInicio: '2026-01-10', dtFim: '2026-05-09', motivo: '17' })], {}).filter(m => m.conta)).toHaveLength(12);
        const proporcional = calc({ ficha: ficha({ admissao: '2026-03-20' }) });
        expect(v(proporcional, '13')).toBe(225000);
        expect(proporcional.memoria.join(' ')).toContain('Avos: 9/12');
    });

    it('média de horas extras dos movimentos antes do pagamento, com DSR, pela hora atual', () => {
        const movimentos = { '2026-03': { horasExtras50: 10 }, '2026-09': { horasExtras50: 10 }, '2026-12': { horasExtras50: 50 } };
        const r = calc({ ficha: ficha({ salario: '2200.00' }), movimentos });
        // março 150 + DSR 28,85; setembro 150 + DSR 30,00; dezembro fica fora; ÷ 11 meses (jan–nov)
        expect(v(r, '13')).toBe(220000 + Math.round((17885 + 18000) / 11));
        const primeira = calc({ parcela: '1a', ficha: ficha({ salario: '2200.00' }), movimentos });
        expect(v(primeira, '13A')).toBe(Math.round((220000 + Math.round(35885 / 10)) / 2)); // jan–out
        // A 2ª desconta a 1ª de novembro (média jan–out), não a metade do 13º final
        expect(v(r, '13ADT')).toBe(v(primeira, '13A'));
    });

    it('erros e quem tem 13º no ano', () => {
        expect(calc({ ficha: ficha({ dataDesligamento: '2026-10-15' }) }).erros[0]).toContain('pago na rescisão');
        expect(calc({ ficha: ficha({ admissao: '2027-01-05' }) }).situacao).toBe('erro');
        expect(calc({ ficha: ficha({ admissao: '2026-12-20' }) }).erros).toEqual(['Nenhum avo no ano (nenhum mês com 15 dias ou mais trabalhados).']);
        expect(calc({ tabelas: [IR] }).situacao).toBe('erro');
        expect(calc({ ficha: ficha({ categoria: '103', salario: '1000.00' }), parcela: '1a' }).fgts).toBe(1000);
        const fs = [ficha(), { ...ficha({ dataDesligamento: '2026-06-30' }), id: 'f2' }, { ...ficha({ admissao: '2027-02-01' }), id: 'f3' }];
        expect(com13(fs, 2026).map(f => f.id)).toEqual(['f1']);
    });
});
