import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Enquadramento } from '../../cadastros/enquadramento';
import type { Sindicato } from '../../cadastros/sindicatos';
import { calcularPrevia, cenariosPadrao, indenizacaoDataBase, podeSeguroDesemprego, resumoDoCenario, sacaFgts, saldoFgtsEstimado } from '../previa';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2025-06-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', tipoContrato: '1' } };
const ENQ: Enquadramento = { id: 'q', empresaId: 'E1', vigencia: '2026-01', regime: 'normal', fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1, terceiros: 5.8, observacao: '' };

describe('prévia de rescisão', () => {
    it('três cenários com o custo da empresa; o líquido é o do TRCT', () => {
        const [disp, pedido, acordo] = calcularPrevia({ ficha: FICHA, afastamentos: [], tabelas: TAB, movimentos: {}, cenarios: cenariosPadrao('2026-10-05'), saldoFgts: 300000, enquadramento: ENQ });
        expect(disp.r.situacao).toBe('calculado');
        // Dispensa: aviso indenizado e multa de 40% sobre o saldo informado + os depósitos rescisórios.
        expect(disp.r.verbas.some(v => v.codigo === 'AVISO')).toBe(true);
        expect(disp.custo.multaEstimada).toBe(false);
        expect(disp.custo.multaFgts).toBeGreaterThan(Math.round(300000 * 0.4) - 1);
        // Pedido: sem aviso indenizado nem multa; acordo: multa de 20%.
        expect(pedido.r.verbas.some(v => v.codigo === 'AVISO')).toBe(false);
        expect(pedido.custo.multaFgts).toBe(0);
        expect(acordo.custo.multaFgts).toBeLessThan(disp.custo.multaFgts);
        for (const x of [disp, pedido, acordo]) {
            expect(x.custo.liquido).toBe(x.r.totais.liquido);
            const enc = x.custo.patronal!.patronal + x.custo.patronal!.rat + x.custo.patronal!.terceiros;
            expect(x.custo.total).toBe(x.r.totais.proventos + x.r.fgts + x.r.multaFgts + enc + x.custo.indenizacaoDataBase);
        }
        expect(disp.custo.total).toBeGreaterThan(pedido.custo.total);
        expect(resumoDoCenario(disp)).toMatchObject({ tipo: '02', aviso: 'indenizado', data: '2026-10-05', liquido: disp.custo.liquido });
        expect(acordo.alertas.join(' ')).toContain('80% do FGTS');
    });

    it('sem o extrato, a multa sai pela estimativa (e é dita como estimativa)', () => {
        const [disp] = calcularPrevia({ ficha: FICHA, afastamentos: [], tabelas: TAB, movimentos: {}, cenarios: cenariosPadrao('2026-10-05') });
        expect(disp.custo.multaEstimada).toBe(true);
        expect(disp.custo.multaFgts).toBeGreaterThan(0);
        expect(disp.r.avisos.join(' ')).not.toMatch(/saldo do FGTS/i);
        // 16 meses de 3.000 a 8% com 13º e 1/3: ~ 16 × 240 × 1,11.
        const est = saldoFgtsEstimado(FICHA, '2026-10-05');
        expect(est).toBeGreaterThan(400000); expect(est).toBeLessThan(450000);
        expect(saldoFgtsEstimado(FICHA, '2025-05-01')).toBe(0);
    });

    it('alertas: afastado, contrato a termo, data-base', () => {
        const afast = [{ id: 'a1', fichaId: 'f1', empresaId: 'E1', dtInicio: '2026-09-01', dtFim: '', motivo: '03' } as never];
        const [x] = calcularPrevia({ ficha: FICHA, afastamentos: afast, tabelas: TAB, movimentos: {}, cenarios: [{ id: 'c', tipo: '02', aviso: 'indenizado', data: '2026-10-05' }] });
        expect(x.alertas.join(' ')).toContain('Afastado em 05/10/2026');
        const termo = { ...FICHA, dados: { ...FICHA.dados, tipoContrato: '2', fimContrato: '2026-11-30' } };
        const [t] = calcularPrevia({ ficha: termo, afastamentos: [], tabelas: TAB, movimentos: {}, cenarios: [{ id: 'c', tipo: '02', aviso: 'indenizado', data: '2026-10-05' }] });
        expect(t.alertas.join(' ')).toContain('motivo 03');
        // Data-base em novembro: fim projetado em 20/09 está a 42 dias (fora); em 08/10, a 24 dias (dentro).
        const sind = { dataBase: '11' } as Sindicato;
        expect(indenizacaoDataBase({ tipo: '02', data: '2026-09-17', dataProjetada: '2026-09-20' }, sind, 300000)).toBeNull();
        expect(indenizacaoDataBase({ tipo: '02', data: '2026-10-05', dataProjetada: '2026-10-08' }, sind, 300000)).toEqual({ valor: 300000, dataBase: '2026-11-01' });
        expect(indenizacaoDataBase({ tipo: '02', data: '2026-10-05', dataProjetada: '2026-10-08' }, { dataBase: '10' } as Sindicato, 300000)).toBeNull();
        expect(indenizacaoDataBase({ tipo: '02', data: '2026-10-05', dataProjetada: '2026-10-15' }, sind, 300000)).toEqual({ valor: 300000, dataBase: '2026-11-01' });
        expect(indenizacaoDataBase({ tipo: '07', data: '2026-10-05', dataProjetada: '2026-10-15' }, sind, 300000)).toBeNull();
        const [comDb] = calcularPrevia({ ficha: FICHA, afastamentos: [], tabelas: TAB, movimentos: {}, sindicato: { dataBase: '11' } as Sindicato, cenarios: [{ id: 'c', tipo: '02', aviso: 'indenizado', data: '2026-09-25' }] });
        // 33 dias de aviso: fim projetado em 28/10, 4 dias antes da data-base.
        expect(comDb.custo.indenizacaoDataBase).toBe(300000);
        expect(comDb.alertas.join(' ')).toContain('data-base');
    });

    it('saque do FGTS e seguro-desemprego por motivo', () => {
        expect(sacaFgts('02')).toBe('Saca o FGTS');
        expect(sacaFgts('33')).toBe('Saca 80% do FGTS');
        expect(sacaFgts('07')).toBe('Não saca o FGTS');
        expect(podeSeguroDesemprego('02')).toBe(true);
        expect(podeSeguroDesemprego('33')).toBe(false);
    });
});

describe('PDF da prévia', () => {
    it('gera o comparativo com os cenários (uma página por funcionário)', async () => {
        const { previaRescisaoPdf } = await import('../previaPdf');
        const cs = calcularPrevia({ ficha: FICHA, afastamentos: [], tabelas: TAB, movimentos: {}, cenarios: cenariosPadrao('2026-10-05'), enquadramento: ENQ });
        const doc = previaRescisaoPdf([{ ficha: FICHA, cenarios: cs, saldoFgtsInformado: false }, { ficha: FICHA, cenarios: cs.slice(0, 1), saldoFgtsInformado: true }],
            { empresa: { razaoSocial: 'EMPRESA X', cnpj: '29463877000109' }, titulo: 'Prévia de rescisão', emitidoPor: 'ana@x' });
        expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
        expect(doc.output('arraybuffer').byteLength).toBeGreaterThan(5000);
    });
});
