// Empresas cadastradas em dobro: o que manter e o que pode ser excluído (dados fictícios).
import { describe, expect, it } from 'vitest';
import { aindaRepetida, analisarRepetidas, configuracoesDoCadastro, resumoDados, type DadosDaEmpresa } from '../duplicadas';
import type { Empresa } from '../empresasTypes';

const emp = (id: string, nome: string, segundos: number): Empresa => ({ id, nomeFantasia: nome, razaoSocial: nome, cnpj: '11222333000181', codigoSage: '0002', criadoPor: 'u', criadoEm: { seconds: segundos } } as Empresa);
const d = (p: Partial<DadosDaEmpresa> = {}): DadosDaEmpresa => ({ porColecao: {}, configuracoes: [], carteiras: 0, naoConferidas: [], ...p });
const A = emp('A', 'BRISKA', 100); const B = emp('B', 'BRISKA', 200);

describe('empresas repetidas', () => {
    it('mantém a que tem dados e libera a vazia', () => {
        const r = analisarRepetidas([A, B], new Map([['A', d()], ['B', d({ porColecao: { cadastro_funcionarios: 12, calculo_movimentos: 30 } })]]));
        expect(r.map(x => [x.empresa.id, x.recomendacao])).toEqual([['A', 'excluir'], ['B', 'manter']]);
        expect(r[1].motivo).toContain('12 funcionários, 30 movimentos');
    });
    it('configuração no cadastro, coleção de cargos ou coleção não conferida contam como dado', () => {
        for (const dados of [d({ configuracoes: ['esocialFolha'] }), d({ porColecao: { cadastro_cargos: 1 } }), d({ naoConferidas: ['lotacoes'] })]) {
            const r = analisarRepetidas([A, B], new Map([['A', dados], ['B', d({ porColecao: { folhas_gravadas: 1 } })]]));
            expect(r.map(x => x.recomendacao)).toEqual(['unir', 'unir']);
        }
        expect(resumoDados(d({ configuracoes: ['contasPagamento'], naoConferidas: ['lotacoes'] }))).toBe('configurações no cadastro (contasPagamento), não conferido: lotações/obras');
        expect(configuracoesDoCadastro({ id: 'A', cnpj: '1', nomeFantasia: 'X', sindicatos: [], esocialFolha: { nrInscEstab: '1' }, contatoEnvio: {}, certificado: null, parametrosFolha: { arredondar: true } }))
            .toEqual(['esocialFolha', 'parametrosFolha']);
    });
    it('vazia que está numa carteira: trocar na carteira antes de excluir', () => {
        const r = analisarRepetidas([A, B], new Map([['A', d({ carteiras: 2 })], ['B', d({ porColecao: { folhas_gravadas: 1 } })]]));
        expect(r[0].recomendacao).toBe('tirar-da-carteira');
        expect(r[0].motivo).toMatch(/carteira de 2 colaborador/);
    });
    it('nenhuma com dados: fica a mais antiga', () => {
        const r = analisarRepetidas([B, A], new Map());
        expect(r.map(x => [x.empresa.id, x.recomendacao])).toEqual([['B', 'excluir'], ['A', 'manter']]);
        expect(resumoDados(d())).toBe('nenhum dado');
    });
    it('ainda repetida: só se outro cadastro tem o mesmo código SAGE ou CNPJ', () => {
        expect(aindaRepetida(A, [A, B])).toBe(true);
        expect(aindaRepetida(A, [A, { ...B, cnpj: '99888777000155', codigoSage: '0003' }])).toBe(false);
        expect(aindaRepetida(A, [A])).toBe(false);
    });
});
