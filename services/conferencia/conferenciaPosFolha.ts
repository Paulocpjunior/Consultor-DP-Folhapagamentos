// services/conferencia/conferenciaPosFolha.ts
//
// Fase 1 da migração (docs/viabilidade-migracao-folha-iob-sage.md):
// conferir a folha que o IOB calculou e transmitiu, usando o que o eSocial
// devolveu. O IOB continua sendo o sistema de registro; aqui só se aponta
// divergência, nunca se corrige valor.
//
// Regras, todas com base nos totalizadores do leiaute S-1.3:
//
//  1. INSS por trabalhador (S-5001 infoCpCalc): o que a folha DESCONTOU
//     (vrDescSeg) contra o que o eSocial CALCULOU (vrCpSeg), por código de
//     receita. Diferença aqui é erro de desconto na folha.
//  2. Empregado com S-5001 e sem S-5003 (ou o contrário): falta arquivo no
//     lote ou o FGTS não foi apurado.
//  3. Soma dos trabalhadores contra o consolidado da empresa: S-5001 × S-5011
//     (INSS dos segurados) e S-5003 × S-5013 (FGTS por tipo de valor). Se não
//     fecha, o lote enviado está incompleto ou o eSocial reprocessou algo.
//  4. DCTFWeb: os créditos do S-5011 (infoCRContrib) são o que a DCTFWeb
//     recebe do eSocial. Comparados com o valor que a equipe informar.
//  5. FGTS Digital: o S-5013 é a base da guia. Comparado com o valor informado.
//  6. SERPRO (quando consultado): fechamento do eSocial e DCTFWeb entregues,
//     e FGTS devido × recolhido no FGTS Digital. Falha de consulta vira
//     pendência informativa, nunca "entregue" ou "pago".
//  7. Folha do IOB: o relatório exportado do IOB (o que foi CALCULADO) ×
//     totalizadores (o que foi TRANSMITIDO), por funcionário e no total.
//  8. IRRF: soma dos S-5002 (por trabalhador) × S-5012 (empresa), por código
//     de receita, e S-5012 × débitos de IRRF da DCTFWeb (SERPRO). O IRRF
//     segue o mês do PAGAMENTO (S-1210), não a competência da folha: o S-5002
//     de 10/2026 traz, em geral, o IRRF da folha de 09/2026 paga em outubro.
//     Por isso ele não é cruzado com o S-5001 nem com o relatório da folha.


import type { GrupoApuracao, S5001, S5002, S5003 } from './totalizadores';
import type { ConsultaSerpro } from './serproConferencia';
import { compararResumoIob, type ComparacaoResumo, type FuncionarioResumo } from './resumoFolhaIob';

export type Gravidade = 'critica' | 'atencao' | 'info';

export interface Pendencia {
    gravidade: Gravidade;
    regra: string;
    cpf?: string;
    matricula?: string;
    mensagem: string;
    /** Em centavos, quando a regra compara valores. */
    diferenca?: number;
}

export interface LinhaInss {
    cpf: string; matriculas: string; categorias: string;
    tpCR: string; descontado: number; calculado: number; diferenca: number;
}
export interface LinhaFgts {
    cpf: string; matriculas: string; categorias: string;
    remuneracao: number; deposito: number;
}
export interface ConsolidacaoFgts {
    tpValor: string; descricao: string;
    somaTrabalhadores: number; empresa: number | null; diferenca: number | null;
}
export interface CreditoDarf { tpCR: string; valor: number; suspenso: number; aRecolher: number }
export interface LinhaIrrf { cpf: string; crMen: string; rendTrib: number; rendTrib13: number; prevOficial: number; irrf: number; irrf13: number }
export interface ConsolidacaoIrrf { crMen: string; descricao: string; somaTrabalhadores: number; empresa: number | null; diferenca: number | null }

export interface ResultadoConferencia {
    empregador: string;
    perApur: string;
    indApuracao: string;
    contagem: { s5001: number; s5003: number; s5011: number; s5013: number; s5002: number; s5012: number };
    inss: LinhaInss[];
    fgts: LinhaFgts[];
    consolidacaoInss: {
        descontadoTrabalhadores: number; calculadoTrabalhadores: number;
        descontadoEmpresa: number | null; calculadoEmpresa: number | null;
    };
    consolidacaoFgts: ConsolidacaoFgts[];
    dctfweb: { creditos: CreditoDarf[]; totalARecolher: number; informado: number | null; diferenca: number | null };
    fgtsDigital: { mensal: number; rescisorio: number; total: number; informado: number | null; diferenca: number | null };
    /** IRRF (regime de caixa): por trabalhador (S-5002) e consolidado da empresa (S-5012). */
    irrf: { linhas: LinhaIrrf[]; consolidacao: ConsolidacaoIrrf[]; totalEmpresa: number | null };
    serpro: ConsultaSerpro | null;
    /** Folha calculada no IOB (relatório exportado) × totalizadores. */
    resumoIob: ComparacaoResumo | null;
    pendencias: Pendencia[];
}

export interface OpcoesConferencia {
    /** Débitos previdenciários e de terceiros na DCTFWeb, em centavos (sem IRRF, multa e juros). */
    dctfwebInformado?: number | null;
    /** Valor da guia do FGTS Digital, em centavos (sem multa e juros). */
    fgtsDigitalInformado?: number | null;
    /** Diferença de INSS até este valor, em centavos, é tratada como arredondamento. Padrão: R$ 1,00. */
    toleranciaArredondamento?: number;
    /** Resultado da consulta ao SERPRO para esta empresa e competência. */
    serpro?: ConsultaSerpro | null;
    /** Funcionários lidos do relatório da folha exportado do IOB. */
    resumoIob?: { arquivo: string; funcionarios: FuncionarioResumo[] } | null;
}

/** CR de empréstimo consignado: vem em infoCpCalc, mas não é INSS. */
export const CR_NAO_INSS = new Set(['160601']);

/** tpValor de FGTS que são rescisórios (guia própria no FGTS Digital). XSD S-1.3, evtBasesFGTS. */
const FGTS_RESCISORIO = new Set(['21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '45', '46', '47', '48', '49', '50']);

export const DESCRICAO_TPVALOR_FGTS: Record<string, string> = {
    '11': 'FGTS mensal', '12': 'FGTS 13º salário', '13': 'FGTS (período anterior) mensal', '14': 'FGTS (período anterior) 13º salário',
    '15': 'FGTS mensal - Aprendiz', '16': 'FGTS 13º salário - Aprendiz', '17': 'FGTS (período anterior) mensal - Aprendiz', '18': 'FGTS (período anterior) 13º salário - Aprendiz',
    '19': 'FGTS - Avulsos não portuários',
    '21': 'FGTS mês da rescisão', '22': 'FGTS 13º salário rescisório', '23': 'FGTS aviso prévio indenizado',
    '24': 'FGTS (período anterior) mês da rescisão', '25': 'FGTS (período anterior) 13º rescisório', '26': 'FGTS (período anterior) aviso prévio indenizado',
    '27': 'FGTS mês da rescisão - Aprendiz', '28': 'FGTS 13º rescisório - Aprendiz', '29': 'FGTS aviso prévio indenizado - Aprendiz',
    '30': 'FGTS (período anterior) mês da rescisão - Aprendiz', '31': 'FGTS (período anterior) 13º rescisório - Aprendiz', '32': 'FGTS (período anterior) aviso prévio indenizado - Aprendiz',
    '41': 'Indenização compensatória doméstico - mensal', '42': 'Indenização compensatória doméstico - 13º',
    '43': 'Indenização compensatória doméstico - período anterior mensal', '44': 'Indenização compensatória doméstico - período anterior 13º',
    '45': 'Indenização compensatória doméstico - mês da rescisão', '46': 'Indenização compensatória doméstico - 13º rescisório',
    '47': 'Indenização compensatória doméstico - aviso prévio', '48': 'Indenização compensatória doméstico - período anterior mês da rescisão',
    '49': 'Indenização compensatória doméstico - período anterior 13º rescisório', '50': 'Indenização compensatória doméstico - período anterior aviso prévio',
};

/** Códigos de receita do IRRF no eSocial (TS_CRMen do XSD S-1.3). */
export const DESCRICAO_CR_IRRF: Record<string, string> = {
    '056107': 'IRRF trabalho assalariado (mensal, 13º e férias)', '056108': 'IRRF empregado doméstico (mensal e férias)',
    '056109': 'IRRF 13º na rescisão - doméstico', '056110': 'IRRF 13º - doméstico', '056111': 'IRRF rural - segurado especial',
    '056112': 'IRRF rural - segurado especial 13º', '056113': 'IRRF rural - segurado especial 13º rescisório',
    '058806': 'IRRF trabalho sem vínculo empregatício', '061001': 'IRRF transportador autônomo (transporte internacional de carga)',
    '353301': 'IRRF proventos de aposentadoria/pensão (previdência pública)', '356201': 'IRRF sobre PLR', '188901': 'IRRF sobre RRA',
};

export const DESCRICAO_CR_SEGURADO: Record<string, string> = {
    '108201': 'INSS empregado/avulso', '108202': 'INSS empregado rural curto prazo', '108203': 'INSS empregado doméstico',
    '108204': 'INSS segurado especial curto prazo', '108205': 'INSS empregado do segurado especial', '108207': 'INSS empregado do MEI',
    '108221': 'INSS empregado/avulso 13º', '108222': 'INSS rural curto prazo 13º', '108223': 'INSS doméstico 13º',
    '108224': 'INSS segurado especial curto prazo 13º', '108225': 'INSS empregado do segurado especial 13º',
    '109901': 'INSS contribuinte individual 11%', '109902': 'INSS contribuinte individual 20%',
    '109921': 'INSS contribuinte individual 11% 13º', '109922': 'INSS contribuinte individual 20% 13º',
};

/** Categorias de empregado (grupo 1xx da Tabela 01 do eSocial): têm FGTS. */
const ehEmpregado = (codCateg: string) => /^1\d\d$/.test(codCateg);

export const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(', ');

function cpfDuplicados<T extends { cpf: string }>(xs: T[]): Set<string> {
    const vistos = new Set<string>(), dup = new Set<string>();
    for (const x of xs) (vistos.has(x.cpf) ? dup : vistos).add(x.cpf);
    return dup;
}

export function conferirPosFolha(g: GrupoApuracao, op: OpcoesConferencia = {}): ResultadoConferencia {
    const tolerancia = op.toleranciaArredondamento ?? 100;
    const pendencias: Pendencia[] = [];

    if (g.s5011.length > 1) pendencias.push({ gravidade: 'atencao', regra: 'Lote', mensagem: `Há ${g.s5011.length} S-5011 para a mesma competência. Use só o mais recente; a conferência abaixo soma o primeiro.` });
    if (g.s5013.length > 1) pendencias.push({ gravidade: 'atencao', regra: 'Lote', mensagem: `Há ${g.s5013.length} S-5013 para a mesma competência. Use só o mais recente; a conferência abaixo soma o primeiro.` });

    // Dois totalizadores do mesmo trabalhador = retificação. Sem data no
    // retorno não dá para saber qual vale, então ele sai da conferência e
    // vira pendência — somar os dois dobraria o valor.
    const dup5001 = cpfDuplicados(g.s5001);
    const dup5003 = cpfDuplicados(g.s5003);
    for (const cpf of dup5001) pendencias.push({ gravidade: 'atencao', regra: 'Lote', cpf, mensagem: 'Mais de um S-5001 para este trabalhador (retificação). Deixe só o mais recente no lote; ele ficou fora da conferência de INSS.' });
    for (const cpf of dup5003) pendencias.push({ gravidade: 'atencao', regra: 'Lote', cpf, mensagem: 'Mais de um S-5003 para este trabalhador (retificação). Deixe só o mais recente no lote; ele ficou fora da conferência de FGTS.' });
    const s5001 = g.s5001.filter(t => !dup5001.has(t.cpf));
    const s5003 = g.s5003.filter(t => !dup5003.has(t.cpf));

    // ── 1. INSS descontado × calculado ────────────────────────────────────
    const inss: LinhaInss[] = [];
    for (const t of s5001) {
        const matriculas = unicos(t.vinculos.map(v => v.matricula));
        const categorias = unicos(t.vinculos.map(v => v.codCateg));
        for (const c of t.calculos) {
            if (CR_NAO_INSS.has(c.tpCR)) continue;
            const diferenca = c.descontado - c.calculado;
            inss.push({ cpf: t.cpf, matriculas, categorias, tpCR: c.tpCR, descontado: c.descontado, calculado: c.calculado, diferenca });
            if (diferenca === 0) continue;
            const rotulo = DESCRICAO_CR_SEGURADO[c.tpCR] ?? `CR ${c.tpCR}`;
            const sentido = diferenca > 0 ? 'a mais' : 'a menos';
            pendencias.push({
                gravidade: Math.abs(diferenca) <= tolerancia ? 'info' : 'critica',
                regra: 'INSS do trabalhador', cpf: t.cpf, matricula: matriculas, diferenca,
                mensagem: `${rotulo}: a folha descontou ${reais(c.descontado)} e o eSocial calculou ${reais(c.calculado)} — ${reais(Math.abs(diferenca))} ${sentido}` +
                    (Math.abs(diferenca) <= tolerancia ? ' (provável arredondamento).' : '.'),
            });
        }
    }

    // ── 2. Completude S-5001 × S-5003 para empregados ─────────────────────
    const cpfs5003 = new Set(g.s5003.map(t => t.cpf));
    const cpfs5001 = new Set(g.s5001.map(t => t.cpf));
    for (const t of g.s5001) {
        const empregado = t.vinculos.some(v => ehEmpregado(v.codCateg) && v.bases.some(b => b.valor > 0));
        if (empregado && !cpfs5003.has(t.cpf) && !dup5001.has(t.cpf)) {
            pendencias.push({ gravidade: 'atencao', regra: 'FGTS sem totalizador', cpf: t.cpf, matricula: unicos(t.vinculos.map(v => v.matricula)), mensagem: 'Empregado com remuneração no S-5001 e sem S-5003 no lote. Confira se o arquivo veio ou se o FGTS não foi apurado.' });
        }
    }
    for (const t of g.s5003) {
        if (!cpfs5001.has(t.cpf) && !dup5003.has(t.cpf)) {
            pendencias.push({ gravidade: 'atencao', regra: 'INSS sem totalizador', cpf: t.cpf, matricula: unicos(t.itens.map(i => i.matricula)), mensagem: 'Trabalhador com S-5003 e sem S-5001 no lote. Confira se o arquivo veio.' });
        }
    }

    // ── 3a. Soma dos trabalhadores × S-5011 ───────────────────────────────
    const segurado = (t: S5001) => t.calculos.filter(c => !CR_NAO_INSS.has(c.tpCR));
    const descontadoTrabalhadores = s5001.reduce((s, t) => s + segurado(t).reduce((a, c) => a + c.descontado, 0), 0);
    const calculadoTrabalhadores = s5001.reduce((s, t) => s + segurado(t).reduce((a, c) => a + c.calculado, 0), 0);
    const cs = g.s5011[0];
    const descontadoEmpresa = cs?.descontadoSegurados ?? null;
    const calculadoEmpresa = cs?.calculadoSegurados ?? null;
    // Lote só de IRRF (S-5002/S-5012, mês do pagamento): não cobra os totalizadores de INSS e FGTS.
    const soIrrf = !g.s5001.length && !g.s5003.length && !g.s5011.length && !g.s5013.length && (g.s5002.length + g.s5012.length > 0);
    if (!cs && !soIrrf) {
        pendencias.push({ gravidade: 'atencao', regra: 'Consolidado', mensagem: 'O lote não tem o S-5011 da empresa. Sem ele não dá para conferir a DCTFWeb nem se faltam trabalhadores.' });
    } else if (!dup5001.size && descontadoEmpresa !== null && calculadoEmpresa !== null) {
        const dDesc = descontadoTrabalhadores - descontadoEmpresa;
        const dCalc = calculadoTrabalhadores - calculadoEmpresa;
        if (dDesc !== 0 || dCalc !== 0) {
            pendencias.push({
                gravidade: 'atencao', regra: 'Consolidado', diferenca: dDesc || dCalc,
                mensagem: `A soma dos S-5001 do lote (descontado ${reais(descontadoTrabalhadores)}, calculado ${reais(calculadoTrabalhadores)}) não fecha com o S-5011 (descontado ${reais(descontadoEmpresa)}, calculado ${reais(calculadoEmpresa)}). Provavelmente faltam totalizadores de trabalhadores no lote.`,
            });
        }
    }

    // ── 3b. Soma dos trabalhadores × S-5013, por tipo de valor ────────────
    const fgts: LinhaFgts[] = s5003.map((t: S5003) => {
        const correntes = t.itens.filter(i => !i.periodoAnterior);
        return {
            cpf: t.cpf, matriculas: unicos(t.itens.map(i => i.matricula)), categorias: unicos(t.itens.map(i => i.codCateg)),
            remuneracao: correntes.reduce((s, i) => s + i.remuneracao, 0), deposito: correntes.reduce((s, i) => s + i.deposito, 0),
        };
    });
    const porTipo = new Map<string, number>();
    for (const t of s5003) for (const i of t.itens) if (!i.periodoAnterior) porTipo.set(i.tpValor, (porTipo.get(i.tpValor) ?? 0) + i.deposito);
    const fg = g.s5013[0];
    const empresaPorTipo = new Map<string, number>();
    for (const b of fg?.bases ?? []) if (!b.periodoAnterior) empresaPorTipo.set(b.tpValor, (empresaPorTipo.get(b.tpValor) ?? 0) + b.valorFgts);
    const tipos = [...new Set([...porTipo.keys(), ...empresaPorTipo.keys()])].sort();
    const consolidacaoFgts: ConsolidacaoFgts[] = tipos.map(tp => {
        const soma = porTipo.get(tp) ?? 0;
        const empresa = fg ? (empresaPorTipo.get(tp) ?? 0) : null;
        return { tpValor: tp, descricao: DESCRICAO_TPVALOR_FGTS[tp] ?? `Tipo ${tp}`, somaTrabalhadores: soma, empresa, diferenca: empresa === null ? null : soma - empresa };
    });
    if (!fg && !soIrrf) {
        pendencias.push({ gravidade: 'atencao', regra: 'Consolidado', mensagem: 'O lote não tem o S-5013 da empresa. Sem ele não dá para conferir a guia do FGTS Digital.' });
    } else if (!dup5003.size) {
        for (const c of consolidacaoFgts) {
            // tpValor 19 (avulsos não portuários) vem do S-1270, não do S-5003.
            if (c.diferenca && c.tpValor !== '19') {
                pendencias.push({ gravidade: 'atencao', regra: 'Consolidado', diferenca: c.diferenca, mensagem: `${c.descricao}: a soma dos S-5003 do lote dá ${reais(c.somaTrabalhadores)} e o S-5013 traz ${reais(c.empresa ?? 0)}. Provavelmente faltam totalizadores de trabalhadores no lote.` });
            }
        }
    }

    // ── 4. DCTFWeb ─────────────────────────────────────────────────────────
    const creditos: CreditoDarf[] = (cs?.creditos ?? []).map(c => ({ ...c, aRecolher: c.valor - c.suspenso }));
    const totalARecolher = creditos.reduce((s, c) => s + c.aRecolher, 0);
    const dctfInformado = op.dctfwebInformado ?? null;
    const dctfDif = dctfInformado === null || !cs ? null : dctfInformado - totalARecolher;
    if (dctfDif) {
        pendencias.push({ gravidade: 'critica', regra: 'DCTFWeb', diferenca: dctfDif, mensagem: `Débitos previdenciários informados da DCTFWeb (${reais(dctfInformado!)}) diferentes do S-5011 (${reais(totalARecolher)}). Confira se a DCTFWeb foi gerada depois do último fechamento (S-1299) e se o valor informado exclui IRRF, multa e juros.` });
    }

    // ── 5. FGTS Digital ────────────────────────────────────────────────────
    let mensal = 0, rescisorio = 0;
    for (const b of fg?.bases ?? []) (FGTS_RESCISORIO.has(b.tpValor) ? (rescisorio += b.valorFgts) : (mensal += b.valorFgts));
    const fgtsInformado = op.fgtsDigitalInformado ?? null;
    // A guia mensal é a comparação padrão; se o valor informado bater com o
    // total (mensal + rescisório), a guia juntou as duas e está certa.
    const fgtsDif = fgtsInformado === null || !fg ? null : (fgtsInformado === mensal + rescisorio ? 0 : fgtsInformado - mensal);
    if (fgtsDif) {
        pendencias.push({ gravidade: 'critica', regra: 'FGTS Digital', diferenca: fgtsDif, mensagem: `Guia do FGTS Digital informada (${reais(fgtsInformado!)}) diferente do S-5013: mensal ${reais(mensal)}${rescisorio ? `, rescisório ${reais(rescisorio)}, total ${reais(mensal + rescisorio)}` : ''}. Confira se a guia foi emitida depois do último fechamento e se o valor informado exclui multa e juros.` });
    }

    // ── 8. IRRF: S-5002 × S-5012 ────────────────────────────────────────────
    const dup5002 = cpfDuplicados(g.s5002);
    for (const cpf of dup5002) pendencias.push({ gravidade: 'atencao', regra: 'Lote', cpf, mensagem: 'Mais de um S-5002 para este trabalhador (retificação). Deixe só o mais recente no lote; ele ficou fora da conferência de IRRF.' });
    const s5002 = g.s5002.filter((t: S5002) => !dup5002.has(t.cpf));
    const linhasIrrf: LinhaIrrf[] = s5002.flatMap(t => t.apuracoes.map(a => ({ cpf: t.cpf, crMen: a.crMen, rendTrib: a.rendTrib, rendTrib13: a.rendTrib13, prevOficial: a.prevOficial, irrf: a.irrf, irrf13: a.irrf13 })));
    const irrfPorCr = new Map<string, number>();
    for (const l of linhasIrrf) irrfPorCr.set(l.crMen, (irrfPorCr.get(l.crMen) ?? 0) + l.irrf + l.irrf13);
    if (g.s5012.length > 1) pendencias.push({ gravidade: 'atencao', regra: 'Lote', mensagem: `Há ${g.s5012.length} S-5012 para o mesmo mês. Use só o mais recente; a conferência abaixo usa o primeiro.` });
    const ir = g.s5012[0];
    const irEmpresa = new Map((ir?.creditos ?? []).map(c => [c.crMen, c.valor]));
    const crs = [...new Set([...irrfPorCr.keys(), ...irEmpresa.keys()])].sort();
    const consolidacaoIrrf: ConsolidacaoIrrf[] = crs.map(cr => {
        const soma = irrfPorCr.get(cr) ?? 0;
        const empresa = ir ? (irEmpresa.get(cr) ?? 0) : null;
        return { crMen: cr, descricao: DESCRICAO_CR_IRRF[cr] ?? `CR ${cr}`, somaTrabalhadores: soma, empresa, diferenca: empresa === null ? null : soma - empresa };
    });
    if (g.s5002.length && !ir) {
        pendencias.push({ gravidade: 'atencao', regra: 'IRRF', mensagem: 'O lote tem S-5002 e não tem o S-5012 da empresa do mesmo mês de pagamento. Sem ele não dá para conferir o IRRF que vai à DCTFWeb.' });
    } else if (ir && !g.s5002.length) {
        pendencias.push({ gravidade: 'info', regra: 'IRRF', mensagem: 'O lote tem o S-5012 e nenhum S-5002: o IRRF da empresa aparece, mas não dá para conferir por trabalhador.' });
    } else if (ir && !dup5002.size) {
        for (const c of consolidacaoIrrf) if (c.diferenca) {
            pendencias.push({ gravidade: 'atencao', regra: 'IRRF', diferenca: c.diferenca, mensagem: `${c.descricao}: a soma dos S-5002 do lote dá ${reais(c.somaTrabalhadores)} e o S-5012 traz ${reais(c.empresa ?? 0)}. Provavelmente faltam totalizadores de trabalhadores no lote.` });
        }
    }

    // ── 6. SERPRO ──────────────────────────────────────────────────────────
    const sp = op.serpro ?? null;
    if (sp) {
        const quando = (d: string | null) => (d ? ` em ${d}` : '');
        if (!sp.esocial.ok) pendencias.push({ gravidade: 'info', regra: 'SERPRO', mensagem: `Fechamento do eSocial: consulta indisponível (${sp.esocial.erro}). Confira no portal.` });
        else if (!sp.esocial.entregue) pendencias.push({ gravidade: 'atencao', regra: 'SERPRO', mensagem: `O fechamento do eSocial (S-1299) não consta como transmitido no SERPRO. Situação: ${sp.esocial.situacao}.` });
        if (!sp.dctfweb.ok) pendencias.push({ gravidade: 'info', regra: 'SERPRO', mensagem: `DCTFWeb: consulta indisponível (${sp.dctfweb.erro}). Confira no e-CAC.` });
        else if (!sp.dctfweb.entregue) pendencias.push({ gravidade: 'atencao', regra: 'SERPRO', mensagem: `A DCTFWeb da competência não consta como entregue no SERPRO. Situação: ${sp.dctfweb.situacao}.` });
        else if (sp.esocial.ok && !sp.esocial.entregue) pendencias.push({ gravidade: 'atencao', regra: 'SERPRO', mensagem: `A DCTFWeb consta como entregue${quando(sp.dctfweb.dataEntrega)}, mas o fechamento do eSocial não. Confira se a DCTFWeb reflete a folha atual.` });
        // Débitos da DCTFWeb × S-5011, por código de receita. A DCTFWeb traz o
        // saldo a pagar, já com deduções (salário-família, salário-maternidade),
        // compensações e suspensões; por isso a diferença é "atenção", não erro.
        const dd = sp.dctfwebDebitos;
        if (!dd.ok) {
            pendencias.push({ gravidade: 'info', regra: 'SERPRO', mensagem: `Débitos da DCTFWeb: consulta indisponível (${dd.erro}). Informe o valor à mão.` });
        } else if (cs) {
            const daDctf = new Map(dd.debitos.map(x => [x.codReceita, x]));
            for (const c of creditos) {
                const d = daDctf.get(c.tpCR);
                if (!d) {
                    if (c.aRecolher > 0) pendencias.push({ gravidade: 'atencao', regra: 'SERPRO', diferenca: -c.aRecolher, mensagem: `DCTFWeb sem saldo a pagar no código ${c.tpCR}, que o S-5011 apura em ${reais(c.aRecolher)}. Pode ser dedução ou compensação; confira no e-CAC.` });
                } else if (d.valor !== c.aRecolher) {
                    pendencias.push({ gravidade: 'atencao', regra: 'SERPRO', diferenca: d.valor - c.aRecolher, mensagem: `DCTFWeb código ${c.tpCR}${d.descricao ? ` (${d.descricao})` : ''}: saldo a pagar ${reais(d.valor)}, S-5011 ${reais(c.aRecolher)}. Diferença de ${reais(Math.abs(d.valor - c.aRecolher))}; pode ser dedução de salário-família ou maternidade, compensação ou retenção. Confira no e-CAC.` });
                }
            }
        }
        // IRRF: a DCTFWeb do mês recebe o S-5012 do mesmo mês (mês do pagamento).
        if (dd.ok && ir) {
            const daDctf = new Map(dd.debitos.map(x => [x.codReceita, x]));
            for (const c of ir.creditos) {
                const d = daDctf.get(c.crMen);
                const rotulo = DESCRICAO_CR_IRRF[c.crMen] ?? `CR ${c.crMen}`;
                if (!d) {
                    if (c.valor > 0) pendencias.push({ gravidade: 'atencao', regra: 'SERPRO', diferenca: -c.valor, mensagem: `DCTFWeb sem saldo a pagar de ${rotulo} (código ${c.crMen}), que o S-5012 apura em ${reais(c.valor)}. Pode ser compensação ou a DCTFWeb ainda não recebeu o fechamento; confira no e-CAC.` });
                } else if (d.valor !== c.valor) {
                    pendencias.push({ gravidade: 'atencao', regra: 'SERPRO', diferenca: d.valor - c.valor, mensagem: `DCTFWeb ${rotulo} (código ${c.crMen}): saldo a pagar ${reais(d.valor)}, S-5012 ${reais(c.valor)}. Confira no e-CAC.` });
                }
            }
        }
        if (!sp.fgts.ok) pendencias.push({ gravidade: 'info', regra: 'SERPRO', mensagem: `FGTS Digital: consulta indisponível (${sp.fgts.erro}). Informe o valor da guia à mão.` });
        else if (sp.fgts.devido === null) pendencias.push({ gravidade: 'info', regra: 'SERPRO', mensagem: 'FGTS Digital: o SERPRO respondeu sem valor devido para a competência. Informe o valor da guia à mão.' });
        else {
            if (fg && sp.fgts.devido !== mensal && sp.fgts.devido !== mensal + rescisorio) {
                pendencias.push({ gravidade: 'critica', regra: 'SERPRO', diferenca: sp.fgts.devido - mensal, mensagem: `FGTS Digital: o valor devido no SERPRO (${reais(sp.fgts.devido)}) é diferente do S-5013 (mensal ${reais(mensal)}${rescisorio ? `, total ${reais(mensal + rescisorio)}` : ''}). Confira se houve novo fechamento depois da emissão da guia.` });
            }
            if ((sp.fgts.realizado ?? 0) < sp.fgts.devido) {
                const falta = sp.fgts.devido - (sp.fgts.realizado ?? 0);
                pendencias.push({ gravidade: 'atencao', regra: 'SERPRO', diferenca: -falta, mensagem: sp.fgts.realizado ? `FGTS Digital: recolhido ${reais(sp.fgts.realizado)} de ${reais(sp.fgts.devido)} devidos; faltam ${reais(falta)}.` : `FGTS Digital: ainda não consta recolhimento dos ${reais(sp.fgts.devido)} devidos.` });
            }
        }
    }

    // ── 7. Folha do IOB (relatório) × eSocial ──────────────────────────────
    const resumoIob = op.resumoIob ? compararResumoIob(op.resumoIob.funcionarios, g, op.resumoIob.arquivo, tolerancia) : null;
    for (const p of resumoIob?.pendencias ?? []) pendencias.push({ ...p, regra: 'Folha do IOB' });

    const ordem: Record<Gravidade, number> = { critica: 0, atencao: 1, info: 2 };
    pendencias.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade] || a.regra.localeCompare(b.regra) || (a.cpf ?? '').localeCompare(b.cpf ?? ''));

    return {
        empregador: g.empregador, perApur: g.perApur, indApuracao: g.indApuracao,
        contagem: { s5001: g.s5001.length, s5003: g.s5003.length, s5011: g.s5011.length, s5013: g.s5013.length, s5002: g.s5002.length, s5012: g.s5012.length },
        inss, fgts,
        consolidacaoInss: { descontadoTrabalhadores, calculadoTrabalhadores, descontadoEmpresa, calculadoEmpresa },
        consolidacaoFgts,
        dctfweb: { creditos, totalARecolher, informado: dctfInformado, diferenca: dctfDif },
        fgtsDigital: { mensal, rescisorio, total: mensal + rescisorio, informado: fgtsInformado, diferenca: fgtsDif },
        irrf: { linhas: linhasIrrf, consolidacao: consolidacaoIrrf, totalEmpresa: ir ? ir.creditos.reduce((t, c) => t + c.valor, 0) : null },
        serpro: sp,
        resumoIob,
        pendencias,
    };
}

/** "1.234,56" ou "1234.56" → centavos; vazio → null. */
export function lerValorDigitado(v: string): number | null {
    const t = v.replace(/[R$\s]/g, '');
    if (!t) return null;
    const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
    if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
    return Math.round(Number(normal) * 100);
}
