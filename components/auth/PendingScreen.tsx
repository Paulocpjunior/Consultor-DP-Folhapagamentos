import React from 'react';
import * as authService from '../../services/auth/authService';
import type { User } from '../../types';

const PendingScreen: React.FC<{ user: User }> = ({ user }) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-amber-300 dark:border-amber-700 p-6">
            <div className="text-4xl mb-2">⏳</div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Aguardando aprovação</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                Sua conta <strong>{user.email}</strong> foi criada com sucesso e está aguardando aprovação de um administrador.
                Você receberá acesso assim que for liberado.
            </p>
            <button
                onClick={() => authService.logout()}
                className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg"
            >
                Sair
            </button>
        </div>
    </div>
);

export default PendingScreen;
