// components/folha/HistoricoEventosModal.tsx
// Modal com histórico geral de alterações em eventos.

import React, { useEffect, useState } from 'react';
import { getHistoricoGeral, type AuditEntry } from '../../services/folha/folhaEventosCrudService';

interface Props {
    aberto: boolean;
    onFechar: () => void;
}

const HistoricoEventosModal: React.FC<Props> = ({ aberto, onFechar }) => {
    const [historico, setHistorico] = useState<AuditEntry[]>([]);
    const [carregando, setCarregando] = useState(false);

    useEffect(() => {
        if (!aberto) return;
        setCarregando(true);
        getHistoricoGeral(100)
            .then(setHistorico)
            .finally(() => setCarregando(false));
    }, [aberto]);

    if (!aberto) return null;

    const acaoBadge = (a: AuditEntry['action']) => {
        const map: Record<AuditEntry['action'], string> = {
            create: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
            update: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
            delete: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
            recode: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
        };
        return (
            <span className={`px-2 py-0.5 text-xs font-semibold rounded ${map[a]}`}>{a}</span>
        );
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto"
            onClick={(e) => e.target === e.currentTarget && onFechar()}
        >
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl w-full max-w-5xl my-8">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                        Histórico de alterações no catálogo
                    </h3>
                    <button
                        onClick={onFechar}
                        className="text-slate-500 hover:text-slate-800 dark:hover:text-white text-xl leading-none px-2"
                    >
                        ×
                    </button>
                </div>

                <div className="p-4 max-h-[70vh] overflow-y-auto">
                    {carregando ? (
                        <p className="text-center py-8 text-slate-500">Carregando histórico…</p>
                    ) : historico.length === 0 ? (
                        <p className="text-center py-8 text-slate-500">Sem alterações registradas ainda.</p>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                                <tr className="text-left">
                                    <th className="px-2 py-2">Data/Hora</th>
                                    <th className="px-2 py-2">Usuário</th>
                                    <th className="px-2 py-2">Evento</th>
                                    <th className="px-2 py-2">Ação</th>
                                    <th className="px-2 py-2">Campos alterados</th>
                                    <th className="px-2 py-2">Observação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {historico.map((h) => {
                                    const ts = h.timestamp?.toDate
                                        ? h.timestamp.toDate().toLocaleString('pt-BR')
                                        : '—';
                                    return (
                                        <tr
                                            key={h.id}
                                            className="border-t border-slate-100 dark:border-slate-700"
                                        >
                                            <td className="px-2 py-1.5 text-slate-500 text-xs">{ts}</td>
                                            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">
                                                {h.user?.name || '—'}
                                            </td>
                                            <td className="px-2 py-1.5 font-mono font-semibold text-slate-800 dark:text-white">
                                                {h.eventoCod}
                                            </td>
                                            <td className="px-2 py-1.5">{acaoBadge(h.action)}</td>
                                            <td className="px-2 py-1.5 text-xs text-slate-600 dark:text-slate-400">
                                                {(h.changes || []).join(', ') || '—'}
                                            </td>
                                            <td className="px-2 py-1.5 text-xs text-slate-500">
                                                {h.notes || ''}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HistoricoEventosModal;
