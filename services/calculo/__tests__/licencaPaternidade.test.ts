// Licença-paternidade da Lei 15.371/2026 (Tabela 18, motivos 46 a 52, a partir de 01/01/2027). Dados fictícios.
import { describe, expect, it } from 'vitest';
import { calcularMensal, type EntradaCalculo } from '../motorMensal';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, avisoDuracaoPaternidade, type Afastamento } from '../../cadastros/afastamentos';
import { BASE_CP, COD_INC_CP } from '../../cadastros/rubricas';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import { avisosNaturezaLicenca, MODELOS, modeloDaVerba, modelosEm, pedidoDaVerba, pedidoVazio, validarPedido, type PedidoS1010 } from '../../esocial/tabelaRubricas';
import { SUGESTAO } from '../../esocial/eventosFolha';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria Interministerial MPS/MF 6/2025', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei 15.270/2025', observacao: '',
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }],
    valores: { deducaoDependente: 18959, descontoSimplificado: 60720, redutorAte: 500000, redutorMaximo: 31289, redutorLimite: 735000, redutorConstante: 97862, redutorCoeficiente: 133145 } };
const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia(EMP), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dependentes: [],
    dados: { nome: 'JOAO', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const afast = (a: Partial<Afastamento>): Afastamento => ({ ...afastamentoVazio(), id: a.id ?? 'a', fichaId: 'f1', ...a });
const calc = (afastamentos: Afastamento[], f = ficha()) => calcularMensal({ competencia: '2027-01', afastamentos, tabelas: [INSS, IR], ficha: f } as EntradaCalculo);
const valor = (r: ReturnType<typeof calcularMensal>, codigo: string) => r.verbas.find(v => v.codigo === codigo)?.valor ?? 0;

describe('licença-paternidade (Lei 15.371/2026)', () => {
    it('motivo 46: os dias saem do salário e viram salário-paternidade, com INSS, FGTS e IRRF', () => {
        const r = calc([afast({ dtInicio: '2027-01-11', dtFim: '2027-01-20', motivo: '46' })]);
        // Mês comercial, como na maternidade: em janeiro os 21 dias trabalhados e a licença completa os 30.
        expect(valor(r, 'SAL')).toBe(210000);
        expect(valor(r, 'PAT')).toBe(90000);
        expect(r.verbas.find(v => v.codigo === 'PAT')).toMatchObject({ referencia: '9 dias', inss: true, fgts: true, irrf: true });
        expect(valor(r, 'INSS')).toBe(25341);
        expect(r.fgts).toBe(24000);
        expect(r.avisos.join(' ')).toMatch(/reembolso à empresa depende do regulamento/);
    });
    it('prorrogação da Empresa Cidadã (47) em verba própria, paga pela empresa', () => {
        const r = calc([afast({ id: 'a', dtInicio: '2027-01-11', dtFim: '2027-01-20', motivo: '46' }), afast({ id: 'b', dtInicio: '2027-01-21', dtFim: '2027-02-04', motivo: '47' })]);
        expect(valor(r, 'SAL')).toBe(100000);
        expect(valor(r, 'PATPRORR')).toBe(110000);
        expect(valor(r, 'PAT')).toBe(90000); // mês comercial: 30 dias no total
        expect(r.totais.proventos).toBe(300000);
    });
    it('doméstico: o INSS paga o salário-paternidade; o empregador recolhe o FGTS desses dias', () => {
        const r = calc([afast({ dtInicio: '2027-01-11', dtFim: '2027-01-20', motivo: '46' })], ficha({ categoria: '104' }));
        expect(valor(r, 'PAT')).toBe(0);
        expect(valor(r, 'SAL')).toBe(210000);
        expect(r.bases.fgts).toBe(210000 + 100000);
        expect(r.memoria.join('\n')).toMatch(/art\. 28, V/);
    });
    it('duração do motivo 46: 10 dias em 2027, 15 em 2028, 20 em 2029', () => {
        expect(avisoDuracaoPaternidade({ motivo: '46', dtInicio: '2027-03-01', dtFim: '2027-03-10' })).toBe('');
        expect(avisoDuracaoPaternidade({ motivo: '46', dtInicio: '2027-03-01', dtFim: '2027-03-11' })).toMatch(/^Licença-paternidade de 11 dias: a Lei 15.371\/2026 prevê 10 dias/);
        expect(avisoDuracaoPaternidade({ motivo: '46', dtInicio: '2028-03-01', dtFim: '2028-03-15' })).toBe('');
        expect(avisoDuracaoPaternidade({ motivo: '46', dtInicio: '2029-03-01', dtFim: '2029-03-21' })).toMatch(/condição fiscal/);
        expect(avisoDuracaoPaternidade({ motivo: '47', dtInicio: '2027-03-01', dtFim: '2027-03-30' })).toBe('');
    });
    it('rubrica: codIncCP 23 a 28, modelo 4052 e de/para do motor', () => {
        expect(['23', '24', '27', '28'].every(c => COD_INC_CP[c] && BASE_CP.includes(c))).toBe(true);
        // Modelo só a partir de 12/2026 (natureza 4052 e codIncCP 23).
        expect(MODELOS.some(m => m.chave === 'PAT') || modelosEm('2026-11').some(m => m.chave === 'PAT') || modeloDaVerba('PAT', '2026-11')).toBeFalsy();
        expect(modeloDaVerba('PAT', '2027-01')?.dados).toMatchObject({ natRubr: '4052', tpRubr: '1', codIncCP: '23', codIncIRRF: '11', codIncFGTS: '11' });
        expect(pedidoDaVerba('E1', { chave: 'PAT', descricao: 'Salário-paternidade', tipo: 'provento' }, [], '2027-01').dados?.natRubr).toBe('4052');
        expect(SUGESTAO.PAT.naturezas).toEqual(['4052']);
        const d = { dscRubr: 'Salário-paternidade', natRubr: '4052', tpRubr: '1', codIncCP: '23', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' };
        const ped = (iniValid: string): PedidoS1010 => ({ ...pedidoVazio('E1'), id: 'E1_p1', codRubr: 'PAT', ideTabRubr: 'T1', iniValid, dados: d });
        expect(validarPedido(ped('2026-10'), [], '2026-10').erros.join(' ')).toMatch(/só aceita a partir de 14\/12\/2026/);
        expect(validarPedido(ped('2026-12'), [], '2026-12').avisos.join(' ')).toMatch(/só aceita a partir de 14\/12\/2026/);
        expect(validarPedido(ped('2027-01'), [], '2027-01')).toEqual({ erros: [], avisos: [] });
        expect(avisosNaturezaLicenca({ ...d, codIncCP: '11' })).toHaveLength(1);
        expect(avisosNaturezaLicenca({ ...d, natRubr: '4050', codIncCP: '11' })[0]).toMatch(/salário-maternidade/);
        expect(avisosNaturezaLicenca({ ...d, natRubr: '4050', codIncCP: '21' })).toEqual([]);
    });
});
