// components/cadastros/AutomaticosEmLoteModal.tsx
//
// Cadastros › Funcionários › Automáticos em lote: marca "Lança na rescisão" e "Pago no adiantamento" por evento, para
// todos os lançamentos automáticos das fichas da empresa (services/calculo/automaticosEmLote.ts). Mostra como está hoje,
// quantas fichas mudam e só grava com confirmação, com a origem na auditoria de cada ficha.

import React, { useMemo, useState } from 'react';
import { diffFicha, type FichaFuncionario } from '../../services/cadastros/funcionarios';
import { gravarImportacao, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { aplicarMarcacoes, resumoAutomaticos, type MarcacaoEvento, type MarcaRescisao } from '../../services/calculo/automaticosEmLote';

const btn = 'rounded-sm border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600 dark:text-slate-100';
const sel = 'rounded-sm border border-slate-300 bg-white px-1 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const ROTULO_RESCISAO: Record<MarcaRescisao, string> = { nao: 'não lança', proporcional: 'proporcional', integral: 'integral' };

interface Props { fichas: FichaFuncionario[]; usuario: Usuario; onFechar: () => void; onGravado: () => void }

const AutomaticosEmLoteModal: React.FC<Props> = ({ fichas, usuario, onFechar, onGravado }) => {
    const resumo = useMemo(() => resumoAutomaticos(fichas), [fichas]);
    const [marcacoes, setMarcacoes] = useState<Record<string, MarcacaoEvento>>({});
    const [gravando, setGravando] = useState(false);
    const [erro, setErro] = useState('');
    const previa = useMemo(() => aplicarMarcacoes(fichas, marcacoes), [fichas, marcacoes]);
    const marcar = (codigo: string, m: Partial<MarcacaoEvento>) => setMarcacoes(x => {
        const n = { ...(x[codigo] ?? {}), ...m };
        if (n.naRescisao === undefined) delete n.naRescisao;
        if (n.noAdiantamento === undefined) delete n.noAdiantamento;
        const r = { ...x, [codigo]: n };
        if (!Object.keys(n).length) delete r[codigo];
        return r;
    });

    async function gravar() {
        if (!previa.fichas.length) return;
        if (!window.confirm(`Gravar a marcação em ${previa.lancamentos} lançamento(s) automático(s) de ${previa.fichas.length} ficha(s)? Só "Lança na rescisão" e "Pago no adiantamento" mudam.`)) return;
        setGravando(true); setErro('');
        try {
            const antes = new Map(fichas.map(f => [f.id, f]));
            await gravarImportacao(previa.fichas.map(f => ({ ficha: f, novo: false, alteracoes: diffFicha(antes.get(f.id)!, f), preservados: [] })), usuario, ['marcação por evento'], undefined, 'Lançamentos automáticos em lote');
            onGravado();
        } catch (e) { setErro(mensagemErro(e)); } finally { setGravando(false); }
    }

    return (
        <div role="dialog" aria-label="Automáticos em lote" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
            <div className="w-full max-w-4xl space-y-3 rounded-lg bg-white p-4 text-sm shadow-xl dark:bg-slate-800 dark:text-slate-100">
                <div className="flex items-start gap-2">
                    <div>
                        <h2 className="text-lg font-semibold">Lançamentos automáticos em lote</h2>
                        <p className="text-xs text-slate-600 dark:text-slate-300">Os automáticos do backup do IOB chegam sem "Lança na rescisão" e sem "Pago no adiantamento". Marque por evento, como no SAGE; vale para todas as fichas com o evento. "Manter" deixa como está.</p>
                    </div>
                    <button aria-label="Fechar" className="ml-auto rounded-sm px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {!resumo.length ? <p className="text-slate-500">Nenhuma ficha desta empresa tem lançamento automático.</p> : (
                    <div className="max-h-[60vh] overflow-auto rounded-sm border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-slate-50 text-left text-slate-500 dark:bg-slate-900"><tr>
                                <th className="p-2">Evento</th><th className="p-2 text-right">Fichas</th><th className="p-2">Rescisão hoje</th><th className="p-2">Lança na rescisão</th><th className="p-2">Adiantamento hoje</th><th className="p-2">Pago no</th>
                            </tr></thead>
                            <tbody>{resumo.map(r => {
                                const m = marcacoes[r.codigo] ?? {};
                                return (
                                    <tr key={r.codigo} className={`border-t border-slate-100 dark:border-slate-700 ${marcacoes[r.codigo] ? 'bg-blue-50 dark:bg-slate-700' : ''}`}>
                                        <td className="p-2"><strong>{r.codigo}</strong> {r.descricao}</td>
                                        <td className="p-2 text-right">{r.fichas}</td>
                                        <td className="p-2">{(Object.keys(r.rescisao) as MarcaRescisao[]).filter(k => r.rescisao[k]).map(k => `${ROTULO_RESCISAO[k]} ${r.rescisao[k]}`).join(', ')}</td>
                                        <td className="p-2"><select aria-label={`Lança na rescisão ${r.codigo}`} className={sel} value={m.naRescisao ?? ''} onChange={e => marcar(r.codigo, { naRescisao: (e.target.value || undefined) as MarcaRescisao | undefined })}>
                                            <option value="">manter</option><option value="nao">não lança</option><option value="proporcional">proporcional</option><option value="integral">integral</option>
                                        </select></td>
                                        <td className="p-2">{r.adiantamento.sim ? `adiantamento ${r.adiantamento.sim}` : ''}{r.adiantamento.sim && r.adiantamento.nao ? ', ' : ''}{r.adiantamento.nao ? `folha ${r.adiantamento.nao}` : ''}</td>
                                        <td className="p-2"><select aria-label={`Pago no ${r.codigo}`} className={sel} value={m.noAdiantamento === undefined ? '' : m.noAdiantamento ? 'adiantamento' : 'folha'} onChange={e => marcar(r.codigo, { noAdiantamento: e.target.value ? e.target.value === 'adiantamento' : undefined })}>
                                            <option value="">manter</option><option value="folha">folha</option><option value="adiantamento">adiantamento</option>
                                        </select></td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-slate-600 dark:text-slate-300">{previa.fichas.length ? `Mudam ${previa.lancamentos} lançamento(s) em ${previa.fichas.length} ficha(s).` : 'Nada a mudar ainda.'}</p>
                    <button className={`${btn} ml-auto`} onClick={onFechar}>Cancelar</button>
                    <button className="rounded-sm bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!previa.fichas.length || gravando} onClick={() => void gravar()}>{gravando ? 'Gravando…' : `Gravar ${previa.fichas.length} ficha(s)`}</button>
                </div>
            </div>
        </div>
    );
};

export default AutomaticosEmLoteModal;
