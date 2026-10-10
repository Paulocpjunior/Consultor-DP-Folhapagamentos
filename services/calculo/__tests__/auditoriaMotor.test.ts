// Auditoria do motor (10/2026): fevereiro com afastamento, doença, salário-família no benefício do INSS, Empresa Cidadã,
// adiantamento já pago, pensionista como dependente, rescisão (13º do aviso, média, acordo e IRRF do mês). Dados fictícios.
import { describe, expect, it } from 'vitest';
import { calcularMensal, type Movimento } from '../motorMensal';
import { calcularRescisao } from '../motorRescisao';
import { resumirFolha } from '../../relatorios/resumoFolha';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha = (dados: FichaFuncionario['dados'] = {}, extra: Partial<FichaFuncionario> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725',
    matriculaEsocial: 'M1', situacao: 'ativo', dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados }, ...extra });
const af = (motivo: string, dtInicio: string, dtFim = ''): Afastamento => ({ ...afastamentoVazio(), id: `a${motivo}${dtInicio}`, fichaId: 'f1', motivo, dtInicio, dtFim });
const mensal = (competencia: string, afastamentos: Afastamento[] = [], f = ficha(), movimento?: Movimento, pagamento = competencia) =>
    calcularMensal({ competencia, pagamento, ficha: f, tabelas: TAB, afastamentos, movimento, folhaPagaNoAdiantamento: null });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('dias do mês', () => {
    it('fevereiro inteiro no benefício do INSS ou em licença não remunerada: sem salário (antes, 2 dias)', () => {
        expect(v(mensal('2026-02', [af('03', '2026-01-01')]), 'SAL')).toBe(0);
        expect(v(mensal('2026-02', [af('21', '2026-02-01', '2026-02-28')]), 'SAL')).toBe(0);
    });

    it('doença desde 01/02: a empresa paga os 15 dias (antes, 17)', () => {
        const r = mensal('2026-02', [af('03', '2026-02-01', '2026-04-30')]);
        expect([v(r, 'SAL'), r.verbas.find(x => x.codigo === 'SAL')?.referencia]).toEqual([150000, '15 dias']);
    });

    it('afastamento que acaba no meio de fevereiro: 30 menos os dias fora', () => {
        expect(v(mensal('2026-02', [af('21', '2026-02-09', '2026-02-13')]), 'SAL')).toBe(250000);
    });

    it('licença-maternidade em fevereiro inteiro: 30 dias de salário-maternidade, nenhum de salário', () => {
        const r = mensal('2026-02', [af('17', '2026-01-10', '2026-05-09')]);
        expect([v(r, 'SAL'), v(r, 'MAT')]).toEqual([0, 300000]);
    });

    it('prorrogação da Empresa Cidadã (motivo 18): verba própria, fora da compensação do salário-maternidade', () => {
        const r = mensal('2026-06', [af('18', '2026-05-10', '2026-07-08')]);
        expect([v(r, 'MAT'), v(r, 'MATPRORR')]).toEqual([0, 300000]);
        expect(resumirFolha([r]).encargos.salarioMaternidade).toBe(0);
    });

    it('serviço militar (motivo 29): FGTS sobre os dias afastados', () => {
        const r = mensal('2026-03', [af('29', '2026-03-16', '2026-12-31')]);
        expect(v(r, 'SAL')).toBe(150000);
        expect(r.bases.fgts).toBe(300000);
    });
});

describe('salário-família', () => {
    const filho = { tipo: '03', nome: 'BIA', nascimento: '2018-05-01', cpf: '39053344705', irrf: 'N', salarioFamilia: 'S' };
    const f = ficha({ salario: '1700.00' }, { dependentes: [filho] });
    it('no benefício do INSS desde mês anterior, quem paga é o INSS; no mês em que começa, a empresa', () => {
        const doenca = [af('03', '2026-03-10', '2026-08-31')];
        expect(v(mensal('2026-04', doenca, f), 'SF')).toBe(0);
        expect(v(mensal('2026-03', doenca, f), 'SF')).toBeGreaterThan(0);
    });
});

describe('adiantamento já pago e IRRF', () => {
    it('desligamento depois do dia 20: o desconto é o que foi pago (40% do mês cheio)', () => {
        const f = ficha({ adiantamentoPct: '40', dataDesligamento: '2026-03-27' });
        expect(v(mensal('2026-03', [], f), 'ADIANT')).toBe(120000);
    });

    it('dependente que também recebe pensão deduz só pela pensão', () => {
        const filho = { tipo: '03', nome: 'BIA', nascimento: '2015-01-01', cpf: '39053344705', irrf: 'S', salarioFamilia: 'N', pensao: 'S' };
        const r = mensal('2026-03', [], ficha({ salario: '9000.00' }, { dependentes: [filho] }), { pensaoAlimenticia: 100000 }, '2026-04');
        expect(r.deducoesIrrf?.dependentes).toEqual([]);
        expect(r.avisos.join(' ')).toMatch(/deduzido só pela pensão/);
    });

    it('categorias com regra própria: doméstico e intermitente travam', () => {
        expect(mensal('2026-03', [], ficha({ categoria: '104' })).situacao).toBe('erro');
        expect(mensal('2026-03', [], ficha({ categoria: '111' })).situacao).toBe('erro');
    });
});

describe('rescisão', () => {
    const resc = (p: Partial<Parameters<typeof calcularRescisao>[0]>) => calcularRescisao({ ficha: ficha(), data: '2026-06-10', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {}, ...p });
    it('média de horas extras pelos meses de vínculo (admitido há 3 meses), não ÷ 12', () => {
        const movimentos = { '2026-03': { horasExtras50: 30 }, '2026-04': { horasExtras50: 30 }, '2026-05': { horasExtras50: 30 } };
        const r = resc({ ficha: ficha({ admissao: '2026-03-02' }), movimentos });
        expect(r.memoria.join('\n')).toMatch(/÷ 3 meses de vínculo/);
    });

    it('acordo (484-A) com aviso indenizado: metade, com meio dia', () => {
        const r = resc({ tipo: '33', ficha: ficha({ admissao: '2023-01-02' }) });
        expect(r.diasAviso).toBe(39);
        expect(r.verbas.find(x => x.codigo === 'AVISO')).toMatchObject({ referencia: '19,5 dias', valor: 195000 });
    });

    it('paga no próprio mês com a folha anterior paga nele: o IRRF soma a folha e desconta o já retido', () => {
        const f = ficha({ salario: '6000.00', adiantamentoPct: '40' });
        const movimentos = { '2026-02': { irrfPagamento: '2026-03', irrfRendimentos: 600000, irrfDeducoes: 60000, irrfRetido: 50000 } as Movimento };
        const sem = resc({ ficha: f, data: '2026-03-25', tipo: '07', aviso: 'nao-cumprido', pagamento: '2026-03', movimentos });
        const com = resc({ ficha: f, data: '2026-03-25', tipo: '07', aviso: 'nao-cumprido', pagamento: '2026-03', movimentos, regimePagamento: m => (m === '2026-12' ? '2027-01' : `${m.slice(0, 5)}${String(Number(m.slice(5)) + 1).padStart(2, '0')}`) });
        expect(com.memoria.join('\n')).toMatch(/folha de 02\/2026 paga no mês/);
        expect(v(com, 'IRRF')).toBeGreaterThan(v(sem, 'IRRF'));
    });
});
