// services/calculo/tributos.ts
//
// INSS progressivo e IRRF com a memória de cálculo, para os cálculos que
// apuram em separado (rescisão; o mensal, o 13º e as férias têm a conta
// dentro de cada motor, com as mesmas regras).

import { reais } from '../cadastros/documentos';
import { deducoesInss, rotuloCompetencia, type TabelaLegal } from '../cadastros/tabelasLegais';

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
/** Retenção de IRRF até R$ 10,00 é dispensada (Lei 9.430/1996, art. 67). */
export const IRRF_MINIMO = 1000;

/**
 * Faixa do INSS em que a base cai: a alíquota que o holerite mostra na referência (como o IOB: 12,00 entre
 * R$ 2.902,85 e R$ 4.354,27 em 2026) e a parcela a deduzir dela. A alíquota efetiva (INSS ÷ base, ex.: 8,45%) não está
 * na tabela e confundia a conferência (Paulo, 14/10/2026).
 */
export function faixaInss(base: number, t: TabelaLegal): { aliquota: number; deducao: number; referencia: string; formula: string } | null {
    const teto = t.faixas[t.faixas.length - 1]?.ate ?? base;
    const b = Math.min(base, teto);
    if (!(b > 0)) return null;
    const i = t.faixas.findIndex(f => f.ate === null || b <= f.ate);
    const k = i < 0 ? t.faixas.length - 1 : i;
    const f = t.faixas[k];
    if (!f) return null;
    const deducao = deducoesInss(t)[k] ?? 0;
    return { aliquota: f.aliquota, deducao, referencia: pct(f.aliquota), formula: `${reais(b)} × ${pct(f.aliquota)} − ${reais(deducao)} (parcela a deduzir)` };
}

/** INSS do segurado pela tabela progressiva, limitado ao teto. */
export function inssDetalhado(base: number, t: TabelaLegal): { valor: number; memoria: string } {
    const teto = t.faixas[t.faixas.length - 1]?.ate ?? base;
    const b = Math.min(base, teto);
    let piso = 0; let total = 0; const partes: string[] = [];
    for (const f of t.faixas) {
        if (f.ate === null) break;
        const parte = Math.min(b, f.ate) - piso;
        if (parte <= 0) break;
        total += parte * f.aliquota / 100; partes.push(`${reais(parte)} × ${pct(f.aliquota)}`); piso = f.ate;
    }
    const valor = Math.round(total);
    const fx = faixaInss(base, t);
    return { valor, memoria: `base ${reais(base)}${b < base ? `, limitada ao teto ${reais(b)}` : ''}: ${partes.join(' + ') || 'sem base'} = ${reais(valor)}${fx ? `; pela faixa de ${fx.referencia}: ${fx.formula} = ${reais(valor)}` : ''}` };
}

export interface OpcoesIrrf { simplificado: boolean; redutor: boolean }

/** IRRF sobre um rendimento, com INSS, dependentes e pensão; simplificado e redutor conforme as opções. */
export function irrfDetalhado(p: { rendimento: number; inss: number; dependentes: number; pensao?: number; tabela: TabelaLegal; opcoes: OpcoesIrrf; rotulo: string }): { valor: number; aliquota: number; memoria: string[]; simplificado: boolean } {
    const t = p.tabela; const v = t.valores;
    const memoria: string[] = [];
    const legais = p.inss + p.dependentes * (v.deducaoDependente ?? 0) + (p.pensao ?? 0);
    const simpl = p.opcoes.simplificado ? v.descontoSimplificado ?? 0 : 0;
    const usaSimpl = simpl > legais;
    const base = Math.max(0, p.rendimento - (usaSimpl ? simpl : legais));
    const faixa = t.faixas.find(f => f.ate === null || base <= f.ate) ?? t.faixas[t.faixas.length - 1];
    let ir = Math.max(0, Math.round(base * faixa.aliquota / 100) - faixa.deducao);
    memoria.push(`${p.rotulo} (tabela de ${rotuloCompetencia(t.vigencia)}): ${reais(p.rendimento)} − ${usaSimpl ? `desconto simplificado ${reais(simpl)}` : `deduções ${reais(legais)}`} = base ${reais(base)} × ${pct(faixa.aliquota)} − ${reais(faixa.deducao)} = ${reais(ir)}.`);
    if (p.opcoes.redutor && ir > 0 && v.redutorAte && v.redutorMaximo && v.redutorLimite && v.redutorConstante && v.redutorCoeficiente) {
        let red = 0;
        if (p.rendimento <= v.redutorAte) red = Math.min(ir, v.redutorMaximo);
        else if (p.rendimento <= v.redutorLimite) red = Math.min(ir, Math.max(0, v.redutorConstante - Math.round(p.rendimento * v.redutorCoeficiente / 1_000_000)));
        if (red) { ir -= red; memoria.push(`Redutor sobre ${reais(p.rendimento)}: −${reais(red)}. IRRF ${reais(ir)}.`); }
    }
    if (ir > 0 && ir <= IRRF_MINIMO) { memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada.`); ir = 0; }
    return { valor: ir, aliquota: faixa.aliquota, memoria, simplificado: usaSimpl };
}
