import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { apurarIrrf, calcularMensal, type Movimento, type ResultadoCalculo } from '../motorMensal';
import { inssDetalhado } from '../tributos';
import { apurarIrrfRra, calcularComplementar, diferencasDoReajuste, mesesEntre, sugestaoDaConvencao, totaisComplementar, validarComplementar, type EntradaComplementar } from '../complementar';

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
        expect(validarComplementar({ ...base, instrumento: { tpAcConv: 'E', dtAcConv: '2026-04-01', dsc: 'x' } }).join(' ')).toMatch(/Tipo E não tem reajuste/);
        expect(validarComplementar({ ...base, instrumento: { tpAcConv: 'H', dsc: 'x' } }).join(' ')).toMatch(/não usar até a regulamentação \(MOS, S-1200, item 18\.14\)/);
        expect(validarComplementar({ ...base, instrumento: { tpAcConv: 'I', dsc: 'x' } }).join(' ')).toMatch(/servidor público .* S-2500 e S-2501/);
        expect(validarComplementar({ ...base, instrumento: { tpAcConv: 'F', dsc: 'Participação nos lucros após o desligamento' } })).toEqual([]);
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
    it('diferenças de ano anterior ao do pagamento são RRA: calculadas em separado, sem IRRF abaixo da tabela acumulada', () => {
        const ana = ficha('ana', { admissao: '2025-01-02' });
        const e = entrada([ana], {
            perApur: '2026-01', pagamento: '2026-01', instrumento: { ...CCT, dtAcConv: '2026-01-15' }, reajuste: { pct: 5, de: '2025-11', ate: '2025-12' }, tabelas: TAB25,
            gravadas: { '2025-11': [mes(ana, '2025-11', {}, TAB25)], '2025-12': [mes(ana, '2025-12', {}, TAB25)] }, folhaDoMes: [mes(ana, '2026-01')],
        });
        const { resultados, avisos } = calcularComplementar(e);
        const r = resultados[0];
        expect(r.situacao).toBe('calculado');
        expect(r.meses.every(m => m.rra)).toBe(true);
        expect(r.rra).toMatchObject({ qtdMeses: 2, irrf: 0 });
        expect(r.verbas.some(v => v.codigo === 'IRRF')).toBe(false);
        expect(r.avisos.join(' ')).toMatch(/Diferenças de 2025 pagas em 2026: RRA .* tabela acumulada \(2 meses\)/);
        expect(avisos.join(' ')).toMatch(/13º/);
    });
    it('tabela acumulada: faixas e parcela a deduzir vezes os meses (exemplo de R$ 144.000,00 em 48 meses)', () => {
        const t = { ...IRRF, faixas: [{ ate: 225920, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 16944 }, { ate: 375105, aliquota: 15, deducao: 38144 }, { ate: 466468, aliquota: 22.5, deducao: 66277 }, { ate: null, aliquota: 27.5, deducao: 89600 }] };
        const t2 = { ...t, faixas: t.faixas.map(f => (f.aliquota === 15 ? { ...f, deducao: 39416 } : f)) };
        expect(apurarIrrfRra(t2, 14_400_000, 0, 48)).toEqual({ base: 14_400_000, aliquota: 15, deducaoFaixa: 39416 * 48, valor: 268_032 });
        expect(apurarIrrfRra(t, 225920 * 3, 0, 3).valor).toBe(0);
    });
    it('RRA com IRRF: exclusivo na fonte, INSS deduzido, sem dependentes, separado da folha do mês', () => {
        const ana = ficha('ana', { admissao: '2025-01-02' });
        ana.dependentes = [{ nome: 'FILHO', irrf: 'S', pensao: 'N' } as never];
        const lan = (perRef: string) => ({ fichaId: 'ana', perRef, codigo: 'LAN', descricao: 'Diferença salarial', tipo: 'provento' as const, valor: 600000, inss: true, fgts: true, irrf: true });
        const e = entrada([ana], {
            perApur: '2026-01', pagamento: '2026-01', instrumento: { ...CCT, dtAcConv: '2026-01-15' }, reajuste: undefined, tabelas: TAB25,
            gravadas: {}, folhaDoMes: [mes(ana, '2026-01')], lancamentos: ['2025-10', '2025-11', '2025-12'].map(lan),
        });
        const r = calcularComplementar(e).resultados[0];
        expect(r.situacao).toBe('calculado');
        const inss = r.meses.reduce((x, m) => x + m.inss, 0);
        const t26 = TAB25.find(t => t.tipo === 'irrf' && t.vigencia <= '2026-01' && TAB25.every(o => o.tipo !== 'irrf' || o.vigencia > '2026-01' || o.vigencia <= t.vigencia))!;
        const esperado = apurarIrrfRra(t26, 1_800_000, inss, 3).valor;
        expect(esperado).toBeGreaterThan(0);
        expect(r.rra).toEqual({ qtdMeses: 3, rendimentos: 1_800_000, deducoes: inss, irrf: esperado, descricao: expect.stringMatching(/^Diferenças de 2025 - Convenção/) });
        expect(r.rra!.descricao.length).toBeLessThanOrEqual(50);
        const ir = r.meses[2].verbas.find(v => v.codigo === 'IRRF')!;
        expect(ir).toMatchObject({ descricao: 'IRRF sobre o RRA', valor: esperado });
        expect(r.verbas.filter(v => v.codigo === 'IRRF')).toHaveLength(1);
        expect(r.memoria.join(' ')).toMatch(/IRRF do RRA \(Lei 7\.713\/1988, art\. 12-A; tabela de .* × 3 meses\).*sem dependentes/);
        expect(totaisComplementar([r]).irrf).toBe(esperado);
    });
    it('diferença do 13º de ano anterior entra no RRA e conta como mais um mês (IN RFB 1.500/2014, art. 36, § 1º)', () => {
        const ana = ficha('ana', { admissao: '2025-01-02' });
        const lan = (perRef: string) => ({ fichaId: 'ana', perRef, codigo: 'LAN', descricao: 'Diferença salarial', tipo: 'provento' as const, valor: 600000, inss: true, fgts: true, irrf: true });
        const e = entrada([ana], {
            perApur: '2026-01', pagamento: '2026-01', instrumento: { ...CCT, dtAcConv: '2026-01-15' }, reajuste: undefined, tabelas: TAB25, gravadas: {}, folhaDoMes: [mes(ana, '2026-01')],
            lancamentos: ['2025-11', '2025-12'].map(lan),
            diferencas: [{ fichaId: 'ana', perRef: '2025-12', verbas: [{ codigo: '13DIF', descricao: 'Diferença do 13º', referencia: '', tipo: 'provento', valor: 500000, inss: true, fgts: true, irrf: true }] }],
        });
        const r = calcularComplementar(e).resultados[0];
        expect(r.situacao).toBe('calculado');
        const inss = r.meses.reduce((x, m) => x + m.inss + m.inss13, 0);
        expect(r.meses.find(m => m.perRef === '2025-12')!.inss13).toBeGreaterThan(0);
        const t26 = TAB25.find(t => t.tipo === 'irrf' && t.vigencia <= '2026-01' && TAB25.every(o => o.tipo !== 'irrf' || o.vigencia > '2026-01' || o.vigencia <= t.vigencia))!;
        const esperado = apurarIrrfRra(t26, 1_700_000, inss, 3).valor;
        expect(r.rra).toMatchObject({ qtdMeses: 3, rendimentos: 1_700_000, deducoes: inss, irrf: esperado });
        expect(r.memoria.join(' ')).toMatch(/× 3 meses, com o 13º como mais um mês/);
        // O IRRF do 13º "normal" (exclusivo do ano) não é calculado para o 13º do RRA.
        expect(r.verbas.some(v => v.codigo === 'IRRF13')).toBe(false);
        expect(r.verbas.filter(v => v.codigo === 'IRRF')).toEqual([expect.objectContaining({ descricao: 'IRRF sobre o RRA', valor: esperado })]);
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

    it('tipo F: verbas devidas depois do desligamento, nos meses do contrato', () => {
        const dani = ficha('dani', { admissao: '2025-03-10', dataDesligamento: '2026-02-20' });
        const F = { tpAcConv: 'F' as const, dsc: 'Comissões apuradas depois do desligamento' };
        const lan = (perRef: string) => ({ fichaId: 'dani', perRef, codigo: 'LAN', descricao: 'Comissões', tipo: 'provento' as const, valor: 50000, inss: true, fgts: true, irrf: true });
        const ok = calcularComplementar(entrada([dani], { instrumento: F, reajuste: undefined, gravadas: {}, folhaDoMes: [], lancamentos: [lan('2026-02')] })).resultados[0];
        expect(ok.situacao).toBe('calculado');
        expect(ok.avisos.join(' ')).not.toMatch(/Tipo F é para/);
        const depois = calcularComplementar(entrada([dani], { instrumento: F, reajuste: undefined, gravadas: {}, folhaDoMes: [], lancamentos: [lan('2026-03')] })).resultados[0];
        expect(depois.situacao).toBe('erro');
        expect(depois.erros.join(' ')).toMatch(/03\/2026 é depois do desligamento/);
        const ativo = calcularComplementar(entrada([ficha('ana')], { instrumento: F, reajuste: undefined, lancamentos: [{ ...lan('2026-02'), fichaId: 'ana' }] })).resultados[0];
        expect(ativo.avisos.join(' ')).toMatch(/Tipo F é para verbas devidas depois do desligamento/);
    });
});

describe('tipo E: conversão do auxílio-doença em acidentário (só FGTS, rubrica informativa)', () => {
    const E = { tpAcConv: 'E' as const, dtAcConv: '2026-04-30', dsc: 'Conversão B31 em B91 notificada pelo INSS' };
    const base = (fichaId: string, perRef: string, valor: number) => ({ fichaId, perRef, codigo: 'FGTSAC', descricao: '', tipo: 'provento' as const, valor, inss: true, fgts: true, irrf: true });

    it('a base do FGTS de cada mês, FGTS na competência do mês, sem INSS, IRRF nem líquido', () => {
        const ana = ficha('ana');
        const c = calcularComplementar(entrada([ana], { instrumento: E, reajuste: undefined, lancamentos: [base('ana', '2026-02', 300000), base('ana', '2026-03', 300000)] }));
        expect(c.erros).toEqual([]);
        const [r] = c.resultados;
        expect(r.situacao).toBe('calculado');
        expect(r.meses.map(m => [m.perRef, m.bases, m.inss, m.fgts])).toEqual([
            ['2026-02', { inss: 0, fgts: 300000, irrf: 0 }, 0, 24000],
            ['2026-03', { inss: 0, fgts: 300000, irrf: 0 }, 0, 24000],
        ]);
        expect(r.verbas.every(v => v.informativa && v.fgts && !v.inss && !v.irrf)).toBe(true); // marcações da tela ignoradas
        expect(r.totais).toEqual({ proventos: 0, descontos: 0, liquido: 0 });
        expect(r.fgts).toBe(48000);
        expect(r.verbas.some(v => v.codigo === 'IRRF' || v.codigo === 'INSS')).toBe(false);
        expect(r.memoria.join(' ')).toMatch(/recolhido na competência 02\/2026, com os encargos desde ela até o pagamento; MOS, S-1200, item 18\.9/);
        expect(r.avisos.join(' ')).toMatch(/Tipo E: o FGTS de cada mês é da competência do mês de referência/);
        expect(totaisComplementar(c.resultados)).toMatchObject({ liquido: 0, inss: 0, irrf: 0, fgts: 48000 });
    });

    it('tipo E só com a base do FGTS; a base do FGTS só no tipo E', () => {
        const semReaj = { perApur: '2026-04', pagamento: '2026-04', instrumento: E };
        expect(validarComplementar({ ...semReaj })).toContain('Lance a base do FGTS de cada mês do afastamento.');
        expect(validarComplementar({ ...semReaj, lancamentos: [{ ...base('ana', '2026-02', 100), codigo: 'SAL' }] }).join(' ')).toMatch(/só a base do FGTS do afastamento por acidente/);
        expect(validarComplementar({ ...semReaj, lancamentos: [base('ana', '2026-02', 100)], diferencas: [{ fichaId: 'ana', perRef: '2025-12', verbas: [] }] }).join(' ')).toMatch(/não leva 13º nem rescisões/);
        expect(validarComplementar({ ...semReaj, instrumento: { ...E, dtAcConv: '' }, lancamentos: [base('ana', '2026-02', 100)] })).toContain('Informe a data da celebração ou da publicação do instrumento.');
        expect(validarComplementar({ perApur: '2026-04', pagamento: '2026-04', instrumento: CCT, lancamentos: [base('ana', '2026-02', 100)] }).join(' ')).toMatch(/só do tipo E/);
        expect(validarComplementar({ ...semReaj, lancamentos: [base('ana', '2026-02', 100)] })).toEqual([]);
    });
});


describe('dissídio por sindicato (Folha complementar › Dissídio do SAGE)', () => {
    const SIND_A = '11222333000181'; const SIND_B = '11444777000161';
    const a = ficha('ana', { sindicato: SIND_A }); const b = ficha('bia', { sindicato: SIND_B }); const c = ficha('caio', { sindicato: '' });
    it('só os do sindicato da convenção; sem sindicato na ficha entra com aviso; outro sindicato fica fora', () => {
        const x = calcularComplementar(entrada([a, b, c], { reajuste: { pct: 5, de: '2026-01', ate: '2026-03', sindicato: SIND_A } }));
        expect(x.resultados.map(r => r.fichaId).sort()).toEqual(['ana', 'caio']);
        expect(x.avisos.join(' ')).toMatch(/Fora do reajuste \(outro sindicato na ficha\): BIA/);
        expect(x.avisos.join(' ')).toMatch(/Sem o sindicato na ficha, reajustados mesmo assim: CAIO/);
        expect(x.resultados.find(r => r.fichaId === 'ana')!.memoria.join(' ')).toMatch(/funcionários do sindicato 11222333000181/);
        // Sem filtro: todos.
        expect(calcularComplementar(entrada([a, b, c])).resultados).toHaveLength(3);
    });
    it('a sugestão leva o CNPJ do sindicato; CNPJ inválido no reajuste é erro', () => {
        const conv = { tipo: 'CCT' as const, registroMte: '', vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31', reajuste: { percentual: 5, aPartirDe: '2026-01' } };
        expect(sugestaoDaConvencao(conv, '2026-04', 'X', '11.222.333/0001-81')!.reajuste.sindicato).toBe(SIND_A);
        expect(validarComplementar({ perApur: '2026-04', pagamento: '2026-04', instrumento: CCT, reajuste: { pct: 5, de: '2026-01', ate: '2026-03', sindicato: '123' } })).toContain('CNPJ do sindicato do reajuste inválido.');
    });
});
