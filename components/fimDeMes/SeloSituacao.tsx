// components/fimDeMes/SeloSituacao.tsx — selo da situação da competência (Fim de mês): aberta, encerrada ou reaberta.

import React from 'react';
import { ROTULO_SITUACAO, type SituacaoPeriodo } from '../../services/fimDeMes/fechamento';

export const SeloSituacao: React.FC<{ situacao: SituacaoPeriodo; compacto?: boolean }> = ({ situacao, compacto }) => {
    const cor = { aberto: 'bg-slate-500/15 text-slate-600 ring-slate-500/30 dark:text-slate-300', encerrado: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300', reaberto: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300' }[situacao];
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cor}`}>{situacao === 'encerrado' ? '🔒' : situacao === 'reaberto' ? '↺' : '○'}{!compacto && ` ${ROTULO_SITUACAO[situacao]}`}</span>;
};
