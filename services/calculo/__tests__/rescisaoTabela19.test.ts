// Motivos da Tabela 19 (leiaute S-1.3, tabela oficial do eSocial) acrescentados ao motor: 08, 27, 41, 42, 47 e 48.
import { describe, expect, it } from 'vitest';
import { calcularRescisao, CATEGORIAS_DO_MOTIVO, PERMITE_SAQUE_FGTS, TIPOS_RESCISAO, type EntradaRescisao } from '../motorRescisao';
import { fichaVazia, MOTIVOS_DESLIGAMENTO, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import { seguroDesemprego } from '../../demissoes/efetivacao';

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
const tem = (r: ReturnType<typeof calcularRescisao>, c: string) => r.verbas.some(x => x.codigo === c && x.valor > 0);

describe('motivos novos da Tabela 19', () => {
    it('encerramento (47) e falecimento do empregador individual (48): como a dispensa, com aviso, multa de 40% e saque', () => {
        const base = calc({ tipo: '02', saldoFgts: 1_000_000 });
        for (const tipo of ['47', '48'] as const) {
            const r = calc({ tipo, saldoFgts: 1_000_000 });
            expect(r.situacao).not.toBe('erro');
            expect([r.diasAviso, r.dataProjetada, r.percentualMulta, r.multaFgts]).toEqual([base.diasAviso, base.dataProjetada, 40, base.multaFgts]);
            expect(r.verbas.map(x => [x.codigo, x.valor])).toEqual(base.verbas.map(x => [x.codigo, x.valor]));
            expect(r.saqueFgts).toMatch(/art. 20, I e II\), com a multa de 40%/);
            expect(PERMITE_SAQUE_FGTS).toContain(tipo);
        }
    });
    it('força maior (27): sem aviso, proporcionais integrais, multa de 20% e saque', () => {
        const r = calc({ tipo: '27', saldoFgts: 1_000_000 });
        expect(tem(r, 'AVISO')).toBe(false);
        expect(r.dataProjetada).toBe('2026-03-10');
        expect(tem(r, '13PROP') && tem(r, 'FP')).toBe(true);
        expect(r.percentualMulta).toBe(20);
        expect(r.saqueFgts).toMatch(/multa de 20%/);
        expect(r.avisos.join(' ')).toMatch(/art. 501/);
    });
    it('por interesse do empregado (08): sem aviso de nenhuma parte, sem multa e sem saque', () => {
        const r = calc({ tipo: '08', aviso: 'nao-cumprido' });
        expect(tem(r, 'AVISO') || tem(r, 'AVISODESC')).toBe(false);
        expect([r.percentualMulta, r.saqueFgts]).toEqual([0, 'Sem saque do FGTS por este motivo.']);
        expect(tem(r, '13PROP') && tem(r, 'FP')).toBe(true);
    });
    it('aprendiz (41 e 42): só a categoria 103; sem aviso, sem arts. 479/480, sem multa', () => {
        const aprendiz = { ...ficha(), dados: { ...ficha().dados, categoria: '103', fimContrato: '2026-12-31' } };
        for (const tipo of ['41', '42'] as const) {
            const r = calc({ tipo, ficha: aprendiz });
            expect(r.situacao).not.toBe('erro');
            expect(tem(r, 'AVISO') || tem(r, 'ART479')).toBe(false);
            expect(r.percentualMulta).toBe(0);
            expect(r.memoria.join(' ')).toMatch(/art. 433, § 2º/);
            expect(calc({ tipo }).erros[0]).toMatch(/só para o aprendiz \(categoria 103\)/);
        }
        expect(CATEGORIAS_DO_MOTIVO['47']?.exceto).toEqual(['104']);
        const domestico = { ...ficha(), dados: { ...ficha().dados, categoria: '104' } };
        expect(calc({ tipo: '48', ficha: domestico }).erros[0]).toMatch(/o dele é o 49/);
    });
    it('seguro-desemprego: dispensa, indireta, encerramento e falecimento do empregador; não na força maior', () => {
        const f = { ...ficha(), dados: { ...ficha().dados, admissao: '2020-01-02' } };
        expect(['02', '17', '47', '48', '27', '08'].map(tipo => seguroDesemprego(f, { tipo, data: '2026-03-10' } as never).cabe)).toEqual([true, true, true, true, false, false]);
    });
    it('todos os motivos do motor estão na lista da ficha', () => {
        const daFicha = new Set(MOTIVOS_DESLIGAMENTO.map(([c]) => c));
        expect(Object.keys(TIPOS_RESCISAO).filter(c => !daFicha.has(c))).toEqual([]);
    });
});
