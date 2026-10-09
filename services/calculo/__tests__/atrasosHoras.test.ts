// Faltas e atrasos em horas ("FALTAS E ATRASOS (T/H)", evento 5850 do IOB): a equipe digita a referência e o
// motor calcula pelo salário-hora. Conferido com o holerite do IOB da 1200 de 09/2026 (dados trocados).
import { describe, expect, it } from 'vitest';
import { calcularMensal } from '../motorMensal';
import { arredondar } from '../arredondamento';
import { limparMovimento, validarMovimento } from '../movimento';
import { classificarVerba, movimentoDoHolerite } from '../conferenciaHolerites';
import { classificarEvento } from '../movimentosDoBackup';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';
import { sugerirDePara } from '../../esocial/eventosFolha';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2026-05-13', salario: '2700.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', adiantamentoPct: '40', valeTransporte: 'S' } };
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor;

describe('faltas e atrasos em horas', () => {
    it('8 horas: salário-hora × 8, com INSS, FGTS e IRRF; líquido igual ao do IOB (1.150,00)', () => {
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: FICHA, tabelas: TAB, afastamentos: [], movimento: { atrasosHoras: 8 }, folhaPagaNoAdiantamento: null });
        // 2.700,00 ÷ 220 h × 8 = 98,18.
        expect([v(r, 'ATRASO'), v(r, 'ADIANT'), v(r, 'VT'), v(r, 'INSS')]).toEqual([9818, 108000, 16200, 20985]);
        // FGTS: 2.601,82 × 8% = 208,1456; o motor arredonda (208,15) e o holerite do IOB imprimiu 208,14 (truncado),
        // dentro da tolerância de 1 centavo da conferência.
        expect([r.bases.inss, r.bases.fgts, r.fgts]).toEqual([260182, 260182, 20815]);
        expect(r.verbas.find(x => x.codigo === 'ATRASO')?.referencia).toBe('8 h');
        // Com o arredondamento anterior do IOB (0,23): atual 0,26 e líquido 1.150,00.
        const a = arredondar(r, 23);
        expect([v(a, 'ARREDANT'), v(a, 'ARREDATU'), a.totais.liquido]).toEqual([23, 26, 115000]);
    });

    it('hh:mm guardado com 4 casas; até 300 horas', () => {
        expect(limparMovimento({ atrasosHoras: 8 + 20 / 60 }).atrasosHoras).toBe(8.3333);
        expect(validarMovimento({ atrasosHoras: 301 })).toEqual(['Faltas e atrasos (horas): no máximo 300.']);
    });

    it('holerite e histórico do IOB: "FALTAS E ATRASOS (T/H)" é hora, não dia de falta', () => {
        const verba = { codigo: '5850', descricao: 'FALTAS E ATRASOS (T/H)', referencia: '8,00', provento: 0, desconto: 9818 };
        expect(classificarVerba(verba)).toBe('ATRASO');
        expect(classificarVerba({ ...verba, descricao: 'FALTAS', referencia: '2,00' })).toBe('FALTA');
        expect(classificarVerba({ ...verba, descricao: 'FALTAS EM HORAS' })).toBe('ATRASO');
        const { movimento } = movimentoDoHolerite({ nome: 'ANA', competencia: '2026-09', verbas: [verba], totalProventos: null, totalDescontos: null, liquido: null, baseInss: null, baseFgts: null, fgtsMes: null, baseIrrf: null, avisos: [] } as never);
        expect([movimento.atrasosHoras, movimento.faltasDias]).toEqual([8, undefined]);
        expect(classificarEvento('9207', 'FALTAS E ATRASOS (T/H)')).toBe('atrasosHoras');
        expect(classificarEvento('9207', 'FALTAS')).toBe('faltasDias');
        expect(classificarEvento('', 'ATRASOS')).toBe('atrasosHoras');
        expect([classificarEvento('', 'FALTAS EM HORAS'), classificarEvento('9211', 'FALTAS EM HORAS')]).toEqual(['atrasosHoras', 'atrasosHoras']);
    });

    it('de/para do eSocial: FALTAS e FALTAS E ATRASOS (T/H), ambas 9207, cada uma na sua verba (Codex #120)', () => {
        const rub = (cod: string, dsc: string): Rubrica => ({ id: cod, empresaId: 'E1', codRubr: cod, ideTabRubr: 'T1', eventoIob: '', origem: '',
            vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: '9207', tpRubr: '2', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] });
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha: FICHA, tabelas: TAB, afastamentos: [], movimento: { faltasDias: 1, atrasosHoras: 2 } });
        const s = Object.fromEntries(sugerirDePara([r], [rub('5800', 'FALTAS'), rub('5850', 'FALTAS E ATRASOS (T/H)'), rub('5810', 'DSR S/ FALTAS')], '2026-09').map(i => [i.chave, i.sugestao?.codRubr ?? null]));
        expect([s.FALTA, s.ATRASO]).toEqual(['5800', '5850']);
        const r9211 = { ...rub('5850', 'FALTAS E ATRASOS (T/H)') };
        r9211.vigencias = [{ ...r9211.vigencias[0], dados: { ...r9211.vigencias[0].dados, natRubr: '9211' } }];
        expect(sugerirDePara([r], [rub('5800', 'FALTAS'), r9211], '2026-09').find(i => i.chave === 'ATRASO')?.sugestao?.codRubr).toBe('5850');
    });
});

describe('horas mês da ficha (divisor do salário-hora)', () => {
    it('com 42,3 h semanais, semanais × 5 = 211,5 h; com horas mês 220 na ficha, 8 h = 98,18 como no IOB', () => {
        const ficha = (horasMes?: string): FichaFuncionario => ({ ...FICHA, dados: { ...FICHA.dados, horasSemanais: '42.3', ...(horasMes ? { horasMes } : {}) } });
        const calc = (f: FichaFuncionario) => calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: f, tabelas: TAB, afastamentos: [], movimento: { atrasosHoras: 8 }, folhaPagaNoAdiantamento: null });
        expect(v(calc(ficha()), 'ATRASO')).toBe(10213); // 2.700,00 ÷ 211,5 × 8
        const r = calc(ficha('220'));
        expect(v(r, 'ATRASO')).toBe(9818);
        expect(r.memoria.join(' ')).toMatch(/salário ÷ 220 h/);
    });
});
