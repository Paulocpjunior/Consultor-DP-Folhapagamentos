// Item 3b: insalubridade e periculosidade automáticas (dados fictícios).
import { describe, expect, it } from 'vitest';
import { adicionalDeRisco } from '../adicionais';
import { calcularMensal } from '../motorMensal';
import { calcularFerias } from '../motorFerias';
import { calcular13 } from '../motor13';
import { calcularRescisao } from '../motorRescisao';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, validarFicha, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio } from '../../cadastros/afastamentos';
import { tabelaVigente } from '../../cadastros/tabelasLegais';
import { sugerirDePara } from '../../esocial/eventosFolha';
import type { Rubrica } from '../../cadastros/rubricas';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const t = tabelaVigente(TAB, 'salario_minimo', '2026-10');
const MINIMO = 'erro' in t ? 0 : t.tabela.valores.salarioMinimo!;
const ficha = (dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', horasMes: '220', categoria: '101', ...dados } });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;
const mensal = (f: FichaFuncionario, movimento = {}, afastamentos = [] as ReturnType<typeof afastamentoVazio>[]) => calcularMensal({ competencia: '2026-10', pagamento: '2026-10', ficha: f, tabelas: TAB, afastamentos, movimento, folhaPagaNoAdiantamento: null });

describe('adicional de risco pela ficha', () => {
    it('insalubridade sobre o salário mínimo, o salário ou um piso; periculosidade 30% do salário-base', () => {
        expect(MINIMO).toBeGreaterThan(0);
        expect(adicionalDeRisco({ insalubridade: '20' }, 300000, TAB, '2026-10').adicional?.mensal).toBe(Math.round(MINIMO * 0.2));
        expect(adicionalDeRisco({ insalubridade: '40', baseInsalubridade: 'salario' }, 300000, TAB, '2026-10').adicional?.mensal).toBe(120000);
        expect(adicionalDeRisco({ insalubridade: '10', baseInsalubridade: 'valor', baseInsalubridadeValor: '2500.00' }, 300000, TAB, '2026-10').adicional?.mensal).toBe(25000);
        expect(adicionalDeRisco({ periculosidade: 'S' }, 300000, TAB, '2026-10').adicional).toMatchObject({ codigo: 'PERICUL', mensal: 90000 });
        expect(adicionalDeRisco({}, 300000, TAB, '2026-10').adicional).toBeNull();
    });
    it('não se acumulam: vale o maior, com aviso; sem tabela do mínimo, erro', () => {
        const r = adicionalDeRisco({ insalubridade: '20', periculosidade: 'S' }, 300000, TAB, '2026-10');
        expect(r.adicional?.codigo).toBe('PERICUL');
        expect(r.avisos[0]).toContain('não se acumulam');
        expect(adicionalDeRisco({ insalubridade: '20' }, 300000, [], '2026-10').erro).toContain('Tabelas legais');
        expect(adicionalDeRisco({ insalubridade: '15' }, 300000, TAB, '2026-10').erro).toContain('10, 20 ou 40');
    });
    it('a ficha valida a base informada e avisa o acúmulo', () => {
        expect(validarFicha(ficha({ insalubridade: '20', baseInsalubridade: 'valor' })).erros).toContain('Insalubridade sobre valor informado: preencha o valor da base (piso da convenção).');
        expect(validarFicha(ficha({ insalubridade: '20', periculosidade: 'S' })).avisos.some(a => a.includes('não se acumulam'))).toBe(true);
    });
});

describe('no motor mensal', () => {
    it('verba própria com INSS, FGTS e IRRF; entra na hora extra e nas faltas', () => {
        const r = mensal(ficha({ periculosidade: 'S' }), { horasExtras50: 10, faltasDias: 1 });
        const p = r.verbas.find(x => x.codigo === 'PERICUL')!;
        expect(p).toMatchObject({ valor: 90000, inss: true, fgts: true, irrf: true, referencia: '30% · 30 dias' });
        // Hora: (3.000 + 900) ÷ 220 = 17,7272… × 1,5 × 10 h = 265,91.
        expect(v(r, 'HE50')).toBe(Math.round((390000 / 220) * 1.5 * 10));
        // Falta: (3.000 + 900) ÷ 30 = 130,00.
        expect(v(r, 'FALTA')).toBe(13000);
        expect(r.bases.inss).toBeGreaterThan(v(r, 'SAL') + 90000);
    });
    it('proporcional aos dias pagos (admissão no meio do mês)', () => {
        const r = mensal(ficha({ admissao: '2026-10-16', insalubridade: '20' }));
        expect(v(r, 'INSALUB')).toBe(Math.round(Math.round(MINIMO * 0.2) / 30 * 16));
    });
    it('sem a tabela do salário mínimo: incompleto, sem adicional', () => {
        const r = calcularMensal({ competencia: '2026-10', pagamento: '2026-10', ficha: ficha({ insalubridade: '20' }), tabelas: TAB.filter(x => x.tipo !== 'salario_minimo'), afastamentos: [], movimento: {}, folhaPagaNoAdiantamento: null });
        expect(r.situacao).toBe('incompleto');
        expect(v(r, 'INSALUB')).toBe(0);
    });
});

describe('na remuneração de férias, 13º e rescisão', () => {
    it('férias: (salário + adicional) ÷ 30 × dias', () => {
        const gozo = { ...afastamentoVazio(), id: 'g', fichaId: 'f1', motivo: '15', dtInicio: '2026-11-03', dtFim: '2026-11-22', perAquisInicio: '2025-01-02', perAquisFim: '2026-01-01' };
        const f = calcularFerias({ ficha: ficha({ periculosidade: 'S' }), gozo, afastamentos: [gozo], tabelas: TAB, movimentos: {} });
        expect(v(f, 'FER')).toBe(Math.round(390000 / 30 * 20));
    });
    it('13º: (salário + adicional) × avos/12', () => {
        const r = calcular13({ ficha: ficha({ periculosidade: 'S' }), ano: 2026, parcela: '2a', pagamento: '2026-12', afastamentos: [], tabelas: TAB, movimentos: {} } as never);
        expect(r.situacao, [...r.erros, ...r.memoria].join(' | ')).not.toBe('erro');
        expect(r.memoria.find(m => m.startsWith('13º integral'))).toContain('+ adicional de periculosidade R$\u00a0900,00');
    });
    it('rescisão: aviso indenizado sobre a remuneração com o adicional; saldo com o adicional proporcional', () => {
        const r = calcularRescisao({ ficha: ficha({ periculosidade: 'S' }), data: '2026-10-15', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
        expect(v(r, 'AVISO')).toBe(Math.round(390000 / 30 * r.diasAviso));
        expect(v(r, 'PERICUL')).toBe(Math.round(90000 / 30 * 15));
    });
});

describe('no S-1200', () => {
    it('rubricas sugeridas pela natureza: 1202 insalubridade, 1203 periculosidade', () => {
        const rub = (codRubr: string, dscRubr: string, natRubr: string): Rubrica => ({ id: codRubr, empresaId: 'E1', codRubr, ideTabRubr: 'T1', eventoIob: '', origem: '',
            vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr, natRubr, tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] }) as Rubrica;
        const r1 = mensal(ficha({ insalubridade: '20' })); const r2 = { ...mensal(ficha({ periculosidade: 'S' })), fichaId: 'f2' };
        const s = Object.fromEntries(sugerirDePara([r1, r2], [rub('0010', 'INSALUBRIDADE', '1202'), rub('0011', 'PERICULOSIDADE', '1203'), rub('0001', 'SALARIO', '1000')], '2026-10').map(i => [i.chave, i.sugestao?.codRubr ?? null]));
        expect([s.INSALUB, s.PERICUL]).toEqual(['0010', '0011']);
    });
});
