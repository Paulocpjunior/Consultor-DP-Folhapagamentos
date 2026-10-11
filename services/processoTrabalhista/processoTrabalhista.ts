// services/processoTrabalhista/processoTrabalhista.ts
//
// Processo trabalhista no eSocial (Paulo, 11/10/2026: pagamento judicial a ex-empregado vai pelo eSocial, não pela
// EFD-Reinf — desde 10/2023 as decisões e acordos da Justiça do Trabalho e das CCP/NINTER têm eventos próprios):
//   S-2500 — o processo, o trabalhador, o período e as bases mês a mês (INSS, 13º e FGTS);
//   S-2501 — os tributos de cada pagamento: contribuições por código de receita (Tabela 29) e IRRF.
// Escopo desta versão: trabalhador com vínculo no eSocial (S-2200), sem alteração de datas, de categoria, de natureza
// da atividade nem do motivo do desligamento (tpContr 1). Reconhecimento de vínculo, unicidade, responsabilidade
// indireta e processo da Justiça Comum ficam fora: o IOB (ou o portal) continua para esses casos.
// Os valores vêm do cálculo homologado (liquidação): aqui não se recalcula INSS nem IRRF de processo.
// Os códigos de IRRF são os do XSD (593656, 056152 e 188951); os das contribuições, da Tabela 29 vigente — a tela
// pede o código de 6 dígitos, como na guia.

import { cnpjValido, cpfValido, UFS } from '../cadastros/documentos';
import { idEvento, VER_PROC, type TpAmb } from '../esocial/transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';

export type OrigemProcesso = '1' | '2';
export const ROTULO_ORIGEM: Record<OrigemProcesso, string> = { 1: 'Processo judicial trabalhista', 2: 'Acordo em CCP ou NINTER' };
export const TIPOS_CCP: Record<string, string> = { 1: 'CCP no âmbito de empresa', 2: 'CCP no âmbito de sindicato', 3: 'NINTER' };
/** indReperc aceitos nesta versão (os de depósito judicial, 4 e 5, ficam de fora). */
export const REPERCUSSOES: Record<string, string> = {
    1: 'Com repercussão tributária e/ou FGTS (tributos no S-2501)',
    2: 'Sem repercussão tributária nem FGTS',
    3: 'Só para a declaração do IR (rendimentos no S-2501)',
};
export const CR_IRRF: Record<string, string> = { 593656: 'IRRF — decisão da Justiça do Trabalho', '056152': 'IRRF — CCP/NINTER', 188951: 'IRRF — RRA (rendimentos recebidos acumuladamente)' };

/** Bases de um mês do período, em centavos. */
export interface PeriodoProcesso { perRef: string; bcCpMensal: number; bcCp13: number; bcFgts: number }
export interface TrabalhadorProcesso {
    fichaId: string; cpf: string; nome: string; matricula: string;
    compIni: string; compFim: string; indReperc: '1' | '2' | '3';
    periodos: PeriodoProcesso[];
    /** Recibo do S-2500 aceito (para a retificação). */
    reciboS2500?: string;
}
export interface ContribuicaoProcesso { perRef: string; tpCR: string; valor: number }
export interface RraProcesso { descRRA: string; qtdMeses: number; custas: number; advogados: number }
export interface IrrfProcesso {
    tpCR: string; vrCR: number; vrCR13: number;
    rendTrib: number; rendTrib13: number; jurosMora: number; isentoNTrib: number; descIsento: string; prevOficial: number; prevOficial13: number;
    rra?: RraProcesso;
}
export interface PagamentoTrabalhador { cpf: string; contribuicoes: ContribuicaoProcesso[]; irrf: IrrfProcesso[] }
export interface PagamentoProcesso { perApurPgto: string; ideSeqProc: string; obs: string; trabalhadores: PagamentoTrabalhador[]; reciboS2501?: string }

export interface ProcessoTrabalhista {
    empresaId: string; nrProcTrab: string; origem: OrigemProcesso; obs: string;
    /** Judicial: data da determinação de cumprimento, da homologação do acordo ou da decisão de cumprimento antecipado. */
    dtSent: string; ufVara: string; codMunic: string; idVara: string;
    /** CCP/NINTER. */
    dtCCP: string; tpCCP: string; cnpjCCP: string;
    trabalhadores: TrabalhadorProcesso[];
    pagamentos: PagamentoProcesso[];
}

export const processoVazio = (empresaId: string): ProcessoTrabalhista => ({
    empresaId, nrProcTrab: '', origem: '1', obs: '', dtSent: '', ufVara: '', codMunic: '', idVara: '', dtCCP: '', tpCCP: '', cnpjCCP: '',
    trabalhadores: [], pagamentos: [],
});

const digitos = (t: string) => (t ?? '').replace(/\D/g, '');
const mes = /^\d{4}-(0[1-9]|1[0-2])$/;
const data = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Número do processo no padrão do CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO, 20 dígitos), com os dígitos verificadores
 * (módulo 97, Resolução CNJ 65/2008). Justiça do Trabalho: segmento J = 5.
 */
export function numeroCnjValido(nr: string): boolean {
    const d = digitos(nr);
    if (d.length !== 20) return false;
    const n = d.slice(0, 7), dv = d.slice(7, 9), resto = d.slice(9);
    const r = BigInt(`${n}${resto}00`) % 97n;
    return String(98n - r).padStart(2, '0') === dv;
}

/** Meses de AAAA-MM a AAAA-MM (inclusive). */
export function mesesEntre(ini: string, fim: string): string[] {
    if (!mes.test(ini) || !mes.test(fim) || fim < ini) return [];
    const out: string[] = [];
    let [a, m] = ini.split('-').map(Number);
    for (let i = 0; i < 1200; i++) {
        const c = `${a}-${String(m).padStart(2, '0')}`;
        out.push(c);
        if (c === fim) break;
        m++; if (m > 12) { m = 1; a++; }
    }
    return out;
}

export interface Validacao { erros: string[]; avisos: string[] }

/** O processo (S-2500), com os trabalhadores e os períodos. `hoje` = AAAA-MM-DD. */
export function validarProcesso(p: ProcessoTrabalhista, hoje: string): Validacao {
    const erros: string[] = []; const avisos: string[] = [];
    const nr = digitos(p.nrProcTrab);
    if (p.origem === '1') {
        if (!numeroCnjValido(nr)) erros.push('Número do processo: 20 dígitos no padrão do CNJ, com os dígitos verificadores certos.');
        else if (nr[13] !== '5') avisos.push('O número não é da Justiça do Trabalho (segmento 5): confira.');
        if (!data.test(p.dtSent) || p.dtSent > hoje) erros.push('Data da decisão (trânsito/homologação/cumprimento): obrigatória e não futura.');
        if (!UFS.includes(p.ufVara)) erros.push('UF da Vara: obrigatória.');
        if (!/^\d{7}$/.test(p.codMunic)) erros.push('Município da Vara: código do IBGE com 7 dígitos.');
        if (!/^\d{1,4}$/.test(p.idVara)) erros.push('Vara: número de 1 a 4 dígitos.');
    } else {
        if (!/^\d{15}$|^\d{20}$/.test(nr)) erros.push('Número da ata ou da conciliação: 15 ou 20 dígitos.');
        if (!data.test(p.dtCCP) || p.dtCCP > hoje) erros.push('Data do acordo na CCP/NINTER: obrigatória e não futura.');
        if (!TIPOS_CCP[p.tpCCP]) erros.push('Âmbito do acordo: CCP de empresa, CCP de sindicato ou NINTER.');
        if (p.cnpjCCP && !cnpjValido(digitos(p.cnpjCCP))) erros.push('CNPJ do sindicato da CCP inválido.');
    }
    if (!p.trabalhadores.length) erros.push('Inclua o trabalhador do processo.');
    const mesHoje = hoje.slice(0, 7);
    const cpfs = new Set<string>();
    for (const t of p.trabalhadores) {
        const quem = t.nome || t.cpf;
        if (!cpfValido(digitos(t.cpf))) erros.push(`${quem}: CPF inválido.`);
        if (cpfs.has(digitos(t.cpf))) erros.push(`${quem}: trabalhador repetido no processo.`);
        cpfs.add(digitos(t.cpf));
        if (!t.matricula.trim()) erros.push(`${quem}: matrícula do eSocial (a do S-2200) obrigatória.`);
        if (!mes.test(t.compIni) || !mes.test(t.compFim) || t.compFim < t.compIni) erros.push(`${quem}: período (competência inicial e final) inválido.`);
        else if (t.compFim > mesHoje) erros.push(`${quem}: a competência final não pode ser futura.`);
        if (!REPERCUSSOES[t.indReperc]) erros.push(`${quem}: repercussão da decisão inválida.`);
        const meses = new Set(mesesEntre(t.compIni, t.compFim));
        const vistos = new Set<string>();
        for (const x of t.periodos) {
            if (!meses.has(x.perRef)) erros.push(`${quem}: ${x.perRef} fora do período ${t.compIni} a ${t.compFim}.`);
            if (vistos.has(x.perRef)) erros.push(`${quem}: ${x.perRef} repetido.`);
            vistos.add(x.perRef);
            if ([x.bcCpMensal, x.bcCp13, x.bcFgts].some(v => !(v >= 0))) erros.push(`${quem}: valores de ${x.perRef} não podem ser negativos.`);
        }
        if (t.indReperc === '1' && !t.periodos.length) erros.push(`${quem}: com repercussão tributária ou FGTS, informe as bases mês a mês.`);
        if (t.indReperc === '1' && t.periodos.length && t.periodos.length !== meses.size) avisos.push(`${quem}: ${t.periodos.length} mês(es) com bases para ${meses.size} no período — o eSocial avisa quando não são todos.`);
        if (t.indReperc !== '1' && t.periodos.length) avisos.push(`${quem}: as bases mês a mês só vão no S-2500 com repercussão tributária ou FGTS (1).`);
    }
    return { erros, avisos };
}

/** Um pagamento (S-2501). */
export function validarPagamento(p: ProcessoTrabalhista, g: PagamentoProcesso): Validacao {
    const erros: string[] = []; const avisos: string[] = [];
    const inicio = (p.origem === '1' ? p.dtSent : p.dtCCP).slice(0, 7);
    if (!mes.test(g.perApurPgto)) erros.push('Mês do pagamento (perApurPgto) no formato AAAA-MM.');
    else if (inicio && g.perApurPgto < inicio) erros.push(`O mês do pagamento não pode ser anterior ao da decisão/acordo (${inicio}).`);
    if (g.ideSeqProc && !/^\d{1,3}$/.test(g.ideSeqProc)) erros.push('Sequencial do pagamento: até 3 dígitos.');
    if (!g.trabalhadores.length) erros.push('Inclua ao menos um trabalhador no pagamento.');
    const crIrrfDaOrigem = p.origem === '1' ? '593656' : '056152';
    for (const t of g.trabalhadores) {
        const tp = p.trabalhadores.find(x => digitos(x.cpf) === digitos(t.cpf));
        const quem = tp?.nome || t.cpf;
        if (!tp) { erros.push(`${t.cpf}: não está no processo (S-2500).`); continue; }
        if (tp.indReperc === '2') erros.push(`${quem}: decisão sem repercussão tributária não tem S-2501.`);
        const perRefs = new Set(tp.periodos.map(x => x.perRef));
        for (const c of t.contribuicoes) {
            if (!perRefs.has(c.perRef)) erros.push(`${quem}: ${c.perRef} sem bases no S-2500.`);
            if (!/^\d{6}$/.test(c.tpCR)) erros.push(`${quem}: código de receita da contribuição com 6 dígitos (Tabela 29).`);
            if (!(c.valor > 0)) erros.push(`${quem}: valor da contribuição de ${c.perRef} deve ser maior que zero.`);
        }
        const crs = new Set<string>();
        for (const i of t.irrf) {
            if (!CR_IRRF[i.tpCR]) erros.push(`${quem}: código do IRRF deve ser 593656, 056152 ou 188951.`);
            else if (i.tpCR !== '188951' && i.tpCR !== crIrrfDaOrigem) erros.push(`${quem}: para ${ROTULO_ORIGEM[p.origem].toLowerCase()}, o IRRF é ${crIrrfDaOrigem} (ou 188951 para RRA).`);
            if (crs.has(i.tpCR)) erros.push(`${quem}: código ${i.tpCR} repetido.`);
            crs.add(i.tpCR);
            if (!(i.vrCR >= 0)) erros.push(`${quem}: IRRF não pode ser negativo.`);
            if (i.isentoNTrib > 0 && !i.descIsento.trim()) erros.push(`${quem}: descreva o rendimento isento ou não tributável.`);
            if (i.tpCR === '188951') {
                if (!i.rra || !i.rra.descRRA.trim() || !(i.rra.qtdMeses > 0)) erros.push(`${quem}: RRA exige a descrição e o número de meses.`);
                if (i.vrCR13 > 0 || i.rendTrib13 > 0) erros.push(`${quem}: no RRA não se informa 13º separado.`);
            } else if (i.rra) erros.push(`${quem}: os dados de RRA só vão com o código 188951.`);
        }
        if (!t.contribuicoes.length && !t.irrf.length) erros.push(`${quem}: sem contribuições nem IRRF no pagamento.`);
    }
    return { erros, avisos };
}

const v = (centavos: number) => (Math.round(centavos) / 100).toFixed(2);
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const raiz = (cnpj: string) => digitos(cnpj).slice(0, 8);
const ideEvento = (tpAmb: TpAmb, nrRecibo?: string) =>
    `<ideEvento><indRetif>${nrRecibo ? 2 : 1}</indRetif>${nrRecibo ? `<nrRecibo>${esc(nrRecibo)}</nrRecibo>` : ''}<tpAmb>${tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`;

/** S-2500 de um trabalhador do processo (sem assinatura; o CFI assina). `nrRecibo` = retificação. */
export function gerarS2500(p: { cnpj: string; tpAmb: TpAmb; processo: ProcessoTrabalhista; cpf: string; nrRecibo?: string; id?: string }): { id: string; xml: string } {
    const pr = p.processo;
    const t = pr.trabalhadores.find(x => digitos(x.cpf) === digitos(p.cpf));
    if (!t) throw new Error('S-2500: trabalhador fora do processo.');
    const cnpj = digitos(p.cnpj);
    const id = p.id ?? idEvento(cnpj);
    const dados = pr.origem === '1'
        ? `<infoProcJud><dtSent>${pr.dtSent}</dtSent><ufVara>${pr.ufVara}</ufVara><codMunic>${pr.codMunic}</codMunic><idVara>${Number(pr.idVara)}</idVara></infoProcJud>`
        : `<infoCCP><dtCCP>${pr.dtCCP}</dtCCP><tpCCP>${pr.tpCCP}</tpCCP>${pr.cnpjCCP ? `<cnpjCCP>${digitos(pr.cnpjCCP)}</cnpjCCP>` : ''}</infoCCP>`;
    const periodos = t.indReperc === '1'
        ? [...t.periodos].sort((a, b) => a.perRef.localeCompare(b.perRef)).map(x => `<idePeriodo><perRef>${x.perRef}</perRef>`
            + `<baseCalculo><vrBcCpMensal>${v(x.bcCpMensal)}</vrBcCpMensal>${x.bcCp13 > 0 ? `<vrBcCp13>${v(x.bcCp13)}</vrBcCp13>` : ''}</baseCalculo>`
            + (x.bcFgts > 0 ? `<infoFGTS><vrBcFGTSProcTrab>${v(x.bcFgts)}</vrBcFGTSProcTrab></infoFGTS>` : '')
            + '</idePeriodo>').join('')
        : '';
    const xml = `<eSocial xmlns="${NS}/evtProcTrab/${VERSAO}"><evtProcTrab Id="${id}">`
        + ideEvento(p.tpAmb, p.nrRecibo)
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz(cnpj)}</nrInsc></ideEmpregador>`
        + `<infoProcesso><origem>${pr.origem}</origem><nrProcTrab>${digitos(pr.nrProcTrab)}</nrProcTrab>`
        + (pr.obs.trim() ? `<obsProcTrab>${esc(pr.obs.trim().slice(0, 999))}</obsProcTrab>` : '')
        + `<dadosCompl>${dados}</dadosCompl></infoProcesso>`
        + `<ideTrab><cpfTrab>${digitos(t.cpf)}</cpfTrab>`
        + '<infoContr><tpContr>1</tpContr><indContr>S</indContr><indReint>N</indReint><indCateg>N</indCateg><indNatAtiv>N</indNatAtiv><indMotDeslig>N</indMotDeslig>'
        + `<matricula>${esc(t.matricula.trim())}</matricula>`
        + `<ideEstab><tpInsc>1</tpInsc><nrInsc>${cnpj}</nrInsc><infoVlr><compIni>${t.compIni}</compIni><compFim>${t.compFim}</compFim><indReperc>${t.indReperc}</indReperc>`
        + periodos
        + '</infoVlr></ideEstab></infoContr></ideTrab></evtProcTrab></eSocial>';
    return { id, xml };
}

/** S-2501 de um pagamento (sem assinatura; o CFI assina). `nrRecibo` = retificação. */
export function gerarS2501(p: { cnpj: string; tpAmb: TpAmb; processo: ProcessoTrabalhista; pagamento: PagamentoProcesso; nrRecibo?: string; id?: string }): { id: string; xml: string } {
    const pr = p.processo; const g = p.pagamento;
    const cnpj = digitos(p.cnpj);
    const id = p.id ?? idEvento(cnpj);
    const trabs = g.trabalhadores.map(t => {
        const tp = pr.trabalhadores.find(x => digitos(x.cpf) === digitos(t.cpf));
        const perRefs = [...new Set(t.contribuicoes.map(c => c.perRef))].sort();
        const calc = perRefs.map(perRef => {
            const base = tp?.periodos.find(x => x.perRef === perRef);
            const crs = t.contribuicoes.filter(c => c.perRef === perRef)
                .map(c => `<infoCRContrib tpCR="${c.tpCR}" vrCR="${v(c.valor)}"/>`).join('');
            return `<calcTrib perRef="${perRef}" vrBcCpMensal="${v(base?.bcCpMensal ?? 0)}" vrBcCp13="${v(base?.bcCp13 ?? 0)}">${crs}</calcTrib>`;
        }).join('');
        const irrf = t.irrf.map(i => {
            const rra = i.tpCR === '188951';
            const at = (n: string, c: number) => (c > 0 ? ` ${n}="${v(c)}"` : '');
            const infoIR = (rra ? at('vrRendTrib', i.rendTrib) : at('vrRendTrib', i.rendTrib) + at('vrRendTrib13', i.rendTrib13))
                + at('vrJurosMora', i.jurosMora) + at('vrRendIsenNTrib', i.isentoNTrib)
                + (i.isentoNTrib > 0 ? ` descIsenNTrib="${esc(i.descIsento.trim().slice(0, 60))}"` : '')
                + at('vrPrevOficial', i.prevOficial) + (rra ? '' : at('vrPrevOficial13', i.prevOficial13));
            const infoRRA = rra && i.rra
                ? `<infoRRA descRRA="${esc(i.rra.descRRA.trim().slice(0, 50))}" qtdMesesRRA="${i.rra.qtdMeses.toFixed(1)}">`
                    + (i.rra.custas > 0 || i.rra.advogados > 0 ? `<despProcJud vlrDespCustas="${v(i.rra.custas)}" vlrDespAdvogados="${v(i.rra.advogados)}"/>` : '')
                    + '</infoRRA>'
                : '';
            return `<infoCRIRRF tpCR="${i.tpCR}" vrCR="${v(i.vrCR)}"${!rra && i.vrCR13 > 0 ? ` vrCR13="${v(i.vrCR13)}"` : ''}>`
                + (infoIR ? `<infoIR${infoIR}/>` : '') + infoRRA + '</infoCRIRRF>';
        }).join('');
        return `<ideTrab cpfTrab="${digitos(t.cpf)}">${calc}${irrf}</ideTrab>`;
    }).join('');
    const xml = `<eSocial xmlns="${NS}/evtContProc/${VERSAO}"><evtContProc Id="${id}">`
        + ideEvento(p.tpAmb, p.nrRecibo)
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz(cnpj)}</nrInsc></ideEmpregador>`
        + `<ideProc><nrProcTrab>${digitos(pr.nrProcTrab)}</nrProcTrab><perApurPgto>${g.perApurPgto}</perApurPgto>`
        + (g.ideSeqProc ? `<ideSeqProc>${Number(g.ideSeqProc)}</ideSeqProc>` : '')
        + (g.obs.trim() ? `<obs>${esc(g.obs.trim().slice(0, 999))}</obs>` : '')
        + '</ideProc>'
        + trabs
        + '</evtContProc></eSocial>';
    return { id, xml };
}

/** Totais do pagamento (centavos), para a tela e a conferência com a guia da DCTFWeb. */
export function totaisDoPagamento(g: PagamentoProcesso): { contribuicoes: number; irrf: number; porCR: Record<string, number> } {
    const porCR: Record<string, number> = {};
    let contribuicoes = 0; let irrf = 0;
    for (const t of g.trabalhadores) {
        for (const c of t.contribuicoes) { contribuicoes += c.valor; porCR[c.tpCR] = (porCR[c.tpCR] ?? 0) + c.valor; }
        for (const i of t.irrf) { const x = i.vrCR + i.vrCR13; irrf += x; porCR[i.tpCR] = (porCR[i.tpCR] ?? 0) + x; }
    }
    return { contribuicoes, irrf, porCR };
}

export const idProcesso = (empresaId: string, nrProcTrab: string) => `${empresaId}_${digitos(nrProcTrab)}`;
