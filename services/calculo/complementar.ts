// services/calculo/complementar.ts
//
// Folha complementar: diferenças de remuneração de competências já fechadas, pagas depois (reajuste de convenção ou
// acordo coletivo com efeito retroativo, lei, dissídio, parcela conhecida após o fechamento). No eSocial vão no
// S-1200 da competência em que o instrumento foi celebrado ({perApur}), no grupo infoPerAnt, com as diferenças de
// cada mês no seu {perRef} (MOS, S-1200, item 18).
//
// Regras seguidas:
// - INSS do segurado: o eSocial não calcula quando há períodos anteriores; a empresa calcula e informa em rubrica
//   própria (MOS, item 18.16). Aqui, mês a mês, pela tabela e pelo teto de cada {perRef}: a diferença entre o INSS
//   sobre a base nova (a da folha gravada + a diferença) e o INSS sobre a base da folha gravada.
// - FGTS: 8% (aprendiz 2%) sobre a diferença; nos tipos A, B, C, D, F, G e J o recolhimento é na competência do
//   S-1200 (item 18.9).
// - IRRF: regime de caixa, no mês do pagamento, somado à folha paga no mesmo mês (RIR/1999, art. 621). Diferenças de
//   anos anteriores ao do pagamento são RRA (Lei 7.713/1988, art. 12-A): IRRF exclusivo na fonte, em separado dos
//   demais rendimentos do mês, pela tabela progressiva do mês do pagamento com as faixas e a parcela a deduzir
//   multiplicadas pelo número de meses; deduz o INSS das diferenças (sem dependentes nem desconto simplificado; a
//   redução da Lei 15.270/2025 não tem previsão para o RRA e não é aplicada). No eSocial, demonstrativo próprio com
//   indRRA e infoRRA (MOS, S-1200, item 2.4). Diferença do 13º de ano anterior continua pelo IOB (incompleto).

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { somarMeses } from '../prazos/calendario';
import { apurarIrrf, type Incidencias, type IrrfApurado, type ResultadoCalculo, type TipoVerba, type Verba } from './motorMensal';
import { inssDetalhado, IRRF_MINIMO } from './tributos';
import { ehDomestico, indenizacaoCompensatoria } from '../domestico/domestico';

/** Fato gerador da remuneração de períodos anteriores (S-1200, {tpAcConv}). */
export type TpAcConv = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

export const TIPOS_AC_CONV: { codigo: TpAcConv; rotulo: string; suportado: boolean }[] = [
    { codigo: 'C', rotulo: 'Convenção Coletiva de Trabalho', suportado: true },
    { codigo: 'A', rotulo: 'Acordo Coletivo de Trabalho', suportado: true },
    { codigo: 'D', rotulo: 'Sentença normativa (dissídio)', suportado: true },
    { codigo: 'G', rotulo: 'Antecipação de diferenças de acordo, convenção ou dissídio', suportado: true },
    { codigo: 'B', rotulo: 'Legislação federal, estadual, municipal ou distrital', suportado: true },
    { codigo: 'J', rotulo: 'Parcelas complementares conhecidas após o fechamento da folha', suportado: true },
    { codigo: 'E', rotulo: 'Conversão de licença saúde em acidente de trabalho', suportado: false },
    { codigo: 'F', rotulo: 'Verbas devidas após o desligamento', suportado: false },
    { codigo: 'H', rotulo: 'Base de FGTS anterior ao FGTS Digital', suportado: false },
    { codigo: 'I', rotulo: 'Sentença judicial (exceto reclamatória trabalhista)', suportado: false },
];

export const rotuloTpAcConv = (t: string) => TIPOS_AC_CONV.find(x => x.codigo === t)?.rotulo ?? t;

/** Tipos em que {dtAcConv} é obrigatório: a data da celebração, da publicação ou da notificação (MOS, item 18.6). */
export const exigeDataAcConv = (t: string) => ['A', 'B', 'C', 'D', 'E'].includes(t);

/** Descrição do tipo J que o MOS manda usar (item 18.16). */
export const DSC_TIPO_J = '§ 3º do art. 27 da IN RFB nº 2.110/22';

export interface Instrumento { tpAcConv: TpAcConv; dtAcConv?: string; dsc: string }

/** Lançamento manual de diferença: uma verba de um funcionário num mês anterior. Valor em centavos. */
export interface LancamentoComplementar extends Incidencias {
    fichaId: string;
    perRef: string;
    /** Código da verba do motor (SAL, HE50…) para usar o mesmo de/para; LAN para avulso (de/para pela descrição). */
    codigo: string;
    descricao: string;
    tipo: TipoVerba;
    valor: number;
}

export interface ReajusteRetroativo { pct: number; de: string; ate: string }

/** Diferenças calculadas pelos motores (13º complementar, diferença do 13º, rescisão complementar), por funcionário e mês. */
export interface DiferencaCalculada { fichaId: string; perRef: string; verbas: Verba[]; avisos?: string[] }

/** O 13º já pago (a 2ª parcela ou o da rescisão), no mês de referência dele: a base do INSS e o INSS e o IRRF apurados. */
export interface DecimoPago { fichaId: string; perRef: string; baseInss: number; inss: number; rendimentosIrrf: number; deducoesIrrf: number; irrf: number }

export interface EntradaComplementar {
    /** Competência do S-1200 em que a complementar é escriturada (a da celebração do instrumento). */
    perApur: string;
    /** Mês do pagamento (AAAA-MM): o IRRF é deste mês. */
    pagamento: string;
    instrumento: Instrumento;
    reajuste?: ReajusteRetroativo;
    lancamentos?: LancamentoComplementar[];
    fichas: FichaFuncionario[];
    /** Holerites das folhas gravadas, por competência (AAAA-MM). */
    gravadas: Record<string, ResultadoCalculo[]>;
    /** Holerites da folha de {perApur}: o IRRF da complementar soma o da folha paga no mesmo mês. */
    folhaDoMes?: ResultadoCalculo[];
    tabelas: TabelaLegal[];
    diferencas?: DiferencaCalculada[];
    decimos?: DecimoPago[];
}

export interface MesComplementar {
    perRef: string;
    verbas: Verba[];
    /** Diferenças das bases no mês (centavos). */
    bases: { inss: number; fgts: number; irrf: number };
    inss: number;
    fgts: number;
    /** Ano anterior ao do pagamento: rendimento recebido acumuladamente (IRRF em separado). */
    rra: boolean;
    /** Diferenças do 13º no mês (bases do INSS e do IRRF próprias do 13º) e o INSS delas. */
    bases13: { inss: number; irrf: number };
    inss13: number;
}

/** RRA da complementar: meses, rendimentos, INSS deduzido e o IRRF pela tabela acumulada. */
export interface RraComplementar { qtdMeses: number; rendimentos: number; deducoes: number; irrf: number; descricao: string }

export interface ResultadoComplementar extends ResultadoCalculo {
    meses: MesComplementar[];
    rra?: RraComplementar;
}

/**
 * IRRF do RRA (Lei 7.713/1988, art. 12-A, § 1º): a tabela do mês do pagamento com os limites das faixas e a parcela a
 * deduzir multiplicados pelo número de meses. Sem desconto simplificado e sem redutor.
 */
export function apurarIrrfRra(t: TabelaLegal, rendimentos: number, deducoes: number, meses: number) {
    const base = Math.max(0, rendimentos - deducoes);
    const faixa = t.faixas.find(f => f.ate === null || base <= f.ate * meses) ?? t.faixas[t.faixas.length - 1];
    const deducaoFaixa = faixa.deducao * meses;
    return { base, aliquota: faixa.aliquota, deducaoFaixa, valor: Math.max(0, Math.round(base * faixa.aliquota / 100) - deducaoFaixa) };
}

/** Verbas que acompanham o salário no reajuste: salário, periculosidade, maternidade, horas extras e DSR, férias do mês, faltas. */
const REAJUSTAVEIS = new Set(['SAL', 'PERICUL', 'MAT', 'MATPRORR', 'HE50', 'HE100', 'DSRHE', 'FERMES', 'FERMES13', 'FALTA', 'DSRF', 'ATRASO']);
export const reajustavel = (codigo: string) => REAJUSTAVEIS.has(codigo) || /^HE\d+(_\d+)?$/.test(codigo);

/** Verbas de 13º: INSS e IRRF próprios (base do 13º e tributação exclusiva), não somam à remuneração do mês. */
const DECIMO = new Set(['13PROP', '13IND', '13COMP', '13DIF']);
export const ehDecimo = (codigo: string) => DECIMO.has(codigo);

/** Verbas do motor que podem ser lançadas à mão na complementar (o mesmo de/para da folha). */
export const VERBAS_LANCAVEIS: { codigo: string; descricao: string; tipo: TipoVerba }[] = [
    { codigo: 'SAL', descricao: 'Salário', tipo: 'provento' },
    { codigo: 'HE50', descricao: 'Horas extras 50%', tipo: 'provento' },
    { codigo: 'HE100', descricao: 'Horas extras 100%', tipo: 'provento' },
    { codigo: 'DSRHE', descricao: 'DSR sobre horas extras', tipo: 'provento' },
    { codigo: 'PERICUL', descricao: 'Adicional de periculosidade', tipo: 'provento' },
    { codigo: 'INSALUB', descricao: 'Adicional de insalubridade', tipo: 'provento' },
    { codigo: 'FERMES', descricao: 'Férias do mês (pagas no recibo)', tipo: 'provento' },
    { codigo: 'FERMES13', descricao: '1/3 de férias do mês (pago no recibo)', tipo: 'provento' },
    { codigo: 'FALTA', descricao: 'Faltas', tipo: 'desconto' },
    { codigo: '13DIF', descricao: 'Diferença de 13º salário', tipo: 'provento' },
    { codigo: 'LAN', descricao: '', tipo: 'provento' },
];

const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
const mesSeguinte = (c: string) => somarMeses(`${c}-01`, 1).slice(0, 7);
const ultimoDia = (c: string) => { const [a, m] = c.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const brData = (d: string) => d.split('-').reverse().join('/');

/** Meses de `de` a `ate`, inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
    const out: string[] = [];
    if (!competenciaValida(de) || !competenciaValida(ate)) return out;
    for (let c = de; c <= ate && out.length < 180; c = mesSeguinte(c)) out.push(c);
    return out;
}

/** O que impede calcular a complementar. */
export function validarComplementar(e: Pick<EntradaComplementar, 'perApur' | 'pagamento' | 'instrumento' | 'reajuste' | 'lancamentos' | 'diferencas'>): string[] {
    const erros: string[] = [];
    if (!competenciaValida(e.perApur)) erros.push('Competência da complementar inválida.');
    if (!competenciaValida(e.pagamento)) erros.push('Mês do pagamento inválido.');
    else if (competenciaValida(e.perApur) && e.pagamento < e.perApur) erros.push('O pagamento não pode ser antes da competência da complementar.');
    const { tpAcConv, dtAcConv, dsc } = e.instrumento;
    const tipo = TIPOS_AC_CONV.find(x => x.codigo === tpAcConv);
    if (!tipo) erros.push('Escolha o tipo do instrumento (tpAcConv).');
    else if (!tipo.suportado) erros.push(`Tipo ${tipo.codigo} (${tipo.rotulo}): o Consultor ainda não gera; faça pelo IOB.`);
    if (exigeDataAcConv(tpAcConv)) {
        if (!dtAcConv || !dataValida(dtAcConv)) erros.push('Informe a data da celebração ou da publicação do instrumento.');
        else if (competenciaValida(e.perApur) && dtAcConv > ultimoDia(e.perApur)) erros.push(`A data do instrumento (${brData(dtAcConv)}) é depois da competência ${rotuloCompetencia(e.perApur)}: a complementar vai no S-1200 do mês da celebração.`);
    } else if (dtAcConv && !dataValida(dtAcConv)) erros.push('Data do instrumento inválida.');
    const d = (dsc ?? '').trim();
    if (!d) erros.push('Descreva o instrumento (por exemplo, "Convenção coletiva dos comerciários de São Paulo 2026/2027").');
    else if (d.length > 255) erros.push('A descrição do instrumento tem mais de 255 caracteres.');
    const r = e.reajuste;
    if (!r && !(e.lancamentos ?? []).length && !(e.diferencas ?? []).length) erros.push('Informe o reajuste retroativo ou lance as diferenças.');
    if (r) {
        if (!(r.pct > 0 && r.pct <= 100)) erros.push('Percentual do reajuste inválido (entre 0 e 100).');
        if (!competenciaValida(r.de) || !competenciaValida(r.ate)) erros.push('Informe os meses do reajuste retroativo.');
        else if (r.de > r.ate) erros.push('O mês inicial do reajuste é depois do final.');
        else if (competenciaValida(e.perApur) && r.ate >= e.perApur) erros.push(`O reajuste retroativo vai até o mês anterior a ${rotuloCompetencia(e.perApur)}; a própria competência entra na folha do mês.`);
    }
    (e.lancamentos ?? []).forEach((l, i) => {
        const q = `Lançamento ${i + 1}`;
        if (!l.fichaId) erros.push(`${q}: escolha o funcionário.`);
        if (!competenciaValida(l.perRef)) erros.push(`${q}: mês de referência inválido.`);
        else if (competenciaValida(e.perApur) && l.perRef >= e.perApur) erros.push(`${q}: o mês de referência tem de ser anterior a ${rotuloCompetencia(e.perApur)}.`);
        if (!(l.valor > 0)) erros.push(`${q}: informe o valor.`);
        if (!l.codigo) erros.push(`${q}: escolha a verba.`);
        if (l.codigo === 'LAN' && !l.descricao.trim()) erros.push(`${q}: descreva o lançamento avulso.`);
    });
    return erros;
}

/** Diferenças do reajuste sobre um holerite gravado: as verbas que acompanham o salário, no mesmo código. */
export function diferencasDoReajuste(h: ResultadoCalculo, pct: number): { verbas: Verba[]; avisos: string[] } {
    const verbas: Verba[] = []; const avisos: string[] = [];
    for (const v of h.verbas) {
        if (!reajustavel(v.codigo) || v.valor <= 0) continue;
        const valor = Math.round(v.valor * pct / 100);
        if (!valor) continue;
        // Férias do mês: na folha o IRRF foi o do recibo; a diferença é paga agora e é tributada no mês do pagamento.
        const irrf = v.codigo === 'FERMES' || v.codigo === 'FERMES13' ? true : v.irrf;
        verbas.push({ ...v, irrf, descricao: `Diferença de ${v.descricao.toLowerCase()}`, referencia: `${num(pct)}% de ${reais(v.valor)}`, valor });
    }
    if (h.verbas.some(v => v.codigo === 'INSALUB')) avisos.push(`Insalubridade em ${rotuloCompetencia(h.competencia)} não reajustada (a base é o salário mínimo ou o piso da convenção): se a base mudou, lance a diferença.`);
    if (h.verbas.some(v => /^LAN\d+$/.test(v.codigo) && v.tipo === 'provento')) avisos.push(`Lançamentos avulsos de ${rotuloCompetencia(h.competencia)} não reajustados: se forem proporcionais ao salário (comissão, gratificação), lance a diferença.`);
    return { verbas, avisos };
}

const somaBase = (vs: Verba[], k: keyof Incidencias) => vs.filter(v => v[k]).reduce((s, v) => s + (v.tipo === 'provento' ? v.valor : -v.valor), 0);

/**
 * Calcula a complementar de cada funcionário com diferença: verbas por mês de referência, INSS mês a mês, FGTS e
 * IRRF no mês do pagamento. Erros gerais (validação) voltam sem resultados.
 */
export function calcularComplementar(e: EntradaComplementar): { resultados: ResultadoComplementar[]; erros: string[]; avisos: string[] } {
    const erros = validarComplementar(e);
    const avisos: string[] = [];
    if (erros.length) return { resultados: [], erros, avisos };

    // Diferenças por funcionário e mês.
    const porFicha = new Map<string, Map<string, { verbas: Verba[]; avisos: string[] }>>();
    const pegar = (fichaId: string, perRef: string) => {
        const m = porFicha.get(fichaId) ?? new Map<string, { verbas: Verba[]; avisos: string[] }>();
        porFicha.set(fichaId, m);
        const x = m.get(perRef) ?? { verbas: [], avisos: [] };
        m.set(perRef, x);
        return x;
    };
    if (e.reajuste) {
        const { pct, de, ate } = e.reajuste;
        const semFolha: string[] = [];
        for (const perRef of mesesEntre(de, ate)) {
            const hs = e.gravadas[perRef];
            if (!hs?.length) { semFolha.push(rotuloCompetencia(perRef)); continue; }
            for (const h of hs) {
                if (h.situacao === 'erro') continue;
                const d = diferencasDoReajuste(h, pct);
                if (!d.verbas.length) continue;
                const x = pegar(h.fichaId, perRef);
                x.verbas.push(...d.verbas); x.avisos.push(...d.avisos);
            }
        }
        if (semFolha.length) avisos.push(`Sem folha gravada em ${semFolha.join(', ')}: as diferenças desses meses não foram calculadas. Grave a folha (Cálculo mensal › Gravar) ou lance as diferenças.`);
        const dif13 = (e.diferencas ?? []).some(d => d.verbas.some(v => v.codigo === '13DIF'));
        if ((de.slice(0, 4) !== ate.slice(0, 4) || ate.slice(5) === '12') && !dif13) avisos.push('O reajuste abrange dezembro: inclua a diferença do 13º (na tela) ou lance-a no mês de referência de dezembro.');
    }
    for (const d of e.diferencas ?? []) {
        const x = pegar(d.fichaId, d.perRef);
        x.verbas.push(...d.verbas); x.avisos.push(...(d.avisos ?? []));
    }
    (e.lancamentos ?? []).forEach((l, i) => {
        const x = pegar(l.fichaId, l.perRef);
        const codigo = l.codigo === 'LAN' ? `LAN${900 + i}` : l.codigo;
        x.verbas.push({ codigo, descricao: l.descricao.trim() || VERBAS_LANCAVEIS.find(v => v.codigo === l.codigo)?.descricao || l.codigo, referencia: 'lançado', tipo: l.tipo, valor: Math.round(l.valor), inss: l.inss, fgts: l.fgts, irrf: l.irrf });
    });

    const fichas = new Map(e.fichas.map(f => [f.id, f]));
    const tIr = tabelaVigente(e.tabelas, 'irrf', e.pagamento);
    const anoPagamento = e.pagamento.slice(0, 4);
    const resultados: ResultadoComplementar[] = [];
    for (const [fichaId, meses] of porFicha) {
        const f = fichas.get(fichaId);
        const nomeGravado = Object.values(e.gravadas).flat().find(h => h.fichaId === fichaId)?.nome;
        const r: ResultadoComplementar = {
            fichaId, nome: f?.dados.nome || nomeGravado || fichaId, competencia: e.perApur, pagamento: e.pagamento, situacao: 'calculado',
            verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
            memoria: [], avisos: [], erros: [], meses: [],
        };
        resultados.push(r);
        if (!f) { r.situacao = 'erro'; r.erros.push('Ficha não encontrada.'); continue; }
        const aprendiz = f.dados.categoria === '103';
        const aliqFgts = aprendiz ? 2 : 8;
        r.memoria.push(`${rotuloTpAcConv(e.instrumento.tpAcConv)}: ${e.instrumento.dsc.trim()}${e.instrumento.dtAcConv ? ` (${brData(e.instrumento.dtAcConv)})` : ''}.`);
        if (e.reajuste) r.memoria.push(`Reajuste de ${num(e.reajuste.pct)}% de ${rotuloCompetencia(e.reajuste.de)} a ${rotuloCompetencia(e.reajuste.ate)} sobre as verbas das folhas gravadas.`);
        for (const perRef of [...meses.keys()].sort()) {
            const x = meses.get(perRef)!;
            r.avisos.push(...new Set(x.avisos));
            const verbas = x.verbas;
            const doMes = verbas.filter(v => !ehDecimo(v.codigo)); const dec = verbas.filter(v => ehDecimo(v.codigo));
            // Complemento do 13º pelas variáveis de dezembro, pago até 10 de janeiro (Decreto 10.854/2021, art. 77): é do 13º
            // de dezembro, não RRA (MOS, S-1200, item 19.2).
            const complemento13 = verbas.length > 0 && verbas.every(v => v.codigo === '13COMP') && perRef.endsWith('-12') && e.pagamento === `${Number(perRef.slice(0, 4)) + 1}-01`;
            const mes: MesComplementar = {
                perRef, verbas, bases: { inss: somaBase(doMes, 'inss'), fgts: somaBase(verbas, 'fgts'), irrf: somaBase(doMes, 'irrf') }, inss: 0, fgts: 0,
                rra: perRef.slice(0, 4) < anoPagamento && !complemento13, bases13: { inss: somaBase(dec, 'inss'), irrf: somaBase(dec, 'irrf') }, inss13: 0,
            };
            r.meses.push(mes);
            if (mes.bases.inss < 0 || mes.bases.fgts < 0 || mes.bases.irrf < 0 || mes.bases13.inss < 0 || mes.bases13.irrf < 0) {
                r.erros.push(`Diferença negativa em ${rotuloCompetencia(perRef)}: o Consultor não calcula devolução. Confira os lançamentos.`);
                continue;
            }
            // INSS do mês de referência: a diferença do INSS sobre a base nova e a da folha gravada, pela tabela do mês.
            const h = e.gravadas[perRef]?.find(y => y.fichaId === fichaId && y.situacao !== 'erro');
            const baseAntes = h?.bases.inss ?? 0;
            if (!h && mes.bases.inss > 0) r.avisos.push(`Sem folha gravada em ${rotuloCompetencia(perRef)}: o INSS da diferença foi calculado como se a base do mês fosse só ela. Confira se houve outra remuneração no mês.`);
            if (mes.bases.inss > 0) {
                const tInss = tabelaVigente(e.tabelas, 'inss', perRef);
                if ('erro' in tInss) r.erros.push(`INSS de ${rotuloCompetencia(perRef)}: ${tInss.erro}`);
                else {
                    const antes = inssDetalhado(baseAntes, tInss.tabela);
                    const depois = inssDetalhado(baseAntes + mes.bases.inss, tInss.tabela);
                    mes.inss = Math.max(0, depois.valor - antes.valor);
                    r.memoria.push(`INSS de ${rotuloCompetencia(perRef)} (tabela de ${rotuloCompetencia(tInss.tabela.vigencia)}): ${depois.memoria}; menos ${reais(antes.valor)} sobre a base da folha (${reais(baseAntes)}) = ${reais(mes.inss)}.`);
                    if (mes.inss > 0) verbas.push({ codigo: 'INSS', descricao: `INSS sobre as diferenças de ${rotuloCompetencia(perRef)}`, referencia: '', tipo: 'desconto', valor: mes.inss, inss: false, fgts: false, irrf: false });
                }
            }
            // INSS do 13º: base própria, pela tabela do mês de referência, sobre o 13º já pago + a diferença.
            if (mes.bases13.inss > 0) {
                const pago = e.decimos?.find(y => y.fichaId === fichaId && y.perRef === perRef);
                if (!pago) r.avisos.push(`Sem o 13º pago de ${rotuloCompetencia(perRef)}: o INSS da diferença do 13º foi calculado sobre ela sozinha. Confira.`);
                const tInss = tabelaVigente(e.tabelas, 'inss', perRef);
                if ('erro' in tInss) r.erros.push(`INSS do 13º de ${rotuloCompetencia(perRef)}: ${tInss.erro}`);
                else {
                    const b0 = pago?.baseInss ?? 0;
                    const antes = inssDetalhado(b0, tInss.tabela); const depois = inssDetalhado(b0 + mes.bases13.inss, tInss.tabela);
                    mes.inss13 = Math.max(0, depois.valor - antes.valor);
                    r.memoria.push(`INSS do 13º (${rotuloCompetencia(perRef)}): ${depois.memoria}; menos ${reais(antes.valor)} sobre o 13º pago (${reais(b0)}) = ${reais(mes.inss13)}.`);
                    if (mes.inss13 > 0) verbas.push({ codigo: 'INSS13', descricao: 'INSS sobre a diferença do 13º', referencia: '', tipo: 'desconto', valor: mes.inss13, inss: false, fgts: false, irrf: false });
                }
            }
            mes.fgts = Math.round(mes.bases.fgts * aliqFgts / 100);
            if (mes.bases.fgts) r.memoria.push(`FGTS de ${rotuloCompetencia(perRef)}: ${reais(mes.bases.fgts)} × ${aliqFgts}%${aprendiz ? ' (aprendiz)' : ''} = ${reais(mes.fgts)} (recolhido na competência ${rotuloCompetencia(e.perApur)}).`);
            r.bases.inss += mes.bases.inss + mes.bases13.inss; r.bases.fgts += mes.bases.fgts; r.bases.irrf += mes.bases.irrf + mes.bases13.irrf; r.fgts += mes.fgts;
        }
        if (ehDomestico(f.dados.categoria) && r.bases.fgts > 0) {
            r.fgtsIndenizacao = indenizacaoCompensatoria(r.bases.fgts);
            r.memoria.push(`Indenização compensatória do doméstico: ${reais(r.bases.fgts)} × 3,2% = ${reais(r.fgtsIndenizacao)} (LC 150/2015, art. 22).`);
        }

        // RRA (anos anteriores ao do pagamento): IRRF exclusivo na fonte pela tabela acumulada, em separado.
        const rra = r.meses.filter(m => m.rra);
        if (rra.length && !r.erros.length) {
            const anos = [...new Set(rra.map(m => m.perRef.slice(0, 4)))].join(', ');
            if (rra.some(m => m.bases13.irrf > 0 || m.bases13.inss > 0)) {
                r.avisos.push(`Diferença do 13º de ${anos} paga em ${anoPagamento}: o RRA com 13º ainda não é calculado pelo Consultor; faça pelo IOB.`);
                if (r.situacao === 'calculado') r.situacao = 'incompleto';
            } else {
                const rendRra = rra.reduce((s, m) => s + m.bases.irrf, 0);
                const inssRra = rra.reduce((s, m) => s + m.inss, 0);
                const qtd = rra.filter(m => m.bases.irrf > 0).length;
                const descricao = `Diferenças de ${anos}${e.instrumento.dsc.trim() ? ` - ${e.instrumento.dsc.trim()}` : ''}`.slice(0, 50);
                if (rendRra > 0 && 'erro' in tIr) r.erros.push(`IRRF do RRA: ${tIr.erro}`);
                else if (rendRra > 0 && !('erro' in tIr)) {
                    const t = tIr.tabela;
                    const a = apurarIrrfRra(t, rendRra, inssRra, qtd);
                    let ir = a.valor;
                    r.memoria.push(`IRRF do RRA (Lei 7.713/1988, art. 12-A; tabela de ${rotuloCompetencia(t.vigencia)} × ${qtd} ${qtd === 1 ? 'mês' : 'meses'}): diferenças de ${anos} ${reais(rendRra)}; `
                        + `INSS ${reais(inssRra)}; base ${reais(a.base)} × ${num(a.aliquota)}% − ${reais(a.deducaoFaixa)} = ${reais(a.valor)}. Exclusivo na fonte, em separado da folha do mês; sem dependentes, desconto simplificado ou redutor.`);
                    if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF do RRA de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
                    r.rra = { qtdMeses: qtd, rendimentos: rendRra, deducoes: inssRra, irrf: ir, descricao };
                    r.avisos.push(`Diferenças de ${anos} pagas em ${anoPagamento}: RRA (rendimentos recebidos acumuladamente), com IRRF pela tabela acumulada (${qtd} ${qtd === 1 ? 'mês' : 'meses'}) e demonstrativo próprio no S-1200 (indRRA).`);
                    if (ir > 0) rra[rra.length - 1].verbas.push({ codigo: 'IRRF', descricao: 'IRRF sobre o RRA', referencia: `${num(a.aliquota)}% (RRA, ${qtd} ${qtd === 1 ? 'mês' : 'meses'})`, tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
                }
            }
        }
        const doAno = r.meses.filter(m => !m.rra);
        const rend = doAno.reduce((s, m) => s + m.bases.irrf, 0);
        const inssAno = doAno.reduce((s, m) => s + m.inss, 0);
        if (rend > 0 && !r.erros.length) {
            if ('erro' in tIr) r.erros.push(`IRRF: ${tIr.erro}`);
            else {
                const t = tIr.tabela;
                const folha = e.folhaDoMes?.find(y => y.fichaId === fichaId && y.situacao !== 'erro');
                const junto: IrrfApurado | undefined = folha?.irrfApurado && folha.pagamento === e.pagamento ? folha.irrfApurado : undefined;
                let ir: number; let aliquota: number;
                if (junto) {
                    const R = junto.rendimentos + rend; const L = junto.deducoesLegais + inssAno;
                    const a = apurarIrrf(t, R, L);
                    ir = Math.max(0, a.valor - junto.valor); aliquota = a.aliquota;
                    r.memoria.push(`IRRF (pagamento em ${rotuloCompetencia(e.pagamento)}, tabela de ${rotuloCompetencia(t.vigencia)}): folha de ${rotuloCompetencia(e.perApur)} ${reais(junto.rendimentos)} + diferenças ${reais(rend)} = ${reais(R)}; `
                        + `${a.simplificado ? `desconto simplificado ${reais(a.deducao)}` : `deduções legais ${reais(L)}`}; base ${reais(a.base)} × ${num(a.aliquota)}% − ${reais(a.deducaoFaixa)} = ${reais(a.bruto)}`
                        + `${a.memoriaRedutor.length ? ` (${a.memoriaRedutor.join(' ')})` : ''}; menos ${reais(junto.valor)} da folha = ${reais(ir)}.`);
                } else {
                    const nDep = f.dependentes.filter(y => y.irrf === 'S' && y.pensao !== 'S').length;
                    const L = inssAno + nDep * (t.valores.deducaoDependente ?? 0);
                    const a = apurarIrrf(t, rend, L);
                    ir = a.valor; aliquota = a.aliquota;
                    r.memoria.push(`IRRF (pagamento em ${rotuloCompetencia(e.pagamento)}, tabela de ${rotuloCompetencia(t.vigencia)}): diferenças ${reais(rend)}; `
                        + `${a.simplificado ? `desconto simplificado ${reais(a.deducao)}` : `deduções legais ${reais(L)}${nDep ? ` (com ${nDep} dependente(s))` : ''}`}; base ${reais(a.base)} × ${num(a.aliquota)}% − ${reais(a.deducaoFaixa)} = ${reais(a.bruto)}`
                        + `${a.memoriaRedutor.length ? ` (${a.memoriaRedutor.join(' ')})` : ''}.`);
                    r.avisos.push(folha
                        ? `A folha de ${rotuloCompetencia(e.perApur)} foi calculada com pagamento em ${rotuloCompetencia(folha.pagamento)}: o IRRF da complementar foi calculado sozinho. Pague as duas no mesmo mês ou confira o IRRF.`
                        : `Sem a folha de ${rotuloCompetencia(e.perApur)} deste funcionário: o IRRF da complementar foi calculado sozinho. Confira se houve outro pagamento no mês.`);
                }
                if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
                r.irrfApurado = { rendimentos: rend, deducoesLegais: inssAno, valor: ir };
                // O IRRF vai no último mês de referência do ano (no eSocial, um item no {perRef} dele).
                if (ir > 0) doAno[doAno.length - 1].verbas.push({ codigo: 'IRRF', descricao: 'IRRF sobre as diferenças', referencia: `${num(aliquota)}%`, tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
            }
        }
        // IRRF do 13º: tributação exclusiva; recalculado sobre o 13º pago + a diferença, menos o já retido.
        const meses13 = doAno.filter(m => m.bases13.irrf > 0);
        const rend13 = meses13.reduce((s, m) => s + m.bases13.irrf, 0);
        if (rend13 > 0 && !r.erros.length) {
            if ('erro' in tIr) r.erros.push(`IRRF do 13º: ${tIr.erro}`);
            else {
                const t = tIr.tabela;
                const inss13 = meses13.reduce((s, m) => s + m.inss13, 0);
                const pagos = (e.decimos ?? []).filter(y => y.fichaId === fichaId && meses13.some(m => m.perRef === y.perRef));
                const R0 = pagos.reduce((s, y) => s + y.rendimentosIrrf, 0); const L0 = pagos.reduce((s, y) => s + y.deducoesIrrf, 0); const I0 = pagos.reduce((s, y) => s + y.irrf, 0);
                const nDep = f.dependentes.filter(y => y.irrf === 'S' && y.pensao !== 'S').length;
                const L = pagos.length ? L0 + inss13 : inss13 + nDep * (t.valores.deducaoDependente ?? 0);
                const a = apurarIrrf(t, R0 + rend13, L);
                let ir = Math.max(0, a.valor - I0);
                r.memoria.push(`IRRF do 13º (exclusivo na fonte, tabela de ${rotuloCompetencia(t.vigencia)}): ${pagos.length ? `13º pago ${reais(R0)} + ` : ''}diferença ${reais(rend13)} = ${reais(R0 + rend13)}; `
                    + `${a.simplificado ? `desconto simplificado ${reais(a.deducao)}` : `deduções legais ${reais(L)}`}; base ${reais(a.base)} × ${num(a.aliquota)}% − ${reais(a.deducaoFaixa)} = ${reais(a.bruto)}`
                    + `${a.memoriaRedutor.length ? ` (${a.memoriaRedutor.join(' ')})` : ''}${pagos.length ? `; menos ${reais(I0)} já retidos` : ''} = ${reais(ir)}.`);
                if (!pagos.length) r.avisos.push('Sem o 13º pago: o IRRF da diferença do 13º foi calculado sobre ela sozinha. Confira.');
                if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF do 13º de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
                if (ir > 0) meses13[meses13.length - 1].verbas.push({ codigo: 'IRRF13', descricao: 'IRRF sobre a diferença do 13º', referencia: `${num(a.aliquota)}%`, tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
            }
        }
        if (r.erros.length) r.situacao = 'erro';
        r.avisos = [...new Set(r.avisos)];
        r.verbas = r.meses.flatMap(m => m.verbas.map(v => ({ ...v, referencia: v.referencia ? `${m.perRef.slice(5)}/${m.perRef.slice(0, 4)} · ${v.referencia}` : `${m.perRef.slice(5)}/${m.perRef.slice(0, 4)}` })));
        r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
        r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
        r.totais.liquido = r.totais.proventos - r.totais.descontos;
        const rescisorias = r.verbas.some(v => /^(AVISO|ART479|13PROP|13IND|FV|FVD|FP)/.test(v.codigo));
        if (!rescisorias && f.dados.dataDesligamento && dataValida(f.dados.dataDesligamento) && f.dados.dataDesligamento < `${e.perApur}-01`)
            r.avisos.push(`Desligado em ${brData(f.dados.dataDesligamento)}: inclua as rescisões (na tela) para as diferenças das verbas rescisórias (aviso, férias e 13º indenizados).`);
    }
    resultados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { resultados, erros: [], avisos };
}

/** Totais da complementar (para a tela e o resumo). */
export function totaisComplementar(rs: ResultadoComplementar[]) {
    const ok = rs.filter(r => r.situacao !== 'erro');
    return {
        funcionarios: ok.length,
        proventos: ok.reduce((s, r) => s + r.totais.proventos, 0),
        descontos: ok.reduce((s, r) => s + r.totais.descontos, 0),
        liquido: ok.reduce((s, r) => s + r.totais.liquido, 0),
        inss: ok.reduce((s, r) => s + r.meses.reduce((t, m) => t + m.inss + (m.inss13 ?? 0), 0), 0),
        irrf: ok.reduce((s, r) => s + r.verbas.filter(v => v.codigo === 'IRRF' || v.codigo === 'IRRF13').reduce((t, v) => t + v.valor, 0), 0),
        fgts: ok.reduce((s, r) => s + r.fgts, 0),
    };
}

/**
 * Sugestão a partir da convenção ou do acordo cadastrado no sindicato: o tipo (C ou A), a descrição e o reajuste
 * retroativo do mês "a partir de" até o mês anterior à competência. A data da celebração fica para a equipe.
 */
export function sugestaoDaConvencao(c: { tipo: 'CCT' | 'ACT'; registroMte: string; vigenciaInicio: string; vigenciaFim: string; reajuste: { percentual: number | null; aPartirDe: string } }, perApur: string, sindicato = ''): { instrumento: Instrumento; reajuste: ReajusteRetroativo } | null {
    const pct = c.reajuste.percentual;
    if (!pct || !competenciaValida(c.reajuste.aPartirDe) || !competenciaValida(perApur) || c.reajuste.aPartirDe >= perApur) return null;
    const ate = somarMeses(`${perApur}-01`, -1).slice(0, 7);
    const ano = (d: string) => d.slice(0, 4);
    const dsc = `${c.tipo === 'CCT' ? 'Convenção coletiva' : 'Acordo coletivo'}${sindicato ? ` ${sindicato}` : ''} ${ano(c.vigenciaInicio)}/${ano(c.vigenciaFim)}${c.registroMte ? `, registro MTE ${c.registroMte}` : ''}`.slice(0, 255);
    return { instrumento: { tpAcConv: c.tipo === 'CCT' ? 'C' : 'A', dsc }, reajuste: { pct, de: c.reajuste.aPartirDe, ate } };
}
