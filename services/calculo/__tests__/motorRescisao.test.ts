import { describe, expect, it } from 'vitest';
import { calcularRescisao, diasDeAviso, type EntradaRescisao } from '../motorRescisao';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2024-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2024-01', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia(EMP), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
// Férias do 1º período já gozadas; o 2º período está vencido (sem dobra).
const gozo1: Afastamento = { ...afastamentoVazio(), id: 'g1', fichaId: 'f1', motivo: '15', dtInicio: '2025-02-03', dtFim: '2025-03-04', perAquisInicio: '2024-01-02' };
const calc = (p: Partial<EntradaRescisao>) => calcularRescisao({ ficha: ficha(), data: '2026-03-10', tipo: '02', aviso: 'indenizado', afastamentos: [gozo1], tabelas: [INSS, IR], movimentos: {}, ...p });
const v = (r: ReturnType<typeof calcularRescisao>, c: string) => r.verbas.filter(x => x.codigo === c || x.codigo.startsWith(`${c}2`)).reduce((s, x) => s + x.valor, 0);

describe('rescisão', () => {
    it('salário do desligamento pelo histórico: reajuste posterior não entra no saldo, no aviso, no 13º nem nas férias', () => {
        const comHist = { ...ficha({ salario: '3300.00' }), historicoSalario: [{ desde: '2024-01-02', salario: '3000.00', origem: 'S-2200 · 1' }, { desde: '2026-06-01', salario: '3300.00', origem: 'S-2206 · 2' }] };
        const r = calc({ ficha: comHist });
        expect([v(r, 'SAL'), v(r, 'AVISO'), v(r, '13PROP'), v(r, 'FV')]).toEqual([100000, 360000, 50000, 300000]);
        expect(r.memoria.join('\n')).toContain('Salário de 02/01/2024 (S-2200), vigente no desligamento (10/03/2026)');
        // Desligamento depois do reajuste: o salário atual.
        expect(v(calc({ ficha: comHist, data: '2026-06-10' }), 'AVISO')).toBeGreaterThan(360000);
    });

    it('aviso prévio proporcional (Lei 12.506/2011)', () => {
        expect(diasDeAviso('2024-01-02', '2024-12-31')).toBe(30);
        expect(diasDeAviso('2024-01-02', '2025-01-01')).toBe(33);
        expect(diasDeAviso('2024-01-02', '2026-03-10')).toBe(36);
        expect(diasDeAviso('2000-01-03', '2026-03-10')).toBe(90);
    });

    it('sem justa causa, aviso indenizado: saldo, aviso, 13º com projeção, férias, FGTS e multa', () => {
        const r = calc({ saldoFgts: 1000000 });
        expect(r.situacao).toBe('calculado');
        expect(r.diasAviso).toBe(36);
        expect(r.dataProjetada).toBe('2026-04-15');
        expect(r.pagarAte).toBe('2026-03-20');
        expect(v(r, 'SAL')).toBe(100000); // 10 dias
        expect(v(r, 'INSS')).toBe(7500);
        expect(v(r, 'AVISO')).toBe(360000);
        expect(v(r, '13PROP')).toBe(50000); // jan, fev
        expect(v(r, '13IND')).toBe(50000); // mar, abr pela projeção
        expect(v(r, 'INSS13')).toBe(3750);
        expect(v(r, 'FV')).toBe(300000); // 2º período, 30 dias
        expect(v(r, 'FV13')).toBe(100000);
        expect(v(r, 'FP')).toBe(75000); // 3/12 do 3º período (até 15/04)
        expect(v(r, 'FP13')).toBe(25000);
        expect(r.fgts).toBe(44800); // (1.000 + 3.600 + 500 + 500) × 8%
        expect(r.multaFgts).toBe(Math.round((1000000 + 44800) * 0.4));
        expect(r.totais).toEqual({ proventos: 1060000, descontos: 11250, liquido: 1048750 });
        expect(r.saqueFgts).toContain('Saque do saldo do FGTS liberado');
        expect(calc({}).avisos.join(' ')).toContain('Informe o saldo do FGTS');
    });

    it('pedido de demissão sem cumprir o aviso: desconto de 30 dias, sem multa nem saque', () => {
        const r = calc({ tipo: '07', aviso: 'nao-cumprido', saldoFgts: 1000000 });
        expect(v(r, 'AVISO')).toBe(0);
        expect(v(r, 'AVISODESC')).toBe(300000);
        expect(v(r, '13PROP')).toBe(50000);
        expect(v(r, '13IND')).toBe(0);
        expect(v(r, 'FP')).toBe(50000); // 2/12 (março com 9 dias não conta)
        expect(r.multaFgts).toBe(0);
        expect(r.saqueFgts).toBe('Sem saque do FGTS por este motivo.');
        expect(v(calc({ tipo: '07', aviso: 'dispensado' }), 'AVISODESC')).toBe(0);
    });

    it('justa causa: só saldo e férias vencidas', () => {
        const r = calc({ tipo: '01' });
        expect(v(r, '13PROP') + v(r, 'FP') + v(r, 'AVISO')).toBe(0);
        expect(v(r, 'FV')).toBe(300000);
        expect(r.memoria).toContain('Justa causa: sem 13º proporcional, férias proporcionais e aviso prévio.');
    });

    it('acordo: aviso pela metade, multa de 20% e saque de 80%', () => {
        const r = calc({ tipo: '33', saldoFgts: 1000000 });
        expect(v(r, 'AVISO')).toBe(180000); // 36 ÷ 2 = 18 dias
        expect(r.dataProjetada).toBe('2026-03-28');
        expect(v(r, '13IND')).toBe(25000); // março pela projeção
        expect(r.percentualMulta).toBe(20);
        expect(r.saqueFgts).toContain('80%');
    });

    it('aviso trabalhado: só os dias além de 30 são indenizados', () => {
        const r = calc({ aviso: 'trabalhado' });
        expect(v(r, 'AVISO')).toBe(60000);
        expect(r.dataProjetada).toBe('2026-03-16');
    });

    it('contrato a termo: art. 479 no término antecipado; sem multa no término normal', () => {
        const r = calc({ tipo: '03', ficha: ficha({ fimContrato: '2026-04-30' }) });
        expect(v(r, 'ART479')).toBe(255000); // 51 dias ÷ 2 × 100,00
        expect(r.percentualMulta).toBe(40);
        expect(calc({ tipo: '06', saldoFgts: 100000 }).multaFgts).toBe(0);
    });

    it('férias vencidas com o concessivo passado saem em dobro; perdidas não entram', () => {
        const r = calc({ afastamentos: [] });
        expect(v(r, 'FVD')).toBe(300000); // 1º período, concessivo até 01/01/2026
        expect(v(r, 'FV')).toBe(600000); // os dois períodos
        expect(r.situacao).toBe('incompleto');
        expect(r.avisos[0]).toContain('2 período(s) de férias vencidas, com dobra: confira se as férias já tiradas estão lançadas');
        const doenca: Afastamento = { ...afastamentoVazio(), id: 'd', fichaId: 'f1', motivo: '03', dtInicio: '2025-02-01', dtFim: '2025-09-30' };
        const perdida = calc({ afastamentos: [gozo1, doenca] });
        expect(perdida.memoria.some(m => m.includes('perdidas'))).toBe(true);
    });

    it('erros', () => {
        expect(calc({ data: '' }).erros).toEqual(['Informe a data do desligamento.']);
        expect(calc({ data: '2023-12-31' }).erros).toEqual(['Desligamento antes da admissão.']);
        expect(calc({ ficha: ficha({ salario: '' }) }).situacao).toBe('erro');
        expect(calc({ tabelas: [IR] }).situacao).toBe('erro');
    });

    it('revisão do PR #55: tipo obrigatório, avos do ano seguinte, FGTS do adiantamento e mês do pagamento', () => {
        expect(calc({ tipo: '' }).erros).toEqual(['Escolha o tipo do desligamento (a ficha não tem o motivo do S-2299).']);
        expect(calc({ tipo: '', ficha: ficha({ motivoDesligamento: '11' }) }).erros[0]).toContain('Motivo 11 do S-2299 ainda não é coberto');
        // Motivo e fim projetado vindos do S-2299 são conferidos
        const doS2299 = calc({ tipo: '07', aviso: 'dispensado', ficha: ficha({ dataDesligamento: '2026-03-10', motivoDesligamento: '02', dataProjetadaAviso: '2026-04-10' }) });
        expect(doS2299.avisos).toContain('O S-2299 informou o motivo 02; o cálculo usa 07.');
        const proj = calc({ ficha: ficha({ dataDesligamento: '2026-03-10', motivoDesligamento: '02', dataProjetadaAviso: '2026-04-10' }) });
        expect(proj.avisos.join(' ')).toContain('O S-2299 informou o fim projetado em 10/04/2026; o cálculo projetou 15/04/2026');
        // Dezembro com projeção em janeiro (25 dias): o avo de janeiro do ano seguinte entra
        const dez = calc({ data: '2026-12-20' });
        expect(dez.dataProjetada).toBe('2027-01-25');
        expect(v(dez, '13PROP')).toBe(300000);
        expect(v(dez, '13IND')).toBe(25000);
        // Adiantamento do 13º já teve FGTS: sai da base rescisória
        const adt = calc({ adiantamento13: 30000 });
        expect(adt.fgts).toBe(Math.round((100000 + 360000 + (50000 - 30000) + 50000) * 0.08));
        // Mês do pagamento: o padrão é o do prazo; informado, vale ele
        const fimMes = calc({ data: '2026-03-25' });
        expect(fimMes.pagamento).toBe('2026-04');
        expect(fimMes.avisos.join(' ')).toContain('O prazo de pagamento cai em 04/2026');
        const pagoAntes = calc({ data: '2026-03-25', pagamento: '2026-03' });
        expect(pagoAntes.pagamento).toBe('2026-03');
        expect(pagoAntes.avisos.join(' ')).not.toContain('O prazo de pagamento cai');
    });
});
