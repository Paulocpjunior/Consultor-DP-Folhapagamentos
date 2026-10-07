// components/esocial/EventosFolhaModal.tsx
//
// Cálculo (mensal) › "S-1200 e S-1210": o Consultor gera a remuneração e o
// pagamento de cada trabalhador a partir da folha calculada, com o de/para
// das verbas com as rubricas do S-1010, e transmite pelo CFI (assinatura com
// o A1 do cofre), como o S-2230. O S-1210 vai depois que o S-1200 for aceito.
// Retificação em produção, nesta ordem: 1. excluir o S-1210 aceito no mês
// (S-3000); 2. S-1200 retificador; 3. S-1210 com todos os pagamentos do mês.

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import { vigenciaEm, type Rubrica } from '../../services/cadastros/rubricas';
import { listarRubricas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { salvarParametrosEsocialFolha } from '../../services/empresas/empresasService';
import { emLotes, gerarEventosFolha, parametrosVazios, sugerirDePara, type ParametrosEsocialFolha, type RubricaEsocial } from '../../services/esocial/eventosFolha';
import { ROTULO_AMBIENTE, consultarLote, enviarLote, type Certificado, type TpAmb } from '../../services/esocial/transmissao';
import { listarEnvios, registrarConsulta, registrarEnvio, resumoEnvio, type Envio } from '../../services/esocial/transmissaoService';
import { exclusoesDosEnvios, lerRecibosArquivos, recibosDosEnvios, recibosVigentes, type ReciboEvento } from '../../services/esocial/recibosEsocial';
import { baixarBytes, gerarZip } from '../../services/implantacao/zip';
import { reais } from '../../services/cadastros/documentos';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const comp = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const chaveRub = (r: RubricaEsocial) => `${r.ideTabRubr}|${r.codRubr}`;

interface Props {
    empresa: Empresa;
    competencia: string;
    fichas: FichaFuncionario[];
    resultados: ResultadoCalculo[];
    dataSugerida: string;
    usuario: Usuario;
    onFechar: () => void;
    onParametrosSalvos?: (p: ParametrosEsocialFolha) => void;
}

const EventosFolhaModal: React.FC<Props> = ({ empresa, competencia, fichas, resultados, dataSugerida, usuario, onFechar, onParametrosSalvos }) => {
    const [gravados, setGravados] = useState<ParametrosEsocialFolha>(() => empresa.esocialFolha ?? parametrosVazios(empresa.cnpj));
    const [params, setParams] = useState<ParametrosEsocialFolha>(gravados);
    const [rubricas, setRubricas] = useState<Rubrica[] | null>(null);
    const [data, setData] = useState(dataSugerida);
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [certificado, setCertificado] = useState<Certificado>('escritorio');
    const [confirmoProducao, setConfirmoProducao] = useState(false);
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');
    const [enviados, setEnviados] = useState<string[]>([]);
    // Retificação: recibos dos eventos já aceitos (envios do Consultor e download do eSocial com o que o IOB transmitiu).
    const [envios, setEnvios] = useState<Envio[]>([]);
    const [meusEnvios, setMeusEnvios] = useState<string[]>([]);
    const [recibosArquivo, setRecibosArquivo] = useState<ReciboEvento[]>([]);
    const [lendoRecibos, setLendoRecibos] = useState(false);

    useEffect(() => {
        let vivo = true;
        listarRubricas(empresa.id).then(r => { if (vivo) setRubricas(r); }).catch(e => { if (vivo) { setRubricas([]); setErro(`Rubricas (S-1010) não carregadas: ${mensagemErro(e)}`); } });
        return () => { vivo = false; };
    }, [empresa.id]);

    const dePara = useMemo(() => (rubricas ? sugerirDePara(resultados.filter(r => r.situacao === 'calculado'), rubricas, competencia) : []), [rubricas, resultados, competencia]);
    // Vazio no de/para gravado = a sugestão entra até a equipe gravar.
    const efetivos = useMemo<ParametrosEsocialFolha>(() => {
        const r = { ...params.rubricas };
        for (const i of dePara) if (!r[i.chave] && i.sugestao) r[i.chave] = i.sugestao;
        return { ...params, rubricas: r };
    }, [params, dePara]);
    useEffect(() => {
        let vivo = true;
        listarEnvios(empresa.id).then(e => { if (vivo) setEnvios(e); }).catch(() => { /* sem envios: nada a retificar por eles */ });
        return () => { vivo = false; };
    }, [empresa.id]);
    const recibosConsultor = useMemo(() => recibosDosEnvios(envios, fichas), [envios, fichas]);
    const exclusoes = useMemo(() => exclusoesDosEnvios(envios), [envios]);
    // A retificação vale para produção: na produção restrita os eventos vão sempre como originais.
    const retificacao = useMemo(() => {
        if (tpAmb !== 1) return undefined;
        const todos = [...recibosConsultor, ...recibosArquivo];
        return { s1200: recibosVigentes(todos, 'S-1200', competencia, exclusoes), s1210: recibosVigentes(todos, 'S-1210', data.slice(0, 7), exclusoes) };
    }, [tpAmb, recibosConsultor, recibosArquivo, exclusoes, competencia, data]);
    async function lerRecibos(arquivos: File[]) {
        if (!arquivos.length) return;
        setLendoRecibos(true); setErro('');
        try {
            const r = await lerRecibosArquivos(await Promise.all(arquivos.map(async f => ({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))), empresa.cnpj);
            setRecibosArquivo(r);
            setMsg(r.length ? `${r.length} evento(s) aceito(s) lido(s) do arquivo (S-1200 e S-1210 com recibo).` : 'Nenhum S-1200 ou S-1210 com recibo nos arquivos.');
        } catch (e) { setErro(`Não foi possível ler os arquivos: ${(e as Error).message}`); }
        finally { setLendoRecibos(false); }
    }
    const geracao = useMemo(() => (rubricas ? gerarEventosFolha({ cnpj: empresa.cnpj, tpAmb, competencia, dataPagamento: data, fichas, resultados, rubricas, parametros: efetivos, retificacao }) : null), [rubricas, empresa.cnpj, tpAmb, competencia, data, fichas, resultados, efetivos, retificacao]);
    const prontos = geracao?.trabalhadores.filter(t => t.s1200) ?? [];
    const aExcluir = prontos.filter(t => t.exclusao1210);
    const comErro = geracao?.trabalhadores.filter(t => !t.s1200) ?? [];
    const naoGravado = JSON.stringify(efetivos) !== JSON.stringify(gravados);
    const opcoes = useMemo(() => (rubricas ?? []).map(r => ({ r, v: vigenciaEm(r, competencia) })).filter(x => x.v)
        .sort((a, b) => a.r.codRubr.localeCompare(b.r.codRubr, 'pt-BR', { numeric: true })), [rubricas, competencia]);

    async function gravar() {
        setOcupado('Gravando…'); setErro('');
        try { await salvarParametrosEsocialFolha(empresa.id, efetivos); setGravados(efetivos); setParams(efetivos); onParametrosSalvos?.(efetivos); setMsg('Parâmetros e de/para gravados na empresa.'); }
        catch (e) { setErro(`Não foi possível gravar (${mensagemErro(e)}).`); }
        finally { setOcupado(''); }
    }

    function baixar() {
        const arquivos = prontos.flatMap(t => [{ nome: `S-1200_${t.cpf}_${competencia}.xml`, conteudo: t.s1200!.xml }, { nome: `S-1210_${t.cpf}_${data.slice(0, 7)}.xml`, conteudo: t.s1210!.xml }]);
        baixarBytes(`eventos-folha-${empresa.codigoSage || 'empresa'}-${competencia}.zip`, gerarZip(arquivos), 'application/zip');
        setMsg(`${arquivos.length} XML(s) baixados (sem assinatura: para conferência; a transmissão assina pelo CFI).`);
    }

    async function transmitir(tipo: 'S-3000' | 'S-1200' | 'S-1210') {
        const eventos = tipo === 'S-3000'
            ? aExcluir.map(t => ({ ev: t.exclusao1210!, fichaId: `exclui:${t.existente1210!.nrRecibo}` }))
            : prontos.map(t => ({ ev: tipo === 'S-1200' ? t.s1200! : t.s1210!, fichaId: t.fichaIds[0] }));
        const aviso = tipo === 'S-3000'
            ? `\n\nO S-1210 de ${comp(data.slice(0, 7))} desses trabalhadores sai do eSocial e volta no passo 3 com todos os pagamentos do mês. Antes do envio, baixa uma cópia dos S-1210 excluídos: guarde-a até o passo 3.`
            : tipo === 'S-1210' ? '\n\nTransmita o S-1210 só depois que o S-1200 da competência for aceito ("Consultar resultado").' : '';
        const titulo = tipo === 'S-3000' ? `a exclusão (S-3000) de ${eventos.length} S-1210` : `${eventos.length} ${tipo} da competência ${comp(competencia)}`;
        if (!window.confirm(`Transmitir ${titulo} em ${ROTULO_AMBIENTE[tpAmb]}?${aviso}`)) return;
        if (tipo === 'S-3000') {
            const copias = aExcluir.filter(t => t.existente1210?.xmlOrigem).map(t => ({ nome: `S-1210_${t.cpf}_${t.existente1210!.nrRecibo}.xml`, conteudo: `<?xml version="1.0" encoding="UTF-8"?><copiaS1210>${t.existente1210!.xmlOrigem}</copiaS1210>` }));
            if (copias.length) baixarBytes(`S-1210-antes-da-exclusao-${empresa.codigoSage || 'empresa'}-${data.slice(0, 7)}.zip`, gerarZip(copias), 'application/zip');
        }
        setOcupado(`Transmitindo ${tipo}…`); setErro(''); setMsg('');
        const protocolos: string[] = [];
        try {
            for (const lote of emLotes(eventos)) {
                const r = await enviarLote({ empresaId: empresa.id, cnpj: empresa.cnpj, eventos: lote.map(x => x.ev.xml), tpAmb, certificado, ...(tpAmb === 1 ? { confirmoProducao: true } : {}) });
                const id = await registrarEnvio({ empresaId: empresa.id, cnpj: empresa.cnpj, certificado, retorno: r, refs: Object.fromEntries(lote.map(x => [x.ev.id, x.fichaId])) }, usuario);
                if (r.recebido) setMeusEnvios(x => [...x, id]);
                protocolos.push(r.recebido ? `${tipo}: lote recebido, protocolo ${r.protocolo}` : `${tipo}: lote recusado (${r.cdResposta ?? ''} ${r.descResposta})`);
            }
            setEnviados(x => [...x, ...protocolos]);
            setMsg('Envio registrado. Aguarde alguns instantes e clique em "Consultar resultado".');
        } catch (e) { setErro(`${tipo}: ${(e as Error).message}`); if (protocolos.length) setEnviados(x => [...x, ...protocolos]); }
        finally { setOcupado(''); }
    }

    /** Consulta os lotes enviados nesta tela e relê os envios (recibos e exclusões aceitas). */
    async function consultar() {
        setOcupado('Consultando o resultado…'); setErro(''); setMsg('');
        try {
            const atuais = await listarEnvios(empresa.id);
            const linhas: string[] = []; let aguardando = false;
            for (const e of atuais.filter(x => meusEnvios.includes(x.id) && (x.situacao === 'enviado' || x.situacao === 'em-processamento'))) {
                const r = await consultarLote({ empresaId: empresa.id, cnpj: empresa.cnpj, protocolo: e.protocolo, tpAmb: e.tpAmb, certificado: e.certificado });
                await registrarConsulta(e, r, usuario);
                if (r.situacao === 'em-processamento') { aguardando = true; continue; }
                const n = resumoEnvio({ eventos: r.eventos.map(x => ({ id: x.id, tipo: '', perApur: null, cdResposta: x.cdResposta, nrRecibo: x.nrRecibo })) });
                const ocorr = r.eventos.filter(x => !(x.nrRecibo && (x.cdResposta === 201 || x.cdResposta === 202))).flatMap(x => x.ocorrencias.map(o => `${o.codigo} ${o.descricao}`)).slice(0, 5);
                linhas.push(`Protocolo ${e.protocolo}: ${n.aceitos} aceito(s), ${n.recusados} recusado(s)${ocorr.length ? ` — ${ocorr.join('; ')}` : ''}`);
            }
            setEnvios(await listarEnvios(empresa.id));
            if (linhas.length) setEnviados(x => [...x, ...linhas]);
            setMsg(aguardando ? 'Ainda em processamento no eSocial: consulte de novo em instantes.' : 'Resultado consultado e recibos atualizados.');
        } catch (e) { setErro(`Consulta: ${(e as Error).message}`); }
        finally { setOcupado(''); }
    }

    const setRub = (chave: string, valor: string) => setParams(p => {
        const r = { ...p.rubricas };
        const achada = opcoes.find(o => chaveRub(o.r) === valor);
        if (achada) r[chave] = { codRubr: achada.r.codRubr, ideTabRubr: achada.r.ideTabRubr }; else delete r[chave];
        return { ...p, rubricas: r };
    });
    const podeTransmitir = !!prontos.length && !naoGravado && !ocupado && (tpAmb === 2 || confirmoProducao);
    // Enquanto houver S-1210 aceito a excluir, o S-1200 retificador e o S-1210 esperam (o eSocial recusaria).
    const esperaExclusao = aExcluir.length > 0;
    return (
        <div role="dialog" aria-label="S-1200 e S-1210" className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4">
            <div className="w-full max-w-5xl space-y-3 rounded-lg bg-white p-4 text-sm shadow-xl dark:bg-slate-800 dark:text-slate-100">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h3 className="text-lg font-semibold">S-1200 e S-1210 · {comp(competencia)}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{empresa.nomeFantasia || empresa.razaoSocial} · remuneração (S-1200) e pagamento (S-1210) pela folha calculada, leiaute S-1.3. A assinatura e o envio são pelo CFI, com o A1 do cofre.</p>
                    </div>
                    <button className="text-slate-500" aria-label="Fechar" onClick={onFechar}>✕</button>
                </div>

                <section className="grid gap-2 rounded border border-slate-200 p-2 text-xs sm:grid-cols-4 dark:border-slate-700">
                    <label>CNPJ do estabelecimento<input aria-label="CNPJ do estabelecimento" className={`block w-full ${inp}`} value={params.nrInscEstab} onChange={e => setParams(p => ({ ...p, nrInscEstab: e.target.value.replace(/\D/g, '').slice(0, 14) }))} /></label>
                    <label>Código da lotação (S-1020)<input aria-label="Código da lotação" className={`block w-full ${inp}`} maxLength={30} value={params.codLotacao} onChange={e => setParams(p => ({ ...p, codLotacao: e.target.value }))} /></label>
                    <label>Data do pagamento<input aria-label="Data do pagamento" type="date" className={`block w-full ${inp}`} value={data} onChange={e => setData(e.target.value)} /></label>
                    <p className="self-end text-slate-500">O S-1210 vai no mês do pagamento ({data ? comp(data.slice(0, 7)) : '—'}).</p>
                </section>

                <section className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">De/para das verbas com as rubricas do S-1010</p>
                        <button className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-50" disabled={!naoGravado || !!ocupado} onClick={gravar}>{naoGravado ? 'Gravar parâmetros e de/para' : 'Gravado'}</button>
                    </div>
                    {rubricas && !rubricas.length && <p role="note" className="rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">A empresa não tem rubricas do S-1010 no Consultor. Importe em Cadastros › Incidências (pelo download do eSocial) antes de gerar.</p>}
                    <div className="max-h-64 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900"><tr><th className="p-1">Verba do cálculo</th><th className="p-1">Tipo</th><th className="p-1">Rubrica do S-1010</th></tr></thead>
                            <tbody>{dePara.map(i => {
                                const atual = efetivos.rubricas[i.chave];
                                const sugerida = !params.rubricas[i.chave] && !!i.sugestao;
                                return (
                                    <tr key={i.chave} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className="p-1">{i.descricao}</td><td className="p-1">{i.tipo}</td>
                                        <td className="p-1">
                                            <select aria-label={`Rubrica de ${i.descricao}`} className={inp} value={atual ? chaveRub(atual) : ''} onChange={e => setRub(i.chave, e.target.value)}>
                                                <option value="">— escolha —</option>
                                                {opcoes.map(o => <option key={chaveRub(o.r)} value={chaveRub(o.r)}>{o.r.codRubr} · {o.v!.dados.dscRubr} (natureza {o.v!.dados.natRubr}, {o.v!.dados.tpRubr === '1' ? 'provento' : o.v!.dados.tpRubr === '2' ? 'desconto' : 'informativa'})</option>)}
                                            </select>
                                            {sugerida && <span className="ml-1 text-amber-700 dark:text-amber-300">sugerida</span>}
                                        </td>
                                    </tr>
                                );
                            })}</tbody>
                        </table>
                    </div>
                </section>

                {geracao?.erros.length ? <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">{geracao.erros.map(e => <li key={e}>{e}</li>)}</ul> : null}
                <section aria-label="Retificação" className="space-y-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
                    <p className="font-medium">Eventos já aceitos no eSocial (retificação)</p>
                    <p className="text-slate-500">Em produção, quem já tem S-1200 aceito na competência vai como <strong>retificação</strong> (com o recibo do que está valendo e o mesmo demonstrativo). O S-1210 é um só por trabalhador e mês e aponta para o S-1200: se já há um aceito no mês do pagamento, ele é <strong>excluído</strong> (passo 1) e volta no passo 3 com todos os pagamentos do mês (os que não são desta folha vêm do download). Os envios do Consultor entram sozinhos; o que o IOB transmitiu vem do .zip do eSocial › Download de eventos (empregador: S-1200 da competência e S-1210 do mês do pagamento). Se a competência já foi fechada (S-1299), transmita antes a reabertura (S-1298) em eSocial › Transmissão.</p>
                    <label className="block">S-1200/S-1210 já transmitidos (.zip ou .xml do download)
                        <input aria-label="Eventos já transmitidos" type="file" accept=".zip,.xml" multiple disabled={lendoRecibos} className="block text-xs" onChange={e => lerRecibos(Array.from(e.target.files ?? []))} /></label>
                    {tpAmb !== 1 && <p className="text-slate-500">Na produção restrita os eventos vão como originais.</p>}
                    {geracao && tpAmb === 1 && (() => {
                        const r1200 = geracao.trabalhadores.filter(t => t.retifica1200).length; const r1210 = geracao.trabalhadores.filter(t => t.existente1210).length;
                        return <p><strong>{r1200}</strong> S-1200 vão como retificação e <strong>{r1210}</strong> S-1210 aceito(s) no mês voltam com todos os pagamentos ({aExcluir.length} a excluir no passo 1); os demais, como originais.{recibosConsultor.length + recibosArquivo.length === 0 ? ' Nenhum recibo carregado ainda.' : ''}</p>;
                    })()}
                    {geracao && tpAmb === 1 && geracao.trabalhadores.some(t => t.retifica1200 || t.existente1210) && (
                        <ul className="max-h-28 list-disc overflow-auto pl-5">
                            {geracao.trabalhadores.filter(t => t.retifica1200 || t.existente1210).map(t => (
                                <li key={t.cpf}>{t.nome}: {t.retifica1200 ? `S-1200 retifica ${t.retifica1200.nrRecibo} (${t.retifica1200.origem})` : 'S-1200 original'}; {t.existente1210
                                    ? `S-1210 ${t.existente1210.nrRecibo} ${t.existente1210.excluidoEm ? 'já excluído' : 'a excluir'}, volta${t.outrosPagamentos ? ` com mais ${t.outrosPagamentos} pagamento(s) que não são desta folha` : ''}`
                                    : 'S-1210 original'}</li>
                            ))}
                        </ul>
                    )}
                </section>

                {geracao && !geracao.erros.length && (
                    <section className="space-y-1 text-xs">
                        <p><strong>{prontos.length}</strong> trabalhador(es) com S-1200 e S-1210 prontos{comErro.length ? `, ${comErro.length} com pendência (sem evento)` : ''} · líquido {reais(prontos.reduce((s, t) => s + t.liquido, 0))}</p>
                        {(comErro.length > 0 || prontos.some(t => t.avisos.length)) && (
                            <ul className="list-disc rounded border border-amber-200 p-2 pl-6 text-amber-900 dark:border-amber-800 dark:text-amber-100">
                                {comErro.map(t => <li key={t.cpf}><strong>{t.nome}</strong>: {t.erros.join(' ')}</li>)}
                                {prontos.filter(t => t.avisos.length).map(t => <li key={`a${t.cpf}`}><strong>{t.nome}</strong>: {t.avisos.join(' ')}</li>)}
                            </ul>
                        )}
                    </section>
                )}

                <section className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2 text-xs dark:border-slate-700">
                    <label>Ambiente<select aria-label="Ambiente" className={`block ${inp}`} value={tpAmb} onChange={e => { setTpAmb(Number(e.target.value) as TpAmb); setConfirmoProducao(false); }}>
                        <option value={2}>{ROTULO_AMBIENTE[2]}</option><option value={1}>{ROTULO_AMBIENTE[1]}</option></select></label>
                    <label>Certificado<select aria-label="Certificado" className={`block ${inp}`} value={certificado} onChange={e => setCertificado(e.target.value as Certificado)}>
                        <option value="escritorio">Certificado do escritório (procurador)</option><option value="empresa">Certificado da empresa</option></select></label>
                    {tpAmb === 1 && <label className="flex items-center gap-1 text-red-700 dark:text-red-300"><input type="checkbox" checked={confirmoProducao} onChange={e => setConfirmoProducao(e.target.checked)} />Confirmo o envio em produção (se o IOB já transmitiu a competência, o eSocial recusa o S-1200 repetido)</label>}
                    <button className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50 dark:border-slate-600" disabled={!prontos.length} onClick={baixar}>Baixar XMLs (.zip)</button>
                    {tpAmb === 1 && <button className="rounded bg-red-700 px-3 py-2 text-white disabled:opacity-50" disabled={!podeTransmitir || !esperaExclusao} onClick={() => transmitir('S-3000')}>1. Excluir S-1210 aceito ({aExcluir.length})</button>}
                    <button className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50" disabled={!podeTransmitir || esperaExclusao} onClick={() => transmitir('S-1200')}>{tpAmb === 1 ? '2. ' : ''}Transmitir S-1200 ({prontos.length})</button>
                    <button className="rounded bg-green-700 px-3 py-2 text-white disabled:opacity-50" disabled={!podeTransmitir || esperaExclusao} onClick={() => transmitir('S-1210')}>{tpAmb === 1 ? '3. ' : ''}Transmitir S-1210 ({prontos.length})</button>
                    {meusEnvios.length > 0 && <button className="rounded border border-slate-300 px-3 py-2 disabled:opacity-50 dark:border-slate-600" disabled={!!ocupado} onClick={consultar}>Consultar resultado</button>}
                    {naoGravado && prontos.length > 0 && <span className="text-amber-700 dark:text-amber-300">Grave os parâmetros e o de/para antes de transmitir.</span>}
                    {!naoGravado && esperaExclusao && <span className="text-amber-700 dark:text-amber-300">Primeiro a exclusão do S-1210 (passo 1); depois de aceita ("Consultar resultado"), o S-1200 e o S-1210 liberam.</span>}
                </section>
                {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
                {enviados.length > 0 && <ul className="list-disc pl-5 text-xs">{enviados.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
        </div>
    );
};

export default EventosFolhaModal;
