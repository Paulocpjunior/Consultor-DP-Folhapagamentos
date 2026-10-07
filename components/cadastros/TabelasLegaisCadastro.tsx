// components/cadastros/TabelasLegaisCadastro.tsx
//
// Tabelas legais com vigência. Nenhum valor vem pronto: quem cadastra digita
// a partir da norma oficial e informa a norma. Incluir é de qualquer usuário
// aprovado; corrigir ou excluir é do administrador.

import React, { useState } from 'react';
import {
    DEF_TABELAS, TIPOS_TABELA, coeficienteDeTexto, inssProgressivo, rotuloCompetencia, tabelaVazia, tabelaVigente, tetoInss, textoCoeficiente, validarTabela,
    type ChaveValor, type DefValor, type TabelaLegal, type TipoTabela,
} from '../../services/cadastros/tabelasLegais';
import { excluirTabela, mensagemErro, salvarTabela, type Usuario } from '../../services/cadastros/cadastrosService';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { oficiaisQueFaltam } from '../../services/cadastros/tabelasOficiais';

interface Props { tabelas: TabelaLegal[] | null; erroLista: string; usuario: Usuario; isAdmin: boolean; onRecarregar: () => void }

const inp = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const txt = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
const ehCoef = (tipo: TipoTabela, k: string) => DEF_TABELAS[tipo].valores.some(v => v.chave === k && v.formato === 'coeficiente');
const mostrarValor = (v: DefValor, n: number) => (v.formato === 'coeficiente' ? textoCoeficiente(n) : reais(n));
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;

interface FaixaTexto { ate: string; aliquota: string; deducao: string }
interface Edicao { antes: TabelaLegal | null; t: TabelaLegal; faixas: FaixaTexto[]; valores: Partial<Record<ChaveValor, string>> }

function paraEdicao(antes: TabelaLegal | null, tipo: TipoTabela): Edicao {
    const t = antes ?? tabelaVazia(tipo);
    return {
        antes, t,
        faixas: t.faixas.map(f => ({ ate: txt(f.ate), aliquota: f.aliquota ? String(f.aliquota).replace('.', ',') : '', deducao: f.deducao ? txt(f.deducao) : '' })),
        valores: Object.fromEntries(Object.entries(t.valores).map(([k, v]) => [k, ehCoef(tipo, k) ? textoCoeficiente(v) : txt(v)])),
    };
}

function deEdicao(e: Edicao): { t: TabelaLegal; erros: string[] } {
    const erros: string[] = [];
    const faixas = e.faixas.map((f, i) => {
        const ate = f.ate.trim() ? centavosDeTexto(f.ate) : null;
        if (f.ate.trim() && ate === null) erros.push(`Faixa ${i + 1}: limite inválido.`);
        const aliquota = Number((f.aliquota.trim() || '0').replace(',', '.'));
        if (Number.isNaN(aliquota)) erros.push(`Faixa ${i + 1}: alíquota inválida.`);
        const deducao = f.deducao.trim() ? centavosDeTexto(f.deducao) : 0;
        if (deducao === null) erros.push(`Faixa ${i + 1}: parcela a deduzir inválida.`);
        return { ate, aliquota, deducao: deducao ?? 0 };
    });
    const valores: TabelaLegal['valores'] = {};
    for (const [k, v] of Object.entries(e.valores) as [ChaveValor, string][]) {
        if (!v.trim()) continue;
        const c = ehCoef(e.t.tipo, k) ? coeficienteDeTexto(v) : centavosDeTexto(v);
        if (c === null) erros.push(`Valor inválido: ${v}.`); else valores[k] = c;
    }
    return { t: { ...e.t, faixas, valores, norma: e.t.norma.trim(), observacao: e.t.observacao.trim() }, erros };
}

const TabelasLegaisCadastro: React.FC<Props> = ({ tabelas, erroLista, usuario, isAdmin, onRecarregar }) => {
    const [edicao, setEdicao] = useState<Edicao | null>(null);
    const [erros, setErros] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const competenciaAtual = new Date().toISOString().slice(0, 7);
    const somenteLeitura = !!edicao?.antes && !isAdmin;
    const faltam = tabelas ? oficiaisQueFaltam(tabelas) : [];
    const [msgOficiais, setMsgOficiais] = useState('');

    async function gravarOficiais() {
        if (!tabelas || !faltam.length) return;
        if (!window.confirm(`Gravar ${faltam.length} tabela(s) oficial(is) de 2026?\n\n${faltam.map(t => `${DEF_TABELAS[t.tipo].titulo} — ${t.norma}`).join('\n')}`)) return;
        setSalvando(true); setMsgOficiais('');
        const feitas: string[] = []; const falhas: string[] = [];
        for (const t of faltam) {
            const v = validarTabela(t, tabelas);
            if (v.length) { falhas.push(`${DEF_TABELAS[t.tipo].titulo}: ${v.join(' ')}`); continue; }
            try { await salvarTabela(null, t, usuario); feitas.push(DEF_TABELAS[t.tipo].titulo); }
            catch (e) { falhas.push(`${DEF_TABELAS[t.tipo].titulo}: ${mensagemErro(e)}`); }
        }
        setMsgOficiais(`${feitas.length ? `Gravadas: ${feitas.join(', ')}.` : ''}${falhas.length ? ` Não gravadas: ${falhas.join(' | ')}` : ''}`.trim());
        setSalvando(false);
        onRecarregar();
    }

    async function salvar() {
        if (!edicao) return;
        const { t, erros: conv } = deEdicao(edicao);
        const v = [...conv, ...validarTabela(t, tabelas ?? [])];
        if (v.length) { setErros(v); return; }
        setSalvando(true);
        try { await salvarTabela(edicao.antes, t, usuario); setEdicao(null); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    async function excluir() {
        if (!edicao?.antes || !window.confirm('Excluir esta tabela? A exclusão fica no histórico.')) return;
        setSalvando(true);
        try { await excluirTabela(edicao.antes, usuario); setEdicao(null); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    const def = edicao ? DEF_TABELAS[edicao.t.tipo] : null;
    const setFaixa = (i: number, k: keyof FaixaTexto, v: string) => setEdicao(e => e && ({ ...e, faixas: e.faixas.map((f, j) => (j === i ? { ...f, [k]: v } : f)) }));
    const previa = edicao && edicao.t.tipo === 'inss' ? deEdicao(edicao) : null;
    const tetoPrevia = previa && !previa.erros.length ? tetoInss(previa.t) : null;

    return (
        <div className="space-y-4">
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                Nenhuma tabela vem pronta. Digite os valores da norma oficial (portaria, lei, decreto) e informe a norma. Toda atualização aplicada no SAGE tem de ser cadastrada aqui também.
            </div>
            {tabelas && faltam.length > 0 && (
                <div className="rounded border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-100">
                    <p><strong>Tabelas oficiais de 2026</strong> (vigência 01/2026) ainda não cadastradas: {faltam.map(t => DEF_TABELAS[t.tipo].titulo).join(', ')}.</p>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                        {faltam.map(t => (
                            <li key={t.tipo}>{DEF_TABELAS[t.tipo].titulo} · {t.norma}
                                {t.faixas.length > 0 && ` · ${t.faixas.map(f => `${f.ate === null ? 'acima' : `até ${reais(f.ate)}`}: ${pct(f.aliquota)}${f.deducao ? ` − ${reais(f.deducao)}` : ''}`).join(' · ')}`}
                                {DEF_TABELAS[t.tipo].valores.map(v => t.valores[v.chave] != null ? ` · ${v.rotulo}: ${mostrarValor(v, t.valores[v.chave]!)}` : '').join('')}
                            </li>
                        ))}
                    </ul>
                    <button className="mt-2 rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={salvando} onClick={gravarOficiais}>Gravar as tabelas oficiais de 2026 ({faltam.length})</button>
                </div>
            )}
            {msgOficiais && <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{msgOficiais}</p>}
            {erroLista && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erroLista}</p>}
            {!tabelas && !erroLista && <p className="text-sm text-slate-500">Carregando…</p>}

            {tabelas && TIPOS_TABELA.map(tipo => {
                const lista = tabelas.filter(t => t.tipo === tipo);
                const vig = tabelaVigente(tabelas, tipo, competenciaAtual);
                return (
                    <section key={tipo} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-slate-800 dark:text-white">{DEF_TABELAS[tipo].titulo}</h3>
                            <button className="rounded border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-white" onClick={() => { setErros([]); setEdicao(paraEdicao(null, tipo)); }}>Nova vigência</button>
                        </div>
                        <p className={`mt-1 text-xs ${'erro' in vig ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-400'}`}>
                            {'erro' in vig ? vig.erro : `Vigente em ${rotuloCompetencia(competenciaAtual)}: a de ${rotuloCompetencia(vig.tabela.vigencia)} (${vig.tabela.norma}).`}
                        </p>
                        {lista.length > 0 && (
                            <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-700">
                                {lista.map(t => (
                                    <li key={t.id}>
                                        <button className="w-full py-2 text-left hover:bg-blue-50 dark:text-slate-100 dark:hover:bg-slate-700" onClick={() => { setErros([]); setEdicao(paraEdicao(t, tipo)); }}>
                                            <strong>A partir de {rotuloCompetencia(t.vigencia)}</strong> · {t.norma}
                                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                                                {t.faixas.length > 0 && t.faixas.map(f => `${f.ate === null ? 'acima' : `até ${reais(f.ate)}`}: ${pct(f.aliquota)}${f.deducao ? ` − ${reais(f.deducao)}` : ''}`).join(' · ')}
                                                {DEF_TABELAS[tipo].valores.map(v => t.valores[v.chave] != null ? ` · ${v.rotulo}: ${mostrarValor(v, t.valores[v.chave]!)}` : '').join('')}
                                                {tipo === 'inss' && tetoInss(t) !== null && ` · contribuição no teto: ${reais(inssProgressivo(tetoInss(t)!, t))}`}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                );
            })}

            {edicao && def && (
                <div role="dialog" aria-modal="true" aria-label="Tabela legal" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
                    <div className="my-4 w-full max-w-2xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                        <div className="flex items-start justify-between">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{def.titulo}{edicao.antes ? ` — ${rotuloCompetencia(edicao.antes.vigencia)}` : ' — nova vigência'}</h3>
                            <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={() => setEdicao(null)}>×</button>
                        </div>
                        {somenteLeitura && <p className="text-xs text-amber-700 dark:text-amber-300">Só o administrador corrige uma tabela já gravada. Se houver erro, avise o administrador.</p>}
                        <fieldset disabled={somenteLeitura} className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-3">
                                <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Vigência a partir de</span>
                                    <input className={inp} type="month" value={edicao.t.vigencia} onChange={e => setEdicao({ ...edicao, t: { ...edicao.t, vigencia: e.target.value } })} aria-label="Vigência" /></label>
                                <label className="block sm:col-span-2"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Norma (obrigatória)</span>
                                    <input className={inp} value={edicao.t.norma} onChange={e => setEdicao({ ...edicao, t: { ...edicao.t, norma: e.target.value } })} aria-label="Norma" placeholder="Ex.: Portaria Interministerial MPS/MF nº ..., de ..." /></label>
                            </div>
                            {def.faixas && (
                                <div className="space-y-1">
                                    <table className="w-full text-sm">
                                        <thead><tr className="text-left text-xs text-slate-500 dark:text-slate-400"><th className="p-1">Faixa</th><th className="p-1">Até (R$){def.faixas.ultimaAberta ? ' — vazio na última = acima' : ''}</th><th className="p-1">Alíquota (%)</th>{def.faixas.deducao && <th className="p-1">Parcela a deduzir (R$)</th>}<th /></tr></thead>
                                        <tbody>
                                            {edicao.faixas.map((f, i) => (
                                                <tr key={i}>
                                                    <td className="p-1 text-slate-500">{i + 1}</td>
                                                    <td className="p-1"><input className={inp} value={f.ate} onChange={e => setFaixa(i, 'ate', e.target.value)} aria-label={`Limite da faixa ${i + 1}`} /></td>
                                                    <td className="p-1"><input className={inp} value={f.aliquota} onChange={e => setFaixa(i, 'aliquota', e.target.value)} aria-label={`Alíquota da faixa ${i + 1}`} /></td>
                                                    {def.faixas && def.faixas.deducao && <td className="p-1"><input className={inp} value={f.deducao} onChange={e => setFaixa(i, 'deducao', e.target.value)} aria-label={`Parcela a deduzir da faixa ${i + 1}`} /></td>}
                                                    <td className="p-1"><button className="text-xs text-red-600 underline" onClick={() => setEdicao({ ...edicao, faixas: edicao.faixas.filter((_, j) => j !== i) })}>Remover</button></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <button className="rounded border border-slate-300 px-3 py-1 text-sm dark:border-slate-600 dark:text-white" onClick={() => setEdicao({ ...edicao, faixas: [...edicao.faixas, { ate: '', aliquota: '', deducao: '' }] })}>Adicionar faixa</button>
                                    {tetoPrevia !== null && previa && <p className="text-xs text-slate-600 dark:text-slate-300">Conferência: contribuição no teto de {reais(tetoPrevia)} = <strong>{reais(inssProgressivo(tetoPrevia, previa.t))}</strong>. Compare com o valor máximo publicado na norma.</p>}
                                </div>
                            )}
                            {def.valores.length > 0 && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    {def.valores.map(v => (
                                        <label key={v.chave} className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">{v.rotulo}{v.formato === 'coeficiente' ? ' (ex.: 0,133145)' : ' (R$)'}{v.grupo ? ' — opcional' : ''}</span>
                                            <input className={inp} value={edicao.valores[v.chave] ?? ''} onChange={e => setEdicao({ ...edicao, valores: { ...edicao.valores, [v.chave]: e.target.value } })} aria-label={v.rotulo} /></label>
                                    ))}
                                </div>
                            )}
                            {edicao.t.tipo === 'irrf' && <p className="text-xs text-slate-600 dark:text-slate-300">Redutor mensal (Lei 15.270/2025, a partir de 01/2026): preencha os cinco campos como estão na lei. Em tabela anterior a 2026, deixe em branco.</p>}
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Observação</span>
                                <textarea className={inp} rows={2} value={edicao.t.observacao} onChange={e => setEdicao({ ...edicao, t: { ...edicao.t, observacao: e.target.value } })} aria-label="Observação" /></label>
                        </fieldset>
                        {erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
                        <div className="flex justify-between gap-2">
                            <div>{edicao.antes && isAdmin && <button className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 dark:text-red-300" disabled={salvando} onClick={excluir}>Excluir</button>}</div>
                            <div className="flex gap-2">
                                <button className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={() => setEdicao(null)}>{somenteLeitura ? 'Fechar' : 'Cancelar'}</button>
                                {!somenteLeitura && <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={salvando} onClick={salvar}>{salvando ? 'Gravando…' : 'Gravar'}</button>}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TabelasLegaisCadastro;
