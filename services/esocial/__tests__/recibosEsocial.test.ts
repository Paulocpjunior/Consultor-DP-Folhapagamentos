// @vitest-environment jsdom
// Retificação do S-1200/S-1210: recibos dos eventos aceitos e o evento retificador (dados fictícios).
import { describe, expect, it } from 'vitest';
import { lerRecibosArquivos, lerRecibosXml, recibosDosEnvios, recibosVigentes, reciboValido, type ReciboEvento } from '../recibosEsocial';
import { gerarEventosFolha, type ParametrosEsocialFolha } from '../eventosFolha';
import { gerarZip } from '../../implantacao/zip';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { Rubrica } from '../../cadastros/rubricas';
import type { ResultadoCalculo } from '../../calculo/motorMensal';
import type { Envio } from '../transmissaoService';

const CNPJ = '44388152000189';
const REC1 = '1.1.0000000000000000001'; const REC2 = '1.1.0000000000000000002'; const REC3 = '1.1.0000000000000000003';
const envelope = (evento: string, recibo: string, dh: string, cd = '201') => `<retornoEventoCompleto><evento>${evento}</evento><recibo><eSocial><retornoEvento><recibo><nrRecibo>${recibo}</nrRecibo></recibo><processamento><cdResposta>${cd}</cdResposta><dhProcessamento>${dh}</dhProcessamento></processamento></retornoEvento></eSocial></recibo></retornoEventoCompleto>`;
const s1200Iob = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00"><evtRemun Id="IDX"><ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>2026-09</perApur><tpAmb>1</tpAmb></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>44388152</nrInsc></ideEmpregador><ideTrabalhador><cpfTrab>52998224725</cpfTrab></ideTrabalhador>
<dmDev><ideDmDev>IOB-0001</ideDmDev><codCateg>101</codCateg><infoPerApur><ideEstabLot><remunPerApur><matricula>M001</matricula><itensRemun><codRubr>0001</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>3000.00</vrRubr></itensRemun></remunPerApur></ideEstabLot></infoPerApur></dmDev>
<dmDev><ideDmDev>IOB-FER</ideDmDev><codCateg>101</codCateg><infoPerApur><ideEstabLot><remunPerApur><matricula>M001-F</matricula><itensRemun><codRubr>0001</codRubr><ideTabRubr>T1</ideTabRubr><vrRubr>1.00</vrRubr></itensRemun></remunPerApur></ideEstabLot></infoPerApur></dmDev></evtRemun></eSocial>`;
const s1210Iob = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtPgtos/v_S_01_03_00"><evtPgtos Id="IDY"><ideEvento><indRetif>1</indRetif><perApur>2026-10</perApur><tpAmb>1</tpAmb></ideEvento>
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>44388152</nrInsc></ideEmpregador><ideBenef><cpfBenef>52998224725</cpfBenef></ideBenef></evtPgtos></eSocial>`;

const rub = (codRubr: string, natRubr: string, tpRubr: string): Rubrica => ({ id: codRubr, empresaId: 'E1', codRubr, ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: codRubr, natRubr, tpRubr, codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' } }] });
const ficha = { ...fichaVazia({ id: 'E1', cnpj: CNPJ }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M001', situacao: 'ativo' as const, dados: { nome: 'ANA', categoria: '101' } };
const ANA = { fichaId: 'f1', nome: 'ANA', competencia: '2026-09', pagamento: '2026-10', situacao: 'calculado', fgts: 0, memoria: [], avisos: [], erros: [],
    verbas: [{ codigo: 'SAL', descricao: 'Salário', referencia: '30 dias', tipo: 'provento', valor: 300000 }], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 300000, descontos: 0, liquido: 300000 } } as unknown as ResultadoCalculo;
const params: ParametrosEsocialFolha = { nrInscEstab: CNPJ, codLotacao: 'LOT01', rubricas: { SAL: { codRubr: '0001', ideTabRubr: 'T1' } } };
const doc = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const txt = (d: Document, tag: string) => Array.from(d.getElementsByTagName(tag)).map(e => e.textContent);

describe('recibos dos eventos aceitos', () => {
    it('do download: S-1200 com os demonstrativos por matrícula e S-1210; recusado e outro empregador ficam fora', () => {
        const r = lerRecibosXml(`<x>${envelope(s1200Iob, REC1, '2026-10-05T10:00:00')}${envelope(s1210Iob, REC2, '2026-10-06T10:00:00')}${envelope(s1200Iob, REC3, '2026-10-07T10:00:00', '401')}</x>`, 'd.xml', '44388152');
        expect(r.map(x => [x.tipo, x.cpf, x.perApur, x.nrRecibo])).toEqual([['S-1200', '52998224725', '2026-09', REC1], ['S-1210', '52998224725', '2026-10', REC2]]);
        expect(r[0].demonstrativos).toEqual({ M001: 'IOB-0001', 'M001-F': 'IOB-FER' });
        expect(lerRecibosXml(envelope(s1200Iob, REC1, 'x'), 'd.xml', '12345678')).toEqual([]);
        expect([reciboValido(REC1), reciboValido('1.1.123')]).toEqual([true, false]);
    });

    it('dos envios do Consultor (produção, aceitos) e o vigente é o processado por último, mantendo o demonstrativo do original', async () => {
        const envio = { tpAmb: 1, protocolo: 'P1', consultadoEm: '2026-10-08T09:00:00', enviadoEm: '', eventos: [
            { id: 'a', tipo: 'S-1200', perApur: '2026-09', ref: 'f1', cdResposta: 201, nrRecibo: REC3 },
            { id: 'b', tipo: 'S-1200', perApur: '2026-09', ref: 'f1', cdResposta: 401, nrRecibo: '' },
        ] } as unknown as Envio;
        const consultor = recibosDosEnvios([envio, { ...envio, tpAmb: 2 } as Envio], [ficha]);
        expect(consultor.map(r => r.nrRecibo)).toEqual([REC3]);
        const doZip = await lerRecibosArquivos([{ nome: 'd.zip', bytes: gerarZip([{ nome: 'a.xml', conteudo: envelope(s1200Iob, REC1, '2026-10-05T10:00:00') }]) }], CNPJ);
        const v = recibosVigentes([...doZip, ...consultor], 'S-1200', '2026-09').get('52998224725')!;
        expect(v.nrRecibo).toBe(REC3);
        expect(v.demonstrativos).toEqual({ M001: 'IOB-0001', 'M001-F': 'IOB-FER' });
    });
});

describe('evento retificador', () => {
    it('S-1200 com indRetif 2, nrRecibo e o demonstrativo do original; avisa do demonstrativo que some; S-1210 retificado', () => {
        const s1200: ReciboEvento = { tipo: 'S-1200', cpf: '52998224725', perApur: '2026-09', nrRecibo: REC1, processadoEm: '', origem: 'download', demonstrativos: { M001: 'IOB-0001', 'M001-F': 'IOB-FER' } };
        const s1210: ReciboEvento = { tipo: 'S-1210', cpf: '52998224725', perApur: '2026-10', nrRecibo: REC2, processadoEm: '', origem: 'download' };
        const { trabalhadores } = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 1, competencia: '2026-09', dataPagamento: '2026-10-06', fichas: [ficha], resultados: [ANA], rubricas: [rub('0001', '1000', '1')], parametros: params,
            retificacao: { s1200: new Map([['52998224725', s1200]]), s1210: new Map([['52998224725', s1210]]) } });
        const t = trabalhadores[0];
        const d1 = doc(t.s1200!.xml); const d2 = doc(t.s1210!.xml);
        expect([txt(d1, 'indRetif')[0], txt(d1, 'nrRecibo')[0], txt(d1, 'ideDmDev')]).toEqual(['2', REC1, ['IOB-0001']]);
        expect(Array.from(d1.getElementsByTagName('ideEvento')[0].children).map(e => e.localName).slice(0, 3)).toEqual(['indRetif', 'nrRecibo', 'indApuracao']);
        expect([txt(d2, 'indRetif')[0], txt(d2, 'nrRecibo')[0], txt(d2, 'ideDmDev')]).toEqual(['2', REC2, ['IOB-0001']]);
        expect(t.avisos.join(' ')).toMatch(/demonstrativo\(s\) que este cálculo não gera \(IOB-FER/);
        // Sem recibo: original.
        const orig = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 1, competencia: '2026-09', dataPagamento: '2026-10-06', fichas: [ficha], resultados: [ANA], rubricas: [rub('0001', '1000', '1')], parametros: params }).trabalhadores[0];
        expect([txt(doc(orig.s1200!.xml), 'indRetif')[0], txt(doc(orig.s1200!.xml), 'nrRecibo').length]).toEqual(['1', 0]);
    });
});
