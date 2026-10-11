// components/processosJud/ProcessosS1070Panel.tsx
//
// Cadastros › Processos judiciais e administrativos (S-1070): o cadastro dos processos da empresa ativa que suspendem
// contribuição previdenciária, IRRF ou FGTS (services/processosJud/processosJud.ts), com o S-1070 gerado e transmitido
// pelo pré-voo (inclusão; depois de aceita, alteração; e a exclusão), a situação de cada um e o XML. Os processos
// cadastrados aparecem para escolher no S-1010 (incidência suspensa) e nas obras (RAT, FAP e terceiros).

import React, { useEffect, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { listarEnvios, type Envio } from '../../services/esocial/transmissaoService';
import { statusPorRef } from '../../services/esocial/statusEvento';
import { verificarAntesDeEnviar, transmitirVerificado, mensagemDaTransmissao } from '../../services/esocial/envioSeguro';
import type { TpAmb } from '../../services/esocial/transmissao';
import { baixarBytes } from '../../services/implantacao/zip';
import { INDICATIVOS_SUSPENSAO, SUSPENSAO_POR_TIPO, TIPOS_PROCESSO, gerarS1070, idProcesso, processoVazio, refProcesso, validarProcesso, type AcaoS1070, type ProcessoJudAdm, type TpProc } from '../../services/processosJud/processosJud';
import { listarProcessos, salvarProcesso } from '../../services/processosJud/processosJudService';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const ROTULO_ACAO: Record<AcaoS1070, string> = { inclusao: 'inclusão', alteracao: 'alteração', exclusao: 'exclusão' };

const ProcessosS1070Panel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [empresa, setEmpresa] = useState<Empresa | null>(null);
    const [processos, setProcessos] = useState<ProcessoJudAdm[]>([]);
    const [envios, setEnvios] = useState<Envio[]>([]);
    const [edicao, setEdicao] = useState<ProcessoJudAdm | null>(null);
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [recarga, setRecarga] = useState(0);
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        Promise.all([listarEmpresasVisiveis(), listarProcessos(ativa.id), listarEnvios(ativa.id).catch(() => [] as Envio[])])
            .then(([es, ps, ev]) => { if (vivo) { setEmpresa(es.find(e => e.id === ativa.id) ?? null); setProcessos(ps); setEnvios(ev); } })
            .catch(e => { if (vivo) setErro(`Dados não carregados: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa, recarga]);

    const situacao = (p: ProcessoJudAdm, acao: AcaoS1070) => statusPorRef(refProcesso(p.id, acao), 'S-1070', envios);
    /** Próxima ação: inclusão até ser aceita (na produção); depois, alteração. */
    const proxima = (p: ProcessoJudAdm): AcaoS1070 => (situacao(p, 'inclusao').situacao === 'aceito' || p.recibo ? 'alteracao' : 'inclusao');

    async function gravar() {
        if (!edicao || !ativa) return;
        const p = { ...edicao, empresaId: ativa.id, nrProc: edicao.nrProc.replace(/\D/g, '') };
        const e = validarProcesso(p);
        if (!edicao.id && processos.some(x => x.id === idProcesso(ativa.id, p.tpProc, p.nrProc))) e.push('Este processo já está cadastrado: edite o existente.');
        if (e.length) { setErro(e.join(' ')); return; }
        setOcupado('Gravando o processo…'); setErro('');
        try { await salvarProcesso(p, usuario); setEdicao(null); setMsg('Processo gravado. Transmita o S-1070 antes dos eventos que o citam.'); setRecarga(n => n + 1); }
        catch (x) { setErro(`Não foi possível gravar (${mensagemErro(x)}).`); }
        finally { setOcupado(''); }
    }
    function baixar(p: ProcessoJudAdm, acao: AcaoS1070) {
        const g = gerarS1070({ cnpj: empresa?.cnpj ?? ativa?.cnpj ?? '', tpAmb, processo: p, acao });
        if (!g.evento) { setErro(`S-1070: ${g.erros.join(' ')}`); return; }
        baixarBytes(`S-1070-${p.nrProc}-${acao}.xml`, new TextEncoder().encode(g.evento.xml), 'application/xml');
    }
    async function transmitir(p: ProcessoJudAdm, acao: AcaoS1070) {
        if (!empresa) return;
        const g = gerarS1070({ cnpj: empresa.cnpj, tpAmb, processo: p, acao });
        if (!g.evento) { setErro(`S-1070: ${g.erros.join(' ')}`); return; }
        if (!window.confirm(`Transmitir a ${ROTULO_ACAO[acao]} do processo ${p.nrProc} (S-1070) em ${tpAmb === 1 ? 'PRODUÇÃO' : 'produção restrita'}?`)) return;
        setOcupado('Transmitindo o S-1070…'); setErro(''); setMsg('');
        try {
            const pv = await verificarAntesDeEnviar({ empresa, eventos: [{ xml: g.evento.xml, ref: refProcesso(p.id, acao) }], tpAmb });
            if (!pv.ok) { setErro(`O pré-voo barrou: ${pv.achados.filter(a => a.nivel === 'bloqueio').map(a => a.mensagem).join(' · ')}`); return; }
            const m = mensagemDaTransmissao(await transmitirVerificado(pv, { empresa, certificado: 'escritorio', usuario }));
            (m.ok ? setMsg : setErro)(`S-1070 (${ROTULO_ACAO[acao]}): ${m.texto}`);
            // Exclusão enviada à produção: o processo sai das listas de escolha (fica no cadastro, inativo).
            if (m.ok && acao === 'exclusao' && tpAmb === 1) await salvarProcesso({ ...p, ativo: false }, usuario);
            setRecarga(n => n + 1);
        } catch (x) { setErro(`S-1070: ${(x as Error).message}`); }
        finally { setOcupado(''); }
    }

    if (!ativa) return <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative uma empresa para cadastrar os processos.</p>;
    const muda = (x: Partial<ProcessoJudAdm>) => setEdicao(e => e && ({ ...e, ...x }));
    const errosEdicao = edicao ? validarProcesso(edicao) : [];
    return (
        <div className="space-y-4 text-sm">
            <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Processos judiciais e administrativos (S-1070)</h2>
                <p className="text-slate-600 dark:text-slate-300">Os processos que suspendem a contribuição previdenciária, o IRRF ou o FGTS, ou que permitem o RAT e o FAP diferentes. O S-1070 vai antes do S-1010 (incidência suspensa), do S-1005 e do S-1020 que citam o processo; o código da suspensão cadastrado aqui é o que esses eventos usam.</p>
            </div>

            <section className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Processos de {ativa.nome}</p>
                    <div className="flex items-center gap-2">
                        <select aria-label="Ambiente do S-1070" className={inp} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}><option value={2}>Produção restrita</option><option value={1}>Produção</option></select>
                        <button className={btn} onClick={() => setEdicao(processoVazio(ativa.id))}>+ Processo</button>
                    </div>
                </div>
                {processos.length === 0 && <p className="text-slate-500">Nenhum processo cadastrado.</p>}
                {processos.length > 0 && (
                    <table className="w-full text-xs"><thead className="text-left text-slate-500"><tr><th className="p-1">Processo</th><th className="p-1">Validade</th><th className="p-1">Suspensões</th><th className="p-1">S-1070</th><th className="p-1" /></tr></thead>
                        <tbody>{processos.map(p => {
                            const acao = proxima(p);
                            const st = situacao(p, acao);
                            const exc = situacao(p, 'exclusao');
                            const g = gerarS1070({ cnpj: empresa?.cnpj ?? ativa.cnpj, tpAmb, processo: p, acao });
                            return (
                                <tr key={p.id} className={`border-t border-slate-100 align-top dark:border-slate-700 ${p.ativo ? '' : 'opacity-50'}`}>
                                    <td className="p-1">{TIPOS_PROCESSO[p.tpProc]} <span className="font-mono">{p.nrProc}</span>{p.ativo ? '' : ' (excluído)'}<br /><span className="text-slate-500">{p.indMatProc === '1' ? 'tributária' : 'FGTS / LC 110'}{p.observacao ? ` · ${p.observacao}` : ''}</span></td>
                                    <td className="p-1">{p.iniValid}{p.fimValid ? ` a ${p.fimValid}` : ''}</td>
                                    <td className="p-1">{p.suspensoes.map(s => `${s.codSusp}: ${s.indSusp}`).join(', ') || '—'}</td>
                                    <td className="p-1"><span>{ROTULO_ACAO[acao]}: {st.rotulo}</span>{st.recibo ? ` · ${st.recibo}` : ''}{exc.situacao !== 'nao-enviado' ? <span className="block">exclusão: {exc.rotulo}</span> : null}
                                        {g.erros.map(x => <span key={x} className="block text-red-700 dark:text-red-300">✗ {x}</span>)}</td>
                                    <td className="space-x-2 whitespace-nowrap p-1 text-right">
                                        <button className="text-blue-700 underline dark:text-blue-300" onClick={() => setEdicao({ ...p })}>Editar</button>
                                        <button className="text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!!ocupado || !g.evento || !p.ativo || st.situacao === 'aguardando'} onClick={() => transmitir(p, acao)}>Transmitir {ROTULO_ACAO[acao]}</button>
                                        <button className="text-blue-700 underline disabled:opacity-50 dark:text-blue-300" disabled={!g.evento} onClick={() => baixar(p, acao)}>XML</button>
                                        {acao === 'alteracao' && p.ativo && <button className="text-red-700 underline disabled:opacity-50 dark:text-red-300" disabled={!!ocupado} onClick={() => transmitir(p, 'exclusao')}>Excluir no eSocial</button>}
                                    </td>
                                </tr>
                            );
                        })}</tbody></table>
                )}
            </section>

            {edicao && (
                <section aria-label="Cadastro do processo" className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                    <div className="grid gap-2 sm:grid-cols-4">
                        <label>Tipo<select aria-label="Tipo do processo" className={`block w-full ${inp}`} value={edicao.tpProc} disabled={!!edicao.id} onChange={e => muda({ tpProc: e.target.value as TpProc, indMatProc: e.target.value === '4' ? '1' : edicao.indMatProc })}>
                            {(Object.keys(TIPOS_PROCESSO) as TpProc[]).map(k => <option key={k} value={k}>{TIPOS_PROCESSO[k]}</option>)}</select></label>
                        <label className="sm:col-span-2">Número<input aria-label="Número do processo" className={`block w-full font-mono ${inp}`} value={edicao.nrProc} disabled={!!edicao.id} onChange={e => muda({ nrProc: e.target.value.replace(/\D/g, '').slice(0, 21) })} /></label>
                        <label>Matéria<select aria-label="Matéria do processo" className={`block w-full ${inp}`} value={edicao.indMatProc} onChange={e => muda({ indMatProc: e.target.value as '1' | '7' })}>
                            <option value="1">Tributária (ou tributária e FGTS)</option><option value="7">Só FGTS ou contribuição rescisória (LC 110/2001)</option></select></label>
                        <label>Válido desde<input aria-label="Início da validade" type="month" className={`block w-full ${inp}`} value={edicao.iniValid} onChange={e => muda({ iniValid: e.target.value })} /></label>
                        <label>Até (opcional)<input aria-label="Fim da validade" type="month" className={`block w-full ${inp}`} value={edicao.fimValid} onChange={e => muda({ fimValid: e.target.value })} /></label>
                        {edicao.tpProc === '2' && <label>Autoria<select aria-label="Autoria da ação" className={`block w-full ${inp}`} value={edicao.indAutoria} onChange={e => muda({ indAutoria: e.target.value as '1' | '2' })}><option value="1">Própria empresa</option><option value="2">Outra entidade, empresa ou empregado</option></select></label>}
                        <label className="sm:col-span-4">Observação<input aria-label="Observação do processo" maxLength={255} className={`block w-full ${inp}`} value={edicao.observacao} onChange={e => muda({ observacao: e.target.value })} /></label>
                        {edicao.tpProc === '2' && edicao.indMatProc === '1' && <>
                            <label>UF da vara<input aria-label="UF da vara" className={`block w-full ${inp}`} value={edicao.vara.uf} onChange={e => muda({ vara: { ...edicao.vara, uf: e.target.value.toUpperCase().slice(0, 2) } })} /></label>
                            <label>Município da vara (IBGE)<input aria-label="Município da vara" className={`block w-full ${inp}`} value={edicao.vara.codMunic} onChange={e => muda({ vara: { ...edicao.vara, codMunic: e.target.value.replace(/\D/g, '').slice(0, 7) } })} /></label>
                            <label>Código da vara<input aria-label="Código da vara" className={`block w-full ${inp}`} value={edicao.vara.idVara} onChange={e => muda({ vara: { ...edicao.vara, idVara: e.target.value.replace(/\D/g, '').slice(0, 4) } })} /></label>
                        </>}
                    </div>
                    {edicao.indMatProc === '1' && <div className="space-y-1">
                        <p className="text-xs font-medium">Suspensões da exigibilidade (o código é o que o S-1010, o S-1005 e o S-1020 citam)</p>
                        {edicao.suspensoes.map((s, i) => {
                            const ms = (x: Partial<typeof s>) => muda({ suspensoes: edicao.suspensoes.map((y, j) => (j === i ? { ...y, ...x } : y)) });
                            return (
                                <div key={i} className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-[6rem_1fr_9rem_8rem_auto]">
                                    <input aria-label={`Código da suspensão ${i + 1}`} className={inp} value={s.codSusp} placeholder="código" onChange={e => ms({ codSusp: e.target.value.replace(/\D/g, '').slice(0, 14) })} />
                                    <select aria-label={`Indicativo da suspensão ${i + 1}`} className={inp} value={s.indSusp} onChange={e => ms({ indSusp: e.target.value, indDeposito: ['02', '03'].includes(e.target.value) ? 'S' : e.target.value === '90' ? 'N' : s.indDeposito })}>
                                        <option value="">— indicativo —</option>{INDICATIVOS_SUSPENSAO.filter(([k]) => SUSPENSAO_POR_TIPO[edicao.tpProc].includes(k)).map(([k, r]) => <option key={k} value={k}>{k} · {r}</option>)}</select>
                                    <input aria-label={`Data da decisão ${i + 1}`} type="date" className={inp} value={s.dtDecisao} onChange={e => ms({ dtDecisao: e.target.value })} />
                                    <select aria-label={`Depósito integral ${i + 1}`} className={inp} value={s.indDeposito} onChange={e => ms({ indDeposito: e.target.value as 'S' | 'N' })}><option value="N">Sem depósito integral</option><option value="S">Com depósito integral</option></select>
                                    <button className="text-red-600" onClick={() => muda({ suspensoes: edicao.suspensoes.filter((_, j) => j !== i) })}>×</button>
                                </div>
                            );
                        })}
                        <button className="text-xs text-blue-700 underline dark:text-blue-300" onClick={() => muda({ suspensoes: [...edicao.suspensoes, { codSusp: String(edicao.suspensoes.length + 1), indSusp: '', dtDecisao: '', indDeposito: 'N' }] })}>+ Suspensão</button>
                    </div>}
                    {errosEdicao.length > 0 && <ul role="alert" className="list-disc rounded bg-amber-50 p-2 pl-6 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{errosEdicao.map(x => <li key={x}>{x}</li>)}</ul>}
                    <div className="flex justify-end gap-2">
                        <button className={btn} onClick={() => setEdicao(null)}>Cancelar</button>
                        <button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!!ocupado || errosEdicao.length > 0} onClick={gravar}>Gravar processo</button>
                    </div>
                </section>
            )}

            {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
        </div>
    );
};

export default ProcessosS1070Panel;
