// components/empresaAtiva/AtivarEmpresaScreen.tsx
//
// Portão do app (como no CFI): antes de qualquer ação, o colaborador ativa a
// empresa da carteira e a competência de trabalho. Lista só as empresas que
// ele enxerga (carteira e as que cadastrou; o gestor, todas).

import React, { useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { competenciaBr, competenciaValida, type EmpresaAtiva } from '../../services/empresaAtiva/empresaAtiva';
import { filtrarEmpresas } from '../../services/empresas/buscaEmpresas';

interface Props {
    empresas: Empresa[] | null;
    erro: string;
    competenciaInicial: string;
    atual: EmpresaAtiva | null;
    usuarioEmail: string;
    onAtivar: (e: EmpresaAtiva) => void;
    /** Voltar sem trocar (só quando já há uma empresa ativa). */
    onCancelar?: () => void;
    /** Ir para as abas que não exigem ativação. */
    onIrParaEmpresas: () => void;
    onIrParaUsuarios?: () => void;
    onSair: () => void;
}

const cnpjFmt = (c: string) => (c?.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);

const AtivarEmpresaScreen: React.FC<Props> = ({ empresas, erro, competenciaInicial, atual, usuarioEmail, onAtivar, onCancelar, onIrParaEmpresas, onIrParaUsuarios, onSair }) => {
    const [busca, setBusca] = useState('');
    const [competencia, setCompetencia] = useState(atual?.competencia ?? competenciaInicial);
    const compOk = competenciaValida(competencia);

    const lista = useMemo(() => filtrarEmpresas(empresas ?? [], busca), [empresas, busca]);

    const ativar = (e: Empresa) => {
        if (!compOk) return;
        onAtivar({ id: e.id, nome: e.nomeFantasia || e.razaoSocial, cnpj: e.cnpj, codigoSage: e.codigoSage, competencia, ativadaPor: usuarioEmail, ativadaEm: Date.now() });
    };

    return (
        <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-900">
            <div className="mx-auto max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800 dark:text-white">⚡ Ativar empresa e período</h1>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            Escolha a empresa e a competência em que vai trabalhar. Todas as telas passam a usar essa empresa e esse período até você trocar.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {onCancelar && <button onClick={onCancelar} className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-white">Voltar</button>}
                        <button onClick={onSair} className="rounded bg-slate-100 px-3 py-1.5 text-sm text-slate-700 dark:bg-slate-700 dark:text-slate-200">Sair</button>
                    </div>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <label className="block">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Competência</span>
                        <input aria-label="Competência de trabalho" type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
                            className="block rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                    </label>
                    <label className="block min-w-0 flex-1">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Empresa</span>
                        <input aria-label="Buscar empresa" placeholder="Nome, CNPJ ou código SAGE" value={busca} onChange={e => setBusca(e.target.value)}
                            className="block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                    </label>
                </div>
                {!compOk && <p role="alert" className="text-sm text-red-700">Informe a competência (mês e ano).</p>}

                {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {!empresas && !erro && <p className="text-sm text-slate-500">Carregando a sua carteira…</p>}
                {empresas && empresas.length === 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                        <p className="font-semibold">Nenhuma empresa na sua carteira.</p>
                        <p className="mt-1">Peça ao gestor (ou ao admin) para incluir suas empresas em Usuários › Carteira, ou cadastre uma empresa nova.</p>
                        <div className="mt-2 flex gap-2">
                            <button onClick={onIrParaEmpresas} className="rounded bg-amber-600 px-3 py-1.5 text-white">Cadastrar empresa</button>
                            {onIrParaUsuarios && <button onClick={onIrParaUsuarios} className="rounded border border-amber-400 px-3 py-1.5">Usuários e carteiras</button>}
                        </div>
                    </div>
                )}
                {empresas && empresas.length > 0 && (
                    <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                        {lista.map(e => (
                            <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2">
                                <span className="min-w-0 dark:text-slate-100">
                                    <strong>{e.nomeFantasia || e.razaoSocial}</strong>
                                    {atual?.id === e.id && <span className="ml-2 rounded bg-green-100 px-1.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200">ativa</span>}
                                    <span className="block text-xs text-slate-500 dark:text-slate-400">{e.razaoSocial} · CNPJ {cnpjFmt(e.cnpj)} · SAGE {e.codigoSage}</span>
                                </span>
                                <button aria-label={`Ativar ${e.nomeFantasia || e.razaoSocial}`} disabled={!compOk} onClick={() => ativar(e)}
                                    className="shrink-0 rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                                    ⚡ Ativar {compOk ? competenciaBr(competencia) : ''}
                                </button>
                            </li>
                        ))}
                        {!lista.length && <li className="p-4 text-center text-sm text-slate-500">Nenhuma empresa nesta busca.</li>}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default AtivarEmpresaScreen;
