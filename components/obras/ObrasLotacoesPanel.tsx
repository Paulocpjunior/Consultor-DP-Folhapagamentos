// components/obras/ObrasLotacoesPanel.tsx
//
// Cadastros › Obras e lotações: as obras (CNO) e as lotações tributárias da empresa ativa, com o S-1005 (obra própria)
// e o S-1020 (toda lotação) pelo pré-voo e pela fila de sempre (CFI, A1 do cofre). O código da lotação vai na ficha do
// funcionário (Ident. Adm.) e no rateio do movimento do mês.

import React, { useEffect, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import {
    ehObraPropria, gerarS1005, gerarS1020, lotacaoVazia, TIPOS_LOTACAO, validarLotacao, type Inscricao, type Lotacao, type TipoLotacao,
} from '../../services/obras/lotacoes';
import { excluirLotacao, listarLotacoes, salvarLotacao } from '../../services/obras/lotacoesService';
import { verificarAntesDeEnviar, transmitirVerificado, mensagemDaTransmissao } from '../../services/esocial/envioSeguro';
import type { TpAmb } from '../../services/esocial/transmissao';
import SeletorProcesso, { useProcessos } from '../processosJud/SeletorProcesso';
import { limparCnpj, normalizarCnpj } from '../../services/cadastros/documentos';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const btnP = 'rounded-sm bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40';
const digitos = (t: string) => t.replace(/\D/g, '');

const CampoInscricao: React.FC<{ rotulo: string; valor: Inscricao; onChange: (i: Inscricao) => void }> = ({ rotulo, valor, onChange }) => (
    <label>{rotulo}
        <span className="flex gap-1">
            <select aria-label={`Tipo de inscrição: ${rotulo}`} className={inp} value={valor.tpInsc} onChange={e => onChange({ ...valor, tpInsc: e.target.value as '1' | '2' })}><option value="1">CNPJ</option><option value="2">CPF</option></select>
            <input aria-label={rotulo} className={`w-44 ${inp}`} value={valor.nrInsc} onChange={e => onChange({ ...valor, nrInsc: limparCnpj(e.target.value).slice(0, 14) })} />
        </span>
    </label>
);

const ObrasLotacoesPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const processos = useProcessos(ativa?.id ?? '');
    const [lista, setLista] = useState<Lotacao[]>([]);
    const [l, setL] = useState<Lotacao | null>(null);
    const [nova, setNova] = useState(false);
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setL(null);
        listarLotacoes(ativa.id).then(x => { if (vivo) setLista(x); }).catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa]);

    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa.</p>;
    const cnpj = normalizarCnpj(ativa.cnpj);
    const muda = (x: Partial<Lotacao>) => setL(a => (a ? { ...a, ...x } : a));
    const v = l ? validarLotacao(l, cnpj, lista.filter(o => !(o.codigo === l.codigo && !nova))) : null;

    async function gravar() {
        if (!l || !v) return;
        if (v.erros.length) { setErro(v.erros.join(' ')); return; }
        setOcupado('Gravando…'); setErro(''); setMsg('');
        try { await salvarLotacao(l, usuario); setLista(await listarLotacoes(ativa!.id)); setNova(false); setMsg('Lotação gravada.'); }
        catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(''); }
    }
    async function excluir() {
        if (!l || !window.confirm(`Excluir a lotação ${l.codigo} do Consultor? (No eSocial, ela continua até um S-1020 de exclusão ou fim de validade.)`)) return;
        try { await excluirLotacao(l); setLista(await listarLotacoes(ativa!.id)); setL(null); setMsg('Lotação excluída do Consultor.'); } catch (e) { setErro(mensagemErro(e)); }
    }
    async function transmitir(qual: 'S-1005' | 'S-1020') {
        if (!l || !v) return;
        if (v.erros.length) { setErro(v.erros.join(' ')); return; }
        if (tpAmb === 1 && !window.confirm(`Transmitir o ${qual} em PRODUÇÃO? A entrega ao eSocial não se desfaz.`)) return;
        setOcupado(`Transmitindo o ${qual}…`); setErro(''); setMsg('');
        try {
            const { xml } = qual === 'S-1005' ? gerarS1005({ cnpj, tpAmb, lotacao: l }) : gerarS1020({ cnpj, tpAmb, lotacao: l });
            const empresa = { id: ativa!.id, cnpj };
            const pv = await verificarAntesDeEnviar({ empresa, eventos: [{ xml, ref: `${qual === 'S-1005' ? 'estab' : 'lotacao'}:${l.codigo}` }], tpAmb });
            if (!pv.ok) { setErro(`O pré-voo barrou: ${pv.achados.filter(a => a.nivel === 'bloqueio').map(a => a.mensagem).join(' · ')}`); return; }
            const m = mensagemDaTransmissao(await transmitirVerificado(pv, { empresa, certificado: 'escritorio', usuario }));
            (m.ok ? setMsg : setErro)(`${qual}: ${m.texto}${m.ok ? ' Com o recibo do evento processado, informe-o abaixo e grave: o próximo envio sai como alteração.' : ''}`);
        } catch (e) { setErro(`${qual}: ${(e as Error).message}`); } finally { setOcupado(''); }
    }

    return (
        <div className="space-y-4 text-sm dark:text-slate-100">
            <div>
                <h2 className="text-lg font-semibold">Obras e lotações tributárias</h2>
                <p className="text-slate-600 dark:text-slate-300">
                    Cada obra ou tomador é uma lotação (S-1020), com FPAS e terceiros. Obra própria ou empreitada total tem o CNO da empresa e é também um estabelecimento (S-1005);
                    na empreitada parcial vão o CNO da obra e o contratante; na cessão de mão de obra, o CNPJ do tomador. O código da lotação vai na ficha do funcionário e no rateio do mês.
                </p>
            </div>
            {ocupado && <p className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded-sm bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}

            {!l && (
                <section className="space-y-2 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center justify-between"><p className="font-medium">Lotações da empresa</p>
                        <button className={btnP} onClick={() => { setErro(''); setMsg(''); setNova(true); setL({ ...lotacaoVazia(ativa.id), iniValid: ativa.competencia }); }}>+ Nova obra ou lotação</button></div>
                    {!lista.length && <p className="text-slate-500">Nenhuma lotação cadastrada: a folha usa a lotação única dos parâmetros do eSocial.</p>}
                    {lista.map(x => (
                        <button key={x.codigo} className="block w-full rounded-sm border border-slate-100 p-2 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => { setErro(''); setMsg(''); setNova(false); setL(x); }}>
                            <span className="font-mono">{x.codigo}</span> · {x.descricao} · lotação {x.tipo}{x.cno ? ` · CNO ${x.cno}` : ''}{x.tomador ? ` · tomador ${x.tomador}` : ''}
                            {' · '}{x.recibo1020 ? 'S-1020 aceito' : 'S-1020 a enviar'}{ehObraPropria(x) ? (x.recibo1005 ? ' · S-1005 aceito' : ' · S-1005 a enviar') : ''}
                        </button>
                    ))}
                </section>
            )}

            {l && v && (
                <section className="space-y-3 rounded-sm border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-end gap-3">
                        <label>Código<input aria-label="Código da lotação" disabled={!nova} className={`block w-32 font-mono ${inp}`} value={l.codigo} onChange={e => muda({ codigo: e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 30) })} /></label>
                        <label className="grow">Descrição<input aria-label="Descrição da lotação" className={`block w-full ${inp}`} value={l.descricao} onChange={e => muda({ descricao: e.target.value })} /></label>
                        <label>Tipo<select aria-label="Tipo de lotação" className={`block ${inp}`} value={l.tipo} onChange={e => muda({ tipo: e.target.value as TipoLotacao })}>
                            {Object.entries(TIPOS_LOTACAO).map(([k, r]) => <option key={k} value={k}>{k} · {r}</option>)}
                        </select></label>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        {(l.tipo === '01' || l.tipo === '02') && <label>CNO da obra{l.tipo === '01' ? ' (vazio = o estabelecimento da empresa)' : ''}<input aria-label="CNO da obra" className={`block w-40 font-mono ${inp}`} value={l.cno} onChange={e => muda({ cno: digitos(e.target.value).slice(0, 12) })} /></label>}
                        {ehObraPropria(l) && (
                            <>
                                <label>CNAE da obra<input aria-label="CNAE da obra" className={`block w-24 ${inp}`} value={l.cnaePrep} onChange={e => muda({ cnaePrep: digitos(e.target.value).slice(0, 7) })} /></label>
                                <label>RAT (se diferente)<select aria-label="RAT da obra" className={`block ${inp}`} value={l.aliqRat} onChange={e => muda({ aliqRat: e.target.value as Lotacao['aliqRat'] })}><option value="">o da empresa</option><option value="1">1%</option><option value="2">2%</option><option value="3">3%</option></select></label>
                                <label>FAP (se diferente)<input aria-label="FAP da obra" className={`block w-20 ${inp}`} value={l.fap} onChange={e => muda({ fap: e.target.value.replace(/[^\d,.]/g, '') })} /></label>
                                {l.aliqRat && <SeletorProcesso rotulo="Processo do RAT" processos={processos} valor={l.procRat} onChange={e => muda({ procRat: e })} />}
                                {l.fap && <SeletorProcesso rotulo="Processo do FAP" processos={processos} valor={l.procFap} onChange={e => muda({ procFap: e })} />}
                                <label className="flex items-center gap-1"><input type="checkbox" aria-label="Empresa construtora" checked={l.construtora} onChange={e => muda({ construtora: e.target.checked })} />Empresa construtora (S-1000)</label>
                                {l.construtora && <label className="flex items-center gap-1"><input type="checkbox" aria-label="Patronal substituída pela CPRB" checked={l.substituida} onChange={e => muda({ substituida: e.target.checked })} />Patronal da obra substituída pela CPRB</label>}
                            </>
                        )}
                        {l.tipo === '02' && (
                            <>
                                <CampoInscricao rotulo="Contratante" valor={l.contratante} onChange={i => muda({ contratante: i })} />
                                <label className="flex items-center gap-1"><input type="checkbox" aria-label="Proprietário fora do CNO" checked={!!l.proprietario} onChange={e => muda({ proprietario: e.target.checked ? { tpInsc: '1', nrInsc: '' } : null })} />Proprietário não está no CNO</label>
                                {l.proprietario && <CampoInscricao rotulo="Proprietário" valor={l.proprietario} onChange={i => muda({ proprietario: i })} />}
                            </>
                        )}
                        {l.tipo === '04' && <label>CNPJ do tomador<input aria-label="CNPJ do tomador" className={`block w-44 ${inp}`} value={l.tomador} onChange={e => muda({ tomador: limparCnpj(e.target.value).slice(0, 14) })} /></label>}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <label>FPAS<input aria-label="FPAS" className={`block w-16 ${inp}`} value={l.fpas} onChange={e => muda({ fpas: digitos(e.target.value).slice(0, 3) })} /></label>
                        <label>Terceiros<input aria-label="Código de terceiros" className={`block w-20 ${inp}`} value={l.codTercs} onChange={e => muda({ codTercs: digitos(e.target.value).slice(0, 4) })} /></label>
                        <label title="Código combinado dos terceiros com recolhimento suspenso por processo judicial (Tabela 04)">Terceiros suspensos<input aria-label="Terceiros suspensos" className={`block w-20 ${inp}`} value={l.codTercsSusp ?? ''} onChange={e => muda({ codTercsSusp: digitos(e.target.value).slice(0, 4) })} /></label>
                        {!!l.codTercsSusp && <span className="inline-flex flex-wrap items-end gap-2">
                            {(l.procTerceiros ?? []).map((p, i) => (
                                <span key={i} className="inline-flex items-end gap-1">
                                    <label className="text-xs">Terceiro<input aria-label={`Terceiro suspenso ${i + 1}`} className={`block w-16 ${inp}`} value={p.codTerc} onChange={e => muda({ procTerceiros: l.procTerceiros!.map((y, j) => (j === i ? { ...y, codTerc: digitos(e.target.value).slice(0, 4) } : y)) })} /></label>
                                    <SeletorProcesso rotulo={`Processo do terceiro ${i + 1}`} soJudicial processos={processos} valor={p.nrProcJud ? { tpProc: '2', nrProc: p.nrProcJud, codSusp: p.codSusp } : null} onChange={e => muda({ procTerceiros: l.procTerceiros!.map((y, j) => (j === i ? { ...y, nrProcJud: e?.nrProc ?? '', codSusp: e?.codSusp ?? '' } : y)) })} />
                                    <button className="text-red-600" onClick={() => muda({ procTerceiros: l.procTerceiros!.filter((_, j) => j !== i) })}>×</button>
                                </span>
                            ))}
                            <button className="text-xs text-blue-700 underline dark:text-blue-300" onClick={() => muda({ procTerceiros: [...(l.procTerceiros ?? []), { codTerc: '', nrProcJud: '', codSusp: '' }] })}>+ Processo de terceiro</button>
                        </span>}
                        <label>Início da validade<input aria-label="Início da validade" type="month" className={`block ${inp}`} value={l.iniValid} onChange={e => muda({ iniValid: e.target.value })} /></label>
                        <label>Fim (encerramento da obra)<input aria-label="Fim da validade" type="month" className={`block ${inp}`} value={l.fimValid} onChange={e => muda({ fimValid: e.target.value })} /></label>
                        <label>Recibo do S-1020<input aria-label="Recibo do S-1020" className={`block w-44 ${inp}`} value={l.recibo1020 ?? ''} onChange={e => muda({ recibo1020: e.target.value.trim() || undefined })} /></label>
                        {ehObraPropria(l) && <label>Recibo do S-1005<input aria-label="Recibo do S-1005" className={`block w-44 ${inp}`} value={l.recibo1005 ?? ''} onChange={e => muda({ recibo1005: e.target.value.trim() || undefined })} /></label>}
                    </div>
                    {(v.erros.length > 0 || v.avisos.length > 0) && (
                        <ul className="list-disc space-y-0.5 pl-5 text-xs">
                            {v.erros.map(e => <li key={e} className="text-red-700 dark:text-red-300">{e}</li>)}
                            {v.avisos.map(e => <li key={e} className="text-amber-700 dark:text-amber-300">{e}</li>)}
                        </ul>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <button className={btnP} disabled={!!ocupado} onClick={gravar}>Gravar</button>
                        {ehObraPropria(l) && <button className={btn} disabled={!!ocupado || nova} onClick={() => transmitir('S-1005')}>Transmitir S-1005 (obra)</button>}
                        <button className={btn} disabled={!!ocupado || nova} onClick={() => transmitir('S-1020')}>Transmitir S-1020 (lotação)</button>
                        <select aria-label="Ambiente do eSocial" className={inp} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}><option value={2}>Produção restrita</option><option value={1}>Produção</option></select>
                        <button className={btn} onClick={() => { setL(null); setNova(false); }}>Voltar</button>
                        {!nova && <button className={`${btn} text-red-700`} onClick={excluir}>Excluir</button>}
                    </div>
                    {ehObraPropria(l) && <p className="text-xs text-slate-500">Obra própria: envie o S-1005 antes do S-1020 e da primeira folha da obra. No S-1200, os funcionários dela saem com o CNO como estabelecimento.</p>}
                </section>
            )}
        </div>
    );
};

export default ObrasLotacoesPanel;
