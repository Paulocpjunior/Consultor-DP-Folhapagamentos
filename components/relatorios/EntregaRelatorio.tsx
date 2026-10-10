// components/relatorios/EntregaRelatorio.tsx
//
// Envio de um relatório ao cliente: e-mail pelo escritório (CFI, para o contato cadastrado da empresa) e
// WhatsApp oficial (SP Connect, template do DP com o PDF) ou, sem template, o WhatsApp deste computador.

import React, { useEffect, useMemo, useState } from 'react';
import type { ContatoEnvio } from '../../services/pacoteCliente/envio';
import { emailValido, linkWhatsApp, numeroWhatsApp } from '../../services/pacoteCliente/envio';
import { enviarEmailPeloEscritorio, enviarPeloSpConnect, LIMITE_EMAIL_BYTES, LIMITE_EMAIL_TEXTO, templatesDoDp, valoresSugeridos, type TemplateWhatsApp } from '../../services/pacoteCliente/spConnect';
import { salvarContatoEnvio } from '../../services/empresas/empresasService';
import { ESCRITORIO } from '../../services/relatorios/layoutPdf';

export interface ArquivoRelatorio { nome: string; bytes: Uint8Array }
interface Props {
    empresa: { id: string; cnpj: string; nome: string; codigoSage?: string; contatoEnvio?: ContatoEnvio };
    titulo: string;
    competencia: string;
    gerar: () => Promise<ArquivoRelatorio>;
}

const inp = 'mt-0.5 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100';
const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

const EntregaRelatorio: React.FC<Props> = ({ empresa, titulo, competencia, gerar }) => {
    const [contato, setContato] = useState<ContatoEnvio>(empresa.contatoEnvio ?? {});
    const comp = competencia.split('-').reverse().join('/');
    const textoPadrao = `${contato.nome?.trim() ? `Olá, ${contato.nome.trim()}!` : 'Olá!'}\n\nSegue em anexo ${titulo.toLowerCase()} de ${comp} da ${empresa.nome}.\n\nQualquer dúvida, estamos à disposição.\n${ESCRITORIO.departamento} · ${ESCRITORIO.nome}`;
    const [texto, setTexto] = useState<string | null>(null);
    const mensagem = texto ?? textoPadrao;
    const [ocupado, setOcupado] = useState('');
    const [msg, setMsg] = useState('');
    const [erro, setErro] = useState('');
    const whats = numeroWhatsApp(contato.whatsapp);

    // SP Connect: templates do DP com documento (o PDF vai no cabeçalho da mensagem).
    const [templates, setTemplates] = useState<TemplateWhatsApp[] | null>(null);
    const [template, setTemplate] = useState('');
    useEffect(() => {
        let vivo = true;
        templatesDoDp().then(t => { if (vivo) { setTemplates(t); setTemplate(t[0]?.nome ?? ''); } }).catch(() => { if (vivo) setTemplates([]); });
        return () => { vivo = false; };
    }, []);
    const tpl = templates?.find(t => t.nome === template) ?? null;
    const variaveis = useMemo(() => valoresSugeridos((tpl?.variaveis ?? []).map(v => v.chave), { contato: contato.nome, empresa: empresa.nome, titulo, competencia: comp }), [tpl, contato.nome, empresa.nome, titulo, comp]);
    const faltando = (tpl?.variaveis ?? []).filter(v => !variaveis[v.chave]?.trim()).map(v => v.rotulo || v.chave);

    const agir = async (rotulo: string, f: () => Promise<string>) => {
        setOcupado(rotulo); setErro(''); setMsg('');
        try { setMsg(await f()); } catch (e) { setErro(`${rotulo}: ${(e as Error).message}`); } finally { setOcupado(''); }
    };
    const email = () => agir('E-mail', async () => {
        const a = await gerar();
        if (a.bytes.length > LIMITE_EMAIL_BYTES) throw new Error(`o PDF passa de ${LIMITE_EMAIL_TEXTO}; baixe e envie de outro jeito.`);
        if (!window.confirm(`Enviar ${a.nome} por e-mail para ${contato.email}?\n\nSai da sua caixa do escritório.`)) return '';
        const r = await enviarEmailPeloEscritorio({ empresaId: empresa.id, cnpj: empresa.cnpj, empresaNome: empresa.nome, titulo, competencia, para: contato.email ?? '', assunto: `${titulo} · ${comp} · ${empresa.nome}`, mensagem, anexos: [{ nome: a.nome, bytes: a.bytes, mime: 'application/pdf' }] });
        return `E-mail enviado de ${r.remetente} para ${contato.email}${r.copiaPara.length ? `, com cópia para ${r.copiaPara.join(', ')}` : ''}.`;
    });
    const spConnect = () => agir('WhatsApp', async () => {
        if (!whats || !tpl) return '';
        const a = await gerar();
        if (!window.confirm(`Enviar ${a.nome} pelo WhatsApp do escritório (SP Connect) para ${contato.whatsapp}?\n\nTemplate: ${tpl.nome}`)) return '';
        const r = await enviarPeloSpConnect({ para: whats, template: tpl.nome, variaveis, pdf: a, referencia: `${empresa.codigoSage || empresa.cnpj} · ${a.nome}` });
        return `Enviado pelo SP Connect para ${r.numeroEnviado} (template ${r.template}).`;
    });
    const mudouContato = JSON.stringify(contato) !== JSON.stringify(empresa.contatoEnvio ?? {});

    return (
        <section aria-label="Enviar ao cliente" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-900/40">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Enviar ao cliente</h3>
            <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs text-slate-600 dark:text-slate-300">Contato<input aria-label="Nome do contato" className={inp} value={contato.nome ?? ''} onChange={e => setContato(c => ({ ...c, nome: e.target.value }))} /></label>
                <label className="text-xs text-slate-600 dark:text-slate-300">E-mail cadastrado<input aria-label="E-mail do contato" className={inp} value={contato.email ?? ''} onChange={e => setContato(c => ({ ...c, email: e.target.value }))} /></label>
                <label className="text-xs text-slate-600 dark:text-slate-300">WhatsApp<input aria-label="WhatsApp do contato" className={inp} value={contato.whatsapp ?? ''} onChange={e => setContato(c => ({ ...c, whatsapp: e.target.value }))} /></label>
            </div>
            {mudouContato && <button className="text-xs font-medium text-blue-700 underline dark:text-blue-300" onClick={() => agir('Contato', async () => { await salvarContatoEnvio(empresa.id, contato); return 'Contato gravado na empresa.'; })}>Gravar este contato na empresa</button>}
            <label className="block text-xs text-slate-600 dark:text-slate-300">Mensagem<textarea aria-label="Mensagem do envio" rows={4} className={inp} value={mensagem} onChange={e => setTexto(e.target.value)} /></label>
            <div className="flex flex-wrap gap-2">
                <button className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50" disabled={!!ocupado || !emailValido(contato.email)} title={emailValido(contato.email) ? undefined : 'Informe o e-mail do contato.'} onClick={email}>
                    {ocupado === 'E-mail' ? 'Enviando…' : 'Enviar por e-mail (escritório)'}</button>
                {templates?.length ? (
                    <>
                        <select aria-label="Template do WhatsApp" className="rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={template} onChange={e => setTemplate(e.target.value)}>
                            {templates.map(t => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
                        </select>
                        <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50" disabled={!!ocupado || !whats || faltando.length > 0}
                            title={!whats ? 'Informe o WhatsApp do contato.' : faltando.length ? `Faltam no template: ${faltando.join(', ')}` : undefined} onClick={spConnect}>
                            {ocupado === 'WhatsApp' ? 'Enviando…' : 'WhatsApp do escritório (SP Connect)'}</button>
                    </>
                ) : whats ? (
                    <a className={btn} href={linkWhatsApp(whats, mensagem)} target="_blank" rel="noopener noreferrer" title="Abre o WhatsApp deste computador com a mensagem; anexe o PDF baixado.">WhatsApp deste computador</a>
                ) : null}
            </div>
            {templates && !templates.length && <p className="text-xs text-slate-500">Sem template do DP com documento no SP Connect: o WhatsApp abre deste computador, sem o anexo (baixe o PDF e anexe).</p>}
            {msg && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{msg}</p>}
            {erro && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{erro}</p>}
        </section>
    );
};

export default EntregaRelatorio;
