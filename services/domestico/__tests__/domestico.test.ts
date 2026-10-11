// Empregado doméstico (categoria 104; LC 150/2015): folha, 13º, férias, rescisão, DAE e eSocial (dados fictícios).
import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import { calcularMensal } from '../../calculo/motorMensal';
import { calcular13 } from '../../calculo/motor13';
import { calcularFerias } from '../../calculo/motorFerias';
import { calcularRescisao } from '../../calculo/motorRescisao';
import { gerarEventosFolha } from '../../esocial/eventosFolha';
import { calcularDae, destinoIndenizacao, ehDomestico, FUNCOES_DOMESTICAS, indenizacaoCompensatoria, resumoDae, vencimentoDae } from '../domestico';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha = (dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'MARIA', admissao: '2024-01-02', salario: '2000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '104', cbo: '512105', ...dados } });
const af = (a: Partial<Afastamento>): Afastamento => ({ ...afastamentoVazio(), id: `a-${a.dtInicio}`, fichaId: 'f1', ...a });
const mensal = (f = ficha(), afastamentos: Afastamento[] = [], competencia = '2026-03') => calcularMensal({ competencia, pagamento: competencia, ficha: f, afastamentos, tabelas: TAB, folhaPagaAntesNoMes: null });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('folha mensal do doméstico', () => {
    it('FGTS de 8% e os 3,2% de indenização compensatória', () => {
        const r = mensal();
        expect(r.situacao).toBe('calculado');
        expect([v(r, 'SAL'), r.bases.fgts, r.fgts, r.fgtsIndenizacao]).toEqual([200000, 200000, 16000, 6400]);
        expect(r.memoria.join(' ')).toMatch(/Indenização compensatória do doméstico: R\$\s2\.000,00 × 3,2% = R\$\s64,00/);
        expect(ehDomestico('104')).toBe(true);
        expect(mensal(ficha({ categoria: '101' })).fgtsIndenizacao).toBeUndefined();
    });
    it('doença: o INSS paga desde o 1º dia (o empregador doméstico não paga os 15 primeiros)', () => {
        const doenca = [af({ motivo: '03', dtInicio: '2026-03-21', dtFim: '2026-03-30' })];
        const dom = mensal(ficha(), doenca);
        const clt = mensal(ficha({ categoria: '101' }), doenca);
        expect(v(clt, 'SAL')).toBe(200000);
        expect(v(dom, 'SAL')).toBe(Math.round(200000 / 30 * 21)); // 21 dias trabalhados em março
        expect(dom.memoria.join(' ')).toMatch(/benefício do INSS desde o 1º dia/);
    });
    it('salário-maternidade pago pelo INSS: sem salário, com FGTS e os 3,2% sobre a remuneração', () => {
        const r = mensal(ficha(), [af({ motivo: '17', dtInicio: '2026-02-10', dtFim: '2026-06-09' })]);
        expect([v(r, 'SAL'), v(r, 'MAT'), v(r, 'INSS'), r.bases.inss]).toEqual([0, 0, 0, 0]);
        expect([r.bases.fgts, r.fgts, r.fgtsIndenizacao]).toEqual([200000, 16000, 6400]);
        expect(r.memoria.join(' ')).toMatch(/pago direto pelo INSS \(Lei 8\.213\/1991, art\. 73, I\)/);
    });
});

describe('13º, férias e rescisão do doméstico', () => {
    it('13º: os 3,2% sobre a base do FGTS', () => {
        const r = calcular13({ ano: 2026, parcela: '2a', pagamento: '2026-12', ficha: ficha(), afastamentos: [], tabelas: TAB, movimentos: {} });
        expect(r.fgtsIndenizacao).toBe(indenizacaoCompensatoria(r.bases.fgts));
        expect(r.fgtsIndenizacao).toBeGreaterThan(0);
    });
    it('férias: até 2 períodos, um com 14 dias ou mais (LC 150/2015, art. 17, § 2º)', () => {
        const g = af({ motivo: '15', dtInicio: '2026-03-02', dtFim: '2026-03-11' });
        const r = calcularFerias({ ficha: ficha(), gozo: g, afastamentos: [g], tabelas: TAB, movimentos: {}, abonoDias: 10 });
        expect(r.avisos.join(' ')).toMatch(/um dos 2 períodos tem de ter 14 dias ou mais, e sobrariam 10 dia\(s\)/);
        expect(r.avisos.join(' ')).not.toMatch(/menos de 5 dias/);
        const g1 = af({ motivo: '15', dtInicio: '2026-03-02', dtFim: '2026-03-21' });
        const g2 = af({ motivo: '15', dtInicio: '2026-06-01', dtFim: '2026-06-05' });
        const r2 = calcularFerias({ ficha: ficha(), gozo: g2, afastamentos: [g1, g2], tabelas: TAB, movimentos: {} });
        expect(r2.avisos.join(' ')).toMatch(/até 2 períodos .* ainda sobrariam 5 dia\(s\)/);
    });
    it('rescisão sem justa causa: sem multa de 40%, 3,2% para o empregado, seguro-desemprego do doméstico', () => {
        const r = calcularRescisao({ ficha: ficha(), data: '2026-06-10', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {}, saldoFgts: 500000 });
        expect(r.situacao).not.toBe('erro');
        expect([r.percentualMulta, r.multaFgts]).toEqual([0, 0]);
        expect(r.fgtsIndenizacao).toBe(indenizacaoCompensatoria(r.bases.fgts));
        expect(r.memoria.join(' ')).toMatch(/vão para o empregado, que saca/);
        expect(r.avisos.join(' ')).toMatch(/Seguro-desemprego do doméstico: 3 parcelas/);
    });
    it('pedido de demissão: os 3,2% voltam ao empregador; fim do contrato a termo: sem os 3,2% no mês', () => {
        const pedido = calcularRescisao({ ficha: ficha(), data: '2026-06-10', tipo: '07', aviso: 'trabalhado', afastamentos: [], tabelas: TAB, movimentos: {} });
        expect(pedido.memoria.join(' ')).toMatch(/voltam para o empregador/);
        const termo = calcularRescisao({ ficha: ficha({ admissao: '2026-03-12', tipoContrato: '2', fimContrato: '2026-06-09' }), data: '2026-06-09', tipo: '06', aviso: 'dispensado', afastamentos: [], tabelas: TAB, movimentos: {} });
        expect(termo.fgtsIndenizacao).toBe(0);
        expect(destinoIndenizacao('05').quem).toBe('metade');
        expect(destinoIndenizacao('33').quem).toBe('conferir');
    });
});

describe('DAE e eSocial do doméstico', () => {
    it('vencimento no dia 7, antecipado para o dia útil anterior', () => {
        expect(vencimentoDae('2026-01')).toBe('2026-02-06'); // 07/02/2026 é sábado
        expect(vencimentoDae('2026-08')).toBe('2026-09-04'); // 07/09 é feriado (segunda)
        expect(vencimentoDae('2026-09')).toBe('2026-10-07');
    });
    it('composição: INSS do empregado e do empregador, GILRAT, FGTS, 3,2%, IRRF e salário-família deduzido', () => {
        const r = mensal();
        const d = calcularDae([r], '2026-03');
        const it = Object.fromEntries(d.itens.map(i => [i.rotulo, i.valor]));
        expect(it['INSS do empregado (descontado)']).toBe(v(r, 'INSS'));
        expect([it['INSS do empregador'], it['Seguro contra acidentes (GILRAT)'], it.FGTS, it['Indenização compensatória (FGTS)']]).toEqual([16000, 1600, 16000, 6400]);
        expect(d.total).toBe(v(r, 'INSS') + 16000 + 1600 + 16000 + 6400 + v(r, 'IRRF'));
        expect(resumoDae(d)).toMatch(/vence em 07\/04\/2026/);
    });
    it('S-1200 do doméstico não sai pelo Consultor (eSocial Doméstico)', () => {
        const f = ficha();
        const g = gerarEventosFolha({ cnpj: '44388152000189', tpAmb: 2, competencia: '2026-03', dataPagamento: '2026-04-06', fichas: [f], resultados: [mensal(f)], rubricas: [],
            parametros: { nrInscEstab: '44388152000189', codLotacao: 'LOT01', rubricas: {} } });
        expect(g.trabalhadores[0].erros.join(' ')).toMatch(/a folha vai pelo eSocial Doméstico/);
        expect(g.trabalhadores[0].s1200).toBeNull();
    });
    it('funções domésticas com o CBO (babá e serviços gerais conferidos)', () => {
        expect(FUNCOES_DOMESTICAS.filter(x => x.conferido).map(x => x.cbo)).toEqual(['512105', '516205']);
    });
});
