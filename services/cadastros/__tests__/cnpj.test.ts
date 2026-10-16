// CNPJ alfanumérico (IN RFB 2.229/2024): validação, gravação e formato. CNPJs fictícios, só com o DV certo.
import { describe, expect, it } from 'vitest';
import { cnpjValido, formatarCnpj, limparCnpj, normalizarCnpj, raizCnpj } from '../cnpj';
import { consultarCnpj, formatCnpj, validaCnpj } from '../../brasilApiService';

describe('CNPJ alfanumérico', () => {
    it('aceita o alfanumérico com o DV certo (ASCII − 48), com ou sem máscara, em maiúsculas ou não', () => {
        for (const c of ['12.ABC.345/01DE-35', '12ABC34501DE35', '12.abc.345/01de-35', 'A1.B2C.3D4/0001-93', 'ZZ.ZZZ.ZZZ/0001-91']) {
            expect(cnpjValido(c)).toBe(true);
            expect(validaCnpj(c)).toBe(true);
        }
    });
    it('recusa DV errado, letra nos dígitos verificadores, tamanho errado e caractere fora de A-Z/0-9', () => {
        expect(cnpjValido('12ABC34501DE36')).toBe(false);
        expect(cnpjValido('12ABC34501DE53')).toBe(false);
        expect(cnpjValido('12ABC34501D35')).toBe(false);
        expect(cnpjValido('12ABC34501DE3A')).toBe(false);
        expect(cnpjValido('12ÁBC34501DE35')).toBe(false);
        expect(validaCnpj('A1B2C3D4000139')).toBe(false);
    });
    it('o CNPJ numérico continua igual', () => {
        expect(validaCnpj('11.222.333/0001-81')).toBe(true);
        expect(validaCnpj('11222333000182')).toBe(false);
        expect(validaCnpj('00000000000000')).toBe(false);
        expect(formatCnpj('11222333000181')).toBe('11.222.333/0001-81');
    });
    it('grava sem pontuação, com as letras em maiúsculas; formata com a máscara de sempre', () => {
        expect(limparCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
        expect(formatCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
        expect(formatarCnpj('123')).toBe('123');
        expect(raizCnpj('12.ABC.345/01DE-35')).toBe('12ABC345');
    });
    it('normalizarCnpj: letras só no formato do CNPJ; CPF, texto e inscrição incompleta ficam só com os dígitos, como antes', () => {
        expect(normalizarCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
        expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
        expect(normalizarCnpj('529.982.247-25')).toBe('52998224725');
        expect(normalizarCnpj('CNPJ 11.222.333/0001-81')).toBe('11222333000181');
        expect(normalizarCnpj(undefined)).toBe('');
    });
    it('a consulta na BrasilAPI vai com as letras', async () => {
        const urls: string[] = [];
        const antes = globalThis.fetch;
        globalThis.fetch = (async (u: string) => { urls.push(u); return { ok: true, json: async () => ({ cnpj: '12ABC34501DE35', razao_social: 'X' }) }; }) as unknown as typeof fetch;
        try { await consultarCnpj('12.abc.345/01de-35'); } finally { globalThis.fetch = antes; }
        expect(urls).toEqual(['https://brasilapi.com.br/api/cnpj/v1/12ABC34501DE35']);
        await expect(consultarCnpj('12ABC')).rejects.toThrow(/14 posições/);
    });
});
