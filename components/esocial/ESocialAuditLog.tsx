import React, { useEffect, useState } from 'react';
import { listarAuditLogs } from '../../services/esocial/esocialService';
import type { AuditLog, AuditAcao } from '../../services/esocial/esocialTypes';

const ACAO_LABELS: Record<AuditAcao, { label: string; cls: string }> = {
    transmitir_evento:        { label: 'Transmitir',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    transmitir_lote:          { label: 'Lote',          cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
    transmitir_multi_empresa: { label: 'Multi-Empresa', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    consultar_protocolo:      { label: 'Consultar',     cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' },
    retificar_evento:         { label: 'Retificar',     cls: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
    criar_evento:             { label: 'Criar',         cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
    excluir_evento:           { label: 'Excluir',       cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    alterar_status:           { label: 'Status',        cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

const ESocialAuditLog: React.FC = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [limite, setLimite] = useState(50);

    const reload = async () => {
        setLoading(true);
        try {
            const result = await listarAuditLogs(limite);
            setLogs(result);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { reload(); }, [limite]);

    const formatDate = (ts: any) => {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    if (loading) {
        return <div className="py-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 mx-auto"></div></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200">
                    Histórico de Ações ({logs.length})
                </h3>
                <select value={limite} onChange={e => setLimite(Number(e.target.value))}
                    className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    <option value={25}>Últimos 25</option>
                    <option value={50}>Últimos 50</option>
                    <option value={100}>Últimos 100</option>
                </select>
            </div>

            {logs.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                    Nenhum registro de auditoria encontrado.
                </div>
            ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800">
                            <tr>
                                <th className="py-2 px-2 text-left font-medium text-slate-500">Data</th>
                                <th className="py-2 px-2 text-left font-medium text-slate-500">Ação</th>
                                <th className="py-2 px-2 text-left font-medium text-slate-500">Usuário</th>
                                <th className="py-2 px-2 text-left font-medium text-slate-500">Detalhes</th>
                                <th className="py-2 px-2 text-center font-medium text-slate-500">Resultado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(log => {
                                const acaoInfo = ACAO_LABELS[log.acao] || { label: log.acao, cls: 'bg-slate-100 text-slate-600' };
                                return (
                                    <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                            {formatDate(log.criadoEm)}
                                        </td>
                                        <td className="py-1.5 px-2">
                                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${acaoInfo.cls}`}>
                                                {acaoInfo.label}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">
                                            {log.usuarioEmail?.split('@')[0] || '—'}
                                        </td>
                                        <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300 max-w-xs truncate" title={log.detalhes}>
                                            {log.eventoTipo && <span className="font-mono mr-1">{log.eventoTipo}</span>}
                                            {log.detalhes}
                                        </td>
                                        <td className="py-1.5 px-2 text-center">
                                            <span className={log.sucesso ? 'text-green-600' : 'text-red-600'}>
                                                {log.sucesso ? 'OK' : 'ERRO'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default ESocialAuditLog;
