// components/dctfweb/DctfwebFolhaPanel.tsx
//
// eSocial › DCTFWeb da folha (Paulo, 11/10/2026: "a DCTFWeb tem a parte que cabe ao DP"). Da empresa e do período
// ativos, pelo túnel do CFI (SERPRO): situação da declaração, semáforo dos insumos (eSocial, Reinf e MIT), débitos,
// DARF (em andamento ou da declaração ativa) e a transmissão. O DP transmite só com os três insumos confirmados;
// com pendência, quem transmite é o Fiscal, com justificativa — a regra é do CFI, a tela só orienta.

import React, { useEffect, useRef, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import {
    consultarDctfWebDebitos, consultarDctfWebStatus, consultarInsumosDctfweb, gerarDarfDctfweb, transmitirDctfweb,
    type DctfWebDarfResult, type DctfWebDebito,
} from '../../services/serpro/serproIntegrationService';
import {
    acoesDaFolha, bytesDoBase64, lerSemaforo, nomeArquivoDarf, ROTULO_ESTADO, validarPedidoTransmissao, vencimentoDarfFolha,
    type EstadoSelo, type SemaforoInsumos, type SituacaoDeclaracao,
} from '../../services/dctfweb/dctfwebFolha';
import { baixarBytes } from '../../services/implantacao/zip';
import { br } from '../../services/prazos/calendario';

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const btn = 'rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40';
const COR: Record<EstadoSelo, string> = {
    recebido: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    'sem-movimento': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    pendente: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    indeterminado: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
};
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface Leitura { situacao: SituacaoDeclaracao; semaforo: SemaforoInsumos; debitos: { ok: boolean; lista: DctfWebDebito[]; erro?: string } }

const DctfwebFolhaPanel: React.FC = () => {
    const { ativa } = useEmpresaAtiva();
    const [leitura, setLeitura] = useState<Leitura | null>(null);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [feito, setFeito] = useState('');
    const [darf, setDarf] = useState<DctfWebDarfResult | null>(null);
    const [motivo, setMotivo] = useState('');
    const [comPendencia, setComPendencia] = useState(false);
    const [justificativa, setJustificativa] = useState('');
    const pedido = useRef(0);

    useEffect(() => { pedido.current++; setLeitura(null); setDarf(null); setErro(''); setFeito(''); }, [ativa?.id, ativa?.competencia]);
    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa e um período.</p>;
    const cnpj = ativa.cnpj.replace(/\D/g, '');
    const comp = ativa.competencia;

    async function consultar() {
        const meu = ++pedido.current;
        setOcupado('Consultando a DCTFWeb no SERPRO…'); setErro(''); setFeito('');
        const [s, i, d] = await Promise.allSettled([consultarDctfWebStatus(cnpj, comp), consultarInsumosDctfweb(ativa!.id, cnpj, comp), consultarDctfWebDebitos(cnpj, comp)]);
        if (meu !== pedido.current) return;
        const situacao: SituacaoDeclaracao = s.status === 'fulfilled'
            ? { ok: !!s.value.ok, entregue: !!s.value.ok && !!s.value.entregue, situacao: s.value.situacao || 'INDETERMINADA', dataEntrega: s.value.dataEntrega ?? null, erro: s.value.ok ? undefined : s.value.erro }
            : { ok: false, entregue: false, situacao: 'indisponível', erro: msg(s.reason) };
        const semaforo = i.status === 'fulfilled' ? lerSemaforo(i.value) : lerSemaforo({ ok: false, error: msg(i.reason) });
        const debitos = d.status === 'rejected' ? { ok: false, lista: [], erro: msg(d.reason) }
            : d.value.ok && (!d.value.fonte || d.value.fonte === 'serpro') ? { ok: true, lista: d.value.debitos ?? [] }
                : { ok: false, lista: [], erro: d.value.erro || `resposta em modo ${d.value.fonte}` };
        setLeitura({ situacao, semaforo, debitos });
        setOcupado('');
    }

    const acoes = leitura ? acoesDaFolha(leitura.situacao, leitura.semaforo) : null;

    async function emitirDarf() {
        if (!acoes) return;
        setOcupado(acoes.darfEmAndamento ? 'Emitindo o DARF com a declaração em andamento…' : 'Emitindo o DARF da declaração ativa…'); setErro(''); setFeito('');
        try {
            const r = await gerarDarfDctfweb(ativa!.id, cnpj, comp, acoes.darfEmAndamento);
            if (!r.ok || !r.pdfBase64) throw new Error(r.error || 'O SERPRO não devolveu o PDF do DARF.');
            setDarf(r);
            baixarBytes(nomeArquivoDarf(ativa!.codigoSage, comp, r.emAndamento), bytesDoBase64(r.pdfBase64), 'application/pdf');
            setFeito('DARF emitido e baixado. Confira o valor e o vencimento no PDF antes de mandar ao cliente.');
        } catch (e) { setErro(msg(e)); } finally { setOcupado(''); }
    }

    async function transmitir() {
        if (!acoes || !leitura) return;
        const retificadora = acoes.retificadora;
        const erros = validarPedidoTransmissao({ retificadora, motivo, comPendencia: comPendencia && !acoes.podeTransmitir, justificativa });
        if (erros.length) { setErro(erros.join(' ')); return; }
        const texto = retificadora
            ? `Transmitir a RETIFICADORA da DCTFWeb de ${comp.split('-').reverse().join('/')}? A entrega à Receita não se desfaz.`
            : `Transmitir a DCTFWeb de ${comp.split('-').reverse().join('/')} de ${ativa!.nome}? A entrega à Receita não se desfaz e fecha a competência para o Fiscal e o Contábil.`;
        if (!window.confirm(texto)) return;
        setOcupado('Transmitindo a DCTFWeb…'); setErro(''); setFeito('');
        try {
            const r = await transmitirDctfweb(ativa!.id, cnpj, comp, {
                retificadora, motivo: retificadora ? motivo.trim() : undefined,
                ...(comPendencia && !acoes.podeTransmitir ? { confirmarInsumosPendentes: true, justificativa: justificativa.trim() } : {}),
            });
            setMotivo(''); setJustificativa(''); setComPendencia(false);
            // Relê a situação (a tela passa para a retificadora e o DARF da ativa) e só então dá o recibo.
            await consultar();
            setFeito(`DCTFWeb ${retificadora ? 'retificada' : 'transmitida'}${r.numeroRecibo ? `: recibo ${r.numeroRecibo}` : ''}. Emita o DARF da declaração ativa.`);
        } catch (e) { setErro(msg(e)); } finally { setOcupado(''); }
    }

    const total = leitura?.debitos.lista.reduce((s, x) => s + (Number(x.valor) || 0), 0) ?? 0;
    return (
        <section aria-label="DCTFWeb da folha" className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <p><strong>{ativa.nome}</strong> · CNPJ {ativa.cnpj} · competência {comp.split('-').reverse().join('/')} · DARF da folha vence em {br(vencimentoDarfFolha(comp))}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    A DCTFWeb junta a folha (eSocial, S-1299), a EFD-Reinf (Contábil) e o MIT (Fiscal). O DP emite o DARF a qualquer momento e transmite quando os três insumos estão confirmados;
                    com pendência, a transmissão é do Fiscal. Se o S-1299 saiu com "Transmitir a DCTFWeb logo após o fechamento", a Receita pode já ter transmitido: a situação abaixo mostra.
                </p>
                <button className={`${btn} mt-3 bg-blue-700 text-white`} disabled={!!ocupado} onClick={consultar}>{leitura ? 'Consultar de novo' : 'Consultar a DCTFWeb'}</button>
            </div>

            {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {feito && <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{feito}</p>}

            {leitura && acoes && (
                <>
                    <div className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700 dark:text-slate-100">
                        <h3 className="font-semibold">Declaração</h3>
                        {leitura.situacao.ok
                            ? <p>{leitura.situacao.entregue ? `Transmitida (${leitura.situacao.situacao})${leitura.situacao.dataEntrega ? ` em ${leitura.situacao.dataEntrega}` : ''}.` : `Em andamento (${leitura.situacao.situacao}): ainda não transmitida.`}</p>
                            : <p className="text-amber-700 dark:text-amber-300">Situação indisponível{leitura.situacao.erro ? `: ${leitura.situacao.erro}` : ''}.</p>}
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700 dark:text-slate-100">
                        <h3 className="font-semibold">Insumos</h3>
                        {leitura.semaforo.ok ? (
                            <ul className="mt-2 space-y-2">
                                {leitura.semaforo.selos.map(s => (
                                    <li key={s.rotulo} className="flex flex-wrap items-start gap-2">
                                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${COR[s.estado]}`}>{ROTULO_ESTADO[s.estado]}</span>
                                        <span><strong>{s.rotulo}</strong> — {s.detalhe}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-amber-700 dark:text-amber-300">Semáforo indisponível: {leitura.semaforo.erro}</p>}
                        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{acoes.motivo}</p>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700 dark:text-slate-100">
                        <h3 className="font-semibold">Débitos da declaração</h3>
                        {leitura.debitos.ok ? (
                            leitura.debitos.lista.length ? (
                                <table className="mt-2 w-full text-xs">
                                    <thead className="text-left text-slate-500"><tr><th className="p-1">Código</th><th className="p-1">Tributo</th><th className="p-1 text-right">Saldo a pagar</th></tr></thead>
                                    <tbody>
                                        {leitura.debitos.lista.map(x => <tr key={x.codReceita} className="border-t border-slate-100 dark:border-slate-700"><td className="p-1 font-mono">{x.codReceita}</td><td className="p-1">{x.descricao}</td><td className="p-1 text-right">{reais(Number(x.valor) || 0)}</td></tr>)}
                                        <tr className="border-t font-semibold"><td className="p-1" colSpan={2}>Total</td><td className="p-1 text-right">{reais(total)}</td></tr>
                                    </tbody>
                                </table>
                            ) : <p className="mt-1">Nenhum débito com saldo a pagar.</p>
                        ) : <p className="mt-1 text-amber-700 dark:text-amber-300">Débitos indisponíveis: {leitura.debitos.erro}</p>}
                        <p className="mt-2 text-xs text-slate-500">Para conferir com o S-5011 (por código de receita), use Conferência › Conferência pós-folha.</p>
                    </div>

                    <div className="flex flex-wrap items-start gap-4 rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-700 dark:text-slate-100">
                        <div className="space-y-2">
                            <h3 className="font-semibold">DARF</h3>
                            <button className={`${btn} bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900`} disabled={!!ocupado || !acoes.podeEmitirDarf} onClick={emitirDarf}>
                                {acoes.darfEmAndamento ? 'Emitir DARF (declaração em andamento)' : 'Emitir DARF (declaração ativa)'}
                            </button>
                            {darf && (
                                <p className="text-xs">
                                    {darf.valor !== null ? `Valor ${reais(darf.valor)} · ` : ''}{darf.vencimento ? `vencimento ${darf.vencimento} · ` : ''}{darf.numeroDocumento ? `documento ${darf.numeroDocumento}` : ''}
                                    {darf.codigoBarras && <span className="block font-mono">{darf.codigoBarras}</span>}
                                </p>
                            )}
                        </div>
                        <div className="min-w-[18rem] flex-1 space-y-2">
                            <h3 className="font-semibold">{acoes.retificadora ? 'Retificadora' : 'Transmissão'}</h3>
                            {acoes.retificadora && (
                                <label className="block text-xs">Motivo da retificadora
                                    <textarea aria-label="Motivo da retificadora" className="mt-1 block w-full rounded border border-slate-300 p-2 dark:border-slate-600 dark:bg-slate-900" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: S-1200 retificado depois da transmissão de 12/10" />
                                </label>
                            )}
                            {!acoes.podeTransmitir && (
                                <details className="text-xs">
                                    <summary className="cursor-pointer">Sou do Fiscal (ou admin) e vou transmitir com insumo pendente</summary>
                                    <label className="mt-1 flex items-center gap-1"><input type="checkbox" checked={comPendencia} onChange={e => setComPendencia(e.target.checked)} />Confirmo: transmitir sem o insumo pendente</label>
                                    <textarea aria-label="Justificativa" className="mt-1 block w-full rounded border border-slate-300 p-2 dark:border-slate-600 dark:bg-slate-900" rows={2} value={justificativa} onChange={e => setJustificativa(e.target.value)} placeholder="Por que transmitir agora, sem o insumo do outro departamento?" />
                                </details>
                            )}
                            <button className={`${btn} bg-green-700 text-white`} disabled={!!ocupado || !leitura.situacao.ok || (!acoes.podeTransmitir && !comPendencia)} onClick={transmitir}>
                                {acoes.retificadora ? 'Transmitir a retificadora' : 'Transmitir a DCTFWeb'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </section>
    );
};

export default DctfwebFolhaPanel;
