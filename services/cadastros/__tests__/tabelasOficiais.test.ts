// Tabelas oficiais de 2026: válidas e conferidas contra o recibo do IOB.
import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026, oficiaisQueFaltam } from '../tabelasOficiais';
import { inssProgressivo, validarTabela } from '../tabelasLegais';

describe('tabelas oficiais de 2026', () => {
    it('passam na validação da tela (com norma)', () => {
        for (const t of TABELAS_OFICIAIS_2026) expect(validarTabela(t), t.tipo).toEqual([]);
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
