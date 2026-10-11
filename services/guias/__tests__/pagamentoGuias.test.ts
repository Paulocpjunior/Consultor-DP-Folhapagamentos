// Pagamento de guias: quais obrigações são guias, a baixa, a situação e o FGTS Digital (dados fictícios).
import { describe, expect, it } from 'vitest';
import { ehGuia, guiasDasObrigacoes, observacaoDaBaixa, resumoGuias, situacaoDaGuia, validarBaixa, valorPagoNoFgts, type BaixaGuia } from '../pagamentoGuias';
import { obrigacoesDaEmpresa } from '../../prazos/obrigacoesEmpresa';

const b = (x: Partial<BaixaGuia> = {}): BaixaGuia => ({ data: '2026-10-19', valorPago: 100000, autenticacao: 'AB12', fonte: 'manual', ...x });

describe('guias do calendário', () => {
    it('DARF, FGTS e as guias sindicais são guias; declarações e prazos não', () => {
        expect(['darf-2026-09', 'darf-13-2026', 'fgts-2026-09', 'sindical-anual-2026-03', 'sindical-patronal-2026-12', 'guia-11222333000181-2026-09'].every(ehGuia)).toBe(true);
        expect(['dctfweb-2026-09', 's1299-2026-09', 'salario-2026-09', 'reinf-2026-09', '13-1-2026-11'].some(ehGuia)).toBe(false);
        const dez = guiasDasObrigacoes(obrigacoesDaEmpresa({ competencia: '2026-12', temEmpregados: true })).map(o => o.id);
        expect(dez).toEqual(expect.arrayContaining(['darf-2026-12', 'fgts-2026-12', 'darf-13-2026', 'sindical-patronal-2026-12']));
        expect(dez).not.toContain('dctfweb-2026-12');
    });
});

describe('baixa', () => {
    const guia = { obrigacao: 'darf-2026-09', vencimento: '2026-10-20', valorDevido: 100000 };
    it('em dia e no valor: sem erro nem aviso', () => {
        expect(validarBaixa(b(), guia, '2026-10-21')).toEqual({ erros: [], avisos: [] });
    });
    it('erros: sem data, data futura, sem valor, autenticação longa', () => {
        expect(validarBaixa(b({ data: '' }), guia, '2026-10-21').erros.join()).toMatch(/data do pagamento/);
        expect(validarBaixa(b({ data: '2026-10-22' }), guia, '2026-10-21').erros.join()).toMatch(/não pode ser futura/);
        expect(validarBaixa(b({ valorPago: 0 }), guia, '2026-10-21').erros.join()).toMatch(/valor pago/);
        expect(validarBaixa(b({ autenticacao: 'x'.repeat(81) }), guia, '2026-10-21').erros.join()).toMatch(/80 caracteres/);
    });
    it('avisos: atraso com os acréscimos de cada guia e valor a menor', () => {
        const darf = validarBaixa(b({ data: '2026-10-23', valorPago: 90000 }), guia, '2026-10-23').avisos.join(' | ');
        expect(darf).toMatch(/Pago 3 dia\(s\) depois do vencimento \(20\/10\/2026\): multa de mora de 0,33% ao dia, até 20%, e juros pela Selic \(Lei 9\.430\/1996, art\. 61\)/);
        expect(darf).toMatch(/faltam R\$\s100,00 do valor devido \(R\$\s1\.000,00\)/);
        expect(validarBaixa(b({ data: '2026-10-21' }), { ...guia, obrigacao: 'fgts-2026-09' }, '2026-10-21').avisos.join()).toMatch(/Lei 8\.036\/1990, art\. 22/);
        expect(validarBaixa(b({ data: '2027-02-01' }), { obrigacao: 'sindical-patronal-2026-12', vencimento: '2027-01-29', valorDevido: 0 }, '2027-02-01').avisos.join()).toMatch(/CLT, art\. 600/);
        expect(validarBaixa(b({ valorPago: 1 }), { ...guia, valorDevido: 0 }, '2026-10-21').avisos).toEqual([]);
    });
    it('situação e texto da baixa', () => {
        expect(situacaoDaGuia('2026-10-20', undefined, '2026-10-19')).toBe('a-vencer');
        expect(situacaoDaGuia('2026-10-20', undefined, '2026-10-20')).toBe('vence-hoje');
        expect(situacaoDaGuia('2026-10-20', { valorDevido: 0, pagamento: null }, '2026-10-21')).toBe('vencida');
        expect(situacaoDaGuia('2026-10-20', { valorDevido: 100000, pagamento: b() }, '2026-10-21')).toBe('paga');
        expect(situacaoDaGuia('2026-10-20', { valorDevido: 100000, pagamento: b({ data: '2026-10-21' }) }, '2026-10-21')).toBe('paga-em-atraso');
        expect(situacaoDaGuia('2026-10-20', { valorDevido: 100000, pagamento: b({ valorPago: 5 }) }, '2026-10-21')).toBe('paga-a-menor');
        expect(observacaoDaBaixa(b({ fonte: 'fgts-digital' }))).toMatch(/^paga em 19\/10\/2026 · R\$\s1\.000,00 · aut\. AB12 · valor conferido no FGTS Digital$/);
        expect(observacaoDaBaixa(b({ autenticacao: ' ' }))).not.toMatch(/aut\./);
    });
    it('resumo da competência', () => {
        const r = resumoGuias([
            { vencimento: '2026-10-20', guia: { obrigacao: 'darf-2026-09', competencia: '2026-09', nome: 'DARF', vencimento: '2026-10-20', valorDevido: 100000, numeroDocumento: '', pagamento: b() } },
            { vencimento: '2026-10-20' },
            { vencimento: '2026-10-30' },
        ], '2026-10-21');
        expect(r).toEqual({ devido: 100000, pago: 100000, abertas: 2, vencidas: 1 });
    });
});

describe('FGTS Digital', () => {
    it('usa o recolhido (em reais) só com o devido quitado', () => {
        expect(valorPagoNoFgts({ ok: true, depositoDevido: 1234.56, depositoRealizado: 1234.56 })).toEqual({ valorPago: 123456, valorDevido: 123456 });
        expect(valorPagoNoFgts({ ok: true, depositoDevido: 0, depositoRealizado: 50 })).toEqual({ valorPago: 5000, valorDevido: 0 });
        expect(valorPagoNoFgts({ ok: true, depositoDevido: 100, depositoRealizado: 40 })).toMatchObject({ erro: expect.stringMatching(/R\$\s40,00 recolhidos de R\$\s100,00/) });
        expect(valorPagoNoFgts({ ok: true, depositoDevido: 100, depositoRealizado: 0 })).toMatchObject({ erro: expect.stringMatching(/não mostra recolhimento/) });
        expect(valorPagoNoFgts({ ok: false, depositoDevido: 0, depositoRealizado: 0 })).toMatchObject({ erro: expect.stringMatching(/não respondeu/) });
    });
});
