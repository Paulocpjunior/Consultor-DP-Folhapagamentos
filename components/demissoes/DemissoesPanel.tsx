// components/demissoes/DemissoesPanel.tsx
//
// Folha do mês › Demissões (prévia): o pedido do cliente "quanto custa demitir?" respondido sem tocar no eSocial.
// Escolhe os funcionários da empresa ativa e os cenários (motivo, aviso, data); o Consultor calcula cada um pelo
// motor da rescisão (o mesmo do TRCT) e mostra lado a lado o líquido do trabalhador, o custo da empresa e os pontos
// de atenção. Sai em PDF (marca PRÉVIA), vai ao cliente por e-mail ou WhatsApp e fica no histórico da empresa.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarAfastamentos, listarEnquadramentos, listarFuncionarios, listarSindicatos, listarTabelas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import { enquadramentoVigente, type Enquadramento } from '../../services/cadastros/enquadramento';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { listarMovimentosDaEmpresa } from '../../services/calculo/movimentosService';
import type { Movimento } from '../../services/calculo/motorMensal';
import { mesDoPagamento } from '../../services/calculo/arredondamento';
import { OPCOES_FERIAS_PADRAO } from '../../services/calculo/motorFerias';
import { ROTULO_AVISO, TIPOS_RESCISAO, type AvisoPrevio, type TipoRescisao } from '../../services/calculo/motorRescisao';
import { calcularPrevia, cenariosPadrao, podeSeguroDesemprego, resumoDoCenario, rotuloCenario, sacaFgts, type CenarioDemissao, type ResultadoCenario } from '../../services/demissoes/previa';
import { gravarPrevia, listarPrevias, mudarSituacaoPrevia, ROTULO_SITUACAO_PREVIA, type PreviaGravada } from '../../services/demissoes/previasService';
import EntregaRelatorio from '../relatorios/EntregaRelatorio';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '—');
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const MAX_CENARIOS = 4;

interface Dados { empresa?: Empresa; fichas: FichaFuncionario[]; afastamentos: Afastamento[]; tabelas: TabelaLegal[]; enquadramentos: Enquadramento[]; sindicatos: Sindicato[]; movimentos: Record<string, Record<string, Movimento>> }
interface Props { usuario: Usuario }

const DemissoesPanel: React.FC<Props> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState(''); const [msg, setMsg] = useState(''); const [ocupado, setOcupado] = useState('');
    const [busca, setBusca] = useState('');
    const [selecionados, setSelecionados] = useState<string[]>([]);
    const [cenarios, setCenarios] = useState<CenarioDemissao[]>(() => cenariosPadrao(hojeSp()));
    const [saldos, setSaldos] = useState<Record<string, string>>({});
    const [adiant13, setAdiant13] = useState<Record<string, string>>({});
    const [observacao, setObservacao] = useState('');
    const [historico, setHistorico] = useState<PreviaGravada[] | null>(null);
    const [recarga, setRecarga] = useState(0);

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setDados(null); setErro(''); setSelecionados([]);
        Promise.all([listarEmpresasVisiveis(), listarFuncionarios(ativa.id), listarAfastamentos(ativa.id), listarTabelas(), listarEnquadramentos(ativa.id).catch(() => []),
            listarSindicatos().catch(() => []), listarMovimentosDaEmpresa(ativa.id)])
            .then(([emps, fichas, afastamentos, tabelas, enquadramentos, sindicatos, movimentos]) => { if (vivo) setDados({ empresa: emps.find(e => e.id === ativa.id), fichas, afastamentos, tabelas, enquadramentos, sindicatos, movimentos }); })
            .catch(e => { if (vivo) setErro(`Dados da empresa não carregados: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa]);
    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        listarPrevias(ativa.id).then(h => { if (vivo) setHistorico(h); }).catch(() => { if (vivo) setHistorico([]); });
        return () => { vivo = false; };
    }, [ativa, recarga]);

    // Quem ainda tem vínculo (sem desligamento registrado ou com ele no futuro).
    const ativos = useMemo(() => (dados?.fichas ?? []).filter(f => f.situacao !== 'desligado' && (!f.dados.dataDesligamento || f.dados.dataDesligamento > hojeSp()))
        .sort((a, b) => (a.dados.nome ?? '').localeCompare(b.dados.nome ?? '', 'pt-BR')), [dados]);
    const filtrados = ativos.filter(f => !busca.trim() || `${f.dados.nome ?? ''} ${f.matriculaEsocial} ${f.dados.codigoIob ?? ''}`.toLowerCase().includes(busca.trim().toLowerCase()));

    const resultados = useMemo(() => {
        if (!dados || !cenarios.length) return [];
        return selecionados.flatMap(id => {
            const ficha = dados.fichas.find(f => f.id === id);
            if (!ficha) return [];
            const comp = cenarios[0].data.slice(0, 7);
            const vig = /^\d{4}-\d{2}$/.test(comp) ? enquadramentoVigente(dados.enquadramentos, ficha.empresaId, comp) : null;
            const sindicato = dados.sindicatos.find(s => s.cnpj.replace(/\D/g, '') && s.cnpj.replace(/\D/g, '') === (ficha.dados.sindicato ?? '').replace(/\D/g, ''));
            const saldo = centavosDeTexto(saldos[id] ?? '') ?? undefined;
            const cs = calcularPrevia({ ficha, afastamentos: dados.afastamentos, tabelas: dados.tabelas, movimentos: dados.movimentos[id] ?? {}, cenarios: cenarios.filter(c => /^\d{4}-\d{2}-\d{2}$/.test(c.data)),
                saldoFgts: saldo, adiantamento13: centavosDeTexto(adiant13[id] ?? '') ?? undefined, enquadramento: vig && 'enquadramento' in vig ? vig.enquadramento : undefined, sindicato,
                opcoes: OPCOES_FERIAS_PADRAO, regimePagamento: m => mesDoPagamento(dados.empresa?.parametrosFolha, m) });
            return [{ ficha, cenarios: cs, saldoFgtsInformado: !!saldo, semEnquadramento: !(vig && 'enquadramento' in vig) }];
        });
    }, [dados, selecionados, cenarios, saldos, adiant13]);

    if (!ativa) return <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative uma empresa para simular demissões.</p>;
    const nomeEmpresa = dados?.empresa?.nomeFantasia || dados?.empresa?.razaoSocial || ativa.nome;
    const opcoesPdf = () => ({ empresa: { razaoSocial: dados?.empresa?.razaoSocial || ativa.nome, cnpj: ativa.cnpj.replace(/\D/g, ''), codigoSage: ativa.codigoSage }, titulo: 'Prévia de rescisão', emitidoPor: usuario.email });
    const nomeArquivo = `previa-rescisao-${ativa.codigoSage || 'empresa'}-${hojeSp()}.pdf`;
    const gerarPdf = async () => (await import('../../services/demissoes/previaPdf')).previaRescisaoPdf(resultados, opcoesPdf());
    const mudarCenario = (i: number, m: Partial<CenarioDemissao>) => setCenarios(l => l.map((c, j) => (j === i ? { ...c, ...m } : c)));

    async function baixarPdf() {
        try { (await gerarPdf()).save(nomeArquivo); } catch (e) { setErro(`PDF não gerado: ${(e as Error).message}`); }
    }
    async function gravar() {
        setOcupado('Gravando no histórico…'); setErro(''); setMsg('');
        try {
            for (const p of resultados) await gravarPrevia({ empresaId: ativa!.id, fichaId: p.ficha.id, nome: p.ficha.dados.nome || p.ficha.cpf, cenarios: p.cenarios.map(c => ({ tipo: c.cenario.tipo, aviso: c.cenario.aviso, data: c.cenario.data })),
                resumos: p.cenarios.map(resumoDoCenario), saldoFgts: centavosDeTexto(saldos[p.ficha.id] ?? '') ?? null, adiantamento13: centavosDeTexto(adiant13[p.ficha.id] ?? '') ?? null, observacao }, usuario);
            setMsg(`${resultados.length} prévia(s) gravada(s) no histórico da empresa.`); setRecarga(n => n + 1);
        } catch (e) { setErro(`Não foi possível gravar: ${mensagemErro(e)}`); }
        finally { setOcupado(''); }
    }
    async function situacao(p: PreviaGravada, s: PreviaGravada['situacao'], escolhido: number | null = null) {
        try { await mudarSituacaoPrevia(p.id, s, usuario, escolhido); setRecarga(n => n + 1); } catch (e) { setErro(`Não foi possível atualizar: ${mensagemErro(e)}`); }
    }
    function reabrir(p: PreviaGravada) {
        setSelecionados(dados?.fichas.some(f => f.id === p.fichaId) ? [p.fichaId] : []);
        setCenarios(p.cenarios.map((c, i) => ({ ...c, id: `h${i}` })));
        if (p.saldoFgts) setSaldos(s => ({ ...s, [p.fichaId]: (p.saldoFgts! / 100).toFixed(2).replace('.', ',') }));
        if (p.adiantamento13) setAdiant13(s => ({ ...s, [p.fichaId]: (p.adiantamento13! / 100).toFixed(2).replace('.', ',') }));
        setMsg(`Prévia de ${p.nome} reaberta com os cenários gravados (recalculada com os dados de hoje).`);
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
                Simule a demissão antes de o cliente decidir: o Consultor calcula cada cenário pela ficha e pelos movimentos gravados (o mesmo cálculo do TRCT),
                com o custo para a empresa. Nada vai ao eSocial nem muda a ficha.
            </p>
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {!dados && !erro && <p className="text-sm text-slate-500">Carregando os funcionários…</p>}

            {dados && (
                <section className="grid gap-4 lg:grid-cols-3">
                    <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <p className="font-medium text-slate-800 dark:text-slate-100">1. Funcionários ({selecionados.length} de {ativos.length})</p>
                        <input aria-label="Buscar funcionário" placeholder="Nome, matrícula ou código" className={`w-full ${inp}`} value={busca} onChange={e => setBusca(e.target.value)} />
                        <ul className="max-h-72 space-y-0.5 overflow-auto text-sm">
                            {filtrados.map(f => (
                                <li key={f.id}><label className="flex items-center gap-2">
                                    <input type="checkbox" checked={selecionados.includes(f.id)} onChange={e => setSelecionados(s => (e.target.checked ? [...s, f.id] : s.filter(x => x !== f.id)))} />
                                    <span>{f.dados.nome || f.cpf}</span><span className="text-xs text-slate-500">adm. {br(f.dados.admissao ?? '')}</span>
                                </label></li>
                            ))}
                            {!filtrados.length && <li className="text-slate-500">Nenhum funcionário ativo{busca ? ' com essa busca' : ''}.</li>}
                        </ul>
                    </div>

                    <div className="space-y-2 rounded-lg border border-slate-200 p-3 lg:col-span-2 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <p className="font-medium text-slate-800 dark:text-slate-100">2. Cenários</p>
                            <div className="flex gap-2">
                                <button className={btn} disabled={cenarios.length >= MAX_CENARIOS} onClick={() => setCenarios(l => [...l, { ...l[l.length - 1] ?? cenariosPadrao(hojeSp())[0], id: `c${Date.now()}` }])}>+ Cenário</button>
                                <button className={btn} onClick={() => setCenarios(cenariosPadrao(cenarios[0]?.data || hojeSp()))}>Padrão (dispensa, pedido, acordo)</button>
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            {cenarios.map((c, i) => (
                                <div key={c.id} className="space-y-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
                                    <div className="flex items-center justify-between"><span className="font-medium">Cenário {i + 1}</span>
                                        {cenarios.length > 1 && <button className="text-red-700 dark:text-red-300" aria-label={`Remover cenário ${i + 1}`} onClick={() => setCenarios(l => l.filter((_, j) => j !== i))}>remover</button>}</div>
                                    <label className="block">Motivo<select aria-label={`Motivo do cenário ${i + 1}`} className={`block w-full ${inp}`} value={c.tipo} onChange={e => mudarCenario(i, { tipo: e.target.value as TipoRescisao })}>
                                        {Object.entries(TIPOS_RESCISAO).map(([k, v]) => <option key={k} value={k}>{k} — {v}</option>)}</select></label>
                                    <label className="block">Aviso prévio<select aria-label={`Aviso do cenário ${i + 1}`} className={`block w-full ${inp}`} value={c.aviso} onChange={e => mudarCenario(i, { aviso: e.target.value as AvisoPrevio })}>
                                        {Object.entries(ROTULO_AVISO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                                    <label className="block">Data do desligamento<input aria-label={`Data do cenário ${i + 1}`} type="date" className={`block w-full ${inp}`} value={c.data} onChange={e => mudarCenario(i, { data: e.target.value })} /></label>
                                </div>
                            ))}
                        </div>
                        {selecionados.length > 0 && (
                            <div className="space-y-1 text-xs">
                                <p className="font-medium">Saldo do FGTS (extrato) e 13º já adiantado — opcionais; sem o saldo, a multa sai estimada</p>
                                {selecionados.map(id => { const f = dados.fichas.find(x => x.id === id); return f ? (
                                    <div key={id} className="flex flex-wrap items-center gap-2">
                                        <span className="w-48 truncate">{f.dados.nome || f.cpf}</span>
                                        <input aria-label={`Saldo do FGTS de ${f.dados.nome}`} placeholder="Saldo do FGTS (R$)" className={`w-40 ${inp}`} value={saldos[id] ?? ''} onChange={e => setSaldos(s => ({ ...s, [id]: e.target.value }))} />
                                        <input aria-label={`13º adiantado de ${f.dados.nome}`} placeholder="13º adiantado (R$)" className={`w-40 ${inp}`} value={adiant13[id] ?? ''} onChange={e => setAdiant13(s => ({ ...s, [id]: e.target.value }))} />
                                    </div>) : null; })}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {resultados.map(p => <Comparativo key={p.ficha.id} ficha={p.ficha} cenarios={p.cenarios} saldoInformado={p.saldoFgtsInformado} semEnquadramento={p.semEnquadramento} />)}

            {resultados.length > 0 && (
                <section className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                    <p className="font-medium text-slate-800 dark:text-slate-100">3. Relatório ao cliente</p>
                    <label className="block text-xs">Observação no histórico (opcional)<input aria-label="Observação da prévia" maxLength={1000} className={`block w-full ${inp}`} value={observacao} onChange={e => setObservacao(e.target.value)} /></label>
                    <div className="flex flex-wrap gap-2">
                        <button className={btn} onClick={baixarPdf}>Prévia de rescisão (PDF)</button>
                        <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={!!ocupado} onClick={gravar}>Gravar no histórico</button>
                    </div>
                    <EntregaRelatorio key={selecionados.join(',')} empresa={{ id: ativa.id, cnpj: ativa.cnpj.replace(/\D/g, ''), nome: nomeEmpresa, codigoSage: ativa.codigoSage, contatoEnvio: dados?.empresa?.contatoEnvio }}
                        titulo="Prévia de rescisão" competencia={(cenarios[0]?.data || hojeSp()).slice(0, 7)}
                        gerar={async () => ({ nome: nomeArquivo, bytes: new Uint8Array((await gerarPdf()).output('arraybuffer')) })} />
                </section>
            )}
            {ocupado && <p role="status" className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {msg && <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}

            <section className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <p className="font-medium text-slate-800 dark:text-slate-100">Histórico de prévias da empresa</p>
                {historico === null ? <p className="text-sm text-slate-500">Carregando…</p> : !historico.length ? <p className="text-sm text-slate-500">Nenhuma prévia gravada ainda.</p> : (
                    <div className="overflow-x-auto"><table className="min-w-full text-xs">
                        <thead className="text-left text-slate-500"><tr><th className="p-1">Quando</th><th className="p-1">Funcionário</th><th className="p-1">Cenários (líquido · custo)</th><th className="p-1">Situação</th><th className="p-1"></th></tr></thead>
                        <tbody>{historico.map(p => (
                            <tr key={p.id} className="border-t border-slate-100 align-top dark:border-slate-700">
                                <td className="p-1 whitespace-nowrap">{p.criadoEm ? p.criadoEm.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}<br /><span className="text-slate-500">{p.criadoPorEmail}</span></td>
                                <td className="p-1">{p.nome}{p.observacao && <><br /><span className="text-slate-500">{p.observacao}</span></>}</td>
                                <td className="p-1">{p.resumos.map((r, i) => <div key={i} className={p.escolhido === i ? 'font-semibold text-green-700 dark:text-green-300' : ''}>{i + 1}. {rotuloCenario(r)} em {br(r.data)}: {reais(r.liquido)} · {reais(r.custoTotal)}{r.multaEstimada ? '*' : ''}</div>)}</td>
                                <td className="p-1">{ROTULO_SITUACAO_PREVIA[p.situacao]}{p.escolhido !== null ? ` (${p.escolhido + 1})` : ''}</td>
                                <td className="p-1 whitespace-nowrap space-x-1">
                                    <button className="text-blue-700 underline dark:text-blue-300" onClick={() => reabrir(p)}>Reabrir</button>
                                    {p.situacao === 'previa' && <button className="text-blue-700 underline dark:text-blue-300" onClick={() => situacao(p, 'enviada')}>Enviada</button>}
                                    {p.situacao !== 'descartada' && p.resumos.map((_, i) => <button key={i} className="text-green-700 underline dark:text-green-300" onClick={() => situacao(p, 'escolhida', i)}>Escolher {i + 1}</button>)}
                                    {p.situacao !== 'descartada' && <button className="text-red-700 underline dark:text-red-300" onClick={() => situacao(p, 'descartada')}>Descartar</button>}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table><p className="mt-1 text-xs text-slate-500">* multa do FGTS estimada (sem o extrato).</p></div>
                )}
            </section>
        </div>
    );
};

/** Os cenários de um funcionário lado a lado. */
const Comparativo: React.FC<{ ficha: FichaFuncionario; cenarios: ResultadoCenario[]; saldoInformado: boolean; semEnquadramento: boolean }> = ({ ficha, cenarios, saldoInformado, semEnquadramento }) => {
    const linhas = useMemo(() => {
        const m = new Map<string, { descricao: string; tipo: string; valores: number[] }>();
        cenarios.forEach((c, j) => c.r.verbas.forEach(v => {
            const k = `${v.codigo.replace(/\d{4}-\d{2}-\d{2}$/, '')}|${v.tipo}`;
            const l = m.get(k) ?? { descricao: v.descricao.replace(/\s\d{4}\/\d{4}$/, ''), tipo: v.tipo, valores: cenarios.map(() => 0) };
            l.valores[j] += v.valor; m.set(k, l);
        }));
        return [...m.values()].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'provento' ? -1 : 1));
    }, [cenarios]);
    const v = (n: number) => (n ? reais(n) : '—');
    const total = (rotulo: string, f: (c: ResultadoCenario) => React.ReactNode, forte = false) => (
        <tr className={`border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 ${forte ? 'font-semibold' : ''}`}><td className="p-1">{rotulo}</td>{cenarios.map(c => <td key={c.cenario.id} className="p-1 text-right">{f(c)}</td>)}</tr>
    );
    const avisos = [...new Set(cenarios.flatMap(c => [...c.alertas, ...c.r.erros, ...c.r.avisos.filter(a => !/^Média pelos movimentos/.test(a))]))];
    return (
        <section aria-label={`Prévia de ${ficha.dados.nome}`} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <p className="font-medium text-slate-800 dark:text-slate-100">{ficha.dados.nome || ficha.cpf} <span className="text-xs font-normal text-slate-500">admissão {br(ficha.dados.admissao ?? '')}{ficha.dados.cargo ? ` · ${ficha.dados.cargo}` : ''}</span></p>
            <div className="overflow-x-auto"><table className="min-w-full text-xs">
                <thead><tr className="text-left text-slate-500"><th className="p-1">Verba</th>{cenarios.map((c, i) => <th key={c.cenario.id} className="p-1 text-right">{i + 1}. {rotuloCenario(c.cenario)}<br /><span className="font-normal">em {br(c.cenario.data)}{c.r.situacao !== 'calculado' ? ` · ${c.r.situacao}` : ''}</span></th>)}</tr></thead>
                <tbody>
                    {linhas.map(l => <tr key={`${l.descricao}|${l.tipo}`} className="border-t border-slate-100 dark:border-slate-800"><td className="p-1">{l.tipo === 'desconto' ? '(−) ' : ''}{l.descricao}</td>{l.valores.map((x, j) => <td key={j} className="p-1 text-right">{v(x)}</td>)}</tr>)}
                    {total('Líquido do trabalhador', c => reais(c.custo.liquido), true)}
                    {total('FGTS do mês e rescisório', c => v(c.custo.fgts))}
                    {total(`Multa do FGTS${saldoInformado ? '' : ' (estimada)'}`, c => v(c.custo.multaFgts))}
                    {total('Encargos patronais', c => (c.custo.patronal ? v(c.custo.patronal.patronal + c.custo.patronal.rat + c.custo.patronal.terceiros) : '—'))}
                    {cenarios.some(c => c.custo.indenizacaoDataBase) && total('Indenização da data-base', c => v(c.custo.indenizacaoDataBase))}
                    {total('Custo total para a empresa', c => reais(c.custo.total), true)}
                    {total('Pagar até', c => br(c.r.pagarAte))}
                    {total('FGTS / seguro-desemprego', c => `${sacaFgts(c.cenario.tipo)} · ${podeSeguroDesemprego(c.cenario.tipo) ? 'pode ter seguro' : 'sem seguro'}`)}
                </tbody>
            </table></div>
            {semEnquadramento && <p className="text-xs text-amber-700 dark:text-amber-300">Empresa sem enquadramento vigente (Cadastros › Enquadramento): o custo não inclui os encargos patronais.</p>}
            {avisos.length > 0 && <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-900 dark:text-amber-100">{avisos.map(a => <li key={a}>{a}</li>)}</ul>}
        </section>
    );
};

export default DemissoesPanel;
