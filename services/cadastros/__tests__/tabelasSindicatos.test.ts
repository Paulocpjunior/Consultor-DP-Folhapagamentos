import { describe, expect, it } from 'vitest';
import { coeficienteDeTexto, inssProgressivo, tabelaVazia, textoCoeficiente, tabelaVigente, tetoInss, validarTabela, type TabelaLegal } from '../tabelasLegais';
import { normalizarSindicato, sindicatoVazio, situacaoConvencao, validarSindicato } from '../sindicatos';

// Valores FICTÍCIOS, só para testar a mecânica. As tabelas reais são digitadas
// pelo usuário a partir da norma oficial.
const inss = (vigencia: string, id = vigencia): TabelaLegal => ({
    id, tipo: 'inss', vigencia, norma: 'Portaria fictícia de teste', observacao: '', valores: {},
    faixas: [{ ate: 100000, aliquota: 7.5, deducao: 0 }, { ate: 200000, aliquota: 9, deducao: 0 }, { ate: 300000, aliquota: 12, deducao: 0 }, { ate: 400000, aliquota: 14, deducao: 0 }],
});

describe('tabelas legais', () => {
    it('exige norma, vigência AAAA-MM, faixas crescentes e teto no INSS', () => {
        expect(validarTabela(inss('2026-01'))).toEqual([]);
        const ruim = { ...inss('2026-13'), norma: '', faixas: [{ ate: 2000, aliquota: 7.5, deducao: 0 }, { ate: 1000, aliquota: 0, deducao: -1 }, { ate: null, aliquota: 150, deducao: 0 }] };
        expect(validarTabela(ruim)).toEqual([
            'Vigência deve ser um mês no formato AAAA-MM.',
            'Informe a norma de onde saíram os valores (ex.: portaria, lei, instrução normativa).',
            'Faixa 2: limite deve ser maior que o da faixa anterior.',
            'Faixa 2: parcela a deduzir inválida.',
            'Faixa 2: alíquota do INSS não pode ser zero.',
            'Faixa 3: informe o teto.',
            'Faixa 3: alíquota entre 0 e 100.',
        ]);
    });

    it('IRRF aceita última faixa aberta e exige dedução por dependente e desconto simplificado', () => {
        const irrf: TabelaLegal = { ...tabelaVazia('irrf'), id: 'i', vigencia: '2026-01', norma: 'Lei fictícia de teste', faixas: [{ ate: 200000, aliquota: 0, deducao: 0 }, { ate: null, aliquota: 27.5, deducao: 50000 }] };
        expect(validarTabela(irrf)).toEqual(['Informe dedução por dependente.', 'Informe desconto simplificado mensal.']);
        expect(validarTabela({ ...irrf, valores: { deducaoDependente: 10000, descontoSimplificado: 50000 } })).toEqual([]);
        // Redutor: opcional, mas vai completo
        const base = { deducaoDependente: 10000, descontoSimplificado: 50000 };
        const redutor = { redutorAte: 300000, redutorMaximo: 20000, redutorLimite: 400000, redutorConstante: 60000, redutorCoeficiente: 150000 };
        expect(validarTabela({ ...irrf, valores: { ...base, ...redutor } })).toEqual([]);
        expect(validarTabela({ ...irrf, valores: { ...base, redutorAte: 300000 } })).toHaveLength(4);
        expect(validarTabela({ ...irrf, valores: { ...base, ...redutor, redutorLimite: 300000 } })).toEqual(['Redutor: o limite da redução parcial deve ser maior que o da redução total.']);
        expect(validarTabela({ ...irrf, valores: { ...base, ...redutor, redutorCoeficiente: 1_000_000 } })[0]).toContain('menor que 1');
        expect(coeficienteDeTexto('0,133145')).toBe(133145);
        expect(coeficienteDeTexto(',5')).toBe(500000);
        expect(coeficienteDeTexto('1,2')).toBeNull();
        expect(textoCoeficiente(133145)).toBe('0,133145');
        const meio = { ...irrf, faixas: [{ ate: null, aliquota: 0, deducao: 0 }, { ate: 100, aliquota: 1, deducao: 0 }], valores: { deducaoDependente: 1, descontoSimplificado: 1 } };
        expect(validarTabela(meio)).toEqual(['Faixa 1: informe o limite; só a última faixa pode ficar sem limite.']);
    });

    it('salário mínimo e salário-família sem faixas, só valores', () => {
        const sm: TabelaLegal = { ...tabelaVazia('salario_minimo'), id: 's', vigencia: '2026-01', norma: 'Decreto fictício' };
        expect(sm.faixas).toEqual([]);
        expect(validarTabela(sm)).toEqual(['Informe salário mínimo mensal.']);
        expect(validarTabela({ ...sm, valores: { salarioMinimo: 100000 } })).toEqual([]);
    });

    it('não aceita duas tabelas do mesmo tipo e vigência', () => {
        expect(validarTabela(inss('2026-01', 'b'), [inss('2026-01', 'a')])).toEqual(['Já existe uma tabela deste tipo com esta vigência.']);
        expect(validarTabela(inss('2026-01', 'a'), [inss('2026-01', 'a')])).toEqual([]);
    });

    it('tabela vigente: maior vigência até a competência; antes da primeira e duplicada viram erro', () => {
        const lista = [inss('2025-01'), inss('2026-01'), inss('2026-07')];
        expect(tabelaVigente(lista, 'inss', '2026-06')).toEqual({ tabela: lista[1] });
        expect(tabelaVigente(lista, 'inss', '2026-07')).toEqual({ tabela: lista[2] });
        expect(tabelaVigente(lista, 'inss', '2024-12')).toEqual({ erro: 'Nenhuma tabela de INSS do segurado (progressiva) vigente em 12/2024.' });
        expect(tabelaVigente(lista, 'irrf', '2026-06')).toHaveProperty('erro');
        expect(tabelaVigente([...lista, inss('2026-01', 'dup')], 'inss', '2026-03')).toEqual({ erro: 'Duas tabelas de INSS do segurado (progressiva) com vigência 01/2026: corrija antes de usar.' });
        expect(tabelaVigente(lista, 'inss', '2026-1')).toEqual({ erro: 'Competência inválida.' });
    });

    it('INSS progressivo faixa a faixa, limitado ao teto', () => {
        const t = inss('2026-01');
        expect(inssProgressivo(100000, t)).toBe(7500);
        expect(inssProgressivo(150000, t)).toBe(7500 + 4500);
        expect(inssProgressivo(400000, t)).toBe(7500 + 9000 + 12000 + 14000);
        expect(inssProgressivo(999999, t)).toBe(inssProgressivo(400000, t));
        expect(tetoInss(t)).toBe(400000);
    });
});

describe('sindicatos', () => {
    const s = normalizarSindicato({ ...sindicatoVazio(), cnpj: '11.222.333/0001-81', nome: ' Sindicato Teste ', dataBase: '5', uf: 'sp', pisoSalarial: 180000, vigenciaInicio: '2026-05-01', vigenciaFim: '2027-04-30' });

    it('normaliza: id é o CNPJ', () => {
        expect(s).toMatchObject({ id: '11222333000181', cnpj: '11222333000181', nome: 'Sindicato Teste', uf: 'SP' });
        expect(validarSindicato(s)).toEqual([]);
    });

    it('valida CNPJ, duplicidade, data-base, piso sem vigência e troca de CNPJ', () => {
        expect(validarSindicato(s, [s])).toEqual(['Já existe um sindicato com este CNPJ.']);
        expect(validarSindicato(s, [s], s.id)).toEqual([]);
        expect(validarSindicato({ ...s, cnpj: '11222333000182' }, [], s.id)).toEqual(['CNPJ inválido.', 'O CNPJ identifica o sindicato e não pode ser trocado; cadastre outro.']);
        expect(validarSindicato({ ...s, nome: '', dataBase: '13', uf: 'XX', pisoSalarial: -1, vigenciaInicio: '', vigenciaFim: '2026-02-30' })).toEqual([
            'Informe o nome.', 'Data-base deve ser um mês de 1 a 12.', 'UF inválida.', 'Piso salarial inválido.',
            'Fim da vigência da convenção: data inválida.', 'Informe o início da vigência da convenção de onde saiu o piso ou o registro.',
        ]);
    });

    it('valida a guia sindical do calendário (dia, meses, descrição)', () => {
        expect(validarSindicato(normalizarSindicato({ ...s, guiaDia: '10', guiaMeses: ' 3, 9 ', guiaDescricao: 'Assistencial' }))).toEqual([]);
        expect(validarSindicato(normalizarSindicato({ ...s, guiaDia: '31', guiaMeses: 'TODOS' }))).toEqual([]);
        expect(validarSindicato({ ...s, guiaDia: '32', guiaMeses: '3, 13' })).toEqual([
            'Guia sindical: o dia de vencimento deve ser de 1 a 31.', 'Guia sindical: meses devem ser "todos" ou números de 1 a 12 separados por vírgula.',
        ]);
        expect(validarSindicato({ ...s, guiaMeses: 'todos' })).toEqual(['Guia sindical: informe o dia de vencimento.']);
    });

    it('situação da convenção pela data', () => {
        expect(situacaoConvencao(s, '2026-10-04')).toBe('vigente');
        expect(situacaoConvencao(s, '2027-04-01')).toBe('a vencer');
        expect(situacaoConvencao(s, '2027-05-01')).toBe('vencida');
        expect(situacaoConvencao({ ...s, vigenciaFim: '' }, '2026-10-04')).toBe('sem');
    });
});
