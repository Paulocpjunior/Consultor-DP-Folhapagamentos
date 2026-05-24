import React, { useEffect, useState } from 'react';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import {
    cruzarEmpresasComCertificados,
    listarCertificadosNoStorage,
    calcularStatusCertificado,
    diasParaVencer,
    getStatusLabel,
    type CruzamentoCertificado,
    type CertificadoStorage,
} from '../../services/empresas/certificadoService';
import { atualizarEmpresa } from '../../services/empresas/empresasService';
import { serverTimestamp } from 'firebase/firestore';
import type { Empresa } from '../../services/empresas/empresasTypes';

const ESocialCertificados: React.FC = () => {
    const [cruzamentos, setCruzamentos] = useState<CruzamentoCertificado[]>([]);
    const [certsOrfaos, setCertsOrfaos] = useState<CertificadoStorage[]>([]);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState('');
    const [vinculando, setVinculando] = useState<string | null>(null);

    const reload = async () => {
        setLoading(true);
        setErro('');
        try {
            const empresas = await listarTodasEmpresas();
            const [cruz, todosStorage] = await Promise.all([
                cruzarEmpresasComCertificados(empresas),
                listarCertificadosNoStorage(),
            ]);
            setCruzamentos(cruz);

            const cnpjsEmpresas = new Set(empresas.map(e => e.cnpj.replace(/\D/g, '')));
            setCertsOrfaos(todosStorage.filter(c => !cnpjsEmpresas.has(c.cnpj.replace(/\D/g, ''))));
        } catch (e: any) {
            setErro(e?.message || 'Erro ao carregar certificados');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(); }, []);

    const vincularAutomatico = async (empresaId: string, cert: CertificadoStorage) => {
        setVinculando(empresaId);
        try {
            await atualizarEmpresa(empresaId, {
                certificado: {
                    tipo: 'A1',
                    storagePath: cert.storagePath,
                    nomeArquivo: cert.nomeArquivo,
                    validade: '',
                    uploadEm: serverTimestamp(),
                    uploadPor: 'auto-sync',
                },
            } as any);
            await reload();
        } catch (e: any) {
            setErro(e?.message || 'Erro ao vincular');
        } finally {
            setVinculando(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500"></div>
            </div>
        );
    }

    if (erro) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">{erro}</p>
                <button onClick={reload} className="mt-2 text-xs text-red-600 underline">Tentar novamente</button>
            </div>
        );
    }

    const vinculados = cruzamentos.filter(c => c.status === 'vinculado');
    const noStorage = cruzamentos.filter(c => c.status === 'no_storage');
    const semCert = cruzamentos.filter(c => c.status === 'sem_certificado');

    const formatCnpj = (cnpj: string) => {
        const c = cnpj.replace(/\D/g, '').padStart(14, '0');
        return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;
    };

    const formatSize = (bytes: number) => {
        if (!bytes) return '—';
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / 1024).toFixed(1)} KB`;
    };

    return (
        <div className="space-y-6">
            {/* Resumo */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total Empresas</div>
                    <div className="text-lg font-bold text-slate-800 dark:text-white">{cruzamentos.length}</div>
                </div>
                <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
                    <div className="text-xs text-green-600 dark:text-green-400 uppercase tracking-wide">Vinculados</div>
                    <div className="text-lg font-bold text-green-700 dark:text-green-300">{vinculados.length}</div>
                </div>
                <div className="p-3 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
                    <div className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide">No Storage (não vinculados)</div>
                    <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{noStorage.length}</div>
                </div>
                <div className="p-3 rounded-lg border bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700">
                    <div className="text-xs text-red-600 dark:text-red-400 uppercase tracking-wide">Sem Certificado</div>
                    <div className="text-lg font-bold text-red-700 dark:text-red-300">{semCert.length}</div>
                </div>
            </div>

            {/* Certificados no Storage que podem ser vinculados */}
            {noStorage.length > 0 && (
                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                    <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                        ⚡ Certificados encontrados no Storage — vincular automaticamente
                    </h3>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                        Estas empresas têm certificados no Firebase Storage (pasta certificados/{'{cnpj}'}) mas ainda não estão vinculados no sistema.
                    </p>
                    <div className="space-y-2">
                        {noStorage.map(c => (
                            <div key={c.empresa.id} className="flex items-center justify-between gap-2 p-2 bg-white dark:bg-slate-800 rounded border border-amber-100 dark:border-amber-800">
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-800 dark:text-white">{c.empresa.nomeFantasia}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        {formatCnpj(c.empresa.cnpj)}
                                        {c.certificadoStorage && (
                                            <span className="ml-2">
                                                — {c.certificadoStorage.nomeArquivo} ({formatSize(c.certificadoStorage.tamanho)})
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => c.certificadoStorage && vincularAutomatico(c.empresa.id, c.certificadoStorage)}
                                    disabled={vinculando === c.empresa.id}
                                    className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded font-medium whitespace-nowrap"
                                >
                                    {vinculando === c.empresa.id ? 'Vinculando...' : '🔗 Vincular'}
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empresas já vinculadas */}
            {vinculados.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        🔐 Empresas com certificado vinculado ({vinculados.length})
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-800">
                                <tr className="text-left">
                                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Empresa</th>
                                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">CNPJ</th>
                                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Tipo</th>
                                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Arquivo</th>
                                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Validade</th>
                                    <th className="px-3 py-2 font-medium text-slate-600 dark:text-slate-400">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {vinculados.map(c => {
                                    const cert = c.empresa.certificado!;
                                    const st = calcularStatusCertificado(cert.validade);
                                    const stInfo = getStatusLabel(st);
                                    const dias = cert.validade ? diasParaVencer(cert.validade) : null;
                                    return (
                                        <tr key={c.empresa.id} className="border-t border-slate-100 dark:border-slate-800">
                                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">{c.empresa.nomeFantasia}</td>
                                            <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{formatCnpj(c.empresa.cnpj)}</td>
                                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{cert.tipo}</td>
                                            <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{cert.nomeArquivo}</td>
                                            <td className="px-3 py-2 text-xs">
                                                {cert.validade ? (
                                                    <span className={st === 'vencido' ? 'text-red-600' : st === 'vencendo' ? 'text-amber-600' : 'text-green-600'}>
                                                        {new Date(cert.validade + 'T00:00:00').toLocaleDateString('pt-BR')}
                                                        {dias !== null && ` (${dias}d)`}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400 italic">não informada</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${stInfo.cls}`}>
                                                    {stInfo.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Empresas sem certificado */}
            {semCert.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        ⚠️ Empresas sem certificado ({semCert.length})
                    </h3>
                    <div className="p-4 bg-red-50/50 dark:bg-red-900/10 border border-red-200 dark:border-red-700 rounded-lg">
                        <div className="space-y-1">
                            {semCert.map(c => (
                                <div key={c.empresa.id} className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                                    <span className="text-red-400">●</span>
                                    <span className="font-medium">{c.empresa.nomeFantasia}</span>
                                    <span className="text-xs text-red-500 dark:text-red-400 font-mono">{formatCnpj(c.empresa.cnpj)}</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-3">
                            Essas empresas não têm certificado digital no Storage nem vinculado. Faça o upload na aba Empresas.
                        </p>
                    </div>
                </div>
            )}

            {/* Certificados órfãos */}
            {certsOrfaos.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        📁 Certificados no Storage sem empresa cadastrada ({certsOrfaos.length})
                    </h3>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                        <div className="space-y-1">
                            {certsOrfaos.map(c => (
                                <div key={c.storagePath} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                    <span>📄</span>
                                    <span className="font-mono text-xs">{formatCnpj(c.cnpj)}</span>
                                    <span>—</span>
                                    <span className="text-xs">{c.nomeArquivo} ({formatSize(c.tamanho)})</span>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                            Estes certificados existem no Storage mas o CNPJ não corresponde a nenhuma empresa cadastrada.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ESocialCertificados;
