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

import { competenciaSeguinte, type Movimento, type ResultadoCalculo, type Verba } from './motorMensal';
import { mesmoMovimento } from './movimento';
import { reais } from '../cadastros/documentos';

/** Parâmetros da folha da empresa (empresas/{id}.parametrosFolha). */
export interface ParametrosFolha {
    /** Arredondar o líquido ao real seguinte, com os centavos descontados no mês seguinte. */
    arredondarLiquido?: boolean;
    /** Competência (AAAA-MM) em que o arredondamento começou no Consultor: o "anterior" é encadeado a partir dela. */
    arredondarDesde?: string;
    /**
     * Quando a folha é paga: no próprio mês ('mes') ou no mês seguinte ('seguinte', o padrão: 5º dia útil ou dia 5).
     * Decide o mês do pagamento (e a tabela do IRRF) dos meses passados no encadeamento do arredondamento (Codex #116).
     */
    pagamentoFolha?: 'mes' | 'seguinte';
    /**
     * Mudanças de regime: a partir de `desde`, vale `para`; antes da primeira, o `de` dela. Os meses passados do
     * encadeamento são recalculados com o regime que valia neles (Codex #116).
     */
    mudancasPagamento?: { desde: string; de: RegimePagamento; para: RegimePagamento }[];
}
export type RegimePagamento = NonNullable<ParametrosFolha['pagamentoFolha']>;

/** Regime de pagamento da folha que valia na competência. */
export function regimeNoMes(p: ParametrosFolha | undefined, competencia: string): RegimePagamento {
    const m = [...(p?.mudancasPagamento ?? [])].sort((a, b) => a.desde.localeCompare(b.desde));
    if (!m.length) return p?.pagamentoFolha ?? 'seguinte';
    const ultima = m.filter(x => x.desde <= competencia).pop();
    return ultima ? ultima.para : m[0].de;
}

/** Mês do pagamento da folha da competência, pelo regime da empresa naquele mês. */
export const mesDoPagamento = (p: ParametrosFolha | undefined, competencia: string) =>
    regimeNoMes(p, competencia) === 'mes' ? competencia : competenciaSeguinte(competencia);

/**
 * Muda o regime a partir da competência: os meses anteriores ficam com o que valia neles; mudanças posteriores a ela
 * são substituídas (o novo regime vale daqui em diante).
 */
export function mudarRegime(p: ParametrosFolha | undefined, desde: string, para: RegimePagamento): ParametrosFolha {
    const todas = [...(p?.mudancasPagamento ?? [])].sort((a, b) => a.desde.localeCompare(b.desde));
    const antes = todas.filter(x => x.desde < desde);
    const de = antes.length ? antes[antes.length - 1].para : todas.length ? todas[0].de : (p?.pagamentoFolha ?? 'seguinte');
    return { ...p, pagamentoFolha: para, mudancasPagamento: de === para ? antes : [...antes, { desde, de, para }] };
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
export function anteriorEncadeado(desde: string, competencia: string, calcular: (c: string) => ResultadoCalculo | null, informado: (c: string) => number | undefined,
    fechado: (c: string) => number | undefined = () => undefined): number | { erro: string } {
    if (!/^\d{4}-\d{2}$/.test(desde) || desde >= competencia) return 0;
    // O encadeamento recalcula cada mês desde o início, inteiro: cortar o período trocaria o anterior verdadeiro por 0
    // e o erro iria até o mês pedido (Codex #116). Informe o anterior no movimento para encurtar a conta.
    let anterior = 0;
    // Mês com cálculo em erro ou incompleto no caminho: o anterior dali em diante não é conhecido, até um anterior informado (Codex #116).
    let falhou = '';
    for (let c = desde; c < competencia; c = competenciaSeguinte(c)) {
        const inf = informado(c);
        if (inf !== undefined) { anterior = inf; falhou = ''; }
        // Mês com o atual gravado ao salvar o movimento: vale o gravado, sem recalcular com a ficha de hoje (Codex #116).
        const fx = fechado(c);
        if (fx !== undefined) { anterior = fx; falhou = ''; continue; }
        const r = calcular(c);
        // Incompleto (férias sem recibo, por exemplo) também: o líquido dele não é o pago (Codex #116).
        if (r && r.situacao !== 'calculado') { falhou = c; anterior = 0; continue; }
        anterior = r ? arredondamentoAtual(arredondar(r, anterior)) : 0;
    }
    return falhou ? { erro: `Arredondamento do líquido: o cálculo de ${falhou.slice(5)}/${falhou.slice(0, 4)} está com erro ou incompleto, e o anterior não pode ser encadeado a partir dele. Corrija esse mês ou informe o "Arredondamento anterior" no movimento de um mês seguinte.` } : anterior;
}

const semFechado = (m: Movimento | undefined): Movimento => ({ ...m, arredondamentoFechado: undefined, arredondamentoDesde: undefined });
/**
 * Movimento a gravar com o arredondamento atual do mês (o anterior do mês seguinte) e o início usado. Sem cálculo
 * completo: movimento editado sai sem o atual velho, para o encadeamento refazer (e travar) o mês em vez de confiar
 * nele; sem edição, fica como está (undefined; Codex #116).
 */
export function movimentoComFechado(mov: Movimento | undefined, gravado: Movimento | undefined, r: ResultadoCalculo, desde: string): Movimento | undefined {
    if (r.situacao === 'calculado') return { ...mov, arredondamentoFechado: arredondamentoAtual(r), arredondamentoDesde: desde };
    return mesmoMovimento(semFechado(mov), semFechado(gravado)) ? undefined : semFechado(mov);
}
