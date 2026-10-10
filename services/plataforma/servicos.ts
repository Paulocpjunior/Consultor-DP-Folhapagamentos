// services/plataforma/servicos.ts
//
// Serviços externos do DP atrás de um endereço configurável (autonomia dos módulos, passo 3 — Paulo, 10/10/2026:
// "cada módulo do SaaS não pode ser autônomo e não depender do CFI?"). Hoje tudo o que sai do navegador para
// fora do Firebase vai ao CFI: cadastro central, cofre do A1, governo (eSocial, SERPRO), e-mail, WhatsApp
// (SP Connect) e IA (MIA, leitura de holerites). E-mail e WhatsApp são serviços separados porque vão para
// donos diferentes (passo 1, docs/plataforma-comum.md): o e-mail para a plataforma comum; o WhatsApp para o
// SP Connect, que já está saindo do CFI (separação própria, dona da conta da Meta). Aqui cada um vira um SERVIÇO com endereço próprio:
// - sem configuração, tudo continua exatamente no CFI de hoje (mesmos hosts, mesmas rotas);
// - VITE_PLATAFORMA_URL leva todos para a plataforma comum, menos o WhatsApp (dono: o SP Connect);
// - VITE_SERVICO_<NOME>_URL leva só aquele serviço (ex.: o DP com o próprio gateway do governo).
// O caminho de cada rota não muda: o novo provedor implementa as mesmas rotas (docs/plataforma-servicos.md),
// aceita o token Firebase deste projeto e libera o CORS deste app. O endereço entra no build (app estático);
// endereço inválido é ignorado com aviso — o DP nunca manda o token para um lugar que não seja https.

import { comTokenCfi, erroCfi } from '../auth/tokenCfi';

export type Servico = 'cadastro' | 'cofre' | 'governo' | 'email' | 'whatsapp' | 'ia';
export type Origem = 'cfi' | 'plataforma' | 'proprio';

/** Host do CFI das rotas /api/admin (cadastro central, cofre, WhatsApp). */
export const HOST_CFI = 'https://consultor-fiscal-inteligente-zricstsjqa-uw.a.run.app';
/** Host do CFI das rotas /api/dp-integration (governo, e-mail, IA) — mesmo serviço, endereço que o DP sempre usou. */
export const HOST_CFI_INTEGRACAO = 'https://consultor-fiscal-inteligente-631239634290.us-west1.run.app';
export const PREFIXO_INTEGRACAO = '/api/dp-integration';
/** Caixa de entrada do WhatsApp do DP (painel Comunicação do CFI). */
export const PAINEL_MENSAGENS_CFI = `${HOST_CFI_INTEGRACAO}/?painel=comunicacao&departamento=dp-folha`;

export const SERVICOS: Record<Servico, { titulo: string; descricao: string; variavel: string }> = {
    cadastro: { titulo: 'Cadastro central', descricao: 'Departamento e horário de acesso de cada pessoa; empresas do escritório', variavel: 'VITE_SERVICO_CADASTRO_URL' },
    cofre: { titulo: 'Cofre de certificados', descricao: 'Panorama do A1 de cada empresa (vencimento e renovação)', variavel: 'VITE_SERVICO_COFRE_URL' },
    governo: { titulo: 'Governo', descricao: 'eSocial (envio, consulta e download), FGTS Digital, DCTFWeb e SERPRO, assinados com o A1 do cofre', variavel: 'VITE_SERVICO_GOVERNO_URL' },
    email: { titulo: 'E-mail', descricao: 'E-mail pelo escritório (Microsoft 365), com anexos e auditoria', variavel: 'VITE_SERVICO_EMAIL_URL' },
    whatsapp: { titulo: 'WhatsApp', descricao: 'WhatsApp oficial (SP Connect): templates do DP e envio com PDF', variavel: 'VITE_SERVICO_WHATSAPP_URL' },
    ia: { titulo: 'Inteligência artificial', descricao: 'MIA (Gemini) e leitura dos holerites do IOB', variavel: 'VITE_SERVICO_IA_URL' },
};
export const ORDEM_SERVICOS: Servico[] = ['cadastro', 'cofre', 'governo', 'email', 'whatsapp', 'ia'];
export const ROTULO_ORIGEM: Record<Origem, string> = { cfi: 'CFI', plataforma: 'Plataforma comum', proprio: 'Endereço próprio' };

/**
 * Serviço de cada rota do túnel /api/dp-integration (o callFiscal), pelo primeiro trecho do caminho.
 * Rota nova entra aqui — o teste confere que toda chamada do código tem dono.
 */
export const SERVICO_DA_ROTA: Record<string, Servico> = {
    esocial: 'governo', fgts: 'governo', dctfweb: 'governo', 'empresa-completo': 'governo',
    email: 'email',
    assistente: 'ia', holerites: 'ia',
};
export function servicoDaRota(caminho: string): Servico | null {
    const trecho = caminho.replace(/^\/+/, '').split(/[/?]/)[0];
    return SERVICO_DA_ROTA[trecho] ?? null;
}

type Env = Record<string, string | undefined>;
const envDoBuild = (): Env => ((import.meta as unknown as { env?: Env }).env ?? {});

/** Endereço aceito: https (ou http só no próprio computador, para desenvolvimento), sem barra no fim. */
export function enderecoValido(valor: string | undefined): { url: string | null; aviso?: string } {
    const v = (valor ?? '').trim();
    if (!v) return { url: null };
    let u: URL;
    try { u = new URL(v); } catch { return { url: null, aviso: `"${v}" não é um endereço` }; }
    const local = u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
    if (u.protocol !== 'https:' && !local) return { url: null, aviso: `"${v}" não é https` };
    if (u.search || u.hash || u.username || u.password) return { url: null, aviso: `"${v}" tem parâmetros, âncora ou usuário` };
    return { url: `${u.origin}${u.pathname.replace(/\/+$/, '')}` };
}

export interface Configuracao { servico: Servico; origem: Origem; /** Base configurada; nula = hosts do CFI. */ base: string | null; avisos: string[] }

/** Quem atende cada serviço neste build: o próprio > a plataforma > o CFI. */
export function configuracaoDoServico(servico: Servico, env: Env = envDoBuild()): Configuracao {
    const avisos: string[] = [];
    const proprio = enderecoValido(env[SERVICOS[servico].variavel]);
    if (proprio.aviso) avisos.push(`${SERVICOS[servico].variavel} ignorado: ${proprio.aviso}.`);
    if (proprio.url) return { servico, origem: 'proprio', base: proprio.url, avisos };
    // O WhatsApp não vai para a plataforma: o dono do canal é o SP Connect (só a variável própria o leva).
    if (servico === 'whatsapp') return { servico, origem: 'cfi', base: null, avisos };
    const plataforma = enderecoValido(env.VITE_PLATAFORMA_URL);
    if (plataforma.aviso) avisos.push(`VITE_PLATAFORMA_URL ignorado: ${plataforma.aviso}.`);
    if (plataforma.url) return { servico, origem: 'plataforma', base: plataforma.url, avisos };
    return { servico, origem: 'cfi', base: null, avisos };
}
export const configuracaoDosServicos = (env: Env = envDoBuild()) => ORDEM_SERVICOS.map(s => configuracaoDoServico(s, env));

/** Endereço da rota no provedor do serviço. `caminho` é o caminho completo (/api/...), igual em qualquer provedor. */
export function urlDoServico(servico: Servico, caminho: string, env: Env = envDoBuild()): string {
    const { base } = configuracaoDoServico(servico, env);
    if (base) return `${base}${caminho}`;
    return `${caminho.startsWith(`${PREFIXO_INTEGRACAO}/`) ? HOST_CFI_INTEGRACAO : HOST_CFI}${caminho}`;
}

/** Caixa de entrada do WhatsApp: a do CFI, ou VITE_PAINEL_MENSAGENS_URL quando as mensagens saírem de lá. */
export function painelDeMensagens(env: Env = envDoBuild()): string {
    return enderecoValido(env.VITE_PAINEL_MENSAGENS_URL).url ?? PAINEL_MENSAGENS_CFI;
}

/** Endereço que a tela mostra e testa: a base configurada, ou o host do CFI que atende o serviço. */
export function enderecoExibido(c: Configuracao): string {
    if (c.base) return c.base;
    return c.servico === 'cadastro' || c.servico === 'cofre' || c.servico === 'whatsapp' ? HOST_CFI : HOST_CFI_INTEGRACAO;
}

/**
 * POST com o token do usuário na rota do serviço. Recusa vira erro com o status (401/403 = token),
 * como sempre foi no túnel do CFI.
 */
export async function postarNoServico<T>(servico: Servico, caminho: string, corpo: object, fetchImpl: typeof fetch = fetch): Promise<T> {
    return comTokenCfi(async token => {
        const resp = await fetchImpl(urlDoServico(servico, caminho), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(corpo),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({} as { error?: string }));
            throw erroCfi(err.error || `HTTP ${resp.status}`, resp.status);
        }
        return resp.json() as Promise<T>;
    });
}

/**
 * O endereço responde? Sem token e sem efeito: GET opaco (no-cors) só diz se há servidor do outro lado.
 * Para a tela de Serviços externos, não substitui a primeira chamada de verdade.
 */
export async function testarAlcance(url: string, fetchImpl: typeof fetch = fetch, limiteMs = 10_000): Promise<{ ok: boolean; ms: number; erro?: string }> {
    const inicio = Date.now();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), limiteMs);
    try {
        await fetchImpl(url, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
        return { ok: true, ms: Date.now() - inicio };
    } catch (e) {
        return { ok: false, ms: Date.now() - inicio, erro: ctrl.signal.aborted ? `sem resposta em ${Math.round(limiteMs / 1000)} s` : (e as Error).message || 'sem conexão' };
    } finally { clearTimeout(t); }
}
