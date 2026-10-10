// components/layout/cores.ts
//
// Cor de cada grupo do menu: a mesma no ícone do menu, nos itens do painel e no título da página,
// para o colaborador associar a cor ao grupo (Folha do mês verde, Fim de mês rosa…).
// As classes ficam escritas por inteiro para o Tailwind gerá-las.

export type CorGrupo = 'empresas' | 'cadastros' | 'folha' | 'conferencia' | 'esocial' | 'prazos' | 'fimdemes' | 'config';

interface Classes { solido: string; ativo: string; claro: string; barra: string }

export const COR: Record<CorGrupo, Classes> = {
    empresas:    { solido: 'bg-gradient-to-br from-sky-400 to-sky-600',             ativo: 'border-sky-400',     claro: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',             barra: 'text-sky-700 dark:text-sky-300' },
    cadastros:   { solido: 'bg-gradient-to-br from-violet-400 to-violet-600',    ativo: 'border-violet-400',  claro: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', barra: 'text-violet-700 dark:text-violet-300' },
    folha:       { solido: 'bg-gradient-to-br from-emerald-400 to-emerald-600', ativo: 'border-emerald-400', claro: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', barra: 'text-emerald-700 dark:text-emerald-300' },
    conferencia: { solido: 'bg-gradient-to-br from-amber-400 to-amber-600',       ativo: 'border-amber-400',   claro: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',     barra: 'text-amber-700 dark:text-amber-300' },
    esocial:     { solido: 'bg-gradient-to-br from-indigo-400 to-indigo-600',    ativo: 'border-indigo-400',  claro: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300', barra: 'text-indigo-700 dark:text-indigo-300' },
    prazos:      { solido: 'bg-gradient-to-br from-orange-400 to-orange-600',    ativo: 'border-orange-400',  claro: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300', barra: 'text-orange-700 dark:text-orange-300' },
    fimdemes:    { solido: 'bg-gradient-to-br from-rose-400 to-rose-600',          ativo: 'border-rose-400',    claro: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',         barra: 'text-rose-700 dark:text-rose-300' },
    config:      { solido: 'bg-gradient-to-br from-slate-400 to-slate-600',       ativo: 'border-slate-300',   claro: 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200',     barra: 'text-slate-600 dark:text-slate-300' },
};

export const corDoGrupo = (id: string): Classes => COR[(id in COR ? id : 'config') as CorGrupo];
