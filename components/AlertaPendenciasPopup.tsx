import React, { useEffect, useState } from 'react';
import { calcularResumoPendencias } from '../services/esocial/esocialService';
import type { ResumoPendencias } from '../services/esocial/esocialService';
import type { User } from '../types';

const STORAGE_KEY = 'dp:lastAlertDate';

function saudacaoPorHora(): string {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Bom dia';
    if (h >= 12 && h < 18) return 'Boa tarde';
    return 'Boa noite';
}

function extrairNomeAmigavel(user: any): string {
    if (!user) return 'Usuario';
    const candidato = user.nome || user.displayName || user.name;
    if (candidato && typeof candidato === 'string' && candidato.trim()) {
        return candidato.trim().split(/\s+/)[0];
    }
    if (user.email && typeof user.email === 'string') {
        const local = user.email.split('@')[0];
        if (local) return local.charAt(0).toUpperCase() + local.slice(1);
    }
    return 'Usuario';
}

function jaViuHoje(): boolean {
    const ultimo = localStorage.getItem(STORAGE_KEY);
    if (!ultimo) return false;
    const hoje = new Date().toISOString().slice(0, 10);
    return ultimo === hoje;
}

function marcarVisto(): void {
    const hoje = new Date().toISOString().slice(0, 10);
    localStorage.setItem(STORAGE_KEY, hoje);
}

interface Props {
    currentUser: User;
    onNavigateEsocial: () => void;
    onDismiss: () => void;
}

const AlertaPendenciasPopup: React.FC<Props> = ({ currentUser, onNavigateEsocial, onDismiss }) => {
    const [resumo, setResumo] = useState<ResumoPendencias | null>(null);
    const [loading, setLoading] = useState(true);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (jaViuHoje()) {
            onDismiss();
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const res = await calcularResumoPendencias();
                if (cancelled) return;
                if (!res.temPendencias) {
                    onDismiss();
                    return;
                }
                setResumo(res);
                setVisible(true);
            } catch (e) {
                console.warn('Erro ao calcular pendencias:', e);
                onDismiss();
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, []);

    const handleDispensar = () => {
        marcarVisto();
        setVisible(false);
        onDismiss();
    };

    const handleVerDetalhes = () => {
        marcarVisto();
        setVisible(false);
        onNavigateEsocial();
    };

    if (!visible || !resumo) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 bg-gradient-to-br from-amber-500/10 to-red-500/10 dark:from-amber-500/20 dark:to-red-500/20 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-2xl shrink-0">
                            <span role="img" aria-label="alerta">&#9888;&#65039;</span>
                        </div>
                        <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                                Pendencias Encontradas
                            </div>
                            <div className="text-xl font-bold text-slate-900 dark:text-white truncate">
                                {saudacaoPorHora()}, {extrairNomeAmigavel(currentUser)}!
                            </div>
                        </div>
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                    {/* Section 1: FGTS */}
                    {(resumo.fgtsAtrasados > 0 || resumo.fgtsParciais > 0) && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span>&#128176;</span> FGTS em Aberto / Atrasado
                            </h3>
                            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-2">
                                {resumo.fgtsAtrasados > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                            {resumo.fgtsAtrasados} atrasado{resumo.fgtsAtrasados > 1 ? 's' : ''}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            empresa(s) com FGTS atrasado
                                        </span>
                                    </div>
                                )}
                                {resumo.fgtsParciais > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                            {resumo.fgtsParciais} parcial{resumo.fgtsParciais > 1 ? 'is' : ''}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            empresa(s) com FGTS parcialmente recolhido
                                        </span>
                                    </div>
                                )}
                                {resumo.fgtsValorPendente > 0 && (
                                    <div className="mt-1 text-sm font-medium text-red-700 dark:text-red-300">
                                        Total pendente: {resumo.fgtsValorPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Section 2: Eventos eSocial */}
                    {(resumo.eventosPendentes > 0 || resumo.eventosRejeitados > 0) && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span>&#128225;</span> Eventos eSocial Pendentes
                            </h3>
                            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                                <div className="flex flex-wrap items-center gap-2">
                                    {resumo.eventosPendentes > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                            {resumo.eventosPendentes} pendente{resumo.eventosPendentes > 1 ? 's' : ''}
                                        </span>
                                    )}
                                    {resumo.eventosRejeitados > 0 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                            {resumo.eventosRejeitados} rejeitado{resumo.eventosRejeitados > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                                    {resumo.eventosPendentes} evento(s) pendente(s){resumo.eventosRejeitados > 0 ? `, ${resumo.eventosRejeitados} rejeitado(s) necessitando retransmissao` : ''}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Section 3: Obrigacoes a Vencer */}
                    {resumo.alertasVencimento > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span>&#9889;</span> Obrigacoes a Vencer (proximos 5 dias)
                            </h3>
                            <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                    {resumo.alertasVencimento} evento(s) proximo(s) do vencimento ou ja vencido(s).
                                </p>
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                    Acesse a aba eSocial para ver os detalhes de cada evento.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Section 4: Certificados Digitais */}
                    {(resumo.certsVencidos > 0 || resumo.certsVencendo > 0) && (
                        <div className="space-y-2">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                <span>&#128272;</span> Certificados Digitais
                            </h3>
                            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 space-y-2">
                                {resumo.certsVencidos > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                                            {resumo.certsVencidos} vencido{resumo.certsVencidos > 1 ? 's' : ''}
                                        </span>
                                        <span className="text-xs text-red-600 dark:text-red-400">
                                            certificado(s) expirado(s) - renovacao urgente
                                        </span>
                                    </div>
                                )}
                                {resumo.certsVencendo > 0 && (
                                    <div className="flex items-center gap-2">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                            {resumo.certsVencendo} vencendo
                                        </span>
                                        <span className="text-xs text-amber-600 dark:text-amber-400">
                                            certificado(s) vencem em menos de 30 dias
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-3 border-t border-slate-200 dark:border-slate-700 flex gap-3 shrink-0">
                    <button
                        onClick={handleVerDetalhes}
                        className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                        Ver detalhes
                        <span aria-hidden="true">&rarr;</span>
                    </button>
                    <button
                        onClick={handleDispensar}
                        className="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium rounded-lg transition-colors"
                    >
                        Dispensar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertaPendenciasPopup;
