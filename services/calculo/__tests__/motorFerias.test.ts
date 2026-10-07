import { describe, expect, it } from 'vitest';
import { calcularFerias, diasDeDireito, gozosNoMes, mesesDoPeriodo, periodosAquisitivos, type EntradaFerias } from '../motorFerias';
import { diasDsr } from '../motorMensal';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2024-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2024-01', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia(EMP), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const af = (a: Partial<Afastamento>): Afastamento => ({ ...afastamentoVazio(), id: `a-${a.dtInicio}`, fichaId: 'f1', motivo: '15', ...a });
const calc = (gozo: Partial<Afastamento>, p: Partial<EntradaFerias> = {}) => {
    const g = af(gozo);
    return calcularFerias({ ficha: ficha(), gozo: g, afastamentos: [g], tabelas: [INSS, IR], movimentos: {}, ...p });
};
const v = (r: ReturnType<typeof calcularFerias>, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('férias', () => {
    it('30 dias: férias + 1/3, INSS da competência, IRRF em separado, FGTS', () => {
        const r = calc({ dtInicio: '2025-07-01', dtFim: '2025-07-30' });
        expect(r.situacao).toBe('calculado');
        expect(r.periodo).toEqual({ inicio: '2024-01-02', fim: '2025-01-01', fimConcessivo: '2026-01-01' });
        expect(r.pagarAte).toBe('2025-06-29');
        expect(r.pagamento).toBe('2025-06');
        expect(v(r, 'FER')).toBe(300000);
        expect(v(r, 'FER13')).toBe(100000);
        expect(v(r, 'INSSFER')).toBe(37341); // 4.000: 113,85 + 114,83 + 144,73
        expect(v(r, 'IRRFFER')).toBe(11476); // (4.000 − 607,20) × 15% − 394,16
        expect(r.fgts).toBe(32000);
        expect(r.totais.liquido).toBe(400000 - 37341 - 11476);
        const semSimpl = calc({ dtInicio: '2025-07-01', dtFim: '2025-07-30' }, { opcoes: { simplificado: false, redutor: false } });
        expect(v(semSimpl, 'IRRFFER')).toBe(14983); // (4.000 − 373,41) × 15% − 394,16
    });

    it('gozo em duas competências: INSS por mês; abono pecuniário sem encargos', () => {
        const r = calc({ dtInicio: '2025-07-20', dtFim: '2025-08-08' }, { abonoDias: 10 });
        expect(r.porCompetencia).toEqual([
            { competencia: '2025-07', dias: 12, ferias: 120000, terco: 40000, inss: 12123, fgts: 12800 },
            { competencia: '2025-08', dias: 8, ferias: 80000, terco: 26667, inss: 8000, fgts: 8533 },
        ]);
        expect(v(r, 'INSSFER')).toBe(20123);
        expect(v(r, 'ABONO')).toBe(100000);
        expect(v(r, 'ABONO13')).toBe(33333);
        expect(r.bases.irrf).toBe(266667); // abono fora do IRRF
        expect(r.avisos.join(' ')).toContain('duas competências');
        expect(calc({ dtInicio: '2025-07-20', dtFim: '2025-08-08' }, { abonoDias: 11 }).erros[0]).toContain('o máximo é 1/3');
    });

    it('faltas reduzem o direito (art. 130) e o saldo limita o gozo', () => {
        expect([0, 5, 6, 14, 15, 23, 24, 32, 33].map(diasDeDireito)).toEqual([30, 30, 24, 24, 18, 18, 12, 12, 0]);
        const movimentos = { '2024-03': { faltasDias: 4 }, '2024-08': { faltasDias: 2 } };
        const r = calc({ dtInicio: '2025-07-01', dtFim: '2025-07-24' }, { movimentos });
        expect(r.direito).toBe(24);
        expect(r.situacao).toBe('calculado');
        expect(calc({ dtInicio: '2025-07-01', dtFim: '2025-07-30' }, { movimentos }).erros[0]).toContain('passa do saldo do período (24 de 24 dias)');
        // Segundo gozo do mesmo período desconta o primeiro
        const g1 = af({ dtInicio: '2025-03-03', dtFim: '2025-03-22', perAquisInicio: '2024-01-02' });
        const g2 = af({ dtInicio: '2025-07-01', dtFim: '2025-07-15', perAquisInicio: '2024-01-02' });
        const r2 = calcularFerias({ ficha: ficha(), gozo: g2, afastamentos: [g1, g2], tabelas: [INSS, IR], movimentos: {} });
        expect(r2.saldo).toBe(10);
        expect(r2.erros[0]).toContain('passa do saldo');
    });

    it('dobra depois do concessivo, sem INSS e FGTS na dobra', () => {
        const r = calc({ dtInicio: '2026-01-01', dtFim: '2026-01-30' });
        expect(r.diasDobra).toBe(29);
        expect(v(r, 'FERDOB')).toBe(290000);
        expect(v(r, 'FERDOB13')).toBe(96667);
        expect(r.bases.inss).toBe(400000);
        expect(r.bases.irrf).toBe(400000 + 290000 + 96667);
    });

    it('perde o direito com mais de 6 meses de INSS no período (art. 133)', () => {
        const gozo = af({ dtInicio: '2025-07-01', dtFim: '2025-07-30' });
        const doenca = af({ id: 'd', motivo: '03', dtInicio: '2024-02-01', dtFim: '2024-09-30' });
        const r = calcularFerias({ ficha: ficha(), gozo, afastamentos: [gozo, doenca], tabelas: [INSS, IR], movimentos: {} });
        expect(r.erros[0]).toContain('Período perdido: 02/01/2024 a 01/01/2025 (228 dias com benefício do INSS (CLT, art. 133, IV))');
        expect(r.erros[0]).toContain('O período atual (01/10/2024 a 30/09/2025) ainda não completou.');
    });

    it('média das horas extras do período aquisitivo ÷ 12', () => {
        const r = calc({ dtInicio: '2025-07-01', dtFim: '2025-07-30' }, { ficha: ficha({ salario: '2200.00' }), movimentos: { '2024-03': { horasExtras50: 10 }, '2025-03': { horasExtras50: 40 } } });
        const { uteis, descanso } = diasDsr('2024-03');
        const media = Math.round((15000 + Math.round(15000 / uteis * descanso)) / 12); // março/2025 fica fora do período
        expect(v(r, 'FER')).toBe(220000 + media);
    });

    it('erros e gozos do mês', () => {
        expect(calc({ dtInicio: '2025-07-01', dtFim: '' }).erros).toEqual(['Informe o início e o término das férias no afastamento.']);
        expect(calc({ dtInicio: '2024-06-01', dtFim: '2024-06-20' }).erros[0]).toContain('O período atual (02/01/2024 a 01/01/2025) ainda não completou. Férias antecipadas ou coletivas');
        expect(calc({ dtInicio: '2025-07-01', dtFim: '2025-07-30', motivo: '03' }).situacao).toBe('erro');
        const lista = [af({ dtInicio: '2025-07-20' }), af({ dtInicio: '2025-07-01' }), af({ dtInicio: '2025-08-01' }), af({ dtInicio: '2025-07-05', motivo: '03' }), { ...af({ dtInicio: '2025-07-02' }), fichaId: 'outra' }];
        expect(gozosNoMes(lista, new Set(['f1']), '2025-07').map(a => a.dtInicio)).toEqual(['2025-07-01', '2025-07-20']);
    });

    it('revisão do PR #54: período depois da perda, mês parcial, abonos anteriores e direito reduzido', () => {
        // Depois da perda, o novo período começa na volta (art. 133, § 2º)
        const doenca = af({ id: 'd', motivo: '03', dtInicio: '2024-02-01', dtFim: '2024-09-30' });
        const ps = periodosAquisitivos('2024-01-02', '2025-12-31', 'f1', [doenca], {}, []);
        expect(ps.map(x => [x.inicio, x.fim, !!x.perdido])).toEqual([['2024-01-02', '2025-01-01', true], ['2024-10-01', '2025-09-30', false], ['2025-10-01', '2026-09-30', false]]);
        const gozo = af({ dtInicio: '2025-11-03', dtFim: '2025-11-22', perAquisInicio: '2024-10-01' });
        const r = calcularFerias({ ficha: ficha(), gozo, afastamentos: [gozo, doenca], tabelas: [INSS, IR], movimentos: {} });
        expect(r.situacao).toBe('calculado');
        expect(r.periodo?.inicio).toBe('2024-10-01');
        const perdido = af({ dtInicio: '2025-11-03', dtFim: '2025-11-22', perAquisInicio: '2024-01-02' });
        expect(calcularFerias({ ficha: ficha(), gozo: perdido, afastamentos: [perdido, doenca], tabelas: [INSS, IR], movimentos: {} }).erros[0]).toContain('perdido');
        // Mês parcial do fim do período entra nas faltas
        expect(mesesDoPeriodo('2024-01-15', '2025-01-14')).toHaveLength(13);
        expect(mesesDoPeriodo('2024-01-01', '2024-12-31')).toHaveLength(12);
        expect(calc({ dtInicio: '2025-07-01', dtFim: '2025-07-24' }, { movimentos: { '2025-01': { faltasDias: 6 } } }).direito).toBe(24);
        // Abono vendido antes desconta do saldo
        const g1 = af({ dtInicio: '2025-03-03', dtFim: '2025-03-22', perAquisInicio: '2024-01-02', abonoDias: '10' });
        const g2 = af({ dtInicio: '2025-07-01', dtFim: '2025-07-10', perAquisInicio: '2024-01-02' });
        const r2 = calcularFerias({ ficha: ficha(), gozo: g2, afastamentos: [g1, g2], tabelas: [INSS, IR], movimentos: {} });
        expect(r2.saldo).toBe(0);
        expect(r2.erros[0]).toContain('30 já usados em gozos e abonos anteriores');
        // Abono gravado no afastamento entra no recibo
        const g3 = af({ dtInicio: '2025-07-01', dtFim: '2025-07-20', abonoDias: '10' });
        const r3 = calcularFerias({ ficha: ficha(), gozo: g3, afastamentos: [g3], tabelas: [INSS, IR], movimentos: {} });
        expect(r3.abonoDias).toBe(10);
        expect(v(r3, 'ABONO')).toBe(100000);
        // Direito reduzido (24) já gozado: o próximo gozo vai para o período seguinte
        const movimentos = { '2024-05': { faltasDias: 6 } };
        const a1 = af({ dtInicio: '2025-03-03', dtFim: '2025-03-26' });
        const a2 = af({ dtInicio: '2026-02-02', dtFim: '2026-02-21' });
        const r4 = calcularFerias({ ficha: ficha(), gozo: a2, afastamentos: [a1, a2], tabelas: [INSS, IR], movimentos });
        expect(r4.periodo?.inicio).toBe('2025-01-02');
        expect(r4.situacao).toBe('calculado');
    });
});

describe('férias com as tabelas oficiais de 2026 (conferido com o IOB)', () => {
    it('1200, 11/2026: 20 dias + 10 de abono sobre R$ 3.675,00 — INSS 280,60, IRRF zero pelo redutor, líquido 4.619,40', async () => {
        const { TABELAS_OFICIAIS_2026 } = await import('../../cadastros/tabelasOficiais');
        const g = af({ dtInicio: '2026-11-09', dtFim: '2026-11-28', abonoDias: '10' });
        const r = calcularFerias({ ficha: ficha({ admissao: '2025-10-30', salario: '3675.00' }), gozo: g, afastamentos: [g], tabelas: TABELAS_OFICIAIS_2026, movimentos: {} });
        expect(r.situacao).toBe('calculado');
        expect([v(r, 'FER'), v(r, 'FER13'), v(r, 'ABONO'), v(r, 'ABONO13')]).toEqual([245000, 81667, 122500, 40833]);
        expect(r.bases.inss).toBe(326667);
        expect(r.totais).toEqual({ proventos: 490000, descontos: 28060, liquido: 461940 });
        // IRRF informado mesmo sem retenção: 3.266,67 − simplificado 607,20 (maior que o INSS) = 2.659,47 × 7,5% − 182,16 = 17,30, zerado pelo redutor.
        expect(r.irrf).toMatchObject({ tributavel: 326667, usouSimplificado: true, base: 265947, aliquota: 7.5, calculado: 1730, redutor: 1730, devido: 0 });
        expect(r.irrf!.semRetencao).toMatch(/zerado pelo redutor de 2026/);
        expect(r.avisos.join(' ')).toMatch(/IRRF sobre férias sem retenção: imposto de R\$\s17,30 zerado pelo redutor/);
    });

    it('IRRF sem retenção: faixa isenta e dispensa até R$ 10,00 também geram aviso; com retenção, nenhum', async () => {
        const { TABELAS_OFICIAIS_2026 } = await import('../../cadastros/tabelasOficiais');
        const ferias = (salario: string, redutor = true) => {
            const g = af({ dtInicio: '2026-11-09', dtFim: '2026-12-08' });
            return calcularFerias({ ficha: ficha({ admissao: '2025-10-30', salario }), gozo: g, afastamentos: [g], tabelas: TABELAS_OFICIAIS_2026, movimentos: {}, opcoes: { simplificado: true, redutor } });
        };
        expect(ferias('1700.00').irrf!.semRetencao).toMatch(/faixa isenta/);
        expect(ferias('9000.00').irrf).toMatchObject({ semRetencao: '' });
        expect(ferias('9000.00').avisos.join(' ')).not.toMatch(/sem retenção/);
        expect(ferias('9000.00').irrf!.devido).toBeGreaterThan(0);
    });
});
