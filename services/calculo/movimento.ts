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

const NUMERICOS = ['horasExtras50', 'horasExtras100', 'faltasDias', 'dsrDescontadoDias', 'atrasosHoras', 'feriadosLocais', 'pensaoAlimenticia', 'adiantamento', 'valeTransporte', 'arredondamentoAnterior', 'arredondamentoFechado', 'irrfRendimentos', 'irrfDeducoes', 'irrfRetido'] as const;
/** Valores em centavos que sobrepõem a ficha: 0 é informação ("não houve no mês") e fica gravado. */
const SOBREPOEM_FICHA: readonly CampoNumerico[] = ['adiantamento', 'valeTransporte', 'arredondamentoAnterior', 'arredondamentoFechado', 'irrfRendimentos', 'irrfDeducoes', 'irrfRetido'];
const EM_CENTAVOS: readonly CampoNumerico[] = ['pensaoAlimenticia', 'adiantamento', 'valeTransporte', 'arredondamentoAnterior', 'arredondamentoFechado', 'irrfRendimentos', 'irrfDeducoes', 'irrfRetido'];
export type CampoNumerico = typeof NUMERICOS[number];
const HORAS: readonly CampoNumerico[] = ['horasExtras50', 'horasExtras100', 'atrasosHoras'];

export const ROTULO_MOVIMENTO: Record<CampoNumerico | 'lancamentos', string> = {
    horasExtras50: 'Horas extras 50%', horasExtras100: 'Horas extras 100%', faltasDias: 'Faltas (dias)',
    dsrDescontadoDias: 'DSR descontado (dias)', atrasosHoras: 'Faltas e atrasos (horas)', feriadosLocais: 'Feriados locais no mês', pensaoAlimenticia: 'Pensão alimentícia',
    adiantamento: 'Adiantamento pago', valeTransporte: 'Vale-transporte descontado', arredondamentoAnterior: 'Arredondamento anterior', arredondamentoFechado: 'Arredondamento atual do mês',
    irrfRendimentos: 'Rendimentos do IRRF (gravado)', irrfDeducoes: 'Deduções do IRRF (gravado)', irrfRetido: 'IRRF retido (gravado)',
    lancamentos: 'Lançamentos avulsos',
};

/** Tira campos vazios ou zerados (menos adiantamento e vale-transporte, em que 0 vale) e lançamentos em branco; a ordem das chaves fica fixa. */
export function limparMovimento(m: Movimento): Movimento {
    const out: Movimento = {};
    for (const k of NUMERICOS) {
        const v = m[k];
        // Horas com 4 casas: 8:20 é 8,3333 h, e 8,33 h daria centavos a menos que o IOB.
        if (typeof v === 'number' && Number.isFinite(v) && (v !== 0 || SOBREPOEM_FICHA.includes(k))) out[k] = EM_CENTAVOS.includes(k) ? Math.round(v) : HORAS.includes(k) ? Math.round(v * 10000) / 10000 : Math.round(v * 100) / 100;
    }
    if (typeof m.arredondamentoDesde === 'string' && /^\d{4}-\d{2}$/.test(m.arredondamentoDesde)) out.arredondamentoDesde = m.arredondamentoDesde;
    if (typeof m.arredondamentoPagamento === 'string' && /^\d{4}-\d{2}$/.test(m.arredondamentoPagamento)) out.arredondamentoPagamento = m.arredondamentoPagamento;
    if (typeof m.mesPagamento === 'string' && /^\d{4}-\d{2}$/.test(m.mesPagamento)) out.mesPagamento = m.mesPagamento;
    if (typeof m.irrfPagamento === 'string' && /^\d{4}-\d{2}$/.test(m.irrfPagamento)) out.irrfPagamento = m.irrfPagamento;
    // Outros adicionais de hora extra: chaves numéricas em ordem, horas com 4 casas, sem os zerados.
    const pct = Object.entries(m.horasExtrasPct ?? {}).filter(([p, h]) => /^\d{1,3}(\.\d{1,2})?$/.test(p) && typeof h === 'number' && Number.isFinite(h) && h !== 0)
        .sort((a, b) => Number(a[0]) - Number(b[0])).map(([p, h]) => [p, Math.round(h * 10000) / 10000] as const);
    if (pct.length) out.horasExtrasPct = Object.fromEntries(pct);
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
    const max: Partial<Record<CampoNumerico, number>> = { horasExtras50: 300, horasExtras100: 300, atrasosHoras: 300, faltasDias: diasNoMes, dsrDescontadoDias: diasNoMes, feriadosLocais: diasNoMes };
    for (const k of NUMERICOS) {
        const v = m[k];
        if (v === undefined) continue;
        if (v < 0) erros.push(`${ROTULO_MOVIMENTO[k]}: não pode ser negativo.`);
        else if (max[k] !== undefined && v > max[k]!) erros.push(`${ROTULO_MOVIMENTO[k]}: no máximo ${max[k]}.`);
        // O arredondamento anterior é o que faltou para o real seguinte: até 0,99 (56 em vez de 0,56 tiraria R$ 56,00; Codex #116).
        if ((k === 'arredondamentoAnterior' || k === 'arredondamentoFechado') && v > 99) erros.push(`${ROTULO_MOVIMENTO[k]}: no máximo R$ 0,99 (são centavos do mês anterior).`);
    }
    for (const [p, h] of Object.entries(m.horasExtrasPct ?? {})) {
        const n = Number(p);
        if (n === 50 || n === 100) erros.push(`Horas extras ${p}%: use o campo próprio de ${p}%.`);
        else if (!(n > 0 && n <= 300)) erros.push(`Horas extras: adicional de ${p}% inválido (de 1% a 300%).`);
        if (h < 0) erros.push(`Horas extras ${p}%: não pode ser negativo.`);
        else if (h > 300) erros.push(`Horas extras ${p}%: no máximo 300.`);
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
