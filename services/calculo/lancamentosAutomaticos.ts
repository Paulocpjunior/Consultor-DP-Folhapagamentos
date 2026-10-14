// services/calculo/lancamentosAutomaticos.ts
//
// Lançamento automático do funcionário (aba "Lanç. Automático" da ficha no IOB Office; tabela `lancauto` do backup:
// codeven, ref, valor e os meses marcados). O evento do IOB com a referência entra no movimento do mês pelo mesmo
// "Lançar evento" do Cálculo (rotina do cadastro ou fórmula da empresa), nos meses marcados e dentro do período.
// Cada lançamento entra uma vez por mês: a chave fica em `movimento.automaticos`, e aplicar de novo não duplica.
// Como a tela do SAGE (Eventos Automáticos), cada um tem Referência, Sal e Valor (Paulo, 14/10/2026):
// - Valor preenchido: entra o valor, como está (a referência fica só de registro);
// - Sal preenchido: é o salário-base dos eventos que calculam a referência sobre o salário (% do salário, horas, dias),
//   no lugar do salário da ficha;
// - nenhum dos dois: a rotina do evento com a referência e o salário da ficha, como antes.
// As incidências e, para evento fora do catálogo, o tipo vêm da rubrica S-1010 da empresa ligada ao evento.
// "Lança na Rescisão" (Proporcional ou Integral): no mês do desligamento só entram os marcados, o proporcional pelos dias
// trabalhados no mês ÷ 30. "Cópia para ano seguinte" = Não: vale só no ano do "A partir de".
// Puro, sem Firebase.

import type { EventoIobSage } from '../folha/folhaTypes';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { FormulaEvento } from './formulaEvento';
import type { Movimento } from './motorMensal';
import { eventoPorCodigo, lancarEvento, lancarPorValor, lerReferencia, tipoDaReferencia, type SalarioDoMes } from './lancarEvento';
import { centavosDeTexto, reais } from '../cadastros/documentos';
import { incidenciasDaRubrica, type Rubrica } from '../cadastros/rubricas';

export interface LancamentoAutomatico {
    /** Código do evento no IOB. */
    codigoEvento: string;
    /** Descrição do evento (a do catálogo, ou a digitada quando o evento não está nele). */
    descricao?: string;
    /** Referência como no "Lançar evento": horas (8,5 ou 8:30), dias, % ou valor em R$ (150,00); vazia se a fórmula não usa. */
    referencia: string;
    /** "Sal" do SAGE: salário-base (R$, "3138,45") dos eventos que calculam a referência sobre o salário; vazio = o da ficha. */
    salario?: string;
    /** "Valor" do SAGE: valor fixo (R$, "626,50") que entra como está; vazio = calculado pela rotina com a referência. */
    valor?: string;
    /** "Lança na Rescisão" do SAGE: no mês do desligamento entra proporcional aos dias trabalhados ou integral; vazio = não entra. */
    naRescisao?: 'proporcional' | 'integral';
    /** "Cópia para ano seguinte" do SAGE: false = vale só no ano do "A partir de"; vazio ou true = segue nos anos seguintes. */
    copiaAnoSeguinte?: boolean;
    /** Meses do ano em que entra (1 a 12); vazio = todo mês. */
    meses: number[];
    /** Primeira e última competência (AAAA-MM); vazias = sem limite. */
    desde: string;
    ate: string;
    observacao?: string;
}

export const automaticoVazio = (): LancamentoAutomatico => ({ codigoEvento: '', descricao: '', referencia: '', salario: '', valor: '', meses: [], desde: '', ate: '', observacao: '' });
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
        if ((a.descricao ?? '').length > 60) erros.push(`${q}: descrição longa demais.`);
        if (a.salario?.trim() && !((centavosDeTexto(a.salario) ?? 0) > 0)) erros.push(`${q}: "Sal" (salário-base) em R$, ex.: 3138,45.`);
        if (a.valor?.trim() && !((centavosDeTexto(a.valor) ?? 0) > 0)) erros.push(`${q}: "Valor" em R$, ex.: 626,50.`);
        if (a.meses.some(m => !Number.isInteger(m) || m < 1 || m > 12)) erros.push(`${q}: meses de 1 a 12.`);
        if (a.desde && !comp.test(a.desde)) erros.push(`${q}: "a partir de" no formato AAAA-MM.`);
        if (a.ate && !comp.test(a.ate)) erros.push(`${q}: "até" no formato AAAA-MM.`);
        if (a.desde && a.ate && comp.test(a.desde) && comp.test(a.ate) && a.ate < a.desde) erros.push(`${q}: "até" antes de "a partir de".`);
        if (a.copiaAnoSeguinte === false && !comp.test(a.desde)) erros.push(`${q}: sem cópia para o ano seguinte, informe "a partir de" (o ano em que vale).`);
        if (a.naRescisao && a.naRescisao !== 'proporcional' && a.naRescisao !== 'integral') erros.push(`${q}: "Lança na rescisão" proporcional ou integral.`);
        const k = chaveAutomatico(a);
        if (chaves.has(k)) erros.push(`${q}: o mesmo evento com a mesma referência já está na lista.`);
        chaves.add(k);
    });
    return erros;
}

/** Os lançamentos que valem na competência: dentro do período e no mês marcado (sem meses marcados, todo mês). */
export function automaticosDoMes(l: LancamentoAutomatico[] | undefined, competencia: string): LancamentoAutomatico[] {
    const mes = Number(competencia.slice(5, 7));
    return (l ?? []).filter(a => (!a.desde || a.desde <= competencia) && (!a.ate || competencia <= a.ate) && (!a.meses.length || a.meses.includes(mes))
        // Sem cópia para o ano seguinte: só no ano do "a partir de".
        && !(a.copiaAnoSeguinte === false && a.desde && competencia.slice(0, 4) > a.desde.slice(0, 4)));
}

/** Dias trabalhados no mês do desligamento (até 30), contando da admissão se ela for no mesmo mês. */
export function diasTrabalhadosNoMes(admissao: string, desligamento: string): number {
    const dia = Math.min(30, Number(desligamento.slice(8, 10)) || 30);
    const desde = admissao.slice(0, 7) === desligamento.slice(0, 7) ? Number(admissao.slice(8, 10)) || 1 : 1;
    return Math.max(0, dia - desde + 1);
}

/** Texto dos meses para a tela: "todo mês" ou "jan, jul, dez". */
export const textoMeses = (meses: number[]) => (meses.length ? [...meses].sort((a, b) => a - b).map(m => MESES_CURTOS[m - 1]).join(', ') : 'todo mês');

export interface ResultadoAutomaticos {
    movimentos: Record<string, Movimento>;
    aplicados: number;
    /** No mês do desligamento, os sem "Lança na rescisão" (não entram). */
    foraDaRescisao: number;
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
    /** Rubricas S-1010 da empresa: incidências e, fora do catálogo, o tipo do evento. */
    rubricas?: Rubrica[];
    /** Desligamentos na competência (ficha → data), além do da ficha: as rescisões simuladas. */
    desligamentos?: Record<string, string>;
}): ResultadoAutomaticos {
    const movimentos = { ...p.movimentos };
    const r: ResultadoAutomaticos = { movimentos, aplicados: 0, foraDaRescisao: 0, funcionarios: 0, jaAplicados: 0, erros: [] };
    for (const f of p.fichas) {
        // Mês do desligamento: só os marcados para a rescisão, o proporcional pelos dias trabalhados no mês ÷ 30.
        const deslig = p.desligamentos?.[f.id] ?? (f.dados.dataDesligamento?.startsWith(p.competencia) ? f.dados.dataDesligamento : '');
        const desligadoNoMes = !!deslig && deslig.startsWith(p.competencia);
        const todosDoMes = automaticosDoMes(f.lancamentosAutomaticos, p.competencia);
        const doMes = desligadoNoMes ? todosDoMes.filter(a => a.naRescisao) : todosDoMes;
        if (desligadoNoMes) r.foraDaRescisao += todosDoMes.length - doMes.length;
        if (!doMes.length) continue;
        const diasNoMes = desligadoNoMes ? diasTrabalhadosNoMes(f.dados.admissao ?? '', deslig) : 30;
        const nome = f.dados.nome || f.cpf;
        let mov: Movimento = movimentos[f.id] ?? {};
        let mudou = false;
        for (const a of doMes) {
            const chave = chaveAutomatico(a);
            if (mov.automaticos?.includes(chave)) { r.jaAplicados++; continue; }
            const inc = p.rubricas ? incidenciasDaRubrica(p.rubricas, a.codigoEvento, p.competencia) : null;
            const valorFixo = a.valor?.trim() ? centavosDeTexto(a.valor) : null;
            let ev = eventoPorCodigo(p.eventos, a.codigoEvento);
            // Fora do catálogo (o evento é da tabela da empresa no IOB): só por valor, com o tipo da rubrica S-1010.
            if (!ev && valorFixo && inc?.tipo) {
                ev = { codigo: a.codigoEvento.replace(/\D/g, '').padStart(4, '0'), descricao: a.descricao?.trim() || inc.descricao, tipo: inc.tipo === 'provento' ? 'V' : 'D',
                    incidencias: { ir: 'N', in: 'N', irf: 'N', inf: 'N', fg: 'N', rt: 'N', vr: 'N' }, rv: 'V', coeficiente: 0, ro: '060' };
            }
            if (!ev) { r.erros.push(`${nome}: evento ${a.codigoEvento} não está no catálogo do IOB (Cadastros › Eventos IOB)${valorFixo ? ' nem tem rubrica S-1010 ligada na empresa' : ''}.`); continue; }
            const proporcional = desligadoNoMes && a.naRescisao === 'proporcional' && diasNoMes < 30;
            const textoProp = proporcional ? `; rescisão: proporcional a ${diasNoMes}/30 dias` : desligadoNoMes ? '; rescisão: integral' : '';
            let res;
            if (valorFixo) res = lancarPorValor(ev, proporcional ? Math.round(valorFixo * diasNoMes / 30) : valorFixo, mov,
                `valor fixo do lançamento automático${a.referencia.trim() ? `, referência ${a.referencia.trim()}` : ''}${proporcional ? ` (${reais(valorFixo)} × ${diasNoMes}/30)` : ''}${textoProp}`, inc, a.descricao);
            else {
                const formula = p.formulas?.[ev.codigo];
                const tipo = formula ? formula.referencia : tipoDaReferencia(ev);
                const ref = tipo === 'nenhuma' ? 0 : lerReferencia(a.referencia, tipo);
                if (ref === null) { r.erros.push(`${nome}: evento ${ev.codigo}: referência "${a.referencia}" inválida.`); continue; }
                // "Sal": o salário-base informado no lugar do da ficha (mesmas horas do mês).
                const daFicha = p.salarioDe(f);
                const salBase = a.salario?.trim() ? centavosDeTexto(a.salario) : null;
                const sal = salBase ? { mensal: salBase, horasMes: daFicha?.horasMes ?? 220 } : daFicha;
                res = lancarEvento(ev, ref, sal, mov, formula, inc);
                if (!('erro' in res) && salBase) res = { ...res, mensagem: `${res.mensagem} Salário-base do lançamento automático: ${reais(salBase)}.` };
                // Proporcional na rescisão: o lançamento avulso do evento pelos dias trabalhados (campos do movimento, como
                // horas extras, já são do mês).
                if (!('erro' in res) && proporcional) {
                    const lancs = res.movimento.lancamentos ?? [];
                    const i = lancs.findIndex(x => x.descricao.startsWith(`${ev!.codigo} `));
                    if (i >= 0) res = { ...res, movimento: { ...res.movimento, lancamentos: lancs.map((x, j) => (j === i ? { ...x, valor: Math.round(x.valor * diasNoMes / 30) } : x)) }, mensagem: `${res.mensagem}${textoProp}.` };
                }
            }
            if ('erro' in res) { r.erros.push(`${nome}: ${res.erro}`); continue; }
            mov = { ...res.movimento, automaticos: [...(mov.automaticos ?? []), chave] };
            mudou = true; r.aplicados++;
        }
        if (mudou) { movimentos[f.id] = mov; r.funcionarios++; }
    }
    return r;
}
