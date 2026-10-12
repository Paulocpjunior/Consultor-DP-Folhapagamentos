// components/layout/Cabecalho.tsx
//
// Cabeçalho do app: marca, empresa e período ativos (sempre à vista), usuário e o menu em grupos,
// na ordem do trabalho do DP (services/navegacao/menu.ts). Cada grupo abre um painel com os itens
// e a descrição de cada um.

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Logo from '../Logo';
import { corDoGrupo } from './cores';
import { ondeEsta, type Destino, type GrupoMenu } from '../../services/navegacao/menu';
import { ICONES, type NomeIcone } from './icones';
import { competenciaBr, type EmpresaAtiva } from '../../services/empresaAtiva/empresaAtiva';
import { APP_INFO, abrirNovidades, dataDaVersao } from '../../services/updateService';

export const Ico: React.FC<{ nome: NomeIcone; className?: string }> = ({ nome, className = 'h-4 w-4' }) => (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className}><path d={ICONES[nome]} /></svg>
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
    /** Ao lado da empresa ativa (ex.: particularidades do CRM). */
    extraEmpresa?: React.ReactNode;
    /** Número no grupo do menu (ex.: pedidos de reabertura esperando o gestor). */
    contadores?: Partial<Record<string, number>>;
}

const Cabecalho: React.FC<Props> = ({ menu, destino, onNavegar, ativa, onTrocar, usuario, papel, escuro, onTema, onSair, bloqueados = {}, situacaoPeriodo, contadores = {}, extraEmpresa }) => {
    const [aberto, setAberto] = useState<string | null>(null);
    const ref = useRef<HTMLElement>(null);
    const atual = ondeEsta(destino, menu);
    // Tela pequena, ou menu (com os ícones) mais largo que a tela: o menu fica numa linha com rolagem
    // e o painel abre em largura total, abaixo dela. Os ícones nunca somem (Paulo, 12/10: ajudam a
    // memorizar cada área).
    const [telaPequena, setTelaPequena] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 1023px)').matches);
    useEffect(() => {
        const mq = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 1023px)') : undefined;
        if (!mq) return;
        const mudar = () => setTelaPequena(mq.matches);
        mq.addEventListener?.('change', mudar);
        return () => mq.removeEventListener?.('change', mudar);
    }, []);
    const listaRef = useRef<HTMLUListElement>(null);
    const [transborda, setTransborda] = useState(false);
    useLayoutEffect(() => {
        const ul = listaRef.current;
        if (!ul) return;
        const medir = () => setTransborda(ul.scrollWidth > ul.clientWidth + 1);
        medir();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', medir);
            return () => window.removeEventListener('resize', medir);
        }
        const ro = new ResizeObserver(medir);
        ro.observe(ul);
        return () => ro.disconnect();
    }, [menu, contadores]);
    const estreito = telaPequena || transborda;

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
                        className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${aqui ? 'bg-slate-100 dark:bg-white/10' : 'hover:bg-slate-100 dark:hover:bg-white/5'}`}>
                        <span aria-hidden className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${corDoGrupo(g.id).claro}`}><Ico nome={i.icone} className="h-[18px] w-[18px]" /></span>
                        <span className="min-w-0">
                            <span className={`block text-sm ${aqui ? `font-semibold ${corDoGrupo(g.id).barra}` : 'font-medium'}`}>{i.rotulo}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">{motivo ?? i.descricao}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
    const grupoAberto = menu.find(g => g.id === aberto);

    // Barra no estilo das da Apple: escura e translúcida, com desfoque do que passa por baixo.
    return (
        <header ref={ref} className="relative z-40 md:sticky md:top-0 border-b border-white/10 bg-[#161617]/85 text-slate-100 backdrop-blur-xl backdrop-saturate-150">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                    <Logo iconOnly className="h-8 w-8" />
                    <div className="leading-tight">
                        <div className="text-sm font-semibold tracking-tight text-white">Consultor DP</div>
                        <div className="text-[11px] text-slate-400">SP Assessoria</div>
                        <button onClick={abrirNovidades} title={`Release ${APP_INFO.release}. Ver o que mudou`}
                            className="mt-0.5 flex items-center gap-1 rounded-sm text-[11px] text-slate-300 hover:text-white">
                            <Ico nome="presente" className="h-3 w-3" />v{APP_INFO.version} · {dataDaVersao()}
                        </button>
                    </div>
                </div>

                {/* Empresa e período ativos: tudo o que se faz é nesta empresa e nesta competência. */}
                <div aria-label="Empresa e período ativos" className="order-3 flex min-w-0 flex-1 basis-full items-center gap-3 rounded-xl bg-white/5 px-3 py-1.5 ring-1 ring-white/10 md:order-0 md:basis-auto">
                    {ativa ? (
                        <>
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white ${corDoGrupo('empresas').solido}`}><Ico nome="empresa" className="h-4 w-4" /></span>
                            <div className="min-w-0 leading-tight">
                                <div className="truncate text-sm font-medium text-white" title={ativa.nome}>{ativa.nome}</div>
                                <div className="truncate text-[11px] text-slate-400">CNPJ {ativa.cnpj} · SAGE {ativa.codigoSage}</div>
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-2">
                                {extraEmpresa}
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
                        <div className="max-w-48 truncate text-xs text-slate-200">{usuario}</div>
                        {papel && <div className="text-[10px] uppercase tracking-wider text-amber-300/90">{papel}</div>}
                    </div>
                    <button onClick={onSair} aria-label="Sair" title="Sair" className="rounded-lg p-2 text-slate-300 hover:bg-white/10 hover:text-white"><Ico nome="sair" /></button>
                </div>
            </div>

            <nav aria-label="Menu principal" className="border-t border-white/5 bg-black/10">
                <ul ref={listaRef} className={`mx-auto flex max-w-7xl items-stretch gap-0.5 px-2 scrollbar-none xl:px-4 ${estreito ? 'overflow-x-auto' : 'overflow-visible'}`}>
                    {menu.map(g => {
                        const ativo = atual?.grupo.id === g.id;
                        return (
                            <li key={g.id} className={`relative ${g.direita ? 'ml-auto' : ''}`}>
                                <button aria-haspopup="menu" aria-expanded={aberto === g.id} onClick={() => setAberto(a => (a === g.id ? null : g.id))}
                                    className={`flex items-center gap-1 whitespace-nowrap border-b-2 px-1.5 py-2 text-sm transition-colors xl:gap-1.5 xl:px-2 2xl:gap-2 2xl:px-3 ${ativo ? `${corDoGrupo(g.id).ativo} font-medium text-white` : 'border-transparent text-slate-300 hover:text-white'}`}>
                                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-white shadow-xs ${corDoGrupo(g.id).solido} ${ativo ? 'ring-2 ring-white/40' : ''}`}><Ico nome={g.icone} className="h-3.5 w-3.5" /></span>
                                    {g.rotulo}
                                    {!!contadores[g.id] && <span aria-label={`${contadores[g.id]} pendente(s)`} className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold leading-4 text-slate-900">{contadores[g.id]}</span>}
                                    <Ico nome="chevron" className={`hidden h-3 w-3 opacity-60 transition-transform 2xl:block ${aberto === g.id ? 'rotate-180' : ''}`} />
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
