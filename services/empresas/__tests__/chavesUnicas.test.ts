import { describe, expect, it } from 'vitest';
import { chaveCnpj, chaveSage, mensagemConflito, normalizarSage, repetidas } from '../chavesUnicas';

const e = (id: string, codigoSage: string, cnpj: string, nomeFantasia = id) => ({ id, codigoSage, cnpj, nomeFantasia, razaoSocial: `${id} LTDA` });

describe('código SAGE e CNPJ únicos', () => {
    it('chaves normalizadas como a empresa é gravada', () => {
        expect([normalizarSage('1200'), normalizarSage('272'), normalizarSage('0272'), normalizarSage('12.00')]).toEqual(['1200', '0272', '0272', '1200']);
        expect(chaveSage('272')).toBe('sage_0272');
        expect(chaveCnpj('44.388.152/0001-89')).toBe('cnpj_44388152000189');
    });
    it('aponta as repetidas (o caso do 1200 no print do Paulo)', () => {
        const r = repetidas([e('SP', '1200', '44388152000189'), e('SPA', '1200', '04896300000151'), e('ABA', '0272', '26444489000184'), e('ABA2', '272', '26444489000184')]);
        expect(r.map(d => [d.tipo, d.valor, d.empresas.map(x => x.id)])).toEqual([
            ['cnpj', '26444489000184', ['ABA', 'ABA2']],
            ['sage', '0272', ['ABA', 'ABA2']],
            ['sage', '1200', ['SP', 'SPA']],
        ]);
        expect(repetidas([e('A', '1', '1'), e('B', '2', '2')])).toEqual([]);
    });
    it('mensagem diz com quem conflita, ou que é fora da carteira', () => {
        expect(mensagemConflito('sage', '1200', { nomeFantasia: 'SP', razaoSocial: '' })).toBe('O código SAGE 1200 já está em uso pela empresa "SP".');
        expect(mensagemConflito('cnpj', '44388152000189', null)).toBe('O CNPJ 44388152000189 já está cadastrado por outra empresa (fora da sua carteira).');
    });
});
