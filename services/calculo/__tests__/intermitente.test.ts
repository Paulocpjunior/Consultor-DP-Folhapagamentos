// Trabalho intermitente (CLT, art. 452-A): convocação e folha do mês (dados fictícios).
import { describe, expect, it } from 'vitest';
import { calcularMensal } from '../motorMensal';
import { convocacaoVazia, diasDoPeriodo, periodosDeFerias, validarConvocacao, valorHoraDaFicha, type Convocacao } from '../intermitente';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria Interministerial MPS/MF 6/2025', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei 15.270/2025', observacao: '',
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }],
    valores: { deducaoDependente: 18959, descontoSimplificado: 60720, redutorAte: 500000, redutorMaximo: 31289, redutorLimite: 735000, redutorConstante: 97862, redutorCoeficiente: 133145 } };
const SM: TabelaLegal = { id: 'm', tipo: 'salario_minimo', vigencia: '2026-01', norma: 'Decreto', observacao: '', faixas: [], valores: { salarioMinimo: 162100 } };
const SF: TabelaLegal = { id: 's', tipo: 'salario_familia', vigencia: '2026-01', norma: 'Portaria de teste', observacao: '', faixas: [], valores: { cotaSalarioFamilia: 6500, limiteSalarioFamilia: 190604 } };
const TABELAS = [INSS, IR, SM, SF];

const ficha = (dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({
    ...fichaVazia({ id: 'e1', cnpj: '11222333000181' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dependentes: [],
    dados: { nome: 'JOAO', admissao: '2025-02-10', salario: '15.00', unidadeSalario: '1', horasMes: '220', categoria: '111', ...dados },
});
const conv = (c: Partial<Convocacao>): Convocacao => ({ ...convocacaoVazia('e1', 'f1', 'c1'), enviadaEm: '2026-02-25', resposta: 'aceita', respondidaEm: '2026-02-26', funcao: 'Garçom', ...c });
const valor = (r: ReturnType<typeof calcularMensal>, codigo: string) => r.verbas.find(v => v.codigo === codigo)?.valor ?? 0;

describe('convocação', () => {
    it('monta os dias do período e valida os prazos do art. 452-A', () => {
        const dias = diasDoPeriodo('2026-03-02', '2026-03-08', [1, 2, 3, 4, 5, 6], 8);
        expect(dias.map(d => d.data)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07']);
        expect(validarConvocacao(conv({ dias }), ficha(), { valorHoraFicha: 1500, valorHoraMinimo: 737 })).toEqual({ erros: [], avisos: [] });
        const v = validarConvocacao(conv({ dias, enviadaEm: '2026-03-01', respondidaEm: '2026-03-01' }), ficha(), { valorHoraFicha: 1500 });
        expect(v.avisos.join()).toMatch(/1 dia\(s\) de antecedência.*3 dias corridos/);
        const tardio = validarConvocacao(conv({ dias, enviadaEm: '2026-02-20', respondidaEm: '2026-02-25' }), ficha(), { valorHoraFicha: 1500 });
        expect(tardio.avisos.join()).toMatch(/silêncio é recusa/);
    });
    it('erros: valor abaixo do mínimo-hora, dia em outra convocação, férias, fora do vínculo', () => {
        const dias = [{ data: '2026-03-10', horas: 8 }, { data: '2026-02-01', horas: 8 }];
        const e = validarConvocacao(conv({ id: 'c2', dias, valorHora: 600 }), ficha(), {
            valorHoraMinimo: 737, outras: [conv({ id: 'c1', dias: [{ data: '2026-03-10', horas: 4 }] })], feriasGozo: [{ inicio: '2026-03-09', fim: '2026-04-08' }],
        }).erros.join(' | ');
        expect(e).toMatch(/abaixo do salário mínimo-hora/); expect(e).toMatch(/10\/03\/2026.*outra convocação/); expect(e).toMatch(/de férias/);
        expect(validarConvocacao(conv({ dias: [{ data: '2025-01-05', horas: 8 }] }), ficha(), { valorHoraFicha: 1500 }).erros.join()).toMatch(/antes da admissão/);
        expect(validarConvocacao(conv({ dias: [{ data: '2026-03-10', horas: 8 }] }), ficha({ categoria: '101' }), { valorHoraFicha: 1500 }).erros.join()).toMatch(/categoria 111/);
    });
    it('férias: períodos aquisitivos e prazo para conceder (§ 9º)', () => {
        expect(periodosDeFerias('2025-02-10', '2026-03-31')).toEqual([{ aquisitivo: ['2025-02-10', '2026-02-09'], concederAte: '2027-02-09' }]);
        expect(valorHoraDaFicha(ficha({ salario: '3300.00', unidadeSalario: '5' }).dados)).toBe(1500);
    });
});

describe('folha do intermitente', () => {
    it('horas, DSR, férias + 1/3 e 13º proporcionais; INSS e IRRF em separado; dias para o S-1200', () => {
        // Segunda a sábado, 8 h: 48 h × R$ 15,00 = R$ 720,00; DSR do domingo 08/03: 720 ÷ 6 × 1 = R$ 120,00.
        const c = conv({ dias: diasDoPeriodo('2026-03-02', '2026-03-07', [1, 2, 3, 4, 5, 6], 8) });
        const r = calcularMensal({ competencia: '2026-03', afastamentos: [], tabelas: TABELAS, ficha: ficha(), convocacoes: [c, conv({ id: 'x', resposta: 'recusada', dias: [{ data: '2026-03-20', horas: 8 }] })] });
        expect(r.situacao).toBe('calculado');
        expect(valor(r, 'INTERM')).toBe(72000);
        expect(valor(r, 'DSRINT')).toBe(12000);
        expect(valor(r, 'FERINT')).toBe(7000); // 840 ÷ 12
        expect(valor(r, 'FERINT13')).toBe(2333);
        expect(valor(r, '13INT')).toBe(7000);
        // INSS do mês sobre 840 + 70 + 23,33 = 933,33 × 7,5%; 13º em separado: 70 × 7,5%.
        expect(valor(r, 'INSS')).toBe(7000);
        expect(valor(r, 'INSS13')).toBe(525);
        expect(valor(r, 'IRRF') + valor(r, 'IRRFFER') + valor(r, 'IRRF13')).toBe(0);
        expect(r.fgts).toBe(Math.round((84000 + 7000 + 2333 + 7000) * 0.08));
        expect(r.diasIntermitente).toEqual([2, 3, 4, 5, 6, 7].map(dia => ({ dia, horas: 8 })));
        expect(r.avisos.join()).toMatch(/abaixo do salário mínimo.*complementar/);
    });
    it('sem convocação aceita no mês: nada a pagar', () => {
        const r = calcularMensal({ competencia: '2026-04', afastamentos: [], tabelas: TABELAS, ficha: ficha(), convocacoes: [conv({ dias: [{ data: '2026-03-10', horas: 8 }] })] });
        expect(r.verbas).toEqual([]);
        expect(r.diasIntermitente).toEqual([]);
        expect(r.memoria.join()).toMatch(/Nenhuma convocação aceita/);
    });
    it('remuneração alta: IRRF do mês, das férias e do 13º apurados em separado', () => {
        const dias = diasDoPeriodo('2026-03-02', '2026-03-28', [1, 2, 3, 4, 5, 6], 8);
        const r = calcularMensal({ competencia: '2026-03', afastamentos: [], tabelas: TABELAS, ficha: ficha({ salario: '60.00' }), convocacoes: [conv({ dias })] });
        expect(valor(r, 'IRRF')).toBeGreaterThan(0);
        expect(r.memoria.join('\n')).toMatch(/IRRF das férias proporcionais \(em separado\)/);
        expect(r.memoria.join('\n')).toMatch(/IRRF do 13º proporcional \(exclusivo na fonte\)/);
        expect(r.deducoesIntermitente?.ferias).toBeTruthy();
    });

describe('salário-família do intermitente', () => {
    const filho = { cpf: '11144477735', nome: 'FILHO', nascimento: '2018-05-10', tipo: '03', irrf: 'N', salarioFamilia: 'S', pensao: 'N' } as never;
    const comFilho = (dados: FichaFuncionario['dados'] = {}) => ({ ...ficha(dados), dependentes: [filho] });
    const dias = diasDoPeriodo('2026-03-02', '2026-03-07', [1, 2, 3, 4, 5, 6], 8);
    const sf = (r: ReturnType<typeof calcularMensal>) => r.verbas.find(v => v.codigo === 'SF')?.valor ?? 0;
    it('cota integral no mês com remuneração no limite; nada sem convocação; nada acima do limite', () => {
        const r = calcularMensal({ competencia: '2026-03', afastamentos: [], tabelas: TABELAS, ficha: comFilho(), convocacoes: [conv({ dias })] });
        expect(sf(r)).toBe(6500);
        expect(r.avisos.join()).toMatch(/Salário-família do intermitente: pela regra geral/);
        expect(sf(calcularMensal({ competencia: '2026-04', afastamentos: [], tabelas: TABELAS, ficha: comFilho(), convocacoes: [conv({ dias })] }))).toBe(0);
        const alto = calcularMensal({ competencia: '2026-03', afastamentos: [], tabelas: TABELAS, ficha: comFilho({ salario: '60.00' }), convocacoes: [conv({ dias })] });
        expect(sf(alto)).toBe(0);
        expect(alto.memoria.join()).toMatch(/acima do limite/);
    });
    it('proporcional aos dias de vínculo no mês da admissão', () => {
        const r = calcularMensal({ competencia: '2026-03', afastamentos: [], tabelas: TABELAS, ficha: comFilho({ admissao: '2026-03-02' }), convocacoes: [conv({ dias })] });
        expect(sf(r)).toBe(Math.round(6500 * 30 / 30)); // 02 a 31/03 = 30 dias
        const r2 = calcularMensal({ competencia: '2026-03', afastamentos: [], tabelas: TABELAS, ficha: comFilho({ admissao: '2026-03-02', dataDesligamento: '2026-03-16' }), convocacoes: [conv({ dias })] });
        expect(sf(r2)).toBe(Math.round(6500 * 15 / 30));
    });
});
});

describe('recibo por convocação (data de pagamento própria, como o SAGE)', () => {
    const c1 = conv({ id: 'c1', codigo: 1, dias: diasDoPeriodo('2026-03-02', '2026-03-07', [1, 2, 3, 4, 5, 6], 8), dataPagamento: '2026-03-09' });
    const c2 = conv({ id: 'c2', codigo: 2, dias: [{ data: '2026-03-16', horas: 8 }, { data: '2026-03-17', horas: 8 }], dataPagamento: '2026-03-18',
        eventos: [{ descricao: 'Ajuda de custo', tipo: 'provento', valor: 5000, inss: false, fgts: false, irrf: false }] });
    const calc = (cs: Convocacao[]) => calcularMensal({ competencia: '2026-03', pagamento: '2026-04', afastamentos: [], tabelas: TABELAS, ficha: ficha(), convocacoes: cs });
    it('um recibo por data, INSS sobre o acumulado da competência e a folha do mês = soma dos recibos', () => {
        const r = calc([c2, c1]);
        expect(r.situacao).toBe('calculado');
        expect(r.recibosIntermitente!.map(x => [x.dataPagamento, x.convocacoes])).toEqual([['2026-03-09', ['c1']], ['2026-03-18', ['c2']]]);
        const [a, b] = r.recibosIntermitente!.map(x => x.resultado);
        // Sem datas, um recibo só: o INSS do mês é o mesmo (acumulado), dividido entre os recibos.
        const junto = calc([{ ...c1, dataPagamento: '' }, { ...c2, dataPagamento: '' }]);
        expect(junto.recibosIntermitente).toBeUndefined();
        expect(valor(a, 'INSS') + valor(b, 'INSS')).toBe(valor(junto, 'INSS'));
        expect(valor(a, 'INSS13') + valor(b, 'INSS13')).toBe(valor(junto, 'INSS13'));
        expect(valor(r, 'INTERM')).toBe(valor(junto, 'INTERM'));
        expect(r.totais.liquido).toBe(a.totais.liquido + b.totais.liquido);
        expect(b.memoria.join(' ')).toMatch(/já descontado/);
        // O evento digitado na convocação vai no recibo dela.
        expect(b.verbas.find(v => v.descricao === 'Ajuda de custo')?.valor).toBe(5000);
        expect(a.verbas.some(v => v.descricao === 'Ajuda de custo')).toBe(false);
        // Bases da convocação e as acumuladas.
        expect(b.basesIntermitente!.acumulado.inss.base).toBe(a.basesIntermitente!.recibo.inss.base + b.basesIntermitente!.recibo.inss.base);
        expect(b.basesIntermitente!.acumulado.inss.valor).toBe(valor(a, 'INSS') + valor(b, 'INSS'));
        expect(r.diasIntermitente!.map(x => x.dia)).toEqual([2, 3, 4, 5, 6, 7, 16, 17]);
    });
    it('valida a data do pagamento e os eventos da convocação', () => {
        const v = (c: Partial<Convocacao>) => validarConvocacao(conv({ dias: [{ data: '2026-03-10', horas: 8 }], ...c }), ficha(), { valorHoraFicha: 1500 });
        expect(v({ dataPagamento: '2026-03-09' }).erros.join()).toMatch(/antes do fim da convocação/);
        expect(v({ dataPagamento: '2026-04-30' }).avisos.join()).toMatch(/5º dia útil/);
        expect(v({ dataPagamento: '2026-03-11' })).toEqual({ erros: [], avisos: [] });
        expect(v({ eventos: [{ descricao: '', tipo: 'provento', valor: 0, inss: true, fgts: true, irrf: true }] }).erros.join()).toMatch(/sem descrição.*sem valor/);
    });
});

describe('convocação que atravessa o mês', () => {
    it('os eventos da convocação são pagos uma vez, no mês do último dia dela', () => {
        const c = conv({ id: 'cx', dias: [{ data: '2026-03-30', horas: 8 }, { data: '2026-04-01', horas: 8 }],
            eventos: [{ descricao: 'Ajuda de custo', tipo: 'provento', valor: 50000, inss: false, fgts: false, irrf: false }] });
        const mes = (competencia: string) => calcularMensal({ competencia, pagamento: competencia, afastamentos: [], tabelas: TABELAS, ficha: ficha(), convocacoes: [c] });
        const ajuda = (r: ReturnType<typeof calcularMensal>) => r.verbas.filter(v => v.descricao === 'Ajuda de custo').reduce((t, v) => t + v.valor, 0);
        expect([ajuda(mes('2026-03')), ajuda(mes('2026-04'))]).toEqual([0, 50000]);
    });
});
