// components/prazos/PrazosPanel.tsx
//
// Painel de prazos do DP (Fase 1, item 3 do plano): vencimentos mensais com
// ajuste de dia útil e os prazos que saem dos cadastros de todas as empresas.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import { listarSindicatos, listarTodosAfastamentos, listarTodosFuncionariosAtivos, mensagemErro } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import { br, diasEntre, somarDias } from '../../services/prazos/calendario';
import { vencimentosNoPeriodo } from '../../services/prazos/obrigacoes';
import { ROTULO_TIPO, prazosFuncionarios, prazosSindicatos, type Prazo, type TipoPrazo } from '../../services/prazos/prazosFuncionarios';

const COR: Record<Prazo['gravidade'], string> = {
    vencido: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    urgente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    normal: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};
const quando = (data: string, hoje: string) => {
    const d = diasEntre(hoje, data);
    return d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d > 0 ? `em ${d} dias` : d === -1 ? 'ontem' : `há ${-d} dias`;
};

interface Props { onAbrirCadastros?: () => void; onAbrirConferencia?: () => void }

const PrazosPanel: React.FC<Props> = ({ onAbrirCadastros, onAbrirConferencia }) => {
    const hoje = new Date().toLocaleDateString('sv-SE'); // data local, AAAA-MM-DD
    const [horizonte, setHorizonte] = useState(60);
    const [empresaId, setEmpresaId] = useState('');
    const [tipo, setTipo] = useState<TipoPrazo | ''>('');
    const [dados, setDados] = useState<{ empresas: Empresa[]; fichas: FichaFuncionario[]; afastamentos: Afastamento[]; sindicatos: Sindicato[] } | null>(null);
    const [erro, setErro] = useState('');

    useEffect(() => {
        Promise.all([listarTodasEmpresas(), listarTodosFuncionariosAtivos(), listarTodosAfastamentos(), listarSindicatos()])
            .then(([empresas, fichas, afastamentos, sindicatos]) => setDados({ empresas, fichas, afastamentos, sindicatos }))
            .catch(e => { setErro(mensagemErro(e)); setDados({ empresas: [], fichas: [], afastamentos: [], sindicatos: [] }); });
    }, []);

    const ate = somarDias(hoje, horizonte);
    const vencimentos = useMemo(() => vencimentosNoPeriodo(somarDias(hoje, -5), ate), [hoje, ate]);
    const nomeEmpresa = useMemo(() => new Map((dados?.empresas ?? []).map(e => [e.id, `${e.codigoSage} · ${e.nomeFantasia || e.razaoSocial}`])), [dados]);
    const prazos = useMemo(() => {
        if (!dados) return [];
        const fichas = dados.fichas.filter(f => !empresaId || f.empresaId === empresaId);
        return [...prazosFuncionarios(fichas, dados.afastamentos, hoje, ate), ...(empresaId ? [] : prazosSindicatos(dados.sindicatos, hoje, ate))]
            .filter(p => !tipo || p.tipo === tipo)
            .sort((a, b) => a.data.localeCompare(b.data) || (a.nome ?? '').localeCompare(b.nome ?? ''));
    }, [dados, empresaId, tipo, hoje, ate]);
    const contagem = prazos.reduce<Record<string, number>>((m, p) => ({ ...m, [p.gravidade]: (m[p.gravidade] ?? 0) + 1 }), {});

    function exportar() {
        const linhas = [
            ...vencimentos.map(v => ({ Data: br(v.data), Tipo: 'Obrigação mensal', Empresa: 'Todas', Funcionário: '', Prazo: v.nome, Detalhe: [v.base, v.observacao].filter(Boolean).join(' · '), Situação: v.data < hoje ? 'passou' : quando(v.data, hoje) })),
            ...prazos.map(p => ({ Data: br(p.data), Tipo: ROTULO_TIPO[p.tipo], Empresa: p.empresaId ? nomeEmpresa.get(p.empresaId) ?? p.empresaId : '', Funcionário: p.fichaId ? p.nome : '', Prazo: p.titulo, Detalhe: p.detalhe, Situação: p.gravidade === 'vencido' ? 'vencido' : quando(p.data, hoje) })),
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Prazos');
        XLSX.writeFile(wb, `prazos-dp-${hoje}.xlsx`);
    }

    const sel = 'rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white';
    return (
        <div className="space-y-5">
            <header>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Prazos do DP</h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Vencimentos do mês com ajuste de dia útil e os prazos que saem dos cadastros de todas as empresas.</p>
            </header>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-800 dark:text-white">Obrigações mensais (todas as empresas)</h3>
                    {onAbrirConferencia && <button className="text-sm text-blue-700 underline dark:text-blue-300" onClick={onAbrirConferencia}>Conferir entrega e pagamento (Conferência pós-folha)</button>}
                </div>
                <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                        <thead className="text-left text-xs text-slate-500 dark:text-slate-400"><tr><th className="p-2">Vence</th><th className="p-2">Obrigação</th><th className="p-2">Competência</th><th className="p-2">Regra</th></tr></thead>
                        <tbody>
                            {vencimentos.map(v => (
                                <tr key={v.id} className={`border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100 ${v.data < hoje ? 'opacity-50' : ''}`}>
                                    <td className="p-2 whitespace-nowrap"><strong>{br(v.data)}</strong><span className="block text-xs text-slate-500">{quando(v.data, hoje)}</span></td>
                                    <td className="p-2">{v.nome}{v.observacao && <span className="block text-xs text-amber-700 dark:text-amber-300">{v.observacao}</span>}</td>
                                    <td className="p-2 font-mono text-xs">{v.competencia.length === 7 ? `${v.competencia.slice(5)}/${v.competencia.slice(0, 4)}` : v.competencia}</td>
                                    <td className="p-2 text-xs text-slate-500 dark:text-slate-400">{v.ajuste === 'antecipa' ? 'dia não útil antecipa' : v.ajuste === 'posterga' ? 'dia não útil adia' : '5º dia útil'} · {v.base}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Feriados considerados: nacionais, Carnaval (segunda e terça) e Sexta-feira Santa. Feriado estadual ou municipal da cidade da empresa pode mudar a data: confira.</p>
            </section>

            <section className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="mr-auto font-semibold text-slate-800 dark:text-white">Prazos dos funcionários e sindicatos</h3>
                    <select className={sel} value={empresaId} onChange={e => setEmpresaId(e.target.value)} aria-label="Empresa">
                        <option value="">Todas as empresas</option>
                        {dados?.empresas.map(e => <option key={e.id} value={e.id}>{e.codigoSage} · {e.nomeFantasia || e.razaoSocial}</option>)}
                    </select>
                    <select className={sel} value={tipo} onChange={e => setTipo(e.target.value as TipoPrazo | '')} aria-label="Tipo de prazo">
                        <option value="">Todos os tipos</option>
                        {(Object.keys(ROTULO_TIPO) as TipoPrazo[]).map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
                    </select>
                    <select className={sel} value={horizonte} onChange={e => setHorizonte(Number(e.target.value))} aria-label="Horizonte">
                        {[30, 60, 90, 180].map(n => <option key={n} value={n}>Próximos {n} dias</option>)}
                    </select>
                    <button className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={exportar}>Exportar Excel</button>
                </div>
                {prazos.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                        {(['vencido', 'urgente', 'normal'] as const).filter(g => contagem[g]).map(g => <span key={g} className={`rounded-full px-2.5 py-1 ${COR[g]}`}>{g === 'vencido' ? 'Vencidos' : g === 'urgente' ? 'Urgentes' : 'No prazo'}: {contagem[g]}</span>)}
                    </div>
                )}
                {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {!dados && <p className="text-sm text-slate-500">Carregando…</p>}
                {dados && !prazos.length && !erro && (
                    <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">
                        Nenhum prazo neste filtro. Os prazos saem dos cadastros: contratos, férias e afastamentos dos funcionários e convenções dos sindicatos.
                        {onAbrirCadastros && <button className="ml-1 text-blue-700 underline dark:text-blue-300" onClick={onAbrirCadastros}>Abrir Cadastros</button>}
                    </p>
                )}
                {prazos.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                        <table className="w-full min-w-[720px] text-sm">
                            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr><th className="p-2">Data</th><th className="p-2">Prazo</th><th className="p-2">Funcionário / sindicato</th><th className="p-2">Empresa</th></tr></thead>
                            <tbody>
                                {prazos.map(p => (
                                    <tr key={p.id} className="border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100">
                                        <td className="p-2 whitespace-nowrap"><strong>{br(p.data)}</strong><span className={`mt-0.5 block w-fit rounded px-1.5 text-xs ${COR[p.gravidade]}`}>{p.gravidade === 'vencido' ? 'vencido' : quando(p.data, hoje)}</span></td>
                                        <td className="p-2"><span className="text-xs text-slate-500">{ROTULO_TIPO[p.tipo]}</span><span className="block font-medium">{p.titulo}</span><span className="block text-xs text-slate-600 dark:text-slate-300">{p.detalhe}</span></td>
                                        <td className="p-2">{p.nome}</td>
                                        <td className="p-2 text-xs">{p.empresaId ? nomeEmpresa.get(p.empresaId) ?? '' : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Férias: períodos de 12 meses desde a admissão, gozo pelos afastamentos com motivo 15 (importe os S-2230 de férias ou lance à mão). Não considera redução por faltas (CLT art. 130) nem perda do direito (art. 133). ASO fica com a medicina do trabalho dos clientes.
                </p>
            </section>
        </div>
    );
};

export default PrazosPanel;
