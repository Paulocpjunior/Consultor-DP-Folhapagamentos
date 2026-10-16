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
/** O A1 do escritório (procurador no e-CAC: códigos 00137, 00142 ou 88888) ou o da própria empresa. */
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
    valorParcela?: number | string;
    valorSaldoDevedor?: number | string;
    garantia?: { temGarantias?: boolean; percVerbaRescisoriaGarantia?: number | string };
}
export interface RespostaExtrato {
    ok: true; ambiente: AmbienteDataprev; certificado: CertificadoDataprev; httpStatus: number; semRegistros: boolean;
    extrato: { cpf?: string; nomeTrabalhador?: string; emprestimos?: EmprestimoExtrato[] } | null;
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
    depois: Required<Pick<ContratoConsignado, 'garantiaRescisao' | 'saldoRescisao' | 'consultaRescisao'>>;
}
export interface ConferenciaExtrato {
    atualizacoes: AtualizacaoRescisao[];
    /** Contratos ativos na Dataprev que a ficha não tem (a importação da competência os traz). */
    soNoExtrato: { instFinanc: string; nrDoc: string; parcela?: number }[];
    /** Contratos da ficha que não estão ativos no extrato (quitados, suspensos ou portados). */
    soNaFicha: { instFinanc: string; nrDoc: string }[];
    avisos: string[];
}

/**
 * Casa o extrato com os contratos da ficha (instituição + número do contrato) e devolve a garantia, o saldo devedor e a
 * data da consulta de cada um, para o usuário conferir e aplicar. Puro: `hoje` é AAAA-MM-DD.
 */
export function conferirExtrato(contratos: ContratoConsignado[], extrato: RespostaExtrato['extrato'], hoje: string): ConferenciaExtrato {
    const emprestimos = extrato?.emprestimos ?? [];
    const avisos: string[] = [];
    const chave = (inst: string, nr: string) => `${inst.replace(/\D/g, '').padStart(3, '0')}|${nr.trim().toUpperCase()}`;
    const doExtrato = new Map<string, EmprestimoExtrato>();
    for (const e of emprestimos) {
        const inst = String(e.ifConcessora?.codigo ?? '');
        const nr = String(e.contrato ?? '');
        if (inst && nr) doExtrato.set(chave(inst, nr), e);
    }
    // Contrato com zeros à esquerda na Dataprev (15 posições) e sem eles na ficha: casa também pelo número sem os zeros.
    const semZeros = (k: string) => k.replace(/\|0+(?=.)/, '|');
    const achar = (k: string) => doExtrato.get(k) ?? [...doExtrato.entries()].find(([x]) => semZeros(x) === semZeros(k))?.[1];

    const atualizacoes: AtualizacaoRescisao[] = [];
    const usados = new Set<EmprestimoExtrato>();
    const soNaFicha: ConferenciaExtrato['soNaFicha'] = [];
    contratos.forEach((c, indice) => {
        const e = achar(chave(c.instFinanc, c.nrDoc));
        if (!e) { if (!c.fim) soNaFicha.push({ instFinanc: c.instFinanc, nrDoc: c.nrDoc }); return; }
        usados.add(e);
        const saldo = emCentavos(e.valorSaldoDevedor);
        // Sem garantia no contrato, a garantia é 0% (o Portal mostra 0%): a rescisão não desconta.
        const garantia = e.garantia?.temGarantias === false ? 0 : pct(e.garantia?.percVerbaRescisoriaGarantia);
        if (saldo === undefined || garantia === undefined) {
            avisos.push(`Contrato ${c.nrDoc}: o extrato não trouxe ${saldo === undefined ? 'o saldo devedor' : 'o percentual da garantia'}; preencha pelo Portal.`);
            return;
        }
        atualizacoes.push({ indice, instFinanc: c.instFinanc, nrDoc: c.nrDoc,
            antes: { garantiaRescisao: c.garantiaRescisao, saldoRescisao: c.saldoRescisao, consultaRescisao: c.consultaRescisao },
            depois: { garantiaRescisao: garantia, saldoRescisao: saldo, consultaRescisao: hoje } });
    });
    const soNoExtrato = emprestimos.filter(e => !usados.has(e) && e.contrato)
        .map(e => ({ instFinanc: String(e.ifConcessora?.codigo ?? '').padStart(3, '0'), nrDoc: String(e.contrato), parcela: emCentavos(e.valorParcela) }));
    if (soNoExtrato.length) avisos.push(`${soNoExtrato.length} contrato(s) ativo(s) na Dataprev fora da ficha: importe as consignações da competência (Folha do mês › Crédito do Trabalhador).`);
    return { atualizacoes, soNoExtrato, soNaFicha, avisos };
}

/**
 * Aplica as atualizações conferidas nos contratos (só garantia, saldo e data da consulta), pela instituição e pelo número
 * do contrato, não pela posição: a lista da ficha pode ter mudado entre a consulta e o aplicar (Codex #281).
 */
export function aplicarExtrato(contratos: ContratoConsignado[], atualizacoes: AtualizacaoRescisao[]): ContratoConsignado[] {
    const id = (inst: string, nr: string) => `${inst.replace(/\D/g, '').padStart(3, '0')}|${nr.trim().toUpperCase()}`;
    const por = new Map(atualizacoes.map(a => [id(a.instFinanc, a.nrDoc), a.depois]));
    return contratos.map(c => { const d = por.get(id(c.instFinanc, c.nrDoc)); return d ? { ...c, ...d } : c; });
}
