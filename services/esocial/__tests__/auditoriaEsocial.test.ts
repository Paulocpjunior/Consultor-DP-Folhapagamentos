// Conferências da auditoria do eSocial (10/2026): férias em dobro, incidências × S-1010, CPF, estabelecimento,
// alimentando que é dependente, retificação com deduções diferentes, indSimples e grau de exposição (dados fictícios).
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, sugerirDePara, type EntradaEventosFolha, type ParametrosEsocialFolha } from '../eventosFolha';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';
import type { ResultadoCalculo, Verba } from '../../calculo/motorMensal';
import type { ReciboEvento } from '../recibosEsocial';

const CNPJ = '44388152000189';
type Inc = { codIncCP?: string; codIncIRRF?: string; codIncFGTS?: string };
const rub = (codRubr: string, dscRubr: string, natRubr: string, tpRubr: string, inc: Inc = {}): Rubrica => ({ id: codRubr, empresaId: 'E1', codRubr, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr, natRubr, tpRubr, codIncCP: '00', codIncIRRF: '09', codIncFGTS: '00', codIncCPRP: '', observacao: '', ...inc } }] });
const verba = (codigo: string, valor: number, tipo: 'provento' | 'desconto', inc: Partial<Pick<Verba, 'inss' | 'fgts' | 'irrf'>> = {}): Verba =>
    ({ codigo, descricao: codigo, referencia: '', tipo, valor, inss: false, fgts: false, irrf: false, ...inc });
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', categoria: '101', grauExp: '1', estabelecimento: CNPJ } };
const resultado = (verbas: Verba[], extra: Partial<ResultadoCalculo> = {}): ResultadoCalculo => {
    const prov = verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    const desc = verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    return { fichaId: 'f1', nome: 'ANA', competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado', fgts: 0, memoria: [], avisos: [], erros: [], verbas,
        bases: { inss: prov, fgts: prov, irrf: prov }, totais: { proventos: prov, descontos: desc, liquido: prov - desc }, ...extra } as unknown as ResultadoCalculo;
};
// Folha base: salário (base de tudo) e INSS descontado.
const RUBRICAS = [rub('SAL', 'SALARIO', '1000', '1', { codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11' }), rub('INSS', 'INSS', '9201', '2', { codIncCP: '31', codIncIRRF: '41' })];
const BASE = [verba('SAL', 300000, 'provento', { inss: true, fgts: true, irrf: true }), verba('INSS', 25341, 'desconto')];
const params = (depara: Record<string, string>, extra: Partial<ParametrosEsocialFolha> = {}): ParametrosEsocialFolha =>
    ({ nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(Object.entries({ SAL: 'SAL', INSS: 'INSS', ...depara }).map(([k, c]) => [k, { codRubr: c, ideTabRubr: 'T1' }])), ...extra });
const gerar = (e: Partial<EntradaEventosFolha>) => gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-10-06', fichas: [FICHA], resultados: [resultado(BASE)],
    rubricas: RUBRICAS, parametros: params({}), ...e });

describe('férias: INSS e IRRF retidos no recibo não vão em dobro', () => {
    const FER = [...BASE, verba('FERMES', 100000, 'provento', { inss: true, fgts: true }), verba('FERPAGO', 80000, 'desconto'), verba('INSSFERRET', 9000, 'desconto'), verba('IRRFFERRET', 1000, 'desconto')];
    const RUB_FER = [...RUBRICAS, rub('FERM', 'FERIAS', '1016', '1', { codIncCP: '11', codIncFGTS: '11' }), rub('FERP', 'DESC FERIAS', '9221', '2'),
        rub('INSF', 'INSS FERIAS', '9201', '2', { codIncCP: '31', codIncIRRF: '41' }), rub('IRF', 'IRRF FERIAS', '9203', '2', { codIncIRRF: '33' })];
    const DEPARA = { FERMES: 'FERM', FERPAGO: 'FERP' };

    it('de/para: a mesma rubrica sugerida para o recibo e para a folha do gozo fica sem sugestão na folha', () => {
        const recibo = resultado([verba('INSSFER', 9000, 'desconto'), verba('IRRFFER', 1000, 'desconto')]);
        const itens = sugerirDePara([resultado(FER), recibo], RUB_FER, '2026-09');
        const s = (k: string) => itens.find(i => i.chave === k)?.sugestao?.codRubr ?? null;
        expect([s('INSSFER'), s('INSSFERRET'), s('IRRFFER'), s('IRRFFERRET')]).toEqual(['INSF', null, 'IRF', null]);
    });

    it('a mesma rubrica no de/para do recibo e da folha: erro', () => {
        const r = gerar({ resultados: [resultado(FER)], rubricas: RUB_FER, parametros: params({ ...DEPARA, INSSFERRET: 'INSF', INSSFER: 'INSF', IRRFFERRET: 'IRF2', IRRFFER: 'IRF' }) });
        const t = r.trabalhadores[0];
        expect(t.s1200).toBeNull();
        expect(t.erros.join(' ')).toMatch(/A rubrica INSF está no de\/para do INSS do recibo de férias e do INSS das férias na folha do gozo/);
    });

    it('INSS do recibo e da folha com codIncCP 31: erro; IRRF da folha com retenção: erro', () => {
        const rubs = [...RUB_FER, rub('INSR', 'INSS FERIAS FOLHA', '9201', '2', { codIncCP: '31', codIncIRRF: '41' }), rub('IRR', 'IRRF FERIAS FOLHA', '9203', '2', { codIncIRRF: '31' })];
        const r = gerar({ resultados: [resultado(FER)], rubricas: rubs, parametros: params({ ...DEPARA, INSSFERRET: 'INSR', INSSFER: 'INSF', IRRFFERRET: 'IRR', IRRFFER: 'IRF' }) });
        const erros = r.trabalhadores[0].erros.join(' ');
        expect(erros).toMatch(/INSF \(INSS do recibo de férias\) e INSR \(INSS das férias na folha do gozo\) têm codIncCP 31/);
        expect(erros).toMatch(/IRR \(IRRF das férias na folha do gozo\) tem codIncIRRF 31 \(retenção\)/);
    });

    it('recibo sem incidência e folha sem retenção: gera', () => {
        const rubs = [...RUB_FER, rub('INSR', 'INSS FERIAS FOLHA', '9201', '2', { codIncCP: '31', codIncIRRF: '41' }), rub('INSF0', 'INSS FERIAS REC', '9201', '2', { codIncCP: '00', codIncIRRF: '41' }), rub('IRR', 'IRRF FERIAS FOLHA', '9203', '2', { codIncIRRF: '09' })];
        const r = gerar({ resultados: [resultado(FER)], rubricas: rubs, parametros: params({ ...DEPARA, INSSFERRET: 'INSR', INSSFER: 'INSF0', IRRFFERRET: 'IRR', IRRFFER: 'IRF' }) });
        // (Sem os recibos de férias na entrada, só fica a conferência das férias do mês com eles.)
        expect(r.trabalhadores[0].erros.filter(x => /dobro/.test(x))).toEqual([]);
    });
});

describe('incidências do cálculo × S-1010', () => {
    it('aviso uma vez por rubrica e tributo quando o cálculo e o S-1010 divergem', () => {
        const rubs = [rub('SAL', 'SALARIO', '1000', '1', { codIncCP: '00', codIncIRRF: '11', codIncFGTS: '11' }), RUBRICAS[1]];
        const r = gerar({ rubricas: rubs });
        expect(r.trabalhadores[0].s1200).not.toBeNull();
        expect(r.avisos.filter(a => a.includes('Rubrica SAL'))).toEqual(['Rubrica SAL ("SAL"): o cálculo soma à base do INSS, e no S-1010 ela está como 00 - Não é base de cálculo. Confira o de/para ou o S-1010.']);
    });

    it('com as incidências iguais, nenhum aviso', () => {
        expect(gerar({}).avisos).toEqual([]);
    });
});

describe('ficha', () => {
    it('CPF com dígito errado: erro', () => {
        const r = gerar({ fichas: [{ ...FICHA, cpf: '52998224724' }] });
        expect(r.trabalhadores[0].erros).toContain('CPF inválido na ficha.');
    });

    it('local de trabalho em outro estabelecimento: erro', () => {
        const r = gerar({ fichas: [{ ...FICHA, dados: { ...FICHA.dados, estabelecimento: '44388152000260' } }] });
        expect(r.trabalhadores[0].erros.join(' ')).toMatch(/local de trabalho da ficha é o CNPJ 44388152000260/);
    });

    it('grau de exposição em branco: aviso único e vai 1', () => {
        const r = gerar({ fichas: [{ ...FICHA, dados: { ...FICHA.dados, grauExp: '' } }] });
        expect(r.avisos).toEqual([expect.stringMatching(/Grau de exposição a agentes nocivos em branco na ficha de ANA: vai 1/)]);
        expect(r.trabalhadores[0].s1200!.xml).toContain('<grauExp>1</grauExp>');
    });

    it('indSimples só quando informado (classTrib 03), logo após a matrícula', () => {
        expect(gerar({}).trabalhadores[0].s1200!.xml).not.toContain('indSimples');
        expect(gerar({ parametros: params({}, { indSimples: '3' }) }).trabalhadores[0].s1200!.xml).toContain('<matricula>M1</matricula><indSimples>3</indSimples><itensRemun>');
    });
});

describe('IRRF: dependentes e pensão no S-1210', () => {
    const FILHO = { tipo: '03', nome: 'BIA', nascimento: '2015-01-01', cpf: '39053344705', irrf: 'S', salarioFamilia: 'N', pensao: 'S', noEsocial: 'S' };
    const COM_PENSAO = [...BASE, verba('PENSAO', 50000, 'desconto')];
    const deducoes = { simplificado: false, dependentes: [{ cpf: FILHO.cpf, nome: FILHO.nome }], porDependente: 18959, pensao: 50000 };
    const RUB_P = [...RUBRICAS, rub('PEN', 'PENSAO', '9213', '2', { codIncIRRF: '51' })];

    it('alimentando que também é dependente no IRRF: erro', () => {
        const r = gerar({ fichas: [{ ...FICHA, dependentes: [FILHO] }], resultados: [resultado(COM_PENSAO, { deducoesIrrf: deducoes })], rubricas: RUB_P, parametros: params({ PENSAO: 'PEN' }) });
        expect(r.trabalhadores[0].erros.join(' ')).toMatch(/BIA é alimentando \(pensão\) e também dependente no IRRF/);
    });

    it('retificação: S-1210 aceito só com esta folha e deduções diferentes trava; iguais, gera', () => {
        const pg = { tpPgto: '1', perRef: '2026-09', ideDmDev: 'FOLHA202609-M1', xml: '<infoPgto><dtPgto>2026-10-06</dtPgto><tpPgto>1</tpPgto><perRef>2026-09</perRef><ideDmDev>FOLHA202609-M1</ideDmDev><vrLiq>1.00</vrLiq></infoPgto>' };
        const aceito = (valor: string): ReciboEvento => ({ tipo: 'S-1210', cpf: FICHA.cpf, perApur: '2026-10', nrRecibo: '1.1.0000000000000000001', processadoEm: '2026-10-07T10:00:00', origem: 'download',
            pagamentos: [pg], irComplem: [`<infoIRComplem><infoIRCR><tpCR>056107</tpCR><dedDepen><tpRend>11</tpRend><cpfDep>${FILHO.cpf}</cpfDep><vlrDedDep>${valor}</vlrDedDep></dedDepen></infoIRCR></infoIRComplem>`] });
        const ficha = { ...FICHA, dependentes: [{ ...FILHO, pensao: 'N' }] };
        const res = resultado(BASE, { deducoesIrrf: { ...deducoes, pensao: 0 } });
        const com = (valor: string) => gerar({ tpAmb: 1, fichas: [ficha], resultados: [res], retificacao: { s1200: new Map(), s1210: new Map([[FICHA.cpf, aceito(valor)]]) } }).trabalhadores[0];
        expect(com('100.00').erros.join(' ')).toMatch(/S-1210 de 10\/2026 aceito \(recibo 1\.1\.0000000000000000001\) tem deduções do IRRF/);
        const ok = com('189.59');
        expect(ok.erros).toEqual([]);
        expect(ok.s1210!.xml).toContain('<vlrDedDep>189.59</vlrDedDep>');
    });
});
