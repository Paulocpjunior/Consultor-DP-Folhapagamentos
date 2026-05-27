import React, { useState, useEffect, useCallback } from 'react';
import {
    collection,
    getDocs,
    addDoc,
    query,
    where,
    orderBy,
    limit as firestoreLimit,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebaseConfig';
import {
    listarMinhasEmpresas,
    listarTodasEmpresas,
} from '../../services/empresas/empresasService';
import {
    parsearArquivoFixedWidth,
    decodeBuffer,
} from '../../services/ponto/pontoFixedWidthParser';
import { buscarModelo, listarModelos } from '../../services/ponto/pontoModelosService';
import { buscarLayout, listarLayoutsPorCnpj } from '../../services/ponto/pontoLayoutsService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type {
    ResultadoParsingPonto,
    ModeloPonto,
    LayoutPonto,
    EventoApurado,
} from '../../types/ponto';
import type { User } from '../../types';

// ===== Types for Firestore ponto records =====

interface RegistroPonto {
    id: string;
    empresaId: string;
    empresaNome: string;
    funcionarioNome?: string;
    funcionarioPis?: string;
    data: string;
    entrada?: string;
    saida?: string;
    horasTrabalhadas?: number;
    eventos: EventoApurado[];
    arquivo: string;
    periodo: string; // YYYY-MM
    criadoEm: any;
}

interface LayoutResumo {
    cnpj: string;
    razaoSocial: string;
    cadastroSAGE: string;
    modeloId: string;
    pisMapeados: number;
    updatedAt: number;
}

// ===== Detected model helpers =====

function detectarModelo(fileName: string, conteudo: string): string {
    const lower = fileName.toLowerCase();
    if (lower.includes('acjef') || lower.endsWith('.acjef')) return 'ACJEF';
    if (lower.includes('afdt') || lower.endsWith('.afdt')) return 'AFDT';
    if (lower.includes('dimep')) return 'DIMEP';
    if (lower.includes('henry')) return 'Henry';
    if (lower.includes('ahgora')) return 'Ahgora';
    // Check content patterns
    const firstLine = conteudo.split(/\r?\n/)[0] || '';
    if (firstLine.length > 30 && /^\d{9}1/.test(firstLine.substring(0, 10))) return 'ACJEF';
    if (firstLine.includes('AFDT')) return 'AFDT';
    return 'Desconhecido';
}

const COLECAO_PONTO = 'ponto_registros';

// ===== Subcomponents =====

type PontoTab = 'importar' | 'layouts' | 'registros';

interface Props {
    currentUser: User;
}

const PontoPanel: React.FC<Props> = ({ currentUser }) => {
    const [tab, setTab] = useState<PontoTab>('importar');

    const tabs: { id: PontoTab; label: string; icon: string }[] = [
        { id: 'importar', label: 'Importar Arquivo', icon: '📥' },
        { id: 'layouts', label: 'Layouts', icon: '📐' },
        { id: 'registros', label: 'Registros', icon: '📋' },
    ];

    return (
        <div className="space-y-4">
            <header>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                    Ponto Eletronico
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Importacao de arquivos de ponto, layouts e registros
                </p>
            </header>

            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                            tab === t.id
                                ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                    >
                        <span className="mr-1">{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'importar' && <TabImportar currentUser={currentUser} />}
            {tab === 'layouts' && <TabLayouts currentUser={currentUser} />}
            {tab === 'registros' && <TabRegistros currentUser={currentUser} />}
        </div>
    );
};

// ===== Tab 1: Importar Arquivo =====

const TabImportar: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [empresaId, setEmpresaId] = useState('');
    const [modelo, setModelo] = useState<ModeloPonto | null>(null);
    const [layout, setLayout] = useState<LayoutPonto | null>(null);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [conteudo, setConteudo] = useState<string | null>(null);
    const [modeloDetectado, setModeloDetectado] = useState<string>('');
    const [resultado, setResultado] = useState<ResultadoParsingPonto | null>(null);
    const [loading, setLoading] = useState(true);
    const [processando, setProcessando] = useState(false);
    const [importando, setImportando] = useState(false);
    const [erro, setErro] = useState('');
    const [msgSucesso, setMsgSucesso] = useState('');
    const [dragActive, setDragActive] = useState(false);

    const MODELO_ID = 'acjef_p1510_v1';

    useEffect(() => {
        (async () => {
            try {
                const isAdmin = (currentUser as any)?.role === 'admin' || (currentUser as any)?.role === 'owner';
                const [emps, mod] = await Promise.all([
                    isAdmin ? listarTodasEmpresas() : listarMinhasEmpresas((currentUser as any)?.uid),
                    buscarModelo(MODELO_ID),
                ]);
                setEmpresas(emps || []);
                setModelo(mod);
            } catch (e: any) {
                setErro(e?.message || 'Erro ao carregar contexto');
            } finally {
                setLoading(false);
            }
        })();
    }, [currentUser]);

    useEffect(() => {
        if (!empresaId) { setLayout(null); return; }
        const empresa = empresas.find(e => e.id === empresaId);
        if (!empresa) return;
        const cnpj = (empresa as any).cnpj || '';
        const sage = (empresa as any).codigoSage || (empresa as any).cadastroSAGE || '';
        if (cnpj && sage) {
            buscarLayout(cnpj, String(sage))
                .then(l => setLayout(l))
                .catch(() => setLayout(null));
        }
    }, [empresaId, empresas]);

    const processFile = useCallback(async (file: File) => {
        setArquivo(file);
        setResultado(null);
        setMsgSucesso('');
        setErro('');
        try {
            const buf = await file.arrayBuffer();
            const text = decodeBuffer(buf, modelo?.encoding ?? 'iso-8859-1');
            setConteudo(text);
            setModeloDetectado(detectarModelo(file.name, text));
        } catch (e: any) {
            setErro('Erro ao ler arquivo: ' + (e?.message || String(e)));
        }
    }, [modelo]);

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (f) processFile(f);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const f = e.dataTransfer.files?.[0];
        if (f) processFile(f);
    };

    const handleProcessar = useCallback(async () => {
        const empresa = empresas.find(e => e.id === empresaId);
        if (!arquivo || !modelo || !empresa || !conteudo) return;
        setProcessando(true);
        setErro('');
        try {
            const cnpj = ((empresa as any).cnpj || '').replace(/\D/g, '');
            const r = parsearArquivoFixedWidth(conteudo, modelo, layout, {
                nomeArquivo: arquivo.name,
                cnpjEsperado: cnpj,
            });
            setResultado(r);
        } catch (e: any) {
            setErro(e?.message || 'Erro ao processar');
        } finally {
            setProcessando(false);
        }
    }, [arquivo, modelo, layout, empresaId, empresas, conteudo]);

    const handleImportar = async () => {
        if (!resultado || !empresaId || !db) return;
        const empresa = empresas.find(e => e.id === empresaId);
        if (!empresa) return;
        setImportando(true);
        setErro('');
        try {
            const col = collection(db, COLECAO_PONTO);
            // Group events by PIS to create per-worker records
            const byPis = new Map<string, EventoApurado[]>();
            for (const ev of resultado.eventos) {
                const key = ev.pis || 'sem_pis';
                if (!byPis.has(key)) byPis.set(key, []);
                byPis.get(key)!.push(ev);
            }
            const periodo = resultado.competencia || new Date().toISOString().slice(0, 7);
            let count = 0;
            for (const [pis, evts] of byPis.entries()) {
                const totalHoras = evts
                    .filter(e => e.unidade === 'horas')
                    .reduce((acc, e) => acc + e.valor, 0);
                await addDoc(col, {
                    empresaId,
                    empresaNome: (empresa as any).razaoSocial || empresa.nomeFantasia || '',
                    funcionarioPis: pis !== 'sem_pis' ? pis : null,
                    funcionarioNome: evts[0]?.nomeFuncionario || null,
                    data: new Date().toISOString().slice(0, 10),
                    horasTrabalhadas: Math.round(totalHoras * 100) / 100,
                    eventos: evts.map(e => ({
                        evento: e.evento,
                        descricao: e.descricao,
                        valor: e.valor,
                        unidade: e.unidade,
                        rv: e.rv,
                    })),
                    arquivo: arquivo?.name || '',
                    periodo,
                    criadoEm: serverTimestamp(),
                });
                count++;
            }
            setMsgSucesso(`${count} registro(s) importado(s) com sucesso para o periodo ${periodo}.`);
            setResultado(null);
            setArquivo(null);
            setConteudo(null);
        } catch (e: any) {
            setErro('Erro ao importar: ' + (e?.message || String(e)));
        } finally {
            setImportando(false);
        }
    };

    if (loading) {
        return <div className="py-8 text-center text-slate-500 dark:text-slate-400">Carregando...</div>;
    }

    return (
        <div className="space-y-4">
            {erro && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
                    {erro}
                    <button onClick={() => setErro('')} className="ml-2 underline text-xs">fechar</button>
                </div>
            )}
            {msgSucesso && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg text-green-700 dark:text-green-300 text-sm">
                    {msgSucesso}
                    <button onClick={() => setMsgSucesso('')} className="ml-2 underline text-xs">fechar</button>
                </div>
            )}

            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Empresa</label>
                    <select value={empresaId} onChange={e => setEmpresaId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm">
                        <option value="">Selecione...</option>
                        {empresas.map(e => (
                            <option key={e.id} value={e.id}>{(e as any).razaoSocial || e.nomeFantasia} -- {(e as any).cnpj}</option>
                        ))}
                    </select>
                </div>

                {/* Drag & Drop zone */}
                <div
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                        dragActive
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
                    }`}
                >
                    <div className="text-3xl mb-2">📂</div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                        Arraste um arquivo ACJEF/AFDT aqui ou clique para selecionar
                    </p>
                    <input
                        type="file"
                        accept=".txt,.acjef,.afdt,.dat,.AFD,.afd"
                        onChange={handleFileInput}
                        className="block mx-auto text-sm text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/40 file:text-blue-700 dark:file:text-blue-300"
                    />
                    {arquivo && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            {arquivo.name} ({(arquivo.size / 1024).toFixed(1)} KB)
                        </p>
                    )}
                </div>

                {/* Detected model */}
                {modeloDetectado && arquivo && (
                    <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Modelo detectado:</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            modeloDetectado === 'Desconhecido'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                        }`}>
                            {modeloDetectado}
                        </span>
                    </div>
                )}

                <button
                    onClick={handleProcessar}
                    disabled={!arquivo || !empresaId || !modelo || processando}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm"
                >
                    {processando ? 'Processando...' : 'Processar Arquivo'}
                </button>
            </div>

            {/* Preview first 10 records */}
            {resultado && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatCard label="Total registros" value={resultado.totalRegistros} />
                        <StatCard label="Eventos extraidos" value={resultado.eventos.length} />
                        <StatCard label="PIS sem matricula" value={resultado.pisSemMatricula.length} />
                        <StatCard label="Erros" value={resultado.erros.length} color={resultado.erros.length > 0 ? 'red' : undefined} />
                    </div>

                    {resultado.erros.length > 0 && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                            <h4 className="text-red-800 dark:text-red-200 font-medium text-sm mb-1">Erros</h4>
                            <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5 list-disc list-inside">
                                {resultado.erros.map((e, i) => <li key={i}>{e}</li>)}
                            </ul>
                        </div>
                    )}

                    {resultado.eventos.length > 0 && (
                        <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto">
                            <h4 className="font-medium text-slate-800 dark:text-white text-sm mb-2">
                                Preview (primeiros 10 registros)
                            </h4>
                            <table className="w-full text-xs">
                                <thead className="bg-slate-100 dark:bg-slate-700">
                                    <tr>
                                        <th className="text-left p-2">PIS</th>
                                        <th className="text-left p-2">Cod. SAGE</th>
                                        <th className="text-left p-2">Descricao</th>
                                        <th className="text-right p-2">Valor</th>
                                        <th className="text-left p-2">Unidade</th>
                                        <th className="text-center p-2">R/V</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resultado.eventos.slice(0, 10).map((ev, i) => (
                                        <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                                            <td className="p-2 font-mono">{ev.pis || '---'}</td>
                                            <td className="p-2 font-mono">{ev.evento}</td>
                                            <td className="p-2">{ev.descricao}</td>
                                            <td className="p-2 text-right font-mono">{ev.valor.toFixed(2)}</td>
                                            <td className="p-2 text-slate-500 dark:text-slate-400">{ev.unidade}</td>
                                            <td className="p-2 text-center">{ev.rv}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {resultado.eventos.length > 10 && (
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic">
                                    ... e mais {resultado.eventos.length - 10} eventos
                                </p>
                            )}
                        </div>
                    )}

                    <button
                        onClick={handleImportar}
                        disabled={importando || resultado.eventos.length === 0}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium text-sm"
                    >
                        {importando ? 'Importando...' : `Importar ${resultado.eventos.length} evento(s)`}
                    </button>
                </div>
            )}
        </div>
    );
};

// ===== Tab 2: Layouts =====

const TabLayouts: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [layouts, setLayouts] = useState<LayoutResumo[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroEmpresa, setFiltroEmpresa] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const isAdmin = (currentUser as any)?.role === 'admin' || (currentUser as any)?.role === 'owner';
                const emps = isAdmin ? await listarTodasEmpresas() : await listarMinhasEmpresas((currentUser as any)?.uid);
                setEmpresas(emps || []);

                // Load layouts for all companies
                const allLayouts: LayoutResumo[] = [];
                for (const emp of (emps || [])) {
                    const cnpj = (emp as any).cnpj;
                    if (!cnpj) continue;
                    try {
                        const empLayouts = await listarLayoutsPorCnpj(cnpj);
                        for (const l of empLayouts) {
                            allLayouts.push({
                                cnpj: l.cnpj,
                                razaoSocial: l.razaoSocial || (emp as any).razaoSocial || emp.nomeFantasia || '',
                                cadastroSAGE: l.cadastroSAGE,
                                modeloId: l.modeloId,
                                pisMapeados: Object.keys(l.pisToMatricula || {}).length,
                                updatedAt: l.updatedAt || 0,
                            });
                        }
                    } catch {
                        // Ignore per-company errors
                    }
                }
                setLayouts(allLayouts);
            } catch (e: any) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        })();
    }, [currentUser]);

    const filtered = filtroEmpresa
        ? layouts.filter(l => l.cnpj.includes(filtroEmpresa) || l.razaoSocial.toLowerCase().includes(filtroEmpresa.toLowerCase()))
        : layouts;

    if (loading) {
        return <div className="py-8 text-center text-slate-500 dark:text-slate-400">Carregando layouts...</div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <input
                    type="text"
                    placeholder="Filtrar por empresa..."
                    value={filtroEmpresa}
                    onChange={e => setFiltroEmpresa(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                    {filtered.length} layout(s)
                </span>
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <p className="text-sm">Nenhum layout encontrado.</p>
                    <p className="text-xs mt-1">Importe um arquivo na aba "Importar Arquivo" para criar layouts automaticamente.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filtered.map((l, i) => (
                        <div key={i} className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h4 className="font-medium text-slate-800 dark:text-white text-sm">{l.razaoSocial}</h4>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">CNPJ: {l.cnpj}</p>
                                </div>
                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full">
                                    {l.modeloId}
                                </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">Cadastro SAGE:</span>
                                    <span className="ml-1 font-mono text-slate-700 dark:text-slate-300">{l.cadastroSAGE}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500 dark:text-slate-400">PIS mapeados:</span>
                                    <span className="ml-1 font-medium text-slate-700 dark:text-slate-300">{l.pisMapeados}</span>
                                </div>
                            </div>
                            {l.updatedAt > 0 && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                                    Atualizado: {new Date(l.updatedAt).toLocaleDateString('pt-BR')}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ===== Tab 3: Registros =====

const TabRegistros: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [registros, setRegistros] = useState<RegistroPonto[]>([]);
    const [loading, setLoading] = useState(true);
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [filtroPeriodo, setFiltroPeriodo] = useState('');

    const loadEmpresas = useCallback(async () => {
        const isAdmin = (currentUser as any)?.role === 'admin' || (currentUser as any)?.role === 'owner';
        return isAdmin ? listarTodasEmpresas() : listarMinhasEmpresas((currentUser as any)?.uid);
    }, [currentUser]);

    const loadRegistros = useCallback(async () => {
        if (!db) return;
        setLoading(true);
        try {
            const col = collection(db, COLECAO_PONTO);
            const constraints: any[] = [orderBy('criadoEm', 'desc'), firestoreLimit(100)];
            if (filtroEmpresa) constraints.unshift(where('empresaId', '==', filtroEmpresa));
            if (filtroPeriodo) constraints.unshift(where('periodo', '==', filtroPeriodo));
            const q = query(col, ...constraints);
            const snap = await getDocs(q);
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as RegistroPonto));
            setRegistros(items);
        } catch (e) {
            console.error('Erro ao carregar registros:', e);
        } finally {
            setLoading(false);
        }
    }, [filtroEmpresa, filtroPeriodo]);

    useEffect(() => {
        loadEmpresas().then(emps => setEmpresas(emps || [])).catch(() => {});
    }, [loadEmpresas]);

    useEffect(() => {
        loadRegistros();
    }, [loadRegistros]);

    const getEmpresaNome = (id: string) => {
        const emp = empresas.find(e => e.id === id);
        return (emp as any)?.razaoSocial || emp?.nomeFantasia || id;
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <select
                    value={filtroEmpresa}
                    onChange={e => setFiltroEmpresa(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                    <option value="">Todas as empresas</option>
                    {empresas.map(emp => (
                        <option key={emp.id} value={emp.id}>{(emp as any).razaoSocial || emp.nomeFantasia}</option>
                    ))}
                </select>

                <input
                    type="month"
                    value={filtroPeriodo}
                    onChange={e => setFiltroPeriodo(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                    placeholder="Periodo"
                />

                {filtroPeriodo && (
                    <button
                        onClick={() => setFiltroPeriodo('')}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                        Limpar periodo
                    </button>
                )}

                <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
                    {registros.length} registro(s)
                </span>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
                </div>
            ) : registros.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <p className="text-sm">Nenhum registro de ponto encontrado.</p>
                    <p className="text-xs mt-1">Importe um arquivo na aba "Importar Arquivo".</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Funcionario</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Empresa</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Data</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Periodo</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400 text-right">Horas Trab.</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Arquivo</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400 text-right">Eventos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {registros.map(r => (
                                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="py-2 px-2">
                                        <div className="text-slate-700 dark:text-slate-300">
                                            {r.funcionarioNome || r.funcionarioPis || '---'}
                                        </div>
                                        {r.funcionarioPis && r.funcionarioNome && (
                                            <div className="text-xs text-slate-400 font-mono">{r.funcionarioPis}</div>
                                        )}
                                    </td>
                                    <td className="py-2 px-2 text-slate-600 dark:text-slate-400 text-xs">
                                        {r.empresaNome || getEmpresaNome(r.empresaId)}
                                    </td>
                                    <td className="py-2 px-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.data}</td>
                                    <td className="py-2 px-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.periodo}</td>
                                    <td className="py-2 px-2 text-right font-mono text-xs">
                                        {r.horasTrabalhadas != null ? (
                                            <span className="text-blue-600 dark:text-blue-400">{r.horasTrabalhadas.toFixed(2)}h</span>
                                        ) : '---'}
                                    </td>
                                    <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[150px]" title={r.arquivo}>
                                        {r.arquivo}
                                    </td>
                                    <td className="py-2 px-2 text-right">
                                        <span className="px-1.5 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded">
                                            {r.eventos?.length || 0}
                                        </span>
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

// ===== Shared stat card =====

const StatCard: React.FC<{ label: string; value: number; color?: 'red' }> = ({ label, value, color }) => (
    <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-center">
        <div className={`text-2xl font-bold ${color === 'red' ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
    </div>
);

export default PontoPanel;
