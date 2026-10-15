import { describe, expect, it } from 'vitest';
import { MESES, copiarTabelaDsr, diferencasDoCalendario, horasDsr, mesDaTabelaDsr, mesesAlterados, tabelaDsrPadrao, validarTabelaDsr, type TabelaDsr } from '../tabelaDsr';
import { calcularMensal } from '../../calculo/motorMensal';
import { fichaVazia, type FichaFuncionario } from '../funcionarios';
import type { TabelaLegal } from '../tabelasLegais';

// A tela do SAGE (Tabela para D.S.R., empresa 1200, 2026): dias úteis e domingos/feriados de cada mês.
const SAGE_2026: Record<string, [number, number]> = {
    '01': [26, 5], '02': [24, 4], '03': [26, 5], '04': [25, 5], '05': [25, 6], '06': [26, 4],
    '07': [27, 4], '08': [26, 5], '09': [25, 5], '10': [26, 5], '11': [24, 6], '12': [26, 5],
};
const tabelaSage = (): TabelaDsr => {
    const t = tabelaDsrPadrao('emp1', '2026');
    for (const m of MESES) t.meses[m] = { uteis: SAGE_2026[m][0], descanso: SAGE_2026[m][1] };
    return t;
};

describe('Tabela para D.S.R.', () => {
    it('cópia padrão de 2026 bate com o SAGE em 11 meses; em novembro o Consultor conta o 20/11 (Lei 14.759/2023)', () => {
        const t = tabelaDsrPadrao('emp1', '2026');
        for (const m of MESES.filter(x => x !== '11')) expect([t.meses[m].uteis, t.meses[m].descanso]).toEqual(SAGE_2026[m]);
        expect(t.meses['11']).toEqual({ uteis: 23, descanso: 7 }); // 5 domingos + Finados + Consciência Negra
        expect(validarTabelaDsr(t)).toEqual([]);
        expect(diferencasDoCalendario(tabelaSage())).toEqual([{ mes: '11', tabela: { uteis: 24, descanso: 6 }, calendario: { uteis: 23, descanso: 7 } }]);
    });

    it('Nº horas D.S.R. como o SAGE: domingos e feriados × 220 ÷ 30', () => {
        expect(horasDsr(5)).toBe(36.67);
        expect(horasDsr(4)).toBe(29.33);
        expect(horasDsr(6)).toBe(44);
    });

    it('valida: úteis + domingos/feriados = dias do mês, inteiros, ano AAAA', () => {
        const t = tabelaSage();
        t.meses['02'] = { uteis: 25, descanso: 4 };
        t.meses['03'] = { uteis: NaN, descanso: 5 };
        const e = validarTabelaDsr(t);
        expect(e).toContain('FEV: dias úteis (25) + domingos/feriados (4) devem somar os 28 dias do mês.');
        expect(e.some(x => x.startsWith('MAR:'))).toBe(true);
        expect(validarTabelaDsr({ ...tabelaSage(), ano: '26' })).toEqual(['Ano inválido (AAAA).']);
    });

    it('meses alterados (para travar os encerrados), cópia entre empresas e mês da competência', () => {
        const antes = tabelaSage();
        const depois = { ...antes, meses: { ...antes.meses, '11': { uteis: 23, descanso: 7 } } };
        expect(mesesAlterados(antes, depois)).toEqual(['11']);
        expect(mesesAlterados(null, depois)).toHaveLength(12);
        expect(mesesAlterados(antes, { ...antes, faltasPelosDiasDoMes: true })).toHaveLength(12);
        const copia = copiarTabelaDsr(antes, 'emp2');
        expect(copia.id).toBe('emp2_2026');
        expect(copia.meses).toEqual(antes.meses);
        expect(mesDaTabelaDsr([antes], '2026-11')).toEqual({ uteis: 24, descanso: 6 });
        expect(mesDaTabelaDsr([antes], '2025-11')).toBeNull();
    });
});

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2026-01', norma: 'Portaria Interministerial MPS/MF 13/2026', observacao: '', valores: {},
    faixas: [{ ate: 162100, aliquota: 7.5, deducao: 0 }, { ate: 290284, aliquota: 9, deducao: 0 }, { ate: 435427, aliquota: 12, deducao: 0 }, { ate: 847555, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei 15.191/2025', observacao: '',
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }],
    valores: { deducaoDependente: 18959, descontoSimplificado: 60720 } };
const ficha = (dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'emp1', cnpj: '11222333000181' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '2200.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const valor = (r: ReturnType<typeof calcularMensal>, c: string) => r.verbas.find(v => v.codigo === c)?.valor ?? 0;

describe('Tabela de DSR no motor mensal', () => {
    it('DSR das horas extras pelos dias da tabela no mês inteiro; sem ela, pelo calendário', () => {
        const base = { competencia: '2026-11', afastamentos: [], tabelas: [INSS, IR], ficha: ficha(), movimento: { horasExtras50: 10 } };
        // 10 h × R$ 10,00 × 1,5 = R$ 150,00
        const semTabela = calcularMensal(base);
        expect(valor(semTabela, 'DSRHE')).toBe(4565); // 150 ÷ 23 × 7
        const comTabela = calcularMensal({ ...base, tabelasDsr: [tabelaSage()] });
        expect(valor(comTabela, 'DSRHE')).toBe(3750); // 150 ÷ 24 × 6, como o SAGE
        expect(comTabela.verbas.find(v => v.codigo === 'DSRHE')?.referencia).toBe('6/24');
        expect(comTabela.memoria.join('\n')).toContain('Tabela de DSR da empresa de 2026');
        // Admitido no meio do mês: pelo calendário dos dias do vínculo.
        const parcial = calcularMensal({ ...base, ficha: ficha({ admissao: '2026-11-16' }), tabelasDsr: [tabelaSage()] });
        expect(parcial.verbas.find(v => v.codigo === 'DSRHE')?.referencia).not.toBe('6/24');
        expect(parcial.memoria.join('\n')).toContain('mês parcial: pelo calendário');
    });

    it('"Descontar faltas pelos dias do mês": dia = salário ÷ dias do mês; a outra opção avisa sem DSR descontado', () => {
        const base = { competencia: '2026-02', afastamentos: [], tabelas: [INSS, IR], ficha: ficha(), movimento: { faltasDias: 1 } };
        expect(valor(calcularMensal(base), 'FALTA')).toBe(7333); // 2.200 ÷ 30
        const t = { ...tabelaSage(), faltasPelosDiasDoMes: true, descontarDsrNaFalta: true };
        const r = calcularMensal({ ...base, tabelasDsr: [t] });
        expect(valor(r, 'FALTA')).toBe(7857); // 2.200 ÷ 28
        expect(r.memoria.join('\n')).toContain('÷ 28 dias do mês, pela Tabela de DSR');
        expect(r.avisos.join(' ')).toMatch(/DSR descontado \(dias\)/);
        const comDsr = calcularMensal({ ...base, movimento: { faltasDias: 1, dsrDescontadoDias: 1 }, tabelasDsr: [t] });
        expect(valor(comDsr, 'DSRF')).toBe(7857);
        expect(comDsr.avisos.join(' ')).not.toMatch(/DSR descontado \(dias\)/);
    });
});
