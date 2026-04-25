// components/folha/FolhaPanel.tsx
import React, { useState, Suspense, lazy } from 'react';
import type { User } from '../../types';

const EventosIobSagePanel = lazy(() => import('./EventosIobSagePanel'));
const ApontamentoFolhaPanel = lazy(() => import('./ApontamentoFolhaPanel'));

type SubTab = 'eventos' | 'apontamento';

interface FolhaPanelProps {
    currentUser: User;
}

const FolhaPanel: React.FC<FolhaPanelProps> = ({ currentUser }) => {
    const [sub, setSub] = useState<SubTab>('apontamento');

    const subtabs: { id: SubTab; label: string; icon: string; desc: string }[] = [
        {
            id: 'apontamento',
            label: 'Apontamento',
            icon: '📝',
            desc: 'Importa a planilha do cliente e exporta lançamentos para o IOB SAGE',
        },
        {
            id: 'eventos',
            label: 'Catálogo de Eventos',
            icon: '📚',
            desc: 'Eventos do IOB SAGE FOLHAMATIC e seleção por cliente',
        },
    ];

    return (
        <div>
            <header className="mb-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    📋 Folha de Pagamento — IOB SAGE FOLHAMATIC
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Parametrização e exportação do apontamento de folha para o SAGE.
                </p>
            </header>

            <div className="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700">
                {subtabs.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setSub(t.id)}
                        className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                            sub === t.id
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                    >
                        <span className="mr-1">{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                {subtabs.find((t) => t.id === sub)?.desc}
            </p>

            <Suspense
                fallback={
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500"></div>
                    </div>
                }
            >
                {sub === 'eventos' && <EventosIobSagePanel currentUser={currentUser} />}
                {sub === 'apontamento' && <ApontamentoFolhaPanel currentUser={currentUser} />}
            </Suspense>
        </div>
    );
};

export default FolhaPanel;
