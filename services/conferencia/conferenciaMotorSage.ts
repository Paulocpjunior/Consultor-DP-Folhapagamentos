// services/conferencia/conferenciaMotorSage.ts
//
// Conferência do motor com o histórico de holerites do backup do SAGE (Paulo, 17/10/2026: "O BACKUP JA TEMOS E VC JA
// USOU E PODE USAR NOVAMENTE"). Mesmo critério da conferência com o S-1200 do IOB (conferenciaMotorIob): diferença
// zero por 3 competências seguidas, agora sem esperar os XMLs do eSocial.
//
// Fonte: historico_sage/{fichaId}_{AAAA}, gravado na restauração do backup, com os totais de cada mês por finalidade
// do holerith (folha, adiantamento, férias, 13º… do SAGE; services/relatorios/historicoSage). Compara uma finalidade
// por vez, a da folha mensal. O histórico é por ficha (vínculo), então a comparação também é: sem somar contratos.
// Salário, INSS, IRRF, salário-família e licenças só quando o backup trouxe a natureza das rubricas.
//
// Valores em CENTAVOS. Nada é gravado aqui.

import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { HistoricoSageAno } from '../relatorios/historicoSage';
import {
    NATUREZA, resumirCompetencia, sequenciaSemDiferenca, v,
    type ItemComparado, type LinhaFuncionario, type LinhaItem, type ResultadoConferenciaIob, type ResumoCompetencia,
} from './conferenciaMotorIob';

export interface EntradaConferenciaSage {
    /** Histórico do backup de um ou mais anos (lerHistoricoSageDoAno). */
    historicos: HistoricoSageAno[];
    /** Finalidade do holerith comparada (a da folha mensal). */
    finalidade: string;
    fichas: FichaFuncionario[];
    motor: (competencia: string) => ResultadoCalculo[];
    comFerias?: (competencia: string) => Set<string>;
    /** Tolerância por item, em centavos (padrão 0: diferença zero). */
    tolerancia?: number;
}

/** Finalidades do histórico, da que tem mais meses lançados para a que tem menos (a primeira é, em geral, a folha). */
export function finalidadesDoHistorico(historicos: HistoricoSageAno[]): { finalidade: string; meses: number }[] {
    const n = new Map<string, number>();
    for (const h of historicos) for (const [fin, meses] of Object.entries(h.porFinalidade ?? {})) {
        n.set(fin, (n.get(fin) ?? 0) + meses.filter(x => x !== null).length);
    }
    return [...n.entries()].map(([finalidade, meses]) => ({ finalidade, meses }))
        .sort((a, b) => b.meses - a.meses || a.finalidade.localeCompare(b.finalidade, 'pt-BR', { numeric: true }));
}

/** Históricos gravados antes dos totais por finalidade (restauração anterior a 17/10/2026). */
export const historicosSemTotais = (historicos: HistoricoSageAno[]) => historicos.filter(h => !h.porFinalidade).length;

export function conferirMotorComHistoricoSage(e: EntradaConferenciaSage): ResultadoConferenciaIob {
    const tol = e.tolerancia ?? 0;
    const avisos: string[] = [];
    const semTotais = historicosSemTotais(e.historicos);
    if (semTotais) avisos.push(`${semTotais} histórico(s) do backup gravado(s) sem os totais por finalidade: restaure a empresa de novo pela tela "Restaurar backup do IOB SAGE" para conferir esses funcionários.`);
    const fichaPorId = new Map(e.fichas.map(f => [f.id, f]));
    // competência → fichaId → histórico do ano
    const porCompetencia = new Map<string, Map<string, HistoricoSageAno>>();
    for (const h of e.historicos) {
        (h.porFinalidade?.[e.finalidade] ?? []).forEach((t, m) => {
            if (!t) return;
            const c = `${h.ano}-${String(m + 1).padStart(2, '0')}`;
            const doMes = porCompetencia.get(c) ?? new Map<string, HistoricoSageAno>();
            doMes.set(h.fichaId, h); porCompetencia.set(c, doMes);
        });
    }
    if (!porCompetencia.size && e.historicos.length && !semTotais) avisos.push(`Nenhum lançamento da finalidade "${e.finalidade}" no histórico do backup.`);
    const resumo: ResumoCompetencia[] = [];
    let semNatureza = false;

    for (const c of [...porCompetencia.keys()].sort()) {
        const m0 = Number(c.slice(5, 7)) - 1;
        const doMes = porCompetencia.get(c)!;
        const motor = e.motor(c);
        const motorPorFicha = new Map(motor.map(r => [r.fichaId, r]));
        const ferias = e.comFerias?.(c) ?? new Set<string>();
        const linhas: LinhaFuncionario[] = [];
        for (const [fichaId, h] of doMes) {
            const ficha = fichaPorId.get(fichaId);
            const observacoes: string[] = [];
            const base = { competencia: c, cpf: ficha?.cpf ?? '', nome: ficha?.dados.nome || h.nome, fichaId, rubricas: [], observacoes };
            if (!ficha) { linhas.push({ ...base, situacao: 'sem-ficha', itens: [], observacoes: ['O histórico do backup é de uma ficha que não está no cadastro.'] }); continue; }
            const r = motorPorFicha.get(fichaId);
            if (!r || r.situacao !== 'calculado') {
                if (!r) observacoes.push('A ficha não tem cálculo nesta competência (fora do período do vínculo).');
                else observacoes.push(...r.erros, ...r.avisos);
                linhas.push({ ...base, situacao: 'motor-incompleto', itens: [] }); continue;
            }
            const t = h.porFinalidade![e.finalidade][m0]!;
            const itens: LinhaItem[] = [];
            const comparar = (item: ItemComparado, motorV: number, sageV: number) => {
                const diferenca = motorV - sageV;
                itens.push({ item, motor: motorV, iob: sageV, diferenca, ok: Math.abs(diferenca) <= tol });
            };
            comparar('Proventos', r.totais.proventos, t.proventos);
            comparar('Descontos', r.totais.descontos, t.descontos);
            comparar('Líquido', r.totais.liquido, t.proventos - t.descontos);
            // Naturezas só quando todo provento e desconto do mês tem a natureza (S-1010 na vigência).
            if (h.comNaturezas && !t.semNatureza) {
                const nat = (n: string) => t.porNatureza[n] ?? 0;
                comparar('Salário', v(r, 'SAL'), nat(NATUREZA.salario));
                comparar('INSS', v(r, 'INSS', 'INSSFERRET'), nat(NATUREZA.inss));
                comparar('IRRF', v(r, 'IRRF', 'IRRFFERRET'), nat(NATUREZA.irrf));
                comparar('Salário-família', v(r, 'SF'), nat(NATUREZA.salarioFamilia));
                const licenca = (item: ItemComparado, motorV: number, sageV: number) => { if (motorV || sageV) comparar(item, motorV, sageV); };
                licenca('Salário-maternidade', v(r, 'MAT'), nat(NATUREZA.salarioMaternidade));
                licenca('Salário-paternidade', v(r, 'PAT'), nat(NATUREZA.salarioPaternidade));
            } else {
                semNatureza = true;
                observacoes.push(h.comNaturezas
                    ? `${t.semNatureza} lançamento(s) do mês sem a natureza (evento sem S-1010 na vigência): salário, INSS e IRRF não foram comparados um a um.`
                    : 'O backup não trouxe a natureza das rubricas (S-1010 do IOB): provento e desconto vieram da coluna do holerith ou da descrição; salário, INSS e IRRF não foram comparados um a um.');
            }
            if (ferias.has(fichaId)) observacoes.push('Férias no mês: confira se o holerith desta finalidade traz as férias ou se elas estão na finalidade das férias; o motor soma as férias do mês e abate o que o recibo já pagou e reteve.');
            linhas.push({ ...base, nome: r.nome, situacao: itens.every(i => i.ok) ? 'confere' : 'diverge', itens });
        }
        for (const r of motor) {
            if (doMes.has(r.fichaId)) continue;
            const f = fichaPorId.get(r.fichaId);
            const calculou = r.situacao === 'calculado';
            linhas.push({ competencia: c, cpf: f?.cpf ?? '', nome: r.nome, fichaId: r.fichaId, situacao: calculou ? 'sem-historico' : 'motor-incompleto', itens: [], rubricas: [],
                observacoes: [calculou ? `O motor calculou e o backup não tem holerith da finalidade "${e.finalidade}" deste funcionário no mês.` : 'Sem histórico no backup e o cálculo não fechou.', ...(calculou ? [] : [...r.erros, ...r.avisos])] });
        }
        resumo.push(resumirCompetencia(c, linhas));
    }
    if (semNatureza) avisos.push('Parte do histórico veio sem a natureza das rubricas: só proventos, descontos e líquido foram comparados nesses funcionários. Inclua o S-1010 do IOB na restauração para conferir salário, INSS e IRRF.');
    const sequencia = sequenciaSemDiferenca(resumo);
    return { competencias: resumo, sequencia, criterioAtingido: sequencia.meses >= 3, avisos };
}
