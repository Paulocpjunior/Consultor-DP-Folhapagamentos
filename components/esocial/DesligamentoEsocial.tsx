// components/esocial/DesligamentoEsocial.tsx
//
// Cálculo › Rescisão › S-2299: o desligamento ao eSocial pelo Consultor, a partir da rescisão calculada
// (services/esocial/desligamento.ts). Situação no eSocial, prazo de 10 dias, de/para das verbas da rescisão
// com as rubricas do S-1010 (gravado na empresa, junto com o da folha), pré-voo e transmissão pelo cofre.
// Só para o desligamento registrado na ficha: a simulação não vira S-2299.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoRescisao } from '../../services/calculo/motorRescisao';
import { vigenciaEm, type Rubrica } from '../../services/cadastros/rubricas';
import { listarRubricas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { salvarParametrosEsocialFolha } from '../../services/empresas/empresasService';
import { parametrosVazios, type ParametrosEsocialFolha, type RubricaEsocial } from '../../services/esocial/eventosFolha';
import { PREFIXO_RESC, gerarS2299, prazoS2299, refDesligamento, rubricaDaVerba, sugerirDeParaRescisao, type PensaoFgts } from '../../services/esocial/desligamento';
import { ROTULO_AMBIENTE, consultarLote, type Certificado, type TpAmb } from '../../services/esocial/transmissao';
import { registrarConsulta, type Envio } from '../../services/esocial/transmissaoService';
import { mensagemDaTransmissao, transmitirVerificado, verificarAntesDeEnviar } from '../../services/esocial/envioSeguro';
import { avisos as avisosDoPreVoo, bloqueios, textoAchados, type Achado } from '../../services/esocial/preVoo';
import { statusPorRef, type SituacaoEvento } from '../../services/esocial/statusEvento';
import { baixarBytes } from '../../services/implantacao/zip';
import { centavosDeTexto } from '../../services/cadastros/documentos';
import AchadosPreVoo from './AchadosPreVoo';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const COR: Record<SituacaoEvento, string> = {
    'nao-enviado': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    iob: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    aguardando: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    aceito: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    recusado: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};
const br = (d: string) => d.split('-').reverse().join('/');
const chaveRub = (r: RubricaEsocial) => `${r.ideTabRubr}|${r.codRubr}`;
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

interface Props {
    empresa: Empresa;
    ficha: FichaFuncionario;
    rescisao: ResultadoRescisao;
    usuario: Usuario;
    envios: Envio[] | null;
    onAtualizado: () => void;
    onParametrosSalvos?: (p: ParametrosEsocialFolha) => void;
}

const DesligamentoEsocial: React.FC<Props> = ({ empresa, ficha, rescisao: r, usuario, envios, onAtualizado, onParametrosSalvos }) => {
    const [aberto, setAberto] = useState(false);
    const lido = useRef(empresa.esocialFolha);
    const [gravados, setGravados] = useState<ParametrosEsocialFolha>(() => empresa.esocialFolha ?? parametrosVazios(empresa.cnpj));
    const [params, setParams] = useState<ParametrosEsocialFolha>(gravados);
    const [rubricas, setRubricas] = useState<Rubrica[] | null>(null);
    const [dtAviso, setDtAviso] = useState('');
    const [pensTipo, setPensTipo] = useState<PensaoFgts['tipo']>('0');
    const [pensPerc, setPensPerc] = useState(''); const [pensValor, setPensValor] = useState('');
    const [observacao, setObservacao] = useState('');
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [certificado, setCertificado] = useState<Certificado>('escritorio');
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');
    const [achados, setAchados] = useState<Achado[]>([]);

    useEffect(() => {
        if (!aberto || rubricas) return;
        let vivo = true;
        listarRubricas(empresa.id).then(x => { if (vivo) setRubricas(x); }).catch(e => { if (vivo) { setRubricas([]); setErro(`Rubricas (S-1010) não carregadas: ${mensagemErro(e)}`); } });
        return () => { vivo = false; };
    }, [aberto, rubricas, empresa.id]);

    const ref = refDesligamento(ficha.id, r.data);
    const doIob = ficha.dados.dataDesligamento === r.data && (ficha.origens?.dataDesligamento ?? '').startsWith('eSocial');
    const s = envios ? statusPorRef(ref, 'S-2299', envios, doIob ? { recibo: '', detalhe: 'Desligamento importado do eSocial (transmitido pelo IOB).' } : null) : null;
    const prazo = prazoS2299(r.data);
    const atrasado = !!prazo && hojeSp() > prazo;
    const competencia = r.data.slice(0, 7);

    const dePara = useMemo(() => (rubricas ? sugerirDeParaRescisao([r], rubricas, competencia) : []), [rubricas, r, competencia]);
    // Sem rubrica própria gravada: a sugestão entra até a equipe gravar; sem sugestão, vale a da folha.
    const efetivos = useMemo<ParametrosEsocialFolha>(() => {
        const x = { ...params.rubricas };
        for (const i of dePara) if (!x[i.chave] && i.sugestao) x[i.chave] = i.sugestao;
        return { ...params, rubricas: x };
    }, [params, dePara]);
    const naoGravado = JSON.stringify(efetivos) !== JSON.stringify(gravados);
    const opcoes = useMemo(() => (rubricas ?? []).map(x => ({ r: x, v: vigenciaEm(x, competencia) })).filter(x => x.v)
        .sort((a, b) => a.r.codRubr.localeCompare(b.r.codRubr, 'pt-BR', { numeric: true })), [rubricas, competencia]);
    const pensao: PensaoFgts = pensTipo === '0' ? { tipo: '0' }
        : pensTipo === '1' ? { tipo: '1', percentual: Number(pensPerc.replace(',', '.')) || 0 }
            : pensTipo === '2' ? { tipo: '2', valor: centavosDeTexto(pensValor) ?? 0 }
                : { tipo: '3', percentual: Number(pensPerc.replace(',', '.')) || 0, valor: centavosDeTexto(pensValor) ?? 0 };
    const geracao = useMemo(() => (rubricas ? gerarS2299({ cnpj: empresa.cnpj, tpAmb, ficha, rescisao: r, rubricas, parametros: efetivos, dtAvisoPrevio: dtAviso, pensaoFgts: pensao, observacao, hoje: hojeSp() }) : null),
        [rubricas, empresa.cnpj, tpAmb, ficha, r, efetivos, dtAviso, pensTipo, pensPerc, pensValor, observacao]); // eslint-disable-line react-hooks/exhaustive-deps
    const podeTransmitir = !!geracao?.evento && !naoGravado && !ocupado && (s?.situacao === 'nao-enviado' || s?.situacao === 'recusado');

    const setRub = (chave: string, valor: string) => setParams(p => {
        const x = { ...p.rubricas };
        const achada = opcoes.find(o => chaveRub(o.r) === valor);
        if (achada) x[chave] = { codRubr: achada.r.codRubr, ideTabRubr: achada.r.ideTabRubr }; else delete x[chave];
        return { ...p, rubricas: x };
    });

    async function gravar() {
        setOcupado('Gravando…'); setErro('');
        try { await salvarParametrosEsocialFolha(empresa.id, efetivos, lido.current); lido.current = efetivos; setGravados(efetivos); setParams(efetivos); onParametrosSalvos?.(efetivos); setMsg('De/para da rescisão gravado na empresa.'); }
        catch (e) { setErro(`Não foi possível gravar (${mensagemErro(e)}).`); }
        finally { setOcupado(''); }
    }

    async function transmitir() {
        if (!geracao?.evento) return;
        setErro(''); setMsg(''); setAchados([]);
        setOcupado('Conferindo antes de enviar (pré-voo: XSD oficial e ordem dos eventos)…');
        try {
            const emp = { id: empresa.id, cnpj: empresa.cnpj };
            const pv = await verificarAntesDeEnviar({ empresa: emp, eventos: [{ xml: geracao.evento.xml, nome: 'S-2299', ref }], tpAmb });
            setAchados(pv.achados);
            if (!pv.ok) { setErro(`O pré-voo barrou o envio (nada foi enviado):\n${textoAchados(bloqueios(pv.achados))}`); return; }
            const av = avisosDoPreVoo(pv.achados);
            if (!window.confirm(`Transmitir o S-2299 de ${r.nome} (desligamento em ${br(r.data)}, motivo ${r.tipo}) em ${ROTULO_AMBIENTE[tpAmb].toUpperCase()}?${tpAmb === 1 ? '\n\nEm produção, o desligamento vale para o eSocial e para o FGTS Digital e não se desfaz (só por retificação ou exclusão).' : ''}${av.length ? `\n\nAvisos do pré-voo:\n${textoAchados(av)}` : ''}`)) return;
            setOcupado('Transmitindo o S-2299…');
            const t = await transmitirVerificado(pv, { empresa: emp, certificado, usuario });
            const m = mensagemDaTransmissao(t);
            if (m.ok) setMsg(m.texto); else setErro(m.texto);
            onAtualizado();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    async function consultar(envio: Envio) {
        setErro(''); setOcupado('Consultando o retorno…');
        try {
            const x = await consultarLote({ empresaId: empresa.id, cnpj: empresa.cnpj, protocolo: envio.protocolo, tpAmb: envio.tpAmb, certificado: envio.certificado });
            await registrarConsulta(envio, x, usuario);
            if (x.situacao === 'em-processamento') setMsg('Ainda em processamento no eSocial. Consulte de novo em instantes.');
            onAtualizado();
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    function baixar() {
        if (!geracao?.evento) return;
        baixarBytes(`S-2299_${ficha.cpf}_${r.data}.xml`, new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8"?>${geracao.evento.xml}`), 'application/xml');
        setMsg('XML baixado sem assinatura, para conferência (a transmissão assina pelo CFI).');
    }

    return (
        <section aria-label="eSocial · S-2299" className="space-y-2 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">eSocial · S-2299 (desligamento)</span>
                {s ? <span className={`rounded-full px-2 py-0.5 font-medium ${COR[s.situacao]}`}>{s.rotulo}</span> : <span className="text-slate-400">carregando…</span>}
                {prazo && s && (s.situacao === 'nao-enviado' || s.situacao === 'recusado') && (
                    <span className={atrasado ? 'font-medium text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}>prazo {br(prazo)}{atrasado ? ' (vencido: envie quanto antes)' : ''}</span>
                )}
            </div>
            {s && <p className={s.situacao === 'recusado' ? 'text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-300'}>{s.detalhe}</p>}
            {s?.situacao === 'aguardando' && s.envio?.protocolo && <button type="button" className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600" disabled={!!ocupado} onClick={() => consultar(s.envio!)}>Consultar retorno</button>}
            {s?.teste && <p className="text-slate-500">Teste na produção restrita: {s.teste.rotulo.toLowerCase()} · {s.teste.detalhe}</p>}

            {s && (s.situacao === 'nao-enviado' || s.situacao === 'recusado') && (
                <button type="button" className="text-blue-700 underline dark:text-blue-300" onClick={() => setAberto(a => !a)}>{aberto ? 'Fechar o S-2299' : s.situacao === 'recusado' ? 'Corrigir e transmitir o S-2299' : 'Gerar e transmitir o S-2299 pelo Consultor'}</button>
            )}
            {aberto && (
                <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-3">
                        {r.diasAviso > 0 && <label>Data em que o aviso foi dado<input aria-label="Data do aviso prévio" type="date" className={`block w-full ${inp}`} value={dtAviso} onChange={e => setDtAviso(e.target.value)} /></label>}
                        <label>Pensão sobre o FGTS (retenção)<select aria-label="Pensão alimentícia sobre o FGTS" className={`block w-full ${inp}`} value={pensTipo} onChange={e => setPensTipo(e.target.value as PensaoFgts['tipo'])}>
                            <option value="0">Não existe</option><option value="1">Percentual</option><option value="2">Valor</option><option value="3">Percentual e valor</option>
                        </select></label>
                        {(pensTipo === '1' || pensTipo === '3') && <label>Percentual (%)<input aria-label="Percentual da pensão sobre o FGTS" className={`block w-full ${inp}`} value={pensPerc} onChange={e => setPensPerc(e.target.value)} /></label>}
                        {(pensTipo === '2' || pensTipo === '3') && <label>Valor (R$)<input aria-label="Valor da pensão sobre o FGTS" className={`block w-full ${inp}`} value={pensValor} onChange={e => setPensValor(e.target.value)} /></label>}
                        <label className="sm:col-span-3">Observação (opcional)<input aria-label="Observação do desligamento" maxLength={255} className={`block w-full ${inp}`} value={observacao} onChange={e => setObservacao(e.target.value)} /></label>
                    </div>

                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">De/para das verbas da rescisão com as rubricas do S-1010</p>
                            <button className="rounded bg-blue-700 px-2 py-1 text-white disabled:opacity-50" disabled={!naoGravado || !!ocupado} onClick={gravar}>{naoGravado ? 'Gravar de/para' : 'Gravado'}</button>
                        </div>
                        <p className="text-slate-500">CNPJ do estabelecimento e lotação: os da folha (S-1200), {params.nrInscEstab || '—'} · {params.codLotacao || '—'}. Verba sem rubrica própria aqui usa a da folha.</p>
                        {rubricas && !rubricas.length && <p role="note" className="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">A empresa não tem rubricas do S-1010 no Consultor. Importe em Cadastros › Incidências antes de gerar.</p>}
                        <div className="max-h-56 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full">
                                <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900"><tr><th className="p-1">Verba da rescisão</th><th className="p-1">Tipo</th><th className="p-1">Rubrica do S-1010</th></tr></thead>
                                <tbody>{dePara.map(i => {
                                    const propria = efetivos.rubricas[i.chave];
                                    const daFolha = !propria ? rubricaDaVerba(efetivos, { codigo: i.chave.slice(PREFIXO_RESC.length), descricao: i.descricao }) : undefined;
                                    const sugerida = !params.rubricas[i.chave] && !!i.sugestao;
                                    return (
                                        <tr key={i.chave} className="border-t border-slate-100 dark:border-slate-700">
                                            <td className="p-1">{i.descricao}</td><td className="p-1">{i.tipo}</td>
                                            <td className="p-1">
                                                <select aria-label={`Rubrica de ${i.descricao}`} className={inp} value={propria ? chaveRub(propria) : ''} onChange={e => setRub(i.chave, e.target.value)}>
                                                    <option value="">{daFolha ? `— a da folha (${daFolha.codRubr}) —` : '— escolha —'}</option>
                                                    {opcoes.map(o => <option key={chaveRub(o.r)} value={chaveRub(o.r)}>{o.r.codRubr} · {o.v!.dados.dscRubr} (natureza {o.v!.dados.natRubr}, {o.v!.dados.tpRubr === '1' ? 'provento' : o.v!.dados.tpRubr === '2' ? 'desconto' : 'informativa'})</option>)}
                                                </select>
                                                {sugerida && <span className="ml-1 text-amber-700 dark:text-amber-300">sugerida</span>}
                                            </td>
                                        </tr>
                                    );
                                })}</tbody>
                            </table>
                        </div>
                    </div>

                    {geracao && geracao.erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{geracao.erros.map(x => <li key={x}>{x}</li>)}</ul>}
                    {geracao && geracao.avisos.length > 0 && <ul className="list-disc pl-6 text-amber-900 dark:text-amber-100">{geracao.avisos.map(x => <li key={x}>{x}</li>)}</ul>}

                    <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                        <label>Ambiente<select aria-label="Ambiente do S-2299" className={`block ${inp}`} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}>
                            <option value={2}>{ROTULO_AMBIENTE[2]}</option><option value={1}>{ROTULO_AMBIENTE[1]}</option></select></label>
                        <label>Certificado<select aria-label="Certificado do S-2299" className={`block ${inp}`} value={certificado} onChange={e => setCertificado(e.target.value as Certificado)}>
                            <option value="escritorio">Certificado do escritório (procurador)</option><option value="empresa">Certificado da empresa</option></select></label>
                        <button className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50 dark:border-slate-600" disabled={!geracao?.evento} onClick={baixar}>Baixar XML</button>
                        <button className="rounded bg-green-700 px-2 py-1 text-white disabled:opacity-50" disabled={!podeTransmitir} onClick={transmitir}>Transmitir S-2299</button>
                        {naoGravado && geracao?.evento && <span className="text-amber-700 dark:text-amber-300">Grave o de/para antes de transmitir.</span>}
                    </div>
                </div>
            )}
            {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="whitespace-pre-line text-red-700 dark:text-red-300">{erro}</p>}
            <AchadosPreVoo achados={achados} />
            {msg && <p role="status" className="text-green-700 dark:text-green-300">{msg}</p>}
        </section>
    );
};

export default DesligamentoEsocial;
