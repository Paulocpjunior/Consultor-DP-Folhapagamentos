// services/calculo/consignado.ts
//
// Crédito do Trabalhador (empréstimo consignado do empregado CLT, Lei 10.820/2003): os contratos ficam na ficha do
// funcionário (instituição pela Tabela 37 do eSocial, número do contrato, parcela e meses), e a folha desconta a
// parcela de cada contrato vigente no mês dentro da margem: 35% da remuneração disponível (art. 2º, § 2º, I, e Portaria
// MTE 435/2025, art. 30: vencimentos com INSS menos os descontos com INSS, o INSS, o IRRF e os compulsórios). Dentro da
// margem, a parcela é descontada mesmo sem líquido (insuficiência de saldo); fora dela, o holerite avisa o trabalhador.
// Na rescisão, só com garantia: o menor entre o percentual dado em garantia sobre a remuneração disponível do § 5º e o saldo devedor. Cada desconto vai
// ao eSocial numa rubrica de natureza 9253 com o grupo descFolha (tpDesc 1, instFinanc, nrDoc), um item por contrato, no
// S-1200 e no S-2299 (XSD S-1.3, T_descFolha).
// Estudo: docs/estudo-credito-do-trabalhador.md. Puro.

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
    /** Saldo devedor atualizado na rescisão (centavos), do Consultar Contrato ou do Extrato no Portal Emprega Brasil. */
    saldoRescisao?: number;
    /** Percentual das verbas rescisórias dado em garantia na contratação (0 a 100; o Portal mostra 0% quando não há). */
    garantiaRescisao?: number;
    /** Data da consulta ao Portal (AAAA-MM-DD): o eSocial confere pelo saldo e pela garantia do dia do envio. */
    consultaRescisao?: string;
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
        if (c.saldoRescisao !== undefined && !(Number.isInteger(c.saldoRescisao) && c.saldoRescisao >= 0)) erros.push(`${q}: saldo devedor inválido.`);
        if (c.garantiaRescisao !== undefined && !(Number.isFinite(c.garantiaRescisao) && c.garantiaRescisao >= 0 && c.garantiaRescisao <= 100)) erros.push(`${q}: garantia das verbas rescisórias de 0% a 100%.`);
        if (c.consultaRescisao && !/^\d{4}-\d{2}-\d{2}$/.test(c.consultaRescisao)) erros.push(`${q}: data da consulta ao Portal inválida.`);
        const k = `${c.instFinanc}|${c.nrDoc}`;
        if (vistos.has(k)) erros.push(`${q}: contrato repetido.`);
        vistos.add(k);
    });
    return erros;
}

export const contratosNoMes = (cs: ContratoConsignado[] | undefined, competencia: string) =>
    (cs ?? []).filter(c => c.inicio <= competencia && (!c.fim || c.fim >= competencia)).sort((a, b) => a.inicio.localeCompare(b.inicio) || a.nrDoc.localeCompare(b.nrDoc));

/** Descontos compulsórios pela natureza das verbas do motor: INSS e IRRF (9201, 9203, também os das férias retidos no
 * recibo), pensão alimentícia (9213) e o desconto da 1ª parcela do 13º (9214). */
export const COMPULSORIO = (codigo: string) => /^(INSS|IRRF|PENSAO|13ADT)/.test(codigo);
/** Naturezas compulsórias da Tabela 03 (Manual do Empregador, item 5.2): pensão, adiantamento do 13º, retenção judicial, FIES. */
export const NATUREZAS_COMPULSORIAS = ['9213', '9214', '9218', '9260'];
/** Avulso sem marca: compulsório pela descrição (pensão, retenção judicial, FIES). */
const AVULSO_COMPULSORIO = /PENS[AÃ]O|JUDICI|FIES/i;
/** Lançamento avulso compulsório: a marca, quando há (pela natureza da rubrica ou na tela); senão, a descrição. */
export const avulsoCompulsorio = (l: { descricao: string; compulsorio?: boolean }) => l.compulsorio ?? AVULSO_COMPULSORIO.test(l.descricao);
const compulsorio = (v: Verba) => v.compulsorio ?? (COMPULSORIO(v.codigo) || (/^LAN\d+$/.test(v.codigo) && avulsoCompulsorio(v)));

/** Mensagem ao trabalhador quando a parcela não pôde ser descontada inteira (modelo do Manual do Empregador, MTE, v2.1). */
export const MENSAGEM_CONSIGNADO = 'ATENÇÃO TRABALHADOR: não foi possível realizar o desconto total ou parcial do seu empréstimo consignado, por exceder o percentual (35%) da remuneração disponível prevista na Lei nº 10.820/2003 e Portaria MTE nº 435/2025. Procure sua instituição financeira para regularizar o pagamento desse empréstimo.';

export interface RemuneracaoDisponivel { vencimentos: number; descontosInss: number; compulsorios: number; disponivel: number }

/**
 * Remuneração disponível do mês (Portaria MTE 435/2025, art. 30, § 1º a § 3º): as verbas de vencimento com incidência de
 * INSS, menos os descontos com incidência de INSS (faltas, atrasos, DSR), o INSS, o IRRF e os descontos compulsórios
 * (pensão, desconto do adiantamento do 13º, retenção judicial, FIES). Não entram os vencimentos sem INSS (salário-família,
 * prêmios, ajuda de custo…), os descontos voluntários (vale-transporte, plano de saúde, convênios, outros empréstimos) nem
 * o desconto do adiantamento salarial ou de férias. Rubrica informativa não conta.
 */
export function remuneracaoDisponivel(verbas: Verba[]): RemuneracaoDisponivel {
    const pagas = verbas.filter(v => !v.informativa);
    const soma = (vs: Verba[]) => vs.reduce((s, v) => s + v.valor, 0);
    const vencimentos = soma(pagas.filter(v => v.tipo === 'provento' && v.inss));
    const descontosInss = soma(pagas.filter(v => v.tipo === 'desconto' && v.inss));
    const compulsorios = soma(pagas.filter(v => v.tipo === 'desconto' && !v.inss && compulsorio(v)));
    return { vencimentos, descontosInss, compulsorios, disponivel: Math.max(0, vencimentos - descontosInss - compulsorios) };
}

/** Verbas indenizatórias que o § 5º do art. 30 soma na rescisão: aviso prévio (6003), férias em dobro (6004),
 * proporcionais (6006) e vencidas (6007), com o 1/3. */
const VENCIMENTO_RESCISAO = /^(AVISO|FP(13)?|FVD?(13)?\d{4}-\d{2}-\d{2})$/;
/** Descontos que saem na rescisão além dos compulsórios do mês: aviso prévio não cumprido (6901) e multa do art. 480 (6904). */
const DESCONTO_RESCISAO = /^(AVISODESC|ART480)$/;

export interface RemuneracaoDisponivelRescisao extends RemuneracaoDisponivel { indenizadas: number }

/**
 * Remuneração disponível na rescisão (Portaria MTE 435/2025, art. 30, § 5º; Manual do Empregador v2.1, item 5.7.3): a do
 * mês somada ao aviso prévio indenizado e às férias indenizadas (vencidas, em dobro e proporcionais, com o 1/3), menos
 * também o desconto do aviso não cumprido e a multa do art. 480. Prêmios, art. 479 e outras verbas sem INSS não entram.
 */
export function remuneracaoDisponivelRescisao(verbas: Verba[]): RemuneracaoDisponivelRescisao {
    const pagas = verbas.filter(v => !v.informativa);
    const soma = (vs: Verba[]) => vs.reduce((s, v) => s + v.valor, 0);
    const base = remuneracaoDisponivel(pagas.filter(v => !(v.tipo === 'provento' && !v.inss && VENCIMENTO_RESCISAO.test(v.codigo))));
    const indenizadas = soma(pagas.filter(v => v.tipo === 'provento' && !v.inss && VENCIMENTO_RESCISAO.test(v.codigo)));
    const extra = soma(pagas.filter(v => v.tipo === 'desconto' && !v.inss && !compulsorio(v) && DESCONTO_RESCISAO.test(v.codigo)));
    const compulsorios = base.compulsorios + extra;
    return { vencimentos: base.vencimentos, indenizadas, descontosInss: base.descontosInss, compulsorios,
        disponivel: Math.max(0, base.vencimentos + indenizadas - base.descontosInss - compulsorios) };
}

export interface ApuracaoConsignado {
    verbas: Verba[]; margem: number; disponivel: number; memoria: string[]; avisos: string[];
    /** Mensagens para o holerite (desconto parcial ou não feito; art. 30, § 4º). */
    mensagens: string[];
    /** Rescisão: falta a garantia ou o saldo devedor de algum contrato (consultar o Portal antes de fechar). */
    pendente?: boolean;
}

/**
 * Desconto na rescisão (Manual do Empregador v2.1, item 5.7.2): por contrato, o menor entre o percentual dado em garantia
 * aplicado sobre a remuneração disponível na rescisão e o saldo devedor. Sem garantia (0%), nada, nem a parcela do mês.
 * Sem o percentual ou o saldo na ficha, não desconta e fica pendente: o S-2299 só sai depois da consulta ao Portal.
 */
export function descontosConsignadoRescisao(cs: ContratoConsignado[] | undefined, competencia: string, verbas: Verba[]): ApuracaoConsignado {
    const r: ApuracaoConsignado = { verbas: [], margem: 0, disponivel: 0, memoria: [], avisos: [], mensagens: [] };
    const ativos = contratosNoMes(cs, competencia);
    if (!ativos.length) return r;
    const d = remuneracaoDisponivelRescisao(verbas);
    r.disponivel = d.disponivel;
    r.memoria.push(`Crédito do Trabalhador na rescisão: remuneração disponível = vencimentos com INSS ${reais(d.vencimentos)} + aviso e férias indenizadas (com 1/3) ${reais(d.indenizadas)} − descontos com INSS ${reais(d.descontosInss)} − INSS, IRRF e compulsórios (inclusive aviso não cumprido e art. 480) ${reais(d.compulsorios)} = ${reais(d.disponivel)} (Portaria MTE 435/2025, art. 30, § 5º).`);
    let resta = d.disponivel;
    for (const c of ativos) {
        const q = `Contrato ${c.nrDoc} (instituição ${c.instFinanc})`;
        const consulta = c.consultaRescisao ? `, consulta de ${c.consultaRescisao.split('-').reverse().join('/')}` : '';
        if (c.garantiaRescisao === undefined) {
            r.pendente = true;
            r.avisos.push(`Crédito do Trabalhador, contrato ${c.nrDoc}: informe na ficha (aba Consignado) o percentual de garantia das verbas rescisórias e o saldo devedor do Portal Emprega Brasil (Consultar Contrato ou Extrato); 0% se o Portal mostrar 0%. Sem eles, nada é descontado e o S-2299 não sai.`);
            r.memoria.push(`${q}: sem o percentual de garantia na ficha; nada descontado.`);
            continue;
        }
        if (c.garantiaRescisao === 0) {
            r.memoria.push(`${q}: sem garantia das verbas rescisórias (0%${consulta}); nada descontado, nem a parcela do mês (Manual do Empregador, item 5.7.2). O saldo fica entre o trabalhador e a instituição.`);
            continue;
        }
        if (c.saldoRescisao === undefined) {
            r.pendente = true;
            r.avisos.push(`Crédito do Trabalhador, contrato ${c.nrDoc}: garantia de ${pctTexto(c.garantiaRescisao)}, mas falta o saldo devedor atualizado (Portal Emprega Brasil). Sem ele, nada é descontado e o S-2299 não sai.`);
            r.memoria.push(`${q}: sem o saldo devedor na ficha; nada descontado.`);
            continue;
        }
        const pelaGarantia = Math.floor(d.disponivel * c.garantiaRescisao / 100);
        const valor = Math.max(0, Math.min(pelaGarantia, c.saldoRescisao, resta));
        if (valor > 0) {
            r.verbas.push({ codigo: 'CONSIG', descricao: `Crédito do Trabalhador (contrato ${c.nrDoc})`, referencia: pctTexto(c.garantiaRescisao), tipo: 'desconto', valor, inss: false, fgts: false, irrf: false,
                descFolha: { instFinanc: c.instFinanc, nrDoc: c.nrDoc, ...(c.observacao?.trim() ? { observacao: c.observacao.trim().slice(0, 255) } : {}) } });
            resta -= valor;
        }
        const limite = valor === c.saldoRescisao ? 'limitado ao saldo devedor' : valor === pelaGarantia ? 'limitado à garantia' : 'limitado ao que restava da remuneração disponível';
        r.memoria.push(`${q}: garantia de ${pctTexto(c.garantiaRescisao)} × ${reais(d.disponivel)} = ${reais(pelaGarantia)}; saldo devedor ${reais(c.saldoRescisao)}${consulta}; descontado ${reais(valor)} (${limite}; Manual do Empregador, item 5.7.2).`);
    }
    if (r.verbas.length) r.avisos.push('Crédito do Trabalhador na rescisão: o eSocial confere o desconto pelo saldo devedor e pela garantia do dia do envio do S-2299; consulte o Portal perto do envio. O restante da dívida fica entre o trabalhador e a instituição.');
    return r;
}

const pctTexto = (p: number) => `${p.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

/**
 * Descontos do mês: a parcela de cada contrato vigente, na ordem do início, até a margem de 35% da remuneração
 * disponível. A parcela dentro da margem é descontada mesmo que o líquido não comporte (o motor completa com a
 * insuficiência de saldo, como orienta o Manual do Empregador, exemplos 03 e 04); o que passa da margem fica com o
 * trabalhador, que é avisado no holerite. Na rescisão vale `descontosConsignadoRescisao`.
 */
export function descontosConsignado(cs: ContratoConsignado[] | undefined, competencia: string, verbas: Verba[]): ApuracaoConsignado {
    const r: ApuracaoConsignado = { verbas: [], margem: 0, disponivel: 0, memoria: [], avisos: [], mensagens: [] };
    const ativos = contratosNoMes(cs, competencia);
    if (!ativos.length) return r;
    const d = remuneracaoDisponivel(verbas);
    r.disponivel = d.disponivel;
    // 35% truncado no centavo: nunca passa do limite (Manual do Empregador, exemplos 01, 02, 06 e 07).
    r.margem = Math.floor(r.disponivel * PCT_MARGEM_CONSIGNADO / 100);
    r.memoria.push(`Crédito do Trabalhador: remuneração disponível = vencimentos com INSS ${reais(d.vencimentos)} − descontos com INSS (faltas, atrasos, DSR) ${reais(d.descontosInss)} − INSS, IRRF e compulsórios ${reais(d.compulsorios)} = ${reais(d.disponivel)}; margem de ${PCT_MARGEM_CONSIGNADO}% = ${reais(r.margem)} (Portaria MTE 435/2025, art. 30).`);
    let margem = r.margem;
    for (const c of ativos) {
        const devido = c.parcela;
        const valor = Math.max(0, Math.min(devido, margem));
        if (valor > 0) {
            r.verbas.push({ codigo: 'CONSIG', descricao: `Crédito do Trabalhador (contrato ${c.nrDoc})`, referencia: '', tipo: 'desconto', valor, inss: false, fgts: false, irrf: false,
                descFolha: { instFinanc: c.instFinanc, nrDoc: c.nrDoc, ...(c.observacao?.trim() ? { observacao: c.observacao.trim().slice(0, 255) } : {}) } });
            margem -= valor;
        }
        r.memoria.push(`Contrato ${c.nrDoc} (instituição ${c.instFinanc}): parcela ${reais(devido)}, descontado ${reais(valor)}.`);
        if (valor < devido) {
            r.avisos.push(`Crédito do Trabalhador, contrato ${c.nrDoc}: descontado ${reais(valor)} de ${reais(devido)} (margem de ${PCT_MARGEM_CONSIGNADO}% esgotada). A diferença o trabalhador paga direto à instituição; o holerite leva o aviso a ele (Portaria MTE 435/2025, art. 30, § 4º).`);
            if (!r.mensagens.length) r.mensagens.push(MENSAGEM_CONSIGNADO);
        }
    }
    return r;
}
