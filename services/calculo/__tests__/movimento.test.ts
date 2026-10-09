import { describe, expect, it } from 'vitest';
import { idMovimento, limparMovimento, mesmoMovimento, movimentoVazio, validarMovimento } from '../movimento';

const lanc = (descricao: string, valor: number) => ({ descricao, tipo: 'provento' as const, valor, inss: true, fgts: true, irrf: true });

describe('movimento do mês', () => {
    it('limpa zeros, vazios e lançamentos em branco; arredonda', () => {
        expect(limparMovimento({ horasExtras50: 0, faltasDias: 1, horasExtras100: 2.345, pensaoAlimenticia: 10000.4, lancamentos: [lanc('  Prêmio   anual ', 5000), lanc('', 0)] }))
            .toEqual({ horasExtras100: 2.345, faltasDias: 1, pensaoAlimenticia: 10000, lancamentos: [lanc('Prêmio anual', 5000)] });
        expect(movimentoVazio({ horasExtras50: 0, lancamentos: [lanc(' ', 0)] })).toBe(true);
        expect(movimentoVazio(undefined)).toBe(true);
        expect(movimentoVazio({ feriadosLocais: 1 })).toBe(false);
    });

    it('compara sem ligar para a ordem nem para campos zerados', () => {
        expect(mesmoMovimento({ faltasDias: 1, horasExtras50: 2 }, { horasExtras50: 2, faltasDias: 1, horasExtras100: 0 })).toBe(true);
        expect(mesmoMovimento({}, undefined)).toBe(true);
        expect(mesmoMovimento({ faltasDias: 1 }, { faltasDias: 2 })).toBe(false);
    });

    it('valida limites e lançamentos', () => {
        expect(validarMovimento({ horasExtras50: 10, faltasDias: 2 }, 30)).toEqual([]);
        expect(validarMovimento({ faltasDias: 31 }, 30)).toEqual(['Faltas (dias): no máximo 30.']);
        expect(validarMovimento({ horasExtras50: 301, feriadosLocais: -1 })).toEqual(['Horas extras 50%: no máximo 300.', 'Feriados locais no mês: não pode ser negativo.']);
        expect(validarMovimento({ lancamentos: [lanc('', 100), lanc('Prêmio', 0)] })).toEqual(['Lançamento 1: informe a descrição.', 'Lançamento 2 (Prêmio): informe um valor maior que zero.']);
        expect(idMovimento('emp1_52998224725_M1', '2026-09')).toBe('emp1_52998224725_M1_2026-09');
    });
});
