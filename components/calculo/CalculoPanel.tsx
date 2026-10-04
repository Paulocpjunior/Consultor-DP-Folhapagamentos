// components/calculo/CalculoPanel.tsx
//
// Aba "Cálculo" (Fase 3): prévia do cálculo mensal por empresa e competência,
// com o motor de services/calculo. O movimento digitado (horas extras, faltas,
// pensão, lançamentos) fica só nesta tela — não é gravado. Serve para
// conferir o motor contra o holerite do IOB antes de qualquer uso real.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarTodasEmpresas } from '../../services/empresas/empresasService';
import { listarAfastamentos, listarFuncionarios, listarTabelas, mensagemErro } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { calcularMensal, competenciaSeguinte, noMes, type Lancamento, type Movimento, type ResultadoCalculo } from '../../services/calculo/motorMensal';
import { somarMeses } from '../../services/prazos/calendario';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const SITUACAO: Record<ResultadoCalculo['situacao'], [string, string]> = {
    calculado: ['calculado', 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'],
    incompleto: ['incompleto', 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'],
    erro: ['erro', 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'],
};
const decimal = (t: string) => { const n = Number(t.trim().replace(',', '.')); return t.trim() && Number.isFinite(n) && n >= 0 ? n : undefined; };
const v = (r: ResultadoCalculo, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;
const real = (c: number) => (c ? reais(c) : '—');

interface Dados { fichas: FichaFuncionario[]; afastamentos: Afastamento[]; tabelas: TabelaLegal[] }

const CalculoPanel: React.FC = () => {
    const mesAnterior = somarMeses(`${new Date().toLocaleDateString('sv-SE').slice(0, 7)}-01`, -1).slice(0, 7);
    const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
    const [empresaId, setEmpresaId] = useState('');
    const [competencia, setCompetencia] = useState(mesAnterior);
    const [pagamento, setPagamento] = useState(competenciaSeguinte(mesAnterior));
    const [dados, setDados] = useState<Dados | null>(null);
    const [movs, setMovs] = useState<Record<string, Movimento>>({});
    const [aberto, setAberto] = useState('');
    const [erro, setErro] = useState('');

    useEffect(() => { listarTodasEmpresas().then(setEmpresas).catch(e => { setErro(mensagemErro(e)); setEmpresas([]); }); }, []);
    useEffect(() => {
        setDados(null); setMovs({}); setAberto('');
        if (!empresaId) return;
        setErro('');
        Promise.all([listarFuncionarios(empresaId), listarAfastamentos(empresaId), listarTabelas()])
            .then(([fichas, afastamentos, tabelas]) => setDados({ fichas, afastamentos, tabelas }))
            .catch(e => { setErro(mensagemErro(e)); setDados({ fichas: [], afastamentos: [], tabelas: [] }); });
    }, [empresaId]);

    const empresa = empresas?.find(e => e.id === empresaId);
    const resultados = useMemo(() => {
        if (!dados || !/^\d{4}-\d{2}$/.test(competencia)) return [];
        return noMes(dados.fichas, competencia).map(f => calcularMensal({
            competencia, pagamento, ficha: f, tabelas: dados.tabelas, movimento: movs[f.id],
            afastamentos: dados.afastamentos.filter(a => a.fichaId === f.id),
        }));
    }, [dados, competencia, pagamento, movs]);
    const total = (f: (r: ResultadoCalculo) => number) => resultados.reduce((s, r) => s + f(r), 0);
    const sel = resultados.find(r => r.fichaId === aberto);

    function exportar() {
        const resumo = resultados.map(r => ({
            Nome: r.nome, Situação: r.situacao, Proventos: r.totais.proventos / 100, INSS: v(r, 'INSS') / 100, IRRF: v(r, 'IRRF') / 100,
            'Salário-família': v(r, 'SF') / 100, Descontos: r.totais.descontos / 100, Líquido: r.totais.liquido / 100,
            'Base INSS': r.bases.inss / 100, 'Base FGTS': r.bases.fgts / 100, 'Rendimentos IRRF': r.bases.irrf / 100, FGTS: r.fgts / 100,
            'Erros e avisos': [...r.erros, ...r.avisos].join(' | '),
        }));
        const verbas = resultados.flatMap(r => r.verbas.map(x => ({ Nome: r.nome, Código: x.codigo, Descrição: x.descricao, Referência: x.referencia, Tipo: x.tipo, Valor: x.valor / 100 })));
        const memoria = resultados.flatMap(r => r.memoria.map(m => ({ Nome: r.nome, Passo: m })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), 'Resumo');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(verbas), 'Verbas');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memoria), 'Memória');
        XLSX.writeFile(wb, `calculo-${empresa?.codigoSage ?? 'empresa'}-${competencia}.xlsx`);
    }

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                <strong>Prévia do motor de cálculo (Fase 3).</strong> Não substitui o cálculo do IOB enquanto não for conferido contra ele. O movimento digitado aqui não é gravado. Férias, 13º, rescisão, adicionais e médias ainda não estão no motor.
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm dark:text-white">Empresa
                    <select aria-label="Empresa" className={`ml-2 ${inp}`} value={empresaId} onChange={e => setEmpresaId(e.target.value)}>
                        <option value="">— escolha —</option>
                        {(empresas ?? []).map(e => <option key={e.id} value={e.id}>{e.codigoSage} · {e.nomeFantasia || e.razaoSocial}</option>)}
                    </select>
                </label>
                <label className="text-sm dark:text-white">Competência
                    <input aria-label="Competência" type="month" className={`ml-2 ${inp}`} value={competencia} onChange={e => { setCompetencia(e.target.value); if (/^\d{4}-\d{2}$/.test(e.target.value)) setPagamento(competenciaSeguinte(e.target.value)); }} />
                </label>
                <label className="text-sm dark:text-white" title="O IRRF segue o mês do pagamento (regime de caixa).">Pagamento em
                    <input aria-label="Mês do pagamento" type="month" className={`ml-2 ${inp}`} value={pagamento} onChange={e => setPagamento(e.target.value)} />
                </label>
                <button className={`ml-auto ${btn}`} disabled={!resultados.length} onClick={exportar}>Exportar Excel</button>
            </div>

            {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {empresaId && !dados && <p className="text-sm text-slate-500">Carregando…</p>}
            {dados && !resultados.length && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">Nenhum funcionário com vínculo nesta competência. Confira o cadastro em Cadastros › Funcionários.</p>}

            {resultados.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <tr><th className="p-2">Nome</th><th className="p-2 text-right">Proventos</th><th className="p-2 text-right">INSS</th><th className="p-2 text-right">IRRF</th><th className="p-2 text-right">Sal.-família</th><th className="p-2 text-right">Líquido</th><th className="p-2 text-right">FGTS</th><th className="p-2">Situação</th></tr>
                        </thead>
                        <tbody>
                            {resultados.map(r => (
                                <tr key={r.fichaId} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700 ${aberto === r.fichaId ? 'bg-blue-50 dark:bg-slate-700' : ''}`} onClick={() => setAberto(a => (a === r.fichaId ? '' : r.fichaId))}>
                                    <td className="p-2 font-medium">{r.nome}{movs[r.fichaId] && <span className="ml-1 text-xs text-blue-700 dark:text-blue-300">(com movimento)</span>}</td>
                                    <td className="p-2 text-right">{real(r.totais.proventos)}</td>
                                    <td className="p-2 text-right">{real(v(r, 'INSS'))}</td>
                                    <td className="p-2 text-right">{real(v(r, 'IRRF'))}</td>
                                    <td className="p-2 text-right">{real(v(r, 'SF'))}</td>
                                    <td className="p-2 text-right font-medium">{r.situacao === 'erro' ? '—' : reais(r.totais.liquido)}</td>
                                    <td className="p-2 text-right">{real(r.fgts)}</td>
                                    <td className="p-2 text-xs" title={[...r.erros, ...r.avisos].join('\n')}><span className={`rounded px-1.5 ${SITUACAO[r.situacao][1]}`}>{SITUACAO[r.situacao][0]}</span>{r.avisos.length > 0 && <span className="ml-1 text-amber-700 dark:text-amber-300">{r.avisos.length} aviso(s)</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t-2 border-slate-200 font-medium dark:border-slate-600 dark:text-white">
                            <tr><td className="p-2">Total ({resultados.length})</td><td className="p-2 text-right">{reais(total(r => r.totais.proventos))}</td><td className="p-2 text-right">{reais(total(r => v(r, 'INSS')))}</td><td className="p-2 text-right">{reais(total(r => v(r, 'IRRF')))}</td><td className="p-2 text-right">{reais(total(r => v(r, 'SF')))}</td><td className="p-2 text-right">{reais(total(r => r.totais.liquido))}</td><td className="p-2 text-right">{reais(total(r => r.fgts))}</td><td /></tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {sel && <Holerite r={sel} mov={movs[sel.fichaId] ?? {}} onMov={m => setMovs(x => ({ ...x, [sel.fichaId]: m }))} />}
        </div>
    );
};

const Holerite: React.FC<{ r: ResultadoCalculo; mov: Movimento; onMov: (m: Movimento) => void }> = ({ r, mov, onMov }) => {
    const campo = (k: 'horasExtras50' | 'horasExtras100' | 'faltasDias' | 'dsrDescontadoDias' | 'feriadosLocais', rotulo: string) => (
        <label className="text-xs dark:text-slate-200">{rotulo}
            <input aria-label={rotulo} className={`mt-0.5 block w-24 ${inp}`} defaultValue={mov[k] != null ? String(mov[k]).replace('.', ',') : ''}
                onChange={e => onMov({ ...mov, [k]: decimal(e.target.value) })} />
        </label>
    );
    const lancs = mov.lancamentos ?? [];
    const setLanc = (i: number, l: Partial<Lancamento>) => onMov({ ...mov, lancamentos: lancs.map((x, j) => (j === i ? { ...x, ...l } : x)) });
    return (
        <section aria-label={`Holerite de ${r.nome}`} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-2 dark:border-slate-700 dark:bg-slate-800">
            <div>
                <h3 className="font-semibold text-slate-800 dark:text-white">{r.nome} · {r.competencia.split('-').reverse().join('/')} <span className="text-xs font-normal text-slate-500">(IRRF pelo pagamento em {r.pagamento.split('-').reverse().join('/')})</span></h3>
                {r.erros.length > 0 && <ul role="alert" className="mt-2 list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{r.erros.map(e => <li key={e}>{e}</li>)}</ul>}
                <table className="mt-2 w-full text-sm dark:text-slate-100">
                    <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Verba</th><th className="py-1">Ref.</th><th className="py-1 text-right">Proventos</th><th className="py-1 text-right">Descontos</th></tr></thead>
                    <tbody>{r.verbas.map(x => (
                        <tr key={x.codigo} className="border-t border-slate-100 dark:border-slate-700"><td className="py-1">{x.descricao}</td><td className="py-1 text-xs">{x.referencia}</td><td className="py-1 text-right">{x.tipo === 'provento' ? reais(x.valor) : ''}</td><td className="py-1 text-right">{x.tipo === 'desconto' ? reais(x.valor) : ''}</td></tr>
                    ))}</tbody>
                    <tfoot className="border-t-2 border-slate-200 font-medium dark:border-slate-600">
                        <tr><td className="py-1" colSpan={2}>Totais</td><td className="py-1 text-right">{reais(r.totais.proventos)}</td><td className="py-1 text-right">{reais(r.totais.descontos)}</td></tr>
                        <tr><td className="py-1" colSpan={3}>Líquido</td><td className="py-1 text-right">{reais(r.totais.liquido)}</td></tr>
                    </tfoot>
                </table>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Base INSS {reais(r.bases.inss)} · Base FGTS {reais(r.bases.fgts)} · FGTS {reais(r.fgts)} · Rendimentos IRRF {reais(r.bases.irrf)}</p>
                <details open className="mt-2 text-xs text-slate-700 dark:text-slate-200">
                    <summary className="cursor-pointer font-medium">Memória de cálculo</summary>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5">{r.memoria.map((m, i) => <li key={i}>{m}</li>)}</ol>
                </details>
                {r.avisos.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">{r.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
            </div>
            <div key={r.fichaId} className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Movimento do mês (não é gravado)</h4>
                <div className="flex flex-wrap gap-3">
                    {campo('horasExtras50', 'Horas extras 50%')}
                    {campo('horasExtras100', 'Horas extras 100%')}
                    {campo('faltasDias', 'Faltas (dias)')}
                    {campo('dsrDescontadoDias', 'DSR descontado (dias)')}
                    {campo('feriadosLocais', 'Feriados locais no mês')}
                    <label className="text-xs dark:text-slate-200">Pensão alimentícia (R$)
                        <input aria-label="Pensão alimentícia" className={`mt-0.5 block w-28 ${inp}`} defaultValue={mov.pensaoAlimenticia ? (mov.pensaoAlimenticia / 100).toFixed(2).replace('.', ',') : ''}
                            onChange={e => onMov({ ...mov, pensaoAlimenticia: centavosDeTexto(e.target.value) ?? undefined })} />
                    </label>
                </div>
                <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Lançamentos avulsos</p>
                    {lancs.map((l, i) => (
                        <div key={i} className="mt-1 flex flex-wrap items-center gap-2 text-xs dark:text-slate-200">
                            <input aria-label={`Descrição do lançamento ${i + 1}`} className={`w-40 ${inp}`} value={l.descricao} onChange={e => setLanc(i, { descricao: e.target.value })} />
                            <select aria-label={`Tipo do lançamento ${i + 1}`} className={inp} value={l.tipo} onChange={e => setLanc(i, { tipo: e.target.value as Lancamento['tipo'] })}><option value="provento">Provento</option><option value="desconto">Desconto</option></select>
                            <input aria-label={`Valor do lançamento ${i + 1}`} className={`w-24 ${inp}`} defaultValue={l.valor ? (l.valor / 100).toFixed(2).replace('.', ',') : ''} onChange={e => setLanc(i, { valor: centavosDeTexto(e.target.value) ?? 0 })} />
                            {(['inss', 'fgts', 'irrf'] as const).map(k => <label key={k} className="flex items-center gap-0.5"><input type="checkbox" checked={l[k]} onChange={e => setLanc(i, { [k]: e.target.checked })} />{k.toUpperCase()}</label>)}
                            <button aria-label={`Remover lançamento ${i + 1}`} className="text-red-700 dark:text-red-300" onClick={() => onMov({ ...mov, lancamentos: lancs.filter((_, j) => j !== i) })}>remover</button>
                        </div>
                    ))}
                    <button className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" onClick={() => onMov({ ...mov, lancamentos: [...lancs, { descricao: '', tipo: 'provento', valor: 0, inss: true, fgts: true, irrf: true }] })}>Adicionar lançamento</button>
                    <p className="mt-1 text-xs text-slate-500">Marque onde o lançamento incide. Confira com a incidência da rubrica em Cadastros › Incidências.</p>
                </div>
            </div>
        </section>
    );
};

export default CalculoPanel;
