import React, { useEffect, useState } from 'react';
import { calcularResumoDashboard, listarEventos, calcularAlertasVencimento } from '../../services/esocial/esocialService';
import type { DashboardResumo, EventoEsocial } from '../../services/esocial/esocialTypes';
import { EVENTO_LABELS } from '../../services/esocial/esocialTypes';

const ESocialDashboard: React.FC = () => {
    const [resumo, setResumo] = useState<DashboardResumo | null>(null);
    const [alertas, setAlertas] = useState<EventoEsocial[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const [res, eventos] = await Promise.all([
                    calcularResumoDashboard(),
                    listarEventos(),
                ]);
                setResumo(res);
                setAlertas(calcularAlertasVencimento(eventos));
            } catch (e: any) {
                setErro(e?.message || 'Erro ao carregar dashboard');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
            </div>
        );
    }

    if (erro) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
            </div>
        );
    }

    if (!resumo) return null;

    const cards = [
        { label: 'Empresas Monitoradas', valor: resumo.totalEmpresas, icon: '🏢', cor: 'blue' },
        { label: 'Eventos Pendentes', valor: resumo.eventosPendentes, icon: '⏳', cor: 'amber' },
        { label: 'Eventos Rejeitados', valor: resumo.eventosRejeitados, icon: '❌', cor: 'red' },
        { label: 'FGTS Atrasado', valor: resumo.fgtsAtrasado, icon: '⚠️', cor: 'orange' },
    ];

    const corClasses: Record<string, string> = {
        blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300',
        amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300',
        red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300',
        orange: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700 text-orange-700 dark:text-orange-300',
    };

    return (
        <div className="space-y-6">
            {/* Cards de resumo */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {cards.map(c => (
                    <div key={c.label} className={`p-4 rounded-lg border ${corClasses[c.cor]}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">{c.icon}</span>
                            <span className="text-xs font-medium uppercase tracking-wide">{c.label}</span>
                        </div>
                        <div className="text-2xl font-bold">{c.valor}</div>
                    </div>
                ))}
            </div>

            {/* Teses de recuperação estimado */}
            {resumo.tesesTotalEstimado > 0 && (
                <div className="p-4 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
                    <div className="flex items-center gap-2">
                        <span className="text-lg">💡</span>
                        <span className="text-sm font-medium text-green-700 dark:text-green-300">
                            Potencial de recuperação tributária identificado:
                        </span>
                        <span className="text-lg font-bold text-green-800 dark:text-green-200">
                            {resumo.tesesTotalEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                    </div>
                </div>
            )}

            {/* Alertas de vencimento */}
            {alertas.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                        ⚡ Alertas - Eventos próximos do vencimento
                    </h3>
                    <ul className="space-y-1">
                        {alertas.slice(0, 5).map(a => (
                            <li key={a.id} className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                                <span className="font-mono text-xs bg-amber-100 dark:bg-amber-800 px-1.5 py-0.5 rounded">
                                    {a.tipo}
                                </span>
                                <span>{EVENTO_LABELS[a.tipo]}</span>
                                <span className="text-xs opacity-75">— {a.competencia}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Estado vazio */}
            {resumo.totalEmpresas === 0 && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    <div className="text-4xl mb-3">📡</div>
                    <h3 className="text-base font-semibold mb-1">Nenhum evento cadastrado</h3>
                    <p className="text-sm">
                        Adicione eventos eSocial na aba "Eventos" para começar o monitoramento.
                    </p>
                </div>
            )}
        </div>
    );
};

export default ESocialDashboard;
