// @vitest-environment jsdom
// Demonstrativo de férias no S-1200 e pagamento no S-1210 (dados fictícios; motor de verdade).
import { describe, expect, it } from 'vitest';
import { gerarEventosFolha, recibosFeriasDaCompetencia, sugerirDePara, verbasDosRecibosParaDePara, type ParametrosEsocialFolha } from '../eventosFolha';
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
    ['INSSFERRET', '9201', '2'], ['IRRFFERRET', '9203', '2'], ['FER', '1016', '1'], ['FER13', '1017', '1'], ['FERADI', '1015', '1'], ['FERADI13', '1015', '1'], ['INSSFER', '9201', '2'], ['INSSFERADI', '9201', '2'], ['IRRFFER', '9203', '2']];
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
    it('pagas no mês anterior ao gozo: adiantamento (1015) no S-1200 do pagamento e S-1210 na data do recibo; a folha do gozo abate o líquido (9221)', () => {
        const g = [gozo('2025-08-01', '2025-08-20')]; // paga em 30/07 (2 dias antes)
        const jul = eventos('2025-07', g, '2025-08-05');
        expect(jul.recibosFerias.map(x => x.dataPagamento)).toEqual(['2025-07-30']);
        expect(jul.t.erros).toEqual([]);
        const dm = demonstrativos(jul.t.s1200!.xml);
        expect(Object.keys(dm)).toEqual(['FOLHA202507-M1', 'FER20250730-M1']);
        expect(Object.keys(dm['FOLHA202507-M1'])).toEqual(['SAL', 'INSS', 'IRRF']);
        const rec = jul.recibosFerias[0].r;
        const v = (c: string) => (rec.verbas.find(x => x.codigo === c)?.valor ?? 0) / 100;
        expect(dm['FER20250730-M1']).toEqual({ FERADI: v('FER').toFixed(2), FERADI13: v('FER13').toFixed(2), INSSFERADI: v('INSSFER').toFixed(2), IRRFFER: v('IRRFFER').toFixed(2) });
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
        expect(dmAgo['FOLHA202508-M1'].FERMES).toBe(v('FER').toFixed(2));
        expect(ago.t.outrosMeses).toEqual([]);
    });

    it('pagas no próprio mês do gozo: o recibo leva férias (1016/1017) e o INSS, e a folha não repete essa parte', () => {
        const g = [gozo('2025-07-14', '2025-08-02')]; // paga em 11/07; gozo em julho (18 dias) e agosto (2 dias)
        const jul = eventos('2025-07', g, '2025-08-05');
        expect(jul.t.erros).toEqual([]);
        const dm = demonstrativos(jul.t.s1200!.xml);
        const rec = jul.recibosFerias[0].r;
        const [pj, pa] = rec.porCompetencia;
        expect([pj.competencia, pa.competencia]).toEqual(['2025-07', '2025-08']);
        expect(dm['FER20250711-M1']).toEqual({
            FER: (pj.ferias / 100).toFixed(2), FERADI: (pa.ferias / 100).toFixed(2), FER13: (pj.terco / 100).toFixed(2), FERADI13: (pa.terco / 100).toFixed(2),
            INSSFER: (pj.inss / 100).toFixed(2), INSSFERADI: (pa.inss / 100).toFixed(2), IRRFFER: ((rec.verbas.find(x => x.codigo === 'IRRFFER')?.valor ?? 0) / 100).toFixed(2),
        });
        // A folha de julho não traz as férias de julho (estão no recibo) e o líquido dela não muda.
        const folha = dm['FOLHA202507-M1'];
        expect(['FERMES', 'FERMES13', 'FERPAGO', 'INSSFERRET', 'IRRFFERRET'].filter(k => k in folha)).toEqual([]);
        expect(txt(doc(jul.t.s1210!.xml), 'vrLiq')).toEqual([(jul.r.totais.liquido / 100).toFixed(2)]);
        // INSS de julho: o retido no recibo (parte de julho) + o da folha = o INSS sobre salário + férias do mês.
        expect(Number(dm['FER20250711-M1'].INSSFER) + Number(folha.INSS)).toBeCloseTo((jul.r.verbas.find(x => x.codigo === 'INSS')!.valor + pj.inss) / 100, 2);
        // Agosto: a parte de agosto foi paga antes (adiantamento): a folha soma e abate.
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
        expect(Object.fromEntries(itens.map(i => [i.chave, i.sugestao?.codRubr ?? null]))).toMatchObject({ FERADI: null, FERADI13: null, INSSFERADI: null, IRRFFER: null });
        // Natureza única: sugere (aqui há duas 1015 e três 9201: a equipe escolhe).
        const so1015 = RUBRICAS.filter(x => x.codRubr !== 'FERADI13');
        expect(sugerirDePara(verbasDosRecibosParaDePara(recibosFerias, '2025-07'), so1015, '2025-07').find(i => i.chave === 'FERADI')!.sugestao).toEqual({ codRubr: 'FERADI', ideTabRubr: 'T1' });
        // Agosto sem o recibo na lista: as férias da folha não batem e o trabalhador fica sem evento.
        const fm = feriasDaCompetencia(FICHA, g, TABELAS, {}, '2025-08');
        const ago = calcularMensal({ competencia: '2025-08', pagamento: '2025-09', ficha: FICHA, tabelas: TABELAS, afastamentos: g, feriasDoMes: fm });
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2025-08', dataPagamento: '2025-09-05', fichas: [FICHA], resultados: [ago], rubricas: RUBRICAS, parametros: PARAMS }).trabalhadores[0];
        expect([t.s1200, t.erros.join(' ')]).toEqual([null, expect.stringMatching(/Férias do mês na folha .* não batem com os recibos de férias com gozo em 08\/2025/)]);
    });
});
