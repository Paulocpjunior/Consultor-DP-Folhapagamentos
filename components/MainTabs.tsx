import React, { useState, useEffect, useRef } from 'react';
import * as authService from '../services/auth/authService';
import LoginScreen from './auth/LoginScreen';
import PendingScreen from './auth/PendingScreen';
import AdminUsersPanel from './auth/AdminUsersPanel';
import FolhaPanel from './folha/FolhaPanel';
import EmpresasPanel from './empresas/EmpresasPanel';
import Logo from './Logo';
import UpdateBanner from './UpdateBanner';
import { listarMinhasEmpresas, listarTodasEmpresas } from '../services/empresas/empresasService';
import type { User } from '../types';

type Tab = 'folha' | 'empresas' | 'admin';

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
    const [empresasCount, setEmpresasCount] = useState<number | null>(null);
    const [showWelcome, setShowWelcome] = useState(false);
    const prevUserUidRef = useRef<string | null>(null);

    useEffect(() => {
        if (!currentUser) return;
        (async () => {
            try {
                const isAdminUser = currentUser.role === 'admin';
                const list = isAdminUser
                    ? await listarTodasEmpresas()
                    : await listarMinhasEmpresas((currentUser as any).uid);
                setEmpresasCount(list.length);
            } catch (e) {
                console.warn('Falha ao carregar contagem de empresas:', e);
                setEmpresasCount(0);
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
            setCurrentUser(user);
            setAuthReady(true);
        });
        return () => { if (typeof unsub === 'function') unsub(); };
    }, []);

    const handleLogout = async () => {
        try { await authService.logout(); } catch {}
        setCurrentUser(null);
    };

    if (!authReady) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-blue-500"></div>
            </div>
        );
    }

    if (!currentUser) return (<><UpdateBanner /><LoginScreen /></>);
    if (currentUser.role === 'pendente') return (<><UpdateBanner /><PendingScreen user={currentUser} /></>);

    const isAdmin = currentUser.role === 'admin';

    if (!isAdmin && activeTab === 'admin') {
        setActiveTab('folha');
    }

    const tabs: { id: Tab; label: string; icon: string; adminOnly: boolean }[] = [
        { id: 'folha',    label: 'Folha',     icon: '📋', adminOnly: false },
        { id: 'empresas', label: 'Empresas',  icon: '🏢', adminOnly: false },
        { id: 'admin',    label: 'Usuários',  icon: '👥', adminOnly: true  },
    ];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {showWelcome && currentUser && (
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
                                Pronto para iniciar o apontamento de folha no <strong>IOB SAGE FOLHAMATIC</strong>?
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
                                onClick={() => setShowWelcome(false)}
                                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                Iniciar Folha de Pagamento
                                <span aria-hidden>→</span>
                            </button>
                        </div>
                    </div>
                </div>
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
                            {tabs.filter(t => !t.adminOnly || isAdmin).map(t => {
                                const bloqueado = t.id === 'folha' && empresasCount === 0;
                                const titulo = bloqueado ? 'Cadastre uma empresa antes de acessar a Folha' : t.label;
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

            <main className="max-w-7xl mx-auto p-4 sm:p-6">
                {activeTab === 'folha' && (empresasCount && empresasCount > 0
                    ? <FolhaPanel
                        currentUser={currentUser as any}
                        onIrParaEmpresas={() => setActiveTab('empresas')}
                      />
                    : (
                        <div className="p-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                            <h3 className="text-base font-semibold text-amber-800 dark:text-amber-200">Nenhuma empresa cadastrada</h3>
                            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                Antes de processar a folha, e necessario cadastrar pelo menos uma empresa.
                                Isso evita importacoes em empresas erradas.
                            </p>
                            <button onClick={() => setActiveTab('empresas')}
                                className="mt-3 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded font-medium">
                                Ir para cadastro de empresas
                            </button>
                        </div>
                    )
                )}
                {activeTab === 'empresas' && <EmpresasPanel currentUser={currentUser as any} />}
                {activeTab === 'admin' && isAdmin && <AdminUsersPanel currentUser={currentUser as any} />}
            </main>
        </div>
    );
};

export default MainTabs;
