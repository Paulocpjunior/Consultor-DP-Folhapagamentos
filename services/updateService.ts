// services/updateService.ts
// Detecta novas versões publicadas no GitHub Pages e notifica a UI.
//
// Estratégia:
// - No build, scripts/genVersion.mjs grava public/version.json com
//   { version, build, release, builtAt }.
// - Em runtime, este serviço faz polling a cada 60s + on `focus` da janela,
//   buscando o version.json com cache-busting. Se a build remota mudou em
//   relação à build embutida no bundle, dispara o callback.
//
// O componente UpdateBanner consome `subscribeUpdates` para mostrar o aviso e
// expor o botão "Atualizar agora" (faz hard reload com cache-busting).

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';
const APP_RELEASE = typeof __APP_RELEASE__ !== 'undefined' ? __APP_RELEASE__ : '00000000-000';
const APP_BUILT_AT = typeof __APP_BUILT_AT__ !== 'undefined' ? __APP_BUILT_AT__ : '';

/** Label legível, ex.: "Versão 1.0 · Release 20260503-001". */
export const APP_VERSION_LABEL = `Versão ${APP_VERSION} · Release ${APP_RELEASE}`;

export const APP_INFO = Object.freeze({
    version: APP_VERSION,
    build: APP_BUILD,
    release: APP_RELEASE,
    builtAt: APP_BUILT_AT,
});

export interface RemoteVersion {
    version: string;
    build: string;
    release: string;
    branch?: string;
    builtAt: string;
}

/** URL do version.json respeitando o `base` do Vite (GitHub Pages subpath). */
function versionUrl(): string {
    const base = (import.meta.env?.BASE_URL || '/').replace(/\/+$/, '/');
    // Cache-busting forte: muitos CDNs ignoram cache-control para *.json.
    const ts = Date.now();
    return `${base}version.json?t=${ts}`;
}

async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
    try {
        const res = await fetch(versionUrl(), {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as RemoteVersion;
        if (!data?.build) return null;
        return data;
    } catch {
        return null;
    }
}

/**
 * Compara a build embarcada (bundle atual) com a build remota mais recente.
 * Retorna a versão remota se for diferente; null se for igual ou se a
 * checagem falhou.
 */
export async function checkForUpdate(): Promise<RemoteVersion | null> {
    const remote = await fetchRemoteVersion();
    if (!remote) return null;
    if (remote.build && remote.build !== APP_BUILD) return remote;
    return null;
}

export type UpdateListener = (remote: RemoteVersion) => void;

let pollHandle: ReturnType<typeof setInterval> | null = null;
let lastNotifiedBuild: string | null = null;
const listeners = new Set<UpdateListener>();

async function tick(): Promise<void> {
    const remote = await checkForUpdate();
    if (!remote) return;
    if (remote.build === lastNotifiedBuild) return;
    lastNotifiedBuild = remote.build;
    listeners.forEach((fn) => {
        try { fn(remote); } catch (e) { console.warn('[updateService] listener error:', e); }
    });
}

/**
 * Inscreve um listener que dispara quando a versão remota mudar.
 * Faz polling a cada 60s e quando a aba volta a ganhar foco.
 */
export function subscribeUpdates(listener: UpdateListener): () => void {
    listeners.add(listener);

    if (!pollHandle) {
        pollHandle = setInterval(tick, 60_000);
        // Primeiro check rápido (3s após a montagem)
        setTimeout(tick, 3_000);
        if (typeof window !== 'undefined') {
            window.addEventListener('focus', tick);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') tick();
            });
        }
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && pollHandle) {
            clearInterval(pollHandle);
            pollHandle = null;
        }
    };
}

/**
 * Força um hard reload, ignorando cache. Limpa caches do Service Worker
 * (se houver) e adiciona query string para invalidar HTML/JS cacheados.
 */
export async function reloadForUpdate(): Promise<void> {
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
        }
    } catch (e) {
        console.warn('[updateService] cache flush falhou:', e);
    }
    const url = new URL(window.location.href);
    url.searchParams.set('_v', String(Date.now()));
    window.location.replace(url.toString());
}
