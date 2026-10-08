// @vitest-environment jsdom
// IRRF do adiantamento quando o saldo da folha é pago no mês seguinte (regime de caixa; RIR/1999, art. 621),
// conferido com o S-1200 e o S-1210 do IOB de 08/2026 (adiantamento em 20/08, folha paga em 04/09). Dados
// trocados: os eventos do IOB não vão ao repositório; ficam os valores.
import { describe, expect, it } from 'vitest';
import { calcularMensal, type Lancamento } from '../../calculo/motorMensal';
import { arredondar } from '../../calculo/arredondamento';
import { valorDoAdiantamento } from '../../bancario/favorecidos';
import { gerarEventosFolha, pagoNoAdiantamento, verbasDoAdiantamento, type ParametrosEsocialFolha } from '../eventosFolha';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const CNPJ = '44388152000189';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'BIA', admissao: '2020-01-02', salario: '9177.90', unidadeSalario: '5', horasSemanais: '44', categoria: '101', adiantamentoPct: '40' } };
// Atrasos (horas) descontados com incidência de INSS, FGTS e IRRF, como o evento 5850 do IOB.
const atraso = (valor: number): Lancamento => ({ descricao: 'ATRASOS', tipo: 'desconto', valor, inss: true, fgts: true, irrf: true });
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor;

// Folha de julho, paga em 06/08: a que reproduz o IRRF do adiantamento de agosto do IOB (3h08 de atraso).
const julho = calcularMensal({ competencia: '2026-07', pagamento: '2026-08', ficha: FICHA, tabelas: TAB, afastamentos: [], movimento: { lancamentos: [atraso(13119)] }, folhaPagaNoAdiantamento: null });
const agosto = calcularMensal({ competencia: '2026-08', pagamento: '2026-09', ficha: FICHA, tabelas: TAB, afastamentos: [], movimento: { lancamentos: [atraso(9553)] },
    folhaPagaNoAdiantamento: { ...julho.irrfApurado!, competencia: '2026-07' } });

describe('IRRF do adiantamento com a folha paga no mês seguinte', () => {
    it('folha de agosto (paga em 04/09): o adiantamento sai da base; IRRF 61,57 com o redutor, como no IOB', () => {
        expect([v(agosto, 'SAL'), v(agosto, 'ADIANT'), v(agosto, 'INSS')]).toEqual([917790, 367116, 98809]);
        // 9.177,90 − 3.671,16 − 95,53 = 5.411,21; base 4.423,12 × 22,5% − 675,49 = 319,71; redutor 978,62 − 0,133145 × 5.411,21 = 258,14.
        expect(agosto.bases.irrf).toBe(541121);
        expect(v(agosto, 'IRRF')).toBe(6157);
        expect(agosto.situacao).toBe('calculado');
    });

    it('adiantamento de agosto (pago em 20/08): IRRF de tudo o que foi pago em agosto menos o já retido na folha de julho = 1.258,59; líquido 2.412,57', () => {
        expect(julho.irrfApurado).toEqual({ rendimentos: 537555, deducoesLegais: 98809, valor: 4880 });
        // (5.375,55 + 3.671,16 − 988,09) × 27,5% − 908,73 = 1.307,39 (acima de 7.350, sem redutor); − 48,80 = 1.258,59.
        expect(agosto.irrfAdiantamento).toBe(125859);
        expect(agosto.memoria.join(' ')).toMatch(/menos R\$\s48,80 já retidos = R\$\s1\.258,59/);
        expect([pagoNoAdiantamento(agosto), valorDoAdiantamento(agosto)]).toEqual([241257, 241257]);
        // O IRRF do adiantamento não é desconto da folha: o líquido de 04/09 desconta o adiantamento bruto.
        expect(agosto.verbas.filter(x => x.codigo === 'IRRF')).toHaveLength(1);
        // Arredondando, arredonda-se o que foi pago no adiantamento (2.412,57 → 2.413,00).
        expect([valorDoAdiantamento(arredondar(agosto, 0)), v(arredondar(agosto, 0), 'ARREDADI')]).toEqual([241300, 43]);
    });

    it('eSocial: o demonstrativo do adiantamento leva o IRRF; S-1210 de 08 com 2.412,57 em 20/08 e o de 09 com a folha', () => {
        const rub = (k: string, nat: string, tp: '1' | '2'): Rubrica => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
            vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: k, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '00', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] });
        const DEPARA: Record<string, string> = { SAL: 'SAL', INSS: 'INSS', IRRF: 'IRRF', ADIANTPAG: 'ADIPG', ADIANT: 'ADIDESC', 'LAN:ATRASOS': 'ATRASO' };
        const params: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(Object.entries(DEPARA).map(([k, c]) => [k, { codRubr: c, ideTabRubr: 'T1' }])) };
        const rubricas = [rub('SAL', '1000', '1'), rub('INSS', '9201', '2'), rub('IRRF', '9203', '2'), rub('ADIPG', '1099', '1'), rub('ADIDESC', '9200', '2'), rub('ATRASO', '9207', '2')];
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-08', dataPagamento: '2026-09-04', dataAdiantamento: '2026-08-20', fichas: [FICHA], resultados: [agosto], rubricas, parametros: params, agora: new Date('2026-09-10T12:00:00Z') }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
        const dm = Object.fromEntries(Array.from(doc(t.s1200!.xml).getElementsByTagName('dmDev')).map(d => [d.getElementsByTagName('ideDmDev')[0].textContent,
            Object.fromEntries(Array.from(d.getElementsByTagName('itensRemun')).map(i => [i.getElementsByTagName('codRubr')[0].textContent, i.getElementsByTagName('vrRubr')[0].textContent]))]));
        expect(dm['ADI202608-M1']).toEqual({ ADIPG: '3671.16', IRRF: '1258.59' });
        expect(dm['FOLHA202608-M1']).toMatchObject({ SAL: '9177.90', ADIDESC: '3671.16', ATRASO: '95.53', INSS: '988.09', IRRF: '61.57' });
        const pg = [t, ...t.outrosMeses].flatMap(x => (x.s1210 ? Array.from(doc(x.s1210.xml).getElementsByTagName('infoPgto')).map(i => `${i.getElementsByTagName('dtPgto')[0].textContent} ${i.getElementsByTagName('vrLiq')[0].textContent}`) : []));
        // Folha: 4.361,55 aqui; no IOB, 2.405,14 depois de 1.956,41 de consignados (fora deste teste).
        expect(pg.sort()).toEqual(['2026-08-20 2412.57', '2026-09-04 4361.55']);
        // Data do adiantamento fora da competência: o IRRF foi calculado para agosto.
        const fora = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-08', dataPagamento: '2026-09-04', dataAdiantamento: '2026-09-01', fichas: [FICHA], resultados: [agosto], rubricas, parametros: params }).trabalhadores[0];
        expect(fora.erros.join(' ')).toMatch(/foi calculado para pagamento em 08\/2026/);
        // Sem a folha anterior (cálculo fora da tela): incompleto, e o eSocial não sai.
        const sem = calcularMensal({ competencia: '2026-08', pagamento: '2026-09', ficha: FICHA, tabelas: TAB, afastamentos: [] });
        expect([sem.situacao, sem.irrfAdiantamento]).toEqual(['incompleto', undefined]);
        // Folha paga no próprio mês: nada muda (o IRRF fica todo na folha).
        const noMes = calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: FICHA, tabelas: TAB, afastamentos: [], movimento: { lancamentos: [atraso(9553)] } });
        expect([noMes.irrfAdiantamento, noMes.bases.irrf]).toEqual([undefined, 908237]);
        expect(verbasDoAdiantamento(noMes).map(x => x.codigo)).toEqual(['ADIANTPAG']);
    });
});
