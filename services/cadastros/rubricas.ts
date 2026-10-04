// services/cadastros/rubricas.ts
//
// Incidências dos eventos: o evento do IOB (catálogo, com as marcas IN, IR e
// FG) × a rubrica que a empresa mandou ao eSocial no S-1010, que é o que o
// eSocial usa para montar as bases dos totalizadores (S-5001, S-5003). Se as
// duas discordam, a folha do IOB e o totalizador do eSocial divergem.
//
// Códigos: codIncCP e codIncFGTS são as enumerações do XSD oficial do S-1010
// (leiaute S-1.3, nfephp-org/sped-esocial). codIncIRRF segue a Tabela 21,
// que não está no XSD: só os códigos conferidos em busca pública
// (04/10/2026) têm rótulo; os demais são aceitos e classificados pela faixa,
// e a faixa só decide a conferência quando é inequívoca.

import { dataValida } from './documentos';
import type { EventoIobSage } from '../folha/folhaTypes';

export const COD_INC_CP: Record<string, string> = {
    '00': 'Não é base de cálculo', '01': 'Não é base (acordos internacionais)',
    '11': 'Base: salário de contribuição mensal', '12': 'Base: 13º salário',
    '13': 'Base exclusiva do empregador: mensal', '14': 'Base exclusiva do empregador: 13º',
    '15': 'Base exclusiva do segurado: mensal', '16': 'Base exclusiva do segurado: 13º',
    '21': 'Salário-maternidade mensal pago pelo empregador', '22': 'Salário-maternidade 13º pago pelo empregador',
    '25': 'Salário-maternidade mensal pago pelo INSS', '26': 'Salário-maternidade 13º pago pelo INSS',
    '31': 'Contribuição descontada do segurado: mensal', '32': 'Contribuição descontada do segurado: 13º',
    '34': 'SEST', '35': 'SENAT', '51': 'Outros: salário-família',
    '91': 'Suspensão judicial: mensal', '92': 'Suspensão judicial: 13º', '93': 'Suspensão judicial: salário-maternidade',
    '94': 'Suspensão judicial: salário-maternidade 13º', '95': 'Suspensão judicial: exclusiva do empregador mensal',
    '96': 'Suspensão judicial: exclusiva do empregador 13º', '97': 'Suspensão judicial: exclusiva do empregador sal.-maternidade',
    '98': 'Suspensão judicial: exclusiva do empregador sal.-maternidade 13º',
};
export const COD_INC_FGTS: Record<string, string> = {
    '00': 'Não é base do FGTS', '11': 'Base do FGTS mensal', '12': 'Base do FGTS 13º salário', '21': 'Base do FGTS aviso prévio indenizado',
    '31': 'Desconto eConsignado', '91': 'Suspensão judicial: FGTS mensal', '92': 'Suspensão judicial: FGTS 13º', '93': 'Suspensão judicial: FGTS aviso prévio indenizado',
};
export const COD_INC_IRRF: Record<string, string> = {
    '11': 'Remuneração mensal', '12': '13º salário', '13': 'Férias', '14': 'PLR',
    '31': 'Retenção do IRRF: remuneração mensal', '41': 'Dedução: Previdência Social Oficial (mensal)', '51': 'Pensão alimentícia (mensal)',
};
export const TP_RUBR: Record<string, string> = { '1': 'Vencimento', '2': 'Desconto', '3': 'Informativa', '4': 'Informativa dedutora' };

const BASE_CP = ['11', '12', '13', '14', '15', '16', '21', '22', '25', '26'];
const BASE_FGTS = ['11', '12', '21'];

export type ClasseIrrf = 'tributavel' | 'retencao' | 'deducao' | 'pensao' | 'suspensa' | 'outra';
/** Faixa do código da Tabela 21: 1x tributável, 3x retenção, 4x dedução previdenciária, 5x pensão, 9xxx suspensão. */
export function classeIrrf(c: string): ClasseIrrf {
    if (/^1[1-5]$/.test(c)) return 'tributavel';
    if (/^3[1-5]$/.test(c)) return 'retencao';
    if (/^4\d$/.test(c)) return 'deducao';
    if (/^5[1-5]$/.test(c)) return 'pensao';
    if (/^9\d{3}$/.test(c)) return 'suspensa';
    return 'outra';
}

export const rotuloCodigo = (tabela: Record<string, string>, c: string, nomeTabela: string) => (!c ? '' : tabela[c] ? `${c} - ${tabela[c]}` : `${c} - conferir na ${nomeTabela}`);
export const rotuloIrrf = (c: string) => rotuloCodigo(COD_INC_IRRF, c, 'Tabela 21');

export interface DadosRubrica {
    dscRubr: string; natRubr: string; tpRubr: string; codIncCP: string; codIncIRRF: string; codIncFGTS: string; codIncCPRP: string; observacao: string;
}
export interface VigenciaRubrica { iniValid: string; fimValid: string; dados: DadosRubrica; recibo: string }

export interface Rubrica {
    id: string;
    empresaId: string;
    codRubr: string;
    ideTabRubr: string;
    vigencias: VigenciaRubrica[];
    eventoIob: string; // vínculo manual com o evento do IOB; vazio = pelo código
    origem: string;
}

export function rubricaVazia(): Rubrica { return { id: '', empresaId: '', codRubr: '', ideTabRubr: '', vigencias: [], eventoIob: '', origem: '' }; }

export const idRubrica = (empresaId: string, ideTabRubr: string, codRubr: string) => `${empresaId}_${encodeURIComponent(ideTabRubr)}_${encodeURIComponent(codRubr)}`;

/** Vigência que vale na competência (AAAA-MM): a de maior início até ela, sem fim anterior. */
export function vigenciaEm(r: Rubrica, competencia: string): VigenciaRubrica | undefined {
    return r.vigencias.filter(v => v.iniValid <= competencia && (!v.fimValid || v.fimValid >= competencia))
        .sort((a, b) => b.iniValid.localeCompare(a.iniValid))[0];
}

/** Código do evento do IOB ligado à rubrica: o vínculo manual ou o próprio código, com 4 dígitos. */
export function codigoEvento(r: Rubrica): string {
    if (r.eventoIob) return r.eventoIob.padStart(4, '0');
    return /^\d{1,4}$/.test(r.codRubr) ? r.codRubr.padStart(4, '0') : '';
}

// ---------- Conferência IOB × eSocial ----------

export type SituacaoInc = 'ok' | 'divergente' | 'suspensa' | 'conferir';
export interface ItemConferencia { tributo: 'Tipo' | 'INSS' | 'IRRF' | 'FGTS' | 'Natureza'; situacao: SituacaoInc; mensagem: string }

/**
 * Regras (o IOB marca se o evento ENTRA na base; o eSocial diz COMO entra):
 * - Tipo: V ↔ tpRubr 1; D ↔ tpRubr 2 ou 4.
 * - INSS: IN ou INF = S ↔ codIncCP de base (11–16, 21, 22, 25, 26).
 * - FGTS: FG = S ↔ codIncFGTS 11, 12 ou 21.
 * - IRRF: IR ou IRF = S ↔ Tabela 21 tributável (11–15), dedução (4x) ou pensão (51–55).
 * - Suspensão judicial (9x) não é divergência: fica para conferir com o processo.
 * - Salário-maternidade pago pelo INSS (codIncCP 25/26) fica para conferir.
 * - natRubr 9253 (eConsignado) exige tpRubr 2 e codIncFGTS 31 (validação do XSD).
 */
export function conferirIncidencias(ev: EventoIobSage, v: VigenciaRubrica): ItemConferencia[] {
    const d = v.dados; const r: ItemConferencia[] = [];
    const tipoOk = ev.tipo === 'V' ? d.tpRubr === '1' : ['2', '4'].includes(d.tpRubr);
    r.push({ tributo: 'Tipo', situacao: tipoOk ? 'ok' : 'divergente', mensagem: tipoOk ? '' : `IOB ${ev.tipo === 'V' ? 'vencimento' : 'desconto'} × eSocial ${TP_RUBR[d.tpRubr] ?? d.tpRubr}` });

    const iobInss = ev.incidencias.in === 'S' || ev.incidencias.inf === 'S';
    if (/^9\d$/.test(d.codIncCP)) r.push({ tributo: 'INSS', situacao: 'suspensa', mensagem: `${rotuloCodigo(COD_INC_CP, d.codIncCP, 'tabela')}: conferir o processo` });
    else if (['25', '26'].includes(d.codIncCP)) r.push({ tributo: 'INSS', situacao: 'conferir', mensagem: `${rotuloCodigo(COD_INC_CP, d.codIncCP, 'tabela')}: conferir como o IOB trata o salário-maternidade pago pelo INSS` });
    else {
        const esocial = BASE_CP.includes(d.codIncCP);
        r.push({ tributo: 'INSS', situacao: esocial === iobInss ? 'ok' : 'divergente', mensagem: esocial === iobInss ? '' : `IOB ${iobInss ? 'incide' : 'não incide'} × eSocial ${rotuloCodigo(COD_INC_CP, d.codIncCP, 'tabela')}` });
    }

    const iobFgts = ev.incidencias.fg === 'S';
    if (/^9\d$/.test(d.codIncFGTS)) r.push({ tributo: 'FGTS', situacao: 'suspensa', mensagem: `${rotuloCodigo(COD_INC_FGTS, d.codIncFGTS, 'tabela')}: conferir o processo` });
    else {
        const esocial = BASE_FGTS.includes(d.codIncFGTS);
        r.push({ tributo: 'FGTS', situacao: esocial === iobFgts ? 'ok' : 'divergente', mensagem: esocial === iobFgts ? '' : `IOB ${iobFgts ? 'incide' : 'não incide'} × eSocial ${rotuloCodigo(COD_INC_FGTS, d.codIncFGTS, 'tabela')}` });
    }

    const iobIr = ev.incidencias.ir === 'S' || ev.incidencias.irf === 'S';
    const cls = classeIrrf(d.codIncIRRF);
    if (cls === 'suspensa') r.push({ tributo: 'IRRF', situacao: 'suspensa', mensagem: `${rotuloIrrf(d.codIncIRRF)}: conferir o processo` });
    else if (cls === 'outra' && iobIr) r.push({ tributo: 'IRRF', situacao: 'conferir', mensagem: `IOB incide × eSocial ${rotuloIrrf(d.codIncIRRF)}: conferir se o código afeta a base` });
    else {
        const esocial = ['tributavel', 'deducao', 'pensao'].includes(cls);
        r.push({ tributo: 'IRRF', situacao: esocial === iobIr ? 'ok' : 'divergente', mensagem: esocial === iobIr ? '' : `IOB ${iobIr ? 'incide' : 'não incide'} × eSocial ${rotuloIrrf(d.codIncIRRF)}` });
    }

    if (d.natRubr === '9253' && (d.tpRubr !== '2' || d.codIncFGTS !== '31')) r.push({ tributo: 'Natureza', situacao: 'divergente', mensagem: 'Natureza 9253 (eConsignado) exige desconto e codIncFGTS 31.' });
    return r;
}

export const situacaoGeral = (itens: ItemConferencia[]): SituacaoInc =>
    itens.some(i => i.situacao === 'divergente') ? 'divergente' : itens.some(i => i.situacao === 'conferir') ? 'conferir' : itens.some(i => i.situacao === 'suspensa') ? 'suspensa' : 'ok';

// ---------- Leitura dos XMLs do S-1010 ----------

export interface EventoRubrica {
    id: string; fonte: string; acao: 'inclusao' | 'alteracao' | 'exclusao'; codRubr: string; ideTabRubr: string;
    iniValid: string; fimValid: string; novaValidade?: { iniValid: string; fimValid: string }; dados?: DadosRubrica; recibo: string; processadoEm: string;
}

const filhos = (e: Element, n: string) => Array.from(e.children).filter(c => c.localName === n);
const no = (e: Element | null | undefined, caminho: string) => caminho.split('/').reduce<Element | undefined>((p, n) => p && filhos(p, n)[0], e ?? undefined);
const val = (e: Element | null | undefined, caminho: string) => no(e, caminho)?.textContent?.trim() ?? '';

function lerDados(e: Element | undefined): DadosRubrica | undefined {
    if (!e) return undefined;
    return { dscRubr: val(e, 'dscRubr'), natRubr: val(e, 'natRubr'), tpRubr: val(e, 'tpRubr'), codIncCP: val(e, 'codIncCP'), codIncIRRF: val(e, 'codIncIRRF'), codIncFGTS: val(e, 'codIncFGTS'), codIncCPRP: val(e, 'codIncCPRP'), observacao: val(e, 'observacao') };
}

export function lerXmlRubricas(nome: string, xml: string, raizCnpj: string): { eventos: EventoRubrica[]; avisos: string[] } {
    const avisos: string[] = []; const eventos: EventoRubrica[] = [];
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { eventos, avisos: [`${nome}: XML com DTD ou entidades não é aceito.`] };
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return { eventos, avisos: [`${nome}: XML malformado.`] };
    const els = Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === 'evtTabRubrica' && e.hasAttribute('Id'));
    if (!els.length) return { eventos, avisos: [`${nome}: nenhum S-1010 no arquivo.`] };
    for (const el of els) {
        if (!/^http:\/\/www\.esocial\.gov\.br\/schema\/evt\/evtTabRubrica\/v_S_01_0[0-3]_00$/.test(el.namespaceURI || '')) { avisos.push(`${nome}: versão do leiaute não suportada.`); continue; }
        if (val(el, 'ideEmpregador/nrInsc').slice(0, 8) !== raizCnpj) { avisos.push(`${nome}: empregador diferente; ignorado.`); continue; }
        if (val(el, 'ideEvento/tpAmb') !== '1') { avisos.push(`${nome}: ambiente diferente de produção; ignorado.`); continue; }
        let env: Element | null = el.parentElement;
        while (env && env.localName !== 'retornoEventoCompleto') env = env.parentElement;
        const ret = env ? no(env, 'recibo/eSocial/retornoEvento') : undefined;
        if (!ret || val(ret, 'processamento/cdResposta') !== '201') { avisos.push(`${nome}: S-1010 sem recibo de processamento (201); ignorado.`); continue; }
        const info = no(el, 'infoRubrica');
        const bloco = info && (['inclusao', 'alteracao', 'exclusao'] as const).find(a => no(info, a));
        if (!info || !bloco) { avisos.push(`${nome}: S-1010 sem inclusão, alteração ou exclusão.`); continue; }
        const b = no(info, bloco)!;
        const nova = no(b, 'novaValidade');
        eventos.push({
            id: el.getAttribute('Id')!, fonte: nome, acao: bloco, codRubr: val(b, 'ideRubrica/codRubr'), ideTabRubr: val(b, 'ideRubrica/ideTabRubr'),
            iniValid: val(b, 'ideRubrica/iniValid'), fimValid: val(b, 'ideRubrica/fimValid'),
            novaValidade: nova ? { iniValid: val(nova, 'iniValid'), fimValid: val(nova, 'fimValid') } : undefined,
            dados: lerDados(no(b, 'dadosRubrica')), recibo: val(ret, 'recibo/nrRecibo'), processadoEm: val(ret, 'processamento/dhProcessamento'),
        });
    }
    return { eventos, avisos };
}

/** Aplica inclusões, alterações e exclusões na ordem de processamento e monta as rubricas com suas vigências. */
export function consolidarRubricas(eventos: EventoRubrica[], empresaId: string): { rubricas: Rubrica[]; avisos: string[] } {
    const avisos: string[] = [];
    const mapa = new Map<string, Rubrica>();
    const unicos = [...new Map(eventos.map(e => [e.id, e])).values()].sort((a, b) => a.processadoEm.localeCompare(b.processadoEm));
    for (const e of unicos) {
        const id = idRubrica(empresaId, e.ideTabRubr, e.codRubr);
        const r = mapa.get(id) ?? { ...rubricaVazia(), id, empresaId, codRubr: e.codRubr, ideTabRubr: e.ideTabRubr, origem: 'eSocial: S-1010' };
        mapa.set(id, r);
        const i = r.vigencias.findIndex(v => v.iniValid === e.iniValid);
        if (e.acao === 'inclusao') {
            if (!e.dados) continue;
            const v = { iniValid: e.iniValid, fimValid: e.fimValid, dados: e.dados, recibo: e.recibo };
            if (i >= 0) r.vigencias[i] = v; else r.vigencias.push(v);
        } else if (e.acao === 'alteracao') {
            if (i < 0) { avisos.push(`${e.fonte}: alteração da rubrica ${e.codRubr} vigente em ${e.iniValid} sem a inclusão nos arquivos; usada como inclusão.`); }
            const ini = e.novaValidade?.iniValid || e.iniValid;
            const v = { iniValid: ini, fimValid: e.novaValidade ? e.novaValidade.fimValid : (i >= 0 ? r.vigencias[i].fimValid : e.fimValid), dados: e.dados ?? r.vigencias[i]?.dados, recibo: e.recibo };
            if (!v.dados) continue;
            if (i >= 0) r.vigencias.splice(i, 1);
            r.vigencias.push(v as VigenciaRubrica);
        } else if (i >= 0) r.vigencias.splice(i, 1);
        else avisos.push(`${e.fonte}: exclusão da rubrica ${e.codRubr} vigente em ${e.iniValid} que não estava nos arquivos.`);
        r.vigencias.sort((a, b) => a.iniValid.localeCompare(b.iniValid));
    }
    return { rubricas: [...mapa.values()].filter(r => r.vigencias.length).sort((a, b) => a.codRubr.localeCompare(b.codRubr, 'pt-BR', { numeric: true })), avisos: [...new Set(avisos)] };
}

export interface MesclaRubrica { rubrica: Rubrica; novo: boolean; mudou: boolean }

/** O S-1010 é a fonte das vigências; o vínculo manual com o evento do IOB é preservado. */
export function mesclarRubricas(importadas: Rubrica[], existentes: Rubrica[]): MesclaRubrica[] {
    const porId = new Map(existentes.map(r => [r.id, r]));
    return importadas.map(imp => {
        const atual = porId.get(imp.id);
        if (!atual) return { rubrica: imp, novo: true, mudou: true };
        const rubrica = { ...imp, eventoIob: atual.eventoIob };
        return { rubrica, novo: false, mudou: JSON.stringify(atual.vigencias) !== JSON.stringify(imp.vigencias) };
    });
}

export const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c) && dataValida(`${c}-01`);
