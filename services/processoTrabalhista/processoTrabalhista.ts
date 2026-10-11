// services/processoTrabalhista/processoTrabalhista.ts
//
// Processo trabalhista no eSocial (Paulo, 11/10/2026: pagamento judicial a ex-empregado vai pelo eSocial, não pela
// EFD-Reinf — desde 10/2023 as decisões e acordos da Justiça do Trabalho e das CCP/NINTER têm eventos próprios):
//   S-2500 — o processo, o trabalhador, o contrato, o período e as bases mês a mês (INSS, 13º e FGTS);
//   S-2501 — os tributos de cada pagamento: contribuições por código de receita (Tabela 29) e IRRF.
// Tipos de contrato (tpContr) aceitos: 1 a 4 (vínculo no eSocial, com ou sem mudança das datas de admissão e de
// desligamento), 5 (reconhecimento de vínculo), 6 (trabalhador sem vínculo, TSVE) e 7 (vínculo anterior ao eSocial),
// com mudança de categoria ou de natureza da atividade (mudCategAtiv) e depósito judicial (repercussão 4 e 5).
// Também a responsabilidade indireta (8: o declarante responde pelo vínculo de outro empregador, o responsável direto,
// no grupo ideResp), a unicidade contratual (9: a matrícula que incorpora as demais, no grupo unicContr) e o processo
// da Justiça Comum (origem 3: número do CNJ com o segmento 4 ou 8, a cota patronal da requisição em infoPatPrec, só
// contrato tipo 1 e sem S-2501), como no XSD S-1.3.
// Contrato sem evento no eSocial (indContr N: 5, 7 e o TSVE não cadastrado) leva os dados do vínculo no próprio S-2500
// (infoCompl): CBO, remuneração, regime, admissão e desligamento. Mudança das datas de um vínculo que está no eSocial
// (2 a 4) segue o leiaute: o S-2500 leva a admissão original e o S-2200/S-2299 retificados levam as datas novas.
// Os valores vêm do cálculo homologado (liquidação): aqui não se recalcula INSS nem IRRF de processo.
// Os códigos de IRRF são os do XSD (593656, 056152 e 188951); os das contribuições, da Tabela 29 vigente — a tela
// pede o código de 6 dígitos, como na guia.

import { cnpjValido, cpfValido, UFS } from '../cadastros/documentos';
import { idEvento, VER_PROC, type TpAmb } from '../esocial/transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';

export type OrigemProcesso = '1' | '2' | '3';
export const ROTULO_ORIGEM: Record<OrigemProcesso, string> = { 1: 'Processo judicial trabalhista', 2: 'Acordo em CCP ou NINTER', 3: 'Processo da Justiça Comum' };
/** Origens com decisão judicial (infoProcJud): a trabalhista e a da Justiça Comum. */
export const ehJudicial = (o: OrigemProcesso) => o === '1' || o === '3';
export const TIPOS_CCP: Record<string, string> = { 1: 'CCP no âmbito de empresa', 2: 'CCP no âmbito de sindicato', 3: 'NINTER' };
export type Repercussao = '1' | '2' | '3' | '4' | '5';
export const REPERCUSSOES: Record<Repercussao, string> = {
    1: 'Com repercussão tributária e/ou FGTS (tributos no S-2501)',
    2: 'Sem repercussão tributária nem FGTS',
    3: 'Só para a declaração do IR (rendimentos no S-2501)',
    4: 'Só para a declaração do IR, pago por depósito judicial',
    5: 'Com repercussão tributária e/ou FGTS, pago por depósito judicial',
};
/** Repercussões que levam as bases mês a mês (idePeriodo obrigatório). */
export const comBases = (r: Repercussao) => r === '1' || r === '5';

export type TpContrProc = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export const TIPOS_CONTRATO: Record<TpContrProc, string> = {
    1: 'Vínculo no eSocial, sem mudar admissão nem desligamento',
    2: 'Vínculo no eSocial, com nova data de admissão',
    3: 'Vínculo no eSocial, com inclusão ou nova data de desligamento',
    4: 'Vínculo no eSocial, com nova admissão e novo desligamento',
    5: 'Reconhecimento de vínculo (empregado sem registro)',
    6: 'Trabalhador sem vínculo de emprego (TSVE)',
    7: 'Vínculo formalizado antes do eSocial',
    8: 'Responsabilidade indireta (vínculo com outro empregador)',
    9: 'Unicidade contratual (contratos unificados)',
};

/** Responsável direto, na responsabilidade indireta (ideResp): CNPJ ou CPF e a matrícula ou a admissão lá. */
export interface ResponsavelDireto { tpInsc: '1' | '2'; nrInsc: string; matRespDir: string; dtAdmRespDir: string }
/** Contrato incorporado na unicidade contratual (unicContr): a matrícula ou, no TSVE sem matrícula, categoria e início. */
export interface ContratoUnificado { matUnic: string; codCateg: string; dtInicio: string }
export const UNIDADES_SALARIO: Record<string, string> = { 1: 'Por hora', 2: 'Por dia', 3: 'Por semana', 4: 'Por quinzena', 5: 'Por mês', 6: 'Por tarefa', 7: 'Não aplicável (só variável)' };
export const TEMPO_PARCIAL: Record<string, string> = { 0: 'Não é tempo parcial', 1: 'Até 25h semanais (doméstico)', 2: 'Até 30h semanais', 3: 'Até 26h semanais' };
export const DURACAO: Record<string, string> = { 1: 'Prazo indeterminado', 2: 'Prazo determinado (em dias)', 3: 'Prazo determinado (vinculado a fato)' };
export const PENSAO_ALIM: Record<string, string> = { 0: 'Sem pensão alimentícia', 1: 'Percentual', 2: 'Valor', 3: 'Percentual e valor' };
export const MOTIVOS_TSV: Record<string, string> = {
    '01': 'Exoneração sem justa causa', '02': 'Término do mandato sem recondução', '03': 'Exoneração a pedido',
    '04': 'Culpa recíproca ou força maior', '05': 'Morte', '06': 'Falência ou encerramento', 99: 'Outros',
};

/** Mudança de categoria e/ou de natureza da atividade reconhecida na decisão (mudCategAtiv). */
export interface MudancaCategoria { codCateg: string; natAtividade: '' | '1' | '2'; data: string }

/**
 * Contrato que não está no eSocial (indContr N): os dados do vínculo reconhecido vão no S-2500 (infoCompl).
 * Valores em centavos; datas AAAA-MM-DD.
 */
export interface ContratoNovo {
    codCBO: string; natAtividade: '' | '1' | '2';
    salario: number; undSalFixo: string; dscSalVar: string;
    /** Empregado (todos os tipos menos o 6). */
    tpRegTrab: '1' | '2'; tpRegPrev: '1' | '2' | '3'; dtAdm: string; tmpParc: string;
    duracao: '1' | '2' | '3'; dtTerm: string; clauAssec: '' | 'S' | 'N'; objDet: string;
    dtDeslig: string; mtvDeslig: string; dtProjFimAPI: string; pensAlim: string;
    /** TSVE (tipo 6): término e motivo (só do diretor não empregado, 721). */
    dtTermTsv: string; mtvDesligTSV: string;
}
export const contratoVazio = (): ContratoNovo => ({
    codCBO: '', natAtividade: '1', salario: 0, undSalFixo: '5', dscSalVar: '',
    tpRegTrab: '1', tpRegPrev: '1', dtAdm: '', tmpParc: '0', duracao: '1', dtTerm: '', clauAssec: '', objDet: '',
    dtDeslig: '', mtvDeslig: '', dtProjFimAPI: '', pensAlim: '0', dtTermTsv: '', mtvDesligTSV: '',
});
export const CR_IRRF: Record<string, string> = { 593656: 'IRRF — decisão da Justiça do Trabalho', '056152': 'IRRF — CCP/NINTER', 188951: 'IRRF — RRA (rendimentos recebidos acumuladamente)' };

/** Bases de um mês do período, em centavos. */
export interface PeriodoProcesso { perRef: string; bcCpMensal: number; bcCp13: number; bcFgts: number }
export interface TrabalhadorProcesso {
    /** Vazio para quem não tem ficha (reconhecimento de vínculo, vínculo anterior ao eSocial). */
    fichaId: string; cpf: string; nome: string; matricula: string;
    compIni: string; compFim: string; indReperc: Repercussao;
    periodos: PeriodoProcesso[];
    /** Recibo do S-2500 aceito (para a retificação). */
    reciboS2500?: string;
    /** Tipo de contrato (sem o campo: 1, como na primeira versão). */
    tpContr?: TpContrProc;
    /** Só no tipo 6: o TSVE está no eSocial (S-2300)? Nos demais, vem do tipo (1 a 4 = S; 5 e 7 = N). */
    indContr?: 'S' | 'N';
    /** Tipos 2 e 4: a admissão de antes da decisão. */
    dtAdmOrig?: string;
    indReint?: 'S' | 'N'; indCateg?: 'S' | 'N'; indNatAtiv?: 'S' | 'N'; indMotDeslig?: 'S' | 'N';
    mudancas?: MudancaCategoria[];
    /** Categoria do contrato (Tabela 01): da ficha quando há; vai no XML quando o contrato não está no eSocial. */
    codCateg?: string;
    /** Grau de exposição a agentes nocivos (infoAgNocivo das bases), 1 a 4. */
    grauExp?: string;
    /** Contrato fora do eSocial: nascimento do trabalhador e, no TSVE, o início. */
    dtNascto?: string; dtInicio?: string;
    contrato?: ContratoNovo;
    /** Indenização substitutiva do seguro-desemprego e do abono salarial (anos-base). */
    indenSD?: boolean; indenAbono?: boolean; anosAbono?: string[];
    /** Unicidade contratual (tipo 9): os contratos incorporados na matrícula deste. */
    unificados?: ContratoUnificado[];
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
    /** Justiça Comum (origem 3): cota patronal da requisição autônoma (centavos). */
    infoPatPrec?: number;
    /** Responsabilidade indireta: o responsável direto (obrigatório com contrato tipo 8; opcional com o 6). */
    ideResp?: ResponsavelDireto | null;
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

/** Tipo de contrato do trabalhador (registro antigo, sem o campo = 1). */
export const tpContrDe = (t: TrabalhadorProcesso): TpContrProc => t.tpContr ?? '1';

/** O contrato está no eSocial (S-2200/S-2300)? 1 a 4 sim; 5 e 7 não; 6 conforme o cadastro do TSVE. */
export function indContrDe(t: TrabalhadorProcesso): 'S' | 'N' {
    const tp = tpContrDe(t);
    if (tp === '5' || tp === '7' || tp === '8') return 'N';
    if (tp === '6') return t.indContr ?? 'S';
    return 'S';
}

/** Categoria usada no grau de exposição: a informada ou, no empregado sem o campo (registros antigos), 101. */
export const categoriaDe = (t: TrabalhadorProcesso): string => (t.codCateg ?? '').trim() || (tpContrDe(t) === '6' ? '' : '101');

/** Categorias com contribuição adicional da aposentadoria especial: o eSocial pede o grau de exposição nas bases. */
const comAgenteNocivo = (categ: string) => /^[123]\d\d$|^73[148]$/.test(categ);
/** Categorias em que o CBO é dispensado. */
const semCbo = (categ: string) => ['901', '903', '904'].includes(categ);
/** Natureza da atividade: obrigatória para empregado, agente público, avulso e 401/731/734/738; proibida em 721/722/771/901. */
const natObrigatoria = (categ: string) => /^[123]\d\d$/.test(categ) || ['401', '731', '734', '738'].includes(categ);
const natProibida = (categ: string) => ['721', '722', '771', '901'].includes(categ);

export interface Validacao { erros: string[]; avisos: string[] }

/** Dados do contrato fora do eSocial (infoCompl). */
function validarContratoNovo(t: TrabalhadorProcesso, quem: string, dtDecisao: string, hoje: string, erros: string[], avisos: string[]) {
    const c = t.contrato;
    const tp = tpContrDe(t);
    const categ = (t.codCateg ?? '').trim();
    if (!c) { erros.push(`${quem}: preencha os dados do contrato (não está no eSocial).`); return; }
    if (!semCbo(categ) && !/^\d{6}$/.test(c.codCBO)) erros.push(`${quem}: CBO com 6 dígitos.`);
    if (natObrigatoria(categ) && !c.natAtividade) erros.push(`${quem}: natureza da atividade (urbana ou rural) obrigatória para a categoria ${categ}.`);
    if (natProibida(categ) && c.natAtividade) avisos.push(`${quem}: a categoria ${categ} não leva natureza da atividade — não vai no XML.`);
    if (categ === '104' && c.natAtividade && c.natAtividade !== '1') erros.push(`${quem}: doméstico (104) é atividade urbana.`);
    if (categ === '102' && c.natAtividade && c.natAtividade !== '2') erros.push(`${quem}: trabalhador rural (102) é atividade rural.`);
    const remuneracaoObrigatoria = tp !== '6' ? c.tpRegTrab === '1' : ['721', '722', '771'].includes(categ);
    const temRemuneracao = remuneracaoObrigatoria || c.salario > 0;
    if (temRemuneracao) {
        if (!UNIDADES_SALARIO[c.undSalFixo]) erros.push(`${quem}: unidade do salário inválida.`);
        if (!(c.salario >= 0)) erros.push(`${quem}: salário não pode ser negativo.`);
        if (c.undSalFixo === '7' && c.salario > 0) erros.push(`${quem}: com unidade "não aplicável", o salário fixo é zero.`);
        if ((c.undSalFixo === '6' || c.undSalFixo === '7') && !c.dscSalVar.trim()) erros.push(`${quem}: descreva o salário variável (tarefa, comissão…).`);
    }
    if (tp === '6') {
        if (!data.test(t.dtInicio ?? '') || (t.dtInicio ?? '') > hoje) erros.push(`${quem}: data de início do TSVE obrigatória e não futura.`);
        else if (t.dtNascto && t.dtInicio! <= t.dtNascto) erros.push(`${quem}: o início deve ser depois do nascimento.`);
        if (c.dtTermTsv) {
            if (!data.test(c.dtTermTsv) || (t.dtInicio && c.dtTermTsv < t.dtInicio)) erros.push(`${quem}: término do TSVE inválido ou antes do início.`);
            if (categ === '721' && !MOTIVOS_TSV[c.mtvDesligTSV]) erros.push(`${quem}: motivo do término do diretor não empregado obrigatório.`);
        }
        return;
    }
    if (!data.test(c.dtAdm) || c.dtAdm > hoje) erros.push(`${quem}: data de admissão obrigatória e não futura.`);
    else if (t.dtNascto && c.dtAdm <= t.dtNascto) erros.push(`${quem}: a admissão deve ser depois do nascimento.`);
    if (categ === '104' && c.tpRegPrev !== '1') erros.push(`${quem}: doméstico (104) é do RGPS.`);
    if (/^10[1-8]$|^111$/.test(categ) && c.tpRegPrev === '2') erros.push(`${quem}: a categoria ${categ} não é de regime próprio (RPPS).`);
    if (c.tpRegTrab === '1') {
        if (!TEMPO_PARCIAL[c.tmpParc]) erros.push(`${quem}: informe se o contrato é em tempo parcial.`);
        else if (c.tmpParc === '1' && categ !== '104') erros.push(`${quem}: tempo parcial de até 25h é só do doméstico (104).`);
        else if ((c.tmpParc === '2' || c.tmpParc === '3') && categ === '104') erros.push(`${quem}: para o doméstico, o tempo parcial é o de até 25h.`);
        if (!DURACAO[c.duracao]) erros.push(`${quem}: duração do contrato inválida.`);
        if (c.duracao === '2' && (!data.test(c.dtTerm) || (c.dtAdm && c.dtTerm < c.dtAdm))) erros.push(`${quem}: término do contrato por prazo determinado obrigatório e depois da admissão.`);
        if ((c.duracao === '2' || c.duracao === '3') && !c.clauAssec) erros.push(`${quem}: informe se o contrato a prazo tem cláusula assecuratória.`);
        if (c.duracao === '3' && !c.objDet.trim()) erros.push(`${quem}: descreva o fato que determina o fim do contrato (obra, safra…).`);
        if (dtDecisao >= '2024-01-22' && !PENSAO_ALIM[c.pensAlim]) erros.push(`${quem}: informe a pensão alimentícia para o FGTS.`);
    }
    if (!data.test(c.dtDeslig)) erros.push(`${quem}: data do desligamento obrigatória.`);
    else {
        if (c.dtAdm && c.dtDeslig < c.dtAdm) erros.push(`${quem}: o desligamento é antes da admissão.`);
        if (c.dtDeslig > somarDias(hoje, 10)) erros.push(`${quem}: o desligamento não pode passar de 10 dias à frente.`);
        if (c.dtProjFimAPI && (!data.test(c.dtProjFimAPI) || c.dtProjFimAPI < c.dtDeslig)) erros.push(`${quem}: o fim projetado do aviso indenizado é antes do desligamento.`);
    }
    if (!/^\d{2}$/.test(c.mtvDeslig)) erros.push(`${quem}: motivo do desligamento com 2 dígitos (Tabela 19).`);
    if (tp === '7' && c.dtAdm >= '2021-07-01') avisos.push(`${quem}: tipo 7 é para vínculo anterior ao eSocial — confira a admissão (${c.dtAdm}).`);
}

function somarDias(d: string, n: number): string {
    const x = new Date(`${d}T12:00:00Z`);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
}

/** O contrato do trabalhador: tipo, indicativos, mudança de categoria e os dados do vínculo fora do eSocial. */
function validarContrato(p: ProcessoTrabalhista, t: TrabalhadorProcesso, quem: string, hoje: string, erros: string[], avisos: string[]) {
    const tp = tpContrDe(t);
    const ind = indContrDe(t);
    if (!TIPOS_CONTRATO[tp]) { erros.push(`${quem}: tipo de contrato inválido.`); return; }
    const categ = (t.codCateg ?? '').trim();
    const matr = t.matricula.trim();
    if (ind === 'S') {
        if (tp === '6' && !matr) {
            if (!/^\d{3}$/.test(categ) || !data.test(t.dtInicio ?? '')) erros.push(`${quem}: TSVE sem matrícula exige a categoria e a data de início do S-2300.`);
        } else if (!matr) erros.push(`${quem}: matrícula do eSocial (a do ${tp === '6' ? 'S-2300' : 'S-2200'}) obrigatória.`);
        if (tp === '2' || tp === '4') {
            if (!data.test(t.dtAdmOrig ?? '')) erros.push(`${quem}: informe a data de admissão original (a de antes da decisão).`);
            avisos.push(`${quem}: retifique o S-2200 com a admissão reconhecida antes do S-2500 (o eSocial confere que ela mudou).`);
        }
        if (tp === '3' || tp === '4') avisos.push(`${quem}: o desligamento reconhecido vai no S-2299 (inclusão ou retificação).`);
        if (t.indReint === 'S' && tp !== '6') avisos.push(`${quem}: reintegração exige o S-2298 com este número de processo.`);
        if (t.indMotDeslig === 'S') avisos.push(`${quem}: o novo motivo do desligamento vai na retificação do S-2299.`);
    } else {
        if (!t.nome.trim()) erros.push(`${quem}: nome do trabalhador obrigatório (o contrato não está no eSocial).`);
        if (!data.test(t.dtNascto ?? '') || (t.dtNascto ?? '') < '1890-01-01' || (t.dtNascto ?? '') > hoje) erros.push(`${quem}: data de nascimento obrigatória.`);
        if (!matr) erros.push(`${quem}: crie uma matrícula para o contrato reconhecido.`);
        else if (matr.toLowerCase().startsWith('esocial')) erros.push(`${quem}: a matrícula não pode começar com "eSocial".`);
        if (!/^\d{3}$/.test(categ)) erros.push(`${quem}: categoria do trabalhador (Tabela 01, 3 dígitos) obrigatória.`);
        else if (tp !== '6' && tp !== '8' && !/^[13]\d\d$/.test(categ)) erros.push(`${quem}: a categoria ${categ} não é de empregado (S-2200).`);
        else if (tp === '6' && /^1\d\d$/.test(categ)) erros.push(`${quem}: a categoria ${categ} é de empregado, não de TSVE.`);
        validarContratoNovo(t, quem, ehJudicial(p.origem) ? p.dtSent : p.dtCCP, hoje, erros, avisos);
    }
    // Unicidade contratual (9): a matrícula que incorpora e os contratos incorporados.
    const unif = t.unificados ?? [];
    if (tp === '9') {
        if (!matr) erros.push(`${quem}: na unicidade contratual, informe a matrícula que incorpora as demais.`);
        if (!unif.length) erros.push(`${quem}: informe os contratos incorporados (matrícula, ou categoria e início do TSVE sem matrícula).`);
        const chaves = new Set<string>();
        for (const u of unif) {
            const m = u.matUnic.trim();
            if (m) { if (m === matr) erros.push(`${quem}: a matrícula incorporada ${m} é a mesma do contrato que incorpora.`); }
            else if (!/^\d{3}$/.test(u.codCateg) || !data.test(u.dtInicio)) erros.push(`${quem}: contrato incorporado sem matrícula exige a categoria e a data de início do S-2300.`);
            const k = m || `${u.codCateg}|${u.dtInicio}`;
            if (chaves.has(k)) erros.push(`${quem}: contrato incorporado repetido (${k}).`);
            chaves.add(k);
        }
        if (unif.length > 99) erros.push(`${quem}: no máximo 99 contratos incorporados.`);
    } else if (unif.length) avisos.push(`${quem}: os contratos incorporados só vão no XML com o tipo 9 (unicidade contratual).`);
    if (t.grauExp && !/^[1-4]$/.test(t.grauExp)) erros.push(`${quem}: grau de exposição de 1 a 4.`);
    if (!categ && tp !== '6' && comBases(t.indReperc)) avisos.push(`${quem}: sem a categoria, as bases vão como de empregado (101).`);
    const mud = t.mudancas ?? [];
    if (t.indCateg === 'S' || t.indNatAtiv === 'S') {
        if (!mud.length) erros.push(`${quem}: informe a nova categoria e/ou natureza da atividade e a data em que vale.`);
        const datas = new Set<string>();
        for (const m of mud) {
            if (!/^\d{3}$/.test(m.codCateg)) erros.push(`${quem}: categoria da mudança com 3 dígitos.`);
            if (!data.test(m.data)) erros.push(`${quem}: data da mudança de categoria/natureza inválida.`);
            if (datas.has(m.data)) erros.push(`${quem}: duas mudanças na mesma data (${m.data}).`);
            datas.add(m.data);
            if (t.indNatAtiv === 'S' && !m.natAtividade) erros.push(`${quem}: informe a nova natureza da atividade.`);
            const adm = ind === 'N' ? (tp === '6' ? t.dtInicio : t.contrato?.dtAdm) : '';
            if (adm && data.test(m.data) && m.data <= adm) erros.push(`${quem}: a mudança deve ser depois da admissão/início (${adm}).`);
        }
    } else if (mud.length) avisos.push(`${quem}: as mudanças de categoria só vão no XML com o indicativo marcado.`);
    if (t.indenAbono && !(t.anosAbono ?? []).some(a => /^\d{4}$/.test(a))) erros.push(`${quem}: indenização do abono salarial exige o(s) ano(s)-base.`);
    for (const a of t.anosAbono ?? []) if (!/^\d{4}$/.test(a) || a < '1990' || a > hoje.slice(0, 4)) erros.push(`${quem}: ano-base do abono inválido (${a}).`);
}

/** O processo (S-2500), com os trabalhadores e os períodos. `hoje` = AAAA-MM-DD. */
export function validarProcesso(p: ProcessoTrabalhista, hoje: string): Validacao {
    const erros: string[] = []; const avisos: string[] = [];
    const nr = digitos(p.nrProcTrab);
    if (!ROTULO_ORIGEM[p.origem]) erros.push('Origem do processo inválida.');
    if (ehJudicial(p.origem)) {
        if (!numeroCnjValido(nr)) erros.push('Número do processo: 20 dígitos no padrão do CNJ, com os dígitos verificadores certos.');
        else if (p.origem === '1' && nr[13] !== '5') avisos.push('O número não é da Justiça do Trabalho (segmento 5): confira.');
        else if (p.origem === '3' && nr[13] !== '4' && nr[13] !== '8') erros.push('Processo da Justiça Comum: o 14º dígito (segmento) deve ser 4 (Justiça Federal) ou 8 (Justiça Estadual).');
        if (p.origem === '3') {
            if (!(Number.isInteger(p.infoPatPrec) && (p.infoPatPrec ?? -1) >= 0)) erros.push('Justiça Comum: informe a cota patronal da requisição autônoma (infoPatPrec; 0 se não houver).');
            for (const t of p.trabalhadores) if (tpContrDe(t) !== '1') erros.push(`${t.nome || t.cpf}: no processo da Justiça Comum o contrato é do tipo 1 (vínculo no eSocial, sem mudar as datas).`);
            avisos.push('Processo da Justiça Comum: não há S-2501 (as contribuições e o IRRF seguem a requisição de pagamento).');
        }
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
    // Responsabilidade indireta: o responsável direto (ideResp), com contrato 8 (obrigatório) ou 6 (opcional).
    const tipos = new Set(p.trabalhadores.map(tpContrDe));
    const r = p.ideResp;
    if (tipos.has('8') && !r) erros.push('Responsabilidade indireta (tipo 8): informe o responsável direto (CNPJ ou CPF do empregador de origem).');
    if (r) {
        const n = digitos(r.nrInsc);
        if (![...tipos].every(x => x === '6' || x === '8')) erros.push('O responsável direto só vai com contrato do tipo 6 ou 8.');
        if (r.tpInsc === '1' && !cnpjValido(n)) erros.push('Responsável direto: CNPJ inválido (14 dígitos).');
        if (r.tpInsc === '2' && !cpfValido(n)) erros.push('Responsável direto: CPF inválido.');
        if (r.tpInsc === '2' && p.trabalhadores.some(t => digitos(t.cpf) === n)) erros.push('Responsável direto: o CPF não pode ser o do trabalhador.');
        if (r.matRespDir.trim() && r.dtAdmRespDir) erros.push('Responsável direto: informe a matrícula lá ou a data de admissão (sem a matrícula), não os dois.');
        if (r.dtAdmRespDir && !data.test(r.dtAdmRespDir)) erros.push('Responsável direto: data de admissão inválida.');
    }
    if (!p.trabalhadores.length) erros.push('Inclua o trabalhador do processo.');
    const mesHoje = hoje.slice(0, 7);
    const cpfs = new Set<string>();
    for (const t of p.trabalhadores) {
        const quem = t.nome || t.cpf || 'Trabalhador sem CPF';
        if (!cpfValido(digitos(t.cpf))) erros.push(`${quem}: CPF inválido.`);
        if (cpfs.has(digitos(t.cpf))) erros.push(`${quem}: trabalhador repetido no processo.`);
        cpfs.add(digitos(t.cpf));
        validarContrato(p, t, quem, hoje, erros, avisos);
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
        const bases = comBases(t.indReperc);
        if (bases && !t.periodos.length) erros.push(`${quem}: com repercussão tributária ou FGTS, informe as bases mês a mês.`);
        if (bases && t.periodos.length && t.periodos.length !== meses.size) avisos.push(`${quem}: ${t.periodos.length} mês(es) com bases para ${meses.size} no período — o eSocial avisa quando não são todos.`);
        if (!bases && t.periodos.length) avisos.push(`${quem}: as bases mês a mês só vão no S-2500 com repercussão tributária ou FGTS (1 ou 5).`);
    }
    return { erros, avisos };
}

/** Um pagamento (S-2501). */
export function validarPagamento(p: ProcessoTrabalhista, g: PagamentoProcesso): Validacao {
    const erros: string[] = []; const avisos: string[] = [];
    const inicio = (ehJudicial(p.origem) ? p.dtSent : p.dtCCP).slice(0, 7);
    if (!mes.test(g.perApurPgto)) erros.push('Mês do pagamento (perApurPgto) no formato AAAA-MM.');
    else if (inicio && g.perApurPgto < inicio) erros.push(`O mês do pagamento não pode ser anterior ao da decisão/acordo (${inicio}).`);
    if (g.ideSeqProc && !/^\d{1,3}$/.test(g.ideSeqProc)) erros.push('Sequencial do pagamento: até 3 dígitos.');
    if (!g.trabalhadores.length) erros.push('Inclua ao menos um trabalhador no pagamento.');
    if (p.origem === '3') erros.push('Processo da Justiça Comum não tem S-2501: as contribuições e o IRRF seguem a requisição de pagamento.');
    const crIrrfDaOrigem = p.origem === '2' ? '056152' : '593656';
    for (const t of g.trabalhadores) {
        const tp = p.trabalhadores.find(x => digitos(x.cpf) === digitos(t.cpf));
        const quem = tp?.nome || t.cpf;
        if (!tp) { erros.push(`${t.cpf}: não está no processo (S-2500).`); continue; }
        if (tp.indReperc === '2') erros.push(`${quem}: decisão sem repercussão tributária não tem S-2501.`);
        if ((tp.indReperc === '4' || tp.indReperc === '5') && t.irrf.some(i => i.vrCR > 0 || i.vrCR13 > 0))
            avisos.push(`${quem}: pagamento por depósito judicial — o IRRF costuma ser retido pelo banco no levantamento; confira se ele vai neste S-2501.`);
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

/** Bloco infoCompl do contrato fora do eSocial (indContr N), na ordem do XSD. */
function infoCompl(t: TrabalhadorProcesso, dtDecisao: string): string {
    const c = t.contrato ?? contratoVazio();
    const tp = tpContrDe(t);
    const categ = (t.codCateg ?? '').trim();
    const remuneracaoObrigatoria = tp !== '6' ? c.tpRegTrab === '1' : ['721', '722', '771'].includes(categ);
    const remuneracao = remuneracaoObrigatoria || c.salario > 0
        ? `<remuneracao><dtRemun>${tp === '6' ? t.dtInicio : c.dtAdm}</dtRemun><vrSalFx>${v(c.undSalFixo === '7' ? 0 : c.salario)}</vrSalFx><undSalFixo>${c.undSalFixo}</undSalFixo>`
            + ((c.undSalFixo === '6' || c.undSalFixo === '7') && c.dscSalVar.trim() ? `<dscSalVar>${esc(c.dscSalVar.trim().slice(0, 999))}</dscSalVar>` : '')
            + '</remuneracao>'
        : '';
    const cabeca = (!semCbo(categ) && c.codCBO ? `<codCBO>${c.codCBO}</codCBO>` : '')
        + (c.natAtividade && !natProibida(categ) ? `<natAtividade>${c.natAtividade}</natAtividade>` : '')
        + remuneracao;
    if (tp === '6') {
        const term = c.dtTermTsv
            ? `<infoTerm><dtTerm>${c.dtTermTsv}</dtTerm>${categ === '721' && c.mtvDesligTSV ? `<mtvDesligTSV>${c.mtvDesligTSV}</mtvDesligTSV>` : ''}</infoTerm>`
            : '';
        return `<infoCompl>${cabeca}${term}</infoCompl>`;
    }
    const clt = c.tpRegTrab === '1';
    const duracao = clt
        ? `<duracao><tpContr>${c.duracao}</tpContr>`
            + (c.duracao === '2' ? `<dtTerm>${c.dtTerm}</dtTerm>` : '')
            + (c.duracao !== '1' && c.clauAssec ? `<clauAssec>${c.clauAssec}</clauAssec>` : '')
            + (c.duracao === '3' ? `<objDet>${esc(c.objDet.trim().slice(0, 255))}</objDet>` : '')
            + '</duracao>'
        : '';
    const pensao = clt && PENSAO_ALIM[c.pensAlim] && (dtDecisao >= '2024-01-22' || c.pensAlim !== '0') ? `<pensAlim>${c.pensAlim}</pensAlim>` : '';
    const deslig = `<infoDeslig><dtDeslig>${c.dtDeslig}</dtDeslig><mtvDeslig>${c.mtvDeslig}</mtvDeslig>`
        + (c.dtProjFimAPI ? `<dtProjFimAPI>${c.dtProjFimAPI}</dtProjFimAPI>` : '') + pensao + '</infoDeslig>';
    return `<infoCompl>${cabeca}<infoVinc><tpRegTrab>${c.tpRegTrab}</tpRegTrab><tpRegPrev>${c.tpRegPrev}</tpRegPrev><dtAdm>${c.dtAdm}</dtAdm>`
        + (clt ? `<tmpParc>${c.tmpParc}</tmpParc>` : '') + duracao + deslig + '</infoVinc></infoCompl>';
}

/** S-2500 de um trabalhador do processo (sem assinatura; o CFI assina). `nrRecibo` = retificação. */
export function gerarS2500(p: { cnpj: string; tpAmb: TpAmb; processo: ProcessoTrabalhista; cpf: string; nrRecibo?: string; id?: string }): { id: string; xml: string } {
    const pr = p.processo;
    const t = pr.trabalhadores.find(x => digitos(x.cpf) === digitos(p.cpf));
    if (!t) throw new Error('S-2500: trabalhador fora do processo.');
    const cnpj = digitos(p.cnpj);
    const id = p.id ?? idEvento(cnpj);
    const dados = ehJudicial(pr.origem)
        ? `<infoProcJud><dtSent>${pr.dtSent}</dtSent><ufVara>${pr.ufVara}</ufVara><codMunic>${pr.codMunic}</codMunic><idVara>${Number(pr.idVara)}</idVara>`
            + (pr.origem === '3' ? `<infoPatPrec>${v(pr.infoPatPrec ?? 0)}</infoPatPrec>` : '') + '</infoProcJud>'
        : `<infoCCP><dtCCP>${pr.dtCCP}</dtCCP><tpCCP>${pr.tpCCP}</tpCCP>${pr.cnpjCCP ? `<cnpjCCP>${digitos(pr.cnpjCCP)}</cnpjCCP>` : ''}</infoCCP>`;
    const tp = tpContrDe(t);
    const ind = indContrDe(t);
    const matr = t.matricula.trim();
    const categ = categoriaDe(t);
    const grau = /^[1-4]$/.test(t.grauExp ?? '') ? t.grauExp : '1';
    const nocivo = comAgenteNocivo(categ) ? `<infoAgNocivo><grauExp>${grau}</grauExp></infoAgNocivo>` : '';
    const periodos = comBases(t.indReperc)
        ? [...t.periodos].sort((a, b) => a.perRef.localeCompare(b.perRef)).map(x => `<idePeriodo><perRef>${x.perRef}</perRef>`
            + `<baseCalculo><vrBcCpMensal>${v(x.bcCpMensal)}</vrBcCpMensal>${x.bcCp13 > 0 ? `<vrBcCp13>${v(x.bcCp13)}</vrBcCp13>` : ''}${nocivo}</baseCalculo>`
            + (x.bcFgts > 0 ? `<infoFGTS><vrBcFGTSProcTrab>${v(x.bcFgts)}</vrBcFGTSProcTrab></infoFGTS>` : '')
            + '</idePeriodo>').join('')
        : '';
    const sn = (x?: 'S' | 'N') => (x === 'S' ? 'S' : 'N');
    const indCateg = sn(t.indCateg); const indNatAtiv = sn(t.indNatAtiv);
    const mudancas = indCateg === 'S' || indNatAtiv === 'S'
        ? [...(t.mudancas ?? [])].sort((a, b) => a.data.localeCompare(b.data)).map(m => `<mudCategAtiv><codCateg>${m.codCateg}</codCateg>`
            + (m.natAtividade ? `<natAtividade>${m.natAtividade}</natAtividade>` : '') + `<dtMudCategAtiv>${m.data}</dtMudCategAtiv></mudCategAtiv>`).join('')
        : '';
    const anos = t.indenAbono ? [...new Set(t.anosAbono ?? [])].filter(a => /^\d{4}$/.test(a)).sort() : [];
    const contr = `<infoContr><tpContr>${tp}</tpContr><indContr>${ind}</indContr>`
        + ((tp === '2' || tp === '4') && t.dtAdmOrig ? `<dtAdmOrig>${t.dtAdmOrig}</dtAdmOrig>` : '')
        + (ind === 'S' && tp !== '6' ? `<indReint>${sn(t.indReint)}</indReint>` : '')
        + `<indCateg>${indCateg}</indCateg><indNatAtiv>${indNatAtiv}</indNatAtiv><indMotDeslig>${ind === 'S' ? sn(t.indMotDeslig) : 'N'}</indMotDeslig>`
        + (matr ? `<matricula>${esc(matr)}</matricula>` : '')
        + (ind === 'N' || !matr ? `<codCateg>${(t.codCateg ?? '').trim()}</codCateg>` : '')
        + ((tp === '6' && ind === 'N') || !matr ? `<dtInicio>${t.dtInicio ?? ''}</dtInicio>` : '')
        + (ind === 'N' ? infoCompl(t, ehJudicial(pr.origem) ? pr.dtSent : pr.dtCCP) : '')
        + mudancas
        + (tp === '9' ? (t.unificados ?? []).slice(0, 99).map(u => (u.matUnic.trim()
            ? `<unicContr><matUnic>${esc(u.matUnic.trim())}</matUnic></unicContr>`
            : `<unicContr><codCateg>${u.codCateg}</codCateg><dtInicio>${u.dtInicio}</dtInicio></unicContr>`)).join('') : '')
        + `<ideEstab><tpInsc>1</tpInsc><nrInsc>${cnpj}</nrInsc><infoVlr><compIni>${t.compIni}</compIni><compFim>${t.compFim}</compFim><indReperc>${t.indReperc}</indReperc>`
        + (t.indenSD ? '<indenSD>S</indenSD>' : '')
        + (anos.length ? `<indenAbono>S</indenAbono>${anos.slice(0, 9).map(a => `<abono><anoBase>${a}</anoBase></abono>`).join('')}` : '')
        + periodos
        + '</infoVlr></ideEstab></infoContr>';
    const xml = `<eSocial xmlns="${NS}/evtProcTrab/${VERSAO}"><evtProcTrab Id="${id}">`
        + ideEvento(p.tpAmb, p.nrRecibo)
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz(cnpj)}</nrInsc>`
        + (pr.ideResp && (tp === '6' || tp === '8') ? `<ideResp><tpInsc>${pr.ideResp.tpInsc}</tpInsc><nrInsc>${digitos(pr.ideResp.nrInsc)}</nrInsc>`
            + (pr.ideResp.dtAdmRespDir && !pr.ideResp.matRespDir.trim() ? `<dtAdmRespDir>${pr.ideResp.dtAdmRespDir}</dtAdmRespDir>` : '')
            + (pr.ideResp.matRespDir.trim() ? `<matRespDir>${esc(pr.ideResp.matRespDir.trim())}</matRespDir>` : '') + '</ideResp>' : '')
        + '</ideEmpregador>'
        + `<infoProcesso><origem>${pr.origem}</origem><nrProcTrab>${digitos(pr.nrProcTrab)}</nrProcTrab>`
        + (pr.obs.trim() ? `<obsProcTrab>${esc(pr.obs.trim().slice(0, 999))}</obsProcTrab>` : '')
        + `<dadosCompl>${dados}</dadosCompl></infoProcesso>`
        + `<ideTrab><cpfTrab>${digitos(t.cpf)}</cpfTrab>`
        + (ind === 'N' ? `<nmTrab>${esc(t.nome.trim().slice(0, 70))}</nmTrab><dtNascto>${t.dtNascto ?? ''}</dtNascto>` : '')
        + contr
        + '</ideTrab></evtProcTrab></eSocial>';
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
