// components/esocial/ESocialTransmissao.tsx
//
// Transmissão de eventos do eSocial pelo cofre do CFI, na empresa e
// competência ativas: fechamento (S-1299) e reabertura (S-1298) gerados aqui,
// ou XML pronto (IOB ou outro sistema). O CFI confere a carteira, assina com
// o A1 do cofre e envia; o resultado (recibo ou ocorrências) vem pela
// consulta do protocolo. Produção restrita é o padrão.

import React, { useCallback, useEffect, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import {
    ROTULO_AMBIENTE, ROTULO_GRUPO, aceito, consultarLote, enviarLote, gerarS1298, gerarS1299, lerEventoXml,
    type Certificado, type EventoLido, type InfoFech, type TpAmb,
} from '../../services/esocial/transmissao';
import { listarEnvios, registrarConsulta, registrarEnvio, resumoEnvio, type Envio } from '../../services/esocial/transmissaoService';

interface Props { usuario?: Usuario }

const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const btnP = 'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50';
const br = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
const compBr = (c: string) => (c.length === 7 ? `${c.slice(5)}/${c.slice(0, 4)}` : c);
const COR = {
    enviado: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    'em-processamento': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    processado: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    recusado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
} as const;
const lerTexto = (f: File) => new Promise<string>((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? ''));
    r.onerror = () => falha(r.error);
    r.readAsText(f);
});
const ROTULO_SITUACAO = { enviado: 'enviado (consultar)', 'em-processamento': 'em processamento', processado: 'processado', recusado: 'recusado' } as const;

const INDICADORES: { k: keyof InfoFech; rotulo: string }[] = [
    { k: 'evtRemun', rotulo: 'Houve remuneração no período (S-1200/S-1202/S-1207)' },
    { k: 'evtPgtos', rotulo: 'Houve pagamentos no período (S-1210)' },
    { k: 'evtComProd', rotulo: 'Comercialização da produção rural (S-1260)' },
    { k: 'evtContratAvNP', rotulo: 'Avulsos não portuários (S-1270)' },
    { k: 'evtInfoComplPer', rotulo: 'Informações complementares: desoneração / Simples concomitante (S-1280)' },
    { k: 'transDCTFWeb', rotulo: 'Transmitir a DCTFWeb logo após o fechamento' },
];

const ESocialTransmissao: React.FC<Props> = ({ usuario }) => {
    const { ativa, trocar } = useEmpresaAtiva();
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [confirmo, setConfirmo] = useState(false);
    const [certificado, setCertificado] = useState<Certificado>('escritorio');
    const [anual, setAnual] = useState(false);
    const [info, setInfo] = useState<InfoFech>({ evtRemun: true, evtPgtos: true, evtComProd: false, evtContratAvNP: false, evtInfoComplPer: false, transDCTFWeb: true });
    const [arquivos, setArquivos] = useState<EventoLido[]>([]);
    const [envios, setEnvios] = useState<Envio[] | null>(null);
    const [aberto, setAberto] = useState('');
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');

    const carregar = useCallback(() => {
        if (!ativa) return;
        listarEnvios(ativa.id).then(setEnvios).catch(e => { setErro((e as Error).message); setEnvios([]); });
    }, [ativa]);
    useEffect(() => { carregar(); }, [carregar]);
    // Trocar o ambiente invalida a leitura dos XMLs e a confirmação.
    useEffect(() => { setConfirmo(false); setArquivos(a => (ativa ? a.map(x => lerEventoXml(x.nome, x.xml, ativa, tpAmb)) : a)); }, [tpAmb, ativa]);

    if (!ativa) return <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative uma empresa e a competência para transmitir.</p>;

    const perApur = anual ? ativa.competencia.slice(0, 4) : ativa.competencia;
    const podeEnviar = !!usuario && !ocupado && (tpAmb === 2 || confirmo);

    async function transmitir(eventos: { xml: string; tipo: string }[], descricao: string) {
        if (!usuario || !ativa) return;
        const amb = ROTULO_AMBIENTE[tpAmb];
        if (!window.confirm(`Transmitir ${descricao} de ${ativa.nome} em ${amb.toUpperCase()}?${tpAmb === 1 ? '\n\nEntrega em produção vale para a empresa e não se desfaz.' : ''}`)) return;
        setOcupado(`Transmitindo ${descricao}…`); setErro(''); setMsg('');
        try {
            const r = await enviarLote({ empresaId: ativa.id, cnpj: ativa.cnpj, eventos: eventos.map(e => e.xml), tpAmb, certificado, ...(tpAmb === 1 ? { confirmoProducao: true } : {}) });
            await registrarEnvio({ empresaId: ativa.id, cnpj: ativa.cnpj, certificado, retorno: r }, usuario);
            if (r.recebido) setMsg(`Lote recebido pelo eSocial. Protocolo ${r.protocolo}. Consulte o resultado em alguns segundos.`);
            else setErro(`eSocial recusou o lote: ${r.cdResposta ?? ''} ${r.descResposta}${r.ocorrencias.length ? ` — ${r.ocorrencias.map(o => `${o.codigo} ${o.descricao}`).join('; ')}` : ''}`);
            setArquivos([]);
            carregar();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    async function consultar(e: Envio) {
        if (!usuario || !ativa) return;
        setOcupado('Consultando o resultado…'); setErro(''); setMsg('');
        try {
            const r = await consultarLote({ empresaId: ativa.id, cnpj: ativa.cnpj, protocolo: e.protocolo, tpAmb: e.tpAmb, certificado: e.certificado });
            await registrarConsulta(e, r, usuario);
            if (r.situacao === 'em-processamento') setMsg(`Ainda em processamento${r.tempoEstimadoConclusao ? ` (previsão: ${r.tempoEstimadoConclusao} s)` : ''}.`);
            setAberto(e.id);
            carregar();
        } catch (x) { setErro((x as Error).message); }
        finally { setOcupado(''); }
    }

    async function lerArquivos(files: FileList | null) {
        if (!files || !ativa) return;
        const lidos = await Promise.all([...files].map(async f => lerEventoXml(f.name, await lerTexto(f), ativa, tpAmb)));
        setArquivos(lidos);
    }
    const validos = arquivos.filter(a => !a.erro);
    const grupos = [...new Set(validos.map(a => a.grupo))];
    const erroArquivos = !arquivos.length ? '' : validos.length !== arquivos.length ? 'Tire os arquivos com erro antes de transmitir.'
        : grupos.length > 1 ? `Um lote leva eventos de um grupo só; vieram ${grupos.map(g => (g ? ROTULO_GRUPO[g] : '?')).join(' e ')}.`
        : validos.length > 50 ? 'No máximo 50 eventos por lote.' : '';

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                        <h3 className="font-semibold text-slate-800 dark:text-white">Transmissão pelo cofre: {ativa.nome} · competência {compBr(ativa.competencia)}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">O Consultor Fiscal confere a sua carteira, assina com o certificado A1 do cofre e envia. O conteúdo dos eventos não fica gravado; ficam o protocolo, os recibos e as ocorrências.</p>
                    </div>
                    <button className="text-sm text-blue-700 underline dark:text-blue-300" onClick={trocar}>Trocar empresa ou período</button>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
                    <label className="block"><span className="text-xs text-slate-600 dark:text-slate-300">Ambiente</span>
                        <select aria-label="Ambiente" className={btn} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}>
                            <option value={2}>{ROTULO_AMBIENTE[2]}</option><option value={1}>{ROTULO_AMBIENTE[1]}</option>
                        </select></label>
                    <label className="block"><span className="text-xs text-slate-600 dark:text-slate-300">Certificado</span>
                        <select aria-label="Certificado" className={btn} value={certificado} onChange={e => setCertificado(e.target.value as Certificado)}>
                            <option value="escritorio">do escritório (procurador)</option><option value="empresa">da própria empresa</option>
                        </select></label>
                </div>
                {tpAmb === 1 && (
                    <label className="mt-2 flex items-start gap-2 rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
                        <input type="checkbox" checked={confirmo} onChange={e => setConfirmo(e.target.checked)} aria-label="Confirmo a transmissão em produção" />
                        <span>Confirmo: a entrega em <strong>produção</strong> vale para a empresa no eSocial e não se desfaz (só com retificação ou exclusão).</span>
                    </label>
                )}
                {!usuario && <p className="mt-2 text-xs text-slate-500">Entre com seu usuário para transmitir.</p>}
            </section>

            {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {ocupado && <p className="text-sm text-slate-500">{ocupado}</p>}

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <h3 className="font-semibold text-slate-800 dark:text-white">Fechamento da folha (S-1299) e reabertura (S-1298)</h3>
                <label className="mt-2 flex items-center gap-2 text-sm dark:text-slate-200"><input type="checkbox" checked={anual} onChange={e => setAnual(e.target.checked)} /> Anual (13º salário): período {ativa.competencia.slice(0, 4)}</label>
                <fieldset className="mt-2 grid gap-1 sm:grid-cols-2">
                    <legend className="sr-only">Indicadores do fechamento</legend>
                    {INDICADORES.map(i => (
                        <label key={i.k} className="flex items-center gap-2 text-sm dark:text-slate-200">
                            <input type="checkbox" checked={info[i.k]} onChange={e => setInfo({ ...info, [i.k]: e.target.checked })} /> {i.rotulo}
                        </label>
                    ))}
                </fieldset>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Os indicadores dizem ao eSocial quais eventos periódicos existem no período: ele confere com o que recebeu. Leiaute S-1.3.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <button className={btnP} disabled={!podeEnviar} onClick={() => transmitir([{ ...gerarS1299({ cnpj: ativa.cnpj, perApur, tpAmb, info }), tipo: 'S-1299' }], `o fechamento (S-1299) de ${compBr(perApur)}`)}>Transmitir fechamento (S-1299)</button>
                    <button className={btn} disabled={!podeEnviar} onClick={() => transmitir([{ ...gerarS1298({ cnpj: ativa.cnpj, perApur, tpAmb }), tipo: 'S-1298' }], `a reabertura (S-1298) de ${compBr(perApur)}`)}>Reabrir o período (S-1298)</button>
                </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                <h3 className="font-semibold text-slate-800 dark:text-white">Enviar XML pronto</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Eventos gerados pelo IOB ou por outro sistema (S-1200, S-2200, S-2299…). Assinados ou não: o CFI assina de novo com o A1 do cofre. Até 50 por lote, todos do mesmo grupo (tabelas, não periódicos ou periódicos).</p>
                <input aria-label="Arquivos XML" type="file" accept=".xml,text/xml" multiple className="mt-2 text-sm dark:text-slate-200" onChange={e => lerArquivos(e.target.files)} />
                {arquivos.length > 0 && (
                    <ul className="mt-2 divide-y divide-slate-100 rounded border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
                        {arquivos.map(a => (
                            <li key={a.nome} className="px-3 py-1.5 dark:text-slate-100">
                                <strong>{a.tipo || '?'}</strong> {a.perApur && <span className="text-xs">· {a.perApur}</span>} {a.cpf && <span className="text-xs">· CPF {a.cpf}</span>}
                                <span className="block text-xs text-slate-500">{a.nome}{a.id ? ` · ${a.id}` : ''}</span>
                                {a.erro && <span className="block text-xs font-medium text-red-700 dark:text-red-300">{a.erro}</span>}
                            </li>
                        ))}
                    </ul>
                )}
                {erroArquivos && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{erroArquivos}</p>}
                <button className={`${btnP} mt-2`} disabled={!podeEnviar || !validos.length || !!erroArquivos}
                    onClick={() => transmitir(validos.map(a => ({ xml: a.xml, tipo: a.tipo })), `${validos.length} evento(s)`)}>Transmitir {validos.length || ''} evento(s)</button>
            </section>

            <section className="space-y-2">
                <h3 className="font-semibold text-slate-800 dark:text-white">Lotes transmitidos desta empresa</h3>
                {!envios && <p className="text-sm text-slate-500">Carregando…</p>}
                {envios?.length === 0 && <p className="rounded border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-600">Nenhum lote transmitido por aqui.</p>}
                {envios?.map(e => {
                    const r = resumoEnvio(e);
                    return (
                        <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR[e.situacao]}`}>{ROTULO_SITUACAO[e.situacao]}</span>
                                <strong>{[...new Set(e.eventos.map(x => x.tipo))].join(', ')}</strong>
                                <span className="text-xs text-slate-500">{e.eventos.length} evento(s) · {ROTULO_AMBIENTE[e.tpAmb]} · {br(e.enviadoEm)} · {e.enviadoPorEmail}</span>
                                <span className="ml-auto flex gap-2">
                                    {e.protocolo && e.situacao !== 'processado' && <button className={btn} disabled={!usuario || !!ocupado} onClick={() => consultar(e)}>Consultar resultado</button>}
                                    <button className={btn} onClick={() => setAberto(aberto === e.id ? '' : e.id)}>{aberto === e.id ? 'Fechar' : 'Detalhes'}</button>
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                                {e.protocolo ? `Protocolo ${e.protocolo}` : 'Sem protocolo'} · {e.cdResposta ?? ''} {e.descResposta}
                                {e.consultadoEm && ` · consultado ${br(e.consultadoEm)}`} · aceitos {r.aceitos}, recusados {r.recusados}{r.aguardando ? `, sem resultado ${r.aguardando}` : ''}
                            </p>
                            {aberto === e.id && (
                                <ul className="mt-2 space-y-1 text-xs">
                                    {e.ocorrencias.map(o => <li key={`${o.codigo}${o.descricao}`} className="text-red-700 dark:text-red-300">Lote: {o.codigo} {o.descricao}</li>)}
                                    {e.eventos.map(x => (
                                        <li key={x.id} className="rounded bg-slate-50 p-2 dark:bg-slate-900/40">
                                            <strong>{x.tipo}</strong> {x.perApur && `· ${x.perApur}`} · <span className="font-mono">{x.id}</span>
                                            {x.nrRecibo && aceito({ cdResposta: x.cdResposta ?? null, nrRecibo: x.nrRecibo }) && <span className="block text-green-700 dark:text-green-300">Recibo {x.nrRecibo}{x.totalizadores?.length ? ` · totalizadores: ${x.totalizadores.join(', ')}` : ''}</span>}
                                            {x.cdResposta != null && !x.nrRecibo && <span className="block text-red-700 dark:text-red-300">{x.cdResposta} {x.descResposta}</span>}
                                            {x.ocorrencias?.map(o => <span key={`${o.codigo}${o.localizacao}`} className="block text-slate-600 dark:text-slate-300">{o.tipo === 2 ? 'Advertência' : 'Erro'} {o.codigo}: {o.descricao}{o.localizacao ? ` (${o.localizacao})` : ''}</span>)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </section>
        </div>
    );
};

export default ESocialTransmissao;
