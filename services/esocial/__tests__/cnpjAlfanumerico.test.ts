// Empregador com CNPJ alfanumérico (IN RFB 2.229/2024) no eSocial S-1.3: raiz com letras no ideEmpregador
// (TS_nrInsc_8_14), CNPJ com letras no estabelecimento e no sindicato (TS_cnpj) e no Id do evento (TS_Id).
// CNPJs fictícios, só com o DV certo.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { trocarEstabelecimento, validarTrocaDeEstabelecimento } from '../../cadastros/locaisTrabalho';
import { contratoPadrao } from '../admissao';
import { gerarS2206 } from '../alteracaoContratual';
import { gerarS1299, idEvento, lerEventoXml } from '../transmissao';
import { dataDoId } from '../fechamentoGoverno';
import { validarPeloXsd } from '../validadorXsd';

const lerXsd = (nome: string) => readFile(join(process.cwd(), 'public/esocial-xsd/v_S_01_03_00', nome), 'utf8');
const MATRIZ = '12ABC34501DE35';
const FILIAL = '12ABC345000269';
const SINDICATO = 'A1B2C3D4000193';
const TS_ID = /^ID\d[A-Z0-9]{12}\d{21}$/;
const FICHA: FichaFuncionario = {
    ...fichaVazia({ id: 'E1', cnpj: MATRIZ }), id: 'E1_52998224725_M1', cpf: '52998224725', matriculaEsocial: 'M1',
    dados: { nome: 'ANA', admissao: '2026-07-06', categoria: '101', cargo: 'AUXILIAR', cbo: '411005', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', tipoContrato: '1',
        sindicato: SINDICATO, estabelecimento: MATRIZ, regimePrevidenciario: '1', jornada: 'Seg a sex 8h às 17h' },
};

describe('eSocial com CNPJ alfanumérico', () => {
    it('Id do evento com a raiz e as letras, no formato do XSD; a data sai do Id', () => {
        const id = idEvento(MATRIZ, new Date('2026-10-05T15:00:00Z'), 1);
        expect(id).toBe('ID112ABC3450000002026100512000000001');
        expect(id).toMatch(TS_ID);
        expect(dataDoId(id)).toBe('2026-10-05T15:00:00.000Z');
    });
    it('S-1299: ideEmpregador com a raiz alfanumérica', () => {
        const g = gerarS1299({ cnpj: '12.abc.345/01de-35', perApur: '2026-09', tpAmb: 2, info: { evtRemun: true, evtPgtos: true, evtComProd: false, evtContratAvNP: false, evtInfoComplPer: false, transDCTFWeb: true } });
        expect(g.xml).toContain('<ideEmpregador><tpInsc>1</tpInsc><nrInsc>12ABC345</nrInsc></ideEmpregador>');
        expect(g.id).toMatch(TS_ID);
    });
    it('S-2206 da troca de estabelecimento: raiz, local e sindicato com letras; passa no XSD', async () => {
        expect(validarTrocaDeEstabelecimento(FICHA, FILIAL, '2026-09-11', MATRIZ)).toEqual([]);
        expect(validarTrocaDeEstabelecimento(FICHA, '11222333000181', '2026-09-11', MATRIZ).join(' ')).toMatch(/Outra raiz/);
        const trocada = trocarEstabelecimento(FICHA, FILIAL, '2026-09-11', contratoPadrao(FICHA));
        const g = gerarS2206({ cnpj: MATRIZ, tpAmb: 2, ficha: trocada, contrato: contratoPadrao(FICHA), dtAlteracao: '2026-09-11', estabelecimento: FILIAL, dscAlt: 'Troca de estabelecimento', agora: new Date('2026-10-11T12:00:00Z') });
        expect(g.erros).toEqual([]);
        const xml = g.evento!.xml;
        expect(xml).toContain('<ideEmpregador><tpInsc>1</tpInsc><nrInsc>12ABC345</nrInsc></ideEmpregador>');
        expect(xml).toContain(`<localTrabGeral><tpInsc>1</tpInsc><nrInsc>${FILIAL}</nrInsc></localTrabGeral>`);
        expect(xml).toContain(`<cnpjSindCategProf>${SINDICATO}</cnpjSindCategProf>`);
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
    });
    it('XML pronto de empresa alfanumérica: aceito na empresa certa, recusado na outra', () => {
        const id = idEvento(MATRIZ, new Date('2026-10-05T15:00:00Z'), 1);
        const xml = (nrInsc: string) => '<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00">'
            + `<evtAdmissao Id="${id}"><ideEvento><indRetif>1</indRetif><tpAmb>2</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${nrInsc}</nrInsc></ideEmpregador>`
            + '<trabalhador><cpfTrab>52998224725</cpfTrab></trabalhador></evtAdmissao></eSocial>';
        expect(lerEventoXml('a.xml', xml('12ABC345'), { cnpj: MATRIZ }, 2)).toMatchObject({ tipo: 'S-2200', id, erro: '' });
        expect(lerEventoXml('a.xml', xml('12345010'), { cnpj: MATRIZ }, 2).erro).toMatch(/não é a empresa ativa/);
    });
});
