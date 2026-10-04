// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { continuarDe, cpfDoEvento, montarRetornoCompleto, nomeArquivo, tipoDoElemento, zipDosEventos, type ArquivoBaixado } from '../downloadEventos';
import { lerXml } from '../../implantacao/implantacao';
import { lerZip } from '../../implantacao/zip';
import { lerXmlAfastamentos } from '../../cadastros/afastamentos';
import { lerXmlRubricas } from '../../cadastros/rubricas';
import { lerTotalizadoresXml } from '../../conferencia/totalizadores';

// O que o webservice devolve em <evt> e <rec>, com dados fictícios.
const CPF = '52998224725';
const rec = (id: string, nr: string) => `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_2_1"><retornoEvento Id="${id}"><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><processamento><cdResposta>201</cdResposta><dhProcessamento>2026-09-16T10:00:00</dhProcessamento></processamento><recibo><nrRecibo>${nr}</nrRecibo></recibo></retornoEvento></eSocial>`;
const ID_ADM = 'ID1112223330000002026091600000000001';
const admissao: ArquivoBaixado = {
    cdResposta: 200, descResposta: 'OK', id: ID_ADM, elemento: 'evtAdmissao',
    evt: `<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00"><evtAdmissao Id="${ID_ADM}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><trabalhador><cpfTrab>${CPF}</cpfTrab><nmTrab>PESSOA BAIXADA</nmTrab><nascimento><dtNascto>1990-01-01</dtNascto></nascimento></trabalhador><vinculo><matricula>M1</matricula><infoRegimeTrab><infoCeletista><dtAdm>2026-09-16</dtAdm></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>AUXILIAR</nmCargo><CBOCargo>411005</CBOCargo><remuneracao><vrSalFx>2000.00</vrSalFx></remuneracao></infoContrato></vinculo></evtAdmissao><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignatureValue>X</SignatureValue></Signature></eSocial>`,
    rec: rec(ID_ADM, '1.1.0000000000000000001'),
};

describe('eventos baixados no formato do portal', () => {
    it('S-2200 remontado entra na leitura da implantação/cadastro como evento processado', () => {
        const xml = montarRetornoCompleto(admissao);
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?><eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0">')).toBe(true);
        expect(xml.match(/<\?xml/g)).toHaveLength(1);
        const r = lerXml({ nome: 'a.xml', xml, hash: 'x' });
        expect(r.eventos).toHaveLength(1);
        expect(r.eventos[0]).toMatchObject({ tipo: 'S-2200', cpf: CPF, matricula: 'M1', recibo: '1.1.0000000000000000001', processado: true });
        expect(r.eventos[0].avisos).not.toContain('Sem retorno de processamento 201 associado; aceitação não comprovada.');
    });

    it('S-2230 e S-1010 remontados entram nas importações de Afastamentos e Incidências', () => {
        const idA = 'ID1112223330000002026100100000000002';
        const afast = montarRetornoCompleto({ evt: `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAfastTemp/v_S_01_03_00"><evtAfastTemp Id="${idA}"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><ideVinculo><cpfTrab>${CPF}</cpfTrab><matricula>M1</matricula></ideVinculo><infoAfastamento><iniAfastamento><dtIniAfast>2026-10-01</dtIniAfast><codMotAfast>03</codMotAfast></iniAfastamento></infoAfastamento></evtAfastTemp></eSocial>`, rec: rec(idA, '1.1.2') });
        expect(lerXmlAfastamentos('af.xml', afast, '11222333').eventos).toEqual([expect.objectContaining({ tipo: 'S-2230', recibo: '1.1.2', inicio: expect.objectContaining({ dt: '2026-10-01', motivo: '03' }) })]);
        const idR = 'ID1112223330000002026010100000000003';
        const rub = montarRetornoCompleto({ evt: `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00"><evtTabRubrica Id="${idR}"><ideEvento><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><infoRubrica><inclusao><ideRubrica><codRubr>1</codRubr><ideTabRubr>FP</ideTabRubr><iniValid>2026-01</iniValid></ideRubrica><dadosRubrica><dscRubr>SALARIO</dscRubr><natRubr>1000</natRubr><tpRubr>1</tpRubr><codIncCP>11</codIncCP><codIncIRRF>11</codIncIRRF><codIncFGTS>11</codIncFGTS></dadosRubrica></inclusao></infoRubrica></evtTabRubrica></eSocial>`, rec: rec(idR, '1.1.3') });
        expect(lerXmlRubricas('r.xml', rub, '11222333').eventos).toEqual([expect.objectContaining({ acao: 'inclusao', codRubr: '1', recibo: '1.1.3' })]);
    });

    it('totalizador remontado entra na conferência pós-folha', () => {
        const idT = 'ID1112223330000002026100500000000004';
        const tot = montarRetornoCompleto({ evt: `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtCS/v_S_01_03_00"><evtCS Id="${idT}"><ideEvento><indApuracao>1</indApuracao><perApur>2026-09</perApur></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><infoCS><infoCPSeg><vrDescCP>100.00</vrDescCP><vrCpSeg>100.00</vrCpSeg></infoCPSeg></infoCS></evtCS></eSocial>`, rec: '' });
        expect(tot).not.toContain('<recibo>');
        const lidos = lerTotalizadoresXml(tot, 't.xml');
        expect(lidos).toHaveLength(1);
        expect(lidos[0]).toMatchObject({ tipo: 'S-5011' });
    });

    it('nomes, tipos, CPF, zip e continuação da consulta', async () => {
        expect(tipoDoElemento('evtAfastTemp')).toBe('S-2230');
        expect(tipoDoElemento('evtDesconhecido')).toBe('evtDesconhecido');
        expect(cpfDoEvento(admissao.evt)).toBe(CPF);
        expect(nomeArquivo(admissao)).toBe(`S-2200_${CPF}_${ID_ADM}.xml`);
        const zip = zipDosEventos([admissao, { ...admissao, id: 'ID9', evt: '', rec: '', cdResposta: 402, descResposta: 'não encontrado' }]);
        const itens = await lerZip(zip);
        expect(itens.map(i => i.nome)).toEqual([`S-2200_${CPF}_${ID_ADM}.xml`]);
        expect(new TextDecoder().decode(itens[0].bytes)).toBe(montarRetornoCompleto(admissao));
        expect(continuarDe('2026-09-16T12:00:00')).toBe('2026-09-16');
        expect(continuarDe('')).toBe('');
    });
});
