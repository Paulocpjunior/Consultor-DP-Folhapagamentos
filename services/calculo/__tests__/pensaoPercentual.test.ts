// Pensão alimentícia em % (a fórmula do SAGE: percentual sobre o bruto menos o INSS) no 13º, nas férias e na rescisão.
import { describe, expect, it } from 'vitest';
import { calcular13 } from '../motor13';
import { calcularFerias } from '../motorFerias';
import { calcularRescisao } from '../motorRescisao';
import { percentualDaPensao } from '../motorMensal';
import { fichaVazia } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';

const tabelas = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `o${i}` }));
const ficha = (dados = {}) => ({ ...fichaVazia({ id: 'e', cnpj: '11222333000181' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo' as const,
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;
const movs = { '2026-10': { pensaoPercentual: 33 } };

describe('pensão em %', () => {
    it('vale o percentual do mês ou do último mês que informou; um valor fixo depois encerra', () => {
        expect(percentualDaPensao(movs, '2026-12')).toEqual({ pct: 33, competencia: '2026-10' });
        expect(percentualDaPensao({ ...movs, '2026-11': { pensaoAlimenticia: 50000 } }, '2026-12')).toBeNull();
        expect(percentualDaPensao(movs, '2026-09')).toBeNull();
    });

    it('13º: 1ª parcela pelo percentual; na 2ª, % de (integral − INSS) menos o que a 1ª descontou', () => {
        const p1 = calcular13({ ano: 2026, parcela: '1a', pagamento: '2026-11', ficha: ficha(), afastamentos: [], tabelas, movimentos: movs });
        expect(v(p1, 'PENSAO13')).toBe(Math.round(v(p1, '13A') * 0.33));
        const p2 = calcular13({ ano: 2026, parcela: '2a', pagamento: '2026-12', ficha: ficha(), afastamentos: [], tabelas, movimentos: movs });
        const total = Math.round((v(p2, '13') - v(p2, 'INSS13')) * 0.33);
        const naPrimeira = Math.round(v(p2, '13ADT') * 0.33);
        expect(v(p2, 'PENSAO13')).toBe(total - naPrimeira);
        expect(p2.memoria.join('\n')).toContain('descontados na 1ª parcela');
        // A pensão das duas parcelas deduz no IRRF do 13º.
        expect(p2.deducoesIrrf?.pensao).toBe(total);
        // Valor informado no movimento vale sobre o percentual.
        const fixo = calcular13({ ano: 2026, parcela: '2a', pagamento: '2026-12', ficha: ficha(), afastamentos: [], tabelas, movimentos: { ...movs, '2026-12': { pensao13: 10000 } } });
        expect(v(fixo, 'PENSAO13')).toBe(10000);
    });

    it('férias: % de (férias + 1/3 − INSS); a pensão informada no recibo vale sobre o percentual', () => {
        const gozo: Afastamento = { ...afastamentoVazio(), id: 'g', fichaId: 'f1', motivo: '15', dtInicio: '2026-11-03', dtFim: '2026-12-02', perAquisInicio: '2025-01-02' };
        const r = calcularFerias({ ficha: ficha(), gozo, afastamentos: [gozo], tabelas, movimentos: movs });
        const base = r.bases.inss - v(r, 'INSSFER');
        expect(v(r, 'PENSAOFER')).toBe(Math.round(base * 0.33));
        expect(calcularFerias({ ficha: ficha(), gozo, afastamentos: [gozo], tabelas, movimentos: movs, pensao: 5000 }).verbas.find(x => x.codigo === 'PENSAOFER')?.valor).toBe(5000);
    });

    it('rescisão: saldo de salário (pelo mês) e 13º pelo percentual, com o aviso das verbas indenizadas', () => {
        const r = calcularRescisao({ ficha: ficha(), data: '2026-10-14', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas, movimentos: movs });
        expect(v(r, 'PENSAO')).toBeGreaterThan(0);
        const prop = v(r, '13PROP') + v(r, '13IND');
        expect(v(r, 'PENSAO13')).toBe(Math.round((prop - v(r, 'INSS13')) * 0.33));
        expect(r.avisos.join()).toMatch(/férias indenizadas ou o aviso prévio indenizado/);
    });
});
