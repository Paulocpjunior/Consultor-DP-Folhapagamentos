// Intermitente no S-1200 (infoInterm com os dias trabalhados) e no S-1210 (deduções do 13º e das férias) — dados fictícios.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, pagamentos1210, type ParametrosEsocialFolha } from '../eventosFolha';
import { validarPeloXsd } from '../validadorXsd';
import { calcularMensal } from '../../calculo/motorMensal';
import { convocacaoVazia, diasDoPeriodo } from '../../calculo/intermitente';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import type { Rubrica } from '../../cadastros/rubricas';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2026-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 162100, aliquota: 7.5, deducao: 0 }, { ate: 290284, aliquota: 9, deducao: 0 }, { ate: 435427, aliquota: 12, deducao: 0 }, { ate: 847555, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959 },
    faixas: [{ ate: 100000, aliquota: 0, deducao: 0 }, { ate: null, aliquota: 27.5, deducao: 27500 }] };
const CNPJ = '44388152000189';
const FICHA = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dependentes: [{ cpf: '11144477735', nome: 'FILHO', nascimento: '2015-01-01', tipo: '03', irrf: 'S', salarioFamilia: 'N', pensao: 'N' }],
    dados: { nome: 'JOAO', admissao: '2025-02-10', salario: '40.00', unidadeSalario: '1', horasMes: '220', categoria: '111' } } as unknown as FichaFuncionario;
const RUB: [string, string, string, '1' | '2', string, string, string][] = [
    ['INTERM', 'HORAS INTERMITENTE', '1000', '1', '11', '11', '11'], ['DSRINT', 'DSR INTERMITENTE', '1002', '1', '11', '11', '11'],
    ['FERINT', 'FERIAS INTERMITENTE', '1016', '1', '11', '13', '11'], ['FERINT13', '1/3 FERIAS INTERMITENTE', '1017', '1', '11', '13', '11'],
    ['13INT', '13 SALARIO INTERMITENTE', '5001', '1', '12', '12', '12'], ['INSS', 'INSS', '9201', '2', '31', '41', '00'], ['INSS13', 'INSS 13', '9201', '2', '32', '42', '00'],
    ['IRRF', 'IRRF', '9203', '2', '00', '31', '00'], ['IRRFFER', 'IRRF FERIAS', '9203', '2', '00', '33', '00'], ['IRRF13', 'IRRF 13', '9203', '2', '00', '32', '00']];
const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp, cp, ir, fg]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: cp, codIncIRRF: ir, codIncFGTS: fg, codIncCPRP: '', observacao: '' } }] }));
const PARAMS: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(RUB.map(([k]) => [k, { codRubr: k, ideTabRubr: 'T1' }])) };
const conv = { ...convocacaoVazia('E1', 'f1', 'c1'), enviadaEm: '2026-08-25', resposta: 'aceita' as const, respondidaEm: '2026-08-26',
    dias: [...diasDoPeriodo('2026-09-01', '2026-09-05', [1, 2, 3, 4, 5, 6], 8), { data: '2026-09-15', horas: 6 }] };

describe('intermitente no eSocial', () => {
    it('S-1200 com infoInterm (dias do mês) e as parcelas da convocação; S-1210 com a dedução do 13º e das férias; XSD', async () => {
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [], convocacoes: [conv] });
        expect(r.situacao).toBe('calculado');
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-10-05', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS, agora: new Date('2026-10-05T12:00:00Z') }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        expect(t.s1200!.xml).toContain('<ideTrabalhador><cpfTrab>52998224725</cpfTrab><infoInterm><dia>1</dia></infoInterm><infoInterm><dia>2</dia></infoInterm>');
        expect(t.s1200!.xml).toContain('<infoInterm><dia>15</dia></infoInterm></ideTrabalhador>');
        expect(t.s1200!.xml).toContain('<codRubr>13INT</codRubr>');
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(t.s1210!.xml).toContain('<dedDepen><tpRend>12</tpRend><cpfDep>11144477735</cpfDep><vlrDedDep>189.59</vlrDedDep></dedDepen>');
        expect(t.s1210!.xml).toContain('<dedDepen><tpRend>13</tpRend><cpfDep>11144477735</cpfDep><vlrDedDep>189.59</vlrDedDep></dedDepen>');
        expect(await validarPeloXsd(t.s1210!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('sem convocação no mês: sem S-1200, com aviso; no S-1200 do 13º, erro', () => {
        const r = calcularMensal({ competencia: '2026-11', pagamento: '2026-12', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [], convocacoes: [conv] });
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-11', dataPagamento: '2026-12-05', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS }).trabalhadores[0];
        expect(t.s1200).toBeNull();
        expect(t.avisos.join()).toMatch(/sem convocação/);
    });
});

describe('intermitente com recibos por data de pagamento', () => {
    it('um demonstrativo por recibo no S-1200 e o pagamento de cada um no S-1210 da data dele; XSD', async () => {
        const c1 = { ...conv, id: 'c1', dias: diasDoPeriodo('2026-09-01', '2026-09-05', [1, 2, 3, 4, 5, 6], 8), dataPagamento: '2026-09-08' };
        const c2 = { ...conv, id: 'c2', dias: [{ data: '2026-09-15', horas: 6 }], dataPagamento: '' };
        const r = calcularMensal({ competencia: '2026-09', pagamento: '2026-10', ficha: FICHA, tabelas: [INSS, IR], afastamentos: [], convocacoes: [c1, c2] });
        expect(r.situacao).toBe('calculado');
        expect(r.recibosIntermitente).toHaveLength(2);
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-10-05', fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS, agora: new Date('2026-10-05T12:00:00Z') }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        expect(t.s1200!.xml).toContain('<ideDmDev>INT20260908-M1</ideDmDev>');
        expect(t.s1200!.xml).toContain('<ideDmDev>FOLHA202609-M1</ideDmDev>');
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        const [set, out] = [pagamentos1210(t).find(p => p.perApur === '2026-09')!, pagamentos1210(t).find(p => p.perApur === '2026-10')!];
        const liq = (x: (typeof r.recibosIntermitente)[number]) => (x.resultado.totais.liquido / 100).toFixed(2);
        expect(set.s1210!.xml).toContain(`<dtPgto>2026-09-08</dtPgto><tpPgto>1</tpPgto><perRef>2026-09</perRef><ideDmDev>INT20260908-M1</ideDmDev><vrLiq>${liq(r.recibosIntermitente![0])}</vrLiq>`);
        expect(out.s1210!.xml).toContain(`<ideDmDev>FOLHA202609-M1</ideDmDev><vrLiq>${liq(r.recibosIntermitente![1])}</vrLiq>`);
        // Deduções do 13º e das férias: o recibo de setembro deduz no S-1210 de setembro; o da folha, no de outubro.
        expect(set.s1210!.xml).toContain('<dedDepen><tpRend>12</tpRend><cpfDep>11144477735</cpfDep>');
        expect(out.s1210!.xml).toContain('<dedDepen><tpRend>12</tpRend><cpfDep>11144477735</cpfDep>');
        for (const p of [set, out]) expect(await validarPeloXsd(p.s1210!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
});
