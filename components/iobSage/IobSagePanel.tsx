// components/iobSage/IobSagePanel.tsx
//
// Módulo IOB SAGE: os menus da folha IOB/SAGE lado a lado com o que o
// Consultor DP já faz, e a restauração do backup PostgreSQL 12 do SAGE.
// Catálogo em services/iobSage/catalogoMenus.ts; mapa e fontes em
// docs/mapa-menus-iob-folha.md.

import React, { useMemo, useState } from 'react';
import { MENUS_IOB, ROTULO_SITUACAO, resumoSituacao, type Destino, type ItemMenu, type Situacao } from '../../services/iobSage/catalogoMenus';
import RestaurarBackupModal from './RestaurarBackupModal';

const COR: Record<Situacao, string> = {
    disponivel: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    parcial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    planejado: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    fora: 'bg-slate-50 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-400',
};

const ROTULO_DESTINO: Record<Destino, string> = {
    'folha:apontamento': 'Abrir Folha › Apontamento',
    'folha:implantacao': 'Abrir Folha › Implantação de funcionários',
    'folha:conferencia': 'Abrir Folha › Conferência pós-folha',
    'folha:eventos': 'Abrir Folha › Catálogo de Eventos',
    'folha:ponto': 'Abrir Folha › Validador ACJEF',
    empresas: 'Abrir Empresas',
    esocial: 'Abrir eSocial',
    'iobsage:restaurar': 'Abrir a restauração do backup',
};

interface Props { onNavegar?: (destino: Destino) => void }

const IobSagePanel: React.FC<Props> = ({ onNavegar }) => {
    const [menuId, setMenuId] = useState(MENUS_IOB[0].id);
    const [filtro, setFiltro] = useState<Situacao | ''>('');
    const [item, setItem] = useState<ItemMenu | null>(null);
    const [restaurar, setRestaurar] = useState(false);
    const resumo = useMemo(() => resumoSituacao(), []);
    const menu = MENUS_IOB.find(m => m.id === menuId) ?? MENUS_IOB[0];
    const itens = menu.itens.filter(i => !filtro || i.situacao === filtro);

    function ir(destino: Destino) {
        setItem(null);
        if (destino === 'iobsage:restaurar') setRestaurar(true);
        else onNavegar?.(destino);
    }

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">IOB SAGE — menus da folha × Consultor DP</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Cada item dos menus da folha IOB/SAGE, com a situação real no Consultor DP. Fonte: ajuda online da IOB (títulos e resumos de busca) e prints do IOB Office.
                    </p>
                </div>
                <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white" onClick={() => setRestaurar(true)}>Restaurar backup PostgreSQL 12</button>
            </header>

            <div className="flex flex-wrap gap-2 text-sm">
                {(Object.keys(resumo) as Situacao[]).map(s => (
                    <button key={s} onClick={() => setFiltro(filtro === s ? '' : s)} aria-pressed={filtro === s}
                        className={`rounded-full px-3 py-1 ${COR[s]} ${filtro === s ? 'ring-2 ring-blue-500' : ''}`}>
                        {ROTULO_SITUACAO[s]}: {resumo[s]}
                    </button>
                ))}
                {filtro && <button className="px-2 text-xs text-blue-700 underline dark:text-blue-300" onClick={() => setFiltro('')}>limpar filtro</button>}
            </div>

            <nav aria-label="Menus do IOB" className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
                {MENUS_IOB.map(m => (
                    <button key={m.id} onClick={() => setMenuId(m.id)}
                        className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${m.id === menu.id ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400'}`}>
                        {m.titulo} <span className="text-xs text-slate-400">({m.itens.length})</span>
                    </button>
                ))}
            </nav>
            <p className="text-sm text-slate-600 dark:text-slate-300">{menu.descricao}</p>

            <div className="grid gap-3 md:grid-cols-2">
                {itens.map(i => (
                    <button key={i.id} onClick={() => setItem(i)} className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-xs text-slate-500 dark:text-slate-400">{i.caminho.join(' › ')}</p>
                            <span className={`shrink-0 rounded px-2 py-0.5 text-xs ${COR[i.situacao]}`}>{ROTULO_SITUACAO[i.situacao]}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-800 dark:text-white">{i.caminho[i.caminho.length - 1]}</p>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{i.noConsultor}</p>
                    </button>
                ))}
                {!itens.length && <p className="text-sm text-slate-500">Nenhum item com essa situação neste menu.</p>}
            </div>

            {item && (
                <div role="dialog" aria-modal="true" aria-label={item.caminho.join(' › ')} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setItem(null)}>
                    <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{item.caminho.join(' › ')} · IOB {item.produto}</p>
                                <h3 className="mt-1 text-lg font-semibold text-slate-800 dark:text-white">{item.caminho[item.caminho.length - 1]}</h3>
                            </div>
                            <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={() => setItem(null)}>×</button>
                        </div>
                        <dl className="mt-3 space-y-3 text-sm">
                            <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">No IOB</dt><dd className="text-slate-800 dark:text-slate-100">{item.descricao}</dd></div>
                            <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">No Consultor DP</dt>
                                <dd className="text-slate-800 dark:text-slate-100"><span className={`mr-2 rounded px-2 py-0.5 text-xs ${COR[item.situacao]}`}>{ROTULO_SITUACAO[item.situacao]}</span>{item.noConsultor}</dd></div>
                            {item.fase && <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Quando</dt><dd className="text-slate-800 dark:text-slate-100">{item.fase}</dd></div>}
                            <div><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Fonte</dt><dd className="text-slate-600 dark:text-slate-300">{item.fonte}</dd></div>
                        </dl>
                        {item.destino && (onNavegar || item.destino === 'iobsage:restaurar') && (
                            <button className="mt-4 rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white" onClick={() => ir(item.destino!)}>{ROTULO_DESTINO[item.destino]}</button>
                        )}
                    </div>
                </div>
            )}

            <RestaurarBackupModal aberto={restaurar} onFechar={() => setRestaurar(false)} />
        </div>
    );
};

export default IobSagePanel;
