// Trabalho Intermitente do SAGE: recibos do mês, listagem de convocação e valores para bancos (dados fictícios).
import { describe, expect, it } from 'vitest';
import { calcularMensal } from '../motorMensal';
import { convocacaoVazia, diasDoPeriodo, type Convocacao } from '../intermitente';
import { bancosIntermitente, filtrarRecibos, listagemConvocacoes, recibosDoMes } from '../recibosIntermitente';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2026-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 162100, aliquota: 7.5, deducao: 0 }, { ate: 290284, aliquota: 9, deducao: 0 }, { ate: 435427, aliquota: 12, deducao: 0 }, { ate: 847555, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2026-01', norma: 'Lei de teste', observacao: '', valores: { descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const ficha = (id: string, nome: string, dados: FichaFuncionario['dados'] = {}): FichaFuncionario => ({
    ...fichaVazia({ id: 'e1', cnpj: '11222333000181' }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo', dependentes: [],
    dados: { nome, admissao: '2025-02-10', salario: '20.00', unidadeSalario: '1', horasMes: '220', categoria: '111', banco: '341', agencia: '1234', conta: '56789-0', ...dados },
});
const A = ficha('fa', 'ANA', { departamento: 'SALAO' }); const B = ficha('fb', 'BRUNO', { banco: '', agencia: '', conta: '', pix: 'bruno@x' });
const conv = (c: Partial<Convocacao>): Convocacao => ({ ...convocacaoVazia('e1', 'fa', 'c'), enviadaEm: '2026-09-25', resposta: 'aceita', respondidaEm: '2026-09-26', ...c });
const CONVS = [
    conv({ id: 'a1', codigo: 1, fichaId: 'fa', dias: diasDoPeriodo('2026-10-05', '2026-10-09', [1, 2, 3, 4, 5], 8), dataPagamento: '2026-10-10', funcao: 'Garçom' }),
    conv({ id: 'a2', codigo: 3, fichaId: 'fa', dias: [{ data: '2026-10-20', horas: 6 }] }),
    conv({ id: 'b1', codigo: 2, fichaId: 'fb', dias: [{ data: '2026-10-14', horas: 8 }], dataPagamento: '2026-10-15' }),
    conv({ id: 'b2', codigo: 4, fichaId: 'fb', dias: [{ data: '2026-10-28', horas: 8 }], resposta: 'recusada' }),
];
const resultados = [A, B].map(f => calcularMensal({ competencia: '2026-10', pagamento: '2026-11', ficha: f, afastamentos: [], tabelas: [INSS, IR], convocacoes: CONVS }));

describe('recibos do intermitente no mês', () => {
    const recibos = recibosDoMes(resultados, CONVS, '2026-10', '2026-11-06');
    it('um por data de pagamento; sem data, pago com a folha', () => {
        expect(recibos.map(x => [x.nome, x.dataPagamento, x.convocacoes.map(c => c.id), x.periodo])).toEqual([
            ['ANA', '2026-10-10', ['a1'], ['2026-10-05', '2026-10-09']],
            ['ANA', '2026-11-06', ['a2'], ['2026-10-20', '2026-10-20']],
            ['BRUNO', '2026-10-15', ['b1'], ['2026-10-14', '2026-10-14']],
        ]);
        expect(recibos.every(x => x.resultado.basesIntermitente)).toBe(true);
    });
    it('seleção por funcionário, por convocação e por data de convocação ou de pagamento', () => {
        expect(filtrarRecibos(recibos, { fichaIds: ['fb'], por: 'convocacao', de: '', ate: '' })).toHaveLength(1);
        expect(filtrarRecibos(recibos, { convocacaoId: 'a2', por: 'convocacao', de: '', ate: '' }).map(x => x.dataPagamento)).toEqual(['2026-11-06']);
        expect(filtrarRecibos(recibos, { por: 'pagamento', de: '2026-10-01', ate: '2026-10-31' })).toHaveLength(2);
        expect(filtrarRecibos(recibos, { por: 'convocacao', de: '2026-10-15', ate: '2026-10-31' }).map(x => x.convocacoes[0].id)).toEqual(['a2']);
    });
    it('valores para bancos: o líquido de cada recibo com a conta (ou o PIX) da ficha', () => {
        const t = bancosIntermitente(recibos, [A, B], { separa: 'banco', documento: 'nenhum' });
        expect(t.linhas.some(l => l[0] === '341' && l[3] === 'ANA')).toBe(true);
        expect(t.linhas.some(l => l[2] === 'PIX bruno@x')).toBe(true);
        const total = recibos.reduce((s, x) => s + x.resultado.totais.liquido, 0);
        expect(t.totais!.at(-1)).toBe((total / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
    });
});

describe('listagem de convocação', () => {
    it('por data de convocação, com as recusadas fora dos totais; por código; por departamento', () => {
        const t = listagemConvocacoes(CONVS, [A, B], { por: 'convocacao', de: '2026-10-01', ate: '2026-10-31' }, 'codigo');
        expect(t.linhas.map(l => l[0])).toEqual(['1', '2', '3', '4']);
        expect(t.totais![4]).toBe('54'); // 40 + 8 + 6 (a recusada fica fora)
        expect(listagemConvocacoes(CONVS, [A, B], { por: 'pagamento', de: '2026-10-01', ate: '2026-10-31' }).linhas).toHaveLength(2);
        expect(listagemConvocacoes(CONVS, [A, B], { por: 'convocacao', de: '', ate: '' }, 'nome', true).linhas.map(l => [l[1], l[2]])).toEqual([['BRUNO', '—'], ['BRUNO', '—'], ['ANA', 'SALAO'], ['ANA', 'SALAO']]);
    });
});
