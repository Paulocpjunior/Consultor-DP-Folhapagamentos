// components/calculo/IntermitenteRecibos.tsx
//
// Folha do mês › Trabalho intermitente › Recibos, Listagem e Bancos (Processos › Trabalho Intermitente do IOB SAGE:
// Recibos, Impressão de Holerite, Listagem de Convocação e Valores de Salários para Bancos). Os recibos saem do cálculo
// do mês (o mesmo do Cálculo mensal): um por data de pagamento da convocação, ou um só, pago com a folha.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import { mensagemErro } from '../../services/cadastros/cadastrosService';
import { reais } from '../../services/cadastros/documentos';
import { listarMovimentos } from '../../services/calculo/movimentosService';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { motorHomologadoNoMes } from '../../services/calculo/arredondamento';
import { calcularMensal, type Movimento } from '../../services/calculo/motorMensal';
import type { Convocacao } from '../../services/calculo/intermitente';
import { bancosIntermitente, filtrarRecibos, listagemConvocacoes, recibosDoMes, type FiltroIntermitente } from '../../services/calculo/recibosIntermitente';
import { quintoDiaUtilSalario, somarMeses } from '../../services/prazos/calendario';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '—');
const ultimoDia = (c: string) => new Date(Date.UTC(Number(c.slice(0, 4)), Number(c.slice(5, 7)), 0)).toISOString().slice(0, 10);
const dataFolhaPadrao = (c: string) => { const [a, m] = somarMeses(`${c}-01`, 1).slice(0, 7).split('-').map(Number); return quintoDiaUtilSalario(a, m); };

export type AbaRecibos = 'recibos' | 'listagem' | 'bancos';

interface Props {
    aba: AbaRecibos;
    empresaId: string;
    competenciaInicial: string;
    fichas: FichaFuncionario[];
    convocacoes: Convocacao[];
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
}

const IntermitenteRecibos: React.FC<Props> = ({ aba, empresaId, competenciaInicial, fichas, convocacoes, afastamentos, tabelas }) => {
    const [competencia, setCompetencia] = useState(competenciaInicial);
    const [dataFolha, setDataFolha] = useState(dataFolhaPadrao(competenciaInicial));
    const [movs, setMovs] = useState<Record<string, Movimento> | null>(null);
    const [empresa, setEmpresa] = useState<Empresa | null>(null);
    const [erro, setErro] = useState('');
    // Seleção (como o SAGE): por funcionário ou por convocação; por data de convocação ou de pagamento.
    const [fichaId, setFichaId] = useState('');
    const [convocacaoId, setConvocacaoId] = useState('');
    const [por, setPor] = useState<FiltroIntermitente['por']>('convocacao');
    const [de, setDe] = useState(`${competenciaInicial}-01`);
    const [ate, setAte] = useState(ultimoDia(competenciaInicial));
    const [op, setOp] = useState({ basesConvocacao: true, basesAcumuladas: false, dadosBancarios: false, funcao: true });
    const [ordem, setOrdem] = useState<'nome' | 'codigo'>('nome');
    const [separarDepto, setSepararDepto] = useState(false);
    const [separaBanco, setSeparaBanco] = useState<'convocacao' | 'banco' | 'departamento'>('convocacao');
    const [documento, setDocumento] = useState<'cpf' | 'rg' | 'codigo' | 'nenhum'>('cpf');

    useEffect(() => { setDataFolha(dataFolhaPadrao(competencia)); setDe(`${competencia}-01`); setAte(ultimoDia(competencia)); }, [competencia]);
    useEffect(() => {
        let vivo = true;
        setMovs(null); setErro('');
        Promise.all([listarMovimentos(empresaId, competencia), listarEmpresasVisiveis()])
            .then(([ms, emps]) => { if (!vivo) return; setMovs(Object.fromEntries(ms.map(m => [m.fichaId, m.movimento]))); setEmpresa(emps.find(e => e.id === empresaId) ?? null); })
            .catch(e => { if (vivo) { setErro(`Movimentos do mês não carregados: ${mensagemErro(e)}`); setMovs({}); } });
        return () => { vivo = false; };
    }, [empresaId, competencia]);

    const resultados = useMemo(() => (movs ? fichas.map(f => calcularMensal({
        competencia, pagamento: dataFolha.slice(0, 7), ficha: f, afastamentos: afastamentos.filter(a => a.fichaId === f.id), tabelas, movimento: movs[f.id], convocacoes,
    })) : []), [movs, fichas, competencia, dataFolha, afastamentos, tabelas, convocacoes]);
    const comErro = resultados.filter(r => r.situacao === 'erro' && convocacoes.some(c => c.fichaId === r.fichaId && c.resposta === 'aceita' && c.dias.some(d => d.data.startsWith(competencia))));
    const recibos = useMemo(() => recibosDoMes(resultados, convocacoes, competencia, dataFolha), [resultados, convocacoes, competencia, dataFolha]);
    const filtro: FiltroIntermitente = { fichaIds: fichaId ? [fichaId] : undefined, convocacaoId: convocacaoId || undefined, por, de, ate };
    const selecionados = filtrarRecibos(recibos, filtro);
    const doFiltro = convocacoes.filter(c => !fichaId || c.fichaId === fichaId).sort((a, b) => (a.codigo ?? 0) - (b.codigo ?? 0));
    const opcoesPdf = (titulo: string) => ({
        empresa: { razaoSocial: empresa?.razaoSocial ?? '', cnpj: empresa?.cnpj ?? '', codigoSage: empresa?.codigoSage }, titulo,
        previa: !motorHomologadoNoMes(empresa?.parametrosFolha, competencia), orientacao: 'paisagem' as const,
    });

    async function holerites() {
        const m = await import('../../services/relatorios/holeritePdf');
        m.recibosIntermitentePdf(selecionados, fichas, { ...opcoesPdf('Recibo da convocação — trabalho intermitente'), orientacao: 'retrato' }, op).save(`intermitente-recibos-${competencia}.pdf`);
    }
    const listagem = listagemConvocacoes(convocacoes, fichas, filtro, ordem, separarDepto);
    async function listagemPdf() {
        const m = await import('../../services/relatorios/layoutPdf');
        m.tabelaPdf(listagem, opcoesPdf('Listagem de convocação intermitente'), `${por === 'pagamento' ? 'Pagamento' : 'Convocação'} de ${br(de)} a ${br(ate)}`).save(`intermitente-convocacoes-${competencia}.pdf`);
    }
    const bancos = bancosIntermitente(selecionados, fichas, { separa: separaBanco, documento });
    async function bancosPdf() {
        const m = await import('../../services/relatorios/layoutPdf');
        m.tabelaPdf(bancos, { ...opcoesPdf('Valores de salários para bancos — intermitente'), orientacao: 'retrato' }, `Recibos de ${br(de)} a ${br(ate)}`).save(`intermitente-bancos-${competencia}.pdf`);
    }
    function excel(t: { colunas: { titulo: string }[]; linhas: string[][] }, nome: string) {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([t.colunas.map(c => c.titulo), ...t.linhas]), nome.slice(0, 31));
        XLSX.writeFile(wb, `intermitente-${nome}-${competencia}.xlsx`);
    }

    return (
        <section className="space-y-3">
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            <div className="flex flex-wrap items-end gap-3 rounded-sm bg-slate-50 p-2 dark:bg-slate-800">
                <label>Mês competência<input aria-label="Mês competência" type="month" className={`block ${inp}`} value={competencia} onChange={e => e.target.value && setCompetencia(e.target.value)} /></label>
                <label title="Recibo das convocações sem data própria: pago com a folha do mês.">Pagamento da folha<input aria-label="Pagamento da folha" type="date" className={`block ${inp}`} value={dataFolha} onChange={e => e.target.value && setDataFolha(e.target.value)} /></label>
                <label>Funcionário<select aria-label="Funcionário" className={`block ${inp}`} value={fichaId} onChange={e => { setFichaId(e.target.value); setConvocacaoId(''); }}>
                    <option value="">Todos os funcionários</option>
                    {fichas.map(f => <option key={f.id} value={f.id}>{f.dados.nome ?? f.cpf}</option>)}
                </select></label>
                <label>Convocação<select aria-label="Convocação" className={`block ${inp}`} value={convocacaoId} onChange={e => setConvocacaoId(e.target.value)}>
                    <option value="">Todas as convocações</option>
                    {doFiltro.map(c => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} · ` : ''}{br(c.dias.map(d => d.data).sort()[0] ?? '')} · {fichas.find(f => f.id === c.fichaId)?.dados.nome ?? ''}</option>)}
                </select></label>
                <span className="flex flex-col text-xs">
                    <label className="flex items-center gap-1"><input type="radio" name="por" checked={por === 'convocacao'} onChange={() => setPor('convocacao')} />Data de convocação</label>
                    <label className="flex items-center gap-1"><input type="radio" name="por" checked={por === 'pagamento'} onChange={() => setPor('pagamento')} />Data de pagamento</label>
                </span>
                <label>De<input aria-label="De" type="date" className={`block ${inp}`} value={de} onChange={e => setDe(e.target.value)} /></label>
                <label>Até<input aria-label="Até" type="date" className={`block ${inp}`} value={ate} onChange={e => setAte(e.target.value)} /></label>
            </div>
            {comErro.length > 0 && <p className="text-xs text-red-700 dark:text-red-300">Com erro no cálculo: {comErro.map(r => `${r.nome} (${r.erros[0] ?? 'erro'})`).join('; ')}.</p>}

            {aba === 'recibos' && (
                <>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        {([['basesConvocacao', 'Imprimir bases da convocação'], ['basesAcumuladas', 'Imprimir bases acumuladas'], ['dadosBancarios', 'Nº do banco, agência e conta'], ['funcao', 'Imprimir função']] as const).map(([k, t]) => (
                            <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={op[k]} onChange={e => setOp({ ...op, [k]: e.target.checked })} />{t}</label>
                        ))}
                        <button className={btn} disabled={!selecionados.length} onClick={holerites}>Holerites (PDF)</button>
                    </div>
                    {!movs ? <p className="text-slate-500">Calculando…</p> : !selecionados.length ? <p className="text-slate-500">Nenhum recibo de convocação na seleção.</p> : (
                        <table className="w-full text-left text-xs">
                            <thead className="text-slate-500"><tr><th className="p-1">Funcionário</th><th className="p-1">Convocação</th><th className="p-1">Período</th><th className="p-1">Pagamento</th>
                                <th className="p-1 text-right">Proventos</th><th className="p-1 text-right">Descontos</th><th className="p-1 text-right">Líquido</th><th className="p-1 text-right">INSS</th><th className="p-1 text-right">FGTS</th><th className="p-1 text-right">IRRF</th></tr></thead>
                            <tbody>{selecionados.map(x => {
                                const b = x.resultado.basesIntermitente?.recibo;
                                return (
                                    <tr key={`${x.fichaId}-${x.dataPagamento}`} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className="p-1">{x.nome}</td><td className="p-1">{x.convocacoes.map(c => c.codigo ?? '—').join(', ')}</td>
                                        <td className="p-1">{br(x.periodo[0])} a {br(x.periodo[1])}</td><td className="p-1">{br(x.dataPagamento)}</td>
                                        <td className="p-1 text-right">{reais(x.resultado.totais.proventos)}</td><td className="p-1 text-right">{reais(x.resultado.totais.descontos)}</td>
                                        <td className="p-1 text-right font-medium">{reais(x.resultado.totais.liquido)}</td>
                                        <td className="p-1 text-right">{b ? reais(b.inss.valor + b.inss13.valor) : '—'}</td>
                                        <td className="p-1 text-right">{b ? reais(b.fgts.valor + b.fgtsFerias.valor + b.fgts13.valor) : '—'}</td>
                                        <td className="p-1 text-right">{b ? reais(b.irrf.valor + b.irrfFerias.valor + b.irrf13.valor) : '—'}</td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    )}
                    <p className="text-xs text-slate-500">Convocação com data de pagamento própria tem recibo e demonstrativo do S-1200 próprios; o INSS é sobre o acumulado da competência e o IRRF sobre o acumulado do mês do pagamento. As sem data vão no recibo pago com a folha. O S-1200 e o S-1210 saem pelo Cálculo mensal.</p>
                </>
            )}

            {aba === 'listagem' && (
                <>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-1"><input type="checkbox" checked={separarDepto} onChange={e => setSepararDepto(e.target.checked)} />Separar por departamento</label>
                        <label>Ordem de impressão<select aria-label="Ordem de impressão" className={`ml-1 ${inp}`} value={ordem} onChange={e => setOrdem(e.target.value as 'nome' | 'codigo')}><option value="nome">Nome</option><option value="codigo">Código</option></select></label>
                        <button className={btn} onClick={listagemPdf}>PDF</button>
                        <button className={btn} disabled={!listagem.linhas.length} onClick={() => excel(listagem, 'convocacoes')}>Excel</button>
                    </div>
                    <TabelaSimples t={listagem} />
                </>
            )}

            {aba === 'bancos' && (
                <>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label>Separa por<select aria-label="Separa por" className={`ml-1 ${inp}`} value={separaBanco} onChange={e => setSeparaBanco(e.target.value as typeof separaBanco)}>
                            <option value="convocacao">Convocação</option><option value="banco">Bancos</option><option value="departamento">Departamento</option></select></label>
                        <label>Imprimir<select aria-label="Documento" className={`ml-1 ${inp}`} value={documento} onChange={e => setDocumento(e.target.value as typeof documento)}>
                            <option value="cpf">C.P.F.</option><option value="rg">R.G.</option><option value="codigo">Cód. convocação</option><option value="nenhum">Não imprimir</option></select></label>
                        <button className={btn} disabled={!selecionados.length} onClick={bancosPdf}>PDF</button>
                        <button className={btn} disabled={!bancos.linhas.length} onClick={() => excel(bancos, 'bancos')}>Excel</button>
                    </div>
                    <TabelaSimples t={bancos} />
                </>
            )}
        </section>
    );
};

const TabelaSimples: React.FC<{ t: { colunas: { titulo: string; alinhar?: 'direita' }[]; linhas: string[][]; totais?: string[] } }> = ({ t }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
            <thead className="text-slate-500"><tr>{t.colunas.map(c => <th key={c.titulo} className={`p-1 ${c.alinhar === 'direita' ? 'text-right' : ''}`}>{c.titulo}</th>)}</tr></thead>
            <tbody>
                {!t.linhas.length && <tr><td colSpan={t.colunas.length} className="p-1 text-slate-500">Nada na seleção.</td></tr>}
                {t.linhas.map((l, i) => <tr key={i} className="border-t border-slate-100 dark:border-slate-700">{l.map((v, j) => <td key={j} className={`p-1 ${t.colunas[j]?.alinhar === 'direita' ? 'text-right' : ''}`}>{v}</td>)}</tr>)}
            </tbody>
            {t.totais && <tfoot className="font-medium"><tr>{t.totais.map((v, j) => <td key={j} className={`p-1 ${t.colunas[j]?.alinhar === 'direita' ? 'text-right' : ''}`}>{v}</td>)}</tr></tfoot>}
        </table>
    </div>
);

export default IntermitenteRecibos;
