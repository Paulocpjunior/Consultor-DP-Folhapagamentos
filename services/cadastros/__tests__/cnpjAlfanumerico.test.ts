// CNPJ alfanumérico (IN RFB 2.229/2024): cadastro de empresas, chaves únicas, busca e eventos do eSocial.
// 12ABC34501DE35 é o exemplo da Receita (fictício, com os dígitos verificadores certos).
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { cnpjValido, digitarCnpj, formatarCnpj, formatoCnpj, limparCnpj, limparInscricao, raizCnpj } from '../documentos';
import { formatCnpj, validaCnpj } from '../../brasilApiService';
import { chaveCnpj } from '../../empresas/chavesUnicas';
import { filtrarEmpresas } from '../../empresas/buscaEmpresas';
import { gerarS1299, idEvento, lerEventoXml } from '../../esocial/transmissao';
import { validarPeloXsd } from '../../esocial/validadorXsd';
import { validarOutrosVinculos, outroVinculoVazio } from '../duploVinculo';

const ALFA = '12ABC34501DE35';
const lerXsd = (nome: string) => readFile(new URL(`../../../public/esocial-xsd/v_S_01_03_00/${nome}`, import.meta.url), 'utf8');

describe('CNPJ alfanumérico', () => {
    it('limpa, formata, dá a raiz e valida; o numérico segue igual', () => {
        expect(limparCnpj('12.abc.345/01de-35')).toBe(ALFA);
        expect(limparInscricao(' 12.ABC.345/01DE-35 ')).toBe(ALFA);
        expect(limparInscricao('529.982.247-25')).toBe('52998224725');
        expect(formatarCnpj(ALFA)).toBe('12.ABC.345/01DE-35');
        expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
        expect(raizCnpj('12.ABC.345/01DE-35')).toBe('12ABC345');
        expect(digitarCnpj('12.abc.345/01de-35x')).toBe(ALFA);
        expect([formatoCnpj(ALFA), formatoCnpj('12ABC34501DEXX'), formatoCnpj('11222333000181')]).toEqual([true, false, true]);
        expect([cnpjValido(ALFA), validaCnpj('12.ABC.345/01DE-35'), validaCnpj('12ABC34501DE36'), validaCnpj('11.222.333/0001-81')]).toEqual([true, true, false, true]);
        expect(formatCnpj(ALFA)).toBe('12.ABC.345/01DE-35');
    });

    it('chave única e busca mantêm as letras', () => {
        expect(chaveCnpj('12.abc.345/01de-35')).toBe(`cnpj_${ALFA}`);
        expect(chaveCnpj('11.222.333/0001-81')).toBe('cnpj_11222333000181');
        const empresas = [{ nomeFantasia: 'ALFA', razaoSocial: 'ALFA LTDA', cnpj: ALFA, codigoSage: '0900' }, { nomeFantasia: 'NUM', razaoSocial: 'NUM', cnpj: '11222333000181', codigoSage: '1200' }];
        expect(filtrarEmpresas(empresas, '12.abc.345').map(e => e.nomeFantasia)).toEqual(['ALFA']);
        expect(filtrarEmpresas(empresas, '11.222').map(e => e.nomeFantasia)).toEqual(['NUM']);
        expect(filtrarEmpresas(empresas, 'abc').map(e => e.nomeFantasia)).toEqual(['ALFA']);
    });

    it('eSocial: Id e ideEmpregador com a raiz alfanumérica passam no XSD oficial e na leitura do evento', async () => {
        const id = idEvento(ALFA, new Date('2026-10-05T15:00:00Z'), 1);
        expect(id).toBe('ID112ABC3450000002026100512000000001');
        const { xml } = gerarS1299({ cnpj: ALFA, perApur: '2026-09', tpAmb: 2, id,
            info: { evtRemun: true, evtPgtos: true, evtComProd: false, evtContratAvNP: false, evtInfoComplPer: false, transDCTFWeb: false } });
        expect(xml).toContain('<nrInsc>12ABC345</nrInsc>');
        expect(await validarPeloXsd(xml, lerXsd)).toEqual({ valido: true, erros: [] });
        expect(lerEventoXml('a.xml', xml, { cnpj: '12.ABC.345/01DE-35' }, 2).erro).toBe('');
        expect(lerEventoXml('a.xml', xml, { cnpj: '11222333000181' }, 2).erro).toMatch(/não é a empresa ativa/);
    });

    it('duplo vínculo: outro empregador com CNPJ alfanumérico', () => {
        const v = { ...outroVinculoVazio(), nrInsc: '12.ABC.345/01DE-35', remuneracao: 100000, desde: '2026-01' };
        expect(validarOutrosVinculos([v])).toEqual([]);
        expect(validarOutrosVinculos([{ ...v, nrInsc: '12ABC34501DE36' }]).join(' ')).toMatch(/CNPJ do outro empregador inválido/);
    });
});
