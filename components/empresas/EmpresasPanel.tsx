import React, { useEffect, useState } from 'react';
import { listarMinhasEmpresas, listarTodasEmpresas, excluirEmpresa } from '../../services/empresas/empresasService';
import { formatCnpj } from '../../services/brasilApiService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { User } from '../../types';
import EmpresaForm from './EmpresaForm';

interface Props { currentUser: User; }

const EmpresasPanel: React.FC<Props> = ({ currentUser }) => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading]   = useState(true);
    const [erro, setErro]         = useState('');
    const [showForm, setShowForm] = useState(false);
    const [verTodas, setVerTodas] = useState(false);

    const isAdmin = currentUser.role === 'admin';

    const reload = async () => {
        setLoading(true); setErro('');
        try {
            const list = isAdmin && verTodas
                ? await listarTodasEmpresas()
                : await listarMinhasEmpresas((currentUser as any).uid);
            setEmpresas(list);
        } catch (e: any) {
            setErro(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); }, [verTodas]);

    const apagar = async (id: string, nome: string) => {
        if (!confirm(`Excluir a empresa "${nome}"?\nIsso não pode ser desfeito.`)) return;
        await excluirEmpresa(id);
        reload();
    };

    return (
        <div>
            <header className="mb-4 flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">🏢 Empresas</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {empresas.length} empresa(s) {verTodas ? '(visão admin)' : '(suas)'}
                    </p>
                </div>
                <div className="flex gap-2">
                    {isAdmin && (
                        <label className="text-sm flex items-center gap-1 text-slate-600 dark:text-slate-300">
                            <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} />
                            Ver de todos
                        </label>
                    )}
                    <button onClick={reload}
                        className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                        ↻ Atualizar
                    </button>
                    {!showForm && (
                        <button onClick={() => setShowForm(true)}
                            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded font-medium">
                            + Nova empresa
                        </button>
                    )}
                </div>
            </header>

            {erro && <div className="mb-3 p-2 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded">{erro}</div>}

            {showForm && (
                <div className="mb-4">
                    <EmpresaForm
                        currentUser={currentUser}
                        onCriado={() => { setShowForm(false); reload(); }}
                        onCancelar={() => setShowForm(false)}
                    />
                </div>
            )}

            {loading ? (
                <div className="py-8 text-center text-slate-500">Carregando empresas…</div>
            ) : empresas.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                    Nenhuma empresa cadastrada. Clique em "+ Nova empresa" para começar.
                </div>
            ) : (
                <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-800">
                            <tr className="text-left">
                                <th className="px-3 py-2">Nome fantasia</th>
                                <th className="px-3 py-2">Razão social</th>
                                <th className="px-3 py-2">CNPJ</th>
                                <th className="px-3 py-2 text-center">SAGE</th>
                                <th className="px-3 py-2 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {empresas.map((e) => (
                                <tr key={e.id} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{e.nomeFantasia}</td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{e.razaoSocial}</td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-mono text-xs">{formatCnpj(e.cnpj)}</td>
                                    <td className="px-3 py-2 text-center"><code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">{e.codigoSage}</code></td>
                                    <td className="px-3 py-2 text-right">
                                        <button onClick={() => apagar(e.id, e.nomeFantasia)}
                                            className="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-300 rounded">
                                            🗑 Excluir
                                        </button>
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

export default EmpresasPanel;
