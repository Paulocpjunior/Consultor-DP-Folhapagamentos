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
import { quintoDiaUtilSalario } from '../prazos/calendario';
import { calcularFerias, parteDaCompetencia, type OpcoesFerias, type ResultadoFerias } from '../calculo/motorFerias';
import { depNoEsocial, ratearPensao, type FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import type { TabelaLegal } from '../cadastros/tabelasLegais';
import type { Dependente } from '../implantacao/unificacao';
import { BASE_CP, BASE_FGTS, COD_INC_CP, PAGO_PELO_INSS, COD_INC_FGTS, classeIrrf, rotuloCodigo, rotuloIrrf, vigenciaEm, type Rubrica } from '../cadastros/rubricas';
import { diaUtilAnterior } from '../prazos/calendario';
import { cpfValido, reais } from '../cadastros/documentos';
import { idEvento, VER_PROC, type TpAmb } from './transmissao';
import type { ReciboEvento } from './recibosEsocial';
import type { Instrumento, ResultadoComplementar } from '../calculo/complementar';
import { diaDoPeriodo, estabelecimentoNoDia } from '../cadastros/locaisTrabalho';
import { estabelecimentoDa, ehObraPropria, type Lotacao } from '../obras/lotacoes';
import { principal, repartir } from '../obras/folhaPorObra';

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
    /**
     * Só no Simples com a CPP substituída e não substituída ao mesmo tempo (classTrib 03): indSimples do S-1200
     * (1 substituída, 2 não substituída, 3 as duas). Nas demais classificações não vai.
     */
    indSimples?: '' | '1' | '2' | '3';
    /**
     * Filiais com lotação própria: o código da lotação (S-1020) de cada estabelecimento. Quem trabalha num estabelecimento
     * fora desta lista usa a lotação acima.
     */
    estabelecimentos?: { nrInsc: string; codLotacao: string }[];
}

/** Lotação tributária de quem trabalha no estabelecimento: a da filial, se houver, senão a dos parâmetros. */
export const lotacaoDoEstabelecimento = (p: ParametrosEsocialFolha, estab: string) =>
    (p.estabelecimentos?.find(x => digitos(x.nrInsc) === digitos(estab))?.codLotacao ?? '').trim() || p.codLotacao.trim();

/**
 * Estabelecimento do vínculo no período (o local de trabalho da ficha na data: services/cadastros/locaisTrabalho.ts);
 * sem ele na ficha, o dos parâmetros.
 */
export const estabelecimentoDoVinculo = (f: Pick<FichaFuncionario, 'dados' | 'locais'>, p: ParametrosEsocialFolha, competencia: string) => {
    const e = digitos(estabelecimentoNoDia(f, diaDoPeriodo(f, competencia)));
    return e.length === 14 ? e : digitos(p.nrInscEstab);
};
export const parametrosVazios = (cnpj = ''): ParametrosEsocialFolha => ({ nrInscEstab: cnpj.replace(/\D/g, ''), codLotacao: '', rubricas: {} });

const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const valor = (c: number) => (c / 100).toFixed(2);
export const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9%]+/g, ' ').trim();

/** Chave da verba no de/para: o código do motor; lançamento avulso, pela descrição. */
/** Grupo descFolha do Crédito do Trabalhador (T_descFolha do XSD S-1.3): tpDesc 1 (eConsignado), instituição e contrato. */
export function descFolhaXml(d: Verba['descFolha']): string {
    if (!d) return '';
    return `<descFolha><tpDesc>1</tpDesc><instFinanc>${esc(d.instFinanc)}</instFinanc><nrDoc>${esc(d.nrDoc)}</nrDoc>${d.observacao ? `<observacao>${esc(d.observacao)}</observacao>` : ''}</descFolha>`;
}

/** O desconto do consignado precisa de rubrica de natureza 9253, e a 9253 só serve ao consignado (com o descFolha). */
export function erroDescFolha(v: Pick<Verba, 'descricao' | 'descFolha'>, codRubr: string, natRubr: string | undefined): string {
    if (v.descFolha && natRubr !== '9253') return `"${v.descricao}" é desconto do Crédito do Trabalhador: a rubrica ${codRubr} precisa ter a natureza 9253 no S-1010 (tem ${natRubr || 'outra'}). Acerte o de/para.`;
    if (!v.descFolha && natRubr === '9253') return `Rubrica ${codRubr} (natureza 9253, consignado) usada em "${v.descricao}", que não é desconto de contrato do Crédito do Trabalhador: o eSocial exige o contrato (descFolha). Lance o contrato na ficha ou acerte o de/para.`;
    return '';
}

export const chaveVerba = (v: Pick<Verba, 'codigo' | 'descricao'>) => (/^LAN\d+$/.test(v.codigo) ? `LAN:${normalizar(v.descricao)}` : v.codigo);

/** Natureza (Tabela 03) e tipo (1 = provento, 2 = desconto) que cada verba do motor deve ter no S-1010. */
export const SUGESTAO: Record<string, { naturezas: string[]; dica?: RegExp; evita?: RegExp; codigos?: string[] }> = {
    SAL: { naturezas: ['1000'] },
    // Intermitente (CLT, art. 452-A, § 6º): horas, DSR, férias proporcionais com 1/3 e 13º proporcional da convocação.
    INTERM: { naturezas: ['1000'], dica: /INTERMIT/ },
    DSRINT: { naturezas: ['1012'], dica: /INTERMIT/ },
    FERINT: { naturezas: ['1016'], dica: /INTERMIT/, evita: /1\/3|TERCO/ },
    FERINT13: { naturezas: ['1017'], dica: /INTERMIT|1\/3|TERCO/ },
    '13INT': { naturezas: ['5001'], dica: /INTERMIT|PROP/ },
    // Tabela 03: 1202 adicional de insalubridade, 1203 adicional de periculosidade (item 3b).
    INSALUB: { naturezas: ['1202'] },
    PERICUL: { naturezas: ['1203'] },
    MAT: { naturezas: ['4050'] },
    // Salário-paternidade (Lei 15.371/2026; Tabela 03, natureza 4052 a partir de 12/2026).
    PAT: { naturezas: ['4052'] },
    HE50: { naturezas: ['1003'], evita: /100/ },
    HE100: { naturezas: ['1003'], dica: /100/ },
    DSRHE: { naturezas: ['1012'], dica: /EXTRA|\bHE\b/ },
    // Falta em dias: a rubrica de horas/atrasos (5850) fica para ATRASO, senão as duas empatam (Codex #120).
    FALTA: { naturezas: ['9207'], evita: /DSR|REPOUSO|ATRAS|\bT H\b|HORA/ },
    DSRF: { naturezas: ['9207'], dica: /DSR|REPOUSO/ },
    // Faltas e atrasos em horas: no IOB, o evento 5850 "FALTAS E ATRASOS (T/H)".
    // Natureza 9207 ou 9211 (a que o histórico do IOB também lê como falta; Codex #120).
    // 13º: a 1ª parcela no S-1200 do mês do pagamento (5504, só FGTS); no anual, o 13º (5001), o desconto do adiantamento
    // (9214) e o INSS e o IRRF do 13º (as mesmas naturezas da folha, pela descrição).
    '13A': { naturezas: ['5504'] },
    '13': { naturezas: ['5001'] },
    '13ADT': { naturezas: ['9214'] },
    INSS13: { naturezas: ['9201'], dica: /13/ },
    IRRF13: { naturezas: ['9203'], dica: /13/ },
    ATRASO: { naturezas: ['9207', '9211'], dica: /ATRAS|\bT H\b|HORA/, evita: /DSR|REPOUSO/, codigos: ['5850'] },
    INSS: { naturezas: ['9201'], evita: /13|FERIAS/ },
    IRRF: { naturezas: ['9203'], evita: /13|FERIAS/ },
    SF: { naturezas: ['1409'] },
    PENSAO: { naturezas: ['9213'] },
    PENSAO13: { naturezas: ['9213'] },
    PENSAOFER: { naturezas: ['9213'] },
    // Crédito do Trabalhador (consignado CLT): natureza 9253, com o grupo descFolha.
    CONSIG: { naturezas: ['9253'] },
    // Adiantamento salarial: no demonstrativo próprio, a rubrica de provento do adiantamento (a natureza varia
    // no S-1010 de cada empresa: vai pela descrição); na folha, o desconto (9200). Vale-transporte: 9216.
    // Só adiantamento de salário (ou "vale", "quinzena"): comissão, gorjeta, férias e 13º têm rubricas próprias (Codex #115).
    ADIANTPAG: { naturezas: [], dica: /ADIANT.*\b(SAL|VALE|QUINZ)/, evita: /FERIAS|13|COMISS|GORJ/ },
    ADIANT: { naturezas: ['9200'] },
    VT: { naturezas: ['9216'] },
    // Arredondamento do líquido: a natureza varia no S-1010 de cada empresa; vai pela descrição, como no IOB
    // ("ARREDONDAMENTO ATUAL", "ARREDONDAMENTO ANTERIOR", "DESC. ARREDONDAMENTO ADIANTAMENTO"), também truncada como
    // no catálogo ("ARREDONDAMENTO ATUA", "ARREDONDAMENTO ANTE", "DESC. ARREDONDAMENT"), ou pelo código do evento do IOB
    // como código da rubrica (1480, 5660 e 8951; Codex #116).
    ARREDATU: { naturezas: [], dica: /ARRED.*\bATU/, codigos: ['1480'] },
    ARREDANT: { naturezas: [], dica: /ARRED.*\bANT/, codigos: ['5660'] },
    ARREDADI: { naturezas: [], dica: /ARRED.*ADIANT/, codigos: ['8951'] },
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
    // Folha complementar: 13º complementar (5005, MOS S-1200, item 19.2), diferença do 13º e as verbas rescisórias de quem
    // saiu antes do instrumento (MOS, item 18.10), nas mesmas naturezas da rescisão.
    // Descontos para o sindicato: a natureza varia no S-1010 de cada empresa; vai pela descrição da rubrica.
    CONTSIND: { naturezas: [], dica: /SINDIC/, evita: /ASSIST|NEGOC|CONFED|MENSAL|ASSOCIA|PATRON/ },
    CONTASSIST: { naturezas: [], dica: /ASSIST|NEGOC/ },
    CONTCONF: { naturezas: [], dica: /CONFED/ },
    MENSSIND: { naturezas: [], dica: /MENSAL.*SIND|SIND.*MENSAL|ASSOCIA/ },
    '13COMP': { naturezas: ['5005'] },
    '13DIF': { naturezas: ['5001', '5005'] },
    // Complementar tipo E: rubrica informativa só com FGTS (MOS, S-1200, item 18.8); o MOS não fixa a natureza, a descrição aponta.
    FGTSAC: { naturezas: [], dica: /ACIDENT|AUX.*DOEN|INCAPACIDADE/ },
    // Serviço militar obrigatório: rubrica informativa, natureza 9905 no exemplo do MOS (S-1200, item 36.1).
    FGTSSM: { naturezas: ['9905'] },
    AVISO: { naturezas: ['6003'], dica: /AVISO/, evita: /DESC|13|FERIAS/ },
    ART479: { naturezas: ['6104'] },
    ART480: { naturezas: ['6904'], dica: /480/ },
    INSUFSALDO: { naturezas: ['2930'], dica: /INSUFIC/ },
    '13PROP': { naturezas: ['6002'] },
    '13IND': { naturezas: ['6001'] },
    FV: { naturezas: ['6007'], evita: /\b1 3\b|TERCO|DOBR/ },
    FVD: { naturezas: ['6004'], evita: /\b1 3\b|TERCO/ },
    FP: { naturezas: ['6006'], evita: /\b1 3\b|TERCO/ },
    FV13: { naturezas: [], dica: /(\b1 3\b|TERCO).*VENC|VENC.*(\b1 3\b|TERCO)/, evita: /DOBR/ },
    FVD13: { naturezas: [], dica: /DOBR.*(\b1 3\b|TERCO)|(\b1 3\b|TERCO).*DOBR/ },
    FP13: { naturezas: [], dica: /(\b1 3\b|TERCO).*PROP|PROP.*(\b1 3\b|TERCO)/ },
};

const IRRF_FERIAS_DO_GOZO = new Set(['FERMES', 'FERMES13', 'FERPAGO']);

/** Retido no recibo de férias, na folha do gozo × retido no próprio recibo: rubricas distintas (senão o tributo vai em dobro). */
const PARES_FERIAS: [string, string][] = [['INSSFERRET', 'INSSFER'], ['IRRFFERRET', 'IRRFFER']];

/** Naturezas que o MOS (S-1010, item 23, opção 1) fixa para as verbas de férias. */
export const NATUREZA_MOS: Record<string, string> = { FERMES: '1016', FERMES13: '1017', FERPAGO: '9221', FERADI: '1015', FERADI13: '1015' };

export interface ItemDePara { chave: string; descricao: string; tipo: 'provento' | 'desconto' | 'informativa'; sugestao: RubricaEsocial | null }

/** Verbas dos resultados que precisam de rubrica, com a sugestão pela natureza, pelo tipo e pela descrição. */
export function sugerirDePara(resultados: ResultadoCalculo[], rubricas: Rubrica[], competencia: string): ItemDePara[] {
    const vigentes = rubricas.map(r => ({ r, v: vigenciaEm(r, competencia) })).filter(x => x.v);
    const itens = new Map<string, ItemDePara>();
    for (const res of resultados) for (const v of [...res.verbas, ...(res.verbasInformativas ?? [])]) {
        const chave = chaveVerba(v);
        if (itens.has(chave) || v.valor <= 0) continue;
        const tp = v.informativa ? '3' : v.tipo === 'provento' ? '1' : '2';
        const doTipo = vigentes.filter(x => x.v!.dados.tpRubr === tp);
        // Hora extra com outro adicional (HE60, HE75…): natureza 1003, pelo percentual na descrição.
        const outraHe = /^HE\d+(_\d+)?$/.test(v.codigo) && !SUGESTAO[v.codigo] ? v.codigo.slice(2).replace('_', '.') : '';
        const s = SUGESTAO[v.codigo] ?? (outraHe ? { naturezas: ['1003'], dica: new RegExp(`\\b${outraHe.replace('.', '[.,]')}\\b`) } : undefined);
        // Sem natureza na sugestão, só a descrição (dica) aponta a rubrica.
        let cand = !s ? doTipo.filter(x => normalizar(x.v!.dados.dscRubr) === normalizar(v.descricao))
            : s.naturezas.length ? doTipo.filter(x => s.naturezas.includes(x.v!.dados.natRubr))
                // Só pela descrição: a dica precisa casar e o que se evita (férias, 13º) nunca entra, nem sozinho (Codex #115).
                : doTipo.filter(x => (s.dica!.test(normalizar(x.v!.dados.dscRubr)) || !!s.codigos?.includes(x.r.codRubr.replace(/^0+/, ''))) && !s.evita?.test(normalizar(x.v!.dados.dscRubr)));
        if (s?.dica && cand.some(x => s.dica!.test(normalizar(x.v!.dados.dscRubr)))) cand = cand.filter(x => s.dica!.test(normalizar(x.v!.dados.dscRubr)));
        if (s?.evita && cand.some(x => !s.evita!.test(normalizar(x.v!.dados.dscRubr)))) cand = cand.filter(x => !s.evita!.test(normalizar(x.v!.dados.dscRubr)));
        const r = cand.length === 1 ? cand[0].r : null;
        itens.set(chave, { chave, descricao: v.descricao, tipo: v.informativa ? 'informativa' : v.tipo, sugestao: r ? { codRubr: r.codRubr, ideTabRubr: r.ideTabRubr } : null });
    }
    // O retido no recibo de férias (na folha do gozo) e o do próprio recibo não podem cair na mesma rubrica: o INSS e o
    // IRRF iriam em dobro ao eSocial. Com a mesma sugestão, a da folha fica para a equipe escolher.
    for (const [folha, recibo] of PARES_FERIAS) {
        const a = itens.get(folha)?.sugestao; const b = itens.get(recibo)?.sugestao;
        if (a && b && a.codRubr === b.codRubr && a.ideTabRubr === b.ideTabRubr) itens.set(folha, { ...itens.get(folha)!, sugestao: null });
    }
    return [...itens.values()];
}

/** Identificador do demonstrativo: o mesmo no S-1200 e no S-1210. No anual (AAAA), o do 13º. */
export const ideDmDev = (perApur: string, matricula: string) => `${/^\d{4}$/.test(perApur) ? `13SAL${perApur}` : `FOLHA${perApur.replace('-', '')}`}-${matricula}`.slice(0, 30);
/** Demonstrativo da 1ª parcela do 13º no S-1200 do mês em que foi paga. */
export const ideDmDev13Adiantamento = (ano: string, matricula: string) => `13ADI${ano}-${matricula}`.slice(0, 30);
/** Demonstrativo do adiantamento salarial da competência (MOS S-1200, item 3.4: parcela paga em data própria). */
export const ideDmDevAdiantamento = (perApur: string, matricula: string) => `ADI${perApur.replace('-', '')}-${matricula}`.slice(0, 30);
export { dataSugeridaAdiantamento };
/** Verbas do demonstrativo do adiantamento: o valor, como provento, e o arredondamento dele (sem INSS, FGTS e IRRF; o IRRF é na folha). */
export const verbasDoAdiantamento = (r: Pick<ResultadoCalculo, 'verbas' | 'irrfAdiantamento'>): Verba[] => {
    const v = adiantamentoDoMes(r);
    const ref = r.verbas.find(x => x.codigo === 'ADIANT')?.referencia ?? '';
    const arred = arredondamentoDoAdiantamento(r);
    const ir = r.irrfAdiantamento ?? 0;
    return v > 0 ? [{ codigo: 'ADIANTPAG', descricao: 'Adiantamento salarial (pagamento)', referencia: ref, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false },
        // Saldo da folha em outro mês: o IRRF do adiantamento é retido nele, na mesma rubrica do IRRF da folha (IOB 08/2026).
        ...(ir ? [{ codigo: 'IRRF', descricao: 'IRRF do adiantamento', referencia: '', tipo: 'desconto' as const, valor: ir, inss: false, fgts: false, irrf: false }] : []),
        ...(arred ? [{ codigo: 'ARREDATU', descricao: 'Arredondamento atual', referencia: '', tipo: 'provento' as const, valor: arred, inss: false, fgts: false, irrf: false }] : [])] : [];
};
/** O que o demonstrativo do adiantamento paga: o adiantamento, menos o IRRF dele, mais o arredondamento. */
export const pagoNoAdiantamento = (r: Pick<ResultadoCalculo, 'verbas' | 'irrfAdiantamento'>) => verbasDoAdiantamento(r).reduce((s, v) => s + (v.tipo === 'provento' ? v.valor : -v.valor), 0);
/** Para o de/para: a rubrica de provento do adiantamento, que não está nas verbas da folha. */
export const verbasDoAdiantamentoParaDePara = (resultados: ResultadoCalculo[]): ResultadoCalculo[] =>
    resultados.filter(r => r.situacao === 'calculado' && adiantamentoDoMes(r) > 0).map(r => ({ ...r, verbas: verbasDoAdiantamento(r) }));

/** Demonstrativo da folha complementar (infoPerAnt) escriturada na competência, pelo tipo do instrumento. */
export const ideDmDevComplementar = (perApur: string, tpAcConv: string, matricula: string, rra = false) => `COMP${perApur.replace('-', '')}${tpAcConv}${rra ? 'R' : ''}-${matricula}`.slice(0, 30);

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
export function quantidade(referencia: string): string {
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
const mes = (c: string) => (/^\d{4}$/.test(c) ? `13º de ${c}` : `${c.slice(5)}/${c.slice(0, 4)}`);
const quintoDiaUtilDe = (c: string) => quintoDiaUtilSalario(Number(c.slice(0, 4)), Number(c.slice(5, 7)));
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
    /** 1ª parcela do 13º paga na competência (calcular13, parcela 1ª), com a data do pagamento: demonstrativo próprio. */
    primeiraParcela13?: { r: ResultadoCalculo; dataPagamento: string }[];
    /**
     * Folhas complementares escrituradas nesta competência (diferenças de meses anteriores, no grupo infoPerAnt),
     * pagas com a folha: demonstrativo próprio, um {perRef} por mês de referência (MOS, S-1200, item 18).
     */
    complementares?: { instrumento: Instrumento; resultados: ResultadoComplementar[] }[];
    /**
     * Obras e lotações da empresa (Cadastros › Obras e lotações). Quem tem obra na ficha ou rateio no movimento sai com um
     * ideEstabLot por obra (proventos pelos dias, descontos na principal); obra própria com CNO, com o CNO como estabelecimento.
     */
    lotacoes?: Lotacao[];
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
    // Competência AAAA: o S-1200 anual do 13º (indApuracao 2), com a 2ª parcela nos resultados (calcular13).
    const anual = /^\d{4}$/.test(e.competencia);
    // Rendimento das deduções do IRRF no S-1210: 11 (folha mensal) ou 12 (13º).
    const tpRendFolha = anual ? '12' : '11';
    if (!anual && !/^\d{4}-(0[1-9]|1[0-2])$/.test(e.competencia)) erros.push('Competência inválida.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dataPagamento)) erros.push('Informe a data do pagamento.');
    const dataAdiant = e.dataAdiantamento || dataSugeridaAdiantamento(e.competencia);
    const comAdiantamento = e.resultados.some(r => adiantamentoDoMes(r) > 0);
    if (comAdiantamento && !/^\d{4}-\d{2}-\d{2}$/.test(dataAdiant)) erros.push('Informe a data do adiantamento salarial.');
    else if (comAdiantamento && /^\d{4}-\d{2}-\d{2}$/.test(e.dataPagamento) && dataAdiant > e.dataPagamento) erros.push('O adiantamento salarial é pago antes da folha: confira as datas.');
    if (erros.length) return { trabalhadores: [], erros, avisos };

    const porFicha = new Map(e.fichas.map(f => [f.id, f]));
    const tipoDa = new Map(e.rubricas.map(r => [`${r.ideTabRubr}|${r.codRubr}`, vigenciaEm(r, e.competencia)?.dados]));
    // r null: só a folha complementar (desligado, ou sem holerite no mês), com o demonstrativo das diferenças.
    const grupos = new Map<string, { ficha: FichaFuncionario; r: ResultadoCalculo | null }[]>();
    const agrupar = (f: FichaFuncionario, r: ResultadoCalculo | null) => { const cpf = digitos(f.cpf); grupos.set(cpf, [...(grupos.get(cpf) ?? []), { ficha: f, r }]); };
    for (const r of e.resultados) {
        const f = porFicha.get(r.fichaId);
        if (f) agrupar(f, r);
    }
    const soComplementar = new Set<string>();
    for (const c of e.complementares ?? []) for (const rc of c.resultados) {
        if (e.resultados.some(r => r.fichaId === rc.fichaId) || soComplementar.has(rc.fichaId)) continue;
        const f = porFicha.get(rc.fichaId);
        if (!f) { avisos.push(`Complementar de ${rc.nome}: ficha não encontrada, o demonstrativo não vai.`); continue; }
        soComplementar.add(rc.fichaId); agrupar(f, null);
    }
    const recibosDa = new Map<string, ReciboFeriasEsocial[]>();
    for (const x of e.recibosFerias ?? []) recibosDa.set(x.r.fichaId, [...(recibosDa.get(x.r.fichaId) ?? []), x]);
    for (const [fichaId, lista] of recibosDa) if (!e.resultados.some(r => r.fichaId === fichaId) && lista.some(x => x.dataPagamento.slice(0, 7) === e.competencia))
        avisos.push(`Recibo de férias de ${lista[0].r.nome} pago em ${mes(e.competencia)} sem a folha do mês calculada: o demonstrativo dele não vai.`);
    const perPgto = e.dataPagamento.slice(0, 7);
    const agora = e.agora ?? new Date();
    // O Id leva o segundo da geração e um sequencial. Começar pelo milésimo evita o mesmo Id em duas gerações no
    // mesmo segundo (ex.: o S-3000 e, gerado de novo depois, o S-1210 do mesmo trabalhador) — o pré-voo barraria.
    let seq = e.agora ? 0 : agora.getMilliseconds() * 10;
    const raiz = digitos(e.cnpj).slice(0, 8);
    const ideEmpregador = `<ideEmpregador><tpInsc>1</tpInsc><nrInsc>${raiz}</nrInsc></ideEmpregador>`;
    const trabalhadores: EventosDoTrabalhador[] = [];
    // Férias: o retido no recibo vai no demonstrativo dele (INSSFER, IRRFFER) e de novo, como desconto, na folha do gozo
    // (INSSFERRET, IRRFFERRET). Só um dos dois pode recolher: senão o INSS e o IRRF vão em dobro ao eSocial.
    const errosFerias = new Map<string, string>();
    const daRubrica = (chave: string) => { const rub = p.rubricas[chave]; return rub ? { rub, dados: tipoDa.get(`${rub.ideTabRubr}|${rub.codRubr}`) } : undefined; };
    for (const [folha, recibo] of PARES_FERIAS) {
        const a = daRubrica(folha); const b = daRubrica(recibo);
        const tributo = folha.startsWith('INSS') ? 'INSS' : 'IRRF';
        let msg = '';
        if (a && b && a.rub.codRubr === b.rub.codRubr && a.rub.ideTabRubr === b.rub.ideTabRubr)
            msg = `A rubrica ${a.rub.codRubr} está no de/para do ${tributo} do recibo de férias e do ${tributo} das férias na folha do gozo: o ${tributo} iria em dobro ao eSocial. Use rubricas distintas (a da folha sem recolhimento).`;
        else if (tributo === 'INSS' && a?.dados?.codIncCP === '31' && b?.dados?.codIncCP === '31')
            msg = `As rubricas ${b.rub.codRubr} (INSS do recibo de férias) e ${a.rub.codRubr} (INSS das férias na folha do gozo) têm codIncCP 31: a contribuição iria em dobro. O INSS das férias é da folha do gozo: no S-1010, a do recibo fica sem incidência (00).`;
        else if (tributo === 'IRRF' && a?.dados && classeIrrf(a.dados.codIncIRRF) === 'retencao')
            msg = `A rubrica ${a.rub.codRubr} (IRRF das férias na folha do gozo) tem codIncIRRF ${a.dados.codIncIRRF} (retenção): o IRRF das férias é retido no recibo e iria em dobro. No S-1010, use uma rubrica sem retenção (por exemplo, 09) para o desconto na folha.`;
        if (msg) { errosFerias.set(folha, msg); errosFerias.set(recibo, msg); }
    }
    // Incidências do cálculo × S-1010: aviso uma vez por rubrica e tributo. O adiantamento de férias (natureza 1015) não é
    // base do INSS nem do FGTS no recibo (a base é a folha do gozo); o IRRF do adiantamento salarial varia com o mês do saldo.
    const avisosIncidencia = new Set<string>();
    const avisosLotacao = new Set<string>();
    const semGrauExp: string[] = [];
    const INC_RECIBO: Record<string, { inss?: boolean; fgts?: boolean }> = { FERADI: { inss: false, fgts: false }, FERADI13: { inss: false, fgts: false } };
    const conferirIncidencia = (v: Verba, rub: RubricaEsocial, d: { codIncCP: string; codIncFGTS: string; codIncIRRF: string }) => {
        const esperado = { inss: v.inss, fgts: v.fgts, ...INC_RECIBO[v.codigo] };
        const avisar = (tributo: string, calculo: boolean, rotulo: string) => {
            const k = `${rub.ideTabRubr}|${rub.codRubr}|${tributo}`;
            if (avisosIncidencia.has(k)) return;
            avisosIncidencia.add(k);
            avisos.push(`Rubrica ${rub.codRubr} ("${v.descricao}"): o cálculo ${calculo ? 'soma' : 'não soma'} à base do ${tributo}, e no S-1010 ela está como ${rotulo}. Confira o de/para ou o S-1010.`);
        };
        if (!/^9\d$/.test(d.codIncCP) && !PAGO_PELO_INSS.includes(d.codIncCP) && BASE_CP.includes(d.codIncCP) !== esperado.inss) avisar('INSS', esperado.inss, rotuloCodigo(COD_INC_CP, d.codIncCP, 'tabela'));
        if (!/^9\d$/.test(d.codIncFGTS) && BASE_FGTS.includes(d.codIncFGTS) !== esperado.fgts) avisar('FGTS', esperado.fgts, rotuloCodigo(COD_INC_FGTS, d.codIncFGTS, 'tabela'));
        const cls = classeIrrf(d.codIncIRRF);
        // Férias na folha do gozo: o MOS (S-1200, item 19) põe IRRF 13 nas férias, no 1/3 e no desconto do que foi
        // pago no recibo (1016, 1017 e 9221), que se anulam; o IRRF das férias é o do recibo.
        if (IRRF_FERIAS_DO_GOZO.has(v.codigo) && Number(d.codIncIRRF) === 13) return;
        if (v.codigo !== 'ADIANTPAG' && cls !== 'suspensa' && cls !== 'outra' && (cls === 'tributavel') !== v.irrf) avisar('IRRF', v.irrf, rotuloIrrf(d.codIncIRRF));
    };
    for (const [cpf, contratos] of grupos) {
        const t: EventosDoTrabalhador = { cpf, nome: contratos[0].r?.nome ?? (contratos[0].ficha.dados.nome || cpf), fichaIds: contratos.map(c => c.ficha.id), s1200: null, liquido: 0, erros: [], avisos: [],
            retifica1200: e.retificacao?.s1200.get(cpf), perApur: perPgto, s1210: null, exclusao1210: null, existente1210: e.retificacao?.s1210.get(cpf), outrosPagamentos: 0,
            outrosMeses: [], recibosFerias: 0 };
        trabalhadores.push(t);
        if (!cpfValido(cpf)) t.erros.push('CPF inválido na ficha.');
        const errosFeriasDele = new Set<string>();
        const dmDevs: string[] = []; const pagamentos: { mes: string; xml: string }[] = []; const ides = new Set<string>();
        // Intermitente: dias trabalhados no mês (ideTrabalhador/infoInterm, obrigatório para a categoria 111).
        const diasInterm = new Map<number, number>();
        // Dedução de dependentes no IRRF das férias (tpRend 13), no S-1210 do mês de cada recibo.
        const dedFerias = new Map<string, Map<string, number>>(); const infoDepFerias = new Map<string, Map<string, Dependente>>();
        // Pensão alimentícia descontada nos recibos de férias (tpRend 13), por mês do pagamento e alimentando.
        const penFerias = new Map<string, Map<string, number>>();
        const unico = (base: string) => { let ide = base; for (let n = 2; ides.has(ide); n++) ide = `${base.slice(0, 30 - String(n).length - 1)}-${n}`; ides.add(ide); return ide; };
        const avisoNatureza = new Set<string>();
        /** Itens por rubrica (a mesma rubrica não se repete no demonstrativo). */
        const itensDe = (verbas: Verba[]) => {
            const itens = new Map<string, { rub: RubricaEsocial; valor: number; qtd: number; descFolha?: Verba['descFolha'] }>();
            for (const v of verbas) {
                if (v.valor <= 0) continue;
                const rub = p.rubricas[chaveVerba(v)];
                if (!rub) { t.erros.push(`"${v.descricao}" sem rubrica no de/para.`); continue; }
                const dados = tipoDa.get(`${rub.ideTabRubr}|${rub.codRubr}`);
                if (!dados) { t.erros.push(`Rubrica ${rub.codRubr} (de "${v.descricao}") sem S-1010 vigente em ${e.competencia}.`); continue; }
                const emDobro = errosFerias.get(v.codigo);
                if (emDobro && !errosFeriasDele.has(emDobro)) { errosFeriasDele.add(emDobro); t.erros.push(emDobro); }
                conferirIncidencia(v, rub, dados);
                // Provento só em rubrica de vencimento (1) e desconto só em rubrica de desconto (2); informativa (3, 4) não entra no líquido.
                // Natureza que o MOS fixa para as férias (S-1010, item 23, opção 1). FERMES era férias + 1/3 em 1020
                // antes do #111: o de/para gravado assim mudou de sentido e precisa ser refeito (Codex #111).
                const nat = NATUREZA_MOS[v.codigo];
                if (nat && dados.natRubr !== nat) {
                    if (v.codigo === 'FERMES' && dados.natRubr === '1020') t.erros.push(`O de/para de "${v.descricao}" é anterior à separação de férias e 1/3: a rubrica ${rub.codRubr} tem natureza 1020. Refaça o de/para das férias do mês (férias em 1016, 1/3 em 1017) e grave.`);
                    else if (!avisoNatureza.has(v.codigo)) { avisoNatureza.add(v.codigo); t.avisos.push(`Rubrica ${rub.codRubr} (natureza ${dados.natRubr}) para "${v.descricao}": o MOS (S-1010, item 23) indica ${nat}. Confira o de/para.`); }
                }
                const esperado = v.informativa ? '3' : v.tipo === 'provento' ? '1' : '2';
                if (dados.tpRubr !== esperado) t.erros.push(`Rubrica ${rub.codRubr} é ${({ '1': 'provento', '2': 'desconto', '3': 'informativa', '4': 'informativa dedutora' } as Record<string, string>)[dados.tpRubr] ?? `tipo ${dados.tpRubr}`} no S-1010, e "${v.descricao}" é ${v.informativa ? 'informativa' : v.tipo}.`);
                // Crédito do Trabalhador: rubrica de natureza 9253 com o grupo descFolha, e só ela (XSD S-1.3, CONDICAO_GRUPO).
                const erroConsig = erroDescFolha(v, rub.codRubr, dados.natRubr);
                if (erroConsig) t.erros.push(erroConsig);
                // Um item por contrato: cada um leva a sua instituição e o seu número.
                const k = `${rub.ideTabRubr}|${rub.codRubr}${v.descFolha ? `|${v.descFolha.instFinanc}|${v.descFolha.nrDoc}` : ''}`;
                const atual = itens.get(k) ?? { rub, valor: 0, qtd: 0, ...(v.descFolha ? { descFolha: v.descFolha } : {}) };
                atual.valor += v.valor; atual.qtd += Number(quantidade(v.referencia) || 0);
                itens.set(k, atual);
            }
            return [...itens.values()];
        };
        /**
         * Os itens por obra: sem obras, a lotação dos parâmetros; com obras, os proventos pelos dias e os descontos na
         * principal. `soPrincipal`: tudo na obra principal (adiantamento, 1ª parcela do 13º, recibo de férias).
         */
        const gruposDe = (itens: ReturnType<typeof itensDe>, f: FichaFuncionario, r: Pick<ResultadoCalculo, 'lotacoes' | 'estabelecimentos'> | undefined, soPrincipal = false) => {
            const lot = r?.lotacoes;
            // Estabelecimento do vínculo no mês (o da ficha); no mês da troca, os dois, pelos dias (sem obras).
            const doVinculo = estabelecimentoDoVinculo(f, p, e.competencia);
            const estabs = !lot?.length && (r?.estabelecimentos?.length ?? 0) > 1 ? r!.estabelecimentos!.map(x => ({ codigo: x.estab, peso: x.peso })) : null;
            if (!lot?.length && !estabs) return [{ tpInsc: '1', nrInsc: doVinculo, cod: lotacaoDoEstabelecimento(p, doVinculo), itens }];
            const base = (lot?.length ? lot : estabs)!;
            const usar = soPrincipal ? [base[principal(base)]] : base;
            const grupos = usar.map(l => {
                if (estabs) return { tpInsc: '1', nrInsc: l.codigo, cod: lotacaoDoEstabelecimento(p, l.codigo), itens: [] as typeof itens };
                const cad = e.lotacoes?.find(x => x.codigo === l.codigo);
                const est = cad ? estabelecimentoDa(cad, doVinculo) : { tpInsc: '1' as const, nrInsc: doVinculo };
                return { tpInsc: est.tpInsc as string, nrInsc: est.nrInsc, cod: l.codigo, itens: [] as typeof itens };
            });
            const pr = principal(usar);
            for (const i of itens) {
                const provento = tipoDa.get(`${i.rub.ideTabRubr}|${i.rub.codRubr}`)?.tpRubr === '1';
                if (!provento || grupos.length === 1) { grupos[provento ? 0 : pr].itens.push(i); continue; }
                const valores = repartir(i.valor, usar.map(l => l.peso));
                const qtds = i.qtd > 0 ? repartir(Math.round(i.qtd * 100), usar.map(l => l.peso)).map(q => q / 100) : usar.map(() => 0);
                valores.forEach((v, k) => { if (v > 0) grupos[k].itens.push({ ...i, valor: v, qtd: qtds[k] }); });
            }
            return grupos.filter(g => g.itens.length);
        };
        const dmDev = (ide: string, categ: string, f: FichaFuncionario, itens: ReturnType<typeof itensDe>, r?: Pick<ResultadoCalculo, 'lotacoes' | 'estabelecimentos'>, soPrincipal = false) =>
            `<dmDev><ideDmDev>${esc(ide)}</ideDmDev><codCateg>${categ}</codCateg><infoPerApur>`
            + gruposDe(itens, f, r, soPrincipal).map(g => estabLot(g, categ, f)).join('')
            + '</infoPerApur></dmDev>';
        const estabLot = (g: { tpInsc: string; nrInsc: string; cod: string; itens: ReturnType<typeof itensDe> }, categ: string, f: FichaFuncionario) =>
            `<ideEstabLot><tpInsc>${g.tpInsc}</tpInsc><nrInsc>${g.nrInsc}</nrInsc><codLotacao>${esc(g.cod)}</codLotacao>`
            + `<remunPerApur><matricula>${esc(f.matriculaEsocial.trim())}</matricula>${p.indSimples ? `<indSimples>${p.indSimples}</indSimples>` : ''}`
            // indApurIR 0 (apuração normal): obrigatório desde 07/2021 na folha mensal.
            + g.itens.map(i => `<itensRemun><codRubr>${esc(i.rub.codRubr)}</codRubr><ideTabRubr>${esc(i.rub.ideTabRubr)}</ideTabRubr>${i.qtd > 0 ? `<qtdRubr>${i.qtd.toFixed(2)}</qtdRubr>` : ''}<vrRubr>${valor(i.valor)}</vrRubr><indApurIR>0</indApurIR>${descFolhaXml(i.descFolha)}</itensRemun>`).join('')
            // Grau de exposição (Tabela 02): obrigatório para empregados (1XX, 2XX, 3XX) e 731/734/738; padrão 1.
            + (/^[123]\d\d$|^73[148]$/.test(categ) ? `<infoAgNocivo><grauExp>${/^[1-4]$/.test(f.dados.grauExp ?? '') ? f.dados.grauExp : '1'}</grauExp></infoAgNocivo>` : '')
            + '</remunPerApur></ideEstabLot>';
        /** Demonstrativo de períodos anteriores (infoPerAnt/ideADC): as diferenças de cada mês no seu {perRef}. */
        const dmDevPerAnt = (ide: string, categ: string, f: FichaFuncionario, ins: Instrumento, periodos: { perRef: string; itens: ReturnType<typeof itensDe> }[], rra?: { qtdMeses: number; descricao: string }) =>
            `<dmDev><ideDmDev>${esc(ide)}</ideDmDev><codCateg>${categ}</codCateg>`
            // RRA (MOS, S-1200, item 2.4): demonstrativo próprio; tpProcRRA 1 sem número (diferenças por convenção/acordo).
            + (rra ? `<indRRA>S</indRRA><infoRRA><tpProcRRA>1</tpProcRRA><descRRA>${esc(rra.descricao.trim().slice(0, 50))}</descRRA><qtdMesesRRA>${rra.qtdMeses.toFixed(1)}</qtdMesesRRA></infoRRA>` : '')
            + '<infoPerAnt><ideADC>'
            + `${ins.dtAcConv ? `<dtAcConv>${ins.dtAcConv}</dtAcConv>` : ''}<tpAcConv>${ins.tpAcConv}</tpAcConv><dsc>${esc(ins.dsc.trim())}</dsc><remunSuc>N</remunSuc>`
            + periodos.map(pr => `<idePeriodo><perRef>${pr.perRef}</perRef><ideEstabLot><tpInsc>1</tpInsc><nrInsc>${estabelecimentoDoVinculo(f, p, pr.perRef)}</nrInsc><codLotacao>${esc(lotacaoDoEstabelecimento(p, estabelecimentoDoVinculo(f, p, pr.perRef)))}</codLotacao>`
                + `<remunPerAnt><matricula>${esc(f.matriculaEsocial.trim())}</matricula>${p.indSimples ? `<indSimples>${p.indSimples}</indSimples>` : ''}`
                + pr.itens.map(i => `<itensRemun><codRubr>${esc(i.rub.codRubr)}</codRubr><ideTabRubr>${esc(i.rub.ideTabRubr)}</ideTabRubr><vrRubr>${valor(i.valor)}</vrRubr><indApurIR>0</indApurIR></itensRemun>`).join('')
                // O grau de exposição é o do mês do perApur (MOS, item 18.17): o da ficha.
                + (/^[123]\d\d$|^73[148]$/.test(categ) ? `<infoAgNocivo><grauExp>${/^[1-4]$/.test(f.dados.grauExp ?? '') ? f.dados.grauExp : '1'}</grauExp></infoAgNocivo>` : '')
                + '</remunPerAnt></ideEstabLot></idePeriodo>').join('')
            + '</ideADC></infoPerAnt></dmDev>';
        const infoPgto = (data: string, ide: string, liquido: number) => `<infoPgto><dtPgto>${data}</dtPgto><tpPgto>1</tpPgto><perRef>${e.competencia}</perRef><ideDmDev>${esc(ide)}</ideDmDev><vrLiq>${valor(Math.max(0, liquido))}</vrLiq></infoPgto>`;
        /** Demonstrativos da folha complementar do funcionário (infoPerAnt), pagos com a folha. */
        const complementaresDe = (f: FichaFuncionario, categ: string, mat: string, quem: string) => {
            for (const c of e.complementares ?? []) {
                const rc = c.resultados.find(x => x.fichaId === f.id);
                if (!rc) continue;
                const qual = `Complementar (${c.instrumento.tpAcConv})${quem}`;
                if (anual) { t.erros.push(`${qual}: vai no S-1200 mensal, não no do 13º.`); continue; }
                if (rc.situacao !== 'calculado') { t.erros.push(`${qual} ${rc.situacao === 'erro' ? 'com erro' : 'incompleta'}: ${[...rc.erros, ...rc.avisos].join(' ') || 'confira o cálculo'}.`); continue; }
                if (rc.competencia !== e.competencia) { t.erros.push(`${qual} é da competência ${mes(rc.competencia)}, não de ${mes(e.competencia)}.`); continue; }
                if (rc.pagamento !== perPgto) { t.erros.push(`${qual} calculada com pagamento em ${mes(rc.pagamento)}, e a folha é paga em ${br(e.dataPagamento)}: recalcule a complementar com o mês do pagamento da folha.`); continue; }
                // O RRA (diferenças de anos anteriores) vai em demonstrativo próprio, com o IRRF dele.
                const comVerbas = rc.meses.filter(m => m.verbas.length);
                if (comVerbas.some(m => m.rra) && !rc.rra) { t.erros.push(`${qual}: diferenças de anos anteriores (RRA) sem o cálculo do RRA. Recalcule a complementar.`); continue; }
                for (const rra of [false, true]) {
                    const meses = comVerbas.filter(m => m.rra === rra);
                    if (!meses.length) continue;
                    if (meses.length > 180) { t.erros.push(`${qual}: mais de 180 meses de referência.`); continue; }
                    const periodos = meses.map(m => ({ perRef: m.perRef, itens: itensDe(m.verbas.map(v => ({ ...v, referencia: '' }))) }));
                    const ideC = unico(ideDmDevComplementar(e.competencia, c.instrumento.tpAcConv, mat, rra));
                    dmDevs.push(dmDevPerAnt(ideC, categ, f, c.instrumento, periodos, rra ? rc.rra : undefined));
                    const pagas = meses.flatMap(m => m.verbas).filter(v => !v.informativa);
                    // Só rubricas informativas (tipo E, a base do FGTS do afastamento): nada é pago, o demonstrativo não vai ao S-1210.
                    if (!pagas.length) continue;
                    const liquido = pagas.reduce((x, v) => x + (v.tipo === 'provento' ? v.valor : -v.valor), 0);
                    pagamentos.push({ mes: perPgto, xml: infoPgto(e.dataPagamento, ideC, liquido) });
                    t.liquido += liquido;
                }
            }
        };
        for (const { ficha: f, r } of contratos) {
            const quem = contratos.length > 1 ? ` (matrícula ${f.matriculaEsocial || '?'})` : '';
            if (!r) {
                // Só a complementar (desligado ou fora da folha do mês): o demonstrativo das diferenças, pago na data da folha.
                const categ = digitos(f.dados.categoria);
                if (!f.matriculaEsocial.trim()) t.erros.push(`Sem matrícula do eSocial na ficha${quem}.`);
                if (!/^\d{3}$/.test(categ)) { t.erros.push(`Categoria do eSocial (3 dígitos) em branco na ficha${quem}.`); continue; }
                if (categ === '104') { t.erros.push(`Empregado doméstico${quem}: a folha vai pelo eSocial Doméstico (módulo web).`); continue; }
                if (f.dependentes.some(x => x.irrf === 'S' && x.pensao !== 'S')) t.avisos.push(`Complementar sem a folha do mês${quem}: o IRRF dela deduziu os dependentes, e a dedução não vai no S-1210. Confira o IRRF no S-5002.`);
                complementaresDe(f, categ, f.matriculaEsocial.trim(), quem);
                continue;
            }
            if (r.situacao !== 'calculado') { t.erros.push(`Cálculo ${r.situacao === 'erro' ? 'com erro' : 'incompleto'}${quem}: ${[...r.erros, ...r.avisos].join(' ') || 'confira o holerite'}.`); continue; }
            // Intermitente sem convocação no mês: sem remuneração, sem demonstrativo.
            if (r.diasIntermitente && !r.verbas.length) { t.avisos.push(`Intermitente sem convocação paga em ${mes(e.competencia)}${quem}: sem demonstrativo.`); continue; }
            if (digitos(f.dados.categoria) === '111') {
                if (anual) { t.erros.push(`Intermitente${quem}: o 13º proporcional é pago a cada convocação, no S-1200 mensal; não vai no do 13º.`); continue; }
                if (!r.diasIntermitente?.length) { t.erros.push(`Intermitente${quem}: o cálculo não tem os dias trabalhados (infoInterm). Recalcule pela tela do cálculo, com as convocações.`); continue; }
                for (const x of r.diasIntermitente) diasInterm.set(x.dia, (diasInterm.get(x.dia) ?? 0) + x.horas);
            }
            // IRRF do adiantamento é do CPF no mês; com dois contratos, cada um foi calculado sozinho (Codex #118).
            if (contratos.length > 1 && r.irrfAdiantamento !== undefined && !r.irrfAdiantamentoCpf) { t.erros.push(`IRRF do adiantamento com mais de um contrato no CPF${quem}: o Consultor ainda calcula cada contrato sozinho. Confira pelo IOB.`); continue; }
            if (!f.matriculaEsocial.trim()) t.erros.push(`Sem matrícula do eSocial na ficha${quem}.`);
            const categ = digitos(f.dados.categoria);
            if (!/^\d{3}$/.test(categ)) t.erros.push(`Categoria do eSocial (3 dígitos) em branco na ficha${quem}.`);
            // O empregador doméstico escritura pelo eSocial Doméstico (módulo web), que fecha a folha e gera o DAE.
            if (categ === '104') { t.erros.push(`Empregado doméstico${quem}: a folha vai pelo eSocial Doméstico (módulo web, com o DAE gerado lá). Lance lá os valores conferidos aqui.`); continue; }
            // Estabelecimento do vínculo (o da ficha no mês): outro que não o dos parâmetros precisa estar no S-1005 da empresa.
            for (const x of r.estabelecimentos?.length ? r.estabelecimentos.map(y => y.estab) : [estabelecimentoDoVinculo(f, p, e.competencia)]) {
                if (x === estab) continue;
                if (x.slice(0, 8) !== estab.slice(0, 8)) t.erros.push(`O local de trabalho da ficha${quem} é o CNPJ ${x}, de outra empresa: confira a ficha (transferência entre empresas é S-2299 + S-2200).`);
                else avisosLotacao.add(`Estabelecimento ${x} (lotação ${lotacaoDoEstabelecimento(p, x)}): confira se está no S-1005 da empresa antes do S-1200.`);
            }
            // Obras do mês (ficha ou rateio): cada uma precisa estar no cadastro, vigente na competência.
            for (const l of r.lotacoes ?? []) {
                const cad = e.lotacoes?.find(x => x.codigo === l.codigo);
                if (!cad) { if (l.codigo !== p.codLotacao.trim()) t.erros.push(`Obra/lotação ${l.codigo}${quem} não está em Cadastros › Obras e lotações.`); continue; }
                if (!anual && (cad.iniValid > e.competencia || (cad.fimValid && cad.fimValid < e.competencia))) t.erros.push(`Obra/lotação ${l.codigo}${quem} fora da validade em ${mes(e.competencia)} (${cad.iniValid} a ${cad.fimValid || 'em aberto'}).`);
                if (!cad.recibo1020) avisosLotacao.add(`Lotação ${l.codigo} sem o recibo do S-1020 no Consultor: confira se foi enviada antes do S-1200 (o eSocial recusa lotação inexistente).`);
                if (ehObraPropria(cad) && !cad.recibo1005) avisosLotacao.add(`Obra ${l.codigo} (CNO ${cad.cno}) sem o recibo do S-1005 no Consultor: o CNO precisa estar na tabela de estabelecimentos antes do S-1200.`);
            }
            if (/^[123]\d\d$|^73[148]$/.test(categ) && !/^[1-4]$/.test(f.dados.grauExp ?? '')) semGrauExp.push(`${r.nome}${quem}`);
            if (r.totais.liquido < 0) t.erros.push(`Líquido negativo${quem}.`);
            // O IRRF do cálculo segue a tabela do mês do pagamento usado nele: com outra data de pagamento na tela, o S-1210
            // sairia num mês e o imposto, pelo outro (Codex #115).
            if (/^\d{4}-\d{2}$/.test(r.pagamento) && r.pagamento !== perPgto) t.erros.push(`Cálculo feito com pagamento em ${mes(r.pagamento)}, mas a data do pagamento é ${br(e.dataPagamento)}${quem}: ajuste o "Pagamento em" do cálculo para ${mes(perPgto)} (ou a data) e gere de novo.`);

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
                if (mesPg > e.competencia) t.erros.push(`Recibo de ${gozo}${quem} pago em ${br(dataPagamento)}, depois do mês do gozo: as férias são pagas até 2 dias antes do início (CLT, art. 145), e o eSocial só prevê o pagamento depois do gozo para o servidor estatutário (MOS, S-1200, item 23, exemplo "d"). Confira a data do pagamento do recibo.`);
            }
            const ferFolha = r.verbas.filter(v => v.codigo === 'FERMES' || v.codigo === 'FERMES13').reduce((s, v) => s + v.valor, 0);
            if (ferFolha !== ferRecibos) t.erros.push(`Férias do mês na folha (${reais(ferFolha)}) não batem com os recibos de férias com gozo em ${mes(e.competencia)} (${reais(ferRecibos)})${quem}: confira os gozos em Cadastros › Afastamentos e recalcule.`);
            // As informativas (base do FGTS do afastamento) vão no mesmo demonstrativo, fora do líquido.
            const itens = itensDe([...r.verbas, ...(r.verbasInformativas ?? [])]);
            const pagosNoMes = recibos.filter(x => x.r.situacao === 'calculado' && x.dataPagamento.slice(0, 7) === e.competencia);

            // Único por trabalhador: matrículas longas que coincidem nos primeiros caracteres ganham um sufixo.
            // Na retificação, a folha usa o demonstrativo do original quando ele é o único da matrícula e não há
            // recibo de férias; senão, os nomes do Consultor (e o original com outro nome trava em "faltando").
            const mat = f.matriculaEsocial.trim();
            const doOriginal = t.retifica1200?.demonstrativos?.[mat] ?? [];
            const ide = unico(doOriginal.length === 1 && !pagosNoMes.length ? doOriginal[0] : ideDmDev(e.competencia, mat));
            if (t.retifica1200 && !doOriginal.length && t.retifica1200.demonstrativos && Object.keys(t.retifica1200.demonstrativos).length)
                t.avisos.push(`A matrícula ${mat} não está no S-1200 original: vai num demonstrativo novo.`);
            dmDevs.push(dmDev(ide, categ, f, itens, r));
            pagamentos.push({ mes: perPgto, xml: infoPgto(e.dataPagamento, ide, r.totais.liquido) });
            t.liquido += r.totais.liquido;

            // Folha complementar: diferenças de meses anteriores, paga com a folha (o IRRF dela somou o da folha).
            complementaresDe(f, categ, mat, quem);

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
            // Saldo da folha em outro mês: o IRRF do adiantamento foi calculado no mês da competência (regime de caixa).
            else if (adiant > 0 && dataAdiant.slice(0, 7) !== perPgto && r.irrfAdiantamento === undefined) t.erros.push(`Adiantamento pago em ${mes(dataAdiant.slice(0, 7))} e saldo da folha em ${mes(perPgto)}${quem}: o IRRF do adiantamento não foi calculado. Recalcule a competência na tela do cálculo.`);
            // O IRRF do adiantamento somou a folha anterior, paga no mês até o 5º dia útil (CLT, art. 459, § 1º): antes
            // disso ela pode não ter sido paga ainda (Codex #118).
            else if (adiant > 0 && r.irrfAdiantamentoFolha && dataAdiant <= quintoDiaUtilDe(e.competencia)) t.erros.push(`Adiantamento em ${br(dataAdiant)}${quem}: o IRRF dele somou a folha de ${mes(r.irrfAdiantamentoFolha)}, paga no mês até o 5º dia útil (${br(quintoDiaUtilDe(e.competencia))}). Use uma data depois dela.`);
            else if (adiant > 0 && r.irrfAdiantamento !== undefined && dataAdiant.slice(0, 7) !== e.competencia) t.erros.push(`Adiantamento em ${br(dataAdiant)}${quem}: com o saldo da folha em ${mes(perPgto)}, o IRRF do adiantamento foi calculado para pagamento em ${mes(e.competencia)}. Use uma data de ${mes(e.competencia)}.`);
            else if (adiant > 0) {
                const ideA = unico(ideDmDevAdiantamento(e.competencia, mat));
                dmDevs.push(dmDev(ideA, categ, f, itensDe(verbasDoAdiantamento(r)), r, true));
                const pago = pagoNoAdiantamento(r);
                pagamentos.push({ mes: dataAdiant.slice(0, 7), xml: infoPgto(dataAdiant, ideA, pago) });
                t.liquido += pago;
            }

            // 1ª parcela do 13º paga na competência: demonstrativo próprio (natureza 5504, só FGTS), pago na data dela.
            for (const { r: r13, dataPagamento: d13 } of (e.primeiraParcela13 ?? []).filter(x => x.r.fichaId === f.id && x.r.situacao === 'calculado')) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(d13)) { t.erros.push(`1ª parcela do 13º${quem} sem data de pagamento.`); continue; }
                if (d13.slice(0, 7) !== e.competencia) { t.erros.push(`1ª parcela do 13º${quem} paga em ${br(d13)}: vai no S-1200 do mês do pagamento, não em ${mes(e.competencia)}.`); continue; }
                const ide13 = unico(ideDmDev13Adiantamento(e.competencia.slice(0, 4), mat));
                dmDevs.push(dmDev(ide13, categ, f, itensDe(r13.verbas), r, true));
                pagamentos.push({ mes: d13.slice(0, 7), xml: infoPgto(d13, ide13, r13.totais.liquido) });
                t.liquido += r13.totais.liquido;
            }

            // Recibos de férias pagos na competência: demonstrativo próprio, pago na data do recibo.
            for (const { r: rf, dataPagamento } of pagosNoMes) {
                const ideF = unico(ideDmDevFerias(dataPagamento, mat));
                dmDevs.push(dmDev(ideF, categ, f, itensDe(verbasDoReciboFerias(rf)), r, true));
                pagamentos.push({ mes: dataPagamento.slice(0, 7), xml: infoPgto(dataPagamento, ideF, rf.totais.liquido) });
                t.liquido += rf.totais.liquido; t.recibosFerias++;
                const pensaoRec = rf.verbas.find(v => v.codigo === 'PENSAOFER')?.valor ?? 0;
                if (pensaoRec > 0 && rf.irrf && !rf.irrf.usouSimplificado) {
                    const rateio = ratearPensao(f, pensaoRec);
                    const m = dataPagamento.slice(0, 7);
                    const pen = penFerias.get(m) ?? new Map<string, number>(); const inf = infoDepFerias.get(m) ?? new Map<string, Dependente>();
                    if (rateio.erro) t.erros.push(rateio.erro);
                    else for (const { dependente: dep, valor: v } of rateio.itens) {
                        const cpfDep = digitos(dep.cpf);
                        if (cpfDep.length !== 11 || cpfDep === cpf) { t.erros.push(`Alimentando ${dep.nome || '?'} sem CPF válido na ficha.`); continue; }
                        if (v > 0) pen.set(cpfDep, (pen.get(cpfDep) ?? 0) + v);
                        if (!depNoEsocial(f, dep)) inf.set(cpfDep, dep);
                    }
                    penFerias.set(m, pen); infoDepFerias.set(m, inf);
                }
                if (rf.irrf && !rf.irrf.usouSimplificado && rf.irrf.dependentes > 0) {
                    // Por dependente: as deduções legais menos o INSS e a pensão do recibo, divididas pelos dependentes.
                    const inssRec = rf.verbas.find(v => v.codigo === 'INSSFER')?.valor ?? 0;
                    const porDep = Math.round((rf.irrf.deducoes - inssRec - pensaoRec) / rf.irrf.dependentes);
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
            // O IRRF do adiantamento somou a folha anterior, paga neste mês: o S-1210 dele tem de levar esse pagamento junto,
            // senão substituiria o aceito sem ele (ou o omitiria). Sem o S-1210 do mês com a folha anterior, não sai (Codex #118).
            const anterior = m === e.competencia && m !== perPgto ? contratos.find(c => c.r?.irrfAdiantamentoFolha)?.r?.irrfAdiantamentoFolha : undefined;
            // A folha mensal anterior em si (ideDmDev do Consultor, ou o "…MENS" do IOB), não outro pagamento da competência (Codex #118).
            const matAnt = contratos.find(c => c.r?.irrfAdiantamentoFolha)?.ficha.matriculaEsocial ?? '';
            const ehFolhaAnterior = (pg: { perRef: string; ideDmDev: string; tpPgto: string }) => pg.tpPgto === '1' && pg.perRef === anterior
                && (pg.ideDmDev === ideDmDev(anterior ?? '', matAnt) || /MENS$/i.test(pg.ideDmDev));
            if (anterior && !(ex?.pagamentos ?? []).some(ehFolhaAnterior))
                t.erros.push(`S-1210 de ${mes(m)}: o IRRF do adiantamento somou a folha de ${mes(anterior)}, paga em ${mes(m)}. Transmita o S-1210 dessa folha antes e carregue o download do eSocial com ele: o do adiantamento sai junto, no mesmo evento.`);
            return { perApur: m, s1210: null, exclusao1210: null, existente1210: ex, outrosPagamentos: outros.length, outros };
        });
        // IR do mês por CPF: dedução de dependentes (quando o motor não usou o desconto simplificado) e
        // pensão alimentícia de cada alimentando (penAlim). Quem não está no S-2200/S-2205 vai no infoDep.
        const dedDep = new Map<string, number>(); const penAlim = new Map<string, number>(); const infoDep = new Map<string, Dependente>();
        // Intermitente: o 13º proporcional (tpRend 12) apurado em separado na folha do mês; as férias (tpRend 13) vão com as dos recibos.
        const dedDep13 = new Map<string, number>(); const penAlim13 = new Map<string, number>();
        // Dependentes deduzidos no IRRF do adiantamento sem folha anterior no mês: vão no S-1210 do mês do adiantamento (Codex #118).
        const dedDepAdi = new Map<string, number>(); const infoDepAdi = new Map<string, Dependente>();
        for (const { ficha: f, r } of contratos) {
            if (!r) continue;
            const d = r.deducoesIrrf;
            if (d && !d.simplificado && d.porDependente > 0) for (const dep of d.dependentes) {
                const cpfDep = digitos(dep.cpf);
                if (cpfDep.length !== 11) { t.avisos.push(`Dependente ${dep.nome || '?'} sem CPF: a dedução não vai no S-1210.`); continue; }
                if (!dedDep.has(cpfDep)) dedDep.set(cpfDep, d.porDependente);
                const fd = f.dependentes.find(x => digitos(x.cpf) === cpfDep);
                if (fd && !depNoEsocial(f, fd)) infoDep.set(cpfDep, fd);
            }
            const da = r.deducoesAdiantamento;
            if (da && adiantamentoDoMes(r) > 0 && da.porDependente > 0) for (const dep of da.dependentes) {
                const cpfDep = digitos(dep.cpf);
                if (cpfDep.length !== 11) { t.avisos.push(`Dependente ${dep.nome || '?'} sem CPF: a dedução do adiantamento não vai no S-1210.`); continue; }
                dedDepAdi.set(cpfDep, da.porDependente);
                const fd = f.dependentes.find(x => digitos(x.cpf) === cpfDep);
                if (fd && !depNoEsocial(f, fd)) infoDepAdi.set(cpfDep, fd);
            }
            const di = r.deducoesIntermitente;
            if (di) for (const [mapa, ded, rotulo] of [[dedDep13, di.decimo, '13º'], [null, di.ferias, 'férias']] as const) {
                if (ded.simplificado || !(ded.porDependente > 0)) continue;
                for (const dep of ded.dependentes) {
                    const cpfDep = digitos(dep.cpf);
                    if (cpfDep.length !== 11) { t.avisos.push(`Dependente ${dep.nome || '?'} sem CPF: a dedução do IRRF ${rotulo === '13º' ? 'do 13º' : 'das férias'} do intermitente não vai no S-1210.`); continue; }
                    if (mapa) mapa.set(cpfDep, ded.porDependente);
                    else {
                        const m = dedFerias.get(perPgto) ?? new Map<string, number>();
                        m.set(cpfDep, (m.get(cpfDep) ?? 0) + ded.porDependente); dedFerias.set(perPgto, m);
                    }
                    const fd = f.dependentes.find(x => digitos(x.cpf) === cpfDep);
                    if (fd && !depNoEsocial(f, fd)) {
                        if (mapa) infoDep.set(cpfDep, fd);
                        else { const inf = infoDepFerias.get(perPgto) ?? new Map<string, Dependente>(); inf.set(cpfDep, fd); infoDepFerias.set(perPgto, inf); }
                    }
                }
            }
            for (const [codigos, destino] of (di ? [[['PENSAO'], penAlim], [['PENSAO13'], penAlim13]] : [[['PENSAO', 'PENSAO13'], penAlim]]) as [string[], Map<string, number>][]) {
                const pensao = r.verbas.filter(v => codigos.includes(v.codigo)).reduce((soma, v) => soma + v.valor, 0);
                if (pensao <= 0) continue;
                const rateio = ratearPensao(f, pensao);
                if (rateio.erro) { t.erros.push(rateio.erro); continue; }
                for (const { dependente: dep, valor: v } of rateio.itens) {
                    const cpfDep = digitos(dep.cpf);
                    if (cpfDep.length !== 11 || cpfDep === cpf) { t.erros.push(`Alimentando ${dep.nome || '?'} sem CPF válido na ficha.`); continue; }
                    if (v > 0) destino.set(cpfDep, (destino.get(cpfDep) ?? 0) + v);
                    if (!depNoEsocial(f, dep)) infoDep.set(cpfDep, dep);
                }
            }
        }
        const semTipo = new Set<string>();
        const conferirTipo = (c: string, dep: Dependente) => {
            if (semTipo.has(c) || (/^\d{2}$/.test(dep.tipo) && dep.tipo !== '99')) return;
            semTipo.add(c);
            t.erros.push(`Dependente ${dep.nome || c} não está no eSocial e o tipo (Tabela 07) ${dep.tipo === '99' ? 'é 99 (agregado/outros)' : 'está em branco'}: informe o tipo na ficha ou cadastre pelo S-2205.`);
        };
        for (const [c, dep] of infoDep) if (dedDep.has(c)) conferirTipo(c, dep);
        for (const [c, dep] of infoDepAdi) conferirTipo(c, dep);
        for (const [m, inf] of infoDepFerias) for (const [c, dep] of inf) if (dedFerias.get(m)?.has(c)) conferirTipo(c, dep);
        // A mesma pessoa não deduz como dependente e como alimentando no mesmo rendimento (Lei 9.250/1995, art. 35, § 4º; IN RFB 1.500/2014, art. 90, § 4º).
        for (const c of penAlim.keys()) if (dedDep.has(c) || dedDepAdi.has(c)) {
            const nome = contratos.flatMap(x => x.ficha.dependentes).find(d => digitos(d.cpf) === c)?.nome || c;
            t.erros.push(`${nome} é alimentando (pensão) e também dependente no IRRF: as duas deduções não se somam. Desmarque o IRRF do dependente na ficha e recalcule.`);
        }
        // O S-1210 aceito volta com as deduções dele (dependentes e pensão). Só com os pagamentos desta folha, as de agora
        // são as que valem: diferentes, o reenvio manteria as antigas.
        for (const pm of porMes) {
            const ex = pm.existente1210;
            if (pm.perApur !== perPgto || !ex?.irComplem?.length || pm.outros.length) continue;
            const aceito = ex.irComplem.join('');
            const doAceito = (tag: string, vlr: string) => [...aceito.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))]
                .map(x => x[1]).filter(x => new RegExp(`<tpRend>${tpRendFolha}</tpRend>`).test(x))
                .map(x => `${/<cpfDep>(\d+)<\/cpfDep>/.exec(x)?.[1] ?? ''}=${Number(new RegExp(`<${vlr}>([^<]*)</${vlr}>`).exec(x)?.[1] ?? 0).toFixed(2)}`).sort().join(',');
            const agora = (m: Map<string, number>) => [...m].map(([c, v]) => `${c}=${valor(v)}`).sort().join(',');
            if (doAceito('dedDepen', 'vlrDedDep') !== agora(dedDep) || doAceito('penAlim', 'vlrDedPenAlim') !== agora(penAlim))
                t.erros.push(`O S-1210 de ${mes(pm.perApur)} aceito (recibo ${ex.nrRecibo}) tem deduções do IRRF (dependentes ou pensão) diferentes das deste cálculo: o reenvio manteria as antigas. Confira o cálculo ou retifique pelo IOB.`);
        }
        if (t.erros.length || !dmDevs.length) continue;
        // Plano de saúde coletivo: o que o empregado pagou na folha (mensalidade e coparticipação), por operadora, vai no
        // S-1210 do mês do pagamento (infoIRComplem/planSaude), para a dedução no IR dele. Sem a divisão por dependente,
        // o valor vai todo no titular.
        const planos = new Map<string, { cnpjOper: string; regANS: string; valor: number }>();
        for (const { r } of contratos) for (const v of r?.verbas ?? []) {
            if (!v.planoSaude || v.tipo !== 'desconto' || !(v.valor > 0)) continue;
            const k = `${v.planoSaude.cnpjOper}|${v.planoSaude.regANS}`;
            const p = planos.get(k) ?? { cnpjOper: v.planoSaude.cnpjOper, regANS: v.planoSaude.regANS, valor: 0 };
            p.valor += v.valor; planos.set(k, p);
        }
        const planSaudeXml = [...planos.values()].map(p => `<planSaude><cnpjOper>${digitos(p.cnpjOper)}</cnpjOper>${/^\d{6}$/.test(p.regANS) ? `<regANS>${p.regANS}</regANS>` : ''}<vlrSaudeTit>${valor(p.valor)}</vlrSaudeTit></planSaude>`).join('');
        if (planos.size) t.avisos.push(`Plano de saúde no S-1210: ${[...planos.values()].map(p => `${valor(p.valor)} (operadora ${p.cnpjOper})`).join('; ')}, todo no titular.`);
        /** Informações de IR do mês: as da folha (tpRend 11) no mês do pagamento dela e as dos recibos de férias (tpRend 13) no mês de cada um. */
        const irDoMes = (m: string) => {
            const daFolha = m === perPgto;
            // Mês do adiantamento (antes do da folha): as deduções de dependentes usadas no IRRF dele.
            const doAdiant = !daFolha && m === e.competencia;
            const dedDepMes = daFolha ? dedDep : doAdiant ? dedDepAdi : new Map<string, number>();
            const dedF = dedFerias.get(m) ?? new Map<string, number>();
            const irCR = [
                ...[...dedDepMes].map(([c, v]) => `<dedDepen><tpRend>${daFolha ? tpRendFolha : '11'}</tpRend><cpfDep>${c}</cpfDep><vlrDedDep>${valor(v)}</vlrDedDep></dedDepen>`),
                ...[...dedF].map(([c, v]) => `<dedDepen><tpRend>13</tpRend><cpfDep>${c}</cpfDep><vlrDedDep>${valor(v)}</vlrDedDep></dedDepen>`),
                ...(daFolha ? [...dedDep13].map(([c, v]) => `<dedDepen><tpRend>12</tpRend><cpfDep>${c}</cpfDep><vlrDedDep>${valor(v)}</vlrDedDep></dedDepen>`) : []),
                ...(daFolha ? [...penAlim].map(([c, v]) => `<penAlim><tpRend>${tpRendFolha}</tpRend><cpfDep>${c}</cpfDep><vlrDedPenAlim>${valor(v)}</vlrDedPenAlim></penAlim>`) : []),
                ...(daFolha ? [...penAlim13].map(([c, v]) => `<penAlim><tpRend>12</tpRend><cpfDep>${c}</cpfDep><vlrDedPenAlim>${valor(v)}</vlrDedPenAlim></penAlim>`) : []),
                ...[...(penFerias.get(m) ?? [])].map(([c, v]) => `<penAlim><tpRend>13</tpRend><cpfDep>${c}</cpfDep><vlrDedPenAlim>${valor(v)}</vlrDedPenAlim></penAlim>`),
            ];
            const deps = new Map<string, Dependente>([...(daFolha ? infoDep : doAdiant ? infoDepAdi : []), ...(infoDepFerias.get(m) ?? [])]);
            const deduz = (c: string) => dedDepMes.has(c) || dedF.has(c) || (daFolha && dedDep13.has(c));
            const infoDepXml = [...deps].map(([c, dep]) => `<infoDep><cpfDep>${c}</cpfDep>${/^\d{4}-\d{2}-\d{2}$/.test(dep.nascimento) ? `<dtNascto>${dep.nascimento}</dtNascto>` : ''}`
                + `${dep.nome ? `<nome>${esc(dep.nome.slice(0, 70))}</nome>` : ''}${deduz(c) ? `<depIRRF>S</depIRRF><tpDep>${dep.tipo}</tpDep>` : ''}</infoDep>`);
            const planosMes = daFolha ? planSaudeXml : '';
            if (!irCR.length && !planosMes) return '';
            return `<infoIRComplem>${irCR.length ? `${infoDepXml.join('')}<infoIRCR><tpCR>056107</tpCR>${irCR.join('')}</infoIRCR>` : ''}${planosMes}</infoIRComplem>`;
        };
        const id1200 = idEvento(e.cnpj, agora, ++seq);
        t.s1200 = { id: id1200, xml: `<eSocial xmlns="${NS}/evtRemun/${VERSAO}"><evtRemun Id="${id1200}">`
            + `<ideEvento>${retif(t.retifica1200)}<indApuracao>${anual ? 2 : 1}</indApuracao><perApur>${e.competencia}</perApur><tpAmb>${e.tpAmb}</tpAmb><procEmi>1</procEmi><verProc>${VER_PROC}</verProc></ideEvento>`
            + ideEmpregador + `<ideTrabalhador><cpfTrab>${cpf}</cpfTrab>${[...diasInterm.keys()].sort((a, b) => a - b).map(dia => `<infoInterm><dia>${dia}</dia></infoInterm>`).join('')}</ideTrabalhador>`
            + dmDevs.join('') + '</evtRemun></eSocial>' };
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
            const doAdiantamento = pm.perApur === e.competencia && pm.perApur !== perPgto;
            let ir = ex?.irComplem?.length ? mesclarIRFerias(ex.irComplem.join(''), novo, pm.perApur === e.competencia, doAdiantamento,
                doAdiantamento && contratos.some(c => adiantamentoDoMes(c.r) > 0 && c.r.irrfAdiantamento !== undefined) && !contratos.some(c => c.r.irrfAdiantamentoFolha),
                anual && pm.perApur === perPgto ? '12' : undefined) : novo;
            // O aceito volta sem o plano de saúde de agora (a mescla só cuida das deduções): ele entra aqui; se o aceito já tem, fica o dele.
            if (ex?.irComplem?.length && pm.perApur === perPgto && planSaudeXml) {
                if (ir.includes('<planSaude>')) t.avisos.push(`O S-1210 de ${mes(pm.perApur)} aceito já tem plano de saúde: ele volta como estava (o desta folha não é somado).`);
                else if (ir.includes('</infoIRComplem>')) { const i = ir.search(/<infoReembMed>|<\/infoIRComplem>/); ir = ir.slice(0, i) + planSaudeXml + ir.slice(i); }
                else ir = `<infoIRComplem>${planSaudeXml}</infoIRComplem>`;
            }
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
    if (semGrauExp.length) avisos.push(`Grau de exposição a agentes nocivos em branco na ficha de ${semGrauExp.join(', ')}: vai 1 (sem exposição). Confira com o S-2240.`);
    trabalhadores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    avisos.push(...avisosLotacao);
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
export function mesclarIRFerias(aceito: string, novo: string, completo = false, comAdiantamento = false, reconciliarAdiantamento = false, rend13?: string): string {
    const blocos = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g')) ?? [];
    const campo = (xml: string, tag: string) => new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)?.[1] ?? '';
    // tpRend 13 (férias) e, no mês do adiantamento sem folha anterior, o tpRend 11 deduzido nele (Codex #118).
    // E o tpRend 12 do 13º, no S-1210 do mês em que ele é pago (o cálculo tem o 13º inteiro: o do aceito é trocado ou sai).
    const mescla = (d: string) => campo(d, 'tpRend') === '13' || (comAdiantamento && campo(d, 'tpRend') === '11') || (!!rend13 && campo(d, 'tpRend') === rend13);
    const novos = blocos(novo, 'dedDepen').filter(mescla);
    if (!novos.length && !completo && !rend13) return aceito;
    const chave = (d: string) => `${campo(d, 'tpRend')}|${campo(d, 'cpfDep')}`;
    const porCpf = new Map(novos.map(d => [chave(d), d]));
    let r = aceito;
    // Troca o que já está no aceito (mesmo CPF e tpRend) pelo valor de agora; sem valor agora, o tpRend 13 sai (só se
    // completo). O tpRend 11 do aceito (a folha anterior, paga no mês) fica.
    for (const d of blocos(aceito, 'dedDepen')) {
        if (!mescla(d)) continue;
        const k = chave(d);
        if (porCpf.has(k)) { r = r.replace(d, porCpf.get(k)!); porCpf.delete(k); }
        // Sem folha anterior no mês, as tpRend 11 do aceito são do adiantamento: as que não valem mais saem (Codex #118).
        else if ((completo && (campo(d, 'tpRend') === '13' || (reconciliarAdiantamento && campo(d, 'tpRend') === '11'))) || (!!rend13 && campo(d, 'tpRend') === rend13)) r = r.replace(d, '');
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
    // Dependente que o aceito já informa (por plano de saúde, por exemplo) sem a marca de IRRF: a marca e o tipo de agora
    // entram no infoDep dele, antes da descrição (ordem do leiaute; Codex #118).
    const novosInfo = new Map(blocos(novo, 'infoDep').map(d => [campo(d, 'cpfDep'), d] as const));
    for (const d of blocos(r, 'infoDep')) {
        const c = campo(d, 'cpfDep');
        const n = novosInfo.get(c);
        if (!cpfs.has(c) || !n || d.includes('<depIRRF>')) continue;
        const marca = /<depIRRF>[\s\S]*?<\/tpDep>/.exec(n)?.[0];
        if (!marca) continue;
        const i = d.includes('<descrDep>') ? d.indexOf('<descrDep>') : d.lastIndexOf('</infoDep>');
        r = r.replace(d, d.slice(0, i) + marca + d.slice(i));
    }
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
