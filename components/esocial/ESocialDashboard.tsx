import React, { useEffect, useState } from 'react';
import { calcularResumoDashboard, listarEventos, calcularAlertasVencimento } from '../../services/esocial/esocialService';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import { calcularStatusCertificado, diasParaVencer, getStatusLabel } from '../../services/empresas/certificadoService';
import type { DashboardResumo, EventoEsocial } from '../../services/esocial/esocialTypes';
import { EVENTO_LABELS } from '../../services/esocial/esocialTypes';
import type { Empresa } from '../../services/empresas/empresasTypes';

const ESocialDashboard: React.FC = () => {
    const [resumo, setResumo] = useState<DashboardResumo | null>(null);
    const [alertas, setAlertas] = useState<EventoEsocial[]>([]);
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');

    useEffect(() => {
        (async () => {
            try {
                setLoading(true);
                const [res, eventos, emps] = await Promise.all([
                    calcularResumoDashboard(),
                    listarEventos(),
                    listarTodasEmpresas(),
                ]);
                setResumo(res);
                setAlertas(calcularAlertasVencimento(eventos));
                setEmpresas(emps);
            } catch (e: any) {
                setErro(e?.message || 'Erro ao carregar dashboard');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const certsVencendo = empresas.filter(e => calcularStatusCertificado(e.certificado?.validade) === 'vencendo');
    const certsVencidos = empresas.filter(e => calcularStatusCertificado(e.certificado?.validade) === 'vencido');
    const semCert = empresas.filter(e => !e.certificado);

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

            {/* Certificados Digitais */}
            {(certsVencidos.length > 0 || certsVencendo.length > 0 || semCert.length > 0) && (
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">🔐 Certificados Digitais</h3>
                    {certsVencidos.length > 0 && (
                        <div className="p-3 rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20">
                            <div className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">Certificados Vencidos ({certsVencidos.length})</div>
                            <ul className="space-y-0.5">
                                {certsVencidos.map(e => (
                                    <li key={e.id} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                                        <span>{e.nomeFantasia}</span>
                                        <span className="opacity-75">— venceu em {new Date(e.certificado!.validade + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {certsVencendo.length > 0 && (
                        <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                            <div className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">Vencendo em breve ({certsVencendo.length})</div>
                            <ul className="space-y-0.5">
                                {certsVencendo.map(e => (
                                    <li key={e.id} className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                        <span>{e.nomeFantasia}</span>
                                        <span className="opacity-75">— {diasParaVencer(e.certificado!.validade)} dias restantes</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {semCert.length > 0 && (
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                            <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Sem certificado ({semCert.length})</div>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {semCert.map(e => e.nomeFantasia).join(', ')}
                            </p>
                        </div>
                    )}
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
