import { describe, expect, it } from 'vitest';
import catalogo from '../../../data/eventos-iob-sage.json';
import type { EventoIobSage } from '../../folha/folhaTypes';
import { eventoPorCodigo, lancarEvento, lancarPorValor, lerReferencia, tipoDaReferencia, type Lancado } from '../lancarEvento';
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

// Caso do Alexandre (09/2026, salário R$ 3.138,45 + triênio R$ 89,50): o 1108 TRIENIO do catálogo não tem incidência,
// o triênio saiu da base e o INSS ficou R$ 265,21 em vez dos R$ 275,95 do IOB (base R$ 3.227,95, faixa de 12%).
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { incidenciasDaRubrica, type Rubrica } from '../../cadastros/rubricas';

describe('Lançar evento: incidências da rubrica S-1010 e INSS pela faixa (caso do triênio, 14/10/2026)', () => {
    const tabelas = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `o${i}` }));
    const ficha = { ...fichaVazia({ id: 'e', cnpj: '11222333000181' }), id: 'f', cpf: '52998224725', situacao: 'ativo' as const,
        dados: { nome: 'ALEXANDRE', admissao: '2022-05-02', salario: '3138.45', unidadeSalario: '5', horasSemanais: '44', categoria: '101' } };
    const sal = { mensal: 313845, horasMes: 220 };
    const rubrica: Rubrica = { id: 'r', empresaId: 'e', codRubr: '1108', ideTabRubr: 'T', eventoIob: '', origem: 'S-1010',
        vigencias: [{ iniValid: '2022-01', fimValid: '', recibo: '1', dados: { dscRubr: 'TRIENIO', natRubr: '1003', tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] };

    it('sem rubrica: incidências do catálogo e alerta de provento sem INSS, FGTS e IRRF', () => {
        const r = ok(lancarEvento(ev('1108'), 8950, sal, {}));
        expect(r.movimento.lancamentos?.[0]).toMatchObject({ inss: false, fgts: false, irrf: false });
        expect(msg(r)).toContain('ATENÇÃO: provento sem INSS, FGTS e IRRF');
    });

    it('com a rubrica S-1010 da empresa: INSS, FGTS e IRRF dela, e o INSS bate com o IOB (R$ 275,95, ref. 12%)', () => {
        const inc = incidenciasDaRubrica([rubrica], '1108', '2026-09');
        expect(inc).toMatchObject({ inss: true, fgts: true, irrf: true });
        const r = ok(lancarEvento(ev('1108'), 8950, sal, {}, undefined, inc));
        expect(r.movimento.lancamentos?.[0]).toMatchObject({ valor: 8950, inss: true, fgts: true, irrf: true });
        expect(msg(r)).toContain('rubrica 1108 do S-1010 da empresa');
        expect(msg(r)).not.toContain('ATENÇÃO');
        const m = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha, afastamentos: [], tabelas, movimento: r.movimento });
        const inss = m.verbas.find(v => v.codigo === 'INSS')!;
        expect(m.bases.inss).toBe(322795);
        expect(inss.valor).toBe(27595);
        expect(inss.referencia).toBe('12%');
        expect(m.memoria.join('\n').replace(/ /g, ' ')).toContain('R$ 3.227,95 × 12% − R$ 111,40 (parcela a deduzir)');
    });

    it('a referência do INSS é a alíquota da faixa, nunca a efetiva (8,45% não existe na tabela)', () => {
        const m = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha, afastamentos: [], tabelas, movimento: {} });
        const inss = m.verbas.find(v => v.codigo === 'INSS')!;
        expect([m.bases.inss, inss.valor, inss.referencia]).toEqual([313845, 26521, '12%']);
    });

    it('pensão de 33% sobre a remuneração menos o INSS, como o IOB em 09/2026: R$ 974,16', () => {
        const inc = incidenciasDaRubrica([rubrica], '1108', '2026-09');
        const tri = ok(lancarEvento(ev('1108'), 8950, sal, {}, undefined, inc));
        const m = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha, afastamentos: [], tabelas, movimento: { ...tri.movimento, pensaoPercentual: 33 } });
        const p = m.verbas.find(v => v.codigo === 'PENSAO')!;
        expect([p.valor, p.referencia]).toEqual([97416, '33%']);
        expect(m.memoria.join('\n').replace(/\u00a0/g, ' ')).toContain('33% de (remuneração R$ 3.227,95 − INSS R$ 275,95 = R$ 2.952,00) = R$ 974,16');
        // O valor fixo vale sobre o percentual, com aviso.
        const fixo = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha, afastamentos: [], tabelas, movimento: { ...tri.movimento, pensaoPercentual: 33, pensaoAlimenticia: 3000 } });
        expect(fixo.verbas.find(v => v.codigo === 'PENSAO')!.valor).toBe(3000);
        expect(fixo.avisos.join()).toMatch(/vale sobre o percentual/);
    });

    it('desconto ligado a rubrica de natureza compulsória (9218) sai marcado como compulsório para o consignado (Codex #273)', () => {
        const desc = eventos.find(e => e.tipo === 'D')!;
        const r = ok(lancarPorValor(desc, 5000, {}, 'teste', { inss: false, fgts: false, irrf: false, origem: 'rubrica', natureza: '9218' }, 'Bloqueio de valores'));
        expect(r.movimento.lancamentos?.[0]).toMatchObject({ tipo: 'desconto', compulsorio: true });
        const outro = ok(lancarPorValor(desc, 5000, {}, 'teste', { inss: false, fgts: false, irrf: false, origem: 'rubrica', natureza: '9258' }, 'Convênio'));
        expect(outro.movimento.lancamentos?.[0].compulsorio).toBeUndefined();
        expect(incidenciasDaRubrica([rubrica], '1108', '2026-09')?.natureza).toBe('1003');
    });

    it('rubrica fora da vigência ou de outro evento não vale', () => {
        expect(incidenciasDaRubrica([rubrica], '1015', '2026-09')).toBeNull();
        expect(incidenciasDaRubrica([{ ...rubrica, vigencias: [{ ...rubrica.vigencias[0], iniValid: '2027-01' }] }], '1108', '2026-09')).toBeNull();
    });
});
