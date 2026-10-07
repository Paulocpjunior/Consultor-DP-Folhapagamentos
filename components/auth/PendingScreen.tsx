import React, { useEffect, useState } from 'react';
import * as authService from '../../services/auth/authService';
import { ehMaster } from '../../services/auth/papeis';
import type { User } from '../../types';

/** Intervalo entre envios do link (o Firebase bloqueia pedidos seguidos da mesma conta). */
const ESPERA_MS = 2 * 60 * 1000;
/** Depois do bloqueio do Firebase ("too-many-requests"), espera maior antes de tentar de novo. */
const ESPERA_BLOQUEIO_MS = 15 * 60 * 1000;
const chaveEnvio = (email: string) => `verificacao-email:${email.toLowerCase()}`;
function lerUltimoEnvio(email: string): { em: number; ate: number } | null {
    try { const v = JSON.parse(localStorage.getItem(chaveEnvio(email)) ?? 'null'); return v && typeof v.em === 'number' && typeof v.ate === 'number' ? v : null; } catch { return null; }
}
function gravarEnvio(email: string, v: { em: number; ate: number }) { try { localStorage.setItem(chaveEnvio(email), JSON.stringify(v)); } catch { /* sem armazenamento: só nesta tela */ } }
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * E-mail ainda não verificado: envia o link e, depois do clique, renova o
 * token. O master vira gestor; os demais passam a ser aceitos pelo CFI
 * (cofre de certificados e transmissão ao eSocial). O botão de envio espera
 * entre um pedido e outro, porque o Firebase bloqueia pedidos seguidos.
 */
export const VerificarEmail: React.FC<{ email: string; master?: boolean }> = ({ email, master = false }) => {
    const [msg, setMsg] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [envio, setEnvio] = useState(() => lerUltimoEnvio(email));
    const [agora, setAgora] = useState(() => Date.now());
    const espera = envio ? Math.max(0, envio.ate - agora) : 0;
    useEffect(() => {
        if (!espera) return;
        const t = setInterval(() => setAgora(Date.now()), 1000);
        return () => clearInterval(t);
    }, [espera > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    function registrar(ms: number) { const v = { em: Date.now(), ate: Date.now() + ms }; gravarEnvio(email, v); setEnvio(v); setAgora(Date.now()); }
    async function enviar() {
        setOcupado(true); setMsg('');
        try {
            await authService.enviarVerificacaoEmail();
            registrar(ESPERA_MS);
            setMsg(`Link enviado às ${hora(Date.now())} para ${email}. Abra o e-mail, clique no link e volte aqui em "Já verifiquei".`);
        } catch (e: any) {
            if (e?.code === 'auth/too-many-requests') {
                registrar(ESPERA_BLOQUEIO_MS);
                setMsg('O Firebase bloqueou novos envios para esta conta por causa de pedidos seguidos (costuma liberar em até 1 hora). O link que já foi enviado continua valendo: procure-o no e-mail, inclusive no lixo eletrônico, clique nele e use "Já verifiquei".');
            } else setMsg(e?.message ?? String(e));
        }
        finally { setOcupado(false); }
    }
    async function confirmar() {
        setOcupado(true); setMsg('');
        try {
            if (await authService.confirmarVerificacaoEmail()) window.location.reload();
            else setMsg('O e-mail ainda não aparece como verificado. Clique no link recebido (o mais recente, se chegaram vários) e tente de novo.');
        } catch (e: any) { setMsg(e?.message ?? String(e)); }
        finally { setOcupado(false); }
    }
    const minutos = Math.ceil(espera / 60000);
    return (
        <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-100">
            {master
                ? <p className="mb-2">Este é o e-mail master: ele vira <strong>gestor</strong> assim que o e-mail for verificado.</p>
                : <p className="mb-2">Seu e-mail <strong>{email}</strong> ainda não foi verificado. O cofre de certificados e a transmissão ao eSocial (pelo CFI) só aceitam e-mail verificado.</p>}
            <div className="flex flex-wrap gap-2">
                <button disabled={ocupado || espera > 0} onClick={enviar} className="px-3 py-1.5 text-sm bg-purple-700 hover:bg-purple-800 text-white rounded-lg disabled:opacity-50">
                    {espera > 0 ? `Novo envio em ${minutos} min` : envio ? 'Enviar o link de novo' : 'Enviar link de verificação'}
                </button>
                <button disabled={ocupado} onClick={confirmar} className="px-3 py-1.5 text-sm border border-purple-400 rounded-lg disabled:opacity-50">Já verifiquei</button>
            </div>
            {msg && <p role="status" className="mt-2 text-xs">{msg}</p>}
            {envio && (
                <p className="mt-2 text-xs text-purple-800 dark:text-purple-200">
                    Último pedido às {hora(envio.em)}. O e-mail vem de <strong>{authService.remetenteVerificacao()}</strong>, com o assunto de verificação do Consultor DP, e pode levar alguns minutos.
                    Se não aparecer na caixa de entrada, procure no lixo eletrônico (spam) e nas abas Outros/Promoções; marque como "não é spam" para os próximos.
                </p>
            )}
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
