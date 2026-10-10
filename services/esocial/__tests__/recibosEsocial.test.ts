// @vitest-environment jsdom
// Retificação do S-1200/S-1210: recibos dos eventos aceitos e o evento retificador (dados fictícios).
import { describe, expect, it } from 'vitest';
import { exclusoesDosEnvios, instante, lerRecibosArquivos, lerRecibosXml, recibosDosEnvios, recibosVigentes, reciboValido, type ReciboEvento } from '../recibosEsocial';
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
<ideEmpregador><tpInsc>1</tpInsc><nrInsc>44388152</nrInsc></ideEmpregador><ideBenef><cpfBenef>52998224725</cpfBenef>
<infoPgto><dtPgto>2026-10-05</dtPgto><tpPgto>1</tpPgto><perRef>2026-09</perRef><ideDmDev>IOB-0001</ideDmDev><vrLiq>2900.00</vrLiq></infoPgto>
<infoPgto><dtPgto>2026-10-20</dtPgto><tpPgto>1</tpPgto><perRef>2026-10</perRef><ideDmDev>ADT-10</ideDmDev><vrLiq>500.00</vrLiq></infoPgto>
<infoIRComplem><infoIRCR><tpCR>056107</tpCR><dedDepen><tpRend>11</tpRend><cpfDep>11144477735</cpfDep><vlrDedDep>189.59</vlrDedDep></dedDepen></infoIRCR></infoIRComplem></ideBenef></evtPgtos></eSocial>`;

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
        expect(r[0].demonstrativos).toEqual({ M001: ['IOB-0001'], 'M001-F': ['IOB-FER'] });
        // Do S-1210: os pagamentos e o IR, sem namespace, para o reenvio; e o envelope, para a cópia antes da exclusão.
        expect(r[1].pagamentos!.map(p => [p.tpPgto, p.perRef, p.ideDmDev])).toEqual([['1', '2026-09', 'IOB-0001'], ['1', '2026-10', 'ADT-10']]);
        expect(r[1].pagamentos![1].xml).toBe('<infoPgto><dtPgto>2026-10-20</dtPgto><tpPgto>1</tpPgto><perRef>2026-10</perRef><ideDmDev>ADT-10</ideDmDev><vrLiq>500.00</vrLiq></infoPgto>');
        expect(r[1].irComplem).toEqual(['<infoIRComplem><infoIRCR><tpCR>056107</tpCR><dedDepen><tpRend>11</tpRend><cpfDep>11144477735</cpfDep><vlrDedDep>189.59</vlrDedDep></dedDepen></infoIRCR></infoIRComplem>']);
        // A cópia relida devolve o mesmo S-1210.
        const copia = lerRecibosXml(`<copiaS1210>${r[1].xmlOrigem}</copiaS1210>`, 'c.xml', '44388152');
        expect(copia.map(x => [x.tipo, x.nrRecibo, x.pagamentos?.length])).toEqual([['S-1210', REC2, 2]]);
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
        expect(v.demonstrativos).toEqual({ M001: ['IOB-0001'], 'M001-F': ['IOB-FER'] });
    });
});

describe('exclusão e S-1210 vigente', () => {
    const envio = (eventos: object[], tpAmb = 1) => ({ tpAmb, protocolo: 'P', consultadoEm: '2026-10-08T09:00:00', enviadoEm: '', eventos }) as unknown as Envio;
    it('S-3000 aceito marca o S-1210 excluído; o mesmo recibo do download e dos envios vira um só, com o conteúdo do download', () => {
        const ex = exclusoesDosEnvios([envio([{ id: 'x', tipo: 'S-3000', perApur: null, ref: `exclui:${REC2}`, cdResposta: 201, nrRecibo: REC3 }, { id: 'y', tipo: 'S-3000', perApur: null, ref: `exclui:${REC1}`, cdResposta: 401 }]),
            envio([{ id: 'z', tipo: 'S-3000', perApur: null, ref: `exclui:${REC1}`, cdResposta: 201, nrRecibo: REC3 }], 2)]);
        expect([...ex.keys()]).toEqual([REC2]);
        const baixado = lerRecibosXml(envelope(s1210Iob, REC2, '2026-10-06T10:00:00'), 'd.xml', '44388152');
        const doConsultor: ReciboEvento = { tipo: 'S-1210', cpf: '52998224725', perApur: '2026-10', nrRecibo: REC2, processadoEm: '2026-10-06T10:00:01', origem: 'transmitido pelo Consultor' };
        const v = recibosVigentes([doConsultor, ...baixado], 'S-1210', '2026-10', ex).get('52998224725')!;
        expect([v.nrRecibo, v.pagamentos?.length, !!v.excluidoEm]).toEqual([REC2, 2, true]);
        // Reenviado pelo Consultor depois (sem conteúdo no envio): vale o novo, sem os pagamentos do baixado (versão
        // anterior, sem o que o reenvio acrescentou): o próximo reenvio pede o download dele.
        const novo = recibosVigentes([...baixado, { ...doConsultor, nrRecibo: REC3, processadoEm: '2026-10-09T10:00:00' }], 'S-1210', '2026-10', ex).get('52998224725')!;
        expect([novo.nrRecibo, novo.pagamentos?.length, novo.excluidoEm]).toEqual([REC3, undefined, undefined]);
    });
});

describe('evento retificador', () => {
    const gerar = (s1200?: ReciboEvento, s1210?: ReciboEvento) => gerarEventosFolha({ cnpj: CNPJ, tpAmb: 1, competencia: '2026-09', dataPagamento: '2026-10-06', fichas: [ficha], resultados: [ANA], rubricas: [rub('0001', '1000', '1')], parametros: params,
        retificacao: { s1200: new Map(s1200 ? [['52998224725', s1200]] : []), s1210: new Map(s1210 ? [['52998224725', s1210]] : []) } }).trabalhadores[0];
    const s1200: ReciboEvento = { tipo: 'S-1200', cpf: '52998224725', perApur: '2026-09', nrRecibo: REC1, processadoEm: '', origem: 'download', demonstrativos: { M001: ['IOB-0001'] } };
    const s1210 = () => lerRecibosXml(envelope(s1210Iob, REC2, '2026-10-06T10:00:00'), 'd.xml', '44388152')[0];

    it('S-1210 aceito: exclui (S-3000), retifica o S-1200 e reenvia o S-1210 como original com todos os pagamentos do mês', () => {
        const t = gerar(s1200, s1210());
        const d1 = doc(t.s1200!.xml); const d2 = doc(t.s1210!.xml); const d3 = doc(t.exclusao1210!.xml);
        expect([txt(d1, 'indRetif')[0], txt(d1, 'nrRecibo')[0], txt(d1, 'ideDmDev')]).toEqual(['2', REC1, ['IOB-0001']]);
        expect(Array.from(d1.getElementsByTagName('ideEvento')[0].children).map(e => e.localName).slice(0, 3)).toEqual(['indRetif', 'nrRecibo', 'indApuracao']);
        // S-3000 do S-1210 que está valendo, com o CPF e o mês do pagamento.
        expect(d3.documentElement.namespaceURI).toBe('http://www.esocial.gov.br/schema/evt/evtExclusao/v_S_01_03_00');
        expect([txt(d3, 'tpEvento')[0], txt(d3, 'nrRecEvt')[0], txt(d3, 'cpfTrab')[0], txt(d3, 'perApur')[0]]).toEqual(['S-1210', REC2, '52998224725', '2026-10']);
        // S-1210 original: o pagamento desta folha substitui o do IOB; o adiantamento e o IR do aceito voltam.
        expect([txt(d2, 'indRetif')[0], txt(d2, 'nrRecibo').length]).toEqual(['1', 0]);
        expect(txt(d2, 'ideDmDev')).toEqual(['ADT-10', 'IOB-0001']);
        expect(txt(d2, 'vrLiq')).toEqual(['500.00', '3000.00']);
        expect(txt(d2, 'cpfDep')).toEqual(['11144477735']);
        expect(Array.from(d2.getElementsByTagName('ideBenef')[0].children).map(e => e.localName)).toEqual(['cpfBenef', 'infoPgto', 'infoPgto', 'infoIRComplem']);
        expect(t.outrosPagamentos).toBe(1);
        // Já excluído: sem novo S-3000, o S-1210 continua com todos os pagamentos.
        const depois = gerar(s1200, { ...s1210(), excluidoEm: '2026-10-08' });
        expect([depois.exclusao1210, txt(doc(depois.s1210!.xml), 'ideDmDev')]).toEqual([null, ['ADT-10', 'IOB-0001']]);
    });

    it('sem o conteúdo do S-1210 aceito, ou com pagamento de demonstrativo que a retificação retira, não gera', () => {
        const semConteudo = gerar(s1200, { tipo: 'S-1210', cpf: '52998224725', perApur: '2026-10', nrRecibo: REC2, processadoEm: '', origem: 'transmitido pelo Consultor' });
        expect([semConteudo.s1200, semConteudo.exclusao1210]).toEqual([null, null]);
        expect(semConteudo.erros.join(' ')).toMatch(/Carregue o download do eSocial com esse S-1210/);
        const r = s1210();
        const comFer = { ...s1200, demonstrativos: { M001: ['IOB-0001'], 'M001-F': ['IOB-FER'] } };
        const comFerias = gerar(comFer, { ...r, pagamentos: [...r.pagamentos!, { tpPgto: '1', perRef: '2026-09', ideDmDev: 'IOB-FER', xml: '<infoPgto/>' }] });
        expect(comFerias.s1200).toBeNull();
        expect(comFerias.erros.join(' ')).toMatch(/paga o demonstrativo IOB-FER, que a retificação do S-1200 retira/);
        // Demonstrativo do original que o cálculo não gera: a retificação o apagaria, não gera.
        expect(gerar(comFer).erros.join(' ')).toMatch(/demonstrativo\(s\) que este cálculo não gera \(IOB-FER.*a retificação os apagaria/);
        // Dois demonstrativos na mesma matrícula (folha e férias do IOB): não escolhe um e apaga o outro.
        const doisNaMatricula = gerar({ ...s1200, demonstrativos: { M001: ['FOL1', 'FER1'] } });
        expect([doisNaMatricula.s1200, doisNaMatricula.erros.join(' ')]).toEqual([null, expect.stringMatching(/demonstrativo\(s\) que este cálculo não gera \(FOL1, FER1.*retifique pelo IOB/)]);
    });

    it('sem recibo: originais; S-1200 retificado sem S-1210 carregado avisa', () => {
        const orig = gerar();
        expect([txt(doc(orig.s1200!.xml), 'indRetif')[0], txt(doc(orig.s1200!.xml), 'nrRecibo').length, orig.exclusao1210]).toEqual(['1', 0, null]);
        expect(gerar(s1200).avisos.join(' ')).toMatch(/Nenhum S-1210 de 10\/2026 carregado/);
    });
});

describe('lote A da auditoria', () => {
    it('recibo vigente: compara o envio do Consultor (UTC) com o download (hora de Brasília) no mesmo fuso', () => {
        // Consultor às 09:30 de Brasília (12:30Z); retificação do IOB às 11:00 de Brasília: vale a do IOB.
        const consultor: ReciboEvento = { tipo: 'S-1200', cpf: '52998224725', perApur: '2026-09', nrRecibo: REC1, processadoEm: '2026-10-06T12:30:00.000Z', origem: 'Consultor' };
        const iob: ReciboEvento = { ...consultor, nrRecibo: REC2, processadoEm: '2026-10-06T11:00:00', origem: 'download' };
        expect(recibosVigentes([consultor, iob], 'S-1200', '2026-09').get('52998224725')!.nrRecibo).toBe(REC2);
        expect([instante('2026-10-06T11:00:00'), instante('2026-10-06T14:00:00Z'), instante('2026-10-06T11:00:00-03:00')].every((x, _, a) => x === a[0])).toBe(true);
    });

    it('S-1210 excluído pelo Consultor e tela reaberta sem o download: volta marcado, sem pagamentos, e o reenvio fica bloqueado', () => {
        const env = (eventos: object[]) => ({ tpAmb: 1, protocolo: 'P', consultadoEm: '2026-10-08T12:00:00.000Z', enviadoEm: '', eventos }) as unknown as Envio;
        const ex = exclusoesDosEnvios([env([{ id: 'x', tipo: 'S-3000', perApur: null, ref: `exclui:${REC2}:52998224725:2026-10`, cdResposta: 201, nrRecibo: REC3 }])]);
        expect(ex.get(REC2)).toEqual({ em: '2026-10-08T12:00:00.000Z', cpf: '52998224725', perApur: '2026-10' });
        const v = recibosVigentes([], 'S-1210', '2026-10', ex).get('52998224725')!;
        expect([v.nrRecibo, v.excluidoEm, v.pagamentos]).toEqual([REC2, '2026-10-08T12:00:00.000Z', undefined]);
        const t = gerarEventosFolha({ cnpj: CNPJ, tpAmb: 1, competencia: '2026-09', dataPagamento: '2026-10-06', fichas: [ficha], resultados: [ANA], rubricas: [rub('0001', '1000', '1')], parametros: params,
            retificacao: { s1200: new Map(), s1210: new Map([['52998224725', v]]) } }).trabalhadores[0];
        expect([t.s1210, t.exclusao1210]).toEqual([null, null]);
        expect(t.erros.join(' ')).toMatch(/foi excluído e volta com todos os pagamentos do mês. Carregue o download/);
        // Com uma versão mais antiga do S-1210 carregada (não a excluída), a marca não herda os pagamentos dela.
        const antigo = lerRecibosXml(envelope(s1210Iob, REC1, '2026-10-01T10:00:00'), 'd.xml', '44388152');
        const comAntigo = recibosVigentes(antigo, 'S-1210', '2026-10', ex).get('52998224725')!;
        expect([comAntigo.nrRecibo, comAntigo.pagamentos]).toEqual([REC2, undefined]);
        // Com a cópia do próprio recibo excluído, os pagamentos voltam.
        const exato = lerRecibosXml(envelope(s1210Iob, REC2, '2026-10-06T10:00:00'), 'd.xml', '44388152');
        expect(recibosVigentes([...antigo, ...exato], 'S-1210', '2026-10', ex).get('52998224725')!.pagamentos).toHaveLength(2);
        // Ref antiga (só o recibo) continua valendo para marcar a exclusão.
        expect(exclusoesDosEnvios([env([{ id: 'y', tipo: 'S-3000', perApur: null, ref: `exclui:${REC1}`, cdResposta: 202, nrRecibo: REC3 }])]).get(REC1)!.cpf).toBe('');
    });

    it('S-1200 com indApurIR em cada rubrica e grau de exposição (padrão 1; o da ficha quando informado); férias sem recibo não geram', () => {
        const gerar = (f = ficha, r = ANA) => gerarEventosFolha({ cnpj: CNPJ, tpAmb: 2, competencia: '2026-09', dataPagamento: '2026-10-06', fichas: [f], resultados: [r], rubricas: [rub('0001', '1000', '1'), rub('0020', '1020', '1')], parametros: { ...params, rubricas: { ...params.rubricas, FERMES: { codRubr: '0020', ideTabRubr: 'T1' } } } }).trabalhadores[0];
        const d = doc(gerar().s1200!.xml);
        expect(Array.from(d.getElementsByTagName('itensRemun')[0].children).map(e => e.localName)).toEqual(['codRubr', 'ideTabRubr', 'qtdRubr', 'vrRubr', 'indApurIR']);
        expect([txt(d, 'indApurIR')[0], txt(d, 'grauExp')[0]]).toEqual(['0', '1']);
        expect(Array.from(d.getElementsByTagName('remunPerApur')[0].children).map(e => e.localName)).toEqual(['matricula', 'itensRemun', 'infoAgNocivo']);
        expect(txt(doc(gerar({ ...ficha, dados: { ...ficha.dados, grauExp: '4' } } as unknown as typeof ficha).s1200!.xml), 'grauExp')).toEqual(['4']);
        const comFerias = gerar(ficha, { ...ANA, verbas: [...ANA.verbas, { codigo: 'FERMES', descricao: 'Férias', referencia: '', tipo: 'provento', valor: 100000, inss: true, fgts: true, irrf: false }] } as ResultadoCalculo);
        // Férias na folha sem o recibo correspondente: não gera (o recibo é que leva o pagamento).
        expect([comFerias.s1200, comFerias.erros.join(' ')]).toEqual([null, expect.stringMatching(/Férias do mês na folha \(R\$\s1\.000,00\) não batem com os recibos de férias/)]);
    });
});
