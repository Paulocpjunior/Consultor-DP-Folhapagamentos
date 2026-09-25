import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Cadastro, Complemento } from '../../services/implantacao/implantacao';
import type { Documento, Dossie } from '../../services/implantacao/dossie';
import { hashArquivo } from '../../services/implantacao/dossie';
import { lerFichaPdf } from '../../services/implantacao/lerPdf';
import { complementosDaUnificacao, unificar, xmlsAdmissao, type FichaLida } from '../../services/implantacao/unificacao';
import {
    LAYOUT_PADRAO, ORIGENS, TIPOS_CAMPO, carregarLayoutLocal, codificar, gerarRegistros, lerLayout, nomeArquivoTxtCadastro,
    posicoes, salvarLayoutLocal, serializarLayout, validarLayout, type CampoLayout, type LayoutCadastroIob, type OrigemCampo, type TipoCampo,
} from '../../services/implantacao/layoutCadastroIob';
import { gerarModeloCadastroIobXlsx, nomeArquivoModeloCadastro } from '../../services/implantacao/modeloCadastroExcel';
import { baixarBytes, gerarZip } from '../../services/implantacao/zip';

const input = 'w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 text-sm text-slate-900 dark:text-white';
const botao = 'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40';
const botaoSec = 'rounded border border-slate-400 px-3 py-2 text-sm disabled:opacity-40';

interface Props {
    usuario: string; dossie: Dossie; cadastros: Cadastro[]; avisos: string[];
    onAdicionarXmls: (arquivos: File[]) => Promise<void>;
    onDocumento: (doc: Documento) => void;
    onRegistrarComplementos: (complementos: Complemento[]) => void;
    onFechar: () => void;
}

/**
 * Cadastro IOB: recebe XMLs do eSocial e fichas PDF juntos, une por CNPJ/CPF/matrícula
 * e exporta TXT (layout configurável), Excel de cadastro e XMLs S-2200 puros.
 * Nunca gera eventos, referências ou valores de apontamento.
 */
export default function CadastroIobModal({ usuario, dossie, cadastros, avisos, onAdicionarXmls, onDocumento, onRegistrarComplementos, onFechar }: Props) {
    const ref = useRef<HTMLDialogElement>(null);
    const [fichas, setFichas] = useState<FichaLida[]>([]);
    const [erros, setErros] = useState<string[]>([]);
    const [mensagem, setMensagem] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [progresso, setProgresso] = useState('');
    const [layout, setLayout] = useState<LayoutCadastroIob>(() => carregarLayoutLocal(usuario) || LAYOUT_PADRAO);
    const [editor, setEditor] = useState(false);
    const [previa, setPrevia] = useState(false);
    const bloqueado = useRef(false);
    useEffect(() => {
        const anterior = document.activeElement as HTMLElement | null;
        const d = ref.current!;
        if (d.showModal) d.showModal(); else d.setAttribute('open', '');
        return () => { if (d.close) d.close(); anterior?.focus(); };
    }, []);
    const unificacao = useMemo(() => unificar(cadastros, fichas, dossie.cnpj), [cadastros, fichas, dossie.cnpj]);
    const txt = useMemo(() => gerarRegistros(unificacao.funcionarios, layout, dossie.cnpj), [unificacao, layout, dossie.cnpj]);
    const complementos = useMemo(() => complementosDaUnificacao(unificacao.funcionarios), [unificacao]);
    const errosLayout = validarLayout(layout);
    const total = unificacao.funcionarios.length;

    async function receber(lista: FileList | null) {
        if (!lista || bloqueado.current) return;
        bloqueado.current = true; setOcupado(true); setErros([]); setMensagem('');
        const problemas: string[] = [];
        try {
            const arquivos = Array.from(lista);
            const xmls = arquivos.filter(f => /\.xml$/i.test(f.name));
            const pdfs = arquivos.filter(f => /\.pdf$/i.test(f.name));
            for (const f of arquivos.filter(f => !xmls.includes(f) && !pdfs.includes(f))) problemas.push(`${f.name}: apenas XML do eSocial e PDF da ficha são aceitos.`);
            if (xmls.length) { setProgresso(`Lendo ${xmls.length} XML(s)…`); await onAdicionarXmls(xmls); }
            const novas = [...fichas];
            for (const f of pdfs) {
                try {
                    if (f.size > 15 * 1024 * 1024) throw new Error('PDF excede 15 MB.');
                    const bytes = await f.arrayBuffer();
                    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('Arquivo não é PDF válido.');
                    const hash = await hashArquivo(bytes);
                    if (novas.some(n => n.hash === hash)) continue;
                    setProgresso(`Extraindo ficha ${f.name}…`);
                    const ficha = await lerFichaPdf(bytes, setProgresso);
                    novas.push({ nome: f.name, hash, tamanho: f.size, ficha });
                    onDocumento({ nome: f.name, tamanho: f.size, hash });
                } catch (e) { problemas.push(`${f.name}: ${(e as Error).message}`); }
            }
            setFichas(novas);
        } finally { bloqueado.current = false; setOcupado(false); setProgresso(''); setErros(problemas); }
    }
    function baixarTxt() {
        if (!total) return;
        baixarBytes(nomeArquivoTxtCadastro(dossie.cnpj, layout), codificar(txt.conteudo, layout), 'text/plain');
        setMensagem(`TXT gerado com ${txt.registros.length} registro(s)${txt.tamanhoRegistro ? ` de ${txt.tamanhoRegistro} posições` : ''}. ${txt.erros.length ? 'Há alertas listados abaixo; revise antes de importar.' : 'Sem alertas de formatação.'}`);
    }
    function baixarExcel() {
        if (!total) return;
        baixarBytes(nomeArquivoModeloCadastro(dossie.cnpj), gerarModeloCadastroIobXlsx(dossie.cnpj, dossie.corte, unificacao.funcionarios, layout, [...avisos, ...unificacao.avisos], unificacao.fichasSemVinculo), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        setMensagem('Excel de cadastro gerado (abas Funcionários, Dependentes, Origem dos campos, Pendências, Layout TXT e Instruções).');
    }
    function baixarXmls() {
        const r = xmlsAdmissao(unificacao.funcionarios, dossie.fontes);
        if (!r.arquivos.length) { setErros(r.avisos.length ? r.avisos : ['Nenhum S-2200 aceito para exportar.']); return; }
        baixarBytes(`esocial-s2200-${dossie.cnpj.replace(/\D/g, '') || 'empresa'}.zip`, gerarZip(r.arquivos), 'application/zip');
        setErros(r.avisos);
        setMensagem(`${r.arquivos.length} XML(s) S-2200 no ZIP, um por vínculo, com assinatura original. Use na rotina "Importação de Dados por XML" da IOB, se disponível na sua versão.`);
    }
    function registrar() {
        onRegistrarComplementos(complementos);
        setMensagem(`${complementos.length} complemento(s) da ficha PDF registrado(s) no dossiê, com nome e hash do arquivo.`);
    }
    function aplicarLayout(novo: LayoutCadastroIob) { setLayout(novo); salvarLayoutLocal(usuario, novo); }
    function carregarLayoutArquivo(file?: File) {
        if (!file) return;
        file.text().then(t => { aplicarLayout(lerLayout(t)); setMensagem(`Layout "${file.name}" carregado.`); }).catch(e => setErros([`${file.name}: ${(e as Error).message}`]));
    }
    function importarLayoutExcel(file?: File) {
        if (!file) return;
        file.arrayBuffer().then(buf => {
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets['Layout TXT'];
            if (!ws) throw new Error('Planilha sem a aba "Layout TXT".');
            const linhas = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });
            const cab = linhas.findIndex(l => l[0] === 'Ordem' && l[1] === 'Campo');
            if (cab < 0) throw new Error('Aba "Layout TXT" sem cabeçalho de campos.');
            const invTipos = Object.fromEntries(Object.entries(TIPOS_CAMPO).map(([k, v]) => [v, k])) as Record<string, TipoCampo>;
            const campos: CampoLayout[] = linhas.slice(cab + 1).filter(l => l[1] && l[2]).map((l, i) => ({
                id: `${String(l[2])}_${i}`, rotulo: String(l[1]), origem: String(l[2]) as OrigemCampo, tamanho: Number(l[5]),
                tipo: invTipos[String(l[6])] || (String(l[6]) as TipoCampo), decimais: l[7] === '' ? undefined : Number(l[7]), obrigatorio: String(l[8]).toLowerCase() === 'sim',
                observacao: l[9] ? String(l[9]) : undefined,
            }));
            aplicarLayout({ ...layout, campos });
            setMensagem(`Layout com ${campos.length} campo(s) importado da aba "Layout TXT".`);
        }).catch(e => setErros([`${file.name}: ${(e as Error).message}`]));
    }
    return <dialog ref={ref} onCancel={e => { e.preventDefault(); if (!ocupado) onFechar(); }} aria-labelledby="titulo-cadastro-iob" className="w-[min(96vw,1100px)] max-h-[92vh] overflow-auto rounded-xl bg-white p-6 text-slate-800 shadow-xl backdrop:bg-black/50 dark:bg-slate-800 dark:text-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h3 id="titulo-cadastro-iob" className="text-xl font-bold">Cadastro IOB SAGE — unificar eSocial + ficha PDF</h3>
                <p className="mt-1 text-sm">Empresa {dossie.cnpj || 'não informada'} · implantação em {dossie.corte}. Sem eventos, referências ou valores: só dados cadastrais.</p>
            </div>
            <button className={botaoSec} disabled={ocupado} onClick={onFechar}>Fechar</button>
        </div>
        {ocupado && <p role="status" className="mt-3 text-sm">{progresso || 'Processando…'}</p>}
        <fieldset disabled={ocupado} className="mt-4 space-y-4 disabled:opacity-60">
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-slate-600 dark:bg-slate-900">
                <h4 className="font-semibold">1. Arquivos recebidos do eSocial e do cliente</h4>
                <p className="my-2 text-sm">Selecione de uma vez os XMLs (S-2200 e alterações) e as fichas PDF "Registro de Empregado". A união usa CNPJ, CPF e matrícula eSocial; nada é aplicado a outro vínculo.</p>
                <label className={botao + ' inline-block cursor-pointer'}>Adicionar XMLs e PDFs<input aria-label="Adicionar XMLs e PDFs" type="file" multiple accept=".xml,.pdf" className="sr-only" onChange={e => { void receber(e.target.files); e.target.value = ''; }} /></label>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{dossie.fontes.length} XML(s) no dossiê · {fichas.length} ficha(s) PDF lida(s) nesta sessão · {total} vínculo(s) identificado(s).</p>
                {!!unificacao.fichasSemVinculo.length && <ul className="mt-2 list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">{unificacao.fichasSemVinculo.map(x => <li key={x.nome}>{x.nome}: {x.motivo}</li>)}</ul>}
                {!!unificacao.avisos.length && <ul className="mt-2 list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">{unificacao.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
            </section>
            {!!erros.length && <div role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800">{erros.map((e, i) => <p key={i}>{e}</p>)}</div>}
            {mensagem && <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">{mensagem}</p>}
            <section>
                <h4 className="font-semibold">2. Funcionários unificados</h4>
                {!total && <p className="mt-2 rounded border border-dashed p-4 text-center text-sm text-slate-500">Nenhum vínculo ainda. Informe o CNPJ no painel e adicione os XMLs do eSocial.</p>}
                {!!total && <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Matrícula</th><th className="p-2">Funcionário / CPF</th><th className="p-2">Admissão</th><th className="p-2">Cargo</th><th className="p-2">Ficha PDF</th><th className="p-2">Da ficha</th><th className="p-2">Divergências</th><th className="p-2">Pendências</th></tr></thead><tbody>
                    {unificacao.funcionarios.map(f => <tr key={f.chave} className="border-b align-top">
                        <td className="p-2 font-mono">{f.matricula}</td>
                        <td className="p-2">{f.dados.nome || 'Nome não informado'}<br /><span className="text-xs text-slate-500">{f.cpf}</span></td>
                        <td className="p-2">{f.dados.admissao || '—'}</td>
                        <td className="p-2">{f.dados.cargo || '—'}</td>
                        <td className="p-2">{f.ficha ? <span className="text-green-700 dark:text-green-300">✔ {f.ficha.nome}</span> : <span className="text-amber-700 dark:text-amber-300">não localizada</span>}</td>
                        <td className="p-2">{f.complementosPdf.length ? `${f.complementosPdf.length} campo(s)` : '—'}</td>
                        <td className="p-2">{f.divergencias.length ? <details><summary className="cursor-pointer text-amber-700 dark:text-amber-300">{f.divergencias.length}</summary><ul className="text-xs">{f.divergencias.map(d => <li key={d.campo}>{d.rotulo}: XML "{d.xml}" × PDF "{d.pdf}"</li>)}</ul></details> : '—'}</td>
                        <td className="p-2">{f.pendencias.length ? <details><summary className="cursor-pointer">{f.pendencias.length}</summary><ul className="text-xs">{f.pendencias.map(p => <li key={p}>{p}</li>)}</ul></details> : 'nenhuma'}</td>
                    </tr>)}
                </tbody></table></div>}
                {!!complementos.length && <div className="mt-2 flex flex-wrap items-center gap-3 text-sm"><span>{complementos.length} campo(s) da ficha ainda não constam no dossiê.</span><button className={botaoSec} onClick={registrar}>Registrar complementos no dossiê</button></div>}
            </section>
            <section className="rounded-lg border border-slate-300 p-4 dark:border-slate-600">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold">3. Layout do TXT — {layout.nome}</h4>
                    <div className="flex flex-wrap gap-2">
                        <button className={botaoSec} onClick={() => setEditor(!editor)}>{editor ? 'Ocultar editor' : 'Editar layout'}</button>
                        <button className={botaoSec} onClick={() => setPrevia(!previa)} disabled={!total}>{previa ? 'Ocultar prévia' : 'Prévia do TXT'}</button>
                    </div>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{layout.campos.length} campos · {txt.tamanhoRegistro ? `${txt.tamanhoRegistro} posições por registro` : `separador "${layout.separador}"`} · datas {layout.formatoData} · {layout.codificacao} · {layout.quebraLinha}{layout.homologado ? ' · homologado' : ' · não homologado: confira na tela Layout da rotina IOB e ajuste aqui'}</p>
                {editor && <EditorLayout layout={layout} onChange={aplicarLayout} onReset={() => { aplicarLayout(LAYOUT_PADRAO); setMensagem('Layout padrão restaurado.'); }} onCarregar={carregarLayoutArquivo} onCarregarExcel={importarLayoutExcel} />}
                {!!errosLayout.length && <ul role="alert" className="mt-2 list-disc pl-5 text-sm text-red-700">{errosLayout.map(e => <li key={e}>{e}</li>)}</ul>}
                {previa && !!total && <pre aria-label="Prévia do TXT" className="mt-2 max-h-56 overflow-auto rounded bg-slate-900 p-2 font-mono text-xs text-green-200 whitespace-pre">{txt.conteudo}</pre>}
                {!!txt.erros.length && <details className="mt-2 text-sm" open><summary className="cursor-pointer text-amber-700 dark:text-amber-300">{txt.erros.length} alerta(s) de formatação do TXT</summary><ul className="list-disc pl-5">{txt.erros.map((e, i) => <li key={i}>{e}</li>)}</ul></details>}
                {txt.avisos.map(a => <p key={a} className="mt-2 text-xs text-amber-700 dark:text-amber-300">{a}</p>)}
            </section>
            <section>
                <h4 className="font-semibold">4. Exportar para a IOB</h4>
                <div className="mt-2 flex flex-wrap gap-3">
                    <button className={botao} disabled={!total || !!errosLayout.length} onClick={baixarTxt}>Baixar TXT de cadastro (Importação de Funcionários)</button>
                    <button className={botao} disabled={!total} onClick={baixarExcel}>Baixar Excel de cadastro</button>
                    <button className={botao} disabled={!total} onClick={baixarXmls}>Baixar XMLs S-2200 (ZIP)</button>
                    <button className={botaoSec} onClick={() => baixarBytes('layout-cadastro-iob.json', new TextEncoder().encode(serializarLayout(layout)), 'application/json')}>Baixar layout (JSON)</button>
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-300">
                    <li><strong>TXT:</strong> IOB Gestão Contábil › Folha de Pagamento › Utilitários › Importação de Funcionários/Base de Cálculo. Compare a tela "Layout" da rotina com a aba "Layout TXT" do Excel; ajuste posições no editor se necessário.</li>
                    <li><strong>Excel:</strong> conferência e preenchimento dos códigos internos da IOB (departamento, cargo, sindicato). Mesmo padrão do modelo de apontamentos, sem valores.</li>
                    <li><strong>XMLs S-2200:</strong> eventos originais, sem alteração, para a rotina "Importação de Dados por XML" (S-2200/S-2300/S-1030) quando disponível na versão da IOB.</li>
                    <li>A matrícula do eSocial é preservada como código do funcionário. Nenhum dado é enviado ao eSocial nem à SAGE por este app.</li>
                </ul>
            </section>
        </fieldset>
    </dialog>;
}

function EditorLayout({ layout, onChange, onReset, onCarregar, onCarregarExcel }: { layout: LayoutCadastroIob; onChange: (l: LayoutCadastroIob) => void; onReset: () => void; onCarregar: (f?: File) => void; onCarregarExcel: (f?: File) => void }) {
    const campos = posicoes(layout);
    const setCampo = (i: number, patch: Partial<CampoLayout>) => onChange({ ...layout, campos: layout.campos.map((c, j) => j === i ? { ...c, ...patch } : c) });
    const mover = (i: number, delta: number) => { const j = i + delta; if (j < 0 || j >= layout.campos.length) return; const lista = [...layout.campos]; [lista[i], lista[j]] = [lista[j], lista[i]]; onChange({ ...layout, campos: lista }); };
    const remover = (i: number) => onChange({ ...layout, campos: layout.campos.filter((_, j) => j !== i) });
    const adicionar = () => onChange({ ...layout, campos: [...layout.campos, { id: `campo_${Date.now()}`, rotulo: 'Novo campo', origem: 'branco', tamanho: 1, tipo: 'A' }] });
    const pequeno = input + ' !p-1 !text-xs';
    return <div className="mt-3 space-y-3 text-sm">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <label className="text-xs">Nome<input className={pequeno} value={layout.nome} onChange={e => onChange({ ...layout, nome: e.target.value })} /></label>
            <label className="text-xs">Datas<select className={pequeno} value={layout.formatoData} onChange={e => onChange({ ...layout, formatoData: e.target.value as LayoutCadastroIob['formatoData'] })}><option>DDMMAAAA</option><option>AAAAMMDD</option><option>DD/MM/AAAA</option></select></label>
            <label className="text-xs">Separador<select className={pequeno} value={layout.separador} onChange={e => onChange({ ...layout, separador: e.target.value })}><option value="">Posições fixas</option><option value=";">; (ponto e vírgula)</option><option value="|">| (barra)</option><option value="\t">Tabulação</option></select></label>
            <label className="text-xs">Codificação<select className={pequeno} value={layout.codificacao} onChange={e => onChange({ ...layout, codificacao: e.target.value as LayoutCadastroIob['codificacao'] })}><option>ANSI</option><option>UTF-8</option></select></label>
            <label className="text-xs">Quebra<select className={pequeno} value={layout.quebraLinha} onChange={e => onChange({ ...layout, quebraLinha: e.target.value as LayoutCadastroIob['quebraLinha'] })}><option>CRLF</option><option>LF</option></select></label>
            <label className="text-xs">Extensão<input className={pequeno} value={layout.extensao} maxLength={5} onChange={e => onChange({ ...layout, extensao: e.target.value })} /></label>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={layout.maiusculas} onChange={e => onChange({ ...layout, maiusculas: e.target.checked })} />Texto em maiúsculas</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={layout.homologado} onChange={e => onChange({ ...layout, homologado: e.target.checked })} />Layout homologado em base de teste da IOB</label>
        </div>
        <div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b"><th className="p-1">#</th><th className="p-1">Campo</th><th className="p-1">Origem</th><th className="p-1">Início</th><th className="p-1">Fim</th><th className="p-1">Tam.</th><th className="p-1">Tipo</th><th className="p-1">Dec.</th><th className="p-1">Constante</th><th className="p-1">Obrig.</th><th className="p-1">Ações</th></tr></thead><tbody>
            {campos.map((c, i) => <tr key={c.id} className="border-b">
                <td className="p-1">{i + 1}</td>
                <td className="p-1"><input aria-label={`Rótulo do campo ${i + 1}`} className={pequeno + ' min-w-[10rem]'} value={c.rotulo} onChange={e => setCampo(i, { rotulo: e.target.value })} /></td>
                <td className="p-1"><select aria-label={`Origem do campo ${i + 1}`} className={pequeno} value={c.origem} onChange={e => setCampo(i, { origem: e.target.value as OrigemCampo })}>{(Object.keys(ORIGENS) as OrigemCampo[]).map(k => <option key={k} value={k}>{ORIGENS[k]}</option>)}</select></td>
                <td className="p-1 font-mono">{c.inicio}</td><td className="p-1 font-mono">{c.fim}</td>
                <td className="p-1"><input aria-label={`Tamanho do campo ${i + 1}`} type="number" min={1} max={500} className={pequeno + ' w-16'} value={c.tamanho} onChange={e => setCampo(i, { tamanho: Number(e.target.value) })} /></td>
                <td className="p-1"><select aria-label={`Tipo do campo ${i + 1}`} className={pequeno} value={c.tipo} onChange={e => setCampo(i, { tipo: e.target.value as TipoCampo })}>{(Object.keys(TIPOS_CAMPO) as TipoCampo[]).map(t => <option key={t} value={t}>{TIPOS_CAMPO[t]}</option>)}</select></td>
                <td className="p-1">{c.tipo === 'V' && <input aria-label={`Decimais do campo ${i + 1}`} type="number" min={0} max={6} className={pequeno + ' w-14'} value={c.decimais ?? 2} onChange={e => setCampo(i, { decimais: Number(e.target.value) })} />}</td>
                <td className="p-1">{c.origem === 'constante' && <input aria-label={`Constante do campo ${i + 1}`} className={pequeno} value={c.constante || ''} onChange={e => setCampo(i, { constante: e.target.value })} />}</td>
                <td className="p-1"><input aria-label={`Obrigatório campo ${i + 1}`} type="checkbox" checked={!!c.obrigatorio} onChange={e => setCampo(i, { obrigatorio: e.target.checked })} /></td>
                <td className="p-1 whitespace-nowrap"><button className="px-1" title="Subir" onClick={() => mover(i, -1)}>↑</button><button className="px-1" title="Descer" onClick={() => mover(i, 1)}>↓</button><button className="px-1 text-red-600" title="Remover" onClick={() => remover(i)}>✕</button></td>
            </tr>)}
        </tbody></table></div>
        <div className="flex flex-wrap gap-2">
            <button className={botaoSec} onClick={adicionar}>Adicionar campo</button>
            <label className={botaoSec + ' cursor-pointer'}>Carregar layout JSON<input aria-label="Carregar layout JSON" type="file" accept=".json" className="sr-only" onChange={e => { onCarregar(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <label className={botaoSec + ' cursor-pointer'}>Importar aba "Layout TXT" de um Excel<input aria-label="Importar layout de Excel" type="file" accept=".xlsx" className="sr-only" onChange={e => { onCarregarExcel(e.target.files?.[0]); e.target.value = ''; }} /></label>
            <button className={botaoSec} onClick={onReset}>Restaurar padrão</button>
        </div>
        <p className="text-xs text-slate-500">As alterações ficam salvas neste navegador para o seu usuário. Baixe o layout JSON para compartilhar com a equipe.</p>
    </div>;
}
