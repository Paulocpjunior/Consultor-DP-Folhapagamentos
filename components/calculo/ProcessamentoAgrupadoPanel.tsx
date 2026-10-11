// components/calculo/ProcessamentoAgrupadoPanel.tsx
//
// Folha do mês › Processamento agrupado: a folha mensal de várias empresas da carteira de uma vez (como o
// "Processamento Agrupado" do SAGE), com os movimentos gravados de cada uma: situação dos cálculos, totais,
// adiantamento a pagar, encargos e, se pedido, as provisões; gravação da folha opcional (competência aberta) e a
// planilha da carteira. O detalhe de cada empresa continua na tela de Cálculo.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarTabelas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import { listarConvencoes } from '../../services/sindicatos/convencoesService';
import type { ConvencaoColetiva } from '../../services/sindicatos/convencao';
import { reais } from '../../services/cadastros/documentos';
import { processarEmpresas } from '../../services/calculo/processamentoAgrupadoService';
import { planilhaAgrupada, ROTULO_GRAVACAO, ROTULO_SITUACAO_AGRUPADA, totaisAgrupados, type LinhaAgrupada } from '../../services/calculo/processamentoAgrupado';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (c: string) => (/^\d{4}-\d{2}$/.test(c) ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : c);
const nomeDe = (e: Empresa) => e.nomeFantasia || e.razaoSocial;
const corSituacao: Record<LinhaAgrupada['situacao'], string> = {
    ok: 'text-green-700 dark:text-green-300', 'com-pendencias': 'text-amber-700 dark:text-amber-300', 'sem-funcionarios': 'text-slate-500', falhou: 'text-red-700 dark:text-red-300',
};

const ProcessamentoAgrupadoPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [competencia, setCompetencia] = useState(ativa?.competencia ?? '');
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [tabelas, setTabelas] = useState<TabelaLegal[]>([]);
    const [convencoes, setConvencoes] = useState<ConvencaoColetiva[]>([]);
    const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
    const [busca, setBusca] = useState('');
    const [gravar, setGravar] = useState(false);
    const [provisoes, setProvisoes] = useState(false);
    const [linhas, setLinhas] = useState<LinhaAgrupada[]>([]);
    const [andamento, setAndamento] = useState('');
    const [aberta, setAberta] = useState('');
    const [erro, setErro] = useState('');

    useEffect(() => {
        let vivo = true;
        Promise.all([listarEmpresasVisiveis(), listarTabelas(), listarConvencoes().catch(() => [])])
            .then(([es, ts, cs]) => {
                if (!vivo) return;
                const ordenadas = [...es].sort((a, b) => (a.codigoSage || '').localeCompare(b.codigoSage || '') || nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'));
                setEmpresas(ordenadas); setTabelas(ts); setConvencoes(cs); setMarcadas(new Set(ordenadas.map(e => e.id)));
            })
            .catch(e => { if (vivo) setErro(`Carteira não carregada: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, []);

    const filtradas = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return q ? empresas.filter(e => `${e.codigoSage} ${nomeDe(e)} ${e.cnpj}`.toLowerCase().includes(q)) : empresas;
    }, [empresas, busca]);
    const escolhidas = empresas.filter(e => marcadas.has(e.id));
    const compOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia);
    const t = totaisAgrupados(linhas);

    async function processar() {
        if (!escolhidas.length || !compOk) return;
        if (gravar && !window.confirm(`Gravar a folha de ${br(competencia)} de ${escolhidas.length} empresa(s)? A folha gravada de cada uma é substituída (as competências encerradas no Fim de mês ficam como estão).`)) return;
        setErro(''); setLinhas([]); setAberta('');
        setAndamento(`Processando 1 de ${escolhidas.length}: ${nomeDe(escolhidas[0])}…`);
        try {
            await processarEmpresas(escolhidas, { competencia, gravar, provisoes, usuario, tabelas, convencoes }, (feitas, l) => {
                setLinhas(ls => [...ls, l]);
                const prox = escolhidas[feitas];
                setAndamento(prox ? `Processando ${feitas + 1} de ${escolhidas.length}: ${nomeDe(prox)}…` : '');
            });
        } catch (x) { setErro(`Processamento interrompido: ${mensagemErro(x)}`); }
        finally { setAndamento(''); }
    }
    function planilha() {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(planilhaAgrupada(linhas)), 'Carteira');
        XLSX.writeFile(wb, `processamento-agrupado-${competencia}.xlsx`);
    }
    const marcar = (ids: string[], v: boolean) => setMarcadas(m => { const n = new Set(m); ids.forEach(id => (v ? n.add(id) : n.delete(id))); return n; });

    return (
        <div className="space-y-4 text-sm">
            <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Processamento agrupado · {compOk ? br(competencia) : '—'}</h2>
                <p className="text-slate-600 dark:text-slate-300">A folha mensal das empresas escolhidas de uma vez, com o mesmo cálculo da tela de Cálculo e os movimentos gravados de cada uma (o que foi digitado e não salvo não entra). Para cada empresa: situação, totais, adiantamento a pagar, encargos e, se marcado, as provisões de férias e 13º.</p>
            </div>

            <section className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-end gap-3">
                    <label>Competência<input aria-label="Competência do processamento" type="month" className={`block ${inp}`} value={competencia} onChange={e => setCompetencia(e.target.value)} /></label>
                    <label className="flex-1">Buscar<input aria-label="Buscar empresa" className={`block w-full ${inp}`} value={busca} placeholder="código, nome ou CNPJ" onChange={e => setBusca(e.target.value)} /></label>
                    <button className={btn} onClick={() => marcar(filtradas.map(e => e.id), true)}>Marcar {busca ? 'as filtradas' : 'todas'}</button>
                    <button className={btn} onClick={() => marcar(filtradas.map(e => e.id), false)}>Desmarcar {busca ? 'as filtradas' : 'todas'}</button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded border border-slate-100 p-1 dark:border-slate-700">
                    {filtradas.length === 0 && <p className="p-2 text-slate-500">{empresas.length ? 'Nenhuma empresa com essa busca.' : 'Nenhuma empresa na sua carteira.'}</p>}
                    {filtradas.map(e => (
                        <label key={e.id} className="flex items-center gap-2 px-1 py-0.5">
                            <input type="checkbox" aria-label={`Processar ${nomeDe(e)}`} checked={marcadas.has(e.id)} onChange={x => marcar([e.id], x.target.checked)} />
                            <span className="font-mono text-xs text-slate-500">{e.codigoSage || '—'}</span>{nomeDe(e)}
                        </label>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={provisoes} onChange={e => setProvisoes(e.target.checked)} />Calcular as provisões de férias e 13º</label>
                    <label className="flex items-center gap-2" title="Grava a folha do mês de cada empresa com a competência aberta, como o botão Gravar a folha da tela de Cálculo."><input type="checkbox" checked={gravar} onChange={e => setGravar(e.target.checked)} />Gravar a folha de cada empresa</label>
                    <button className="ml-auto rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!!andamento || !escolhidas.length || !compOk || !tabelas.length} onClick={processar}>Processar {escolhidas.length} empresa(s)</button>
                </div>
            </section>

            {andamento && <p role="status" className="text-blue-700 dark:text-blue-300">{andamento}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

            {linhas.length > 0 && (
                <section aria-label="Resultado do processamento" className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{t.empresas} empresa(s) · {t.ok} calculada(s) sem pendência · {t.pendencias} com pendência</p>
                        <button className={btn} disabled={!!andamento} onClick={planilha}>Planilha (Excel)</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="text-left text-slate-500"><tr>
                                <th className="p-1">Empresa</th><th className="p-1">Situação</th><th className="p-1 text-right">Func.</th><th className="p-1 text-right">Proventos</th><th className="p-1 text-right">Líquido</th>
                                <th className="p-1 text-right">Adiantamento</th><th className="p-1 text-right">INSS</th><th className="p-1 text-right">IRRF</th><th className="p-1 text-right">FGTS</th><th className="p-1 text-right">Patronal</th>
                                {provisoes && <><th className="p-1 text-right">Prov. férias</th><th className="p-1 text-right">Prov. 13º</th></>}
                                {gravar && <th className="p-1">Gravação</th>}
                            </tr></thead>
                            <tbody>{linhas.map(l => (
                                <React.Fragment key={l.empresaId}>
                                    <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/40" onClick={() => setAberta(a => (a === l.empresaId ? '' : l.empresaId))}>
                                        <td className="p-1"><span className="font-mono text-slate-500">{l.codigoSage}</span> {l.nome}</td>
                                        <td className={`p-1 ${corSituacao[l.situacao]}`}>{ROTULO_SITUACAO_AGRUPADA[l.situacao]}{l.encerrada ? ' · encerrada' : ''}{l.erros || l.incompletos ? ` (${l.erros + l.incompletos})` : ''}</td>
                                        <td className="p-1 text-right">{l.funcionarios}</td><td className="p-1 text-right">{reais(l.proventos)}</td><td className="p-1 text-right font-medium">{reais(l.liquido)}</td>
                                        <td className="p-1 text-right">{reais(l.adiantamento)}</td><td className="p-1 text-right">{reais(l.inssSegurados)}</td><td className="p-1 text-right">{reais(l.irrf)}</td><td className="p-1 text-right">{reais(l.fgts)}</td>
                                        <td className="p-1 text-right">{l.patronal === undefined ? '—' : reais(l.patronal)}</td>
                                        {provisoes && <><td className="p-1 text-right">{l.provisao ? reais(l.provisao.ferias) : '—'}</td><td className="p-1 text-right">{l.provisao ? reais(l.provisao.decimo) : '—'}</td></>}
                                        {gravar && <td className="p-1">{ROTULO_GRAVACAO[l.gravacao]}</td>}
                                    </tr>
                                    {aberta === l.empresaId && <tr><td colSpan={13} className="bg-slate-50 p-2 dark:bg-slate-900/50">
                                        <p>Pagamento em {br(l.pagamento)} · {l.calculados} calculado(s), {l.incompletos} incompleto(s), {l.erros} com erro. O detalhe por funcionário está na tela de Cálculo (ative a empresa).</p>
                                        {l.mensagens.length ? <ul className="mt-1 list-disc pl-5 text-amber-800 dark:text-amber-200">{l.mensagens.map((m, i) => <li key={i}>{m}</li>)}</ul> : <p className="mt-1 text-slate-500">Sem pendências.</p>}
                                    </td></tr>}
                                </React.Fragment>
                            ))}</tbody>
                            <tfoot className="border-t border-slate-200 font-medium dark:border-slate-700"><tr>
                                <td className="p-1">Total</td><td className="p-1" /><td className="p-1 text-right">{t.funcionarios}</td><td className="p-1 text-right">{reais(t.proventos)}</td><td className="p-1 text-right">{reais(t.liquido)}</td>
                                <td className="p-1 text-right">{reais(t.adiantamento)}</td><td className="p-1 text-right">{reais(t.inssSegurados)}</td><td className="p-1 text-right">{reais(t.irrf)}</td><td className="p-1 text-right">{reais(t.fgts)}</td><td className="p-1 text-right">{reais(t.patronal)}</td>
                                {provisoes && <><td className="p-1 text-right">{reais(t.provisaoFerias)}</td><td className="p-1 text-right">{reais(t.provisaoDecimo)}</td></>}
                                {gravar && <td className="p-1" />}
                            </tr></tfoot>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
};

export default ProcessamentoAgrupadoPanel;
