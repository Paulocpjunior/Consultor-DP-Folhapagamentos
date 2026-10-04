// components/cadastros/EnquadramentoCadastro.tsx
//
// Cadastros › Enquadramento: regime, FPAS, RAT, FAP e terceiros da empresa,
// por vigência. É o que fecha a parte patronal no resumo da folha (DCTFWeb).
// Incluir e corrigir é de qualquer usuário aprovado; excluir, do admin.

import React, { useCallback, useEffect, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { REGIMES, enquadramentoVazio, numeroDeTexto, validarEnquadramento, type Enquadramento, type RegimePatronal } from '../../services/cadastros/enquadramento';
import { excluirEnquadramento, listarEnquadramentos, mensagemErro, salvarEnquadramento, type Usuario } from '../../services/cadastros/cadastrosService';

interface Props { empresa: Empresa; usuario: Usuario; isAdmin: boolean }

const inp = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const rot = 'text-xs font-medium text-slate-600 dark:text-slate-300';
const num = (n: number, casas = 4) => (Number.isFinite(n) && n ? n.toLocaleString('pt-BR', { maximumFractionDigits: casas }) : '');
interface Edicao { antes: Enquadramento | null; e: Enquadramento; patronal: string; fap: string; terceiros: string }

const EnquadramentoCadastro: React.FC<Props> = ({ empresa, usuario, isAdmin }) => {
    const [lista, setLista] = useState<Enquadramento[] | null>(null);
    const [erro, setErro] = useState('');
    const [ed, setEd] = useState<Edicao | null>(null);
    const [erros, setErros] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(() => {
        setErro(''); setLista(null);
        listarEnquadramentos(empresa.id).then(setLista).catch(e => { setErro(mensagemErro(e)); setLista([]); });
    }, [empresa.id]);
    useEffect(carregar, [carregar]);

    const abrir = (antes: Enquadramento | null) => {
        const e = antes ?? { ...enquadramentoVazio(empresa.id), vigencia: new Date().toISOString().slice(0, 7) };
        setErros([]); setEd({ antes, e, patronal: num(e.patronal), fap: e.fap ? e.fap.toFixed(4).replace('.', ',') : '', terceiros: num(e.terceiros) });
    };
    const set = (m: Partial<Enquadramento>) => setEd(x => x && { ...x, e: { ...x.e, ...m } });

    async function salvar() {
        if (!ed) return;
        const e: Enquadramento = { ...ed.e, patronal: numeroDeTexto(ed.patronal), fap: numeroDeTexto(ed.fap), terceiros: ed.e.regime === 'normal' ? numeroDeTexto(ed.terceiros || '0') : 0, fpas: ed.e.fpas.trim(), codigoTerceiros: ed.e.codigoTerceiros.trim(), observacao: ed.e.observacao.trim() };
        const v = validarEnquadramento(e, (lista ?? []).filter(x => x.id !== ed.antes?.id));
        setErros(v);
        if (v.length) return;
        setSalvando(true);
        try { await salvarEnquadramento(ed.antes, e, usuario); setEd(null); carregar(); }
        catch (x) { setErros([mensagemErro(x)]); }
        finally { setSalvando(false); }
    }

    async function excluir(e: Enquadramento) {
        if (!window.confirm(`Excluir o enquadramento com vigência ${e.vigencia.split('-').reverse().join('/')}?`)) return;
        try { await excluirEnquadramento(e, usuario); carregar(); } catch (x) { setErro(mensagemErro(x)); }
    }

    const total = (e: Enquadramento) => (e.regime === 'simples' ? 0 : e.patronal + e.rat * e.fap + (e.regime === 'normal' ? e.terceiros : 0));

    return (
        <div className="space-y-3">
            <p className="rounded bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Enquadramento previdenciário de <strong>{empresa.nomeFantasia || empresa.razaoSocial}</strong>, por vigência. Fecha a parte patronal no resumo da folha (DCTFWeb). Informe a partir do FPAS, do RAT do CNAE preponderante e do FAP publicado para o ano. Nada vem pronto.
            </p>
            <button className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white" onClick={() => abrir(null)}>Novo enquadramento</button>
            {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {!lista && <p className="text-sm text-slate-500">Carregando…</p>}
            {lista && !lista.length && !erro && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">Nenhum enquadramento: o resumo da folha mostra só a parte dos segurados.</p>}
            {lista && lista.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800">
                    {lista.map(e => (
                        <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 dark:text-slate-100">
                            <button className="text-left" onClick={() => abrir(e)}>
                                <strong>A partir de {e.vigencia.split('-').reverse().join('/')}</strong> · {REGIMES[e.regime]}
                                <span className="block text-xs text-slate-500 dark:text-slate-400">
                                    {e.regime === 'simples' ? 'Sem contribuição patronal na folha.' : `Patronal ${num(e.patronal)}% · RAT ${e.rat}% × FAP ${e.fap.toFixed(4).replace('.', ',')}${e.regime === 'normal' ? ` · terceiros ${num(e.terceiros)}% (FPAS ${e.fpas})` : ''} · total ${num(total(e))}% sobre a folha`}
                                </span>
                            </button>
                            {isAdmin && <button className="text-xs text-red-700 dark:text-red-300" onClick={() => excluir(e)}>excluir</button>}
                        </li>
                    ))}
                </ul>
            )}

            {ed && (
                <div role="dialog" aria-modal="true" aria-label="Enquadramento" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
                    <div className="my-4 w-full max-w-xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                        <div className="flex items-start justify-between"><h3 className="text-lg font-semibold text-slate-800 dark:text-white">{ed.antes ? 'Editar' : 'Novo'} enquadramento</h3><button aria-label="Fechar" className="px-2 text-xl text-slate-500" onClick={() => setEd(null)}>×</button></div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block"><span className={rot}>Vigência (a partir de)</span><input aria-label="Vigência" type="month" className={inp} value={ed.e.vigencia} onChange={x => set({ vigencia: x.target.value })} /></label>
                            <label className="block sm:col-span-2"><span className={rot}>Regime</span>
                                <select aria-label="Regime" className={inp} value={ed.e.regime} onChange={x => set({ regime: x.target.value as RegimePatronal })}>
                                    {Object.entries(REGIMES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
                                </select></label>
                            {ed.e.regime !== 'simples' && (
                                <>
                                    <label className="block"><span className={rot}>Contribuição patronal (%)</span><input aria-label="Patronal" className={inp} value={ed.patronal} onChange={x => setEd({ ...ed, patronal: x.target.value })} /></label>
                                    <label className="block"><span className={rot}>RAT (%)</span>
                                        <select aria-label="RAT" className={inp} value={String(ed.e.rat || '')} onChange={x => set({ rat: Number(x.target.value) })}><option value="">—</option><option value="1">1%</option><option value="2">2%</option><option value="3">3%</option></select></label>
                                    <label className="block"><span className={rot}>FAP (0,5000 a 2,0000)</span><input aria-label="FAP" className={inp} value={ed.fap} onChange={x => setEd({ ...ed, fap: x.target.value })} /></label>
                                </>
                            )}
                            {ed.e.regime === 'normal' && (
                                <>
                                    <label className="block"><span className={rot}>FPAS</span><input aria-label="FPAS" className={inp} value={ed.e.fpas} onChange={x => set({ fpas: x.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
                                    <label className="block"><span className={rot}>Código de terceiros</span><input aria-label="Código de terceiros" className={inp} value={ed.e.codigoTerceiros} onChange={x => set({ codigoTerceiros: x.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
                                    <label className="block"><span className={rot}>Terceiros (%)</span><input aria-label="Terceiros" className={inp} value={ed.terceiros} onChange={x => setEd({ ...ed, terceiros: x.target.value })} /></label>
                                </>
                            )}
                            <label className="block sm:col-span-2"><span className={rot}>Observação (ex.: fonte do FAP, CNAE)</span><textarea aria-label="Observação do enquadramento" rows={2} className={inp} value={ed.e.observacao} onChange={x => set({ observacao: x.target.value })} /></label>
                        </div>
                        {erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
                        <div className="flex justify-end gap-2">
                            <button className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={() => setEd(null)}>Cancelar</button>
                            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EnquadramentoCadastro;
