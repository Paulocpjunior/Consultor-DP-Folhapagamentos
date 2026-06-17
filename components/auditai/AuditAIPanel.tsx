import React, { useState, useEffect } from 'react';
import HeaderInputs from './HeaderInputs';
import FileUploader, { UploadedFile } from './FileUploader';
import AnalysisViewer from './AnalysisViewer';
import AnalysisHistory from './AnalysisHistory';
import ChatAssistant from './ChatAssistant';
import ComparisonViewer from './ComparisonViewer';
import ConsolidationViewer from './ConsolidationViewer';
import type { HeaderData, AnalysisResult, HistoryItem, ComparisonResult, ComparisonRow, ConsolidationResult } from '../../types.auditai';
import { analyzeDocument } from '../../services/auditai/geminiService';
import { consolidateDREs } from '../../services/auditai/consolidationService';

const HISTORY_KEY = 'auditAI_history';
const CACHE_PREFIX = 'auditAI_cache_';
const MAX_HISTORY = 100;

interface AuditAIPanelProps {
    currentUser?: { id: string; name: string; email: string; role: string };
}

const AuditLoadingOverlay = ({ current, total }: { current?: number; total?: number }) => (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-md">
            <div className="relative flex items-center justify-center mb-6">
                <div className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-blue-500/20 opacity-75"></div>
                <div className="relative animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
                Analisando Documento{total && total > 1 ? `s (${current}/${total})` : ''}...
            </h3>
            <p className="text-blue-500 font-medium">A IA da SP Assessoria está processando.</p>
        </div>
    </div>
);

const AuditAIPanel: React.FC<AuditAIPanelProps> = ({ currentUser }) => {
    const [headerData, setHeaderData] = useState<HeaderData>({
        companyName: '',
        collaboratorName: currentUser?.name || '',
        cnpj: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
    const [timestamp, setTimestamp] = useState<string | null>(null);
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
    const [consolidationResult, setConsolidationResult] = useState<ConsolidationResult | null>(null);
    const [view, setView] = useState<'analysis' | 'comparison' | 'consolidation'>('analysis');

    useEffect(() => {
        try {
            const saved = localStorage.getItem(HISTORY_KEY);
            if (saved) setHistory(JSON.parse(saved));
        } catch (e) { console.error('history load failed', e); }
    }, []);

    const persistHistory = (items: HistoryItem[]) => {
        setHistory(items);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY))); }
        catch (e) { console.warn('history persist failed', e); }
    };

    const cacheResult = (id: string, data: AnalysisResult) => {
        try { localStorage.setItem(`${CACHE_PREFIX}${id}`, JSON.stringify(data)); }
        catch (e) { console.warn('cache failed', e); }
    };

    const getHistoryResult = (item: HistoryItem): AnalysisResult | null => {
        if (item.fullResult) return item.fullResult;
        try { return JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${item.id}`) || 'null'); }
        catch { return null; }
    };

    const buildComparison = (olderItem: HistoryItem, newerItem: HistoryItem): ComparisonResult | null => {
        const older = getHistoryResult(olderItem);
        const newer = getHistoryResult(newerItem);
        if (!older || !newer) return null;

        const byCode = new Map<string, ComparisonRow>();
        const add = (analysis: AnalysisResult, which: 1 | 2) => {
            analysis.accounts.forEach(acc => {
                const key = acc.account_code || acc.account_name;
                const existing = byCode.get(key) || {
                    code: acc.account_code || '',
                    name: acc.account_name,
                    val1: 0,
                    val2: 0,
                    varAbs: 0,
                    varPct: 0,
                    is_synthetic: acc.is_synthetic,
                    level: acc.level
                };
                if (which === 1) existing.val1 = acc.final_balance;
                else existing.val2 = acc.final_balance;
                byCode.set(key, existing);
            });
        };

        add(older, 1);
        add(newer, 2);

        const rows = Array.from(byCode.values()).map(row => {
            const varAbs = row.val2 - row.val1;
            const varPct = row.val1 !== 0 ? (varAbs / Math.abs(row.val1)) * 100 : 0;
            return { ...row, varAbs, varPct };
        });

        return {
            period1Label: olderItem.summary?.period || 'Período 1',
            period2Label: newerItem.summary?.period || 'Período 2',
            documentType: newer.summary?.document_type || older.summary?.document_type || 'Documento',
            rows
        };
    };

    const handleAnalyze = async () => {
        if (selectedFiles.length === 0) {
            setError('Selecione pelo menos um arquivo.');
            return;
        }
        if (!headerData.companyName.trim()) {
            setError('Informe o nome da empresa.');
            return;
        }

        setError(null);
        setResult(null);
        setComparisonResult(null);
        setConsolidationResult(null);
        setIsLoading(true);
        setProgress({ current: 0, total: selectedFiles.length });

        try {
            const results: AnalysisResult[] = [];
            for (let i = 0; i < selectedFiles.length; i++) {
                setProgress({ current: i + 1, total: selectedFiles.length });
                const file = selectedFiles[i];
                const r = await analyzeDocument(file.base64, file.mimeType);
                results.push(r);
            }

            const finalResult = results.length === 1 ? results[0] : results[0];
            setResult(finalResult);
            const now = new Date().toISOString();
            setTimestamp(now);

            const newItem: HistoryItem = {
                id: `hist_${Date.now()}`,
                timestamp: now,
                headerData,
                summary: finalResult.summary,
                fullResult: finalResult,
                fileName: selectedFiles[0]?.file.name || '',
                fileNames: selectedFiles.map(f => f.file.name)
            };

            persistHistory([newItem, ...history]);
            cacheResult(newItem.id, finalResult);
            setView('analysis');
        } catch (e: any) {
            console.error(e);
            setError(e?.message || 'Falha na análise.');
        } finally {
            setIsLoading(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    const handleLoadFromHistory = (item: HistoryItem) => {
        const cached = getHistoryResult(item);
        if (cached) {
            setResult(cached);
            setHeaderData(item.headerData);
            setTimestamp(item.timestamp);
            setComparisonResult(null);
            setConsolidationResult(null);
            setView('analysis');
            setHistoryOpen(false);
        }
    };

    const handleDeleteHistory = (id: string) => {
        persistHistory(history.filter(h => h.id !== id));
        try { localStorage.removeItem(`${CACHE_PREFIX}${id}`); } catch {}
    };

    const handleClearAll = () => {
        if (!confirm('Apagar todo o histórico do AuditAI?')) return;
        history.forEach(h => { try { localStorage.removeItem(`${CACHE_PREFIX}${h.id}`); } catch {} });
        persistHistory([]);
    };

    const runComparisonFromItems = (olderItem: HistoryItem, newerItem: HistoryItem) => {
        const comparison = buildComparison(olderItem, newerItem);
        if (!comparison) {
            setError('Não foi possível carregar os resultados completos dessas análises.');
            return;
        }
        setError(null);
        setComparisonResult(comparison);
        setResult(null);
        setConsolidationResult(null);
        setHistoryOpen(false);
        setView('comparison');
    };

    const runComparison = () => {
        const comparable = history.filter(item => !!getHistoryResult(item)).slice(0, 2);
        if (comparable.length < 2) {
            setError('Precisa de pelo menos 2 análises no histórico para comparar.');
            return;
        }
        const [newerItem, olderItem] = comparable;
        runComparisonFromItems(olderItem, newerItem);
    };

    const runConsolidationFromItems = (items: HistoryItem[]) => {
        const dreItems = items.filter(item => item.summary?.document_type === 'DRE');
        if (dreItems.length < 2) {
            setError('Precisa de pelo menos 2 DREs no histórico para consolidar.');
            return;
        }

        const inputs = dreItems
            .map(item => ({ item, result: getHistoryResult(item) }))
            .filter((entry): entry is { item: HistoryItem; result: AnalysisResult } => !!entry.result);

        if (inputs.length < 2) {
            setError('Precisa de pelo menos 2 DREs no histórico para consolidar.');
            return;
        }

        try {
            const consolidated = consolidateDREs(inputs);
            setError(null);
            setConsolidationResult(consolidated);
            setResult(null);
            setComparisonResult(null);
            setHistoryOpen(false);
            setView('consolidation');
        } catch (e: any) {
            setError(e?.message || 'Falha na consolidação.');
        }
    };

    const runConsolidation = () => {
        const latestByCnpj = new Map<string, HistoryItem>();
        history.forEach(item => {
            if (item.summary?.document_type !== 'DRE' || !getHistoryResult(item)) return;
            const cnpjKey = item.headerData.cnpj?.replace(/\D/g, '') || item.id;
            if (!latestByCnpj.has(cnpjKey)) latestByCnpj.set(cnpjKey, item);
        });
        runConsolidationFromItems(Array.from(latestByCnpj.values()));
    };

    return (
        <div className="relative">
            {isLoading && <AuditLoadingOverlay current={progress.current} total={progress.total} />}

            <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-6 mb-6">
                <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
                            🔍 AuditAI — Análise de Balancetes
                        </h2>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">
                            Envie balancetes ou DREs (PDF, CSV, Excel, imagens) e receba análise contábil automatizada.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setHistoryOpen(true)}
                            className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 text-sm">
                            📚 Histórico ({history.length})
                        </button>
                        {history.length >= 2 && (
                            <>
                                <button onClick={runComparison}
                                    className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 rounded-lg hover:bg-blue-200 text-sm">
                                    ⇄ Comparar
                                </button>
                                <button onClick={runConsolidation}
                                    className="px-4 py-2 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200 rounded-lg hover:bg-purple-200 text-sm">
                                    Σ Consolidar DREs
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <HeaderInputs data={headerData} onChange={setHeaderData} />

                <div className="mt-4">
                    <FileUploader
                        onFilesSelected={setSelectedFiles}
                        isLoading={isLoading}
                        isGroupAnalysis={headerData.isGroupAnalysis}
                        selectedFileNames={selectedFiles.map(f => f.file.name)}
                    />
                </div>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                        {error}
                    </div>
                )}

                <div className="mt-4 flex gap-2">
                    <button
                        onClick={handleAnalyze}
                        disabled={isLoading || selectedFiles.length === 0}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow transition-colors">
                        {isLoading ? 'Analisando...' : 'Analisar Documento'}
                    </button>
                    {(result || comparisonResult || consolidationResult) && (
                        <button
                            onClick={() => { setResult(null); setComparisonResult(null); setConsolidationResult(null); setSelectedFiles([]); }}
                            className="px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg">
                            Limpar
                        </button>
                    )}
                </div>
            </div>

            {view === 'analysis' && result && timestamp && (
                <AnalysisViewer result={result} headerData={headerData} analysisTimestamp={timestamp} />
            )}

            {view === 'comparison' && comparisonResult && (
                <ComparisonViewer data={comparisonResult} onBack={() => setView('analysis')} />
            )}

            {view === 'consolidation' && consolidationResult && (
                <ConsolidationViewer
                    data={consolidationResult}
                    onBack={() => setView('analysis')}
                    collaboratorName={headerData.collaboratorName || currentUser?.name || ''}
                />
            )}

            {result && <ChatAssistant />}

            {historyOpen && (
                <AnalysisHistory
                    isOpen={historyOpen}
                    history={history}
                    onSelect={handleLoadFromHistory}
                    onClear={handleClearAll}
                    onDeleteItem={handleDeleteHistory}
                    onCompare={runComparisonFromItems}
                    onConsolidate={runConsolidationFromItems}
                    onClose={() => setHistoryOpen(false)}
                    currentUser={currentUser?.name}
                />
            )}
        </div>
    );
};

export default AuditAIPanel;
