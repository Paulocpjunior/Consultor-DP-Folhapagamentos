import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { User } from '../../types';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type {
    ExtratoTransacao,
    BancoOption,
    ConciliacaoResult,
} from '../../services/extratos/extratosTypes';
import { BANCOS, CATEGORIAS_EXTRATO } from '../../services/extratos/extratosTypes';
import {
    importarTransacoes,
    listarTransacoes,
    atualizarCategoria,
    calcularConciliacao,
} from '../../services/extratos/extratosService';
import {
    parseOFX,
    parseCSV,
    detectFormat,
    categorizar,
    type TransacaoParsed,
    type FileFormat,
} from '../../services/extratos/parsers';
import { listarTodasEmpresas, listarMinhasEmpresas } from '../../services/empresas/empresasService';

type SubTab = 'upload' | 'transacoes' | 'conciliacao';

interface ExtratosPanelProps {
    currentUser: User;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const competenciaAtual = (): string => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const formatCurrency = (v: number): string =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ─── Main Panel ───────────────────────────────────────────────────────────────

const ExtratosPanel: React.FC<ExtratosPanelProps> = ({ currentUser }) => {
    const [sub, setSub] = useState<SubTab>('upload');

    const subTabs: { id: SubTab; label: string; icon: string }[] = [
        { id: 'upload', label: 'Upload Extrato', icon: '📤' },
        { id: 'transacoes', label: 'Transações', icon: '📊' },
        { id: 'conciliacao', label: 'Conciliação', icon: '🔄' },
    ];

    return (
        <div>
            <header className="mb-4">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                    🏦 Extratos Bancários
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Importação, categorização e conciliação de extratos com a folha de pagamento.
                </p>
            </header>

            <div className="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700">
                {subTabs.map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setSub(t.id)}
                        className={`px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
                            sub === t.id
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                    >
                        <span className="mr-1">{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </div>

            {sub === 'upload' && <UploadTab currentUser={currentUser} />}
            {sub === 'transacoes' && <TransacoesTab currentUser={currentUser} />}
            {sub === 'conciliacao' && <ConciliacaoTab currentUser={currentUser} />}
        </div>
    );
};

export default ExtratosPanel;

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: Upload Extrato
// ═══════════════════════════════════════════════════════════════════════════════

const UploadTab: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [empresaId, setEmpresaId] = useState('');
    const [banco, setBanco] = useState<BancoOption>('Itaú');
    const [periodo, setPeriodo] = useState(competenciaAtual());
    const [file, setFile] = useState<File | null>(null);
    const [format, setFormat] = useState<FileFormat | null>(null);
    const [parsed, setParsed] = useState<TransacaoParsed[]>([]);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [dragging, setDragging] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        (async () => {
            try {
                const isAdmin = currentUser.role === 'admin';
                const list = isAdmin
                    ? await listarTodasEmpresas()
                    : await listarMinhasEmpresas((currentUser as any).uid);
                setEmpresas(list);
                if (list.length > 0) setEmpresaId(list[0].id);
            } catch (e) {
                console.warn('Erro ao carregar empresas:', e);
            }
        })();
    }, [currentUser]);

    const handleFile = useCallback(async (f: File) => {
        setFile(f);
        setMsg(null);
        setParsed([]);

        const fmt = detectFormat(f.name);
        setFormat(fmt);

        if (fmt === 'pdf') {
            setMsg({
                type: 'err',
                text: 'Arquivos PDF requerem processamento via Gemini AI. Use a tela principal de extratos para processar PDFs.',
            });
            return;
        }

        setLoading(true);
        try {
            const text = await f.text();
            const result = fmt === 'ofx' ? parseOFX(text) : parseCSV(text);
            if (result.length === 0) {
                setMsg({ type: 'err', text: 'Nenhuma transação encontrada no arquivo.' });
            } else {
                setParsed(result);
                setMsg({ type: 'ok', text: `${result.length} transações encontradas.` });
            }
        } catch (e: any) {
            setMsg({ type: 'err', text: `Erro ao processar arquivo: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
        },
        [handleFile],
    );

    const handleImport = async () => {
        if (!empresaId || parsed.length === 0 || !file) return;
        setImporting(true);
        setMsg(null);
        try {
            const transacoes = parsed.map((t) => ({
                empresaId,
                banco,
                periodo,
                data: t.data,
                descricao: t.descricao,
                valor: t.valor,
                tipo: t.tipo,
                categoria: categorizar(t.descricao),
                importadoPor: (currentUser as any).uid || currentUser.email,
                importadoEm: null, // will be set by serverTimestamp in service
                arquivo: file.name,
            }));
            const count = await importarTransacoes(transacoes);
            setMsg({ type: 'ok', text: `${count} transações importadas com sucesso!` });
            setParsed([]);
            setFile(null);
            if (fileRef.current) fileRef.current.value = '';
        } catch (e: any) {
            setMsg({ type: 'err', text: `Erro ao importar: ${e.message}` });
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Seleção empresa / banco / período */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Empresa
                    </label>
                    <select
                        value={empresaId}
                        onChange={(e) => setEmpresaId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                    >
                        {empresas.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                                {emp.nomeFantasia || emp.razaoSocial}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Banco
                    </label>
                    <select
                        value={banco}
                        onChange={(e) => setBanco(e.target.value as BancoOption)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                    >
                        {BANCOS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Período (MM/AAAA)
                    </label>
                    <input
                        type="text"
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value)}
                        placeholder="MM/YYYY"
                        maxLength={7}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm"
                    />
                </div>
            </div>

            {/* Drag & Drop area */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    dragging
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 bg-slate-50 dark:bg-slate-800/50'
                }`}
            >
                <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.ofx,.qfx,.csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFile(f);
                    }}
                />
                <div className="text-4xl mb-2">📁</div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Arraste o arquivo aqui ou clique para selecionar
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Formatos aceitos: PDF, OFX, CSV
                </p>
                {file && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm">
                        <span>📎</span>
                        {file.name}
                        <span className="uppercase text-xs font-mono bg-blue-200 dark:bg-blue-800 px-1.5 py-0.5 rounded">
                            {format}
                        </span>
                    </div>
                )}
            </div>

            {loading && (
                <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-4 border-blue-500"></div>
                    <span className="ml-3 text-sm text-slate-600 dark:text-slate-400">Processando arquivo...</span>
                </div>
            )}

            {msg && (
                <div
                    className={`p-3 rounded-lg text-sm ${
                        msg.type === 'ok'
                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                    }`}
                >
                    {msg.text}
                </div>
            )}

            {/* Preview table */}
            {parsed.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Pré-visualização ({parsed.length} transações)
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 dark:bg-slate-700/50">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Data</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Descrição</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Valor</th>
                                    <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Tipo</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Categoria</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {parsed.slice(0, 50).map((t, i) => (
                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                            {t.data.split('-').reverse().join('/')}
                                        </td>
                                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-xs truncate">
                                            {t.descricao}
                                        </td>
                                        <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${
                                            t.tipo === 'credito'
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-red-600 dark:text-red-400'
                                        }`}>
                                            {formatCurrency(t.valor)}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                                t.tipo === 'credito'
                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                            }`}>
                                                {t.tipo === 'credito' ? 'C' : 'D'}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-xs">
                                            {categorizar(t.descricao)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {parsed.length > 50 && (
                            <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 text-center">
                                Mostrando 50 de {parsed.length} transações
                            </div>
                        )}
                    </div>

                    <div className="mt-4 flex justify-end">
                        <button
                            onClick={handleImport}
                            disabled={importing || !empresaId}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            {importing ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
                                    Importando...
                                </>
                            ) : (
                                <>📥 Importar {parsed.length} transações</>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: Transações
// ═══════════════════════════════════════════════════════════════════════════════

const TransacoesTab: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [empresaId, setEmpresaId] = useState('');
    const [periodo, setPeriodo] = useState(competenciaAtual());
    const [bancoFiltro, setBancoFiltro] = useState('');
    const [tipoFiltro, setTipoFiltro] = useState<'' | 'credito' | 'debito'>('');
    const [categoriaFiltro, setCategoriaFiltro] = useState('');
    const [transacoes, setTransacoes] = useState<ExtratoTransacao[]>([]);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const isAdmin = currentUser.role === 'admin';
                const list = isAdmin
                    ? await listarTodasEmpresas()
                    : await listarMinhasEmpresas((currentUser as any).uid);
                setEmpresas(list);
                if (list.length > 0) setEmpresaId(list[0].id);
            } catch (e) {
                console.warn('Erro ao carregar empresas:', e);
            }
        })();
    }, [currentUser]);

    const carregar = useCallback(async () => {
        if (!empresaId) return;
        setLoading(true);
        try {
            const data = await listarTransacoes(empresaId, periodo);
            setTransacoes(data);
        } catch (e) {
            console.warn('Erro ao carregar transações:', e);
        } finally {
            setLoading(false);
        }
    }, [empresaId, periodo]);

    useEffect(() => {
        if (empresaId) carregar();
    }, [empresaId, periodo, carregar]);

    const handleCategoriaChange = async (id: string, cat: string) => {
        try {
            await atualizarCategoria(id, cat);
            setTransacoes((prev) =>
                prev.map((t) =>
                    t.id === id ? { ...t, categoria: cat, categoriaManual: true } : t,
                ),
            );
            setEditingId(null);
        } catch (e) {
            console.warn('Erro ao atualizar categoria:', e);
        }
    };

    const filtered = transacoes.filter((t) => {
        if (bancoFiltro && t.banco !== bancoFiltro) return false;
        if (tipoFiltro && t.tipo !== tipoFiltro) return false;
        if (categoriaFiltro && t.categoria !== categoriaFiltro) return false;
        return true;
    });

    const totalCredito = filtered.filter((t) => t.tipo === 'credito').reduce((s, t) => s + t.valor, 0);
    const totalDebito = filtered.filter((t) => t.tipo === 'debito').reduce((s, t) => s + t.valor, 0);

    return (
        <div className="space-y-4">
            {/* Filtros */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Empresa</label>
                    <select
                        value={empresaId}
                        onChange={(e) => setEmpresaId(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-white"
                    >
                        {empresas.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                                {emp.nomeFantasia || emp.razaoSocial}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Período</label>
                    <input
                        type="text"
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value)}
                        placeholder="MM/YYYY"
                        maxLength={7}
                        className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-white"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Banco</label>
                    <select
                        value={bancoFiltro}
                        onChange={(e) => setBancoFiltro(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-white"
                    >
                        <option value="">Todos</option>
                        {BANCOS.map((b) => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Tipo</label>
                    <select
                        value={tipoFiltro}
                        onChange={(e) => setTipoFiltro(e.target.value as any)}
                        className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-white"
                    >
                        <option value="">Todos</option>
                        <option value="credito">Crédito</option>
                        <option value="debito">Débito</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Categoria</label>
                    <select
                        value={categoriaFiltro}
                        onChange={(e) => setCategoriaFiltro(e.target.value)}
                        className="w-full px-2 py-1.5 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-white"
                    >
                        <option value="">Todas</option>
                        {CATEGORIAS_EXTRATO.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="text-xs text-green-600 dark:text-green-400 font-medium">Total Créditos</div>
                    <div className="text-lg font-bold text-green-700 dark:text-green-300">{formatCurrency(totalCredito)}</div>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="text-xs text-red-600 dark:text-red-400 font-medium">Total Débitos</div>
                    <div className="text-lg font-bold text-red-700 dark:text-red-300">{formatCurrency(totalDebito)}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Saldo</div>
                    <div className={`text-lg font-bold ${
                        totalCredito - totalDebito >= 0
                            ? 'text-green-700 dark:text-green-300'
                            : 'text-red-700 dark:text-red-300'
                    }`}>
                        {formatCurrency(totalCredito - totalDebito)}
                    </div>
                </div>
            </div>

            {/* Table */}
            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-4 border-blue-500"></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    <div className="text-4xl mb-2">📭</div>
                    <p className="text-sm">Nenhuma transação encontrada para os filtros selecionados.</p>
                </div>
            ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-700/50">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Data</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Descrição</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Valor</th>
                                <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Tipo</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Banco</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Categoria</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {filtered.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                        {t.data.split('-').reverse().join('/')}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300 max-w-xs truncate" title={t.descricao}>
                                        {t.descricao}
                                    </td>
                                    <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${
                                        t.tipo === 'credito'
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400'
                                    }`}>
                                        {formatCurrency(t.valor)}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                            t.tipo === 'credito'
                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                        }`}>
                                            {t.tipo === 'credito' ? 'C' : 'D'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 text-xs">
                                        {t.banco}
                                    </td>
                                    <td className="px-3 py-2">
                                        {editingId === t.id ? (
                                            <select
                                                autoFocus
                                                value={t.categoria}
                                                onChange={(e) => handleCategoriaChange(t.id, e.target.value)}
                                                onBlur={() => setEditingId(null)}
                                                className="px-1.5 py-0.5 border border-blue-300 dark:border-blue-600 rounded text-xs bg-white dark:bg-slate-700 text-slate-800 dark:text-white"
                                            >
                                                {CATEGORIAS_EXTRATO.map((c) => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <button
                                                onClick={() => setEditingId(t.id)}
                                                className={`px-2 py-0.5 rounded text-xs font-medium cursor-pointer hover:ring-2 hover:ring-blue-300 transition-shadow ${
                                                    t.categoriaManual
                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                                                }`}
                                                title="Clique para alterar a categoria"
                                            >
                                                {t.categoria}
                                                {t.categoriaManual && <span className="ml-1">*</span>}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: Conciliação
// ═══════════════════════════════════════════════════════════════════════════════

const ConciliacaoTab: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [empresaId, setEmpresaId] = useState('');
    const [periodo, setPeriodo] = useState(competenciaAtual());
    const [result, setResult] = useState<ConciliacaoResult | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const isAdmin = currentUser.role === 'admin';
                const list = isAdmin
                    ? await listarTodasEmpresas()
                    : await listarMinhasEmpresas((currentUser as any).uid);
                setEmpresas(list);
                if (list.length > 0) setEmpresaId(list[0].id);
            } catch (e) {
                console.warn('Erro ao carregar empresas:', e);
            }
        })();
    }, [currentUser]);

    const executar = async () => {
        if (!empresaId) return;
        setLoading(true);
        try {
            const r = await calcularConciliacao(empresaId, periodo);
            setResult(r);
        } catch (e) {
            console.warn('Erro na conciliação:', e);
        } finally {
            setLoading(false);
        }
    };

    const statusLabel = (s: string) => {
        switch (s) {
            case 'conciliado': return { text: 'Conciliado', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' };
            case 'divergencia': return { text: 'Divergência', cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' };
            case 'ausente_folha': return { text: 'Ausente na Folha', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' };
            case 'ausente_extrato': return { text: 'Ausente no Extrato', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' };
            default: return { text: s, cls: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400' };
        }
    };

    return (
        <div className="space-y-6">
            {/* Filtros */}
            <div className="flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Empresa</label>
                    <select
                        value={empresaId}
                        onChange={(e) => setEmpresaId(e.target.value)}
                        className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-white"
                    >
                        {empresas.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                                {emp.nomeFantasia || emp.razaoSocial}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Período</label>
                    <input
                        type="text"
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value)}
                        placeholder="MM/YYYY"
                        maxLength={7}
                        className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-sm text-slate-800 dark:text-white"
                    />
                </div>
                <button
                    onClick={executar}
                    disabled={loading || !empresaId}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-medium rounded-lg transition-colors text-sm flex items-center gap-2"
                >
                    {loading ? (
                        <>
                            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"></div>
                            Calculando...
                        </>
                    ) : (
                        <>🔄 Conciliar</>
                    )}
                </button>
            </div>

            {result && (
                <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Folha</div>
                            <div className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatCurrency(result.totalFolha)}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                            <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Total Extrato</div>
                            <div className="text-lg font-bold text-indigo-700 dark:text-indigo-300">{formatCurrency(result.totalExtrato)}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                            <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">Diferença</div>
                            <div className={`text-lg font-bold ${
                                Math.abs(result.diferenca) < 0.01
                                    ? 'text-green-700 dark:text-green-300'
                                    : 'text-red-700 dark:text-red-300'
                            }`}>
                                {formatCurrency(result.diferenca)}
                            </div>
                        </div>
                        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                            <div className="text-xs text-green-600 dark:text-green-400 font-medium">Conciliados</div>
                            <div className="text-lg font-bold text-green-700 dark:text-green-300">
                                {result.conciliados} / {result.itens.length}
                            </div>
                        </div>
                    </div>

                    {/* Status summary bar */}
                    <div className="flex flex-wrap gap-3 text-xs">
                        <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                            Conciliados: {result.conciliados}
                        </span>
                        <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                            Divergências: {result.divergencias}
                        </span>
                        <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                            Ausentes na Folha: {result.ausentesFolha}
                        </span>
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                            Ausentes no Extrato: {result.ausentesExtrato}
                        </span>
                    </div>

                    {/* Conciliation table */}
                    {result.itens.length === 0 ? (
                        <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                            <div className="text-4xl mb-2">📭</div>
                            <p className="text-sm">Nenhum dado para conciliar neste período.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-100 dark:bg-slate-700/50">
                                    <tr>
                                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Categoria</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Folha (Esperado)</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Extrato (Real)</th>
                                        <th className="px-3 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Diferença</th>
                                        <th className="px-3 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                    {result.itens.map((item, i) => {
                                        const st = statusLabel(item.status);
                                        return (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                                <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">
                                                    {item.descricao}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">
                                                    {formatCurrency(item.valorFolha)}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">
                                                    {formatCurrency(item.valorExtrato)}
                                                </td>
                                                <td className={`px-3 py-2 text-right font-mono ${
                                                    Math.abs(item.diferenca) < 0.01
                                                        ? 'text-green-600 dark:text-green-400'
                                                        : 'text-red-600 dark:text-red-400'
                                                }`}>
                                                    {formatCurrency(item.diferenca)}
                                                </td>
                                                <td className="px-3 py-2 text-center">
                                                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${st.cls}`}>
                                                        {st.text}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
                                    <tr>
                                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">Total</td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">
                                            {formatCurrency(result.totalFolha)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-slate-700 dark:text-slate-300">
                                            {formatCurrency(result.totalExtrato)}
                                        </td>
                                        <td className={`px-3 py-2 text-right font-mono ${
                                            Math.abs(result.diferenca) < 0.01
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-red-600 dark:text-red-400'
                                        }`}>
                                            {formatCurrency(result.diferenca)}
                                        </td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}
                </>
            )}

            {!result && !loading && (
                <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                    <div className="text-4xl mb-2">🔄</div>
                    <p className="text-sm">Selecione a empresa e o período, depois clique em "Conciliar".</p>
                </div>
            )}
        </div>
    );
};
