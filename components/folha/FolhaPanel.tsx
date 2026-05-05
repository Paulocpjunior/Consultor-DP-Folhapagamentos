// components/folha/FolhaPanel.tsx
import React, { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import type { User } from '../../types';
import type { Empresa } from '../../services/empresas/empresasTypes';
import {
    listarMinhasEmpresas,
    listarTodasEmpresas,
} from '../../services/empresas/empresasService';
import { baixarTemplateApontamento } from '../../services/folha/templateApontamentoIobSage';

const EventosIobSagePanel = lazy(() => import('./EventosIobSagePanel'));
const ApontamentoFolhaPanel = lazy(() => import('./ApontamentoFolhaPanel'));
const ValidadorACJEFPanel = lazy(() => import('../ponto/ValidadorACJEFPanel'));

type SubTab = 'eventos' | 'apontamento' | 'validador-ponto';

interface FolhaPanelProps {
    currentUser: User;
    onIrParaEmpresas?: () => void;
}

export interface SessaoFolha {
    empresa: Empresa;
    competencia: string;
    tipo: string;
    iniciadaEm: Date;
}

const FolhaPanel: React.FC<FolhaPanelProps> = ({ currentUser, onIrParaEmpresas }) => {
    const [sub, setSub] = useState<SubTab>('apontamento');
    const [sessao, setSessao] = useState<SessaoFolha | null>(null);

    return (
        <div>
            <header className="mb-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    📋 Folha de Pagamento — IOB SAGE FOLHAMATIC
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Parametrização e exportação do apontamento de folha para o SAGE.
                </p>
            </header>

            <div className="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700">
                <button
                    onClick={() => setSub('apontamento')}
                    className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                        sub === 'apontamento'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                    <span className="mr-1">📝</span>
                    Apontamento
                </button>
                <button
                    onClick={() => setSub('eventos')}
                    className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                        sub === 'eventos'
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                    <span className="mr-1">📚</span>
                    Catálogo de Eventos
                </button>
                <button
                    onClick={() => setSub('validador-ponto')}
                    className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                        sub === 'validador-ponto'
                            ? 'border-amber-600 text-amber-600 dark:text-amber-400 dark:border-amber-400'
                            : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                >
                    <span className="mr-1">🕐</span>
                    Validador ACJEF (teste)
                </button>
            </div>

            <Suspense
                fallback={
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500"></div>
                    </div>
                }
            >
                {sub === 'eventos' && <EventosIobSagePanel currentUser={currentUser} />}

                {sub === 'apontamento' && !sessao && (
                    <SeletorEmpresa
                        currentUser={currentUser}
                        onSelecionar={(s) => setSessao(s)}
                        onNovaEmpresa={() => onIrParaEmpresas?.()}
                    />
                )}

                {sub === 'apontamento' && sessao && (
                    <ApontamentoFolhaPanel
                        currentUser={currentUser}
                        sessao={sessao}
                        onTrocarEmpresa={() => setSessao(null)}
                    />
                )}

                {sub === 'validador-ponto' && (
                    <ValidadorACJEFPanel currentUser={currentUser} />
                )}
            </Suspense>
        </div>
    );
};

export default FolhaPanel;

interface SeletorProps {
    currentUser: User;
    onSelecionar: (s: SessaoFolha) => void;
    onNovaEmpresa: () => void;
}

const TIPOS_FOLHA = [
    'Folha de Salario',
    '13º Salário',
    'Adiantamento',
    'Férias',
    'Rescisão',
];

const competenciaAtual = (): string => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const SeletorEmpresa: React.FC<SeletorProps> = ({ currentUser, onSelecionar, onNovaEmpresa }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [modal, setModal] = useState<null | 'select' | 'recent'>(null);
    const [filtro, setFiltro] = useState('');
    const [empresaEscolhida, setEmpresaEscolhida] = useState<Empresa | null>(null);
    const [competencia, setCompetencia] = useState(competenciaAtual());
    const [tipo, setTipo] = useState(TIPOS_FOLHA[0]);

    useEffect(() => {
        (async () => {
            try {
                const isAdminUser = (currentUser as any).role === 'admin';
                const list = isAdminUser
                    ? await listarTodasEmpresas()
                    : await listarMinhasEmpresas((currentUser as any).uid);
                setEmpresas(list);
            } catch (e) {
                setErro(e instanceof Error ? e.message : String(e));
            } finally {
                setLoading(false);
            }
        })();
    }, [currentUser]);

    const empresasFiltradas = useMemo(() => {
        if (!filtro.trim()) return empresas;
        const f = filtro.toLowerCase();
        return empresas.filter((e) =>
            (e.razaoSocial || '').toLowerCase().includes(f) ||
            (e.nomeFantasia || '').toLowerCase().includes(f) ||
            (e.cnpj || '').includes(f) ||
            (e.codigoSage || '').includes(f),
        );
    }, [empresas, filtro]);

    const recentes = useMemo(() => {
        const copy = [...empresas];
        copy.sort((a: any, b: any) => {
            const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return tb - ta;
        });
        return copy.slice(0, 3);
    }, [empresas]);

    const confirmarSelecao = () => {
        if (!empresaEscolhida) return;
        onSelecionar({
            empresa: empresaEscolhida,
            competencia,
            tipo,
            iniciadaEm: new Date(),
        });
        setModal(null);
        setEmpresaEscolhida(null);
    };

    const abrirRapido = (emp: Empresa) => {
        onSelecionar({
            empresa: emp,
            competencia: competenciaAtual(),
            tipo: TIPOS_FOLHA[0],
            iniciadaEm: new Date(),
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500"></div>
            </div>
        );
    }

    if (erro) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                Erro ao carregar empresas: {erro}
            </div>
        );
    }

    return (
        <div>
            <div className="mb-6">
                <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 px-3 py-1 border border-slate-200 dark:border-slate-700 rounded-full mb-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Sessão iniciada · pronto para começar
                </span>
                <h3 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-white tracking-tight">
                    Como você quer começar?
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl">
                    Escolha uma das opções abaixo. Você pode cadastrar uma nova empresa, abrir uma já existente ou retomar uma sessão recente.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                    onClick={onNovaEmpresa}
                    className="group p-5 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg transition-all"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="w-11 h-11 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M9 17h1M14 17h1"/>
                            </svg>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">01</span>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white mb-1">Nova empresa</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                        Cadastre uma empresa do zero com CNPJ, razão social e código SAGE.
                    </p>
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                        Cadastrar <span aria-hidden>→</span>
                    </span>
                </button>

                <button
                    onClick={() => setModal('select')}
                    disabled={empresas.length === 0}
                    className="group p-5 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="w-11 h-11 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="7"/>
                                <path d="m21 21-4.3-4.3"/>
                            </svg>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">02</span>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white mb-1">Selecionar empresa</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                        Busque entre suas <strong>{empresas.length} empresa(s)</strong> cadastrada(s) e abra um período.
                    </p>
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                        Buscar <span aria-hidden>→</span>
                    </span>
                </button>

                <button
                    onClick={() => setModal('recent')}
                    disabled={recentes.length === 0}
                    className="group p-5 text-left bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    <div className="flex items-start justify-between mb-4">
                        <div className="w-11 h-11 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 1 1-3.5-7.1"/>
                                <path d="M21 3v6h-6"/>
                                <path d="M12 7v5l3 2"/>
                            </svg>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">03</span>
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-white mb-1">Abrir empresa cadastrada</h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                        Continue de onde parou. As empresas mais recentes aparecem aqui.
                    </p>
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                        Retomar <span aria-hidden>→</span>
                    </span>
                </button>
            </div>

            <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <div className="flex flex-wrap items-start gap-4">
                    <div className="w-11 h-11 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <path d="M14 2v6h6"/>
                            <path d="M12 18v-6"/>
                            <path d="m9 15 3 3 3-3"/>
                        </svg>
                    </div>
                    <div className="flex-1 min-w-[260px]">
                        <h4 className="font-bold text-slate-800 dark:text-white">
                            Cliente envia o apontamento por e-mail?
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
                            Baixe o template <strong>.xlsx</strong> com o layout pronto para
                            importação no IOB SAGE FOLHAMATIC. Preencha matrícula, código do
                            evento, referência ou valor e importe direto no sistema da folha.
                        </p>
                    </div>
                    <button
                        onClick={() => baixarTemplateApontamento({ competencia: competenciaAtual() })}
                        className="px-4 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm inline-flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Baixar template .xlsx
                    </button>
                </div>
            </div>

            {recentes.length > 0 && (
                <div className="mt-8">
                    <div className="flex items-baseline justify-between mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Acesso rápido — últimas empresas
                        </h4>
                    </div>
                    <div className="space-y-2">
                        {recentes.map((e) => (
                            <button
                                key={e.id}
                                onClick={() => abrirRapido(e)}
                                className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-4 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:translate-x-1 transition-all text-left"
                            >
                                <div className="w-9 h-9 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 grid place-items-center font-mono text-xs font-bold">
                                    {iniciais(e.razaoSocial || e.nomeFantasia)}
                                </div>
                                <div>
                                    <div className="font-semibold text-sm text-slate-800 dark:text-white">
                                        {e.nomeFantasia || e.razaoSocial}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {formatCnpj(e.cnpj)} · SAGE {e.codigoSage}
                                    </div>
                                </div>
                                <div className="text-slate-400">→</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {modal && (
                <div
                    className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setModal(null)}
                >
                    <div
                        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-w-lg w-full max-h-[85vh] flex flex-col"
                        onClick={(ev) => ev.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="font-bold text-slate-800 dark:text-white">
                                {modal === 'select' ? 'Selecionar empresa' : 'Abrir empresa cadastrada'}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                Defina a empresa, a competência e o tipo de folha.
                            </p>
                        </div>

                        <div className="p-5 overflow-y-auto flex-1">
                            <input
                                type="text"
                                value={filtro}
                                onChange={(ev) => setFiltro(ev.target.value)}
                                placeholder="Buscar por razão social, CNPJ ou código SAGE…"
                                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-lg mb-3"
                            />

                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                {empresasFiltradas.length === 0 && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
                                        Nenhuma empresa encontrada.
                                    </div>
                                )}
                                {empresasFiltradas.map((e) => (
                                    <button
                                        key={e.id}
                                        onClick={() => setEmpresaEscolhida(e)}
                                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                                            empresaEscolhida?.id === e.id
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                        }`}
                                    >
                                        <div className="font-medium text-sm text-slate-800 dark:text-white">
                                            {e.nomeFantasia || e.razaoSocial}
                                        </div>
                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                            {formatCnpj(e.cnpj)} · SAGE {e.codigoSage}
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {empresaEscolhida && (
                                <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                                    <label className="text-xs">
                                        <span className="block font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                                            Competência
                                        </span>
                                        <input
                                            type="text"
                                            value={competencia}
                                            onChange={(ev) => setCompetencia(ev.target.value)}
                                            placeholder="MM/AAAA"
                                            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded font-mono"
                                        />
                                    </label>
                                    <label className="text-xs">
                                        <span className="block font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                                            Tipo
                                        </span>
                                        <select
                                            value={tipo}
                                            onChange={(ev) => setTipo(ev.target.value)}
                                            className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                                        >
                                            {TIPOS_FOLHA.map((t) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                            <button
                                onClick={() => setModal(null)}
                                className="px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmarSelecao}
                                disabled={!empresaEscolhida}
                                className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
                            >
                                Continuar →
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

function iniciais(s?: string): string {
    if (!s) return '?';
    const partes = s.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function formatCnpj(cnpj?: string): string {
    if (!cnpj) return '—';
    const d = cnpj.replace(/\D/g, '');
    if (d.length !== 14) return cnpj;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}
