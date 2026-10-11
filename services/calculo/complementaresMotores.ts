// services/calculo/complementaresMotores.ts
//
// Diferenças que saem dos motores para a folha complementar (services/calculo/complementar.ts):
// - 13º complementar: a média das variáveis de dezembro, paga até 10 de janeiro (Decreto 10.854/2021, art. 77), no S-1200
//   de janeiro com tpAcConv J e {perRef} AAAA-12, rubrica de natureza 5005 (MOS, S-1200, item 19.2);
// - diferença do 13º pelo reajuste retroativo que pega dezembro (o 13º é pela remuneração de dezembro; MOS, item 18.13);
// - rescisão complementar: instrumento celebrado depois do desligamento, com as diferenças das verbas rescisórias no
//   {perRef} do mês do desligamento (MOS, item 18.10, exemplo 3). A rescisão é refeita com o salário reajustado.
// Cada um devolve as verbas por funcionário e mês e o 13º já pago (para o INSS e o IRRF da diferença do 13º).

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { dataValida, reais } from '../cadastros/documentos';
import { tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import type { Movimento, ResultadoCalculo, Verba } from './motorMensal';
import { calcular13 } from './motor13';
import { calcularRescisao, TIPOS_RESCISAO, type AvisoPrevio, type TipoRescisao } from './motorRescisao';
import type { DecimoPago, DiferencaCalculada, ReajusteRetroativo } from './complementar';

export interface DadosDosMotores {
    fichas: FichaFuncionario[];
    afastamentos: Afastamento[];
    /** Movimentos gravados por ficha e competência. */
    movimentos: Record<string, Record<string, Movimento>>;
    tabelas: TabelaLegal[];
}
export interface DiferencasDosMotores { diferencas: DiferencaCalculada[]; decimos: DecimoPago[]; avisos: string[] }

const v = (r: { verbas: Verba[] }, c: string) => r.verbas.filter(x => x.codigo === c).reduce((s, x) => s + x.valor, 0);
const br = (d: string) => d.split('-').reverse().join('/');
const nome = (f: FichaFuncionario) => f.dados.nome || f.matriculaEsocial || f.id;
const afastamentosDe = (d: DadosDosMotores, f: FichaFuncionario) => d.afastamentos.filter(a => !a.fichaId || a.fichaId === f.id);
const empregado = (f: FichaFuncionario) => /^1\d\d$/.test(f.dados.categoria || '101') && f.dados.categoria !== '111';

/** O 13º pago: base do INSS, INSS e IRRF do 13º, com as deduções do IRRF (INSS do 13º e dependentes). */
function decimoPago(r: ResultadoCalculo, f: FichaFuncionario, perRef: string, codigos: string[], tabelas: TabelaLegal[]): DecimoPago {
    const doDecimo = r.verbas.filter(x => codigos.includes(x.codigo));
    const inss = v(r, 'INSS13');
    const t = tabelaVigente(tabelas, 'irrf', r.pagamento);
    const porDep = 'erro' in t ? 0 : t.tabela.valores.deducaoDependente ?? 0;
    const nDep = f.dependentes.filter(x => x.irrf === 'S' && x.pensao !== 'S').length;
    return {
        fichaId: f.id, perRef,
        baseInss: doDecimo.filter(x => x.inss).reduce((s, x) => s + x.valor, 0), inss,
        rendimentosIrrf: doDecimo.filter(x => x.irrf).reduce((s, x) => s + x.valor, 0),
        deducoesIrrf: inss + nDep * porDep + v(r, 'PENSAO13'), irrf: v(r, 'IRRF13'),
    };
}

/** Quem estava no 13º de dezembro do ano: admitido até 31/12 e não desligado antes (o desligado recebe o 13º na rescisão). */
const no13 = (f: FichaFuncionario, ano: number) => !!f.dados.admissao && f.dados.admissao <= `${ano}-12-31`
    && !(f.dados.dataDesligamento && dataValida(f.dados.dataDesligamento) && f.dados.dataDesligamento < `${ano}-12-31`) && empregado(f);

/** 13º complementar do ano: o 13º com as variáveis de dezembro na média, menos o pago na 2ª parcela. */
export function complemento13(d: DadosDosMotores, ano: number): DiferencasDosMotores {
    const out: DiferencasDosMotores = { diferencas: [], decimos: [], avisos: [] };
    for (const f of d.fichas.filter(x => no13(x, ano))) {
        const base = { ano, parcela: '2a' as const, ficha: f, afastamentos: afastamentosDe(d, f), tabelas: d.tabelas, movimentos: d.movimentos[f.id] ?? {} };
        const pago = calcular13({ ...base, pagamento: `${ano}-12` });
        const comDezembro = calcular13({ ...base, pagamento: `${ano + 1}-01` });
        if (pago.situacao === 'erro' || comDezembro.situacao === 'erro') { out.avisos.push(`${nome(f)}: 13º não calculado (${[...pago.erros, ...comDezembro.erros][0] ?? 'erro'}).`); continue; }
        const dif = v(comDezembro, '13') - v(pago, '13');
        if (dif <= 0) continue;
        out.diferencas.push({ fichaId: f.id, perRef: `${ano}-12`, verbas: [{ codigo: '13COMP', descricao: '13º salário complementar (variáveis de dezembro)', referencia: `${reais(v(comDezembro, '13'))} − ${reais(v(pago, '13'))}`, tipo: 'provento', valor: dif, inss: true, fgts: true, irrf: true }] });
        out.decimos.push(decimoPago(pago, f, `${ano}-12`, ['13'], d.tabelas));
    }
    if (!out.diferencas.length) out.avisos.push(`Nenhuma diferença no 13º de ${ano}: as variáveis de dezembro (movimento gravado) não mudam a média.`);
    return out;
}

/** Diferença do 13º pelo reajuste retroativo (o reajuste vale em dezembro do ano): o percentual sobre o 13º pago. */
export function diferenca13DoReajuste(d: DadosDosMotores, ano: number, pct: number): DiferencasDosMotores {
    const out: DiferencasDosMotores = { diferencas: [], decimos: [], avisos: [] };
    for (const f of d.fichas.filter(x => no13(x, ano))) {
        const pago = calcular13({ ano, parcela: '2a', pagamento: `${ano}-12`, ficha: f, afastamentos: afastamentosDe(d, f), tabelas: d.tabelas, movimentos: d.movimentos[f.id] ?? {} });
        if (pago.situacao === 'erro') { out.avisos.push(`${nome(f)}: 13º de ${ano} não calculado (${pago.erros[0] ?? 'erro'}).`); continue; }
        const dif = Math.round(v(pago, '13') * pct / 100);
        if (dif <= 0) continue;
        out.diferencas.push({ fichaId: f.id, perRef: `${ano}-12`, verbas: [{ codigo: '13DIF', descricao: 'Diferença de 13º salário', referencia: `${String(pct).replace('.', ',')}% de ${reais(v(pago, '13'))}`, tipo: 'provento', valor: dif, inss: true, fgts: true, irrf: true }] });
        out.decimos.push(decimoPago(pago, f, `${ano}-12`, ['13'], d.tabelas));
    }
    out.avisos.push(`Diferença do 13º de ${ano} pelo 13º recalculado hoje (ficha, afastamentos e movimentos gravados): confira com o 13º pago.`);
    return out;
}

/** A ficha com o salário (e o histórico) reajustado. */
export function fichaReajustada(f: FichaFuncionario, pct: number): FichaFuncionario {
    const novo = (s?: string) => { const n = Number((s ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? (Math.round(n * (100 + pct)) / 100).toFixed(2) : s ?? ''; };
    return { ...f, dados: { ...f.dados, salario: novo(f.dados.salario) }, historicoSalario: f.historicoSalario?.map(h => ({ ...h, salario: novo(h.salario) })) };
}

/** Verbas rescisórias que acompanham o salário (as férias vencidas sem o período: FV2025-03-10 → FV). */
const RESCISORIAS = /^(AVISO|ART479|13PROP|13IND|FP|FP13|FV|FV13|FVD|FVD13)$/;
const chave = (c: string) => c.replace(/^(FVD13|FVD|FV13|FV)\d{4}-\d{2}-\d{2}$/, '$1');

/**
 * Rescisão complementar: os desligados com desligamento nos meses do reajuste. A rescisão é refeita com o salário
 * reajustado e a diferença de cada verba rescisória vai no mês do desligamento. O saldo de salário só entra quando
 * o holerite do mês não está na folha gravada (lá ele já é reajustado).
 */
export function diferencasDaRescisao(d: DadosDosMotores, reajuste: ReajusteRetroativo, gravadas: Record<string, ResultadoCalculo[]>): DiferencasDosMotores {
    const out: DiferencasDosMotores = { diferencas: [], decimos: [], avisos: [] };
    for (const f of d.fichas.filter(empregado)) {
        const data = f.dados.dataDesligamento ?? '';
        if (!dataValida(data) || data.slice(0, 7) < reajuste.de || data.slice(0, 7) > reajuste.ate) continue;
        const tipo = (f.dados.motivoDesligamento ?? '') as TipoRescisao;
        if (!(tipo in TIPOS_RESCISAO)) { out.avisos.push(`${nome(f)}, desligado em ${br(data)}: motivo ${tipo || '(em branco)'} não coberto pelo motor de rescisão; lance as diferenças.`); continue; }
        // O tipo de aviso não fica gravado: indenizado quando a data projetada passa do desligamento.
        const aviso: AvisoPrevio = f.dados.dataProjetadaAviso && f.dados.dataProjetadaAviso > data ? 'indenizado' : 'trabalhado';
        const base = { data, tipo, aviso, afastamentos: afastamentosDe(d, f), tabelas: d.tabelas, movimentos: d.movimentos[f.id] ?? {} };
        const antes = calcularRescisao({ ...base, ficha: f });
        const depois = calcularRescisao({ ...base, ficha: fichaReajustada(f, reajuste.pct) });
        if (antes.situacao === 'erro' || depois.situacao === 'erro') { out.avisos.push(`${nome(f)}: rescisão não recalculada (${[...antes.erros, ...depois.erros][0] ?? 'erro'}).`); continue; }
        const mes = data.slice(0, 7);
        const noHolerite = (gravadas[mes] ?? []).some(h => h.fichaId === f.id && h.situacao !== 'erro');
        const conta = (c: string) => RESCISORIAS.test(c) || (c === 'SAL' && !noHolerite);
        const somar = (vs: Verba[]) => { const m = new Map<string, Verba>(); for (const x of vs) { if (x.tipo !== 'provento' || !conta(chave(x.codigo))) continue; const k = chave(x.codigo); const a = m.get(k); m.set(k, a ? { ...a, valor: a.valor + x.valor } : { ...x, codigo: k }); } return m; };
        const m0 = somar(antes.verbas); const m1 = somar(depois.verbas);
        const verbas: Verba[] = [];
        for (const [k, x] of m1) {
            const dif = x.valor - (m0.get(k)?.valor ?? 0);
            if (dif > 0) verbas.push({ ...x, descricao: `Diferença de ${x.descricao.charAt(0).toLowerCase()}${x.descricao.slice(1)}`, referencia: `${String(reajuste.pct).replace('.', ',')}%`, valor: dif });
        }
        if (!verbas.length) continue;
        out.diferencas.push({ fichaId: f.id, perRef: mes, verbas, avisos: [`Rescisão de ${br(data)} refeita com o salário reajustado (${TIPOS_RESCISAO[tipo]}, aviso ${aviso === 'indenizado' ? 'indenizado' : 'trabalhado ou dispensado'}, pela ficha): confira com o TRCT.`] });
        if (verbas.some(x => x.codigo === '13PROP' || x.codigo === '13IND')) out.decimos.push(decimoPago(antes, f, mes, ['13PROP', '13IND'], d.tabelas));
    }
    return out;
}

/** Junta as diferenças de vários cálculos. */
export const juntarDiferencas = (...xs: DiferencasDosMotores[]): DiferencasDosMotores => ({
    diferencas: xs.flatMap(x => x.diferencas), decimos: xs.flatMap(x => x.decimos), avisos: xs.flatMap(x => x.avisos),
});
