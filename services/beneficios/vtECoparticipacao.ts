// services/beneficios/vtECoparticipacao.ts
//
// Benefícios do dia a dia do DP (Paulo, 11/10/2026, pendência do catálogo SAGE "Vale Transporte / Controle de
// Benefícios"):
// - Pedido de vale-transporte: o itinerário de cada funcionário (linhas, tarifa e viagens por dia) e os dias da semana
//   em que ele se desloca; a quantidade a comprar no mês de uso conta esses dias, menos os feriados nacionais, as
//   férias e os afastamentos lançados e os dias fora do vínculo (admissão e desligamento). Total por operadora, para o
//   pedido no portal (SPTrans, BOM, Metrô…). O desconto de 6% da folha continua no motor; o custo do pedido limita o
//   desconto quando for menor (Lei 7.418/1985, art. 4º, parágrafo único; Decreto 10.854/2021, art. 112).
// - Coparticipação do plano de saúde: a planilha da operadora (CPF e valor) vira o desconto do mês na folha, como um
//   lançamento avulso sem INSS, FGTS e IRRF (não é remuneração; Lei 8.212/1991, art. 28, § 9º, q).

import * as XLSX from 'xlsx';
import { diasEntre, feriado, somarDias } from '../prazos/calendario';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import type { Movimento } from '../calculo/motorMensal';
import { centavosDeTexto, cpfValido } from '../cadastros/documentos';

export const OPERADORAS_VT = ['SPTrans (Bilhete Único)', 'BOM (EMTU)', 'TOP (Metrô/CPTM)', 'Metrô', 'CPTM', 'EMTU', 'Outra'];

export interface LinhaVt { operadora: string; descricao: string; /** Tarifa em centavos. */ tarifa: number; viagensDia: number }
/** Itinerário do funcionário: vt_itinerarios/{fichaId}. Dias da semana: 0 = domingo … 6 = sábado. */
export interface ItinerarioVt { empresaId: string; fichaId: string; linhas: LinhaVt[]; diasSemana: number[] }

export const itinerarioVazio = (empresaId: string, fichaId: string): ItinerarioVt => ({ empresaId, fichaId, linhas: [], diasSemana: [1, 2, 3, 4, 5] });

export function validarItinerario(i: ItinerarioVt): string[] {
    const e: string[] = [];
    if (!i.diasSemana.length) e.push('Marque os dias da semana em que ele se desloca.');
    if (i.diasSemana.some(d => !Number.isInteger(d) || d < 0 || d > 6)) e.push('Dia da semana inválido.');
    if (!i.linhas.length) e.push('Inclua ao menos uma linha.');
    i.linhas.forEach((l, k) => {
        if (!l.operadora.trim()) e.push(`Linha ${k + 1}: operadora.`);
        if (!(l.tarifa > 0)) e.push(`Linha ${k + 1}: tarifa.`);
        if (!(l.viagensDia > 0 && l.viagensDia <= 10 && Number.isInteger(l.viagensDia))) e.push(`Linha ${k + 1}: viagens por dia (1 a 10).`);
    });
    return e;
}

const fimDoMes = (c: string) => { const [a, m] = c.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const diaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Dias de uso no mês: os dias da semana marcados, fora feriados nacionais, afastamentos e o que estiver fora do vínculo. */
export function diasDeUso(mesUso: string, i: Pick<ItinerarioVt, 'diasSemana'>, ficha: Pick<FichaFuncionario, 'dados'>, afastamentos: Pick<Afastamento, 'dtInicio' | 'dtFim'>[]): { dias: number; fora: { feriados: number; afastados: number; foraDoVinculo: number } } {
    const ini = `${mesUso}-01`; const fim = fimDoMes(mesUso);
    const fora = { feriados: 0, afastados: 0, foraDoVinculo: 0 };
    let dias = 0;
    for (let k = 0, d = ini; k <= diasEntre(ini, fim); k++, d = somarDias(ini, k)) {
        if (!i.diasSemana.includes(diaSemana(d))) continue;
        if ((ficha.dados.admissao && d < ficha.dados.admissao) || (ficha.dados.dataDesligamento && d > ficha.dados.dataDesligamento)) { fora.foraDoVinculo++; continue; }
        if (feriado(d)) { fora.feriados++; continue; }
        if (afastamentos.some(a => a.dtInicio && a.dtInicio <= d && (!a.dtFim || a.dtFim >= d))) { fora.afastados++; continue; }
        dias++;
    }
    return { dias, fora };
}

export interface ItemPedido { operadora: string; descricao: string; tarifa: number; quantidade: number; valor: number }
export interface PedidoFicha { fichaId: string; nome: string; dias: number; itens: ItemPedido[]; total: number; custoFicha: number; observacao: string }
export interface PedidoVt { mesUso: string; fichas: PedidoFicha[]; porOperadora: { operadora: string; quantidade: number; valor: number }[]; total: number; semItinerario: string[] }

/** Pedido do mês de uso para quem tem VT na ficha e vínculo no mês. */
export function pedidoVt(mesUso: string, fichas: FichaFuncionario[], itinerarios: ItinerarioVt[], afastamentos: Afastamento[]): PedidoVt {
    const ini = `${mesUso}-01`; const fim = fimDoMes(mesUso);
    const porFicha = new Map(itinerarios.map(i => [i.fichaId, i]));
    const out: PedidoVt = { mesUso, fichas: [], porOperadora: [], total: 0, semItinerario: [] };
    const ops = new Map<string, { quantidade: number; valor: number }>();
    for (const f of fichas) {
        if (f.dados.valeTransporte !== 'S') continue;
        if ((f.dados.admissao && f.dados.admissao > fim) || (f.dados.dataDesligamento && f.dados.dataDesligamento < ini)) continue;
        const nome = f.dados.nome || f.cpf;
        const it = porFicha.get(f.id);
        if (!it || !it.linhas.length) { out.semItinerario.push(nome); continue; }
        const { dias, fora } = diasDeUso(mesUso, it, f, afastamentos.filter(a => a.fichaId === f.id));
        const itens = it.linhas.map(l => ({ operadora: l.operadora, descricao: l.descricao, tarifa: l.tarifa, quantidade: dias * l.viagensDia, valor: dias * l.viagensDia * l.tarifa }));
        const total = itens.reduce((s, x) => s + x.valor, 0);
        const obs = [fora.feriados && `${fora.feriados} feriado(s)`, fora.afastados && `${fora.afastados} dia(s) de férias/afastamento`, fora.foraDoVinculo && `${fora.foraDoVinculo} dia(s) fora do vínculo`].filter(Boolean).join(', ');
        out.fichas.push({ fichaId: f.id, nome, dias, itens, total, custoFicha: centavosDeTexto(f.dados.valeTransporteCusto ?? '') ?? 0, observacao: obs ? `Fora: ${obs}.` : '' });
        for (const x of itens) { const o = ops.get(x.operadora) ?? { quantidade: 0, valor: 0 }; o.quantidade += x.quantidade; o.valor += x.valor; ops.set(x.operadora, o); }
        out.total += total;
    }
    out.fichas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    out.porOperadora = [...ops].map(([operadora, o]) => ({ operadora, ...o })).sort((a, b) => a.operadora.localeCompare(b.operadora, 'pt-BR'));
    return out;
}

// ─── Coparticipação ─────────────────────────────────────────────────────────

export const DESCRICAO_COPART = 'Coparticipação do plano de saúde';
export interface LinhaCopart { linha: number; cpf: string; nome: string; valor: number }

const chave = (t: unknown) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Planilha da operadora (XLSX ou CSV): acha as colunas de CPF, nome e valor pelo cabeçalho. */
export function lerPlanilhaCoparticipacao(bytes: ArrayBuffer | Uint8Array): { linhas: LinhaCopart[]; avisos: string[] } {
    const wb = XLSX.read(bytes, { type: 'array', raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const m = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
    const avisos: string[] = [];
    const iCab = m.findIndex(r => r.some(c => /cpf/.test(chave(c))) && r.some(c => /valor|coparticip|total/.test(chave(c))));
    if (iCab < 0) return { linhas: [], avisos: ['Não achei o cabeçalho com as colunas de CPF e de valor (ex.: "CPF" e "Valor").'] };
    const cab = m[iCab].map(chave);
    const iCpf = cab.findIndex(c => /cpf/.test(c));
    const iValor = [cab.findIndex(c => /coparticip/.test(c)), cab.findIndex(c => /^valor/.test(c)), cab.findIndex(c => /valor|total/.test(c))].find(i => i >= 0)!;
    const iNome = cab.findIndex(c => /nome|beneficiario|titular/.test(c));
    const linhas: LinhaCopart[] = [];
    m.slice(iCab + 1).forEach((r, k) => {
        const cpf = String(r[iCpf] ?? '').replace(/\D/g, '').padStart(11, '0');
        const bruto = r[iValor];
        const valor = typeof bruto === 'number' ? Math.round(bruto * 100) : centavosDeTexto(String(bruto ?? '')) ?? 0;
        if (!String(r[iCpf] ?? '').trim() && !valor) return;
        if (!cpfValido(cpf)) { avisos.push(`Linha ${iCab + k + 2}: CPF inválido (${r[iCpf]}).`); return; }
        if (!(valor > 0)) return;
        linhas.push({ linha: iCab + k + 2, cpf, nome: iNome >= 0 ? String(r[iNome] ?? '').trim() : '', valor });
    });
    return { linhas, avisos };
}

/** Soma por CPF e liga à ficha com vínculo na competência. Dependente sai no CPF do titular (a planilha já agrupa). */
export function coparticipacaoPorFicha(linhas: LinhaCopart[], fichas: FichaFuncionario[], competencia: string): { porFicha: Map<string, number>; semFicha: LinhaCopart[] } {
    const ini = `${competencia}-01`; const fim = fimDoMes(competencia);
    const porFicha = new Map<string, number>(); const semFicha: LinhaCopart[] = [];
    for (const l of linhas) {
        const f = fichas.find(x => x.cpf.replace(/\D/g, '') === l.cpf && (!x.dados.admissao || x.dados.admissao <= fim) && (!x.dados.dataDesligamento || x.dados.dataDesligamento >= ini));
        if (!f) { semFicha.push(l); continue; }
        porFicha.set(f.id, (porFicha.get(f.id) ?? 0) + l.valor);
    }
    return { porFicha, semFicha };
}

/** O movimento com a coparticipação do mês (substitui a lançada antes por este mesmo caminho). */
export function comCoparticipacao(mov: Movimento | null, valor: number): Movimento {
    const outros = (mov?.lancamentos ?? []).filter(l => l.descricao !== DESCRICAO_COPART);
    return { ...(mov ?? {}), lancamentos: [...outros, ...(valor > 0 ? [{ descricao: DESCRICAO_COPART, tipo: 'desconto' as const, valor, inss: false, fgts: false, irrf: false }] : [])] };
}
