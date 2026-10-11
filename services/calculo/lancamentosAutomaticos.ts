// services/calculo/lancamentosAutomaticos.ts
//
// Lançamento automático do funcionário (aba "Lanç. Automático" da ficha no IOB Office; tabela `lancauto` do backup:
// codeven, ref, valor e os meses marcados). O evento do IOB com a referência entra no movimento do mês pelo mesmo
// "Lançar evento" do Cálculo (rotina do cadastro ou fórmula da empresa), nos meses marcados e dentro do período.
// Cada lançamento entra uma vez por mês: a chave fica em `movimento.automaticos`, e aplicar de novo não duplica.
// Puro, sem Firebase.

import type { EventoIobSage } from '../folha/folhaTypes';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { FormulaEvento } from './formulaEvento';
import type { Movimento } from './motorMensal';
import { eventoPorCodigo, lancarEvento, lerReferencia, tipoDaReferencia, type SalarioDoMes } from './lancarEvento';

export interface LancamentoAutomatico {
    /** Código do evento no IOB. */
    codigoEvento: string;
    /** Referência como no "Lançar evento": horas (8,5 ou 8:30), dias, % ou valor em R$ (150,00); vazia se a fórmula não usa. */
    referencia: string;
    /** Meses do ano em que entra (1 a 12); vazio = todo mês. */
    meses: number[];
    /** Primeira e última competência (AAAA-MM); vazias = sem limite. */
    desde: string;
    ate: string;
    observacao?: string;
}

export const automaticoVazio = (): LancamentoAutomatico => ({ codigoEvento: '', referencia: '', meses: [], desde: '', ate: '', observacao: '' });
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const comp = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Chave do lançamento no movimento do mês (o que já entrou não entra de novo). */
export const chaveAutomatico = (a: Pick<LancamentoAutomatico, 'codigoEvento' | 'referencia'>) => `${a.codigoEvento.trim().replace(/^0+(?=.)/, '')}|${a.referencia.trim()}`.slice(0, 60);

export function validarAutomaticos(l: LancamentoAutomatico[]): string[] {
    const erros: string[] = [];
    const chaves = new Set<string>();
    l.forEach((a, i) => {
        const q = `Lançamento automático ${i + 1}`;
        if (!/^\d{1,5}$/.test(a.codigoEvento.trim())) erros.push(`${q}: código do evento do IOB (até 5 dígitos).`);
        if (a.referencia.length > 20) erros.push(`${q}: referência longa demais.`);
        if (a.meses.some(m => !Number.isInteger(m) || m < 1 || m > 12)) erros.push(`${q}: meses de 1 a 12.`);
        if (a.desde && !comp.test(a.desde)) erros.push(`${q}: "a partir de" no formato AAAA-MM.`);
        if (a.ate && !comp.test(a.ate)) erros.push(`${q}: "até" no formato AAAA-MM.`);
        if (a.desde && a.ate && comp.test(a.desde) && comp.test(a.ate) && a.ate < a.desde) erros.push(`${q}: "até" antes de "a partir de".`);
        const k = chaveAutomatico(a);
        if (chaves.has(k)) erros.push(`${q}: o mesmo evento com a mesma referência já está na lista.`);
        chaves.add(k);
    });
    return erros;
}

/** Os lançamentos que valem na competência: dentro do período e no mês marcado (sem meses marcados, todo mês). */
export function automaticosDoMes(l: LancamentoAutomatico[] | undefined, competencia: string): LancamentoAutomatico[] {
    const mes = Number(competencia.slice(5, 7));
    return (l ?? []).filter(a => (!a.desde || a.desde <= competencia) && (!a.ate || competencia <= a.ate) && (!a.meses.length || a.meses.includes(mes)));
}

/** Texto dos meses para a tela: "todo mês" ou "jan, jul, dez". */
export const textoMeses = (meses: number[]) => (meses.length ? [...meses].sort((a, b) => a - b).map(m => MESES_CURTOS[m - 1]).join(', ') : 'todo mês');

export interface ResultadoAutomaticos {
    movimentos: Record<string, Movimento>;
    aplicados: number;
    funcionarios: number;
    jaAplicados: number;
    erros: string[];
}

/**
 * Põe no movimento do mês os lançamentos automáticos das fichas: o mesmo cálculo do "Lançar evento" (rotina do evento
 * ou fórmula da empresa). O que já entrou neste mês (chave em `automaticos`) não entra de novo.
 */
export function aplicarAutomaticos(p: {
    fichas: FichaFuncionario[]; movimentos: Record<string, Movimento>; competencia: string; eventos: EventoIobSage[];
    formulas?: Record<string, FormulaEvento>; salarioDe: (f: FichaFuncionario) => SalarioDoMes | null;
}): ResultadoAutomaticos {
    const movimentos = { ...p.movimentos };
    const r: ResultadoAutomaticos = { movimentos, aplicados: 0, funcionarios: 0, jaAplicados: 0, erros: [] };
    for (const f of p.fichas) {
        const doMes = automaticosDoMes(f.lancamentosAutomaticos, p.competencia);
        if (!doMes.length) continue;
        const nome = f.dados.nome || f.cpf;
        let mov: Movimento = movimentos[f.id] ?? {};
        let mudou = false;
        for (const a of doMes) {
            const chave = chaveAutomatico(a);
            if (mov.automaticos?.includes(chave)) { r.jaAplicados++; continue; }
            const ev = eventoPorCodigo(p.eventos, a.codigoEvento);
            if (!ev) { r.erros.push(`${nome}: evento ${a.codigoEvento} não está no catálogo do IOB (Cadastros › Eventos IOB).`); continue; }
            const formula = p.formulas?.[ev.codigo];
            const tipo = formula ? formula.referencia : tipoDaReferencia(ev);
            const ref = tipo === 'nenhuma' ? 0 : lerReferencia(a.referencia, tipo);
            if (ref === null) { r.erros.push(`${nome}: evento ${ev.codigo}: referência "${a.referencia}" inválida.`); continue; }
            const res = lancarEvento(ev, ref, p.salarioDe(f), mov, formula);
            if ('erro' in res) { r.erros.push(`${nome}: ${res.erro}`); continue; }
            mov = { ...res.movimento, automaticos: [...(mov.automaticos ?? []), chave] };
            mudou = true; r.aplicados++;
        }
        if (mudou) { movimentos[f.id] = mov; r.funcionarios++; }
    }
    return r;
}
