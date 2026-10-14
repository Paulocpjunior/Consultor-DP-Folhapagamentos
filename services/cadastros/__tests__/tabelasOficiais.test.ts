// Tabelas oficiais de 2026: válidas e conferidas contra o recibo do IOB.
import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026, oficiaisQueFaltam } from '../tabelasOficiais';
import { deducoesInss, inssProgressivo, validarTabela } from '../tabelasLegais';

describe('tabelas oficiais de 2026', () => {
    it('passam na validação da tela (com norma)', () => {
        for (const t of TABELAS_OFICIAIS_2026) expect(validarTabela(t), t.tipo).toEqual([]);
    });
    it('INSS: parcela a deduzir de cada faixa igual à da tabela publicada de 2026, e base × alíquota − parcela = progressivo', () => {
        const inss = TABELAS_OFICIAIS_2026.find(t => t.tipo === 'inss')!;
        expect(deducoesInss(inss)).toEqual([0, 2432, 11140, 19849]);
        // Pela fórmula da tabela (com a parcela de fração) dá o mesmo que faixa a faixa, até no teto (R$ 988,09).
        for (const base of [100000, 162100, 250000, 326667, 435427, 600000, 847555]) {
            const i = inss.faixas.findIndex(f => f.ate !== null && base <= f.ate);
            const f = inss.faixas[i];
            const pelaParcela = Math.round(base * f.aliquota / 100 - deducoesInss(inss)[i]);
            expect(Math.abs(pelaParcela - inssProgressivo(base, inss)), `base ${base}`).toBeLessThanOrEqual(1);
        }
        expect(inssProgressivo(847555, inss)).toBe(98809);
    });
    it('INSS: R$ 280,60 sobre R$ 3.266,67, como no recibo de férias do IOB (1200, 11/2026)', () => {
        const inss = TABELAS_OFICIAIS_2026.find(t => t.tipo === 'inss')!;
        expect(inssProgressivo(326667, inss)).toBe(28060);
    });
    it('só oferece o que falta (mesmo tipo e vigência)', () => {
        const ja = { ...TABELAS_OFICIAIS_2026[0], id: 'x' };
        expect(oficiaisQueFaltam([ja]).map(t => t.tipo)).toEqual(['irrf', 'salario_minimo', 'salario_familia']);
        expect(oficiaisQueFaltam(TABELAS_OFICIAIS_2026)).toEqual([]);
    });
});
