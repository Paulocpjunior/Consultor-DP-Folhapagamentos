// Conferência motor × histórico do backup do SAGE (dados fictícios).
import { describe, expect, it } from 'vitest';
import { conferirMotorComHistoricoSage, finalidadesDoHistorico } from '../conferenciaMotorSage';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';
import type { HistoricoSageAno, TotaisMesSage } from '../../relatorios/historicoSage';

const ficha = (id: string, cpf: string, nome: string) => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id, cpf, situacao: 'ativo' as const, dados: { nome } });
const FICHAS = [ficha('f1', '52998224725', 'ANA'), ficha('f2', '11144477735', 'BRUNO')];
const motor = (fichaId: string, sal: number, inss: number, situacao = 'calculado'): ResultadoCalculo => ({
    fichaId, nome: fichaId === 'f1' ? 'ANA' : 'BRUNO', competencia: '', pagamento: '', situacao,
    verbas: [{ codigo: 'SAL', valor: sal, tipo: 'provento' }, { codigo: 'INSS', valor: inss, tipo: 'desconto' }],
    bases: { inss: sal, fgts: sal, irrf: sal }, totais: { proventos: sal, descontos: inss, liquido: sal - inss }, fgts: 0, memoria: [], avisos: [], erros: situacao === 'calculado' ? [] : ['sem salário'],
} as unknown as ResultadoCalculo);
const tot = (sal: number, inss: number): TotaisMesSage => ({ proventos: sal, descontos: inss, porNatureza: { 1000: sal, 9201: inss } });
const ano = (fichaId: string, folha: (TotaisMesSage | null)[], extra: Record<string, (TotaisMesSage | null)[]> = {}, comNaturezas = true): HistoricoSageAno => ({
    empresaId: 'E1', fichaId, ano: '2026', nome: fichaId, linhas: [], comNaturezas,
    porFinalidade: { 1: [...folha, ...Array(12 - folha.length).fill(null)], ...extra },
});

describe('conferência motor × histórico do backup do SAGE', () => {
    const historicos = [
        ano('f1', [null, null, tot(300000, 25341), tot(300000, 25341), tot(300000, 25341), tot(300000, 25341)], { 3: [null, null, null, null, null, tot(150000, 0)] }),
        ano('f2', [null, null, tot(200000, 16000), tot(200000, 16000), tot(200000, 16000), tot(200000, 16000)]),
    ];
    const motorDe = (c: string) => [motor('f1', 300000, 25341), motor('f2', 200000, c === '2026-04' ? 16001 : 16000)];

    it('só a finalidade escolhida: 3 meses seguidos sem diferença atingem o critério', () => {
        const r = conferirMotorComHistoricoSage({ historicos, finalidade: '1', fichas: FICHAS, motor: motorDe });
        expect(r.competencias.map(c => [c.competencia, c.zerada])).toEqual([['2026-03', true], ['2026-04', false], ['2026-05', true], ['2026-06', true]]);
        const bruno = r.competencias[1].linhas.find(l => l.nome === 'BRUNO')!;
        expect(bruno.itens.filter(i => !i.ok).map(i => [i.item, i.diferenca])).toEqual([['Descontos', 1], ['Líquido', -1], ['INSS', 1]]);
        expect(r.sequencia).toEqual({ inicio: '2026-05', fim: '2026-06', meses: 2 });
        expect(r.criterioAtingido).toBe(false);
        const ok = conferirMotorComHistoricoSage({ historicos, finalidade: '1', fichas: FICHAS, motor: () => [motor('f1', 300000, 25341), motor('f2', 200000, 16000)] });
        expect([ok.criterioAtingido, ok.sequencia.meses]).toEqual([true, 4]);
    });

    it('sem holerith no backup, cálculo com erro e ficha fora do cadastro ficam pendentes', () => {
        const r = conferirMotorComHistoricoSage({ historicos: [historicos[0], ano('fx', [null, null, tot(1, 0)])], finalidade: '1', fichas: FICHAS,
            motor: c => [motor('f1', 300000, 25341, c === '2026-04' ? 'erro' : 'calculado'), motor('f2', 200000, 16000)] });
        const mar = r.competencias[0];
        expect(mar.linhas.map(l => [l.nome, l.situacao]).sort()).toEqual([['ANA', 'confere'], ['BRUNO', 'sem-historico'], ['fx', 'sem-ficha']]);
        expect(mar.zerada).toBe(false);
        expect(r.competencias[1].linhas.find(l => l.fichaId === 'f1')!.situacao).toBe('motor-incompleto');
    });

    it('sem a natureza das rubricas compara só proventos, descontos e líquido; histórico antigo avisa', () => {
        const r = conferirMotorComHistoricoSage({ historicos: [ano('f1', [null, null, tot(300000, 25341)], {}, false), { empresaId: 'E1', fichaId: 'f2', ano: '2026', nome: 'BRUNO', linhas: [] }],
            finalidade: '1', fichas: FICHAS, motor: () => [motor('f1', 300000, 25341)] });
        expect(r.competencias[0].linhas[0].itens.map(i => i.item)).toEqual(['Proventos', 'Descontos', 'Líquido']);
        expect(r.avisos.join(' ')).toMatch(/1 histórico\(s\) do backup gravado\(s\) sem os totais/);
        expect(r.avisos.join(' ')).toMatch(/sem a natureza das rubricas/);
    });

    it('finalidades da que tem mais meses para a que tem menos', () => {
        expect(finalidadesDoHistorico(historicos)).toEqual([{ finalidade: '1', meses: 8 }, { finalidade: '3', meses: 1 }]);
    });

    it('mês com lançamento sem natureza não compara salário, INSS e IRRF', () => {
        const r = conferirMotorComHistoricoSage({ historicos: [ano('f1', [null, null, { ...tot(300000, 25341), porNatureza: { 1000: 300000 }, semNatureza: 1 }])],
            finalidade: '1', fichas: FICHAS, motor: () => [motor('f1', 300000, 25341)] });
        const l = r.competencias[0].linhas[0];
        expect([l.situacao, l.itens.map(i => i.item)]).toEqual(['confere', ['Proventos', 'Descontos', 'Líquido']]);
        expect(l.observacoes.join(' ')).toMatch(/1 lançamento\(s\) do mês sem a natureza/);
    });
});

