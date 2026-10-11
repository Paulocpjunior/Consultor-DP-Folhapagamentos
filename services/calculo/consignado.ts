// services/calculo/consignado.ts
//
// Crédito do Trabalhador (empréstimo consignado do empregado CLT, Lei 10.820/2003): os contratos ficam na ficha do
// funcionário (instituição pela Tabela 37 do eSocial, número do contrato, parcela e meses), e a folha desconta a
// parcela de cada contrato vigente no mês dentro da margem: 35% da remuneração disponível (art. 2º, § 2º, I; a
// remuneração menos INSS, IRRF e pensão alimentícia) e sem deixar o líquido negativo. Na rescisão, o desconto sai das
// verbas rescisórias no mesmo limite. Cada desconto vai ao eSocial numa rubrica de natureza 9253 com o grupo descFolha
// (tpDesc 1, instFinanc, nrDoc), um item por contrato, no S-1200 e no S-2299 (XSD S-1.3, T_descFolha).
// A parcela que não couber na margem fica com o aviso: a instituição cobra a diferença do empregado. Puro.

import type { Verba } from './motorMensal';

export interface ContratoConsignado {
    /** Código da instituição financeira na Tabela 37 do eSocial (3 dígitos). */
    instFinanc: string;
    /** Número do contrato (2 a 15 caracteres: letras, números e . / - _ no meio). */
    nrDoc: string;
    /** Parcela mensal em centavos. */
    parcela: number;
    /** Primeiro e último mês de desconto (AAAA-MM); sem fim, até a quitação. */
    inicio: string;
    fim?: string;
    /** Saldo devedor informado pela instituição para a rescisão (centavos); sem ele, a rescisão desconta a parcela do mês. */
    saldoRescisao?: number;
    observacao?: string;
}

export const PCT_MARGEM_CONSIGNADO = 35;
/** TS_nrDoc do XSD S-1.3. */
export const NR_DOC_CONSIGNADO = /^[A-Za-z0-9][-_A-Za-z0-9/.]{0,13}[A-Za-z0-9]$/;
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function validarContratos(cs: ContratoConsignado[]): string[] {
    const erros: string[] = [];
    const vistos = new Set<string>();
    cs.forEach((c, i) => {
        const q = `Consignado ${i + 1}${c.nrDoc ? ` (contrato ${c.nrDoc})` : ''}`;
        if (!/^\d{3}$/.test(c.instFinanc)) erros.push(`${q}: instituição com o código de 3 dígitos da Tabela 37 do eSocial.`);
        if (!NR_DOC_CONSIGNADO.test(c.nrDoc ?? '')) erros.push(`${q}: número do contrato de 2 a 15 caracteres (letras, números e . / - _ no meio).`);
        if (!(Number.isInteger(c.parcela) && c.parcela > 0)) erros.push(`${q}: parcela mensal maior que zero.`);
        if (!COMP.test(c.inicio ?? '')) erros.push(`${q}: mês do primeiro desconto (AAAA-MM).`);
        if (c.fim && (!COMP.test(c.fim) || c.fim < c.inicio)) erros.push(`${q}: último mês inválido ou antes do primeiro.`);
        if (c.saldoRescisao !== undefined && !(Number.isInteger(c.saldoRescisao) && c.saldoRescisao >= 0)) erros.push(`${q}: saldo para a rescisão inválido.`);
        const k = `${c.instFinanc}|${c.nrDoc}`;
        if (vistos.has(k)) erros.push(`${q}: contrato repetido.`);
        vistos.add(k);
    });
    return erros;
}

export const contratosNoMes = (cs: ContratoConsignado[] | undefined, competencia: string) =>
    (cs ?? []).filter(c => c.inicio <= competencia && (!c.fim || c.fim >= competencia)).sort((a, b) => a.inicio.localeCompare(b.inicio) || a.nrDoc.localeCompare(b.nrDoc));

/** Descontos obrigatórios que saem da remuneração para achar a disponível (INSS, IRRF e pensão alimentícia). */
export const COMPULSORIO = (codigo: string) => /^(INSS|IRRF|PENSAO)/.test(codigo);

export interface ApuracaoConsignado { verbas: Verba[]; margem: number; disponivel: number; memoria: string[]; avisos: string[] }

/**
 * Descontos do mês (ou da rescisão): a parcela de cada contrato vigente, na ordem do início, até a margem (35% da
 * remuneração disponível) e o líquido. `rescisao`: usa o saldo informado pela instituição, quando houver.
 */
export function descontosConsignado(cs: ContratoConsignado[] | undefined, competencia: string, verbas: Verba[], opcoes: { rescisao?: boolean } = {}): ApuracaoConsignado {
    const r: ApuracaoConsignado = { verbas: [], margem: 0, disponivel: 0, memoria: [], avisos: [] };
    const ativos = contratosNoMes(cs, competencia);
    if (!ativos.length) return r;
    const proventos = verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    const descontos = verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    const compulsorios = verbas.filter(v => v.tipo === 'desconto' && COMPULSORIO(v.codigo)).reduce((s, v) => s + v.valor, 0);
    r.disponivel = Math.max(0, proventos - compulsorios);
    r.margem = Math.floor(r.disponivel * PCT_MARGEM_CONSIGNADO / 100);
    let margem = r.margem;
    let liquido = proventos - descontos;
    r.memoria.push(`Crédito do Trabalhador: margem de ${PCT_MARGEM_CONSIGNADO}% da ${opcoes.rescisao ? 'verba rescisória disponível' : 'remuneração disponível'} (${reais(proventos)} − INSS, IRRF e pensão ${reais(compulsorios)} = ${reais(r.disponivel)}) = ${reais(r.margem)} (Lei 10.820/2003, art. 2º, § 2º, I).`);
    for (const c of ativos) {
        const devido = opcoes.rescisao && c.saldoRescisao !== undefined ? c.saldoRescisao : c.parcela;
        const valor = Math.max(0, Math.min(devido, margem, liquido));
        if (valor > 0) {
            r.verbas.push({ codigo: 'CONSIG', descricao: `Crédito do Trabalhador (contrato ${c.nrDoc})`, referencia: '', tipo: 'desconto', valor, inss: false, fgts: false, irrf: false,
                descFolha: { instFinanc: c.instFinanc, nrDoc: c.nrDoc, ...(c.observacao?.trim() ? { observacao: c.observacao.trim().slice(0, 255) } : {}) } });
            margem -= valor; liquido -= valor;
        }
        r.memoria.push(`Contrato ${c.nrDoc} (instituição ${c.instFinanc}): ${opcoes.rescisao && c.saldoRescisao !== undefined ? 'saldo para a rescisão' : 'parcela'} ${reais(devido)}, descontado ${reais(valor)}.`);
        if (valor < devido) r.avisos.push(`Crédito do Trabalhador, contrato ${c.nrDoc}: descontado ${reais(valor)} de ${reais(devido)} (${valor < Math.min(devido, liquido) || margem === 0 ? `margem de ${PCT_MARGEM_CONSIGNADO}%` : 'líquido'} esgotado). A diferença é cobrada pela instituição; informe-a.`);
    }
    return r;
}
