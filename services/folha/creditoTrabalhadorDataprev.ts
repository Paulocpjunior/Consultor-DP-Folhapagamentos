// services/folha/creditoTrabalhadorDataprev.ts
//
// Crédito do Trabalhador pela API da Dataprev (etapa 6): o Consultor pede à plataforma do DP (serviço 'governo',
// rotas /credito-trabalhador/*), que fala com a Dataprev com o A1 do cofre (mTLS; o certificado não passa pelo
// navegador). As consignações da competência entram na MESMA prévia da importação do arquivo do Portal
// (importacaoConsignado.ts); o extrato do trabalhador preenche a garantia, o saldo devedor e a data da consulta dos
// contratos na ficha, para a rescisão. Nada é gravado sem a confirmação do usuário.

import { callFiscal } from '../serpro/serproIntegrationService';
import type { ContratoConsignado } from '../calculo/consignado';
import { centavos, type ArquivoLido } from '../calculo/importacaoConsignado';

export type AmbienteDataprev = 'producao' | 'homologacao';
/** O A1 da própria empresa (padrão nas telas: todas têm o certificado no cofre) ou o do escritório (procurador no e-CAC: códigos 00137, 00142 ou 88888). */
export type CertificadoDataprev = 'escritorio' | 'empresa';

export interface RespostaConsignacoes {
    ok: true; ambiente: AmbienteDataprev; certificado: CertificadoDataprev; httpStatus: number; semRegistros: boolean;
    competencia: string;
    consignacoes: Record<string, unknown>[];
}
export interface EmprestimoExtrato {
    ifConcessora?: { codigo?: number | string; descricao?: string };
    contrato?: string;
    situacaoEmprestimo?: { codigo?: number | string; descricao?: string };
    competenciaInicioDesconto?: string;
    competenciaFimDesconto?: string;
    valorParcela?: number | string;
    valorSaldoDevedor?: number | string;
    /** Manual v1.7: `temGarantias` diz se o FGTS foi dado em garantia; a garantia das verbas rescisórias é o percentual. */
    garantia?: { temGarantias?: boolean; percVerbaRescisoriaGarantia?: number | string };
}
export interface RespostaExtrato {
    ok: true; ambiente: AmbienteDataprev; certificado: CertificadoDataprev; httpStatus: number; semRegistros: boolean;
    /** O JSON da Dataprev como veio (o manual descreve um objeto com `emprestimos[]`; a leitura aceita lista ou envelope). */
    extrato: unknown;
}

export function buscarConsignacoesDataprev(p: { empresaId: string; cnpj: string; competencia: string; certificado?: CertificadoDataprev; ambiente?: AmbienteDataprev }): Promise<RespostaConsignacoes> {
    return callFiscal<RespostaConsignacoes>('/credito-trabalhador/consignacoes', { ...p, cnpj: p.cnpj.replace(/\D/g, '') });
}
export function consultarExtratoDataprev(p: { empresaId: string; cnpj: string; cpf: string; certificado?: CertificadoDataprev; ambiente?: AmbienteDataprev }): Promise<RespostaExtrato> {
    return callFiscal<RespostaExtrato>('/credito-trabalhador/extrato', { ...p, cnpj: p.cnpj.replace(/\D/g, ''), cpf: p.cpf.replace(/\D/g, '') });
}

/** Objeto em linha plana, como o JSON do Portal é lido: { ifConcessora: { codigo: 341 } } → { 'ifConcessora.codigo': '341' }. */
function achatar(o: unknown, prefixo = '', saida: Record<string, string> = {}): Record<string, string> {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) achatar(v, prefixo ? `${prefixo}.${k}` : k, saida);
    } else if (prefixo) saida[prefixo] = o === null || o === undefined ? '' : String(o);
    return saida;
}

/** Campos do retorno da Dataprev (manual v1.7, 3.1.3) que a importação usa. */
export const COLUNAS_DATAPREV = ['cpf', 'matricula', 'dataAdmissao', 'ifConcessora.codigo', 'contrato', 'valorParcela', 'competencia', 'nomeTrabalhador', 'numeroInscricaoEmpregador'];

/**
 * As consignações da Dataprev no formato do arquivo lido: a prévia, o mapa de colunas e a gravação são os da importação.
 * As colunas do manual vêm sempre, mesmo sem registros: a lista vazia ainda mostra os contratos das fichas que saíram
 * (quitados ou portados) para encerrar (Codex #281).
 */
export function arquivoDaDataprev(consignacoes: unknown[]): ArquivoLido {
    const linhas = consignacoes.filter(x => x && typeof x === 'object').map(x => achatar(x));
    return { colunas: [...new Set([...COLUNAS_DATAPREV, ...linhas.flatMap(l => Object.keys(l))])], linhas };
}

/** Valor da Dataprev (número com ponto, ou texto) em centavos. */
const emCentavos = (v: unknown): number | undefined => {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : undefined;
    if (typeof v === 'string' && v.trim()) return centavos(v) ?? undefined;
    return undefined;
};
const pct = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v.replace(',', '.')) : NaN;
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined;
};

export interface AtualizacaoRescisao {
    indice: number; instFinanc: string; nrDoc: string;
    antes: Pick<ContratoConsignado, 'garantiaRescisao' | 'saldoRescisao' | 'consultaRescisao'>;
    /** Só o que o extrato trouxe: sem o percentual, a garantia fica como estava (aviso para conferir no Portal). */
    depois: Pick<ContratoConsignado, 'garantiaRescisao' | 'saldoRescisao'> & { consultaRescisao: string };
}
export interface ContratoSoNoExtrato {
    /** Código de 3 dígitos da Tabela 37; vazio quando a resposta não trouxe (não grava: o descFolha exige). */
    instFinanc: string; nrDoc: string; instituicao?: string;
    parcela?: number; inicio?: string; fim?: string; saldo?: number; garantia?: number;
}
export interface ConferenciaExtrato {
    /** Quantos empréstimos ativos a Dataprev devolveu. */
    total: number;
    atualizacoes: AtualizacaoRescisao[];
    /** Contratos ativos na Dataprev que a ficha não tem: podem ser acrescentados à ficha (gravam ao salvar). */
    soNoExtrato: ContratoSoNoExtrato[];
    /** Contratos da ficha que não estão ativos no extrato (quitados, suspensos ou portados). */
    soNaFicha: { instFinanc: string; nrDoc: string }[];
    avisos: string[];
    /** Sem empréstimo achado numa resposta que não veio vazia: os nomes dos campos recebidos (só os nomes, nenhum valor). */
    camposRecebidos?: string[];
}

const ehObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/**
 * Os empréstimos do extrato em qualquer formato: o do manual ({ ..., emprestimos: [...] }), uma lista de vínculos (cada
 * um com os seus empréstimos) ou um envelope. Empréstimo = objeto com o número do `contrato`.
 */
export function emprestimosDoExtrato(dados: unknown, profundidade = 0): EmprestimoExtrato[] {
    if (profundidade > 4 || !dados || typeof dados !== 'object') return [];
    if (Array.isArray(dados)) {
        if (dados.some(x => ehObjeto(x) && 'contrato' in x)) return dados.filter(x => ehObjeto(x) && 'contrato' in x) as EmprestimoExtrato[];
        return dados.flatMap(x => emprestimosDoExtrato(x, profundidade + 1));
    }
    return Object.values(dados).flatMap(v => (v && typeof v === 'object' ? emprestimosDoExtrato(v, profundidade + 1) : []));
}

/**
 * A instituição do empréstimo: `ifConcessora.codigo` no manual v1.7, mas a resposta real do extrato pode trazer outro nome
 * (o primeiro uso, 16/10/2026, veio sem ele). Procura um campo de instituição/banco com código numérico de até 3 dígitos.
 */
export function instituicaoDoEmprestimo(e: Record<string, unknown>): { codigo?: string; descricao?: string } {
    // Número, "908" ou "908 - PARATI": os 1 a 3 dígitos do começo.
    const cod = (v: unknown) => { const m = (typeof v === 'number' || typeof v === 'string') ? /^\s*(\d{1,3})(?!\d)/.exec(String(v)) : null; return m ? m[1].padStart(3, '0') : undefined; };
    const desc = (o: Record<string, unknown>) => { const d = o.descricao ?? o.nome ?? o.razaoSocial ?? o.description; return typeof d === 'string' ? d : undefined; };
    const nome = /concess|instituic|banco|^if|credor|financeir/i;
    const entradas = Object.entries(e).sort(([a], [b]) => (a === 'ifConcessora' ? -1 : b === 'ifConcessora' ? 1 : 0));
    for (const [k, v] of entradas) {
        if (!nome.test(k)) continue;
        if (ehObjeto(v)) { const c = cod(v.codigo ?? v.code ?? v.cod ?? v.id ?? v.numero); if (c) return { codigo: c, descricao: desc(v) }; }
        else if (/cod|num/i.test(k) || k === 'ifConcessora' || k === 'banco') { const c = cod(v); if (c) return { codigo: c }; }
    }
    const d = entradas.find(([k, v]) => nome.test(k) && ehObjeto(v));
    return d ? { descricao: desc(d[1] as Record<string, unknown>) } : {};
}
/** Percentual da garantia das verbas rescisórias, onde quer que venha (`garantia.percVerbaRescisoriaGarantia` no manual). */
const percGarantia = (e: EmprestimoExtrato & Record<string, unknown>): number | undefined =>
    pct(e.garantia?.percVerbaRescisoriaGarantia ?? e.percVerbaRescisoriaGarantia ?? (ehObjeto(e.garantia) ? Object.entries(e.garantia).find(([k]) => /perc/i.test(k))?.[1] : undefined));
/** Número do contrato para casar: maiúsculo, sem espaços e sem zeros à esquerda (a Dataprev usa 15 posições). */
const nrCasar = (nr: unknown) => String(nr ?? '').trim().toUpperCase().replace(/^0+(?=.)/, '');

/** "10/2026" ou "2026-10" → "2026-10". */
const competencia = (v: unknown): string | undefined => {
    const t = String(v ?? '').trim();
    const a = /^(\d{2})\/(\d{4})$/.exec(t);
    if (a) return `${a[2]}-${a[1]}`;
    return /^\d{4}-\d{2}$/.test(t) ? t : undefined;
};
const chaveContrato = (inst: string, nr: string) => `${inst.replace(/\D/g, '').padStart(3, '0')}|${nr.trim().toUpperCase()}`;

/**
 * Casa o extrato com os contratos da ficha (instituição + número do contrato) e devolve a garantia, o saldo devedor e a
 * data da consulta de cada um, para o usuário conferir e aplicar; os ativos que a ficha não tem vêm à parte, para
 * acrescentar. Puro: `hoje` é AAAA-MM-DD.
 */
export function conferirExtrato(contratos: ContratoConsignado[], extrato: unknown, hoje: string): ConferenciaExtrato {
    const emprestimos = emprestimosDoExtrato(extrato);
    const avisos: string[] = [];
    // Casa pelo número do contrato: a instituição pode não vir na resposta, e o número não se repete para o trabalhador.
    const doExtrato = new Map<string, EmprestimoExtrato>();
    for (const e of emprestimos) if (nrCasar(e.contrato)) doExtrato.set(nrCasar(e.contrato), e);
    const achar = (c: ContratoConsignado) => doExtrato.get(nrCasar(c.nrDoc));

    const atualizacoes: AtualizacaoRescisao[] = [];
    const usados = new Set<EmprestimoExtrato>();
    const soNaFicha: ConferenciaExtrato['soNaFicha'] = [];
    contratos.forEach((c, indice) => {
        if (!c.instFinanc.trim() && !c.nrDoc.trim()) return; // linha em branco da ficha
        const e = achar(c);
        if (!e) { if (!c.fim) soNaFicha.push({ instFinanc: c.instFinanc, nrDoc: c.nrDoc }); return; }
        usados.add(e);
        const saldo = emCentavos(e.valorSaldoDevedor);
        const garantia = percGarantia(e as EmprestimoExtrato & Record<string, unknown>);
        if (saldo === undefined && garantia === undefined) {
            avisos.push(`Contrato ${c.nrDoc}: o extrato não trouxe o saldo devedor nem a garantia; preencha pelo Portal.`);
            return;
        }
        if (garantia === undefined) avisos.push(`Contrato ${c.nrDoc}: o extrato não trouxe o percentual da garantia das verbas rescisórias; confira no Portal (0% se não houver).`);
        if (saldo === undefined) avisos.push(`Contrato ${c.nrDoc}: o extrato não trouxe o saldo devedor; confira no Portal.`);
        atualizacoes.push({ indice, instFinanc: c.instFinanc, nrDoc: c.nrDoc,
            antes: { garantiaRescisao: c.garantiaRescisao, saldoRescisao: c.saldoRescisao, consultaRescisao: c.consultaRescisao },
            depois: { ...(garantia !== undefined ? { garantiaRescisao: garantia } : {}), ...(saldo !== undefined ? { saldoRescisao: saldo } : {}), consultaRescisao: hoje } });
    });
    const soNoExtrato: ContratoSoNoExtrato[] = emprestimos.filter(e => !usados.has(e) && e.contrato).map(e => {
        const inst = instituicaoDoEmprestimo(e as Record<string, unknown>);
        return {
            instFinanc: inst.codigo ?? '', nrDoc: String(e.contrato).trim(), instituicao: inst.descricao ?? e.ifConcessora?.descricao,
            parcela: emCentavos(e.valorParcela), inicio: competencia(e.competenciaInicioDesconto), fim: competencia(e.competenciaFimDesconto),
            saldo: emCentavos(e.valorSaldoDevedor), garantia: percGarantia(e as EmprestimoExtrato & Record<string, unknown>),
        };
    });
    const semInstituicao = soNoExtrato.filter(n => !n.instFinanc);
    if (semInstituicao.length) {
        const campos = [...new Set(emprestimos.flatMap(e => Object.keys(e)))].join(', ');
        avisos.push(`${semInstituicao.length} contrato(s) sem o código da instituição na resposta da Dataprev (${semInstituicao.map(n => n.nrDoc).join(', ')}): não entram na ficha, porque o eSocial exige o código no descFolha. Lance a instituição à mão ou importe o arquivo da competência. Campos recebidos: ${campos}.`);
    }
    const vazio = extrato === null || extrato === undefined || (Array.isArray(extrato) && !extrato.length);
    return {
        total: emprestimos.length, atualizacoes, soNoExtrato, soNaFicha, avisos,
        ...(!emprestimos.length && !vazio ? { camposRecebidos: Array.isArray(extrato) ? ['(lista)', ...Object.keys(ehObjeto(extrato[0]) ? extrato[0] : {})] : Object.keys(ehObjeto(extrato) ? extrato : {}) } : {}),
    };
}

/**
 * Aplica as atualizações conferidas nos contratos (só garantia, saldo e data da consulta), pela instituição e pelo número
 * do contrato, não pela posição: a lista da ficha pode ter mudado entre a consulta e o aplicar (Codex #281).
 */
export function aplicarExtrato(contratos: ContratoConsignado[], atualizacoes: AtualizacaoRescisao[]): ContratoConsignado[] {
    const por = new Map(atualizacoes.map(a => [chaveContrato(a.instFinanc, a.nrDoc), a.depois]));
    return contratos.map(c => { const d = por.get(chaveContrato(c.instFinanc, c.nrDoc)); return d ? { ...c, ...d } : c; });
}

/**
 * Os contratos que só a Dataprev tem, como contratos da ficha: a parcela a partir da competência de início do desconto,
 * mas nunca antes de `competenciaTela` (meses passados não mudam), até a de fim; garantia e saldo junto, com a data da
 * consulta. As linhas em branco da ficha saem.
 */
export function acrescentarDoExtrato(contratos: ContratoConsignado[], novos: ContratoSoNoExtrato[], competenciaTela: string, hoje: string): ContratoConsignado[] {
    const ja = new Set(contratos.map(c => chaveContrato(c.instFinanc, c.nrDoc)));
    const preenchidos = contratos.filter(c => c.instFinanc.trim() || c.nrDoc.trim());
    const jaNr = new Set(contratos.map(c => nrCasar(c.nrDoc)));
    const mais = novos.filter(n => n.parcela && /^\d{3}$/.test(n.instFinanc) && n.instFinanc !== '000' && !ja.has(chaveContrato(n.instFinanc, n.nrDoc)) && !jaNr.has(nrCasar(n.nrDoc))).map((n): ContratoConsignado => ({
        instFinanc: n.instFinanc, nrDoc: n.nrDoc, parcela: n.parcela!, inicio: n.inicio && n.inicio > competenciaTela ? n.inicio : competenciaTela,
        ...(n.fim ? { fim: n.fim } : {}),
        ...(n.garantia !== undefined ? { garantiaRescisao: n.garantia } : {}),
        ...(n.saldo !== undefined ? { saldoRescisao: n.saldo } : {}),
        ...(n.garantia !== undefined || n.saldo !== undefined ? { consultaRescisao: hoje } : {}),
        observacao: `Extrato da Dataprev em ${hoje.split('-').reverse().join('/')}${n.instituicao ? ` (${n.instituicao})` : ''}`,
    }));
    return [...preenchidos, ...mais];
}
