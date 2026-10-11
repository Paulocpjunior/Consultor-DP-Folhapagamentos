import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { apurarIrrf, calcularMensal, type Movimento, type ResultadoCalculo } from '../motorMensal';
import { inssDetalhado } from '../tributos';
import { calcularComplementar, diferencasDoReajuste, mesesEntre, sugestaoDaConvencao, totaisComplementar, validarComplementar, type EntradaComplementar } from '../complementar';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const INSS = TAB.find(t => t.tipo === 'inss')!;
const IRRF = TAB.find(t => t.tipo === 'irrf')!;
const ficha = (id: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: id.toUpperCase(), situacao: 'ativo',
    dados: { nome: id.toUpperCase(), admissao: '2025-03-10', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const mes = (f: FichaFuncionario, competencia: string, movimento: Movimento = {}, tabelas = TAB): ResultadoCalculo =>
    calcularMensal({ competencia, pagamento: competencia, ficha: f, afastamentos: [], tabelas, movimento });
const CCT = { tpAcConv: 'C' as const, dtAcConv: '2026-04-10', dsc: 'Convenção coletiva dos comerciários 2026/2027' };
const entrada = (fichas: FichaFuncionario[], x: Partial<EntradaComplementar> = {}): EntradaComplementar => ({
    perApur: '2026-04', pagamento: '2026-04', instrumento: CCT, reajuste: { pct: 5, de: '2026-01', ate: '2026-03' }, fichas,
    gravadas: Object.fromEntries(['2026-01', '2026-02', '2026-03'].map(c => [c, fichas.map(f => mes(f, c))])),
    folhaDoMes: fichas.map(f => mes(f, '2026-04')), tabelas: TAB, ...x,
});

describe('validação da complementar', () => {
    const base = { perApur: '2026-04', pagamento: '2026-04', instrumento: CCT, reajuste: { pct: 5, de: '2026-01', ate: '2026-03' } };
    it('aceita a convenção com data, descrição e meses anteriores', () => expect(validarComplementar(base)).toEqual([]));
    it('exige a data nos tipos A a E e recusa data depois da competência', () => {
        expect(validarComplementar({ ...base, instrumento: { ...CCT, dtAcConv: '' } })).toContain('Informe a data da celebração ou da publicação do instrumento.');
        expect(validarComplementar({ ...base, instrumento: { ...CCT, dtAcConv: '2026-05-02' } }).join(' ')).toMatch(/depois da competência/);
        expect(validarComplementar({ ...base, instrumento: { tpAcConv: 'J', dsc: 'x' } })).toEqual([]);
    });
    it('tipos ainda não gerados, descrição e reajuste fora do período', () => {
        expect(validarComplementar({ ...base, instrumento: { tpAcConv: 'E', dtAcConv: '2026-04-01', dsc: 'x' } }).join(' ')).toMatch(/Tipo E .* ainda não gera/);
        expect(validarComplementar({ ...base, instrumento: { ...CCT, dsc: ' ' } }).join(' ')).toMatch(/Descreva o instrumento/);
        expect(validarComplementar({ ...base, instrumento: { ...CCT, dsc: 'x'.repeat(256) } }).join(' ')).toMatch(/255/);
        expect(validarComplementar({ ...base, reajuste: { pct: 5, de: '2026-01', ate: '2026-04' } }).join(' ')).toMatch(/mês anterior a/);
        expect(validarComplementar({ ...base, reajuste: { pct: 0, de: '2026-01', ate: '2026-03' } }).join(' ')).toMatch(/Percentual/);
        expect(validarComplementar({ ...base, reajuste: undefined })).toContain('Informe o reajuste retroativo ou lance as diferenças.');
        expect(validarComplementar({ ...base, pagamento: '2026-03' }).join(' ')).toMatch(/antes da competência/);
    });
    it('lançamentos: mês anterior, valor e descrição do avulso', () => {
        const l = { fichaId: 'ana', perRef: '2026-04', codigo: 'LAN', descricao: '', tipo: 'provento' as const, valor: 0, inss: true, fgts: true, irrf: true };
        const e = validarComplementar({ ...base, reajuste: undefined, lancamentos: [l] }).join(' ');
        expect(e).toMatch(/anterior a/); expect(e).toMatch(/informe o valor/); expect(e).toMatch(/descreva o lançamento avulso/);
    });
    it('meses entre duas competências', () => expect(mesesEntre('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']));
});

describe('reajuste retroativo sobre as folhas gravadas', () => {
    it('diferença do salário mês a mês, INSS pela tabela de cada mês, FGTS e IRRF somado à folha do mês', () => {
        const ana = ficha('ana');
        const e = entrada([ana]);
        const { resultados, erros } = calcularComplementar(e);
        expect(erros).toEqual([]);
        const r = resultados[0];
        expect(r.situacao).toBe('calculado');
        expect(r.meses.map(m => m.perRef)).toEqual(['2026-01', '2026-02', '2026-03']);
        const sal = r.meses[0].verbas.find(v => v.codigo === 'SAL')!;
        expect([sal.valor, sal.descricao, sal.inss, sal.fgts, sal.irrf]).toEqual([15000, 'Diferença de salário', true, true, true]);
        const inssMes = inssDetalhado(315000, INSS).valor - inssDetalhado(300000, INSS).valor;
        expect(r.meses.map(m => m.inss)).toEqual([inssMes, inssMes, inssMes]);
        expect(r.meses[0].verbas.find(v => v.codigo === 'INSS')!.descricao).toBe('INSS sobre as diferenças de 01/2026');
        expect(r.fgts).toBe(3600);
        // IRRF: a folha de 04/2026 paga no mês + as diferenças, menos o IRRF da folha.
        const folha = e.folhaDoMes![0].irrfApurado!;
        const a = apurarIrrf(IRRF, folha.rendimentos + 45000, folha.deducoesLegais + 3 * inssMes);
        const ir = Math.max(0, a.valor - folha.valor);
        expect(r.irrfApurado).toEqual({ rendimentos: 45000, deducoesLegais: 3 * inssMes, valor: ir > 1000 ? ir : 0 });
        expect(r.totais.proventos).toBe(45000);
        expect(r.totais.liquido).toBe(45000 - 3 * inssMes - (r.irrfApurado!.valor));
        // O IRRF vai no último mês de referência; nas verbas do holerite, cada linha leva o mês.
        if (r.irrfApurado!.valor) expect(r.meses[2].verbas.at(-1)!.codigo).toBe('IRRF');
        expect(r.verbas[0].referencia).toBe('01/2026 · 5% de R$ 3.000,00');
        expect(r.memoria.join(' ')).toMatch(/Convenção Coletiva de Trabalho: Convenção coletiva dos comerciários 2026\/2027 \(10\/04\/2026\)/);
        const tot = totaisComplementar(resultados);
        expect([tot.funcionarios, tot.proventos, tot.fgts, tot.inss]).toEqual([1, 45000, 3600, 3 * inssMes]);
    });
    it('salário alto: IRRF somado à folha na faixa de 27,5%', () => {
        const bia = ficha('bia', { salario: '9000.00' });
        const { resultados } = calcularComplementar(entrada([bia]));
        const r = resultados[0];
        expect(r.irrfApurado!.valor).toBeGreaterThan(0);
        expect(r.verbas.find(v => v.codigo === 'IRRF')!.referencia).toMatch(/27,5%$/);
        // Acima do teto do INSS a diferença não tem INSS.
        expect(r.meses.every(m => m.inss === 0)).toBe(true);
    });
    it('horas extras, DSR e faltas acompanham; férias do mês passam a ter IRRF', () => {
        const h = mes(ficha('ana'), '2026-02', { horasExtras50: 10, faltasDias: 1 });
        const d = diferencasDoReajuste({ ...h, verbas: [...h.verbas, { codigo: 'FERMES', descricao: 'Férias do mês (pagas no recibo)', referencia: '', tipo: 'provento', valor: 100000, inss: true, fgts: true, irrf: false }, { codigo: 'INSALUB', descricao: 'Insalubridade', referencia: '', tipo: 'provento', valor: 32420, inss: true, fgts: true, irrf: true }] }, 10);
        expect(d.verbas.map(v => v.codigo)).toEqual(['SAL', 'HE50', 'DSRHE', 'FALTA', 'FERMES']);
        expect(d.verbas.find(v => v.codigo === 'FALTA')!.tipo).toBe('desconto');
        expect(d.verbas.find(v => v.codigo === 'FERMES')!.irrf).toBe(true);
        expect(d.avisos[0]).toMatch(/Insalubridade em 02\/2026 não reajustada/i);
    });
    it('aprendiz: FGTS de 2%', () => {
        const { resultados } = calcularComplementar(entrada([ficha('caio', { categoria: '103', salario: '1000.00' })]));
        expect(resultados[0].fgts).toBe(Math.round(5000 * 0.02) * 3);
    });
    it('mês sem folha gravada: aviso geral, e o 13º quando abrange dezembro', () => {
        const ana = ficha('ana');
        const e = entrada([ana], { gravadas: { '2026-02': [mes(ana, '2026-02')] } });
        const { resultados, avisos } = calcularComplementar(e);
        expect(resultados[0].meses.map(m => m.perRef)).toEqual(['2026-02']);
        expect(avisos[0]).toMatch(/Sem folha gravada em 01\/2026, 03\/2026/i);
    });
    it('sem a folha do mês: IRRF da complementar sozinho, com aviso', () => {
        const { resultados } = calcularComplementar(entrada([ficha('bia', { salario: '9000.00' })], { folhaDoMes: [] }));
        expect(resultados[0].avisos.join(' ')).toMatch(/IRRF da complementar foi calculado sozinho/);
    });
});

describe('RRA e lançamentos', () => {
    const TAB25 = [...TAB, { ...INSS, id: 'inss25', vigencia: '2025-01' }, { ...IRRF, id: 'irrf25', vigencia: '2025-01' }];
    it('diferenças de ano anterior ao do pagamento são RRA: sem IRRF e incompleto', () => {
        const ana = ficha('ana', { admissao: '2025-01-02' });
        const e = entrada([ana], {
            perApur: '2026-01', pagamento: '2026-01', instrumento: { ...CCT, dtAcConv: '2026-01-15' }, reajuste: { pct: 5, de: '2025-11', ate: '2025-12' }, tabelas: TAB25,
            gravadas: { '2025-11': [mes(ana, '2025-11', {}, TAB25)], '2025-12': [mes(ana, '2025-12', {}, TAB25)] }, folhaDoMes: [mes(ana, '2026-01')],
        });
        const { resultados, avisos } = calcularComplementar(e);
        const r = resultados[0];
        expect(r.situacao).toBe('incompleto');
        expect(r.meses.every(m => m.rra)).toBe(true);
        expect(r.verbas.some(v => v.codigo === 'IRRF')).toBe(false);
        expect(r.avisos.join(' ')).toMatch(/Diferenças de 2025 pagas em 2026: são RRA/);
        expect(avisos.join(' ')).toMatch(/13º/);
    });
    it('lançamento avulso e de verba do motor, sem folha gravada no mês', () => {
        const ana = ficha('ana');
        const e = entrada([ana], {
            reajuste: undefined, gravadas: {},
            lancamentos: [
                { fichaId: 'ana', perRef: '2026-02', codigo: 'LAN', descricao: 'Gratificação de função', tipo: 'provento', valor: 20000, inss: true, fgts: true, irrf: true },
                { fichaId: 'ana', perRef: '2026-02', codigo: 'HE50', descricao: '', tipo: 'provento', valor: 5000, inss: true, fgts: true, irrf: true },
            ],
        });
        const r = calcularComplementar(e).resultados[0];
        expect(r.meses[0].verbas.slice(0, 2).map(v => [v.codigo, v.descricao])).toEqual([['LAN900', 'Gratificação de função'], ['HE50', 'Horas extras 50%']]);
        expect(r.meses[0].inss).toBe(inssDetalhado(25000, INSS).valor);
        expect(r.avisos.join(' ')).toMatch(/Sem folha gravada em 02\/2026: o INSS da diferença/i);
    });
    it('diferença negativa no mês: erro', () => {
        const e = entrada([ficha('ana')], { reajuste: undefined, lancamentos: [{ fichaId: 'ana', perRef: '2026-02', codigo: 'FALTA', descricao: '', tipo: 'desconto', valor: 5000, inss: true, fgts: true, irrf: true }] });
        const r = calcularComplementar(e).resultados[0];
        expect(r.situacao).toBe('erro');
        expect(r.erros[0]).toMatch(/Diferença negativa em 02\/2026/i);
    });
    it('funcionário desligado: aviso das verbas rescisórias', () => {
        const ana = ficha('ana', { dataDesligamento: '2026-03-20' });
        const r = calcularComplementar(entrada([ana], { folhaDoMes: [] })).resultados[0];
        expect(r.avisos.join(' ')).toMatch(/Desligado em 20\/03\/2026/);
    });
});

describe('sugestão pela convenção', () => {
    const conv = { tipo: 'CCT' as const, registroMte: 'SP001234/2026', vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31', reajuste: { percentual: 5.5, aPartirDe: '2026-01' } };
    it('reajuste do mês da data-base até o mês anterior à competência', () => {
        expect(sugestaoDaConvencao(conv, '2026-04', 'dos Comerciários de SP')).toEqual({
            instrumento: { tpAcConv: 'C', dsc: 'Convenção coletiva dos Comerciários de SP 2026/2026, registro MTE SP001234/2026' },
            reajuste: { pct: 5.5, de: '2026-01', ate: '2026-03' } });
        expect(sugestaoDaConvencao({ ...conv, tipo: 'ACT' }, '2026-04')!.instrumento.tpAcConv).toBe('A');
    });
    it('sem percentual ou sem retroativo: nada a sugerir', () => {
        expect(sugestaoDaConvencao({ ...conv, reajuste: { percentual: null, aPartirDe: '2026-01' } }, '2026-04')).toBeNull();
        expect(sugestaoDaConvencao(conv, '2026-01')).toBeNull();
    });
});
