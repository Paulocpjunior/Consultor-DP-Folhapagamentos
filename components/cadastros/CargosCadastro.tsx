// components/cadastros/CargosCadastro.tsx
//
// Cadastro de Cargos do SAGE (Arquivos › Cargos / Carreira › Cargos), por empresa: a lista (Pesquisa), o
// cadastro de cada cargo como a tela do SAGE e as fichas cujo cargo ou CBO não batem com o cadastro. A ficha
// do funcionário escolhe o cargo pelo código e recebe o nome e o CBO; ficha gravada só muda pela própria ficha.

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { criarCargos, excluirCargo, listarFuncionarios, mensagemErro, salvarCargo, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import {
    ACUMULOS_CARGO, SITUACOES_CARGO, TEMPOS_ESPECIAIS, cargoVazio, cargosDasFichas, cboFormatado, contarPorCargo, divergenciasDeCargo, normalizarCargo, validarCargo,
    type AcumuloCargo, type Cargo, type SituacaoCargo, type TempoEspecial,
} from '../../services/cadastros/cargos';

interface Props { empresa: Empresa; cargos: Cargo[] | null; erroLista: string; usuario: Usuario; isAdmin: boolean; onRecarregar: () => void }

const inp = 'w-full rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800';
const rot = 'text-xs font-medium text-slate-600 dark:text-slate-300';
const mesBr = (m: string) => (m ? `${m.slice(5)}/${m.slice(0, 4)}` : '');
const CAMPO_DIV = { cargo: 'Cargo', cbo: 'CBO', codigo: 'Código' } as const;

const CargosCadastro: React.FC<Props> = ({ empresa, cargos, erroLista, usuario, isAdmin, onRecarregar }) => {
    const [fichas, setFichas] = useState<FichaFuncionario[] | null>(null);
    const [busca, setBusca] = useState('');
    const [edicao, setEdicao] = useState<{ antes: Cargo | null; c: Cargo } | null>(null);
    const [erros, setErros] = useState<string[]>([]);
    const [msg, setMsg] = useState('');
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        let vivo = true;
        listarFuncionarios(empresa.id).then(f => { if (vivo) setFichas(f); }).catch(() => { if (vivo) setFichas([]); });
        return () => { vivo = false; };
    }, [empresa.id]);

    const lista = cargos ?? [];
    const contagem = useMemo(() => contarPorCargo(fichas ?? []), [fichas]);
    const dasFichas = useMemo(() => (fichas && cargos ? cargosDasFichas(fichas, cargos, empresa.id) : { cargos: [], avisos: [] }), [fichas, cargos, empresa.id]);
    const divergencias = useMemo(() => (fichas && cargos ? divergenciasDeCargo(fichas, cargos) : []), [fichas, cargos]);
    const filtrados = lista.filter(c => !busca.trim() || `${c.codigo} ${c.nome} ${c.descricao} ${c.cbo} ${c.funcao}`.toLowerCase().includes(busca.trim().toLowerCase()));

    const set = (m: Partial<Cargo>) => setEdicao(e => e && ({ ...e, c: { ...e.c, ...m } }));
    const abrir = (antes: Cargo | null) => { setErros([]); setMsg(''); setEdicao({ antes, c: antes ? { ...antes, atividades: [...antes.atividades] } : cargoVazio(empresa.id) }); };

    async function gravar() {
        if (!edicao) return;
        const n = normalizarCargo(edicao.c);
        const v = validarCargo(n, lista);
        if (v.length) { setErros(v); return; }
        setSalvando(true); setErros([]);
        try { await salvarCargo(edicao.antes, n, usuario); setEdicao(null); setMsg(`Cargo ${n.codigo} gravado.`); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    async function excluir() {
        if (!edicao?.antes) return;
        const usados = contagem.get(edicao.antes.codigo) ?? 0;
        if (!window.confirm(`Excluir o cargo ${edicao.antes.codigo} (${edicao.antes.nome})?${usados ? `\n\n${usados} funcionário(s) estão com este cargo: as fichas não mudam, mas o código fica sem cadastro.` : ''}\n\nA exclusão fica no histórico.`)) return;
        setSalvando(true);
        try { await excluirCargo(edicao.antes, usuario); setEdicao(null); setMsg('Cargo excluído.'); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    async function criarDasFichas() {
        const novos = dasFichas.cargos;
        if (!novos.length || !window.confirm(`Criar ${novos.length} cargo(s) com o código, o nome e o CBO que estão nas fichas?\n\n${novos.map(c => `${c.codigo} · ${c.nome} · CBO ${cboFormatado(c.cbo)}`).join('\n')}`)) return;
        setSalvando(true); setErros([]);
        try { await criarCargos(novos, usuario, 'fichas dos funcionários'); setMsg(`${novos.length} cargo(s) criados pelas fichas.`); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    const e = edicao?.c;
    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
                Cargos da empresa, como no SAGE. Na ficha do funcionário (aba Ident. Adm.), o "Código do cargo" escolhe o cargo daqui e traz o nome e o CBO, que vão ao S-2200 e ao S-2206.
                O eSocial não tem mais a tabela de cargos (S-1030): o cadastro é do Consultor.
            </p>
            <div className="flex flex-wrap items-end gap-2">
                <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-sm font-medium text-white" onClick={() => abrir(null)}>Novo cargo</button>
                {dasFichas.cargos.length > 0 && <button className="rounded-sm border border-blue-700 px-3 py-1.5 text-sm text-blue-800 disabled:opacity-50 dark:text-blue-200" disabled={salvando} onClick={criarDasFichas}>Criar pelos cargos das fichas ({dasFichas.cargos.length})</button>}
                <label className="ml-auto block w-full sm:w-72"><span className={rot}>Pesquisa</span>
                    <input className={inp} value={busca} onChange={x => setBusca(x.target.value)} placeholder="Código, cargo, CBO ou função" aria-label="Pesquisar cargo" /></label>
            </div>
            {dasFichas.avisos.length > 0 && <ul className="list-disc rounded-sm bg-amber-50 p-2 pl-6 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">{dasFichas.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
            {msg && <p role="status" className="rounded-sm bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erroLista && <p role="alert" className="rounded-sm bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erroLista}</p>}
            {!cargos && !erroLista && <p className="text-sm text-slate-500">Carregando…</p>}
            {cargos && !lista.length && <p className="text-sm text-slate-500">Nenhum cargo cadastrado nesta empresa. A restauração do backup do SAGE traz a tabela de cargos; ou crie pelos cargos das fichas.</p>}
            {filtrados.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <tr><th className="p-2">Código</th><th className="p-2">Cargo</th><th className="p-2">C.B.O.</th><th className="p-2">Validade</th><th className="p-2 text-right">Funcionários</th><th className="p-2">Situação</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filtrados.map(c => (
                                <tr key={c.id} className="cursor-pointer hover:bg-blue-50 dark:text-slate-100 dark:hover:bg-slate-700" onClick={() => abrir(c)}>
                                    <td className="p-2 tabular-nums"><button className="text-blue-700 underline dark:text-blue-300" onClick={x => { x.stopPropagation(); abrir(c); }}>{c.codigo}</button></td>
                                    <td className="p-2">{c.nome}{c.funcao && c.funcao !== c.nome ? <span className="block text-xs text-slate-500">Função: {c.funcao}</span> : null}</td>
                                    <td className="p-2 tabular-nums">{cboFormatado(c.cbo)}</td>
                                    <td className="p-2 text-xs">{c.inicioValidade ? `desde ${mesBr(c.inicioValidade)}` : '—'}{c.finalValidade ? ` até ${mesBr(c.finalValidade)}` : ''}</td>
                                    <td className="p-2 text-right tabular-nums">{contagem.get(c.codigo) ?? 0}</td>
                                    <td className="p-2 text-xs">{c.inativo ? 'Inativo' : 'Ativo'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {divergencias.length > 0 && (
                <section aria-label="Fichas com cargo diferente do cadastro" className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                    <p className="font-medium">Fichas com o cargo diferente do cadastro ({divergencias.length})</p>
                    <p className="text-xs">Nada muda sozinho: abra a ficha (Funcionários › Ident. Adm.) e escolha o cargo de novo para trazer o nome e o CBO do cadastro, ou corrija o cargo aqui.</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                        {divergencias.map(d => <li key={`${d.fichaId}-${d.campo}`}>{d.nome} · {CAMPO_DIV[d.campo]}: {d.campo === 'codigo' ? `${d.naFicha} não está no cadastro` : `na ficha "${d.naFicha || '—'}", no cargo ${d.codigo} "${d.campo === 'cbo' ? cboFormatado(d.noCadastro) : d.noCadastro}"`}</li>)}
                    </ul>
                </section>
            )}

            {edicao && e && (
                <div role="dialog" aria-modal="true" aria-label="Cadastro de cargo" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
                    <div className="my-4 w-full max-w-3xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                        <div className="flex items-start justify-between">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Cadastro de Cargos{edicao.antes ? ` — ${edicao.antes.codigo}` : ' — novo'}</h3>
                            <button aria-label="Fechar" className="rounded-sm px-2 text-xl text-slate-500" onClick={() => setEdicao(null)}>×</button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[8rem_1fr_auto]">
                            <label className="block"><span className={rot}>Código</span>
                                <input className={inp} value={e.codigo} disabled={!!edicao.antes} onChange={x => set({ codigo: x.target.value })} aria-label="Código do cargo" placeholder="000001" /></label>
                            <label className="block"><span className={rot}>Cargo</span>
                                <input className={inp} value={e.nome} maxLength={100} onChange={x => set({ nome: x.target.value })} aria-label="Nome do cargo" placeholder="ASSISTENTE ADM II" /></label>
                            <label className="flex items-center gap-1 self-end pb-2 text-sm dark:text-slate-200"><input type="checkbox" checked={e.inativo} onChange={x => set({ inativo: x.target.checked })} />Inativo</label>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem]">
                            <label className="block"><span className={rot}>Descrição (relatórios; vazio = o cargo)</span>
                                <input className={inp} value={e.descricao} onChange={x => set({ descricao: x.target.value })} aria-label="Descrição para relatórios" /></label>
                            <label className="block"><span className={rot}>Início validade</span>
                                <input className={inp} type="month" value={e.inicioValidade} onChange={x => set({ inicioValidade: x.target.value })} aria-label="Início da validade" /></label>
                            <label className="block"><span className={rot}>Final validade</span>
                                <input className={inp} type="month" value={e.finalValidade} onChange={x => set({ finalValidade: x.target.value })} aria-label="Final da validade" /></label>
                        </div>
                        <fieldset className="space-y-2 rounded-sm border border-slate-200 p-2 dark:border-slate-700">
                            <label className="flex items-center gap-1 text-sm dark:text-slate-200"><input type="checkbox" checked={e.cargoPublico} onChange={x => set({ cargoPublico: x.target.checked })} />Cargo/Emprego público</label>
                            {e.cargoPublico && (
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <label className="block"><span className={rot}>Nº Lei</span><input className={inp} value={e.nrLei} onChange={x => set({ nrLei: x.target.value })} aria-label="Número da lei" /></label>
                                    <label className="block"><span className={rot}>Data da Lei</span><input className={inp} type="date" value={e.dtLei} onChange={x => set({ dtLei: x.target.value })} aria-label="Data da lei" /></label>
                                    <label className="block"><span className={rot}>Situação</span>
                                        <select className={inp} value={e.situacao} onChange={x => set({ situacao: x.target.value as SituacaoCargo })} aria-label="Situação do cargo">
                                            <option value="">—</option>{Object.entries(SITUACOES_CARGO).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}</select></label>
                                    <label className="block"><span className={rot}>Acúmulo de Cargos</span>
                                        <select className={inp} value={e.acumulo} onChange={x => set({ acumulo: x.target.value as AcumuloCargo })} aria-label="Acúmulo de cargos">
                                            <option value="">—</option>{Object.entries(ACUMULOS_CARGO).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}</select></label>
                                    <label className="block"><span className={rot}>Dedicação Exclusiva</span>
                                        <select className={inp} value={e.dedicacaoExclusiva} onChange={x => set({ dedicacaoExclusiva: x.target.value as Cargo['dedicacaoExclusiva'] })} aria-label="Dedicação exclusiva">
                                            <option value="">—</option><option value="S">Sim</option><option value="N">Não</option></select></label>
                                    <label className="block"><span className={rot}>Tempo Especial</span>
                                        <select className={inp} value={e.tempoEspecial} onChange={x => set({ tempoEspecial: x.target.value as TempoEspecial })} aria-label="Tempo especial">
                                            <option value="">—</option>{Object.entries(TEMPOS_ESPECIAIS).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}</select></label>
                                </div>
                            )}
                        </fieldset>
                        <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
                            <label className="block"><span className={rot}>C.B.O.</span>
                                <input className={inp} value={e.cbo} inputMode="numeric" onChange={x => set({ cbo: x.target.value.replace(/[^\d-]/g, '').slice(0, 7) })} aria-label="CBO do cargo" placeholder="4110-10" /></label>
                            <label className="block"><span className={rot}>Função</span>
                                <input className={inp} value={e.funcao} onChange={x => set({ funcao: x.target.value })} aria-label="Função do cargo" /></label>
                        </div>
                        <div className="space-y-1">
                            <span className={rot}>Atividades desempenhadas</span>
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-xs text-slate-500 dark:text-slate-400"><th className="w-28 p-1">Código</th><th className="p-1">Descrição</th><th /></tr></thead>
                                <tbody>
                                    {e.atividades.map((a, i) => (
                                        <tr key={i}>
                                            <td className="p-1"><input className={inp} value={a.codigo} onChange={x => set({ atividades: e.atividades.map((y, j) => (j === i ? { ...y, codigo: x.target.value } : y)) })} aria-label={`Código da atividade ${i + 1}`} /></td>
                                            <td className="p-1"><input className={inp} value={a.descricao} onChange={x => set({ atividades: e.atividades.map((y, j) => (j === i ? { ...y, descricao: x.target.value } : y)) })} aria-label={`Descrição da atividade ${i + 1}`} /></td>
                                            <td className="p-1"><button className="text-xs text-red-600 underline" onClick={() => set({ atividades: e.atividades.filter((_, j) => j !== i) })}>Remover</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button className="rounded-sm border border-slate-300 px-3 py-1 text-sm dark:border-slate-600 dark:text-white" onClick={() => set({ atividades: [...e.atividades, { codigo: '', descricao: '' }] })}>Adicionar atividade</button>
                        </div>
                        {edicao.antes && <p className="text-xs text-slate-500 dark:text-slate-400">{contagem.get(edicao.antes.codigo) ?? 0} funcionário(s) com este cargo. Alterar o nome ou o CBO aqui não muda as fichas: em cada uma, escolha o cargo de novo (a lista de diferenças mostra quem ficou diferente).</p>}
                        {erros.length > 0 && <ul role="alert" className="list-disc rounded-sm bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(x => <li key={x}>{x}</li>)}</ul>}
                        <div className="flex justify-between gap-2">
                            <div>{edicao.antes && isAdmin && <button className="rounded-sm border border-red-300 px-3 py-2 text-sm text-red-700 dark:text-red-300" disabled={salvando} onClick={excluir}>Excluir</button>}</div>
                            <div className="flex gap-2">
                                <button className="rounded-sm border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={() => setEdicao(null)}>Cancelar</button>
                                <button className="rounded-sm bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={salvando} onClick={gravar}>{salvando ? 'Gravando…' : 'Gravar'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CargosCadastro;
