// components/pacoteCliente/PacoteClienteModal.tsx
//
// "Pacote do cliente": um .zip com os holerites ou recibos, o resumo da folha,
// o arquivo bancário para importar no banco, o convite de agenda com o
// pagamento e as guias, e o LEIA-ME. O arquivo bancário é o mesmo do botão
// "Arquivo bancário" (mesma conta, mesma numeração).

import React, { useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import { salvarContasPagamento } from '../../services/empresas/empresasService';
import { PERFIS_BANCO, ROTULO_FORMA, avisoConferencia, gerarRemessa, type ContaPagamento } from '../../services/bancario/cnab240';
import { favorecidosDaFolha } from '../../services/bancario/favorecidos';
import { gerarIcs, type EventoAgenda } from '../../services/agenda/convite';
import { leiaMe, nomeSeguro, type ArquivoDoPacote } from '../../services/pacoteCliente/pacote';
import { baixarBytes, gerarZip, type ArquivoZip } from '../../services/implantacao/zip';
import { reais } from '../../services/cadastros/documentos';
import ConviteAgenda from '../agenda/ConviteAgenda';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

/** PDF do pacote, gerado só na hora de baixar. */
export interface DocumentoPacote { id: string; rotulo: string; nome: string; descricao: string; gerar: () => Uint8Array | ArrayBuffer }

interface Props {
    empresa: Empresa;
    resultados: ResultadoCalculo[];
    fichas: FichaFuncionario[];
    titulo: string;
    /** Parte do nome dos arquivos (ex.: "2026-09", "ferias-2026-10"). */
    sufixo: string;
    documentos: DocumentoPacote[];
    dataSugerida: string;
    dataPorResultado?: (r: ResultadoCalculo) => string | undefined;
    /** Eventos da agenda para a data de pagamento escolhida. */
    eventos: (dataPagamento: string) => EventoAgenda[];
    onFechar: () => void;
    onContasSalvas?: (contas: ContaPagamento[]) => void;
}

const PacoteClienteModal: React.FC<Props> = ({ empresa, resultados, fichas, titulo, sufixo, documentos, dataSugerida, dataPorResultado, eventos, onFechar, onContasSalvas }) => {
    const contas = empresa.contasPagamento ?? [];
    const [incluir, setIncluir] = useState<Record<string, boolean>>(() => Object.fromEntries([...documentos.map(d => [d.id, true]), ['banco', contas.length > 0], ['agenda', true]]));
    const [contaId, setContaId] = useState(contas[0]?.id ?? '');
    const [data, setData] = useState(dataSugerida);
    const [usarDataDoRecibo, setUsarDataDoRecibo] = useState(!!dataPorResultado);
    const [preferirPix, setPreferirPix] = useState(false);
    const [msg, setMsg] = useState(''); const [erro, setErro] = useState(''); const [gerando, setGerando] = useState(false);
    const conta = contas.find(c => c.id === contaId) ?? null;
    const nomeEmpresa = empresa.nomeFantasia || empresa.razaoSocial;
    const prefixo = `${empresa.codigoSage || nomeSeguro(nomeEmpresa)}-${sufixo}`;

    const { favorecidos, foraDoCalculo } = useMemo(
        () => favorecidosDaFolha(resultados, fichas, data, usarDataDoRecibo ? dataPorResultado : undefined),
        [resultados, fichas, data, usarDataDoRecibo, dataPorResultado]);
    const remessa = useMemo(() => {
        if (!incluir.banco || !conta) return null;
        try { return { r: gerarRemessa({ conta, cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial, favorecidos, preferirPix }), erro: '' }; }
        catch (e) { return { r: null, erro: (e as Error).message }; }
    }, [incluir.banco, conta, empresa, favorecidos, preferirPix]);
    const listaEventos = useMemo(() => (incluir.agenda ? eventos(data) : []), [incluir.agenda, eventos, data]);
    const foraDoArquivo = remessa?.r ? [...foraDoCalculo, ...remessa.r.excluidos.map(e => ({ nome: e.favorecido.nome, motivo: e.motivo }))] : [];
    const marcados = documentos.filter(d => incluir[d.id]).length + (remessa?.r?.incluidos.length ? 1 : 0) + (listaEventos.length ? 1 : 0);

    async function baixar() {
        setErro(''); setMsg('');
        const r = remessa?.r;
        if (incluir.banco && !r) { setErro(remessa?.erro || 'Escolha a conta da empresa para o arquivo bancário.'); return; }
        if (r && !r.incluidos.length) { setErro('Nenhum funcionário com dados bancários para o arquivo; desmarque o arquivo bancário ou acerte as fichas.'); return; }
        if (r?.naoConferidas.length && !window.confirm(`${avisoConferencia(r.perfil, r.naoConferidas)}\n\nO LEIA-ME vai pedir ao cliente para conferir os pagamentos na tela do banco antes de autorizar. Continuar?`)) return;
        setGerando(true);
        try {
            const arquivos: ArquivoZip[] = []; const descritos: ArquivoDoPacote[] = [];
            for (const d of documentos.filter(x => incluir[x.id])) {
                const bytes = d.gerar();
                arquivos.push({ nome: d.nome, conteudo: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes) });
                descritos.push({ nome: d.nome, descricao: d.descricao });
            }
            if (r) {
                arquivos.push({ nome: r.nomeArquivo, conteudo: r.conteudo });
                descritos.push({ nome: r.nomeArquivo, descricao: `arquivo bancário (${r.perfil.nome}) com ${r.incluidos.length} pagamento(s), ${reais(r.total)}` });
            }
            const ics = `agenda-${prefixo}.ics`;
            if (listaEventos.length) {
                arquivos.push({ nome: ics, conteudo: gerarIcs(listaEventos, `${nomeEmpresa}: ${titulo}`) });
                descritos.push({ nome: ics, descricao: `convite de agenda com ${listaEventos.length} evento(s): pagamento e guias` });
            }
            const agora = new Date();
            arquivos.unshift({ nome: 'LEIA-ME.txt', conteudo: leiaMe({ empresa: { nome: empresa.razaoSocial, cnpj: empresa.cnpj }, titulo, arquivos: descritos, remessa: r ?? undefined, foraDoArquivo, eventos: listaEventos, geradoEm: agora }) });
            const nomeZip = `pacote-${prefixo}.zip`;
            baixarBytes(nomeZip, gerarZip(arquivos, agora), 'application/zip');
            let nsa = '';
            if (r && conta) {
                // Próximo arquivo com o número seguinte, como no "Arquivo bancário".
                const novas = contas.map(c => (c.id === conta.id ? { ...c, proximoNsa: r.nsa + 1 } : c));
                try { await salvarContasPagamento(empresa.id, novas); onContasSalvas?.(novas); nsa = ` Próximo arquivo bancário: nº ${r.nsa + 1}.`; }
                catch (e) { setErro(`Pacote baixado, mas a numeração do arquivo bancário não foi gravada (${(e as Error).message}). Ajuste o próximo nº na conta antes do próximo arquivo.`); }
            }
            setMsg(`${nomeZip} baixado com ${arquivos.length} arquivo(s).${nsa} Anexe ao e-mail ou ao WhatsApp do cliente.`);
        } catch (e) { setErro(`Não foi possível montar o pacote: ${(e as Error).message}`); }
        finally { setGerando(false); }
    }

    const marca = (id: string, rotulo: React.ReactNode, desabilitado = false) => (
        <label className={`flex items-center gap-1 ${desabilitado ? 'opacity-50' : ''}`}>
            <input type="checkbox" disabled={desabilitado} checked={!!incluir[id] && !desabilitado} onChange={e => setIncluir(x => ({ ...x, [id]: e.target.checked }))} />{rotulo}
        </label>
    );
    return (
        <div role="dialog" aria-label="Pacote do cliente" className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4">
            <div className="w-full max-w-3xl space-y-3 rounded-lg bg-white p-4 text-sm shadow-xl dark:bg-slate-800 dark:text-slate-100">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h3 className="text-lg font-semibold">Pacote do cliente</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{nomeEmpresa} · {titulo} · um .zip para anexar ao e-mail ou ao WhatsApp</p>
                    </div>
                    <button className="text-slate-500" aria-label="Fechar" onClick={onFechar}>✕</button>
                </div>

                <section className="space-y-1 rounded border border-slate-200 p-2 dark:border-slate-700">
                    <p className="font-medium">No pacote</p>
                    {documentos.map(d => <div key={d.id}>{marca(d.id, d.rotulo)}</div>)}
                    {marca('banco', 'Arquivo bancário (.REM) para importar no banco', !contas.length)}
                    {!contas.length && <p className="pl-5 text-xs text-slate-500">Cadastre a conta da empresa no botão "Arquivo bancário" para incluir o arquivo.</p>}
                    {marca('agenda', 'Convite de agenda (.ics) com o pagamento e as guias')}
                    <p className="pl-5 text-xs text-slate-500">O LEIA-ME vai sempre: o que é cada arquivo, como importar no banco e quem pagar por fora.</p>
                </section>

                <section className="flex flex-wrap items-end gap-3 text-xs">
                    <label>Data do pagamento<input aria-label="Data do pagamento" type="date" className={`block ${inp}`} value={data} onChange={e => setData(e.target.value)} disabled={usarDataDoRecibo} /></label>
                    {dataPorResultado && <label className="flex items-center gap-1"><input type="checkbox" checked={usarDataDoRecibo} onChange={e => setUsarDataDoRecibo(e.target.checked)} />Data de cada recibo (até 2 dias antes do gozo)</label>}
                    {incluir.banco && contas.length > 0 && <>
                        <label>Conta da empresa<select aria-label="Conta da empresa" className={`block ${inp}`} value={contaId} onChange={e => setContaId(e.target.value)}>
                            {contas.map(c => <option key={c.id} value={c.id}>{c.banco} · {PERFIS_BANCO[c.banco]?.nome ?? ''} · ag. {c.agencia} · c/c {c.conta}</option>)}
                        </select></label>
                        <label className="flex items-center gap-1"><input type="checkbox" checked={preferirPix} onChange={e => setPreferirPix(e.target.checked)} />Pagar por PIX quando a ficha tiver chave</label>
                    </>}
                </section>

                {remessa?.erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{remessa.erro}</p>}
                {remessa?.r && (
                    <section aria-label="Arquivo bancário do pacote" className="space-y-1 text-xs">
                        <p><span className="font-medium">Arquivo bancário nº {remessa.r.nsa}:</span> {remessa.r.lotes.map(l => `${ROTULO_FORMA[l.forma]}: ${l.quantidade} · ${reais(l.total)}`).join(' | ') || 'nenhum pagamento'} · <strong>Total {reais(remessa.r.total)}</strong></p>
                        {remessa.r.naoConferidas.length > 0 && <p role="note" className="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{avisoConferencia(remessa.r.perfil, remessa.r.naoConferidas)}</p>}
                        {foraDoArquivo.length > 0 && (
                            <div className="rounded border border-red-200 p-2 text-red-800 dark:border-red-800 dark:text-red-200">
                                <p className="font-medium">Fora do arquivo ({foraDoArquivo.length}), vão no LEIA-ME para pagar por fora:</p>
                                <ul className="list-disc pl-5">{foraDoArquivo.map((e, i) => <li key={i}>{e.nome}: {e.motivo}</li>)}</ul>
                            </div>
                        )}
                    </section>
                )}

                {listaEventos.length > 0 && <ConviteAgenda eventos={listaEventos} titulo={`${nomeEmpresa}: ${titulo}`} nomeArquivo={`agenda-${prefixo}`} />}

                <div className="flex flex-wrap items-center gap-2">
                    <button className="rounded bg-green-700 px-3 py-2 font-medium text-white disabled:opacity-50" disabled={gerando || !marcados} onClick={baixar}>{gerando ? 'Montando…' : 'Baixar pacote (.zip)'}</button>
                    <span className="text-xs text-slate-500">Os PDFs saem como prévia enquanto o motor não for conferido com o IOB.</span>
                </div>
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            </div>
        </div>
    );
};

export default PacoteClienteModal;
