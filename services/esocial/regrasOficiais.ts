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
//   REGRA_RUBRICA_COMPATIVEL_RESC    FGTS rescisório (codIncFGTS 21, 93) só no S-2299/S-2399 ou em períodos anteriores;
//   REGRA_RUBRICA_COMPATIVEL_CATEGORIA  rubrica compatível com a categoria do trabalhador (itens 1a, 1b, 2a-2c, 2e, 4-6).
// E as validações da NT 07/2026 rev. que entram por data (produção; a produção restrita recebe antes):
//   26/10/2026  S-2200: infoCota não é mais informado para admissão/transferência/mudança de CPF desde 26/10/2026;
//   23/11/2026  S-2200/S-2206: horas semanais dentro do limite do tempo parcial; 12x36 sem tempo parcial;
//               S-1010: observação obrigatória na rubrica informativa dedutora (tpRubr 4);
//               S-1000: indOptRegEletron não é informado com validade desde 2026-02;
//               CPF de dependente conferido na base da Receita (aqui: dígitos verificadores).
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

/** Implantação das etapas da NT 07/2026 rev. (produção e produção restrita). */
export const ETAPAS_NT07 = {
    '2026-10-26': { producao: '2026-10-26', restrita: '2026-10-13' },
    '2026-11-23': { producao: '2026-11-23', restrita: '2026-11-09' },
    '2026-12-14': { producao: '2026-12-14', restrita: '2026-12-07' },
} as const;
/** A etapa já vale na data do envio, no ambiente? */
export const etapaValendo = (etapa: keyof typeof ETAPAS_NT07, hoje: string, tpAmb: 1 | 2 = 1) => hoje >= ETAPAS_NT07[etapa][tpAmb === 2 ? 'restrita' : 'producao'];

/** CPF com os dígitos verificadores certos (11 dígitos, não repetidos). */
export function cpfComDigitosValidos(cpf: string): boolean {
    const d = cpf.replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

const EVENTOS_COM_CPF_DEP = new Set(['S-1210', 'S-2200', 'S-2205', 'S-2300', 'S-2400', 'S-2405', 'S-2501']);
const LIMITE_TEMPO_PARCIAL: Record<string, number> = { '1': 25, '2': 30, '3': 26 };

/** Regras oficiais de um evento. `hoje` em AAAA-MM-DD (data do envio, no fuso de São Paulo); `tpAmb` o ambiente. */
export function regrasOficiaisDoEvento(e: EventoLote, hoje: string, tpAmb: 1 | 2 = 1): Achado[] {
    const out: Achado[] = [];
    if (e.erro || !e.xml) return out;
    const rotulo = `${e.tipo || e.nome}${e.perApur ? ` (${e.perApur})` : ''}`;
    const bloq = (regra: string, mensagem: string) => out.push({ nivel: 'bloqueio', regra, mensagem: `${rotulo}: ${mensagem} (${regra}).`, eventoId: e.id });
    const avisar = (regra: string, mensagem: string) => out.push({ nivel: 'aviso', regra, mensagem: `${rotulo}: ${mensagem} (${regra}).`, eventoId: e.id });
    /** Regra que entra por data: antes da implantação, alerta de que vai valer; depois, bloqueio. */
    const porEtapa = (etapa: keyof typeof ETAPAS_NT07, regra: string, mensagem: string) =>
        etapaValendo(etapa, hoje, tpAmb) ? bloq(regra, mensagem) : avisar(regra, `${mensagem}; o eSocial passa a recusar em ${br(ETAPAS_NT07[etapa][tpAmb === 2 ? 'restrita' : 'producao'])}`);
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

    // NT 07/2026 rev.
    if (e.tipo === 'S-2200' || e.tipo === 'S-2206') {
        const datas = (e.tipo === 'S-2200' ? [pegar(xml, 'dtAdm'), pegar(xml, 'dtTransf'), pegar(xml, 'dtAltCPF')] : [pegar(xml, 'dtAlteracao')]).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
        const ref = datas[datas.length - 1] ?? '';
        if (e.tipo === 'S-2200' && /<(?:\w+:)?infoCota>/.test(xml) && ref >= '2026-10-26' && etapaValendo('2026-10-26', hoje, tpAmb)) {
            bloq('NT 07/2026, S-2200 infoCota', `o campo infoCota não é mais informado para admissão, transferência ou mudança de CPF desde 26/10/2026 (aqui ${br(ref)})`);
        }
        if (ref >= '2026-11-23') {
            const tmpParc = pegar(xml, 'tmpParc'); const horas = Number(pegar(xml, 'qtdHrsSem').replace(',', '.'));
            const limite = LIMITE_TEMPO_PARCIAL[tmpParc];
            if (limite && horas > limite) porEtapa('2026-11-23', 'NT 07/2026, qtdHrsSem', `tempo parcial limitado a ${limite} horas semanais com ${horas} horas`);
            if (pegar(xml, 'tpJornada') === '2' && tmpParc && tmpParc !== '0') porEtapa('2026-11-23', 'NT 07/2026, tmpParc', 'jornada 12x36 não pode ser contrato em tempo parcial (tmpParc 0)');
        }
    }
    if (e.tipo === 'S-1010') {
        for (const d of todos(xml, 'dadosRubrica')) {
            if (pegar(d, 'tpRubr') === '4' && !pegar(d, 'observacao')) porEtapa('2026-11-23', 'NT 07/2026, S-1010 observacao', 'rubrica informativa dedutora (tpRubr 4) sem observação');
        }
    }
    if (e.tipo === 'S-1000' && /<(?:\w+:)?indOptRegEletron>/.test(xml) && (pegar(xml, 'iniValid') || '0000-00') >= '2026-02') {
        porEtapa('2026-11-23', 'NT 07/2026, S-1000 indOptRegEletron', 'indOptRegEletron não é informado com validade a partir de 2026-02');
    }
    if (EVENTOS_COM_CPF_DEP.has(e.tipo)) {
        const ruins = [...new Set(todos(xml, 'cpfDep').map(c => c.trim()).filter(c => c && !cpfComDigitosValidos(c)))];
        for (const c of ruins.slice(0, 5)) bloq('CPF do dependente', `CPF de dependente ${c} com dígitos verificadores inválidos; o eSocial confere o CPF na base da Receita`);
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

const CI_EMPREGADO = new Set(['721', '722', '723', '771']);
const IRRF_SO_EMPREGADO = new Set([12, 13, 32, 33, 42, 43, 47, 48, 52, 53, 62, 63, 64, 65, 66, 71, 76, 77, 92, 93, 9012, 9013, 9032, 9033, 9042, 9043, 9047, 9048, 9052, 9053, 9062, 9063, 9064, 9065, 9066, 9832, 9833]);
const IRRF_SO_GRUPO_EMPREGADO = new Set([14, 34, 54, 94, 9014, 9034, 9054, 9834]);

/**
 * REGRA_RUBRICA_COMPATIVEL_CATEGORIA (Anexo II do leiaute). Erro nos itens 1b, 2e, 5 e 6; alerta nos demais. Ficam de
 * fora os itens que precisam do S-1000 (1c e 2d: classTrib) e do S-2300 (3: dirigente sindical). O 1b entra em
 * 23/11/2026 (NT 07/2026 rev.); antes, alerta.
 */
function compatibilidadeComCategoria(categ: string, d: DadosRubrica, quando: { hoje?: string; tpAmb?: 1 | 2 }): [Achado['nivel'], string, string][] {
    const out: [Achado['nivel'], string, string][] = [];
    const cp = inc(d.codIncCP); const irrf = inc(d.codIncIRRF); const fgts = inc(d.codIncFGTS);
    const g = categ[0];
    if ((g === '1' || g === '2') && (cp === 34 || cp === 35)) out.push(['aviso', '1a', `com codIncCP ${d.codIncCP} (SEST/SENAT) não cabe para empregado ou avulso`]);
    if (g === '2' && (cp === 21 || cp === 22)) {
        const vale = !quando.hoje || etapaValendo('2026-11-23', quando.hoje, quando.tpAmb ?? 1);
        out.push([vale ? 'bloqueio' : 'aviso', '1b', `com codIncCP ${d.codIncCP} (salário-maternidade) não cabe para trabalhador avulso${vale ? '' : '; o eSocial passa a recusar em 23/11/2026'}`]);
    }
    if (g === '7') {
        if ([12, 32, 92, 93, 94].includes(cp) && !CI_EMPREGADO.has(categ)) out.push(['aviso', '2a', `com codIncCP ${d.codIncCP} é própria de segurado empregado`]);
        if (IRRF_SO_EMPREGADO.has(irrf) && !CI_EMPREGADO.has(categ)) out.push(['aviso', '2b', `com codIncIRRF ${d.codIncIRRF} é própria de segurado empregado`]);
        if ((cp === 34 || cp === 35) && !['711', '712', '734'].includes(categ)) out.push(['aviso', '2c', `com codIncCP ${d.codIncCP} (SEST/SENAT) só cabe para transportador autônomo`]);
        if ((cp === 21 || cp === 22) && !['721', '722', '723'].includes(categ)) out.push(['bloqueio', '2e', `com codIncCP ${d.codIncCP} (salário-maternidade) não cabe para contribuinte individual`]);
    }
    if (categ === '901' && (![0, 1].includes(cp) || fgts !== 0)) out.push(['aviso', '4', 'de estagiário precisa de codIncCP 00/01 e codIncFGTS 00']);
    if (g !== '1' && IRRF_SO_GRUPO_EMPREGADO.has(irrf)) out.push(['bloqueio', '5', `com codIncIRRF ${d.codIncIRRF} só cabe para empregado`]);
    if (g !== '1' && categ !== '721' && d.natRubr === '9253') out.push(['bloqueio', '6', 'de consignado (natureza 9253) só cabe para empregado ou diretor com FGTS']);
    return out;
}

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
export function regrasDasRubricas(e: EventoLote, rubricas: Rubrica[], quando: { hoje?: string; tpAmb?: 1 | 2 } = {}): Achado[] {
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
        const categ = pegar(dm, 'codCateg') || pegar(e.xml, 'codCateg');
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
            if (RGPS.has(e.tipo) && /^\d{3}$/.test(categ)) {
                for (const [nivel, item_, texto] of compatibilidadeComCategoria(categ, dados, quando)) {
                    const chave = `cat|${item_}|${item.codRubr}|${item.ideTabRubr}`;
                    if (avisados.has(chave)) continue;
                    avisados.add(chave);
                    achar(nivel, 'REGRA_RUBRICA_COMPATIVEL_CATEGORIA', `${qual} ${texto} (categoria ${categ}, item ${item_})`);
                }
            }
            if (e.tipo === 'S-1200' && !item.anterior && FGTS_RESCISORIO.has(inc(dados.codIncFGTS))) {
                avisarUmaVez(`resc|${item.codRubr}|${item.ideTabRubr}`, 'REGRA_RUBRICA_COMPATIVEL_RESC', `${qual} com codIncFGTS ${dados.codIncFGTS} (verba rescisória) no período de apuração; ela vai no S-2299/S-2399 ou em períodos anteriores; o eSocial devolve alerta`);
            }
        }
    }
    return out;
}
