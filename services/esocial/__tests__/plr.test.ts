// PLR (Digitação PLR do SAGE; Lei 10.101/2000): sem INSS e FGTS, IRRF exclusivo pela tabela anual da PLR, refeito sobre
// o total do ano; demonstrativo próprio no S-1200 (também para o desligado) e o pagamento no S-1210, validados pelo XSD.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, pagamentos1210, type ParametrosEsocialFolha } from '../eventosFolha';
import { validarPeloXsd } from '../validadorXsd';
import { calcularPlr, mesesTrabalhadosNoAno, plrDoMes, plrProporcional } from '../../calculo/plr';
import { limparMovimento, validarMovimento } from '../../calculo/movimento';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import type { Rubrica } from '../../cadastros/rubricas';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
// Tabela de teste no formato da tabela anual da PLR (isenta até 7.640,80; faixas de 7,5% a 27,5%).
const PLR: TabelaLegal = { id: 'p', tipo: 'irrf_plr', vigencia: '2026-01', norma: 'Tabela de teste', observacao: '', valores: {},
    faixas: [{ ate: 764080, aliquota: 0, deducao: 0 }, { ate: 992228, aliquota: 7.5, deducao: 57306 }, { ate: 1316700, aliquota: 15, deducao: 131723 },
        { ate: 1638038, aliquota: 22.5, deducao: 230476 }, { ate: null, aliquota: 27.5, deducao: 312378 }] };
const CNPJ = '44388152000189';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'HENRIQUE', admissao: '2025-04-10', salario: '4931.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', dataDesligamento: '2026-06-30' } };
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;

describe('PLR', () => {
    it('sem INSS e FGTS; IRRF pela tabela anual da PLR; pensão deduz da base', () => {
        const r = calcularPlr({ ficha: FICHA, competencia: '2026-10', plr: { valor: 1000000, data: '2026-10-20' }, tabelas: [PLR] });
        expect(r.situacao).toBe('calculado');
        // 10.000,00 × 15% − 1.317,23 = 182,77.
        expect([v(r, 'PLR'), v(r, 'IRRFPLR'), r.bases, r.fgts]).toEqual([1000000, 18277, { inss: 0, fgts: 0, irrf: 0 }, 0]);
        expect(r.totais.liquido).toBe(981723);
        const comPensao = calcularPlr({ ficha: FICHA, competencia: '2026-10', plr: { valor: 1000000, pensao: 300000, data: '2026-10-20' }, tabelas: [PLR] });
        // Base 7.000,00: isenta.
        expect([v(comPensao, 'IRRFPLR'), v(comPensao, 'PENSAOPLR'), comPensao.totais.liquido]).toEqual([0, 300000, 700000]);
        expect(calcularPlr({ ficha: FICHA, competencia: '2026-10', plr: { valor: 1000000, data: '2026-10-20' }, tabelas: [] }).erros.join(' ')).toMatch(/Cadastre a tabela anual da PLR/);
        expect(calcularPlr({ ficha: FICHA, competencia: '2026-10', plr: { valor: 1000000, data: '2026-11-05' }, tabelas: [PLR] }).erros.join(' ')).toMatch(/lance no movimento de 11\/2026/);
    });

    it('2º pagamento no ano: IRRF refeito sobre o total, menos o já retido; avisos de periodicidade; já paga fora do Consultor', () => {
        const movs = { '2026-03': { plr: { valor: 800000, data: '2026-03-20' } }, '2026-10': { plr: { valor: 1000000, data: '2026-10-20' } } };
        const r = plrDoMes(FICHA, movs, '2026-10', [PLR])!;
        // Março: 8.000 × 7,5% − 573,06 = 26,94. Outubro: total 18.000 × 27,5% − 3.123,78 = 1.826,22 − 26,94 = 1.799,28.
        expect(v(plrDoMes(FICHA, movs, '2026-03', [PLR])!, 'IRRFPLR')).toBe(2694);
        expect(v(r, 'IRRFPLR')).toBe(179928);
        expect(r.plrAno).toEqual({ valor: 1800000, pensao: 0, base: 1800000, irrfTotal: 182622, irrfAnterior: 2694 });
        expect(r.avisos).toEqual([]);
        const tres = plrDoMes(FICHA, { ...movs, '2026-11': { plr: { valor: 100000, data: '2026-11-10' } } }, '2026-11', [PLR])!;
        expect(tres.avisos.join(' ')).toMatch(/paga 3 vezes no ano.*mesmo trimestre civil/);
        // Já paga no ano fora do Consultor (8.000,00 com 26,94 retidos): o mesmo resultado.
        const fora = plrDoMes(FICHA, { '2026-10': { plr: { valor: 1000000, data: '2026-10-20', anteriorValor: 800000, anteriorIrrf: 2694 } } }, '2026-10', [PLR])!;
        expect(v(fora, 'IRRFPLR')).toBe(179928);
        // A pensão descontada da PLR paga fora também deduz da base do ano.
        const foraPensao = plrDoMes(FICHA, { '2026-10': { plr: { valor: 1000000, data: '2026-10-20', anteriorValor: 800000, anteriorIrrf: 2694, anteriorPensao: 100000 } } }, '2026-10', [PLR])!;
        expect(foraPensao.plrAno.pensao).toBe(100000);
        expect(v(foraPensao, 'IRRFPLR')).toBeLessThan(179928);
        expect(validarMovimento({ plr: { valor: 100, data: '2026-10-20', anteriorValor: 50, anteriorPensao: 60 } })).toEqual(['PLR: a pensão sobre a PLR já paga não pode passar do valor já pago.']);
        expect(plrDoMes(FICHA, movs, '2026-09', [PLR])).toBeNull();
    });

    it('proporcional aos meses do ano e o movimento guarda a PLR', () => {
        expect(mesesTrabalhadosNoAno({ admissao: '2026-04-10', dataDesligamento: '' }, 2026)).toBe(9); // abril tem 21 dias: conta
        expect(mesesTrabalhadosNoAno({ admissao: '2026-04-20', dataDesligamento: '2026-06-10' }, 2026)).toBe(1); // só maio
        expect(plrProporcional(1200000, 9)).toBe(900000);
        const m = limparMovimento({ plr: { valor: 1000000.4, data: '2026-10-20', pensao: 0 } });
        expect(m.plr).toEqual({ valor: 1000000, data: '2026-10-20' });
        expect(validarMovimento({ plr: { valor: 100, pensao: 200, data: '' } })).toEqual(['PLR: informe a data do pagamento.', 'PLR: a pensão sobre a PLR não pode passar do valor da PLR.']);
    });

    it('eSocial: desligado sem a folha do mês recebe a PLR em demonstrativo próprio no S-1200 e o pagamento no S-1210 (XSD)', async () => {
        const r = plrDoMes(FICHA, { '2026-10': { plr: { valor: 1000000, data: '2026-10-20' } } }, '2026-10', [PLR])!;
        const RUB: [string, string, string, '1' | '2', string, string, string][] = [['PLR', 'PARTICIPACAO NOS LUCROS', '1099', '1', '00', '14', '00'], ['IRPLR', 'IRRF S/ PLR', '9203', '2', '00', '34', '00']];
        const rubricas: Rubrica[] = RUB.map(([k, dsc, nat, tp, cp, ir, fg]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
            vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: cp, codIncIRRF: ir, codIncFGTS: fg, codIncCPRP: '', observacao: '' } }] }));
        const params: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { PLR: { codRubr: 'PLR', ideTabRubr: 'T1' }, IRRFPLR: { codRubr: 'IRPLR', ideTabRubr: 'T1' } } };
        const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', dataPagamento: '2026-11-05', fichas: [FICHA], resultados: [], plr: [r], rubricas, parametros: params, agora: new Date('2026-10-15T12:00:00Z') });
        const t = g.trabalhadores[0];
        expect([g.erros, t.erros]).toEqual([[], []]);
        expect(t.avisos.some(a => /IRRF/.test(a) && /PLR/.test(a))).toBe(false);
        expect(t.s1200!.xml).toContain('<ideDmDev>PLR20261020-M1</ideDmDev>');
        expect(t.s1200!.xml).toMatch(/<codRubr>PLR<\/codRubr><ideTabRubr>T1<\/ideTabRubr><vrRubr>10000\.00<\/vrRubr>.*<codRubr>IRPLR<\/codRubr><ideTabRubr>T1<\/ideTabRubr><vrRubr>182\.77<\/vrRubr>/);
        // A folha é paga em 11/2026; a PLR, em 20/10: o S-1210 dela é o de 10/2026.
        const de10 = pagamentos1210(t).find(p => p.perApur === '2026-10')!;
        expect(de10.s1210!.xml).toContain('<dtPgto>2026-10-20</dtPgto><tpPgto>1</tpPgto><perRef>2026-10</perRef><ideDmDev>PLR20261020-M1</ideDmDev><vrLiq>9817.23</vrLiq>');
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });

    it('eSocial: a pensão descontada da PLR vai no S-1210 (penAlim, tpRend 14); XSD', async () => {
        const ficha: FichaFuncionario = { ...FICHA, dados: { ...FICHA.dados, dataDesligamento: '' },
            dependentes: [{ cpf: '11144477735', nome: 'FILHA', nascimento: '2015-01-01', tipo: '03', irrf: 'N', salarioFamilia: 'N', pensao: 'S', pensaoPct: '100' }] } as unknown as FichaFuncionario;
        const r = plrDoMes(ficha, { '2026-10': { plr: { valor: 1000000, pensao: 300000, data: '2026-10-20' } } }, '2026-10', [PLR])!;
        const RUB: [string, string, string, '1' | '2', string, string, string][] = [['PLR', 'PARTICIPACAO NOS LUCROS', '1099', '1', '00', '14', '00'], ['PENPLR', 'PENSAO S/ PLR', '9213', '2', '00', '00', '00']];
        const rubricas: Rubrica[] = RUB.map(([k, dsc, nat, tp, cp, ir, fg]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
            vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: cp, codIncIRRF: ir, codIncFGTS: fg, codIncCPRP: '', observacao: '' } }] }));
        const params: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { PLR: { codRubr: 'PLR', ideTabRubr: 'T1' }, PENSAOPLR: { codRubr: 'PENPLR', ideTabRubr: 'T1' } } };
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-10', dataPagamento: '2026-11-05', fichas: [ficha], resultados: [], plr: [r], rubricas, parametros: params, agora: new Date('2026-10-15T12:00:00Z') }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        const de10 = pagamentos1210(t).find(p => p.perApur === '2026-10')!;
        expect(de10.s1210!.xml).toContain('<penAlim><tpRend>14</tpRend><cpfDep>11144477735</cpfDep><vlrDedPenAlim>3000.00</vlrDedPenAlim></penAlim>');
        expect(await validarPeloXsd(de10.s1210!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
});
