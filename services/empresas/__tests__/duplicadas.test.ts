// Empresas cadastradas em dobro: o que manter e o que pode ser excluído (dados fictícios).
import { describe, expect, it } from 'vitest';
import { analisarRepetidas, resumoDados, type DadosDaEmpresa } from '../duplicadas';
import type { Empresa } from '../empresasTypes';

const emp = (id: string, nome: string, segundos: number): Empresa => ({ id, nomeFantasia: nome, razaoSocial: nome, cnpj: '11222333000181', codigoSage: '0002', criadoPor: 'u', criadoEm: { seconds: segundos } } as Empresa);
const d = (p: Partial<DadosDaEmpresa> = {}): DadosDaEmpresa => ({ funcionarios: 0, movimentos: 0, folhas: 0, processos: 0, esocial: 0, afastamentos: 0, rubricas: 0, historico: 0, fechamentos: 0, guias: 0, enquadramentos: 0, carteiras: 0, ...p });
const A = emp('A', 'BRISKA', 100); const B = emp('B', 'BRISKA', 200);

describe('empresas repetidas', () => {
    it('mantém a que tem dados e libera a vazia', () => {
        const r = analisarRepetidas([A, B], new Map([['A', d()], ['B', d({ funcionarios: 12, movimentos: 30 })]]));
        expect(r.map(x => [x.empresa.id, x.recomendacao])).toEqual([['A', 'excluir'], ['B', 'manter']]);
        expect(r[1].motivo).toContain('12 funcionários, 30 movimentos');
    });
    it('vazia que está numa carteira: trocar na carteira antes de excluir', () => {
        const r = analisarRepetidas([A, B], new Map([['A', d({ carteiras: 2 })], ['B', d({ folhas: 1 })]]));
        expect(r[0].recomendacao).toBe('tirar-da-carteira');
        expect(r[0].motivo).toMatch(/carteira de 2 colaborador/);
    });
    it('duas com dados: unir, nunca excluir', () => {
        const r = analisarRepetidas([A, B], new Map([['A', d({ funcionarios: 1 })], ['B', d({ movimentos: 3 })]]));
        expect(r.map(x => x.recomendacao)).toEqual(['unir', 'unir']);
    });
    it('nenhuma com dados: fica a mais antiga', () => {
        const r = analisarRepetidas([B, A], new Map());
        expect(r.map(x => [x.empresa.id, x.recomendacao])).toEqual([['B', 'excluir'], ['A', 'manter']]);
        expect(resumoDados(d())).toBe('nenhum dado');
    });
});
