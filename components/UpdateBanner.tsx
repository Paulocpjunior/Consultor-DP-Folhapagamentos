// components/UpdateBanner.tsx
// Banner fixo no topo que aparece quando o updateService detecta uma nova
// versão publicada. O usuário clica em "Atualizar agora" para fazer um hard
// reload (limpa cache + service worker + query-string busting).

import React, { useEffect, useState } from 'react';
import {
    subscribeUpdates,
    reloadForUpdate,
    APP_INFO,
    type RemoteVersion,
} from '../services/updateService';

const STORAGE_KEY_DISMISSED = 'spc_update_banner_dismissed_build';

const UpdateBanner: React.FC = () => {
    const [remote, setRemote] = useState<RemoteVersion | null>(null);
    const [reloading, setReloading] = useState(false);

    useEffect(() => {
        const unsub = subscribeUpdates((r) => {
            // Não reabrir o banner se o usuário já dispensou exatamente esta build.
            try {
                const dismissed = localStorage.getItem(STORAGE_KEY_DISMISSED);
                if (dismissed === r.build) return;
            } catch { /* localStorage indisponível: prosseguir */ }
            setRemote(r);
        });
        return unsub;
    }, []);

    if (!remote) return null;

    const handleReload = async () => {
        setReloading(true);
        await reloadForUpdate();
    };

    const handleDismiss = () => {
        try {
            localStorage.setItem(STORAGE_KEY_DISMISSED, remote.build);
        } catch { /* ignore */ }
        setRemote(null);
    };

    return (
        <div
            role="alert"
            className="fixed top-0 inset-x-0 z-[60] bg-gradient-to-r from-indigo-600 to-blue-700 text-white shadow-lg"
        >
            <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                    <strong className="text-sm font-semibold">Nova versão disponível</strong>
                </div>
                <div className="text-xs text-blue-100 flex-1 min-w-[180px]">
                    <span className="hidden sm:inline">
                        Atual: <span className="font-mono">{APP_INFO.build}</span>
                        {' · '}
                        Nova: <span className="font-mono">{remote.build}</span>
                        {' · '}
                        Release <span className="font-mono">{remote.release}</span>
                    </span>
                    <span className="sm:hidden">
                        Atualize para receber as últimas melhorias.
                    </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <button
                        onClick={handleReload}
                        disabled={reloading}
                        className="px-3 py-1.5 text-xs font-bold bg-white text-indigo-700 hover:bg-blue-50 rounded shadow-sm disabled:opacity-50 inline-flex items-center gap-1.5"
                        title="Recarrega a página limpando o cache do navegador."
                    >
                        {reloading ? (
                            <>
                                <span className="inline-block w-3 h-3 border-2 border-indigo-700 border-t-transparent rounded-full animate-spin" />
                                Atualizando…
                            </>
                        ) : (
                            <>
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12a9 9 0 1 1-3.5-7.1" />
                                    <path d="M21 3v6h-6" />
                                </svg>
                                Atualizar agora
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleDismiss}
                        className="text-blue-100 hover:text-white text-lg leading-none px-1"
                        aria-label="Dispensar aviso de atualização"
                        title="Dispensar (você verá o aviso novamente quando houver outra versão)"
                    >
                        ×
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UpdateBanner;
