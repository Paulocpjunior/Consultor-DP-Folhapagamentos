import { describe, expect, it } from 'vitest';
import { calcularMensal, competenciaSeguinte, diasDsr, noMes, type EntradaCalculo } from '../motorMensal';
import { feriasDaCompetencia } from '../motorFerias';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

// Tabelas de teste com os valores publicados para 2025 e o redutor da Lei 15.270/2025.
const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria Interministerial MPS/MF 6/2025', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const FAIXAS_IR = [
    { ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 },
    { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 },
];
const IR_2025: TabelaLegal = { id: 'r1', tipo: 'irrf', vigencia: '2025-05', norma: 'Lei 15.191/2025', observacao: '', faixas: FAIXAS_IR, valores: { deducaoDependente: 18959, descontoSimplificado: 60720 } };
const IR_2026: TabelaLegal = { ...IR_2025, id: 'r2', vigencia: '2026-01', norma: 'Lei 15.270/2025',
    valores: { ...IR_2025.valores, redutorAte: 500000, redutorMaximo: 31289, redutorLimite: 735000, redutorConstante: 97862, redutorCoeficiente: 133145 } };
const SF: TabelaLegal = { id: 's', tipo: 'salario_familia', vigencia: '2025-01', norma: 'Portaria Interministerial MPS/MF 6/2025', observacao: '', faixas: [], valores: { cotaSalarioFamilia: 6500, limiteSalarioFamilia: 190604 } };
const TABELAS = [INSS, IR_2025, IR_2026, SF];

const EMP = { id: 'emp1', cnpj: '11222333000181' };
function ficha(dados: FichaFuncionario['dados'], dependentes: FichaFuncionario['dependentes'] = []): FichaFuncionario {
    return { ...fichaVazia(EMP), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dependentes,
        dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } };
}
const afast = (a: Partial<Afastamento>): Afastamento => ({ ...afastamentoVazio(), id: 'a', fichaId: 'f1', ...a });
const calc = (p: Partial<EntradaCalculo> & { ficha: FichaFuncionario }) => calcularMensal({ competencia: '2026-03', afastamentos: [], tabelas: TABELAS, ...p });
const valor = (r: ReturnType<typeof calcularMensal>, codigo: string) => r.verbas.find(v => v.codigo === codigo)?.valor ?? 0;

describe('motor do cálculo mensal', () => {
    it('competência antes do reajuste: salário do histórico dos S-2200/S-2206, com a memória', () => {
        const f = { ...ficha({ salario: '3300.00' }), historicoSalario: [{ desde: '2024-01-02', salario: '3000.00', unidade: '5', origem: 'S-2200 · 1' }, { desde: '2026-03-01', salario: '3300.00', unidade: '5', origem: 'S-2206 · 2' }] };
        const antes = calc({ ficha: f, competencia: '2026-02' });
        expect(valor(antes, 'SAL')).toBe(300000);
        expect(antes.memoria.join('\n')).toContain('Salário de 02/01/2024 (S-2200), vigente na competência');
        const depois = calc({ ficha: f, competencia: '2026-03' });
        expect(valor(depois, 'SAL')).toBe(330000);
        expect(depois.memoria.join('\n')).not.toContain('vigente na competência');
    });

    it('mês inteiro: INSS progressivo e IRRF zerado pelo desconto simplificado', () => {
        const r = calc({ ficha: ficha({}), competencia: '2026-01' });
        expect(r.situacao).toBe('calculado');
        expect(r.pagamento).toBe('2026-02');
        expect(valor(r, 'SAL')).toBe(300000);
        expect(valor(r, 'INSS')).toBe(25341); // 113,85 + 114,83 + 24,73
        expect(valor(r, 'IRRF')).toBe(0);
        expect(r.fgts).toBe(24000);
        expect(r.totais).toEqual({ proventos: 300000, descontos: 25341, liquido: 274659 });
        expect(r.memoria.join('\n')).toContain('desconto simplificado R$');
    });

    it('IRRF com o redutor parcial de 2026 (rendimentos entre 5.000 e 7.350)', () => {
        const r = calc({ ficha: ficha({ salario: '6000.00' }), competencia: '2026-01' });
        expect(valor(r, 'INSS')).toBe(64960);
        // base 6.000 − 649,60 = 5.350,40 → 27,5% − 908,73 = 562,63; redutor 978,62 − 0,133145 × 6.000 = 179,75
        expect(valor(r, 'IRRF')).toBe(38288);
        expect(r.memoria.some(m => m.startsWith('Redutor: R$') && m.includes('179,75'))).toBe(true);
    });

    it('redutor total até 5.000 e tabela pelo mês do PAGAMENTO (caixa)', () => {
        const em2026 = calc({ ficha: ficha({ salario: '4500.00' }), competencia: '2026-01' });
        expect(valor(em2026, 'IRRF')).toBe(0);
        // Folha de 12/2025 paga em 01/2026 já usa a tabela de 2026; paga em 12/2025, não.
        const dez = calc({ ficha: ficha({ salario: '4500.00' }), competencia: '2025-12' });
        expect(dez.pagamento).toBe('2026-01');
        expect(valor(dez, 'IRRF')).toBe(0);
        const mesmoMes = calc({ ficha: ficha({ salario: '4500.00' }), competencia: '2025-12', pagamento: '2025-12' });
        expect(valor(mesmoMes, 'IRRF')).toBe(20039); // (4.500 − 607,20) × 22,5% − 675,49
    });

    it('IRRF até R$ 10,00 não é retido', () => {
        const r = calc({ ficha: ficha({ salario: '3107.20' }), competencia: '2025-05', pagamento: '2025-06' });
        expect(valor(r, 'IRRF')).toBe(0);
        expect(r.memoria.join('\n')).toMatch(/R\$\s5,34 não retido/);
    });

    it('dependentes e pensão entram nas deduções legais quando passam do simplificado', () => {
        const dep = { tipo: '03', nome: 'FILHO', nascimento: '2010-01-01', cpf: '', irrf: 'S', salarioFamilia: 'N' };
        const r = calc({ ficha: ficha({ salario: '8000.00' }, [dep, { ...dep, nome: 'FILHA' }]), competencia: '2025-06', pagamento: '2025-07', movimento: { pensaoAlimenticia: 100000 } });
        const inss = valor(r, 'INSS');
        expect(inss).toBe(Math.round(11385 + 11482.92 + 16763.4 + (800000 - 419083) * 0.14));
        const base = 800000 - (inss + 2 * 18959 + 100000);
        expect(valor(r, 'IRRF')).toBe(Math.round(base * 0.275) - 90873);
        expect(valor(r, 'PENSAO')).toBe(100000);
    });

    it('admissão no meio do mês: proporcional pelos dias do vínculo', () => {
        const r = calc({ ficha: ficha({ admissao: '2026-03-16' }) });
        expect(valor(r, 'SAL')).toBe(160000); // 16 dias × 100,00
        expect(r.avisos.join(' ')).toContain('Mês parcial');
    });

    it('doença: empresa paga 15 dias; do 16º em diante sai do salário', () => {
        const r = calc({ ficha: ficha({}), afastamentos: [afast({ dtInicio: '2026-03-10', motivo: '03' })] });
        expect(valor(r, 'SAL')).toBe(240000); // trabalhados 1 a 24/03; INSS desde 25/03
        expect(r.fgts).toBe(19200);
        const acid = calc({ ficha: ficha({}), afastamentos: [afast({ dtInicio: '2026-03-10', motivo: '01' })] });
        expect(acid.bases.fgts).toBe(300000); // acidente do trabalho: FGTS sobre os dias com o INSS
        const mesmo = calc({ ficha: ficha({}), afastamentos: [afast({ dtInicio: '2026-03-10', motivo: '03', infoMesmoMtv: 'S' })] });
        expect(valor(mesmo, 'SAL')).toBe(90000); // 9 dias
    });

    it('fevereiro: mês inteiro vale 30; afastados saem de 30', () => {
        expect(valor(calc({ ficha: ficha({}), competencia: '2026-02' }), 'SAL')).toBe(300000);
        const r = calc({ ficha: ficha({}), competencia: '2026-02', afastamentos: [afast({ dtInicio: '2026-02-01', dtFim: '2026-02-10', motivo: '21' })] });
        expect(valor(r, 'SAL')).toBe(200000);
    });

    it('licença-maternidade vira salário-maternidade; férias deixam o cálculo incompleto', () => {
        const mat = calc({ ficha: ficha({}), afastamentos: [afast({ dtInicio: '2026-01-10', dtFim: '2026-05-09', motivo: '17' })] });
        expect(valor(mat, 'SAL')).toBe(0);
        expect(valor(mat, 'MAT')).toBe(300000);
        expect(valor(mat, 'INSS')).toBe(25341);
        const fer = calc({ ficha: ficha({}), afastamentos: [afast({ dtInicio: '2026-03-02', dtFim: '2026-03-31', motivo: '15' })] });
        expect(fer.situacao).toBe('incompleto');
        expect(valor(fer, 'SAL')).toBe(0); // 30 dias de férias em março: salário + férias fecham 30 (mês comercial)
    });

    it('horas extras com DSR e faltas', () => {
        expect(diasDsr('2026-03')).toEqual({ uteis: 26, descanso: 5 });
        expect(diasDsr('2026-04')).toEqual({ uteis: 25, descanso: 5 }); // 4 domingos + 21/04; Sexta-feira Santa fica para lei local
        expect(diasDsr('2026-04', 1)).toEqual({ uteis: 24, descanso: 6 });
        const r = calc({ ficha: ficha({ salario: '2200.00' }), movimento: { horasExtras50: 10, horasExtras100: 2, faltasDias: 1, dsrDescontadoDias: 1 } });
        expect(valor(r, 'HE50')).toBe(15000);
        expect(valor(r, 'HE100')).toBe(4000);
        expect(valor(r, 'DSRHE')).toBe(Math.round(19000 / 26 * 5));
        expect(valor(r, 'FALTA')).toBe(Math.round(220000 / 30));
        expect(r.bases.inss).toBe(220000 + 19000 + Math.round(19000 / 26 * 5) - 2 * Math.round(220000 / 30));
    });

    it('salário por hora usa as horas semanais × 5', () => {
        const r = calc({ ficha: ficha({ salario: '10.00', unidadeSalario: '1', horasSemanais: '40' }) });
        expect(valor(r, 'SAL')).toBe(200000);
    });

    it('salário-família até o mês em que o filho faz 14 anos, proporcional na admissão', () => {
        const filho = { tipo: '03', nome: 'FILHO', nascimento: '2012-03-10', cpf: '', irrf: 'N', salarioFamilia: 'S' };
        expect(valor(calc({ ficha: ficha({ salario: '1800.00' }, [filho]) }), 'SF')).toBe(6500);
        expect(valor(calc({ ficha: ficha({ salario: '1800.00' }, [filho]), competencia: '2026-04' }), 'SF')).toBe(0);
        expect(valor(calc({ ficha: ficha({ salario: '1800.00', admissao: '2026-03-16' }, [filho]) }), 'SF')).toBe(Math.round(6500 * 16 / 30));
        const acima = calc({ ficha: ficha({ salario: '2000.00' }, [filho]) });
        expect(valor(acima, 'SF')).toBe(0);
        expect(acima.memoria.join(' ')).toContain('acima do limite');
    });

    it('aprendiz recolhe FGTS de 2%; lançamentos avulsos entram nas bases marcadas', () => {
        const r = calc({ ficha: ficha({ categoria: '103', salario: '1000.00' }), movimento: { lancamentos: [
            { descricao: 'Prêmio', tipo: 'provento', valor: 10000, inss: false, fgts: false, irrf: true },
            { descricao: 'Vale-transporte', tipo: 'desconto', valor: 6000, inss: false, fgts: false, irrf: false },
        ] } });
        expect(r.fgts).toBe(2000);
        expect(r.bases.irrf).toBe(110000);
        expect(r.bases.inss).toBe(100000);
        expect(r.totais.liquido).toBe(110000 - 6000 - valor(r, 'INSS'));
    });

    it('erros: sem tabela, categoria fora, sem salário, fora do mês', () => {
        expect(calc({ ficha: ficha({}), tabelas: [IR_2026] }).erros).toContain('Nenhuma tabela de INSS do segurado (progressiva) vigente em 03/2026.');
        expect(calc({ ficha: ficha({ categoria: '701' }) }).situacao).toBe('erro');
        expect(calc({ ficha: ficha({ salario: '' }) }).erros).toEqual(['Ficha sem salário fixo.']);
        expect(calc({ ficha: ficha({ admissao: '2026-04-01' }) }).erros[0]).toContain('depois da competência');
        const deslig = calc({ ficha: ficha({ dataDesligamento: '2026-03-10' }) });
        expect(deslig.situacao).toBe('incompleto');
        expect(valor(deslig, 'SAL')).toBe(100000);
    });

    it('quem entra na folha do mês e competência seguinte', () => {
        const fs = [ficha({}), { ...ficha({ admissao: '2026-04-01' }), id: 'f2' }, { ...ficha({ dataDesligamento: '2026-02-28' }), id: 'f3' }, { ...ficha({ dataDesligamento: '2026-03-01' }), id: 'f4' }];
        expect(noMes(fs, '2026-03').map(f => f.id)).toEqual(['f1', 'f4']);
        expect(competenciaSeguinte('2025-12')).toBe('2026-01');
    });

    it('férias do mês pagas no recibo entram no INSS e no FGTS do mês, abatendo o INSS já retido', () => {
        const f = ficha({ admissao: '2024-01-02' });
        const gozo = afast({ dtInicio: '2025-07-01', dtFim: '2025-07-20', motivo: '15', perAquisInicio: '2024-01-02' });
        const fm = feriasDaCompetencia(f, [gozo], TABELAS, {}, '2025-07')!;
        expect(fm).toMatchObject({ dias: 20, ferias: 200000, terco: 66667, inss: 21723 }); // 2.666,67: 113,85 + 103,38
        const r = calc({ ficha: f, competencia: '2025-07', pagamento: '2025-08', afastamentos: [gozo], feriasDoMes: fm });
        expect(r.situacao).toBe('calculado');
        expect(valor(r, 'SAL')).toBe(100000); // 30 − 20 dias
        expect(valor(r, 'FERMES')).toBe(266667);
        expect(valor(r, 'FERPAGO')).toBe(266667 - 21723 - fm.irrf); // líquido do recibo
        expect(valor(r, 'INSSFERRET')).toBe(21723);
        expect(valor(r, 'IRRFFERRET')).toBe(fm.irrf);
        expect(r.bases.inss).toBe(366667);
        // INSS sobre 3.666,67 = 113,85 + 114,83 + 104,73 = 333,41; menos 217,23 retidos
        expect(valor(r, 'INSS')).toBe(33341 - 21723);
        expect(r.bases.irrf).toBe(100000); // férias fora do IRRF do mês
        expect(r.fgts).toBe(Math.round(366667 * 0.08));
        expect(r.totais.liquido).toBe(100000 - (33341 - 21723) - valor(r, 'IRRF'));
        // Sem o recibo, o mês fica incompleto
        expect(calc({ ficha: f, competencia: '2025-07', afastamentos: [gozo] }).situacao).toBe('incompleto');
    });
});
