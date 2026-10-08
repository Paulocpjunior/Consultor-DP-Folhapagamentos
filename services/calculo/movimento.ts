// services/calculo/movimento.ts
//
// Movimento do mês de cada funcionário (horas extras, faltas, pensão,
// lançamentos), gravado em calculo_movimentos/{idDaFicha}_{AAAA-MM}.
// Aqui fica a parte pura: limpar, validar e comparar.

import type { Lancamento, Movimento } from './motorMensal';

export interface MovimentoGravado {
    id: string;
    empresaId: string;
    fichaId: string;
    competencia: string;
    movimento: Movimento;
    atualizadoPorEmail?: string;
    atualizadoEm?: Date;
}

export const idMovimento = (fichaId: string, competencia: string) => `${fichaId}_${competencia}`;

const NUMERICOS = ['horasExtras50', 'horasExtras100', 'faltasDias', 'dsrDescontadoDias', 'feriadosLocais', 'pensaoAlimenticia', 'adiantamento', 'valeTransporte', 'arredondamentoAnterior', 'arredondamentoFechado'] as const;
/** Valores em centavos que sobrepõem a ficha: 0 é informação ("não houve no mês") e fica gravado. */
const SOBREPOEM_FICHA: readonly CampoNumerico[] = ['adiantamento', 'valeTransporte', 'arredondamentoAnterior', 'arredondamentoFechado'];
const EM_CENTAVOS: readonly CampoNumerico[] = ['pensaoAlimenticia', 'adiantamento', 'valeTransporte', 'arredondamentoAnterior', 'arredondamentoFechado'];
export type CampoNumerico = typeof NUMERICOS[number];

export const ROTULO_MOVIMENTO: Record<CampoNumerico | 'lancamentos', string> = {
    horasExtras50: 'Horas extras 50%', horasExtras100: 'Horas extras 100%', faltasDias: 'Faltas (dias)',
    dsrDescontadoDias: 'DSR descontado (dias)', feriadosLocais: 'Feriados locais no mês', pensaoAlimenticia: 'Pensão alimentícia',
    adiantamento: 'Adiantamento pago', valeTransporte: 'Vale-transporte descontado', arredondamentoAnterior: 'Arredondamento anterior', arredondamentoFechado: 'Arredondamento atual do mês',
    lancamentos: 'Lançamentos avulsos',
};

/** Tira campos vazios ou zerados (menos adiantamento e vale-transporte, em que 0 vale) e lançamentos em branco; a ordem das chaves fica fixa. */
export function limparMovimento(m: Movimento): Movimento {
    const out: Movimento = {};
    for (const k of NUMERICOS) {
        const v = m[k];
        if (typeof v === 'number' && Number.isFinite(v) && (v !== 0 || SOBREPOEM_FICHA.includes(k))) out[k] = EM_CENTAVOS.includes(k) ? Math.round(v) : Math.round(v * 100) / 100;
    }
    const lancs: Lancamento[] = (m.lancamentos ?? [])
        .map(l => ({ descricao: l.descricao.trim().replace(/\s+/g, ' '), tipo: l.tipo, valor: Math.round(l.valor), inss: !!l.inss, fgts: !!l.fgts, irrf: !!l.irrf }))
        .filter(l => l.descricao || l.valor);
    if (lancs.length) out.lancamentos = lancs;
    return out;
}

export const movimentoVazio = (m: Movimento | undefined) => !m || Object.keys(limparMovimento(m)).length === 0;

/** Erros que impedem gravar. Recebe o movimento já limpo. */
export function validarMovimento(m: Movimento, diasNoMes = 31): string[] {
    const erros: string[] = [];
    const max: Partial<Record<CampoNumerico, number>> = { horasExtras50: 300, horasExtras100: 300, faltasDias: diasNoMes, dsrDescontadoDias: diasNoMes, feriadosLocais: diasNoMes };
    for (const k of NUMERICOS) {
        const v = m[k];
        if (v === undefined) continue;
        if (v < 0) erros.push(`${ROTULO_MOVIMENTO[k]}: não pode ser negativo.`);
        else if (max[k] !== undefined && v > max[k]!) erros.push(`${ROTULO_MOVIMENTO[k]}: no máximo ${max[k]}.`);
        // O arredondamento anterior é o que faltou para o real seguinte: até 0,99 (56 em vez de 0,56 tiraria R$ 56,00; Codex #116).
        if ((k === 'arredondamentoAnterior' || k === 'arredondamentoFechado') && v > 99) erros.push(`${ROTULO_MOVIMENTO[k]}: no máximo R$ 0,99 (são centavos do mês anterior).`);
    }
    (m.lancamentos ?? []).forEach((l, i) => {
        if (!l.descricao) erros.push(`Lançamento ${i + 1}: informe a descrição.`);
        if (!(l.valor > 0)) erros.push(`Lançamento ${i + 1}${l.descricao ? ` (${l.descricao})` : ''}: informe um valor maior que zero.`);
        if (l.tipo !== 'provento' && l.tipo !== 'desconto') erros.push(`Lançamento ${i + 1}: tipo inválido.`);
    });
    return erros;
}

export const mesmoMovimento = (a: Movimento | undefined, b: Movimento | undefined) =>
    JSON.stringify(limparMovimento(a ?? {})) === JSON.stringify(limparMovimento(b ?? {}));
