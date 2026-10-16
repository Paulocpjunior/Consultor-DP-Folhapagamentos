// Relatório de repasse do Crédito do Trabalhador (etapa 4): devido × descontado por contrato, motivo, total por
// instituição e o vencimento da guia do FGTS Digital (dados fictícios).
import { describe, expect, it } from 'vitest';
import { consignadoDaFolha, repasseConsignado } from '../repasseConsignado';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { ContratoConsignado } from '../consignado';
import type { ResultadoCalculo, Verba } from '../motorMensal';

const ficha = (id: string, nome: string, consignados: ContratoConsignado[], dados: Partial<FichaFuncionario['dados']> = {}, situacao: FichaFuncionario['situacao'] = 'ativo'): FichaFuncionario =>
    ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: `${id}00000000000`.slice(0, 11), situacao, dados: { nome, codigoIob: id, categoria: '101', ...dados }, consignados });
const v = (codigo: string, tipo: 'provento' | 'desconto', valor: number, inss = false, descFolha?: Verba['descFolha']): Verba => ({ codigo, descricao: codigo, referencia: '', tipo, valor, inss, fgts: inss, irrf: inss, ...(descFolha ? { descFolha } : {}) });
const res = (fichaId: string, verbas: Verba[]): ResultadoCalculo => ({ fichaId, nome: '', competencia: '2026-10', pagamento: '2026-10', situacao: 'calculado', verbas } as unknown as ResultadoCalculo);
const C = (instFinanc: string, nrDoc: string, parcela: number, extra: Partial<ContratoConsignado> = {}): ContratoConsignado => ({ instFinanc, nrDoc, parcela, inicio: '2026-01', ...extra });
const consig = (inst: string, nr: string, valor: number) => v('CONSIG', 'desconto', valor, false, { instFinanc: inst, nrDoc: nr });

describe('repasse do Crédito do Trabalhador', () => {
    const fichas = [
        ficha('1', 'ANA', [C('341', 'A1', 40000)]),
        ficha('2', 'BRUNO', [C('341', 'B1', 90000)]),
        ficha('3', 'CARLA', [C('104', 'C1', 30000)]),
        ficha('4', 'DIEGO', [C('001', 'D1', 20000, { garantiaRescisao: 10, saldoRescisao: 500000 })], { dataDesligamento: '2026-10-10' }, 'desligado'),
        ficha('5', 'ELIS', [C('341', 'E1', 15000)]),
        ficha('6', 'FABIO', [C('341', 'F1', 15000)], { dataDesligamento: '2026-08-31' }, 'desligado'),
    ];
    const folha = [
        res('1', [v('SAL', 'provento', 300000, true), consig('341', 'A1', 40000)]),
        res('2', [v('SAL', 'provento', 200000, true), consig('341', 'B1', 61250), consig('033', 'XX', 1000)]),
        res('3', [v('SF', 'provento', 6000)]), // afastada o mês todo: só salário-família
    ];
    const rescisoes = [res('4', [v('SAL', 'provento', 300000, true), consig('001', 'D1', 31000)])];

    it('linhas por contrato com situação e motivo; quem não tem cálculo aparece', () => {
        const r = repasseConsignado('2026-10', fichas, folha, rescisoes, '2026-11-01');
        const por = (nr: string) => r.linhas.find(l => l.nrDoc === nr)!;
        expect(por('A1')).toMatchObject({ situacao: 'total', devido: 40000, descontado: 40000, motivo: '' });
        expect(por('B1')).toMatchObject({ situacao: 'parcial', devido: 90000, descontado: 61250 });
        expect(por('B1').motivo).toMatch(/Margem de 35% esgotada: R\$\s?287,50/);
        expect(por('C1')).toMatchObject({ situacao: 'nao-descontado', descontado: 0 });
        expect(por('C1').motivo).toMatch(/Sem remuneração com INSS no mês/);
        expect(por('D1')).toMatchObject({ situacao: 'rescisao', devido: 500000, descontado: 31000 });
        expect(por('D1').motivo).toMatch(/Limitado à garantia de 10%/);
        expect(por('E1')).toMatchObject({ situacao: 'sem-calculo', devido: 15000 });
        expect(r.linhas.some(l => l.nrDoc === 'F1')).toBe(false); // desligado antes da competência
        expect(por('XX')).toMatchObject({ situacao: 'fora-da-ficha', devido: null, descontado: 1000 });
        expect(r.linhas.map(l => l.nome)).toEqual(['ANA', 'BRUNO', 'BRUNO', 'CARLA', 'DIEGO', 'ELIS']);
    });

    it('total por instituição, vencimento no dia 20 e avisos', () => {
        const r = repasseConsignado('2026-10', fichas, folha, rescisoes, '2026-11-01');
        expect(r.porInstituicao).toEqual([{ instFinanc: '001', contratos: 1, valor: 31000 }, { instFinanc: '033', contratos: 1, valor: 1000 }, { instFinanc: '341', contratos: 2, valor: 101250 }]);
        expect(r.total).toBe(133250);
        // 20/11 é feriado nacional (Consciência Negra): a guia antecipa para 19/11.
        expect([r.vencimento, r.vencido]).toEqual(['2026-11-19', false]);
        const avisos = r.avisos.join(' ');
        expect(avisos).toMatch(/1 contrato\(s\) vigente\(s\) sem folha ou rescisão gravada/);
        expect(avisos).toMatch(/sem contrato correspondente na ficha/);
        expect(avisos).toMatch(/R\$\s?1\.332,50 a recolher na guia do FGTS Digital da competência até 19\/11\/2026/);
        expect(avisos).not.toMatch(/Guia vencida/);
        expect(repasseConsignado('2026-10', fichas, folha, rescisoes, '2026-11-20').avisos.join(' ')).toMatch(/Guia vencida em 19\/11\/2026.*IPCA, juros de 0,033% ao dia e multa de 2%/);
    });

    it('vencimento antecipa para o dia útil anterior (20/12/2026 é domingo)', () => {
        expect(repasseConsignado('2026-11', [], [], [], '2026-12-01').vencimento).toBe('2026-12-18');
    });

    it('doméstico: o motivo aponta o eSocial Doméstico e o DAE', () => {
        const f = [ficha('7', 'GIL', [C('341', 'G1', 10000)], { categoria: '104' })];
        const r = repasseConsignado('2026-10', f, [res('7', [v('SAL', 'provento', 150000, true), consig('341', 'G1', 10000)])], [], '2026-11-01');
        expect(r.linhas[0]).toMatchObject({ situacao: 'total', dae: true });
        expect(r.linhas[0].motivo).toMatch(/eSocial Doméstico .* DAE, fora da guia do FGTS Digital/);
        // Fora da guia do FGTS Digital (Codex #275): o total e as instituições não contam o doméstico.
        expect([r.total, r.totalDae, r.porInstituicao]).toEqual([0, 10000, []]);
        expect(r.avisos.join(' ')).toMatch(/Domésticos: R\$\s?100,00 descontados vão no DAE/);
    });

    it('consignado da folha por CPF e contrato, para a conferência com o S-5003', () => {
        expect(consignadoDaFolha([...folha, ...rescisoes], fichas)).toEqual([
            { cpf: '10000000000', instFinanc: '341', nrDoc: 'A1', valor: 40000 }, { cpf: '20000000000', instFinanc: '341', nrDoc: 'B1', valor: 61250 },
            { cpf: '20000000000', instFinanc: '033', nrDoc: 'XX', valor: 1000 }, { cpf: '40000000000', instFinanc: '001', nrDoc: 'D1', valor: 31000 },
        ]);
    });
});
