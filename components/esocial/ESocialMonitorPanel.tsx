import React, { useState } from 'react';
import ESocialDashboard from './ESocialDashboard';
import ESocialEventos from './ESocialEventos';
import ESocialFgts from './ESocialFgts';
import ESocialCalendario from './ESocialCalendario';
import ESocialTeses from './ESocialTeses';
import ESocialCertificados from './ESocialCertificados';
import ESocialRelatorio from './ESocialRelatorio';
import ESocialAuditLog from './ESocialAuditLog';
import PontoEditorPanel from '../ponto/PontoEditorPanel';
import PontoPanel from '../ponto/PontoPanel';
import type { User } from '../../types';

type SubTab = 'dashboard' | 'eventos' | 'fgts' | 'calendario' | 'certificados' | 'teses' | 'ponto' | 'ponto_eletronico' | 'relatorio' | 'audit';

interface Props {
    currentUser: User;
}

const ESocialMonitorPanel: React.FC<Props> = ({ currentUser }) => {
    const [subTab, setSubTab] = useState<SubTab>('dashboard');

    const tabs: { id: SubTab; label: string; icon: string }[] = [
        { id: 'dashboard',    label: 'Dashboard',    icon: '📊' },
        { id: 'eventos',      label: 'Eventos',      icon: '📄' },
        { id: 'fgts',         label: 'FGTS Digital', icon: '💰' },
        { id: 'calendario',   label: 'Calendário',   icon: '📅' },
        { id: 'certificados', label: 'Certificados', icon: '🔐' },
        { id: 'teses',        label: 'Recuperação',  icon: '⚖️' },
        { id: 'ponto',             label: 'Ponto Editor', icon: '🕐' },
        { id: 'ponto_eletronico',  label: 'Ponto',        icon: '⏰' },
        { id: 'relatorio',         label: 'Relatório',    icon: '📋' },
        { id: 'audit',        label: 'Audit Log',    icon: '📝' },
    ];

    return (
        <div>
            <header className="mb-4">
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                    eSocial Monitor
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Monitoramento de eventos, FGTS Digital e obrigações trabalhistas
                </p>
            </header>

            <div className="flex flex-wrap gap-1 mb-4 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setSubTab(t.id)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            subTab === t.id
                                ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <span className="mr-1">{t.icon}</span>
                        <span className="hidden sm:inline">{t.label}</span>
                    </button>
                ))}
            </div>

            {subTab === 'dashboard' && <ESocialDashboard />}
            {subTab === 'eventos' && <ESocialEventos currentUser={currentUser} />}
            {subTab === 'fgts' && <ESocialFgts />}
            {subTab === 'calendario' && <ESocialCalendario />}
            {subTab === 'certificados' && <ESocialCertificados />}
            {subTab === 'teses' && <ESocialTeses />}
            {subTab === 'ponto' && <PontoEditorPanel currentUser={currentUser} />}
            {subTab === 'ponto_eletronico' && <PontoPanel currentUser={currentUser} />}
            {subTab === 'relatorio' && <ESocialRelatorio />}
            {subTab === 'audit' && <ESocialAuditLog />}
        </div>
    );
};

export default ESocialMonitorPanel;
