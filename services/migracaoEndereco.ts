// services/migracaoEndereco.ts
//
// Troca de endereço do DP (GitHub Pages → dp.spassessoriacontabil.com.br, docs/dominio-dp.md). O navegador guarda o
// tema e a empresa ativa por endereço; a página de redirecionamento do endereço antigo
// (scripts/hosting/paginaRedirecionamento.mjs) lê esses valores e os manda uma vez só, no `#migrar=` (o # não vai ao
// servidor nem no Referer), e o app grava aqui, antes de abrir, para cada pessoa cair no endereço novo como estava. Só
// as chaves da lista, sem sobrescrever o que o endereço novo já tem; o `migrar` sai da barra.

/** Chaves levadas na troca de endereço (o tema e a empresa e o período ativos de cada usuário). */
export const CHAVE_MIGRAVEL = /^(consultor-dp:tema|dp_empresa_ativa:[A-Za-z0-9]{1,128})$/;
const LIMITE = 8000;

/** Decodifica o `migrar` (base64 de JSON {chave: valor}); fora do formato, nada. */
export function lerMigracao(valor: string | null): Record<string, string> {
    if (!valor || valor.length > LIMITE) return {};
    try {
        const json = decodeURIComponent(escape(atob(valor.replace(/-/g, '+').replace(/_/g, '/'))));
        const obj = JSON.parse(json) as unknown;
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
        return Object.fromEntries(Object.entries(obj as Record<string, unknown>).filter(([k, v]) => CHAVE_MIGRAVEL.test(k) && typeof v === 'string' && v.length <= 2000)) as Record<string, string>;
    } catch { return {}; }
}

/** Grava o que veio do endereço antigo (sem sobrescrever) e tira o `migrar` do # da barra. */
export function aplicarMigracao(janela: Pick<Window, 'location' | 'history' | 'localStorage'> = window): number {
    try {
        const url = new URL(janela.location.href);
        const partes = url.hash.replace(/^#/, '').split('&').filter(Boolean);
        const item = partes.find(p => p.startsWith('migrar='));
        if (!item) return 0;
        let gravadas = 0;
        for (const [k, v] of Object.entries(lerMigracao(decodeURIComponent(item.slice('migrar='.length))))) {
            if (janela.localStorage.getItem(k) === null) { janela.localStorage.setItem(k, v); gravadas++; }
        }
        const resto = partes.filter(p => p !== item);
        janela.history.replaceState(janela.history.state, '', `${url.pathname}${url.search}${resto.length ? `#${resto.join('&')}` : ''}`);
        return gravadas;
    } catch { return 0; }
}
