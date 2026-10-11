// services/calculo/formulaEvento.ts
//
// Fórmula própria por evento (Arquivos › Eventos › Cadastro do SAGE): a empresa define, para um código de evento do
// IOB, a conta do valor em vez da rotina do cadastro. Ex.: "SALARIO * 0,1" (10% do salário), "REF * SALARIO_HORA *
// 1,6" (hora a 60%), "MIN(REF * 25; 300)" (R$ 25 por unidade, até R$ 300). O "Lançar evento" e a importação de valores
// usam a fórmula quando o evento tem uma; o resultado vai como lançamento avulso com as incidências do evento.
// Avaliador próprio (sem eval): números (vírgula ou ponto decimal), + − × ÷, parênteses, as variáveis abaixo e
// MIN, MAX, ARRED(x; casas). Puro.

import type { TipoReferencia } from './lancarEvento';

export interface FormulaEvento {
    expressao: string;
    /** Como a referência (REF) é digitada no lançamento; "nenhuma": o valor sai só da fórmula. */
    referencia: TipoReferencia | 'nenhuma';
    observacao?: string;
}

export const VARIAVEIS_FORMULA: Record<string, string> = {
    REF: 'a referência digitada (horas, dias, % ou valor em R$)',
    SALARIO: 'salário mensal do mês (R$)',
    SALARIO_HORA: 'salário ÷ horas do mês',
    SALARIO_DIA: 'salário ÷ 30',
    HORAS_MES: 'horas do mês da ficha',
    COEF: 'coeficiente do evento no cadastro do IOB',
};
const FUNCOES = ['MIN', 'MAX', 'ARRED'];

type Token = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenizar(expr: string): Token[] | { erro: string } {
    const out: Token[] = [];
    let i = 0;
    const s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
    while (i < s.length) {
        const c = s[i];
        if (/\s/.test(c)) { i++; continue; }
        if (/\d/.test(c)) {
            let j = i; while (j < s.length && /[\d.,]/.test(s[j])) j++;
            const bruto = s.slice(i, j);
            // Vírgula decimal (padrão brasileiro) ou ponto; sem separador de milhar nas fórmulas.
            if ((bruto.match(/[.,]/g) ?? []).length > 1) return { erro: `Número "${bruto}" inválido: use só uma vírgula decimal (sem ponto de milhar).` };
            out.push({ t: 'num', v: Number(bruto.replace(',', '.')) }); i = j; continue;
        }
        if (/[A-Za-z_]/.test(c)) { let j = i; while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++; out.push({ t: 'id', v: s.slice(i, j).toUpperCase() }); i = j; continue; }
        if ('+-*/();'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
        return { erro: `Caractere "${c}" não permitido na fórmula.` };
    }
    return out;
}

/** Avalia a fórmula com as variáveis (números em reais). Erro de sintaxe, variável desconhecida ou divisão por zero viram mensagem. */
export function avaliarFormula(expr: string, vars: Record<string, number>): { valor: number } | { erro: string } {
    if (!expr.trim()) return { erro: 'Fórmula vazia.' };
    if (expr.length > 300) return { erro: 'Fórmula longa demais (até 300 caracteres).' };
    const tk = tokenizar(expr);
    if ('erro' in tk) return tk;
    let p = 0;
    const olhar = () => tk[p];
    const consumir = (v: string) => { const x = tk[p]; if (x?.t === 'op' && x.v === v) { p++; return true; } return false; };
    const falha = (m: string): never => { throw new Error(m); };
    // expr := termo (('+'|'-') termo)* ; termo := fator (('*'|'/') fator)* ; fator := ('+'|'-') fator | num | var | func '(' args ')' | '(' expr ')'
    const expressao = (): number => { let v = termo(); for (;;) { if (consumir('+')) v += termo(); else if (consumir('-')) v -= termo(); else return v; } };
    const termo = (): number => {
        let v = fator();
        for (;;) {
            if (consumir('*')) v *= fator();
            else if (consumir('/')) { const d = fator(); if (d === 0) falha('Divisão por zero.'); v /= d; }
            else return v;
        }
    };
    const fator = (): number => {
        if (consumir('-')) return -fator();
        if (consumir('+')) return fator();
        const x = olhar();
        if (!x) return falha('A fórmula termina no meio de uma conta.');
        if (x.t === 'num') { p++; return x.v; }
        if (x.t === 'op' && x.v === '(') { p++; const v = expressao(); if (!consumir(')')) falha('Falta fechar um parêntese.'); return v; }
        if (x.t === 'id') {
            p++;
            if (FUNCOES.includes(x.v)) {
                if (!consumir('(')) falha(`${x.v} precisa de parênteses: ${x.v}(a; b).`);
                const args = [expressao()];
                while (consumir(';')) args.push(expressao());
                if (!consumir(')')) falha(`Falta fechar o parêntese de ${x.v}.`);
                if (x.v === 'ARRED') { if (args.length > 2) falha('ARRED(valor; casas).'); const k = 10 ** Math.max(0, Math.min(6, Math.round(args[1] ?? 2))); return Math.round(args[0] * k) / k; }
                if (args.length < 2) falha(`${x.v} precisa de ao menos dois valores separados por ";".`);
                return x.v === 'MIN' ? Math.min(...args) : Math.max(...args);
            }
            if (!(x.v in vars)) falha(`"${x.v}" não é variável da fórmula (use ${Object.keys(VARIAVEIS_FORMULA).join(', ')}).`);
            return vars[x.v];
        }
        return falha(`"${x.v}" fora de lugar.`);
    };
    try {
        const v = expressao();
        if (p < tk.length) return { erro: `Sobrou "${tk[p].t === 'num' ? tk[p].v : tk[p].v}" no fim da fórmula.` };
        if (!Number.isFinite(v)) return { erro: 'A fórmula não dá um número.' };
        return { valor: v };
    } catch (e) { return { erro: (e as Error).message }; }
}

/** Confere a fórmula com valores de exemplo (salário de R$ 3.000,00, 220 h, referência 1). */
export function validarFormula(f: FormulaEvento): string[] {
    const exemplo = { REF: 1, SALARIO: 3000, SALARIO_HORA: 3000 / 220, SALARIO_DIA: 100, HORAS_MES: 220, COEF: 1 };
    const r = avaliarFormula(f.expressao, exemplo);
    const erros: string[] = [];
    if ('erro' in r) erros.push(r.erro);
    if (f.referencia === 'nenhuma' && /\bREF\b/i.test(f.expressao)) erros.push('A fórmula usa REF, mas a referência está como "nenhuma".');
    return erros;
}

/** Variáveis do mês: a referência e o salário (centavos → reais). */
export function variaveisDaFormula(ref: number, referencia: FormulaEvento['referencia'], sal: { mensal: number; horasMes: number } | null, coeficiente: number): Record<string, number> {
    const mensal = sal ? sal.mensal / 100 : 0;
    return {
        REF: referencia === 'valor' ? ref / 100 : referencia === 'nenhuma' ? 0 : ref,
        SALARIO: mensal, SALARIO_HORA: sal && sal.horasMes ? mensal / sal.horasMes : 0, SALARIO_DIA: mensal / 30, HORAS_MES: sal?.horasMes ?? 0, COEF: coeficiente || 0,
    };
}
