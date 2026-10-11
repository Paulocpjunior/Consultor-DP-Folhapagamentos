// components/sindicatos/SinalRenovacao.tsx
//
// Sinalizador da renovação da convenção coletiva: dias que faltam ou dias em atraso da nova publicação
// (services/sindicatos/convencao.ts: renovacaoDoSindicato).

import React from 'react';
import type { Renovacao } from '../../services/sindicatos/convencao';

const COR: Record<Renovacao['sinal'], string> = {
    verde: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    amarelo: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    laranja: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
    vermelho: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    cinza: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};
const PONTO: Record<Renovacao['sinal'], string> = { verde: 'bg-green-500', amarelo: 'bg-amber-500', laranja: 'bg-orange-500', vermelho: 'bg-red-600', cinza: 'bg-slate-400' };

const SinalRenovacao: React.FC<{ r: Renovacao; compacto?: boolean }> = ({ r, compacto }) => (
    <span title={`Renovação da convenção: ${r.rotulo}`}
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${COR[r.sinal]}`}>
        <span className={`h-2 w-2 rounded-full ${PONTO[r.sinal]} ${r.situacao === 'em-atraso' ? 'animate-pulse' : ''}`} aria-hidden="true" />
        {compacto ? (r.situacao === 'em-atraso' ? `${r.dias} dia${r.dias === 1 ? '' : 's'} em atraso` : r.situacao === 'sem-convencao' ? 'sem convenção' : `${r.dias} dia${r.dias === 1 ? '' : 's'} para renovar`) : r.rotulo}
    </span>
);

export default SinalRenovacao;
