// services/esocial/eventosCI.ts
//
// S-1200 e S-1210 do pró-labore e do RPA (contribuintes individuais, services/contribuintes/contribuinteIndividual.ts):
// - S-1200 um por CPF, com o demonstrativo do mês (infoPerApur). Sem o S-2300 (autônomo, 701), vão os dados cadastrais
//   (infoComplem) e o CBO (infoComplCont), como manda o MOS (S-1200, item 23); com outras fontes no mês, o infoMV
//   (item 5). Sem infoAgNocivo (só empregados e algumas categorias de avulso e cooperado);
// - rubricas: o pró-labore e o RPA (natureza 3501 para serviços, MOS item 13.1), o INSS e o IRRF retidos (as rubricas
//   da folha) e o ISS retido (natureza 9222, item 13.2), pelo de/para da empresa;
// - S-1210 no mês do pagamento, com o líquido e, quando os dependentes deduzem, o infoIRComplem.
// Só originais: a retificação ainda é pelo IOB.

import type { Rubrica } from '../cadastros/rubricas';
import { vigenciaEm } from '../cadastros/rubricas';
import { cpfValido } from '../cadastros/documentos';
import { CATEGORIAS_CI, type ContribuinteIndividual, type ResultadoCI } from '../contribuintes/contribuinteIndividual';
import type { ParametrosEsocialFolha } from './eventosFolha';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';
const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const valor = (c: number) => (c / 100).toFixed(2);
/** Código de receita do IRRF do trabalho sem vínculo empregatício (conferir na Tabela 29 do eSocial). */
export const TP_CR_CI = '058806';

export const ideDmDevCI = (competencia: string, prolabore: boolean) => `${prolabore ? 'PROLAB' : 'RPA'}${competencia.replace('-', '')}`;

export interface EventosCI { cpf: string; nome: string; s1200: { id: string; xml: string } | null; s1210: { id: string; xml: string } | null; perPgto: string; liquido: number; erros: string[]; avisos: string[] }

export interface EntradaEventosCI {
    cnpj: string; tpAmb: TpAmb; competencia: string;
    contribuintes: ContribuinteIndividual[];
    resultados: ResultadoCI[];
    rubricas: Rubrica[];
    parametros: ParametrosEsocialFolha;
    agora?: Date;
}

export function gerarEventosCI(e: EntradaEventosCI): { eventos: EventosCI[]; erros: string[] } {
    const erros: string[] = [];
    const p = e.parametros;
    const estab = digitos(p.nrInscEstab);
    if (estab.length !== 14) erros.push('Informe o CNPJ do estabelecimento (14 dígitos) nos parâmetros do eSocial da folha.');
    if (!p.codLotacao.trim()) erros.push('Informe o código da lotação tributária (S-1020) nos parâmetros do eSocial da folha.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.competencia)) erros.push('Competência inválida.');
    if (erros.length) return { eventos: [], erros };
    const tipoDa = new Map(e.rubricas.map(r => [`${r.ideTabRubr}|${r.codRubr}`, vigenciaEm(r, e.competencia)?.dados]));
    const agora = e.agora ?? new Date();
    let seq = e.agora ? 0 : agora.getMilliseconds() * 10;
    const ideEmpregador = `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${digitos(e.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`;
    const eventos: EventosCI[] = [];
    for (const r of e.resultados) {
        const c = e.contribuintes.find(x => x.id === r.fichaId);
        const cpf = digitos(c?.cpf);
        const t: EventosCI = { cpf, nome: r.nome, s1200: null, s1210: null, perPgto: r.dataPagamento.slice(0, 7), liquido: r.totais.liquido, erros: [], avisos: [] };
        eventos.push(t);
        if (!c) { t.erros.push('Cadastro do sócio ou autônomo não encontrado.'); continue; }
        if (r.situacao !== 'calculado') { t.erros.push(`Cálculo ${r.situacao === 'erro' ? 'com erro' : 'incompleto'}: ${[...r.erros, ...r.avisos].join(' ') || 'confira'}.`); continue; }
        if (!cpfValido(cpf)) t.erros.push('CPF inválido no cadastro.');
        const def = CATEGORIAS_CI[c.categoria];
        if (def.exigeS2300 && !c.s2300) t.erros.push('Sócio e diretor (722, 723): envie o S-2300 antes; o S-1200 vai depois dele.');
        if (!c.s2300 && !/^\d{6}$/.test(c.cbo)) t.erros.push('Sem o S-2300, o S-1200 leva o CBO (infoComplCont): informe no cadastro.');
        // Itens do demonstrativo pelo de/para da empresa.
        const itens: string[] = [];
        for (const v of r.verbas) {
            if (v.valor <= 0) continue;
            const rub = p.rubricas[v.codigo];
            if (!rub) { t.erros.push(`"${v.descricao}" sem rubrica no de/para.`); continue; }
            const d = tipoDa.get(`${rub.ideTabRubr}|${rub.codRubr}`);
            if (!d) { t.erros.push(`Rubrica ${rub.codRubr} (de "${v.descricao}") sem S-1010 vigente em ${e.competencia}.`); continue; }
            const esperado = v.tipo === 'provento' ? '1' : '2';
            if (d.tpRubr !== esperado) t.erros.push(`Rubrica ${rub.codRubr} não é de ${v.tipo} no S-1010.`);
            if (v.codigo === 'RPA' && d.natRubr !== '3501') t.avisos.push(`Rubrica ${rub.codRubr} do RPA com natureza ${d.natRubr}: o MOS (S-1200, item 13.1) indica 3501.`);
            if (v.codigo === 'ISS' && d.natRubr !== '9222') t.avisos.push(`Rubrica ${rub.codRubr} do ISS com natureza ${d.natRubr}: o MOS (S-1200, item 13.2) indica 9222.`);
            itens.push(`<itensRemun><codRubr>${esc(rub.codRubr)}</codRubr><ideTabRubr>${esc(rub.ideTabRubr)}</ideTabRubr><vrRubr>${valor(v.valor)}</vrRubr><indApurIR>0</indApurIR></itensRemun>`);
        }
        if (t.erros.length) continue;
        const ide = ideDmDevCI(e.competencia, def.tipo === 'prolabore');
        const infoMV = r.indMV ? `<infoMV><indMV>${r.indMV}</indMV>${r.outrasFontes.map(o => `<remunOutrEmpr><tpInsc>${o.tpInsc}</tpInsc><nrInsc>${digitos(o.nrInsc)}</nrInsc><codCateg>${o.codCateg}</codCateg><vlrRemunOE>${valor(o.valor)}</vlrRemunOE></remunOutrEmpr>`).join('')}</infoMV>` : '';
        // Sem o S-2300: os dados cadastrais (vedados para quem tem vínculo ativo no RET; MOS, item 23.2).
        const infoComplem = c.s2300 ? '' : `<infoComplem><nmTrab>${esc(c.nome.trim().slice(0, 70))}</nmTrab><dtNascto>${c.nascimento}</dtNascto></infoComplem>`;
        if (!c.s2300) t.avisos.push('Sem o S-2300: os dados cadastrais vão no S-1200. Se o CPF tiver vínculo ativo na empresa (empregado), o eSocial recusa o infoComplem: nesse caso envie o S-2300.');
        const matricula = c.s2300 && c.matricula.trim() ? `<matricula>${esc(c.matricula.trim())}</matricula>` : '';
        const infoComplCont = c.s2300 ? '' : `<infoComplCont><codCBO>${c.cbo}</codCBO></infoComplCont>`;
        const id1200 = idEvento(e.cnpj, agora, ++seq);
        t.s1200 = { id: id1200, xml: `<eSocial xmlns="${NS}/evtRemun/${VERSAO}"><evtRemun Id="${id1200}">`
            + `<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao><perApur>${e.competencia}</perApur><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
            + ideEmpregador + `<ideTrabalhador><cpfTrab>${cpf}</cpfTrab>${infoMV}${infoComplem}</ideTrabalhador>`
            + `<dmDev><ideDmDev>${ide}</ideDmDev><codCateg>${c.categoria}</codCateg><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>${estab}</nrInsc><codLotacao>${esc(p.codLotacao.trim())}</codLotacao>`
            + `<remunPerApur>${matricula}${p.indSimples ? `<indSimples>${p.indSimples}</indSimples>` : ''}${itens.join('')}</remunPerApur></ideEstabLot></infoPerApur>${infoComplCont}</dmDev>`
            + '</evtRemun></eSocial>' };
        // S-1210: o líquido no mês do pagamento e, com dependentes deduzidos, o infoIRComplem.
        const d = r.deducoesIrrf;
        let ir = '';
        if (d && !d.simplificado && d.porDependente > 0 && c.dependentes.length) {
            const infoDep = c.s2300 ? '' : c.dependentes.map(x => `<infoDep><cpfDep>${digitos(x.cpf)}</cpfDep><dtNascto>${x.nascimento}</dtNascto><nome>${esc(x.nome.slice(0, 70))}</nome><depIRRF>S</depIRRF><tpDep>${x.tipo}</tpDep></infoDep>`).join('');
            ir = `<infoIRComplem>${infoDep}<infoIRCR><tpCR>${TP_CR_CI}</tpCR>${c.dependentes.map(x => `<dedDepen><tpRend>11</tpRend><cpfDep>${digitos(x.cpf)}</cpfDep><vlrDedDep>${valor(d.porDependente)}</vlrDedDep></dedDepen>`).join('')}</infoIRCR></infoIRComplem>`;
            t.avisos.push(`Dedução de dependentes no S-1210 com o código de receita ${TP_CR_CI} (trabalho sem vínculo): confira na Tabela 29.`);
            if (c.s2300) t.avisos.push('Com o S-2300, os dependentes têm de estar nele (ou num S-2306); o S-1210 só leva a dedução.');
        }
        const id1210 = idEvento(e.cnpj, agora, ++seq);
        t.s1210 = { id: id1210, xml: `<eSocial xmlns="${NS}/evtPgtos/${VERSAO}"><evtPgtos Id="${id1210}">`
            + `<ideEvento><indRetif>1</indRetif><perApur>${t.perPgto}</perApur><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
            + ideEmpregador + `<ideBenef><cpfBenef>${cpf}</cpfBenef><infoPgto><dtPgto>${r.dataPagamento}</dtPgto><tpPgto>1</tpPgto><perRef>${e.competencia}</perRef><ideDmDev>${ide}</ideDmDev><vrLiq>${valor(Math.max(0, r.totais.liquido))}</vrLiq></infoPgto>${ir}</ideBenef>`
            + '</evtPgtos></eSocial>' };
    }
    return { eventos, erros };
}

/** Itens do de/para próprios do pró-labore e do RPA (o INSS e o IRRF são os da folha). */
export const CHAVES_CI: { chave: 'PROLAB' | 'RPA' | 'ISS'; descricao: string; tipo: 'provento' | 'desconto'; naturezas: string[]; dica: RegExp }[] = [
    { chave: 'PROLAB', descricao: 'Pró-labore', tipo: 'provento', naturezas: [], dica: /PRO ?LAB|RETIRAD/ },
    { chave: 'RPA', descricao: 'Serviços prestados (RPA)', tipo: 'provento', naturezas: ['3501'], dica: /AUTON|SERVI|RPA/ },
    { chave: 'ISS', descricao: 'ISS retido', tipo: 'desconto', naturezas: ['9222'], dica: /\bISS\b/ },
];
