// components/folha/ConsignadoRepassePanel.tsx
//
// Folha do mês › Crédito do Trabalhador: o repasse do consignado da competência (etapa 4 do estudo). Lê a folha e as
// rescisões gravadas, mostra por trabalhador e contrato o devido, o descontado e o motivo, o total por instituição e o
// vencimento da guia do FGTS Digital; exporta em Excel. Acima, a importação do arquivo do Portal (etapa 3).

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import { lerFolhaGravada } from '../../services/calculo/folhaGravadaService';
import { lerProcesso } from '../../services/calculo/processosGravadosService';
import { repasseConsignado, ROTULO_SITUACAO_REPASSE } from '../../services/calculo/repasseConsignado';
import ConsignadoImportacao from './ConsignadoImportacao';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const th = 'px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300';
const td = 'px-2 py-1 align-top';
const reais = (c: number | null) => (c === null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const br = (d: string) => d.split('-').reverse().join('/');
/** Hoje na data local (não em UTC): à noite, no Brasil, o UTC já é o dia seguinte e daria a guia por vencida antes da hora. */
const hojeLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ConsignadoRepassePanel: React.FC<{ usuario?: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [periodo, setPeriodo] = useState(ativa?.competencia ?? '');
    // Fichas e cálculos marcados com a empresa (e a competência) de origem: o relatório só sai quando os dois são da empresa ativa.
    const [fichas, setFichas] = useState<{ empresaId: string; lista: FichaFuncionario[] } | null>(null);
    const [dados, setDados] = useState<{ empresaId: string; periodo: string; folha: ResultadoCalculo[]; rescisoes: ResultadoCalculo[] } | null>(null);
    const [erro, setErro] = useState('');
    const [recarga, setRecarga] = useState(0);

    useEffect(() => { if (ativa?.competencia) setPeriodo(ativa.competencia); }, [ativa?.competencia]);
    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        const id = ativa.id;
        setFichas(null);
        listarFuncionarios(id).then(fs => { if (vivo) setFichas({ empresaId: id, lista: fs }); }).catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa, recarga]);
    useEffect(() => {
        if (!ativa || !/^\d{4}-\d{2}$/.test(periodo)) return;
        let vivo = true;
        setDados(null); setErro('');
        const id = ativa.id;
        Promise.all([lerFolhaGravada(id, periodo), lerProcesso(id, 'rescisao', periodo)])
            .then(([f, r]) => { if (vivo) setDados({ empresaId: id, periodo, folha: f?.holerites ?? [], rescisoes: r?.holerites ?? [] }); })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa, periodo]);

    const repasse = useMemo(() => (ativa && dados && fichas && dados.empresaId === ativa.id && fichas.empresaId === ativa.id && dados.periodo === periodo
        ? repasseConsignado(periodo, fichas.lista, dados.folha, dados.rescisoes, hojeLocal()) : null), [ativa, dados, fichas, periodo]);
    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa.</p>;

    function exportar() {
        if (!repasse) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['Código', 'Nome', 'CPF', 'Instituição', 'Contrato', 'Devido', 'Descontado', 'Situação', 'Motivo'],
            ...repasse.linhas.map(l => [l.codigo, l.nome, l.cpf, l.instFinanc, l.nrDoc, l.devido === null ? '' : l.devido / 100, l.descontado / 100, ROTULO_SITUACAO_REPASSE[l.situacao], l.motivo]),
        ]), 'Repasse');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['Instituição', 'Contratos', 'Valor'], ...repasse.porInstituicao.map(i => [i.instFinanc, i.contratos, i.valor / 100]), ['Total', '', repasse.total / 100],
            [], ['Vencimento da guia do FGTS Digital', br(repasse.vencimento)],
        ]), 'Por instituição');
        XLSX.writeFile(wb, `consignado-${ativa!.codigoSage || 'empresa'}-${periodo}.xlsx`);
    }

    return (
        <div className="space-y-4 text-sm dark:text-slate-100">
            <div>
                <h2 className="text-lg font-semibold">Crédito do Trabalhador: repasse da competência</h2>
                <p className="text-slate-600 dark:text-slate-300">O consignado descontado na folha e nas rescisões gravadas, por trabalhador e contrato, com o motivo de cada diferença. O valor vai na guia do FGTS Digital (lido do S-5003) até o dia 20 do mês seguinte. Os contratos ficam na ficha do funcionário, aba Consignado, conferidos com o arquivo do Portal Emprega Brasil.</p>
            </div>
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            <div className="flex flex-wrap items-end gap-2">
                <label>Competência<input aria-label="Competência do repasse" type="month" className={`block ${inp}`} value={periodo} onChange={e => setPeriodo(e.target.value)} /></label>
                <button className={btn} disabled={!repasse?.linhas.length} onClick={exportar}>Exportar Excel</button>
            </div>
            {/^\d{4}-\d{2}$/.test(periodo) && fichas?.empresaId === ativa.id && (
                <ConsignadoImportacao empresaId={ativa.id} cnpj={ativa.cnpj} competencia={periodo} fichas={fichas.lista} usuario={usuario} onGravado={() => setRecarga(n => n + 1)} />
            )}
            {!repasse ? <p className="text-slate-500">Carregando…</p> : !repasse.linhas.length ? (
                <p className="text-slate-500">Nenhum contrato do Crédito do Trabalhador vigente nem desconto de consignado na competência.</p>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-sm border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs text-slate-500">Total na guia do FGTS Digital</p><p className="text-lg font-semibold">{reais(repasse.total)}</p>{repasse.totalDae > 0 && <p className="text-xs text-slate-500">Domésticos (DAE): {reais(repasse.totalDae)}</p>}</div>
                        <div className="rounded-sm border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs text-slate-500">Guia do FGTS Digital até</p><p className={`text-lg font-semibold ${repasse.vencido ? 'text-red-700 dark:text-red-300' : ''}`}>{br(repasse.vencimento)}{repasse.vencido ? ' (vencida)' : ''}</p></div>
                        <div className="rounded-sm border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs text-slate-500">Por instituição</p>
                            {repasse.porInstituicao.length ? repasse.porInstituicao.map(i => <p key={i.instFinanc}>{i.instFinanc}: {reais(i.valor)} ({i.contratos} contrato{i.contratos > 1 ? 's' : ''})</p>) : <p>—</p>}</div>
                    </div>
                    <ul className="list-disc space-y-1 pl-5 text-slate-700 dark:text-slate-300">{repasse.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
                    <div className="overflow-x-auto"><table className="min-w-full text-sm">
                        <thead><tr><th className={th}>Código</th><th className={th}>Nome</th><th className={th}>Instituição</th><th className={th}>Contrato</th><th className={th}>Devido</th><th className={th}>Descontado</th><th className={th}>Situação</th><th className={th}>Motivo</th></tr></thead>
                        <tbody>{repasse.linhas.map((l, i) => (
                            <tr key={`${l.fichaId}-${l.nrDoc}-${i}`} className="border-t border-slate-100 dark:border-slate-700">
                                <td className={td}>{l.codigo}</td><td className={td}>{l.nome}</td><td className={td}>{l.instFinanc}</td><td className={td}>{l.nrDoc}</td>
                                <td className={td}>{reais(l.devido)}</td><td className={td}>{reais(l.descontado)}</td>
                                <td className={`${td} whitespace-nowrap ${l.situacao === 'total' ? 'text-green-700 dark:text-green-300' : l.situacao === 'sem-calculo' || l.situacao === 'fora-da-ficha' ? 'text-red-700 dark:text-red-300' : ''}`}>{ROTULO_SITUACAO_REPASSE[l.situacao]}</td>
                                <td className={`${td} text-xs text-slate-600 dark:text-slate-300`}>{l.motivo}</td>
                            </tr>))}</tbody>
                    </table></div>
                </>
            )}
        </div>
    );
};

export default ConsignadoRepassePanel;
