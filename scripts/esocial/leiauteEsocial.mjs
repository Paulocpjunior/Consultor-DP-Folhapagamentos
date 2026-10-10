// scripts/esocial/leiauteEsocial.mjs
//
// Saúde do eSocial, etapa 5 (parte pura, testada no Vitest): da página da documentação técnica do eSocial,
// tira os links que importam (leiautes, notas técnicas, esquemas XSD, manuais), as versões de leiaute citadas
// e o que é novo desde a última verificação.

const RELEVANTE = /(leiaute|nota\s*t[eé]cnica|\bnt\b|xsd|esquema|schema|manual|mos\b|vers[aã]o\s*s-?\d|s-\d\.\d)/i;

/** Links da página (texto e endereço absoluto), só os relevantes, sem repetir. */
export function linksRelevantes(html, base) {
    const out = new Map();
    for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const titulo = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
        let url;
        try { url = new URL(m[1], base).toString(); } catch { continue; }
        if (!titulo || !RELEVANTE.test(`${titulo} ${url}`)) continue;
        if (!out.has(url)) out.set(url, { titulo: titulo.slice(0, 300), url });
    }
    return [...out.values()].sort((a, b) => a.url.localeCompare(b.url));
}

/** Versões de leiaute citadas (S-1.3, v_S_01_03_00…), da maior para a menor. */
export function versoesCitadas(itens) {
    const vs = new Set();
    for (const i of itens) {
        const t = `${i.titulo} ${i.url}`;
        for (const m of t.matchAll(/\bS[-\s]?(\d)\.(\d{1,2})\b/gi)) vs.add(`S-${Number(m[1])}.${Number(m[2])}`);
        for (const m of t.matchAll(/v_S_(\d\d)_(\d\d)_\d\d/gi)) vs.add(`S-${Number(m[1])}.${Number(m[2])}`);
        for (const m of t.matchAll(/s-(\d)-(\d{1,2})(?![\d])/gi)) vs.add(`S-${Number(m[1])}.${Number(m[2])}`);
    }
    return [...vs].sort(compararVersao).reverse();
}

export function compararVersao(a, b) {
    const [a1, a2] = a.replace('S-', '').split('.').map(Number);
    const [b1, b2] = b.replace('S-', '').split('.').map(Number);
    return a1 - b1 || a2 - b2;
}

/** O que é novo em relação aos itens da verificação anterior. */
export function novidades(atuais, anteriores) {
    const vistos = new Set((anteriores ?? []).map(i => i.url));
    return atuais.filter(i => !vistos.has(i.url));
}

/** Texto simples de uma página HTML, para o resumo. */
export function textoDaPagina(html, max = 8000) {
    return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim().slice(0, max);
}
