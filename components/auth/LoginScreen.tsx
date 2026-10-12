import React, { useState } from 'react';
import * as authService from '../../services/auth/authService';
import Logo from '../Logo';
import { APP_VERSION_LABEL, dataDaVersao } from '../../services/updateService';

interface Props {
    onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<Props> = () => {
    const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [showPwd, setShowPwd] = useState(false);
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true); setErro(''); setMsg('');
        try {
            if (mode === 'signup') {
                if (password.length < 6) throw new Error('Senha precisa ter no minimo 6 caracteres.');
                if (!name.trim()) throw new Error('Informe seu nome.');
                await authService.signup(email.trim(), password, name.trim());
            } else if (mode === 'login') {
                await authService.login(email.trim(), password);
            } else {
                await authService.resetPassword(email.trim());
                setMsg('E-mail de redefinicao enviado. Verifique sua caixa de entrada.');
            }
        } catch (e: any) {
            const code = e?.code ?? '';
            const m: Record<string, string> = {
                'auth/invalid-credential':    'E-mail ou senha incorretos.',
                'auth/user-not-found':        'Usuario nao encontrado.',
                'auth/wrong-password':        'Senha incorreta.',
                'auth/email-already-in-use':  'Este e-mail ja esta cadastrado.',
                'auth/weak-password':         'Senha fraca (minimo 6 caracteres).',
                'auth/invalid-email':         'E-mail invalido.',
            };
            setErro(m[code] ?? e?.message ?? 'Erro ao processar a solicitacao.');
        } finally {
            setBusy(false);
        }
    };

    const labelBotao = mode === 'login' ? 'Acessar Sistema' : mode === 'signup' ? 'Criar Conta' : 'Enviar link de redefinicao';

    // Estilo da casa (12/10/2026): claro e escuro como os sistemas da Apple — fundo neutro, cartão limpo, campos
    // arredondados com foco azul e um só tom de destaque. O tema segue o do app (classe "dark" no <html>).
    const campo = 'w-full rounded-xl border border-slate-300 bg-white py-3 text-[15px] text-slate-900 placeholder-slate-400 shadow-xs transition focus:border-blue-500 focus:outline-hidden focus:ring-4 focus:ring-blue-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500';
    const icone = 'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400';
    const rotulo = 'mb-1.5 block text-[13px] font-medium text-slate-600 dark:text-slate-300';
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 dark:bg-slate-950">
            <div className="w-full max-w-[400px] rounded-3xl bg-white p-8 shadow-[0_8px_40px_rgba(0,0,0,0.08)] ring-1 ring-black/5 dark:bg-slate-900 dark:shadow-none dark:ring-white/10">
                {/* Ícone do app + título */}
                <div className="mb-7 flex flex-col items-center text-center">
                    <Logo iconOnly className="mb-5 h-[76px] w-[76px] shadow-[0_6px_20px_rgba(0,0,0,0.12)]" />
                    <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900 dark:text-white">SP Contábil</h1>
                    <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">Consultor DP — Folha</p>
                    <p className="mt-4 text-[15px] text-slate-600 dark:text-slate-300">
                        {mode === 'login' && 'Faça login para acessar o painel'}
                        {mode === 'signup' && 'Crie sua conta para acessar o sistema'}
                        {mode === 'reset' && 'Informe seu e-mail para redefinir a senha'}
                    </p>
                </div>

                <form onSubmit={submit} className="space-y-4">
                    {mode === 'signup' && (
                        <div>
                            <label className={rotulo}>Nome completo</label>
                            <div className="relative">
                                <span className={icone}>
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                                </span>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name"
                                    className={`${campo} pl-11 pr-3`} />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className={rotulo}>E-mail</label>
                        <div className="relative">
                            <span className={icone}>
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4-1.5h-4"/></svg>
                            </span>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                                placeholder="Digite seu usuário"
                                className={`${campo} pl-11 pr-3`} />
                        </div>
                    </div>

                    {mode !== 'reset' && (
                        <div>
                            <label className={rotulo}>Senha</label>
                            <div className="relative">
                                <span className={icone}>
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                                </span>
                                <input type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                                    placeholder="Digite sua senha"
                                    className={`${campo} pl-11 pr-11`} />
                                <button type="button" onClick={() => setShowPwd(!showPwd)} aria-label={showPwd ? 'Ocultar senha' : 'Mostrar senha'}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                    {showPwd ? (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                                    ) : (
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                    )}
                                </button>
                            </div>
                            {mode === 'login' && (
                                <div className="mt-2 text-right">
                                    <button type="button" onClick={() => { setMode('reset'); setErro(''); setMsg(''); }}
                                        className="text-[13px] text-blue-600 hover:underline dark:text-blue-400">
                                        Esqueci minha senha
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <button type="submit" disabled={busy}
                        className="mt-2 w-full rounded-xl bg-blue-600 py-3 text-[15px] font-semibold text-white shadow-xs transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50">
                        {busy ? 'Aguarde...' : labelBotao}
                    </button>

                    {erro && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-900/20 dark:text-red-300">
                            {erro}
                        </div>
                    )}
                    {msg && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                            {msg}
                        </div>
                    )}
                </form>

                {/* Ações secundárias */}
                {mode === 'login' && (
                    <>
                        <div className="my-6 border-t border-slate-200 dark:border-slate-800"></div>
                        <p className="mb-3 text-center text-[13px] text-slate-500 dark:text-slate-400">Primeiro acesso?</p>
                        <button onClick={() => { setMode('signup'); setErro(''); setMsg(''); }}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-3 text-[15px] font-medium text-blue-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                            Criar Conta
                        </button>
                    </>
                )}

                {(mode === 'signup' || mode === 'reset') && (
                    <button onClick={() => { setMode('login'); setErro(''); setMsg(''); }}
                        className="mt-4 w-full py-3 text-[15px] font-medium text-blue-600 hover:underline dark:text-blue-400">
                        ← Voltar para login
                    </button>
                )}

                {/* Rodapé */}
                <div className="mt-6 border-t border-slate-200 pt-4 text-center dark:border-slate-800">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        <span>Ambiente criptografado e seguro</span>
                    </div>
                    <p className="mt-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">{APP_VERSION_LABEL} · {dataDaVersao()}</p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
