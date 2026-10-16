// services/calculo/consignado.ts
//
// Crédito do Trabalhador (empréstimo consignado do empregado CLT, Lei 10.820/2003): os contratos ficam na ficha do
// funcionário (instituição pela Tabela 37 do eSocial, número do contrato, parcela e meses), e a folha desconta a
// parcela de cada contrato vigente no mês dentro da margem: 35% da remuneração disponível (art. 2º, § 2º, I, e Portaria
// MTE 435/2025, art. 30: vencimentos com INSS menos os descontos com INSS, o INSS, o IRRF e os compulsórios). Dentro da
// margem, a parcela é descontada mesmo sem líquido (insuficiência de saldo); fora dela, o holerite avisa o trabalhador.
// Na rescisão, o desconto sai das verbas rescisórias (a regra da garantia vem na etapa 2 do estudo). Cada desconto vai
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

export interface ApuracaoConsignado {
    verbas: Verba[]; margem: number; disponivel: number; memoria: string[]; avisos: string[];
    /** Mensagens para o holerite (desconto parcial ou não feito; art. 30, § 4º). */
    mensagens: string[];
}

/**
 * Descontos do mês (ou da rescisão): a parcela de cada contrato vigente, na ordem do início, até a margem de 35% da
 * remuneração disponível. Na folha, a parcela dentro da margem é descontada mesmo que o líquido não comporte (o
 * motor completa com a insuficiência de saldo, como orienta o Manual do Empregador, exemplos 03 e 04); o que passa da
 * margem fica com o trabalhador, que é avisado no holerite. `rescisao`: usa o saldo informado pela instituição, quando
 * houver, e ainda limita pelo líquido (a regra da garantia vem na etapa 2).
 */
export function descontosConsignado(cs: ContratoConsignado[] | undefined, competencia: string, verbas: Verba[], opcoes: { rescisao?: boolean } = {}): ApuracaoConsignado {
    const r: ApuracaoConsignado = { verbas: [], margem: 0, disponivel: 0, memoria: [], avisos: [], mensagens: [] };
    const ativos = contratosNoMes(cs, competencia);
    if (!ativos.length) return r;
    const proventos = verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    const descontos = verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    if (opcoes.rescisao) {
        const compulsorios = verbas.filter(v => v.tipo === 'desconto' && COMPULSORIO(v.codigo)).reduce((s, v) => s + v.valor, 0);
        r.disponivel = Math.max(0, proventos - compulsorios);
        r.memoria.push(`Crédito do Trabalhador: margem de ${PCT_MARGEM_CONSIGNADO}% da verba rescisória disponível (${reais(proventos)} − INSS, IRRF e pensão ${reais(compulsorios)} = ${reais(r.disponivel)}) = ${reais(Math.floor(r.disponivel * PCT_MARGEM_CONSIGNADO / 100))} (Lei 10.820/2003, art. 2º, § 2º, I).`);
    } else {
        const d = remuneracaoDisponivel(verbas);
        r.disponivel = d.disponivel;
        r.memoria.push(`Crédito do Trabalhador: remuneração disponível = vencimentos com INSS ${reais(d.vencimentos)} − descontos com INSS (faltas, atrasos, DSR) ${reais(d.descontosInss)} − INSS, IRRF e compulsórios ${reais(d.compulsorios)} = ${reais(d.disponivel)}; margem de ${PCT_MARGEM_CONSIGNADO}% = ${reais(Math.floor(d.disponivel * PCT_MARGEM_CONSIGNADO / 100))} (Portaria MTE 435/2025, art. 30).`);
    }
    // 35% truncado no centavo: nunca passa do limite (Manual do Empregador, exemplos 01, 02, 05, 06 e 07).
    r.margem = Math.floor(r.disponivel * PCT_MARGEM_CONSIGNADO / 100);
    let margem = r.margem;
    let liquido = proventos - descontos;
    for (const c of ativos) {
        const devido = opcoes.rescisao && c.saldoRescisao !== undefined ? c.saldoRescisao : c.parcela;
        const valor = Math.max(0, opcoes.rescisao ? Math.min(devido, margem, liquido) : Math.min(devido, margem));
        if (valor > 0) {
            r.verbas.push({ codigo: 'CONSIG', descricao: `Crédito do Trabalhador (contrato ${c.nrDoc})`, referencia: '', tipo: 'desconto', valor, inss: false, fgts: false, irrf: false,
                descFolha: { instFinanc: c.instFinanc, nrDoc: c.nrDoc, ...(c.observacao?.trim() ? { observacao: c.observacao.trim().slice(0, 255) } : {}) } });
            margem -= valor; liquido -= valor;
        }
        r.memoria.push(`Contrato ${c.nrDoc} (instituição ${c.instFinanc}): ${opcoes.rescisao && c.saldoRescisao !== undefined ? 'saldo para a rescisão' : 'parcela'} ${reais(devido)}, descontado ${reais(valor)}.`);
        if (valor < devido) {
            const motivo = !opcoes.rescisao || valor < Math.min(devido, liquido) || margem === 0 ? `margem de ${PCT_MARGEM_CONSIGNADO}%` : 'líquido';
            r.avisos.push(`Crédito do Trabalhador, contrato ${c.nrDoc}: descontado ${reais(valor)} de ${reais(devido)} (${motivo} esgotado). A diferença o trabalhador paga direto à instituição; ${opcoes.rescisao ? 'informe-o' : 'o holerite leva o aviso a ele'} (Portaria MTE 435/2025, art. 30, § 4º).`);
            if (!r.mensagens.length) r.mensagens.push(MENSAGEM_CONSIGNADO);
        }
    }
    return r;
}
