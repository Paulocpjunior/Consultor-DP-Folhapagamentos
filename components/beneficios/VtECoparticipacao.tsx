// components/beneficios/VtECoparticipacao.tsx
//
// Folha do mês › Administração de benefícios, parte do mês: o pedido de vale-transporte (itinerário de cada
// funcionário e a quantidade a comprar no mês de uso, por operadora) e a coparticipação do plano de saúde (planilha da
// operadora → desconto na folha da competência ativa).

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarAfastamentos, listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import { centavosDeTexto, cnpjValido, normalizarCnpj, reais } from '../../services/cadastros/documentos';
import { somarMeses } from '../../services/prazos/calendario';
import {
    comCoparticipacao, coparticipacaoPorFicha, itinerarioVazio, lerPlanilhaCoparticipacao, OPERADORAS_VT, pedidoVt, validarItinerario,
    type ItinerarioVt, type LinhaCopart,
} from '../../services/beneficios/vtECoparticipacao';
import { listarItinerarios, salvarItinerario } from '../../services/beneficios/vtService';
import { listarMovimentos, salvarMovimentos } from '../../services/calculo/movimentosService';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const btnP = 'rounded-sm bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40';
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const br = (c: string) => c.split('-').reverse().join('/');

const VtECoparticipacao: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [afastamentos, setAfastamentos] = useState<Afastamento[]>([]);
    const [itinerarios, setItinerarios] = useState<ItinerarioVt[]>([]);
    const [mesUso, setMesUso] = useState('');
    const [edicao, setEdicao] = useState<ItinerarioVt | null>(null);
    const [copart, setCopart] = useState<{ arquivo: string; linhas: LinhaCopart[]; avisos: string[] } | null>(null);
    // Operadora do plano (vai no S-1210 como plano de saúde, para a dedução do IR do empregado).
    const [operadora, setOperadora] = useState({ cnpjOper: '', regANS: '' });
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setMesUso(somarMeses(`${ativa.competencia}-01`, 1).slice(0, 7));
        Promise.all([listarFuncionarios(ativa.id), listarAfastamentos(ativa.id), listarItinerarios(ativa.id).catch(() => [])])
            .then(([fs, as, its]) => { if (vivo) { setFichas(fs); setAfastamentos(as); setItinerarios(its); } })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa]);

    const pedido = useMemo(() => (/^\d{4}-\d{2}$/.test(mesUso) ? pedidoVt(mesUso, fichas, itinerarios, afastamentos) : null), [mesUso, fichas, itinerarios, afastamentos]);
    const copartFichas = useMemo(() => (copart && ativa ? coparticipacaoPorFicha(copart.linhas, fichas, ativa.competencia) : null), [copart, fichas, ativa]);
    if (!ativa) return null;
    const comVt = fichas.filter(f => f.dados.valeTransporte === 'S' && !f.dados.dataDesligamento);
    const nomeDa = (fichaId: string) => fichas.find(f => f.id === fichaId)?.dados.nome ?? fichaId;

    async function gravarItinerario() {
        if (!edicao) return;
        const e = validarItinerario(edicao);
        if (e.length) { setErro(e.join(' ')); return; }
        setOcupado('Gravando o itinerário…'); setErro('');
        try {
            await salvarItinerario(edicao, usuario);
            setItinerarios(l => [...l.filter(x => x.fichaId !== edicao.fichaId), edicao]);
            setMsg(`Itinerário de ${nomeDa(edicao.fichaId)} gravado.`); setEdicao(null);
        } catch (x) { setErro(mensagemErro(x)); } finally { setOcupado(''); }
    }

    function excelPedido() {
        if (!pedido) return;
        const linhas = pedido.fichas.flatMap(f => f.itens.map(i => [f.nome, f.dias, i.operadora, i.descricao, i.tarifa / 100, i.quantidade, i.valor / 100]));
        const ws = XLSX.utils.aoa_to_sheet([[`Pedido de vale-transporte · uso em ${br(mesUso)}`], [ativa!.nome], [], ['Funcionário', 'Dias', 'Operadora', 'Linha', 'Tarifa', 'Quantidade', 'Valor'], ...linhas,
            [], ['Por operadora'], ...pedido.porOperadora.map(o => [o.operadora, '', '', '', '', o.quantidade, o.valor / 100]), ['Total', '', '', '', '', '', pedido.total / 100]]);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Pedido VT');
        XLSX.writeFile(wb, `pedido-vt-${ativa!.codigoSage || 'empresa'}-${mesUso}.xlsx`);
    }

    async function lerCopart(file: File) {
        setErro(''); setMsg('');
        try { const r = lerPlanilhaCoparticipacao(new Uint8Array(await file.arrayBuffer())); setCopart({ arquivo: file.name, ...r }); }
        catch (x) { setErro(`Planilha não lida: ${(x as Error).message}`); }
    }

    async function lancarCopart() {
        if (!copartFichas || !copartFichas.porFicha.size) return;
        if (!window.confirm(`Lançar a coparticipação de ${copartFichas.porFicha.size} funcionário(s) na folha de ${br(ativa!.competencia)}? Substitui a lançada antes por aqui.`)) return;
        setOcupado('Lançando na folha…'); setErro('');
        try {
            const atuais = new Map((await listarMovimentos(ativa!.id, ativa!.competencia)).map(g => [g.fichaId, g.movimento]));
            await salvarMovimentos(ativa!.id, ativa!.competencia, [...copartFichas.porFicha].map(([fichaId, valor]) => {
                const antes = atuais.get(fichaId) ?? null;
                const cnpjOper = normalizarCnpj(operadora.cnpjOper);
                return { fichaId, antes, depois: comCoparticipacao(antes, valor, cnpjValido(cnpjOper) ? { cnpjOper, regANS: operadora.regANS } : undefined) };
            }), usuario);
            setMsg(`Coparticipação lançada no movimento de ${br(ativa!.competencia)}: recalcule a folha em Cálculo mensal.`);
        } catch (x) { setErro(mensagemErro(x)); } finally { setOcupado(''); }
    }

    return (
        <div className="mt-6 space-y-4 text-sm dark:text-slate-100">
            {ocupado && <p className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded-sm bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}

            <section aria-label="Pedido de vale-transporte" className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-end gap-3">
                    <h3 className="font-semibold">Pedido de vale-transporte</h3>
                    <label>Mês de uso<input aria-label="Mês de uso do VT" type="month" className={`block ${inp}`} value={mesUso} onChange={e => setMesUso(e.target.value)} /></label>
                    <button className={btn} disabled={!pedido?.fichas.length} onClick={excelPedido}>Excel do pedido</button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">Dias da semana do itinerário no mês, menos feriados nacionais, férias e afastamentos lançados e dias fora do vínculo. Feriado municipal: ajuste no portal da operadora. O desconto de 6% continua no Cálculo mensal; quando o custo do mês for menor, ele limita o desconto (custo na ficha).</p>
                <div className="flex flex-wrap items-center gap-2">
                    <span>Itinerário de:</span>
                    {comVt.map(f => <button key={f.id} className={btn} onClick={() => setEdicao(itinerarios.find(i => i.fichaId === f.id) ?? itinerarioVazio(ativa.id, f.id))}>{f.dados.nome ?? f.cpf}{itinerarios.some(i => i.fichaId === f.id) ? '' : ' (sem itinerário)'}</button>)}
                    {!comVt.length && <span className="text-slate-500">Ninguém com vale-transporte na ficha.</span>}
                </div>
                {edicao && (
                    <div className="space-y-2 rounded-sm bg-slate-50 p-2 dark:bg-slate-800">
                        <p className="font-medium">{nomeDa(edicao.fichaId)}</p>
                        <div className="flex flex-wrap gap-2">{DIAS.map((d, k) => (
                            <label key={d} className="flex items-center gap-1"><input type="checkbox" checked={edicao.diasSemana.includes(k)} onChange={e => setEdicao({ ...edicao, diasSemana: e.target.checked ? [...edicao.diasSemana, k].sort() : edicao.diasSemana.filter(x => x !== k) })} />{d}</label>
                        ))}</div>
                        {edicao.linhas.map((l, k) => {
                            const set = (x: Partial<typeof l>) => setEdicao({ ...edicao, linhas: edicao.linhas.map((y, z) => (z === k ? { ...y, ...x } : y)) });
                            return (
                                <div key={k} className="flex flex-wrap items-center gap-2">
                                    <select aria-label="Operadora" className={inp} value={l.operadora} onChange={e => set({ operadora: e.target.value })}><option value="">—</option>{OPERADORAS_VT.map(o => <option key={o} value={o}>{o}</option>)}</select>
                                    <input aria-label="Linha" placeholder="Linha / trecho" className={`w-48 ${inp}`} value={l.descricao} onChange={e => set({ descricao: e.target.value })} />
                                    <input aria-label="Tarifa" placeholder="Tarifa" className={`w-24 text-right ${inp}`} defaultValue={l.tarifa ? (l.tarifa / 100).toFixed(2).replace('.', ',') : ''} onBlur={e => set({ tarifa: centavosDeTexto(e.target.value) ?? 0 })} />
                                    <label>Viagens/dia<input aria-label="Viagens por dia" type="number" min={1} max={10} className={`ml-1 w-16 ${inp}`} value={l.viagensDia || ''} onChange={e => set({ viagensDia: Number(e.target.value) || 0 })} /></label>
                                    <button className={btn} onClick={() => setEdicao({ ...edicao, linhas: edicao.linhas.filter((_, z) => z !== k) })}>Tirar</button>
                                </div>
                            );
                        })}
                        <div className="flex gap-2">
                            <button className={btn} onClick={() => setEdicao({ ...edicao, linhas: [...edicao.linhas, { operadora: '', descricao: '', tarifa: 0, viagensDia: 2 }] })}>+ Linha</button>
                            <button className={btnP} disabled={!!ocupado} onClick={gravarItinerario}>Gravar o itinerário</button>
                            <button className={btn} onClick={() => setEdicao(null)}>Cancelar</button>
                        </div>
                    </div>
                )}
                {pedido && pedido.fichas.length > 0 && (
                    <table className="w-full text-xs">
                        <thead className="text-left text-slate-500"><tr><th className="p-1">Funcionário</th><th className="p-1 text-right">Dias</th><th className="p-1">Linhas</th><th className="p-1 text-right">Valor do mês</th><th className="p-1 text-right">Custo na ficha</th></tr></thead>
                        <tbody>{pedido.fichas.map(f => (
                            <tr key={f.fichaId} className="border-t border-slate-100 dark:border-slate-700">
                                <td className="p-1">{f.nome}{f.observacao && <span className="block text-slate-500">{f.observacao}</span>}</td>
                                <td className="p-1 text-right">{f.dias}</td>
                                <td className="p-1">{f.itens.map(i => `${i.operadora}: ${i.quantidade} × ${reais(i.tarifa)}`).join(' · ')}</td>
                                <td className="p-1 text-right">{reais(f.total)}</td>
                                <td className={`p-1 text-right ${f.custoFicha && f.custoFicha !== f.total ? 'text-amber-700 dark:text-amber-300' : ''}`}>{f.custoFicha ? reais(f.custoFicha) : '—'}</td>
                            </tr>
                        ))}
                            {pedido.porOperadora.map(o => <tr key={o.operadora} className="border-t font-medium"><td className="p-1" colSpan={2}>{o.operadora}</td><td className="p-1">{o.quantidade} passagem(ns)</td><td className="p-1 text-right">{reais(o.valor)}</td><td /></tr>)}
                            <tr className="border-t font-semibold"><td className="p-1" colSpan={3}>Total do pedido</td><td className="p-1 text-right">{reais(pedido.total)}</td><td /></tr>
                        </tbody>
                    </table>
                )}
                {pedido && pedido.semItinerario.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Com VT na ficha e sem itinerário: {pedido.semItinerario.join(', ')}.</p>}
            </section>

            <section aria-label="Coparticipação do plano de saúde" className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                <h3 className="font-semibold">Coparticipação do plano de saúde · folha de {br(ativa.competencia)}</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">A planilha da operadora (Excel ou CSV) com o CPF do titular e o valor da coparticipação. Vira um desconto do mês na folha, sem INSS, FGTS e IRRF. Lançar de novo substitui o lançado antes por aqui.</p>
                <div className="flex flex-wrap items-end gap-3 text-xs">
                    <label>CNPJ da operadora (para o S-1210)<input aria-label="CNPJ da operadora" className={`block w-44 ${inp}`} value={operadora.cnpjOper} onChange={e => setOperadora(o => ({ ...o, cnpjOper: e.target.value }))} /></label>
                    <label>Registro na ANS<input aria-label="Registro na ANS" className={`block w-24 ${inp}`} value={operadora.regANS} onChange={e => setOperadora(o => ({ ...o, regANS: e.target.value.replace(/\D/g, '').slice(0, 6) }))} /></label>
                    {operadora.cnpjOper && !cnpjValido(normalizarCnpj(operadora.cnpjOper)) && <span className="text-red-700 dark:text-red-300">CNPJ inválido: a coparticipação vai sem a dedução no S-1210.</span>}
                </div>
                <input aria-label="Planilha da coparticipação" type="file" accept=".xlsx,.xls,.csv" onChange={e => { const f = e.target.files?.[0]; if (f) void lerCopart(f); }} />
                {copart && copartFichas && (
                    <>
                        {copart.avisos.map(a => <p key={a} className="text-xs text-amber-700 dark:text-amber-300">{a}</p>)}
                        <table className="w-full text-xs">
                            <thead className="text-left text-slate-500"><tr><th className="p-1">Funcionário</th><th className="p-1 text-right">Coparticipação</th></tr></thead>
                            <tbody>{[...copartFichas.porFicha].map(([fichaId, valor]) => <tr key={fichaId} className="border-t border-slate-100 dark:border-slate-700"><td className="p-1">{nomeDa(fichaId)}</td><td className="p-1 text-right">{reais(valor)}</td></tr>)}</tbody>
                        </table>
                        {copartFichas.semFicha.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Sem ficha ativa na competência (não lançados): {copartFichas.semFicha.map(l => `${l.nome || l.cpf} (${reais(l.valor)})`).join(', ')}.</p>}
                        <button className={btnP} disabled={!!ocupado || !copartFichas.porFicha.size} onClick={lancarCopart}>Lançar na folha de {br(ativa.competencia)}</button>
                    </>
                )}
            </section>
        </div>
    );
};

export default VtECoparticipacao;
