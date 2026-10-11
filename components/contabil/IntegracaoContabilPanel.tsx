// components/contabil/IntegracaoContabilPanel.tsx
//
// Relatórios › Integração contábil: o lote de lançamentos da folha gravada da competência (services/contabil/
// integracaoContabil.ts), com o plano de contas da empresa por verba e por encargo, o centro de custo pelo
// departamento, as provisões (opcional), a conferência (débitos = créditos, salários a pagar = líquido) e o arquivo
// para a contabilidade (texto com ponto e vírgula e Excel).

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarAfastamentos, listarEnquadramentos, listarFuncionarios, listarTabelas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { enquadramentoVigente, type Enquadramento } from '../../services/cadastros/enquadramento';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import { lerFolhaGravada } from '../../services/calculo/folhaGravadaService';
import type { FolhaGravada } from '../../services/calculo/folhaGravada';
import { listarMovimentosDaEmpresa } from '../../services/calculo/movimentosService';
import type { Movimento } from '../../services/calculo/motorMensal';
import { calcularProvisao } from '../../services/calculo/provisoes';
import { listarDepartamentos } from '../../services/departamentos/departamentosService';
import type { Departamento } from '../../services/departamentos/departamentos';
import { listarLotacoes } from '../../services/obras/lotacoesService';
import type { Lotacao } from '../../services/obras/lotacoes';
import { resumirFolha } from '../../services/relatorios/resumoFolha';
import { reais } from '../../services/cadastros/documentos';
import { baixarBytes } from '../../services/implantacao/zip';
import { CONTAS_FIXAS, configVazia, gerarLoteContabil, loteCsv, saldoDaConta, verbasDoLote, type ConfigContabil } from '../../services/contabil/integracaoContabil';
import { lerConfigContabil, salvarConfigContabil } from '../../services/contabil/contabilService';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const brData = (d: string) => d.split('-').reverse().join('/');
/** O plano como é gravado (sem as contas em branco), para saber se mudou. */
const assinatura = (c: ConfigContabil) => JSON.stringify(Object.entries(c.contas).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v).sort()) + c.porCentroCusto;

interface Dados { empresa: Empresa | null; folha: FolhaGravada | null; fichas: FichaFuncionario[]; afastamentos: Afastamento[]; tabelas: TabelaLegal[]; enquadramentos: Enquadramento[]; departamentos: Departamento[]; lotacoes: Lotacao[] }

const IntegracaoContabilPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const competencia = ativa?.competencia ?? '';
    const [dados, setDados] = useState<Dados | null>(null);
    const [config, setConfig] = useState<ConfigContabil>(configVazia(''));
    const [gravada, setGravada] = useState('');
    const [provisoes, setProvisoes] = useState(false);
    const [movsEmpresa, setMovsEmpresa] = useState<Record<string, Record<string, Movimento>> | null>(null);
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa || !competencia) return;
        let vivo = true;
        setDados(null); setErro('');
        Promise.all([listarEmpresasVisiveis(), lerFolhaGravada(ativa.id, competencia).catch(() => null), listarFuncionarios(ativa.id), listarAfastamentos(ativa.id).catch(() => []), listarTabelas(),
            listarEnquadramentos(ativa.id).catch(() => []), listarDepartamentos(ativa.id).catch(() => []), listarLotacoes(ativa.id).catch(() => []), lerConfigContabil(ativa.id)])
            .then(([es, folha, fichas, afastamentos, tabelas, enquadramentos, departamentos, lotacoes, cfg]) => {
                if (!vivo) return;
                setDados({ empresa: es.find(e => e.id === ativa.id) ?? null, folha, fichas, afastamentos, tabelas, enquadramentos, departamentos, lotacoes });
                setConfig(cfg); setGravada(assinatura(cfg));
            })
            .catch(e => { if (vivo) setErro(`Dados não carregados: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa, competencia]);
    useEffect(() => {
        if (!provisoes || !ativa || movsEmpresa) return;
        listarMovimentosDaEmpresa(ativa.id).then(setMovsEmpresa).catch(e => setErro(`Movimentos não lidos (provisões): ${mensagemErro(e)}`));
    }, [provisoes, ativa, movsEmpresa]);

    const enq = useMemo(() => {
        if (!dados || !ativa) return undefined;
        const v = enquadramentoVigente(dados.enquadramentos, ativa.id, competencia);
        return 'enquadramento' in v ? v.enquadramento : undefined;
    }, [dados, ativa, competencia]);
    const holerites = dados?.folha?.holerites ?? [];
    const lote = useMemo(() => {
        if (!dados?.folha || !ativa) return null;
        const resumo = resumirFolha(holerites, enq, { lotacoes: dados.lotacoes, lotacaoPadrao: dados.empresa?.esocialFolha?.codLotacao });
        const provisao = provisoes && movsEmpresa ? calcularProvisao({ competencia, fichas: dados.fichas, afastamentos: dados.afastamentos, tabelas: dados.tabelas, movimentos: movsEmpresa, enquadramentos: dados.enquadramentos, empresaId: ativa.id }) : null;
        return gerarLoteContabil({ competencia, resultados: holerites, fichas: dados.fichas, departamentos: dados.departamentos, config, resumo, provisao });
    }, [dados, holerites, enq, config, provisoes, movsEmpresa, competencia, ativa]); // eslint-disable-line react-hooks/exhaustive-deps
    const verbas = useMemo(() => verbasDoLote(holerites), [holerites]);
    const liquido = holerites.filter(h => h.situacao !== 'erro').reduce((s, h) => s + h.totais.liquido, 0);
    const salarios = config.contas.SALARIOS_A_PAGAR?.trim();
    const saldoSalarios = lote && salarios ? saldoDaConta(lote, salarios) : null;
    const naoGravado = assinatura(config) !== gravada;

    async function gravar() {
        if (!ativa) return;
        setOcupado('Gravando o plano de contas…'); setErro('');
        try { const c = { ...config, empresaId: ativa.id }; await salvarConfigContabil(c, usuario); setGravada(assinatura(c)); setMsg('Plano de contas gravado.'); }
        catch (x) { setErro(`Não foi possível gravar (${mensagemErro(x)}).`); }
        finally { setOcupado(''); }
    }
    const nomeArq = `lote-contabil-${ativa?.codigoSage || 'empresa'}-${competencia}`;
    function baixarCsv() { if (lote) baixarBytes(`${nomeArq}.csv`, new TextEncoder().encode(loteCsv(lote)), 'text/csv'); }
    function baixarExcel() {
        if (!lote) return;
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lote.lancamentos.map(l => ({ Data: brData(l.data), 'Conta débito': l.debito, 'Conta crédito': l.credito, Valor: l.valor / 100, Histórico: l.historico, 'Centro de custo': l.centroCusto }))), 'Lançamentos');
        XLSX.writeFile(wb, `${nomeArq}.xlsx`);
    }

    if (!ativa) return <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative uma empresa para a integração contábil.</p>;
    const mudaConta = (k: string, v: string) => setConfig(c => ({ ...c, contas: { ...c.contas, [k]: v.slice(0, 40) } }));
    const campoConta = (k: string, rotulo: string) => (
        <label key={k} className="text-xs">{rotulo}<input aria-label={`Conta ${rotulo}`} className={`block w-full ${inp}`} value={config.contas[k] ?? ''} onChange={e => mudaConta(k, e.target.value)} /></label>
    );
    return (
        <div className="space-y-4 text-sm">
            <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Integração contábil · {competencia ? br(competencia) : '—'}</h2>
                <p className="text-slate-600 dark:text-slate-300">O lote de lançamentos da folha gravada do mês, em partidas dobradas: proventos na despesa contra salários a pagar, descontos contra as contas de INSS, IRRF e as demais, FGTS e a parte patronal contra os encargos a recolher e, se marcado, as provisões de férias e 13º. Centro de custo pelo departamento do funcionário (Cadastros › Departamentos).</p>
            </div>
            {!dados && !erro && <p role="status">Carregando…</p>}
            {dados && !dados.folha && <p role="note" className="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">A folha de {br(competencia)} ainda não foi gravada (Folha do mês › Cálculo mensal › Gravar a folha). O lote contábil sai da folha gravada.</p>}

            {dados && (
                <section aria-label="Plano de contas da folha" className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Plano de contas da folha (códigos do plano de contas do cliente)</p>
                        <button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!naoGravado || !!ocupado} onClick={gravar}>{naoGravado ? 'Gravar o plano' : 'Gravado'}</button>
                    </div>
                    <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={config.porCentroCusto} onChange={e => setConfig(c => ({ ...c, porCentroCusto: e.target.checked }))} />Lançar por centro de custo (o do departamento)</label>
                    {(['folha', 'encargos', 'provisoes'] as const).map(g => (
                        <div key={g}>
                            <p className="text-xs font-medium text-slate-500">{g === 'folha' ? 'Folha' : g === 'encargos' ? 'Encargos e tributos' : 'Provisões'}</p>
                            <div className="grid gap-2 sm:grid-cols-3">{CONTAS_FIXAS.filter(c => c.grupo === g).map(c => campoConta(c.chave, c.rotulo))}</div>
                        </div>
                    ))}
                    {verbas.length > 0 && <div>
                        <p className="text-xs font-medium text-slate-500">Conta própria por verba da folha (em branco: a conta padrão; INSS, IRRF, salário-família e salário-maternidade vão às contas dos tributos)</p>
                        <div className="grid gap-2 sm:grid-cols-3">{verbas.map(v => campoConta(v.chave, `${v.chave.slice(2)} · ${v.descricao} (${v.tipo === 'provento' ? 'débito' : 'crédito'})`))}</div>
                    </div>}
                </section>
            )}

            {lote && (
                <section aria-label="Lote contábil" className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Lote de {brData(lote.data)}: {lote.lancamentos.length} lançamento(s), {reais(lote.total)}</p>
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={provisoes} onChange={e => setProvisoes(e.target.checked)} />Incluir as provisões de férias e 13º</label>
                            <button className={btn} disabled={lote.pendencias.length > 0} onClick={baixarCsv}>Arquivo (.csv)</button>
                            <button className={btn} disabled={lote.pendencias.length > 0} onClick={baixarExcel}>Excel</button>
                        </div>
                    </div>
                    {lote.pendencias.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{lote.pendencias.map(x => <li key={x}>{x}</li>)}</ul>}
                    {lote.avisos.length > 0 && <ul className="list-disc rounded bg-amber-50 p-2 pl-6 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{lote.avisos.map(x => <li key={x}>{x}</li>)}</ul>}
                    {saldoSalarios !== null && <p className={`text-xs ${saldoSalarios === liquido ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>Conferência: saldo de salários a pagar {reais(saldoSalarios)} × líquido da folha {reais(liquido)}{saldoSalarios === liquido ? ' ✓' : ' (diferente: confira as contas)'}.</p>}
                    <div className="max-h-96 overflow-auto">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-white text-left text-slate-500 dark:bg-slate-800"><tr><th className="p-1">Débito</th><th className="p-1">Crédito</th><th className="p-1 text-right">Valor</th><th className="p-1">Histórico</th><th className="p-1">C. custo</th></tr></thead>
                            <tbody>{lote.lancamentos.map((l, i) => (
                                <tr key={i} className="border-t border-slate-100 dark:border-slate-700"><td className="p-1 font-mono">{l.debito}</td><td className="p-1 font-mono">{l.credito}</td><td className="p-1 text-right">{reais(l.valor)}</td><td className="p-1">{l.historico}</td><td className="p-1">{l.centroCusto}</td></tr>
                            ))}</tbody>
                        </table>
                    </div>
                </section>
            )}

            {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
        </div>
    );
};

export default IntegracaoContabilPanel;
