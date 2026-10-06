// components/UpdateBanner.tsx
// Aviso de atualização em POPUP, para chamar a atenção do colaborador (Paulo,
// 06/10/2026: "deve chamar o máximo de atenção, em forma de popup, sempre
// elencando o que foi atualizado").
// - Nova versão publicada: popup no centro da tela com a lista do que mudou
//   desde a versão aberta e o botão "Atualizar agora" (hard reload).
//   "Depois" só adia por 10 minutos; enquanto isso fica uma faixa no topo.
// - Depois de atualizar: popup "Sistema atualizado" com o que mudou desde a
//   última versão que esta pessoa usou neste navegador.
// A lista vem do version.json (novidades geradas no build por genVersion.mjs).

import React, { useEffect, useRef, useState } from 'react';
import {
    subscribeUpdates,
    reloadForUpdate,
    fetchRemoteVersion,
    novidadesDesde,
    mesmoBuild,
    APP_INFO,
    type Novidade,
    type RemoteVersion,
} from '../services/updateService';

const CHAVE_ADIADO = 'spc_update_adiado';
const CHAVE_ULTIMA_VISTA = 'spc_update_ultima_build_vista';
export const ADIAMENTO_MS = 10 * 60_000;

const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue */ } };

/** Até quando esta build foi adiada (ms), ou 0. */
function adiadoAte(build: string): number {
    try {
        const a = JSON.parse(ler(CHAVE_ADIADO) ?? 'null') as { build: string; ate: number } | null;
        return a && a.build === build && a.ate > Date.now() ? a.ate : 0;
    } catch { return 0; }
}

const dataBr = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);

const ListaNovidades: React.FC<{ itens: Novidade[]; mais: number }> = ({ itens, mais }) => (
    itens.length ? (
        <ol className="space-y-2">
            {itens.map(n => (
                <li key={n.build} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex items-start gap-2">
                        <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">{n.titulo}</p>
                            {n.itens.length > 0 && (
                                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600 dark:text-slate-300">
                                    {n.itens.map((it, i) => <li key={i}>{it}</li>)}
                                </ul>
                            )}
                            <p className="mt-1 text-[11px] text-slate-400">{dataBr(n.data)}</p>
                        </div>
                    </div>
                </li>
            ))}
            {mais > 0 && <li className="text-xs text-slate-500">e mais {mais} melhoria(s) anterior(es).</li>}
        </ol>
    ) : <p className="text-sm text-slate-600 dark:text-slate-300">Correções e melhorias gerais.</p>
);

const UpdateBanner: React.FC = () => {
    const [remote, setRemote] = useState<RemoteVersion | null>(null);
    const [aberto, setAberto] = useState(false);
    const [atualizado, setAtualizado] = useState<{ itens: Novidade[]; mais: number } | null>(null);
    const [reloading, setReloading] = useState(false);
    const botao = useRef<HTMLButtonElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Nova versão publicada.
    useEffect(() => {
        const unsub = subscribeUpdates((r) => {
            setRemote(r);
            const ate = adiadoAte(r.build);
            if (timer.current) clearTimeout(timer.current);
            if (ate) { setAberto(false); timer.current = setTimeout(() => setAberto(true), ate - Date.now()); }
            else setAberto(true);
        });
        return () => { unsub(); if (timer.current) clearTimeout(timer.current); };
    }, []);

    // Acabou de atualizar: mostra o que mudou desde a última versão vista neste navegador.
    useEffect(() => {
        if (APP_INFO.build === 'dev') return;
        const anterior = ler(CHAVE_ULTIMA_VISTA);
        gravar(CHAVE_ULTIMA_VISTA, APP_INFO.build);
        if (!anterior || mesmoBuild(anterior, APP_INFO.build)) return;
        let vivo = true;
        fetchRemoteVersion().then(r => {
            if (vivo && r && mesmoBuild(r.build, APP_INFO.build)) setAtualizado(novidadesDesde(r.novidades, anterior));
        });
        return () => { vivo = false; };
    }, []);

    const popup = (remote && aberto) || (!remote && atualizado);
    useEffect(() => { if (popup) botao.current?.focus(); }, [popup]);

    const atualizar = async () => { setReloading(true); await reloadForUpdate(); };
    const adiar = () => {
        if (!remote) return;
        gravar(CHAVE_ADIADO, JSON.stringify({ build: remote.build, ate: Date.now() + ADIAMENTO_MS }));
        setAberto(false);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setAberto(true), ADIAMENTO_MS);
    };
    const fecharAtualizado = () => setAtualizado(null);

    if (!remote && !atualizado) return null;

    // Adiado: faixa fixa no topo, sem opção de esconder de vez.
    if (remote && !aberto) {
        return (
            <div role="status" className="fixed inset-x-0 top-0 z-[60] bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg">
                <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2">
                    <span className="inline-block h-2 w-2 animate-ping rounded-full bg-white" aria-hidden />
                    <strong className="text-sm">Nova versão esperando para ser instalada</strong>
                    <div className="ml-auto flex gap-2">
                        <button className="rounded bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30" onClick={() => setAberto(true)}>Ver o que mudou</button>
                        <button className="rounded bg-white px-3 py-1 text-xs font-bold text-orange-700 hover:bg-orange-50 disabled:opacity-50" disabled={reloading} onClick={atualizar}>{reloading ? 'Atualizando…' : 'Atualizar agora'}</button>
                    </div>
                </div>
            </div>
        );
    }

    const nova = !!remote;
    const lista = nova ? novidadesDesde(remote!.novidades, APP_INFO.build) : atualizado!;
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
            onKeyDown={e => { if (e.key === 'Escape') (nova ? adiar() : fecharAtualizado()); }}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="update-titulo" aria-describedby="update-desc"
                className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-4 ring-amber-400 dark:bg-slate-800">
                <div className={`flex items-center gap-3 px-5 py-4 text-white ${nova ? 'bg-gradient-to-r from-indigo-600 to-blue-700' : 'bg-gradient-to-r from-emerald-600 to-teal-600'}`}>
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                        {nova && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" aria-hidden />}
                        <svg className="relative h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            {nova ? <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></> : <path d="M20 6 9 17l-5-5" />}
                        </svg>
                    </span>
                    <div className="min-w-0">
                        <h2 id="update-titulo" className="text-lg font-bold leading-tight">{nova ? 'Nova versão do Consultor DP' : 'Sistema atualizado'}</h2>
                        <p className="text-xs text-white/80">
                            {nova ? <>Release <span className="font-mono">{remote!.release}</span></> : <>Você está na release <span className="font-mono">{APP_INFO.release}</span></>}
                        </p>
                    </div>
                </div>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                    <p id="update-desc" className="text-sm text-slate-700 dark:text-slate-200">
                        {nova ? <>Atualize agora para usar as novidades abaixo. <strong>Salve o que estiver editando antes.</strong></> : 'Veja o que mudou desde a última vez que você usou o sistema:'}
                    </p>
                    <ListaNovidades itens={lista.itens} mais={lista.mais} />
                </div>
                <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-3 sm:flex-row sm:justify-end dark:border-slate-700">
                    {nova ? (
                        <>
                            <button className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700" onClick={adiar}>Depois (lembrar em 10 min)</button>
                            <button ref={botao} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-50" disabled={reloading} onClick={atualizar}>
                                {reloading ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Atualizando…</> : 'Atualizar agora'}
                            </button>
                        </>
                    ) : (
                        <button ref={botao} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-emerald-700" onClick={fecharAtualizado}>Entendi</button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UpdateBanner;
