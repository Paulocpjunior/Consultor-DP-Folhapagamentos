import React, { useEffect, useState } from 'react';
import { listarFgts, criarFgts, atualizarFgts } from '../../services/esocial/esocialService';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import type { FgtsDigitalRegistro, FgtsStatus } from '../../services/esocial/esocialTypes';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { consultarFgtsRecolhimento, consultarCrfFgts } from '../../services/serpro/serproIntegrationService';

const FGTS_STATUS_BADGE: Record<FgtsStatus, { label: string; cls: string }> = {
    em_dia:   { label: 'Em dia',   cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
    atrasado: { label: 'Atrasado', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
    parcial:  { label: 'Parcial',  cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
};

const ESocialFgts: React.FC = () => {
    const [registros, setRegistros] = useState<FgtsDigitalRegistro[]>([]);
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filtroEmpresa, setFiltroEmpresa] = useState('');
    const [showSubmissao, setShowSubmissao] = useState(false);

    // SERPRO query state
    const [serproEmpresaId, setSerproEmpresaId] = useState('');
    const [serproCompetencia, setSerproCompetencia] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [serproLoading, setSerproLoading] = useState(false);
    const [serproResult, setSerproResult] = useState<any>(null);
    const [serproError, setSerproError] = useState<string | null>(null);

    // Form
    const [fEmpresaId, setFEmpresaId] = useState('');
    const [fCompetencia, setFCompetencia] = useState('');
    const [fNome, setFNome] = useState('');
    const [fCpf, setFCpf] = useState('');
    const [fDevido, setFDevido] = useState('');
    const [fRecolhido, setFRecolhido] = useState('');
    const [fVencimento, setFVencimento] = useState('');

    const reload = async () => {
        setLoading(true);
        try {
            const [r, e] = await Promise.all([listarFgts(), listarTodasEmpresas()]);
            setRegistros(r);
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
        const devido = parseFloat(fDevido) || 0;
        const recolhido = parseFloat(fRecolhido) || 0;
        let status: FgtsStatus = 'em_dia';
        if (recolhido === 0 && devido > 0) status = 'atrasado';
        else if (recolhido < devido) status = 'parcial';

        await criarFgts({
            empresaId: fEmpresaId,
            competencia: fCompetencia,
            funcionarioNome: fNome,
            funcionarioCpf: fCpf,
            valorDevido: devido,
            valorRecolhido: recolhido,
            status,
            dataVencimento: fVencimento,
        });
        setShowForm(false);
        setFEmpresaId(''); setFCompetencia(''); setFNome(''); setFCpf('');
        setFDevido(''); setFRecolhido(''); setFVencimento('');
        reload();
    };

    const handleMarcarRecolhido = async (id: string, valorDevido: number) => {
        await atualizarFgts(id, {
            valorRecolhido: valorDevido,
            status: 'em_dia',
            dataRecolhimento: new Date().toISOString().split('T')[0],
        });
        reload();
    };

    const handleConsultarSerpro = async () => {
        if (!serproEmpresaId) {
            setSerproError('Selecione uma empresa');
            return;
        }
        const empresa = empresas.find(e => e.id === serproEmpresaId);
        if (!empresa?.cnpj) {
            setSerproError('Empresa sem CNPJ cadastrado');
            return;
        }
        setSerproLoading(true);
        setSerproError(null);
        setSerproResult(null);
        try {
            const cnpj = empresa.cnpj.replace(/\D/g, '');
            const [recolhimento, crf] = await Promise.all([
                consultarFgtsRecolhimento(cnpj, serproCompetencia),
                consultarCrfFgts(cnpj),
            ]);
            setSerproResult({ empresa, recolhimento, crf });
        } catch (err: any) {
            setSerproError(err?.message || 'Erro ao consultar SERPRO');
        } finally {
            setSerproLoading(false);
        }
    };

    const handleImportarSerpro = async () => {
        if (!serproResult?.recolhimento?.ok || !serproEmpresaId) return;
        const r = serproResult.recolhimento;
        const devido = r.depositoDevido || 0;
        const recolhido = r.depositoRealizado || 0;
        let status: FgtsStatus = 'em_dia';
        if (recolhido === 0 && devido > 0) status = 'atrasado';
        else if (recolhido < devido) status = 'parcial';

        await criarFgts({
            empresaId: serproEmpresaId,
            competencia: serproCompetencia,
            funcionarioNome: 'TOTAL EMPRESA (SERPRO)',
            funcionarioCpf: '',
            valorDevido: devido,
            valorRecolhido: recolhido,
            status,
            dataVencimento: serproCompetencia + '-20',
        });
        setSerproResult(null);
        setSerproEmpresaId('');
        reload();
    };

    const filtrados = filtroEmpresa
        ? registros.filter(r => r.empresaId === filtroEmpresa)
        : registros;

    const totalDevido = filtrados.reduce((a, r) => a + r.valorDevido, 0);
    const totalRecolhido = filtrados.reduce((a, r) => a + r.valorRecolhido, 0);
    const totalPendente = totalDevido - totalRecolhido;
    const atrasados = filtrados.filter(r => r.status === 'atrasado');
    const parciais = filtrados.filter(r => r.status === 'parcial');

    const getEmpresaNome = (id: string) => empresas.find(e => e.id === id)?.nomeFantasia || id;
    const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    // Group by empresa for summary
    const empresaResume = new Map<string, { devido: number; recolhido: number; atrasados: number }>();
    filtrados.forEach(r => {
        const curr = empresaResume.get(r.empresaId) || { devido: 0, recolhido: 0, atrasados: 0 };
        curr.devido += r.valorDevido;
        curr.recolhido += r.valorRecolhido;
        if (r.status === 'atrasado') curr.atrasados++;
        empresaResume.set(r.empresaId, curr);
    });

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Resumo financeiro */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Devido</div>
                    <div className="text-lg font-bold text-slate-800 dark:text-white">{fmt(totalDevido)}</div>
                </div>
                <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
                    <div className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide">Total Recolhido</div>
                    <div className="text-lg font-bold text-green-700 dark:text-green-300">{fmt(totalRecolhido)}</div>
                </div>
                <div className={`p-3 rounded-lg border ${totalPendente > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700' : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'}`}>
                    <div className={`text-xs uppercase tracking-wide ${totalPendente > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>Saldo Pendente</div>
                    <div className={`text-lg font-bold ${totalPendente > 0 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{fmt(totalPendente)}</div>
                </div>
                <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
                    <div className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide">Guias em Atraso</div>
                    <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{atrasados.length + parciais.length}</div>
                </div>
            </div>

            {/* Resumo por empresa */}
            {empresaResume.size > 1 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="py-1.5 px-2 text-left font-medium text-slate-500">Empresa</th>
                                <th className="py-1.5 px-2 text-right font-medium text-slate-500">Devido</th>
                                <th className="py-1.5 px-2 text-right font-medium text-slate-500">Recolhido</th>
                                <th className="py-1.5 px-2 text-right font-medium text-slate-500">Pendente</th>
                                <th className="py-1.5 px-2 text-center font-medium text-slate-500">Atrasos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(empresaResume.entries()).map(([empId, data]) => (
                                <tr key={empId} className="border-b border-slate-100 dark:border-slate-800">
                                    <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300">{getEmpresaNome(empId)}</td>
                                    <td className="py-1.5 px-2 text-right font-mono">{fmt(data.devido)}</td>
                                    <td className="py-1.5 px-2 text-right font-mono text-green-600">{fmt(data.recolhido)}</td>
                                    <td className="py-1.5 px-2 text-right font-mono text-red-600">{fmt(data.devido - data.recolhido)}</td>
                                    <td className="py-1.5 px-2 text-center">{data.atrasados > 0 ? <span className="text-red-600 font-bold">{data.atrasados}</span> : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setShowForm(!showForm)}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                    + Novo Registro FGTS
                </button>
                <button onClick={() => setShowSubmissao(!showSubmissao)}
                    className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium">
                    Consultar FGTS via SERPRO (real)
                </button>
                <select value={filtroEmpresa} onChange={e => setFiltroEmpresa(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                    <option value="">Todas as empresas</option>
                    {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nomeFantasia}</option>)}
                </select>
            </div>

            {/* Consulta FGTS via SERPRO Integra Contador (dados reais) */}
            {showSubmissao && (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="font-medium text-emerald-700 dark:text-emerald-300 text-sm">
                            Consulta FGTS via SERPRO Integra Contador
                        </h3>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">
                            Dados Reais
                        </span>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">
                        Consulta direta no SERPRO: depósitos devidos vs realizados (CONSULTARRECOLHIMENTO)
                        + Certificado de Regularidade (CRF FGTS). Requer empresa com procuração eletrônica vigente.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Empresa</label>
                            <select
                                value={serproEmpresaId}
                                onChange={e => setSerproEmpresaId(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                            >
                                <option value="">Selecione...</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nomeFantasia} ({emp.cnpj})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Competência</label>
                            <input
                                type="month"
                                value={serproCompetencia}
                                onChange={e => setSerproCompetencia(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200"
                            />
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={handleConsultarSerpro}
                                disabled={serproLoading || !serproEmpresaId}
                                className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium"
                            >
                                {serproLoading ? 'Consultando...' : 'Consultar SERPRO'}
                            </button>
                        </div>
                    </div>

                    {serproError && (
                        <div className="text-xs p-2 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                            {serproError}
                        </div>
                    )}

                    {serproResult && (
                        <div className="space-y-2 mt-3">
                            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                Resultado para {serproResult.empresa?.nomeFantasia}
                            </div>

                            {/* Recolhimento */}
                            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Recolhimento FGTS {serproCompetencia}</div>
                                {serproResult.recolhimento.ok ? (
                                    <div className="grid grid-cols-3 gap-2 text-xs">
                                        <div>
                                            <div className="text-slate-500">Devido</div>
                                            <div className="font-mono font-bold">{fmt(serproResult.recolhimento.depositoDevido)}</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-500">Recolhido</div>
                                            <div className="font-mono font-bold text-green-600">{fmt(serproResult.recolhimento.depositoRealizado)}</div>
                                        </div>
                                        <div>
                                            <div className="text-slate-500">Situação</div>
                                            <div className={`font-bold ${serproResult.recolhimento.regular ? 'text-green-600' : 'text-red-600'}`}>
                                                {serproResult.recolhimento.regular ? 'Regular' : 'Pendente'}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-red-600">Erro: {serproResult.recolhimento.erro || 'Indisponível'}</div>
                                )}
                            </div>

                            {/* CRF */}
                            <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">CRF (Certificado de Regularidade FGTS)</div>
                                <div className="flex items-center gap-3 text-xs">
                                    <span className={`px-2 py-0.5 rounded-full font-bold ${
                                        serproResult.crf.status === 'negativa' ? 'bg-green-100 text-green-800' :
                                        serproResult.crf.status === 'positiva' ? 'bg-red-100 text-red-800' :
                                        'bg-amber-100 text-amber-800'
                                    }`}>
                                        {serproResult.crf.status === 'negativa' ? 'Regular (CRF Negativa)' :
                                         serproResult.crf.status === 'positiva' ? 'Irregular (CRF Positiva)' :
                                         serproResult.crf.status}
                                    </span>
                                    {serproResult.crf.validade && (
                                        <span className="text-slate-500">Válida até: {new Date(serproResult.crf.validade).toLocaleDateString('pt-BR')}</span>
                                    )}
                                </div>
                                {serproResult.crf.motivo && (
                                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">{serproResult.crf.motivo}</div>
                                )}
                            </div>

                            {serproResult.recolhimento.ok && (
                                <button
                                    onClick={handleImportarSerpro}
                                    className="w-full px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium"
                                >
                                    Importar como registro FGTS
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Form */}
            {showForm && (
                <form onSubmit={handleSubmit} className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Empresa *</label>
                            <select value={fEmpresaId} onChange={e => setFEmpresaId(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                <option value="">Selecione...</option>
                                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nomeFantasia}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Competência *</label>
                            <input type="month" value={fCompetencia} onChange={e => setFCompetencia(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Funcionário *</label>
                            <input type="text" value={fNome} onChange={e => setFNome(e.target.value)} required placeholder="Nome completo"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">CPF</label>
                            <input type="text" value={fCpf} onChange={e => setFCpf(e.target.value)} placeholder="000.000.000-00"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Valor Devido (R$) *</label>
                            <input type="number" step="0.01" value={fDevido} onChange={e => setFDevido(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Valor Recolhido (R$)</label>
                            <input type="number" step="0.01" value={fRecolhido} onChange={e => setFRecolhido(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Vencimento *</label>
                            <input type="date" value={fVencimento} onChange={e => setFVencimento(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded font-medium">Salvar</button>
                        <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded font-medium">Cancelar</button>
                    </div>
                </form>
            )}

            {/* Tabela */}
            {filtrados.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <p className="text-sm">Nenhum registro FGTS encontrado.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Empresa</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Competência</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Funcionário</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400 text-right">Devido</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400 text-right">Recolhido</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Status</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Vencimento</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map(r => (
                                <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="py-2 px-2 text-slate-700 dark:text-slate-300">{getEmpresaNome(r.empresaId)}</td>
                                    <td className="py-2 px-2 font-mono text-xs text-slate-600 dark:text-slate-400">{r.competencia}</td>
                                    <td className="py-2 px-2 text-slate-700 dark:text-slate-300">
                                        <div>{r.funcionarioNome}</div>
                                        {r.funcionarioCpf && <div className="text-xs text-slate-400">{r.funcionarioCpf}</div>}
                                    </td>
                                    <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(r.valorDevido)}</td>
                                    <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">{fmt(r.valorRecolhido)}</td>
                                    <td className="py-2 px-2">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${FGTS_STATUS_BADGE[r.status].cls}`}>
                                            {FGTS_STATUS_BADGE[r.status].label}
                                        </span>
                                    </td>
                                    <td className="py-2 px-2 text-xs text-slate-600 dark:text-slate-400">{r.dataVencimento}</td>
                                    <td className="py-2 px-2">
                                        {(r.status === 'atrasado' || r.status === 'parcial') && (
                                            <button
                                                onClick={() => handleMarcarRecolhido(r.id, r.valorDevido)}
                                                className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded"
                                            >
                                                Marcar Recolhido
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

export default ESocialFgts;
