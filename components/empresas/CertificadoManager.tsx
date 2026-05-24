import React, { useState } from 'react';
import {
    uploadCertificado,
    removerCertificado,
    calcularStatusCertificado,
    diasParaVencer,
    getStatusLabel,
} from '../../services/empresas/certificadoService';
import type { Empresa, CertificadoTipo } from '../../services/empresas/empresasTypes';
import type { User } from '../../types';

interface Props {
    empresa: Empresa;
    currentUser: User;
    onAtualizado: () => void;
}

const CertificadoManager: React.FC<Props> = ({ empresa, currentUser, onAtualizado }) => {
    const [showUpload, setShowUpload] = useState(false);
    const [busy, setBusy] = useState(false);
    const [erro, setErro] = useState('');

    // Upload form
    const [arquivo, setArquivo] = useState<File | null>(null);
    const [tipo, setTipo] = useState<CertificadoTipo>('A1');
    const [validade, setValidade] = useState('');
    const [emissor, setEmissor] = useState('');
    const [titular, setTitular] = useState('');

    const cert = empresa.certificado;
    const status = calcularStatusCertificado(cert?.validade);
    const statusInfo = getStatusLabel(status);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!arquivo || !validade) return;
        setBusy(true);
        setErro('');
        try {
            await uploadCertificado(
                empresa.id,
                empresa.cnpj,
                (currentUser as any).uid,
                arquivo,
                tipo,
                validade,
                { emissor: emissor || undefined, titular: titular || undefined },
            );
            setShowUpload(false);
            setArquivo(null);
            setValidade('');
            setEmissor('');
            setTitular('');
            onAtualizado();
        } catch (err: any) {
            setErro(err?.message || 'Erro ao enviar certificado');
        } finally {
            setBusy(false);
        }
    };

    const handleRemover = async () => {
        if (!cert) return;
        if (!confirm(`Remover o certificado "${cert.nomeArquivo}" de ${empresa.nomeFantasia}?`)) return;
        setBusy(true);
        try {
            await removerCertificado(empresa.id, cert.storagePath);
            onAtualizado();
        } catch (err: any) {
            setErro(err?.message || 'Erro ao remover');
        } finally {
            setBusy(false);
        }
    };

    const dias = cert?.validade ? diasParaVencer(cert.validade) : null;

    return (
        <div className="mt-2">
            {cert ? (
                <div className={`p-3 rounded-lg border ${
                    status === 'vencido' ? 'border-red-200 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10' :
                    status === 'vencendo' ? 'border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10' :
                    'border-green-200 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10'
                }`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">🔐</span>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-slate-800 dark:text-white">
                                        Certificado {cert.tipo}
                                    </span>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.cls}`}>
                                        {statusInfo.label}
                                    </span>
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 space-x-3">
                                    <span>{cert.nomeArquivo}</span>
                                    {cert.emissor && <span>Emissor: {cert.emissor}</span>}
                                    {cert.titular && <span>Titular: {cert.titular}</span>}
                                </div>
                                <div className="text-xs mt-0.5">
                                    <span className={`font-medium ${
                                        status === 'vencido' ? 'text-red-600 dark:text-red-400' :
                                        status === 'vencendo' ? 'text-amber-600 dark:text-amber-400' :
                                        'text-green-600 dark:text-green-400'
                                    }`}>
                                        Validade: {new Date(cert.validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                                        {dias !== null && (
                                            dias < 0
                                                ? ` (vencido há ${Math.abs(dias)} dias)`
                                                : dias === 0
                                                ? ' (vence hoje!)'
                                                : ` (${dias} dias restantes)`
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setShowUpload(true)}
                                className="px-2 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-300 rounded">
                                Substituir
                            </button>
                            <button onClick={handleRemover} disabled={busy}
                                className="px-2 py-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-300 rounded disabled:opacity-50">
                                Remover
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <button onClick={() => setShowUpload(true)}
                    className="w-full p-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors">
                    🔐 Vincular Certificado Digital
                </button>
            )}

            {showUpload && (
                <form onSubmit={handleUpload} className="mt-2 p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Arquivo (.pfx / .p12) *</label>
                            <input type="file" accept=".pfx,.p12"
                                onChange={e => setArquivo(e.target.files?.[0] || null)}
                                className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/30 dark:file:text-blue-300" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tipo *</label>
                            <select value={tipo} onChange={e => setTipo(e.target.value as CertificadoTipo)}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                <option value="A1">A1 (arquivo)</option>
                                <option value="A3">A3 (token/cartão)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Validade *</label>
                            <input type="date" value={validade} onChange={e => setValidade(e.target.value)} required
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Emissor</label>
                            <input type="text" value={emissor} onChange={e => setEmissor(e.target.value)} placeholder="Ex: AC SOLUTI, SERASA"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Titular</label>
                            <input type="text" value={titular} onChange={e => setTitular(e.target.value)} placeholder="Nome no certificado"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200" />
                        </div>
                    </div>
                    {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
                    <div className="flex gap-2">
                        <button type="submit" disabled={busy || !arquivo || !validade}
                            className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded font-medium">
                            {busy ? 'Enviando...' : 'Salvar certificado'}
                        </button>
                        <button type="button" onClick={() => { setShowUpload(false); setErro(''); }}
                            className="px-3 py-1.5 text-sm bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200 rounded">
                            Cancelar
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default CertificadoManager;
