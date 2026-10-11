// 13º complementar, diferença do 13º pelo reajuste e rescisão complementar na folha complementar (dados fictícios).
import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { calcular13 } from '../motor13';
import { calcularMensal } from '../motorMensal';
import { calcularRescisao } from '../motorRescisao';
import { inssDetalhado } from '../tributos';
import { calcularComplementar } from '../complementar';
import { complemento13, diferenca13DoReajuste, diferencasDaRescisao, fichaReajustada, juntarDiferencas, type DadosDosMotores } from '../complementaresMotores';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const TAB27 = [...TAB, ...TAB.filter(t => t.tipo === 'irrf' || t.tipo === 'inss').map(t => ({ ...t, id: `${t.id}-27`, vigencia: '2027-01' }))];
const INSS = TAB.find(t => t.tipo === 'inss')!;
const ficha = (id: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id, cpf: '52998224725', matriculaEsocial: id.toUpperCase(), situacao: 'ativo',
    dados: { nome: id.toUpperCase(), admissao: '2025-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.filter(x => x.codigo === c).reduce((s, x) => s + x.valor, 0);

describe('13º complementar (variáveis de dezembro)', () => {
    // Horas extras de janeiro a novembro e mais em dezembro: a média com dezembro sobe.
    const movimentos = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`2026-${String(i + 1).padStart(2, '0')}`, { horasExtras50: i === 11 ? 40 : 10 }]));
    const d: DadosDosMotores = { fichas: [ficha('ana')], afastamentos: [], movimentos: { ana: movimentos }, tabelas: TAB27 };
    it('diferença do 13º com dezembro na média, no perRef de dezembro, com o 13º pago', () => {
        const x = complemento13(d, 2026);
        expect(x.diferencas).toHaveLength(1);
        const dif = x.diferencas[0];
        const pago = calcular13({ ano: 2026, parcela: '2a', pagamento: '2026-12', ficha: d.fichas[0], afastamentos: [], tabelas: TAB27, movimentos });
        const com = calcular13({ ano: 2026, parcela: '2a', pagamento: '2027-01', ficha: d.fichas[0], afastamentos: [], tabelas: TAB27, movimentos });
        expect([dif.perRef, dif.verbas[0].codigo, dif.verbas[0].valor]).toEqual(['2026-12', '13COMP', v(com, '13') - v(pago, '13')]);
        expect(x.decimos[0]).toMatchObject({ fichaId: 'ana', perRef: '2026-12', baseInss: v(pago, '13'), inss: v(pago, 'INSS13'), irrf: v(pago, 'IRRF13') });
    });
    it('na complementar de janeiro (tipo J): não é RRA; INSS e IRRF do 13º sobre o pago + a diferença', () => {
        const x = complemento13(d, 2026);
        const c = calcularComplementar({ perApur: '2027-01', pagamento: '2027-01', instrumento: { tpAcConv: 'J', dsc: '13º salário complementar de 2026' }, fichas: d.fichas, gravadas: {}, tabelas: TAB27, diferencas: x.diferencas, decimos: x.decimos });
        expect(c.erros).toEqual([]);
        const r = c.resultados[0];
        expect(r.situacao).toBe('calculado');
        const m = r.meses[0];
        expect([m.rra, m.bases.inss, m.bases13.inss]).toEqual([false, 0, x.diferencas[0].verbas[0].valor]);
        const b0 = x.decimos[0].baseInss;
        expect(m.inss13).toBe(inssDetalhado(b0 + m.bases13.inss, INSS).valor - inssDetalhado(b0, INSS).valor);
        expect(m.verbas.find(y => y.codigo === 'INSS13')!.descricao).toBe('INSS sobre a diferença do 13º');
        expect(r.memoria.join(' ')).toMatch(/IRRF do 13º \(exclusivo na fonte/);
    });
    it('desligado antes de dezembro fica de fora (13º na rescisão)', () => {
        const x = complemento13({ ...d, fichas: [ficha('bia', { dataDesligamento: '2026-11-10' })], movimentos: { bia: movimentos } }, 2026);
        expect(x.diferencas).toEqual([]);
    });
});

describe('diferença do 13º pelo reajuste', () => {
    it('o percentual sobre o 13º do ano, como 13DIF em dezembro', () => {
        const d: DadosDosMotores = { fichas: [ficha('ana')], afastamentos: [], movimentos: {}, tabelas: TAB };
        const x = diferenca13DoReajuste(d, 2026, 5);
        const pago = calcular13({ ano: 2026, parcela: '2a', pagamento: '2026-12', ficha: d.fichas[0], afastamentos: [], tabelas: TAB, movimentos: {} });
        expect(x.diferencas[0].verbas[0]).toMatchObject({ codigo: '13DIF', valor: Math.round(v(pago, '13') * 0.05) });
        // Paga no mesmo ano (dezembro): com a folha da competência, sem RRA.
        const c = calcularComplementar({ perApur: '2026-12', pagamento: '2026-12', instrumento: { tpAcConv: 'C', dtAcConv: '2026-12-01', dsc: 'CCT' }, reajuste: { pct: 5, de: '2026-11', ate: '2026-11' },
            fichas: d.fichas, gravadas: { '2026-11': [calcularMensal({ competencia: '2026-11', pagamento: '2026-11', ficha: d.fichas[0], afastamentos: [], tabelas: TAB, folhaPagaAntesNoMes: null })] }, tabelas: TAB, ...x });
        expect(c.avisos.join(' ')).not.toMatch(/inclua a diferença do 13º/);
        const r = c.resultados[0];
        expect(r.meses.map(m => m.perRef)).toEqual(['2026-11', '2026-12']);
        expect(r.verbas.some(y => y.codigo === '13DIF')).toBe(true);
    });
});

describe('rescisão complementar', () => {
    const deslig = ficha('caio', { dataDesligamento: '2026-03-20', motivoDesligamento: '02', dataProjetadaAviso: '2026-04-22' });
    const d: DadosDosMotores = { fichas: [deslig, ficha('ana')], afastamentos: [], movimentos: {}, tabelas: TAB };
    it('refaz a rescisão com o salário reajustado: aviso, 13º e férias proporcionais no mês do desligamento', () => {
        const x = diferencasDaRescisao(d, { pct: 10, de: '2026-01', ate: '2026-03' }, {});
        expect(x.diferencas).toHaveLength(1);
        const dif = x.diferencas[0];
        expect(dif.perRef).toBe('2026-03');
        const antes = calcularRescisao({ ficha: deslig, data: '2026-03-20', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
        const depois = calcularRescisao({ ficha: fichaReajustada(deslig, 10), data: '2026-03-20', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
        const por = Object.fromEntries(dif.verbas.map(y => [y.codigo, y.valor]));
        expect(por.AVISO).toBe(v(depois, 'AVISO') - v(antes, 'AVISO'));
        expect(por['13PROP']).toBe(v(depois, '13PROP') - v(antes, '13PROP'));
        expect(por.SAL).toBe(v(depois, 'SAL') - v(antes, 'SAL')); // sem folha gravada do mês
        expect(dif.verbas.find(y => y.codigo === 'AVISO')!.descricao).toBe('Diferença de aviso prévio indenizado');
        expect(x.decimos[0]).toMatchObject({ fichaId: 'caio', perRef: '2026-03', inss: v(antes, 'INSS13') });
        // Com o holerite de março na folha gravada, o saldo fica com o reajuste da folha.
        const g = diferencasDaRescisao(d, { pct: 10, de: '2026-01', ate: '2026-03' }, { '2026-03': [{ ...antes, fichaId: 'caio', situacao: 'incompleto' }] });
        expect(g.diferencas[0].verbas.some(y => y.codigo === 'SAL')).toBe(false);
    });
    it('na complementar: diferenças rescisórias no S-1200 da competência, 13º com INSS próprio, sem aviso de desligado', () => {
        const x = juntarDiferencas(diferencasDaRescisao(d, { pct: 10, de: '2026-01', ate: '2026-03' }, {}));
        const c = calcularComplementar({ perApur: '2026-04', pagamento: '2026-04', instrumento: { tpAcConv: 'A', dtAcConv: '2026-04-01', dsc: 'ACT 2026' }, fichas: d.fichas, gravadas: {}, tabelas: TAB, ...x });
        const r = c.resultados.find(y => y.fichaId === 'caio')!;
        expect(r.situacao).toBe('calculado');
        expect(r.meses[0].inss13).toBeGreaterThan(0);
        expect(r.avisos.join(' ')).not.toMatch(/inclua as rescisões/);
        expect(r.avisos.join(' ')).toMatch(/Rescisão de 20\/03\/2026 refeita com o salário reajustado/);
    });
    it('fora do período do reajuste ou motivo não coberto: de fora, com aviso', () => {
        expect(diferencasDaRescisao(d, { pct: 10, de: '2026-04', ate: '2026-05' }, {}).diferencas).toEqual([]);
        const outro = diferencasDaRescisao({ ...d, fichas: [ficha('dani', { dataDesligamento: '2026-03-20', motivoDesligamento: '10' })] }, { pct: 10, de: '2026-01', ate: '2026-03' }, {});
        expect(outro.avisos[0]).toMatch(/motivo 10 não coberto/);
    });
    it('ficha reajustada: salário e histórico', () => {
        const f = fichaReajustada({ ...ficha('ana'), historicoSalario: [{ desde: '2025-01-02', salario: '2800.00', origem: 'teste' }] }, 10);
        expect([f.dados.salario, f.historicoSalario![0].salario]).toEqual(['3300.00', '3080.00']);
    });
});
