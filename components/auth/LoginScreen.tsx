import React, { useState } from 'react';
import * as authService from '../../services/auth/authService';
import Logo from '../Logo';
import { APP_VERSION_LABEL } from '../../services/updateService';

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

    return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{
            background: 'linear-gradient(135deg, #0a0e1a 0%, #0f1729 50%, #0a0e1a 100%)',
        }}>
            <div className="w-full max-w-md rounded-2xl shadow-2xl p-8 border border-slate-800" style={{
                background: '#111827',
            }}>
                {/* Logo + titulo */}
                <div className="flex flex-col items-center mb-6">
                    <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 bg-white/95 p-2"
                        style={{ boxShadow: '0 0 28px rgba(67, 56, 202, 0.35)' }}
                    >
                        <Logo iconOnly className="w-full h-full" />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-wide">SP CONTÁBIL</h1>
                    <p className="text-xs font-semibold tracking-widest uppercase mt-1" style={{ color: '#6366f1' }}>
                        Consultor DP — Folha
                    </p>
                    <p className="text-sm text-slate-400 mt-3">
                        {mode === 'login' && 'Faça login para acessar o painel'}
                        {mode === 'signup' && 'Crie sua conta para acessar o sistema'}
                        {mode === 'reset' && 'Informe seu e-mail para redefinir a senha'}
                    </p>
                </div>

                <form onSubmit={submit} className="space-y-4">
                    {mode === 'signup' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Nome completo</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                                </span>
                                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name"
                                    className="w-full pl-10 pr-3 py-3 text-sm bg-slate-900/60 border border-slate-700 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5">E-mail</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4-1.5h-4"/></svg>
                            </span>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
                                placeholder="Digite seu usuário"
                                className="w-full pl-10 pr-3 py-3 text-sm bg-slate-900/60 border border-slate-700 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                        </div>
                    </div>

                    {mode !== 'reset' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1.5">Senha</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                                </span>
                                <input type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                                    placeholder="Digite sua senha"
                                    className="w-full pl-10 pr-10 py-3 text-sm bg-slate-900/60 border border-slate-700 text-white placeholder-slate-500 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                                    {showPwd ? (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                                    ) : (
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                    )}
                                </button>
                            </div>
                            {mode === 'login' && (
                                <div className="text-right mt-2">
                                    <button type="button" onClick={() => { setMode('reset'); setErro(''); setMsg(''); }}
                                        className="text-sm hover:underline" style={{ color: '#6366f1' }}>
                                        Esqueci minha senha
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <button type="submit" disabled={busy}
                        className="w-full py-3 text-sm font-semibold text-white rounded-lg transition-all disabled:opacity-50 mt-2"
                        style={{
                            background: busy ? '#3730a3' : 'linear-gradient(135deg, #4338ca 0%, #3730a3 100%)',
                            boxShadow: '0 4px 14px rgba(67, 56, 202, 0.4)',
                        }}>
                        {busy ? 'Aguarde...' : labelBotao}
                    </button>

                    {erro && (
                        <div className="p-3 text-sm text-red-300 bg-red-900/20 border border-red-800/50 rounded-lg">
                            {erro}
                        </div>
                    )}
                    {msg && (
                        <div className="p-3 text-sm text-emerald-300 bg-emerald-900/20 border border-emerald-800/50 rounded-lg">
                            {msg}
                        </div>
                    )}
                </form>

                {/* Divider + acoes secundarias */}
                {mode === 'login' && (
                    <>
                        <div className="my-6 border-t border-slate-800"></div>
                        <p className="text-center text-sm text-slate-400 mb-3">Primeiro acesso?</p>
                        <button onClick={() => { setMode('signup'); setErro(''); setMsg(''); }}
                            className="w-full py-3 text-sm font-medium text-slate-200 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                            Criar Conta
                        </button>
                    </>
                )}

                {(mode === 'signup' || mode === 'reset') && (
                    <button onClick={() => { setMode('login'); setErro(''); setMsg(''); }}
                        className="w-full mt-4 py-3 text-sm font-medium text-slate-300 hover:text-white transition-colors">
                        ← Voltar para login
                    </button>
                )}

                {/* Footer */}
                <div className="mt-6 pt-4 border-t border-slate-800 text-center">
                    <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        <span>Ambiente criptografado e seguro</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5 font-mono">{APP_VERSION_LABEL}</p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
