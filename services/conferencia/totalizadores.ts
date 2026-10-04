// services/conferencia/totalizadores.ts
//
// Leitura dos totalizadores que o eSocial devolve depois da folha:
//
//   S-5001 evtBasesTrab  — bases e contribuição previdenciária por trabalhador
//   S-5003 evtBasesFGTS  — base e depósito de FGTS por trabalhador
//   S-5011 evtCS         — contribuições sociais consolidadas da empresa (vai à DCTFWeb)
//   S-5013 evtFGTS       — FGTS consolidado da empresa (vai ao FGTS Digital)
//   S-5002 evtIrrfBenef  — IRRF por trabalhador (regime de CAIXA: mês do pagamento, S-1210)
//   S-5012 evtIrrf       — IRRF consolidado da empresa, por código de receita (vai à DCTFWeb)
//
// A estrutura segue os XSDs do leiaute S-1.3 (pasta schemes/v_S_01_03_00 da
// biblioteca pública nfephp-org/sped-esocial). Os elementos são procurados
// pelo nome local, então o mesmo leitor serve para o XML solto, para o XML
// dentro do envelope de download e para versões anteriores do leiaute em que
// estes grupos têm o mesmo nome.
//
// Valores monetários ficam em CENTAVOS (inteiros): a conferência soma
// centenas de linhas, e soma de ponto flutuante não fecha no centavo.

import { lerZip } from '../implantacao/zip';

export type TipoTotalizador = 'S-5001' | 'S-5003' | 'S-5011' | 'S-5013' | 'S-5002' | 'S-5012';

const EVENTOS: Record<string, TipoTotalizador> = {
    evtBasesTrab: 'S-5001',
    evtBasesFGTS: 'S-5003',
    evtCS: 'S-5011',
    evtFGTS: 'S-5013',
    evtIrrfBenef: 'S-5002',
    evtIrrf: 'S-5012',
};

export interface Cabecalho {
    tipo: TipoTotalizador;
    /** Atributo Id do evento; identifica repetições do mesmo arquivo. */
    id: string;
    arquivo: string;
    /** Inscrição do empregador como veio (raiz do CNPJ, CNPJ completo ou CPF). */
    empregador: string;
    perApur: string;
    /** 1 = mensal, 2 = anual (13º salário). */
    indApuracao: string;
    nrRecArqBase: string;
}

export interface CalculoSegurado { tpCR: string; calculado: number; descontado: number }
export interface BaseCs { ind13: string; tpValor: string; valor: number }
export interface VinculoCs { estab: string; codLotacao: string; matricula: string; codCateg: string; bases: BaseCs[] }
export interface S5001 extends Cabecalho { tipo: 'S-5001'; cpf: string; calculos: CalculoSegurado[]; vinculos: VinculoCs[] }

export interface ItemFgtsTrab {
    estab: string; matricula: string; codCateg: string;
    tpValor: string; indIncid: string; remuneracao: number; deposito: number;
    /** Linha de infoBasePerAntE (período anterior, acordo ou convenção). */
    periodoAnterior: boolean;
}
export interface S5003 extends Cabecalho { tipo: 'S-5003'; cpf: string; itens: ItemFgtsTrab[] }

export interface CreditoCs { tpCR: string; valor: number; suspenso: number }
export interface S5011 extends Cabecalho {
    tipo: 'S-5011';
    indExistInfo: string;
    /** infoCPSeg/vrDescCP: total descontado dos segurados (null se o grupo não veio). */
    descontadoSegurados: number | null;
    /** infoCPSeg/vrCpSeg: total calculado para os segurados (null se o grupo não veio). */
    calculadoSegurados: number | null;
    /** infoCRContrib: o que vai para a DCTFWeb, por código de receita. */
    creditos: CreditoCs[];
}

export interface BaseFgtsEmpresa { tpValor: string; indIncid: string; base: number; valorFgts: number; periodoAnterior: boolean }
export interface S5013 extends Cabecalho { tipo: 'S-5013'; indExistInfo: string; bases: BaseFgtsEmpresa[] }

/** Totais de IRRF de um trabalhador por código de receita (CRMen), em centavos. */
export interface ApuracaoIrrf {
    crMen: string;
    rendTrib: number; rendTrib13: number;
    prevOficial: number; prevOficial13: number;
    irrf: number; irrf13: number;
}
export interface S5002 extends Cabecalho {
    tipo: 'S-5002'; cpf: string; apuracoes: ApuracaoIrrf[];
    /** consolidado = totInfoIR/consolidApurMen; demonstrativos = soma de dmDev/totApurMen (leiaute sem o consolidado). */
    fonte: 'consolidado' | 'demonstrativos';
}
export interface S5012 extends Cabecalho { tipo: 'S-5012'; indExistInfo: string; creditos: { crMen: string; valor: number }[] }

export type Totalizador = S5001 | S5003 | S5011 | S5013 | S5002 | S5012;

export interface LeituraTotalizadores {
    totalizadores: Totalizador[];
    /** Arquivos lidos sem nenhum totalizador, eventos repetidos e erros de leitura. */
    avisos: string[];
}

// ─── helpers de XML ───────────────────────────────────────────────────────

const filhos = (e: Element, nome: string) => Array.from(e.children).filter(c => c.localName === nome);
const filho = (e: Element | undefined | null, nome: string) => (e ? filhos(e, nome)[0] : undefined);
const texto = (e: Element | undefined | null, nome: string) => filho(e, nome)?.textContent?.trim() ?? '';

/** "1234.56" → 123456. Vazio vira 0. Formato inválido é erro: valor inventado é pior que valor ausente. */
export function centavos(v: string): number {
    const t = v.trim();
    if (!t) return 0;
    if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`Valor monetário inválido: "${v}".`);
    return Math.round(Number(t) * 100);
}
const valor = (e: Element | undefined | null, nome: string) => centavos(texto(e, nome));

function cabecalho(ev: Element, tipo: TipoTotalizador, arquivo: string): Cabecalho {
    const ide = filho(ev, 'ideEvento');
    const emp = filho(ev, 'ideEmpregador');
    // No S-5011 e no S-5013 o recibo de origem fica dentro de infoCS/infoFGTS.
    const nrRec = texto(ide, 'nrRecArqBase') || texto(filho(ev, 'infoCS'), 'nrRecArqBase') || texto(filho(ev, 'infoFGTS'), 'nrRecArqBase') || texto(filho(ev, 'infoIRRF'), 'nrRecArqBase');
    return {
        tipo, arquivo,
        id: ev.getAttribute('Id') ?? '',
        empregador: texto(emp, 'nrInsc'),
        perApur: texto(ide, 'perApur'),
        indApuracao: texto(ide, 'indApuracao') || '1',
        nrRecArqBase: nrRec,
    };
}

function lerS5001(ev: Element, arquivo: string): S5001 {
    const cab = cabecalho(ev, 'S-5001', arquivo);
    const calculos = filhos(ev, 'infoCpCalc').map(c => ({ tpCR: texto(c, 'tpCR'), calculado: valor(c, 'vrCpSeg'), descontado: valor(c, 'vrDescSeg') }));
    const vinculos: VinculoCs[] = [];
    for (const est of filhos(filho(ev, 'infoCp') ?? ev, 'ideEstabLot')) {
        for (const cat of filhos(est, 'infoCategIncid')) {
            vinculos.push({
                estab: texto(est, 'nrInsc'), codLotacao: texto(est, 'codLotacao'),
                matricula: texto(cat, 'matricula'), codCateg: texto(cat, 'codCateg'),
                bases: filhos(cat, 'infoBaseCS').map(b => ({ ind13: texto(b, 'ind13'), tpValor: texto(b, 'tpValor'), valor: valor(b, 'valor') })),
            });
        }
    }
    return { ...cab, tipo: 'S-5001', cpf: texto(filho(ev, 'ideTrabalhador'), 'cpfTrab'), calculos, vinculos };
}

function lerS5003(ev: Element, arquivo: string): S5003 {
    const cab = cabecalho(ev, 'S-5003', arquivo);
    const itens: ItemFgtsTrab[] = [];
    for (const est of filhos(filho(ev, 'infoFGTS') ?? ev, 'ideEstab')) {
        for (const lot of filhos(est, 'ideLotacao')) {
            for (const trab of filhos(lot, 'infoTrabFGTS')) {
                const base = { estab: texto(est, 'nrInsc'), matricula: texto(trab, 'matricula'), codCateg: texto(trab, 'codCateg') };
                const info = filho(trab, 'infoBaseFGTS');
                for (const b of info ? filhos(info, 'basePerApur') : []) {
                    itens.push({ ...base, tpValor: texto(b, 'tpValor'), indIncid: texto(b, 'indIncid'), remuneracao: valor(b, 'remFGTS'), deposito: valor(b, 'dpsFGTS'), periodoAnterior: false });
                }
                for (const ant of info ? filhos(info, 'infoBasePerAntE') : []) {
                    for (const b of filhos(ant, 'basePerAntE')) {
                        itens.push({ ...base, tpValor: texto(b, 'tpValorE'), indIncid: texto(b, 'indIncidE'), remuneracao: valor(b, 'remFGTSE'), deposito: valor(b, 'dpsFGTSE'), periodoAnterior: true });
                    }
                }
            }
        }
    }
    return { ...cab, tipo: 'S-5003', cpf: texto(filho(ev, 'ideTrabalhador'), 'cpfTrab'), itens };
}

function lerS5011(ev: Element, arquivo: string): S5011 {
    const cab = cabecalho(ev, 'S-5011', arquivo);
    const info = filho(ev, 'infoCS');
    const seg = filho(info, 'infoCPSeg');
    return {
        ...cab, tipo: 'S-5011',
        indExistInfo: texto(info, 'indExistInfo'),
        descontadoSegurados: seg ? valor(seg, 'vrDescCP') : null,
        calculadoSegurados: seg ? valor(seg, 'vrCpSeg') : null,
        creditos: (info ? filhos(info, 'infoCRContrib') : []).map(c => ({ tpCR: texto(c, 'tpCR'), valor: valor(c, 'vrCR'), suspenso: valor(c, 'vrCRSusp') })),
    };
}

function lerS5013(ev: Element, arquivo: string): S5013 {
    const cab = cabecalho(ev, 'S-5013', arquivo);
    const info = filho(ev, 'infoFGTS');
    const bases: BaseFgtsEmpresa[] = [];
    for (const est of info ? filhos(info, 'ideEstab') : []) {
        for (const lot of filhos(est, 'ideLotacao')) {
            const b0 = filho(lot, 'infoBaseFGTS');
            for (const b of b0 ? filhos(b0, 'basePerApur') : []) {
                bases.push({ tpValor: texto(b, 'tpValor'), indIncid: texto(b, 'indIncid'), base: valor(b, 'baseFGTS'), valorFgts: valor(b, 'vrFGTS'), periodoAnterior: false });
            }
            for (const ant of b0 ? filhos(b0, 'infoBasePerAntE') : []) {
                for (const b of filhos(ant, 'basePerAntE')) {
                    bases.push({ tpValor: texto(b, 'tpValorE'), indIncid: texto(b, 'indIncidE'), base: valor(b, 'baseFGTSE'), valorFgts: valor(b, 'vrFGTSE'), periodoAnterior: true });
                }
            }
        }
    }
    return { ...cab, tipo: 'S-5013', indExistInfo: texto(info, 'indExistInfo'), bases };
}

function apuracaoIrrf(e: Element): ApuracaoIrrf {
    return {
        crMen: texto(e, 'CRMen'),
        rendTrib: valor(e, 'vlrRendTrib'), rendTrib13: valor(e, 'vlrRendTrib13'),
        prevOficial: valor(e, 'vlrPrevOficial'), prevOficial13: valor(e, 'vlrPrevOficial13'),
        irrf: valor(e, 'vlrCRMen'), irrf13: valor(e, 'vlrCR13Men'),
    };
}

function lerS5002(ev: Element, arquivo: string): S5002 {
    const cab = cabecalho(ev, 'S-5002', arquivo);
    // XSD S-1.3: dmDev e totInfoIR ficam dentro de ideTrabalhador.
    const trab = filho(ev, 'ideTrabalhador') ?? ev;
    const cpf = texto(trab, 'cpfBenef');
    const consolidado = filho(trab, 'totInfoIR');
    if (consolidado) return { ...cab, tipo: 'S-5002', cpf, apuracoes: filhos(consolidado, 'consolidApurMen').map(apuracaoIrrf), fonte: 'consolidado' };
    // Sem o consolidado, soma os totais de cada demonstrativo por código de receita.
    const porCr = new Map<string, ApuracaoIrrf>();
    for (const dm of filhos(trab, 'dmDev')) for (const t of filhos(dm, 'totApurMen')) {
        const a = apuracaoIrrf(t);
        const atual = porCr.get(a.crMen);
        porCr.set(a.crMen, atual ? {
            crMen: a.crMen, rendTrib: atual.rendTrib + a.rendTrib, rendTrib13: atual.rendTrib13 + a.rendTrib13,
            prevOficial: atual.prevOficial + a.prevOficial, prevOficial13: atual.prevOficial13 + a.prevOficial13,
            irrf: atual.irrf + a.irrf, irrf13: atual.irrf13 + a.irrf13,
        } : a);
    }
    return { ...cab, tipo: 'S-5002', cpf, apuracoes: [...porCr.values()], fonte: 'demonstrativos' };
}

function lerS5012(ev: Element, arquivo: string): S5012 {
    const cab = cabecalho(ev, 'S-5012', arquivo);
    const info = filho(ev, 'infoIRRF');
    return { ...cab, tipo: 'S-5012', indExistInfo: texto(info, 'indExistInfo'), creditos: (info ? filhos(info, 'infoCRMen') : []).map(c => ({ crMen: texto(c, 'CRMen'), valor: valor(c, 'vrCRMen') })) };
}

const LEITORES: Record<TipoTotalizador, (ev: Element, arquivo: string) => Totalizador> = {
    'S-5001': lerS5001, 'S-5003': lerS5003, 'S-5011': lerS5011, 'S-5013': lerS5013, 'S-5002': lerS5002, 'S-5012': lerS5012,
};

/**
 * Lê os totalizadores de um texto XML. Alguns retornos trazem o evento como
 * texto escapado dentro de outro XML (envelope de download/consulta); esse
 * texto é lido de novo, um nível abaixo.
 */
export function lerTotalizadoresXml(xml: string, arquivo: string, nivel = 0): Totalizador[] {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const todos = Array.from(doc.getElementsByTagName('*'));
    if (todos.some(e => e.localName === 'parsererror')) throw new Error(`${arquivo}: XML malformado.`);
    const saida: Totalizador[] = [];
    for (const e of todos) {
        const tipo = EVENTOS[e.localName];
        if (tipo) saida.push(LEITORES[tipo](e, arquivo));
    }
    if (nivel < 2) {
        for (const e of todos) {
            if (e.children.length) continue;
            const t = e.textContent?.trim() ?? '';
            if (t.startsWith('<') && /<(\w+:)?(evtBasesTrab|evtBasesFGTS|evtCS|evtFGTS|evtIrrfBenef|evtIrrf)\b/.test(t)) saida.push(...lerTotalizadoresXml(t, arquivo, nivel + 1));
        }
    }
    return saida;
}

export interface ArquivoEntrada { nome: string; bytes: Uint8Array }

function decodificar(bytes: Uint8Array): string {
    // XML do eSocial é UTF-8; o fallback cobre arquivo regravado em ANSI.
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('windows-1252').decode(bytes); }
}

/** Lê .xml e .zip (inclusive zip dentro de zip, um nível) e devolve os totalizadores sem repetição. */
export async function lerTotalizadores(arquivos: ArquivoEntrada[]): Promise<LeituraTotalizadores> {
    const avisos: string[] = [];
    const lidos: Totalizador[] = [];
    const fila: ArquivoEntrada[] = [...arquivos];
    let expandidos = 0;
    while (fila.length) {
        const a = fila.shift()!;
        const nome = a.nome;
        if (/\.zip$/i.test(nome)) {
            if (expandidos++ > 50) { avisos.push(`${nome}: zip dentro de zip demais; não foi aberto.`); continue; }
            try { for (const x of await lerZip(a.bytes)) fila.push({ nome: `${nome}/${x.nome}`, bytes: x.bytes }); }
            catch (e) { avisos.push(`${nome}: ${(e as Error).message}`); }
            continue;
        }
        if (!/\.xml$/i.test(nome)) { avisos.push(`${nome}: ignorado (não é .xml nem .zip).`); continue; }
        try {
            const achados = lerTotalizadoresXml(decodificar(a.bytes), nome);
            if (!achados.length) avisos.push(`${nome}: nenhum totalizador S-5001, S-5002, S-5003, S-5011, S-5012 ou S-5013 no arquivo.`);
            lidos.push(...achados);
        } catch (e) {
            avisos.push(`${nome}: ${(e as Error).message}`);
        }
    }
    // O mesmo evento pode chegar em mais de um arquivo (download repetido).
    const vistos = new Set<string>();
    const totalizadores: Totalizador[] = [];
    let repetidos = 0;
    for (const t of lidos) {
        const chave = t.id || `${t.tipo}|${t.empregador}|${t.perApur}|${t.indApuracao}|${t.nrRecArqBase}|${'cpf' in t ? t.cpf : ''}`;
        if (vistos.has(chave)) { repetidos++; continue; }
        vistos.add(chave);
        totalizadores.push(t);
    }
    if (repetidos) avisos.push(`${repetidos} evento(s) repetido(s) em mais de um arquivo; cada um foi contado uma vez.`);
    return { totalizadores, avisos };
}

/** Uma empresa numa competência e num tipo de apuração (mensal ou 13º). */
export interface GrupoApuracao {
    chave: string;
    empregador: string;
    perApur: string;
    indApuracao: string;
    s5001: S5001[];
    s5003: S5003[];
    s5011: S5011[];
    s5013: S5013[];
    /** IRRF segue o mês do PAGAMENTO (S-1210): o S-5002 de 10/2026 traz, em geral, o IRRF da folha de 09/2026. */
    s5002: S5002[];
    s5012: S5012[];
}

/** Separa por empresa, competência e apuração: misturar competências faria a conferência fechar errado. */
export function agruparPorApuracao(totalizadores: Totalizador[]): GrupoApuracao[] {
    const grupos = new Map<string, GrupoApuracao>();
    for (const t of totalizadores) {
        const chave = `${t.empregador}|${t.perApur}|${t.indApuracao}`;
        let g = grupos.get(chave);
        if (!g) { g = { chave, empregador: t.empregador, perApur: t.perApur, indApuracao: t.indApuracao, s5001: [], s5003: [], s5011: [], s5013: [], s5002: [], s5012: [] }; grupos.set(chave, g); }
        if (t.tipo === 'S-5001') g.s5001.push(t);
        else if (t.tipo === 'S-5003') g.s5003.push(t);
        else if (t.tipo === 'S-5011') g.s5011.push(t);
        else if (t.tipo === 'S-5013') g.s5013.push(t);
        else if (t.tipo === 'S-5002') g.s5002.push(t);
        else g.s5012.push(t);
    }
    return [...grupos.values()].sort((a, b) => b.perApur.localeCompare(a.perApur) || a.empregador.localeCompare(b.empregador) || a.indApuracao.localeCompare(b.indApuracao));
}
