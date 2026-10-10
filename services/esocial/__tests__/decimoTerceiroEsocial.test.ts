// @vitest-environment jsdom
// 13º no eSocial (S-1.3): 1ª parcela no S-1200 do mês em que foi paga (natureza 5504, só FGTS), em demonstrativo
// próprio; S-1200 anual (indApuracao 2, AAAA) com o 13º (5001), o desconto do adiantamento (9214), INSS e IRRF do 13º,
// e o pagamento no S-1210 do mês da 2ª parcela (perRef AAAA, dedDepen tpRend 12). Dados fictícios.
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, sugerirDePara, type ParametrosEsocialFolha } from '../eventosFolha';
import { calcular13 } from '../../calculo/motor13';
import { calcularMensal } from '../../calculo/motorMensal';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const CNPJ = '44388152000189';
const filho = { tipo: '03', nome: 'BIA', nascimento: '2016-01-01', cpf: '39053344705', irrf: 'S', salarioFamilia: 'N', noEsocial: 'S' };
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dependentes: [filho],
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '9000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', grauExp: '1', estabelecimento: CNPJ } };
const RUB: [string, string, string, '1' | '2', Record<string, string>][] = [
    ['SAL', 'SALARIO', '1000', '1', { codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11' }], ['INSS', 'INSS', '9201', '2', { codIncCP: '31', codIncIRRF: '41' }],
    ['IRRF', 'IRRF', '9203', '2', { codIncIRRF: '31' }], ['13ADI', '13 SALARIO ADIANTAMENTO', '5504', '1', { codIncFGTS: '12' }],
    ['13SAL', '13 SALARIO', '5001', '1', { codIncCP: '12', codIncIRRF: '12', codIncFGTS: '12' }], ['13DESC', 'DESC ADIANT 13 SALARIO', '9214', '2', { codIncFGTS: '12' }],
    ['INSS13', 'INSS 13 SALARIO', '9201', '2', { codIncCP: '32', codIncIRRF: '42' }], ['IRRF13', 'IRRF 13 SALARIO', '9203', '2', { codIncIRRF: '32' }]];
const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp, inc]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '09', codIncFGTS: '00', codIncCPRP: '', observacao: '', ...inc } }] }));
const params = (resultados: Parameters<typeof sugerirDePara>[0], comp: string): ParametrosEsocialFolha => ({ nrInscEstab: CNPJ, codLotacao: 'LOT01',
    rubricas: Object.fromEntries(sugerirDePara(resultados, RUBRICAS, comp).filter(i => i.sugestao).map(i => [i.chave, i.sugestao!])) });
const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const txt = (xml: string, tag: string) => Array.from(doc(xml).getElementsByTagName(tag)).map(e => e.textContent);

describe('13º no eSocial', () => {
    it('de/para: 13º 5001, desconto 9214, INSS e IRRF do 13º pela descrição (o INSS da folha evita o do 13º)', () => {
        const r2 = calcular13({ ano: 2026, parcela: '2a', pagamento: '2026-12', ficha: FICHA, afastamentos: [], tabelas: TAB, movimentos: {} });
        const mensal = calcularMensal({ competencia: '2026-11', pagamento: '2026-12', ficha: FICHA, afastamentos: [], tabelas: TAB, folhaPagaNoAdiantamento: null });
        const p = params([r2, mensal], '2026-12');
        expect(Object.fromEntries(Object.entries(p.rubricas).map(([k, v]) => [k, v.codRubr]))).toMatchObject({ 13: '13SAL', '13ADT': '13DESC', INSS13: 'INSS13', IRRF13: 'IRRF13', INSS: 'INSS', IRRF: 'IRRF' });
    });

    it('S-1200 anual (indApuracao 2) e o pagamento no S-1210 de dezembro, com a dedução do dependente no tpRend 12', () => {
        const r2 = calcular13({ ano: 2026, parcela: '2a', pagamento: '2026-12', ficha: FICHA, afastamentos: [], tabelas: TAB, movimentos: {} });
        expect(r2.situacao).toBe('calculado');
        const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026', dataPagamento: '2026-12-18', fichas: [FICHA], resultados: [r2], rubricas: RUBRICAS, parametros: params([r2], '2026') });
        const t = g.trabalhadores[0];
        expect(t.erros).toEqual([]);
        expect([txt(t.s1200!.xml, 'indApuracao')[0], txt(t.s1200!.xml, 'perApur')[0], txt(t.s1200!.xml, 'ideDmDev')[0]]).toEqual(['2', '2026', '13SAL2026-M1']);
        expect(txt(t.s1200!.xml, 'codRubr')).toEqual(expect.arrayContaining(['13SAL', '13DESC', 'INSS13', 'IRRF13']));
        const s1210 = t.s1210!.xml;
        expect([txt(s1210, 'perApur')[0], txt(s1210, 'perRef')[0], txt(s1210, 'ideDmDev')[0]]).toEqual(['2026-12', '2026', '13SAL2026-M1']);
        expect(txt(s1210, 'vrLiq')[0]).toBe((r2.totais.liquido / 100).toFixed(2));
        expect(s1210).toContain('<dedDepen><tpRend>12</tpRend><cpfDep>39053344705</cpfDep>');
    });

    it('1ª parcela paga em novembro: demonstrativo próprio no S-1200 de novembro, pago na data dela', () => {
        const r1 = calcular13({ ano: 2026, parcela: '1a', pagamento: '2026-11', ficha: FICHA, afastamentos: [], tabelas: TAB, movimentos: {} });
        const mensal = calcularMensal({ competencia: '2026-11', pagamento: '2026-12', ficha: FICHA, afastamentos: [], tabelas: TAB, folhaPagaNoAdiantamento: null });
        const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-11', dataPagamento: '2026-12-07', fichas: [FICHA], resultados: [mensal], rubricas: RUBRICAS,
            parametros: params([mensal, r1], '2026-11'), primeiraParcela13: [{ r: r1, dataPagamento: '2026-11-30' }] });
        const t = g.trabalhadores[0];
        expect(t.erros).toEqual([]);
        expect(txt(t.s1200!.xml, 'ideDmDev')).toEqual(['FOLHA202611-M1', '13ADI2026-M1']);
        const nov = t.outrosMeses.find(m => m.perApur === '2026-11')!;
        expect(txt(nov.s1210!.xml, 'ideDmDev')).toEqual(['13ADI2026-M1']);
        expect(txt(nov.s1210!.xml, 'dtPgto')).toEqual(['2026-11-30']);
        // Paga em outro mês: não vai neste S-1200.
        const fora = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-11', dataPagamento: '2026-12-07', fichas: [FICHA], resultados: [mensal], rubricas: RUBRICAS,
            parametros: params([mensal, r1], '2026-11'), primeiraParcela13: [{ r: r1, dataPagamento: '2026-10-30' }] });
        expect(fora.trabalhadores[0].erros.join(' ')).toMatch(/vai no S-1200 do mês do pagamento/);
    });
});
