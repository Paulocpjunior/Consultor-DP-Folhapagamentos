import React, { useEffect, useState } from 'react';
import * as authService from '../../services/auth/authService';
import type { User } from '../../types';
import { ROTULO_PAPEL, papelEfetivo, papeisPermitidos, type Papel } from '../../services/auth/papeis';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { lerCarteira, listarCarteiras } from '../../services/carteira/carteiraService';
import { resumoCarteira } from '../../services/carteira/carteira';
import CarteiraModal from './CarteiraModal';
import { VerificarMaster } from './PendingScreen';
import { ehMaster } from '../../services/auth/papeis';

interface Props { currentUser: User; /** Aberto pelo menu do app: o título vem do cabeçalho da página. */ embutido?: boolean }

const AdminUsersPanel: React.FC<Props> = ({ currentUser, embutido = false }) => {
    const [users, setUsers] = useState<authService.UserDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [carteiras, setCarteiras] = useState<Map<string, string[]>>(new Map());
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [minhas, setMinhas] = useState<string[]>([]);
    const [erroCarteira, setErroCarteira] = useState('');
    const [editando, setEditando] = useState<authService.UserDoc | null>(null);
    const meuUid = (currentUser as any).uid ?? currentUser.id;

    const reload = async () => {
        setLoading(true); setErro(''); setErroCarteira('');
        try {
            const list = await authService.listUsers();
            setUsers(list);
        } catch (e: any) {
            setErro(e?.message ?? String(e));
        } finally {
            setLoading(false);
        }
        // Carteiras à parte: uma falha aqui (ex.: regras ainda não publicadas) não esconde os usuários.
        try {
            const [c, e, m] = await Promise.all([listarCarteiras(), listarEmpresasVisiveis(), lerCarteira(meuUid)]);
            setCarteiras(c); setEmpresas(e); setMinhas(m);
        } catch (e: any) {
            setErroCarteira(e?.code === 'permission-denied'
                ? 'Carteiras indisponíveis: as regras do Firestore desta versão ainda não foram publicadas.'
                : (e?.message ?? String(e)));
        }
    };
    useEffect(() => { reload(); }, []);

    const ator = papelEfetivo(currentUser.role);
    // Gestor monta a de qualquer admin/colaborador (gestor já vê tudo); admin, só a de colaboradores.
    const podeCarteira = (u: authService.UserDoc, atual: Papel) => !erroCarteira && u.uid !== meuUid
        && (ator === 'gestor' ? (atual === 'admin' || atual === 'colaborador') : ator === 'admin' && atual === 'colaborador');
    const mudar = async (u: authService.UserDoc, novo: Papel) => {
        const atual = papelEfetivo(u.role);
        if (!confirm(`${u.name}: ${ROTULO_PAPEL[atual]} → ${ROTULO_PAPEL[novo]}?`)) return;
        setErro('');
        try {
            if (atual === 'pendente') await authService.approveUser(u.uid, currentUser.email, novo);
            else await authService.setRole(u.uid, novo);
        } catch (e: any) {
            setErro(e?.code === 'permission-denied' ? 'Sem permissão para esta mudança de papel.' : (e?.message ?? String(e)));
        }
        reload();
    };
    const rotuloBotao = (atual: Papel, novo: Papel) =>
        atual === 'pendente' ? (novo === 'colaborador' ? 'Aprovar' : `Aprovar como ${ROTULO_PAPEL[novo].toLowerCase()}`)
        : novo === 'pendente' ? 'Suspender'
        : `Tornar ${ROTULO_PAPEL[novo].toLowerCase()}`;
    const corBotao: Record<Papel, string> = {
        gestor: 'bg-purple-600 hover:bg-purple-700',
        admin: 'bg-amber-600 hover:bg-amber-700',
        colaborador: 'bg-green-600 hover:bg-green-700',
        pendente: 'bg-slate-500 hover:bg-slate-600',
    };
    const corPapel: Record<Papel, string> = {
        gestor: 'bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-200',
        admin: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200',
        colaborador: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200',
        pendente: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200',
    };

    if (loading) return <div className="py-8 text-center text-slate-500">Carregando usuários…</div>;

    return (
        <div>
            <header className="mb-4 flex items-center justify-between">
                <div>
                    {!embutido && <h2 className="text-xl font-bold text-slate-800 dark:text-white">👥 Gerenciar usuários</h2>}
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{users.length} usuário(s) cadastrado(s) · você é {ROTULO_PAPEL[ator].toLowerCase()}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Gestor administra admins e gestores e exclui empresas; admin aprova e administra colaboradores.</p>
                </div>
                <button onClick={reload} className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">↻ Atualizar</button>
            </header>

            {ehMaster(currentUser.email) && ator !== 'gestor' && <VerificarMaster email={currentUser.email} />}
            {erroCarteira && <div role="alert" className="mb-3 p-2 text-sm text-amber-800 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded">{erroCarteira}</div>}
            {editando && (
                <CarteiraModal
                    alvo={{ uid: editando.uid, nome: editando.name, email: editando.email, papel: editando.role }}
                    ator={ator} atorUid={meuUid} usuario={{ id: meuUid, email: currentUser.email }}
                    empresas={empresas} atual={carteiras.get(editando.uid) ?? []} minhas={minhas}
                    onFechar={() => setEditando(null)}
                    onSalvo={() => { setEditando(null); reload(); }}
                />
            )}
            {erro && <div className="mb-3 p-2 text-sm text-red-700 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded">{erro}</div>}

            <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                <table className="w-full text-sm">
                    <thead className="bg-slate-100 dark:bg-slate-800">
                        <tr className="text-left">
                            <th className="px-3 py-2">Nome</th>
                            <th className="px-3 py-2">E-mail</th>
                            <th className="px-3 py-2">Papel</th>
                            <th className="px-3 py-2">Carteira</th>
                            <th className="px-3 py-2 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => {
                            const isMe = u.uid === (currentUser as any).uid;
                            const atual = papelEfetivo(u.role);
                            const opcoes = papeisPermitidos(ator, isMe, atual);
                            return (
                                <tr key={u.uid} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-3 py-2 text-slate-800 dark:text-slate-200">{u.name} {isMe && <span className="text-xs text-blue-500">(você)</span>}</td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{u.email}</td>
                                    <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs font-medium rounded ${corPapel[atual]}`}>{ROTULO_PAPEL[atual]}</span></td>
                                    <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                                        {atual === 'pendente' ? '—' : resumoCarteira(atual, carteiras.get(u.uid))}
                                        {podeCarteira(u, atual) && (
                                            <button onClick={() => setEditando(u)} className="ml-2 rounded border border-blue-300 px-2 py-0.5 text-xs text-blue-700 dark:border-blue-700 dark:text-blue-300">Carteira</button>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-right space-x-1">
                                        {opcoes.length === 0 ? (
                                            <span className="text-xs text-slate-400">—</span>
                                        ) : opcoes.map(p => (
                                            <button key={p} onClick={() => mudar(u, p)} className={`px-2 py-1 text-xs text-white rounded ${corBotao[p]}`}>{rotuloBotao(atual, p)}</button>
                                        ))}
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
