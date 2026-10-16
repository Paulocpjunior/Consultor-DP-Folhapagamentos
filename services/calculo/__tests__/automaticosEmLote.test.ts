// Lançamentos automáticos em lote: "Lança na rescisão" e "Pago no adiantamento" por evento, para todas as fichas.
import { describe, expect, it } from 'vitest';
import { aplicarMarcacoes, resumoAutomaticos } from '../automaticosEmLote';
import { diffFicha, fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { automaticoVazio, type LancamentoAutomatico } from '../lancamentosAutomaticos';

const A = (codigoEvento: string, extra: Partial<LancamentoAutomatico> = {}): LancamentoAutomatico => ({ ...automaticoVazio(), codigoEvento, referencia: '10', ...extra });
const ficha = (id: string, nome: string, lancs: LancamentoAutomatico[]): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo', dados: { nome }, lancamentosAutomaticos: lancs });
const FICHAS = [
    ficha('a', 'ANA', [A('1015', { descricao: 'TRIÊNIO' }), A('0300', { noAdiantamento: true })]),
    ficha('b', 'BRUNO', [A('01015', { naRescisao: 'integral' })]),
    ficha('c', 'CARLA', []),
];

describe('automáticos em lote', () => {
    it('resumo por evento (código normalizado) com as marcas de hoje', () => {
        expect(resumoAutomaticos(FICHAS)).toEqual([
            { codigo: '0300', descricao: '', fichas: 1, lancamentos: 1, rescisao: { nao: 1, proporcional: 0, integral: 0 }, adiantamento: { sim: 1, nao: 0 } },
            { codigo: '1015', descricao: 'TRIÊNIO', fichas: 2, lancamentos: 2, rescisao: { nao: 1, proporcional: 0, integral: 1 }, adiantamento: { sim: 0, nao: 2 } },
        ]);
    });

    it('aplica só as marcas escolhidas e devolve só as fichas que mudam', () => {
        const r = aplicarMarcacoes(FICHAS, { '1015': { naRescisao: 'proporcional' }, '0300': { noAdiantamento: false } });
        expect(r.lancamentos).toBe(3);
        expect(r.fichas.map(f => f.id)).toEqual(['a', 'b']);
        expect(r.fichas[0].lancamentosAutomaticos).toEqual([A('1015', { descricao: 'TRIÊNIO', naRescisao: 'proporcional' }), A('0300')]);
        expect(r.fichas[1].lancamentosAutomaticos).toEqual([A('01015', { naRescisao: 'proporcional' })]);
        // "Não lança" tira a marca; marcar igual ao que já está não muda nada.
        expect(aplicarMarcacoes(FICHAS, { '1015': { naRescisao: 'nao' } }).fichas.map(f => f.id)).toEqual(['b']);
        expect(aplicarMarcacoes(FICHAS, { '0300': { noAdiantamento: true } }).fichas).toEqual([]);
    });

    it('a auditoria da ficha registra a marca de rescisão (antes não aparecia)', () => {
        const r = aplicarMarcacoes(FICHAS, { '1015': { naRescisao: 'proporcional' } });
        const alt = diffFicha(FICHAS[0], r.fichas[0]);
        expect(alt).toEqual([expect.objectContaining({ campo: 'lancamentosAutomaticos', para: expect.stringMatching(/1015 10 .*na rescisão proporcional/) })]);
    });
});
