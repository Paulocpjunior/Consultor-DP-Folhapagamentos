import React, { useState } from 'react';
import { processBankStatementPDF, processInvestmentStatementPDF, suggestNewCategory } from '../../services/geminiService';
import { TRANSACTION_CATEGORIES } from '../../constants';

interface Row {
    [key: string]: any;
}

interface ExtratosProcessorProps {
    currentUser?: { id: string; name: string; email: string; role: string };
}

type Mode = 'bank' | 'investment';

const ExtratosProcessor: React.FC<ExtratosProcessorProps> = ({ currentUser }) => {
    const [mode, setMode] = useState<Mode>('bank');
    const [file, setFile] = useState<File | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [metadata, setMetadata] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggestingIdx, setSuggestingIdx] = useState<number | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.type !== 'application/pdf') {
            setError('Apenas arquivos PDF são aceitos.');
            return;
        }
        setFile(f);
        setError(null);
    };

    const handleProcess = async () => {
        if (!file) { setError('Selecione um PDF primeiro.'); return; }
        setIsLoading(true);
        setError(null);
        setRows([]);
        setMetadata(null);

        try {
            if (mode === 'bank') {
                const res = await processBankStatementPDF(file);
                const txs = (res as any).transactions || [];
                setRows(txs);
                setMetadata((res as any).metadata || null);
            } else {
                const res = await processInvestmentStatementPDF(file);
                const txs = (res as any).investmentTransactions || [];
                setRows(txs);
                setMetadata({
                    cotistaNome: (res as any).cotistaNome,
                    cotistaCNPJ: (res as any).cotistaCNPJ,
                    bankName: (res as any).bankName,
                    periodStart: (res as any).periodStart,
                    periodEnd: (res as any).periodEnd,
                    pagesProcessed: (res as any).pagesProcessed,
                    totalPages: (res as any).totalPagesInDocument,
                    isComplete: (res as any).isExtractionComplete
                });
            }
        } catch (e: any) {
            console.error(e);
            setError(e?.message || 'Falha no processamento.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSuggestCategory = async (idx: number) => {
        const row = rows[idx];
        if (!row.description) return;
        setSuggestingIdx(idx);
        try {
            const newCat = await suggestNewCategory(row.description, row.category || 'Outros');
            setRows(rs => rs.map((r, i) => i === idx ? { ...r, category: newCat } : r));
        } catch (e) { console.error(e); }
        finally { setSuggestingIdx(null); }
    };

    const handleEdit = (idx: number, field: string, value: any) => {
        setRows(rs => rs.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    };

    const exportCSV = () => {
        if (rows.length === 0) return;
        const headers = Object.keys(rows[0]);
        const csv = [
            headers.join(','),
            ...rows.map(r => headers.map(h => {
                const v = r[h];
                if (v === null || v === undefined) return '';
                const s = String(v).replace(/"/g, '""');
                return /[,"\n]/.test(s) ? `"${s}"` : s;
            }).join(','))
        ].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `extrato_${mode}_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-6">
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">📄 Processador de Extratos</h2>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                    Upload de PDF bancário ou de investimento. A IA extrai as movimentações automaticamente.
                </p>
            </div>

            <div className="flex gap-2 mb-4">
                <button
                    onClick={() => { setMode('bank'); setRows([]); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'bank' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                    🏦 Extrato Bancário
                </button>
                <button
                    onClick={() => { setMode('investment'); setRows([]); }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'investment' ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'}`}>
                    📊 Extrato de Cotista / Investimento
                </button>
            </div>

            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center mb-4">
                <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" id="pdf-upload" />
                <label htmlFor="pdf-upload" className="cursor-pointer">
                    <div className="text-4xl mb-2">📎</div>
                    {file ? (
                        <div className="text-slate-700 dark:text-slate-300">
                            <p className="font-medium">{file.name}</p>
                            <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                    ) : (
                        <p className="text-slate-500">Clique para selecionar um PDF</p>
                    )}
                </label>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                    {error}
                </div>
            )}

            <div className="flex gap-2 mb-6">
                <button
                    onClick={handleProcess}
                    disabled={!file || isLoading}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-lg shadow">
                    {isLoading ? 'Processando...' : 'Processar com IA'}
                </button>
                {rows.length > 0 && (
                    <>
                        <button onClick={exportCSV} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg">
                            📥 Exportar CSV
                        </button>
                        <button onClick={() => { setRows([]); setFile(null); setMetadata(null); }} className="px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg">
                            Limpar
                        </button>
                    </>
                )}
            </div>

            {metadata && (
                <div className="mb-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                    <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">📋 Metadados</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                        {Object.entries(metadata).filter(([_, v]) => v).map(([k, v]) => (
                            <div key={k}>
                                <span className="text-slate-500">{k}:</span>{' '}
                                <span className="text-slate-800 dark:text-slate-200 font-medium">{String(v)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {rows.length > 0 && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0">
                            <tr>
                                {headers.map(h => (
                                    <th key={h} className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                                <th className="px-3 py-2 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, idx) => (
                                <tr key={idx} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                    {headers.map(h => (
                                        <td key={h} className="px-3 py-2 whitespace-nowrap">
                                            {h === 'category' && mode === 'bank' ? (
                                                <select
                                                    value={row[h] || 'Outros'}
                                                    onChange={e => handleEdit(idx, h, e.target.value)}
                                                    className="bg-transparent border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs">
                                                    {TRANSACTION_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            ) : typeof row[h] === 'number' && /amount|value|balance|grossValue|netValue|irWithheld|shareValue|shareQuantity/i.test(h) ? (
                                                h.toLowerCase().includes('quantity') ? row[h] : formatCurrency(row[h])
                                            ) : typeof row[h] === 'boolean' ? (
                                                row[h] ? '✓' : '—'
                                            ) : (
                                                String(row[h] ?? '')
                                            )}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2 text-center">
                                        {mode === 'bank' && row.description && (
                                            <button
                                                onClick={() => handleSuggestCategory(idx)}
                                                disabled={suggestingIdx === idx}
                                                className="text-blue-600 hover:text-blue-700 text-xs">
                                                {suggestingIdx === idx ? '...' : '🤖 Sugerir categoria'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
                        Total: <strong>{rows.length}</strong> {mode === 'bank' ? 'transações' : 'movimentações'}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExtratosProcessor;
