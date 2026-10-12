// Pagamento de guias: quais obrigações são guias, a baixa, a situação e o FGTS Digital (dados fictícios).
import { describe, expect, it } from 'vitest';
import {
    baixaPelaReceita, conferenciaNaReceita, ehGuia, guiasDasObrigacoes, numeroDoDocumento, numerosParaConferir, observacaoDaBaixa, resumoGuias, situacaoDaGuia, validarBaixa, valorPagoNoFgts,
    type BaixaGuia, type ConsultaPagamentosReceita,
} from '../pagamentoGuias';
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

describe('DARF pago conferido na Receita (PAGTOWEB pelo CFI)', () => {
    const pag = { numeroDocumento: '07202625273123456', dataArrecadacao: '2026-10-21', valorTotal: 1020.5, valorPrincipal: 1000, valorMulta: 6.6, valorJuros: 13.9 };
    const r = (x: Partial<ConsultaPagamentosReceita> = {}): ConsultaPagamentosReceita => ({
        ok: true, fonte: 'serpro', situacoes: [{ numeroDocumento: '07202625273123456', localizado: true, pagamento: pag }], ...x,
    });

    it('data de arrecadação e valor total pago viram a baixa, com multa e juros no detalhe', () => {
        const b = baixaPelaReceita(r(), '07.20.26252.7312345-6');
        expect(b).toMatchObject({ data: '2026-10-21', valorPago: 102050 });
        expect('detalhe' in b && b.detalhe).toMatch(/R\$\s1\.020,50 arrecadados em 21\/10\/2026 \(multa R\$\s6,60, juros R\$\s13,90\)/);
    });

    it('não localizado não é "não pago": a baixa continua manual com o motivo do CFI', () => {
        const nl = r({ situacoes: [{ numeroDocumento: '07202625273123456', localizado: false, pagamento: null, observacao: 'Não localizado no PAGTOWEB. A arrecadação leva alguns dias para aparecer; isto não quer dizer que não foi pago.' }] });
        expect(baixaPelaReceita(nl, '07202625273123456')).toMatchObject({ erro: expect.stringMatching(/não quer dizer que não foi pago/) });
    });

    it('ausente não vira zero: sem data ou sem valor, não preenche', () => {
        const semData = r({ situacoes: [{ numeroDocumento: '07202625273123456', localizado: true, pagamento: { ...pag, dataArrecadacao: null } }] });
        expect(baixaPelaReceita(semData, '07202625273123456')).toMatchObject({ erro: expect.stringMatching(/data de arrecadação/) });
        const semValor = r({ situacoes: [{ numeroDocumento: '07202625273123456', localizado: true, pagamento: { ...pag, valorTotal: null } }] });
        expect(baixaPelaReceita(semValor, '07202625273123456')).toMatchObject({ erro: expect.stringMatching(/valor pago/) });
    });

    it('recusa resposta simulada, erro do CFI, documento que não veio e número inválido', () => {
        expect(baixaPelaReceita(r({ ok: false, fonte: 'dry_run', error: 'modo simulado' }), '07202625273123456')).toMatchObject({ erro: 'modo simulado' });
        expect(baixaPelaReceita(r({ fonte: 'mock' }), '07202625273123456')).toMatchObject({ erro: expect.stringMatching(/modo mock/) });
        expect(baixaPelaReceita(r({ situacoes: [] }), '07202625273123456')).toMatchObject({ erro: expect.stringMatching(/não traz este documento/) });
        expect(baixaPelaReceita(r(), '')).toMatchObject({ erro: expect.stringMatching(/número do documento/) });
        expect(numeroDoDocumento('123456789012345678')).toBeNull();
    });

    it('a baixa conferida na Receita diz de onde veio', () => {
        expect(observacaoDaBaixa(b({ fonte: 'receita', autenticacao: '' }))).toMatch(/^paga em 19\/10\/2026 · R\$\s1\.000,00 · pagamento conferido na Receita$/);
    });
});

describe('conferência em lote dos DARF na Receita', () => {
    const guia = (obrigacao: string, numeroDocumento: string, pagamento: BaixaGuia | null = null) =>
        ({ obrigacao, competencia: '2026-09', nome: obrigacao, vencimento: '2026-10-20', valorDevido: 100000, numeroDocumento, pagamento });
    const pag = (n: string, data: string, valor: number) => ({ numeroDocumento: n, localizado: true, pagamento: { numeroDocumento: n, dataArrecadacao: data, valorTotal: valor, valorPrincipal: valor, valorMulta: null, valorJuros: null } });
    const itens = [
        { obrigacao: 'darf-2026-09', nome: 'DARF da folha', guia: guia('darf-2026-09', '07.0001') },
        { obrigacao: 'darf-13-2026', nome: 'DARF do 13º', guia: guia('darf-13-2026', '070002', b({ data: '2026-10-19', valorPago: 100000 })) },
        { obrigacao: 'darf-x-2026', nome: 'DARF com baixa diferente', guia: guia('darf-x-2026', '070003', b({ data: '2026-10-18', valorPago: 90000 })) },
        { obrigacao: 'darf-y-2026', nome: 'DARF não localizado', guia: guia('darf-y-2026', '070004') },
        { obrigacao: 'darf-z-2026', nome: 'DARF sem número', guia: guia('darf-z-2026', '') },
        { obrigacao: 'fgts-2026-09', nome: 'FGTS', guia: guia('fgts-2026-09', '999') },
    ];
    const r: ConsultaPagamentosReceita = { ok: true, fonte: 'serpro', situacoes: [
        pag('070001', '2026-10-20', 1000), pag('070002', '2026-10-19', 1000), pag('070003', '2026-10-19', 1000),
        { numeroDocumento: '070004', localizado: false, pagamento: null, observacao: 'Não localizado no PAGTOWEB.' },
    ] };

    it('só os DARF com número entram na consulta, sem repetir; FGTS fica de fora', () => {
        expect(numerosParaConferir(itens)).toEqual(['070001', '070002', '070003', '070004']);
    });

    it('baixa pronta, confere, diverge, não localizado e sem número', () => {
        const l = conferenciaNaReceita(itens, r);
        expect(l.map(x => [x.obrigacao, x.estado])).toEqual([
            ['darf-2026-09', 'baixar'], ['darf-13-2026', 'confere'], ['darf-x-2026', 'diverge'], ['darf-y-2026', 'nao-localizado'], ['darf-z-2026', 'sem-numero'],
        ]);
        expect(l[0].baixa).toEqual({ data: '2026-10-20', valorPago: 100000, autenticacao: '', fonte: 'receita' });
        expect(l[2].motivo).toMatch(/data: baixa 18\/10\/2026, Receita 19\/10\/2026; valor: baixa R\$\s900,00, Receita R\$\s1\.000,00/);
        expect(l[3].baixa).toBeNull();
    });

    it('localizado sem data ou valor não propõe baixa', () => {
        const semValor: ConsultaPagamentosReceita = { ok: true, fonte: 'serpro', situacoes: [{ ...pag('070001', '2026-10-20', 1000), pagamento: { ...pag('070001', '2026-10-20', 1000).pagamento, valorTotal: null } }] };
        const [l] = conferenciaNaReceita([itens[0]], semValor);
        expect(l).toMatchObject({ estado: 'incompleto', baixa: null });
    });
});

