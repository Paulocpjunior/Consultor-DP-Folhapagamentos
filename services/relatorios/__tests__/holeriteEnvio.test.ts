// Holerite por e-mail (Envio para email do Funcionário do SAGE): seleção por código, departamento e demitidos (dados fictícios).
import { describe, expect, it } from 'vitest';
import { codigoDaFicha, departamentosDasFichas, SELECAO_PADRAO, selecionarHolerites, tipoDoHistorico } from '../holeriteEnvio';
import { assuntoHolerite, mensagemHolerite } from '../holeritePorEmail';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

const ficha = (id: string, nome: string, dados: FichaFuncionario['dados'] = {}, situacao: FichaFuncionario['situacao'] = 'ativo'): FichaFuncionario =>
    ({ ...fichaVazia({ id: 'E1', cnpj: '11222333000181' }), id, cpf: '52998224725', matriculaEsocial: id, situacao, dados: { nome, ...dados } });
const r = (fichaId: string, nome: string, situacao: ResultadoCalculo['situacao'] = 'calculado'): ResultadoCalculo =>
    ({ fichaId, nome, competencia: '2026-10', pagamento: '2026-11', situacao, verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0, memoria: [], avisos: [], erros: [] });
const FICHAS = [
    ficha('f1', 'HENRIQUE', { codigoIob: '000001', departamento: 'LOJA' }),
    ficha('f2', 'ANA', { codigoIob: '000015', departamento: 'ESCRITORIO' }),
    ficha('f3', 'PAULO', { codigoIob: '100000', departamento: 'LOJA', dataDesligamento: '2026-10-10' }, 'desligado'),
];
const RS = [r('f1', 'HENRIQUE'), r('f2', 'ANA'), r('f3', 'PAULO'), r('fx', 'SEM FICHA'), { ...r('f1', 'HENRIQUE'), situacao: 'erro' as const }];

describe('holerite por e-mail: seleção', () => {
    it('código inicial e final (sem os zeros), departamento e demitidos', () => {
        const nomes = (s: Partial<typeof SELECAO_PADRAO>) => selecionarHolerites(RS, FICHAS, { ...SELECAO_PADRAO, ...s }).map(x => x.nome);
        expect(nomes({})).toEqual(['ANA', 'HENRIQUE', 'PAULO']);
        expect(nomes({ codigoDe: '000001', codigoAte: '000020' })).toEqual(['ANA', 'HENRIQUE']);
        expect(nomes({ codigoDe: '2' })).toEqual(['ANA', 'PAULO']);
        expect(nomes({ departamento: 'LOJA' })).toEqual(['HENRIQUE', 'PAULO']);
        expect(nomes({ demitidos: false })).toEqual(['ANA', 'HENRIQUE']);
        expect(codigoDaFicha(FICHAS[0])).toBe('1');
        expect(departamentosDasFichas(FICHAS)).toEqual(['ESCRITORIO', 'LOJA']);
    });
    it('histórico por tipo e o texto do e-mail com o título e a mensagem', () => {
        expect([tipoDoHistorico('mensal'), tipoDoHistorico('ferias'), tipoDoHistorico('13-2a')]).toEqual(['holerite', 'holerite-ferias', 'holerite-13-2a']);
        expect(assuntoHolerite('2026-10', 'EMPRESA X', 'Recibo de férias')).toBe('Recibo de férias 10/2026 · EMPRESA X');
        const m = mensagemHolerite('ANA SILVA', '2026-10', 'EMPRESA X', '', 'Recibo de férias', 'Boas férias!');
        expect(m).toMatch(/Olá, Ana!/);
        expect(m).toMatch(/seu recibo de férias de 10\/2026 da EMPRESA X\.\n\nBoas férias!/);
        expect(mensagemHolerite('ANA', '2026-10', 'EMPRESA X')).toMatch(/seu holerite de 10\/2026/);
    });
});
