// components/cadastros/TabelaDsrCadastro.tsx
//
// Tabela para D.S.R. do IOB SAGE, dentro de Tabelas legais: por empresa e ano, os dias úteis e os domingos e
// feriados de cada mês (o Nº horas D.S.R. sai deles), a "Cópia padrão" pelo calendário com os feriados nacionais,
// a "Cópia entre empresas" e as duas opções de falta. Mês encerrado no Fim de mês não se altera: reabra primeiro.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { excluirTabelaDsr, listarTabelasDsr, mensagemErro, salvarTabelaDsr, type Usuario } from '../../services/cadastros/cadastrosService';
import { listarFechamentos } from '../../services/fimDeMes/fechamentoService';
import {
    MESES, NOME_MES, copiarTabelaDsr, diferencasDoCalendario, horasDsr, mesesAlterados, tabelaDsrPadrao, validarTabelaDsr,
    type Mes, type TabelaDsr,
} from '../../services/cadastros/tabelaDsr';

interface Props { empresas: Empresa[] | null; empresaInicial: string; usuario: Usuario; isAdmin: boolean }

const inp = 'w-full rounded-sm border border-slate-300 bg-white px-1 py-1 text-center text-sm tabular-nums text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const nomeEmpresa = (e: Empresa) => `${e.codigoSage} · ${e.nomeFantasia || e.razaoSocial}`;
const horas = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TabelaDsrCadastro: React.FC<Props> = ({ empresas, empresaInicial, usuario, isAdmin }) => {
    const [empresaId, setEmpresaId] = useState(empresaInicial);
    const [ano, setAno] = useState(String(new Date().getFullYear()));
    const [tabelas, setTabelas] = useState<TabelaDsr[] | null>(null);
    const [encerrados, setEncerrados] = useState<Set<string>>(new Set());
    const [edicao, setEdicao] = useState<TabelaDsr | null>(null);
    const [erros, setErros] = useState<string[]>([]);
    const [msg, setMsg] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [copiarDe, setCopiarDe] = useState('');

    useEffect(() => { if (empresaInicial) setEmpresaId(empresaInicial); }, [empresaInicial]);

    const carregar = useCallback(() => {
        setTabelas(null); setErros([]); setMsg('');
        if (!empresaId) return;
        let vivo = true;
        listarTabelasDsr(empresaId).then(t => { if (vivo) setTabelas(t); }).catch(e => { if (vivo) { setErros([mensagemErro(e)]); setTabelas([]); } });
        listarFechamentos(empresaId).then(f => { if (vivo) setEncerrados(new Set(f.filter(x => x.situacao === 'encerrado').map(x => x.competencia))); }).catch(() => undefined);
        return () => { vivo = false; };
    }, [empresaId]);
    useEffect(carregar, [carregar]);

    const gravada = useMemo(() => tabelas?.find(t => t.ano === ano) ?? null, [tabelas, ano]);
    useEffect(() => { setEdicao(gravada ? { ...gravada, meses: { ...gravada.meses } } : null); setErros([]); }, [gravada]);

    const anoValido = /^\d{4}$/.test(ano);
    const setMes = (m: Mes, k: 'uteis' | 'descanso', v: string) => setEdicao(e => e && ({ ...e, meses: { ...e.meses, [m]: { ...e.meses[m], [k]: v.trim() === '' ? NaN : Number(v) } } }));

    async function copiarDeOutra() {
        if (!copiarDe || !anoValido) return;
        setErros([]); setMsg('');
        try {
            const origem = (await listarTabelasDsr(copiarDe)).find(t => t.ano === ano);
            if (!origem) { setErros([`A empresa escolhida não tem a Tabela de DSR de ${ano}.`]); return; }
            setEdicao(copiarTabelaDsr(origem, empresaId));
            setMsg('Copiada da outra empresa: confira e grave.');
        } catch (e) { setErros([mensagemErro(e)]); }
    }

    async function gravar() {
        if (!edicao) return;
        const v = validarTabelaDsr(edicao);
        // Mês encerrado no Fim de mês: como no SAGE, reabra o mês antes de mudar a tabela dele.
        const travados = mesesAlterados(gravada, edicao).filter(m => encerrados.has(`${ano}-${m}`));
        if (travados.length) v.push(`Mês encerrado: ${travados.map(m => NOME_MES[m]).join(', ')}. Para alterar a tabela de meses encerrados, reabra o mês no Fim de mês.`);
        if (v.length) { setErros(v); return; }
        setSalvando(true); setErros([]);
        try { await salvarTabelaDsr(gravada, edicao, usuario); setMsg(`Tabela de DSR de ${ano} gravada.`); carregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    async function excluir() {
        if (!gravada) return;
        const travados = MESES.filter(m => encerrados.has(`${ano}-${m}`));
        if (travados.length) { setErros([`Há meses encerrados em ${ano} (${travados.map(m => NOME_MES[m]).join(', ')}): reabra-os antes de excluir a tabela.`]); return; }
        if (!window.confirm(`Excluir a Tabela de DSR de ${ano}? O cálculo volta ao calendário com os feriados nacionais. A exclusão fica no histórico.`)) return;
        setSalvando(true);
        try { await excluirTabelaDsr(gravada, usuario); setMsg(`Tabela de DSR de ${ano} excluída.`); carregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    const difs = edicao && !validarTabelaDsr(edicao).length ? diferencasDoCalendario(edicao) : [];
    const alterada = !!edicao && (!gravada || mesesAlterados(gravada, edicao).length > 0 || edicao.observacao !== gravada.observacao);

    const metade = (meses: Mes[]) => (
        <table className="w-full min-w-[34rem] text-sm">
            <thead>
                <tr><th className="w-48 p-1 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Configuração do D.S.R.</th>
                    {meses.map(m => <th key={m} className="p-1 text-xs font-semibold text-slate-700 dark:text-slate-200">{NOME_MES[m]}{encerrados.has(`${ano}-${m}`) ? ' 🔒' : ''}</th>)}</tr>
            </thead>
            <tbody>
                <tr><td className="p-1 text-xs text-slate-600 dark:text-slate-300">Nº horas D.S.R.</td>
                    {meses.map(m => <td key={m} className="p-1 text-center tabular-nums text-slate-700 dark:text-slate-200" title="Domingos e feriados × 220 h ÷ 30 (não se digita)">{edicao && Number.isFinite(edicao.meses[m].descanso) ? horas(horasDsr(edicao.meses[m].descanso)) : '—'}</td>)}</tr>
                <tr><td className="p-1 text-xs text-slate-600 dark:text-slate-300">Dias úteis</td>
                    {meses.map(m => <td key={m} className="p-1"><input className={inp} inputMode="numeric" disabled={encerrados.has(`${ano}-${m}`)} value={edicao && Number.isFinite(edicao.meses[m].uteis) ? edicao.meses[m].uteis : ''} onChange={e => setMes(m, 'uteis', e.target.value)} aria-label={`Dias úteis de ${NOME_MES[m]}`} /></td>)}</tr>
                <tr><td className="p-1 text-xs text-slate-600 dark:text-slate-300">Domingos/Feriados</td>
                    {meses.map(m => <td key={m} className="p-1"><input className={inp} inputMode="numeric" disabled={encerrados.has(`${ano}-${m}`)} value={edicao && Number.isFinite(edicao.meses[m].descanso) ? edicao.meses[m].descanso : ''} onChange={e => setMes(m, 'descanso', e.target.value)} aria-label={`Domingos e feriados de ${NOME_MES[m]}`} /></td>)}</tr>
            </tbody>
        </table>
    );

    return (
        <section aria-label="Tabela para D.S.R." className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-slate-800 dark:text-white">Tabela para D.S.R. (por empresa e ano)</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">No IOB: Arquivos › Tabelas › Tabela para D.S.R.</span>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_8rem]">
                <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Empresa</span>
                    <select className="mt-1 block w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={empresaId} onChange={e => setEmpresaId(e.target.value)} aria-label="Empresa da Tabela de DSR">
                        <option value="">{empresas ? 'Selecione a empresa' : 'Carregando…'}</option>
                        {empresas?.map(e => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
                    </select></label>
                <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Ano</span>
                    <input className="mt-1 block w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm tabular-nums dark:border-slate-600 dark:bg-slate-900 dark:text-white" inputMode="numeric" maxLength={4} value={ano} onChange={e => setAno(e.target.value.replace(/\D/g, ''))} aria-label="Ano da Tabela de DSR" /></label>
            </div>

            {!empresaId && <p className="mt-2 text-sm text-slate-500">Selecione a empresa.</p>}
            {empresaId && !tabelas && !erros.length && <p className="mt-2 text-sm text-slate-500">Carregando…</p>}
            {empresaId && tabelas && anoValido && (
                <div className="mt-3 space-y-3">
                    {!edicao && (
                        <div className="rounded-sm border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-100">
                            <p>Sem Tabela de DSR de {ano} nesta empresa: o cálculo usa o calendário com os feriados nacionais e os feriados locais informados no movimento.</p>
                            <div className="mt-2 flex flex-wrap items-end gap-2">
                                <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white" onClick={() => { setEdicao(tabelaDsrPadrao(empresaId, ano)); setMsg('Cópia padrão: calendário com os feriados nacionais. Acerte os estaduais, municipais e pontos facultativos e grave.'); }}>Cópia padrão</button>
                                <label className="block"><span className="text-xs">Cópia entre empresas</span>
                                    <select className="mt-1 block rounded-sm border border-slate-300 px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={copiarDe} onChange={e => setCopiarDe(e.target.value)} aria-label="Copiar a tabela da empresa">
                                        <option value="">Copiar da empresa…</option>
                                        {empresas?.filter(e => e.id !== empresaId).map(e => <option key={e.id} value={e.id}>{nomeEmpresa(e)}</option>)}
                                    </select></label>
                                <button className="rounded-sm border border-blue-700 px-3 py-1.5 text-blue-800 disabled:opacity-50 dark:text-blue-200" disabled={!copiarDe} onClick={copiarDeOutra}>Copiar</button>
                            </div>
                        </div>
                    )}
                    {edicao && (
                        <>
                            <div className="overflow-x-auto">{metade(MESES.slice(0, 6))}</div>
                            <div className="overflow-x-auto">{metade(MESES.slice(6))}</div>
                            <div className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
                                <label className="flex items-start gap-2"><input type="checkbox" checked={edicao.descontarDsrNaFalta} onChange={e => setEdicao({ ...edicao, descontarDsrNaFalta: e.target.checked })} />
                                    <span>Descontar DSR quando existir lançamento de falta diária <span className="text-xs text-slate-500 dark:text-slate-400">(o cálculo avisa quando há falta sem o "DSR descontado" informado)</span></span></label>
                                <label className="flex items-start gap-2"><input type="checkbox" checked={edicao.faltasPelosDiasDoMes} onChange={e => setEdicao({ ...edicao, faltasPelosDiasDoMes: e.target.checked })} />
                                    <span>Descontar faltas pelos dias do mês <span className="text-xs text-slate-500 dark:text-slate-400">(dia = salário ÷ dias do mês, em vez de ÷ 30)</span></span></label>
                            </div>
                            {difs.length > 0 && (
                                <p className="rounded-sm bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                                    Diferente do calendário com os feriados nacionais: {difs.map(d => `${NOME_MES[d.mes]} tabela ${d.tabela.uteis} úteis/${d.tabela.descanso} DSR, calendário ${d.calendario.uteis}/${d.calendario.descanso}`).join(' · ')}. Confira se são feriados locais ou pontos facultativos (desde 2024, 20/11 é feriado nacional, Lei 14.759/2023).
                                </p>
                            )}
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Observação</span>
                                <input className="mt-1 block w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={edicao.observacao} onChange={e => setEdicao({ ...edicao, observacao: e.target.value })} aria-label="Observação da Tabela de DSR" placeholder="Ex.: feriados municipais de São Paulo" /></label>
                            <div className="flex flex-wrap justify-between gap-2">
                                <div>{gravada && isAdmin && <button className="rounded-sm border border-red-300 px-3 py-1.5 text-sm text-red-700 dark:text-red-300" disabled={salvando} onClick={excluir}>Excluir</button>}</div>
                                <div className="flex gap-2">
                                    {alterada && <button className="rounded-sm border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:text-white" onClick={() => { setEdicao(gravada ? { ...gravada, meses: { ...gravada.meses } } : null); setErros([]); setMsg(''); }}>Cancelar</button>}
                                    <button className="rounded-sm bg-blue-700 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50" disabled={salvando} onClick={gravar}>{salvando ? 'Gravando…' : 'Gravar'}</button>
                                </div>
                            </div>
                        </>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400">O sistema traz apenas os feriados nacionais. Pontos facultativos, feriados municipais e estaduais devem ser configurados pelo usuário. Para alterar a tabela de meses encerrados (🔒), reabra o mês no Fim de mês.</p>
                </div>
            )}
            {msg && <p role="status" className="mt-2 rounded-sm bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erros.length > 0 && <ul role="alert" className="mt-2 list-disc rounded-sm bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
        </section>
    );
};

export default TabelaDsrCadastro;
