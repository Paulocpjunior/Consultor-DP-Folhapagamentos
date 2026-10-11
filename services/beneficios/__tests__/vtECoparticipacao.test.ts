// Pedido de vale-transporte e coparticipação do plano de saúde (dados fictícios).
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { comCoparticipacao, coparticipacaoPorFicha, DESCRICAO_COPART, diasDeUso, lerPlanilhaCoparticipacao, pedidoVt, validarItinerario, type ItinerarioVt } from '../vtECoparticipacao';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';

const ficha = (id: string, cpf: string, nome: string, x: Record<string, string> = {}): FichaFuncionario => {
    const f = fichaVazia({ id: 'E1', cnpj: '11222333000181' });
    return { ...f, id, cpf, dados: { ...f.dados, nome, admissao: '2024-01-02', valeTransporte: 'S', valeTransporteCusto: '220.00', ...x } } as FichaFuncionario;
};
const ana = ficha('E1_52998224725_M1', '52998224725', 'ANA');
const bruno = ficha('E1_39053344705_M1', '39053344705', 'BRUNO', { admissao: '2026-11-16' });
const caio = ficha('E1_11144477735_M1', '11144477735', 'CAIO', { valeTransporte: 'N' });
const iti = (fichaId: string, x: Partial<ItinerarioVt> = {}): ItinerarioVt => ({ empresaId: 'E1', fichaId, diasSemana: [1, 2, 3, 4, 5], linhas: [{ operadora: 'SPTrans (Bilhete Único)', descricao: 'Ônibus casa-trabalho', tarifa: 500, viagensDia: 2 }, { operadora: 'Metrô', descricao: 'Linha 1', tarifa: 520, viagensDia: 2 }], ...x });
const ferias = (fichaId: string, dtInicio: string, dtFim: string): Afastamento => ({ ...afastamentoVazio(), fichaId, dtInicio, dtFim, motivo: '15' } as Afastamento);

describe('pedido de vale-transporte', () => {
    it('dias de uso: dias da semana marcados, fora feriado nacional, férias e antes da admissão', () => {
        // 11/2026: 21 dias úteis seg–sex; 02/11 (Finados) e 20/11 (Consciência Negra) são feriados nacionais.
        expect(diasDeUso('2026-11', { diasSemana: [1, 2, 3, 4, 5] }, ana, [])).toEqual({ dias: 19, fora: { feriados: 2, afastados: 0, foraDoVinculo: 0 } });
        expect(diasDeUso('2026-11', { diasSemana: [1, 2, 3, 4, 5] }, ana, [ferias(ana.id, '2026-11-09', '2026-11-18')]).dias).toBe(11);
        expect(diasDeUso('2026-11', { diasSemana: [1, 2, 3, 4, 5, 6] }, bruno, []).fora.foraDoVinculo).toBe(12);
    });
    it('quantidade e valor por linha, total por operadora; sem itinerário avisa; sem VT na ficha fica de fora', () => {
        const p = pedidoVt('2026-11', [ana, bruno, caio], [iti(ana.id)], [ferias(ana.id, '2026-11-09', '2026-11-18')]);
        expect(p.fichas).toHaveLength(1);
        expect(p.fichas[0]).toMatchObject({ nome: 'ANA', dias: 11, total: 11 * 2 * 500 + 11 * 2 * 520, custoFicha: 22000 });
        expect(p.fichas[0].itens.map(x => [x.operadora, x.quantidade, x.valor])).toEqual([['SPTrans (Bilhete Único)', 22, 11000], ['Metrô', 22, 11440]]);
        expect(p.fichas[0].observacao).toMatch(/2 feriado.*8 dia\(s\) de férias/);
        expect(p.porOperadora).toEqual([{ operadora: 'Metrô', quantidade: 22, valor: 11440 }, { operadora: 'SPTrans (Bilhete Único)', quantidade: 22, valor: 11000 }]);
        expect(p.semItinerario).toEqual(['BRUNO']);
        expect(p.total).toBe(22440);
    });
    it('validação do itinerário', () => {
        expect(validarItinerario(iti(ana.id))).toEqual([]);
        expect(validarItinerario(iti(ana.id, { diasSemana: [], linhas: [{ operadora: '', descricao: '', tarifa: 0, viagensDia: 0 }] })).join(' ')).toMatch(/dias da semana.*operadora.*tarifa.*viagens/);
    });
});

describe('coparticipação do plano de saúde', () => {
    const planilha = (linhas: unknown[][]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Fatura'); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer; };
    it('lê CPF, nome e valor pelo cabeçalho; CPF inválido avisa', () => {
        const r = lerPlanilhaCoparticipacao(planilha([['Fatura 10/2026'], ['Beneficiário', 'CPF', 'Valor coparticipação'], ['ANA', '529.982.247-25', 35.5], ['ANA (dep.)', '52998224725', '12,00'], ['X', '123', 10], ['CARLA', '11144477735', 20]]));
        expect(r.linhas.map(l => [l.cpf, l.valor])).toEqual([['52998224725', 3550], ['52998224725', 1200], ['11144477735', 2000]]);
        expect(r.avisos.join(' ')).toMatch(/CPF inválido/);
        expect(lerPlanilhaCoparticipacao(planilha([['a', 'b']])).avisos[0]).toMatch(/cabeçalho/);
    });
    it('soma por ficha na competência; quem não tem ficha vem à parte; lançamento substitui o anterior', () => {
        const { porFicha, semFicha } = coparticipacaoPorFicha([{ linha: 3, cpf: '52998224725', nome: 'ANA', valor: 3550 }, { linha: 4, cpf: '52998224725', nome: '', valor: 1200 }, { linha: 6, cpf: '11144477735', nome: 'CARLA', valor: 2000 }], [ana], '2026-10');
        expect([...porFicha]).toEqual([[ana.id, 4750]]);
        expect(semFicha.map(l => l.nome)).toEqual(['CARLA']);
        const antes = { horasExtras50: 2, lancamentos: [{ descricao: 'Outro', tipo: 'provento' as const, valor: 100, inss: true, fgts: true, irrf: true }, { descricao: DESCRICAO_COPART, tipo: 'desconto' as const, valor: 999, inss: false, fgts: false, irrf: false }] };
        expect(comCoparticipacao(antes, 4750)).toEqual({ horasExtras50: 2, lancamentos: [antes.lancamentos[0], { descricao: DESCRICAO_COPART, tipo: 'desconto', valor: 4750, inss: false, fgts: false, irrf: false }] });
        expect(comCoparticipacao(null, 0)).toEqual({ lancamentos: [] });
    });
});
