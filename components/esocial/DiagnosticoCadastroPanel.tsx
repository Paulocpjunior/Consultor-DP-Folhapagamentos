// components/esocial/DiagnosticoCadastroPanel.tsx
//
// eSocial › Diagnóstico do cadastro (o IOB Diagnóstico eSocial): o cadastro inteiro da empresa ativa na competência,
// apto ou não apto antes de gerar os eventos (services/esocial/diagnosticoCadastro.ts), com o que corrigir em cada
// cadastro e a planilha.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarAfastamentos, listarEnquadramentos, listarFuncionarios, listarHorarios, listarRubricas, mensagemErro } from '../../services/cadastros/cadastrosService';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { AREAS_DIAGNOSTICO, diagnosticarCadastro, planilhaDiagnostico, type AreaDiagnostico, type EntradaDiagnostico } from '../../services/esocial/diagnosticoCadastro';

const ONDE: Record<AreaDiagnostico, string> = {
    Empresa: 'Empresas, Cadastros › Enquadramento e Rubricas, e os parâmetros do S-1200 no Cálculo',
    Trabalhador: 'Cadastros › Funcionários', Rubrica: 'Cadastros › Rubricas (S-1010)', 'Horário': 'Cadastros › Horários', Afastamento: 'Cadastros › Afastamentos',
};

const DiagnosticoCadastroPanel: React.FC = () => {
    const { ativa } = useEmpresaAtiva();
    const [entrada, setEntrada] = useState<EntradaDiagnostico | null>(null);
    const [erro, setErro] = useState('');
    const [filtro, setFiltro] = useState<AreaDiagnostico | ''>('');
    const [soErros, setSoErros] = useState(false);
    const [recarga, setRecarga] = useState(0);

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setEntrada(null); setErro('');
        Promise.all([listarEmpresasVisiveis(), listarFuncionarios(ativa.id), listarRubricas(ativa.id), listarHorarios(ativa.id), listarAfastamentos(ativa.id), listarEnquadramentos(ativa.id)])
            .then(([emps, fichas, rubricas, horarios, afastamentos, enquadramentos]) => {
                if (!vivo) return;
                const emp = emps.find(x => x.id === ativa.id);
                setEntrada({ competencia: ativa.competencia, empresa: { id: ativa.id, cnpj: emp?.cnpj ?? ativa.cnpj, esocialFolha: emp?.esocialFolha, inicios: emp?.parametrosFolha }, fichas, rubricas, horarios, afastamentos, enquadramentos });
            })
            .catch(e => { if (vivo) setErro(`Cadastro não lido: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa, recarga]);

    const d = useMemo(() => (entrada ? diagnosticarCadastro(entrada) : null), [entrada]);
    const itens = (d?.itens ?? []).filter(x => (!filtro || x.area === filtro) && (!soErros || x.nivel === 'erro'));
    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa e um período.</p>;
    const comp = ativa.competencia.split('-').reverse().join('/');

    function planilha() {
        if (!d) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(planilhaDiagnostico(d, ativa!.competencia)), 'Diagnóstico');
        XLSX.writeFile(wb, `diagnostico-esocial-${ativa!.codigoSage || 'empresa'}-${ativa!.competencia}.xlsx`);
    }

    return (
        <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Diagnóstico do cadastro · {comp}</h2>
                    <p className="text-slate-600 dark:text-slate-300">Antes de gerar os eventos: a empresa, os trabalhadores da competência, as rubricas vigentes, os horários e os afastamentos do mês, com as mesmas validações de cada cadastro. Com erro, o evento seria recusado; os avisos não impedem.</p>
                </div>
                <div className="flex gap-2">
                    <button className="rounded border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:text-white" onClick={() => setRecarga(n => n + 1)}>Diagnosticar de novo</button>
                    <button className="rounded border border-slate-300 px-3 py-1.5 disabled:opacity-50 dark:border-slate-600 dark:text-white" disabled={!d} onClick={planilha}>Planilha (Excel)</button>
                </div>
            </div>
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {!d && !erro && <p role="status">Lendo o cadastro…</p>}
            {d && (
                <>
                    <p role="status" aria-label="Resultado do diagnóstico" className={`rounded-lg p-3 text-base font-semibold ${d.apto ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200'}`}>
                        {d.apto ? '✓ Apto' : '✗ Não apto'} · {d.itens.filter(x => x.nivel === 'erro').length} erro(s) · {d.itens.filter(x => x.nivel === 'aviso').length} aviso(s)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-5">
                        {AREAS_DIAGNOSTICO.map(a => (
                            <button key={a} aria-pressed={filtro === a} onClick={() => setFiltro(f => (f === a ? '' : a))}
                                className={`rounded border p-2 text-left ${filtro === a ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'border-slate-200 dark:border-slate-700'} dark:text-slate-100`}>
                                <span className="block font-medium">{a}</span>
                                <span className="text-xs text-slate-500">{d.porArea[a].verificados} verificado(s)</span>
                                <span className={`block text-xs ${d.porArea[a].erros ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>{d.porArea[a].erros} erro(s) · {d.porArea[a].avisos} aviso(s)</span>
                            </button>
                        ))}
                    </div>
                    <label className="flex items-center gap-2 dark:text-slate-100"><input type="checkbox" checked={soErros} onChange={e => setSoErros(e.target.checked)} />Só os erros</label>
                    {itens.length === 0 ? <p className="text-slate-500">Nada a corrigir{filtro ? ` em ${filtro}` : ''}.</p> : (
                        <div className="max-h-[32rem] overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table aria-label="Itens do diagnóstico" className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Situação</th><th className="p-2">Área</th><th className="p-2">Onde</th><th className="p-2">O que corrigir</th></tr></thead>
                                <tbody>{itens.map((x, i) => (
                                    <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100">
                                        <td className={`p-2 font-medium ${x.nivel === 'erro' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>{x.nivel === 'erro' ? 'Erro' : 'Aviso'}</td>
                                        <td className="p-2" title={ONDE[x.area]}>{x.area}</td><td className="p-2">{x.alvo}</td><td className="p-2">{x.mensagem}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    )}
                    <p className="text-xs text-slate-500">Onde corrigir: {AREAS_DIAGNOSTICO.map(a => `${a}: ${ONDE[a]}`).join(' · ')}. O pré-voo (XSD oficial) confere cada evento de novo na hora de transmitir.</p>
                </>
            )}
        </div>
    );
};

export default DiagnosticoCadastroPanel;
