// components/cadastros/HorariosCadastro.tsx
//
// Arquivos › Horários › Tabela de Horários: jornada semanal por empresa,
// com total, horas noturnas, avisos da CLT e a descrição da jornada no
// formato do S-2200.

import React, { useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import {
    DIAS, NOME_DIA, ROTULO_TIPO, descricaoJornada, hhmm, horarioVazio, idHorario, noturnoReduzido, resumirHorario, validarHorario,
    type Dia, type DiaHorario, type Horario, type TipoDia,
} from '../../services/cadastros/horarios';
import { excluirHorario, mensagemErro, salvarHorario, type Usuario } from '../../services/cadastros/cadastrosService';

interface Props { empresa: Empresa; horarios: Horario[] | null; erroLista: string; usuario: Usuario; isAdmin: boolean; onRecarregar: () => void }

const inp = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

const HorariosCadastro: React.FC<Props> = ({ empresa, horarios, erroLista, usuario, isAdmin, onRecarregar }) => {
    const [edicao, setEdicao] = useState<{ antes: Horario | null; h: Horario } | null>(null);
    const [erros, setErros] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);

    const abrir = (antes: Horario | null) => { setErros([]); setEdicao({ antes, h: antes ? structuredClone(antes) : horarioVazio(empresa.id) }); };
    const setDia = (d: Dia, campo: keyof DiaHorario, v: string) => setEdicao(e => e && ({ ...e, h: { ...e.h, dias: { ...e.h.dias, [d]: { ...e.h.dias[d], [campo]: v } } } }));

    async function salvar() {
        if (!edicao) return;
        const h = { ...edicao.h, codigo: edicao.h.codigo.trim(), descricao: edicao.h.descricao.trim(), observacoes: edicao.h.observacoes.trim() };
        const v = validarHorario(edicao.antes ? h : { ...h, id: '' }, horarios ?? []);
        if (v.erros.length) { setErros(v.erros); return; }
        setSalvando(true);
        try { await salvarHorario(edicao.antes, { ...h, id: edicao.antes?.id ?? idHorario(empresa.id, h.codigo) }, usuario); setEdicao(null); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    async function excluir() {
        if (!edicao?.antes || !window.confirm(`Excluir o horário ${edicao.antes.codigo}? Fichas ligadas a ele ficam sem horário.`)) return;
        setSalvando(true);
        try { await excluirHorario(edicao.antes, usuario); setEdicao(null); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    const r = edicao ? resumirHorario(edicao.h) : null;
    const v = edicao ? validarHorario(edicao.antes ? edicao.h : { ...edicao.h, id: '' }, horarios ?? []) : null;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <button className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white" onClick={() => abrir(null)}>Novo horário</button>
                <p className="text-sm text-slate-600 dark:text-slate-300">Horários desta empresa. Na ficha do funcionário (Ident. Adm.) escolha o horário; as horas semanais são conferidas com o S-2200.</p>
            </div>
            {erroLista && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erroLista}</p>}
            {!horarios && !erroLista && <p className="text-sm text-slate-500">Carregando…</p>}
            {horarios?.length === 0 && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">Nenhum horário cadastrado nesta empresa.</p>}
            {!!horarios?.length && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr><th className="p-2">Código</th><th className="p-2">Descrição</th><th className="p-2">Semanal</th><th className="p-2">Noturno</th><th className="p-2">Jornada</th></tr></thead>
                        <tbody>
                            {horarios.map(h => {
                                const res = resumirHorario(h);
                                return (
                                    <tr key={h.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700" onClick={() => abrir(h)}>
                                        <td className="p-2 font-mono">{h.codigo}</td>
                                        <td className="p-2 font-medium">{h.descricao}</td>
                                        <td className="p-2 font-mono">{hhmm(res.semanal)}</td>
                                        <td className="p-2 font-mono">{res.noturno ? hhmm(res.noturno) : '—'}</td>
                                        <td className="p-2 text-xs text-slate-600 dark:text-slate-300">{descricaoJornada(h)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {edicao && r && v && (
                <div role="dialog" aria-modal="true" aria-label="Horário" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
                    <div className="my-4 w-full max-w-4xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Arquivos › Horários › Tabela de Horários · {empresa.nomeFantasia}</p>
                                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{edicao.antes ? `${edicao.antes.codigo} · ${edicao.antes.descricao}` : 'Novo horário'}</h3>
                            </div>
                            <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={() => setEdicao(null)}>×</button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-4">
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Código</span>
                                <input className={inp} value={edicao.h.codigo} disabled={!!edicao.antes} onChange={e => setEdicao({ ...edicao, h: { ...edicao.h, codigo: e.target.value } })} aria-label="Código do horário" /></label>
                            <label className="block sm:col-span-3"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Descrição</span>
                                <input className={inp} value={edicao.h.descricao} onChange={e => setEdicao({ ...edicao, h: { ...edicao.h, descricao: e.target.value } })} aria-label="Descrição do horário" /></label>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-sm">
                                <thead><tr className="text-left text-xs text-slate-500 dark:text-slate-400"><th className="p-1">Dia</th><th className="p-1">Tipo</th><th className="p-1">Entrada</th><th className="p-1">Saída intervalo</th><th className="p-1">Retorno</th><th className="p-1">Saída</th><th className="p-1">Horas</th></tr></thead>
                                <tbody>
                                    {DIAS.map(d => {
                                        const x = edicao.h.dias[d]; const c = r.porDia[d];
                                        return (
                                            <tr key={d} className="dark:text-slate-100">
                                                <td className="p-1 font-medium">{NOME_DIA[d]}</td>
                                                <td className="p-1"><select className={inp} value={x.tipo} onChange={e => setDia(d, 'tipo', e.target.value as TipoDia)} aria-label={`Tipo ${NOME_DIA[d]}`}>{(Object.keys(ROTULO_TIPO) as TipoDia[]).map(t => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}</select></td>
                                                {(['entrada', 'saidaIntervalo', 'retornoIntervalo', 'saida'] as const).map(k => (
                                                    <td key={k} className="p-1"><input className={inp} type="time" disabled={x.tipo !== 'trabalho'} value={x[k]} onChange={e => setDia(d, k, e.target.value)} aria-label={`${k} ${NOME_DIA[d]}`} /></td>
                                                ))}
                                                <td className={`p-1 font-mono text-xs ${c.erro ? 'text-red-600' : ''}`}>{x.tipo !== 'trabalho' ? '—' : c.erro ? '?' : hhmm(c.trabalhado)}{c.noturno > 0 && <span className="block text-indigo-600 dark:text-indigo-300">not. {hhmm(c.noturno)}</span>}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className="grid gap-2 rounded bg-slate-50 p-3 text-sm sm:grid-cols-3 dark:bg-slate-900 dark:text-slate-100">
                            <p>Total semanal: <strong className="font-mono">{hhmm(r.semanal)}</strong></p>
                            <p>Noturnas (22h–5h): <strong className="font-mono">{hhmm(r.noturno)}</strong>{r.noturno > 0 && <span className="text-xs text-slate-500"> = {hhmm(noturnoReduzido(r.noturno))} em hora reduzida</span>}</p>
                            <p>Dias de trabalho: <strong>{r.diasTrabalho}</strong></p>
                            <p className="sm:col-span-3 text-xs text-slate-600 dark:text-slate-300">Descrição da jornada (S-2200): <span className="font-mono">{descricaoJornada(edicao.h)}</span></p>
                        </div>
                        <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Observações (acordo de compensação, escala, norma coletiva)</span>
                            <textarea className={inp} rows={2} value={edicao.h.observacoes} onChange={e => setEdicao({ ...edicao, h: { ...edicao.h, observacoes: e.target.value } })} aria-label="Observações do horário" /></label>
                        {v.avisos.length > 0 && <ul className="list-disc rounded bg-amber-50 p-2 pl-6 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">{v.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
                        {erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
                        <div className="flex justify-between gap-2">
                            <div>{edicao.antes && isAdmin && <button className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 dark:text-red-300" disabled={salvando} onClick={excluir}>Excluir</button>}</div>
                            <div className="flex gap-2">
                                <button className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={() => setEdicao(null)}>Cancelar</button>
                                <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={salvando} onClick={salvar}>{salvando ? 'Gravando…' : 'Gravar'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HorariosCadastro;
