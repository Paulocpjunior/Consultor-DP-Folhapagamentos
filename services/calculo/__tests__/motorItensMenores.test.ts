// Itens menores da auditoria do motor (10/2026): hora extra com outro adicional, suspensão no período aquisitivo,
// incidências de verbas do holerite, DSR em mês parcial, admissão em 29/02, arredondamento na rescisão e
// benefício sem salário no mês. Dados fictícios.
import { describe, expect, it } from 'vitest';
import { calcularMensal, valorHorasExtras, type Movimento } from '../motorMensal';
import { calcularRescisao, diasDeAviso } from '../motorRescisao';
import { periodosAquisitivos } from '../motorFerias';
import { classificarVerba, movimentoDoHolerite, type VerbaHolerite } from '../conferenciaHolerites';
import { classificarEvento, fatorHoraExtra } from '../movimentosDoBackup';
import { limparMovimento, validarMovimento } from '../movimento';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha = (dados: FichaFuncionario['dados'] = {}, extra: Partial<FichaFuncionario> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725',
    matriculaEsocial: 'M1', situacao: 'ativo', dados: { nome: 'ANA', admissao: '2024-01-02', salario: '2200.00', unidadeSalario: '5', horasSemanais: '44', horasMes: '220', categoria: '101', ...dados }, ...extra });
const af = (motivo: string, dtInicio: string, dtFim = ''): Afastamento => ({ ...afastamentoVazio(), id: `a${motivo}${dtInicio}`, fichaId: 'f1', motivo, dtInicio, dtFim });
const mensal = (competencia: string, movimento?: Movimento, f = ficha(), afastamentos: Afastamento[] = []) =>
    calcularMensal({ competencia, pagamento: competencia, ficha: f, tabelas: TAB, afastamentos, movimento, folhaPagaNoAdiantamento: null });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;
const verba = (descricao: string, provento: number, referencia = ''): VerbaHolerite => ({ codigo: '', descricao, referencia, provento, desconto: 0 }) as VerbaHolerite;

describe('hora extra com outro adicional', () => {
    it('na folha: salário-hora × (1 + adicional) × horas, com DSR; nas médias, pelo mesmo valor', () => {
        const r = mensal('2026-03', { horasExtrasPct: { '75': 10 } });
        expect(v(r, 'HE75')).toBe(17500); // 2.200 ÷ 220 = 10,00/h × 1,75 × 10
        expect(v(r, 'DSRHE')).toBeGreaterThan(0);
        expect(valorHorasExtras(10, { horasExtras50: 2, horasExtrasPct: { '60': 10 } })).toEqual({ valor: 30 + 160, horas: 12 });
    });

    it('movimento: limpa e valida (50% e 100% têm campo próprio)', () => {
        expect(limparMovimento({ horasExtrasPct: { '75': 10, '60': 0, x: 3 } as Record<string, number> })).toEqual({ horasExtrasPct: { '75': 10 } });
        expect(validarMovimento({ horasExtrasPct: { '50': 2 } })).toEqual(['Horas extras 50%: use o campo próprio de 50%.']);
        expect(validarMovimento({ horasExtrasPct: { '400': 2 } })[0]).toMatch(/inválido/);
    });

    it('holerite do IOB: "HE 75%" vira o adicional, "HE 150%" não vira 50%', () => {
        expect(classificarVerba(verba('HORAS EXTRAS 75%', 17500))).toBe('HEOUT');
        expect(classificarVerba(verba('H.E. 150%', 100))).toBe('HEOUT');
        expect(classificarVerba(verba('HORAS EXTRAS 50%', 100))).toBe('HE50');
        expect(movimentoDoHolerite({ verbas: [verba('HORAS EXTRAS 75%', 17500, '10,00')] } as never).movimento.horasExtrasPct).toEqual({ '75': 10 });
    });

    it('histórico do backup: vai como horas de 50% de mesmo valor (só serve às médias)', () => {
        expect(classificarEvento('1003', 'HORAS EXTRAS 75%')).toBe('horasExtras50');
        expect(fatorHoraExtra('HORAS EXTRAS 75%')).toBeCloseTo(1.75 / 1.5, 6);
        expect(fatorHoraExtra('HORAS EXTRAS 50%')).toBe(1);
        expect(classificarEvento('1003', 'H.E. 100%')).toBe('horasExtras100');
    });
});

describe('período aquisitivo', () => {
    it('licença não remunerada adia o fim pelos dias suspensos; suspensão disciplinar conta como falta', () => {
        const [p] = periodosAquisitivos('2025-01-01', '2026-06-30', 'f1', [af('21', '2025-03-01', '2025-03-31')], {}, []);
        expect([p.fim, p.suspensos]).toEqual(['2026-01-31', 31]);
        const [q] = periodosAquisitivos('2025-01-01', '2026-06-30', 'f1', [af('30', '2025-03-02', '2025-03-07')], {}, []);
        expect([q.fim, q.faltas, q.direito]).toEqual(['2025-12-31', 6, 24]);
    });

    it('admitido em 29/02: o período vai até 28/02 (não 27/02); o ano de aviso completa no aniversário', () => {
        const [p, p2] = periodosAquisitivos('2024-02-29', '2026-06-30', 'f1', [], {}, []);
        expect([p.fim, p2.inicio]).toEqual(['2025-02-28', '2025-03-01']);
        expect(diasDeAviso('2024-02-29', '2025-02-27')).toBe(30);
        expect(diasDeAviso('2024-02-29', '2025-02-28')).toBe(33);
    });
});

describe('verbas do holerite com incidência conhecida', () => {
    it('abono pecuniário isento; adiantamento do 13º só com FGTS; outro provento incide em tudo', () => {
        const { movimento } = movimentoDoHolerite({ verbas: [verba('ABONO PECUNIARIO', 50000), verba('ADIANT. 13 SALARIO', 110000), verba('GRATIFICACAO', 10000)] } as never);
        expect(movimento.lancamentos?.map(l => [l.inss, l.fgts, l.irrf])).toEqual([[false, false, false], [false, true, false], [true, true, true]]);
    });
});

describe('mês parcial, rescisão e benefício', () => {
    it('DSR das horas extras pelos dias do vínculo (admissão em 20/03)', () => {
        const r = mensal('2026-03', { horasExtras50: 10 }, ficha({ admissao: '2026-03-20' }));
        expect(r.verbas.find(x => x.codigo === 'DSRHE')?.referencia).toBe('2/10'); // 20 a 31/03/2026: 10 úteis (com os sábados), 2 domingos
    });

    it('rescisão desconta o arredondamento atual da folha passada', () => {
        const r = calcularRescisao({ ficha: ficha(), data: '2026-06-10', tipo: '07', aviso: 'nao-cumprido', afastamentos: [], tabelas: TAB, movimentos: { '2026-05': { arredondamentoFechado: 37 } } });
        expect(v(r, 'ARREDANT')).toBe(37);
    });

    it('sem salário no mês, o benefício não é descontado (aviso para cobrar à parte)', () => {
        const odonto = { id: 'od', nome: 'Odonto', tipo: 'desconto' as const, valor: 5000, inss: false, fgts: false, irrf: false, ativo: true };
        const f = ficha({}, { beneficios: [{ beneficioId: 'od', vidas: 1 }] });
        const r = calcularMensal({ competencia: '2026-04', pagamento: '2026-04', ficha: f, tabelas: TAB, afastamentos: [af('21', '2026-03-01')], beneficios: [odonto], folhaPagaNoAdiantamento: null });
        expect(v(r, 'BEN-od')).toBe(0);
        expect(r.avisos.join(' ')).toMatch(/Sem salário no mês: Odonto não foi lançado/);
    });
});
