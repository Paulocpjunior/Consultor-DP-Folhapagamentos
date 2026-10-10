// services/esocial/validadorXsd.ts
//
// Pré-voo do eSocial, parte 1: o evento passa pelo XSD oficial do leiaute vigente (S-1.3) ANTES de ir para o
// governo. Os XSDs ficam em public/esocial-xsd/v_S_01_03_00 (pacote oficial do eSocial) e o validador é o
// libxml2 (xmllint) compilado para WebAssembly, que roda no navegador. A assinatura não é cobrada aqui: quem
// assina é o CFI, com o A1 do cofre, depois desta conferência.

export const VERSAO_XSD = 'v_S_01_03_00';
export const ROTULO_VERSAO_XSD = 'S-1.3';

export interface ErroXsd { mensagem: string; original: string }
export interface ResultadoXsd { valido: boolean; erros: ErroXsd[]; /** Sem como validar (XSD ou validador indisponível). */ indisponivel?: string }

export type LerXsd = (nome: string) => Promise<string>;

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
const lerDoSite: LerXsd = async nome => {
    const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');
    const r = await fetch(`${base}esocial-xsd/${VERSAO_XSD}/${nome}`);
    if (!r.ok) throw new Error(`XSD ${nome}: HTTP ${r.status}`);
    return r.text();
};
const lerComCache = (ler: LerXsd, nome: string) => {
    const k = nome;
    if (!cache.has(k)) cache.set(k, ler(nome).catch(e => { cache.delete(k); throw e; }));
    return cache.get(k)!;
};

/** Valida um evento (sem assinatura) pelo XSD oficial. */
export async function validarPeloXsd(xml: string, ler: LerXsd = lerDoSite): Promise<ResultadoXsd> {
    const { elemento, versao } = elementoEVersao(xml);
    if (!elemento) return { valido: false, erros: [{ mensagem: 'Não é um evento do eSocial (<eSocial><evt…>).', original: '' }] };
    if (versao && versao !== VERSAO_XSD) {
        const v = versao.replace(/^v_S_(\d\d)_(\d\d)_.*/, (_, a, b) => `S-${Number(a)}.${Number(b)}`);
        return { valido: false, erros: [{ mensagem: `Evento no leiaute ${v}; o vigente é o ${ROTULO_VERSAO_XSD}. Gere o evento de novo na versão vigente.`, original: versao }] };
    }
    let schema: string, tipos: string, dsig: string;
    try {
        [schema, tipos, dsig] = await Promise.all([lerComCache(ler, `${elemento}.xsd`), lerComCache(ler, 'tipos.xsd'), lerComCache(ler, 'xmldsig-core-schema.xsd')]);
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
