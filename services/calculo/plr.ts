// services/calculo/plr.ts
//
// Participação nos Lucros ou Resultados (Processos › Digitação PLR do IOB SAGE; Lei 10.101/2000):
// - não é salário: sem INSS e sem FGTS (Lei 8.212/1991, art. 28, § 9º, "j"; Lei 10.101/2000, art. 3º);
// - IRRF exclusivo na fonte, em separado dos demais rendimentos, pela tabela anual própria da PLR (art. 3º, § 5º, e
//   Anexo), cadastrada em Tabelas legais. Mais de um pagamento no mesmo ano: o imposto é refeito sobre o total do ano,
//   menos o já retido (§ 7º). A pensão alimentícia judicial sobre a PLR deduz da base (§ 6º);
// - no máximo 2 pagamentos no ano civil, com intervalo de pelo menos um trimestre civil (art. 3º, § 2º): aviso;
// - pode ser paga ao desligado (o S-1200 do mês do pagamento leva um demonstrativo próprio da PLR).
// Os valores ficam no movimento do mês do pagamento (Movimento.plr). O "Calcular proporcional" do SAGE: o valor do ano
// pelos meses trabalhados (mês com 15 dias ou mais conta).

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { inicioNaEmpresa } from '../cadastros/funcionarios';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { reais } from '../cadastros/documentos';
import type { Movimento, ResultadoCalculo, Verba } from './motorMensal';

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
const br = (d: string) => d.split('-').reverse().join('/');

/** PLR já paga no ano (valor, pensão e IRRF), para refazer o imposto sobre o total. */
export interface PlrAnterior { competencia: string; valor: number; pensao: number; irrf: number }

export interface EntradaPlr {
    ficha: FichaFuncionario;
    /** Mês do pagamento (AAAA-MM). */
    competencia: string;
    plr: NonNullable<Movimento['plr']>;
    tabelas: TabelaLegal[];
    /** PLR paga antes, no mesmo ano, pelo Consultor (plrDoAno). */
    anteriores?: PlrAnterior[];
}

export interface ResultadoPlr extends ResultadoCalculo {
    /** Data do pagamento (AAAA-MM-DD). */
    dataPlr: string;
    /** Totais do ano para o IRRF (com este pagamento). */
    plrAno: { valor: number; pensao: number; base: number; irrfTotal: number; irrfAnterior: number };
}

/** Meses trabalhados no ano (mês com 15 dias ou mais de vínculo conta), para a PLR proporcional. */
export function mesesTrabalhadosNoAno(d: FichaFuncionario['dados'], ano: number): number {
    const ini = inicioNaEmpresa(d);
    const fim = d.dataDesligamento ?? '';
    let n = 0;
    for (let m = 1; m <= 12; m++) {
        const mes = `${ano}-${String(m).padStart(2, '0')}`;
        const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
        const de = ini > `${mes}-01` ? ini : `${mes}-01`;
        const ate = fim && fim < `${mes}-${String(ultimo).padStart(2, '0')}` ? fim : `${mes}-${String(ultimo).padStart(2, '0')}`;
        if (!ini || de > ate) continue;
        const dias = Number(ate.slice(8)) - Number(de.slice(8)) + 1;
        if (de.slice(0, 7) === mes && ate.slice(0, 7) === mes && dias >= 15) n++;
    }
    return n;
}

/** Valor proporcional: valor integral do ano × meses trabalhados ÷ 12. */
export const plrProporcional = (valorIntegral: number, meses: number) => Math.round(valorIntegral * Math.max(0, Math.min(12, meses)) / 12);

/** IRRF pela tabela da PLR sobre a base (centavos). */
function irrfDaTabela(t: TabelaLegal, base: number): { valor: number; aliquota: number; deducao: number } {
    const f = t.faixas.find(x => x.ate === null || base <= x.ate) ?? t.faixas[t.faixas.length - 1];
    if (!f || base <= 0) return { valor: 0, aliquota: 0, deducao: 0 };
    return { valor: Math.max(0, Math.round(base * f.aliquota / 100 - f.deducao)), aliquota: f.aliquota, deducao: f.deducao };
}

export function calcularPlr(e: EntradaPlr): ResultadoPlr {
    const { ficha: f, competencia, plr } = e;
    const r: ResultadoPlr = {
        fichaId: f.id, nome: f.dados.nome || f.cpf, competencia, pagamento: competencia, situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [], dataPlr: plr.data,
        plrAno: { valor: 0, pensao: 0, base: 0, irrfTotal: 0, irrfAnterior: 0 },
    };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; };
    if (!(plr.valor > 0)) { erro('PLR sem valor.'); return r; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plr.data)) erro('PLR: informe a data do pagamento.');
    else if (plr.data.slice(0, 7) !== competencia) erro(`PLR paga em ${br(plr.data)}: lance no movimento de ${rotuloCompetencia(plr.data.slice(0, 7))}, o mês do pagamento.`);
    const pensao = Math.min(plr.pensao ?? 0, plr.valor);
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    verba({ codigo: 'PLR', descricao: 'Participação nos lucros ou resultados', referencia: '', tipo: 'provento', valor: plr.valor, inss: false, fgts: false, irrf: false });
    r.memoria.push(`PLR de ${reais(plr.valor)}${plr.data ? ` paga em ${br(plr.data)}` : ''}: sem INSS e sem FGTS (Lei 8.212/1991, art. 28, § 9º, "j"; Lei 10.101/2000, art. 3º).`);

    // IRRF exclusivo: o total do ano (com os pagamentos anteriores), menos a pensão sobre a PLR, pela tabela anual.
    const ant = e.anteriores ?? [];
    const valorAno = ant.reduce((s, a) => s + a.valor, 0) + (plr.anteriorValor ?? 0) + plr.valor;
    const pensaoAno = ant.reduce((s, a) => s + a.pensao, 0) + Math.min(plr.anteriorPensao ?? 0, plr.anteriorValor ?? 0) + pensao;
    const irrfAnterior = ant.reduce((s, a) => s + a.irrf, 0) + (plr.anteriorIrrf ?? 0);
    const base = Math.max(0, valorAno - pensaoAno);
    const t = tabelaVigente(e.tabelas, 'irrf_plr', competencia);
    let ir = 0;
    if ('erro' in t) erro(`IRRF da PLR: ${t.erro} Cadastre a tabela anual da PLR em Cadastros › Tabelas legais.`);
    else {
        const x = irrfDaTabela(t.tabela, base);
        ir = Math.max(0, x.valor - irrfAnterior);
        r.plrAno = { valor: valorAno, pensao: pensaoAno, base, irrfTotal: x.valor, irrfAnterior };
        const anteriores = valorAno - plr.valor;
        r.memoria.push(`IRRF da PLR (exclusivo na fonte, tabela de ${rotuloCompetencia(t.tabela.vigencia)}, ${t.tabela.norma}): `
            + `${anteriores ? `PLR do ano ${reais(valorAno)} (${reais(anteriores)} já paga + ${reais(plr.valor)} agora)` : `PLR ${reais(plr.valor)}`}`
            + `${pensaoAno ? ` − pensão alimentícia ${reais(pensaoAno)}` : ''} = base ${reais(base)} × ${pct(x.aliquota)} − ${reais(x.deducao)} = ${reais(x.valor)}`
            + `${irrfAnterior ? `; menos ${reais(irrfAnterior)} já retidos no ano = ${reais(ir)}` : ''} (Lei 10.101/2000, art. 3º, §§ 5º a 7º).`);
    }
    verba({ codigo: 'IRRFPLR', descricao: 'IRRF sobre PLR', referencia: '', tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
    if (pensao > 0) {
        verba({ codigo: 'PENSAOPLR', descricao: 'Pensão alimentícia sobre a PLR', referencia: '', tipo: 'desconto', valor: pensao, inss: false, fgts: false, irrf: false });
        r.memoria.push(`Pensão alimentícia sobre a PLR: ${reais(pensao)} (deduz da base do IRRF da PLR, § 6º).`);
    }
    // Periodicidade (art. 3º, § 2º): no máximo 2 vezes no ano e com intervalo de um trimestre civil.
    const pagamentos = ant.length + (plr.anteriorValor ? 1 : 0) + 1;
    if (pagamentos > 2) r.avisos.push(`PLR paga ${pagamentos} vezes no ano: a Lei 10.101/2000 (art. 3º, § 2º) permite no máximo 2. Fora da regra, a PLR pode perder a isenção de INSS e FGTS.`);
    const ultima = ant.map(a => a.competencia).filter(Boolean).sort().pop();
    if (ultima) {
        const tri = (c: string) => Number(c.slice(0, 4)) * 4 + Math.floor((Number(c.slice(5, 7)) - 1) / 3);
        if (tri(competencia) === tri(ultima)) r.avisos.push(`PLR paga no mesmo trimestre civil da anterior (${rotuloCompetencia(ultima)}): a lei pede intervalo de pelo menos um trimestre civil.`);
    }
    if (f.dados.dataDesligamento && f.dados.dataDesligamento < `${competencia}-01`) r.memoria.push(`Desligado em ${br(f.dados.dataDesligamento)}: a PLR vai no S-1200 de ${rotuloCompetencia(competencia)}, em demonstrativo próprio.`);
    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    return r;
}

/**
 * PLR da competência com os pagamentos anteriores do mesmo ano refeitos em ordem (o IRRF de cada um sobre o acumulado).
 * `movimentos`: os do funcionário por competência (o do mês pode ser o da tela, ainda não salvo).
 */
export function plrDoMes(ficha: FichaFuncionario, movimentos: Record<string, Movimento>, competencia: string, tabelas: TabelaLegal[]): ResultadoPlr | null {
    const ano = competencia.slice(0, 4);
    const meses = Object.keys(movimentos).filter(c => c.startsWith(`${ano}-`) && c <= competencia && movimentos[c]?.plr?.valor).sort();
    if (!meses.includes(competencia)) return null;
    const anteriores: PlrAnterior[] = [];
    let r: ResultadoPlr | null = null;
    for (const c of meses) {
        r = calcularPlr({ ficha, competencia: c, plr: movimentos[c].plr!, tabelas, anteriores: [...anteriores] });
        const v = (k: string) => r!.verbas.find(x => x.codigo === k)?.valor ?? 0;
        // A PLR paga fora do Consultor, informada neste mês, segue para os pagamentos seguintes do ano.
        const p = movimentos[c].plr!;
        if (p.anteriorValor || p.anteriorIrrf) anteriores.push({ competencia: '', valor: p.anteriorValor ?? 0, pensao: Math.min(p.anteriorPensao ?? 0, p.anteriorValor ?? 0), irrf: p.anteriorIrrf ?? 0 });
        anteriores.push({ competencia: c, valor: v('PLR'), pensao: v('PENSAOPLR'), irrf: v('IRRFPLR') });
    }
    return r;
}
