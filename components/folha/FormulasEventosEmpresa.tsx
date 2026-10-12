// components/folha/FormulasEventosEmpresa.tsx
//
// Cadastros › Eventos IOB › Fórmulas da empresa: a conta própria de um evento do IOB para a empresa ativa
// (services/calculo/formulaEvento.ts), gravada nos parâmetros da folha dela. O "Lançar evento" do Cálculo e a importação
// de valores usam a fórmula no lugar da rotina do cadastro.

import React, { useEffect, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { atualizarParametrosFolha, listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { mensagemErro } from '../../services/cadastros/cadastrosService';
import type { EventoIobSage } from '../../services/folha/folhaTypes';
import { eventoPorCodigo } from '../../services/calculo/lancarEvento';
import { avaliarFormula, validarFormula, VARIAVEIS_FORMULA, variaveisDaFormula, type FormulaEvento } from '../../services/calculo/formulaEvento';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const ROTULO_REF: Record<FormulaEvento['referencia'], string> = { horas: 'Horas', dias: 'Dias', percentual: '%', valor: 'Valor (R$)', nenhuma: 'Sem referência' };

const FormulasEventosEmpresa: React.FC<{ eventos: EventoIobSage[] }> = ({ eventos }) => {
    const { ativa } = useEmpresaAtiva();
    const [formulas, setFormulas] = useState<Record<string, FormulaEvento> | null>(null);
    const [codigo, setCodigo] = useState('');
    const [expressao, setExpressao] = useState('');
    const [referencia, setReferencia] = useState<FormulaEvento['referencia']>('horas');
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setFormulas(null);
        listarEmpresasVisiveis().then(l => { if (vivo) setFormulas(l.find(e => e.id === ativa.id)?.parametrosFolha?.formulasEventos ?? {}); }).catch(e => { if (vivo) { setErro(mensagemErro(e)); setFormulas({}); } });
        return () => { vivo = false; };
    }, [ativa]);

    if (!ativa) return <p className="text-xs text-slate-500">Ative uma empresa para as fórmulas próprias dela.</p>;
    const ev = eventoPorCodigo(eventos, codigo);
    const nova: FormulaEvento = { expressao: expressao.trim(), referencia };
    const erros = expressao.trim() ? validarFormula(nova) : [];
    // Exemplo: salário de R$ 3.000,00 (220 h) e referência 10 (ou R$ 100,00).
    const exemplo = expressao.trim() && !erros.length ? avaliarFormula(nova.expressao, variaveisDaFormula(referencia === 'valor' ? 10000 : 10, referencia, { mensal: 300000, horasMes: 220 }, ev?.coeficiente ?? 0)) : null;

    async function gravar(mudar: (f: Record<string, FormulaEvento>) => Record<string, FormulaEvento>, texto: string) {
        setOcupado(true); setErro(''); setMsg('');
        try {
            const p = await atualizarParametrosFolha(ativa!.id, x => ({ ...x, formulasEventos: mudar({ ...(x?.formulasEventos ?? {}) }) }));
            setFormulas(p.formulasEventos ?? {}); setMsg(texto);
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setOcupado(false); }
    }
    const incluir = () => { if (ev && !erros.length && nova.expressao) void gravar(f => ({ ...f, [ev.codigo]: nova }), `Fórmula do evento ${ev.codigo} gravada.`).then(() => { setCodigo(''); setExpressao(''); }); };
    const remover = (c: string) => { if (window.confirm(`Remover a fórmula do evento ${c}? Ele volta a ser calculado pela rotina do cadastro.`)) void gravar(f => { delete f[c]; return f; }, `Fórmula do evento ${c} removida.`); };

    return (
        <section aria-label="Fórmulas da empresa" className="mb-4 space-y-2 rounded-lg border border-indigo-200 p-3 text-sm dark:border-indigo-800 dark:text-slate-100">
            <p className="font-medium">Fórmulas próprias de {ativa.nome}</p>
            <p className="text-xs text-slate-500">A conta do evento só nesta empresa, no lugar da rotina do cadastro; o "Lançar evento" do Cálculo e a importação de valores usam a fórmula e lançam com as incidências do evento. Variáveis: {Object.entries(VARIAVEIS_FORMULA).map(([k, v]) => `${k} (${v})`).join('; ')}. Funções: MIN(a; b), MAX(a; b), ARRED(x; casas). Ex.: REF * SALARIO_HORA * 1,6 ou MIN(REF * 25; 300).</p>
            {formulas === null ? <p className="text-xs text-slate-500">Carregando…</p> : (
                <>
                    {Object.keys(formulas).length > 0 && (
                        <table className="w-full text-xs">
                            <thead className="text-left text-slate-500"><tr><th className="p-1">Evento</th><th className="p-1">Fórmula</th><th className="p-1">Referência</th><th /></tr></thead>
                            <tbody>{Object.entries(formulas).sort(([a], [b]) => a.localeCompare(b)).map(([c, f]) => (
                                <tr key={c} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="p-1 font-mono">{c} {eventoPorCodigo(eventos, c)?.descricao ?? '(fora do catálogo)'}</td><td className="p-1 font-mono">{f.expressao}</td><td className="p-1">{ROTULO_REF[f.referencia]}</td>
                                    <td className="p-1"><button className="text-red-700 underline dark:text-red-300" disabled={ocupado} onClick={() => remover(c)}>remover</button></td>
                                </tr>))}</tbody>
                        </table>
                    )}
                    <div className="flex flex-wrap items-end gap-2 text-xs">
                        <label>Evento<input aria-label="Evento da fórmula" className={`mt-0.5 block w-20 ${inp}`} value={codigo} inputMode="numeric" placeholder="0810" onChange={e => setCodigo(e.target.value)} /></label>
                        <label className="flex-1">Fórmula<input aria-label="Fórmula do evento" className={`mt-0.5 block w-full font-mono ${inp}`} value={expressao} placeholder="REF * SALARIO_HORA * 1,6" onChange={e => setExpressao(e.target.value)} /></label>
                        <label>Referência<select aria-label="Referência da fórmula" className={`mt-0.5 block ${inp}`} value={referencia} onChange={e => setReferencia(e.target.value as FormulaEvento['referencia'])}>
                            {(Object.keys(ROTULO_REF) as FormulaEvento['referencia'][]).map(k => <option key={k} value={k}>{ROTULO_REF[k]}</option>)}</select></label>
                        <button className="rounded-sm bg-indigo-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={ocupado || !ev || !nova.expressao || erros.length > 0} onClick={incluir}>{ev && formulas[ev.codigo] ? 'Substituir' : 'Incluir'}</button>
                    </div>
                    {codigo.trim() && !ev && <p className="text-xs text-red-700 dark:text-red-300">Evento {codigo.trim()} não está no catálogo.</p>}
                    {ev && <p className="text-xs text-slate-500">{ev.codigo} {ev.descricao} · {ev.tipo === 'V' ? 'provento' : 'desconto'} · coeficiente {ev.coeficiente}</p>}
                    {erros.length > 0 && <ul role="alert" className="list-disc pl-5 text-xs text-red-700 dark:text-red-300">{erros.map(x => <li key={x}>{x}</li>)}</ul>}
                    {exemplo && 'valor' in exemplo && <p aria-label="Exemplo da fórmula" className="text-xs text-green-700 dark:text-green-300">Exemplo (salário R$ 3.000,00, 220 h, referência {referencia === 'valor' ? 'R$ 100,00' : referencia === 'nenhuma' ? '—' : '10'}): R$ {exemplo.valor.toFixed(2).replace('.', ',')}</p>}
                </>
            )}
            {msg && <p role="status" className="text-xs text-green-700 dark:text-green-300">{msg}</p>}
            {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{erro}</p>}
        </section>
    );
};

export default FormulasEventosEmpresa;
