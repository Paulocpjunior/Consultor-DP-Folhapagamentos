import { describe, expect, it } from 'vitest';
import { gerarS1298, gerarS1299, grupoDoTipo, idEvento, lerEventoXml, validarPerApur, aceito } from '../transmissao';
import { mesclarConsulta, resumoEnvio } from '../transmissaoService';

const CNPJ = '29463877000109';
const ID = 'ID1294638770000002026100512000000001';
const INFO = { evtRemun: true, evtPgtos: true, evtComProd: false, evtContratAvNP: false, evtInfoComplPer: false, transDCTFWeb: true };

describe('eventos gerados pelo DP', () => {
    it('Id: ID + 1 + raiz com zeros à direita + data e hora de Brasília + sequencial', () => {
        expect(idEvento(CNPJ, new Date('2026-10-05T15:00:00Z'), 1)).toBe(ID);
        expect(idEvento(CNPJ, new Date('2026-10-05T15:00:00Z'), 123456)).toBe('ID1294638770000002026100512000023456');
        expect(() => idEvento('123')).toThrow(/CNPJ/);
    });
    it('S-1299 mensal no leiaute S-1.3, sem assinatura', () => {
        expect(gerarS1299({ cnpj: CNPJ, perApur: '2026-09', tpAmb: 2, info: INFO, id: ID }).xml).toBe(
            '<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtFechaEvPer/v_S_01_03_00">'
            + `<evtFechaEvPer Id="${ID}"><ideEvento><indApuracao>1</indApuracao><perApur>2026-09</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>ConsultorDP_1.0</verProc></ideEvento>`
            + '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador>'
            + '<infoFech><evtRemun>S</evtRemun><evtPgtos>S</evtPgtos><evtComProd>N</evtComProd><evtContratAvNP>N</evtContratAvNP><evtInfoComplPer>N</evtInfoComplPer><transDCTFWeb>S</transDCTFWeb></infoFech>'
            + '</evtFechaEvPer></eSocial>');
    });
    it('S-1299 anual (13º) e sem DCTFWeb; S-1298; período inválido recusado', () => {
        const x = gerarS1299({ cnpj: CNPJ, perApur: '2026', tpAmb: 1, info: { ...INFO, transDCTFWeb: false }, id: ID }).xml;
        expect(x).toContain('<indApuracao>2</indApuracao><perApur>2026</perApur><tpAmb>1</tpAmb>');
        expect(x).not.toContain('transDCTFWeb');
        expect(gerarS1298({ cnpj: CNPJ, perApur: '2026-09', tpAmb: 2, id: ID }).xml).toBe(
            `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtReabreEvPer/v_S_01_03_00"><evtReabreEvPer Id="${ID}">`
            + '<ideEvento><indApuracao>1</indApuracao><perApur>2026-09</perApur><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>ConsultorDP_1.0</verProc></ideEvento>'
            + '<ideEmpregador><tpInsc>1</tpInsc><nrInsc>29463877</nrInsc></ideEmpregador></evtReabreEvPer></eSocial>');
        expect(() => validarPerApur('2026-13')).toThrow(/AAAA-MM/);
        expect(gerarS1299({ cnpj: CNPJ, perApur: '2026-09', tpAmb: 2, info: INFO }).id).toMatch(/^ID129463877000000\d{19}$/);
    });
});

describe('XML pronto', () => {
    const s2200 = (nrInsc = '29463877', tpAmb = '2') => '﻿<?xml version="1.0"?><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00">'
        + `<evtAdmissao Id="${ID}"><ideEvento><indRetif>1</indRetif><tpAmb>${tpAmb}</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>${nrInsc}</nrInsc></ideEmpregador>`
        + '<trabalhador><cpfTrab>52998224725</cpfTrab></trabalhador></evtAdmissao><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/></eSocial>';
    it('lê tipo, grupo, Id e CPF; confere empregador e ambiente', () => {
        expect(lerEventoXml('a.xml', s2200(), { cnpj: CNPJ }, 2)).toMatchObject({ tipo: 'S-2200', grupo: 2, id: ID, cpf: '52998224725', erro: '' });
        expect(lerEventoXml('a.xml', s2200('11222333'), { cnpj: CNPJ }, 2).erro).toMatch(/empregador 11222333 não é a empresa ativa/);
        expect(lerEventoXml('a.xml', s2200(), { cnpj: CNPJ }, 1).erro).toMatch(/evento de produção restrita; o envio está em produção/);
        expect(lerEventoXml('a.xml', '<nota/>', { cnpj: CNPJ }, 2).erro).toMatch(/não é um evento do eSocial/);
        expect(lerEventoXml('a.xml', `<eSocial><evtBasesTrab Id="${ID}"/></eSocial>`, { cnpj: CNPJ }, 2).erro).toMatch(/não é um evento que se transmite/);
    });
    it('grupos do lote', () => {
        expect(['S-1010', 'S-1200', 'S-1299', 'S-2299', 'S-3000', 'S-5011'].map(grupoDoTipo)).toEqual([1, 3, 3, 2, 2, null]);
    });
});

describe('resultado da consulta', () => {
    const eventos = [{ id: 'A', tipo: 'S-1299', perApur: '2026-09' }, { id: 'B', tipo: 'S-1299', perApur: '2026-09' }, { id: 'C', tipo: 'S-1299', perApur: null }];
    it('junta recibo e ocorrências pelo Id e resume', () => {
        const m = mesclarConsulta(eventos, {
            cdResposta: 201, descResposta: '', ocorrencias: [], tempoEstimadoConclusao: null, protocolo: 'p', situacao: 'processado', tpAmb: 2,
            eventos: [
                { id: 'A', cdResposta: 201, descResposta: 'ok', ocorrencias: [], nrRecibo: '1.1.1', totalizadores: ['S-5011'] },
                { id: 'B', cdResposta: 401, descResposta: 'recusado', ocorrencias: [{ tipo: 1, codigo: '1010', descricao: 'x', localizacao: '' }], nrRecibo: '', totalizadores: [] },
            ],
        });
        expect(m[0]).toMatchObject({ nrRecibo: '1.1.1', totalizadores: ['S-5011'] });
        expect(m[1].ocorrencias?.[0].codigo).toBe('1010');
        expect(m[2]).toEqual(eventos[2]);
        expect(resumoEnvio({ eventos: m })).toEqual({ aceitos: 1, recusados: 1, aguardando: 1 });
        expect(aceito({ cdResposta: 202, nrRecibo: '9' })).toBe(true);
        expect(aceito({ cdResposta: 201, nrRecibo: '' })).toBe(false);
    });
});
