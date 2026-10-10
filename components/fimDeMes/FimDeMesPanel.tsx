// components/fimDeMes/FimDeMesPanel.tsx
//
// Fim de mês da empresa ativa: lista de conferência e encerramento da competência; período encerrado fica
// somente leitura e só o gestor do DP reabre (direto ou aprovando o pedido de quem trabalha na empresa).

import React, { useCallback, useEffect, useState } from 'react';
import type { User } from '../../types';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { ehMaster, papelEfetivo } from '../../services/auth/papeis';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import {
    checklistCompleto, competenciasPendentes, ITENS_FECHAMENTO, podeEncerrar, situacaoDe,
    type Fechamento, type PedidoReabertura,
} from '../../services/fimDeMes/fechamento';
import {
    encerrarPeriodo, lerFechamento, listarFechamentos, listarPedidosDaEmpresa, listarPedidosPendentes, pedirReabertura, reabrirPeriodo, recusarPedido,
} from '../../services/fimDeMes/fechamentoService';

import { SeloSituacao } from './SeloSituacao';
import { lerFolhaGravada } from '../../services/calculo/folhaGravadaService';
import type { FolhaGravada } from '../../services/calculo/folhaGravada';
import { motorHomologadoNoMes, type ParametrosFolha } from '../../services/calculo/arredondamento';
import { reais } from '../../services/cadastros/documentos';

const br = (c: string) => c.split('-').reverse().join('/');
const quando = (d?: Date) => (d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
const card = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900';
const btnP = 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50';
const btnS = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const area = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100';


interface Props { currentUser: User; sub?: 'fechamento' | 'pedidos'; onMudou?: () => void }

const FimDeMesPanel: React.FC<Props> = ({ currentUser, sub = 'fechamento', onMudou }) => {
    const { ativa } = useEmpresaAtiva();
    const usuario: Usuario = { id: currentUser.uid ?? currentUser.id, email: currentUser.email };
    const gestor = ehMaster(currentUser.email) || papelEfetivo(currentUser.role) === 'gestor';
    const hoje = new Date().toLocaleDateString('sv-SE');

    const [fech, setFech] = useState<Fechamento | null | undefined>(undefined);
    const [todos, setTodos] = useState<Fechamento[]>([]);
    const [desde, setDesde] = useState<string | undefined>();
    const [parametros, setParametros] = useState<ParametrosFolha | undefined>();
    const [gravada, setGravada] = useState<FolhaGravada | null | undefined>(undefined);
    const [pedidos, setPedidos] = useState<PedidoReabertura[] | null>(null);
    const [check, setCheck] = useState<Record<string, boolean>>({});
    const [motivo, setMotivo] = useState('');
    const [resposta, setResposta] = useState<Record<string, string>>({});
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');
    const [ocupado, setOcupado] = useState(false);

    const carregar = useCallback(async () => {
        if (!ativa) return;
        setErro('');
        try {
            const [f, l, emps, ps, g] = await Promise.all([
                lerFechamento(ativa.id, ativa.competencia), listarFechamentos(ativa.id), listarEmpresasVisiveis(),
                sub === 'pedidos' && gestor ? listarPedidosPendentes() : listarPedidosDaEmpresa(ativa.id),
                lerFolhaGravada(ativa.id, ativa.competencia).catch(() => null),
            ]);
            setFech(f); setTodos(l); setPedidos(ps); setGravada(g);
            const pf = emps.find(e => e.id === ativa.id)?.parametrosFolha;
            setParametros(pf); setDesde(pf?.motorHomologado?.desde);
            setCheck(f?.situacao === 'reaberto' ? {} : f?.checklist ?? {});
        } catch (e) { setErro(mensagemErro(e)); setFech(null); setPedidos([]); }
    }, [ativa, sub, gestor]);
    useEffect(() => { void carregar(); }, [carregar]);

    const agir = async (f: () => Promise<string | void>) => {
        setOcupado(true); setErro(''); setAviso('');
        try { const m = await f(); if (m) setAviso(m); await carregar(); onMudou?.(); } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
    };

    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa e um período.</p>;
    const situacao = situacaoDe(fech);
    const pendentes = competenciasPendentes(desde, todos, hoje).filter(c => c !== ativa.competencia);
    const pedidoAberto = (pedidos ?? []).find(p => p.empresaId === ativa.id && p.competencia === ativa.competencia && p.situacao === 'pendente');
    const comp = br(ativa.competencia);
    // Motor ativo na competência: o encerramento exige a folha gravada no Cálculo (os holerites guardados).
    const exigeFolha = motorHomologadoNoMes(parametros, ativa.competencia);
    const faltaFolha = exigeFolha && !gravada;

    const mensagens = (
        <>
            {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {aviso && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{aviso}</p>}
        </>
    );

    if (sub === 'pedidos') {
        return (
            <div className="space-y-4">
                {mensagens}
                <section className={card}>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">{gestor ? 'Pedidos aguardando o gestor (todas as empresas)' : `Pedidos de reabertura — ${ativa.nome}`}</h2>
                    {pedidos === null ? <p className="mt-2 text-sm text-slate-500">Carregando…</p> : pedidos.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhum pedido.</p> : (
                        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                            {pedidos.map(p => (
                                <li key={p.id} className="py-3 text-sm">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <strong className="text-slate-900 dark:text-white">{p.empresaNome || p.empresaId}</strong>
                                        <span className="font-mono">{br(p.competencia)}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs ${p.situacao === 'pendente' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : p.situacao === 'aprovado' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>{p.situacao}</span>
                                        <span className="text-xs text-slate-500">por {p.pedidoPorEmail}{p.pedidoEm ? ` em ${quando(p.pedidoEm)}` : ''}</span>
                                    </div>
                                    <p className="mt-1 text-slate-700 dark:text-slate-300">Motivo: {p.motivo}</p>
                                    {p.situacao !== 'pendente' && <p className="mt-1 text-xs text-slate-500">{p.situacao === 'aprovado' ? 'Aprovado' : 'Recusado'} por {p.decididoPorEmail}{p.resposta ? `: ${p.resposta}` : ''}</p>}
                                    {gestor && p.situacao === 'pendente' && (
                                        <div className="mt-2 flex flex-wrap items-end gap-2">
                                            <button className={btnP} disabled={ocupado} onClick={() => agir(async () => { await reabrirPeriodo(p.empresaId, p.competencia, p.motivo, usuario, p.id); return `${br(p.competencia)} de ${p.empresaNome} reaberta.`; })}>Aprovar e reabrir</button>
                                            <input aria-label={`Resposta ao pedido de ${p.empresaNome}`} placeholder="Motivo da recusa" className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" value={resposta[p.id] ?? ''} onChange={e => setResposta(r => ({ ...r, [p.id]: e.target.value }))} />
                                            <button className={btnS} disabled={ocupado || !(resposta[p.id] ?? '').trim()} onClick={() => agir(async () => { await recusarPedido(p.id, resposta[p.id].trim(), usuario); return 'Pedido recusado.'; })}>Recusar</button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {mensagens}
            {pendentes.length > 0 && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                    Fim de mês pendente nesta empresa: {pendentes.map(br).join(', ')}. Ative cada competência (Trocar) e encerre.
                </p>
            )}
            <section className={card}>
                <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Competência {comp}</h2>
                    {fech !== undefined && <SeloSituacao situacao={situacao} />}
                    {fech?.encerradoPorEmail && situacao === 'encerrado' && <span className="text-xs text-slate-500">Encerrada por {fech.encerradoPorEmail}{fech.encerradoEm ? ` em ${quando(fech.encerradoEm)}` : ''}</span>}
                </div>
                {situacao === 'reaberto' && fech && (
                    <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                        Reaberta por {fech.reabertoPorEmail}{fech.reabertoEm ? ` em ${quando(fech.reabertoEm)}` : ''}. Motivo: {fech.motivoReabertura}. Faça a alteração e encerre de novo.
                    </p>
                )}
                {fech === undefined ? <p className="mt-3 text-sm text-slate-500">Carregando…</p> : (
                    <>
                        <p className={`mt-3 rounded-lg p-3 text-sm ${gravada ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-100' : exigeFolha ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100' : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {gravada ? `📁 Folha gravada por ${gravada.gravadoPorEmail}${gravada.gravadoEm ? ` em ${quando(gravada.gravadoEm)}` : ''}: ${gravada.totais.funcionarios} holerite(s), líquido ${reais(gravada.totais.liquido)}. Encerrada a competência, valem estes valores.`
                                : exigeFolha ? 'Folha do mês ainda não gravada. Em Folha do mês › Cálculo mensal, salve o movimento e clique em "Gravar a folha do mês" antes de encerrar.'
                                : 'Motor de cálculo não ativo nesta competência: a folha oficial é a do IOB (não há folha gravada no Consultor).'}
                        </p>
                        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                            {ITENS_FECHAMENTO.map(i => (
                                <li key={i.id}>
                                    <label className={`flex h-full gap-3 rounded-lg border p-3 text-sm ${check[i.id] ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-900/10' : 'border-slate-200 dark:border-slate-700'}`}>
                                        <input type="checkbox" className="mt-0.5 h-4 w-4" aria-label={i.rotulo} checked={!!check[i.id]} disabled={situacao === 'encerrado'}
                                            onChange={e => setCheck(c => ({ ...c, [i.id]: e.target.checked }))} />
                                        <span><span className="block font-medium text-slate-900 dark:text-white">{i.rotulo}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{i.detalhe}</span></span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                        {situacao !== 'encerrado' ? (
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button className={btnP} disabled={ocupado || !checklistCompleto(check) || !podeEncerrar(ativa.competencia, hoje) || faltaFolha}
                                    title={!podeEncerrar(ativa.competencia, hoje) ? 'Competência futura: ainda não dá para encerrar.' : faltaFolha ? 'Grave a folha do mês no Cálculo antes de encerrar.' : !checklistCompleto(check) ? 'Confira todos os itens antes de encerrar.' : undefined}
                                    onClick={() => { if (window.confirm(`Encerrar ${comp} de ${ativa.nome}? Movimentos e afastamentos do mês ficam somente leitura; alterar depois exige o gestor do DP.`)) void agir(async () => { await encerrarPeriodo(ativa.id, ativa.competencia, check, usuario); return `${comp} encerrada.`; }); }}>
                                    Encerrar {comp}
                                </button>
                                <span className="text-xs text-slate-500">Depois de encerrada, a competência fica somente leitura.</span>
                            </div>
                        ) : (
                            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{gestor ? 'Reabrir a competência' : 'Precisa alterar algo?'}</h3>
                                {pedidoAberto && !gestor ? (
                                    <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">Pedido de reabertura enviado por {pedidoAberto.pedidoPorEmail}, aguardando o gestor. Motivo: {pedidoAberto.motivo}</p>
                                ) : (
                                    <>
                                        <label className="mt-1 block text-xs text-slate-600 dark:text-slate-300">Motivo (o que precisa ser alterado e por quê)
                                            <textarea aria-label="Motivo da reabertura" rows={2} className={area} value={motivo} onChange={e => setMotivo(e.target.value)} />
                                        </label>
                                        <button className={`mt-2 ${gestor ? btnP : btnS}`} disabled={ocupado || motivo.trim().length < 10}
                                            title={motivo.trim().length < 10 ? 'Descreva o motivo (pelo menos 10 letras).' : undefined}
                                            onClick={() => agir(async () => {
                                                if (gestor) { await reabrirPeriodo(ativa.id, ativa.competencia, motivo.trim(), usuario); setMotivo(''); return `${comp} reaberta.`; }
                                                const r = await pedirReabertura({ empresaId: ativa.id, empresaNome: ativa.nome, cnpj: ativa.cnpj, competencia: ativa.competencia, motivo: motivo.trim() }, usuario);
                                                setMotivo('');
                                                return r.erroEmail ? `Pedido registrado; o gestor verá no Consultor (o e-mail não saiu: ${r.erroEmail}).` : 'Pedido enviado ao gestor do DP (no Consultor e por e-mail).';
                                            })}>
                                            {gestor ? `Reabrir ${comp}` : 'Solicitar reabertura ao gestor'}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                )}
            </section>

            <section className={card}>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Histórico da empresa</h2>
                {todos.length === 0 ? <p className="mt-2 text-sm text-slate-500">Nenhuma competência encerrada ainda.</p> : (
                    <table className="mt-3 w-full text-sm">
                        <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Competência</th><th className="py-1">Situação</th><th className="py-1">Último registro</th></tr></thead>
                        <tbody>{todos.map(f => {
                            const ult = f.historico?.[f.historico.length - 1];
                            return (
                                <tr key={f.id} className="border-t border-slate-100 dark:border-slate-800">
                                    <td className="py-1.5 font-mono">{br(f.competencia)}</td>
                                    <td className="py-1.5"><SeloSituacao situacao={f.situacao} /></td>
                                    <td className="py-1.5 text-xs text-slate-500">{ult ? `${ult.acao === 'encerrado' ? 'Encerrada' : 'Reaberta'} por ${ult.porEmail} em ${new Date(ult.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${ult.motivo ? ` — ${ult.motivo}` : ''}` : ''}</td>
                                </tr>
                            );
                        })}</tbody>
                    </table>
                )}
            </section>
        </div>
    );
};

export default FimDeMesPanel;
