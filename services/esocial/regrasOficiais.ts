// services/esocial/regrasOficiais.ts
//
// Pré-voo, parte 3: regras de validação OFICIAIS do eSocial que dá para conferir só com o XML do lote (leiaute S-1.3,
// NT 07/2026 rev. 24/09/2026, "Regras de validação" da documentação técnica no gov.br, lidas em 12/10/2026). Cada achado
// leva o nome da regra oficial. As regras que dependem do que já está no eSocial (vínculo existente, S-1010 vigente,
// fechamento) ficam com o governo ou com as regras de ordem do preVoo.ts.
//   REGRA_CARACTERE_ESPECIAL         caracteres permitidos, sem espaço no início/fim, sem tab/enter/espaço não separável;
//   REGRA_VALIDA_PERIODO_APURACAO    S-1200/S-1202/S-1207: mensal até o mês corrente; 13º até o ano corrente;
//   REGRA_REMUN_ANUAL_DEZEMBRO       remuneração anual (perApur AAAA) só a partir de 1º/12 do ano;
//   REGRA_VALIDA_PER_APUR_PGTO       S-1210: perApur até o mês corrente (procEmi 2, 4 e 22: até 2 meses depois);
//   REGRA_VALIDA_DT_PGTO             S-1210, tpPgto 1, 4 e 5: o mês do pagamento não é anterior ao perRef;
//   REGRA_ADMISSAO_VALIDA_DT_ADM     S-2200: admissão até 30 dias depois de hoje; limites das categorias 103, 105, 107/108;
//   REGRA_ADMISSAO_VALIDA_DURACAO_CONTRATO  S-2200: categoria 102 a prazo, até 60 dias;
//   REGRA_AFASTAMENTO                S-2230: o lote não leva dois afastamentos do mesmo vínculo com a mesma data;
//   REGRA_VALIDA_DT_FUTURA           tabelas: início e fim da validade não podem ser posteriores ao mês do envio.
// E as que precisam das rubricas da empresa (S-1010 do Consultor), em regrasDasRubricas:
//   REGRA_DEMONSTRATIVO              por demonstrativo: vencimentos >= descontos; contribuição do segurado (codIncCP 31,
//                                    32, 34, 35; no RPPS codIncCPRP 31, 32) não fica negativa; rubrica no S-1010 vigente;
//   REGRA_DESCONTO_IRRF_POSITIVO     IRRF retido (codIncIRRF 31 a 34) não fica negativo (o S-1210 do pagamento é recusado);
//   REGRA_RUBRICA_COMPATIVEL_DECTERCEIRO  13º só com as incidências da lista oficial (o governo devolve alerta);
//   REGRA_RUBRICA_COMPATIVEL_RESC    FGTS rescisório (codIncFGTS 21, 93) só no S-2299/S-2399 ou em períodos anteriores.
// Puro: sem rede, sem Firebase.

import type { Achado, EventoLote } from './preVoo';
import { vigenciaEm, type DadosRubrica, type Rubrica } from '../cadastros/rubricas';

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodificar = (t: string) => t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, c: string) =>
    c[0] === '#' ? String.fromCodePoint(c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10)) : ENT[c] ?? m);
const pegar = (xml: string, tag: string) => (xml.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`)) || [])[1]?.trim() ?? '';
const todos = (xml: string, tag: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${tag}>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, 'g'))].map(m => m[1]);
const br = (d: string) => d.split('-').reverse().join('/');
const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const somarMeses = (comp: string, n: number) => { const [a, m] = comp.split('-').map(Number); const t = a * 12 + m - 1 + n; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };

/** Caractere aceito pela REGRA_CARACTERE_ESPECIAL: ASCII visível, o espaço e os do Latin-1 da lista oficial. */
const LATIN1_ACEITOS = new Set([0xA1, 0xA2, 0xA3, 0xA5, 0xA7, 0xA9, 0xAA, 0xAB, 0xAC, 0xAE, 0xAF, 0xB0, 0xB1, 0xB2, 0xB3, 0xB5, 0xB6, 0xB7, 0xB9, 0xBA, 0xBB]);
export const caractereAceito = (ch: string) => {
    const c = ch.codePointAt(0)!;
    return (c >= 0x20 && c <= 0x7E) || LATIN1_ACEITOS.has(c) || (c >= 0xC0 && c <= 0xFF);
};

/** Textos dos campos do evento (sem a assinatura), com o nome do campo. */
function campos(xml: string): { tag: string; valor: string }[] {
    const sem = xml.replace(/<(?:\w+:)?Signature[\s\S]*?<\/(?:\w+:)?Signature>/g, '');
    return [...sem.matchAll(/<(?:\w+:)?(\w+)(?:\s[^>]*)?>([^<]+)<\/(?:\w+:)?\1>/g)].map(m => ({ tag: m[1], valor: decodificar(m[2]) }));
}

const TABELAS = new Set(['S-1000', 'S-1005', 'S-1010', 'S-1020', 'S-1070']);
const REMUNERACAO = new Set(['S-1200', 'S-1202', 'S-1207']);
const mostrar = (ch: string) => (ch === '\t' ? 'tab' : ch === '\n' || ch === '\r' ? 'enter' : ch === ' ' ? 'espaço não separável' : `"${ch}" (U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`);

/** Regras oficiais de um evento. `hoje` em AAAA-MM-DD (data do envio, no fuso de São Paulo). */
export function regrasOficiaisDoEvento(e: EventoLote, hoje: string): Achado[] {
    const out: Achado[] = [];
    if (e.erro || !e.xml) return out;
    const rotulo = `${e.tipo || e.nome}${e.perApur ? ` (${e.perApur})` : ''}`;
    const bloq = (regra: string, mensagem: string) => out.push({ nivel: 'bloqueio', regra, mensagem: `${rotulo}: ${mensagem} (${regra}).`, eventoId: e.id });
    const xml = e.xml;
    const mesHoje = hoje.slice(0, 7);

    // Caracteres: um achado por campo, no máximo 5 por evento.
    let ruins = 0;
    for (const { tag, valor } of campos(xml)) {
        if (ruins >= 5) break;
        const errado = [...valor].find(ch => !caractereAceito(ch));
        if (errado) { bloq('REGRA_CARACTERE_ESPECIAL', `o campo ${tag} tem ${mostrar(errado)}, que o eSocial não aceita`); ruins++; }
        else if (valor !== valor.trim()) { bloq('REGRA_CARACTERE_ESPECIAL', `o campo ${tag} tem espaço no início ou no fim`); ruins++; }
    }

    if (REMUNERACAO.has(e.tipo) && e.perApur) {
        const ind = pegar(xml, 'indApuracao');
        if (ind === '1' && e.perApur > mesHoje) bloq('REGRA_VALIDA_PERIODO_APURACAO', `remuneração mensal de ${e.perApur} enviada antes do próprio mês`);
        if (ind === '2') {
            if (e.perApur > hoje.slice(0, 4)) bloq('REGRA_VALIDA_PERIODO_APURACAO', `13º de ${e.perApur} só no próprio ano`);
            if (hoje < `${e.perApur}-12-01`) bloq('REGRA_REMUN_ANUAL_DEZEMBRO', `remuneração anual de ${e.perApur} só a partir de 01/12/${e.perApur}`);
        }
    }

    if (e.tipo === 'S-1210' && e.perApur) {
        const procEmi = pegar(xml, 'procEmi');
        const limite = ['2', '4', '22'].includes(procEmi) ? somarMeses(mesHoje, 2) : mesHoje;
        const perMes = e.perApur.length === 4 ? `${e.perApur}-12` : e.perApur;
        if (perMes > limite) bloq('REGRA_VALIDA_PER_APUR_PGTO', `pagamento do período ${e.perApur} enviado antes do período`);
        for (const p of todos(xml, 'infoPgto')) {
            const tp = pegar(p, 'tpPgto'); const perRef = pegar(p, 'perRef'); const dt = pegar(p, 'dtPgto');
            const ref = perRef.length === 4 ? `${perRef}-12` : perRef;
            if (['1', '4', '5'].includes(tp) && /^\d{4}-\d{2}-\d{2}$/.test(dt) && /^\d{4}-\d{2}$/.test(ref) && dt.slice(0, 7) < ref) {
                bloq('REGRA_VALIDA_DT_PGTO', `pagamento em ${br(dt)} anterior ao período de referência ${perRef}`);
            }
        }
    }

    if (e.tipo === 'S-2200') {
        const dtAdm = pegar(xml, 'dtAdm'); const categ = pegar(xml, 'codCateg');
        if (/^\d{4}-\d{2}-\d{2}$/.test(dtAdm)) {
            if (dtAdm > somarDias(hoje, 30)) bloq('REGRA_ADMISSAO_VALIDA_DT_ADM', `admissão em ${br(dtAdm)}: no máximo 30 dias depois de hoje`);
            if (categ === '103' && dtAdm < '2000-12-20') bloq('REGRA_ADMISSAO_VALIDA_DT_ADM', 'aprendiz (103) com admissão antes de 20/12/2000');
            if (categ === '105' && dtAdm < '1998-01-22') bloq('REGRA_ADMISSAO_VALIDA_DT_ADM', 'categoria 105 com admissão antes de 22/01/1998');
            if ((categ === '107' || categ === '108') && dtAdm > '2020-04-20') bloq('REGRA_ADMISSAO_VALIDA_DT_ADM', `categoria ${categ} (verde e amarelo) com admissão depois de 20/04/2020`);
            const dtTerm = pegar(todos(xml, 'duracao')[0] ?? '', 'dtTerm');
            if (categ === '102' && pegar(xml, 'tpContr') === '2' && /^\d{4}-\d{2}-\d{2}$/.test(dtTerm) && dtTerm > somarDias(dtAdm, 60)) {
                bloq('REGRA_ADMISSAO_VALIDA_DURACAO_CONTRATO', `contrato rural por pequeno prazo (102) até ${br(dtTerm)}: no máximo 60 dias da admissão`);
            }
        }
    }

    if (TABELAS.has(e.tipo)) {
        for (const tag of ['iniValid', 'fimValid']) {
            for (const v of todos(xml, tag).map(x => x.trim()).filter(x => /^\d{4}-\d{2}$/.test(x))) {
                if (v > mesHoje) bloq('REGRA_VALIDA_DT_FUTURA', `${tag === 'iniValid' ? 'início' : 'fim'} da validade em ${v}, depois do mês do envio (${mesHoje})`);
            }
        }
    }
    return out;
}

/** Regras oficiais que olham o lote inteiro. */
export function regrasOficiaisDoLote(eventos: EventoLote[]): Achado[] {
    const out: Achado[] = [];
    const vistos = new Map<string, string>();
    for (const e of eventos.filter(x => x.tipo === 'S-2230' && !x.erro && x.xml)) {
        const mat = pegar(e.xml, 'matricula') || pegar(e.xml, 'codCateg');
        for (const [tag, rot] of [['dtIniAfast', 'início'], ['dtTermAfast', 'fim']] as const) {
            const d = pegar(e.xml, tag);
            if (!d) continue;
            const k = `${e.cpf ?? ''}|${mat}|${tag}|${d}`;
            if (vistos.has(k)) out.push({ nivel: 'bloqueio', regra: 'REGRA_AFASTAMENTO', mensagem: `S-2230: dois afastamentos do mesmo vínculo com a mesma data de ${rot} (${br(d)}) no lote (REGRA_AFASTAMENTO).`, eventoId: e.id });
            else vistos.set(k, e.id);
        }
    }
    return out;
}

// ---------- Regras que dependem das rubricas da empresa (S-1010) ----------

/** Eventos com demonstrativo de valores (dmDev) e a tag dos itens de cada um. */
const TAG_DO_ITEM: Record<string, string> = { 'S-1200': 'itensRemun', 'S-1202': 'itensRemun', 'S-1207': 'itens', 'S-2299': 'detVerbas', 'S-2399': 'detVerbas' };
export const EVENTOS_COM_RUBRICAS = new Set(Object.keys(TAG_DO_ITEM));
const RGPS = new Set(['S-1200', 'S-2299', 'S-2399']);

const CP_SEGURADO = [31, 32, 34, 35];
const CPRP_SEGURADO = [31, 32];
const IRRF_RETIDO = [31, 32, 33, 34];
const DEC_CP = new Set([0, 1, 12, 14, 16, 22, 26, 32, 92, 94, 96, 98]);
const DEC_CPRP = new Set([0, 12, 32, 91, 92]);
const DEC_IRRF = new Set([0, 1, 9, 12, 14, 32, 34, 42, 47, 52, 54, 62, 64, 68, 71, 77, 79, 81, 82, 83, 92, 94, 9012, 9014, 9032, 9034, 9054, 9832, 9834, 9042, 9047, 9052, 9062, 9064]);
const DEC_FGTS = new Set([0, 12, 92]);
const FGTS_RESCISORIO = new Set([21, 93]);

/** Código de incidência como número; vazio fica NaN (ausente não é zero). */
const inc = (c: string | undefined) => (c && /^\d+$/.test(c.trim()) ? Number(c) : NaN);
const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mesBr = (comp: string) => comp.split('-').reverse().join('/');

interface ItemDoDemonstrativo { codRubr: string; ideTabRubr: string; centavos: number; competencia: string; anterior: boolean }

/** Itens de um dmDev: os do período de apuração na competência do evento; os de infoPerAnt no seu perRef. */
function itensDoDemonstrativo(dm: string, tag: string, competencia: string): ItemDoDemonstrativo[] {
    const out: ItemDoDemonstrativo[] = [];
    const ler = (bloco: string, comp: string, anterior: boolean) => {
        for (const it of todos(bloco, tag)) out.push({ codRubr: pegar(it, 'codRubr'), ideTabRubr: pegar(it, 'ideTabRubr'), centavos: centavos(Number(pegar(it, 'vrRubr')) || 0), competencia: comp, anterior });
    };
    for (const b of todos(dm, 'infoPerApur')) ler(b, competencia, false);
    for (const b of todos(dm, 'infoPerAnt')) {
        for (const per of todos(b, 'idePeriodo')) { const ref = pegar(per, 'perRef'); ler(per, ref.length === 4 ? `${ref}-12` : ref, true); }
    }
    return out;
}

/** Competência do período de apuração: perApur (anual = dezembro); no S-2299 o mês do desligamento; no S-2399 o do término. */
function competenciaDoEvento(e: EventoLote): string {
    const d = e.tipo === 'S-2299' ? pegar(e.xml, 'dtDeslig') : e.tipo === 'S-2399' ? pegar(e.xml, 'dtTerm') : '';
    if (d) return /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : '';
    return e.perApur.length === 4 ? `${e.perApur}-12` : /^\d{4}-\d{2}$/.test(e.perApur) ? e.perApur : '';
}

/**
 * Regras oficiais que precisam das rubricas (S-1010) da empresa. Rubrica que o Consultor não tem (ou sem validade na
 * competência) vira alerta e o demonstrativo não tem as somas conferidas: o S-1010 pode estar só no eSocial.
 */
export function regrasDasRubricas(e: EventoLote, rubricas: Rubrica[]): Achado[] {
    const out: Achado[] = [];
    const tag = TAG_DO_ITEM[e.tipo];
    if (!tag || e.erro || !e.xml) return out;
    const competencia = competenciaDoEvento(e);
    if (!competencia) return out;
    const rotulo = `${e.tipo}${e.perApur ? ` (${e.perApur})` : ''}`;
    const achar = (nivel: Achado['nivel'], regra: string, mensagem: string) => out.push({ nivel, regra, mensagem: `${rotulo}: ${mensagem} (${regra}).`, eventoId: e.id });
    if (!rubricas.length) {
        achar('aviso', 'REGRA_DEMONSTRATIVO', 'a empresa não tem rubricas (S-1010) no Consultor; as regras oficiais que dependem delas não foram conferidas');
        return out;
    }
    const porChave = new Map(rubricas.map(r => [`${r.codRubr}|${r.ideTabRubr}`, r]));
    const decTerceiro = e.tipo !== 'S-2299' && e.tipo !== 'S-2399' && pegar(e.xml, 'indApuracao') === '2';
    const avisados = new Set<string>();
    const avisarUmaVez = (chave: string, regra: string, mensagem: string) => { if (!avisados.has(chave)) { avisados.add(chave); achar('aviso', regra, mensagem); } };

    for (const dm of todos(e.xml, 'dmDev')) {
        const nome = `demonstrativo ${pegar(dm, 'ideDmDev') || 'sem identificação'}`;
        const itens = itensDoDemonstrativo(dm, tag, competencia);
        const lidos: { item: ItemDoDemonstrativo; dados: DadosRubrica }[] = [];
        const faltam: string[] = [];
        for (const item of itens) {
            const r = porChave.get(`${item.codRubr}|${item.ideTabRubr}`);
            const v = r && vigenciaEm(r, item.competencia);
            if (v) lidos.push({ item, dados: v.dados });
            else faltam.push(`${item.codRubr} (tabela ${item.ideTabRubr}) ${r ? `sem validade em ${mesBr(item.competencia)}` : 'não cadastrada'}`);
        }
        if (faltam.length) {
            achar('aviso', 'REGRA_DEMONSTRATIVO', `${nome}: rubrica ${[...new Set(faltam)].join(', ')} no S-1010 do Consultor; o eSocial recusa rubrica fora da tabela de rubricas dele, e as somas deste demonstrativo não foram conferidas`);
        } else {
            const soma = (filtro: (d: DadosRubrica) => boolean, tipos: string[]) => lidos.filter(x => filtro(x.dados) && tipos.includes(x.dados.tpRubr)).reduce((t, x) => t + x.item.centavos, 0);
            const venc = soma(() => true, ['1']); const desc = soma(() => true, ['2']);
            if (venc < desc) achar('bloqueio', 'REGRA_DEMONSTRATIVO', `${nome}: descontos (R$ ${reais(desc)}) maiores que os vencimentos (R$ ${reais(venc)})`);
            const [campo, codigos] = RGPS.has(e.tipo) ? ['codIncCP', CP_SEGURADO] as const : ['codIncCPRP', CPRP_SEGURADO] as const;
            for (const c of codigos) {
                const devolve = soma(d => inc(d[campo]) === c, ['1', '3']); const retem = soma(d => inc(d[campo]) === c, ['2', '4']);
                if (devolve > retem) achar('bloqueio', 'REGRA_DEMONSTRATIVO', `${nome}: rubricas com ${campo} ${c} devolvem R$ ${reais(devolve)} e descontam R$ ${reais(retem)}; a contribuição do segurado não pode ficar negativa`);
            }
            for (const c of IRRF_RETIDO) {
                const devolve = soma(d => inc(d.codIncIRRF) === c, ['1', '3']); const retem = soma(d => inc(d.codIncIRRF) === c, ['2', '4']);
                if (devolve > retem) achar('aviso', 'REGRA_DESCONTO_IRRF_POSITIVO', `${nome}: rubricas com codIncIRRF ${c} devolvem R$ ${reais(devolve)} e retêm R$ ${reais(retem)}; o IRRF retido fica negativo e o S-1210 que pagar este demonstrativo será recusado`);
            }
        }
        for (const { item, dados } of lidos) {
            const qual = `rubrica ${item.codRubr}`;
            if (decTerceiro) {
                const fora = e.tipo === 'S-1200'
                    ? [!DEC_CP.has(inc(dados.codIncCP)) && `codIncCP ${dados.codIncCP || 'vazio'}`, !DEC_IRRF.has(inc(dados.codIncIRRF)) && `codIncIRRF ${dados.codIncIRRF || 'vazio'}`, !DEC_FGTS.has(inc(dados.codIncFGTS)) && `codIncFGTS ${dados.codIncFGTS || 'vazio'}`, dados.natRubr === '9253' && 'natureza 9253']
                    : [!DEC_CPRP.has(inc(dados.codIncCPRP)) && `codIncCPRP ${dados.codIncCPRP || 'vazio'}`, !DEC_IRRF.has(inc(dados.codIncIRRF)) && `codIncIRRF ${dados.codIncIRRF || 'vazio'}`];
                const motivos = fora.filter(Boolean);
                if (motivos.length) avisarUmaVez(`13|${item.codRubr}|${item.ideTabRubr}`, 'REGRA_RUBRICA_COMPATIVEL_DECTERCEIRO', `${qual} no 13º com ${motivos.join(', ')}, fora das incidências aceitas no 13º; o eSocial devolve alerta`);
            }
            if (e.tipo === 'S-1200' && !item.anterior && FGTS_RESCISORIO.has(inc(dados.codIncFGTS))) {
                avisarUmaVez(`resc|${item.codRubr}|${item.ideTabRubr}`, 'REGRA_RUBRICA_COMPATIVEL_RESC', `${qual} com codIncFGTS ${dados.codIncFGTS} (verba rescisória) no período de apuração; ela vai no S-2299/S-2399 ou em períodos anteriores; o eSocial devolve alerta`);
            }
        }
    }
    return out;
}
