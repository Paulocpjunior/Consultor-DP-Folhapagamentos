// services/calculo/arredondamento.ts
//
// Arredondamento do líquido, como o IOB faz (Parâmetros da Empresa; Paulo,
// 08/10/2026: "pode seguir com arredondamento liquido"). O pagamento sobe ao
// real seguinte e os centavos pagos a mais voltam como desconto no mês
// seguinte. Conferido com os eventos do IOB de 08 e 09/2026:
// - adiantamento de 466,67 pago como 467,00 ("arredondamento atual" 0,33 no
//   demonstrativo do adiantamento); a folha desconta os 0,33 ("desc.
//   arredondamento adiantamento");
// - folha: líquido − arredondamento anterior (o atual do mês passado), e o
//   "arredondamento atual" leva ao real seguinte (agosto: 1.581,40 − 0,96 +
//   0,56 = 1.581,00; setembro: 490,00 − 0,33 − 0,56 + 0,89 = 490,00).
// Nenhuma das verbas tem INSS, FGTS ou IRRF.

import { competenciaSeguinte, type ResultadoCalculo, type Verba } from './motorMensal';
import { reais } from '../cadastros/documentos';

/** Parâmetros da folha da empresa (empresas/{id}.parametrosFolha). */
export interface ParametrosFolha {
    /** Arredondar o líquido ao real seguinte, com os centavos descontados no mês seguinte. */
    arredondarLiquido?: boolean;
    /** Competência (AAAA-MM) em que o arredondamento começou no Consultor: o "anterior" é encadeado a partir dela. */
    arredondarDesde?: string;
}

/** A empresa arredonda nesta competência? Só a partir do mês de início (antes dele a folha fica como era; Codex #116). */
export const arredondaNoMes = (p: ParametrosFolha | undefined, competencia: string) =>
    !!p?.arredondarLiquido && (!p.arredondarDesde || competencia >= p.arredondarDesde);

/** Centavos que faltam para o real seguinte (0 se já é inteiro ou não é positivo). */
export const aoRealSeguinte = (c: number) => (c > 0 && c % 100 ? 100 - (c % 100) : 0);

const v = (codigo: string, descricao: string, tipo: Verba['tipo'], valor: number): Verba => ({ codigo, descricao, referencia: '', tipo, valor, inss: false, fgts: false, irrf: false });

/**
 * Aplica o arredondamento a um resultado do motor mensal: o do adiantamento (ARREDADI, desconto), o anterior
 * (ARREDANT, desconto) e o atual (ARREDATU, provento). Devolve um resultado novo, com totais refeitos.
 */
export function arredondar(r: ResultadoCalculo, anterior: number): ResultadoCalculo {
    if (r.situacao === 'erro') return r;
    const out: ResultadoCalculo = { ...r, verbas: r.verbas.filter(x => !/^ARRED/.test(x.codigo)), memoria: [...r.memoria], avisos: [...r.avisos], totais: { ...r.totais } };
    const adiant = out.verbas.find(x => x.codigo === 'ADIANT')?.valor ?? 0;
    const arredAdi = aoRealSeguinte(adiant);
    if (arredAdi) out.verbas.push(v('ARREDADI', 'Desconto do arredondamento do adiantamento', 'desconto', arredAdi));
    const ant = Math.max(0, Math.round(anterior));
    if (ant) out.verbas.push(v('ARREDANT', 'Arredondamento anterior', 'desconto', ant));
    const proventos = out.verbas.filter(x => x.tipo === 'provento').reduce((s, x) => s + x.valor, 0);
    const descontos = out.verbas.filter(x => x.tipo === 'desconto').reduce((s, x) => s + x.valor, 0);
    const atual = aoRealSeguinte(proventos - descontos);
    if (atual) out.verbas.push(v('ARREDATU', 'Arredondamento atual', 'provento', atual));
    out.totais.proventos = proventos + atual;
    out.totais.descontos = descontos;
    out.totais.liquido = out.totais.proventos - descontos;
    if (proventos - descontos < 0) out.avisos.push('Líquido negativo: sem arredondamento atual.');
    out.memoria.push(`Arredondamento do líquido: ${[arredAdi && `adiantamento pago com ${reais(arredAdi)} a mais, descontados aqui`, ant && `${reais(ant)} do arredondamento do mês anterior`, atual && `${reais(atual)} para o real seguinte (volta como desconto no mês que vem)`].filter(Boolean).join('; ') || 'nada a arredondar'}.`);
    return out;
}

/** Arredondamento do adiantamento (pago a mais no demonstrativo dele e descontado na folha). */
export const arredondamentoDoAdiantamento = (r: Pick<ResultadoCalculo, 'verbas'>) => r.verbas.find(x => x.codigo === 'ARREDADI')?.valor ?? 0;
/** Arredondamento atual da folha: o "anterior" do mês seguinte. */
export const arredondamentoAtual = (r: Pick<ResultadoCalculo, 'verbas'>) => r.verbas.find(x => x.codigo === 'ARREDATU')?.valor ?? 0;

/**
 * Arredondamento anterior de `competencia`: o atual do mês passado, encadeado mês a mês desde `desde`.
 * `informado(c)` é o anterior gravado no movimento do mês (o do holerite do IOB, por exemplo), que vale no lugar
 * do encadeado; `calcular(c)` é a folha do mês sem arredondamento (null sem vínculo). Antes de `desde`, 0.
 */
export function anteriorEncadeado(desde: string, competencia: string, calcular: (c: string) => ResultadoCalculo | null, informado: (c: string) => number | undefined): number {
    if (!/^\d{4}-\d{2}$/.test(desde) || desde >= competencia) return 0;
    const meses: string[] = [];
    for (let c = desde; c < competencia; c = competenciaSeguinte(c)) meses.push(c);
    // O encadeamento recalcula cada mês: no máximo os 36 últimos (antes deles, 0).
    let anterior = 0;
    for (const c of meses.slice(-36)) {
        const inf = informado(c);
        if (inf !== undefined) anterior = inf;
        const r = calcular(c);
        anterior = r && r.situacao !== 'erro' ? arredondamentoAtual(arredondar(r, anterior)) : 0;
    }
    return anterior;
}
