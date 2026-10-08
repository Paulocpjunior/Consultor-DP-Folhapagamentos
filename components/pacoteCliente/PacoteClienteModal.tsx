// components/pacoteCliente/PacoteClienteModal.tsx
//
// "Pacote do cliente": um .zip com os holerites ou recibos, o resumo da folha,
// o arquivo bancário para importar no banco, o convite de agenda com o
// pagamento e as guias, e o LEIA-ME. O arquivo bancário é o mesmo do botão
// "Arquivo bancário" (mesma conta, mesma numeração).
//
// O pacote é montado uma vez (o número do arquivo bancário avança uma vez) e
// depois enviado pelo próprio app: compartilhamento do aparelho com o .zip,
// ou WhatsApp e e-mail de quem está usando, com a mensagem pronta.

import React, { useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import { reservarNsa, salvarContatoEnvio } from '../../services/empresas/empresasService';
import { PERFIS_BANCO, ROTULO_FORMA, avisoConferencia, gerarRemessa, type ContaPagamento, type ResultadoRemessa } from '../../services/bancario/cnab240';
import { emailValido, linkEmail, linkWhatsApp, mensagemEnvio, numeroWhatsApp, type ContatoEnvio } from '../../services/pacoteCliente/envio';
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
    onContatoSalvo?: (contato: ContatoEnvio) => void;
}

/** Pacote já montado: o que vai para o cliente, congelado até "Refazer pacote". */
interface Pronto { nomeZip: string; bytes: Uint8Array; itens: string[]; remessa?: ResultadoRemessa; foraDoArquivo: { nome: string; motivo: string }[]; eventos: EventoAgenda[] }

const ASSINATURA = 'Departamento Pessoal · SP Assessoria Contábil';

const PacoteClienteModal: React.FC<Props> = ({ empresa, resultados, fichas, titulo, sufixo, documentos, dataSugerida, dataPorResultado, eventos, onFechar, onContasSalvas, onContatoSalvo }) => {
    const contas = empresa.contasPagamento ?? [];
    const [incluir, setIncluir] = useState<Record<string, boolean>>(() => Object.fromEntries([...documentos.map(d => [d.id, true]), ['banco', contas.length > 0], ['agenda', true]]));
    const [contaId, setContaId] = useState(contas[0]?.id ?? '');
    const [data, setData] = useState(dataSugerida);
    const [usarDataDoRecibo, setUsarDataDoRecibo] = useState(!!dataPorResultado);
    const [preferirPix, setPreferirPix] = useState(false);
    const [msg, setMsg] = useState(''); const [erro, setErro] = useState(''); const [gerando, setGerando] = useState(false);
    const [pronto, setPronto] = useState<Pronto | null>(null);
    const [contato, setContato] = useState<ContatoEnvio>(empresa.contatoEnvio ?? {});
    // A mensagem padrão acompanha o contato (nome na saudação); o que a equipe digitar no texto fica.
    const [textoEditado, setTextoEditado] = useState<string | null>(null);
    const [gravandoContato, setGravandoContato] = useState(false);
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

    async function montar() {
        setErro(''); setMsg('');
        let r = remessa?.r;
        if (incluir.banco && !r) { setErro(remessa?.erro || 'Escolha a conta da empresa para o arquivo bancário.'); return; }
        if (r && !r.incluidos.length) { setErro('Nenhum funcionário com dados bancários para o arquivo; desmarque o arquivo bancário ou acerte as fichas.'); return; }
        if (r?.naoConferidas.length && !window.confirm(`${avisoConferencia(r.perfil, r.naoConferidas)}\n\nO LEIA-ME vai pedir ao cliente para conferir os pagamentos na tela do banco antes de autorizar. Continuar?`)) return;
        setGerando(true);
        // O número do arquivo bancário é reservado antes de montar: sem a reserva gravada, o próximo sairia repetido.
        if (r && conta) {
            try {
                const res = await reservarNsa(empresa.id, conta.id);
                onContasSalvas?.(res.contas);
                r = gerarRemessa({ conta: { ...conta, proximoNsa: res.nsa }, cnpj: empresa.cnpj, razaoSocial: empresa.razaoSocial, favorecidos, preferirPix });
            } catch (e) { setErro(`Pacote não montado: não foi possível reservar o número do arquivo bancário (${(e as Error).message}).`); setGerando(false); return; }
        }
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
            const bytes = gerarZip(arquivos, agora);
            baixarBytes(nomeZip, bytes, 'application/zip');
            const itens = ['LEIA-ME com o que fazer com cada arquivo', ...descritos.map(d => d.descricao)];
            setPronto({ nomeZip, bytes, itens, remessa: r ?? undefined, foraDoArquivo, eventos: listaEventos });
            setTextoEditado(null);
            const nsa = r ? ` Próximo arquivo bancário: nº ${r.nsa + 1}.` : '';
            setMsg(`${nomeZip} baixado com ${arquivos.length} arquivo(s).${nsa} Envie ao cliente abaixo.`);
        } catch (e) { setErro(`Não foi possível montar o pacote: ${(e as Error).message}`); }
        finally { setGerando(false); }
    }

    const textoPadrao = useMemo(() => (pronto ? mensagemEnvio({ contato, empresa: nomeEmpresa, titulo, nomeZip: pronto.nomeZip, arquivos: pronto.itens, remessa: pronto.remessa, foraDoArquivo: pronto.foraDoArquivo, eventos: pronto.eventos, assinatura: ASSINATURA }) : ''),
        [pronto, contato, nomeEmpresa, titulo]);
    const texto = textoEditado ?? textoPadrao;
    const zipComoArquivo = (p: Pronto) => new File([p.bytes as BlobPart], p.nomeZip, { type: 'application/zip' });
    const podeCompartilhar = !!pronto && typeof navigator.canShare === 'function' && navigator.canShare({ files: [zipComoArquivo(pronto)] });
    const whats = numeroWhatsApp(contato.whatsapp);
    const assunto = `${titulo} · ${nomeEmpresa}`;

    async function compartilhar() {
        if (!pronto) return;
        try { await navigator.share({ files: [zipComoArquivo(pronto)], title: assunto, text: texto }); setMsg('Pacote compartilhado.'); }
        catch (e) { if ((e as Error).name !== 'AbortError') setErro(`Não foi possível compartilhar (${(e as Error).message}). Use o WhatsApp ou o e-mail abaixo e anexe o .zip baixado.`); }
    }
    function abrir(url: string, aviso: string) {
        const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        document.body.appendChild(a); a.click(); a.remove();
        setMsg(aviso);
    }
    async function copiar() {
        try { await navigator.clipboard.writeText(texto); setMsg('Mensagem copiada.'); }
        catch { setErro('Não foi possível copiar; selecione o texto da mensagem.'); }
    }
    async function gravarContato() {
        if (contato.email && !emailValido(contato.email)) { setErro('E-mail do contato inválido.'); return; }
        if (contato.whatsapp && !numeroWhatsApp(contato.whatsapp)) { setErro('WhatsApp com DDD, ex.: (11) 98888-7777.'); return; }
        setGravandoContato(true); setErro('');
        try { await salvarContatoEnvio(empresa.id, contato); onContatoSalvo?.(contato); setMsg('Contato gravado na empresa.'); }
        catch (e) { setErro(`Não foi possível gravar o contato (${(e as Error).message}).`); }
        finally { setGravandoContato(false); }
    }
    function refazer() {
        if (pronto?.remessa && !window.confirm(`Refazer o pacote gera um novo arquivo bancário (nº ${pronto.remessa.nsa + 1}). Envie ao banco só um dos dois. Continuar?`)) return;
        setPronto(null); setTextoEditado(null); setMsg(''); setErro('');
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

                <fieldset disabled={!!pronto} className="space-y-3">
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

                </fieldset>

                {!pronto && listaEventos.length > 0 && <ConviteAgenda eventos={listaEventos} titulo={`${nomeEmpresa}: ${titulo}`} nomeArquivo={`agenda-${prefixo}`} />}

                {!pronto ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <button className="rounded bg-green-700 px-3 py-2 font-medium text-white disabled:opacity-50" disabled={gerando || !marcados} onClick={montar}>{gerando ? 'Montando…' : 'Baixar pacote (.zip)'}</button>
                        <span className="text-xs text-slate-500">Os PDFs saem como prévia enquanto o motor não for conferido com o IOB.</span>
                    </div>
                ) : (
                    <section aria-label="Enviar ao cliente" className="space-y-2 rounded border border-green-200 p-2 dark:border-green-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">Enviar ao cliente</p>
                            <div className="flex gap-2 text-xs">
                                <button className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" onClick={() => baixarBytes(pronto.nomeZip, pronto.bytes, 'application/zip')}>Baixar o .zip de novo</button>
                                <button className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" onClick={refazer}>Refazer pacote</button>
                            </div>
                        </div>
                        <div className="grid gap-2 text-xs sm:grid-cols-3">
                            <label>Contato no cliente<input aria-label="Nome do contato" className={`block w-full ${inp}`} value={contato.nome ?? ''} onChange={e => setContato(c => ({ ...c, nome: e.target.value }))} /></label>
                            <label>E-mail<input aria-label="E-mail do contato" type="email" className={`block w-full ${inp}`} value={contato.email ?? ''} onChange={e => setContato(c => ({ ...c, email: e.target.value }))} /></label>
                            <label>WhatsApp<input aria-label="WhatsApp do contato" className={`block w-full ${inp}`} placeholder="(11) 98888-7777" value={contato.whatsapp ?? ''} onChange={e => setContato(c => ({ ...c, whatsapp: e.target.value }))} /></label>
                        </div>
                        <button className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-slate-600" disabled={gravandoContato} onClick={gravarContato}>{gravandoContato ? 'Gravando…' : 'Gravar contato na empresa'}</button>
                        <label className="block text-xs">Mensagem<textarea aria-label="Mensagem ao cliente" rows={8} className={`block w-full font-mono ${inp}`} value={texto} onChange={e => setTextoEditado(e.target.value)} /></label>
                        <div className="flex flex-wrap gap-2">
                            {podeCompartilhar && <button className="rounded bg-green-700 px-3 py-2 font-medium text-white" onClick={compartilhar}>Compartilhar com o .zip (WhatsApp, e-mail…)</button>}
                            <button className="rounded bg-emerald-600 px-3 py-2 text-white disabled:opacity-50" disabled={!whats} title={whats ? '' : 'Informe o WhatsApp do contato'}
                                onClick={() => whats && abrir(linkWhatsApp(whats, texto), `WhatsApp aberto com a mensagem: anexe ${pronto.nomeZip} (pasta Downloads) na conversa.`)}>Abrir WhatsApp</button>
                            <button className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={!emailValido(contato.email)} title={emailValido(contato.email) ? '' : 'Informe o e-mail do contato'}
                                onClick={() => abrir(linkEmail(contato.email ?? '', assunto, texto), `E-mail aberto com a mensagem: anexe ${pronto.nomeZip} (pasta Downloads) antes de enviar.`)}>Abrir e-mail</button>
                            <button className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600" onClick={copiar}>Copiar mensagem</button>
                        </div>
                        <p className="text-xs text-slate-500">Sai do WhatsApp e do e-mail de quem está usando o app. "Compartilhar" já leva o .zip (celular e navegadores que permitem); no WhatsApp e no e-mail, anexe o .zip baixado.</p>
                        {pronto.eventos.length > 0 && <ConviteAgenda eventos={pronto.eventos} titulo={`${nomeEmpresa}: ${titulo}`} nomeArquivo={`agenda-${prefixo}`} />}
                    </section>
                )}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            </div>
        </div>
    );
};

export default PacoteClienteModal;
