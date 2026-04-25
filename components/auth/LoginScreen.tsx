import React, { useState } from 'react';
import * as authService from '../../services/auth/authService';

interface Props {
    onLoginSuccess?: () => void;
}

const LoginScreen: React.FC<Props> = () => {
    const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
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

    const labelBotao = mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link de redefinicao';
    const titulo = mode === 'login' ? 'Acessar plataforma' : mode === 'signup' ? 'Criar nova conta' : 'Redefinir senha';

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
            {/* Header da pagina */}
            <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 backdrop-blur">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-base font-semibold text-slate-800 dark:text-white tracking-tight">
                            SP Assessoria Contabil
                        </h1>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Consultor DP - Folha de Pagamento
                        </p>
                    </div>
                    <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
                        Sistema interno
                    </span>
                </div>
            </header>

            {/* Card central */}
            <main className="flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="px-6 pt-6 pb-2 border-b border-slate-100 dark:border-slate-700">
                            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{titulo}</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {mode === 'login' && 'Use suas credenciais para entrar.'}
                                {mode === 'signup' && 'Sua conta sera criada como pendente. Um administrador precisa aprovar antes do primeiro acesso.'}
                                {mode === 'reset' && 'Informe o e-mail cadastrado para receber o link de redefinicao.'}
                            </p>
                        </div>

                        <form onSubmit={submit} className="p-6 space-y-4">
                            {mode === 'signup' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Nome completo</label>
                                    <input
                                        type="text" value={name} onChange={(e) => setName(e.target.value)}
                                        required autoComplete="name"
                                        className="w-full px-3 py-2.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">E-mail</label>
                                <input
                                    type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                                    required autoComplete="email"
                                    className="w-full px-3 py-2.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            {mode !== 'reset' && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Senha</label>
                                    <input
                                        type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                        required minLength={6}
                                        autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                                        className="w-full px-3 py-2.5 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            )}

                            <button
                                type="submit" disabled={busy}
                                className="w-full px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors shadow-sm"
                            >
                                {busy ? 'Aguarde...' : labelBotao}
                            </button>

                            {erro && (
                                <div className="p-2.5 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                                    {erro}
                                </div>
                            )}
                            {msg && (
                                <div className="p-2.5 text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                                    {msg}
                                </div>
                            )}
                        </form>

                        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-700 flex items-center justify-between text-xs">
                            {mode !== 'login' ? (
                                <button onClick={() => { setMode('login'); setErro(''); setMsg(''); }}
                                    className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                                    Ja tenho conta
                                </button>
                            ) : <span />}
                            <div className="flex gap-3">
                                {mode !== 'signup' && (
                                    <button onClick={() => { setMode('signup'); setErro(''); setMsg(''); }}
                                        className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                                        Criar conta
                                    </button>
                                )}
                                {mode !== 'reset' && (
                                    <button onClick={() => { setMode('reset'); setErro(''); setMsg(''); }}
                                        className="text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                                        Esqueci a senha
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
                        Acesso restrito a colaboradores autorizados.
                    </p>
                </div>
            </main>

            <footer className="px-6 py-3 border-t border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-800/70 backdrop-blur">
                <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>SP Assessoria Contabil</span>
                    <span>v1.0</span>
                </div>
            </footer>
        </div>
    );
};

export default LoginScreen;
