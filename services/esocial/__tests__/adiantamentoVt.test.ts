// @vitest-environment jsdom
// Adiantamento salarial e vale-transporte: motor, demonstrativo próprio no S-1200 e pagamento no S-1210,
// conferidos com o caso real do IOB de 08 e 09/2026 (dados trocados; os eventos do IOB não vão ao repositório).
import { describe, expect, it } from 'vitest';
import { dataSugeridaAdiantamento, gerarEventosFolha, recibosFeriasDaCompetencia, sugerirDePara, verbasDoAdiantamentoParaDePara, type ParametrosEsocialFolha } from '../eventosFolha';
import { adiantamentoDoMes, calcularMensal } from '../../calculo/motorMensal';
import { feriasDaCompetencia } from '../../calculo/motorFerias';
import { limparMovimento } from '../../calculo/movimento';
import { fichaVazia, validarFicha, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import type { Rubrica } from '../../cadastros/rubricas';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2026-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 162100, aliquota: 7.5, deducao: 0 }, { ate: 290284, aliquota: 9, deducao: 0 }, { ate: 435427, aliquota: 12, deducao: 0 }, { ate: 847555, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 500000, aliquota: 0, deducao: 0 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const TAB = [INSS, IR];
const CNPJ = '44388152000189';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-03-01', salario: '3500.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', adiantamentoPct: '40', valeTransporte: 'S' } };
const GOZO: Afastamento[] = [{ ...afastamentoVazio(), id: 'g1', fichaId: 'f1', motivo: '15', dtInicio: '2026-09-01', dtFim: '2026-09-20', perAquisInicio: '2025-03-01', abonoDias: '10' }];
const v = (r: { verbas: { codigo: string; valor: number }[] }, c: string) => r.verbas.find(x => x.codigo === c)?.valor;

// Rubricas como no S-1010 do IOB: o adiantamento sem natureza fixa (vai pela descrição); desconto 9200; VT 9216.
const RUB: [string, string, string, '1' | '2'][] = [['SAL', 'SALARIO', '1000', '1'], ['INSS', 'INSS', '9201', '2'], ['ADIPG', 'ADIANTAMENTO DE SALARIO', '1099', '1'], ['ADIDESC', 'ADIANTAMENTO (VALE)', '9200', '2'],
    ['VTD', 'VALE TRANSPORTE', '9216', '2'], ['FERMES', 'FERIAS', '1016', '1'], ['FERMES13', '1/3 FERIAS', '1017', '1'], ['FERPAGO', 'DESC FERIAS', '9221', '2'], ['INSSFERRET', 'INSS S/FERIAS', '9201', '2'],
    ['FERADI', 'FERIAS REC', '1015', '1'], ['FERADI13', '1/3 FERIAS REC', '1015', '1'], ['ABONO', 'ABONO PECUNIARIO', '1023', '1'], ['ABONO13', '1/3 ABONO', '1023', '1'], ['INSSFER', 'INSS FERIAS REC', '9201', '2']];
const RUBRICAS: Rubrica[] = RUB.map(([k, dsc, nat, tp]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: dsc, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '00', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] }));
const DEPARA: Record<string, string> = { SAL: 'SAL', INSS: 'INSS', ADIANTPAG: 'ADIPG', ADIANT: 'ADIDESC', VT: 'VTD', FERMES: 'FERMES', FERMES13: 'FERMES13', FERPAGO: 'FERPAGO', INSSFERRET: 'INSSFERRET',
    FERADI: 'FERADI', FERADI13: 'FERADI13', ABONO: 'ABONO', ABONO13: 'ABONO13', INSSFER: 'INSSFER' };
const PARAMS: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(Object.entries(DEPARA).map(([k, c]) => [k, { codRubr: c, ideTabRubr: 'T1' }])) };
const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const txt = (d: Document, tag: string) => Array.from(d.getElementsByTagName(tag)).map(e => e.textContent);
const demonstrativos = (xml: string) => Object.fromEntries(Array.from(doc(xml).getElementsByTagName('dmDev')).map(dm => [
    dm.getElementsByTagName('ideDmDev')[0].textContent,
    Object.fromEntries(Array.from(dm.getElementsByTagName('itensRemun')).map(i => [i.getElementsByTagName('codRubr')[0].textContent, i.getElementsByTagName('vrRubr')[0].textContent])),
]));
const mensal = (competencia: string, ficha = FICHA, movimento = {}) => calcularMensal({ competencia, pagamento: competencia, ficha, tabelas: TAB, afastamentos: GOZO, movimento, feriasDoMes: feriasDaCompetencia(ficha, GOZO, TAB, {}, competencia) });

describe('adiantamento salarial e vale-transporte', () => {
    it('motor: 40% e 6% do salário do mês, como o IOB (agosto inteiro; setembro só com os 10 dias fora das férias)', () => {
        const ago = mensal('2026-08');
        expect([v(ago, 'SAL'), v(ago, 'ADIANT'), v(ago, 'VT'), v(ago, 'INSS')]).toEqual([350000, 140000, 21000, 30860]);
        // IOB, folha de 08: 3.500,00 − 1.400,00 − 210,00 − 308,60 = 1.581,40 (o IOB arredonda para 1.581,00).
        expect(ago.totais.liquido).toBe(158140);
        expect(ago.bases).toMatchObject({ inss: 350000, irrf: 350000 });
        const set = mensal('2026-09');
        // IOB, folha de 09: salário de 10 dias 1.166,67; adiantamento 466,67 (40%); VT 70,00 (6%); líquido 490,00.
        expect([v(set, 'SAL'), v(set, 'ADIANT'), v(set, 'VT'), v(set, 'INSS')]).toEqual([116667, 46667, 7000, 14000]);
        expect(set.totais.liquido).toBe(49000);
        expect(adiantamentoDoMes(set)).toBe(46667);
    });

    it('VT sem deslocamento: afastamento remunerado e os 15 primeiros dias de doença não entram (Codex #115)', () => {
        // Doença o mês inteiro: 15 dias pagos pela empresa, nenhum com deslocamento.
        const doente: Afastamento = { ...afastamentoVazio(), id: 'd1', fichaId: 'f1', motivo: '03', dtInicio: '2026-08-01', dtFim: '2026-08-31' };
        const r = calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: FICHA, tabelas: TAB, afastamentos: [doente] });
        expect([v(r, 'SAL'), v(r, 'VT')]).toEqual([175000, undefined]);
        // Afastamento remunerado (16) de 10 dias: o VT fica sobre os 20 com deslocamento.
        const rem: Afastamento = { ...afastamentoVazio(), id: 'r1', fichaId: 'f1', motivo: '16', dtInicio: '2026-08-01', dtFim: '2026-08-10' };
        const r2 = calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: FICHA, tabelas: TAB, afastamentos: [rem] });
        expect([v(r2, 'SAL'), v(r2, 'VT')]).toEqual([350000, 14000]);
        expect(r2.memoria.join(' ')).toContain('de 20 dia(s) com deslocamento');
        // Fevereiro inteiro em afastamento remunerado: 28 datas, 30 dias comerciais pagos, nenhum com deslocamento (Codex #115).
        const fev: Afastamento = { ...afastamentoVazio(), id: 'r2', fichaId: 'f1', motivo: '16', dtInicio: '2026-02-01', dtFim: '2026-02-28' };
        const rf = calcularMensal({ competencia: '2026-02', pagamento: '2026-02', ficha: FICHA, tabelas: TAB, afastamentos: [fev] });
        expect([v(rf, 'SAL'), v(rf, 'VT')]).toEqual([350000, undefined]);
        // Fevereiro com 20 dias de afastamento: 8 dias de calendário com deslocamento (e não 10 dos 30 comerciais).
        const fev20 = calcularMensal({ competencia: '2026-02', pagamento: '2026-02', ficha: FICHA, tabelas: TAB, afastamentos: [{ ...fev, dtFim: '2026-02-20' }] });
        expect(fev20.memoria.join(' ')).toContain('de 8 dia(s) com deslocamento');
        // Fevereiro sem afastamento: o mês comercial inteiro.
        expect(v(calcularMensal({ competencia: '2026-02', pagamento: '2026-02', ficha: FICHA, tabelas: TAB, afastamentos: [] }), 'VT')).toBe(21000);
        // Faltas do movimento também não têm deslocamento: 6 faltas deixam 24 dias (Codex #115); o mês todo, VT zero.
        const comFaltas = calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: FICHA, tabelas: TAB, afastamentos: [], movimento: { faltasDias: 6 } });
        expect(v(comFaltas, 'VT')).toBe(16800);
        expect(comFaltas.memoria.join(' ')).toContain('de 24 dia(s) com deslocamento; faltas');
        expect(v(calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: FICHA, tabelas: TAB, afastamentos: [], movimento: { faltasDias: 30 } }), 'VT')).toBeUndefined();
    });

    it('motor: o custo do benefício limita o VT; o movimento sobrepõe a ficha (0 = não houve) e o 0 fica gravado', () => {
        const comCusto = mensal('2026-08', { ...FICHA, dados: { ...FICHA.dados, valeTransporteCusto: '150.00' } });
        expect(v(comCusto, 'VT')).toBe(15000);
        expect(comCusto.memoria.join(' ')).toContain('que limita o desconto');
        // Mês parcial (setembro: 10 dias fora das férias): o custo do mês inteiro vale pelos dias pagos (Codex #115).
        const setCusto = mensal('2026-09', { ...FICHA, dados: { ...FICHA.dados, valeTransporteCusto: '150.00' } });
        expect(v(setCusto, 'VT')).toBe(5000);
        expect(setCusto.memoria.join(' ')).toMatch(/custo do benefício R\$\s50,00 \(R\$\s150,00 × 10\/30 dias\), que limita o desconto/);
        const informado = mensal('2026-08', FICHA, { adiantamento: 120000, valeTransporte: 0 });
        expect([v(informado, 'ADIANT'), v(informado, 'VT')]).toEqual([120000, undefined]);
        const sem = mensal('2026-08', { ...FICHA, dados: { ...FICHA.dados, adiantamentoPct: '', valeTransporte: 'N' } });
        expect([v(sem, 'ADIANT'), v(sem, 'VT')]).toEqual([undefined, undefined]);
        expect(limparMovimento({ adiantamento: 0, valeTransporte: 7000.4, horasExtras50: 0 })).toEqual({ adiantamento: 0, valeTransporte: 7000 });
        expect(validarFicha({ ...FICHA, dados: { ...FICHA.dados, adiantamentoPct: '140', valeTransporteCusto: 'abc' } }).erros)
            .toEqual(expect.arrayContaining(['Adiantamento salarial: percentual entre 0 e 100.', expect.stringMatching(/^Custo do vale-transporte inválido/)]));
    });

    it('eSocial: demonstrativo próprio do adiantamento no S-1200 e pagamento na data dele; a folha desconta (MOS S-1200, item 3.4)', () => {
        expect([dataSugeridaAdiantamento('2026-08'), dataSugeridaAdiantamento('2026-09')]).toEqual(['2026-08-20', '2026-09-18']); // 20/09/2026 é domingo
        const ago = mensal('2026-08');
        const recibosFerias = recibosFeriasDaCompetencia([FICHA], GOZO, TAB, {}, '2026-08');
        const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-08', dataPagamento: '2026-08-31', fichas: [FICHA], resultados: [ago], rubricas: RUBRICAS, parametros: PARAMS, recibosFerias, agora: new Date('2026-10-01T12:00:00Z') });
        const t = g.trabalhadores[0];
        expect([g.erros, t.erros]).toEqual([[], []]);
        // Como o IOB (ADIA, MENS e FERI): três demonstrativos no S-1200 de 08.
        expect(demonstrativos(t.s1200!.xml)).toEqual({
            'FOLHA202608-M1': { SAL: '3500.00', ADIDESC: '1400.00', VTD: '210.00', INSS: '308.60' },
            'ADI202608-M1': { ADIPG: '1400.00' },
            'FER20260828-M1': { FERADI: '2333.33', FERADI13: '777.78', ABONO: '1166.67', ABONO13: '388.89', INSSFER: '261.93' },
        });
        const s1210 = doc(t.s1210!.xml);
        const pg = txt(s1210, 'ideDmDev').map((ide, i) => [ide, txt(s1210, 'dtPgto')[i], txt(s1210, 'vrLiq')[i]]);
        expect(pg).toEqual(expect.arrayContaining([['ADI202608-M1', '2026-08-20', '1400.00'], ['FER20260828-M1', '2026-08-28', '4404.74'], ['FOLHA202608-M1', '2026-08-31', '1581.40']]));
        expect(t.outrosMeses).toEqual([]);
        // Folha paga no mês seguinte: o IRRF do adiantamento seria do mês dele (RIR/1999, art. 621), e o motor ainda
        // não separa. O motor avisa e o eSocial não gera (Codex #115).
        const ago2 = calcularMensal({ competencia: '2026-08', pagamento: '2026-09', ficha: FICHA, tabelas: TAB, afastamentos: GOZO, feriasDoMes: feriasDaCompetencia(FICHA, GOZO, TAB, {}, '2026-08') });
        expect(ago2.avisos).toEqual(expect.arrayContaining([expect.stringMatching(/o IRRF do adiantamento é do mês em que ele é pago/)]));
        const t2 = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-08', dataPagamento: '2026-09-04', fichas: [FICHA], resultados: [ago2], rubricas: RUBRICAS, parametros: PARAMS, agora: new Date('2026-10-01T12:00:00Z') }).trabalhadores[0];
        expect(t2.erros).toEqual([expect.stringMatching(/^Adiantamento pago em 08\/2026 e saldo da folha em 09\/2026: o IRRF do adiantamento é do mês em que ele é pago/)]);
        expect(t2.s1200).toBeNull();
        // Data do adiantamento depois da folha é recusada.
        expect(gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-08', dataPagamento: '2026-08-10', dataAdiantamento: '2026-08-20', fichas: [FICHA], resultados: [ago], rubricas: RUBRICAS, parametros: PARAMS }).erros)
            .toEqual(['O adiantamento salarial é pago antes da folha: confira as datas.']);
    });

    it('de/para: o provento do adiantamento vai pela descrição; o desconto em 9200 e o VT em 9216', () => {
        const ago = mensal('2026-08');
        const itens = sugerirDePara([ago, ...verbasDoAdiantamentoParaDePara([ago])], RUBRICAS, '2026-08');
        const s = Object.fromEntries(itens.map(i => [i.chave, i.sugestao?.codRubr ?? null]));
        expect([s.ADIANTPAG, s.ADIANT, s.VT]).toEqual(['ADIPG', 'ADIDESC', 'VTD']);
        // Só uma rubrica de provento com "ADIANT", e ela é de férias: não é sugerida para o adiantamento salarial (Codex #115).
        const soFerias = RUBRICAS.filter(r => r.id !== 'ADIPG').map(r => r.id !== 'FERADI' ? r : { ...r, vigencias: [{ ...r.vigencias[0], dados: { ...r.vigencias[0].dados, dscRubr: 'ADIANTAMENTO DE FERIAS' } }] });
        const s2 = Object.fromEntries(sugerirDePara([ago, ...verbasDoAdiantamentoParaDePara([ago])], soFerias, '2026-08').map(i => [i.chave, i.sugestao?.codRubr ?? null]));
        expect(s2.ADIANTPAG).toBeNull();
        // Nem adiantamento de comissão ou gorjeta (catálogo de eventos do IOB): só o de salário, vale ou quinzena (Codex #115).
        for (const dsc of ['ADIANTAMENTO COMISSAO', 'ADIANTAMENTO GORJETA']) {
            const outra = RUBRICAS.filter(r => r.id !== 'ADIPG').concat([{ ...RUBRICAS.find(r => r.id === 'ADIPG')!, id: 'X', codRubr: 'X', vigencias: [{ ...RUBRICAS[0].vigencias[0], dados: { ...RUBRICAS[0].vigencias[0].dados, dscRubr: dsc, tpRubr: '1' } }] }]);
            expect(sugerirDePara([ago, ...verbasDoAdiantamentoParaDePara([ago])], outra, '2026-08').find(i => i.chave === 'ADIANTPAG')?.sugestao).toBeNull();
        }
        const quinz = RUBRICAS.map(r => r.id !== 'ADIPG' ? r : { ...r, vigencias: [{ ...r.vigencias[0], dados: { ...r.vigencias[0].dados, dscRubr: 'ADIANTAMENTO QUINZENAL' } }] });
        expect(sugerirDePara([ago, ...verbasDoAdiantamentoParaDePara([ago])], quinz, '2026-08').find(i => i.chave === 'ADIANTPAG')?.sugestao?.codRubr).toBe('ADIPG');
    });

    it('admitido depois do dia do adiantamento: sem adiantamento automático; informado antes da admissão, o eSocial recusa (Codex #115)', () => {
        const nova = { ...FICHA, dados: { ...FICHA.dados, admissao: '2026-08-25' } };
        const r = calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: nova, tabelas: TAB, afastamentos: [] });
        expect([v(r, 'SAL'), v(r, 'ADIANT')]).toEqual([81667, undefined]);
        expect(r.memoria.join(' ')).toContain('sem vínculo em 20/08/2026 (dia do adiantamento), não calculado');
        const informado = calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: nova, tabelas: TAB, afastamentos: [], movimento: { adiantamento: 30000 } });
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-08', dataPagamento: '2026-08-31', fichas: [nova], resultados: [informado], rubricas: RUBRICAS, parametros: PARAMS }).trabalhadores[0];
        expect(t.erros).toEqual([expect.stringMatching(/^Adiantamento salarial em 20\/08\/2026, antes da admissão \(25\/08\/2026\)/)]);
        // Data do adiantamento mudada na tela: quem foi admitido entre a data do cálculo e a nova é avisado (Codex #115);
        // com o adiantamento informado no movimento, vale o informado.
        const admit = { ...FICHA, dados: { ...FICHA.dados, admissao: '2026-08-15' } };
        const auto = calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: admit, tabelas: TAB, afastamentos: [] });
        const gera = (res: typeof auto) => gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-08', dataPagamento: '2026-08-31', dataAdiantamento: '2026-08-14', fichas: [admit], resultados: [res], rubricas: RUBRICAS, parametros: PARAMS }).trabalhadores[0];
        expect(gera(auto).erros).toEqual([expect.stringMatching(/^Adiantamento em 14\/08\/2026, mas o cálculo usou 20\/08\/2026, e a admissão ou o desligamento fica entre as duas datas/)]);
        const zero = calcularMensal({ competencia: '2026-08', pagamento: '2026-08', ficha: admit, tabelas: TAB, afastamentos: [], movimento: { adiantamento: 0 } });
        expect(gera(zero).erros).toEqual([]);
        // Desligado no próprio dia do cálculo (18/09) e data mudada para 20/09: o motor paga (desligamento não é anterior
        // ao dia), mas no dia novo já não havia vínculo (Codex #115). Hoje o mês do desligamento fica incompleto (rescisão
        // fora do motor); o resultado é tratado como calculado para conferir a regra de quando ela entrar.
        const sai = { ...FICHA, dados: { ...FICHA.dados, dataDesligamento: '2026-09-18' } };
        const set = { ...calcularMensal({ competencia: '2026-09', pagamento: '2026-09', ficha: sai, tabelas: TAB, afastamentos: [] }), situacao: 'calculado' as const };
        expect(set.verbas.some(x => x.codigo === 'ADIANT')).toBe(true);
        const geraSet = (data: string) => gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-09-30', dataAdiantamento: data, fichas: [sai], resultados: [set], rubricas: RUBRICAS, parametros: PARAMS }).trabalhadores[0];
        expect(geraSet('2026-09-20').erros).toEqual([expect.stringMatching(/^Adiantamento em 20\/09\/2026, mas o cálculo usou 18\/09\/2026/)]);
        expect(geraSet('2026-09-17').erros.filter(x => x.startsWith('Adiantamento em'))).toEqual([]);
    });
});
