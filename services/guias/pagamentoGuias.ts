// services/guias/pagamentoGuias.ts
//
// Tributos › Pagamento de Guias do SAGE: a baixa das guias pagas da folha, no calendário de obrigações da empresa
// (services/prazos/obrigacoesEmpresa.ts). Guia é a obrigação que se paga: o DARF da DCTFWeb (e o do 13º), a guia do
// FGTS Digital, a contribuição sindical dos empregados, a patronal (GRCSU) e as guias sindicais da convenção. A baixa
// guarda a data, o valor pago e a autenticação do comprovante; o valor devido e o número do documento vêm do DARF
// emitido pela DCTFWeb da folha ou são digitados. Puro, sem Firebase.

import type { ObrigacaoEmpresa } from '../prazos/obrigacoesEmpresa';

/** De onde veio o valor da baixa: digitado, o recolhimento do FGTS Digital ou o pagamento registrado na Receita (PAGTOWEB). */
export type FontePagamento = 'manual' | 'fgts-digital' | 'receita';
export interface BaixaGuia {
    /** Data do pagamento (AAAA-MM-DD). */
    data: string;
    /** Centavos. */
    valorPago: number;
    /** Autenticação bancária ou número do comprovante. */
    autenticacao: string;
    fonte: FontePagamento;
}
export interface GuiaRegistrada {
    obrigacao: string;
    competencia: string;
    nome: string;
    vencimento: string;
    /** Centavos; 0 quando não informado. */
    valorDevido: number;
    numeroDocumento: string;
    pagamento: BaixaGuia | null;
    atualizadoPorEmail?: string;
    atualizadoEm?: string;
}

const PREFIXOS_GUIA = ['darf-', 'fgts-', 'sindical-anual-', 'sindical-patronal-', 'guia-'];
/** A obrigação é uma guia a pagar (e não uma declaração ou um prazo)? */
export const ehGuia = (obrigacaoId: string) => PREFIXOS_GUIA.some(p => obrigacaoId.startsWith(p));
export const idPagamento = (empresaId: string, obrigacaoId: string) => `${empresaId}_${obrigacaoId}`;
export const guiasDasObrigacoes = (os: ObrigacaoEmpresa[]) => os.filter(o => ehGuia(o.id));

const data = /^\d{4}-\d{2}-\d{2}$/;
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d: string) => d.split('-').reverse().join('/');
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);

/** Acréscimos de quem paga depois do vencimento, pelo tipo da guia (a tela só avisa; o valor vem da guia reemitida). */
export function acrescimosDoAtraso(obrigacaoId: string): string {
    if (obrigacaoId.startsWith('darf-')) return 'multa de mora de 0,33% ao dia, até 20%, e juros pela Selic (Lei 9.430/1996, art. 61); reemita o DARF com os acréscimos';
    if (obrigacaoId.startsWith('fgts-')) return 'multa e juros do FGTS em atraso (Lei 8.036/1990, art. 22); emita a guia de novo no FGTS Digital';
    if (obrigacaoId.startsWith('sindical-')) return 'multa e juros da CLT, art. 600';
    return 'os acréscimos da convenção coletiva';
}

/** Confere a baixa: data e valor obrigatórios, nada no futuro; atraso e valor a menor viram aviso. */
export function validarBaixa(b: BaixaGuia, guia: { obrigacao: string; vencimento: string; valorDevido: number }, hoje: string): { erros: string[]; avisos: string[] } {
    const erros: string[] = []; const avisos: string[] = [];
    if (!data.test(b.data) || Number.isNaN(Date.parse(b.data))) erros.push('Informe a data do pagamento.');
    else if (b.data > hoje) erros.push('A data do pagamento não pode ser futura.');
    if (!Number.isInteger(b.valorPago) || b.valorPago <= 0) erros.push('Informe o valor pago.');
    if (b.autenticacao.length > 80) erros.push('Autenticação: até 80 caracteres.');
    if (!erros.length) {
        if (data.test(guia.vencimento) && b.data > guia.vencimento) avisos.push(`Pago ${dias(guia.vencimento, b.data)} dia(s) depois do vencimento (${br(guia.vencimento)}): ${acrescimosDoAtraso(guia.obrigacao)}.`);
        if (guia.valorDevido > 0 && b.valorPago < guia.valorDevido) avisos.push(`Pago a menor: faltam ${reais(guia.valorDevido - b.valorPago)} do valor devido (${reais(guia.valorDevido)}).`);
    }
    return { erros, avisos };
}

export type EstadoGuia = 'paga' | 'paga-em-atraso' | 'paga-a-menor' | 'a-vencer' | 'vence-hoje' | 'vencida';
export const ROTULO_GUIA: Record<EstadoGuia, string> = {
    paga: 'paga', 'paga-em-atraso': 'paga em atraso', 'paga-a-menor': 'paga a menor', 'a-vencer': 'a vencer', 'vence-hoje': 'vence hoje', vencida: 'vencida sem baixa',
};

/** Situação da guia hoje, pela baixa (se houver) e pelo vencimento. */
export function situacaoDaGuia(vencimento: string, g: Pick<GuiaRegistrada, 'valorDevido' | 'pagamento'> | undefined, hoje: string): EstadoGuia {
    const p = g?.pagamento;
    if (p) {
        if (g!.valorDevido > 0 && p.valorPago < g!.valorDevido) return 'paga-a-menor';
        return p.data > vencimento ? 'paga-em-atraso' : 'paga';
    }
    return vencimento < hoje ? 'vencida' : vencimento === hoje ? 'vence-hoje' : 'a-vencer';
}

/** O texto que vai na marcação do calendário (entregue) quando a guia é baixada. */
export function observacaoDaBaixa(b: BaixaGuia): string {
    return [`paga em ${br(b.data)}`, reais(b.valorPago), b.autenticacao.trim() && `aut. ${b.autenticacao.trim()}`, b.fonte === 'fgts-digital' && 'valor conferido no FGTS Digital', b.fonte === 'receita' && 'pagamento conferido na Receita'].filter(Boolean).join(' · ');
}

/** Valor do FGTS Digital (consulta do recolhimento, em reais) que a baixa pode usar: só com o devido quitado. */
export function valorPagoNoFgts(r: { ok: boolean; depositoDevido: number; depositoRealizado: number }): { valorPago: number; valorDevido: number } | { erro: string } {
    if (!r.ok) return { erro: 'O FGTS Digital não respondeu.' };
    const devido = Math.round((Number(r.depositoDevido) || 0) * 100);
    const pago = Math.round((Number(r.depositoRealizado) || 0) * 100);
    if (pago <= 0) return { erro: 'O FGTS Digital não mostra recolhimento desta competência.' };
    if (devido > 0 && pago < devido) return { erro: `O FGTS Digital mostra ${reais(pago)} recolhidos de ${reais(devido)} devidos: confira antes de dar baixa.` };
    return { valorPago: pago, valorDevido: devido };
}

/** O que o CFI devolve da consulta de pagamentos (PAGTOWEB/PAGAMENTOS71), na parte que a baixa usa. */
export interface PagamentoReceita {
    numeroDocumento: string | null;
    dataArrecadacao: string | null;
    valorTotal: number | null;
    valorPrincipal: number | null;
    valorMulta: number | null;
    valorJuros: number | null;
}
export interface ConsultaPagamentosReceita {
    ok: boolean;
    fonte?: string;
    error?: string;
    situacoes?: { numeroDocumento: string; localizado: boolean; pagamento: PagamentoReceita | null; observacao?: string }[];
    avisos?: string[];
}

/** Número do documento como o CFI compara: sem pontuação, maiúsculo, até 17 posições. */
export const numeroDoDocumento = (n: string) => {
    const s = n.replace(/[\s.\-/]/g, '').toUpperCase();
    return /^[0-9A-Z]{1,17}$/.test(s) ? s : null;
};

/**
 * Pagamento registrado na Receita que a baixa do DARF pode usar: data de arrecadação e valor total pago.
 * Ausente não vira zero: sem data ou sem valor, a baixa continua manual. Não localizado não é "não pago".
 */
export function baixaPelaReceita(r: ConsultaPagamentosReceita, numeroDocumento: string): { data: string; valorPago: number; detalhe: string } | { erro: string } {
    const n = numeroDoDocumento(numeroDocumento);
    if (!n) return { erro: 'Informe o número do documento do DARF (até 17 posições) para conferir na Receita.' };
    if (!r.ok) return { erro: r.error || 'A Receita não respondeu.' };
    if (r.fonte !== 'serpro') return { erro: `O Consultor Fiscal respondeu em modo ${r.fonte || 'desconhecido'}, não com o pagamento da Receita.` };
    const s = r.situacoes?.find(x => x.numeroDocumento === n);
    if (!s) return { erro: 'A resposta da Receita não traz este documento.' };
    if (!s.localizado || !s.pagamento) return { erro: s.observacao || 'Documento não localizado na Receita; o pagamento leva alguns dias para aparecer.' };
    const p = s.pagamento;
    if (!p.dataArrecadacao || !data.test(p.dataArrecadacao)) return { erro: 'A Receita localizou o documento, mas não informou a data de arrecadação: confira no comprovante.' };
    if (typeof p.valorTotal !== 'number' || p.valorTotal <= 0) return { erro: 'A Receita localizou o documento, mas não informou o valor pago: confira no comprovante.' };
    const extra = [p.valorMulta ? `multa ${reais(Math.round(p.valorMulta * 100))}` : '', p.valorJuros ? `juros ${reais(Math.round(p.valorJuros * 100))}` : ''].filter(Boolean).join(', ');
    return {
        data: p.dataArrecadacao,
        valorPago: Math.round(p.valorTotal * 100),
        detalhe: `Receita: ${reais(Math.round(p.valorTotal * 100))} arrecadados em ${br(p.dataArrecadacao)}${extra ? ` (${extra})` : ''}.`,
    };
}

/** Totais da competência: devido, pago, guias em aberto e vencidas. */
export function resumoGuias(itens: { vencimento: string; guia?: GuiaRegistrada }[], hoje: string) {
    let devido = 0, pago = 0, abertas = 0, vencidas = 0;
    for (const i of itens) {
        devido += i.guia?.valorDevido ?? 0;
        pago += i.guia?.pagamento?.valorPago ?? 0;
        if (!i.guia?.pagamento) { abertas++; if (i.vencimento < hoje) vencidas++; }
    }
    return { devido, pago, abertas, vencidas };
}
