// components/fimDeMes/SeloSituacao.tsx — selo da situação da competência (Fim de mês): aberta, encerrada ou reaberta.

import React from 'react';
import { ROTULO_SITUACAO, type SituacaoPeriodo } from '../../services/fimDeMes/fechamento';

/** `sobreEscuro`: no cabeçalho, que é sempre escuro (também no tema claro), as cores do tema escuro. */
export const SeloSituacao: React.FC<{ situacao: SituacaoPeriodo; compacto?: boolean; sobreEscuro?: boolean }> = ({ situacao, compacto, sobreEscuro }) => {
    const cor = sobreEscuro
        ? { aberto: 'bg-white/10 text-slate-200 ring-white/25', encerrado: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40', reaberto: 'bg-amber-500/20 text-amber-200 ring-amber-400/40' }[situacao]
        : { aberto: 'bg-slate-500/15 text-slate-600 ring-slate-500/30 dark:text-slate-300', encerrado: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300', reaberto: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300' }[situacao];
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cor}`}>{situacao === 'encerrado' ? '🔒' : situacao === 'reaberto' ? '↺' : '○'}{!compacto && ` ${ROTULO_SITUACAO[situacao]}`}</span>;
};
