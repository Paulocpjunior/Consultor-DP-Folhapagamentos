import { describe, expect, it } from 'vitest';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio, type Afastamento } from '../../cadastros/afastamentos';
import type { Enquadramento } from '../../cadastros/enquadramento';
import { aliquotasEncargos, calcularProvisao, lancamentosDoMes, posicaoNoDia, totalSaldo, type EntradaProvisao } from '../provisoes';
import { RELATORIOS, type ContextoRelatorio } from '../../relatorios/catalogoRelatorios';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const ficha = (id: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: id.toUpperCase(), situacao: 'ativo',
    dados: { nome: id.toUpperCase(), admissao: '2025-03-10', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const ENQ: Enquadramento = { id: 'E1_2026-01', empresaId: 'E1', vigencia: '2026-01', regime: 'normal', fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1, terceiros: 5.8, observacao: '' };
const gozo = (fichaId: string, dtInicio: string, dtFim: string, extra: Partial<Afastamento> = {}): Afastamento => ({ ...afastamentoVazio(), id: `g${dtInicio}`, fichaId, motivo: '15', dtInicio, dtFim, ...extra });
const entrada = (x: Partial<EntradaProvisao> = {}): EntradaProvisao => ({ competencia: '2026-10', fichas: [ficha('ana')], afastamentos: [], tabelas: TAB, movimentos: {}, enquadramentos: [ENQ], empresaId: 'E1', ...x });

describe('posição de férias e 13º num dia', () => {
    it('vencidas, proporcionais (15 dias ou mais no mês) com 1/3 e 13º pelos avos do ano', () => {
        const p = posicaoNoDia(ficha('ana'), '2026-10-31', { afastamentos: [], tabelas: TAB, movimentos: {} });
        if ('erro' in p) throw new Error(p.erro);
        // 30 dias vencidos (R$ 3.000) + 8/12 de 30 dias (R$ 2.000) + 1/3; 13º: 10/12 de R$ 3.000.
        expect([p.remuneracao, p.diasVencidos, p.avosFerias, p.diasProporcionais, p.ferias, p.dobra, p.avos13, p.decimo]).toEqual([300000, 30, 8, 20, 666667, 0, 10, 250000]);
    });
    it('fora do concessivo: a dobra com 1/3, sem encargos', () => {
        const p = posicaoNoDia(ficha('bia', { admissao: '2024-01-02' }), '2026-10-31', { afastamentos: [], tabelas: TAB, movimentos: {} });
        if ('erro' in p) throw new Error(p.erro);
        expect([p.diasVencidos, p.dobra, p.avosFerias]).toEqual([60, 400000, 10]);
        expect(p.avisos[0]).toMatch(/fora do concessivo .* 30 dias em dobro/);
    });
    it('faltas reduzem os dias de direito das proporcionais (art. 130)', () => {
        const movimentos = { '2026-04': { faltasDias: 6 } };
        const p = posicaoNoDia(ficha('ana'), '2026-10-31', { afastamentos: [], tabelas: TAB, movimentos });
        if ('erro' in p) throw new Error(p.erro);
        expect(p.diasProporcionais).toBe(16); // 24 dias × 8/12
    });
});

describe('provisão do mês (método do saldo)', () => {
    it('constituição = atual − anterior + baixas, com INSS patronal e FGTS', () => {
        const p = calcularProvisao(entrada());
        const l = p.linhas[0];
        expect(l.situacao).toBe('ativo');
        expect(l.ferias.anterior.principal).toBe(633333); // 30 vencidos + 7/12 (17,5 dias) + 1/3
        expect(l.ferias.atual).toEqual({ principal: 666667, inss: 185333, fgts: 53333 });
        expect(l.ferias.constituicao.principal).toBe(33334);
        expect(l.ferias.baixa).toEqual({ principal: 0, inss: 0, fgts: 0 });
        expect([l.decimo.anterior.principal, l.decimo.atual.principal, l.decimo.constituicao.principal]).toEqual([225000, 250000, 25000]);
        expect(p.encargos?.memoria).toBe('INSS 20% + RAT × FAP 2% + terceiros 5,8% = 27,8%; FGTS 8%');
    });
    it('gozo no mês baixa a provisão pelos dias e abono, com o 1/3', () => {
        const p = calcularProvisao(entrada({ afastamentos: [gozo('ana', '2026-10-05', '2026-10-24', { perAquisInicio: '2025-03-10' })] }));
        const l = p.linhas[0];
        expect(l.diasVencidos).toBe(10);
        expect(l.ferias.baixa.principal).toBe(266667); // 20 dias × R$ 100 + 1/3
        expect(l.ferias.atual.principal).toBe(400000);
        expect(l.ferias.constituicao.principal).toBe(33334); // a mesma apropriação do mês
        expect(l.memoria.join(' ')).toMatch(/baixa de férias: 20 dia\(s\)/);
    });
    it('13º: baixa em dezembro e recomeça em janeiro', () => {
        const dez = calcularProvisao(entrada({ competencia: '2026-12' })).linhas[0].decimo;
        expect([dez.anterior.principal, dez.baixa.principal, dez.atual.principal, dez.constituicao.principal]).toEqual([275000, 300000, 0, 25000]);
        const jan = calcularProvisao(entrada({ competencia: '2027-01' })).linhas[0].decimo;
        expect([jan.anterior.principal, jan.atual.principal, jan.constituicao.principal]).toEqual([0, 25000, 25000]);
    });
    it('desligado no mês: baixa pelo saldo no desligamento e nada fica provisionado', () => {
        const p = calcularProvisao(entrada({ fichas: [ficha('ana', { dataDesligamento: '2026-10-20' })] }));
        const l = p.linhas[0];
        expect(l.situacao).toBe('desligado');
        expect([l.ferias.baixa.principal, l.ferias.atual.principal, l.ferias.constituicao.principal]).toEqual([633333, 0, 0]);
        expect([l.decimo.baixa.principal, l.decimo.constituicao.principal]).toEqual([250000, 25000]);
    });
    it('admitido no mês, desligados antes, intermitente e contribuinte individual', () => {
        const p = calcularProvisao(entrada({ fichas: [
            ficha('nova', { admissao: '2026-10-01' }), ficha('saiu', { dataDesligamento: '2026-09-15' }), ficha('futuro', { admissao: '2026-11-03' }),
            ficha('inter', { categoria: '111' }), ficha('socio', { categoria: '722' }),
        ] }));
        expect(p.linhas.map(l => l.fichaId)).toEqual(['nova']);
        const l = p.linhas[0];
        expect(l.situacao).toBe('admitido');
        expect([l.ferias.anterior.principal, l.ferias.atual.principal, l.decimo.atual.principal]).toEqual([0, 33333, 25000]);
    });
    it('encargos pelo regime: Simples sem INSS, Anexo IV sem terceiros, aprendiz com FGTS de 2%, sem enquadramento avisa', () => {
        expect(aliquotasEncargos({ ...ENQ, regime: 'simples' }, '101')).toMatchObject({ inss: 0, fgts: 8 });
        expect(aliquotasEncargos({ ...ENQ, regime: 'simples-iv', fap: 0.5 }, '101')).toMatchObject({ inss: 21, fgts: 8 });
        expect(aliquotasEncargos(ENQ, '103').fgts).toBe(2);
        const p = calcularProvisao(entrada({ enquadramentos: [] }));
        expect(p.linhas[0].ferias.atual.inss).toBe(0);
        expect(p.avisos[0]).toMatch(/sem o INSS patronal/);
    });
    it('ficha com erro fica de fora com o motivo; lançamento contábil pelos totais', () => {
        const p = calcularProvisao(entrada({ fichas: [ficha('ana'), ficha('sem', { salario: '' })] }));
        expect(p.linhas.find(l => l.fichaId === 'sem')?.erro).toBe('Ficha sem salário fixo.');
        expect(p.avisos.join(' ')).toMatch(/1 funcionário\(s\) fora da provisão .*SEM \(Ficha sem salário fixo\.\)/);
        const lanc = lancamentosDoMes(p);
        expect(lanc[0]).toEqual({ conta: 'Provisão de férias e 1/3', constituicao: 33334, baixa: 0, saldo: 666667 });
        expect(lanc[3]).toEqual({ conta: 'Provisão de 13º salário', constituicao: 25000, baixa: 0, saldo: 250000 });
        expect(totalSaldo(p.totais.ferias.atual)).toBe(666667 + 185333 + 53333);
    });
});

describe('relatórios da provisão (Central)', () => {
    const ctx = (x: Partial<ContextoRelatorio> = {}): ContextoRelatorio => ({ competencia: '2026-10', hoje: '2026-10-31', fichas: [ficha('ana')], afastamentos: [], folha: null,
        calculo: { empresaId: 'E1', tabelas: TAB, movimentos: {}, enquadramentos: [ENQ] }, ...x });
    it('férias e 13º em tabela, com totais e o lançamento do mês', () => {
        const fer = RELATORIOS.find(r => r.id === 'provisao-ferias')!;
        expect(fer).toMatchObject({ precisaCalculo: true, precisaFolha: false });
        const t = fer.montar!(ctx());
        expect(t.linhas).toEqual([['ANA', '3.000,00', '30 d · 8/12', '6.333,33', '333,34', '0,00', '6.666,67', '1.853,33', '533,33', '9.053,33']]);
        expect(t.totais?.[0]).toBe('Total (1)');
        expect(t.observacao).toMatch(/Lançamento do mês — férias e 1\/3: constituição 333,34, baixa 0,00; INSS 92,66 \(baixa 0,00\); FGTS 26,66/);
        const dec = RELATORIOS.find(r => r.id === 'provisao-13')!.montar!(ctx({ competencia: '2026-12' }));
        expect(dec.linhas[0].slice(2, 7)).toEqual(['12/12', '2.750,00', '250,00', '3.000,00', '0,00']);
    });
    it('sem os dados do cálculo ainda: tabela vazia avisando', () => {
        expect(RELATORIOS.find(r => r.id === 'provisao-13')!.montar!(ctx({ calculo: undefined })).observacao).toMatch(/Carregando/);
    });
});
