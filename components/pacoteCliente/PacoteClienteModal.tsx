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

import React, { useEffect, useMemo, useState } from 'react';
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
import { enviarEmailPeloEscritorio, enviarPeloSpConnect, templatesDoDp, valoresSugeridos, type ResultadoEmail, type ResultadoEnvio, type TemplateWhatsApp } from '../../services/pacoteCliente/spConnect';
import { reais } from '../../services/cadastros/documentos';
import ConviteAgenda from '../agenda/ConviteAgenda';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

/** PDF do pacote, gerado só na hora de baixar. */
export interface DocumentoPacote { id: string; rotulo: string; nome: string; descricao: string; gerar: () => Uint8Array | ArrayBuffer | Promise<Uint8Array | ArrayBuffer> }

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
interface Pronto {
    nomeZip: string; bytes: Uint8Array; itens: string[]; remessa?: ResultadoRemessa; foraDoArquivo: { nome: string; motivo: string }[]; eventos: EventoAgenda[];
    /** PDFs do pacote: o SP Connect leva um por envio (cabeçalho do template). */
    pdfs: { nome: string; descricao: string; bytes: Uint8Array }[];
}

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
            const arquivos: ArquivoZip[] = []; const descritos: ArquivoDoPacote[] = []; const pdfs: Pronto['pdfs'] = [];
            for (const d of documentos.filter(x => incluir[x.id])) {
                const gerado = await d.gerar();
                const bytes = gerado instanceof Uint8Array ? gerado : new Uint8Array(gerado);
                arquivos.push({ nome: d.nome, conteudo: bytes });
                descritos.push({ nome: d.nome, descricao: d.descricao });
                if (/\.pdf$/i.test(d.nome)) pdfs.push({ nome: d.nome, descricao: d.rotulo, bytes });
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
            setPronto({ nomeZip, bytes, itens, remessa: r ?? undefined, foraDoArquivo, eventos: listaEventos, pdfs });
            setPdfSp(pdfs[0]?.nome ?? ''); setEnviadoSp(null);
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

    // SP Connect: templates do DP com documento, lidos do CFI quando o pacote fica pronto.
    const [templates, setTemplates] = useState<TemplateWhatsApp[] | null>(null);
    const [erroTemplates, setErroTemplates] = useState('');
    const [templateSp, setTemplateSp] = useState('');
    const [variaveisSp, setVariaveisSp] = useState<Record<string, string>>({});
    const [pdfSp, setPdfSp] = useState('');
    const [enviandoSp, setEnviandoSp] = useState(false);
    const [enviadoSp, setEnviadoSp] = useState<ResultadoEnvio | null>(null);
    const temPronto = !!pronto;
    useEffect(() => {
        if (!temPronto || templates) return;
        let vivo = true;
        templatesDoDp().then(t => { if (!vivo) return; setTemplates(t); setTemplateSp(t[0]?.nome ?? ''); })
            .catch(e => { if (vivo) { setTemplates([]); setErroTemplates((e as Error).message); } });
        return () => { vivo = false; };
    }, [temPronto, templates]);
    const tplSp = templates?.find(t => t.nome === templateSp) ?? null;
    const competenciaSp = (/(\d{4})-(\d{2})/.exec(sufixo) ?? []).slice(1).reverse().join('/');
    // Sugestão por chave (contato, empresa, competência); o que a equipe digitar fica.
    const sugeridos = useMemo(() => valoresSugeridos((tplSp?.variaveis ?? []).map(v => v.chave), { contato: contato.nome, empresa: nomeEmpresa, titulo, competencia: competenciaSp || titulo }),
        [tplSp, contato.nome, nomeEmpresa, titulo, competenciaSp]);
    const valoresSp = { ...sugeridos, ...Object.fromEntries(Object.entries(variaveisSp).filter(([k]) => k in sugeridos)) };
    const faltandoSp = (tplSp?.variaveis ?? []).filter(v => !valoresSp[v.chave]?.trim()).map(v => v.rotulo || v.chave);
    const [enviandoEmail, setEnviandoEmail] = useState(false);
    const [enviadoEmail, setEnviadoEmail] = useState<ResultadoEmail | null>(null);
    async function enviarEmail() {
        if (!pronto || !emailValido(contato.email)) return;
        if (!window.confirm(`Enviar o e-mail com ${pronto.nomeZip} para ${contato.email}?\n\nSai da sua caixa do escritório, com a mensagem abaixo.`)) return;
        setEnviandoEmail(true); setErro(''); setMsg('');
        try {
            const r = await enviarEmailPeloEscritorio({ empresaId: empresa.id, cnpj: empresa.cnpj, empresaNome: nomeEmpresa, titulo, competencia: (/(\d{4}-\d{2})/.exec(sufixo) ?? [])[1] ?? '',
                para: contato.email ?? '', assunto, mensagem: texto, anexos: [{ nome: pronto.nomeZip, bytes: pronto.bytes, mime: 'application/zip' }] });
            setEnviadoEmail(r);
            setMsg(`E-mail enviado de ${r.remetente} para ${contato.email}${r.avisoRemetente ? ` (${r.avisoRemetente})` : ''}${r.copiaPara.length ? `, com cópia para ${r.copiaPara.join(', ')}` : ''}.`);
        } catch (e) { setErro(`E-mail: ${(e as Error).message}`); }
        finally { setEnviandoEmail(false); }
    }
    async function enviarSp() {
        const pdf = pronto?.pdfs.find(x => x.nome === pdfSp);
        if (!pronto || !whats || !tplSp || !pdf) return;
        if (!window.confirm(`Enviar pelo SP Connect (WhatsApp do escritório) para ${contato.whatsapp}?\n\nTemplate: ${tplSp.nome}\nArquivo: ${pdf.nome}`)) return;
        setEnviandoSp(true); setErro(''); setMsg('');
        try {
            const r = await enviarPeloSpConnect({ para: whats, template: tplSp.nome, variaveis: valoresSp, pdf, referencia: `${empresa.codigoSage || empresa.cnpj} · ${pronto.nomeZip}` });
            setEnviadoSp(r);
            setMsg(`Enviado pelo SP Connect para ${r.numeroEnviado} (template ${r.template}). O arquivo bancário, a agenda e o LEIA-ME seguem no .zip: mande por e-mail.`);
        } catch (e) { setErro(`SP Connect: ${(e as Error).message}`); }
        finally { setEnviandoSp(false); }
    }

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
        setPronto(null); setTextoEditado(null); setMsg(''); setErro(''); setEnviadoSp(null); setEnviadoEmail(null);
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
                        <section aria-label="SP Connect" className="space-y-1 rounded border border-emerald-300 p-2 text-xs dark:border-emerald-700">
                            <p className="font-medium">SP Connect: WhatsApp do escritório</p>
                            {templates === null && !erroTemplates && <p className="text-slate-500">Lendo os templates do Departamento Pessoal no SP Connect…</p>}
                            {erroTemplates && <p role="alert" className="text-red-700 dark:text-red-300">Templates do SP Connect não lidos: {erroTemplates}</p>}
                            {templates && !templates.length && !erroTemplates && (
                                <p role="note" className="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">Nenhum template do Departamento Pessoal (dp-folha) com documento no SP Connect. Um admin cria na Meta um modelo de utilidade com cabeçalho de DOCUMENTO e cadastra no CFI (⚙️ Config Admin › WhatsApp) no departamento dp-folha, marcando "tem documento". Até lá, use o e-mail ou o WhatsApp deste computador abaixo.</p>
                            )}
                            {templates && templates.length > 0 && (
                                <>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <label>Template<select aria-label="Template do SP Connect" className={`block w-full ${inp}`} value={templateSp} onChange={e => { setTemplateSp(e.target.value); setVariaveisSp({}); }}>
                                            {templates.map(t => <option key={t.nome} value={t.nome}>{t.nome}{t.descricao ? ` · ${t.descricao}` : ''}</option>)}
                                        </select></label>
                                        <label>Arquivo (um PDF por envio)<select aria-label="PDF do SP Connect" className={`block w-full ${inp}`} value={pdfSp} onChange={e => setPdfSp(e.target.value)}>
                                            {pronto.pdfs.map(x => <option key={x.nome} value={x.nome}>{x.descricao} ({x.nome})</option>)}
                                        </select></label>
                                        {(tplSp?.variaveis ?? []).map(v => (
                                            <label key={v.chave}>{v.rotulo || v.chave}<input aria-label={`Variável ${v.rotulo || v.chave}`} className={`block w-full ${inp}`} value={valoresSp[v.chave] ?? ''} onChange={e => setVariaveisSp(x => ({ ...x, [v.chave]: e.target.value }))} /></label>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button className="rounded bg-emerald-700 px-3 py-2 font-medium text-white disabled:opacity-50" disabled={!whats || !tplSp || !pronto.pdfs.length || faltandoSp.length > 0 || enviandoSp}
                                            title={!whats ? 'Informe o WhatsApp do contato' : faltandoSp.length ? `Preencha: ${faltandoSp.join(', ')}` : ''} onClick={enviarSp}>{enviandoSp ? 'Enviando…' : 'Enviar pelo SP Connect'}</button>
                                        {!pronto.pdfs.length && <span className="text-amber-700 dark:text-amber-300">O pacote não tem PDF: marque os holerites ou o resumo.</span>}
                                        {enviadoSp && <span className="text-emerald-700 dark:text-emerald-300">Enviado para {enviadoSp.numeroEnviado} ({enviadoSp.template}).</span>}
                                    </div>
                                    <p className="text-slate-500">Sai do número do escritório, com o modelo aprovado pela Meta e o PDF escolhido. O arquivo bancário, a agenda e o LEIA-ME vão no .zip, pelo e-mail.</p>
                                </>
                            )}
                        </section>
                        <label className="block text-xs">Mensagem<textarea aria-label="Mensagem ao cliente" rows={8} className={`block w-full font-mono ${inp}`} value={texto} onChange={e => setTextoEditado(e.target.value)} /></label>
                        <div className="flex flex-wrap gap-2">
                            {podeCompartilhar && <button className="rounded bg-green-700 px-3 py-2 font-medium text-white" onClick={compartilhar}>Compartilhar com o .zip (WhatsApp, e-mail…)</button>}
                            <button className="rounded bg-emerald-600 px-3 py-2 text-white disabled:opacity-50" disabled={!whats} title={whats ? '' : 'Informe o WhatsApp do contato'}
                                onClick={() => whats && abrir(linkWhatsApp(whats, texto), `WhatsApp aberto com a mensagem: anexe ${pronto.nomeZip} (pasta Downloads) na conversa.`)}>WhatsApp deste computador</button>
                            <button className="rounded bg-blue-800 px-3 py-2 font-medium text-white disabled:opacity-50" disabled={!emailValido(contato.email) || enviandoEmail} title={emailValido(contato.email) ? 'Sai da sua caixa do escritório (Microsoft 365), com o .zip em anexo' : 'Informe o e-mail do contato'}
                                onClick={enviarEmail}>{enviandoEmail ? 'Enviando…' : enviadoEmail ? 'E-mail enviado ✓' : 'Enviar e-mail pelo escritório'}</button>
                            <button className="rounded bg-blue-700 px-3 py-2 text-white disabled:opacity-50" disabled={!emailValido(contato.email)} title={emailValido(contato.email) ? '' : 'Informe o e-mail do contato'}
                                onClick={() => abrir(linkEmail(contato.email ?? '', assunto, texto), `E-mail aberto com a mensagem: anexe ${pronto.nomeZip} (pasta Downloads) antes de enviar.`)}>E-mail deste computador</button>
                            <button className="rounded border border-slate-300 px-3 py-2 dark:border-slate-600" onClick={copiar}>Copiar mensagem</button>
                        </div>
                        <p className="text-xs text-slate-500">"Enviar e-mail pelo escritório" sai da sua caixa do Microsoft 365 com o .zip anexado (até 3 MB) e fica registrado no CFI. Os botões "deste computador" usam o WhatsApp e o e-mail de quem está no computador, não o SP Connect. "Compartilhar" já leva o .zip (celular e navegadores que permitem); no WhatsApp e no e-mail, anexe o .zip baixado.</p>
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
