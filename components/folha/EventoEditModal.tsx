// components/folha/EventoEditModal.tsx
// Modal para criar ou editar um evento do catálogo IOB SAGE.

import React, { useEffect, useState } from 'react';
import type { EventoIobSage } from '../../services/folha/folhaTypes';
import type { User } from '../../types';
import {
    criarEvento,
    editarEvento,
    excluirEvento,
    getHistoricoEvento,
    type AuditEntry,
} from '../../services/folha/folhaEventosCrudService';
import type { CatalogoEventos } from '../../services/folha/folhaTypes';

type Modo = 'novo' | 'editar';

interface Props {
    aberto: boolean;
    modo: Modo;
    eventoOriginal: EventoIobSage | null;
    currentUser: User;
    onFechar: () => void;
    onSalvo: (catalogo: CatalogoEventos) => void;
}

const EVENTO_VAZIO: EventoIobSage = {
    codigo: '',
    descricao: '',
    tipo: 'V',
    incidencias: { ir: 'N', in: 'N', irf: 'N', inf: 'N', fg: 'N', rt: 'N', vr: 'N' },
    rv: 'R',
    coeficiente: 1.0,
    ro: '000',
};

const EventoEditModal: React.FC<Props> = ({
    aberto,
    modo,
    eventoOriginal,
    currentUser,
    onFechar,
    onSalvo,
}) => {
    const [form, setForm] = useState<EventoIobSage>(EVENTO_VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [excluindo, setExcluindo] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [historico, setHistorico] = useState<AuditEntry[]>([]);

    const codOriginal = eventoOriginal?.codigo || '';
    const houveRecode = modo === 'editar' && form.codigo.trim().padStart(4, '0') !== codOriginal;

    useEffect(() => {
        if (!aberto) return;
        if (modo === 'editar' && eventoOriginal) {
            setForm({ ...eventoOriginal });
            getHistoricoEvento(eventoOriginal.codigo, 5).then(setHistorico);
        } else {
            setForm(EVENTO_VAZIO);
            setHistorico([]);
        }
        setErro(null);
    }, [aberto, modo, eventoOriginal]);

    if (!aberto) return null;

    const setIncidencia = (k: keyof EventoIobSage['incidencias'], v: 'S' | 'N') => {
        setForm((f) => ({ ...f, incidencias: { ...f.incidencias, [k]: v } }));
    };

    const handleSalvar = async () => {
        setErro(null);
        setSalvando(true);
        try {
            const result =
                modo === 'novo'
                    ? await criarEvento(form, currentUser)
                    : await editarEvento(codOriginal, form, currentUser);
            onSalvo(result.catalogo);
            onFechar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSalvando(false);
        }
    };

    const handleExcluir = async () => {
        if (!eventoOriginal) return;
        if (
            !confirm(
                `Excluir o evento ${eventoOriginal.codigo} — ${eventoOriginal.descricao}? Esta ação ficará registrada no histórico.`
            )
        )
            return;
        setExcluindo(true);
        setErro(null);
        try {
            const novoCatalogo = await excluirEvento(eventoOriginal.codigo, currentUser);
            onSalvo(novoCatalogo);
            onFechar();
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setExcluindo(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto"
            onClick={(e) => e.target === e.currentTarget && onFechar()}
        >
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl w-full max-w-2xl my-8">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">
                        {modo === 'novo' ? 'Novo evento' : `Editar evento ${codOriginal}`}
                    </h3>
                    <button
                        onClick={onFechar}
                        className="text-slate-500 hover:text-slate-800 dark:hover:text-white text-xl leading-none px-2"
                        aria-label="Fechar"
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                    {/* Linha 1: código + tipo + descrição */}
                    <div className="grid grid-cols-12 gap-3">
                        <div className="col-span-3">
                            <Label>Código *</Label>
                            <input
                                type="text"
                                value={form.codigo}
                                maxLength={4}
                                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                                placeholder="0000"
                                className="w-full px-2 py-1.5 text-sm font-mono border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                            />
                        </div>
                        <div className="col-span-3">
                            <Label>Tipo *</Label>
                            <select
                                value={form.tipo}
                                onChange={(e) => setForm({ ...form, tipo: e.target.value as 'V' | 'D' })}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                            >
                                <option value="V">V — Vencimento</option>
                                <option value="D">D — Desconto</option>
                            </select>
                        </div>
                        <div className="col-span-6">
                            <Label>Descrição *</Label>
                            <input
                                type="text"
                                value={form.descricao}
                                maxLength={40}
                                onChange={(e) =>
                                    setForm({ ...form, descricao: e.target.value.toUpperCase() })
                                }
                                placeholder="Ex: SALÁRIO BASE"
                                className="w-full px-2 py-1.5 text-sm uppercase border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                            />
                        </div>
                    </div>

                    {/* Incidências */}
                    <div>
                        <Label>Incidências</Label>
                        <div className="grid grid-cols-7 gap-2">
                            {(['ir', 'in', 'irf', 'inf', 'fg', 'rt', 'vr'] as const).map((k) => (
                                <FlagToggle
                                    key={k}
                                    label={k.toUpperCase()}
                                    valor={form.incidencias[k]}
                                    onChange={(v) => setIncidencia(k, v)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* R/V + Coeficiente + RO */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <Label>R/V</Label>
                            <select
                                value={form.rv}
                                onChange={(e) => setForm({ ...form, rv: e.target.value as 'R' | 'V' })}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                            >
                                <option value="R">R — Referência</option>
                                <option value="V">V — Valor</option>
                            </select>
                        </div>
                        <div>
                            <Label>Coeficiente</Label>
                            <input
                                type="number"
                                step="0.00001"
                                value={form.coeficiente}
                                onChange={(e) =>
                                    setForm({ ...form, coeficiente: parseFloat(e.target.value) || 0 })
                                }
                                className="w-full px-2 py-1.5 text-sm font-mono text-right border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                            />
                        </div>
                        <div>
                            <Label>Rotina (RO)</Label>
                            <input
                                type="text"
                                value={form.ro}
                                maxLength={3}
                                onChange={(e) => setForm({ ...form, ro: e.target.value })}
                                className="w-full px-2 py-1.5 text-sm font-mono border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                            />
                        </div>
                    </div>

                    {/* Alerta de recode */}
                    {houveRecode && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded text-sm text-amber-800 dark:text-amber-300">
                            <strong>Atenção:</strong> você está alterando o <strong>código</strong> de{' '}
                            <code>{codOriginal}</code> para <code>{form.codigo}</code>. Apontamentos e
                            exportações SAGE que referenciam o código antigo precisarão ser revisados manualmente.
                        </div>
                    )}

                    {/* Erro */}
                    {erro && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-300">
                            {erro}
                        </div>
                    )}

                    {/* Histórico (só edição) */}
                    {modo === 'editar' && historico.length > 0 && (
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                            <Label>Últimas alterações</Label>
                            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                {historico.map((h) => {
                                    const ts = h.timestamp?.toDate
                                        ? h.timestamp.toDate().toLocaleString('pt-BR')
                                        : '—';
                                    const acao =
                                        ({ create: 'criou', update: 'editou', delete: 'excluiu', recode: 'recodificou' } as const)[
                                            h.action
                                        ] || h.action;
                                    return (
                                        <li key={h.id}>
                                            <span className="text-slate-500">{ts}</span> —{' '}
                                            <strong className="text-slate-700 dark:text-slate-300">
                                                {h.user?.name || '—'}
                                            </strong>{' '}
                                            {acao}
                                            {h.changes?.length ? ` (${h.changes.join(', ')})` : ''}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700">
                    {modo === 'editar' ? (
                        <button
                            onClick={handleExcluir}
                            disabled={excluindo || salvando}
                            className="px-3 py-1.5 text-sm border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                        >
                            {excluindo ? 'Excluindo…' : 'Excluir'}
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={onFechar}
                            disabled={salvando || excluindo}
                            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSalvar}
                            disabled={salvando || excluindo}
                            className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                        >
                            {salvando ? 'Salvando…' : 'Salvar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="text-xs uppercase text-slate-500 dark:text-slate-400 mb-1 font-semibold">
        {children}
    </div>
);

const FlagToggle: React.FC<{
    label: string;
    valor: 'S' | 'N';
    onChange: (v: 'S' | 'N') => void;
}> = ({ label, valor, onChange }) => (
    <div className="text-center">
        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-semibold">{label}</div>
        <button
            type="button"
            onClick={() => onChange(valor === 'S' ? 'N' : 'S')}
            className={`w-full py-1.5 text-sm font-bold rounded border transition-colors ${
                valor === 'S'
                    ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
            }`}
        >
            {valor}
        </button>
    </div>
);

export default EventoEditModal;
