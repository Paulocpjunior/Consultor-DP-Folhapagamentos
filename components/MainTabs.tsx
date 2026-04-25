import React, { useState, useEffect } from 'react';
import * as authService from '../services/auth/authService';
import LoginScreen from './auth/LoginScreen';
import PendingScreen from './auth/PendingScreen';
import AdminUsersPanel from './auth/AdminUsersPanel';
import FolhaPanel from './folha/FolhaPanel';
import EmpresasPanel from './empresas/EmpresasPanel';
import type { User } from '../types';

type Tab = 'folha' | 'empresas' | 'admin';

const MainTabs: React.FC<{ children?: React.ReactNode }> = () => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('folha');

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

    if (!currentUser) return <LoginScreen />;
    if (currentUser.role === 'pendente') return <PendingScreen user={currentUser} />;

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
            <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40 shadow-sm">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="flex items-center justify-between h-14">
                        <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-800 dark:text-white mr-4 hidden sm:block">
                                Consultor DP · SP Assessoria
                            </span>
                            {tabs.filter(t => !t.adminOnly || isAdmin).map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id)}
                                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                        activeTab === t.id
                                            ? 'bg-blue-600 text-white'
                                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}>
                                    <span className="mr-1">{t.icon}</span>
                                    <span className="hidden sm:inline">{t.label}</span>
                                </button>
                            ))}
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
                {activeTab === 'folha' && <FolhaPanel currentUser={currentUser as any} />}
                {activeTab === 'empresas' && <EmpresasPanel currentUser={currentUser as any} />}
                {activeTab === 'admin' && isAdmin && <AdminUsersPanel currentUser={currentUser as any} />}
            </main>
        </div>
    );
};

export default MainTabs;
