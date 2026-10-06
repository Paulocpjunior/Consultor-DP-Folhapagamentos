import { describe, expect, it } from 'vitest';
import { filtrarEmpresas } from '../buscaEmpresas';
import { competenciaAaaaMm } from '../../../components/folha/FolhaPanel';

const E = [
    { id: 'aba', nomeFantasia: 'ABA', razaoSocial: 'ASSOCIACAO BRASILEIRA DE DESENVOLVIMENTO', cnpj: '26444489000184', codigoSage: '0272' },
    { id: 'sp', nomeFantasia: 'SP', razaoSocial: 'S&P ASSESSORIA CONTÁBIL S/S', cnpj: '44388152000189', codigoSage: '1200' },
    { id: 'vita', nomeFantasia: 'VITA', razaoSocial: 'VITA SERVIÇOS DE DIGITALIZAÇÃO LTDA', cnpj: '04144798000104', codigoSage: '0358' },
];
const ids = (f: string) => filtrarEmpresas(E, f).map(e => e.id);

describe('busca de empresa (Folha e ativação)', () => {
    it('código SAGE com ou sem zeros, CNPJ com ou sem pontuação', () => {
        expect(ids('1200')).toEqual(['sp']);
        expect(ids('272')).toEqual(['aba']);
        expect(ids('0272')).toEqual(['aba']);
        expect(ids('26.444.489')).toEqual(['aba']);
        expect(ids('44388152000189')).toEqual(['sp']);
    });
    it('nome e razão social sem acento nem maiúscula; vazio traz todas', () => {
        expect(ids('contabil')).toEqual(['sp']);
        expect(ids('servicos de digitalizacao')).toEqual(['vita']);
        expect(ids('Vita')).toEqual(['vita']);
        expect(ids('  ')).toEqual(['aba', 'sp', 'vita']);
        expect(ids('xyz')).toEqual([]);
    });
    it('competência do modal da Folha para a empresa ativa', () => {
        expect(competenciaAaaaMm('09/2026')).toBe('2026-09');
        expect(competenciaAaaaMm('13/2026')).toBe('');
        expect(competenciaAaaaMm('2026-09')).toBe('');
    });
});
