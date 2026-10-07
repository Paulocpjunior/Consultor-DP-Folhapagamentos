// @vitest-environment jsdom
// S-1200 e S-1210 gerados pelo Consultor (dados fictícios).
import { describe, expect, it } from 'vitest';
import { chaveVerba, emLotes, gerarEventosFolha, ideDmDev, sugerirDePara, type ParametrosEsocialFolha } from '../eventosFolha';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

const CNPJ = '44388152000189';
const rub = (codRubr: string, dscRubr: string, natRubr: string, tpRubr: string): Rubrica => ({ id: codRubr, empresaId: 'E1', codRubr, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr, natRubr, tpRubr, codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] });
const RUBRICAS = [rub('0001', 'SALARIO', '1000', '1'), rub('0050', 'HORAS EXTRAS 50%', '1003', '1'), rub('0100', 'HORAS EXTRAS 100%', '1003', '1'),
    rub('0901', 'INSS', '9201', '2'), rub('0902', 'IRRF', '9203', '2'), rub('0700', 'VALE TRANSPORTE', '9216', '2')];
const ficha = (id: string, cpf: string, nome: string, matricula: string, deps: { cpf: string; nome: string }[] = []) => ({ ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id, cpf, matriculaEsocial: matricula, situacao: 'ativo' as const,
    dados: { nome, categoria: '101' }, dependentes: deps.map(d => ({ tipo: '03', nome: d.nome, nascimento: '2015-01-01', cpf: d.cpf, irrf: 'S', salarioFamilia: 'N' })) });
const verba = (codigo: string, descricao: string, tipo: 'provento' | 'desconto', valor: number, referencia = '') => ({ codigo, descricao, referencia, tipo, valor, inss: true, fgts: true, irrf: true });
const resultado = (fichaId: string, nome: string, verbas: ReturnType<typeof verba>[], extra: Partial<ResultadoCalculo> = {}): ResultadoCalculo => {
    const prov = verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0); const desc = verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    return { fichaId, nome, competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado', verbas, bases: { inss: prov, fgts: prov, irrf: prov }, totais: { proventos: prov, descontos: desc, liquido: prov - desc },
        fgts: 0, memoria: [], avisos: [], erros: [], ...extra } as ResultadoCalculo;
};
const ANA = resultado('f1', 'ANA', [verba('SAL', 'Salário', 'provento', 300000, '30 dias'), verba('HE50', 'Horas extras 50%', 'provento', 15000, '10,5 h'), verba('INSS', 'INSS', 'desconto', 25341), verba('IRRF', 'IRRF', 'desconto', 1234)],
    { deducoesIrrf: { simplificado: false, dependentes: [{ cpf: '11144477735', nome: 'FILHO' }], porDependente: 18959, pensao: 0 } });
const params: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { SAL: { codRubr: '0001', ideTabRubr: 'T1' }, HE50: { codRubr: '0050', ideTabRubr: 'T1' }, INSS: { codRubr: '0901', ideTabRubr: 'T1' }, IRRF: { codRubr: '0902', ideTabRubr: 'T1' } } };
const base = { cnpj: CNPJ, tpAmb: 2 as const, competencia: '2026-09', dataPagamento: '2026-10-06', rubricas: RUBRICAS, parametros: params, agora: new Date('2026-10-07T15:00:00Z') };
const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const txt = (d: Document, tag: string) => Array.from(d.getElementsByTagName(tag)).map(e => e.textContent);

describe('de/para das verbas do motor com as rubricas do S-1010', () => {
    it('sugere pela natureza e pelo tipo; HE 50% e 100% pela descrição; lançamento avulso pela descrição', () => {
        const lan = resultado('f2', 'BIA', [verba('LAN1', 'Vale transporte', 'desconto', 1800), verba('HE100', 'Horas extras 100%', 'provento', 5000)]);
        const s = Object.fromEntries(sugerirDePara([ANA, lan], RUBRICAS, '2026-09').map(i => [i.chave, i.sugestao?.codRubr ?? null]));
        expect(s).toEqual({ SAL: '0001', HE50: '0050', INSS: '0901', IRRF: '0902', 'LAN:VALE TRANSPORTE': '0700', HE100: '0100' });
        expect(chaveVerba({ codigo: 'LAN3', descricao: 'Adiantamento salarial' })).toBe('LAN:ADIANTAMENTO SALARIAL');
    });
});

describe('S-1200 e S-1210', () => {
    it('S-1200: demonstrativo com estabelecimento, lotação, matrícula e itens por rubrica (quantidade e valor)', () => {
        const { trabalhadores, erros } = gerarEventosFolha({ ...base, fichas: [ficha('f1', '52998224725', 'ANA', 'M001', [{ cpf: '111.444.777-35', nome: 'FILHO' }])], resultados: [ANA] });
        expect(erros).toEqual([]);
        const [t] = trabalhadores;
        expect(t.erros).toEqual([]);
        const d = doc(t.s1200!.xml);
        expect(d.documentElement.namespaceURI).toBe('http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00');
        expect(t.s1200!.id).toMatch(/^ID1443881520000002026100712000000001$/);
        expect([txt(d, 'perApur')[0], txt(d, 'tpAmb')[0], txt(d, 'nrInsc'), txt(d, 'cpfTrab')[0], txt(d, 'codCateg')[0], txt(d, 'codLotacao')[0], txt(d, 'matricula')[0], txt(d, 'ideDmDev')[0]])
            .toEqual(['2026-09', '2', ['44388152', CNPJ], '52998224725', '101', 'LOT01', 'M001', 'FOLHA202609-M001']);
        expect(txt(d, 'codRubr')).toEqual(['0001', '0050', '0901', '0902']);
        expect(txt(d, 'qtdRubr')).toEqual(['30.00', '10.50']);
        expect(txt(d, 'vrRubr')).toEqual(['3000.00', '150.00', '253.41', '12.34']);
    });

    it('S-1210: pagamento no mês da data, mesmo demonstrativo, líquido e dedução do dependente no IRRF', () => {
        const { trabalhadores } = gerarEventosFolha({ ...base, fichas: [ficha('f1', '52998224725', 'ANA', 'M001')], resultados: [ANA] });
        const d = doc(trabalhadores[0].s1210!.xml);
        expect(d.documentElement.namespaceURI).toBe('http://www.esocial.gov.br/schema/evt/evtPgtos/v_S_01_03_00');
        expect([txt(d, 'perApur')[0], txt(d, 'cpfBenef')[0], txt(d, 'dtPgto')[0], txt(d, 'tpPgto')[0], txt(d, 'perRef')[0], txt(d, 'ideDmDev')[0], txt(d, 'vrLiq')[0]])
            .toEqual(['2026-10', '52998224725', '2026-10-06', '1', '2026-09', 'FOLHA202609-M001', '2884.25']);
        expect([txt(d, 'tpCR')[0], txt(d, 'tpRend')[0], txt(d, 'cpfDep')[0], txt(d, 'vlrDedDep')[0]]).toEqual(['056107', '11', '11144477735', '189.59']);
        // Com o desconto simplificado, sem dedução de dependentes.
        const simpl = { ...ANA, deducoesIrrf: { ...ANA.deducoesIrrf!, simplificado: true } };
        expect(gerarEventosFolha({ ...base, fichas: [ficha('f1', '52998224725', 'ANA', 'M001')], resultados: [simpl] }).trabalhadores[0].s1210!.xml).not.toContain('infoIRComplem');
    });

    it('dois contratos do mesmo CPF: um evento com dois demonstrativos e dois pagamentos', () => {
        const b = resultado('f2', 'ANA', [verba('SAL', 'Salário', 'provento', 100000, '30 dias'), verba('INSS', 'INSS', 'desconto', 7500)]);
        const { trabalhadores } = gerarEventosFolha({ ...base, fichas: [ficha('f1', '52998224725', 'ANA', 'M001'), ficha('f2', '52998224725', 'ANA', 'M002')], resultados: [ANA, b] });
        expect(trabalhadores).toHaveLength(1);
        expect(txt(doc(trabalhadores[0].s1200!.xml), 'ideDmDev')).toEqual(['FOLHA202609-M001', 'FOLHA202609-M002']);
        expect(txt(doc(trabalhadores[0].s1210!.xml), 'vrLiq')).toEqual(['2884.25', '925.00']);
    });

    it('sem evento quando falta algo: rubrica, tipo, matrícula, categoria ou cálculo; parâmetros obrigatórios', () => {
        const semRub = resultado('f1', 'ANA', [verba('SAL', 'Salário', 'provento', 300000), verba('PENSAO', 'Pensão', 'desconto', 1000)]);
        const t1 = gerarEventosFolha({ ...base, fichas: [{ ...ficha('f1', '52998224725', 'ANA', ''), dados: { nome: 'ANA' } }], resultados: [semRub] }).trabalhadores[0];
        expect(t1.s1200).toBeNull();
        expect(t1.erros).toEqual(['Sem matrícula do eSocial na ficha.', 'Categoria do eSocial (3 dígitos) em branco na ficha.', '"Pensão" sem rubrica no de/para.']);
        const trocado = { ...params, rubricas: { ...params.rubricas, SAL: { codRubr: '0901', ideTabRubr: 'T1' } } };
        expect(gerarEventosFolha({ ...base, parametros: trocado, fichas: [ficha('f1', '52998224725', 'ANA', 'M001')], resultados: [ANA] }).trabalhadores[0].erros[0]).toMatch(/0901 é desconto no S-1010, e "Salário" é provento/);
        const inc = gerarEventosFolha({ ...base, fichas: [ficha('f1', '52998224725', 'ANA', 'M001')], resultados: [{ ...ANA, situacao: 'incompleto', avisos: ['Sem tabela.'] }] }).trabalhadores[0];
        expect(inc.erros[0]).toMatch(/Cálculo incompleto: Sem tabela\./);
        expect(gerarEventosFolha({ ...base, parametros: { ...params, codLotacao: '', nrInscEstab: '123' }, fichas: [], resultados: [] }).erros).toEqual(['Informe o CNPJ do estabelecimento (14 dígitos).', 'Informe o código da lotação tributária (S-1020).']);
    });

    it('desconto em rubrica informativa é recusado; matrículas longas parecidas não repetem o demonstrativo', () => {
        const info = { ...params, rubricas: { ...params.rubricas, IRRF: { codRubr: '0903', ideTabRubr: 'T1' } } };
        const comInfo = [...RUBRICAS, rub('0903', 'IRRF INFORMATIVO', '9203', '3')];
        expect(gerarEventosFolha({ ...base, rubricas: comInfo, parametros: info, fichas: [ficha('f1', '52998224725', 'ANA', 'M001')], resultados: [ANA] }).trabalhadores[0].erros)
            .toEqual(['Rubrica 0903 é informativa no S-1010, e "IRRF" é desconto.']);
        const b = resultado('f2', 'ANA', [verba('SAL', 'Salário', 'provento', 100000, '30 dias')]);
        const m1 = 'CONTRATO-MUITO-LONGO-0000000001'.slice(0, 30); const m2 = 'CONTRATO-MUITO-LONGO-0000000002'.slice(0, 30);
        const { trabalhadores } = gerarEventosFolha({ ...base, fichas: [ficha('f1', '52998224725', 'ANA', m1), ficha('f2', '52998224725', 'ANA', m2)], resultados: [ANA, b] });
        const ids = txt(doc(trabalhadores[0].s1200!.xml), 'ideDmDev');
        expect(new Set(ids).size).toBe(2);
        expect(ids.every(i => (i ?? '').length <= 30)).toBe(true);
        expect(txt(doc(trabalhadores[0].s1210!.xml), 'ideDmDev')).toEqual(ids);
    });

    it('lotes de 50 e identificador do demonstrativo com até 30 caracteres', () => {
        expect(emLotes(Array.from({ length: 120 }, (_, i) => i)).map(l => l.length)).toEqual([50, 50, 20]);
        expect(ideDmDev('2026-09', 'X'.repeat(40))).toHaveLength(30);
    });
});
