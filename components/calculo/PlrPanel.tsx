// components/calculo/PlrPanel.tsx
//
// Folha do mês › PLR (Processos › Digitação PLR do IOB SAGE): a participação nos lucros ou resultados de cada
// funcionário da empresa ativa, paga numa data do mês. O valor fica no movimento do mês do pagamento (gravado com o
// "Salvar"; mês encerrado no Fim de mês fica travado). O cálculo é do motor da PLR (services/calculo/plr.ts): sem INSS
// e FGTS, IRRF exclusivo pela tabela anual da PLR, refeito sobre o total do ano. O S-1200 e o S-1210 saem com a folha
// do mês (Cálculo mensal › S-1200 e S-1210), num demonstrativo próprio.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarFuncionarios, listarTabelas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { tabelaVigente, type TabelaLegal } from '../../services/cadastros/tabelasLegais';
import { listarMovimentos, listarMovimentosDaEmpresa, salvarMovimentos } from '../../services/calculo/movimentosService';
import { lerFechamento } from '../../services/fimDeMes/fechamentoService';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { motorHomologadoNoMes } from '../../services/calculo/arredondamento';
import { limparMovimento, validarMovimento } from '../../services/calculo/movimento';
import type { Movimento } from '../../services/calculo/motorMensal';
import { mesesTrabalhadosNoAno, plrDoMes, plrProporcional, type ResultadoPlr } from '../../services/calculo/plr';

interface Props { usuario: Usuario }
interface Linha { integral: string; pensao: string; anteriorValor: string; anteriorIrrf: string }

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const txt = (c?: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');
const centavos = (t: string) => (t.trim() ? centavosDeTexto(t) ?? 0 : 0);

const PlrPanel: React.FC<Props> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [competencia, setCompetencia] = useState(ativa?.competencia ?? '');
    const [data, setData] = useState('');
    const [proporcional, setProporcional] = useState(false);
    const [comDesligados, setComDesligados] = useState(false);
    const [empresa, setEmpresa] = useState<Empresa | null>(null);
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [tabelas, setTabelas] = useState<TabelaLegal[]>([]);
    const [movsEmpresa, setMovsEmpresa] = useState<Record<string, Record<string, Movimento>> | null>(null);
    const [gravados, setGravados] = useState<Record<string, Movimento> | null>(null);
    const [linhas, setLinhas] = useState<Record<string, Linha>>({});
    const [encerrado, setEncerrado] = useState(false);
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [recarga, setRecarga] = useState(0);

    useEffect(() => { if (ativa?.competencia) setCompetencia(ativa.competencia); }, [ativa?.competencia]);
    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setErro('');
        Promise.all([listarEmpresasVisiveis(), listarFuncionarios(ativa.id), listarTabelas(), listarMovimentosDaEmpresa(ativa.id)])
            .then(([emps, fs, ts, ms]) => { if (!vivo) return; setEmpresa(emps.find(e => e.id === ativa.id) ?? null); setFichas(fs); setTabelas(ts); setMovsEmpresa(ms); })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa, recarga]);
    // O mês do pagamento: os movimentos gravados dele (a PLR digitada antes) e o fechamento.
    useEffect(() => {
        if (!ativa || !/^\d{4}-\d{2}$/.test(competencia)) return;
        let vivo = true;
        setGravados(null); setLinhas({}); setEncerrado(false);
        listarMovimentos(ativa.id, competencia).then(gs => {
            if (!vivo) return;
            const m = Object.fromEntries(gs.map(g => [g.fichaId, g.movimento]));
            setGravados(m);
            setLinhas(Object.fromEntries(gs.filter(g => g.movimento.plr).map(g => [g.fichaId, { integral: txt(g.movimento.plr!.valor), pensao: txt(g.movimento.plr!.pensao), anteriorValor: txt(g.movimento.plr!.anteriorValor), anteriorIrrf: txt(g.movimento.plr!.anteriorIrrf) }])));
            const d = gs.find(g => g.movimento.plr?.data)?.movimento.plr?.data;
            setData(d && d.startsWith(competencia) ? d : '');
        }).catch(e => { if (vivo) { setErro(`Movimentos do mês não lidos: ${mensagemErro(e)}`); setGravados(null); } });
        lerFechamento(ativa.id, competencia).then(f => { if (vivo) setEncerrado(f?.situacao === 'encerrado'); }).catch(() => undefined);
        return () => { vivo = false; };
    }, [ativa, competencia, recarga]);

    const ano = Number(competencia.slice(0, 4));
    const fimMes = /^\d{4}-\d{2}$/.test(competencia) ? new Date(Date.UTC(ano, Number(competencia.slice(5, 7)), 0)).toISOString().slice(0, 10) : '';
    const visiveis = useMemo(() => fichas
        .filter(f => (f.dados.admissao ?? '') <= (fimMes || '9999') && (comDesligados || !f.dados.dataDesligamento || f.dados.dataDesligamento >= `${competencia}-01` || !!linhas[f.id]))
        .sort((a, b) => (a.dados.nome ?? '').localeCompare(b.dados.nome ?? '', 'pt-BR')), [fichas, fimMes, comDesligados, competencia, linhas]);
    const set = (id: string, m: Partial<Linha>) => setLinhas(x => ({ ...x, [id]: { integral: '', pensao: '', anteriorValor: '', anteriorIrrf: '', ...x[id], ...m } }));

    // PLR de cada um: o valor (integral ou proporcional aos meses do ano) no movimento do mês, com o IRRF do ano.
    const calculo = useMemo(() => {
        const out: { f: FichaFuncionario; meses: number; valor: number; r: ResultadoPlr | null; movimento: Movimento }[] = [];
        for (const f of visiveis) {
            const l = linhas[f.id];
            const meses = mesesTrabalhadosNoAno(f.dados, ano);
            const integral = l ? centavos(l.integral) : 0;
            const valor = proporcional ? plrProporcional(integral, meses) : integral;
            const base = gravados?.[f.id] ?? {};
            const { plr: _p, ...sem } = base;
            const movimento: Movimento = valor > 0 ? { ...sem, plr: { valor, data, ...(centavos(l!.pensao) ? { pensao: centavos(l!.pensao) } : {}), ...(centavos(l!.anteriorValor) ? { anteriorValor: centavos(l!.anteriorValor) } : {}), ...(centavos(l!.anteriorIrrf) ? { anteriorIrrf: centavos(l!.anteriorIrrf) } : {}) } } : sem;
            const r = valor > 0 ? plrDoMes(f, { ...(movsEmpresa?.[f.id] ?? {}), [competencia]: movimento }, competencia, tabelas) : null;
            out.push({ f, meses, valor, r, movimento });
        }
        return out;
    }, [visiveis, linhas, proporcional, gravados, data, movsEmpresa, competencia, tabelas, ano]);
    const resultados = calculo.flatMap(c => (c.r ? [c.r] : []));
    const total = (k: 'proventos' | 'descontos' | 'liquido') => resultados.reduce((s, r) => s + r.totais[k], 0);
    const irrf = resultados.reduce((s, r) => s + (r.verbas.find(v => v.codigo === 'IRRFPLR')?.valor ?? 0), 0);
    const semTabela = /^\d{4}-\d{2}$/.test(competencia) && 'erro' in tabelaVigente(tabelas, 'irrf_plr', competencia);
    const mudaram = calculo.filter(c => JSON.stringify(limparMovimento(c.movimento)) !== JSON.stringify(limparMovimento(gravados?.[c.f.id] ?? {})));

    async function salvar() {
        if (!ativa || !gravados || encerrado) return;
        if (resultados.length && !/^\d{4}-\d{2}-\d{2}$/.test(data)) { setErro('Informe a data do pagamento da PLR.'); return; }
        if (data && !data.startsWith(competencia)) { setErro(`A data do pagamento (${br(data)}) tem de ser de ${competencia.slice(5)}/${competencia.slice(0, 4)}: a PLR vai no movimento do mês do pagamento.`); return; }
        const erros = mudaram.flatMap(c => validarMovimento(limparMovimento(c.movimento)).map(e => `${c.f.dados.nome || c.f.cpf}: ${e}`));
        if (erros.length) { setErro(erros.join(' ')); return; }
        setOcupado(true); setErro(''); setMsg('');
        try {
            await salvarMovimentos(ativa.id, competencia, mudaram.map(c => ({ fichaId: c.f.id, antes: gravados[c.f.id] ?? null, depois: c.movimento })), usuario);
            setMsg(`PLR gravada no movimento de ${competencia.slice(5)}/${competencia.slice(0, 4)} (${mudaram.length} funcionário(s)). O S-1200 e o S-1210 saem com a folha do mês, em demonstrativo próprio.`);
            setRecarga(n => n + 1);
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setOcupado(false); }
    }

    async function pdf() {
        if (!resultados.length) return;
        const m = await import('../../services/relatorios/holeritePdf');
        m.holeritesPdf(resultados, fichas, {
            empresa: { razaoSocial: empresa?.razaoSocial ?? ativa?.nome ?? '', cnpj: empresa?.cnpj ?? ativa?.cnpj ?? '', codigoSage: empresa?.codigoSage },
            titulo: `Participação nos lucros ou resultados — pagamento em ${br(data)}`, previa: !motorHomologadoNoMes(empresa?.parametrosFolha, competencia),
        }).save(`plr-${ativa?.codigoSage ?? 'empresa'}-${competencia}.pdf`);
    }
    function excel() {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(calculo.filter(c => c.r).map(c => ({
            Nome: c.f.dados.nome, Matrícula: c.f.matriculaEsocial, 'Meses no ano': c.meses, PLR: c.valor / 100,
            'IRRF PLR': (c.r!.verbas.find(v => v.codigo === 'IRRFPLR')?.valor ?? 0) / 100, Pensão: (c.r!.verbas.find(v => v.codigo === 'PENSAOPLR')?.valor ?? 0) / 100, Líquido: c.r!.totais.liquido / 100,
        }))), 'PLR');
        XLSX.writeFile(wb, `plr-${competencia}.xlsx`);
    }

    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa.</p>;
    return (
        <section aria-label="Participação nos lucros ou resultados" className="space-y-3">
            <header>
                <h2 className="text-xl font-semibold text-slate-800 dark:text-white">Participação nos Lucros ou Resultados — PLR</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    Como a Digitação PLR do SAGE. Sem INSS e FGTS; IRRF exclusivo na fonte pela tabela anual da PLR (Cadastros › Tabelas legais), refeito sobre o total pago no ano (Lei 10.101/2000). No máximo 2 pagamentos no ano, com um trimestre civil de intervalo. O valor fica no movimento do mês do pagamento; o S-1200 e o S-1210 saem com a folha do mês, em demonstrativo próprio (inclusive para quem já foi desligado).
                </p>
            </header>
            <div className="flex flex-wrap items-end gap-3 text-sm dark:text-slate-100">
                <label>Mês do pagamento<input aria-label="Mês do pagamento da PLR" type="month" className={`block ${inp}`} value={competencia} onChange={e => setCompetencia(e.target.value)} /></label>
                <label>Data do pagamento<input aria-label="Data do pagamento da PLR" type="date" className={`block ${inp}`} value={data} min={`${competencia}-01`} max={fimMes} onChange={e => setData(e.target.value)} /></label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={proporcional} onChange={e => setProporcional(e.target.checked)} />Calcular proporcional (meses trabalhados no ano ÷ 12)</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={comDesligados} onChange={e => setComDesligados(e.target.checked)} />Mostrar desligados</label>
            </div>
            {semTabela && <p role="alert" className="rounded-sm bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">Sem a tabela do IRRF da PLR vigente em {competencia.slice(5)}/{competencia.slice(0, 4)}: cadastre a tabela anual da PLR em Cadastros › Tabelas legais (com a norma).</p>}
            {encerrado && <p className="rounded-sm bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">Competência encerrada no Fim de mês: a PLR dela não muda sem reabrir.</p>}
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded-sm bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <tr><th className="p-2">Funcionário</th><th className="p-2">Meses no ano</th><th className="p-2">{proporcional ? 'Valor integral do ano (R$)' : 'PLR (R$)'}</th><th className="p-2">Pensão sobre a PLR (R$)</th><th className="p-2" title="PLR paga no ano fora do Consultor (o IRRF é refeito sobre o total)">Já paga no ano / IRRF (R$)</th><th className="p-2 text-right">PLR</th><th className="p-2 text-right">IRRF</th><th className="p-2 text-right">Líquido</th><th className="p-2">Situação</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {calculo.map(({ f, meses, valor, r }) => {
                            const l = linhas[f.id];
                            const nome = f.dados.nome || f.cpf;
                            return (
                                <tr key={f.id} className="dark:text-slate-100">
                                    <td className="p-2">{nome}<span className="text-xs text-slate-500"> · {f.matriculaEsocial}{f.dados.dataDesligamento ? ` · desligado em ${br(f.dados.dataDesligamento)}` : ''}</span></td>
                                    <td className="p-2 tabular-nums">{meses}</td>
                                    <td className="p-2"><input aria-label={`PLR de ${nome}`} className={`w-28 ${inp}`} inputMode="decimal" disabled={encerrado} value={l?.integral ?? ''} onChange={e => set(f.id, { integral: e.target.value })} /></td>
                                    <td className="p-2"><input aria-label={`Pensão sobre a PLR de ${nome}`} className={`w-24 ${inp}`} inputMode="decimal" disabled={encerrado || !l?.integral} value={l?.pensao ?? ''} onChange={e => set(f.id, { pensao: e.target.value })} /></td>
                                    <td className="p-2"><input aria-label={`PLR já paga no ano de ${nome}`} className={`w-24 ${inp}`} inputMode="decimal" disabled={encerrado || !l?.integral} value={l?.anteriorValor ?? ''} onChange={e => set(f.id, { anteriorValor: e.target.value })} />{' '}
                                        <input aria-label={`IRRF já retido no ano de ${nome}`} className={`w-20 ${inp}`} inputMode="decimal" disabled={encerrado || !l?.integral} value={l?.anteriorIrrf ?? ''} onChange={e => set(f.id, { anteriorIrrf: e.target.value })} /></td>
                                    <td className="p-2 text-right tabular-nums">{valor ? reais(valor) : '—'}</td>
                                    <td className="p-2 text-right tabular-nums">{r ? reais(r.verbas.find(v => v.codigo === 'IRRFPLR')?.valor ?? 0) : '—'}</td>
                                    <td className="p-2 text-right tabular-nums">{r ? reais(r.totais.liquido) : '—'}</td>
                                    <td className="p-2 text-xs">{r ? (r.situacao === 'calculado' ? <span className="text-green-700 dark:text-green-300" title={r.memoria.join('\n')}>ok{r.avisos.length ? ` · ${r.avisos.join(' ')}` : ''}</span> : <span className="text-red-700 dark:text-red-300">{r.erros.join(' ')}</span>) : ''}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 font-medium dark:border-slate-600 dark:text-slate-100"><tr>
                        <td className="p-2" colSpan={5}>Total ({resultados.length})</td>
                        <td className="p-2 text-right">{reais(total('proventos'))}</td><td className="p-2 text-right">{reais(irrf)}</td><td className="p-2 text-right">{reais(total('liquido'))}</td><td />
                    </tr></tfoot>
                </table>
            </div>
            <div className="flex flex-wrap gap-2">
                <button className="rounded-sm bg-blue-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50" disabled={ocupado || encerrado || !gravados || !mudaram.length} onClick={salvar}>{ocupado ? 'Gravando…' : `Salvar (${mudaram.length})`}</button>
                <button className={btn} disabled={!resultados.length} onClick={pdf}>Recibos da PLR (PDF)</button>
                <button className={btn} disabled={!resultados.length} onClick={excel}>Exportar Excel</button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">IRRF da PLR: DARF com o código 3562 (pela DCTFWeb, com o S-1210). Pensão alimentícia judicial sobre a PLR deduz da base (Lei 10.101/2000, art. 3º, § 6º).</p>
        </section>
    );
};

export default PlrPanel;
