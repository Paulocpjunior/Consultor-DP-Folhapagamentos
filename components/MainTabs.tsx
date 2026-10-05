import { limparSessaoImplantacao } from '../services/implantacao/sessao';
import { ehAdmin } from '../services/auth/papeis';
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import * as authService from '../services/auth/authService';
import { consultarGateDepartamento, type GateDepartamento } from '../services/departamentoGate';
import { getAuth } from 'firebase/auth';
import LoginScreen from './auth/LoginScreen';
import PendingScreen from './auth/PendingScreen';
import AdminUsersPanel from './auth/AdminUsersPanel';
import FolhaPanel, { type SubTabFolha } from './folha/FolhaPanel';
import type { Destino } from '../services/iobSage/catalogoMenus';
const IobSagePanel = lazy(() => import('./iobSage/IobSagePanel'));
const CadastrosPanel = lazy(() => import('./cadastros/CadastrosPanel'));
const PrazosPanel = lazy(() => import('./prazos/PrazosPanel'));
const CalculoPanel = lazy(() => import('./calculo/CalculoPanel'));
const CofreCertificadosPanel = lazy(() => import('./certificados/CofreCertificadosPanel'));
import type { SubCadastro } from './cadastros/CadastrosPanel';
import EmpresasPanel from './empresas/EmpresasPanel';
import ESocialMonitorPanel from './esocial/ESocialMonitorPanel';
import AlertaPendenciasPopup from './AlertaPendenciasPopup';
import Logo from './Logo';
import UpdateBanner from './UpdateBanner';
import { listarEmpresasVisiveis } from '../services/empresas/empresasService';
import type { Empresa } from '../services/empresas/empresasTypes';
import type { User } from '../types';
import AtivarEmpresaScreen from './empresaAtiva/AtivarEmpresaScreen';
import { EmpresaAtivaProvider } from '../services/empresaAtiva/empresaAtivaContext';
import {
    ativacaoAindaValida, competenciaBr, competenciaPadrao, exigeEmpresaAtiva,
    gravarEmpresaAtiva, lerEmpresaAtiva, limparEmpresaAtiva, type EmpresaAtiva,
} from '../services/empresaAtiva/empresaAtiva';

type Tab = 'folha' | 'cadastros' | 'calculo' | 'prazos' | 'certificados' | 'empresas' | 'esocial' | 'iobsage' | 'admin';

const SUB_FOLHA: Partial<Record<Destino, SubTabFolha>> = {
    'folha:apontamento': 'apontamento', 'folha:implantacao': 'implantacao', 'folha:conferencia': 'conferencia',
    'folha:eventos': 'eventos', 'folha:ponto': 'validador-ponto',
};
const SUB_CADASTRO: Partial<Record<Destino, SubCadastro>> = {
    'cadastros:funcionarios': 'funcionarios', 'cadastros:horarios': 'horarios', 'cadastros:afastamentos': 'afastamentos', 'cadastros:incidencias': 'incidencias',
    'cadastros:sindicatos': 'sindicatos', 'cadastros:tabelas': 'tabelas', 'cadastros:enquadramento': 'enquadramento',
};

function extrairNomeAmigavel(user: any): string {
    if (!user) return 'Usuário';
    const candidato = user.nome || user.displayName;
    if (candidato && typeof candidato === 'string' && candidato.trim()) {
        // Pega só o primeiro nome
        return candidato.trim().split(/\s+/)[0];
    }
    if (user.email && typeof user.email === 'string') {
        // junior@spassessoriacontabil.com.br -> "Junior"
        const local = user.email.split('@')[0];
        if (local) {
            return local.charAt(0).toUpperCase() + local.slice(1);
        }
    }
    return 'Usuário';
}

function saudacaoPorHora(): string {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
}

const MainTabs: React.FC<{ children?: React.ReactNode }> = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('folha');
    // Sub-aba da Folha pedida por outro módulo (IOB SAGE); a chave remonta o painel nela.
    const [folhaSub, setFolhaSub] = useState<{ sub: SubTabFolha; n: number } | null>(null);
    const [cadastroSub, setCadastroSub] = useState<{ sub: SubCadastro; n: number } | null>(null);
    const [empresasCount, setEmpresasCount] = useState<number | null>(null);
    // Empresa e período ativos da sessão (services/empresaAtiva): portão antes de qualquer ação.
    const [visiveis, setVisiveis] = useState<Empresa[] | null>(null);
    const [erroVisiveis, setErroVisiveis] = useState('');
    const [ativa, setAtiva] = useState<EmpresaAtiva | null>(null);
    const [trocando, setTrocando] = useState(false);
    const uidAtual = currentUser ? ((currentUser as any).uid || currentUser.id) : '';
    const [showWelcome, setShowWelcome] = useState(false);
    const [showPendencias, setShowPendencias] = useState(false);
    const prevUserUidRef = useRef<string | null>(null);

    // Outro usuário na mesma aba: começa sem ativação (a dele é lida do navegador).
    useEffect(() => { setAtiva(null); setVisiveis(null); setTrocando(false); }, [uidAtual]);

    useEffect(() => {
        if (!currentUser) return;
        (async () => {
            try {
                const list = await listarEmpresasVisiveis();
                setEmpresasCount(list.length);
                setVisiveis(list); setErroVisiveis('');
                // A ativação guardada (F5) só vale se a empresa continua na carteira.
                setAtiva(a => ativacaoAindaValida(a ?? lerEmpresaAtiva(uidAtual), list));
            } catch (e) {
                console.warn('Falha ao carregar contagem de empresas:', e);
                setEmpresasCount(0);
                setVisiveis([]); setErroVisiveis(`Não foi possível carregar as empresas da sua carteira: ${(e as Error)?.message ?? e}`);
            }
        })();
    }, [currentUser, activeTab]);

    // Boas-vindas: mostra overlay no primeiro login da sessão.
    // sessionStorage evita re-exibição em F5 / navegação SPA.
    useEffect(() => {
        if (!currentUser) {
            prevUserUidRef.current = null;
            return;
        }
        const uid = (currentUser as any).uid || currentUser.email || 'anon';
        // Comportamento B: mostra welcome a cada login (transição !logado -> logado).
        if (prevUserUidRef.current === null) {
            setShowWelcome(true);
        }
        prevUserUidRef.current = uid;
    }, [currentUser]);

    useEffect(() => {
        const unsub = authService.subscribeAuthState((user: User | null) => {
            if (!user) limparSessaoImplantacao();
            setCurrentUser(user);
            setAuthReady(true);
        });
        return () => { if (typeof unsub === 'function') unsub(); };
    }, []);

    // Gate de departamento do SaaS (08/08): pergunta ao cadastro central do
    // CFI se este e-mail abre o módulo DP/Folha. Em modo aviso nunca bloqueia;
    // falha do túnel LIBERA (indeterminado é log, não banner).
    const [gate, setGate] = useState<GateDepartamento | null>(null);
    useEffect(() => {
        if (!currentUser || currentUser.role === 'pendente') { setGate(null); return; }
        let vivo = true;
        consultarGateDepartamento(
            currentUser.email || '',
            async () => {
                const u = getAuth().currentUser;
                if (!u) throw new Error('sem sessão');
                return await u.getIdToken();
            },
        ).then((g) => {
            if (!vivo) return;
            if (g.indeterminado) console.warn('[departamento-gate] indeterminado:', g.motivo);
            setGate(g);
        });
        return () => { vivo = false; };
    }, [currentUser]);

    const handleLogout = async () => {
        // Sair limpa a ativação: quem entra de novo ativa de propósito.
        if (uidAtual) limparEmpresaAtiva(uidAtual);
        setAtiva(null); setVisiveis(null); setTrocando(false);
        try { await authService.logout(); } catch {}
        setCurrentUser(null);
    };

    const ativarEmpresa = (e: EmpresaAtiva) => {
        gravarEmpresaAtiva(uidAtual, e);
        setAtiva(e);
        setTrocando(false);
    };
    const abrirTroca = useCallback(() => setTrocando(true), []);

    if (!authReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500"></div>
            </div>
        );
    }

    if (!currentUser) return (<><UpdateBanner /><LoginScreen /></>);
    if (currentUser.role === 'pendente') return (<><UpdateBanner /><PendingScreen user={currentUser} /></>);
    if (gate && !gate.permitido) {
        // Modo bloqueio: quem vincula é o admin, no Gerenciar Usuários do CFI.
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6 text-center">
                <div className="max-w-lg">
                    <div className="text-5xl mb-3">{gate.bloqueio === 'horario' ? '⏰' : '🔒'}</div>
                    <h2 className="text-xl font-extrabold mb-2 text-slate-800 dark:text-slate-100">{gate.titulo || 'Sem vínculo com o módulo DP/Folha'}</h2>
                    <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{gate.motivo}</p>
                    <button onClick={handleLogout} className="mt-4 px-4 py-2 rounded-lg text-sm font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">Sair</button>
                </div>
            </div>
        );
    }

    const isAdmin = ehAdmin(currentUser.role);

    if (!isAdmin && activeTab === 'admin') {
        setActiveTab('folha');
    }

    // Boas-vindas a cada login: vem ANTES do portão de empresa e período
    // (login → boas-vindas → ativar empresa e período → pendências).
    const boasVindas = showWelcome && currentUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-2xl shrink-0">
                            👋
                        </div>
                        <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                                {saudacaoPorHora()}
                            </div>
                            <div className="text-xl font-bold text-slate-900 dark:text-white truncate">
                                {extrairNomeAmigavel(currentUser)}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-5">
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
                        Você está em <strong>Consultor DP · SP Assessoria</strong>.
                    </p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                        {ativa
                            ? <>Pronto para iniciar o apontamento de folha no <strong>IOB SAGE FOLHAMATIC</strong>?</>
                            : <>Para começar, escolha a empresa da sua carteira e o período em que vai trabalhar.</>}
                    </p>

                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 py-3 border-y border-slate-200 dark:border-slate-700">
                        <span>
                            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <span className="font-mono font-semibold">
                            {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                </div>

                <div className="px-6 pb-6 pt-2">
                    <button
                        onClick={() => { setShowWelcome(false); setShowPendencias(true); }}
                        className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        {ativa ? 'Iniciar Folha de Pagamento' : 'Escolher empresa e período'}
                        <span aria-hidden>→</span>
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    // Portão: tela que trabalha sobre um cliente exige empresa e período ativos.
    if (trocando || (!ativa && exigeEmpresaAtiva(activeTab))) {
        return (
            <><UpdateBanner />
            {boasVindas}
            <AtivarEmpresaScreen
                empresas={visiveis} erro={erroVisiveis} competenciaInicial={competenciaPadrao()} atual={ativa}
                usuarioEmail={currentUser.email}
                onAtivar={ativarEmpresa}
                onCancelar={ativa ? () => setTrocando(false) : undefined}
                onIrParaEmpresas={() => { setTrocando(false); setActiveTab('empresas'); }}
                onIrParaUsuarios={isAdmin ? () => { setTrocando(false); setActiveTab('admin'); } : undefined}
                onSair={handleLogout}
            /></>
        );
    }

    const tabs: { id: Tab; label: string; icon: string; adminOnly: boolean }[] = [
        { id: 'folha',    label: 'Folha',     icon: '📋', adminOnly: false },
        { id: 'cadastros', label: 'Cadastros', icon: '🗃️', adminOnly: false },
        { id: 'calculo',  label: 'Cálculo',   icon: '🧮', adminOnly: false },
        { id: 'prazos',   label: 'Prazos',    icon: '⏰', adminOnly: false },
        { id: 'certificados', label: 'Certificados', icon: '🔐', adminOnly: false },
        { id: 'empresas', label: 'Empresas',  icon: '🏢', adminOnly: false },
        { id: 'esocial',  label: 'eSocial',   icon: '📡', adminOnly: false },
        { id: 'iobsage',  label: 'IOB SAGE',  icon: '🗂️', adminOnly: false },
        { id: 'admin',    label: 'Usuários',  icon: '👥', adminOnly: true  },
    ];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {gate?.aviso && (
                <div className="px-4 py-2 text-center text-[13px] bg-amber-50 text-amber-800 border-b border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800">
                    ⚠ {gate.aviso}
                </div>
            )}
            {boasVindas}

            {showPendencias && currentUser && !showWelcome && (
                <AlertaPendenciasPopup
                    currentUser={currentUser}
                    onNavigateEsocial={() => { setShowPendencias(false); setActiveTab('esocial'); }}
                    onDismiss={() => setShowPendencias(false)}
                />
            )}

            <UpdateBanner />
            <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 shadow-sm">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex items-center justify-between h-14">
                        <div className="flex items-center gap-1">
                            <Logo iconOnly className="h-9 w-9 mr-3 hidden sm:block" />
                            <span className="font-bold text-slate-800 dark:text-white mr-4 hidden sm:block">
                                Consultor DP · SP Assessoria
                            </span>
                            {isAdmin && <a href="https://consultor-fiscal-inteligente-631239634290.us-west1.run.app/?painel=comunicacao&departamento=dp-folha" target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg text-sm font-medium text-blue-700 dark:text-blue-300" title="Administração central de comunicação — acesso de admin no CFI">Templates e agendamentos ↗</a>}
                            {tabs.filter(t => !t.adminOnly || isAdmin).map(t => {
                                const bloqueado = t.id === 'folha' && empresasCount === 0;
                                const titulo = bloqueado ? 'Nenhuma empresa na sua carteira: peça ao gestor ou admin' : t.label;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => !bloqueado && setActiveTab(t.id)}
                                        disabled={bloqueado}
                                        title={titulo}
                                        className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                            bloqueado
                                                ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
                                                : activeTab === t.id
                                                ? 'bg-blue-600 text-white'
                                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                        }`}>
                                        <span className="mr-1">{t.icon}</span>
                                        <span className="hidden sm:inline">{t.label}</span>
                                        {bloqueado && <span className="ml-1 text-xs">(cadastre empresa)</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-2">
                            {isAdmin && (
                                <span className="hidden sm:inline px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs font-medium rounded">
                                    👑 Admin
                                </span>
                            )}
                            <span className="hidden md:block text-sm text-slate-600 dark:text-slate-300">
                                {currentUser.name || currentUser.email}
                            </span>
                            <button onClick={handleLogout} className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg">
                                Sair
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <div className="border-b border-blue-100 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-sm text-blue-900 dark:text-blue-100">
                    {ativa ? (
                        <>
                            <span>🏢 <strong>{ativa.nome}</strong> <span className="text-xs text-blue-700 dark:text-blue-300">CNPJ {ativa.cnpj} · SAGE {ativa.codigoSage}</span></span>
                            <span>📅 Competência <strong>{competenciaBr(ativa.competencia)}</strong></span>
                            <button onClick={abrirTroca} className="rounded border border-blue-300 px-2 py-0.5 text-xs font-medium dark:border-blue-700">⇄ Trocar empresa ou período</button>
                        </>
                    ) : (
                        <>
                            <span>Nenhuma empresa ativa.</span>
                            <button onClick={abrirTroca} className="rounded border border-blue-300 px-2 py-0.5 text-xs font-medium dark:border-blue-700">⚡ Ativar empresa</button>
                        </>
                    )}
                </div>
            </div>

            <EmpresaAtivaProvider ativa={ativa} trocar={abrirTroca}>
            {/* Trocar de empresa ou de período remonta as telas: dado de um cliente (ou de um mês) nunca fica na tela de outro. */}
            <main key={ativa ? `${ativa.id}_${ativa.competencia}` : 'sem-empresa'} className="max-w-7xl mx-auto p-4 sm:p-6">
                {activeTab === 'folha' && (empresasCount && empresasCount > 0
                    ? <FolhaPanel
                        key={folhaSub ? `sub-${folhaSub.n}` : 'folha'}
                        subInicial={folhaSub?.sub}
                        currentUser={currentUser as any}
                        onIrParaEmpresas={() => setActiveTab('empresas')}
                      />
                    : (
                        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                            <h3 className="text-base font-semibold text-amber-800 dark:text-amber-200">Nenhuma empresa na sua carteira</h3>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                Você só trabalha nas empresas da sua carteira. Peça ao gestor (ou ao admin) para incluir
                                suas empresas em Usuários › Carteira, ou cadastre uma empresa nova.
                            </p>
                            <button onClick={() => setActiveTab('empresas')}
                                className="mt-3 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded font-medium">
                                Ir para cadastro de empresas
                            </button>
                        </div>
                    )
                )}
                {activeTab === 'empresas' && <EmpresasPanel currentUser={currentUser as any} />}
                {activeTab === 'esocial' && <ESocialMonitorPanel currentUser={currentUser as any} />}
                {activeTab === 'iobsage' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <IobSagePanel onNavegar={d => {
                            const sub = SUB_FOLHA[d];
                            const cad = SUB_CADASTRO[d];
                            if (sub) { setFolhaSub(f => ({ sub, n: (f?.n ?? 0) + 1 })); setActiveTab('folha'); }
                            else if (cad) { setCadastroSub(c => ({ sub: cad, n: (c?.n ?? 0) + 1 })); setActiveTab('cadastros'); }
                            else if (d === 'empresas' || d === 'esocial' || d === 'calculo') setActiveTab(d);
                        }} />
                    </Suspense>
                )}
                {activeTab === 'calculo' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <CalculoPanel currentUser={currentUser} />
                    </Suspense>
                )}
                {activeTab === 'prazos' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <PrazosPanel onAbrirCadastros={() => setActiveTab('cadastros')} usuario={currentUser ? { id: uidAtual, email: currentUser.email } : undefined}
                            onAbrirConferencia={() => { setFolhaSub(f => ({ sub: 'conferencia', n: (f?.n ?? 0) + 1 })); setActiveTab('folha'); }} />
                    </Suspense>
                )}
                {activeTab === 'cadastros' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <CadastrosPanel key={cadastroSub?.n ?? 0} currentUser={currentUser} subInicial={cadastroSub?.sub}
                            onAbrirEventos={() => { setFolhaSub(f => ({ sub: 'eventos', n: (f?.n ?? 0) + 1 })); setActiveTab('folha'); }} />
                    </Suspense>
                )}
                {activeTab === 'certificados' && (
                    <Suspense fallback={<div className="py-12 text-center text-sm text-slate-500">Carregando…</div>}>
                        <CofreCertificadosPanel />
                    </Suspense>
                )}
                {activeTab === 'admin' && isAdmin && <AdminUsersPanel currentUser={currentUser as any} />}
            </main>
            </EmpresaAtivaProvider>
        </div>
    );
};

export default MainTabs;
