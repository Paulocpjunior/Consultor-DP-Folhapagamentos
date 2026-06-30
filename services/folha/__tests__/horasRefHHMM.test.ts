/**
 * horasRefHHMM.test.ts
 *
 * Rode com: npx vitest run services/folha/__tests__/horasRefHHMM.test.ts
 *
 * Cobre a conversão de hora para referência POSICIONAL HH,MM (convenção
 * Waldesa no IOB SAGE) — incluindo o bug de valores >= 24h, que antes saíam
 * errados (28:46 virava 1,2 porque extrairValor só multiplicava por 24 quando
 * a fração era < 1 dia).
 */

import { describe, it, expect } from 'vitest';
import { horasDeCelulaTempo, horasDecimalParaHHMM, chaveComparacaoHeader } from '../apontamentoParser';

// fração de dia do Excel a partir de h:m (como o SheetJS entrega a célula)
const f = (h: number, m: number) => (h * 3600 + m * 60) / 86400;
const refHHMM = (frac: number) => horasDecimalParaHHMM(horasDeCelulaTempo(frac) as number);

describe('chaveComparacaoHeader — casa grafias diferentes do mesmo campo', () => {
    it('iguala "H. E 60%" e "H.E 60%" (com/sem espaço após o ponto)', () => {
        expect(chaveComparacaoHeader('H. E 60%      811'))
            .toBe(chaveComparacaoHeader('H.E 60% 811'));
    });
    it('iguala NBSP e espaços múltiplos', () => {
        expect(chaveComparacaoHeader('ATRASOS  5850'))
            .toBe(chaveComparacaoHeader('ATRASOS  5850'));
    });
    it('mantém colunas distintas distintas', () => {
        expect(chaveComparacaoHeader('DSR 5651'))
            .not.toBe(chaveComparacaoHeader('DSR S/ COMISSÕES 1220'));
    });
});

describe('horasDeCelulaTempo', () => {
    it('número (fração de dia) → horas decimais, qualquer magnitude', () => {
        expect(horasDeCelulaTempo(f(1, 15))).toBeCloseTo(1.25, 5);
        expect(horasDeCelulaTempo(f(28, 46))).toBeCloseTo(28.766, 2); // >= 24h
        expect(horasDeCelulaTempo(f(6, 32))).toBeCloseTo(6.533, 2);
    });
    it('string "HH:MM[:SS]" → horas decimais', () => {
        expect(horasDeCelulaTempo('28:46:00')).toBeCloseTo(28.766, 2);
        expect(horasDeCelulaTempo('1:15')).toBeCloseTo(1.25, 5);
    });
    it('vazio → null', () => {
        expect(horasDeCelulaTempo('')).toBeNull();
        expect(horasDeCelulaTempo(null)).toBeNull();
    });
});

describe('referência posicional HH,MM (Waldesa) — valores reais 06/2026', () => {
    const casos: Array<[string, number, number]> = [
        ['Atraso 1:15', f(1, 15), 1.15],
        ['HE60 28:46 (>=24h)', f(28, 46), 28.46],
        ['HE60 6:32', f(6, 32), 6.32],
        ['HE60 0:24', f(0, 24), 0.24],
        ['HE60 0:41', f(0, 41), 0.41],
        ['HE60 0:12', f(0, 12), 0.12],
    ];
    for (const [nome, frac, esperado] of casos) {
        it(`${nome} → ${esperado}`, () => {
            expect(refHHMM(frac)).toBeCloseTo(esperado, 2);
        });
    }
});
