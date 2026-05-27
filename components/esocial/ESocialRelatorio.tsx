import React, { useEffect, useState } from 'react';
import { listarEventos } from '../../services/esocial/esocialService';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import type { EventoEsocial } from '../../services/esocial/esocialTypes';
import { EVENTO_LABELS } from '../../services/esocial/esocialTypes';
import type { Empresa } from '../../services/empresas/empresasTypes';

interface EmpresaResumo {
    empresaId: string;
    nome: string;
    cnpj: string;
    pendentes: number;
    transmitidos: number;
    processados: number;
    rejeitados: number;
    total: number;
    tiposUsados: string[];
}

const ESocialRelatorio: React.FC = () => {
    const [competencia, setCompetencia] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const [eventos, setEventos] = useState<EventoEsocial[]>([]);
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const [ev, emp] = await Promise.all([listarEventos(), listarTodasEmpresas()]);
                setEventos(ev);
                setEmpresas(emp);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        })();
    }, []);

    const eventosFiltrados = eventos.filter(e => e.competencia === competencia);
    const getEmpresa = (id: string) => empresas.find(e => e.id === id);

    const resumoPorEmpresa: EmpresaResumo[] = [];
    const empresaMap = new Map<string, EventoEsocial[]>();
    eventosFiltrados.forEach(ev => {
        const arr = empresaMap.get(ev.empresaId) || [];
        arr.push(ev);
        empresaMap.set(ev.empresaId, arr);
    });

    empresaMap.forEach((evs, empId) => {
        const emp = getEmpresa(empId);
        const tipos = new Set(evs.map(e => e.tipo));
        resumoPorEmpresa.push({
            empresaId: empId,
            nome: emp?.nomeFantasia || empId,
            cnpj: (emp as any)?.cnpj || '',
            pendentes: evs.filter(e => e.status === 'pendente').length,
            transmitidos: evs.filter(e => e.status === 'transmitido').length,
            processados: evs.filter(e => e.status === 'processado').length,
            rejeitados: evs.filter(e => e.status === 'rejeitado').length,
            total: evs.length,
            tiposUsados: Array.from(tipos),
        });
    });

    resumoPorEmpresa.sort((a, b) => b.total - a.total);

    const totalGeral = {
        pendentes: resumoPorEmpresa.reduce((a, r) => a + r.pendentes, 0),
        transmitidos: resumoPorEmpresa.reduce((a, r) => a + r.transmitidos, 0),
        processados: resumoPorEmpresa.reduce((a, r) => a + r.processados, 0),
        rejeitados: resumoPorEmpresa.reduce((a, r) => a + r.rejeitados, 0),
        total: resumoPorEmpresa.reduce((a, r) => a + r.total, 0),
    };

    const handleExportCSV = () => {
        const headers = ['Empresa', 'CNPJ', 'Total', 'Pendentes', 'Transmitidos', 'Processados', 'Rejeitados', 'Tipos'];
        const csv = [
            headers.join(','),
            ...resumoPorEmpresa.map(r =>
                [r.nome, r.cnpj, r.total, r.pendentes, r.transmitidos, r.processados, r.rejeitados, `"${r.tiposUsados.join('; ')}"`].join(',')
            ),
            ['TOTAL', '', totalGeral.total, totalGeral.pendentes, totalGeral.transmitidos, totalGeral.processados, totalGeral.rejeitados, ''].join(','),
        ].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_esocial_${competencia}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return <div className="py-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500 mx-auto"></div></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200">Relatório Mensal eSocial</h3>
                <input type="month" value={competencia} onChange={e => setCompetencia(e.target.value)}
                    className="px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200" />
                {resumoPorEmpresa.length > 0 && (
                    <button onClick={handleExportCSV}
                        className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium ml-auto">
                        Exportar CSV
                    </button>
                )}
            </div>

            {/* Totais gerais */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <MiniCard label="Total" value={totalGeral.total} cor="slate" />
                <MiniCard label="Pendentes" value={totalGeral.pendentes} cor="amber" />
                <MiniCard label="Transmitidos" value={totalGeral.transmitidos} cor="blue" />
                <MiniCard label="Processados" value={totalGeral.processados} cor="green" />
                <MiniCard label="Rejeitados" value={totalGeral.rejeitados} cor="red" />
            </div>

            {resumoPorEmpresa.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400 text-sm">
                    Nenhum evento na competência {competencia}.
                </div>
            ) : (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800">
                            <tr>
                                <th className="py-2 px-3 text-left font-medium text-slate-600 dark:text-slate-400">Empresa</th>
                                <th className="py-2 px-3 text-center font-medium text-slate-600 dark:text-slate-400">Total</th>
                                <th className="py-2 px-3 text-center font-medium text-amber-600">Pend.</th>
                                <th className="py-2 px-3 text-center font-medium text-blue-600">Trans.</th>
                                <th className="py-2 px-3 text-center font-medium text-green-600">Proc.</th>
                                <th className="py-2 px-3 text-center font-medium text-red-600">Rej.</th>
                                <th className="py-2 px-3 text-left font-medium text-slate-600 dark:text-slate-400">Tipos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resumoPorEmpresa.map(r => (
                                <tr key={r.empresaId} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <td className="py-2 px-3">
                                        <div className="font-medium text-slate-800 dark:text-slate-200">{r.nome}</div>
                                        <div className="text-xs text-slate-400 font-mono">{r.cnpj}</div>
                                    </td>
                                    <td className="py-2 px-3 text-center font-bold">{r.total}</td>
                                    <td className="py-2 px-3 text-center text-amber-600">{r.pendentes || '—'}</td>
                                    <td className="py-2 px-3 text-center text-blue-600">{r.transmitidos || '—'}</td>
                                    <td className="py-2 px-3 text-center text-green-600">{r.processados || '—'}</td>
                                    <td className="py-2 px-3 text-center text-red-600">{r.rejeitados || '—'}</td>
                                    <td className="py-2 px-3">
                                        <div className="flex flex-wrap gap-1">
                                            {r.tiposUsados.map(t => (
                                                <span key={t} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-xs font-mono rounded">{t}</span>
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 dark:bg-slate-800 font-semibold">
                            <tr className="border-t-2 border-slate-300 dark:border-slate-600">
                                <td className="py-2 px-3">TOTAL ({resumoPorEmpresa.length} empresas)</td>
                                <td className="py-2 px-3 text-center">{totalGeral.total}</td>
                                <td className="py-2 px-3 text-center text-amber-600">{totalGeral.pendentes}</td>
                                <td className="py-2 px-3 text-center text-blue-600">{totalGeral.transmitidos}</td>
                                <td className="py-2 px-3 text-center text-green-600">{totalGeral.processados}</td>
                                <td className="py-2 px-3 text-center text-red-600">{totalGeral.rejeitados}</td>
                                <td className="py-2 px-3"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    );
};

const MiniCard: React.FC<{ label: string; value: number; cor: string }> = ({ label, value, cor }) => {
    const cls: Record<string, string> = {
        slate: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
        amber: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300',
        blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300',
        green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300',
        red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700 text-red-700 dark:text-red-300',
    };
    return (
        <div className={`p-2 rounded border text-center ${cls[cor] || cls.slate}`}>
            <div className="text-xl font-bold">{value}</div>
            <div className="text-xs">{label}</div>
        </div>
    );
};

export default ESocialRelatorio;
