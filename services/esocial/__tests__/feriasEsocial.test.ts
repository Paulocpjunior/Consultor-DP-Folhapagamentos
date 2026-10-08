// @vitest-environment jsdom
// Demonstrativo de férias no S-1200 e pagamento no S-1210 (dados fictícios; motor de verdade).
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, mesclarIRFerias, recibosFeriasDaCompetencia, sugerirDePara, verbasDosRecibosParaDePara, type ParametrosEsocialFolha } from '../eventosFolha';
import { calcularMensal } from '../../calculo/motorMensal';
import { calcularFerias, feriasDaCompetencia } from '../../calculo/motorFerias';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';
import type { Rubrica } from '../../cadastros/rubricas';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2025-05', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const TABELAS = [INSS, IR];
const CNPJ = '44388152000189';
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '6000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101' } };
const gozo = (dtInicio: string, dtFim: string): Afastamento => ({ ...afastamentoVazio(), id: `g${dtInicio}`, fichaId: 'f1', motivo: '15', dtInicio, dtFim, perAquisInicio: '2024-01-02' });

// Uma rubrica por verba, com a natureza que o de/para sugere (provento 1, desconto 2).
const NATUREZAS: [string, string, '1' | '2'][] = [['SAL', '1000', '1'], ['INSS', '9201', '2'], ['IRRF', '9203', '2'], ['FERMES', '1016', '1'], ['FERMES13', '1017', '1'], ['FERPAGO', '9221', '2'],
    ['INSSFERRET', '9201', '2'], ['IRRFFERRET', '9203', '2'], ['FERADI', '1015', '1'], ['FERADI13', '1015', '1'], ['INSSFER', '9201', '2'], ['IRRFFER', '9203', '2']];
const RUBRICAS: Rubrica[] = NATUREZAS.map(([k, nat, tp]) => ({ id: k, empresaId: 'E1', codRubr: k, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: k, natRubr: nat, tpRubr: tp, codIncCP: '00', codIncIRRF: '00', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] }));
const PARAMS: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: Object.fromEntries(NATUREZAS.map(([k]) => [k, { codRubr: k, ideTabRubr: 'T1' }])) };

const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const txt = (d: Document, tag: string) => Array.from(d.getElementsByTagName(tag)).map(e => e.textContent);
/** Rubricas de cada demonstrativo: ideDmDev → { rubrica: valor }. */
const demonstrativos = (xml: string) => Object.fromEntries(Array.from(doc(xml).getElementsByTagName('dmDev')).map(dm => [
    dm.getElementsByTagName('ideDmDev')[0].textContent,
    Object.fromEntries(Array.from(dm.getElementsByTagName('itensRemun')).map(i => [i.getElementsByTagName('codRubr')[0].textContent, i.getElementsByTagName('vrRubr')[0].textContent])),
]));

function eventos(competencia: string, gozos: Afastamento[], dataPagamento: string) {
    const fm = feriasDaCompetencia(FICHA, gozos, TABELAS, {}, competencia);
    const r = calcularMensal({ competencia, pagamento: dataPagamento.slice(0, 7), ficha: FICHA, tabelas: TABELAS, afastamentos: gozos, feriasDoMes: fm });
    const recibosFerias = recibosFeriasDaCompetencia([FICHA], gozos, TABELAS, {}, competencia);
    const g = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia, dataPagamento, fichas: [FICHA], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS, recibosFerias, agora: new Date('2025-09-01T12:00:00Z') });
    return { r, recibosFerias, g, t: g.trabalhadores[0] };
}

describe('férias no S-1200 e no S-1210', () => {
    it('pagas no mês anterior ao gozo (MOS item 23 a): adiantamento 1015 no S-1200 do pagamento, S-1210 na data do recibo; a folha do gozo traz 1016/1017 e abate (9221)', () => {
        const g = [gozo('2025-08-01', '2025-08-20')]; // paga em 30/07 (2 dias antes)
        const jul = eventos('2025-07', g, '2025-08-05');
        expect(jul.recibosFerias.map(x => x.dataPagamento)).toEqual(['2025-07-30']);
        expect(jul.t.erros).toEqual([]);
        const dm = demonstrativos(jul.t.s1200!.xml);
        expect(Object.keys(dm)).toEqual(['FOLHA202507-M1', 'FER20250730-M1']);
        expect(Object.keys(dm['FOLHA202507-M1'])).toEqual(['SAL', 'INSS', 'IRRF']);
        const rec = jul.recibosFerias[0].r;
        const v = (c: string) => ((rec.verbas.find(x => x.codigo === c)?.valor ?? 0) / 100).toFixed(2);
        // O recibo inteiro como adiantamento, com o INSS e o IRRF retidos (MOS item 29: "Antecipação de férias").
        expect(dm['FER20250730-M1']).toEqual({ FERADI: v('FER'), FERADI13: v('FER13'), INSSFER: v('INSSFER'), IRRFFER: v('IRRFFER') });
        // Dois S-1210: o do recibo (julho, perRef 07) e o da folha (agosto).
        expect(jul.t.perApur).toBe('2025-08');
        expect(txt(doc(jul.t.s1210!.xml), 'ideDmDev')).toEqual(['FOLHA202507-M1']);
        expect(jul.t.outrosMeses.map(m => m.perApur)).toEqual(['2025-07']);
        const s1210Jul = doc(jul.t.outrosMeses[0].s1210!.xml);
        expect([txt(s1210Jul, 'perApur')[0], txt(s1210Jul, 'dtPgto')[0], txt(s1210Jul, 'perRef')[0], txt(s1210Jul, 'ideDmDev')[0], txt(s1210Jul, 'vrLiq')[0]])
            .toEqual(['2025-07', '2025-07-30', '2025-07', 'FER20250730-M1', (rec.totais.liquido / 100).toFixed(2)]);
        expect(jul.t.recibosFerias).toBe(1);

        // Agosto (gozo): só a folha, com as férias do mês e o abatimento do que o recibo pagou e reteve.
        const ago = eventos('2025-08', g, '2025-09-05');
        expect(ago.t.erros).toEqual([]);
        const dmAgo = demonstrativos(ago.t.s1200!.xml);
        expect(Object.keys(dmAgo)).toEqual(['FOLHA202508-M1']);
        expect(Object.keys(dmAgo['FOLHA202508-M1'])).toEqual(expect.arrayContaining(['FERMES', 'FERMES13', 'FERPAGO', 'INSSFERRET', 'IRRFFERRET']));
        expect([dmAgo['FOLHA202508-M1'].FERMES, dmAgo['FOLHA202508-M1'].FERMES13]).toEqual([v('FER'), v('FER13')]);
        expect(ago.t.outrosMeses).toEqual([]);
    });

    it('pagas no próprio mês, com gozo em dois meses (MOS item 23 b/c, opção 1): adiantamento inteiro no recibo; a folha de cada mês traz a sua parte e abate', () => {
        const g = [gozo('2025-07-14', '2025-08-02')]; // paga em 11/07; gozo em julho (18 dias) e agosto (2 dias)
        const jul = eventos('2025-07', g, '2025-08-05');
        expect(jul.t.erros).toEqual([]);
        const dm = demonstrativos(jul.t.s1200!.xml);
        const rec = jul.recibosFerias[0].r;
        const [pj, pa] = rec.porCompetencia;
        expect([pj.competencia, pa.competencia]).toEqual(['2025-07', '2025-08']);
        expect(Object.keys(dm['FER20250711-M1'])).toEqual(['FERADI', 'FERADI13', 'INSSFER', 'IRRFFER']);
        expect(dm['FER20250711-M1'].FERADI).toBe(((pj.ferias + pa.ferias) / 100).toFixed(2));
        // A folha de julho traz as férias de julho (1016/1017) e abate a parte de julho do recibo; o líquido dela é o do holerite.
        const folha = dm['FOLHA202507-M1'];
        expect([folha.FERMES, folha.FERMES13, folha.INSSFERRET]).toEqual([(pj.ferias / 100).toFixed(2), (pj.terco / 100).toFixed(2), (pj.inss / 100).toFixed(2)]);
        expect(txt(doc(jul.t.s1210!.xml), 'vrLiq')).toEqual([(jul.r.totais.liquido / 100).toFixed(2)]);
        // INSS de julho (descontado na folha): o retido no recibo da parte de julho + o da folha = o INSS sobre salário + férias do mês.
        const inssMes = jul.r.verbas.find(x => x.codigo === 'INSS')!.valor + pj.inss;
        expect(Number(folha.INSSFERRET) + Number(folha.INSS)).toBeCloseTo(inssMes / 100, 2);
        // Agosto: a folha traz a parte de agosto e abate.
        const ago = eventos('2025-08', g, '2025-09-05');
        expect(ago.t.erros).toEqual([]);
        expect(demonstrativos(ago.t.s1200!.xml)['FOLHA202508-M1'].FERMES).toBe((pa.ferias / 100).toFixed(2));
    });

    it('folha e recibo pagos no mesmo mês: um S-1210 só, com os dois pagamentos', () => {
        const g = [gozo('2025-07-14', '2025-07-23')];
        const { t } = eventos('2025-07', g, '2025-07-31');
        expect(t.erros).toEqual([]);
        expect([t.perApur, t.outrosMeses.length]).toEqual(['2025-07', 0]);
        expect(txt(doc(t.s1210!.xml), 'ideDmDev')).toEqual(['FOLHA202507-M1', 'FER20250711-M1']);
        expect(txt(doc(t.s1210!.xml), 'dtPgto')).toEqual(['2025-07-31', '2025-07-11']);
    });

    it('fim de semana no início do mês: o recibo é pago no mês anterior e o IRRF usa a tabela desse mês (Codex #111)', () => {
        // Início em 03/03/2026 (terça): 2 dias antes é domingo 01/03 → pago na sexta 27/02.
        const rf = calcularFerias({ ficha: FICHA, gozo: gozo('2026-03-03', '2026-03-22'), afastamentos: [], tabelas: TABELAS, movimentos: {} });
        expect([rf.pagarAte, rf.pagamento]).toEqual(['2026-03-01', '2026-02']);
        const [x] = recibosFeriasDaCompetencia([FICHA], [gozo('2026-03-03', '2026-03-22')], TABELAS, {}, '2026-02');
        expect([x.dataPagamento, x.r.pagamento]).toEqual(['2026-02-27', '2026-02']);
    });

    it('IRRF das férias com dependente: dedução no S-1210 do mês do recibo, tpRend 13 (Codex #111)', () => {
        const comDep: FichaFuncionario = { ...FICHA, dependentes: [{ tipo: '03', nome: 'FILHO', nascimento: '2015-01-01', cpf: '11144477735', irrf: 'S', salarioFamilia: 'N' }] } as FichaFuncionario;
        const g = [gozo('2025-08-01', '2025-08-20')];
        const r = calcularMensal({ competencia: '2025-07', pagamento: '2025-08', ficha: comDep, tabelas: TABELAS, afastamentos: g });
        const recibos = recibosFeriasDaCompetencia([comDep], g, TABELAS, {}, '2025-07');
        expect(recibos[0].r.irrf).toMatchObject({ usouSimplificado: false, dependentes: 1 });
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2025-07', dataPagamento: '2025-08-05', fichas: [comDep], resultados: [r], rubricas: RUBRICAS, parametros: PARAMS, recibosFerias: recibos }).trabalhadores[0];
        expect(t.erros).toEqual([]);
        const jul = doc(t.outrosMeses[0].s1210!.xml);
        const ded = jul.getElementsByTagName('dedDepen')[0];
        expect(Array.from(ded.children).map(e => e.textContent)).toEqual(['13', '11144477735', '189.59']);
        // Fora do S-2200/S-2205: vai também no infoDep, com depIRRF.
        expect(Array.from(jul.getElementsByTagName('infoDep')[0].children).map(e => e.localName)).toEqual(['cpfDep', 'dtNascto', 'nome', 'depIRRF', 'tpDep']);
        // A folha (agosto) leva só a dela (tpRend 11), quando deduz dependentes.
        expect(txt(doc(t.s1210!.xml), 'tpRend').every(x => x === '11')).toBe(true);
    });

    it('de/para: as verbas do recibo entram com a natureza sugerida; folha com férias sem o recibo não gera', () => {
        const g = [gozo('2025-08-01', '2025-08-20')];
        const { r, recibosFerias } = eventos('2025-07', g, '2025-08-05');
        const itens = sugerirDePara([r, ...verbasDosRecibosParaDePara(recibosFerias, '2025-07')], RUBRICAS, '2025-07');
        expect(Object.fromEntries(itens.map(i => [i.chave, i.sugestao?.codRubr ?? null]))).toMatchObject({ FERADI: null, FERADI13: null, INSSFER: null, IRRFFER: null });
        // Natureza única: sugere (aqui há duas 1015 e três 9201: a equipe escolhe).
        const so1015 = RUBRICAS.filter(x => x.codRubr !== 'FERADI13');
        expect(sugerirDePara(verbasDosRecibosParaDePara(recibosFerias, '2025-07'), so1015, '2025-07').find(i => i.chave === 'FERADI')!.sugestao).toEqual({ codRubr: 'FERADI', ideTabRubr: 'T1' });
        // Agosto sem o recibo na lista: as férias da folha não batem e o trabalhador fica sem evento.
        const fm = feriasDaCompetencia(FICHA, g, TABELAS, {}, '2025-08');
        const ago = calcularMensal({ competencia: '2025-08', pagamento: '2025-09', ficha: FICHA, tabelas: TABELAS, afastamentos: g, feriasDoMes: fm });
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2025-08', dataPagamento: '2025-09-05', fichas: [FICHA], resultados: [ago], rubricas: RUBRICAS, parametros: PARAMS }).trabalhadores[0];
        expect([t.s1200, t.erros.join(' ')]).toEqual([null, expect.stringMatching(/Férias do mês na folha .* não batem com os recibos de férias com gozo em 08\/2025/)]);
    });

    it('confere com o IOB (caso real, 08 e 09/2026, dados trocados): 20 dias de gozo + 10 de abono pagos na sexta antes do domingo', () => {
        // Eventos aceitos do IOB: salário 3.500, gozo 01 a 20/09/2026, abono de 10 dias, recibo pago em 28/08 (o prazo
        // caía no domingo, 30/08). Tabela do INSS de 2026; IRRF zero nos dois meses (isenção de 2026).
        const INSS26: TabelaLegal = { ...INSS, vigencia: '2026-01', faixas: [{ ate: 162100, aliquota: 7.5, deducao: 0 }, { ate: 290284, aliquota: 9, deducao: 0 }, { ate: 435427, aliquota: 12, deducao: 0 }, { ate: 847555, aliquota: 14, deducao: 0 }] };
        const IR26: TabelaLegal = { ...IR, vigencia: '2026-01', faixas: [{ ate: 500000, aliquota: 0, deducao: 0 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
        const tab = [INSS26, IR26];
        const ficha: FichaFuncionario = { ...FICHA, dados: { ...FICHA.dados, admissao: '2024-03-01', salario: '3500.00' } };
        const g = [{ ...gozo('2026-09-01', '2026-09-20'), perAquisInicio: '2025-03-01', abonoDias: '10' }];
        const cods = ['SAL', 'INSS', 'FERMES', 'FERMES13', 'FERPAGO', 'INSSFERRET', 'FERADI', 'FERADI13', 'INSSFER', 'ABONO', 'ABONO13'];
        const rub: Rubrica[] = cods.map(k => ({ ...RUBRICAS[0], id: k, codRubr: k, vigencias: [{ ...RUBRICAS[0].vigencias[0], dados: { ...RUBRICAS[0].vigencias[0].dados, dscRubr: k, tpRubr: ['INSS', 'FERPAGO', 'INSSFERRET', 'INSSFER'].includes(k) ? '2' : '1' } }] }));
        const par: ParametrosEsocialFolha = { ...PARAMS, rubricas: Object.fromEntries(cods.map(k => [k, { codRubr: k, ideTabRubr: 'T1' }])) };
        const ev = (competencia: string, dataPagamento: string) => {
            const r = calcularMensal({ competencia, pagamento: dataPagamento.slice(0, 7), ficha, tabelas: tab, afastamentos: g, feriasDoMes: feriasDaCompetencia(ficha, g, tab, {}, competencia) });
            const recibosFerias = recibosFeriasDaCompetencia([ficha], g, tab, {}, competencia);
            const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia, dataPagamento, fichas: [ficha], resultados: [r], rubricas: rub, parametros: par, recibosFerias, agora: new Date('2026-10-01T12:00:00Z') }).trabalhadores[0];
            return { t, dm: demonstrativos(t.s1200!.xml) };
        };
        // Agosto: o recibo vai como demonstrativo próprio no S-1200 de 08, com os valores do S_RECIFER_* do IOB
        // (1180 férias 2.333,33; 1440 1/3 777,78; 1330 abono 1.166,67; 1210 1/3 do abono 388,89; 9850 INSS 261,93).
        const ago = ev('2026-08', '2026-08-30');
        expect(ago.t.erros).toEqual([]);
        expect(ago.dm['FER20260828-M1']).toEqual({ FERADI: '2333.33', FERADI13: '777.78', ABONO: '1166.67', ABONO13: '388.89', INSSFER: '261.93' });
        expect(ago.dm['FOLHA202608-M1']).toEqual({ SAL: '3500.00', INSS: '308.60' });
        // S-1210 de 08: o recibo em 28/08 com o líquido do IOB (4.404,74), perRef 08.
        const s1210 = doc(ago.t.s1210!.xml);
        expect(txt(s1210, 'ideDmDev')).toContain('FER20260828-M1');
        const i = txt(s1210, 'ideDmDev').indexOf('FER20260828-M1');
        expect([txt(s1210, 'dtPgto')[i], txt(s1210, 'perRef')[i], txt(s1210, 'vrLiq')[i]]).toEqual(['2026-08-28', '2026-08', '4404.74']);
        // Setembro (gozo): os S_HOLEFER_* do IOB (1180 2.333,33; 1440 777,78; 5600 desconto 2.849,18; 9850 INSS 261,93),
        // o saldo de 10 dias de salário (1.166,67) e o INSS complementar (140,00). Sem S-1210 do recibo neste mês.
        const set = ev('2026-09', '2026-09-30');
        expect(set.t.erros).toEqual([]);
        expect(set.dm['FOLHA202609-M1']).toEqual({ SAL: '1166.67', FERMES: '2333.33', FERMES13: '777.78', FERPAGO: '2849.18', INSSFERRET: '261.93', INSS: '140.00' });
        expect(set.t.outrosMeses).toEqual([]);
    });

    it('S-1210 aceito com IR: as deduções das férias (tpRend 13) entram no bloco que volta, sem repetir nem mexer no resto (Codex #111)', () => {
        const dep = (c: string) => `<infoDep><cpfDep>${c}</cpfDep><depIRRF>S</depIRRF><tpDep>03</tpDep></infoDep>`;
        const ded = (r: string, c: string, v: string) => `<dedDepen><tpRend>${r}</tpRend><cpfDep>${c}</cpfDep><vlrDedDep>${v}</vlrDedDep></dedDepen>`;
        const novo = `<infoIRComplem>${dep('11111111111')}${dep('22222222222')}<infoIRCR><tpCR>056107</tpCR>${ded('13', '11111111111', '189.59')}${ded('13', '22222222222', '189.59')}</infoIRCR></infoIRComplem>`;
        // Aceito com a folha (tpRend 11) do dependente 1 e plano de saúde: entra a dedução das férias dos dois e o infoDep só do 2.
        const aceito = `<infoIRComplem>${dep('11111111111')}<infoIRCR><tpCR>056107</tpCR>${ded('11', '11111111111', '189.59')}<penAlim><tpRend>11</tpRend><cpfDep>33333333333</cpfDep><vlrDedPenAlim>500.00</vlrDedPenAlim></penAlim></infoIRCR><planSaude><cnpjOper>12345678000190</cnpjOper><vlrSaudeTit>100.00</vlrSaudeTit></planSaude></infoIRComplem>`;
        expect(mesclarIRFerias(aceito, novo)).toBe(`<infoIRComplem>${dep('11111111111')}${dep('22222222222')}<infoIRCR><tpCR>056107</tpCR>${ded('13', '11111111111', '189.59')}${ded('13', '22222222222', '189.59')}${ded('11', '11111111111', '189.59')}<penAlim><tpRend>11</tpRend><cpfDep>33333333333</cpfDep><vlrDedPenAlim>500.00</vlrDedPenAlim></penAlim></infoIRCR><planSaude><cnpjOper>12345678000190</cnpjOper><vlrSaudeTit>100.00</vlrSaudeTit></planSaude></infoIRComplem>`);
        // Aceito só com plano de saúde: o infoIRCR nasce antes do planSaude, com os infoDep antes dele.
        const soPlano = '<infoIRComplem><planSaude><cnpjOper>12345678000190</cnpjOper><vlrSaudeTit>100.00</vlrSaudeTit></planSaude></infoIRComplem>';
        expect(mesclarIRFerias(soPlano, novo)).toBe(`<infoIRComplem>${dep('11111111111')}${dep('22222222222')}<infoIRCR><tpCR>056107</tpCR>${ded('13', '11111111111', '189.59')}${ded('13', '22222222222', '189.59')}</infoIRCR><planSaude><cnpjOper>12345678000190</cnpjOper><vlrSaudeTit>100.00</vlrSaudeTit></planSaude></infoIRComplem>`);
        // Já está no aceito (reenvio do mesmo recibo) ou não há férias com dependente: volta igual.
        const completo = mesclarIRFerias(aceito, novo);
        expect(mesclarIRFerias(completo, novo)).toBe(completo);
        expect(mesclarIRFerias(aceito, `<infoIRComplem><infoIRCR><tpCR>056107</tpCR>${ded('11', '44444444444', '189.59')}</infoIRCR></infoIRComplem>`)).toBe(aceito);
    });
});
