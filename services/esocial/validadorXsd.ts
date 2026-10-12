// services/esocial/validadorXsd.ts
//
// Pré-voo do eSocial, parte 1: o evento passa pelo XSD oficial do leiaute vigente (S-1.3) ANTES de ir para o
// governo. Os XSDs ficam em public/esocial-xsd/v_S_01_03_00 (pacote oficial do eSocial) e o validador é o
// libxml2 (xmllint) compilado para WebAssembly, que roda no navegador. A assinatura não é cobrada aqui: quem
// assina é o CFI, com o A1 do cofre, depois desta conferência.
//
// O XSD muda por data de implantação, dentro do mesmo leiaute (NT 07/2026 rev.: 26/10, 23/11 e 14/12/2026 e
// 18/01/2027). Cada pacote do gov.br fica numa pasta com só os arquivos que mudaram em relação ao anterior; o
// arquivo que não está no pacote vem do anterior. O pacote é o da data do envio, no ambiente (a produção restrita
// recebe antes).

export const VERSAO_XSD = 'v_S_01_03_00';
export const ROTULO_VERSAO_XSD = 'S-1.3';

export interface PacoteXsd {
    pasta: string;
    /** Implantação em produção e em produção restrita (AAAA-MM-DD). */
    producao: string; restrita: string;
    /** Arquivos que mudaram em relação ao pacote anterior (o primeiro pacote tem todos). */
    arquivos: string[] | 'todos';
    origem: string;
}

/** Pacotes de XSD do leiaute S-1.3, do mais antigo ao mais novo (documentação técnica do eSocial, gov.br). */
export const PACOTES_XSD: PacoteXsd[] = [
    { pasta: VERSAO_XSD, producao: '2026-07-01', restrita: '2026-07-01', arquivos: 'todos', origem: 'até NT 06/2026, CNPJ alfanumérico (produção em 01/07/2026)' },
    { pasta: `${VERSAO_XSD}_2026-10-26`, producao: '2026-10-26', restrita: '2026-10-13', origem: 'até NT 07/2026 rev. (produção em 26/10/2026)',
        arquivos: ['evtAdmPrelim.xsd', 'evtAdmissao.xsd', 'evtAfastTemp.xsd', 'evtAltCadastral.xsd', 'evtAltContratual.xsd', 'evtAnotJud.xsd', 'evtCdBenAlt.xsd', 'evtCdBenIn.xsd', 'evtCdBenTerm.xsd', 'evtCessao.xsd', 'evtDeslig.xsd', 'evtIrrfBenef.xsd', 'evtProcTrab.xsd', 'evtRmnRPPS.xsd', 'evtTSVInicio.xsd', 'evtTSVTermino.xsd', 'tipos.xsd'] },
    { pasta: `${VERSAO_XSD}_2026-11-23`, producao: '2026-11-23', restrita: '2026-11-09', origem: 'até NT 07/2026 rev. (produção em 23/11/2026)',
        arquivos: ['evtContProc.xsd', 'evtDeslig.xsd', 'evtInfoEmpregador.xsd', 'evtPgtos.xsd', 'evtTabRubrica.xsd', 'tipos.xsd'] },
    { pasta: `${VERSAO_XSD}_2026-12-14`, producao: '2026-12-14', restrita: '2026-12-07', origem: 'até NT 07/2026 rev. (produção em 14/12/2026)',
        arquivos: ['evtBasesTrab.xsd', 'evtCS.xsd', 'evtContProc.xsd', 'evtInfoEmpregador.xsd', 'evtTabRubrica.xsd'] },
    // A NT não traz a data da produção restrita desta etapa: vale a da produção.
    { pasta: `${VERSAO_XSD}_2027-01-18`, producao: '2027-01-18', restrita: '2027-01-18', origem: 'até NT 07/2026 rev. (produção em 18/01/2027)',
        arquivos: ['evtAnotJud.xsd'] },
];

/** Índice do pacote vigente na data (AAAA-MM-DD) e ambiente (1 produção, 2 produção restrita). */
export function pacoteXsdEm(data: string, tpAmb: 1 | 2 = 1): number {
    let i = 0;
    PACOTES_XSD.forEach((p, k) => { if ((tpAmb === 2 ? p.restrita : p.producao) <= data) i = k; });
    return i;
}

/** Pasta de onde vem o arquivo no pacote: a do próprio pacote, se ele mudou ali, ou a do anterior que o tem. */
export function pastaDoArquivo(nome: string, pacote: number): string {
    for (let k = pacote; k > 0; k--) { const a = PACOTES_XSD[k].arquivos; if (a === 'todos' || a.includes(nome)) return PACOTES_XSD[k].pasta; }
    return PACOTES_XSD[0].pasta;
}

export interface ErroXsd { mensagem: string; original: string }
export interface ResultadoXsd { valido: boolean; erros: ErroXsd[]; /** Sem como validar (XSD ou validador indisponível). */ indisponivel?: string; }

/** Lê um XSD. A pasta é a do pacote (sem ela, a do primeiro pacote). */
export type LerXsd = (nome: string, pasta?: string) => Promise<string>;

const semNs = (s: string) => s.replace(/\{[^}]*\}/g, '');
const lista = (s: string) => semNs(s).split(',').map(x => x.trim()).filter(Boolean);

/** Mensagem do libxml em português, sem os namespaces. */
export function traduzirErroXsd(bruta: string): string {
    const m = bruta.replace(/^.*?Schemas validity error\s*:\s*/, '').replace(/^.*?Schemas parser error\s*:\s*/, '').trim();
    const el = (/^Element '([^']+)'/.exec(m)?.[1] ?? '');
    const atributo = /^Element '[^']+', attribute '([^']+)'/.exec(m)?.[1];
    const campo = atributo ? `${semNs(el)} ${semNs(atributo)}` : semNs(el).replace(/^@/, '');
    const resto = m.replace(/^Element '[^']+'(?:, attribute '[^']+')?:\s*/, '');
    let r: RegExpExecArray | null;
    if ((r = /^Missing child element\(s\)\. Expected is(?: one of)? \( (.+) \)\.?$/.exec(resto))) return `Falta ${lista(r[1]).map(x => `<${x}>`).join(' ou ')} dentro de <${campo}>.`;
    if ((r = /^This element is not expected\. Expected is(?: one of)? \( (.+) \)\.?$/.exec(resto))) return `<${campo}> fora de lugar ou não permitido aqui; o leiaute espera ${lista(r[1]).map(x => `<${x}>`).join(' ou ')}.`;
    if (/^This element is not expected\.?$/.test(resto)) return `<${campo}> não é permitido neste ponto do evento.`;
    if ((r = /^\[facet 'pattern'\] The value '([^']*)' is not accepted by the pattern/.exec(resto))) return `<${campo}>: o valor "${r[1]}" está fora do formato do leiaute.`;
    if ((r = /^\[facet 'enumeration'\] The value '([^']*)' is not an element of the set \{(.*)\}/.exec(resto))) {
        const ops = r[2].split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
        return `<${campo}>: o valor "${r[1]}" não está entre os permitidos (${ops.slice(0, 12).join(', ')}${ops.length > 12 ? '…' : ''}).`;
    }
    if ((r = /^\[facet 'maxLength'\] The value has a length of '(\d+)'; this exceeds the allowed maximum length of '(\d+)'/.exec(resto))) return `<${campo}>: tem ${r[1]} caracteres; o máximo é ${r[2]}.`;
    if ((r = /^\[facet 'length'\] The value '[^']*' has a length of '(\d+)'; this differs from the allowed length of '(\d+)'/.exec(resto))) return `<${campo}>: tem ${r[1]} caracteres; deve ter ${r[2]}.`;
    if ((r = /^\[facet 'minLength'\] The value has a length of '(\d+)'; this underruns the allowed minimum length of '(\d+)'/.exec(resto))) return `<${campo}>: tem ${r[1]} caractere(s); o mínimo é ${r[2]}.`;
    if ((r = /^\[facet '(?:min|max)(?:In|Ex)clusive'\] The value '([^']*)'/.exec(resto))) return `<${campo}>: o valor "${r[1]}" está fora do limite permitido.`;
    if ((r = /^\[facet '(?:totalDigits|fractionDigits)'\] The value '([^']*)'/.exec(resto))) return `<${campo}>: o valor "${r[1]}" tem dígitos demais (inteiros ou decimais).`;
    if ((r = /^'([^']*)' is not a valid value of the (?:atomic|local atomic|union|list) type/.exec(resto))) return `<${campo}>: o valor "${r[1]}" é inválido para este campo.`;
    if (/No matching global declaration available for the validation root/.test(m)) return `O evento não é da versão ${ROTULO_VERSAO_XSD} do leiaute (a vigente).`;
    if (/parser error/i.test(bruta)) return `XML malformado: ${semNs(bruta.replace(/^.*?parser error\s*:\s*/, '')).trim()}`;
    return campo ? `<${campo}>: ${semNs(resto)}` : semNs(m);
}

/** A assinatura é do CFI (depois desta conferência): a falta dela não é erro aqui. */
const ehFaltaDeAssinatura = (bruta: string) => /Missing child element\(s\)\. Expected is \( \{http:\/\/www\.w3\.org\/2000\/09\/xmldsig#\}Signature \)/.test(bruta);

/** Elemento do evento (evtRemun, evtPgtos…) e a versão do leiaute no namespace. */
export function elementoEVersao(xml: string): { elemento: string; versao: string } {
    const m = /<(?:\w+:)?eSocial\b[^>]*\bxmlns(?::\w+)?="http:\/\/www\.esocial\.gov\.br\/schema\/evt\/(evt\w+)\/(v_S_\d\d_\d\d_\d\d)"/.exec(xml);
    if (m) return { elemento: m[1], versao: m[2] };
    const e = /<(?:\w+:)?(evt\w+)\b/.exec(xml);
    return { elemento: e?.[1] ?? '', versao: '' };
}

const cache = new Map<string, Promise<string>>();
const lerDoSite: LerXsd = async (nome, pasta = VERSAO_XSD) => {
    const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');
    const r = await fetch(`${base}esocial-xsd/${pasta}/${nome}`);
    if (!r.ok) throw new Error(`XSD ${nome}: HTTP ${r.status}`);
    return r.text();
};
const lerComCache = (ler: LerXsd, nome: string, pasta: string) => {
    const k = `${pasta}/${nome}`;
    if (!cache.has(k)) cache.set(k, ler(nome, pasta).catch(e => { cache.delete(k); throw e; }));
    return cache.get(k)!;
};
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/** Valida um evento (sem assinatura) pelo XSD oficial do pacote vigente na data do envio (padrão: hoje, produção). */
export async function validarPeloXsd(xml: string, ler: LerXsd = lerDoSite, quando: { data?: string; tpAmb?: 1 | 2 } = {}): Promise<ResultadoXsd> {
    const pacote = pacoteXsdEm(quando.data ?? hojeSp(), quando.tpAmb ?? 1);
    const pasta = (nome: string) => pastaDoArquivo(nome, pacote);
    const { elemento, versao } = elementoEVersao(xml);
    if (!elemento) return { valido: false, erros: [{ mensagem: 'Não é um evento do eSocial (<eSocial><evt…>).', original: '' }] };
    if (versao && versao !== VERSAO_XSD) {
        const v = versao.replace(/^v_S_(\d\d)_(\d\d)_.*/, (_, a, b) => `S-${Number(a)}.${Number(b)}`);
        return { valido: false, erros: [{ mensagem: `Evento no leiaute ${v}; o vigente é o ${ROTULO_VERSAO_XSD}. Gere o evento de novo na versão vigente.`, original: versao }] };
    }
    let schema: string, tipos: string, dsig: string;
    try {
        [schema, tipos, dsig] = await Promise.all([`${elemento}.xsd`, 'tipos.xsd', 'xmldsig-core-schema.xsd'].map(n => lerComCache(ler, n, pasta(n))));
    } catch (e) {
        return { valido: true, erros: [], indisponivel: `XSD de ${elemento} não carregou (${(e as Error).message}).` };
    }
    let validateXML: typeof import('xmllint-wasm').validateXML;
    try { ({ validateXML } = await import('xmllint-wasm')); } catch (e) { return { valido: true, erros: [], indisponivel: `validador não carregou (${(e as Error).message}).` }; }
    const r = await validateXML({
        xml: [{ fileName: 'evento.xml', contents: xml.replace(/^﻿/, '') }],
        schema: [{ fileName: `${elemento}.xsd`, contents: schema }],
        preload: [{ fileName: 'tipos.xsd', contents: tipos }, { fileName: 'xmldsig-core-schema.xsd', contents: dsig }],
    });
    const vistos = new Set<string>();
    const erros: ErroXsd[] = [];
    for (const e of r.errors) {
        const bruta = e.rawMessage ?? e.message;
        if (ehFaltaDeAssinatura(bruta)) continue;
        const mensagem = traduzirErroXsd(bruta);
        if (vistos.has(mensagem)) continue;
        vistos.add(mensagem); erros.push({ mensagem, original: bruta });
    }
    // O libxml repete a falha de formato como "valor inválido do tipo": fica só a mais clara.
    const finais = erros.filter(e => !/ é inválido para este campo\.$/.test(e.mensagem)
        || !erros.some(o => o !== e && o.mensagem.startsWith(e.mensagem.replace(/ é inválido para este campo\.$/, ''))));
    return { valido: finais.length === 0, erros: finais };
}
