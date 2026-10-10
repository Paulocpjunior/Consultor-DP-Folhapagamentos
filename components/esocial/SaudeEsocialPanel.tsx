// components/esocial/SaudeEsocialPanel.tsx
//
// Saúde do eSocial (etapas 1 e 2): a fila dos lotes da empresa ativa com a situação de cada um, a consulta
// automática dos protocolos, os alertas (sem resposta, parado, recusas) com a ação de cada um e o que o
// pré-voo confere antes de qualquer envio. Diferente do SAGE: nada fica preso em pasta de máquina — o estado
// de cada lote está no Consultor e o que não teve resposta é conferido no eSocial antes de qualquer reenvio.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import { ROTULO_AMBIENTE, aceito, consultarLote } from '../../services/esocial/transmissao';
import { liberarReenvio, listarEnvios, registrarConsulta, registrarVerificacao, type Envio } from '../../services/esocial/transmissaoService';
import { ESPERA_LIBERAR_MS, ROTULO_ETAPA, alertasDaFila, etapaDoEnvio, podeLiberar, proximaConsulta, recibosDoDownload, resumoDaFila, type Etapa } from '../../services/esocial/filaEnvios';
import { baixarEventos } from '../../services/esocial/downloadEventos';
import { rodadaDoVigia } from '../../services/esocial/vigiaEsocial';
import { ROTULO_VERSAO_XSD } from '../../services/esocial/validadorXsd';
import AnomaliasEsocial from './AnomaliasEsocial';
import DiagnosticoOcorrencia from './DiagnosticoOcorrencia';
import MonitorLeiaute from './MonitorLeiaute';

interface Props { usuario?: Usuario }

const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
const COR: Record<Etapa, string> = {
    transmitindo: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    'sem-resposta': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    aguardando: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    processado: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    'com-recusa': 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
    recusado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    'nao-recebido': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};
const CARTOES: { etapa: Etapa; dica: string }[] = [
    { etapa: 'aguardando', dica: 'No eSocial, consultados sozinhos' },
    { etapa: 'sem-resposta', dica: 'Conferir antes de reenviar' },
    { etapa: 'com-recusa', dica: 'Corrigir na origem' },
    { etapa: 'recusado', dica: 'Lote inteiro recusado' },
    { etapa: 'processado', dica: 'Todos aceitos, com recibo' },
];
const br = (d?: string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—');
const emQuanto = (ms: number) => (ms <= 0 ? 'agora' : ms < 60_000 ? `em ${Math.ceil(ms / 1000)} s` : `em ${Math.ceil(ms / 60_000)} min`);
const tipos = (e: Envio) => [...new Set(e.eventos.map(x => x.tipo))].join(', ');

const SaudeEsocialPanel: React.FC<Props> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [envios, setEnvios] = useState<Envio[] | null>(null);
    const [agora, setAgora] = useState(() => Date.now());
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');
    const [aberto, setAberto] = useState('');
    const [filtro, setFiltro] = useState<Etapa | 'todos'>('todos');

    const carregar = useCallback(() => {
        if (!ativa) return;
        listarEnvios(ativa.id).then(l => { setEnvios(l); setAgora(Date.now()); }).catch(e => { setErro((e as Error).message); setEnvios([]); });
    }, [ativa]);
    useEffect(() => { carregar(); }, [carregar]);
    // Relógio da tela (próxima consulta, idade dos lotes) e releitura: o vigia grava em segundo plano.
    useEffect(() => {
        const t = setInterval(() => setAgora(Date.now()), 5000);
        const r = setInterval(carregar, 30_000);
        return () => { clearInterval(t); clearInterval(r); };
    }, [carregar]);

    const alertas = useMemo(() => alertasDaFila(envios ?? [], agora), [envios, agora]);
    const resumo = useMemo(() => resumoDaFila(envios ?? [], agora), [envios, agora]);
    if (!ativa) return <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative uma empresa para ver a saúde do eSocial.</p>;

    const agir = async (rotulo: string, f: () => Promise<string>) => {
        setOcupado(rotulo); setErro(''); setMsg('');
        try { setMsg(await f()); } catch (e) { setErro(`${rotulo.replace(/…$/, '')}: ${(e as Error).message}`); } finally { setOcupado(''); carregar(); }
    };
    const consultarAgora = (e: Envio) => agir('Consultando o protocolo…', async () => {
        if (!usuario) throw new Error('entre com seu usuário.');
        const r = await consultarLote({ empresaId: ativa.id, cnpj: ativa.cnpj, protocolo: e.protocolo, tpAmb: e.tpAmb, certificado: e.certificado });
        await registrarConsulta(e, r, usuario);
        return r.situacao === 'em-processamento' ? `Protocolo ${e.protocolo}: ainda em processamento no eSocial.` : `Protocolo ${e.protocolo}: ${r.situacao}.`;
    });
    const consultarTodos = () => agir('Consultando os protocolos pendentes…', async () => {
        if (!usuario) throw new Error('entre com seu usuário.');
        const r = await rodadaDoVigia(ativa, usuario, Number.MAX_SAFE_INTEGER, 20);
        return r.consultados ? `${r.consultados} protocolo(s) consultado(s); ${r.mudaram} com resultado novo.${r.erro ? ` Falha em algum: ${r.erro}` : ''}` : 'Nenhum protocolo pendente para consultar.';
    });
    const conferir = (e: Envio) => agir('Conferindo no eSocial (download pelo Id)…', async () => {
        if (!usuario) throw new Error('entre com seu usuário.');
        const d = await baixarEventos(ativa.cnpj, e.eventos.map(x => x.id), e.certificado);
        const achados = recibosDoDownload(d.arquivos);
        const n = Object.keys(achados).length;
        await registrarVerificacao(e, achados, usuario);
        if (n === e.eventos.length) return `Todos os ${n} evento(s) estão no eSocial, com recibo: o lote ficou processado. Nada a reenviar.`;
        if (n) return `${n} de ${e.eventos.length} evento(s) estão no eSocial (recibos gravados). Os demais ainda não aparecem: aguarde e confira de novo.`;
        return `Nenhum evento do lote está no eSocial ainda. ${podeLiberar(e, Date.now()) ? 'Pode liberar o reenvio.' : `Confira de novo; o reenvio pode ser liberado ${Math.round(ESPERA_LIBERAR_MS / 60_000)} min depois do envio.`}`;
    });
    const liberar = (e: Envio) => agir('Liberando o reenvio…', async () => {
        if (!usuario) throw new Error('entre com seu usuário.');
        if (!window.confirm(`Liberar o reenvio de ${tipos(e)} (${e.eventos.length} evento(s))?\n\nSó libere se o lote não estiver no eSocial${e.tpAmb === 1 ? ' — confira antes em "Conferir no eSocial"' : ''}. O lote fica como "não recebido" e os eventos podem ser transmitidos de novo.`)) return '';
        await liberarReenvio(e, usuario);
        return 'Reenvio liberado: transmita os eventos de novo pela tela de origem.';
    });

    const porId = new Map((envios ?? []).map(e => [e.id, e]));
    const lista = (envios ?? []).filter(e => filtro === 'todos' || etapaDoEnvio(e, agora) === filtro).slice(0, 60);
    const acaoDoAlerta = (a: (typeof alertas)[number]) => {
        const e = porId.get(a.envioId);
        if (!e) return null;
        if (a.acao === 'verificar') return (
            <span className="flex flex-wrap gap-2">
                {e.tpAmb === 1 && <button className={btn} disabled={!!ocupado || !usuario} onClick={() => conferir(e)}>Conferir no eSocial</button>}
                <button className={btn} disabled={!!ocupado || !usuario || !podeLiberar(e, agora)} title={podeLiberar(e, agora) ? undefined : `Disponível ${Math.round(ESPERA_LIBERAR_MS / 60_000)} min depois do envio.`} onClick={() => liberar(e)}>Liberar reenvio</button>
            </span>
        );
        if (a.acao === 'consultar') return <button className={btn} disabled={!!ocupado || !usuario} onClick={() => consultarAgora(e)}>Consultar agora</button>;
        if (a.acao === 'corrigir') return <button className={btn} onClick={() => setAberto(e.id)}>Ver ocorrências</button>;
        return null;
    };

    return (
        <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Saúde do eSocial · {ativa.nome}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Cada lote fica registrado antes de sair e é acompanhado até o recibo. Os protocolos são consultados sozinhos enquanto o Consultor está aberto (15 s, 30 s, 1, 2, 5, 10 e a cada 30 min).
                        </p>
                    </div>
                    <button className={btn} disabled={!!ocupado || !usuario} onClick={consultarTodos}>Consultar pendentes agora</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {CARTOES.map(c => (
                        <button key={c.etapa} onClick={() => setFiltro(f => (f === c.etapa ? 'todos' : c.etapa))} aria-pressed={filtro === c.etapa}
                            className={`rounded-lg border p-3 text-left transition-colors ${filtro === c.etapa ? 'border-teal-500 ring-2 ring-teal-500/30' : 'border-slate-200 dark:border-slate-700'} bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800`}>
                            <span className="block text-2xl font-bold text-slate-900 dark:text-white">{resumo.porEtapa[c.etapa]}</span>
                            <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${COR[c.etapa]}`}>{ROTULO_ETAPA[c.etapa]}</span>
                            <span className="mt-1 block text-[11px] text-slate-500">{c.dica}</span>
                        </button>
                    ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">{resumo.eventos} evento(s) nos lotes: {resumo.aceitos} aceito(s), {resumo.recusados} recusado(s), {resumo.aguardando} sem resultado.</p>
            </section>

            {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{msg}</p>}
            {ocupado && <p className="text-sm text-slate-500">{ocupado}</p>}

            <section aria-label="Alertas" className="space-y-2">
                <h3 className="font-semibold text-slate-800 dark:text-white">Alertas {alertas.length > 0 && <span className="ml-1 rounded-full bg-amber-400 px-2 text-xs font-bold text-slate-900">{alertas.length}</span>}</h3>
                {envios && !alertas.length && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">✓ Nada parado nem sem resposta. Fila saudável.</p>}
                {alertas.map(a => (
                    <div key={`${a.envioId}-${a.titulo}`} className={`flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm ${a.gravidade === 'critico' ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
                        <div className="min-w-0 flex-1">
                            <p className={`font-medium ${a.gravidade === 'critico' ? 'text-red-900 dark:text-red-100' : 'text-amber-900 dark:text-amber-100'}`}>{a.gravidade === 'critico' ? '⛔' : '⚠️'} {a.titulo}</p>
                            <p className="text-slate-700 dark:text-slate-300">{a.detalhe}</p>
                        </div>
                        {acaoDoAlerta(a)}
                    </div>
                ))}
            </section>

            {envios && <AnomaliasEsocial empresa={{ id: ativa.id, cnpj: ativa.cnpj, nome: ativa.nome, competencia: ativa.competencia }} envios={envios} usuario={usuario} onMudou={carregar}
                onVerLote={id => { setFiltro('todos'); setAberto(id); }} />}

            <section aria-label="Lotes" className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-800 dark:text-white">Lotes {filtro !== 'todos' && `· ${ROTULO_ETAPA[filtro]}`}</h3>
                    {filtro !== 'todos' && <button className="text-sm text-blue-700 underline dark:text-blue-300" onClick={() => setFiltro('todos')}>Ver todos</button>}
                </div>
                {!envios && <p className="text-sm text-slate-500">Carregando…</p>}
                {envios?.length === 0 && <p className="rounded border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-600">Nenhum lote transmitido pelo Consultor nesta empresa.</p>}
                {lista.map(e => {
                    const etapa = etapaDoEnvio(e, agora);
                    const prox = proximaConsulta(e);
                    return (
                        <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR[etapa]}`}>{ROTULO_ETAPA[etapa]}</span>
                                <strong>{tipos(e)}</strong>
                                <span className="text-xs text-slate-500">{e.eventos.length} evento(s) · {ROTULO_AMBIENTE[e.tpAmb]} · {br(e.enviadoEm)} · {e.enviadoPorEmail}</span>
                                <button className={`${btn} ml-auto`} onClick={() => setAberto(aberto === e.id ? '' : e.id)}>{aberto === e.id ? 'Fechar' : 'Detalhes'}</button>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                                {e.protocolo ? `Protocolo ${e.protocolo}` : 'Sem protocolo'}
                                {e.consultas ? ` · ${e.consultas} consulta(s)` : ''}{e.consultadoEm ? ` · última ${br(e.consultadoEm)}` : ''}
                                {prox !== null && ` · próxima consulta ${emQuanto(prox - agora)}`}
                                {e.erroEnvio ? ` · falha do envio: ${e.erroEnvio}` : ''}
                                {e.verificadoPorEmail ? ` · conferido por ${e.verificadoPorEmail} em ${br(e.verificadoEm)}` : ''}
                            </p>
                            {aberto === e.id && (
                                <ul className="mt-2 space-y-1 text-xs">
                                    {e.ocorrencias.map(o => (
                                        <li key={`${o.codigo}${o.descricao}`} className="text-red-700 dark:text-red-300">Lote: {o.codigo} {o.descricao}
                                            {o.tipo !== 2 && <DiagnosticoOcorrencia ocorrencia={o} tipoEvento={e.eventos[0]?.tipo ?? ''} perApur={e.eventos[0]?.perApur ?? null} envio={e} empresa={{ id: ativa.id, cnpj: ativa.cnpj, nome: ativa.nome }} envios={envios ?? []} usuario={usuario} onMudou={carregar} />}
                                        </li>
                                    ))}
                                    {e.eventos.map(x => (
                                        <li key={x.id} className="rounded bg-slate-50 p-2 dark:bg-slate-900/40">
                                            <strong>{x.tipo}</strong> {x.perApur && `· ${x.perApur}`} · <span className="font-mono">{x.id}</span>
                                            {x.nrRecibo && aceito({ cdResposta: x.cdResposta ?? null, nrRecibo: x.nrRecibo }) && <span className="block text-green-700 dark:text-green-300">Recibo {x.nrRecibo}</span>}
                                            {x.cdResposta != null && !x.nrRecibo && <span className="block text-red-700 dark:text-red-300">{x.cdResposta} {x.descResposta}</span>}
                                            {x.ocorrencias?.map(o => (
                                                <span key={`${o.codigo}${o.localizacao}`} className="block text-slate-600 dark:text-slate-300">{o.tipo === 2 ? 'Advertência' : 'Erro'} {o.codigo}: {o.descricao}{o.localizacao ? ` (${o.localizacao})` : ''}
                                                    {o.tipo !== 2 && <DiagnosticoOcorrencia ocorrencia={o} tipoEvento={x.tipo} perApur={x.perApur} envio={e} empresa={{ id: ativa.id, cnpj: ativa.cnpj, nome: ativa.nome }} envios={envios ?? []} usuario={usuario} onMudou={carregar} />}
                                                </span>
                                            ))}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </section>

            <MonitorLeiaute />

            <section aria-label="Pré-voo" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                <h3 className="font-semibold text-slate-800 dark:text-white">Pré-voo: o que é conferido antes de qualquer envio</h3>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-700 dark:text-slate-300">
                    <li>XSD oficial do leiaute {ROTULO_VERSAO_XSD} (o mesmo do eSocial), com o erro explicado em português e o campo apontado.</li>
                    <li>O mesmo evento não sai duas vezes: Id já transmitido, ou o mesmo evento do trabalhador ainda sem resultado.</li>
                    <li>Competência fechada (S-1299 aceito) só recebe periódicos depois do S-1298.</li>
                    <li>O S-1299 espera todos os periódicos da competência; o S-1210 espera o S-1200 do trabalhador.</li>
                    <li>Retificação leva o recibo do evento original; lote com até 50 eventos de um grupo só, na empresa e no ambiente certos.</li>
                </ul>
                <p className="mt-2 text-xs text-slate-500">Bloqueio impede o envio e nada sai para o governo; aviso pede confirmação. Lote sem resposta nunca é reenviado às cegas: confira no eSocial ou libere depois de {Math.round(ESPERA_LIBERAR_MS / 60_000)} min.</p>
            </section>
        </div>
    );
};

export default SaudeEsocialPanel;
