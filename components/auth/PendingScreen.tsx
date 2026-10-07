import React, { useState } from 'react';
import * as authService from '../../services/auth/authService';
import { ehMaster } from '../../services/auth/papeis';
import type { User } from '../../types';

/**
 * E-mail ainda não verificado: envia o link e, depois do clique, renova o
 * token. O master vira gestor; os demais passam a ser aceitos pelo CFI
 * (cofre de certificados e transmissão ao eSocial).
 */
export const VerificarEmail: React.FC<{ email: string; master?: boolean }> = ({ email, master = false }) => {
    const [msg, setMsg] = useState('');
    const [ocupado, setOcupado] = useState(false);
    async function enviar() {
        setOcupado(true); setMsg('');
        try { await authService.enviarVerificacaoEmail(); setMsg(`Link de verificação enviado para ${email}. Abra o e-mail, clique no link e volte aqui.`); }
        catch (e: any) { setMsg(e?.code === 'auth/too-many-requests' ? 'Muitos envios seguidos: aguarde alguns minutos.' : (e?.message ?? String(e))); }
        finally { setOcupado(false); }
    }
    async function confirmar() {
        setOcupado(true); setMsg('');
        try {
            if (await authService.confirmarVerificacaoEmail()) window.location.reload();
            else setMsg('O e-mail ainda não aparece como verificado. Clique no link recebido e tente de novo.');
        } catch (e: any) { setMsg(e?.message ?? String(e)); }
        finally { setOcupado(false); }
    }
    return (
        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-100">
            {master
                ? <p className="mb-2">Este é o e-mail master: ele vira <strong>gestor</strong> assim que o e-mail for verificado.</p>
                : <p className="mb-2">Seu e-mail <strong>{email}</strong> ainda não foi verificado. O cofre de certificados e a transmissão ao eSocial (pelo CFI) só aceitam e-mail verificado.</p>}
            <div className="flex flex-wrap gap-2">
                <button disabled={ocupado} onClick={enviar} className="px-3 py-1.5 text-sm bg-purple-700 hover:bg-purple-800 text-white rounded-lg disabled:opacity-50">Enviar link de verificação</button>
                <button disabled={ocupado} onClick={confirmar} className="px-3 py-1.5 text-sm border border-purple-400 rounded-lg disabled:opacity-50">Já verifiquei</button>
            </div>
            {msg && <p role="status" className="mt-2 text-xs">{msg}</p>}
        </div>
    );
};

/** Para o e-mail master ainda sem verificação: envia o link e reavalia o papel (vira gestor). */
export const VerificarMaster: React.FC<{ email: string }> = ({ email }) => <VerificarEmail email={email} master />;

const PendingScreen: React.FC<{ user: User }> = ({ user }) => {
    const master = ehMaster(user.email);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
            <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-amber-300 dark:border-amber-700 p-6">
                <div className="text-4xl mb-2">⏳</div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Aguardando aprovação</h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                    Sua conta <strong>{user.email}</strong> foi criada com sucesso e está aguardando aprovação de um administrador.
                    Você receberá acesso assim que for liberado.
                </p>
                {master && <VerificarMaster email={user.email} />}
                <button
                    onClick={() => authService.logout()}
                    className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg"
                >
                    Sair
                </button>
            </div>
        </div>
    );
};

export default PendingScreen;
