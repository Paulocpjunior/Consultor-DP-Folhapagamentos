// components/relatorios/ModelosPanel.tsx
//
// Contratos e modelos (os "Textos" do SAGE): modelos-base do Consultor, do escritório e da empresa ativa.
// Gera o documento preenchido com a ficha do funcionário no layout do Consultor (visualizar, imprimir, PDF,
// e-mail e WhatsApp), edita com os campos do Consultor e importa os textos do backup do SAGE.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '../../types';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { ehAdmin } from '../../services/auth/papeis';
import { blocosDoTexto, CAMPOS_MODELO, camposDoTexto, preencherModelo, ROTULO_CATEGORIA, type CategoriaModelo, type ContextoModelo, type ModeloDocumento } from '../../services/modelos/modelos';
import { ehBase, excluirModelo, listarModelos, salvarModelo } from '../../services/modelos/modelosService';
import type { OpcoesPdf } from '../../services/relatorios/layoutPdf';
import EntregaRelatorio, { type ArquivoRelatorio } from './EntregaRelatorio';
import ImportarTextosSageModal from './ImportarTextosSageModal';

const modeloPdf = () => import('../../services/modelos/modeloPdf');
const inp = 'mt-0.5 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100';
const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
const primario = 'rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-500 disabled:opacity-50';
const CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as CategoriaModelo[];
const EXTRAS: { chave: string; campo: string; rotulo: string; tipo?: 'date' | 'number' }[] = [
    { chave: 'diasExperiencia', campo: 'contrato.diasExperiencia', rotulo: 'Dias de experiência', tipo: 'number' },
    { chave: 'motivo', campo: 'digitado.motivo', rotulo: 'Motivo' },
    { chave: 'dias', campo: 'digitado.dias', rotulo: 'Dias', tipo: 'number' },
    { chave: 'data', campo: 'digitado.data', rotulo: 'Data', tipo: 'date' },
    { chave: 'cidade', campo: 'digitado.cidade', rotulo: 'Cidade' },
];
const ORIGEM: Record<ModeloDocumento['origem'], string> = { base: 'Modelo-base', consultor: 'Personalizado', sage: 'Importado do SAGE' };
const dono = (m: ModeloDocumento) => (ehBase(m) ? 'Consultor' : m.empresaId ? 'Desta empresa' : 'Do escritório');

type Rascunho = { id?: string; titulo: string; categoria: CategoriaModelo; corpo: string; empresaId: string; origem: ModeloDocumento['origem'] };

const ModelosPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const { ativa } = useEmpresaAtiva();
    const usuario: Usuario = { id: currentUser.uid ?? currentUser.id, email: currentUser.email };
    const admin = ehAdmin(currentUser.role);
    const [modelos, setModelos] = useState<ModeloDocumento[] | null>(null);
    const [empresa, setEmpresa] = useState<Empresa | undefined>();
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');
    const [selId, setSelId] = useState('');
    const [modo, setModo] = useState<'gerar' | 'editar'>('gerar');
    const [rascunho, setRascunho] = useState<Rascunho | null>(null);
    const [fichaId, setFichaId] = useState('');
    const [extras, setExtras] = useState<Record<string, string>>({});
    const [testemunhas, setTestemunhas] = useState(true);
    const [enviar, setEnviar] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [importar, setImportar] = useState(false);
    const [versao, setVersao] = useState(0);
    const corpoRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setErro('');
        Promise.all([listarModelos(ativa.id), listarEmpresasVisiveis(), listarFuncionarios(ativa.id)])
            .then(([ms, emps, fs]) => {
                if (!vivo) return;
                setModelos(ms); setEmpresa(emps.find(e => e.id === ativa.id));
                const ord = [...fs].sort((a, b) => (a.situacao === b.situacao ? (a.dados.nome ?? '').localeCompare(b.dados.nome ?? '', 'pt-BR') : a.situacao === 'ativo' ? -1 : 1));
                setFichas(ord);
                setSelId(s => (ms.some(m => m.id === s) ? s : ms[0]?.id ?? ''));
            })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa, versao]);

    const sel = modelos?.find(m => m.id === selId) ?? null;
    const ficha = fichas.find(f => f.id === fichaId) ?? null;
    const ctx = useMemo((): ContextoModelo | null => (ativa ? {
        ficha, empresa: { razaoSocial: empresa?.razaoSocial || ativa.nome, nomeFantasia: empresa?.nomeFantasia, cnpj: ativa.cnpj.replace(/\D/g, ''), codigoSage: ativa.codigoSage },
        hoje: new Date().toLocaleDateString('sv-SE'), extras,
    } : null), [ativa, empresa, ficha, extras]);
    const preenchido = useMemo(() => (sel && ctx ? preencherModelo(sel.corpo, ctx) : null), [sel, ctx]);
    const usados = useMemo(() => new Set(sel ? camposDoTexto(sel.corpo).conhecidos : []), [sel]);
    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa e um período.</p>;

    const escolher = (m: ModeloDocumento) => { setSelId(m.id); setModo('gerar'); setRascunho(null); setEnviar(false); setMsg(''); setTestemunhas(m.categoria !== 'declaracao'); };
    const editar = (m: ModeloDocumento | null) => {
        setModo('editar'); setMsg(''); setEnviar(false);
        setRascunho(m ? { id: ehBase(m) ? undefined : m.id, titulo: ehBase(m) ? `${m.titulo} (cópia)` : m.titulo, categoria: m.categoria, corpo: m.corpo, empresaId: ehBase(m) ? ativa.id : m.empresaId, origem: m.origem }
            : { titulo: 'Novo modelo', categoria: 'outro', corpo: '# TÍTULO DO DOCUMENTO\n\nTexto com {{funcionario.nome}}.\n\n{{digitado.cidade}}, {{data.extenso}}.\n\n{{assinaturas}}', empresaId: ativa.id, origem: 'consultor' });
    };
    const podeGravar = (r: Rascunho) => (r.empresaId === '' ? admin : true);
    const nomeArquivo = () => `${(sel?.titulo ?? 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}-${(ficha?.dados.nome ?? 'funcionario').split(' ')[0].toLowerCase()}.pdf`;

    async function gerarPdf() {
        if (!sel || !preenchido || !ctx) throw new Error('Escolha o modelo.');
        const { modeloPdf: pdf } = await modeloPdf();
        const o: OpcoesPdf = { empresa: { razaoSocial: ctx.empresa.razaoSocial, cnpj: ctx.empresa.cnpj, codigoSage: ativa!.codigoSage }, titulo: sel.titulo, previa: false, emitidoPor: currentUser.email };
        return pdf(blocosDoTexto(preenchido.texto), o, ficha?.dados.nome ?? '', { empregador: ctx.empresa.razaoSocial, empregado: ficha?.dados.nome ?? 'Empregado(a)', testemunhas });
    }
    const agir = async (f: () => Promise<void>) => { setOcupado(true); setErro(''); setMsg(''); try { await f(); } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); } };
    const abrir = (imprimir: boolean) => agir(async () => { const doc = await gerarPdf(); if (imprimir) doc.autoPrint(); window.open(doc.output('bloburl') as unknown as string, '_blank'); });
    const baixar = () => agir(async () => { (await gerarPdf()).save(nomeArquivo()); });
    const arquivo = async (): Promise<ArquivoRelatorio> => ({ nome: nomeArquivo(), bytes: new Uint8Array((await gerarPdf()).output('arraybuffer')) });

    const inserirCampo = (chave: string) => {
        if (!rascunho || !chave) return;
        const el = corpoRef.current; const t = `{{${chave}}}`;
        const ini = el?.selectionStart ?? rascunho.corpo.length; const fim = el?.selectionEnd ?? ini;
        setRascunho({ ...rascunho, corpo: rascunho.corpo.slice(0, ini) + t + rascunho.corpo.slice(fim) });
        requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + t.length, ini + t.length); });
    };
    const gravar = () => agir(async () => {
        if (!rascunho) return;
        if (!rascunho.titulo.trim()) throw new Error('Informe o título.');
        const id = await salvarModelo(rascunho, usuario);
        setSelId(id); setRascunho(null); setModo('gerar'); setVersao(v => v + 1); setMsg('Modelo gravado.');
    });
    const excluir = (m: ModeloDocumento) => agir(async () => {
        if (!window.confirm(`Excluir o modelo "${m.titulo}"?`)) return;
        await excluirModelo(m.id); setSelId(''); setVersao(v => v + 1); setMsg('Modelo excluído.');
    });
    const desconhecidos = rascunho ? camposDoTexto(rascunho.corpo).desconhecidos : [];
    const podeAlterar = (m: ModeloDocumento) => !ehBase(m) && (m.empresaId ? true : admin);

    return (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <nav aria-label="Contratos e modelos" className="space-y-4">
                <div className="flex flex-wrap gap-2">
                    <button className={primario} onClick={() => editar(null)}>Novo modelo</button>
                    <button className={btn} onClick={() => setImportar(true)}>Importar do SAGE</button>
                </div>
                {!modelos && !erro && <p className="text-sm text-slate-500">Carregando os modelos…</p>}
                {modelos && CATEGORIAS.filter(c => modelos.some(m => m.categoria === c)).map(c => (
                    <div key={c}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{ROTULO_CATEGORIA[c]}</p>
                        <ul className="space-y-1">
                            {modelos.filter(m => m.categoria === c).map(m => (
                                <li key={m.id}>
                                    <button onClick={() => escolher(m)} aria-current={m.id === selId}
                                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${m.id === selId ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                                        <span className="block">{m.titulo}</span>
                                        <span className={`block text-[11px] ${m.id === selId ? 'text-teal-100' : 'text-slate-500'}`}>{dono(m)} · {ORIGEM[m.origem]}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>
            <section aria-label={modo === 'editar' ? 'Editar modelo' : sel?.titulo ?? 'Modelo'} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {msg && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">{msg}</p>}

                {modo === 'editar' && rascunho && (
                    <div className="space-y-3">
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{rascunho.id ? 'Editar modelo' : 'Novo modelo'}</h2>
                        <div className="grid gap-2 sm:grid-cols-3">
                            <label className="text-xs text-slate-600 dark:text-slate-300 sm:col-span-1">Título<input aria-label="Título do modelo" className={inp} value={rascunho.titulo} maxLength={120} onChange={e => setRascunho({ ...rascunho, titulo: e.target.value })} /></label>
                            <label className="text-xs text-slate-600 dark:text-slate-300">Categoria
                                <select aria-label="Categoria" className={inp} value={rascunho.categoria} onChange={e => setRascunho({ ...rascunho, categoria: e.target.value as CategoriaModelo })}>
                                    {CATEGORIAS.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
                                </select>
                            </label>
                            <label className="text-xs text-slate-600 dark:text-slate-300">Vale para
                                <select aria-label="Vale para" className={inp} value={rascunho.empresaId ? 'empresa' : 'escritorio'} disabled={!!rascunho.id}
                                    onChange={e => setRascunho({ ...rascunho, empresaId: e.target.value === 'empresa' ? ativa.id : '' })}>
                                    <option value="empresa">Só esta empresa ({ativa.nome})</option>
                                    <option value="escritorio" disabled={!admin}>Todas as empresas (escritório){admin ? '' : ' — gestor ou admin'}</option>
                                </select>
                            </label>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="text-xs text-slate-600 dark:text-slate-300">Inserir campo
                                <select aria-label="Inserir campo" className={inp} value="" onChange={e => inserirCampo(e.target.value)}>
                                    <option value="">Escolha…</option>
                                    {['Funcionário', 'Contrato', 'Empresa', 'Data', 'Digitado'].map(g => (
                                        <optgroup key={g} label={g}>{CAMPOS_MODELO.filter(c => c.grupo === g).map(c => <option key={c.chave} value={c.chave}>{c.rotulo}</option>)}</optgroup>
                                    ))}
                                    <optgroup label="Assinaturas"><option value="assinaturas">Campos de assinatura</option></optgroup>
                                </select>
                            </label>
                            <p className="text-xs text-slate-500">"# " título · "## " cláusula · linha em branco separa parágrafos · {'{{assinaturas}}'} empregador, empregado e testemunhas.</p>
                        </div>
                        <textarea ref={corpoRef} aria-label="Texto do modelo" rows={18} className={`${inp} font-mono`} value={rascunho.corpo} onChange={e => setRascunho({ ...rascunho, corpo: e.target.value })} />
                        {desconhecidos.length > 0 && <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">Campos que o Consultor não conhece (saem em branco): {desconhecidos.map(d => `{{${d}}}`).join(', ')}.</p>}
                        <div className="flex flex-wrap gap-2">
                            <button className={primario} disabled={ocupado || !podeGravar(rascunho)} onClick={gravar}>Gravar modelo</button>
                            <button className={btn} onClick={() => { setRascunho(null); setModo('gerar'); }}>Cancelar</button>
                        </div>
                    </div>
                )}

                {modo === 'gerar' && sel && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{sel.titulo}</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">{dono(sel)} · {ORIGEM[sel.origem]}{sel.atualizadoPorEmail ? ` · alterado por ${sel.atualizadoPorEmail}` : ''}</p>
                            </div>
                            <div className="flex gap-2">
                                <button className={btn} onClick={() => editar(sel)}>{podeAlterar(sel) ? 'Editar' : 'Personalizar (cópia)'}</button>
                                {podeAlterar(sel) && <button className={btn} disabled={ocupado} onClick={() => excluir(sel)}>Excluir</button>}
                            </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                            <label className="text-xs text-slate-600 dark:text-slate-300 sm:col-span-2">Funcionário
                                <select aria-label="Funcionário" className={inp} value={fichaId} onChange={e => setFichaId(e.target.value)}>
                                    <option value="">Escolha o funcionário…</option>
                                    {fichas.map(f => <option key={f.id} value={f.id}>{f.dados.nome || f.cpf}{f.situacao !== 'ativo' ? ` (${f.situacao})` : ''}</option>)}
                                </select>
                            </label>
                            {EXTRAS.filter(x => usados.has(x.campo)).map(x => (
                                <label key={x.chave} className="text-xs text-slate-600 dark:text-slate-300">{x.rotulo}
                                    <input aria-label={x.rotulo} type={x.tipo ?? 'text'} className={inp} value={extras[x.chave] ?? ''} placeholder={x.chave === 'diasExperiencia' ? '45' : x.chave === 'cidade' ? 'São Paulo' : ''}
                                        onChange={e => setExtras(v => ({ ...v, [x.chave]: e.target.value }))} />
                                </label>
                            ))}
                        </div>
                        {preenchido && fichaId && preenchido.vazios.length > 0 && (
                            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">Sem dado na ficha (sai com linha para preencher à mão): {preenchido.vazios.join(', ')}.</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200"><input type="checkbox" checked={testemunhas} onChange={e => setTestemunhas(e.target.checked)} /> Testemunhas</label>
                            <button className={btn} disabled={!fichaId || ocupado} onClick={() => abrir(false)}>Visualizar</button>
                            <button className={btn} disabled={!fichaId || ocupado} onClick={() => abrir(true)}>Imprimir</button>
                            <button className={btn} disabled={!fichaId || ocupado} onClick={baixar}>Baixar PDF</button>
                            <button className={primario} disabled={!fichaId} aria-pressed={enviar} onClick={() => setEnviar(x => !x)}>Enviar ao cliente</button>
                        </div>
                        {enviar && fichaId && (
                            <EntregaRelatorio key={`${sel.id}-${fichaId}`} empresa={{ id: ativa.id, cnpj: ativa.cnpj.replace(/\D/g, ''), nome: empresa?.nomeFantasia || empresa?.razaoSocial || ativa.nome, codigoSage: ativa.codigoSage, contatoEnvio: empresa?.contatoEnvio }}
                                titulo={`${sel.titulo} – ${ficha?.dados.nome ?? ''}`} competencia={ativa.competencia} gerar={arquivo} />
                        )}
                        {preenchido && (
                            <article aria-label="Prévia do documento" className="max-h-[32rem] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                                {blocosDoTexto(preenchido.texto).map((b, i) => (b.tipo === 'titulo' ? <h3 key={i} className="text-center font-bold">{b.texto}</h3>
                                    : b.tipo === 'subtitulo' ? <h4 key={i} className="font-semibold">{b.texto}</h4>
                                        : b.tipo === 'assinaturas' ? <p key={i} className="pt-4 text-center text-xs text-slate-500">— campos de assinatura: empregador e empregado{testemunhas ? ', testemunhas' : ''} —</p>
                                            : <p key={i} className="text-justify">{b.texto}</p>))}
                            </article>
                        )}
                    </div>
                )}
            </section>
            {importar && <ImportarTextosSageModal empresaId={ativa.id} empresaNome={ativa.nome} admin={admin} usuario={usuario}
                onFechar={() => setImportar(false)} onGravado={n => { setImportar(false); setVersao(v => v + 1); setMsg(`${n} modelo(s) importado(s) do SAGE.`); }} />}
        </div>
    );
};

export default ModelosPanel;
