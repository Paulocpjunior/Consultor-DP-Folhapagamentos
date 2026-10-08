// services/esocial/eventosFolha.ts
//
// S-1200 (remuneração) e S-1210 (pagamentos) gerados pelo Consultor a partir
// da folha mensal do motor (Paulo, 07/10/2026: "pode seguir com o S-1200 e
// S-1210"). Leiaute S-1.3, sem assinatura: o CFI assina com o A1 do cofre e
// transmite, como o S-2230 e o S-1299.
//
// O S-1200 só aceita rubricas que a empresa mandou no S-1010. Por isso cada
// verba do motor (SAL, HE50, INSS…) é ligada a uma rubrica da empresa num
// de/para gravado na empresa; o app sugere pela natureza (Tabela 03) e pelo
// tipo, e a equipe confirma. A pensão alimentícia vai por alimentando (penAlim),
// com o CPF marcado na ficha. Estrutura conferida com os XSDs do leiaute S-1.3
// (evtRemun.xsd, evtPgtos.xsd, evtExclusao.xsd e tipos.xsd).
//
// Retificação: o S-1210 é um só por beneficiário e mês e aponta para o
// demonstrativo do S-1200. Quando já há S-1210 aceito no mês, ele é excluído
// (S-3000), o S-1200 vai como retificação e o S-1210 volta como original com
// todos os pagamentos do mês: os do baixado que não são desta folha, mais os
// desta folha.
//
// Férias (Paulo, 08/10/2026: "pode seguir com demonstrativo de férias no
// S-1200"), como no MOS S-1.3 (docs/referencias): S-1010, item 23, opção 1,
// e S-1200, item 29 (exemplo S-1200 × S-1210). O recibo vai num
// demonstrativo próprio no S-1200 do mês em que foi pago, inteiro como
// adiantamento (natureza 1015: férias e 1/3), com o INSS e o IRRF retidos,
// e é pago na data do recibo (S-1210 desse mês). A folha de cada mês do gozo
// traz as férias e o 1/3 do mês (1016 e 1017) e abate o adiantamento (9221)
// e o INSS e o IRRF retidos no recibo, como o holerite. Vale também quando o
// pagamento é no próprio mês do gozo.

import { adiantamentoDoMes, dataSugeridaAdiantamento, type Movimento, type ResultadoCalculo, type Verba } from '../calculo/motorMensal';
import { arredondamentoDoAdiantamento } from '../calculo/arredondamento';
import { calcularFerias, parteDaCompetencia, type OpcoesFerias, type ResultadoFerias } from '../calculo/motorFerias';
import { depNoEsocial, ratearPensao, type FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import type { TabelaLegal } from '../cadastros/tabelasLegais';
import type { Dependente } from '../implantacao/unificacao';
import { vigenciaEm, type Rubrica } from '../cadastros/rubricas';
import { diaUtilAnterior } from '../prazos/calendario';
import { reais } from '../cadastros/documentos';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';
import type { ReciboEvento } from './recibosEsocial';

const NS = 'http://www.esocial.gov.br/schema/evt';
const VERSAO = 'v_S_01_03_00';

export interface RubricaEsocial { codRubr: string; ideTabRubr: string }
/** Parâmetros do eSocial da folha, gravados na empresa. */
export interface ParametrosEsocialFolha {
    /** CNPJ do estabelecimento (S-1005) dos vínculos. */
    nrInscEstab: string;
    /** Código da lotação tributária (S-1020). */
    codLotacao: string;
    /** De/para: chave da verba do motor → rubrica do S-1010. */
    rubricas: Record<string, RubricaEsocial>;
}
export const parametrosVazios = (cnpj = ''): ParametrosEsocialFolha => ({ nrInscEstab: cnpj.replace(/\D/g, ''), codLotacao: '', rubricas: {} });

const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const valor = (c: number) => (c / 100).toFixed(2);
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9%]+/g, ' ').trim();

/** Chave da verba no de/para: o código do motor; lançamento avulso, pela descrição. */
export const chaveVerba = (v: Pick<Verba, 'codigo' | 'descricao'>) => (/^LAN\d+$/.test(v.codigo) ? `LAN:${normalizar(v.descricao)}` : v.codigo);

/** Natureza (Tabela 03) e tipo (1 = provento, 2 = desconto) que cada verba do motor deve ter no S-1010. */
const SUGESTAO: Record<string, { naturezas: string[]; dica?: RegExp; evita?: RegExp }> = {
    SAL: { naturezas: ['1000'] },
    MAT: { naturezas: ['4050'] },
    HE50: { naturezas: ['1003'], evita: /100/ },
    HE100: { naturezas: ['1003'], dica: /100/ },
    DSRHE: { naturezas: ['1002'], dica: /EXTRA|\bHE\b/ },
    FALTA: { naturezas: ['9207'], evita: /DSR|REPOUSO/ },
    DSRF: { naturezas: ['9207'], dica: /DSR|REPOUSO/ },
    INSS: { naturezas: ['9201'] },
    IRRF: { naturezas: ['9203'] },
    SF: { naturezas: ['1409'] },
    PENSAO: { naturezas: ['9213'] },
    // Adiantamento salarial: no demonstrativo próprio, a rubrica de provento do adiantamento (a natureza varia
    // no S-1010 de cada empresa: vai pela descrição); na folha, o desconto (9200). Vale-transporte: 9216.
    // Só adiantamento de salário (ou "vale", "quinzena"): comissão, gorjeta, férias e 13º têm rubricas próprias (Codex #115).
    ADIANTPAG: { naturezas: [], dica: /ADIANT.*\b(SAL|VALE|QUINZ)/, evita: /FERIAS|13|COMISS|GORJ/ },
    ADIANT: { naturezas: ['9200'] },
    VT: { naturezas: ['9216'] },
    // Arredondamento do líquido: a natureza varia no S-1010 de cada empresa; vai pela descrição, como no IOB
    // ("ARREDONDAMENTO ATUAL", "ARREDONDAMENTO ANTERIOR", "DESC. ARREDONDAMENTO ADIANTAMENTO").
    ARREDATU: { naturezas: [], dica: /ARRED.*ATUAL/ },
    ARREDANT: { naturezas: [], dica: /ARRED.*ANTERIOR/ },
    ARREDADI: { naturezas: [], dica: /ARRED.*ADIANT/ },
    // Folha do mês com férias pagas antes: férias e 1/3 da competência, o desconto do líquido pago (9221) e o retido no recibo.
    FERMES: { naturezas: ['1016'] },
    FERMES13: { naturezas: ['1017'] },
    FERPAGO: { naturezas: ['9221'] },
    INSSFERRET: { naturezas: ['9201'], dica: /FERIAS/ },
    IRRFFERRET: { naturezas: ['9203'], dica: /FERIAS/ },
    // Recibo de férias: adiantamento das férias e do 1/3 (1015), INSS e IRRF retidos.
    FERADI: { naturezas: ['1015'] },
    FERADI13: { naturezas: ['1015'] },
    FERDOB: { naturezas: ['1024'] },
    FERDOB13: { naturezas: ['1024'] },
    ABONO: { naturezas: ['1023'] },
    ABONO13: { naturezas: ['1023'] },
    INSSFER: { naturezas: ['9201'], dica: /FERIAS/ },
    IRRFFER: { naturezas: ['9203'], dica: /FERIAS/ },
};

/** Naturezas que o MOS (S-1010, item 23, opção 1) fixa para as verbas de férias. */
const NATUREZA_MOS: Record<string, string> = { FERMES: '1016', FERMES13: '1017', FERPAGO: '9221', FERADI: '1015', FERADI13: '1015' };

export interface ItemDePara { chave: string; descricao: string; tipo: 'provento' | 'desconto'; sugestao: RubricaEsocial | null }

/** Verbas dos resultados que precisam de rubrica, com a sugestão pela natureza, pelo tipo e pela descrição. */
export function sugerirDePara(resultados: ResultadoCalculo[], rubricas: Rubrica[], competencia: string): ItemDePara[] {
    const vigentes = rubricas.map(r => ({ r, v: vigenciaEm(r, competencia) })).filter(x => x.v);
    const itens = new Map<string, ItemDePara>();
    for (const res of resultados) for (const v of res.verbas) {
        const chave = chaveVerba(v);
        if (itens.has(chave) || v.valor <= 0) continue;
        const tp = v.tipo === 'provento' ? '1' : '2';
        const doTipo = vigentes.filter(x => x.v!.dados.tpRubr === tp);
        const s = SUGESTAO[v.codigo];
        // Sem natureza na sugestão, só a descrição (dica) aponta a rubrica.
        let cand = !s ? doTipo.filter(x => normalizar(x.v!.dados.dscRubr) === normalizar(v.descricao))
            : s.naturezas.length ? doTipo.filter(x => s.naturezas.includes(x.v!.dados.natRubr))
                // Só pela descrição: a dica precisa casar e o que se evita (férias, 13º) nunca entra, nem sozinho (Codex #115).
                : doTipo.filter(x => s.dica!.test(normalizar(x.v!.dados.dscRubr)) && !s.evita?.test(normalizar(x.v!.dados.dscRubr)));
        if (s?.dica && cand.some(x => s.dica!.test(normalizar(x.v!.dados.dscRubr)))) cand = cand.filter(x => s.dica!.test(normalizar(x.v!.dados.dscRubr)));
        if (s?.evita && cand.some(x => !s.evita!.test(normalizar(x.v!.dados.dscRubr)))) cand = cand.filter(x => !s.evita!.test(normalizar(x.v!.dados.dscRubr)));
        const r = cand.length === 1 ? cand[0].r : null;
        itens.set(chave, { chave, descricao: v.descricao, tipo: v.tipo, sugestao: r ? { codRubr: r.codRubr, ideTabRubr: r.ideTabRubr } : null });
    }
    return [...itens.values()];
}

/** Identificador do demonstrativo: o mesmo no S-1200 e no S-1210. */
export const ideDmDev = (perApur: string, matricula: string) => `FOLHA${perApur.replace('-', '')}-${matricula}`.slice(0, 30);
/** Demonstrativo do adiantamento salarial da competência (MOS S-1200, item 3.4: parcela paga em data própria). */
export const ideDmDevAdiantamento = (perApur: string, matricula: string) => `ADI${perApur.replace('-', '')}-${matricula}`.slice(0, 30);
export { dataSugeridaAdiantamento };
/** Verbas do demonstrativo do adiantamento: o valor, como provento, e o arredondamento dele (sem INSS, FGTS e IRRF; o IRRF é na folha). */
export const verbasDoAdiantamento = (r: Pick<ResultadoCalculo, 'verbas'>): Verba[] => {
    const v = adiantamentoDoMes(r);
    const ref = r.verbas.find(x => x.codigo === 'ADIANT')?.referencia ?? '';
    const arred = arredondamentoDoAdiantamento(r);
    return v > 0 ? [{ codigo: 'ADIANTPAG', descricao: 'Adiantamento salarial (pagamento)', referencia: ref, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false },
        ...(arred ? [{ codigo: 'ARREDATU', descricao: 'Arredondamento atual', referencia: '', tipo: 'provento' as const, valor: arred, inss: false, fgts: false, irrf: false }] : [])] : [];
};
/** O que o demonstrativo do adiantamento paga: o adiantamento e o arredondamento dele. */
export const pagoNoAdiantamento = (r: Pick<ResultadoCalculo, 'verbas'>) => verbasDoAdiantamento(r).reduce((s, v) => s + v.valor, 0);
/** Para o de/para: a rubrica de provento do adiantamento, que não está nas verbas da folha. */
export const verbasDoAdiantamentoParaDePara = (resultados: ResultadoCalculo[]): ResultadoCalculo[] =>
    resultados.filter(r => r.situacao === 'calculado' && adiantamentoDoMes(r) > 0).map(r => ({ ...r, verbas: verbasDoAdiantamento(r) }));

/** Demonstrativo do recibo de férias: pela data do pagamento. */
export const ideDmDevFerias = (dataPagamento: string, matricula: string) => `FER${dataPagamento.replace(/-/g, '')}-${matricula}`.slice(0, 30);

/** Recibo de férias para o eSocial: o cálculo e a data em que foi pago (dia útil até 2 dias antes do gozo). */
export interface ReciboFeriasEsocial { r: ResultadoFerias; dataPagamento: string }

/** Data do pagamento do recibo: o dia útil até 2 dias antes do início (a mesma do arquivo bancário). */
export const dataDoReciboFerias = (r: Pick<ResultadoFerias, 'pagarAte'>) => (r.pagarAte ? diaUtilAnterior(r.pagarAte) : '');

const mesSeguinte = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };

/**
 * Recibos de férias que a folha da competência precisa: os pagos no mês (vão
 * no S-1200 dele) e os que têm gozo no mês (a folha soma e abate a parte do
 * mês). Com as opções do IRRF do recibo entregue (as da tela; padrão sem elas) e o abono gravado.
 */
export function recibosFeriasDaCompetencia(fichas: FichaFuncionario[], afastamentos: Afastamento[], tabelas: TabelaLegal[], movimentos: Record<string, Record<string, Movimento>>, competencia: string, opcoes?: OpcoesFerias): ReciboFeriasEsocial[] {
    const porFicha = new Map(fichas.map(f => [f.id, f]));
    const ini = `${competencia}-01`; const ate = mesSeguinte(competencia);
    const r: ReciboFeriasEsocial[] = [];
    for (const g of afastamentos) {
        const f = porFicha.get(g.fichaId);
        if (!f || g.motivo !== '15' || !g.dtInicio) continue;
        const toca = g.dtInicio.slice(0, 7) <= competencia && (!g.dtFim || g.dtFim >= ini);
        if (!toca && g.dtInicio.slice(0, 7) > ate) continue;
        if (!toca && g.dtInicio.slice(0, 7) < competencia) continue;
        const rf = calcularFerias({ ficha: f, gozo: g, afastamentos: afastamentos.filter(a => a.fichaId === f.id), tabelas, movimentos: movimentos[f.id] ?? {}, abonoDias: Number(g.abonoDias || 0), opcoes });
        const data = dataDoReciboFerias(rf);
        if (toca || data.slice(0, 7) === competencia) r.push({ r: rf, dataPagamento: data });
    }
    return r.sort((a, b) => a.dataPagamento.localeCompare(b.dataPagamento));
}

/**
 * Verbas do recibo para o S-1200 do mês do pagamento: férias e 1/3 inteiros
 * como adiantamento (FERADI, FERADI13: natureza 1015); o resto como veio
 * (abono, dobra, INSS e IRRF retidos).
 */
export function verbasDoReciboFerias(rf: ResultadoFerias): Verba[] {
    const adiantamento: Record<string, [string, string]> = { FER: ['FERADI', 'Adiantamento de férias'], FER13: ['FERADI13', '1/3 do adiantamento de férias'] };
    return rf.verbas.filter(v => v.valor > 0).map(v => (adiantamento[v.codigo] ? { ...v, codigo: adiantamento[v.codigo][0], descricao: adiantamento[v.codigo][1] } : v));
}

/** Verbas que vão ao eSocial além da folha (recibos de férias pagos no mês), para o de/para. */
export function verbasDosRecibosParaDePara(recibos: ReciboFeriasEsocial[], competencia: string): ResultadoCalculo[] {
    return recibos.filter(x => x.dataPagamento.slice(0, 7) === competencia && x.r.situacao === 'calculado')
        .map(x => ({ ...x.r, verbas: verbasDoReciboFerias(x.r) }));
}

/** Quantidade da verba pela referência do motor ("10,5 h", "30 dias"). */
function quantidade(referencia: string): string {
    const m = (referencia ?? '').match(/^(\d+(?:[.,]\d+)?)\s*(h|dias?)\b/);
    if (!m) return '';
    const n = Number(m[1].replace(',', '.'));
    return n > 0 ? n.toFixed(2) : '';
}

export interface EventoGerado { id: string; xml: string }
/** S-1210 de um mês de pagamento: o evento, a exclusão do aceito no mês e os pagamentos dele que voltam. */
export interface Pagamentos1210 {
    perApur: string;
    s1210: EventoGerado | null;
    /** S-3000 do S-1210 aceito no mês: vai antes do S-1200 e do S-1210. */
    exclusao1210: EventoGerado | null;
    existente1210?: ReciboEvento;
    /** Pagamentos do S-1210 aceito que voltam no reenvio (não são desta folha). */
    outrosPagamentos: number;
}
export interface EventosDoTrabalhador extends Pagamentos1210 {
    cpf: string; nome: string; fichaIds: string[];
    s1200: EventoGerado | null;
    liquido: number; erros: string[]; avisos: string[];
    /** O S-1200 que está valendo (vai como retificação). O S-1210 do mês do pagamento da folha está nos campos herdados. */
    retifica1200?: ReciboEvento;
    /** S-1210 de outro mês: o dos recibos de férias pagos na competência, quando a folha é paga no mês seguinte. */
    outrosMeses: Pagamentos1210[];
    /** Recibos de férias com demonstrativo neste S-1200. */
    recibosFerias: number;
}

/** indRetif 1 (original) ou 2 com o nrRecibo do evento que está valendo. */
const retif = (r?: ReciboEvento) => (r ? `<indRetif>2</indRetif><nrRecibo>${r.nrRecibo}</nrRecibo>` : '<indRetif>1</indRetif>');
const mes = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const br = (d: string) => d.split('-').reverse().join('/');

export interface EntradaEventosFolha {
    cnpj: string; tpAmb: TpAmb;
    /** Competência da folha (AAAA-MM). */
    competencia: string;
    /** Data do pagamento (AAAA-MM-DD): o S-1210 vai no mês dela. */
    dataPagamento: string;
    fichas: FichaFuncionario[];
    resultados: ResultadoCalculo[];
    rubricas: Rubrica[];
    parametros: ParametrosEsocialFolha;
    /**
     * Eventos já aceitos (por CPF): o S-1200 com recibo vai como retificação
     * (indRetif 2), repetindo o demonstrativo do original; o S-1210 aceito no
     * mês do pagamento é excluído e volta com todos os pagamentos. O de outro
     * mês (recibos de férias pagos na competência) vem em s1210PorMes.
     */
    retificacao?: { s1200: Map<string, ReciboEvento>; s1210: Map<string, ReciboEvento>; s1210PorMes?: Map<string, Map<string, ReciboEvento>> };
    /** Recibos de férias pagos na competência ou com gozo nela (recibosFeriasDaCompetencia). */
    recibosFerias?: ReciboFeriasEsocial[];
    /** Data do adiantamento salarial (AAAA-MM-DD), para quem tem ADIANT na folha. Padrão: dataSugeridaAdiantamento. */
    dataAdiantamento?: string;
    agora?: Date;
}

/**
 * Um S-1200 por trabalhador (CPF), com um demonstrativo por contrato e um por
 * recibo de férias pago na competência, e um S-1210 por mês de pagamento
 * (o da folha e, se for outro, o dos recibos de férias). Quem tem erro fica
 * sem evento, com o motivo.
 */
export function gerarEventosFolha(e: EntradaEventosFolha): { trabalhadores: EventosDoTrabalhador[]; erros: string[]; avisos: string[] } {
    const erros: string[] = []; const avisos: string[] = [];
    const p = e.parametros;
    const estab = digitos(p.nrInscEstab);
    if (estab.length !== 14) erros.push('Informe o CNPJ do estabelecimento (14 dígitos).');
    if (!p.codLotacao.trim()) erros.push('Informe o código da lotação tributária (S-1020).');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.competencia)) erros.push('Competência inválida.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dataPagamento)) erros.push('Informe a data do pagamento.');
    const dataAdiant = e.dataAdiantamento || dataSugeridaAdiantamento(e.competencia);
    const comAdiantamento = e.resultados.some(r => adiantamentoDoMes(r) > 0);
    if (comAdiantamento && !/^\d{4}-\d{2}-\d{2}$/.test(dataAdiant)) erros.push('Informe a data do adiantamento salarial.');
    else if (comAdiantamento && /^\d{4}-\d{2}-\d{2}$/.test(e.dataPagamento) && dataAdiant > e.dataPagamento) erros.push('O adiantamento salarial é pago antes da folha: confira as datas.');
    if (erros.length) return { trabalhadores: [], erros, avisos };

    const porFicha = new Map(e.fichas.map(f => [f.id, f]));
    const tipoDa = new Map(e.rubricas.map(r => [`${r.ideTabRubr}|${r.codRubr}`, vigenciaEm(r, e.competencia)?.dados]));
    const grupos = new Map<string, { ficha: FichaFuncionario; r: ResultadoCalculo }[]>();
    for (const r of e.resultados) {
        const f = porFicha.get(r.fichaId);
        if (!f) continue;
        const cpf = digitos(f.cpf);
        grupos.set(cpf, [...(grupos.get(cpf) ?? []), { ficha: f, r }]);
    }
    const recibosDa = new Map<string, ReciboFeriasEsocial[]>();
    for (const x of e.recibosFerias ?? []) recibosDa.set(x.r.fichaId, [...(recibosDa.get(x.r.fichaId) ?? []), x]);
    for (const [fichaId, lista] of recibosDa) if (!e.resultados.some(r => r.fichaId === fichaId) && lista.some(x => x.dataPagamento.slice(0, 7) === e.competencia))
        avisos.push(`Recibo de férias de ${lista[0].r.nome} pago em ${mes(e.competencia)} sem a folha do mês calculada: o demonstrativo dele não vai.`);
    const perPgto = e.dataPagamento.slice(0, 7);
    let seq = 0;
    const agora = e.agora ?? new Date();
    const raiz = digitos(e.cnpj).slice(0, 8);
    const ideEmpregador = `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz}</nrInsc></ideEmpregador>`;
    const trabalhadores: EventosDoTrabalhador[] = [];
    for (const [cpf, contratos] of grupos) {
        const t: EventosDoTrabalhador = { cpf, nome: contratos[0].r.nome, fichaIds: contratos.map(c => c.ficha.id), s1200: null, liquido: 0, erros: [], avisos: [],
            retifica1200: e.retificacao?.s1200.get(cpf), perApur: perPgto, s1210: null, exclusao1210: null, existente1210: e.retificacao?.s1210.get(cpf), outrosPagamentos: 0,
            outrosMeses: [], recibosFerias: 0 };
        trabalhadores.push(t);
        if (cpf.length !== 11) t.erros.push('CPF inválido na ficha.');
        const dmDevs: string[] = []; const pagamentos: { mes: string; xml: string }[] = []; const ides = new Set<string>();
        // Dedução de dependentes no IRRF das férias (tpRend 13), no S-1210 do mês de cada recibo.
        const dedFerias = new Map<string, Map<string, number>>(); const infoDepFerias = new Map<string, Map<string, Dependente>>();
        const unico = (base: string) => { let ide = base; for (let n = 2; ides.has(ide); n++) ide = `${base.slice(0, 30 - String(n).length - 1)}-${n}`; ides.add(ide); return ide; };
        const avisoNatureza = new Set<string>();
        /** Itens por rubrica (a mesma rubrica não se repete no demonstrativo). */
        const itensDe = (verbas: Verba[]) => {
            const itens = new Map<string, { rub: RubricaEsocial; valor: number; qtd: number }>();
            for (const v of verbas) {
                if (v.valor <= 0) continue;
                const rub = p.rubricas[chaveVerba(v)];
                if (!rub) { t.erros.push(`"${v.descricao}" sem rubrica no de/para.`); continue; }
                const dados = tipoDa.get(`${rub.ideTabRubr}|${rub.codRubr}`);
                if (!dados) { t.erros.push(`Rubrica ${rub.codRubr} (de "${v.descricao}") sem S-1010 vigente em ${e.competencia}.`); continue; }
                // Provento só em rubrica de vencimento (1) e desconto só em rubrica de desconto (2); informativa (3, 4) não entra no líquido.
                // Natureza que o MOS fixa para as férias (S-1010, item 23, opção 1). FERMES era férias + 1/3 em 1020
                // antes do #111: o de/para gravado assim mudou de sentido e precisa ser refeito (Codex #111).
                const nat = NATUREZA_MOS[v.codigo];
                if (nat && dados.natRubr !== nat) {
                    if (v.codigo === 'FERMES' && dados.natRubr === '1020') t.erros.push(`O de/para de "${v.descricao}" é anterior à separação de férias e 1/3: a rubrica ${rub.codRubr} tem natureza 1020. Refaça o de/para das férias do mês (férias em 1016, 1/3 em 1017) e grave.`);
                    else if (!avisoNatureza.has(v.codigo)) { avisoNatureza.add(v.codigo); t.avisos.push(`Rubrica ${rub.codRubr} (natureza ${dados.natRubr}) para "${v.descricao}": o MOS (S-1010, item 23) indica ${nat}. Confira o de/para.`); }
                }
                const esperado = v.tipo === 'provento' ? '1' : '2';
                if (dados.tpRubr !== esperado) t.erros.push(`Rubrica ${rub.codRubr} é ${({ '1': 'provento', '2': 'desconto', '3': 'informativa', '4': 'informativa dedutora' } as Record<string, string>)[dados.tpRubr] ?? `tipo ${dados.tpRubr}`} no S-1010, e "${v.descricao}" é ${v.tipo}.`);
                const k = `${rub.ideTabRubr}|${rub.codRubr}`;
                const atual = itens.get(k) ?? { rub, valor: 0, qtd: 0 };
                atual.valor += v.valor; atual.qtd += Number(quantidade(v.referencia) || 0);
                itens.set(k, atual);
            }
            return [...itens.values()];
        };
        const dmDev = (ide: string, categ: string, f: FichaFuncionario, itens: ReturnType<typeof itensDe>) =>
            `<dmDev><ideDmDev>${esc(ide)}</ideDmDev><codCateg>${categ}</codCateg><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>${estab}</nrInsc><codLotacao>${esc(p.codLotacao.trim())}</codLotacao>`
            + `<remunPerApur><matricula>${esc(f.matriculaEsocial.trim())}</matricula>`
            // indApurIR 0 (apuração normal): obrigatório desde 07/2021 na folha mensal.
            + itens.map(i => `<itensRemun><codRubr>${esc(i.rub.codRubr)}</codRubr><ideTabRubr>${esc(i.rub.ideTabRubr)}</ideTabRubr>${i.qtd > 0 ? `<qtdRubr>${i.qtd.toFixed(2)}</qtdRubr>` : ''}<vrRubr>${valor(i.valor)}</vrRubr><indApurIR>0</indApurIR></itensRemun>`).join('')
            // Grau de exposição (Tabela 02): obrigatório para empregados (1XX, 2XX, 3XX) e 731/734/738; padrão 1.
            + (/^[123]\d\d$|^73[148]$/.test(categ) ? `<infoAgNocivo><grauExp>${/^[1-4]$/.test(f.dados.grauExp ?? '') ? f.dados.grauExp : '1'}</grauExp></infoAgNocivo>` : '')
            + '</remunPerApur></ideEstabLot></infoPerApur></dmDev>';
        const infoPgto = (data: string, ide: string, liquido: number) => `<infoPgto><dtPgto>${data}</dtPgto><tpPgto>1</tpPgto><perRef>${e.competencia}</perRef><ideDmDev>${esc(ide)}</ideDmDev><vrLiq>${valor(Math.max(0, liquido))}</vrLiq></infoPgto>`;
        for (const { ficha: f, r } of contratos) {
            const quem = contratos.length > 1 ? ` (matrícula ${f.matriculaEsocial || '?'})` : '';
            if (r.situacao !== 'calculado') { t.erros.push(`Cálculo ${r.situacao === 'erro' ? 'com erro' : 'incompleto'}${quem}: ${[...r.erros, ...r.avisos].join(' ') || 'confira o holerite'}.`); continue; }
            if (!f.matriculaEsocial.trim()) t.erros.push(`Sem matrícula do eSocial na ficha${quem}.`);
            const categ = digitos(f.dados.categoria);
            if (!/^\d{3}$/.test(categ)) t.erros.push(`Categoria do eSocial (3 dígitos) em branco na ficha${quem}.`);
            if (r.totais.liquido < 0) t.erros.push(`Líquido negativo${quem}.`);

            // Férias: as do mês na folha (que abate o adiantamento) batem com os recibos com gozo no mês.
            const recibos = recibosDa.get(f.id) ?? [];
            let ferRecibos = 0;
            for (const { r: rf, dataPagamento } of recibos) {
                const gozo = `férias com início em ${mes(rf.competencia)}`;
                if (rf.situacao !== 'calculado') { t.erros.push(`Recibo de ${gozo}${quem} com erro: ${rf.erros.join(' ') || 'confira em Cálculo › Férias'}.`); continue; }
                if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) { t.erros.push(`Recibo de ${gozo}${quem} sem data de pagamento.`); continue; }
                const parte = parteDaCompetencia(rf, e.competencia);
                if (!parte) continue;
                ferRecibos += parte.ferias + parte.terco;
                const mesPg = dataPagamento.slice(0, 7);
                if (mesPg > e.competencia) t.erros.push(`Recibo de ${gozo}${quem} pago em ${br(dataPagamento)}, depois do mês do gozo: o Consultor não gera esse caso. Transmita pelo IOB.`);
            }
            const ferFolha = r.verbas.filter(v => v.codigo === 'FERMES' || v.codigo === 'FERMES13').reduce((s, v) => s + v.valor, 0);
            if (ferFolha !== ferRecibos) t.erros.push(`Férias do mês na folha (${reais(ferFolha)}) não batem com os recibos de férias com gozo em ${mes(e.competencia)} (${reais(ferRecibos)})${quem}: confira os gozos em Cadastros › Afastamentos e recalcule.`);
            const itens = itensDe(r.verbas);
            const pagosNoMes = recibos.filter(x => x.r.situacao === 'calculado' && x.dataPagamento.slice(0, 7) === e.competencia);

            // Único por trabalhador: matrículas longas que coincidem nos primeiros caracteres ganham um sufixo.
            // Na retificação, a folha usa o demonstrativo do original quando ele é o único da matrícula e não há
            // recibo de férias; senão, os nomes do Consultor (e o original com outro nome trava em "faltando").
            const mat = f.matriculaEsocial.trim();
            const doOriginal = t.retifica1200?.demonstrativos?.[mat] ?? [];
            const ide = unico(doOriginal.length === 1 && !pagosNoMes.length ? doOriginal[0] : ideDmDev(e.competencia, mat));
            if (t.retifica1200 && !doOriginal.length && t.retifica1200.demonstrativos && Object.keys(t.retifica1200.demonstrativos).length)
                t.avisos.push(`A matrícula ${mat} não está no S-1200 original: vai num demonstrativo novo.`);
            dmDevs.push(dmDev(ide, categ, f, itens));
            pagamentos.push({ mes: perPgto, xml: infoPgto(e.dataPagamento, ide, r.totais.liquido) });
            t.liquido += r.totais.liquido;

            // Adiantamento salarial: demonstrativo próprio, pago na data do adiantamento (MOS S-1200, item 3.4).
            const adiant = adiantamentoDoMes(r);
            // Adiantamento num mês e saldo em outro: o IRRF do adiantamento é calculado de imediato, no mês dele
            // (RIR/1999, art. 621), e o motor ainda não separa. Gerar assim mandaria o IRRF no mês errado (Codex #115).
            // O cálculo decide quem recebe o adiantamento automático pela data sugerida; com outra data na tela, quem foi
            // admitido ou desligado entre as duas teria o adiantamento errado (Codex #115).
            const sugerida = dataSugeridaAdiantamento(e.competencia);
            // Mesmas regras do motor: sem vínculo no dia se admitido depois dele ou desligado antes dele.
            const comVinculo = (dia: string) => (f.dados.admissao ?? '') <= dia && !(f.dados.dataDesligamento && f.dados.dataDesligamento < dia);
            if (!r.adiantamentoInformado && dataAdiant !== sugerida && Number((f.dados.adiantamentoPct ?? '').replace(',', '.')) > 0 && comVinculo(dataAdiant) !== comVinculo(sugerida))
                t.erros.push(`Adiantamento em ${br(dataAdiant)}, mas o cálculo usou ${br(sugerida)}, e a admissão ou o desligamento${quem} fica entre as duas datas: informe no movimento o adiantamento pago (ou 0) e recalcule.`);
            else if (adiant > 0 && (f.dados.admissao ?? '') > dataAdiant) t.erros.push(`Adiantamento salarial em ${br(dataAdiant)}, antes da admissão (${br(f.dados.admissao ?? '')})${quem}: informe adiantamento 0 no movimento ou corrija a data.`);
            else if (adiant > 0 && dataAdiant.slice(0, 7) !== perPgto) t.erros.push(`Adiantamento pago em ${mes(dataAdiant.slice(0, 7))} e saldo da folha em ${mes(perPgto)}${quem}: o IRRF do adiantamento é do mês em que ele é pago, e o Consultor ainda não separa esse cálculo. Transmita pelo IOB, ou informe adiantamento 0 no movimento se não houve.`);
            else if (adiant > 0) {
                const ideA = unico(ideDmDevAdiantamento(e.competencia, mat));
                dmDevs.push(dmDev(ideA, categ, f, itensDe(verbasDoAdiantamento(r))));
                const pago = pagoNoAdiantamento(r);
                pagamentos.push({ mes: dataAdiant.slice(0, 7), xml: infoPgto(dataAdiant, ideA, pago) });
                t.liquido += pago;
            }

            // Recibos de férias pagos na competência: demonstrativo próprio, pago na data do recibo.
            for (const { r: rf, dataPagamento } of pagosNoMes) {
                const ideF = unico(ideDmDevFerias(dataPagamento, mat));
                dmDevs.push(dmDev(ideF, categ, f, itensDe(verbasDoReciboFerias(rf))));
                pagamentos.push({ mes: dataPagamento.slice(0, 7), xml: infoPgto(dataPagamento, ideF, rf.totais.liquido) });
                t.liquido += rf.totais.liquido; t.recibosFerias++;
                if (rf.irrf && !rf.irrf.usouSimplificado && rf.irrf.dependentes > 0) {
                    // Por dependente: as deduções legais menos o INSS do recibo, divididas pelos dependentes.
                    const inssRec = rf.verbas.find(v => v.codigo === 'INSSFER')?.valor ?? 0;
                    const porDep = Math.round((rf.irrf.deducoes - inssRec) / rf.irrf.dependentes);
                    const m = dataPagamento.slice(0, 7);
                    const ded = dedFerias.get(m) ?? new Map<string, number>(); const inf = infoDepFerias.get(m) ?? new Map<string, Dependente>();
                    for (const dep of f.dependentes.filter(x => x.irrf === 'S')) {
                        const cpfDep = digitos(dep.cpf);
                        if (cpfDep.length !== 11) { t.avisos.push(`Dependente ${dep.nome || '?'} sem CPF: a dedução do IRRF das férias não vai no S-1210.`); continue; }
                        // Cada recibo deduz por si: dois recibos no mês (férias fracionadas, dois contratos) somam (Codex #111).
                        if (porDep > 0) ded.set(cpfDep, (ded.get(cpfDep) ?? 0) + porDep);
                        if (!depNoEsocial(f, dep)) inf.set(cpfDep, dep);
                    }
                    dedFerias.set(m, ded); infoDepFerias.set(m, inf);
                }
            }
        }
        // O retificador substitui o S-1200 inteiro: demonstrativo do original que não está no cálculo sumiria do eSocial.
        const faltando = new Set(Object.values(t.retifica1200?.demonstrativos ?? {}).flat().filter(d => !ides.has(d)));
        if (faltando.size) t.erros.push(`O S-1200 original tem demonstrativo(s) que este cálculo não gera (${[...faltando].join(', ')}, por exemplo férias com outro nome ou outro contrato): a retificação os apagaria. Calcule todos os contratos do CPF ou retifique pelo IOB.`);

        // Um S-1210 por mês de pagamento. O aceito no mês volta com os pagamentos que não são desta folha.
        const meses = [...new Set(pagamentos.map(x => x.mes))].sort((a, b) => (a === perPgto ? 1 : b === perPgto ? -1 : a.localeCompare(b)));
        const porMes: (Pagamentos1210 & { outros: string[] })[] = meses.map(m => {
            const ex = m === perPgto ? t.existente1210 : e.retificacao?.s1210PorMes?.get(m)?.get(cpf);
            const outros: string[] = [];
            if (ex && !ex.pagamentos) {
                t.erros.push(`Já há S-1210 de ${mes(m)} aceito (recibo ${ex.nrRecibo}, ${ex.origem}): ele ${ex.excluidoEm ? 'foi excluído e volta' : 'é excluído e volta'} com todos os pagamentos do mês. Carregue o download do eSocial com esse S-1210 (ou a cópia salva na exclusão).`);
            } else if (ex) {
                for (const pg of ex.pagamentos!) {
                    const desta = pg.tpPgto === '1' && pg.perRef === e.competencia;
                    if (desta && ides.has(pg.ideDmDev)) continue;
                    if (desta && faltando.has(pg.ideDmDev)) { t.erros.push(`O S-1210 aceito paga o demonstrativo ${pg.ideDmDev}, que a retificação do S-1200 retira: o reenvio seria recusado. Inclua esse pagamento no cálculo ou acerte pelo IOB.`); continue; }
                    outros.push(pg.xml);
                }
            }
            else if (t.retifica1200) t.avisos.push(`Nenhum S-1210 de ${mes(m)} carregado: se o pagamento desta folha já foi informado (inclusive em outro mês), carregue o download com ele; o eSocial recusa retificar o S-1200 enquanto um S-1210 aponta para ele.`);
            return { perApur: m, s1210: null, exclusao1210: null, existente1210: ex, outrosPagamentos: outros.length, outros };
        });
        // IR do mês por CPF: dedução de dependentes (quando o motor não usou o desconto simplificado) e
        // pensão alimentícia de cada alimentando (penAlim). Quem não está no S-2200/S-2205 vai no infoDep.
        const dedDep = new Map<string, number>(); const penAlim = new Map<string, number>(); const infoDep = new Map<string, Dependente>();
        for (const { ficha: f, r } of contratos) {
            const d = r.deducoesIrrf;
            if (d && !d.simplificado && d.porDependente > 0) for (const dep of d.dependentes) {
                const cpfDep = digitos(dep.cpf);
                if (cpfDep.length !== 11) { t.avisos.push(`Dependente ${dep.nome || '?'} sem CPF: a dedução não vai no S-1210.`); continue; }
                if (!dedDep.has(cpfDep)) dedDep.set(cpfDep, d.porDependente);
                const fd = f.dependentes.find(x => digitos(x.cpf) === cpfDep);
                if (fd && !depNoEsocial(f, fd)) infoDep.set(cpfDep, fd);
            }
            const pensao = r.verbas.filter(v => v.codigo === 'PENSAO').reduce((soma, v) => soma + v.valor, 0);
            if (pensao <= 0) continue;
            const rateio = ratearPensao(f, pensao);
            if (rateio.erro) { t.erros.push(rateio.erro); continue; }
            for (const { dependente: dep, valor: v } of rateio.itens) {
                const cpfDep = digitos(dep.cpf);
                if (cpfDep.length !== 11 || cpfDep === cpf) { t.erros.push(`Alimentando ${dep.nome || '?'} sem CPF válido na ficha.`); continue; }
                if (v > 0) penAlim.set(cpfDep, (penAlim.get(cpfDep) ?? 0) + v);
                if (!depNoEsocial(f, dep)) infoDep.set(cpfDep, dep);
            }
        }
        const semTipo = new Set<string>();
        const conferirTipo = (c: string, dep: Dependente) => {
            if (semTipo.has(c) || (/^\d{2}$/.test(dep.tipo) && dep.tipo !== '99')) return;
            semTipo.add(c);
            t.erros.push(`Dependente ${dep.nome || c} não está no eSocial e o tipo (Tabela 07) ${dep.tipo === '99' ? 'é 99 (agregado/outros)' : 'está em branco'}: informe o tipo na ficha ou cadastre pelo S-2205.`);
        };
        for (const [c, dep] of infoDep) if (dedDep.has(c)) conferirTipo(c, dep);
        for (const [m, inf] of infoDepFerias) for (const [c, dep] of inf) if (dedFerias.get(m)?.has(c)) conferirTipo(c, dep);
        if (t.erros.length || !dmDevs.length) continue;
        /** Informações de IR do mês: as da folha (tpRend 11) no mês do pagamento dela e as dos recibos de férias (tpRend 13) no mês de cada um. */
        const irDoMes = (m: string) => {
            const daFolha = m === perPgto;
            const dedF = dedFerias.get(m) ?? new Map<string, number>();
            const irCR = [
                ...(daFolha ? [...dedDep].map(([c, v]) => `<dedDepen><tpRend>11</tpRend><cpfDep>${c}</cpfDep><vlrDedDep>${valor(v)}</vlrDedDep></dedDepen>`) : []),
                ...[...dedF].map(([c, v]) => `<dedDepen><tpRend>13</tpRend><cpfDep>${c}</cpfDep><vlrDedDep>${valor(v)}</vlrDedDep></dedDepen>`),
                ...(daFolha ? [...penAlim].map(([c, v]) => `<penAlim><tpRend>11</tpRend><cpfDep>${c}</cpfDep><vlrDedPenAlim>${valor(v)}</vlrDedPenAlim></penAlim>`) : []),
            ];
            const deps = new Map<string, Dependente>([...(daFolha ? infoDep : []), ...(infoDepFerias.get(m) ?? [])]);
            const deduz = (c: string) => (daFolha && dedDep.has(c)) || dedF.has(c);
            const infoDepXml = [...deps].map(([c, dep]) => `<infoDep><cpfDep>${c}</cpfDep>${/^\d{4}-\d{2}-\d{2}$/.test(dep.nascimento) ? `<dtNascto>${dep.nascimento}</dtNascto>` : ''}`
                + `${dep.nome ? `<nome>${esc(dep.nome.slice(0, 70))}</nome>` : ''}${deduz(c) ? `<depIRRF>S</depIRRF><tpDep>${dep.tipo}</tpDep>` : ''}</infoDep>`);
            return irCR.length ? `<infoIRComplem>${infoDepXml.join('')}<infoIRCR><tpCR>056107</tpCR>${irCR.join('')}</infoIRCR></infoIRComplem>` : '';
        };
        const id1200 = idEvento(e.cnpj, agora, ++seq);
        t.s1200 = { id: id1200, xml: `<eSocial xmlns="${NS}/evtRemun/${VERSAO}"><evtRemun Id="${id1200}">`
            + `<ideEvento>${retif(t.retifica1200)}<indApuracao>1</indApuracao><perApur>${e.competencia}</perApur><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
            + ideEmpregador + `<ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador>` + dmDevs.join('') + '</evtRemun></eSocial>' };
        for (const pm of porMes) {
            const ex = pm.existente1210;
            if (ex && !ex.excluidoEm) {
                const id3000 = idEvento(e.cnpj, agora, ++seq);
                pm.exclusao1210 = { id: id3000, xml: `<eSocial xmlns="${NS}/evtExclusao/${VERSAO}"><evtExclusao Id="${id3000}">`
                    + `<ideEvento><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>` + ideEmpregador
                    + `<infoExclusao><tpEvento>S-1210</tpEvento><nrRecEvt>${ex.nrRecibo}</nrRecEvt><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><ideFolhaPagto><perApur>${pm.perApur}</perApur></ideFolhaPagto></infoExclusao>`
                    + '</evtExclusao></eSocial>' };
            }
            // As informações de IR do S-1210 aceito (dependentes, pensão, plano de saúde…) voltam como estavam,
            // e as deduções dos recibos de férias deste envio (tpRend 13) entram nelas (Codex #111).
            const novo = irDoMes(pm.perApur);
            // No mês da competência o cálculo tem todos os recibos pagos nele: o tpRend 13 do aceito é conciliado (sai o
            // que não vale mais). Em outro mês, o aceito tem recibos de outra competência e o tpRend 13 dele fica.
            const ir = ex?.irComplem?.length ? mesclarIRFerias(ex.irComplem.join(''), novo, pm.perApur === e.competencia) : novo;
            if (ex?.irComplem?.length && novo) t.avisos.push(`As deduções do IRRF (dependentes e pensão) voltam como estavam no S-1210 de ${mes(pm.perApur)} aceito, com as das férias deste envio; confira se mudaram.`);
            const id1210 = idEvento(e.cnpj, agora, ++seq);
            pm.s1210 = { id: id1210, xml: `<eSocial xmlns="${NS}/evtPgtos/${VERSAO}"><evtPgtos Id="${id1210}">`
                + `<ideEvento><indRetif>1</indRetif><perApur>${pm.perApur}</perApur><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
                + ideEmpregador + `<ideBenef><cpfBenef>${cpf}</cpfBenef>` + pm.outros.join('') + pagamentos.filter(x => x.mes === pm.perApur).map(x => x.xml).join('') + ir
                + '</ideBenef></evtPgtos></eSocial>' };
        }
        for (const { outros: _o, ...pm } of porMes) {
            if (pm.perApur === perPgto) Object.assign(t, pm);
            else t.outrosMeses.push(pm);
        }
    }
    trabalhadores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { trabalhadores, erros, avisos };
}

/**
 * Junta ao infoIRComplem do S-1210 aceito as deduções de dependentes dos recibos de férias (dedDepen tpRend 13)
 * calculadas agora, com o infoDep de quem ainda não está nele. O cálculo traz todos os recibos pagos no mês,
 * então o valor dele vale: o tpRend 13 do mesmo CPF no aceito é trocado (reenvio igual não muda; recibo novo
 * soma). Com `completo` (o cálculo tem todos os recibos pagos no mês), o tpRend 13 do aceito que não está no
 * cálculo sai: recibo corrigido que passou ao desconto simplificado ou deixou de deduzir alguém (Codex #111).
 * Nada mais do aceito muda. Ordem do leiaute: infoDep antes de infoIRCR; dedDepen logo após tpCR.
 */
export function mesclarIRFerias(aceito: string, novo: string, completo = false): string {
    const blocos = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')) ?? [];
    const campo = (xml: string, tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? '';
    const novos = blocos(novo, 'dedDepen').filter(d => campo(d, 'tpRend') === '13');
    if (!novos.length && !completo) return aceito;
    const porCpf = new Map(novos.map(d => [campo(d, 'cpfDep'), d]));
    let r = aceito;
    // Troca o que já está no aceito (mesmo CPF, tpRend 13) pelo valor de agora; sem valor agora, sai (só se completo).
    for (const d of blocos(aceito, 'dedDepen')) {
        const c = campo(d, 'cpfDep');
        if (campo(d, 'tpRend') !== '13') continue;
        if (porCpf.has(c)) { r = r.replace(d, porCpf.get(c)!); porCpf.delete(c); }
        else if (completo) r = r.replace(d, '');
    }
    // infoIRCR que ficou só com o código da receita não informa nada.
    r = r.replace(/<infoIRCR><tpCR>\d+<\/tpCR><\/infoIRCR>/g, '').replace(/<infoIRComplem><\/infoIRComplem>/g, '');
    const ded = [...porCpf.values()];
    if (ded.length) {
        const cr = '<tpCR>056107</tpCR>';
        if (r.includes(cr)) r = r.replace(cr, cr + ded.join(''));
        else {
            const i = r.search(/<planSaude>|<infoReembMed>|<\/infoIRComplem>/);
            r = r.slice(0, i) + `<infoIRCR>${cr}${ded.join('')}</infoIRCR>` + r.slice(i);
        }
    }
    const cpfs = new Set(novos.map(d => campo(d, 'cpfDep')));
    const depsAceito = new Set(blocos(r, 'infoDep').map(d => campo(d, 'cpfDep')));
    const infoDep = blocos(novo, 'infoDep').filter(d => cpfs.has(campo(d, 'cpfDep')) && !depsAceito.has(campo(d, 'cpfDep')));
    if (infoDep.length) {
        const i = r.search(/<infoIRCR>|<planSaude>|<infoReembMed>|<\/infoIRComplem>/);
        r = r.slice(0, i) + infoDep.join('') + r.slice(i);
    }
    return r;
}

/** Todos os S-1210 do trabalhador (o do mês da folha e os de outros meses), com a exclusão de cada um. */
export const pagamentos1210 = (t: EventosDoTrabalhador): Pagamentos1210[] => [t, ...t.outrosMeses].sort((a, b) => a.perApur.localeCompare(b.perApur));

/** Lotes de até 50 eventos (limite do envio em lote do eSocial). */
export function emLotes<T>(lista: T[], tamanho = 50): T[][] {
    const r: T[][] = [];
    for (let i = 0; i < lista.length; i += tamanho) r.push(lista.slice(i, i + tamanho));
    return r;
}
