// services/esocial/desligamento.ts
//
// S-2299 (desligamento) gerado pelo Consultor a partir da rescisão calculada (Paulo, 10/10/2026: "pode seguir",
// item 1 do que falta para desligar o SAGE na folha). Leiaute S-1.3 (evtDeslig.xsd) e MOS S-1.3, S-2299:
// - prazo de 10 dias da data do desligamento (excluído o dia), antecipado para o dia útil anterior;
// - as verbas rescisórias do mês do desligamento vão no grupo verbasResc (um demonstrativo, infoPerApur) e o
//   pagamento delas no S-1210 (item 1.2 do MOS);
// - aviso prévio indenizado (inclusive o misto): indPagtoAPI = S, com a data projetada (item 3.1);
// - pensAlim (retenção de FGTS para pensão alimentícia) é obrigatório para celetistas;
// - indApurIR = 0 (apuração normal, item 9.1).
// Sem assinatura: o CFI assina com o A1 do cofre e transmite, como o S-2230 e o S-1200.
//
// As rubricas vêm do mesmo de/para da folha (S-1010 da empresa). As verbas próprias da rescisão (aviso, 13º e
// férias indenizadas, art. 479) têm chave própria; a verba que também existe na folha (saldo de salário, horas
// extras, INSS, IRRF) pode ter rubrica própria na rescisão ("RESC:" + chave) e, sem ela, usa a da folha.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Verba } from '../calculo/motorMensal';
import type { ResultadoRescisao } from '../calculo/motorRescisao';
import { PERMITE_SAQUE_FGTS } from '../calculo/motorRescisao';
import { cpfValido } from '../cadastros/documentos';
import { vigenciaEm, type Rubrica } from '../cadastros/rubricas';
import { diaUtilAnterior, somarDias } from '../prazos/calendario';
import { chaveVerba, normalizar, quantidade, type ItemDePara, type ParametrosEsocialFolha, type RubricaEsocial } from './eventosFolha';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';
const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const valor = (c: number) => (c / 100).toFixed(2);
const br = (d: string) => d.split('-').reverse().join('/');
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Prefixo da rubrica própria da rescisão no de/para (a da folha vale quando não há). */
export const PREFIXO_RESC = 'RESC:';

/** Chave da verba da rescisão: as férias vencidas perdem o período (FV2024-03-01 → FV), o resto é a chave da folha. */
export function chaveVerbaRescisao(v: Pick<Verba, 'codigo' | 'descricao'>): string {
    const m = v.codigo.match(/^(FVD13|FVD|FV13|FV)\d{4}-\d{2}-\d{2}$/);
    return m ? m[1] : chaveVerba(v);
}

/** Verbas que só existem na rescisão: não há rubrica da folha para elas. */
const SO_RESCISAO = new Set(['AVISO', 'AVISODESC', 'ART479', '13PROP', '13IND', 'FV', 'FV13', 'FVD', 'FVD13', 'FP', 'FP13']);

/**
 * Sugestão de rubrica pela descrição do S-1010 da empresa (e pela natureza da Tabela 03, quando a descrição é
 * ambígua). É só sugestão: a equipe confirma no de/para.
 */
const SUGESTAO_RESC: Record<string, { dica: RegExp; evita?: RegExp; naturezas?: string[] }> = {
    SAL: { dica: /SALDO/, naturezas: ['6000'] },
    AVISO: { dica: /AVISO/, evita: /DESC|13|FERIAS/, naturezas: ['6003'] },
    AVISODESC: { dica: /AVISO/ },
    ART479: { dica: /479/, naturezas: ['6104'] },
    '13PROP': { dica: /13/, evita: /AVISO|INDENIZ|ADIANT|INSS|IRRF|PENS/, naturezas: ['6002'] },
    '13IND': { dica: /13.*(AVISO|INDENIZ)|(AVISO|INDENIZ).*13/, naturezas: ['6001'] },
    FV: { dica: /FERIAS.*VENC|VENC.*FERIAS/, evita: /\b1 3\b|TERCO|DOBR/, naturezas: ['6007'] },
    FV13: { dica: /(\b1 3\b|TERCO).*VENC|VENC.*(\b1 3\b|TERCO)/, evita: /DOBR/ },
    FVD: { dica: /DOBR/, evita: /\b1 3\b|TERCO/, naturezas: ['6004'] },
    FVD13: { dica: /DOBR.*(\b1 3\b|TERCO)|(\b1 3\b|TERCO).*DOBR/ },
    FP: { dica: /FERIAS.*PROP|PROP.*FERIAS/, evita: /\b1 3\b|TERCO/, naturezas: ['6006'] },
    FP13: { dica: /(\b1 3\b|TERCO).*PROP|PROP.*(\b1 3\b|TERCO)/ },
};

/** Itens do de/para da rescisão, com a sugestão. A chave gravada é sempre a própria da rescisão (RESC:…). */
export function sugerirDeParaRescisao(resultados: Pick<ResultadoRescisao, 'verbas'>[], rubricas: Rubrica[], competencia: string): ItemDePara[] {
    const vigentes = rubricas.map(r => ({ r, v: vigenciaEm(r, competencia) })).filter(x => x.v);
    const itens = new Map<string, ItemDePara>();
    for (const res of resultados) for (const v of res.verbas) {
        const base = chaveVerbaRescisao(v);
        const chave = PREFIXO_RESC + base;
        if (itens.has(chave) || v.valor <= 0) continue;
        const tp = v.tipo === 'provento' ? '1' : '2';
        const doTipo = vigentes.filter(x => x.v!.dados.tpRubr === tp);
        const s = SUGESTAO_RESC[base];
        let cand = s ? doTipo.filter(x => s.dica.test(normalizar(x.v!.dados.dscRubr)) && !s.evita?.test(normalizar(x.v!.dados.dscRubr))) : [];
        if (cand.length > 1 && s?.naturezas) {
            const pelaNatureza = cand.filter(x => s.naturezas!.includes(x.v!.dados.natRubr));
            if (pelaNatureza.length) cand = pelaNatureza;
        }
        const r = cand.length === 1 ? cand[0].r : null;
        itens.set(chave, { chave, descricao: descricaoDaChave(base, v.descricao), tipo: v.tipo, sugestao: r ? { codRubr: r.codRubr, ideTabRubr: r.ideTabRubr } : null });
    }
    return [...itens.values()];
}

const descricaoDaChave = (base: string, descricao: string) =>
    ({ FV: 'Férias vencidas', FV13: '1/3 sobre férias vencidas', FVD: 'Dobra das férias vencidas (art. 137)', FVD13: '1/3 sobre a dobra' } as Record<string, string>)[base] ?? descricao;

/** Rubrica da verba na rescisão: a própria (RESC:), senão a da folha. */
export function rubricaDaVerba(p: ParametrosEsocialFolha, v: Pick<Verba, 'codigo' | 'descricao'>): RubricaEsocial | undefined {
    const base = chaveVerbaRescisao(v);
    return p.rubricas[PREFIXO_RESC + base] ?? (SO_RESCISAO.has(base) ? undefined : p.rubricas[base]);
}

/** Último dia para enviar o S-2299: 10 dias depois do desligamento, antecipado para o dia útil anterior (MOS). */
export const prazoS2299 = (dtDeslig: string) => (DATA.test(dtDeslig) ? diaUtilAnterior(somarDias(dtDeslig, 10)) : '');

/** Demonstrativo das verbas rescisórias (o mesmo ideDmDev vai no S-1210 do pagamento). */
export const ideDmDevRescisao = (dtDeslig: string, matricula: string) => `RESC${dtDeslig.replace(/-/g, '')}-${matricula}`.slice(0, 30);

export type PensaoFgts = { tipo: '0' } | { tipo: '1'; percentual: number } | { tipo: '2'; valor: number } | { tipo: '3'; percentual: number; valor: number };

export interface EntradaS2299 {
    cnpj: string;
    tpAmb: TpAmb;
    ficha: FichaFuncionario;
    rescisao: ResultadoRescisao;
    rubricas: Rubrica[];
    parametros: ParametrosEsocialFolha;
    /** Data em que o aviso prévio foi dado (aviso trabalhado ou misto). */
    dtAvisoPrevio?: string;
    /** Retenção de FGTS para pensão alimentícia (pensAlim). Padrão: não existe. */
    pensaoFgts?: PensaoFgts;
    observacao?: string;
    /** Recibo do S-2299 que está valendo: o novo vai como retificação. */
    retificaRecibo?: string;
    /** Data de hoje (AAAA-MM-DD), para o limite do leiaute (desligamento até hoje + 10 dias). */
    hoje?: string;
    agora?: Date;
}

export interface ResultadoS2299 {
    evento: { id: string; xml: string } | null;
    ideDmDev: string;
    prazo: string;
    erros: string[];
    avisos: string[];
}

/** S-2299 com as verbas rescisórias. Com erro, sem evento e com o motivo. */
export function gerarS2299(e: EntradaS2299): ResultadoS2299 {
    const r = e.rescisao; const f = e.ficha; const d = f.dados; const p = e.parametros;
    const erros: string[] = []; const avisos: string[] = [];
    const cpf = digitos(f.cpf);
    const mat = f.matriculaEsocial.trim();
    const estab = digitos(p.nrInscEstab);
    const categ = digitos(d.categoria);
    const ide = ideDmDevRescisao(r.data, mat);
    const prazo = prazoS2299(r.data);
    const sair = (): ResultadoS2299 => ({ evento: null, ideDmDev: ide, prazo, erros, avisos });

    if (r.situacao === 'erro') erros.push(`Rescisão com erro: ${r.erros.join(' ') || 'confira o cálculo'}.`);
    else if (r.situacao !== 'calculado') erros.push(`Rescisão incompleta: ${r.avisos.join(' ') || 'confira o cálculo'}.`);
    if (!r.tipo) erros.push('Escolha o tipo do desligamento (motivo do S-2299, Tabela 19).');
    if (!DATA.test(r.data)) erros.push('Data do desligamento inválida.');
    if (!cpfValido(cpf)) erros.push('CPF inválido na ficha.');
    if (!mat) erros.push('Sem matrícula do eSocial na ficha.');
    if (!/^\d{3}$/.test(categ)) erros.push('Categoria do eSocial (3 dígitos) em branco na ficha.');
    if (estab.length !== 14) erros.push('Informe o CNPJ do estabelecimento (parâmetros do eSocial da folha).');
    if (!p.codLotacao.trim()) erros.push('Informe o código da lotação tributária (S-1020) nos parâmetros do eSocial da folha.');
    const localTrab = digitos(d.estabelecimento);
    if (localTrab.length === 14 && estab.length === 14 && localTrab !== estab) erros.push(`O local de trabalho da ficha é o CNPJ ${localTrab}, e o estabelecimento dos parâmetros é ${estab}: o Consultor gera um estabelecimento só. Transmita pelo IOB.`);
    if (e.hoje && DATA.test(r.data) && r.data > somarDias(e.hoje, 10)) erros.push(`Desligamento em ${br(r.data)}: o eSocial só aceita até 10 dias depois de hoje.`);
    if (d.dataDesligamento && d.dataDesligamento !== r.data) avisos.push(`A ficha tem desligamento em ${br(d.dataDesligamento)}; o S-2299 vai com ${br(r.data)}.`);
    if (d.motivoDesligamento && r.tipo && d.motivoDesligamento !== r.tipo) avisos.push(`A ficha tem o motivo ${d.motivoDesligamento}; o S-2299 vai com ${r.tipo}.`);

    // Aviso prévio: indenizado (inteiro ou parte) = indPagtoAPI S, com o fim projetado.
    const indenizado = r.verbas.some(v => v.codigo === 'AVISO' && v.valor > 0);
    const dtAv = (e.dtAvisoPrevio ?? '').trim();
    if (dtAv && (!DATA.test(dtAv) || dtAv > r.data || (d.admissao && dtAv < d.admissao))) erros.push('Data do aviso prévio: entre a admissão e o desligamento.');
    // Aviso com parte trabalhada (inteiro ou misto, MOS item 3.1): a data em que foi dado vai no dtAvPrv.
    const diasIndenizados = DATA.test(r.dataProjetada) && r.dataProjetada > r.data ? Math.round((Date.parse(r.dataProjetada) - Date.parse(r.data)) / 86_400_000) : 0;
    const integralIndenizado = r.tipo === '33' ? Math.floor(r.diasAviso / 2) : r.diasAviso;
    if (!dtAv && r.diasAviso > 0 && diasIndenizados < integralIndenizado) avisos.push('Aviso prévio com parte trabalhada: informe a data em que o aviso foi dado.');
    if (indenizado && (!DATA.test(r.dataProjetada) || r.dataProjetada < r.data)) erros.push('Aviso indenizado sem a data projetada do fim do contrato.');

    // Pensão alimentícia sobre o FGTS (só celetista).
    const celetista = (d.regimeTrabalhista ?? '1') !== '2';
    const pens = e.pensaoFgts ?? { tipo: '0' as const };
    let pensXml = '';
    if (celetista) {
        pensXml = `<pensAlim>${pens.tipo}</pensAlim>`;
        if (pens.tipo === '1' || pens.tipo === '3') {
            if (!(pens.percentual > 0 && pens.percentual <= 100)) erros.push('Pensão sobre o FGTS: percentual entre 0 e 100.');
            else pensXml += `<percAliment>${pens.percentual.toFixed(2)}</percAliment>`;
        }
        if (pens.tipo === '2' || pens.tipo === '3') {
            if (!(pens.valor > 0)) erros.push('Pensão sobre o FGTS: informe o valor.');
            else pensXml += `<vrAlim>${valor(pens.valor)}</vrAlim>`;
        }
    }

    // Verbas rescisórias, uma linha por rubrica (a mesma rubrica não se repete no demonstrativo).
    const tipoDa = new Map(e.rubricas.map(x => [`${x.ideTabRubr}|${x.codRubr}`, vigenciaEm(x, r.data.slice(0, 7))?.dados]));
    const itens = new Map<string, { rub: RubricaEsocial; valor: number; qtd: number }>();
    for (const v of r.verbas) {
        if (v.valor <= 0) continue;
        const rub = rubricaDaVerba(p, v);
        if (!rub) { erros.push(`"${descricaoDaChave(chaveVerbaRescisao(v), v.descricao)}" sem rubrica no de/para da rescisão.`); continue; }
        const dados = tipoDa.get(`${rub.ideTabRubr}|${rub.codRubr}`);
        if (!dados) { erros.push(`Rubrica ${rub.codRubr} (de "${v.descricao}") sem S-1010 vigente em ${br(r.data).slice(3)}.`); continue; }
        const esperado = v.tipo === 'provento' ? '1' : '2';
        if (dados.tpRubr !== esperado) erros.push(`Rubrica ${rub.codRubr} é ${({ '1': 'provento', '2': 'desconto', '3': 'informativa', '4': 'informativa dedutora' } as Record<string, string>)[dados.tpRubr] ?? `tipo ${dados.tpRubr}`} no S-1010, e "${v.descricao}" é ${v.tipo}.`);
        const k = `${rub.ideTabRubr}|${rub.codRubr}`;
        const atual = itens.get(k) ?? { rub, valor: 0, qtd: 0 };
        atual.valor += v.valor; atual.qtd += Number(quantidade(v.referencia) || 0);
        itens.set(k, atual);
    }
    if (!itens.size && !erros.length) erros.push('Nenhuma verba rescisória com valor: o leiaute exige ao menos uma rubrica.');
    if (r.totais.liquido < 0) erros.push('Líquido da rescisão negativo: confira os descontos.');
    if (erros.length) return sair();

    const grauExp = /^[123]\d\d$|^73[148]$/.test(categ) ? `<infoAgNocivo><grauExp>${/^[1-4]$/.test(d.grauExp ?? '') ? d.grauExp : '1'}</grauExp></infoAgNocivo>` : '';
    if (grauExp && !/^[1-4]$/.test(d.grauExp ?? '')) avisos.push('Grau de exposição a agentes nocivos em branco na ficha: vai 1 (sem exposição). Confira com o S-2240.');
    const simples = p.indSimples ? `<infoSimples><indSimples>${p.indSimples}</indSimples></infoSimples>` : '';
    const detVerbas = [...itens.values()].map(i => `<detVerbas><codRubr>${esc(i.rub.codRubr)}</codRubr><ideTabRubr>${esc(i.rub.ideTabRubr)}</ideTabRubr>`
        + `${i.qtd > 0 ? `<qtdRubr>${i.qtd.toFixed(2)}</qtdRubr>` : ''}<vrRubr>${valor(i.valor)}</vrRubr><indApurIR>0</indApurIR></detVerbas>`).join('');
    const obs = (e.observacao ?? '').trim();
    // Sequencial pelo milésimo, como no S-1200: duas gerações no mesmo segundo não repetem o Id.
    const agora = e.agora ?? new Date();
    const id = idEvento(e.cnpj, agora, e.agora ? 1 : agora.getMilliseconds() * 10 + 1);
    const xml = `<eSocial xmlns="${NS}/evtDeslig/${VERSAO}"><evtDeslig Id="${id}">`
        + `<ideEvento>${e.retificaRecibo ? `<indRetif>2</indRetif><nrRecibo>${esc(e.retificaRecibo)}</nrRecibo>` : '<indRetif>1</indRetif>'}<tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${digitos(e.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`
        + `<ideVinculo><cpfTrab>${cpf}</cpfTrab><matricula>${esc(mat)}</matricula></ideVinculo>`
        + `<infoDeslig><mtvDeslig>${r.tipo}</mtvDeslig><dtDeslig>${r.data}</dtDeslig>${dtAv ? `<dtAvPrv>${dtAv}</dtAvPrv>` : ''}`
        + `<indPagtoAPI>${indenizado ? 'S' : 'N'}</indPagtoAPI>${indenizado ? `<dtProjFimAPI>${r.dataProjetada}</dtProjFimAPI>` : ''}`
        + pensXml
        + (obs ? `<observacoes><observacao>${esc(obs.slice(0, 255))}</observacao></observacoes>` : '')
        + `<verbasResc><dmDev><ideDmDev>${esc(ide)}</ideDmDev><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>${estab}</nrInsc><codLotacao>${esc(p.codLotacao.trim())}</codLotacao>`
        + detVerbas + grauExp + simples
        + '</ideEstabLot></infoPerApur></dmDev></verbasResc>'
        + '</infoDeslig></evtDeslig></eSocial>';

    if (PERMITE_SAQUE_FGTS.includes(r.tipo)) avisos.push(`Motivo ${r.tipo}: o FGTS Digital gera a guia rescisória (com a multa, quando houver) a partir deste S-2299.`);
    avisos.push(`O pagamento das verbas (S-1210, demonstrativo ${ide}) vai no mês em que a rescisão for paga, antes do fechamento (S-1299).`);
    return { evento: { id, xml }, ideDmDev: ide, prazo, erros, avisos };
}

/** Referência do S-2299 no registro de envios (situação na tela). */
export const refDesligamento = (fichaId: string, dtDeslig: string) => `deslig:${fichaId}:${dtDeslig}`;
