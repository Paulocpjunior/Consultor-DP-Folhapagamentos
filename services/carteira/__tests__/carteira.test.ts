import { describe, expect, it } from 'vitest';
import { diffCarteira, motivosRecusa, normalizarIds, resumoCarteira } from '../carteira';

describe('carteira do colaborador', () => {
    it('diferença entre a carteira antes e depois', () => {
        expect(diffCarteira(['a', 'b'], ['b', 'c'])).toEqual({ incluidas: ['c'], removidas: ['a'] });
        expect(normalizarIds([' a', 'a', '', 'b'])).toEqual(['a', 'b']);
    });

    it('gestor monta a carteira de qualquer um', () => {
        expect(motivosRecusa('gestor', 'g', { uid: 'x', papel: 'admin' }, [], [], ['qualquer'])).toEqual([]);
        expect(motivosRecusa('gestor', 'g', { uid: 'g', papel: 'gestor' }, [], [], ['a'])).toEqual([]);
    });

    it('admin: só colaboradores, só empresas da própria carteira, nunca a própria', () => {
        expect(motivosRecusa('admin', 'ad', { uid: 'c', papel: 'colaborador' }, ['a', 'b'], ['a'], ['a', 'b'])).toEqual([]);
        expect(motivosRecusa('admin', 'ad', { uid: 'c', papel: 'colaborador' }, ['a'], ['z'], ['a'])).toEqual(['1 empresa(s) fora da sua carteira: só o gestor mexe nelas.']);
        expect(motivosRecusa('admin', 'ad', { uid: 'c', papel: 'colaborador' }, ['a'], ['z', 'a'], ['z'])).toEqual([]);
        expect(motivosRecusa('admin', 'ad', { uid: 'x', papel: 'admin' }, ['a'], [], ['a'])).toEqual(['Admin monta só a carteira de colaboradores.']);
        expect(motivosRecusa('admin', 'ad', { uid: 'ad', papel: 'admin' }, ['a'], [], ['a'])).toContain('A própria carteira é montada pelo gestor.');
    });

    it('colaborador não monta carteira', () => {
        expect(motivosRecusa('colaborador', 'c', { uid: 'd', papel: 'colaborador' }, ['a'], [], ['a'])).toEqual(['Só gestor ou admin monta carteiras.']);
    });

    it('resumo', () => {
        expect(resumoCarteira('gestor', [])).toBe('todas as empresas');
        expect(resumoCarteira('colaborador', ['a', 'b'])).toBe('2 empresa(s)');
        expect(resumoCarteira('admin', undefined)).toBe('carteira vazia');
    });
});
