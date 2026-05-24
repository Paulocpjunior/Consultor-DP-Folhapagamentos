import React, { useState, useMemo } from 'react';
import { gerarCalendarioObrigacoes } from '../../services/esocial/esocialService';
import type { ObrigacaoTrabalhista } from '../../services/esocial/esocialTypes';

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
    pendente: { label: 'Pendente', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    cumprida: { label: 'Cumprida', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    atrasada: { label: 'Atrasada', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

const TIPO_ICON: Record<string, string> = {
    esocial: '📡',
    fgts: '💰',
    dctfweb: '📋',
    inss: '🏛️',
};

const ESocialCalendario: React.FC = () => {
    const hoje = new Date();
    const [competencia, setCompetencia] = useState(
        `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
    );

    const obrigacoes = useMemo(() => gerarCalendarioObrigacoes(competencia), [competencia]);

    const [ano, mes] = competencia.split('-').map(Number);
    const nomeMes = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

    const navMes = (delta: number) => {
        const d = new Date(ano, mes - 1 + delta);
        setCompetencia(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };

    const atrasadas = obrigacoes.filter(o => o.status === 'atrasada').length;
    const pendentes = obrigacoes.filter(o => o.status === 'pendente').length;

    return (
        <div className="space-y-4">
            {/* Nav de mês */}
            <div className="flex items-center justify-between">
                <button onClick={() => navMes(-1)}
                    className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg">
                    ← Anterior
                </button>
                <div className="text-center">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white capitalize">{nomeMes}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {atrasadas > 0 && <span className="text-red-600 dark:text-red-400 font-medium">{atrasadas} atrasada(s)</span>}
                        {atrasadas > 0 && pendentes > 0 && ' · '}
                        {pendentes > 0 && <span className="text-amber-600 dark:text-amber-400">{pendentes} pendente(s)</span>}
                        {atrasadas === 0 && pendentes === 0 && <span className="text-green-600 dark:text-green-400">Tudo em dia!</span>}
                    </p>
                </div>
                <button onClick={() => navMes(1)}
                    className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg">
                    Próximo →
                </button>
            </div>

            {/* Lista de obrigações */}
            <div className="space-y-2">
                {obrigacoes.map(o => (
                    <div key={o.id}
                        className={`p-3 rounded-lg border flex items-start gap-3 ${
                            o.status === 'atrasada'
                                ? 'border-red-200 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                    >
                        <span className="text-xl">{TIPO_ICON[o.tipo] || '📄'}</span>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-slate-800 dark:text-white">{o.nome}</span>
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[o.status].cls}`}>
                                    {STATUS_STYLE[o.status].label}
                                </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{o.descricao}</p>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 dark:text-slate-400">
                                <span>
                                    <strong>Vencimento:</strong> dia {o.diaVencimento}/{String(mes).padStart(2, '0')}
                                </span>
                                <span className="font-mono px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded">
                                    {o.sigla}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ESocialCalendario;
