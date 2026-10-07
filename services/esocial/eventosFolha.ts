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
// tipo, e a equipe confirma. Estrutura conferida com os XSDs do leiaute S-1.3
// (evtRemun.xsd, evtPgtos.xsd, evtExclusao.xsd e tipos.xsd).
//
// Retificação: o S-1210 é um só por beneficiário e mês e aponta para o
// demonstrativo do S-1200. Quando já há S-1210 aceito no mês, ele é excluído
// (S-3000), o S-1200 vai como retificação e o S-1210 volta como original com
// todos os pagamentos do mês: os do baixado que não são desta folha, mais os
// desta folha.

import type { ResultadoCalculo, Verba } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { vigenciaEm, type Rubrica } from '../cadastros/rubricas';
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
    INSSFERRET: { naturezas: ['9201'], dica: /FERIAS/ },
    IRRFFERRET: { naturezas: ['9203'], dica: /FERIAS/ },
    FERMES: { naturezas: ['1020'] },
};

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
        let cand = s ? doTipo.filter(x => s.naturezas.includes(x.v!.dados.natRubr)) : doTipo.filter(x => normalizar(x.v!.dados.dscRubr) === normalizar(v.descricao));
        if (s?.dica && cand.some(x => s.dica!.test(normalizar(x.v!.dados.dscRubr)))) cand = cand.filter(x => s.dica!.test(normalizar(x.v!.dados.dscRubr)));
        if (s?.evita && cand.some(x => !s.evita!.test(normalizar(x.v!.dados.dscRubr)))) cand = cand.filter(x => !s.evita!.test(normalizar(x.v!.dados.dscRubr)));
        const r = cand.length === 1 ? cand[0].r : null;
        itens.set(chave, { chave, descricao: v.descricao, tipo: v.tipo, sugestao: r ? { codRubr: r.codRubr, ideTabRubr: r.ideTabRubr } : null });
    }
    return [...itens.values()];
}

/** Identificador do demonstrativo: o mesmo no S-1200 e no S-1210. */
export const ideDmDev = (perApur: string, matricula: string) => `FOLHA${perApur.replace('-', '')}-${matricula}`.slice(0, 30);

/** Quantidade da verba pela referência do motor ("10,5 h", "30 dias"). */
function quantidade(referencia: string): string {
    const m = (referencia ?? '').match(/^(\d+(?:[.,]\d+)?)\s*(h|dias?)\b/);
    if (!m) return '';
    const n = Number(m[1].replace(',', '.'));
    return n > 0 ? n.toFixed(2) : '';
}

export interface EventoGerado { id: string; xml: string }
export interface EventosDoTrabalhador {
    cpf: string; nome: string; fichaIds: string[];
    s1200: EventoGerado | null; s1210: EventoGerado | null;
    /** S-3000 do S-1210 aceito no mês: vai antes do S-1200 e do S-1210. */
    exclusao1210: EventoGerado | null;
    liquido: number; erros: string[]; avisos: string[];
    /** O S-1200 que está valendo (vai como retificação) e o S-1210 aceito no mês do pagamento (excluído e reenviado). */
    retifica1200?: ReciboEvento; existente1210?: ReciboEvento;
    /** Pagamentos do S-1210 aceito que voltam no reenvio (não são desta folha). */
    outrosPagamentos: number;
}

/** indRetif 1 (original) ou 2 com o nrRecibo do evento que está valendo. */
const retif = (r?: ReciboEvento) => (r ? `<indRetif>2</indRetif><nrRecibo>${r.nrRecibo}</nrRecibo>` : '<indRetif>1</indRetif>');
const mes = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;

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
     * mês do pagamento é excluído e volta com todos os pagamentos.
     */
    retificacao?: { s1200: Map<string, ReciboEvento>; s1210: Map<string, ReciboEvento> };
    agora?: Date;
}

/**
 * Um S-1200 e um S-1210 por trabalhador (CPF), com um demonstrativo por
 * contrato. Quem tem erro fica sem evento, com o motivo.
 */
export function gerarEventosFolha(e: EntradaEventosFolha): { trabalhadores: EventosDoTrabalhador[]; erros: string[] } {
    const erros: string[] = [];
    const p = e.parametros;
    const estab = digitos(p.nrInscEstab);
    if (estab.length !== 14) erros.push('Informe o CNPJ do estabelecimento (14 dígitos).');
    if (!p.codLotacao.trim()) erros.push('Informe o código da lotação tributária (S-1020).');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(e.competencia)) erros.push('Competência inválida.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dataPagamento)) erros.push('Informe a data do pagamento.');
    if (erros.length) return { trabalhadores: [], erros };

    const porFicha = new Map(e.fichas.map(f => [f.id, f]));
    const tipoDa = new Map(e.rubricas.map(r => [`${r.ideTabRubr}|${r.codRubr}`, vigenciaEm(r, e.competencia)?.dados]));
    const grupos = new Map<string, { ficha: FichaFuncionario; r: ResultadoCalculo }[]>();
    for (const r of e.resultados) {
        const f = porFicha.get(r.fichaId);
        if (!f) continue;
        const cpf = digitos(f.cpf);
        grupos.set(cpf, [...(grupos.get(cpf) ?? []), { ficha: f, r }]);
    }
    const perPgto = e.dataPagamento.slice(0, 7);
    let seq = 0;
    const agora = e.agora ?? new Date();
    const trabalhadores: EventosDoTrabalhador[] = [];
    for (const [cpf, contratos] of grupos) {
        const t: EventosDoTrabalhador = { cpf, nome: contratos[0].r.nome, fichaIds: contratos.map(c => c.ficha.id), s1200: null, s1210: null, exclusao1210: null, liquido: 0, erros: [], avisos: [],
            retifica1200: e.retificacao?.s1200.get(cpf), existente1210: e.retificacao?.s1210.get(cpf), outrosPagamentos: 0 };
        trabalhadores.push(t);
        if (cpf.length !== 11) t.erros.push('CPF inválido na ficha.');
        const dmDevs: string[] = []; const pagamentos: string[] = []; const ides = new Set<string>();
        for (const { ficha: f, r } of contratos) {
            const quem = contratos.length > 1 ? ` (matrícula ${f.matriculaEsocial || '?'})` : '';
            if (r.situacao !== 'calculado') { t.erros.push(`Cálculo ${r.situacao === 'erro' ? 'com erro' : 'incompleto'}${quem}: ${[...r.erros, ...r.avisos].join(' ') || 'confira o holerite'}.`); continue; }
            if (!f.matriculaEsocial.trim()) t.erros.push(`Sem matrícula do eSocial na ficha${quem}.`);
            const categ = digitos(f.dados.categoria);
            if (!/^\d{3}$/.test(categ)) t.erros.push(`Categoria do eSocial (3 dígitos) em branco na ficha${quem}.`);
            if (r.totais.liquido < 0) t.erros.push(`Líquido negativo${quem}.`);
            // Itens por rubrica (a mesma rubrica não se repete no demonstrativo).
            const itens = new Map<string, { rub: RubricaEsocial; valor: number; qtd: number }>();
            for (const v of r.verbas) {
                if (v.valor <= 0) continue;
                const rub = p.rubricas[chaveVerba(v)];
                if (!rub) { t.erros.push(`"${v.descricao}" sem rubrica no de/para.`); continue; }
                const dados = tipoDa.get(`${rub.ideTabRubr}|${rub.codRubr}`);
                if (!dados) { t.erros.push(`Rubrica ${rub.codRubr} (de "${v.descricao}") sem S-1010 vigente em ${e.competencia}.`); continue; }
                // Provento só em rubrica de vencimento (1) e desconto só em rubrica de desconto (2); informativa (3, 4) não entra no líquido.
                const esperado = v.tipo === 'provento' ? '1' : '2';
                if (dados.tpRubr !== esperado) t.erros.push(`Rubrica ${rub.codRubr} é ${({ '1': 'provento', '2': 'desconto', '3': 'informativa', '4': 'informativa dedutora' } as Record<string, string>)[dados.tpRubr] ?? `tipo ${dados.tpRubr}`} no S-1010, e "${v.descricao}" é ${v.tipo}.`);
                const k = `${rub.ideTabRubr}|${rub.codRubr}`;
                const atual = itens.get(k) ?? { rub, valor: 0, qtd: 0 };
                atual.valor += v.valor; atual.qtd += Number(quantidade(v.referencia) || 0);
                itens.set(k, atual);
            }
            // Único por trabalhador: matrículas longas que coincidem nos primeiros caracteres ganham um sufixo.
            // Na retificação, o demonstrativo do original (o S-1210 aponta para ele).
            let ide = t.retifica1200?.demonstrativos?.[f.matriculaEsocial.trim()] ?? ideDmDev(e.competencia, f.matriculaEsocial.trim());
            if (t.retifica1200 && !t.retifica1200.demonstrativos?.[f.matriculaEsocial.trim()] && t.retifica1200.demonstrativos && Object.keys(t.retifica1200.demonstrativos).length)
                t.avisos.push(`A matrícula ${f.matriculaEsocial.trim()} não está no S-1200 original: vai num demonstrativo novo.`);
            for (let n = 2; ides.has(ide); n++) ide = `${ide.slice(0, 30 - String(n).length - 1)}-${n}`;
            ides.add(ide);
            dmDevs.push(`<dmDev><ideDmDev>${esc(ide)}</ideDmDev><codCateg>${categ}</codCateg><infoPerApur><ideEstabLot><tpInsc>1</tpInsc><nrInsc>${estab}</nrInsc><codLotacao>${esc(p.codLotacao.trim())}</codLotacao>`
                + `<remunPerApur><matricula>${esc(f.matriculaEsocial.trim())}</matricula>`
                + [...itens.values()].map(i => `<itensRemun><codRubr>${esc(i.rub.codRubr)}</codRubr><ideTabRubr>${esc(i.rub.ideTabRubr)}</ideTabRubr>${i.qtd > 0 ? `<qtdRubr>${i.qtd.toFixed(2)}</qtdRubr>` : ''}<vrRubr>${valor(i.valor)}</vrRubr></itensRemun>`).join('')
                + '</remunPerApur></ideEstabLot></infoPerApur></dmDev>');
            pagamentos.push(`<infoPgto><dtPgto>${e.dataPagamento}</dtPgto><tpPgto>1</tpPgto><perRef>${e.competencia}</perRef><ideDmDev>${esc(ide)}</ideDmDev><vrLiq>${valor(Math.max(0, r.totais.liquido))}</vrLiq></infoPgto>`);
            t.liquido += r.totais.liquido;
        }
        // O retificador substitui o S-1200 inteiro: demonstrativo do original que não está no cálculo some do eSocial.
        const faltando = new Set(Object.values(t.retifica1200?.demonstrativos ?? {}).filter(d => !ides.has(d)));
        if (faltando.size) t.avisos.push(`O S-1200 original tem demonstrativo(s) que este cálculo não gera (${[...faltando].join(', ')}, por exemplo férias ou outro contrato): a retificação os retira. Confira antes de transmitir.`);
        // S-1210 já aceito no mês: volta com os pagamentos que não são desta folha (os desta folha são substituídos).
        const ex = t.existente1210;
        const outros: string[] = [];
        if (ex && !ex.pagamentos) {
            t.erros.push(`Já há S-1210 de ${mes(perPgto)} aceito (recibo ${ex.nrRecibo}, ${ex.origem}): ele ${ex.excluidoEm ? 'foi excluído e volta' : 'é excluído e volta'} com todos os pagamentos do mês. Carregue o download do eSocial com esse S-1210 (ou a cópia salva na exclusão).`);
        } else if (ex) {
            for (const pg of ex.pagamentos!) {
                const desta = pg.tpPgto === '1' && pg.perRef === e.competencia;
                if (desta && ides.has(pg.ideDmDev)) continue;
                if (desta && faltando.has(pg.ideDmDev)) { t.erros.push(`O S-1210 aceito paga o demonstrativo ${pg.ideDmDev}, que a retificação do S-1200 retira: o reenvio seria recusado. Inclua esse pagamento no cálculo ou acerte pelo IOB.`); continue; }
                outros.push(pg.xml);
            }
            t.outrosPagamentos = outros.length;
        }
        else if (t.retifica1200) t.avisos.push(`Nenhum S-1210 de ${mes(perPgto)} carregado: se o pagamento desta folha já foi informado (inclusive em outro mês), carregue o download com ele; o eSocial recusa retificar o S-1200 enquanto um S-1210 aponta para ele.`);
        if (t.erros.length || !dmDevs.length) continue;
        // Deduções do IRRF (dependentes) quando o motor não usou o desconto simplificado.
        const irCR: string[] = [];
        for (const { r } of contratos) {
            const d = r.deducoesIrrf;
            if (!d || d.simplificado) continue;
            for (const dep of d.dependentes) {
                const cpfDep = digitos(dep.cpf);
                if (cpfDep.length !== 11) { t.avisos.push(`Dependente ${dep.nome || '?'} sem CPF: a dedução não vai no S-1210.`); continue; }
                if (d.porDependente > 0) irCR.push(`<dedDepen><tpRend>11</tpRend><cpfDep>${cpfDep}</cpfDep><vlrDedDep>${valor(d.porDependente)}</vlrDedDep></dedDepen>`);
            }
            if (d.pensao > 0) t.avisos.push('Pensão alimentícia deduzida no IRRF: o CPF do alimentando (penAlim) não está na ficha e não vai no S-1210; confira antes de transmitir.');
        }
        const raiz = digitos(e.cnpj).slice(0, 8);
        const ideEmpregador = `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz}</nrInsc></ideEmpregador>`;
        const id1200 = idEvento(e.cnpj, agora, ++seq);
        t.s1200 = { id: id1200, xml: `<eSocial xmlns="${NS}/evtRemun/${VERSAO}"><evtRemun Id="${id1200}">`
            + `<ideEvento>${retif(t.retifica1200)}<indApuracao>1</indApuracao><perApur>${e.competencia}</perApur><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
            + ideEmpregador + `<ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador>` + dmDevs.join('') + '</evtRemun></eSocial>' };
        if (ex && !ex.excluidoEm) {
            const id3000 = idEvento(e.cnpj, agora, ++seq);
            t.exclusao1210 = { id: id3000, xml: `<eSocial xmlns="${NS}/evtExclusao/${VERSAO}"><evtExclusao Id="${id3000}">`
                + `<ideEvento><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>` + ideEmpregador
                + `<infoExclusao><tpEvento>S-1210</tpEvento><nrRecEvt>${ex.nrRecibo}</nrRecEvt><ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador><ideFolhaPagto><perApur>${perPgto}</perApur></ideFolhaPagto></infoExclusao>`
                + '</evtExclusao></eSocial>' };
        }
        // As informações de IR do S-1210 aceito (dependentes, pensão, plano de saúde…) voltam como estavam.
        const ir = ex?.irComplem?.length ? ex.irComplem.join('') : irCR.length ? `<infoIRComplem><infoIRCR><tpCR>056107</tpCR>${irCR.join('')}</infoIRCR></infoIRComplem>` : '';
        if (ex?.irComplem?.length && irCR.length) t.avisos.push('As deduções do IRRF voltam como estavam no S-1210 aceito; confira se os dependentes mudaram.');
        const id1210 = idEvento(e.cnpj, agora, ++seq);
        t.s1210 = { id: id1210, xml: `<eSocial xmlns="${NS}/evtPgtos/${VERSAO}"><evtPgtos Id="${id1210}">`
            + `<ideEvento><indRetif>1</indRetif><perApur>${perPgto}</perApur><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
            + ideEmpregador + `<ideBenef><cpfBenef>${cpf}</cpfBenef>` + outros.join('') + pagamentos.join('') + ir
            + '</ideBenef></evtPgtos></eSocial>' };
    }
    trabalhadores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { trabalhadores, erros };
}

/** Lotes de até 50 eventos (limite do envio em lote do eSocial). */
export function emLotes<T>(lista: T[], tamanho = 50): T[][] {
    const r: T[][] = [];
    for (let i = 0; i < lista.length; i += tamanho) r.push(lista.slice(i, i + tamanho));
    return r;
}
