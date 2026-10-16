// Crédito do Trabalhador, etapa 5: provisão da parcela no adiantamento e no recibo de férias (Manual do Empregador,
// MTE, v2.1, exemplos 03 e 04), opção da empresa. Dados fictícios.
import { describe, expect, it } from 'vitest';
import { calcularMensal, temAdiantamento, totalDoAdiantamento, type ResultadoCalculo } from '../motorMensal';
import { calcularFerias, feriasDaCompetencia, OPCOES_FERIAS_PADRAO } from '../motorFerias';
import { alterarProvisaoConsignado, provisaoConsignadoVigente, type ContratoConsignado } from '../consignado';
import { verbasDoAdiantamento, verbasDoAdiantamentoParaDePara } from '../../esocial/eventosFolha';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const C = (parcela: number): ContratoConsignado => ({ instFinanc: '341', nrDoc: 'CT-1', parcela, inicio: '2026-01' });
const ficha = (consignados: ContratoConsignado[], dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '5000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados }, consignados });
const v = (r: Pick<ResultadoCalculo, 'verbas'>, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;
const pagoAoTrabalhador = (r: ResultadoCalculo) => totalDoAdiantamento(r) + r.totais.liquido;

describe('provisão no adiantamento (exemplo 03)', () => {
    const calc = (provisao: boolean, parcela = 120000) => calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: ficha([C(parcela)], { adiantamentoPct: '40' }), tabelas: TAB, afastamentos: [], provisaoConsignado: provisao });

    it('40% da parcela de R$ 1.200,00 sai do adiantamento (9299) e volta na folha (1629); a parcela sai inteira na 9253', () => {
        const r = calc(true);
        expect(r.verbasAdiantamento?.find(x => x.codigo === 'CONSIGPROV')).toMatchObject({ valor: 48000, tipo: 'desconto', inss: false, fgts: false, irrf: false });
        expect(totalDoAdiantamento(r)).toBe(200000 - 48000); // R$ 1.520,00 no recibo, como no manual
        expect([v(r, 'ADIANT'), v(r, 'CONSIGDEV'), v(r, 'CONSIG')]).toEqual([200000, 48000, 120000]);
        expect(r.verbas.find(x => x.codigo === 'CONSIGDEV')).toMatchObject({ tipo: 'provento', inss: false, fgts: false, irrf: false });
        expect(r.memoria.join(' ')).toMatch(/provisionados no adiantamento voltam como devolução/);
    });

    it('sem a opção: nada muda; o trabalhador recebe no mês o mesmo total, só que distribuído', () => {
        const sem = calc(false), com = calc(true);
        expect([sem.verbasAdiantamento, v(sem, 'CONSIGDEV')]).toEqual([undefined, 0]);
        expect(pagoAoTrabalhador(com)).toBe(pagoAoTrabalhador(sem));
        expect(com.bases).toEqual(sem.bases);
    });

    it('a provisão não passa do adiantamento', () => {
        const r = calc(true, 900000);
        expect(r.verbasAdiantamento?.find(x => x.codigo === 'CONSIGPROV')?.valor).toBe(200000);
        expect(totalDoAdiantamento(r)).toBe(0);
        // Líquido zero, mas o recibo existe: o adiantamento e a provisão vão ao demonstrativo do S-1200 (Codex #276).
        expect(temAdiantamento(r)).toBe(true);
        expect(verbasDoAdiantamento(r).map(x => [x.codigo, x.valor])).toEqual([['ADIANTPAG', 200000], ['CONSIGPROV', 200000]]);
        expect(verbasDoAdiantamentoParaDePara([{ ...r, situacao: 'calculado' }])).toHaveLength(1);
    });
});

describe('provisão no recibo de férias (exemplo 04)', () => {
    const gozo: Afastamento = { ...afastamentoVazio(), id: 'g1', fichaId: 'f1', motivo: '15', dtInicio: '2026-06-01', dtFim: '2026-06-18' };
    const f = ficha([C(70000)], { salario: '3500.00' });
    const opcoes = { ...OPCOES_FERIAS_PADRAO, provisaoConsignado: [{ inicio: '2026-01' }] };

    it('18 dias de gozo no mês: 60% da parcela de R$ 700,00 = R$ 420,00 no recibo', () => {
        const sem = calcularFerias({ ficha: f, gozo, afastamentos: [gozo], tabelas: TAB, movimentos: {} });
        const r = calcularFerias({ ficha: f, gozo, afastamentos: [gozo], tabelas: TAB, movimentos: {}, opcoes });
        expect(v(r, 'CONSIGPROV')).toBe(42000);
        expect(r.porCompetencia[0].consignado).toBe(42000);
        expect(r.totais.liquido).toBe(sem.totais.liquido - 42000);
        expect(v(sem, 'CONSIGPROV')).toBe(0);
    });

    it('a folha do mês abate do líquido das férias o que ficou provisionado e desconta a parcela inteira', () => {
        const fm = feriasDaCompetencia(f, [gozo], TAB, {}, '2026-06', opcoes)!;
        expect(fm.consignado).toBe(42000);
        const semFm = feriasDaCompetencia(f, [gozo], TAB, {}, '2026-06')!;
        expect(semFm.consignado).toBeUndefined();
        const com = calcularMensal({ competencia: '2026-06', pagamento: '2026-07', ficha: f, tabelas: TAB, afastamentos: [gozo], feriasDoMes: fm });
        const sem = calcularMensal({ competencia: '2026-06', pagamento: '2026-07', ficha: f, tabelas: TAB, afastamentos: [gozo], feriasDoMes: semFm });
        expect(v(sem, 'FERPAGO') - v(com, 'FERPAGO')).toBe(42000);
        expect([v(com, 'CONSIG'), v(sem, 'CONSIG')]).toEqual([70000, 70000]);
        expect(com.totais.liquido - sem.totais.liquido).toBe(42000);
    });
});

describe('vigência da provisão (Codex #276)', () => {
    it('ligar e desligar valem a partir da competência; os meses anteriores ficam como estavam', () => {
        const ligada = alterarProvisaoConsignado(undefined, '2026-06', true);
        expect(ligada).toEqual([{ inicio: '2026-06' }]);
        const desligada = alterarProvisaoConsignado(ligada, '2026-09', false);
        expect(desligada).toEqual([{ inicio: '2026-06', fim: '2026-08' }]);
        expect(['2026-05', '2026-06', '2026-08', '2026-09'].map(c => provisaoConsignadoVigente(desligada, c))).toEqual([false, true, true, false]);
        expect(alterarProvisaoConsignado(desligada, '2026-11', true)).toEqual([{ inicio: '2026-06', fim: '2026-08' }, { inicio: '2026-11' }]);
        // Religar no mês seguinte ao fim emenda o período; desligar no próprio início some com ele.
        expect(alterarProvisaoConsignado(desligada, '2026-09', true)).toEqual([{ inicio: '2026-06' }]);
        expect(alterarProvisaoConsignado(ligada, '2026-06', false)).toEqual([]);
        expect(alterarProvisaoConsignado([{ inicio: '2025-12' }], '2026-01', false)).toEqual([{ inicio: '2025-12', fim: '2025-12' }]);
    });

    it('o recibo de férias segue a vigência no mês do início do gozo: ligar depois não muda o recibo já pago', () => {
        const gozo: Afastamento = { ...afastamentoVazio(), id: 'g1', fichaId: 'f1', motivo: '15', dtInicio: '2026-06-01', dtFim: '2026-06-18' };
        const f = ficha([C(70000)], { salario: '3500.00' });
        const depois = calcularFerias({ ficha: f, gozo, afastamentos: [gozo], tabelas: TAB, movimentos: {}, opcoes: { ...OPCOES_FERIAS_PADRAO, provisaoConsignado: [{ inicio: '2026-07' }] } });
        expect(v(depois, 'CONSIGPROV')).toBe(0);
        const antes = calcularFerias({ ficha: f, gozo, afastamentos: [gozo], tabelas: TAB, movimentos: {}, opcoes: { ...OPCOES_FERIAS_PADRAO, provisaoConsignado: [{ inicio: '2026-01', fim: '2026-06' }] } });
        expect(v(antes, 'CONSIGPROV')).toBe(42000);
    });
});
