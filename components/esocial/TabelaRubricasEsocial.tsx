// components/esocial/TabelaRubricasEsocial.tsx
//
// Cadastros › Incidências › S-1010 pelo Consultor: pedidos de inclusão, alteração (inclusive fim de validade) e
// exclusão de rubricas (services/esocial/tabelaRubricas.ts), gravados como rascunho, transmitidos em lote pelo
// pré-voo e, aceitos em produção, aplicados no cadastro da rubrica e no de/para da empresa.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { COD_INC_CP, COD_INC_FGTS, TP_RUBR, idRubrica, rotuloCodigo, rotuloIrrf, rubricaVazia, type DadosRubrica, type Rubrica } from '../../services/cadastros/rubricas';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { salvarParametrosEsocialFolha } from '../../services/empresas/empresasService';
import { parametrosVazios, type ParametrosEsocialFolha } from '../../services/esocial/eventosFolha';
import {
    MODELOS, NAT_RUBR, ROTULO_ACAO, aplicarPedido, dadosVigentes, gerarLoteS1010, modeloDaVerba, pedidoDaVerba, pedidoVazio, refPedidoS1010,
    resumoPedido, validarLote, validarPedido, type AcaoS1010, type PedidoS1010,
} from '../../services/esocial/tabelaRubricas';
import { aplicarPedidoS1010, descartarPedidoS1010, listarPedidosS1010, salvarPedidoS1010 } from '../../services/esocial/pedidosS1010Service';
import { ROTULO_AMBIENTE, consultarLote, type Certificado, type TpAmb } from '../../services/esocial/transmissao';
import { listarEnvios, registrarConsulta, type Envio } from '../../services/esocial/transmissaoService';
import { mensagemDaTransmissao, transmitirVerificado, verificarAntesDeEnviar } from '../../services/esocial/envioSeguro';
import { avisos as avisosDoPreVoo, bloqueios, textoAchados, type Achado } from '../../services/esocial/preVoo';
import { statusPorRef, type SituacaoEvento, type StatusEvento } from '../../services/esocial/statusEvento';
import AchadosPreVoo from './AchadosPreVoo';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const COR: Record<SituacaoEvento, string> = {
    'nao-enviado': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    iob: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    aguardando: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    aceito: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    recusado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};
const competenciaAtual = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7);
const editavel = (s: StatusEvento | undefined) => !s || s.situacao === 'nao-enviado' || s.situacao === 'recusado';

export interface InicioS1010 { acao: AcaoS1010; rubrica: Rubrica; competencia: string }

interface Props {
    empresa: Empresa;
    usuario: Usuario;
    rubricas: Rubrica[];
    /** Abre direto o editor (alteração ou exclusão de uma rubrica da lista de incidências). */
    inicio?: InicioS1010 | null;
    onFechar: () => void;
    /** Rubricas ou de/para mudaram no cadastro. */
    onAtualizado: (p?: ParametrosEsocialFolha) => void;
}

const TabelaRubricasEsocial: React.FC<Props> = ({ empresa, usuario, rubricas, inicio, onFechar, onAtualizado }) => {
    const [pedidos, setPedidos] = useState<PedidoS1010[] | null>(null);
    const [envios, setEnvios] = useState<Envio[] | null>(null);
    const [editando, setEditando] = useState<PedidoS1010 | null>(null);
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [certificado, setCertificado] = useState<Certificado>('escritorio');
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');
    const [achados, setAchados] = useState<Achado[]>([]);
    const [verba, setVerba] = useState('');
    const lido = useRef(empresa.esocialFolha);
    const [params, setParams] = useState<ParametrosEsocialFolha>(() => empresa.esocialFolha ?? parametrosVazios(empresa.cnpj));
    const comp = competenciaAtual();

    const carregar = () => {
        listarPedidosS1010(empresa.id).then(setPedidos).catch(e => { setPedidos([]); setErro(`Pedidos do S-1010 não carregados: ${mensagemErro(e)}`); });
        listarEnvios(empresa.id).then(setEnvios).catch(e => { setEnvios([]); setErro(`Envios não carregados: ${mensagemErro(e)}`); });
    };
    useEffect(carregar, [empresa.id]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!inicio) return;
        const v = dadosVigentes(inicio.rubrica, inicio.competencia);
        if (!v) return;
        setEditando({ ...pedidoVazio(empresa.id, inicio.acao), codRubr: inicio.rubrica.codRubr, ideTabRubr: inicio.rubrica.ideTabRubr, iniValid: v.iniValid, fimValid: v.fimValid, dados: inicio.acao === 'exclusao' ? null : { ...v.dados } });
    }, [inicio, empresa.id]);

    const status = useMemo(() => new Map((pedidos ?? []).filter(p => p.situacao === 'rascunho').map(p => [p.id, envios ? statusPorRef(refPedidoS1010(p.id), 'S-1010', envios) : undefined])), [pedidos, envios]);
    const ativos = (pedidos ?? []).filter(p => p.situacao === 'rascunho');
    const paraEnviar = ativos.filter(p => editavel(status.get(p.id)) && !validarPedido(p, rubricas).erros.length);
    const comErro = ativos.filter(p => editavel(status.get(p.id)) && validarPedido(p, rubricas).erros.length);
    const aceitos = ativos.filter(p => status.get(p.id)?.situacao === 'aceito');
    const errosLote = paraEnviar.length ? validarLote(paraEnviar) : [];
    const semDePara = useMemo(() => new Set(MODELOS.map(x => x.chave).filter(k => !params.rubricas[k])), [params]);

    function novaDaVerba() {
        const modelo = modeloDaVerba(verba);
        if (!modelo) return;
        setEditando(pedidoDaVerba(empresa.id, { chave: verba, descricao: modelo.dados.dscRubr, tipo: modelo.dados.tpRubr === '2' ? 'desconto' : 'provento' }, rubricas, comp));
    }

    async function salvar(p: PedidoS1010) {
        setOcupado('Gravando o pedido…'); setErro('');
        try { await salvarPedidoS1010(p, usuario); setEditando(null); setMsg('Pedido gravado como rascunho. Transmita quando estiver pronto.'); carregar(); }
        catch (e) { setErro(`Não foi possível gravar (${mensagemErro(e)}).`); }
        finally { setOcupado(''); }
    }

    async function descartar(p: PedidoS1010) {
        if (!window.confirm(`Descartar o pedido de ${ROTULO_ACAO[p.acao].toLowerCase()} da rubrica ${p.codRubr}?`)) return;
        try { await descartarPedidoS1010(p, usuario); carregar(); } catch (e) { setErro(mensagemErro(e)); }
    }

    async function transmitir() {
        if (!paraEnviar.length || errosLote.length) return;
        setErro(''); setMsg(''); setAchados([]);
        setOcupado('Conferindo antes de enviar (pré-voo: XSD oficial e ordem dos eventos)…');
        try {
            const emp = { id: empresa.id, cnpj: empresa.cnpj };
            const lote = gerarLoteS1010(empresa.cnpj, tpAmb, paraEnviar);
            const pv = await verificarAntesDeEnviar({ empresa: emp, eventos: lote.map(x => ({ xml: x.xml, nome: `S-1010 ${x.pedido.codRubr}`, ref: refPedidoS1010(x.pedido.id) })), tpAmb });
            setAchados(pv.achados);
            if (!pv.ok) { setErro(`O pré-voo barrou o envio (nada foi enviado):\n${textoAchados(bloqueios(pv.achados))}`); return; }
            const av = avisosDoPreVoo(pv.achados);
            if (!window.confirm(`Transmitir ${lote.length} S-1010 (tabela de rubricas) em ${ROTULO_AMBIENTE[tpAmb].toUpperCase()}?${tpAmb === 1 ? '\n\nEm produção, as incidências passam a valer para os totalizadores (INSS, IRRF e FGTS) dos eventos enviados depois.' : ''}${av.length ? `\n\nAvisos do pré-voo:\n${textoAchados(av)}` : ''}`)) return;
            setOcupado('Transmitindo o S-1010…');
            const t = await transmitirVerificado(pv, { empresa: emp, certificado, usuario });
            const m = mensagemDaTransmissao(t);
            if (m.ok) setMsg(m.texto); else setErro(m.texto);
            carregar();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    async function consultar(envio: Envio) {
        setErro(''); setOcupado('Consultando o retorno…');
        try {
            const x = await consultarLote({ empresaId: empresa.id, cnpj: empresa.cnpj, protocolo: envio.protocolo, tpAmb: envio.tpAmb, certificado: envio.certificado });
            await registrarConsulta(envio, x, usuario);
            if (x.situacao === 'em-processamento') setMsg('Ainda em processamento no eSocial. Consulte de novo em instantes.');
            carregar();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    /** Aceitos em produção: a rubrica no cadastro e, na inclusão de uma verba do Consultor, o de/para. */
    async function aplicarAceitos() {
        setErro(''); setOcupado('Atualizando a tabela de rubricas com os aceitos…');
        let p = params; let deParaMudou = false; let feitos = 0;
        // Do mais antigo ao mais novo, com o cadastro já atualizado pelo anterior (dois pedidos da mesma rubrica).
        const cadastro = new Map(rubricas.map(r => [r.id, r]));
        try {
            for (const ped of [...aceitos].reverse()) {
                const recibo = status.get(ped.id)?.recibo ?? '';
                const id = idRubrica(empresa.id, ped.ideTabRubr, ped.codRubr);
                const atual = cadastro.get(id);
                const nova = aplicarPedido(ped, atual, recibo) ?? { ...(atual ?? rubricaVazia()), id, empresaId: empresa.id, codRubr: ped.codRubr, ideTabRubr: ped.ideTabRubr, vigencias: [] };
                await aplicarPedidoS1010(ped, nova, atual, recibo, usuario);
                cadastro.set(id, nova);
                feitos++;
                if (ped.acao === 'inclusao' && ped.chaveVerba && !p.rubricas[ped.chaveVerba]) {
                    p = { ...p, rubricas: { ...p.rubricas, [ped.chaveVerba]: { codRubr: ped.codRubr, ideTabRubr: ped.ideTabRubr } } };
                    deParaMudou = true;
                }
            }
            if (deParaMudou) { await salvarParametrosEsocialFolha(empresa.id, p, lido.current); lido.current = p; setParams(p); }
            setMsg(`${feitos} rubrica(s) atualizada(s) no cadastro${deParaMudou ? ' e o de/para das verbas gravado na empresa' : ''}.`);
            onAtualizado(deParaMudou ? p : undefined);
        } catch (e) { setErro(`Parou depois de ${feitos} rubrica(s): ${mensagemErro(e)}`); }
        finally { setOcupado(''); carregar(); }
    }

    return (
        <div role="dialog" aria-modal="true" aria-label="S-1010 pelo Consultor" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-5xl space-y-3 rounded-xl bg-white p-4 text-sm shadow-xl dark:bg-slate-800 dark:text-slate-100">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Tabela de rubricas (S-1010) — {empresa.nomeFantasia}</h3>
                        <p className="text-slate-600 dark:text-slate-300">Inclusão, alteração (inclusive o fim da validade) e exclusão de rubricas pelo Consultor. O S-1010 vai antes do S-1200 e do S-2299 que usam a rubrica. As incidências são declaratórias: confira com a contabilidade antes de transmitir em produção.</p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>

                {!editando && (
                    <div className="flex flex-wrap items-end gap-2">
                        <label>Nova rubrica para uma verba do Consultor
                            <select aria-label="Verba do Consultor" className={`block ${inp}`} value={verba} onChange={e => setVerba(e.target.value)}>
                                <option value="">— escolha a verba —</option>
                                {MODELOS.map(x => <option key={x.chave} value={x.chave}>{x.chave.startsWith('RESC:') ? 'Rescisão: ' : ''}{x.dados.dscRubr}{semDePara.has(x.chave) ? ' (sem rubrica no de/para)' : ''}</option>)}
                            </select>
                        </label>
                        <button className={btn} disabled={!verba} onClick={novaDaVerba}>Montar pelo modelo</button>
                        <button className={btn} onClick={() => setEditando({ ...pedidoVazio(empresa.id), iniValid: comp })}>Nova rubrica em branco</button>
                    </div>
                )}

                {editando && <EditorPedido pedido={editando} rubricas={rubricas} competencia={comp} ocupado={!!ocupado} onCancelar={() => setEditando(null)} onSalvar={salvar} />}

                <div className="space-y-1">
                    <p className="font-medium">Pedidos</p>
                    {!pedidos && <p className="text-slate-500">Carregando…</p>}
                    {pedidos?.length === 0 && <p className="rounded border border-dashed border-slate-300 p-4 text-center text-slate-500 dark:border-slate-600">Nenhum pedido de S-1010 desta empresa.</p>}
                    {pedidos && pedidos.length > 0 && (
                        <div className="max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full">
                                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Rubrica</th><th className="p-2">Pedido</th><th className="p-2">Situação</th><th className="p-2" /></tr></thead>
                                <tbody>{pedidos.map(p => {
                                    const s = status.get(p.id);
                                    const conf = p.situacao === 'rascunho' && editavel(s) ? validarPedido(p, rubricas) : null;
                                    return (
                                        <tr key={p.id} className="border-t border-slate-100 align-top dark:border-slate-700">
                                            <td className="p-2"><span className="font-mono">{p.codRubr}</span> <span className="text-xs text-slate-500">({p.ideTabRubr})</span><span className="block text-xs">{ROTULO_ACAO[p.acao]}</span></td>
                                            <td className="p-2 text-xs">{resumoPedido(p)}{p.chaveVerba && <span className="block text-slate-500">verba do Consultor: {p.chaveVerba}</span>}
                                                {conf && conf.erros.length > 0 && <ul className="mt-1 list-disc pl-4 text-red-700 dark:text-red-300">{conf.erros.map(x => <li key={x}>{x}</li>)}</ul>}
                                            </td>
                                            <td className="p-2 text-xs">
                                                {p.situacao === 'aplicado' && <span className={`rounded-full px-2 py-0.5 ${COR.aceito}`}>Aplicado · recibo {p.recibo}</span>}
                                                {p.situacao === 'descartado' && <span className={`rounded-full px-2 py-0.5 ${COR['nao-enviado']}`}>Descartado</span>}
                                                {p.situacao === 'rascunho' && (s ? <><span className={`rounded-full px-2 py-0.5 ${COR[s.situacao]}`}>{s.rotulo}</span><span className="mt-1 block text-slate-500">{s.detalhe}</span>{s.teste && <span className="block text-slate-500">Produção restrita: {s.teste.rotulo.toLowerCase()} · {s.teste.detalhe}</span>}</> : <span className="text-slate-400">carregando…</span>)}
                                            </td>
                                            <td className="space-y-1 p-2 text-right text-xs">
                                                {p.situacao === 'rascunho' && editavel(s) && <>
                                                    <button className="block w-full text-blue-700 underline dark:text-blue-300" onClick={() => setEditando(p)}>Editar</button>
                                                    <button className="block w-full text-red-700 underline dark:text-red-300" onClick={() => descartar(p)}>Descartar</button>
                                                </>}
                                                {s?.situacao === 'aguardando' && s.envio?.protocolo && <button className="block w-full text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!!ocupado} onClick={() => consultar(s.envio!)}>Consultar retorno</button>}
                                            </td>
                                        </tr>
                                    );
                                })}</tbody>
                            </table>
                        </div>
                    )}
                </div>

                {aceitos.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded bg-green-50 p-2 dark:bg-green-900/30">
                        <span>{aceitos.length} S-1010 aceito(s) em produção ainda fora do cadastro.</span>
                        <button className="rounded bg-green-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!!ocupado} onClick={aplicarAceitos}>Atualizar a tabela de rubricas</button>
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                    <label>Ambiente<select aria-label="Ambiente do S-1010" className={`block ${inp}`} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}>
                        <option value={2}>{ROTULO_AMBIENTE[2]}</option><option value={1}>{ROTULO_AMBIENTE[1]}</option></select></label>
                    <label>Certificado<select aria-label="Certificado do S-1010" className={`block ${inp}`} value={certificado} onChange={e => setCertificado(e.target.value as Certificado)}>
                        <option value="escritorio">Certificado do escritório (procurador)</option><option value="empresa">Certificado da empresa</option></select></label>
                    <button className="rounded bg-green-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!paraEnviar.length || errosLote.length > 0 || !!ocupado || !!editando} onClick={transmitir}>Transmitir {paraEnviar.length} S-1010</button>
                    {comErro.length > 0 && <span className="text-amber-700 dark:text-amber-300">{comErro.length} pedido(s) com erro ficam de fora.</span>}
                </div>
                {errosLote.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{errosLote.map(x => <li key={x}>{x}</li>)}</ul>}
                {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="whitespace-pre-line text-red-700 dark:text-red-300">{erro}</p>}
                <AchadosPreVoo achados={achados} />
                {msg && <p role="status" className="text-green-700 dark:text-green-300">{msg}</p>}
            </div>
        </div>
    );
};

const EditorPedido: React.FC<{ pedido: PedidoS1010; rubricas: Rubrica[]; competencia: string; ocupado: boolean; onCancelar: () => void; onSalvar: (p: PedidoS1010) => void }> = ({ pedido, rubricas, competencia, ocupado, onCancelar, onSalvar }) => {
    const [p, setP] = useState<PedidoS1010>(pedido);
    useEffect(() => setP(pedido), [pedido]);
    const conf = validarPedido(p, rubricas, competencia);
    const existente = rubricas.find(r => r.ideTabRubr === p.ideTabRubr && r.codRubr === p.codRubr);
    const setD = (k: keyof DadosRubrica, v: string) => setP(x => ({ ...x, dados: { ...(x.dados ?? pedidoVazio(x.empresaId).dados!), [k]: v } }));
    const modelo = p.chaveVerba ? modeloDaVerba(p.chaveVerba) : undefined;

    function escolherRubrica(chave: string) {
        const r = rubricas.find(x => `${x.ideTabRubr}|${x.codRubr}` === chave);
        if (!r) { setP(x => ({ ...x, codRubr: '', ideTabRubr: '' })); return; }
        const v = dadosVigentes(r, competencia);
        setP(x => ({ ...x, codRubr: r.codRubr, ideTabRubr: r.ideTabRubr, iniValid: v?.iniValid ?? '', fimValid: v?.fimValid ?? '', dados: x.acao === 'exclusao' ? null : v ? { ...v.dados } : x.dados }));
    }
    function escolherVigencia(ini: string) {
        const v = existente?.vigencias.find(x => x.iniValid === ini);
        setP(x => ({ ...x, iniValid: ini, fimValid: v?.fimValid ?? '', dados: x.acao === 'exclusao' ? null : v ? { ...v.dados } : x.dados }));
    }
    function mudarAcao(acao: AcaoS1010) {
        setP(x => ({ ...x, acao, novaIniValid: '', novaFimValid: '', dados: acao === 'exclusao' ? null : x.dados ?? pedidoVazio(x.empresaId).dados }));
    }

    return (
        <div className="space-y-2 rounded border border-blue-200 bg-blue-50/40 p-3 dark:border-blue-900 dark:bg-blue-900/10">
            <div className="grid gap-2 sm:grid-cols-4">
                <label>Operação<select aria-label="Operação do S-1010" className={`block w-full ${inp}`} value={p.acao} onChange={e => mudarAcao(e.target.value as AcaoS1010)} disabled={!!p.id}>
                    {(['inclusao', 'alteracao', 'exclusao'] as const).map(a => <option key={a} value={a}>{ROTULO_ACAO[a]}</option>)}</select></label>
                {p.acao === 'inclusao' ? <>
                    <label>Código da rubrica<input aria-label="Código da rubrica" maxLength={30} className={`block w-full font-mono ${inp}`} value={p.codRubr} onChange={e => setP(x => ({ ...x, codRubr: e.target.value }))} /></label>
                    <label>Tabela (ideTabRubr)<input aria-label="Tabela da rubrica" maxLength={8} className={`block w-full font-mono ${inp}`} value={p.ideTabRubr} onChange={e => setP(x => ({ ...x, ideTabRubr: e.target.value }))} /></label>
                    <label>Início da validade<input aria-label="Início da validade" type="month" className={`block w-full ${inp}`} value={p.iniValid} onChange={e => setP(x => ({ ...x, iniValid: e.target.value }))} /></label>
                </> : <>
                    <label className="sm:col-span-2">Rubrica<select aria-label="Rubrica a mudar" className={`block w-full ${inp}`} value={existente ? `${existente.ideTabRubr}|${existente.codRubr}` : ''} onChange={e => escolherRubrica(e.target.value)}>
                        <option value="">— escolha —</option>
                        {rubricas.filter(r => r.vigencias.length).map(r => <option key={r.id} value={`${r.ideTabRubr}|${r.codRubr}`}>{r.codRubr} ({r.ideTabRubr}) · {r.vigencias[r.vigencias.length - 1].dados.dscRubr}</option>)}
                    </select></label>
                    <label>Vigência<select aria-label="Vigência a mudar" className={`block w-full ${inp}`} value={p.iniValid} onChange={e => escolherVigencia(e.target.value)}>
                        <option value="">—</option>
                        {(existente?.vigencias ?? []).map(v => <option key={v.iniValid} value={v.iniValid}>{v.iniValid}{v.fimValid ? ` a ${v.fimValid}` : ' em diante'}</option>)}
                    </select></label>
                </>}
            </div>
            {p.acao === 'inclusao' && <label className="block">Fim da validade (opcional)<input aria-label="Fim da validade" type="month" className={`ml-2 ${inp}`} value={p.fimValid} onChange={e => setP(x => ({ ...x, fimValid: e.target.value }))} /></label>}
            {p.acao === 'alteracao' && (
                <div className="flex flex-wrap items-end gap-2">
                    <span className="text-slate-600 dark:text-slate-300">Nova validade (só para mudar o período; para encerrar a rubrica, repita o início e informe o fim):</span>
                    <label>Novo início<input aria-label="Novo início da validade" type="month" className={`block ${inp}`} value={p.novaIniValid} onChange={e => setP(x => ({ ...x, novaIniValid: e.target.value }))} /></label>
                    <label>Novo fim<input aria-label="Novo fim da validade" type="month" className={`block ${inp}`} value={p.novaFimValid} onChange={e => setP(x => ({ ...x, novaFimValid: e.target.value }))} /></label>
                </div>
            )}
            {p.dados && (
                <div className="grid gap-2 sm:grid-cols-3">
                    <label className="sm:col-span-2">Descrição<input aria-label="Descrição da rubrica" maxLength={100} className={`block w-full ${inp}`} value={p.dados.dscRubr} onChange={e => setD('dscRubr', e.target.value)} /></label>
                    <label>Natureza (Tabela 03)<input aria-label="Natureza da rubrica" maxLength={4} className={`block w-full font-mono ${inp}`} value={p.dados.natRubr} onChange={e => setD('natRubr', e.target.value.replace(/\D/g, ''))} />
                        <span className="text-xs text-slate-500">{NAT_RUBR[p.dados.natRubr] ?? (p.dados.natRubr.length === 4 ? 'conferir na Tabela 03' : '')}</span></label>
                    <label>Tipo<select aria-label="Tipo da rubrica" className={`block w-full ${inp}`} value={p.dados.tpRubr} onChange={e => setD('tpRubr', e.target.value)}>
                        {Object.entries(TP_RUBR).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}</select></label>
                    <label>INSS (codIncCP)<select aria-label="Incidência do INSS" className={`block w-full ${inp}`} value={p.dados.codIncCP} onChange={e => setD('codIncCP', e.target.value)}>
                        {Object.keys(COD_INC_CP).map(k => <option key={k} value={k}>{rotuloCodigo(COD_INC_CP, k, 'tabela')}</option>)}</select></label>
                    <label>FGTS (codIncFGTS)<select aria-label="Incidência do FGTS" className={`block w-full ${inp}`} value={p.dados.codIncFGTS} onChange={e => setD('codIncFGTS', e.target.value)}>
                        {Object.keys(COD_INC_FGTS).map(k => <option key={k} value={k}>{rotuloCodigo(COD_INC_FGTS, k, 'tabela')}</option>)}</select></label>
                    <label>IRRF (codIncIRRF, Tabela 21)<input aria-label="Incidência do IRRF" maxLength={4} className={`block w-full font-mono ${inp}`} value={p.dados.codIncIRRF} onChange={e => setD('codIncIRRF', e.target.value.replace(/\D/g, ''))} />
                        <span className="text-xs text-slate-500">{rotuloIrrf(p.dados.codIncIRRF)}</span></label>
                    <label className="sm:col-span-2">Observação (opcional)<input aria-label="Observação da rubrica" maxLength={255} className={`block w-full ${inp}`} value={p.dados.observacao} onChange={e => setD('observacao', e.target.value)} /></label>
                </div>
            )}
            {modelo?.nota && <p role="note" className="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{modelo.nota}</p>}
            {conf.erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{conf.erros.map(x => <li key={x}>{x}</li>)}</ul>}
            {conf.avisos.length > 0 && <ul className="list-disc pl-6 text-amber-900 dark:text-amber-100">{conf.avisos.map(x => <li key={x}>{x}</li>)}</ul>}
            <div className="flex justify-end gap-2">
                <button className={btn} onClick={onCancelar}>Cancelar</button>
                <button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={ocupado || conf.erros.length > 0} onClick={() => onSalvar(p)}>Gravar rascunho</button>
            </div>
        </div>
    );
};

export default TabelaRubricasEsocial;
