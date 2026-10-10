import { describe, expect, it } from 'vitest';
import catalogo from '../../../data/eventos-iob-sage.json';
import type { EventoIobSage } from '../../folha/folhaTypes';
import { eventoPorCodigo, lancarEvento, lerReferencia, tipoDaReferencia, type Lancado } from '../lancarEvento';
import { calcularMensal, salarioContratual } from '../motorMensal';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import type { Movimento } from '../motorMensal';

const eventos = (catalogo as { eventos: EventoIobSage[] }).eventos;
const ev = (c: string) => { const e = eventoPorCodigo(eventos, c); if (!e) throw new Error(`sem ${c}`); return e; };
// R$ 2.200,00 em 220 h: hora de R$ 10,00 e diária de R$ 73,33.
const SAL = { mensal: 220000, horasMes: 220 };
const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria Interministerial MPS/MF 6/2025', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const ok = (r: Lancado) => { if ('erro' in r) throw new Error(r.erro); return r; };
/** Moeda do toLocaleString vem com espaço não separável. */
const msg = (r: { mensagem: string }) => r.mensagem.replace(/\u00a0/g, ' ');
const erro = (r: Lancado) => ('erro' in r ? r.erro : '');
const lancar = (c: string, ref: string, mov: Movimento = {}) => { const e = ev(c); return lancarEvento(e, lerReferencia(ref, tipoDaReferencia(e)) ?? 0, SAL, mov); };

describe('Lançar evento: campos próprios do movimento', () => {
    it('hora extra 50%, 100% e outro adicional vão para os campos de horas extras', () => {
        expect(ok(lancar('0810', '10')).movimento).toEqual({ horasExtras50: 10 });
        expect(ok(lancar('820', '2:30')).movimento).toEqual({ horasExtras100: 2.5 });
        const r = ok(lancar('0811', '5', { horasExtrasPct: { 75: 1 } }));
        expect(r.movimento.horasExtrasPct).toEqual({ 60: 5, 75: 1 });
        expect(r.mensagem).toContain('hora extra 60%');
    });

    it('relançar o mesmo evento substitui (como no Sage) e diz o que havia antes', () => {
        const r = ok(lancar('0810', '4', { horasExtras50: 10 }));
        expect(r.movimento.horasExtras50).toBe(4);
        expect(r.mensagem).toContain('antes 10 h');
    });

    it('faltas, atrasos e DSR vão para as quantidades do movimento', () => {
        expect(ok(lancar('5850', '1:20')).movimento.atrasosHoras).toBeCloseTo(1.3333, 4);
        expect(ok(lancar('5650', '2')).movimento).toEqual({ faltasDias: 2 });
        expect(ok(lancar('5655', '1')).movimento).toEqual({ dsrDescontadoDias: 1 });
        expect(erro(lancar('5650', '40'))).toContain('31 dias');
    });

    it('pensão, adiantamento, vale-transporte e arredondamento anterior vão como valores', () => {
        expect(ok(lancar('5810', '1.234,56')).movimento).toEqual({ pensaoAlimenticia: 123456 });
        expect(ok(lancar('5610', '880,00')).movimento).toEqual({ adiantamento: 88000 });
        expect(ok(lancar('5779', '132')).movimento).toEqual({ valeTransporte: 13200 });
        // VALE TRANSPORTE 5780 é % do salário: 6% de R$ 2.200,00.
        expect(tipoDaReferencia(ev('5780'))).toBe('percentual');
        expect(ok(lancar('5780', '6')).movimento).toEqual({ valeTransporte: 13200 });
        expect(ok(lancar('5660', '0,56')).movimento).toEqual({ arredondamentoAnterior: 56 });
        expect(erro(lancar('5660', '1,50'))).toContain('R$ 0,99');
    });
});

describe('Lançar evento: avulso calculado pela rotina do IOB', () => {
    it('horas × salário-hora × coeficiente, com as incidências do evento', () => {
        const r = ok(lancar('0211', '10'));
        expect(r.movimento.lancamentos).toEqual([{ descricao: '0211 ADICIONAL NOTURNO 25%', tipo: 'provento', valor: 2500, inss: true, fgts: true, irrf: true }]);
        expect(msg(r)).toContain('10 h × R$ 10,00/h');
    });

    it('dias × diária (salário ÷ 30)', () => {
        expect(ok(lancar('0014', '2')).movimento.lancamentos?.[0].valor).toBe(14667);
    });

    it('% do salário: 0,4 = 40%; 10 = 10% por quinquênio', () => {
        expect(ok(lancar('1056', '1')).movimento.lancamentos?.[0].valor).toBe(88000);
        expect(ok(lancar('0981', '2')).movimento.lancamentos?.[0].valor).toBe(44000);
        expect(erro(lancar('1056', '40'))).toContain('Confira a referência');
    });

    it('valor: desconto sem incidências; relançar substitui o avulso do mesmo código', () => {
        const a = ok(lancar('7001', '45,90'));
        expect(a.movimento.lancamentos).toEqual([{ descricao: '7001 ASSISTENCIA ODONTOLO', tipo: 'desconto', valor: 4590, inss: false, fgts: false, irrf: false }]);
        const b = ok(lancar('7001', '50', a.movimento));
        expect(b.movimento.lancamentos).toHaveLength(1);
        expect(b.movimento.lancamentos?.[0].valor).toBe(5000);
        expect(msg(b)).toContain('substituiu R$ 45,90');
    });

    it('entra no motor como os outros lançamentos avulsos, com o mesmo salário-hora', () => {
        const mov = ok(lancar('0211', '10')).movimento;
        const ficha = { ...fichaVazia({ id: 'emp1', cnpj: '11222333000181' }), id: 'f1', cpf: '52998224725', situacao: 'ativo' as const,
            dados: { ...fichaVazia({ id: 'emp1', cnpj: '11222333000181' }).dados, nome: 'ANA', admissao: '2024-01-02', salario: '2200.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101' } };
        const sc = salarioContratual(ficha.dados);
        expect(sc).toMatchObject({ mensal: SAL.mensal, horasMes: SAL.horasMes });
        const r = calcularMensal({ ficha, competencia: '2026-03', afastamentos: [], tabelas: [INSS], movimento: mov });
        expect(r.verbas.find(v => v.descricao === '0211 ADICIONAL NOTURNO 25%')?.valor).toBe(2500);
        expect(r.bases.inss).toBe(222500);
    });
});

describe('Lançar evento: o que não se lança', () => {
    it('salário, INSS, IRRF, FGTS, bases e arredondamento atual saem do Consultor', () => {
        expect(erro(lancar('0001', '1'))).toContain('ficha do funcionário');
        expect(erro(lancar('5700', '10'))).toContain('INSS, IRRF, FGTS');
        expect(erro(lancar('9920', '10'))).toContain('INSS, IRRF, FGTS');
        expect(erro(lancar('1480', '0,50'))).toContain('arredondamento atual');
    });

    it('coeficiente que não confere com a descrição, coeficiente zero e rotina sem cálculo', () => {
        expect(erro(lancar('1112', '10'))).toContain('não confere com o 20%');
        expect(erro(lancar('0866', '10'))).toContain('coeficiente zero');
        expect(erro(lancar('0843', '1'))).toContain('rotina 140');
    });

    it('evento informativo, tipo fora do padrão e sem salário', () => {
        expect(erro(lancar('0006', '1'))).toContain('informativo');
        expect(erro(lancar('0523', '100'))).toContain('não é vencimento (V) nem desconto (D)');
        expect(erro(lancarEvento(ev('0211'), 10, null, {}))).toContain('sem salário');
    });
});

describe('Lançar evento: leitura da referência e do código', () => {
    it('horas em hh:mm, valores em R$ e números com vírgula', () => {
        expect(lerReferencia('8:30', 'horas')).toBe(8.5);
        expect(lerReferencia('8,5', 'horas')).toBe(8.5);
        expect(lerReferencia('R$ 1.234,56', 'valor')).toBe(123456);
        expect(lerReferencia('45.9', 'valor')).toBe(4590);
        expect(lerReferencia('1.234', 'valor')).toBe(123400);
        expect(lerReferencia('abc', 'valor')).toBeNull();
        expect(lerReferencia('', 'dias')).toBeNull();
        expect(lerReferencia('-2', 'dias')).toBeNull();
    });

    it('aceita o código sem os zeros da frente', () => {
        expect(eventoPorCodigo(eventos, '810')?.descricao).toBe('HORA EXTRA 50%');
        expect(eventoPorCodigo(eventos, '9999x')).toBeNull();
        expect(eventoPorCodigo(eventos, '')).toBeNull();
    });
});
