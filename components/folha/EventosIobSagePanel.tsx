// components/folha/EventosIobSagePanel.tsx
// Catálogo de 599 eventos do IOB SAGE FOLHAMATIC + seleção por cliente.
// Admin pode fazer o bootstrap inicial do catálogo (upload do JSON gerado pelo script Python).

import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../../types';
import type { CatalogoEventos, EventoIobSage } from '../../services/folha/folhaTypes';
import {
    getCatalogo,
    setCatalogo,
    getSelecao,
    saveSelecao,
} from '../../services/folha/folhaFirestoreService';

interface Props {
    currentUser: User;
}

const CLIENTES_DISPONIVEIS = ['IRB-GROUP'];

const EventosIobSagePanel: React.FC<Props> = ({ currentUser }) => {
    const [catalogo, setCat] = useState<CatalogoEventos | null>(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [cliente, setCliente] = useState<string>(CLIENTES_DISPONIVEIS[0]);
    const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
    const [dirty, setDirty] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [ultimaAcao, setUltimaAcao] = useState<string>('');

    // Filtros
    const [busca, setBusca] = useState('');
    const [filtroTipo, setFiltroTipo] = useState<'' | 'V' | 'D'>('');
    const [filtroRO, setFiltroRO] = useState('');
    const [filtroSel, setFiltroSel] = useState<'' | 'sel' | 'nao'>('');

    // Carrega catálogo + seleção ao montar
    useEffect(() => {
        (async () => {
            try {
                const c = await getCatalogo();
                setCat(c);
                const s = await getSelecao(cliente);
                setSelecionados(new Set(s.codigos));
            } catch (e) {
                setErro(e instanceof Error ? e.message : String(e));
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Ao trocar de cliente, recarrega seleção
    useEffect(() => {
        if (!catalogo) return;
        (async () => {
            const s = await getSelecao(cliente);
            setSelecionados(new Set(s.codigos));
            setDirty(false);
        })();
    }, [cliente, catalogo]);

    // Bootstrap admin: upload do JSON do catálogo
    const handleBootstrapCatalogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!confirm(`Importar catálogo de "${file.name}" para o Firestore? Isso sobrescreve o catálogo atual.`))
            return;
        try {
            const text = await file.text();
            const obj = JSON.parse(text) as CatalogoEventos;
            if (!Array.isArray(obj.eventos) || obj.eventos.length === 0) {
                throw new Error('JSON não contém array "eventos".');
            }
            await setCatalogo(obj);
            setCat(obj);
            setUltimaAcao(`Catálogo importado: ${obj.eventos.length} eventos.`);
        } catch (err) {
            setErro(err instanceof Error ? err.message : String(err));
        } finally {
            e.target.value = '';
        }
    };

    const toggle = (codigo: string) => {
        setSelecionados((prev) => {
            const next = new Set(prev);
            if (next.has(codigo)) next.delete(codigo);
            else next.add(codigo);
            return next;
        });
        setDirty(true);
    };

    const selecionarTodosFiltrados = (valor: boolean) => {
        setSelecionados((prev) => {
            const next = new Set(prev);
            eventosFiltrados.forEach((ev) => (valor ? next.add(ev.codigo) : next.delete(ev.codigo)));
            return next;
        });
        setDirty(true);
    };

    const handleSalvar = async () => {
        setSalvando(true);
        try {
            const codigos = Array.from(selecionados);
            const r = await saveSelecao(cliente, codigos);
            setDirty(false);
            setUltimaAcao(`${r.total} evento(s) salvos para ${cliente} em ${new Date().toLocaleString('pt-BR')}.`);
        } catch (err) {
            alert('Erro ao salvar: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setSalvando(false);
        }
    };

    const handleExportarSelecao = () => {
        const codigos = Array.from(selecionados).sort();
        const evs = (catalogo?.eventos ?? []).filter((e) => selecionados.has(e.codigo));
        const blob = new Blob(
            [JSON.stringify({ cliente, codigos, eventos: evs }, null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `selecao-eventos-${cliente.toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Listas derivadas
    const rotinasUsadas = useMemo(() => {
        const set = new Set<string>();
        (catalogo?.eventos ?? []).forEach((e) => set.add(e.ro));
        return Array.from(set).sort();
    }, [catalogo]);

    const eventosFiltrados = useMemo(() => {
        const evs = catalogo?.eventos ?? [];
        const q = busca.trim().toLowerCase();
        return evs.filter((ev) => {
            if (filtroTipo && ev.tipo !== filtroTipo) return false;
            if (filtroRO && ev.ro !== filtroRO) return false;
            if (filtroSel === 'sel' && !selecionados.has(ev.codigo)) return false;
            if (filtroSel === 'nao' && selecionados.has(ev.codigo)) return false;
            if (q) {
                if (!ev.codigo.includes(q) && !ev.descricao.toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [catalogo, busca, filtroTipo, filtroRO, filtroSel, selecionados]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-4 border-blue-500"></div>
            </div>
        );
    }

    // Catálogo vazio → tela de bootstrap
    if (!catalogo) {
        const isAdmin = currentUser.role === 'admin';
        return (
            <div className="max-w-2xl mx-auto p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold mb-2 text-slate-800 dark:text-white">
                    Catálogo ainda não importado
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Gere o arquivo <code className="bg-slate-100 dark:bg-slate-900 px-1 rounded">eventos-iob-sage.json</code>{' '}
                    com o script Python (<code className="bg-slate-100 dark:bg-slate-900 px-1 rounded">scripts/extract_eventos_iob.py eventos.pdf</code>){' '}
                    e faça o upload abaixo. Esta operação é necessária apenas uma vez.
                </p>
                {isAdmin ? (
                    <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer">
                        <span>⭱ Importar eventos-iob-sage.json</span>
                        <input type="file" accept=".json" className="hidden" onChange={handleBootstrapCatalogo} />
                    </label>
                ) : (
                    <p className="text-amber-600 dark:text-amber-400">
                        Apenas administradores podem importar o catálogo inicial.
                    </p>
                )}
                {erro && <p className="mt-3 text-red-600 dark:text-red-400 text-sm">{erro}</p>}
                {ultimaAcao && (
                    <p className="mt-3 text-green-600 dark:text-green-400 text-sm">{ultimaAcao}</p>
                )}
            </div>
        );
    }

    const stats = {
        total: catalogo.eventos.length,
        venc: catalogo.eventos.filter((e) => e.tipo === 'V').length,
        desc: catalogo.eventos.filter((e) => e.tipo === 'D').length,
        selTotal: selecionados.size,
    };

    return (
        <div>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard label="Total no catálogo" valor={stats.total} />
                <StatCard label="Vencimentos" valor={stats.venc} cor="green" />
                <StatCard label="Descontos" valor={stats.desc} cor="red" />
                <StatCard label="Selecionados" valor={stats.selTotal} cor="blue" />
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 items-center mb-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <input
                    type="search"
                    placeholder="Buscar por código ou descrição (ex: 0800, HORA EXTRA)…"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="flex-1 min-w-[240px] px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                />
                <select
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value as '' | 'V' | 'D')}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                >
                    <option value="">Tipo: todos</option>
                    <option value="V">Vencimentos (V)</option>
                    <option value="D">Descontos (D)</option>
                </select>
                <select
                    value={filtroRO}
                    onChange={(e) => setFiltroRO(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                >
                    <option value="">Rotina: todas</option>
                    {rotinasUsadas.map((ro) => (
                        <option key={ro} value={ro}>
                            {ro} {catalogo.legenda.ro[ro] ? `— ${catalogo.legenda.ro[ro]}` : ''}
                        </option>
                    ))}
                </select>
                <select
                    value={filtroSel}
                    onChange={(e) => setFiltroSel(e.target.value as '' | 'sel' | 'nao')}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                >
                    <option value="">Exibir: todos</option>
                    <option value="sel">Somente selecionados</option>
                    <option value="nao">Somente não selecionados</option>
                </select>
                <select
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                >
                    {CLIENTES_DISPONIVEIS.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>

                <button
                    onClick={handleExportarSelecao}
                    className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                >
                    ⭳ Exportar seleção
                </button>

                <button
                    onClick={handleSalvar}
                    disabled={salvando || !dirty}
                    className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded"
                >
                    {salvando ? 'Salvando…' : '💾 Salvar seleção'}
                </button>
            </div>

            {/* Tabela */}
            <div className="overflow-auto max-h-[58vh] border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0">
                        <tr className="text-left">
                            <th className="px-2 py-2 w-8">
                                <input
                                    type="checkbox"
                                    title="Selecionar todos os filtrados"
                                    checked={
                                        eventosFiltrados.length > 0 &&
                                        eventosFiltrados.every((e) => selecionados.has(e.codigo))
                                    }
                                    onChange={(e) => selecionarTodosFiltrados(e.target.checked)}
                                />
                            </th>
                            <th className="px-2 py-2 w-[70px]">Cód.</th>
                            <th className="px-2 py-2">Descrição</th>
                            <th className="px-2 py-2 w-[60px]">Tipo</th>
                            <Th title="IRRF">IR</Th>
                            <Th title="INSS">IN</Th>
                            <Th title="IRRF s/ Férias">IRF</Th>
                            <Th title="INSS s/ Férias">INF</Th>
                            <Th title="FGTS">FG</Th>
                            <Th title="Rendimento Tributável">RT</Th>
                            <Th title="Vencimento RAIS">VR</Th>
                            <th className="px-2 py-2 w-[50px]" title="Referência/Valor">
                                R/V
                            </th>
                            <th className="px-2 py-2 w-[90px]">Coefic.</th>
                            <th className="px-2 py-2 w-[60px]" title="Rotina de cálculo">
                                RO
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {eventosFiltrados.length === 0 ? (
                            <tr>
                                <td colSpan={14} className="text-center py-8 text-slate-500">
                                    Nenhum evento encontrado com os filtros atuais.
                                </td>
                            </tr>
                        ) : (
                            eventosFiltrados.map((ev) => (
                                <LinhaEvento
                                    key={ev.codigo}
                                    ev={ev}
                                    checked={selecionados.has(ev.codigo)}
                                    onToggle={toggle}
                                />
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-3 flex justify-between text-xs text-slate-500 dark:text-slate-400 flex-wrap gap-2">
                <span>
                    Catálogo: empresa {catalogo.empresa} · {catalogo.eventos.length} eventos
                </span>
                {ultimaAcao && <span>{ultimaAcao}</span>}
                {dirty && (
                    <span className="text-amber-600 dark:text-amber-400">
                        ⚠ Alterações não salvas
                    </span>
                )}
            </div>
        </div>
    );
};

// ─── Subcomponentes ──────────────────────────────────────────────────

const StatCard: React.FC<{ label: string; valor: number; cor?: 'blue' | 'green' | 'red' }> = ({
    label,
    valor,
    cor,
}) => {
    const corClasses: Record<string, string> = {
        blue: 'text-blue-600 dark:text-blue-400',
        green: 'text-green-600 dark:text-green-400',
        red: 'text-red-600 dark:text-red-400',
    };
    return (
        <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <div className="text-xs uppercase text-slate-500 dark:text-slate-400">{label}</div>
            <div className={`text-xl font-bold ${cor ? corClasses[cor] : 'text-slate-800 dark:text-white'}`}>
                {valor.toLocaleString('pt-BR')}
            </div>
        </div>
    );
};

const Th: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <th className="px-2 py-2 text-center w-8" title={title}>
        {children}
    </th>
);

const LinhaEvento: React.FC<{
    ev: EventoIobSage;
    checked: boolean;
    onToggle: (c: string) => void;
}> = ({ ev, checked, onToggle }) => {
    const inc = ev.incidencias;
    const cell = (v: 'S' | 'N') =>
        v === 'S' ? (
            <span className="text-blue-600 dark:text-blue-400 font-bold">S</span>
        ) : (
            <span className="text-slate-400">N</span>
        );
    return (
        <tr
            className={`border-t border-slate-100 dark:border-slate-700 ${
                checked ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}
        >
            <td className="px-2 py-1.5">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(ev.codigo)}
                />
            </td>
            <td className="px-2 py-1.5 font-mono font-semibold text-slate-800 dark:text-white">
                {ev.codigo}
            </td>
            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{ev.descricao}</td>
            <td className="px-2 py-1.5">
                {ev.tipo === 'V' ? (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded">
                        V
                    </span>
                ) : (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 rounded">
                        D
                    </span>
                )}
            </td>
            <td className="px-2 py-1.5 text-center">{cell(inc.ir)}</td>
            <td className="px-2 py-1.5 text-center">{cell(inc.in)}</td>
            <td className="px-2 py-1.5 text-center">{cell(inc.irf)}</td>
            <td className="px-2 py-1.5 text-center">{cell(inc.inf)}</td>
            <td className="px-2 py-1.5 text-center">{cell(inc.fg)}</td>
            <td className="px-2 py-1.5 text-center">{cell(inc.rt)}</td>
            <td className="px-2 py-1.5 text-center">{cell(inc.vr)}</td>
            <td className="px-2 py-1.5 text-center font-semibold">{ev.rv}</td>
            <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {ev.coeficiente.toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 6 })}
            </td>
            <td className="px-2 py-1.5 font-mono text-slate-600 dark:text-slate-400">{ev.ro}</td>
        </tr>
    );
};

export default EventosIobSagePanel;
