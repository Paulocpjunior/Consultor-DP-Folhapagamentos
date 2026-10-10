// services/esocial/pagamentoRescisao.ts
//
// S-1210 do pagamento da rescisão (item 2 das sugestões, "efetivador de rescisões"): o pagamento das verbas do
// S-2299 (MOS S-1.3, S-2299 item 1.2), leiaute S-1.3 (evtPgtos.xsd):
// - infoPgto com tpPgto 2 (verbas do S-2299), perRef = mês do desligamento e o mesmo ideDmDev do S-2299;
// - perApur = mês do pagamento (regime de caixa);
// - infoIRComplem: dedução de dependentes do saldo (tpRend 11) e do 13º (tpRend 12), quando o cálculo não usou o
//   desconto simplificado, e a pensão alimentícia descontada (penAlim tpRend 11 e 12), por alimentando.
// O S-1210 é um só por trabalhador e mês: se já há um aceito no mês do pagamento (a folha anterior paga no mesmo
// mês, por exemplo), ele é excluído (S-3000) e volta com todos os pagamentos dele mais o da rescisão, com as
// informações de IR dele (as da rescisão entram junto), como na retificação da folha.

import { depNoEsocial, ratearPensao, type FichaFuncionario } from '../cadastros/funcionarios';
import type { ResultadoRescisao } from '../calculo/motorRescisao';
import { cpfValido } from '../cadastros/documentos';
import type { Dependente } from '../implantacao/unificacao';
import { mesclarIRFerias, type EventoGerado } from './eventosFolha';
import type { ReciboEvento } from './recibosEsocial';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';
const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const valor = (c: number) => (c / 100).toFixed(2);
const br = (d: string) => d.split('-').reverse().join('/');
const mes = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;

export interface EntradaS1210Rescisao {
    cnpj: string;
    tpAmb: TpAmb;
    ficha: FichaFuncionario;
    rescisao: ResultadoRescisao;
    /** O demonstrativo do S-2299 (ideDmDevRescisao). */
    ideDmDev: string;
    /** Data do pagamento das verbas (AAAA-MM-DD). */
    dataPagamento: string;
    /** S-1210 já aceito no mês do pagamento para o CPF (envios do Consultor e download do eSocial). */
    existente?: ReciboEvento;
    agora?: Date;
}

export interface ResultadoS1210Rescisao {
    perApur: string;
    exclusao: EventoGerado | null;
    s1210: EventoGerado | null;
    /** Pagamentos do S-1210 aceito que voltam no reenvio. */
    outrosPagamentos: number;
    erros: string[];
    avisos: string[];
}

/** S-1210 do pagamento da rescisão (e o S-3000 do aceito no mês, quando há). Com erro, sem evento e com o motivo. */
export function gerarS1210Rescisao(e: EntradaS1210Rescisao): ResultadoS1210Rescisao {
    const r = e.rescisao; const f = e.ficha;
    const erros: string[] = []; const avisos: string[] = [];
    const perApur = e.dataPagamento.slice(0, 7);
    const sair = (outros = 0): ResultadoS1210Rescisao => ({ perApur, exclusao: null, s1210: null, outrosPagamentos: outros, erros, avisos });
    const cpf = digitos(f.cpf);
    if (!cpfValido(cpf)) erros.push('CPF inválido na ficha.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dataPagamento)) erros.push('Informe a data do pagamento da rescisão.');
    else if (e.dataPagamento < r.data) erros.push(`Pagamento em ${br(e.dataPagamento)}, antes do desligamento (${br(r.data)}).`);
    else if (r.pagarAte && e.dataPagamento > r.pagarAte) avisos.push(`Pagamento em ${br(e.dataPagamento)}, depois do prazo de 10 dias (${br(r.pagarAte)}): multa do art. 477, § 8º, da CLT (um salário), se não houver motivo.`);
    if (r.situacao !== 'calculado') erros.push(`Rescisão ${r.situacao === 'erro' ? 'com erro' : 'incompleta'}: confira o cálculo.`);
    if (r.totais.liquido < 0) erros.push('Líquido da rescisão negativo.');
    // O IRRF do cálculo segue a tabela do mês do pagamento usado nele: outro mês mudaria o imposto.
    if (/^\d{4}-\d{2}$/.test(r.pagamento) && r.pagamento !== perApur) erros.push(`A rescisão foi calculada com pagamento em ${mes(r.pagamento)}, e a data é de ${mes(perApur)}: ajuste o "Mês do pagamento" da rescisão (tabela do IRRF) e gere de novo.`);
    if (erros.length) return sair();

    // Informações de IR: dependentes (sem o simplificado) e pensão, por tpRend (11 saldo, 12 13º).
    const dedDep: { tpRend: '11' | '12'; cpf: string; valor: number }[] = [];
    const penAlim: { tpRend: '11' | '12'; cpf: string; valor: number }[] = [];
    const infoDep = new Map<string, Dependente>();
    const fichaDep = (c: string) => f.dependentes.find(x => digitos(x.cpf) === c);
    const deducao = (tpRend: '11' | '12', d?: { simplificado: boolean; dependentes: { cpf: string; nome: string }[]; porDependente: number }) => {
        if (!d || d.simplificado || !(d.porDependente > 0)) return;
        for (const dep of d.dependentes) {
            const c = digitos(dep.cpf);
            if (c.length !== 11) { avisos.push(`Dependente ${dep.nome || '?'} sem CPF: a dedução não vai no S-1210.`); continue; }
            dedDep.push({ tpRend, cpf: c, valor: d.porDependente });
            const fd = fichaDep(c);
            if (fd && !depNoEsocial(f, fd)) infoDep.set(c, fd);
        }
    };
    deducao('11', r.deducoesIrrf);
    deducao('12', r.deducoes13);
    for (const [cod, tpRend] of [['PENSAO', '11'], ['PENSAO13', '12']] as const) {
        const total = r.verbas.filter(v => v.codigo === cod).reduce((s, v) => s + v.valor, 0);
        if (total <= 0) continue;
        const rateio = ratearPensao(f, total);
        if (rateio.erro) { erros.push(rateio.erro); continue; }
        for (const { dependente: dep, valor: v } of rateio.itens) {
            const c = digitos(dep.cpf);
            if (c.length !== 11 || c === cpf) { erros.push(`Alimentando ${dep.nome || '?'} sem CPF válido na ficha.`); continue; }
            if (v > 0) penAlim.push({ tpRend, cpf: c, valor: v });
            if (!depNoEsocial(f, dep)) infoDep.set(c, dep);
        }
    }
    for (const p of penAlim) if (dedDep.some(d => d.cpf === p.cpf && d.tpRend === p.tpRend)) {
        erros.push(`${fichaDep(p.cpf)?.nome || p.cpf} é alimentando (pensão) e também dependente no IRRF: as duas deduções não se somam. Desmarque o IRRF do dependente na ficha e recalcule.`);
    }
    for (const [c, dep] of infoDep) if (dedDep.some(d => d.cpf === c) && !(/^\d{2}$/.test(dep.tipo) && dep.tipo !== '99'))
        erros.push(`Dependente ${dep.nome || c} não está no eSocial e o tipo (Tabela 07) ${dep.tipo === '99' ? 'é 99 (agregado/outros)' : 'está em branco'}: informe o tipo na ficha ou cadastre pelo S-2205.`);

    // O S-1210 aceito no mês volta com os pagamentos dele.
    const ex = e.existente;
    const outros: string[] = [];
    if (ex && !ex.pagamentos) {
        erros.push(`Já há S-1210 de ${mes(perApur)} aceito para este CPF (recibo ${ex.nrRecibo}, ${ex.origem}): ele é excluído e volta com todos os pagamentos do mês. Carregue o download do eSocial com esse S-1210 (ou a cópia salva na exclusão).`);
    } else if (ex) {
        for (const pg of ex.pagamentos!) {
            if (pg.tpPgto === '2' && pg.ideDmDev === e.ideDmDev) { erros.push(`O S-1210 de ${mes(perApur)} aceito já tem o pagamento desta rescisão (${e.ideDmDev}). Para corrigir o valor, retifique o S-2299 e exclua o S-1210 pelo IOB ou pela Saúde do eSocial.`); continue; }
            outros.push(pg.xml);
        }
        if (penAlim.length && ex.irComplem?.some(x => /<penAlim>/.test(x))) erros.push(`O S-1210 de ${mes(perApur)} aceito já tem pensão alimentícia, e a rescisão também: junte as duas pelo IOB (o Consultor ainda não soma a pensão de dois pagamentos no mesmo mês).`);
    }
    if (erros.length) return sair(outros.length);

    const dedXml = dedDep.map(d => `<dedDepen><tpRend>${d.tpRend}</tpRend><cpfDep>${d.cpf}</cpfDep><vlrDedDep>${valor(d.valor)}</vlrDedDep></dedDepen>`);
    const penXml = penAlim.map(p => `<penAlim><tpRend>${p.tpRend}</tpRend><cpfDep>${p.cpf}</cpfDep><vlrDedPenAlim>${valor(p.valor)}</vlrDedPenAlim></penAlim>`);
    const deduz = (c: string) => dedDep.some(d => d.cpf === c);
    const infoDepXml = [...infoDep].map(([c, dep]) => `<infoDep><cpfDep>${c}</cpfDep>${/^\d{4}-\d{2}-\d{2}$/.test(dep.nascimento) ? `<dtNascto>${dep.nascimento}</dtNascto>` : ''}`
        + `${dep.nome ? `<nome>${esc(dep.nome.slice(0, 70))}</nome>` : ''}${deduz(c) ? `<depIRRF>S</depIRRF><tpDep>${dep.tipo}</tpDep>` : ''}</infoDep>`);
    const novoIr = dedXml.length || penXml.length ? `<infoIRComplem>${infoDepXml.join('')}<infoIRCR><tpCR>056107</tpCR>${dedXml.join('')}${penXml.join('')}</infoIRCR></infoIRComplem>` : '';
    let ir = novoIr;
    if (ex?.irComplem?.length) {
        // As do aceito voltam como estavam; as deduções de dependentes da rescisão (tpRend 11 e 12) entram nelas (o mesmo
        // dependente no mesmo tpRend vale uma vez no mês) e a pensão da rescisão, que o aceito não tem, entra no fim.
        let aceito = mesclarIRFerias(ex.irComplem.join(''), novoIr, false, true, false, '12');
        if (penXml.length) {
            const cr = /<infoIRCR><tpCR>056107<\/tpCR>[\s\S]*?<\/infoIRCR>/.exec(aceito)?.[0];
            if (cr) {
                const i = cr.search(/<previdCompl>|<infoProcRet>|<\/infoIRCR>/);
                aceito = aceito.replace(cr, cr.slice(0, i) + penXml.join('') + cr.slice(i));
            } else {
                const i = aceito.search(/<planSaude>|<infoReembMed>|<\/infoIRComplem>/);
                aceito = i >= 0 ? aceito.slice(0, i) + `<infoIRCR><tpCR>056107</tpCR>${penXml.join('')}</infoIRCR>` + aceito.slice(i) : aceito + novoIr;
            }
        }
        ir = aceito;
        avisos.push(`As informações de IR do S-1210 de ${mes(perApur)} aceito (dependentes, pensão, plano de saúde) voltam como estavam, com as da rescisão; confira.`);
    }

    const agora = e.agora ?? new Date();
    let seq = e.agora ? 0 : agora.getMilliseconds() * 10;
    const ideEmpregador = `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${digitos(e.cnpj).slice(0, 8)}</nrInsc></ideEmpregador>`;
    let exclusao: EventoGerado | null = null;
    if (ex && !ex.excluidoEm) {
        const id = idEvento(e.cnpj, agora, ++seq);
        exclusao = { id, xml: `<eSocial xmlns="${NS}/evtExclusao/${VERSAO}"><evtExclusao Id="${id}">`
            + `<ideEvento><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>` + ideEmpregador
            + `<infoExclusao><tpEvento>S-1210</tpEvento><nrRecEvt>${ex.nrRecibo}</nrRecEvt><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><ideFolhaPagto><perApur>${perApur}</perApur></ideFolhaPagto></infoExclusao>`
            + '</evtExclusao></eSocial>' };
    }
    const id = idEvento(e.cnpj, agora, ++seq);
    const pgto = `<infoPgto><dtPgto>${e.dataPagamento}</dtPgto><tpPgto>2</tpPgto><perRef>${r.data.slice(0, 7)}</perRef><ideDmDev>${esc(e.ideDmDev)}</ideDmDev><vrLiq>${valor(Math.max(0, r.totais.liquido))}</vrLiq></infoPgto>`;
    const s1210 = { id, xml: `<eSocial xmlns="${NS}/evtPgtos/${VERSAO}"><evtPgtos Id="${id}">`
        + `<ideEvento><indRetif>1</indRetif><perApur>${perApur}</perApur><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
        + ideEmpregador + `<ideBenef><cpfBenef>${cpf}</cpfBenef>` + outros.join('') + pgto + ir + '</ideBenef></evtPgtos></eSocial>' };
    return { perApur, exclusao, s1210, outrosPagamentos: outros.length, erros, avisos };
}

/** Referência do S-1210 da rescisão no registro de envios. */
export const refPagamentoRescisao = (fichaId: string, dtDeslig: string) => `pgto-resc:${fichaId}:${dtDeslig}`;
