// components/esocial/ESocialDownload.tsx
//
// Download de eventos do eSocial (Fase 1, item 2 do plano). Consulta os
// identificadores, baixa os eventos escolhidos e entrega um .zip no formato do
// portal, que entra direto em Cadastros e na Conferência pós-folha.

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarFuncionarios } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import {
    EVENTOS_EMPREGADOR, EVENTOS_TABELA, MAX_DIAS_PERIODO, baixarEventos, consultarIdentificadores, continuarDe, cpfDoEvento, erroPeriodo, janela, tipoDoElemento, zipDosEventos,
    type ArquivoBaixado, type Identificador, type RetornoIdentificadores, type TipoConsulta,
} from '../../services/esocial/downloadEventos';
import { baixarBytes } from '../../services/implantacao/zip';

const inp = 'rounded border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const hoje = () => new Date().toLocaleDateString('sv-SE');
const menos = (dias: number) => new Date(Date.now() - dias * 86400000).toLocaleDateString('sv-SE');
const somarUmDia = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const fmtCpf = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);

const ESocialDownload: React.FC = () => {
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const { ativa } = useEmpresaAtiva();
    const [empresaId, setEmpresaId] = useState(ativa?.id ?? '');
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [tipo, setTipo] = useState<TipoConsulta>('trabalhador');
    const [tpEvt, setTpEvt] = useState('S-1299');
    const [perApur, setPerApur] = useState(ativa?.competencia ?? new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 7));
    const [cpf, setCpf] = useState('');
    const [dtIni, setDtIni] = useState(menos(MAX_DIAS_PERIODO - 1));
    const [dtFim, setDtFim] = useState(hoje());
    const [certificado, setCertificado] = useState<'escritorio' | 'empresa'>('escritorio');
    const [retorno, setRetorno] = useState<RetornoIdentificadores | null>(null);
    const [marcados, setMarcados] = useState<Set<string>>(new Set());
    const [baixados, setBaixados] = useState<Map<string, ArquivoBaixado>>(new Map());
    const [falhas, setFalhas] = useState<ArquivoBaixado[]>([]);
    const [pedidosHoje, setPedidosHoje] = useState<number | null>(null);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');

    useEffect(() => { listarEmpresasVisiveis().then(setEmpresas).catch(() => setEmpresas([])); }, []);
    useEffect(() => {
        setFichas([]); setRetorno(null); setBaixados(new Map()); setFalhas([]); setPedidosHoje(null);
        if (empresaId) listarFuncionarios(empresaId).then(setFichas).catch(() => setFichas([]));
    }, [empresaId]);
    const empresa = empresas.find(e => e.id === empresaId);
    const ficha = useMemo(() => fichas.find(f => f.cpf === cpf.replace(/\D/g, '')), [fichas, cpf]);

    async function consultar(desde?: string) {
        if (!empresa) return;
        setOcupado('Consultando o eSocial…'); setErro(''); setRetorno(null); setMarcados(new Set());
        try {
            const r = await consultarIdentificadores({
                cnpj: empresa.cnpj, tipo, certificado,
                ...(tipo === 'empregador' ? { tpEvt, perApur } : tipo === 'tabela' ? { tpEvt, dtIni: desde ?? dtIni, dtFim } : { cpfTrab: cpf.replace(/\D/g, ''), dtIni: desde ?? dtIni, dtFim }),
            });
            setRetorno(r); setPedidosHoje(r.pedidosHoje);
            setMarcados(new Set(r.identificadores.filter(i => !baixados.has(i.id)).map(i => i.id)));
            if (desde) setDtIni(desde.slice(0, 10));
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    async function baixar() {
        if (!empresa || !marcados.size) return;
        const ids = [...marcados].slice(0, 50);
        setOcupado(`Baixando ${ids.length} evento(s)…`); setErro('');
        try {
            const r = await baixarEventos(empresa.cnpj, ids, certificado);
            setPedidosHoje(r.pedidosHoje);
            setBaixados(m => { const n = new Map(m); r.arquivos.filter(a => a.evt).forEach(a => n.set(a.id, a)); return n; });
            setFalhas(f => [...f, ...r.arquivos.filter(a => !a.evt)]);
            setMarcados(new Set());
            if (r.cdResposta && r.cdResposta >= 300) setErro(`eSocial: ${r.cdResposta} - ${r.descResposta}`);
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    function salvarZip() {
        if (!empresa) return;
        baixarBytes(`esocial-${empresa.codigoSage}-${hoje()}.zip`, zipDosEventos([...baixados.values()]), 'application/zip');
    }

    const problemaPeriodo = tipo === 'empregador' ? null : erroPeriodo(dtIni, dtFim, hoje());
    const podeConsultar = !!empresa && !ocupado && !problemaPeriodo && (tipo === 'empregador' ? /^S-\d{4}$/.test(tpEvt) && !!perApur : tipo === 'tabela' ? /^S-\d{4}$/.test(tpEvt) : cpf.replace(/\D/g, '').length === 11);
    const restam = retorno ? retorno.qtdeTotal - retorno.identificadores.length : 0;

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Baixar eventos do eSocial</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    O CFI consulta o eSocial com o certificado do escritório (procuração) e devolve os XMLs oficiais. O .zip gerado entra direto em Cadastros (Funcionários, Afastamentos, Incidências) e na Conferência pós-folha.
                </p>
                <p className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                    O eSocial limita os pedidos por dia para cada empregador e devolve no máximo 50 eventos por resposta. Cada consulta e cada download contam: monte o filtro antes de clicar.
                    {pedidosHoje !== null && <strong> Pedidos hoje para esta empresa: {pedidosHoje}.</strong>}
                </p>
            </div>

            <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-700 dark:bg-slate-800">
                <label className="block text-sm dark:text-white sm:col-span-2">Empresa
                    <select className={`${inp} mt-1 w-full`} value={empresaId} onChange={e => setEmpresaId(e.target.value)} aria-label="Empresa">
                        <option value="">Selecione</option>
                        {empresas.map(e => <option key={e.id} value={e.id}>{e.codigoSage} · {e.nomeFantasia || e.razaoSocial}</option>)}
                    </select></label>
                <label className="block text-sm dark:text-white">Consulta
                    <select className={`${inp} mt-1 w-full`} value={tipo} onChange={e => { const t = e.target.value as TipoConsulta; setTipo(t); setTpEvt(t === 'tabela' ? 'S-1010' : 'S-1299'); setRetorno(null); }} aria-label="Tipo de consulta">
                        <option value="trabalhador">Por trabalhador (CPF e período)</option>
                        <option value="empregador">Por competência (empregador)</option>
                        <option value="tabela">Tabelas (rubricas, estabelecimentos)</option>
                    </select></label>
                <label className="block text-sm dark:text-white">Certificado
                    <select className={`${inp} mt-1 w-full`} value={certificado} onChange={e => setCertificado(e.target.value as 'escritorio' | 'empresa')} aria-label="Certificado">
                        <option value="escritorio">Do escritório (procurador)</option>
                        <option value="empresa">Da própria empresa</option>
                    </select></label>

                {tipo === 'trabalhador' && (
                    <>
                        <label className="block text-sm dark:text-white sm:col-span-2">CPF do trabalhador
                            <input className={`${inp} mt-1 w-full`} list="cpfs-empresa" value={cpf} onChange={e => setCpf(e.target.value)} placeholder="000.000.000-00" aria-label="CPF do trabalhador" />
                            <datalist id="cpfs-empresa">{fichas.map(f => <option key={f.id} value={f.cpf}>{f.dados.nome}</option>)}</datalist>
                            {ficha && <span className="block text-xs text-green-700 dark:text-green-400">{ficha.dados.nome} · admissão {ficha.dados.admissao?.split('-').reverse().join('/')}
                                {ficha.dados.admissao && <button className="ml-2 underline" onClick={() => { const j = janela(ficha.dados.admissao!, hoje()); setDtIni(j.dtIni); setDtFim(j.dtFim); }}>usar a admissão como início</button>}</span>}
                        </label>
                    </>
                )}
                {tipo !== 'trabalhador' && (
                    <label className="block text-sm dark:text-white">Evento
                        <select className={`${inp} mt-1 w-full`} value={tpEvt} onChange={e => setTpEvt(e.target.value)} aria-label="Tipo de evento">
                            {(tipo === 'empregador' ? EVENTOS_EMPREGADOR : EVENTOS_TABELA).map(t => <option key={t}>{t}</option>)}
                        </select></label>
                )}
                {tipo === 'empregador'
                    ? <label className="block text-sm dark:text-white">Competência
                        <input className={`${inp} mt-1 w-full`} type="month" value={perApur} onChange={e => setPerApur(e.target.value)} aria-label="Competência" /></label>
                    : (
                        <>
                            <label className="block text-sm dark:text-white">De
                                <input className={`${inp} mt-1 w-full`} type="date" value={dtIni} onChange={e => setDtIni(e.target.value)} aria-label="Data inicial" /></label>
                            <label className="block text-sm dark:text-white">Até
                                <input className={`${inp} mt-1 w-full`} type="date" value={dtFim} onChange={e => setDtFim(e.target.value)} aria-label="Data final" /></label>
                        </>
                    )}
                <div className="flex items-end sm:col-span-2 lg:col-span-4">
                    <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!podeConsultar} onClick={() => consultar()}>Consultar no eSocial</button>
                    {tipo === 'empregador' && <span className="ml-3 text-xs text-slate-500 dark:text-slate-400">A consulta por competência não tem continuação: se houver mais de 50 eventos, use a consulta por trabalhador.</span>}
                    {problemaPeriodo && <span role="status" className="ml-3 text-xs text-amber-700 dark:text-amber-300">{problemaPeriodo}</span>}
                    {tipo !== 'empregador' && !problemaPeriodo && <span className="ml-3 text-xs text-slate-500 dark:text-slate-400">Até {MAX_DIAS_PERIODO} dias por consulta; a data de hoje vai até uma hora atrás.</span>}
                </div>
            </div>

            {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

            {retorno && (
                <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                    <p className="text-sm dark:text-white">
                        eSocial: <strong>{retorno.cdResposta ?? '—'}</strong> {retorno.descResposta} · {retorno.identificadores.length} de {retorno.qtdeTotal} evento(s).
                    </p>
                    {restam > 0 && tipo !== 'empregador' && continuarDe(retorno.dhUltimoEvtRetornado) && (
                        <button className={btn} onClick={() => consultar(continuarDe(retorno.dhUltimoEvtRetornado))}>Consultar os próximos (a partir de {continuarDe(retorno.dhUltimoEvtRetornado).slice(0, 10).split('-').reverse().join('/')} {continuarDe(retorno.dhUltimoEvtRetornado).slice(11, 16)})</button>
                    )}
                    {tipo !== 'empregador' && dtFim < hoje() && (
                        <button className={btn} onClick={() => { const j = janela(somarUmDia(dtFim), hoje()); setDtIni(j.dtIni); setDtFim(j.dtFim); setRetorno(null); }}>Próximo período ({MAX_DIAS_PERIODO} dias depois de {dtFim.split('-').reverse().join('/')})</button>
                    )}
                    {retorno.identificadores.length > 0 && (
                        <>
                            <div className="max-h-64 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2"><input type="checkbox" aria-label="Marcar todos" checked={marcados.size === retorno.identificadores.length} onChange={e => setMarcados(e.target.checked ? new Set(retorno.identificadores.map(i => i.id)) : new Set())} /></th><th className="p-2">Id do evento</th><th className="p-2">Recibo</th><th className="p-2"></th></tr></thead>
                                    <tbody>{retorno.identificadores.map((i: Identificador) => (
                                        <tr key={i.id} className="border-t border-slate-100 dark:border-slate-700 dark:text-slate-100">
                                            <td className="p-2"><input type="checkbox" aria-label={`Marcar ${i.id}`} checked={marcados.has(i.id)} onChange={e => setMarcados(m => { const n = new Set(m); if (e.target.checked) n.add(i.id); else n.delete(i.id); return n; })} /></td>
                                            <td className="p-2 font-mono text-xs">{i.id}</td>
                                            <td className="p-2 font-mono text-xs">{i.nrRec}</td>
                                            <td className="p-2 text-xs text-green-700 dark:text-green-400">{baixados.has(i.id) ? 'já baixado' : ''}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!marcados.size || !!ocupado} onClick={baixar}>Baixar {Math.min(marcados.size, 50)} evento(s)</button>
                        </>
                    )}
                </section>
            )}

            {(baixados.size > 0 || falhas.length > 0) && (
                <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-semibold text-slate-800 dark:text-white">Eventos baixados nesta sessão ({baixados.size})</h4>
                        <button className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!baixados.size} onClick={salvarZip}>Salvar .zip</button>
                    </div>
                    <div className="max-h-72 overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-slate-500 dark:text-slate-400"><tr><th className="p-1">Evento</th><th className="p-1">CPF</th><th className="p-1">Id</th></tr></thead>
                            <tbody>{[...baixados.values()].map(a => (
                                <tr key={a.id} className="border-t border-slate-100 dark:border-slate-700 dark:text-slate-100">
                                    <td className="p-1">{tipoDoElemento(a.elemento)}</td>
                                    <td className="p-1 font-mono text-xs">{fmtCpf(cpfDoEvento(a.evt))}</td>
                                    <td className="p-1 font-mono text-xs">{a.id}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                    {falhas.length > 0 && <ul className="list-disc pl-5 text-xs text-red-700 dark:text-red-300">{falhas.map((f, k) => <li key={k}>{f.id || 'evento'}: {f.cdResposta} - {f.descResposta}</li>)}</ul>}
                    <p className="text-xs text-slate-500 dark:text-slate-400">Os XMLs não são gravados no app: ficam só no .zip que você salvar. Para usar, importe o .zip em Cadastros ou na Conferência pós-folha.</p>
                </section>
            )}
        </div>
    );
};

export default ESocialDownload;
