// services/calculo/conferenciaHolerites.ts
//
// Conferência do motor de cálculo contra os holerites do IOB. O PDF é lido
// pelo Gemini no CFI (rota /holerites/extrair), que só TRANSCREVE; aqui ficam
// as partes que decidem, todas sem IA:
// - classificar cada verba do IOB pela descrição (salário, horas extras, INSS…);
// - ligar o holerite à ficha (CPF, código do IOB ou nome);
// - comparar com o resultado do motor, item a item, com tolerância de 1 centavo;
// - sugerir o movimento do mês a partir do holerite (horas, faltas, pensão,
//   outros lançamentos), para a equipe aplicar e salvar.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Lancamento, Movimento, ResultadoCalculo } from './motorMensal';

export interface VerbaHolerite { codigo: string; descricao: string; referencia: string; provento: number; desconto: number }
export interface HoleriteIob {
    pagina: number | null; nome: string; cpf: string; codigo: string; competencia: string; cargo: string;
    verbas: VerbaHolerite[];
    salarioBase: number | null; totalProventos: number | null; totalDescontos: number | null; liquido: number | null;
    baseInss: number | null; baseFgts: number | null; fgtsMes: number | null; baseIrrf: number | null;
    avisos: string[];
}

export type Classe = 'SAL' | 'MAT' | 'HE50' | 'HE100' | 'DSRHE' | 'FALTA' | 'DSRF' | 'SF' | 'PENSAO' | 'ADIANT' | 'VT' | 'INSS' | 'IRRF' | 'FERMES' | 'FERPAGO' | 'OUTRO';
export const ROTULO_CLASSE: Record<Classe, string> = {
    SAL: 'Salário', MAT: 'Salário-maternidade', HE50: 'Horas extras 50%', HE100: 'Horas extras 100%', DSRHE: 'DSR sobre horas extras',
    FALTA: 'Faltas', DSRF: 'DSR descontado', SF: 'Salário-família', PENSAO: 'Pensão alimentícia', ADIANT: 'Adiantamento salarial', VT: 'Vale-transporte', INSS: 'INSS', IRRF: 'IRRF',
    FERMES: 'Férias + 1/3 do mês', FERPAGO: 'Férias pagas no recibo', OUTRO: 'Outros',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Classe da verba pela descrição impressa no holerite. Proposta: quem confere é a equipe. */
export function classificarVerba(v: VerbaHolerite): Classe {
    const d = norm(v.descricao);
    const desconto = v.desconto > 0 && !v.provento;
    if (/MATERNIDADE/.test(d)) return 'MAT';
    if (/SAL(ARIO)?\.? ?-?FAM/.test(d)) return 'SF';
    if (/PENS(AO|\.) ?ALIM|^PENSAO/.test(d)) return 'PENSAO';
    if (desconto && /\bI\.?R\.?R\.?F\b|IMPOSTO DE RENDA|^IR\b|I\.R\.? ?FONTE/.test(d)) return 'IRRF';
    if (desconto && /\bINSS\b|PREVIDENCIA|I\.N\.S\.S/.test(d)) return 'INSS';
    // Desconto do adiantamento salarial ("ADIANTAMENTO (VALE)" no IOB) e do vale-transporte; arredondamentos ficam em "outros".
    if (desconto && /ADIANT/.test(d) && !/FERIAS|13|ARRED/.test(d)) return 'ADIANT';
    if (desconto && /VALE[ -]?TRANSP|\bV\.? ?T\.?$|^V\.? ?T\b/.test(d)) return 'VT';
    // Férias no holerite do mês (pagas antes no recibo): provento = férias e 1/3; desconto = o líquido/valor já pago.
    if (/FERIAS/.test(d) && !/ABONO/.test(d)) return desconto ? 'FERPAGO' : 'FERMES';
    const extra = /EXTRA|\bH\.? ?E\b|\bHE\b/.test(d);
    // DSR pago só é o reflexo das horas extras quando diz isso, ou quando vem sem
    // qualificação ("D.S.R.", "REFLEXO DSR"); DSR sobre comissões, adicional
    // noturno etc. fica em "outros" e vira lançamento avulso.
    if (/D\.?S\.?R|REPOUSO|DESCANSO SEMANAL|\bRSR\b/.test(d)) return desconto ? 'DSRF' : extra || !/S\/|SOBRE/.test(d) ? 'DSRHE' : 'OUTRO';
    if (extra && /100/.test(d)) return 'HE100';
    if (extra && /50/.test(d)) return 'HE50';
    if (desconto && /FALTA|AUSENCIA/.test(d)) return 'FALTA';
    if (!desconto && /^SAL(ARIO|\.)|SALDO DE SAL|HORAS NORMAIS|DIAS? TRABALHADOS|SALARIO (MENSAL|BASE|NORMAL|HORA)|^ORDENADO/.test(d)) return 'SAL';
    return 'OUTRO';
}

const semZeros = (s: string) => s.trim().replace(/^0+(?=.)/, '');

/** Ficha do holerite: CPF; senão código do IOB; senão o nome idêntico (com aviso). */
export function ligarHolerite(h: HoleriteIob, fichas: FichaFuncionario[]): { ficha: FichaFuncionario | null; por: 'cpf' | 'codigo' | 'nome' | '' } {
    if (h.cpf) { const f = fichas.filter(x => x.cpf === h.cpf); if (f.length === 1) return { ficha: f[0], por: 'cpf' }; if (f.length > 1) { const a = f.find(x => x.situacao === 'ativo'); if (a) return { ficha: a, por: 'cpf' }; } }
    if (h.codigo) { const f = fichas.filter(x => x.dados.codigoIob && semZeros(x.dados.codigoIob) === semZeros(h.codigo)); if (f.length === 1) return { ficha: f[0], por: 'codigo' }; }
    if (h.nome) { const f = fichas.filter(x => norm(x.dados.nome ?? '') === norm(h.nome)); if (f.length === 1) return { ficha: f[0], por: 'nome' }; }
    return { ficha: null, por: '' };
}

export interface LinhaConferencia { item: string; motor: number; iob: number; diferenca: number; ok: boolean }
export interface ConferenciaFuncionario {
    fichaId: string; nome: string; ligadoPor: string;
    situacao: 'confere' | 'diverge' | 'sem cálculo' | 'ilegível' | 'outra competência';
    linhas: LinhaConferencia[];
    /** Verbas do IOB que o motor não tem (lance como movimento ou confira). */
    semCorrespondente: VerbaHolerite[];
    avisos: string[];
}

const TOLERANCIA = 1; // centavo
const ITENS: Classe[] = ['SAL', 'MAT', 'HE50', 'HE100', 'DSRHE', 'FALTA', 'DSRF', 'SF', 'PENSAO', 'ADIANT', 'VT', 'FERMES', 'FERPAGO', 'INSS', 'IRRF'];

export function somaPorClasse(h: HoleriteIob): Record<Classe, number> {
    const s = Object.fromEntries([...ITENS, 'OUTRO'].map(c => [c, 0])) as Record<Classe, number>;
    for (const v of h.verbas) s[classificarVerba(v)] += v.provento || v.desconto;
    return s;
}

/** Só holerite comparado de fato (confere ou diverge) pode virar movimento. */
export const podeAplicar = (c: ConferenciaFuncionario | null) => !!c && !!c.fichaId && (c.situacao === 'confere' || c.situacao === 'diverge');

const mesAno = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;

/**
 * Compara o resultado do motor com o holerite do IOB, item a item.
 * `ctx` traz a ficha ligada e a competência conferida: holerite de outro mês
 * não é comparado, e holerite sem nenhum valor lido nunca "confere".
 */
export function conferirHolerite(r: ResultadoCalculo | undefined, h: HoleriteIob, ligadoPor: string, ctx: { fichaId: string; nome: string; competencia: string }): ConferenciaFuncionario {
    const avisos = [...h.avisos];
    if (ligadoPor === 'nome') avisos.push('Holerite ligado à ficha pelo nome (sem CPF ou código do IOB no holerite): confira.');
    const semCorrespondente = h.verbas.filter(v => classificarVerba(v) === 'OUTRO');
    const base = { fichaId: ctx.fichaId, nome: ctx.nome || h.nome, ligadoPor, semCorrespondente };
    if (h.competencia && h.competencia !== ctx.competencia) {
        return { ...base, situacao: 'outra competência', linhas: [], avisos: [...avisos, `Holerite de ${mesAno(h.competencia)}; a competência conferida é ${mesAno(ctx.competencia)}. Não comparado.`] };
    }
    if (!h.competencia) avisos.push('Competência não lida no holerite: confira se o PDF é do mês certo.');
    if (!r || r.situacao === 'erro') {
        return { ...base, situacao: 'sem cálculo', linhas: [], avisos: [...avisos, ...(r?.erros ?? ['Sem cálculo do motor para esta ficha na competência.'])] };
    }
    const iob = somaPorClasse(h);
    // INSS e IRRF do motor incluem o que foi retido no recibo de férias (o IOB pode imprimir em linhas separadas).
    const codigos: Partial<Record<Classe, string[]>> = { INSS: ['INSS', 'INSSFERRET'], IRRF: ['IRRF', 'IRRFFERRET'], FERMES: ['FERMES', 'FERMES13'] };
    const motor = (c: Classe) => r.verbas.filter(v => (codigos[c] ?? [c]).includes(v.codigo)).reduce((s, v) => s + v.valor, 0);
    const linha = (item: string, m: number, i: number): LinhaConferencia => ({ item, motor: m, iob: i, diferenca: m - i, ok: Math.abs(m - i) <= TOLERANCIA });
    const doIob = ITENS.filter(c => iob[c]);
    const totaisLidos = [h.totalProventos, h.totalDescontos, h.liquido, h.baseInss, h.baseFgts, h.fgtsMes].some(v => v !== null);
    if (!doIob.length && !semCorrespondente.length && !totaisLidos) {
        return { ...base, situacao: 'ilegível', linhas: [], avisos: [...avisos, 'Nenhum valor lido neste holerite: confira o PDF.'] };
    }
    const linhas: LinhaConferencia[] = ITENS.filter(c => motor(c) || iob[c]).map(c => linha(ROTULO_CLASSE[c], motor(c), iob[c]));
    if (h.totalProventos !== null) linhas.push(linha('Total de proventos', r.totais.proventos, h.totalProventos));
    if (h.totalDescontos !== null) linhas.push(linha('Total de descontos', r.totais.descontos, h.totalDescontos));
    if (h.liquido !== null) linhas.push(linha('Líquido', r.totais.liquido, h.liquido));
    if (h.baseInss !== null) linhas.push(linha('Base do INSS', r.bases.inss, h.baseInss));
    if (h.baseFgts !== null) linhas.push(linha('Base do FGTS', r.bases.fgts, h.baseFgts));
    if (h.fgtsMes !== null) linhas.push(linha('FGTS do mês', r.fgts, h.fgtsMes));
    const lancados = r.verbas.filter(v => v.codigo.startsWith('LAN')).length;
    if (semCorrespondente.length && lancados) avisos.push('Há lançamentos avulsos no movimento: confira se cobrem as verbas do IOB sem correspondente.');
    if (r.situacao === 'incompleto') avisos.push('Cálculo do motor incompleto (férias, rescisão…): a diferença pode vir daí.');
    const situacao = linhas.length > 0 && linhas.every(l => l.ok) && (!semCorrespondente.length || lancados >= semCorrespondente.length) ? 'confere' : 'diverge';
    return { ...base, fichaId: r.fichaId, nome: r.nome, situacao, linhas, avisos };
}

/** "10,50" → 10.5; "10:30" → 10.5; vazio ou ilegível → 0. */
export function quantidadeDaReferencia(ref: string): number {
    const t = ref.trim();
    let m = t.match(/^(\d{1,3}):(\d{2})$/);
    if (m) return Number(m[1]) + Number(m[2]) / 60;
    m = t.match(/^(\d{1,3})(?:[,.](\d{1,2}))?$/);
    if (m) return Number(`${m[1]}.${m[2] ?? '0'}`);
    return 0;
}

/**
 * Movimento do mês que o holerite indica: horas extras e faltas pela
 * referência, pensão pelo valor e as demais verbas como lançamentos avulsos
 * (provento incide em tudo; desconto em nada — confira as incidências).
 */
export function movimentoDoHolerite(h: HoleriteIob): { movimento: Movimento; avisos: string[] } {
    const mov: Movimento = {}; const avisos: string[] = []; const lancamentos: Lancamento[] = [];
    const somar = (k: 'horasExtras50' | 'horasExtras100' | 'faltasDias' | 'dsrDescontadoDias', v: VerbaHolerite) => {
        const q = quantidadeDaReferencia(v.referencia);
        if (!q) { avisos.push(`${v.descricao}: referência "${v.referencia}" ilegível; informe a quantidade.`); return; }
        mov[k] = Math.round(((mov[k] ?? 0) + q) * 100) / 100;
    };
    for (const v of h.verbas) {
        const c = classificarVerba(v);
        if (c === 'HE50') somar('horasExtras50', v);
        else if (c === 'HE100') somar('horasExtras100', v);
        else if (c === 'FALTA') somar('faltasDias', v);
        else if (c === 'DSRF') somar('dsrDescontadoDias', v);
        else if (c === 'PENSAO') mov.pensaoAlimenticia = (mov.pensaoAlimenticia ?? 0) + (v.desconto || v.provento);
        // O adiantamento pago e o vale-transporte descontado valem como o IOB fez (sobrepõem a ficha).
        else if (c === 'ADIANT') mov.adiantamento = (mov.adiantamento ?? 0) + (v.desconto || v.provento);
        else if (c === 'VT') mov.valeTransporte = (mov.valeTransporte ?? 0) + (v.desconto || v.provento);
        else if (c === 'OUTRO') {
            const provento = v.provento > 0;
            lancamentos.push({ descricao: `${v.codigo ? `${v.codigo} ` : ''}${v.descricao}`.trim(), tipo: provento ? 'provento' : 'desconto', valor: v.provento || v.desconto, inss: provento, fgts: provento, irrf: provento });
        }
    }
    // Sem adiantamento ou VT no holerite do IOB, o mês não teve: 0 explícito, senão o motor volta à ficha e
    // inventa o desconto (Codex #115).
    if (mov.adiantamento === undefined) mov.adiantamento = 0;
    if (mov.valeTransporte === undefined) mov.valeTransporte = 0;
    if (lancamentos.length) { mov.lancamentos = lancamentos; avisos.push('Lançamentos trazidos do holerite: confira as incidências de cada um (provento entrou incidindo em tudo; desconto, em nada).'); }
    return { movimento: mov, avisos };
}
