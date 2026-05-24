import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { listarEventos, criarEvento, atualizarEvento, excluirEvento } from '../../services/esocial/esocialService';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import type { EventoEsocial, EventoTipo, EventoStatus } from '../../services/esocial/esocialTypes';
import { EVENTO_LABELS, STATUS_COLORS } from '../../services/esocial/esocialTypes';
import app from '../../services/firebaseConfig';
import type { Empresa } from '../../services/empresas/empresasTypes';

const STATUS_BADGES: Record<EventoStatus, { label: string; cls: string }> = {
    pendente:    { label: 'Pendente',    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    transmitido: { label: 'Transmitido', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
    rejeitado:   { label: 'Rejeitado',   cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
    processado:  { label: 'Processado',  cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
};

const ESocialEventos: React.FC = () => {
    const [eventos, setEventos] = useState<EventoEsocial[]>([]);
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [filtroStatus, setFiltroStatus] = useState<EventoStatus | 'todos'>('todos');
    const [filtroEmpresa, setFiltroEmpresa] = useState<string>('');

    // Form state
    const [formEmpresaId, setFormEmpresaId] = useState('');
    const [formTipo, setFormTipo] = useState<EventoTipo>('S-1200');
    const [formCompetencia, setFormCompetencia] = useState('');
    const [formFuncionario, setFormFuncionario] = useState('');
    const [formCpf, setFormCpf] = useState('');

    const reload = async () => {
        setLoading(true);
        try {
            const [ev, emp] = await Promise.all([listarEventos(), listarTodasEmpresas()]);
            setEventos(ev);
            setEmpresas(emp);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formEmpresaId || !formCompetencia) return;
        await criarEvento({
            empresaId: formEmpresaId,
            tipo: formTipo,
            descricao: EVENTO_LABELS[formTipo],
            competencia: formCompetencia,
            status: 'pendente',
            funcionarioNome: formFuncionario || undefined,
            funcionarioCpf: formCpf || undefined,
        });
        setShowForm(false);
        setFormEmpresaId('');
        setFormCompetencia('');
        setFormFuncionario('');
        setFormCpf('');
        reload();
    };

    const handleStatusChange = async (id: string, novoStatus: EventoStatus) => {
        await atualizarEvento(id, {
            status: novoStatus,
            ...(novoStatus === 'transmitido' ? { dataEnvio: new Date().toISOString() } : {}),
            ...(novoStatus === 'processado' ? { dataProcessamento: new Date().toISOString() } : {}),
        });
        reload();
    };

    const handleExcluir = async (id: string) => {
        if (!confirm('Excluir este evento?')) return;
        await excluirEvento(id);
        reload();
    };

    const [transmitindo, setTransmitindo] = useState<string | null>(null);
    const [msgTransmissao, setMsgTransmissao] = useState('');

    const handleTransmitir = async (id: string) => {
        if (!app) return;
        if (!confirm('Transmitir este evento ao eSocial (produção)?')) return;
        setTransmitindo(id);
        setMsgTransmissao('');
        try {
            const functions = getFunctions(app, 'southamerica-east1');
            const transmitir = httpsCallable(functions, 'transmitirEvento');
            const result: any = await transmitir({ eventoId: id });
            setMsgTransmissao(result.data?.sucesso
                ? `Transmitido! Protocolo: ${result.data.protocolo || 'N/A'}`
                : `Rejeitado: ${result.data.mensagem || 'Erro'}`);
            reload();
        } catch (e: any) {
            setMsgTransmissao(`Erro: ${e?.message || 'Falha na transmissão'}`);
        } finally {
            setTransmitindo(null);
        }
    };

    const eventosFiltrados = eventos.filter(e => {
        if (filtroStatus !== 'todos' && e.status !== filtroStatus) return false;
        if (filtroEmpresa && e.empresaId !== filtroEmpresa) return false;
        return true;
    });

    const getEmpresaNome = (id: string) => empresas.find(e => e.id === id)?.nomeFantasia || id;

    const pendentes = eventosFiltrados.filter(e => e.status === 'pendente');

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                    + Novo Evento
                </button>

                <select
                    value={filtroStatus}
                    onChange={e => setFiltroStatus(e.target.value as any)}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                    <option value="todos">Todos os status</option>
                    <option value="pendente">Pendentes</option>
                    <option value="transmitido">Transmitidos</option>
                    <option value="rejeitado">Rejeitados</option>
                    <option value="processado">Processados</option>
                </select>

                <select
                    value={filtroEmpresa}
                    onChange={e => setFiltroEmpresa(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                    <option value="">Todas as empresas</option>
                    {empresas.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nomeFantasia}</option>
                    ))}
                </select>

                <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
                    {eventosFiltrados.length} evento(s)
                </span>
            </div>

            {/* Mensagem de transmissão */}
            {msgTransmissao && (
                <div className={`p-3 rounded-lg text-sm ${msgTransmissao.startsWith('Transmitido') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'}`}>
                    {msgTransmissao}
                    <button onClick={() => setMsgTransmissao('')} className="ml-2 underline text-xs">fechar</button>
                </div>
            )}

            {/* Form de novo evento */}
            {showForm && (
                <form onSubmit={handleSubmit} className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Empresa *</label>
                            <select value={formEmpresaId} onChange={e => setFormEmpresaId(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                <option value="">Selecione...</option>
                                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nomeFantasia}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tipo de Evento *</label>
                            <select value={formTipo} onChange={e => setFormTipo(e.target.value as EventoTipo)}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                {(Object.keys(EVENTO_LABELS) as EventoTipo[]).map(k => (
                                    <option key={k} value={k}>{k} - {EVENTO_LABELS[k]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Competência *</label>
                            <input type="month" value={formCompetencia} onChange={e => setFormCompetencia(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Funcionário</label>
                            <input type="text" value={formFuncionario} onChange={e => setFormFuncionario(e.target.value)} placeholder="Nome do funcionário"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">CPF</label>
                            <input type="text" value={formCpf} onChange={e => setFormCpf(e.target.value)} placeholder="000.000.000-00"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded font-medium">Salvar</button>
                        <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded font-medium">Cancelar</button>
                    </div>
                </form>
            )}

            {/* Lista de eventos */}
            {eventosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <p className="text-sm">Nenhum evento encontrado.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Tipo</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Empresa</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Competência</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Funcionário</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Status</th>
                                <th className="py-2 px-2 font-medium text-slate-600 dark:text-slate-400">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {eventosFiltrados.map(ev => (
                                <tr key={ev.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="py-2 px-2">
                                        <span className="font-mono text-xs bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{ev.tipo}</span>
                                    </td>
                                    <td className="py-2 px-2 text-slate-700 dark:text-slate-300">{getEmpresaNome(ev.empresaId)}</td>
                                    <td className="py-2 px-2 font-mono text-xs text-slate-600 dark:text-slate-400">{ev.competencia}</td>
                                    <td className="py-2 px-2 text-slate-600 dark:text-slate-400">{ev.funcionarioNome || '—'}</td>
                                    <td className="py-2 px-2">
                                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[ev.status].cls}`}>
                                            {STATUS_BADGES[ev.status].label}
                                        </span>
                                    </td>
                                    <td className="py-2 px-2">
                                        <div className="flex gap-1">
                                            {ev.status === 'pendente' && (
                                                <button onClick={() => handleTransmitir(ev.id)}
                                                    disabled={transmitindo === ev.id}
                                                    className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded font-medium">
                                                    {transmitindo === ev.id ? '⏳' : '📡'} Transmitir
                                                </button>
                                            )}
                                            {ev.status === 'transmitido' && ev.protocolo && (
                                                <span className="px-1 py-0.5 text-xs text-blue-600 dark:text-blue-400 font-mono" title={ev.protocolo}>
                                                    #{ev.protocolo.slice(-8)}
                                                </span>
                                            )}
                                            <select
                                                value={ev.status}
                                                onChange={e => handleStatusChange(ev.id, e.target.value as EventoStatus)}
                                                className="px-1 py-0.5 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                            >
                                                <option value="pendente">Pendente</option>
                                                <option value="transmitido">Transmitido</option>
                                                <option value="rejeitado">Rejeitado</option>
                                                <option value="processado">Processado</option>
                                            </select>
                                            <button onClick={() => handleExcluir(ev.id)}
                                                className="px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                                                🗑️
                                            </button>
                                        </div>
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

export default ESocialEventos;
