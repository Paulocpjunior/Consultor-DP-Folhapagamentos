// Listagens: sindicatos e etiquetas (dados fictícios).
import { describe, expect, it } from 'vitest';
import { etiquetas, RELATORIOS, type ContextoRelatorio } from '../catalogoRelatorios';
import { ETIQUETA, etiquetasPdf, posicaoEtiqueta } from '../etiquetasPdf';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { sindicatoVazio, type Sindicato } from '../../cadastros/sindicatos';

const SIND_A = '11222333000181'; const SIND_B = '44388152000189';
const ficha = (id: string, nome: string, dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: `M${id}`, situacao: 'ativo',
    dados: { nome, admissao: '2025-03-10', cargo: 'AUXILIAR', ...dados } });
const sind = (cnpj: string, nome: string, x: Partial<Sindicato> = {}): Sindicato => ({ ...sindicatoVazio(), id: cnpj, cnpj, nome, codigoIob: '12', dataBase: '5', uf: 'SP', pisoSalarial: 180000, ...x });
const ctx = (fichas: FichaFuncionario[], x: Partial<ContextoRelatorio> = {}): ContextoRelatorio => ({ competencia: '2026-10', hoje: '2026-10-11', fichas, afastamentos: [], folha: null, ...x });
const montar = (id: string, c: ContextoRelatorio) => RELATORIOS.find(r => r.id === id)!.montar!(c);

describe('listagem de sindicatos', () => {
    it('por sindicato da ficha, com filiados, autorizações e oposições; os da empresa mesmo sem funcionário; sem sindicato por último', () => {
        const fichas = [
            ficha('1', 'ANA', { sindicato: SIND_A, associadoSindicato: 'S', contribuicaoSindical: 'S' }),
            ficha('2', 'BRUNO', { sindicato: SIND_A, oposicaoAssistencial: 'S' }),
            ficha('3', 'CAIO'),
            ficha('4', 'DORA', { sindicato: SIND_A, dataDesligamento: '2026-10-05' }),
        ];
        const t = montar('sindicatos', ctx(fichas, { sindicatos: [sind(SIND_A, 'SINDICATO DOS COMERCIARIOS')], sindicatosDaEmpresa: [SIND_B] }));
        expect(t.linhas).toEqual([
            ['(não cadastrado em Cadastros › Sindicatos)', '44.388.152/0001-89', '', '', '', '0', '0', '0', '0'],
            ['SINDICATO DOS COMERCIARIOS', '11.222.333/0001-81', '12', 'maio', '1.800,00', '2', '1', '1', '1'],
            ['Sem sindicato na ficha', '', '', '', '', '1', '0', '0', '0'],
        ]);
        expect(t.totais).toEqual(['3 sindicato(s)', '', '', '', '', '3', '1', '1', '1']);
        expect(t.observacao).toMatch(/1 funcionário\(s\) sem sindicato na ficha/);
        expect(t.observacao).toMatch(/STF, Tema 935/);
    });
});

describe('etiquetas', () => {
    const fichas = [ficha('2', 'BRUNO', { logradouro: 'RUA A', numero: '10', complemento: 'AP 3', bairro: 'CENTRO', cep: '01001000', municipio: 'SAO PAULO', uf: 'SP' }), ficha('1', 'ANA')];
    it('dados do funcionário ou endereço, por nome, sem os desligados', () => {
        expect(etiquetas(ctx(fichas), 'funcionario', 'ALFA LTDA')).toEqual([
            ['ANA', 'Matr. M1 · CPF 529.982.247-25', 'AUXILIAR', 'Admissão 10/03/2025', 'ALFA LTDA'],
            ['BRUNO', 'Matr. M2 · CPF 529.982.247-25', 'AUXILIAR', 'Admissão 10/03/2025', 'ALFA LTDA'],
        ]);
        expect(etiquetas(ctx(fichas), 'endereco')[1]).toEqual(['BRUNO', 'RUA A, 10 AP 3', 'CENTRO', '01001-000 · SAO PAULO/SP']);
        expect(etiquetas(ctx([...fichas, ficha('3', 'CAIO', { dataDesligamento: '2026-09-30' })]), 'funcionario')).toHaveLength(2);
    });
    it('PDF: 21 por folha A4 (3 × 7), posições da L7160, pulando as já usadas', () => {
        expect(ETIQUETA.colunas * ETIQUETA.linhas).toBe(21);
        expect(posicaoEtiqueta(0)).toEqual({ x: 7.25, y: 15.15 });
        const p = posicaoEtiqueta(20);
        expect([+(p.x).toFixed(2), +(p.y).toFixed(2)]).toEqual([139.33, 243.75]);
        // A última etiqueta cabe na folha (297 mm de altura, 210 de largura).
        expect(p.y + ETIQUETA.altura).toBeLessThanOrEqual(297);
        expect(p.x + ETIQUETA.largura).toBeLessThanOrEqual(210);
        const muitas = Array.from({ length: 22 }, (_, i) => [`PESSOA ${i}`]);
        expect(etiquetasPdf(muitas).getNumberOfPages()).toBe(2);
        expect(etiquetasPdf(muitas.slice(0, 2), 20).getNumberOfPages()).toBe(2);
        expect(etiquetasPdf(muitas.slice(0, 2), 0).getNumberOfPages()).toBe(1);
    });
});
