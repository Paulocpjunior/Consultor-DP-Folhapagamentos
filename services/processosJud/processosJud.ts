// services/processosJud/processosJud.ts
//
// Processos administrativos e judiciais da empresa (S-1070, Tabela de Processos), como o "Processos Judiciais/
// Administrativos" do SAGE: os que suspendem a exigibilidade de contribuição previdenciária, IRRF ou FGTS. O S-1070 vai
// antes dos eventos que citam o processo:
// - S-1010: rubrica com incidência suspensa (códigos 9x) leva o processo em ideProcessoCP, ideProcessoIRRF ou
//   ideProcessoFGTS (services/esocial/tabelaRubricas.ts);
// - S-1005: RAT ou FAP diferente do padrão leva o processo (procAdmJudRat, procAdmJudFap);
// - S-1020: terceiros com recolhimento suspenso (procJudTerceiro).
// Regras do XSD S-1.3 (evtTabProcesso): tpProc 1 administrativo (17 ou 21 algarismos), 2 judicial (20, a numeração do
// CNJ), 4 FAP (16); judicial de matéria tributária leva a vara (UF, município e código); matéria tributária (indMatProc 1)
// leva ao menos uma suspensão (codSusp, indicativo, data da decisão e depósito do montante integral), com os indicativos
// permitidos para cada tipo; depósito integral (02, 03) é sempre "S" e decisão definitiva (90) é "N".
// Puro, sem Firebase.

import { dataValida } from '../cadastros/documentos';
import { idEvento, VER_PROC, type TpAmb } from '../esocial/transmissao';

export type TpProc = '1' | '2' | '4';
export const TIPOS_PROCESSO: Record<TpProc, string> = { '1': 'Administrativo', '2': 'Judicial', '4': 'FAP (contestação)' };
export const INDICATIVOS_SUSPENSAO: [string, string][] = [
    ['01', 'Liminar em mandado de segurança'], ['02', 'Depósito judicial do montante integral'], ['03', 'Depósito administrativo do montante integral'],
    ['04', 'Antecipação de tutela'], ['05', 'Liminar em medida cautelar'], ['08', 'Sentença em mandado de segurança favorável ao contribuinte'],
    ['09', 'Sentença em ação ordinária favorável ao contribuinte e confirmada pelo TRF'], ['10', 'Acórdão do TRF favorável ao contribuinte'],
    ['11', 'Acórdão do STJ em recurso especial favorável ao contribuinte'], ['12', 'Acórdão do STF em recurso extraordinário favorável ao contribuinte'],
    ['13', 'Sentença de 1ª instância não transitada em julgado com efeito suspensivo'], ['14', 'Contestação administrativa do FAP'],
    ['90', 'Decisão definitiva a favor do contribuinte'], ['92', 'Sem suspensão da exigibilidade'],
];
/** Indicativos de suspensão permitidos por tipo de processo (XSD do S-1070). */
export const SUSPENSAO_POR_TIPO: Record<TpProc, string[]> = { '1': ['03', '14', '92'], '2': ['01', '02', '04', '05', '08', '09', '10', '11', '12', '13', '90', '92'], '4': ['14'] };
const DIGITOS_POR_TIPO: Record<TpProc, number[]> = { '1': [17, 21], '2': [20], '4': [16] };
const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');

export interface Suspensao { codSusp: string; indSusp: string; dtDecisao: string; indDeposito: 'S' | 'N' }

export interface ProcessoJudAdm {
    id: string;
    empresaId: string;
    tpProc: TpProc;
    nrProc: string;
    /** Início e fim da validade (AAAA-MM). */
    iniValid: string;
    fimValid: string;
    /** Judicial: 1 o próprio contribuinte, 2 outra entidade, empresa ou empregado. */
    indAutoria: '' | '1' | '2';
    /** 1 tributária (ou tributária e FGTS); 7 só FGTS ou a contribuição rescisória (LC 110/2001). */
    indMatProc: '1' | '7';
    observacao: string;
    /** Judicial tributário: a vara. */
    vara: { uf: string; codMunic: string; idVara: string };
    suspensoes: Suspensao[];
    /** Recibo do S-1070 aceito (inclusão ou a última alteração). */
    recibo: string;
    ativo: boolean;
}

export const processoVazio = (empresaId: string): ProcessoJudAdm => ({
    id: '', empresaId, tpProc: '2', nrProc: '', iniValid: '', fimValid: '', indAutoria: '1', indMatProc: '1', observacao: '',
    vara: { uf: '', codMunic: '', idVara: '' }, suspensoes: [{ codSusp: '1', indSusp: '', dtDecisao: '', indDeposito: 'N' }], recibo: '', ativo: true,
});
const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
export const idProcesso = (empresaId: string, tpProc: string, nrProc: string) => `${empresaId}_${tpProc}_${digitos(nrProc)}`;
export const refProcesso = (id: string, acao: AcaoS1070) => `s1070:${id}:${acao}`;
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
const vaiJud = (p: Pick<ProcessoJudAdm, 'tpProc' | 'indMatProc'>) => p.tpProc === '2' && p.indMatProc === '1';

/** A identificação do processo (tipo, número e validade): basta para a exclusão. */
export function validarIdentificacao(p: Pick<ProcessoJudAdm, 'tpProc' | 'nrProc' | 'iniValid' | 'fimValid'>): string[] {
    const e: string[] = [];
    if (!TIPOS_PROCESSO[p.tpProc]) e.push('Tipo do processo.');
    const n = digitos(p.nrProc);
    if (TIPOS_PROCESSO[p.tpProc] && !DIGITOS_POR_TIPO[p.tpProc].includes(n.length)) e.push(`Número do processo ${TIPOS_PROCESSO[p.tpProc].toLowerCase()}: ${DIGITOS_POR_TIPO[p.tpProc].join(' ou ')} algarismos.`);
    if (!COMP.test(p.iniValid)) e.push('Início da validade (mês/ano).');
    if (p.fimValid && (!COMP.test(p.fimValid) || p.fimValid < p.iniValid)) e.push('Fim da validade: mês/ano igual ou depois do início.');
    return e;
}

export function validarProcesso(p: ProcessoJudAdm): string[] {
    const e = validarIdentificacao(p);
    if (p.tpProc === '2' && p.indAutoria !== '1' && p.indAutoria !== '2') e.push('Processo judicial: informe a autoria da ação.');
    if (p.indMatProc !== '1' && p.indMatProc !== '7') e.push('Matéria do processo.');
    if (p.tpProc === '4' && p.indMatProc !== '1') e.push('Processo do FAP é matéria tributária.');
    if (p.observacao.length > 255) e.push('Observação com até 255 caracteres.');
    if (vaiJud(p)) {
        if (!UFS.includes(p.vara.uf.toUpperCase())) e.push('Vara: UF.');
        if (!/^\d{7}$/.test(digitos(p.vara.codMunic))) e.push('Vara: código IBGE do município (7 dígitos).');
        if (!/^\d{1,4}$/.test(p.vara.idVara.trim())) e.push('Vara: código de identificação (até 4 algarismos).');
    }
    if (p.indMatProc === '1') {
        if (!p.suspensoes.length) e.push('Matéria tributária: informe ao menos uma suspensão (código, indicativo, data da decisão e depósito).');
        const vistos = new Set<string>();
        p.suspensoes.forEach((s, i) => {
            const q = `Suspensão ${i + 1}`;
            if (!/^\d{1,14}$/.test(s.codSusp.trim())) e.push(`${q}: código com até 14 algarismos (o mesmo vai no S-1010).`);
            else if (vistos.has(s.codSusp.trim())) e.push(`${q}: código ${s.codSusp.trim()} repetido.`);
            vistos.add(s.codSusp.trim());
            if (!SUSPENSAO_POR_TIPO[p.tpProc]?.includes(s.indSusp)) e.push(`${q}: indicativo ${s.indSusp || '—'} não vale para processo ${TIPOS_PROCESSO[p.tpProc]?.toLowerCase() ?? ''} (permitidos: ${SUSPENSAO_POR_TIPO[p.tpProc]?.join(', ')}).`);
            if (!dataValida(s.dtDecisao)) e.push(`${q}: data da decisão.`);
            if ((s.indSusp === '02' || s.indSusp === '03') && s.indDeposito !== 'S') e.push(`${q}: depósito do montante integral (02 ou 03) pede "depósito = sim".`);
            if (s.indSusp === '90' && s.indDeposito !== 'N') e.push(`${q}: decisão definitiva (90) pede "depósito = não".`);
        });
    }
    return e;
}

export type AcaoS1070 = 'inclusao' | 'alteracao' | 'exclusao';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ideProcesso(p: ProcessoJudAdm, iniValid = p.iniValid, fimValid = p.fimValid) {
    return `<ideProcesso><tpProc>${p.tpProc}</tpProc><nrProc>${digitos(p.nrProc)}</nrProc><iniValid>${iniValid}</iniValid>${fimValid ? `<fimValid>${fimValid}</fimValid>` : ''}</ideProcesso>`;
}
function dadosProc(p: ProcessoJudAdm) {
    return '<dadosProc>'
        + (p.tpProc === '2' ? `<indAutoria>${p.indAutoria}</indAutoria>` : '')
        + `<indMatProc>${p.indMatProc}</indMatProc>`
        + (p.observacao.trim() ? `<observacao>${esc(p.observacao.trim())}</observacao>` : '')
        + (vaiJud(p) ? `<dadosProcJud><ufVara>${p.vara.uf.toUpperCase()}</ufVara><codMunic>${digitos(p.vara.codMunic)}</codMunic><idVara>${Number(p.vara.idVara)}</idVara></dadosProcJud>` : '')
        + (p.indMatProc === '1' ? p.suspensoes.map(s => `<infoSusp><codSusp>${s.codSusp.trim()}</codSusp><indSusp>${s.indSusp}</indSusp><dtDecisao>${s.dtDecisao}</dtDecisao><indDeposito>${s.indDeposito}</indDeposito></infoSusp>`).join('') : '')
        + '</dadosProc>';
}

export interface EntradaS1070 {
    cnpj: string; tpAmb: TpAmb; processo: ProcessoJudAdm; acao: AcaoS1070;
    /** Alteração com nova validade (o período passa a ser este). */
    novaValidade?: { iniValid: string; fimValid: string };
    agora?: Date;
}

export function gerarS1070(x: EntradaS1070): { evento: { id: string; xml: string } | null; erros: string[] } {
    const p = x.processo;
    const erros = x.acao === 'exclusao' ? validarIdentificacao(p) : validarProcesso(p);
    const nv = x.novaValidade;
    if (nv && (!COMP.test(nv.iniValid) || (nv.fimValid && (!COMP.test(nv.fimValid) || nv.fimValid < nv.iniValid)))) erros.push('Nova validade inválida.');
    if (erros.length) return { evento: null, erros };
    const id = idEvento(x.cnpj, x.agora ?? new Date(), 7);
    const corpo = x.acao === 'inclusao' ? `<inclusao>${ideProcesso(p)}${dadosProc(p)}</inclusao>`
        : x.acao === 'alteracao' ? `<alteracao>${ideProcesso(p)}${dadosProc(p)}${nv ? `<novaValidade><iniValid>${nv.iniValid}</iniValid>${nv.fimValid ? `<fimValid>${nv.fimValid}</fimValid>` : ''}</novaValidade>` : ''}</alteracao>`
            : `<exclusao>${ideProcesso(p)}</exclusao>`;
    return { erros: [], evento: { id, xml: `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabProcesso/v_S_01_03_00"><evtTabProcesso Id="${id}">`
        + `<ideEvento><tpAmb>${x.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${digitos(x.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`
        + `<infoProcesso>${corpo}</infoProcesso></evtTabProcesso></eSocial>` } };
}

/** Processos vigentes na competência, para escolher no S-1010, no S-1005 e no S-1020. */
export function processosVigentes(ps: ProcessoJudAdm[], competencia: string, filtro: (p: ProcessoJudAdm) => boolean = () => true): ProcessoJudAdm[] {
    return ps.filter(p => p.ativo && p.iniValid <= competencia && (!p.fimValid || p.fimValid >= competencia) && filtro(p));
}

/** Rótulo curto do processo para listas. */
export const rotuloProcesso = (p: ProcessoJudAdm) => `${TIPOS_PROCESSO[p.tpProc]} ${digitos(p.nrProc)}${p.observacao.trim() ? ` · ${p.observacao.trim().slice(0, 40)}` : ''}`;
