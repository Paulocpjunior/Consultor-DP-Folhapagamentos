import React, { useState } from 'react';
import { consultarCnpj, validaCnpj, formatCnpj } from '../../services/brasilApiService';
import { criarEmpresa } from '../../services/empresas/empresasService';
import type { User } from '../../types';

interface Props {
    currentUser: User;
    onCriado: () => void;
    onCancelar: () => void;
}

const EmpresaForm: React.FC<Props> = ({ currentUser, onCriado, onCancelar }) => {
    const [cnpj, setCnpj]                 = useState('');
    const [razaoSocial, setRazaoSocial]   = useState('');
    const [nomeFantasia, setNomeFantasia] = useState('');
    const [codigoSage, setCodigoSage]     = useState('');
    const [busy, setBusy]                 = useState(false);
    const [erro, setErro]                 = useState('');
    const [info, setInfo]                 = useState('');

    const consultar = async () => {
        setErro(''); setInfo('');
        if (!validaCnpj(cnpj)) { setErro('CNPJ inválido.'); return; }
        setBusy(true);
        try {
            const dados = await consultarCnpj(cnpj);
            setRazaoSocial(dados.razao_social ?? '');
            setNomeFantasia(dados.nome_fantasia ?? dados.razao_social ?? '');
            setInfo(`✓ ${dados.razao_social} ${dados.municipio ? '— ' + dados.municipio + '/' + dados.uf : ''}`);
        } catch (e: any) {
            setErro(e?.message ?? 'Erro ao consultar CNPJ.');
        } finally {
            setBusy(false);
        }
    };

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        setErro(''); setInfo('');
        if (!validaCnpj(cnpj)) { setErro('CNPJ inválido.'); return; }
        if (!razaoSocial.trim()) { setErro('Razão social é obrigatória.'); return; }
        if (!nomeFantasia.trim()) { setErro('Nome fantasia é obrigatório.'); return; }
        if (!/^\d{1,4}$/.test(codigoSage)) { setErro('Código SAGE deve ter de 1 a 4 dígitos.'); return; }

        setBusy(true);
        try {
            await criarEmpresa((currentUser as any).uid, { cnpj, razaoSocial, nomeFantasia, codigoSage });
            onCriado();
        } catch (e: any) {
            setErro(e?.message ?? 'Erro ao salvar empresa.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={salvar} className="space-y-3 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
            <h3 className="font-semibold text-slate-800 dark:text-white">Nova empresa</h3>

            <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">CNPJ</label>
                <div className="flex gap-2">
                    <input
                        type="text" value={cnpj}
                        onChange={(e) => setCnpj(e.target.value)}
                        onBlur={(e) => { const f = formatCnpj(e.target.value); if (f) setCnpj(f); }}
                        placeholder="00.000.000/0000-00"
                        className="flex-1 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                    />
                    <button
                        type="button" onClick={consultar} disabled={busy}
                        className="px-3 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded disabled:opacity-50"
                    >
                        🔎 Consultar
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Razão social</label>
                    <input type="text" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded" />
                </div>
                <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Nome fantasia</label>
                    <input type="text" value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded" />
                </div>
            </div>

            <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Código SAGE (4 dígitos)</label>
                <input type="text" value={codigoSage}
                    onChange={(e) => setCodigoSage(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="0229" maxLength={4}
                    className="w-32 px-3 py-2 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded" />
            </div>

            {info && <p className="text-sm text-green-700 dark:text-green-400">{info}</p>}
            {erro && <p className="text-sm text-red-700 dark:text-red-400">{erro}</p>}

            <div className="flex gap-2 pt-2">
                <button type="submit" disabled={busy}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded font-medium">
                    {busy ? 'Salvando…' : '💾 Salvar empresa'}
                </button>
                <button type="button" onClick={onCancelar}
                    className="px-4 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded">
                    Cancelar
                </button>
            </div>
        </form>
    );
};

export default EmpresaForm;
