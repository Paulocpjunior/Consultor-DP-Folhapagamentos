import React, { useEffect, useState, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { listarEventosPaginado, criarEvento, atualizarEvento, excluirEvento, registrarAudit } from '../../services/esocial/esocialService';
import type { PaginatedResult } from '../../services/esocial/esocialService';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import type { EventoEsocial, EventoTipo, EventoStatus } from '../../services/esocial/esocialTypes';
import { EVENTO_LABELS } from '../../services/esocial/esocialTypes';
import app from '../../services/firebaseConfig';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import type { User } from '../../types';
import { validarCPF, formatarCPF } from '../../utils/validacoes';

interface Props {
    currentUser?: User;
}

const STATUS_BADGES: Record<EventoStatus, { label: string; cls: string }> = {
    pendente:    { label: 'Pendente',    cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
    transmitido: { label: 'Transmitido', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
    rejeitado:   { label: 'Rejeitado',   cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
    processado:  { label: 'Processado',  cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
};

const ESocialEventos: React.FC<Props> = ({ currentUser }) => {
    const auditUser = { email: currentUser?.email || '', uid: (currentUser as any)?.uid || '' };
    const [page, setPage] = useState<PaginatedResult<EventoEsocial> | null>(null);
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showRetifForm, setShowRetifForm] = useState(false);
    const [filtroStatus, setFiltroStatus] = useState<EventoStatus | 'todos'>('todos');
    const [filtroEmpresa, setFiltroEmpresa] = useState<string>('');
    const [cursorStack, setCursorStack] = useState<(QueryDocumentSnapshot | null)[]>([null]);
    const [currentPage, setCurrentPage] = useState(0);

    // Form state
    const [formEmpresaId, setFormEmpresaId] = useState('');
    const [formTipo, setFormTipo] = useState<EventoTipo>('S-1200');
    const [formCompetencia, setFormCompetencia] = useState('');
    const [formFuncionario, setFormFuncionario] = useState('');
    const [formCpf, setFormCpf] = useState('');

    // Retificação form
    const [retifEventoOriginalId, setRetifEventoOriginalId] = useState('');
    const [retifNrRecibo, setRetifNrRecibo] = useState('');

    const loadPage = useCallback(async (cursor?: QueryDocumentSnapshot | null) => {
        setLoading(true);
        try {
            const [result, emp] = await Promise.all([
                listarEventosPaginado(
                    filtroEmpresa || undefined,
                    filtroStatus,
                    cursor,
                ),
                empresas.length > 0 ? Promise.resolve(empresas) : listarTodasEmpresas(),
            ]);
            setPage(result);
            if (empresas.length === 0) setEmpresas(emp);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [filtroStatus, filtroEmpresa, empresas]);

    useEffect(() => {
        setCursorStack([null]);
        setCurrentPage(0);
        loadPage(null);
    }, [filtroStatus, filtroEmpresa]);

    const goNextPage = () => {
        if (!page?.hasMore || !page.lastDoc) return;
        const newStack = [...cursorStack, page.lastDoc];
        setCursorStack(newStack);
        setCurrentPage(currentPage + 1);
        loadPage(page.lastDoc);
    };

    const goPrevPage = () => {
        if (currentPage <= 0) return;
        const newStack = cursorStack.slice(0, -1);
        setCursorStack(newStack);
        const newPage = currentPage - 1;
        setCurrentPage(newPage);
        loadPage(newStack[newPage] || null);
    };

    const reload = () => loadPage(cursorStack[currentPage] || null);

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
        registrarAudit({ acao: 'criar_evento', ...auditUser, usuarioEmail: auditUser.email, usuarioUid: auditUser.uid, empresaId: formEmpresaId, eventoTipo: formTipo, detalhes: `${formTipo} ${formCompetencia}`, sucesso: true });
        setShowForm(false);
        setFormEmpresaId(''); setFormCompetencia(''); setFormFuncionario(''); setFormCpf('');
        reload();
    };

    const handleRetifSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!retifEventoOriginalId || !retifNrRecibo) return;
        const original = page?.items.find(ev => ev.id === retifEventoOriginalId);
        if (!original) return;
        await criarEvento({
            empresaId: original.empresaId,
            tipo: original.tipo,
            descricao: `${EVENTO_LABELS[original.tipo]} (Retificação)`,
            competencia: original.competencia,
            status: 'pendente',
            funcionarioNome: original.funcionarioNome,
            funcionarioCpf: original.funcionarioCpf,
            indRetif: '2',
            nrReciboRetificado: retifNrRecibo,
        } as any);
        setShowRetifForm(false);
        setRetifEventoOriginalId(''); setRetifNrRecibo('');
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
        registrarAudit({ acao: 'excluir_evento', ...auditUser, usuarioEmail: auditUser.email, usuarioUid: auditUser.uid, eventoId: id, detalhes: 'Evento excluído', sucesso: true });
        reload();
    };

    const [transmitindo, setTransmitindo] = useState<string | null>(null);
    const [msgTransmissao, setMsgTransmissao] = useState('');
    const [showMultiEmpresa, setShowMultiEmpresa] = useState(false);
    const [empresasSelecionadas, setEmpresasSelecionadas] = useState<string[]>([]);
    const [resumoMulti, setResumoMulti] = useState<any[] | null>(null);

    const handleTransmitir = async (id: string) => {
        if (!app) return;
        if (!confirm('Transmitir este evento ao eSocial?')) return;
        setTransmitindo(id);
        setMsgTransmissao('');
        try {
            const functions = getFunctions(app, 'southamerica-east1');
            const transmitir = httpsCallable(functions, 'transmitirEvento');
            const result: any = await transmitir({ eventoId: id });
            const sucesso = !!result.data?.sucesso;
            setMsgTransmissao(sucesso
                ? `Transmitido! Protocolo: ${result.data.protocolo || 'N/A'}`
                : `Rejeitado: ${result.data.mensagem || 'Erro'}`);
            registrarAudit({ acao: 'transmitir_evento', ...auditUser, usuarioEmail: auditUser.email, usuarioUid: auditUser.uid, eventoId: id, detalhes: result.data?.mensagem || (sucesso ? 'OK' : 'Erro'), sucesso });
            reload();
        } catch (e: any) {
            setMsgTransmissao(`Erro: ${e?.message || 'Falha na transmissão'}`);
            registrarAudit({ acao: 'transmitir_evento', ...auditUser, usuarioEmail: auditUser.email, usuarioUid: auditUser.uid, eventoId: id, detalhes: e?.message || 'Erro', sucesso: false });
        } finally {
            setTransmitindo(null);
        }
    };

    const handleTransmitirMultiEmpresa = async () => {
        if (!app || empresasSelecionadas.length === 0) return;
        if (!confirm(`Transmitir pendentes de ${empresasSelecionadas.length} empresa(s)?`)) return;
        setTransmitindo('multi');
        setMsgTransmissao('');
        setResumoMulti(null);
        try {
            const functions = getFunctions(app, 'southamerica-east1');
            const fn = httpsCallable(functions, 'transmitirMultiEmpresa');
            const result: any = await fn({ empresasIds: empresasSelecionadas });
            const resumo = result.data?.resumo || [];
            setResumoMulti(resumo);
            const totalOk = resumo.reduce((a: number, r: any) => a + (r.sucesso || 0), 0);
            const totalFail = resumo.reduce((a: number, r: any) => a + (r.falha || 0), 0);
            const msg = `Multi-empresa: ${totalOk} transmitido(s), ${totalFail} rejeitado(s) em ${resumo.length} empresa(s)`;
            setMsgTransmissao(msg);
            registrarAudit({ acao: 'transmitir_multi_empresa', ...auditUser, usuarioEmail: auditUser.email, usuarioUid: auditUser.uid, detalhes: msg, sucesso: totalFail === 0 });
            reload();
        } catch (e: any) {
            setMsgTransmissao(`Erro multi-empresa: ${e?.message || 'Falha'}`);
        } finally {
            setTransmitindo(null);
        }
    };

    const toggleEmpresa = (id: string) => {
        setEmpresasSelecionadas(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const eventos = page?.items || [];
    const pendentes = eventos.filter(e => e.status === 'pendente');
    const processados = eventos.filter(e => e.status === 'processado' && e.protocolo);
    const getEmpresaNome = (id: string) => empresas.find(e => e.id === id)?.nomeFantasia || id;

    if (loading && !page) {
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
                    onClick={() => { setShowForm(!showForm); setShowRetifForm(false); }}
                    className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                    + Novo Evento
                </button>

                <button
                    onClick={() => { setShowRetifForm(!showRetifForm); setShowForm(false); }}
                    className="px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
                >
                    Retificar Evento
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

                <button
                    onClick={() => { setShowMultiEmpresa(!showMultiEmpresa); setShowForm(false); setShowRetifForm(false); }}
                    className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
                >
                    Multi-Empresa
                </button>

                <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
                    {page?.total || 0} evento(s)
                </span>

                {pendentes.length > 0 && (
                    <button
                        onClick={async () => {
                            if (!app) return;
                            if (!confirm(`Transmitir ${pendentes.length} evento(s) pendente(s) ao eSocial?`)) return;
                            setTransmitindo('lote');
                            setMsgTransmissao('');
                            try {
                                const functions = getFunctions(app, 'southamerica-east1');
                                const transmitirLoteFn = httpsCallable(functions, 'transmitirLote');
                                const result: any = await transmitirLoteFn({ eventosIds: pendentes.map(e => e.id) });
                                const r = result.data?.resultados || [];
                                const ok = r.filter((x: any) => x.sucesso).length;
                                const fail = r.filter((x: any) => !x.sucesso).length;
                                setMsgTransmissao(`Lote: ${ok} transmitido(s), ${fail} rejeitado(s)`);
                                reload();
                            } catch (e: any) {
                                setMsgTransmissao(`Erro lote: ${e?.message || 'Falha'}`);
                            } finally {
                                setTransmitindo(null);
                            }
                        }}
                        disabled={transmitindo !== null}
                        className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg font-medium"
                    >
                        {transmitindo === 'lote' ? 'Transmitindo...' : `Transmitir ${pendentes.length} Pendente(s)`}
                    </button>
                )}
            </div>

            {/* Mensagem de transmissão */}
            {msgTransmissao && (
                <div className={`p-3 rounded-lg text-sm ${msgTransmissao.startsWith('Transmitido') || msgTransmissao.startsWith('Lote:') || msgTransmissao.startsWith('Multi-empresa:') ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700'}`}>
                    {msgTransmissao}
                    <button onClick={() => setMsgTransmissao('')} className="ml-2 underline text-xs">fechar</button>
                </div>
            )}

            {/* Form de novo evento */}
            {showForm && (
                <form onSubmit={handleSubmit} className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
                    <h3 className="font-medium text-slate-700 dark:text-slate-200 text-sm">Novo Evento</h3>
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
                            <input type="text" value={formCpf} onChange={e => setFormCpf(formatarCPF(e.target.value))} placeholder="000.000.000-00"
                                className={`w-full px-2 py-1.5 text-sm border rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 ${formCpf && !validarCPF(formCpf) ? 'border-red-400 dark:border-red-600' : 'border-slate-300 dark:border-slate-600'}`} />
                            {formCpf && !validarCPF(formCpf) && (
                                <span className="text-xs text-red-500 mt-0.5 block">CPF inválido</span>
                            )}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded font-medium">Salvar</button>
                        <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded font-medium">Cancelar</button>
                    </div>
                </form>
            )}

            {/* Form de retificação (Item 10) */}
            {showRetifForm && (
                <form onSubmit={handleRetifSubmit} className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg space-y-3">
                    <h3 className="font-medium text-orange-700 dark:text-orange-300 text-sm">Retificar Evento (indRetif=2)</h3>
                    <p className="text-xs text-orange-600 dark:text-orange-400">
                        Selecione um evento já processado e informe o número do recibo para criar uma retificação.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Evento Original *</label>
                            <select value={retifEventoOriginalId} onChange={e => {
                                setRetifEventoOriginalId(e.target.value);
                                const ev = processados.find(x => x.id === e.target.value);
                                if (ev?.protocolo) setRetifNrRecibo(ev.protocolo);
                            }} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                <option value="">Selecione evento processado...</option>
                                {processados.map(ev => (
                                    <option key={ev.id} value={ev.id}>
                                        {ev.tipo} - {getEmpresaNome(ev.empresaId)} - {ev.competencia} {ev.funcionarioNome ? `(${ev.funcionarioNome})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nº Recibo Original *</label>
                            <input type="text" value={retifNrRecibo} onChange={e => setRetifNrRecibo(e.target.value)} required
                                placeholder="Número do recibo do evento original"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button type="submit" className="px-3 py-1.5 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded font-medium">Criar Retificação</button>
                        <button type="button" onClick={() => setShowRetifForm(false)} className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded font-medium">Cancelar</button>
                    </div>
                </form>
            )}

            {/* Painel multi-empresa */}
            {showMultiEmpresa && (
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg space-y-3">
                    <h3 className="font-medium text-purple-700 dark:text-purple-300 text-sm">
                        Transmitir Pendentes — Múltiplas Empresas
                    </h3>
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                        Selecione as empresas cujos eventos pendentes serão transmitidos em lote.
                        Cada empresa usa seu próprio certificado digital.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                        {empresas.map(emp => (
                            <label key={emp.id} className="flex items-center gap-2 p-2 rounded hover:bg-purple-100 dark:hover:bg-purple-900/30 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={empresasSelecionadas.includes(emp.id)}
                                    onChange={() => toggleEmpresa(emp.id)}
                                    className="rounded border-purple-300"
                                />
                                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{emp.nomeFantasia}</span>
                            </label>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setEmpresasSelecionadas(empresas.map(e => e.id))}
                            className="px-2 py-1 text-xs text-purple-600 hover:underline"
                        >
                            Selecionar todas
                        </button>
                        <button
                            onClick={() => setEmpresasSelecionadas([])}
                            className="px-2 py-1 text-xs text-purple-600 hover:underline"
                        >
                            Limpar
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleTransmitirMultiEmpresa}
                            disabled={empresasSelecionadas.length === 0 || transmitindo !== null}
                            className="px-4 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded font-medium"
                        >
                            {transmitindo === 'multi'
                                ? 'Transmitindo...'
                                : `Transmitir ${empresasSelecionadas.length} empresa(s)`}
                        </button>
                        <button onClick={() => setShowMultiEmpresa(false)}
                            className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded font-medium">
                            Fechar
                        </button>
                    </div>
                    {/* Resumo multi-empresa */}
                    {resumoMulti && (
                        <div className="mt-2 border-t border-purple-200 dark:border-purple-700 pt-2">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-left text-purple-600 dark:text-purple-400">
                                        <th className="py-1 px-2">Empresa</th>
                                        <th className="py-1 px-2 text-center">Total</th>
                                        <th className="py-1 px-2 text-center">OK</th>
                                        <th className="py-1 px-2 text-center">Falha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resumoMulti.map((r: any, i: number) => (
                                        <tr key={i} className="border-t border-purple-100 dark:border-purple-800">
                                            <td className="py-1 px-2 text-slate-700 dark:text-slate-300">{r.empresaNome}</td>
                                            <td className="py-1 px-2 text-center">{r.total}</td>
                                            <td className="py-1 px-2 text-center text-green-600">{r.sucesso}</td>
                                            <td className="py-1 px-2 text-center text-red-600">{r.falha}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Lista de eventos */}
            {eventos.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <p className="text-sm">Nenhum evento encontrado.</p>
                </div>
            ) : (
                <>
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
                                {eventos.map(ev => {
                                    const isRetif = (ev as any).indRetif === '2';
                                    return (
                                        <tr key={ev.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                            <td className="py-2 px-2">
                                                <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${isRetif ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' : 'bg-slate-100 dark:bg-slate-700'}`}>
                                                    {ev.tipo}{isRetif ? 'R' : ''}
                                                </span>
                                            </td>
                                            <td className="py-2 px-2 text-slate-700 dark:text-slate-300">{getEmpresaNome(ev.empresaId)}</td>
                                            <td className="py-2 px-2 font-mono text-xs text-slate-600 dark:text-slate-400">{ev.competencia}</td>
                                            <td className="py-2 px-2 text-slate-600 dark:text-slate-400">{ev.funcionarioNome || '—'}</td>
                                            <td className="py-2 px-2">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGES[ev.status].cls}`}>
                                                    {STATUS_BADGES[ev.status].label}
                                                </span>
                                                {ev.erros && ev.erros.length > 0 && (
                                                    <span className="ml-1 text-xs text-red-500" title={ev.erros.join('; ')}>
                                                        ({ev.erros.length} erro(s))
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2 px-2">
                                                <div className="flex gap-1">
                                                    {ev.status === 'pendente' && (
                                                        <button onClick={() => handleTransmitir(ev.id)}
                                                            disabled={transmitindo === ev.id}
                                                            className="px-2 py-0.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded font-medium">
                                                            {transmitindo === ev.id ? '...' : 'Transmitir'}
                                                        </button>
                                                    )}
                                                    {ev.status === 'rejeitado' && (
                                                        <button onClick={async () => {
                                                            await atualizarEvento(ev.id, { status: 'pendente', erros: [] });
                                                            registrarAudit({ acao: 'alterar_status', ...auditUser, usuarioEmail: auditUser.email, usuarioUid: auditUser.uid, eventoId: ev.id, detalhes: 'Re-enfileirado para retransmissão', sucesso: true });
                                                            reload();
                                                        }}
                                                            className="px-2 py-0.5 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded font-medium">
                                                            Retransmitir
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
                                                        Excluir
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Página {currentPage + 1} — {page?.total || 0} evento(s) no total
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={goPrevPage}
                                disabled={currentPage === 0}
                                className="px-3 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                            >
                                Anterior
                            </button>
                            <button
                                onClick={goNextPage}
                                disabled={!page?.hasMore}
                                className="px-3 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                            >
                                Próxima
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ESocialEventos;
