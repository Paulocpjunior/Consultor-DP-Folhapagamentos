import React, { useEffect, useState } from 'react';
import * as authService from '../../services/auth/authService';
import type { User } from '../../types';

interface Props { currentUser: User; }

const AdminUsersPanel: React.FC<Props> = ({ currentUser }) => {
    const [users, setUsers] = useState<authService.UserDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');

    const reload = async () => {
        setLoading(true); setErro('');
        try {
            const list = await authService.listUsers();
            setUsers(list);
        } catch (e: any) {
            setErro(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { reload(); }, []);

    const aprovar = async (uid: string, role: authService.AuthRole) => {
        if (!confirm(`Aprovar usuário como ${role}?`)) return;
        await authService.approveUser(uid, currentUser.email, role);
        reload();
    };
    const trocarRole = async (uid: string, role: authService.AuthRole) => {
        if (!confirm(`Mudar para ${role}?`)) return;
        await authService.setRole(uid, role);
        reload();
    };

    if (loading) return <div className="py-8 text-center text-slate-500">Carregando usuários…</div>;

    return (
        <div>
            <header className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">👥 Gerenciar usuários</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{users.length} usuário(s) cadastrado(s)</p>
                </div>
                <button onClick={reload} className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">↻ Atualizar</button>
            </header>

            {erro && <div className="mb-3 p-2 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded">{erro}</div>}

            <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr className="text-left">
                            <th className="px-3 py-2">Nome</th>
                            <th className="px-3 py-2">E-mail</th>
                            <th className="px-3 py-2">Papel</th>
                            <th className="px-3 py-2 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => {
                            const isMe = u.uid === (currentUser as any).uid;
                            const badge = u.role === 'admin'
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                                : u.role === 'pendente'
                                ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200'
                                : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200';
                            return (
                                <tr key={u.uid} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{u.name} {isMe && <span className="text-xs text-blue-500">(você)</span>}</td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{u.email}</td>
                                    <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-medium rounded ${badge}`}>{u.role}</span></td>
                                    <td className="px-3 py-2 text-right space-x-1">
                                        {isMe ? (
                                            <span className="text-xs text-slate-400">—</span>
                                        ) : u.role === 'pendente' ? (
                                            <>
                                                <button onClick={() => aprovar(u.uid, 'colaborador')} className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded">Aprovar</button>
                                                <button onClick={() => aprovar(u.uid, 'admin')} className="px-2 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded">Aprovar como admin</button>
                                            </>
                                        ) : u.role === 'colaborador' ? (
                                            <button onClick={() => trocarRole(u.uid, 'admin')} className="px-2 py-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded">Promover a admin</button>
                                        ) : (
                                            <button onClick={() => trocarRole(u.uid, 'colaborador')} className="px-2 py-1 text-xs bg-slate-500 hover:bg-slate-600 text-white rounded">Rebaixar</button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminUsersPanel;
