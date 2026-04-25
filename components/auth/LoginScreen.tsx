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
                if (password.length < 6) throw new Error('Senha precisa ter no mínimo 6 caracteres.');
                if (!name.trim()) throw new Error('Informe seu nome.');
                await authService.signup(email.trim(), password, name.trim());
            } else if (mode === 'login') {
                await authService.login(email.trim(), password);
            } else {
                await authService.resetPassword(email.trim());
                setMsg('E-mail de redefinição enviado. Verifique sua caixa de entrada.');
            }
        } catch (e: any) {
            const code = e?.code ?? '';
            const m: Record<string, string> = {
                'auth/invalid-credential': 'E-mail ou senha incorretos.',
                'auth/user-not-found': 'Usuário não encontrado.',
                'auth/wrong-password': 'Senha incorreta.',
                'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
                'auth/weak-password': 'Senha fraca (mínimo 6 caracteres).',
                'auth/invalid-email': 'E-mail inválido.',
            };
            setErro(m[code] ?? e?.message ?? 'Erro ao processar a solicitação.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white">📋 Consultor DP</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Folha de Pagamento — IOB SAGE</p>
                </div>

                <form onSubmit={submit} className="space-y-3">
                    {mode === 'signup' && (
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Nome</label>
                            <input
                                type="text" value={name} onChange={(e) => setName(e.target.value)}
                                required className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">E-mail</label>
                        <input
                            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                            required className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                        />
                    </div>
                    {mode !== 'reset' && (
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Senha</label>
                            <input
                                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                                required minLength={6}
                                className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                            />
                        </div>
                    )}

                    <button
                        type="submit" disabled={busy}
                        className="w-full px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
                    >
                        {busy ? 'Aguarde…' : mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar e-mail'}
                    </button>
                </form>

                {erro && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</p>}
                {msg && <p className="mt-3 text-sm text-green-600 dark:text-green-400">{msg}</p>}

                <div className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 space-x-2">
                    {mode !== 'login' && <button onClick={() => { setMode('login'); setErro(''); setMsg(''); }} className="hover:underline">Já tenho conta</button>}
                    {mode !== 'signup' && <button onClick={() => { setMode('signup'); setErro(''); setMsg(''); }} className="hover:underline">Criar conta</button>}
                    {mode !== 'reset' && <button onClick={() => { setMode('reset'); setErro(''); setMsg(''); }} className="hover:underline">Esqueci a senha</button>}
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
