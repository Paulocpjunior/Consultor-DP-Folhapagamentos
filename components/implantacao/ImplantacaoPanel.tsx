import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CAMPOS, consolidar, digitos, lerXml, type Cadastro, type Campo } from '../../services/implantacao/implantacao';
import { csvConferencia, hashArquivo, lerDossie, novoDossie, type Dossie } from '../../services/implantacao/dossie';
import { downloadFile } from '../../services/folha/apontamentoExporter';

import { guardarSessao, lerSessao } from '../../services/implantacao/sessao';

const input = 'w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 text-sm';
const button = 'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40';

export default function ImplantacaoPanel({ usuario }: { usuario: string }) {
    const [dossie, setDossie] = useState<Dossie>(() => lerSessao(usuario)?.dossie || novoDossie());
    const [erros, setErros] = useState<string[]>([]);
    const [ocupado, setOcupado] = useState(false);
    const [alterado, setAlterado] = useState(lerSessao(usuario)?.alterado || false);
    const [selecionado, setSelecionado] = useState('');
    const [pdf, setPdf] = useState<{ url: string; nome: string } | null>(null);
    const [busca, setBusca] = useState('');
    const abrirRef = useRef<HTMLInputElement>(null);
    const bloqueado = useRef(false);
    const atualizar = (d: Dossie) => { setDossie(d); setAlterado(true); };
    useEffect(() => { guardarSessao(usuario, dossie, alterado); }, [usuario, dossie, alterado]);
    useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);
    useEffect(() => {
        if (!alterado) return;
        const antes = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', antes);
        return () => window.removeEventListener('beforeunload', antes);
    }, [alterado]);
    const leitura = useMemo(() => {
        const eventos = []; const avisos: string[] = [];
        for (const f of dossie.fontes) {
            try { const r = lerXml(f); eventos.push(...r.eventos); avisos.push(...r.avisos); }
            catch (e) { avisos.push(`${f.nome}: ${(e as Error).message}`); }
        }
        return { eventos, avisos };
    }, [dossie.fontes]);
    const resultado = useMemo(() => consolidar(leitura.eventos, dossie.cnpj, dossie.corte, dossie.complementos), [leitura, dossie]);
    const avisos = [...leitura.avisos, ...resultado.avisos];
    const atual = resultado.cadastros.find(c => c.chave === selecionado);
    const filtrados = resultado.cadastros.filter(c => `${c.dados.nome || ''} ${c.cpf} ${c.matricula}`.toLocaleLowerCase().includes(busca.toLocaleLowerCase()));

    async function importar(files: FileList | null) {
        if (!files || bloqueado.current) return;
        bloqueado.current = true; setOcupado(true); setErros([]);
        const novas = [...dossie.fontes]; const problemas: string[] = [];
        try {
            for (const f of Array.from(files)) {
                try {
                    if (!/\.xml$/i.test(f.name)) throw new Error('Selecione arquivos XML.');
                    if (f.size > 10 * 1024 * 1024 || novas.length >= 200) throw new Error('Limite: 10 MB por XML e 200 arquivos.');
                    const xml = await f.text();
                    // Hash do texto UTF-8 usado na leitura e na reabertura do dossiê.
                    const hash = await hashArquivo(new TextEncoder().encode(xml).buffer);
                    if (novas.some(n => n.hash === hash)) continue;
                    const fonte = { nome: f.name, xml, hash };
                    lerXml(fonte);
                    if (novas.reduce((n, a) => n + a.xml.length, xml.length) > 20 * 1024 * 1024) throw new Error('Limite total de XMLs: 20 MB.');
                    if (new Blob([JSON.stringify({ ...dossie, fontes: [...novas, fonte] })]).size > 25 * 1024 * 1024) throw new Error('Dossiê excede 25 MB; divida os arquivos em lotes menores.');
                    novas.push(fonte);
                } catch (e) { problemas.push(`${f.name}: ${(e as Error).message}`); }
            }
            atualizar({ ...dossie, fontes: novas }); setErros(problemas);
        } finally { bloqueado.current = false; setOcupado(false); }
    }
    async function abrir(file?: File) {
        if (!file || bloqueado.current) return;
        if (alterado && !window.confirm('Substituir o dossiê atual? Baixe-o antes se quiser preservar suas alterações.')) return;
        bloqueado.current = true; setOcupado(true); setErros([]);
        try {
            if (file.size > 30 * 1024 * 1024) throw new Error('Dossiê excede 30 MB.');
            const novo = lerDossie(await file.text());
            for (const f of novo.fontes) {
                if (await hashArquivo(new TextEncoder().encode(f.xml).buffer) !== f.hash) throw new Error(`Conteúdo XML alterado: ${f.nome}.`);
                lerXml(f);
            }
            setDossie(novo); setAlterado(false); setSelecionado(''); setPdf(null);
        } catch (e) { setErros([(e as Error).message]); }
        finally { bloqueado.current = false; setOcupado(false); }
    }
    async function anexarPdf(file?: File) {
        if (!file || bloqueado.current) return;
        bloqueado.current = true; setOcupado(true); setErros([]);
        try {
            if (file.size > 15 * 1024 * 1024) throw new Error('PDF excede 15 MB.');
            const bytes = await file.arrayBuffer();
            if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Arquivo não é PDF válido.');
            const hash = await hashArquivo(bytes);
            setPdf({ url: URL.createObjectURL(file), nome: file.name });
            if (!dossie.documentos.some(p => p.hash === hash)) atualizar({ ...dossie, documentos: [...dossie.documentos, { nome: file.name, tamanho: file.size, hash }] });
        } catch (e) { setErros([(e as Error).message]); }
        finally { bloqueado.current = false; setOcupado(false); }
    }
    return <section className="space-y-4 text-slate-800 dark:text-slate-100">
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xl font-bold">Implantação de funcionários</h3><a className="text-sm font-semibold text-blue-700 underline dark:text-blue-300" href={`${import.meta.env.BASE_URL}manuais/implantacao-funcionarios.html`} target="_blank" rel="noopener noreferrer">Manual passo a passo ↗</a></div>
            <p className="mt-1 text-sm">Reúna XMLs do eSocial e confira os dados com os documentos do cliente.</p>
            <p className="mt-2 text-sm">O dossiê fica nesta sessão. Use <strong>Baixar dossiê</strong> para continuar depois. Documentos não são enviados ao eSocial ou à base operacional.</p>
        </div>
        {ocupado && <p role="status">Lendo e verificando arquivos…</p>}
        <fieldset disabled={ocupado} className="space-y-4 disabled:opacity-60">
            <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">CNPJ da empresa na implantação<input className={input} value={dossie.cnpj} maxLength={18} placeholder="14 dígitos" onChange={e => atualizar({ ...dossie, cnpj: digitos(e.target.value) })} /></label>
                <label className="text-sm font-medium">Data da implantação<input className={input} type="date" value={dossie.corte} onChange={e => atualizar({ ...dossie, corte: e.target.value })} /></label>
            </div>
            <p className="text-xs text-slate-500">O eSocial pode identificar o empregador pela raiz do CNPJ. O estabelecimento é conferido separadamente na ficha.</p>
            <div className="flex flex-wrap items-center gap-3">
                <label className={button + ' cursor-pointer'}>Adicionar XMLs<input aria-label="Adicionar XMLs" type="file" multiple accept=".xml" className="sr-only" onChange={e => { void importar(e.target.files); e.target.value = ''; }} /></label>
                <button className={button} onClick={() => abrirRef.current?.click()}>Abrir dossiê</button>
                <input ref={abrirRef} aria-label="Abrir dossiê" type="file" accept=".json" className="hidden" onChange={e => { void abrir(e.target.files?.[0]); e.target.value = ''; }} />
                <button className={button} disabled={!dossie.fontes.length} onClick={() => { downloadFile('dossie-implantacao.json', JSON.stringify(dossie, null, 2), 'application/json'); setAlterado(false); }}>Baixar dossiê{alterado ? ' *' : ''}</button>
                <button className={button} disabled={!resultado.cadastros.length} onClick={() => downloadFile('conferencia-implantacao.csv', csvConferencia(resultado.cadastros, avisos), 'text/csv;charset=utf-8')}>Baixar conferência CSV</button>
            </div>
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Exportação cadastral IOB pendente de homologação.</strong> O CSV é para conferência e não deve ser importado como cadastro na IOB. O layout de apontamentos mensais não cadastra funcionários.
            </div>
            {!!erros.length && <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{erros.map((e, i) => <p key={i}>{e}</p>)}</div>}
            {!!avisos.length && <details open className="rounded border border-amber-300 p-3 text-sm"><summary className="font-semibold">{avisos.length} aviso(s) sobre o conjunto de arquivos</summary><ul className="list-disc pl-5">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul></details>}
            <details className="rounded border border-slate-300 p-3 text-sm"><summary>Fontes: {dossie.fontes.length} XML(s) e {dossie.documentos.length} documento(s) de referência</summary>
                <ul className="mt-2 space-y-1">{dossie.fontes.map(f => <li key={f.hash} className="flex justify-between gap-2"><span className="break-all">{f.nome} · SHA-256 {f.hash.slice(0, 12)}</span><button className="text-red-600 underline" onClick={() => { if (window.confirm(`Remover ${f.nome} deste dossiê?`)) atualizar({ ...dossie, fontes: dossie.fontes.filter(x => x.hash !== f.hash) }); }}>Remover</button></li>)}</ul>
                {dossie.documentos.map(p => <p key={p.hash} className="break-all">PDF: {p.nome} · SHA-256 {p.hash.slice(0, 12)}</p>)}
            </details>
            <div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-bold">{resultado.cadastros.length} vínculo(s) identificado(s)</h4><input aria-label="Buscar funcionário" className={input + ' sm:!w-72'} value={busca} placeholder="Buscar nome, CPF ou matrícula" onChange={e => setBusca(e.target.value)} /></div>
            {!resultado.cadastros.length && <p className="rounded border border-dashed p-6 text-center text-sm text-slate-500">Informe o CNPJ e importe os XMLs. Para montar o cadastro completo, inclua o S-2200 e suas alterações.</p>}
            {!!filtrados.length && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Funcionário / CPF</th><th className="p-2">Matrícula eSocial</th><th className="p-2">Cargo</th><th className="p-2">Pendências</th><th className="p-2">Conferência</th></tr></thead><tbody>{filtrados.map(c => <tr key={c.chave} className="border-b"><td className="p-2">{c.dados.nome || 'Nome não informado'}<br /><span className="text-xs text-slate-500">{c.cpf}</span></td><td className="p-2 font-mono">{c.matricula}</td><td className="p-2">{c.dados.cargo || '—'}</td><td className="p-2">{c.pendencias.length || 'Revisar cadastro'}</td><td className="p-2"><button className="text-blue-600 underline" onClick={() => setSelecionado(c.chave)}>Conferir ficha</button></td></tr>)}</tbody></table></div>}
            {atual && <Ficha key={atual.chave} cadastro={atual} fontePdf={pdf?.nome || ''} onSalvar={(campo, valor, fonte, justificativa) => atualizar({ ...dossie, complementos: [...dossie.complementos, { empregador: atual.empregador, cpf: atual.cpf, matricula: atual.matricula, campo, valor, fonte, justificativa, registradoEm: new Date().toISOString() }] })} />}
            <div className="rounded border border-slate-300 p-4">
                <h4 className="font-semibold">Documento complementar do cliente</h4>
                <p className="my-2 text-sm">Abra a ficha PDF e confira empregador e CPF antes de registrar um complemento. Nesta versão, a leitura do PDF é visual; não há extração automática por OCR.</p>
                <label className="text-sm">Abrir ficha PDF<input aria-label="Abrir ficha PDF" className="mt-2 block" type="file" accept=".pdf" onChange={e => { void anexarPdf(e.target.files?.[0]); e.target.value = ''; }} /></label>
                <p className="mt-2 text-xs text-slate-500">O dossiê guarda nome e hash do PDF; mantenha o arquivo original para reabri-lo depois.</p>
                {pdf && <><p className="my-2 text-sm">{pdf.nome}</p><object aria-label="Ficha PDF para conferência" data={pdf.url} type="application/pdf" className="h-[650px] w-full"><a href={pdf.url} target="_blank" rel="noreferrer">Abrir PDF para conferir</a></object></>}
            </div>
        </fieldset>
    </section>;
}

function Ficha({ cadastro: c, fontePdf, onSalvar }: { cadastro: Cadastro; fontePdf: string; onSalvar: (campo: Campo, valor: string, fonte: string, motivo: string) => void }) {
    const [campo, setCampo] = useState<Campo>('nome');
    const [valor, setValor] = useState('');
    const [fonte, setFonte] = useState('');
    const [motivo, setMotivo] = useState('');
    const [confirmado, setConfirmado] = useState(false);
    return <div className="space-y-3 rounded-xl border border-blue-300 p-4">
        <h4 className="font-bold">Ficha em conferência · {c.dados.nome || c.cpf} · matrícula {c.matricula}</h4>
        {!!c.pendencias.length && <ul className="list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">{c.pendencias.map((p, i) => <li key={i}>{p}</li>)}</ul>}
        <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Campo</th><th className="p-2">Valor</th><th className="p-2">Origem</th></tr></thead><tbody>{(Object.keys(CAMPOS) as Campo[]).map(k => <tr key={k} className="border-t"><td className="p-2">{CAMPOS[k]}</td><td className="p-2 break-words">{c.dados[k] || 'Não informado'}</td><td className="p-2 text-xs text-slate-500">{c.origens[k] || '—'}</td></tr>)}</tbody></table></div>
        <details><summary className="cursor-pointer text-sm">Eventos que compõem esta ficha ({c.eventos.length})</summary>{c.eventos.map(e => <p key={e.id} className="break-all text-xs">{e.tipo} · {e.data || 'sem data'} · {e.fonte} · recibo {e.recibo || 'não disponível'}</p>)}</details>
        <h5 className="font-semibold">Registrar informação conferida</h5>
        <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Campo<select className={input} value={campo} onChange={e => { setCampo(e.target.value as Campo); setValor(''); setConfirmado(false); }}>{Object.entries(CAMPOS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label>
            <label className="text-sm">Valor confirmado<input className={input} value={valor} maxLength={4000} onChange={e => setValor(e.target.value)} placeholder="Datas: AAAA-MM-DD" /></label>
            <label className="text-sm">Documento ou responsável pela informação<input className={input} value={fonte} maxLength={1000} onChange={e => setFonte(e.target.value)} placeholder={fontePdf || 'Ex.: ficha cadastral enviada pelo cliente'} /></label>
            <label className="text-sm">Justificativa da inclusão/alteração<input className={input} value={motivo} maxLength={1000} onChange={e => setMotivo(e.target.value)} /></label>
        </div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmado} onChange={e => setConfirmado(e.target.checked)} />Conferi que a informação pertence ao empregador {c.empregador}, CPF {c.cpf} e matrícula {c.matricula}.</label>
        <button className={button} disabled={!confirmado || !valor.trim() || !fonte.trim() || !motivo.trim()} onClick={() => { onSalvar(campo, valor.trim(), fonte.trim(), motivo.trim()); setValor(''); setMotivo(''); setConfirmado(false); }}>Registrar complemento</button>
        <p className="text-xs text-slate-500">Os XMLs originais são preservados. Complementos ficam registrados no dossiê e não removem pendências de histórico.</p>
    </div>;
}
