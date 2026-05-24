import React, { useEffect, useState } from 'react';
import { listarTeses, criarTese, atualizarTese } from '../../services/esocial/esocialService';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import type { TeseRecuperacao } from '../../services/esocial/esocialTypes';
import type { Empresa } from '../../services/empresas/empresasTypes';

type TeseTipo = TeseRecuperacao['tipo'];
type TeseStatus = TeseRecuperacao['status'];

const TESE_INFO: Record<TeseTipo, { titulo: string; descricao: string; fundamento: string }> = {
    inss_verbas_indenizatorias: {
        titulo: 'INSS sobre Verbas Indenizatórias',
        descricao: 'Recuperação de INSS incidente sobre terço constitucional de férias e aviso prévio indenizado (Tema 985 STF / REsp 1.230.957 STJ).',
        fundamento: 'RE 1.072.485 (Tema 985 STF) — Terço de férias não tem natureza remuneratória. REsp 1.230.957/RS (Tema 478 STJ) — Aviso prévio indenizado.',
    },
    fgts_verbas_indenizatorias: {
        titulo: 'FGTS sobre Verbas Indenizatórias',
        descricao: 'Restituição de FGTS recolhido sobre verbas de natureza indenizatória que não integram a base de cálculo.',
        fundamento: 'Art. 15 da Lei 8.036/90 — FGTS incide sobre remuneração. Verbas indenizatórias não compõem a base.',
    },
    cpp_plr: {
        titulo: 'Contribuição Patronal sobre PLR',
        descricao: 'Exclusão da contribuição previdenciária patronal sobre valores pagos a título de PLR, quando observados os requisitos da Lei 10.101/2000.',
        fundamento: 'Art. 28, §9º, "j" da Lei 8.212/91 — PLR não integra o salário-de-contribuição. Lei 10.101/2000.',
    },
};

const STATUS_BADGE: Record<TeseStatus, { label: string; cls: string }> = {
    identificada: { label: 'Identificada', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
    em_analise:   { label: 'Em Análise',   cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    aprovada:     { label: 'Aprovada',     cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    recuperada:   { label: 'Recuperada',   cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

const ESocialTeses: React.FC = () => {
    const [teses, setTeses] = useState<TeseRecuperacao[]>([]);
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    // Form
    const [fEmpresaId, setFEmpresaId] = useState('');
    const [fTipo, setFTipo] = useState<TeseTipo>('inss_verbas_indenizatorias');
    const [fValor, setFValor] = useState('');
    const [fPeriodo, setFPeriodo] = useState('');

    const reload = async () => {
        setLoading(true);
        try {
            const [t, e] = await Promise.all([listarTeses(), listarTodasEmpresas()]);
            setTeses(t);
            setEmpresas(e);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const info = TESE_INFO[fTipo];
        await criarTese({
            empresaId: fEmpresaId,
            tipo: fTipo,
            titulo: info.titulo,
            descricao: info.descricao,
            valorEstimado: parseFloat(fValor) || 0,
            periodo: fPeriodo,
            status: 'identificada',
            fundamentoLegal: info.fundamento,
        });
        setShowForm(false);
        setFEmpresaId(''); setFValor(''); setFPeriodo('');
        reload();
    };

    const handleStatusChange = async (id: string, novoStatus: TeseStatus) => {
        await atualizarTese(id, { status: novoStatus });
        reload();
    };

    const getEmpresaNome = (id: string) => empresas.find(e => e.id === id)?.nomeFantasia || id;
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const totalEstimado = teses.reduce((a, t) => a + (t.valorEstimado || 0), 0);
    const totalRecuperado = teses.filter(t => t.status === 'recuperada').reduce((a, t) => a + (t.valorEstimado || 0), 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700">
                    <div className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide">Teses Identificadas</div>
                    <div className="text-lg font-bold text-blue-800 dark:text-blue-200">{teses.length}</div>
                </div>
                <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
                    <div className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide">Potencial Estimado</div>
                    <div className="text-lg font-bold text-amber-800 dark:text-amber-200">{fmt(totalEstimado)}</div>
                </div>
                <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
                    <div className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide">Já Recuperado</div>
                    <div className="text-lg font-bold text-green-800 dark:text-green-200">{fmt(totalRecuperado)}</div>
                </div>
            </div>

            {/* Info sobre teses */}
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
                <h4 className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 mb-2">Teses de Recuperação Tributária Trabalhista</h4>
                <ul className="space-y-1 text-xs text-indigo-700 dark:text-indigo-300">
                    <li><strong>INSS sobre verbas indenizatórias:</strong> Terço de férias (Tema 985 STF) e aviso prévio indenizado.</li>
                    <li><strong>FGTS sobre verbas indenizatórias:</strong> Exclusão de parcelas sem natureza salarial da base do FGTS.</li>
                    <li><strong>CPP sobre PLR:</strong> PLR paga conforme Lei 10.101/2000 não integra salário-de-contribuição.</li>
                </ul>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setShowForm(!showForm)}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                    + Nova Tese
                </button>
            </div>

            {/* Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Empresa *</label>
                            <select value={fEmpresaId} onChange={e => setFEmpresaId(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                <option value="">Selecione...</option>
                                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nomeFantasia}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tipo de Tese *</label>
                            <select value={fTipo} onChange={e => setFTipo(e.target.value as TeseTipo)}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                <option value="inss_verbas_indenizatorias">INSS sobre Verbas Indenizatórias</option>
                                <option value="fgts_verbas_indenizatorias">FGTS sobre Verbas Indenizatórias</option>
                                <option value="cpp_plr">Contribuição Patronal sobre PLR</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Valor Estimado (R$) *</label>
                            <input type="number" step="0.01" value={fValor} onChange={e => setFValor(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Período *</label>
                            <input type="text" value={fPeriodo} onChange={e => setFPeriodo(e.target.value)} required placeholder="Ex: 01/2020 a 12/2024"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded font-medium">Salvar</button>
                        <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded font-medium">Cancelar</button>
                    </div>
                </form>
            )}

            {/* Lista de teses */}
            {teses.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <div className="text-3xl mb-2">⚖️</div>
                    <p className="text-sm">Nenhuma tese de recuperação cadastrada.</p>
                    <p className="text-xs mt-1">Identifique oportunidades de recuperação tributária para suas empresas.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {teses.map(t => (
                        <div key={t.id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="font-medium text-sm text-slate-800 dark:text-white">{t.titulo}</span>
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[t.status].cls}`}>
                                            {STATUS_BADGE[t.status].label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t.descricao}</p>
                                    <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-400">
                                        <span><strong>Empresa:</strong> {getEmpresaNome(t.empresaId)}</span>
                                        <span><strong>Período:</strong> {t.periodo}</span>
                                        <span><strong>Valor:</strong> {fmt(t.valorEstimado)}</span>
                                    </div>
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 italic">{t.fundamentoLegal}</p>
                                </div>
                                <select
                                    value={t.status}
                                    onChange={e => handleStatusChange(t.id, e.target.value as TeseStatus)}
                                    className="px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0"
                                >
                                    <option value="identificada">Identificada</option>
                                    <option value="em_analise">Em Análise</option>
                                    <option value="aprovada">Aprovada</option>
                                    <option value="recuperada">Recuperada</option>
                                </select>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ESocialTeses;
