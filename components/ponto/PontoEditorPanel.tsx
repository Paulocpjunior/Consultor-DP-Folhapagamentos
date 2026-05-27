import React, { useState, useCallback, useEffect } from 'react';
import type { User } from '../../types';
import type { Empresa } from '../../services/empresas/empresasTypes';
import {
    listarMinhasEmpresas,
    listarTodasEmpresas,
} from '../../services/empresas/empresasService';
import {
    parsearArquivoFixedWidth,
    decodeBuffer,
} from '../../services/ponto/pontoFixedWidthParser';
import { buscarModelo } from '../../services/ponto/pontoModelosService';
import { buscarLayout, salvarLayout } from '../../services/ponto/pontoLayoutsService';
import type {
    ResultadoParsingPonto,
    ModeloPonto,
    LayoutPonto,
    EventoPonto,
} from '../../types/ponto';

const MODELO_ID = 'acjef_p1510_v1';

type WizardStep = 'upload' | 'mapping' | 'review' | 'done';

interface Props {
    currentUser: User;
}

const PontoEditorPanel: React.FC<Props> = ({ currentUser }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [empresaId, setEmpresaId] = useState('');
    const [modelo, setModelo] = useState<ModeloPonto | null>(null);
    const [layout, setLayout] = useState<LayoutPonto | null>(null);
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [resultado, setResultado] = useState<ResultadoParsingPonto | null>(null);
    const [loading, setLoading] = useState(true);
    const [processando, setProcessando] = useState(false);
    const [step, setStep] = useState<WizardStep>('upload');
    const [pisMapping, setPisMapping] = useState<Record<string, string>>({});
    const [editedEvents, setEditedEvents] = useState<EventoPonto[]>([]);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

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

    const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        setArquivo(e.target.files?.[0] || null);
        setResultado(null);
        setStep('upload');
    };

    const handleProcessar = useCallback(async () => {
        const empresa = empresas.find(e => e.id === empresaId);
        if (!arquivo || !modelo || !empresa) return;
        setProcessando(true);
        setErro('');
        try {
            const buf = await arquivo.arrayBuffer();
            const conteudo = decodeBuffer(buf, modelo.encoding ?? 'iso-8859-1');
            const cnpj = ((empresa as any).cnpj || '').replace(/\D/g, '');
            const r = parsearArquivoFixedWidth(conteudo, modelo, layout, {
                nomeArquivo: arquivo.name,
                cnpjEsperado: cnpj,
            });
            setResultado(r);
            setEditedEvents([...r.eventos]);

            const initialMapping: Record<string, string> = {};
            r.pisSemMatricula.forEach(pis => { initialMapping[pis] = ''; });
            setPisMapping(initialMapping);

            setStep(r.pisSemMatricula.length > 0 ? 'mapping' : 'review');
        } catch (e: any) {
            setErro(e?.message || 'Erro ao processar');
        } finally {
            setProcessando(false);
        }
    }, [arquivo, modelo, layout, empresaId, empresas]);

    const handleSalvarMapping = async () => {
        const empresa = empresas.find(e => e.id === empresaId);
        if (!empresa) return;
        setSalvando(true);
        try {
            const cnpj = ((empresa as any).cnpj || '').replace(/\D/g, '');
            const sage = String((empresa as any).codigoSage || (empresa as any).cadastroSAGE || '');
            const validMappings = Object.fromEntries(
                Object.entries(pisMapping).filter(([_, v]) => v.trim())
            );
            if (Object.keys(validMappings).length > 0) {
                const existingPisToMat = layout?.pisToMatricula || {};
                await salvarLayout({
                    ...(layout || {}),
                    cnpj,
                    cadastroSAGE: sage,
                    pisToMatricula: { ...existingPisToMat, ...validMappings },
                } as LayoutPonto);
            }
            setStep('review');
        } catch (e: any) {
            setErro(e?.message || 'Erro ao salvar mapeamento');
        } finally {
            setSalvando(false);
        }
    };

    const handleEditEvent = (idx: number, field: keyof EventoPonto, value: any) => {
        setEditedEvents(evs =>
            evs.map((ev, i) => i === idx ? { ...ev, [field]: value } : ev)
        );
    };

    const handleExportCSV = () => {
        if (editedEvents.length === 0) return;
        const headers = ['pis', 'matricula', 'evento', 'descricao', 'valor', 'unidade', 'rv'];
        const csv = [
            headers.join(','),
            ...editedEvents.map(ev =>
                [ev.pis, ev.matricula || '', ev.evento, `"${ev.descricao}"`, ev.valor.toFixed(2), ev.unidade, ev.rv].join(',')
            )
        ].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ponto_${empresaId}_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setStep('done');
    };

    if (loading) {
        return <div className="py-12 text-center text-slate-500">Carregando...</div>;
    }

    return (
        <div className="space-y-6">
            <header>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                    Editor de Ponto Eletrônico
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Importe arquivo ACJEF, mapeie PIS, revise eventos e exporte para IOB SAGE
                </p>
            </header>

            {/* Step indicator */}
            <div className="flex gap-1">
                {(['upload', 'mapping', 'review', 'done'] as WizardStep[]).map((s, i) => {
                    const labels = ['1. Upload', '2. Mapeamento PIS', '3. Revisão', '4. Exportar'];
                    const isActive = step === s;
                    const isPast = ['upload', 'mapping', 'review', 'done'].indexOf(step) > i;
                    return (
                        <div key={s} className={`flex-1 text-center py-2 text-xs font-medium rounded ${isActive ? 'bg-blue-600 text-white' : isPast ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                            {labels[i]}
                        </div>
                    );
                })}
            </div>

            {erro && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded text-red-700 dark:text-red-300 text-sm">
                    {erro}
                    <button onClick={() => setErro('')} className="ml-2 underline text-xs">fechar</button>
                </div>
            )}

            {/* Step 1: Upload */}
            {step === 'upload' && (
                <div className="space-y-4 p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Empresa</label>
                            <select value={empresaId} onChange={e => setEmpresaId(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-white text-sm">
                                <option value="">Selecione...</option>
                                {empresas.map(e => (
                                    <option key={e.id} value={e.id}>{(e as any).razaoSocial || e.nomeFantasia} — {(e as any).cnpj}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Arquivo ACJEF</label>
                            <input type="file" accept=".txt,.acjef,.dat,.AFD,.afd" onChange={handleFile}
                                className="block w-full text-sm text-slate-600 dark:text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/40 file:text-blue-700 dark:file:text-blue-300" />
                        </div>
                    </div>
                    <button onClick={handleProcessar} disabled={!arquivo || !empresaId || !modelo || processando}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium text-sm">
                        {processando ? 'Processando...' : 'Processar Arquivo'}
                    </button>
                </div>
            )}

            {/* Step 2: PIS Mapping */}
            {step === 'mapping' && resultado && (
                <div className="space-y-4 p-6 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    <h3 className="font-medium text-slate-700 dark:text-slate-200">
                        Mapeamento PIS → Matrícula SAGE ({Object.keys(pisMapping).length} PIS sem matrícula)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Informe a matrícula SAGE correspondente a cada PIS. Deixe em branco para ignorar.
                    </p>
                    <div className="max-h-96 overflow-y-auto space-y-2">
                        {Object.entries(pisMapping).map(([pis, mat]) => (
                            <div key={pis} className="flex items-center gap-3">
                                <span className="font-mono text-xs text-slate-600 dark:text-slate-400 w-32">{pis}</span>
                                <input
                                    type="text"
                                    value={mat}
                                    onChange={e => setPisMapping(prev => ({ ...prev, [pis]: e.target.value }))}
                                    placeholder="Matrícula SAGE"
                                    className="flex-1 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleSalvarMapping} disabled={salvando}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded font-medium text-sm">
                            {salvando ? 'Salvando...' : 'Salvar e Continuar'}
                        </button>
                        <button onClick={() => setStep('review')}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded font-medium text-sm">
                            Pular
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Review / Edit */}
            {step === 'review' && (
                <div className="space-y-4">
                    {resultado && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Stat label="Total registros" value={resultado.totalRegistros} />
                            <Stat label="Eventos" value={editedEvents.length} />
                            <Stat label="PIS sem matrícula" value={resultado.pisSemMatricula.length} />
                            <Stat label="Avisos" value={resultado.avisos.length} />
                        </div>
                    )}

                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0">
                                <tr>
                                    <th className="text-left p-2">PIS</th>
                                    <th className="text-left p-2">Matrícula</th>
                                    <th className="text-left p-2">Cod. SAGE</th>
                                    <th className="text-left p-2">Descrição</th>
                                    <th className="text-right p-2">Valor</th>
                                    <th className="text-left p-2">Unid.</th>
                                    <th className="text-center p-2">R/V</th>
                                </tr>
                            </thead>
                            <tbody>
                                {editedEvents.slice(0, 200).map((ev, i) => (
                                    <tr key={i} className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        <td className="p-2 font-mono">{ev.pis || '—'}</td>
                                        <td className="p-2">
                                            <input type="text" value={ev.matricula || ''} onChange={e => handleEditEvent(i, 'matricula', e.target.value)}
                                                className="w-16 px-1 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded bg-transparent" />
                                        </td>
                                        <td className="p-2 font-mono">{ev.evento}</td>
                                        <td className="p-2">{ev.descricao}</td>
                                        <td className="p-2 text-right">
                                            <input type="number" step="0.01" value={ev.valor} onChange={e => handleEditEvent(i, 'valor', parseFloat(e.target.value) || 0)}
                                                className="w-20 px-1 py-0.5 text-xs border border-slate-200 dark:border-slate-600 rounded bg-transparent text-right" />
                                        </td>
                                        <td className="p-2 text-slate-500">{ev.unidade}</td>
                                        <td className="p-2 text-center">{ev.rv}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {editedEvents.length > 200 && (
                            <div className="p-2 text-xs text-slate-500 text-center">
                                Mostrando 200 de {editedEvents.length} eventos
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button onClick={handleExportCSV}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-sm">
                            Exportar CSV
                        </button>
                        <button onClick={() => setStep('upload')}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded font-medium text-sm">
                            Recomeçar
                        </button>
                    </div>
                </div>
            )}

            {/* Step 4: Done */}
            {step === 'done' && (
                <div className="p-8 text-center bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                    <div className="text-4xl mb-3">CSV exportado com sucesso!</div>
                    <p className="text-sm text-green-700 dark:text-green-300 mb-4">
                        {editedEvents.length} eventos exportados. Importe o arquivo no IOB SAGE.
                    </p>
                    <button onClick={() => { setStep('upload'); setArquivo(null); setResultado(null); }}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-sm">
                        Processar outro arquivo
                    </button>
                </div>
            )}
        </div>
    );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
    <div className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-center">
        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</div>
    </div>
);

export default PontoEditorPanel;
