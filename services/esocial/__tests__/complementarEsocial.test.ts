// @vitest-environment jsdom
// Folha complementar no eSocial (S-1.3): demonstrativo próprio no S-1200 da competência do instrumento, com as
// diferenças em infoPerAnt/ideADC (um idePeriodo por mês de referência), o INSS de cada mês na sua referência e o
// pagamento no S-1210 junto com a folha. Dados fictícios.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, ideDmDevComplementar, sugerirDePara, type ParametrosEsocialFolha } from '../eventosFolha';
import { validarPeloXsd } from '../validadorXsd';
import { calcularMensal, type ResultadoCalculo } from '../../calculo/motorMensal';
import { calcularComplementar, type Instrumento } from '../../calculo/complementar';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';

// No jsdom, import.meta.url não é um arquivo: o XSD vem pela raiz do projeto.
const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const CNPJ = '44388152000189';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '9000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', grauExp: '1', estabelecimento: CNPJ } };
const RUB: [string, string, string, '1' | '2', Record<string, string>][] = [
    ['SAL', 'SALARIO', '1000', '1', { codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11' }], ['INSS', 'INSS', '9201', '2', { codIncCP: '31', codIncIRRF: '41' }],
    ['IRRF', 'IRRF', '9203', '2', { codIncIRRF: '31' }]];
const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp, inc]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '09', codIncFGTS: '00', codIncCPRP: '', observacao: '', ...inc } }] }));
const params = (resultados: ResultadoCalculo[], comp: string): ParametrosEsocialFolha => ({ nrInscEstab: CNPJ, codLotacao: 'LOT01',
    rubricas: Object.fromEntries(sugerirDePara(resultados, RUBRICAS, comp).filter(i => i.sugestao).map(i => [i.chave, i.sugestao!])) });
const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const txt = (xml: string, tag: string) => Array.from(doc(xml).getElementsByTagName(tag)).map(e => e.textContent);
const mes = (c: string, pagamento = c) => calcularMensal({ competencia: c, pagamento, ficha: FICHA, afastamentos: [], tabelas: TAB, folhaPagaAntesNoMes: null });
const CCT: Instrumento = { tpAcConv: 'C', dtAcConv: '2026-04-10', dsc: 'Convenção coletiva dos comerciários 2026/2027' };

const montar = (pagamento = '2026-04') => {
    const folha = mes('2026-04', pagamento);
    const comp = calcularComplementar({ perApur: '2026-04', pagamento, instrumento: CCT, reajuste: { pct: 5, de: '2026-01', ate: '2026-03' }, fichas: [FICHA],
        gravadas: Object.fromEntries(['2026-01', '2026-02', '2026-03'].map(c => [c, [mes(c)]])), folhaDoMes: [folha], tabelas: TAB });
    return { folha, comp };
};

describe('folha complementar no eSocial', () => {
    it('S-1200 com a folha (infoPerApur) e a complementar (infoPerAnt) pagas juntas; passa no XSD', async () => {
        const { folha, comp } = montar();
        expect(comp.resultados[0].situacao).toBe('calculado');
        const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-04', dataPagamento: '2026-04-30', fichas: [FICHA], resultados: [folha], rubricas: RUBRICAS,
            parametros: params([folha, ...comp.resultados], '2026-04'), complementares: [{ instrumento: CCT, resultados: comp.resultados }], agora: new Date('2026-04-30T12:00:00Z') });
        const t = g.trabalhadores[0];
        expect(t.erros).toEqual([]);
        const xml = t.s1200!.xml;
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(txt(xml, 'ideDmDev')).toEqual(['FOLHA202604-M1', 'COMP202604C-M1']);
        expect(ideDmDevComplementar('2026-04', 'C', 'M1')).toBe('COMP202604C-M1');
        expect(xml).toContain('<ideADC><dtAcConv>2026-04-10</dtAcConv><tpAcConv>C</tpAcConv><dsc>Convenção coletiva dos comerciários 2026/2027</dsc><remunSuc>N</remunSuc>');
        expect(txt(xml, 'perRef')).toEqual(['2026-01', '2026-02', '2026-03']);
        // Diferença do salário (5% de R$ 9.000) em cada mês; acima do teto do INSS, sem INSS da diferença.
        const periodo = doc(xml).getElementsByTagName('idePeriodo')[0];
        expect(Array.from(periodo.getElementsByTagName('codRubr')).map(e => e.textContent)).toEqual(['SAL']);
        expect(periodo.getElementsByTagName('vrRubr')[0].textContent).toBe('450.00');
        // O IRRF da complementar vai no último mês de referência.
        const ultimo = doc(xml).getElementsByTagName('idePeriodo')[2];
        expect(Array.from(ultimo.getElementsByTagName('codRubr')).map(e => e.textContent)).toEqual(['SAL', 'IRRF']);
        const s1210 = t.s1210!.xml;
        expect(txt(s1210, 'ideDmDev')).toEqual(['FOLHA202604-M1', 'COMP202604C-M1']);
        expect(txt(s1210, 'vrLiq')[1]).toBe((comp.resultados[0].totais.liquido / 100).toFixed(2));
        expect(t.liquido).toBe(folha.totais.liquido + comp.resultados[0].totais.liquido);
    });

    it('INSS da diferença no mês de referência, abaixo do teto', async () => {
        const f2: FichaFuncionario = { ...FICHA, dados: { ...FICHA.dados, salario: '3000.00' } };
        const m = (c: string) => calcularMensal({ competencia: c, pagamento: c, ficha: f2, afastamentos: [], tabelas: TAB, folhaPagaAntesNoMes: null });
        const folha = m('2026-04');
        const comp = calcularComplementar({ perApur: '2026-04', pagamento: '2026-04', instrumento: { tpAcConv: 'J', dsc: '§ 3º do art. 27 da IN RFB nº 2.110/22' },
            reajuste: { pct: 5, de: '2026-02', ate: '2026-03' }, fichas: [f2], gravadas: { '2026-02': [m('2026-02')], '2026-03': [m('2026-03')] }, folhaDoMes: [folha], tabelas: TAB });
        const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-04', dataPagamento: '2026-04-30', fichas: [f2], resultados: [folha], rubricas: RUBRICAS,
            parametros: params([folha, ...comp.resultados], '2026-04'), complementares: [{ instrumento: { tpAcConv: 'J', dsc: '§ 3º do art. 27 da IN RFB nº 2.110/22' }, resultados: comp.resultados }] });
        const t = g.trabalhadores[0];
        expect(t.erros).toEqual([]);
        expect(await validarPeloXsd(t.s1200!.xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(t.s1200!.xml).toContain('<ideADC><tpAcConv>J</tpAcConv>');
        const periodo = doc(t.s1200!.xml).getElementsByTagName('idePeriodo')[0];
        expect(Array.from(periodo.getElementsByTagName('codRubr')).map(e => e.textContent)).toEqual(['SAL', 'INSS']);
    });

    it('complementar calculada para outro mês de pagamento, incompleta ou sem a folha do mês: não vai', () => {
        const { folha, comp } = montar('2026-05');
        const base = { cnpj: CNPJ, tpAmb: 2 as const, competencia: '2026-04', fichas: [FICHA], rubricas: RUBRICAS, parametros: params([folha, ...comp.resultados], '2026-04') };
        const outro = gerarEventosFolha({ ...base, dataPagamento: '2026-04-30', resultados: [mes('2026-04')], complementares: [{ instrumento: CCT, resultados: comp.resultados }] });
        expect(outro.trabalhadores[0].erros.join(' ')).toMatch(/calculada com pagamento em 05\/2026/);
        const inc = gerarEventosFolha({ ...base, dataPagamento: '2026-05-06', resultados: [folha], complementares: [{ instrumento: CCT, resultados: [{ ...comp.resultados[0], situacao: 'incompleto', avisos: ['RRA'] }] }] });
        expect(inc.trabalhadores[0].erros.join(' ')).toMatch(/Complementar \(C\) incompleta: RRA/);
        const sem = gerarEventosFolha({ ...base, dataPagamento: '2026-05-06', resultados: [], complementares: [{ instrumento: CCT, resultados: comp.resultados }] });
        expect(sem.avisos.join(' ')).toMatch(/Complementar de ANA sem a folha de 04\/2026 calculada/);
    });
});
