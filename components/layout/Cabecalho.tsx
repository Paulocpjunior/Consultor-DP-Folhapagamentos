// components/layout/Cabecalho.tsx
//
// Cabeçalho do app: marca, empresa e período ativos (sempre à vista), usuário e o menu em grupos,
// na ordem do trabalho do DP (services/navegacao/menu.ts). Cada grupo abre um painel com os itens
// e a descrição de cada um.

import React, { useEffect, useRef, useState } from 'react';
import Logo from '../Logo';
import { ondeEsta, type Destino, type GrupoMenu, type Icone } from '../../services/navegacao/menu';
import { competenciaBr, type EmpresaAtiva } from '../../services/empresaAtiva/empresaAtiva';

const PATH: Record<Icone | 'chevron' | 'sol' | 'lua' | 'sair' | 'trocar', string> = {
    empresa: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1',
    cadastro: 'M4 6h16M4 12h16M4 18h10M18 16l2 2-2 2',
    folha: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    conferencia: 'M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
    esocial: 'M4 12a8 8 0 0116 0M7 12a5 5 0 0110 0M12 12v8M9 20h6',
    prazo: 'M12 7v5l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    fim: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4M12 15v2',
    config: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
    chevron: 'M6 9l6 6 6-6',
    sol: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7l1.4-1.4M4.9 19.1l1.4-1.4m11.4 0l1.4 1.4M4.9 4.9l1.4 1.4M16 12a4 4 0 11-8 0 4 4 0 018 0z',
    lua: 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z',
    sair: 'M15 12H3m0 0l4-4m-4 4l4 4M13 4h6a2 2 0 012 2v12a2 2 0 01-2 2h-6',
    trocar: 'M7 16l-4-4 4-4M3 12h14M17 8l4 4-4 4',
};
export const Ico: React.FC<{ nome: keyof typeof PATH; className?: string }> = ({ nome, className = 'h-4 w-4' }) => (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}><path d={PATH[nome]} /></svg>
);

interface Props {
    menu: GrupoMenu[];
    destino: Destino;
    onNavegar: (d: Destino) => void;
    ativa: EmpresaAtiva | null;
    onTrocar: () => void;
    usuario: string;
    papel?: string;
    escuro: boolean;
    onTema: () => void;
    onSair: () => void;
    /** Itens desabilitados (ex.: Folha sem empresa na carteira), com o motivo. */
    bloqueados?: Partial<Record<string, string>>;
    /** Faixa da situação do período (Fim de mês), ao lado da competência. */
    situacaoPeriodo?: React.ReactNode;
    /** Número no grupo do menu (ex.: pedidos de reabertura esperando o gestor). */
    contadores?: Partial<Record<string, number>>;
}

const Cabecalho: React.FC<Props> = ({ menu, destino, onNavegar, ativa, onTrocar, usuario, papel, escuro, onTema, onSair, bloqueados = {}, situacaoPeriodo, contadores = {} }) => {
    const [aberto, setAberto] = useState<string | null>(null);
    const ref = useRef<HTMLElement>(null);
    const atual = ondeEsta(destino, menu);
    // Celular: o menu fica numa linha com rolagem e o painel abre em largura total, abaixo dela.
    const [estreito, setEstreito] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 767px)').matches);
    useEffect(() => {
        const mq = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 767px)') : undefined;
        if (!mq) return;
        const mudar = () => setEstreito(mq.matches);
        mq.addEventListener?.('change', mudar);
        return () => mq.removeEventListener?.('change', mudar);
    }, []);

    useEffect(() => {
        if (!aberto) return;
        const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(null); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(null); };
        document.addEventListener('mousedown', fora);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
    }, [aberto]);

    const ir = (d: Destino) => { setAberto(null); if (d.aba === 'trocar') onTrocar(); else onNavegar(d); };
    const painel = (g: GrupoMenu, classe: string) => (
        <div role="menu" aria-label={g.rotulo} className={`z-50 overflow-hidden rounded-xl bg-white p-1.5 text-slate-800 shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-800 dark:text-slate-100 dark:ring-white/10 ${classe}`}>
            {g.itens.map(i => {
                const motivo = bloqueados[i.id];
                const aqui = atual?.item.id === i.id && atual.grupo.id === g.id;
                return (
                    <button key={i.id} role="menuitem" disabled={!!motivo} title={motivo} onClick={() => ir(i.destino)}
                        className={`block w-full rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${aqui ? 'bg-blue-50 dark:bg-blue-500/15' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                        <span className={`block text-sm ${aqui ? 'font-semibold text-blue-700 dark:text-blue-300' : 'font-medium'}`}>{i.rotulo}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{motivo ?? i.descricao}</span>
                    </button>
                );
            })}
        </div>
    );
    const grupoAberto = menu.find(g => g.id === aberto);

    return (
        <header ref={ref} className="relative z-40 md:sticky md:top-0 border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-[#0b1f4d] text-slate-100 shadow-lg shadow-slate-900/20">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-white p-0.5 shadow-sm"><Logo iconOnly className="h-8 w-8" /></span>
                    <div className="leading-tight">
                        <div className="text-sm font-semibold tracking-tight text-white">Consultor DP</div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-blue-300/80">SP Assessoria</div>
                    </div>
                </div>

                {/* Empresa e período ativos: tudo o que se faz é nesta empresa e nesta competência. */}
                <div aria-label="Empresa e período ativos" className="order-3 flex min-w-0 flex-1 basis-full items-center gap-3 rounded-xl bg-white/5 px-3 py-1.5 ring-1 ring-white/10 md:order-none md:basis-auto">
                    {ativa ? (
                        <>
                            <Ico nome="empresa" className="h-4 w-4 shrink-0 text-blue-300" />
                            <div className="min-w-0 leading-tight">
                                <div className="truncate text-sm font-medium text-white" title={ativa.nome}>{ativa.nome}</div>
                                <div className="truncate text-[11px] text-slate-400">CNPJ {ativa.cnpj} · SAGE {ativa.codigoSage}</div>
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-2">
                                <div className="text-right leading-tight">
                                    <div className="text-[10px] uppercase tracking-wider text-slate-400">Competência</div>
                                    <div className="font-mono text-sm font-semibold text-white">{competenciaBr(ativa.competencia)}</div>
                                </div>
                                {situacaoPeriodo}
                                <button onClick={onTrocar} title="Trocar empresa ou período" className="flex items-center gap-1 rounded-lg bg-blue-500/20 px-2.5 py-1.5 text-xs font-medium text-blue-100 ring-1 ring-blue-400/30 hover:bg-blue-500/30">
                                    <Ico nome="trocar" className="h-3.5 w-3.5" /><span className="hidden sm:inline">Trocar</span>
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="text-sm text-slate-300">Nenhuma empresa ativa.</span>
                            <button onClick={onTrocar} className="ml-auto rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-400">Ativar empresa e período</button>
                        </>
                    )}
                </div>

                <div className="ml-auto flex items-center gap-1.5 md:ml-0">
                    <button onClick={onTema} aria-label={escuro ? 'Tema claro' : 'Tema escuro'} title={escuro ? 'Tema claro' : 'Tema escuro'} className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white">
                        <Ico nome={escuro ? 'sol' : 'lua'} />
                    </button>
                    <div className="hidden text-right leading-tight lg:block">
                        <div className="max-w-[12rem] truncate text-xs text-slate-200">{usuario}</div>
                        {papel && <div className="text-[10px] uppercase tracking-wider text-amber-300/90">{papel}</div>}
                    </div>
                    <button onClick={onSair} aria-label="Sair" title="Sair" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"><Ico nome="sair" /></button>
                </div>
            </div>

            <nav aria-label="Menu principal" className="border-t border-white/5 bg-black/10">
                <ul className="mx-auto flex max-w-7xl items-stretch gap-0.5 overflow-x-auto px-2 [scrollbar-width:none] sm:px-4 md:overflow-visible">
                    {menu.map(g => {
                        const ativo = atual?.grupo.id === g.id;
                        return (
                            <li key={g.id} className={`relative ${g.direita ? 'ml-auto' : ''}`}>
                                <button aria-haspopup="menu" aria-expanded={aberto === g.id} onClick={() => setAberto(a => (a === g.id ? null : g.id))}
                                    className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${ativo ? 'border-blue-400 font-medium text-white' : 'border-transparent text-slate-300 hover:text-white'}`}>
                                    <Ico nome={g.icone} className={`h-4 w-4 ${ativo ? 'text-blue-300' : 'text-slate-400'}`} />
                                    {g.rotulo}
                                    {!!contadores[g.id] && <span aria-label={`${contadores[g.id]} pendente(s)`} className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold leading-4 text-slate-900">{contadores[g.id]}</span>}
                                    <Ico nome="chevron" className={`h-3 w-3 opacity-60 transition-transform ${aberto === g.id ? 'rotate-180' : ''}`} />
                                </button>
                                {aberto === g.id && !estreito && painel(g, `absolute top-full mt-1 w-80 ${g.direita ? 'right-0' : 'left-0'}`)}
                            </li>
                        );
                    })}
                </ul>
                {grupoAberto && estreito && <div className="px-2 pb-2">{painel(grupoAberto, 'w-full')}</div>}
            </nav>
        </header>
    );
};

export default Cabecalho;
