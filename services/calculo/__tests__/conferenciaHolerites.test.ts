import { describe, expect, it } from 'vitest';
import { classificarVerba, conferirHolerite, ligarHolerite, movimentoDoHolerite, podeAplicar, quantidadeDaReferencia, type HoleriteIob, type VerbaHolerite } from '../conferenciaHolerites';
import { calcularMensal } from '../motorMensal';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const P = (descricao: string, provento: number, referencia = '', codigo = ''): VerbaHolerite => ({ codigo, descricao, referencia, provento, desconto: 0 });
const D = (descricao: string, desconto: number, referencia = '', codigo = ''): VerbaHolerite => ({ codigo, descricao, referencia, provento: 0, desconto });

const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (id: string, cpf: string, dados: FichaFuncionario['dados']): FichaFuncionario => ({ ...fichaVazia(EMP), id, cpf, matriculaEsocial: id, situacao: 'ativo', dados: { admissao: '2024-01-02', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2025-05', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };

const holerite = (verbas: VerbaHolerite[], extra: Partial<HoleriteIob> = {}): HoleriteIob => {
    const p = verbas.reduce((s, v) => s + v.provento, 0); const d = verbas.reduce((s, v) => s + v.desconto, 0);
    return { pagina: 1, nome: 'ANA PAULA', cpf: '52998224725', codigo: '17', competencia: '2026-09', cargo: '', verbas, salarioBase: null,
        totalProventos: p, totalDescontos: d, liquido: p - d, baseInss: null, baseFgts: null, fgtsMes: null, baseIrrf: null, avisos: [], ...extra };
};

describe('conferência com os holerites do IOB', () => {
    it('classifica as descrições típicas do holerite', () => {
        const casos: [VerbaHolerite, string][] = [
            [P('SALARIO', 1), 'SAL'], [P('SALÁRIO MENSAL', 1), 'SAL'], [P('HORAS NORMAIS', 1), 'SAL'], [P('SALDO DE SALARIO', 1), 'SAL'],
            [P('SALARIO FAMILIA', 1), 'SF'], [P('SAL. FAMILIA', 1), 'SF'], [P('SALARIO-MATERNIDADE', 1), 'MAT'],
            [P('HORAS EXTRAS 50%', 1), 'HE50'], [P('H.E. 100%', 1), 'HE100'], [P('HORA EXTRA 100%', 1), 'HE100'],
            [P('D.S.R. S/ HORAS EXTRAS', 1), 'DSRHE'], [P('REFLEXO DSR', 1), 'DSRHE'], [P('D.S.R.', 1), 'DSRHE'], [D('DSR S/ FALTAS', 1), 'DSRF'],
            [P('DSR S/ COMISSÕES', 1), 'OUTRO'], [P('DSR SOBRE ADICIONAL NOTURNO', 1), 'OUTRO'],
            [P('FÉRIAS NO MÊS', 1), 'FERMES'], [P('1/3 FÉRIAS', 1), 'FERMES'], [D('LÍQUIDO DE FÉRIAS', 1), 'FERPAGO'], [D('INSS S/ FÉRIAS', 1), 'INSS'], [P('ABONO PECUNIÁRIO DE FÉRIAS', 1), 'OUTRO'],
            [D('FALTAS', 1), 'FALTA'], [D('INSS', 1), 'INSS'], [D('I.R.R.F.', 1), 'IRRF'], [D('IMPOSTO DE RENDA', 1), 'IRRF'],
            [D('PENSAO ALIMENTICIA', 1), 'PENSAO'], [D('VALE TRANSPORTE', 1), 'VT'], [D('ADIANTAMENTO SALARIAL', 1), 'ADIANT'], [P('ADICIONAL NOTURNO', 1), 'OUTRO'],
            [D('ADIANTAMENTO (VALE)', 1), 'ADIANT'], [D('ADIANTAMENTO', 1), 'ADIANT'], [D('ADIANTAMENTO COMISSAO', 1), 'OUTRO'], [D('ADIANTAMENTO GORJETA', 1), 'OUTRO'],
            [D('ADIANTAMENTO 13 SALARIO', 1), 'OUTRO'], [D('DESC. ARREDONDAMENTO ADIANTAME', 1), 'OUTRO'],
        ];
        expect(casos.map(([v]) => classificarVerba(v))).toEqual(casos.map(([, c]) => c));
    });

    it('liga pelo CPF, pelo código do IOB (sem zeros à esquerda) ou pelo nome', () => {
        const fichas = [ficha('f1', '52998224725', { nome: 'ANA PAULA', codigoIob: '0017' }), ficha('f2', '11144477735', { nome: 'BRUNO LIMA', codigoIob: '5' })];
        expect(ligarHolerite(holerite([]), fichas)).toMatchObject({ ficha: { id: 'f1' }, por: 'cpf' });
        expect(ligarHolerite(holerite([], { cpf: '', codigo: '005' }), fichas)).toMatchObject({ ficha: { id: 'f2' }, por: 'codigo' });
        expect(ligarHolerite(holerite([], { cpf: '', codigo: '', nome: 'Bruno  Lima' }), fichas)).toMatchObject({ ficha: { id: 'f2' }, por: 'nome' });
        expect(ligarHolerite(holerite([], { cpf: '', codigo: '99', nome: 'OUTRA' }), fichas)).toEqual({ ficha: null, por: '' });
    });

    it('compara o motor com o holerite item a item', () => {
        const f = ficha('f1', '52998224725', { nome: 'ANA PAULA', salario: '2200.00' });
        const r = calcularMensal({ competencia: '2026-09', ficha: f, afastamentos: [], tabelas: [INSS, IR], movimento: { horasExtras50: 10 } });
        // O que o IOB imprimiria para o mesmo caso: 2.200 + 150 + DSR 30,00; INSS 191,43
        const igual = holerite([P('SALARIO', 220000, '30,00'), P('HORAS EXTRAS 50%', 15000, '10,00'), P('DSR S/ HORAS EXTRAS', 3000), D('INSS', 19143, '8,04')], { baseInss: 238000, baseFgts: 238000, fgtsMes: 19040 });
        const ctx = { fichaId: 'f1', nome: 'ANA PAULA', competencia: '2026-09' };
        const ok = conferirHolerite(r, igual, 'cpf', ctx);
        expect(ok.situacao).toBe('confere');
        expect(ok.linhas.map(l => l.item)).toEqual(['Salário', 'Horas extras 50%', 'DSR sobre horas extras', 'INSS', 'Total de proventos', 'Total de descontos', 'Líquido', 'Base do INSS', 'Base do FGTS', 'FGTS do mês']);

        const diferente = holerite([P('SALARIO', 220000), P('HORAS EXTRAS 50%', 15000), P('DSR S/ HORAS EXTRAS', 3462), D('INSS', 19185), D('VALE TRANSPORTE', 13200)]);
        const c = conferirHolerite(r, diferente, 'nome', ctx);
        expect(c.situacao).toBe('diverge');
        // Vale-transporte no IOB e não na ficha: aparece como linha que diverge (marque "Vale-transporte" na ficha).
        expect(c.linhas.filter(l => !l.ok).map(l => [l.item, l.diferenca])).toEqual([['DSR sobre horas extras', -462], ['Vale-transporte', -13200], ['INSS', -42], ['Total de proventos', -462], ['Total de descontos', -13242], ['Líquido', 12780]]);
        expect(c.semCorrespondente).toEqual([]);
        expect(c.avisos[0]).toContain('ligado à ficha pelo nome');

        expect(podeAplicar(ok)).toBe(true);
        expect(podeAplicar(c)).toBe(true);

        // Revisão do PR #52: nada de "confere" sem evidência, nem movimento de outro mês ou sem cálculo
        const sem = conferirHolerite(undefined, igual, 'cpf', ctx);
        expect(sem).toMatchObject({ situacao: 'sem cálculo', fichaId: 'f1' });
        expect(podeAplicar(sem)).toBe(false);
        const outroMes = conferirHolerite(r, { ...igual, competencia: '2026-08' }, 'cpf', ctx);
        expect(outroMes).toMatchObject({ situacao: 'outra competência', linhas: [] });
        expect(outroMes.avisos.at(-1)).toBe('Holerite de 08/2026; a competência conferida é 09/2026. Não comparado.');
        expect(podeAplicar(outroMes)).toBe(false);
        const vazio = conferirHolerite(r, holerite([], { totalProventos: null, totalDescontos: null, liquido: null }), 'cpf', ctx);
        expect(vazio.situacao).toBe('ilegível');
        expect(podeAplicar(vazio)).toBe(false);
        expect(conferirHolerite(r, { ...igual, competencia: '' }, 'cpf', ctx).avisos).toContain('Competência não lida no holerite: confira se o PDF é do mês certo.');
    });

    it('lê a referência e monta o movimento do mês a partir do holerite', () => {
        expect(quantidadeDaReferencia('10,50')).toBe(10.5);
        expect(quantidadeDaReferencia('10:30')).toBe(10.5);
        expect(quantidadeDaReferencia('2')).toBe(2);
        expect(quantidadeDaReferencia('8,04%')).toBe(0);
        const { movimento, avisos } = movimentoDoHolerite(holerite([
            P('SALARIO', 220000, '30,00'), P('HORAS EXTRAS 50%', 15000, '10:00'), P('HORAS EXTRAS 100%', 4000, '2,00'), P('ADICIONAL NOTURNO', 5000, '', '030'),
            D('FALTAS', 7333, '1,00'), D('DSR S/ FALTAS', 7333, ''), D('PENSAO ALIMENTICIA', 30000), D('VALE TRANSPORTE', 13200, '6%', '410'), D('ADIANTAMENTO (VALE)', 88000, '40,00', '5610'),
            D('DESC. ARREDONDAMENTO ADIANTAME', 33, '', '8951'), D('INSS', 19143),
        ]));
        // Adiantamento e vale-transporte do IOB entram como foram (sobrepõem a ficha); arredondamento vira lançamento.
        expect(movimento).toEqual({
            horasExtras50: 10, horasExtras100: 2, faltasDias: 1, pensaoAlimenticia: 30000, valeTransporte: 13200, adiantamento: 88000,
            lancamentos: [
                { descricao: '030 ADICIONAL NOTURNO', tipo: 'provento', valor: 5000, inss: true, fgts: true, irrf: true },
                { descricao: '8951 DESC. ARREDONDAMENTO ADIANTAME', tipo: 'desconto', valor: 33, inss: false, fgts: false, irrf: false },
            ],
        });
        // Holerite sem adiantamento e sem VT: o mês não teve, e o 0 explícito impede o motor de voltar à ficha (Codex #115).
        expect(movimentoDoHolerite(holerite([P('SALARIO', 220000, '30,00'), D('INSS', 19143)])).movimento).toEqual({ adiantamento: 0, valeTransporte: 0 });
        expect(avisos[0]).toBe('DSR S/ FALTAS: referência "" ilegível; informe a quantidade.');
        expect(avisos[1]).toContain('confira as incidências');
    });

    it('mês com férias: INSS do IOB (inclusive "INSS s/ férias") confere com o INSS do mês + o retido no recibo', () => {
        const r = { fichaId: 'f1', nome: 'ANA', competencia: '2025-07', pagamento: '2025-08', situacao: 'calculado' as const, bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 366667, descontos: 0, liquido: 0 }, fgts: 0, memoria: [], avisos: [], erros: [],
            verbas: [
                { codigo: 'SAL', descricao: 'Salário', referencia: '', tipo: 'provento' as const, valor: 100000, inss: true, fgts: true, irrf: true },
                { codigo: 'FERMES', descricao: '', referencia: '', tipo: 'provento' as const, valor: 200000, inss: true, fgts: true, irrf: false },
                { codigo: 'FERMES13', descricao: '', referencia: '', tipo: 'provento' as const, valor: 66667, inss: true, fgts: true, irrf: false },
                { codigo: 'FERPAGO', descricao: '', referencia: '', tipo: 'desconto' as const, valor: 236000, inss: false, fgts: false, irrf: false },
                { codigo: 'INSSFERRET', descricao: '', referencia: '', tipo: 'desconto' as const, valor: 21723, inss: false, fgts: false, irrf: false },
                { codigo: 'IRRFFERRET', descricao: '', referencia: '', tipo: 'desconto' as const, valor: 8944, inss: false, fgts: false, irrf: false },
                { codigo: 'INSS', descricao: '', referencia: '', tipo: 'desconto' as const, valor: 11618, inss: false, fgts: false, irrf: false },
            ] };
        const h = holerite([P('SALARIO', 100000), P('FÉRIAS', 200000), P('1/3 FÉRIAS', 66667), D('LÍQUIDO DE FÉRIAS', 236000), D('INSS', 11618), D('INSS S/ FÉRIAS', 21723), D('IRRF FÉRIAS', 8944)], { totalProventos: null, totalDescontos: null, liquido: null, competencia: '2025-07' });
        const c = conferirHolerite(r, h, 'cpf', { fichaId: 'f1', nome: 'ANA', competencia: '2025-07' });
        expect(c.linhas.filter(l => !l.ok)).toEqual([]);
        expect(c.situacao).toBe('confere');
    });
});
