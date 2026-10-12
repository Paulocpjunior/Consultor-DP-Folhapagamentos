// components/beneficios/AdministracaoBeneficios.tsx
//
// Folha do mês › Administração de benefícios: os fornecedores (transporte no estado de São Paulo, alimentação e
// multibenefícios, saúde e odonto, bem-estar) com o site oficial, e os contratados da empresa ativa com o número do
// contrato, o dia do pedido ou da recarga (com quantos dias faltam), o contato e o link do portal.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis, salvarBeneficiosContratados } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import {
    FORNECEDORES, ROTULO_CATEGORIA, contratadoVazio, fornecedorPorId, linkDoContratado, linkValido, nomeDoContratado, proximoPedido, validarContratados,
    type BeneficioContratado, type CategoriaFornecedor,
} from '../../services/beneficios/fornecedores';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const br = (d: string) => d.split('-').reverse().join('/');
const CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as CategoriaFornecedor[];
const novoId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const Link: React.FC<{ url: string; children: React.ReactNode }> = ({ url, children }) =>
    linkValido(url) ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline dark:text-blue-300">{children}</a> : <span className="text-slate-400">{children}</span>;

const AdministracaoBeneficios: React.FC = () => {
    const { ativa } = useEmpresaAtiva();
    const [empresa, setEmpresa] = useState<Empresa | null>(null);
    const [lista, setLista] = useState<BeneficioContratado[]>([]);
    const [gravada, setGravada] = useState('[]');
    const [busca, setBusca] = useState('');
    const [erros, setErros] = useState<string[]>([]); const [msg, setMsg] = useState(''); const [salvando, setSalvando] = useState(false);
    const hoje = hojeSp();

    useEffect(() => {
        setEmpresa(null); setLista([]); setErros([]); setMsg('');
        if (!ativa) return;
        listarEmpresasVisiveis().then(es => {
            const e = es.find(x => x.id === ativa.id) ?? null;
            setEmpresa(e); const l = e?.beneficiosContratados ?? []; setLista(l); setGravada(JSON.stringify(l));
        }).catch(e => setErros([(e as Error).message]));
    }, [ativa]);

    const filtrados = useMemo(() => {
        const t = busca.trim().toLowerCase();
        return t ? FORNECEDORES.filter(f => `${f.nome} ${f.antes ?? ''} ${f.descricao}`.toLowerCase().includes(t)) : FORNECEDORES;
    }, [busca]);
    const alterado = JSON.stringify(lista) !== gravada;
    const set = (id: string, m: Partial<BeneficioContratado>) => setLista(l => l.map(b => (b.id === id ? { ...b, ...m } : b)));
    const adicionar = (fornecedorId: string) => setLista(l => [...l, { ...contratadoVazio(), id: novoId(), fornecedorId }]);

    async function gravar() {
        if (!empresa) return;
        const limpa = lista.map(b => ({ ...b, nome: b.nome.trim(), url: b.url.trim(), produto: b.produto.trim(), contrato: b.contrato.trim(), contato: b.contato.trim(), observacao: b.observacao.trim() }));
        const e = validarContratados(limpa);
        setErros(e); setMsg('');
        if (e.length) return;
        setSalvando(true);
        try { await salvarBeneficiosContratados(empresa.id, limpa); setLista(limpa); setGravada(JSON.stringify(limpa)); setMsg('Benefícios da empresa gravados.'); }
        catch (x) { setErros([(x as Error).message]); }
        finally { setSalvando(false); }
    }

    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa e um período.</p>;
    return (
        <div className="space-y-4 text-sm">
            <section aria-label="Contratados pela empresa" className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">Benefícios contratados — {empresa?.nomeFantasia || ativa.nome}</h2>
                    <div className="flex gap-2">
                        <button className="rounded-sm border border-slate-300 px-3 py-1.5 dark:border-slate-600" onClick={() => adicionar('')}>Outro fornecedor</button>
                        <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!alterado || salvando || !empresa} onClick={gravar}>{alterado ? 'Gravar' : 'Gravado'}</button>
                    </div>
                </div>
                <p className="text-slate-600 dark:text-slate-300">Quem é o fornecedor de cada benefício desta empresa, o contrato, o dia do pedido ou da recarga e o contato. O valor e a parte do empregado ficam em Cálculo › Benefícios da empresa (entram na folha).</p>
                {!lista.length && <p className="rounded-sm border border-dashed border-slate-300 p-4 text-center text-slate-500 dark:border-slate-600">Nenhum benefício contratado. Escolha o fornecedor no catálogo abaixo ("Contratar") ou use "Outro fornecedor".</p>}
                {lista.map(b => {
                    const f = fornecedorPorId(b.fornecedorId);
                    const prox = proximoPedido(b.diaPedido, hoje);
                    const link = linkDoContratado(b);
                    return (
                        <div key={b.id} className="space-y-1 rounded-sm border border-slate-200 p-2 dark:border-slate-700">
                            <div className="flex flex-wrap items-center gap-2">
                                <strong>{nomeDoContratado(b)}</strong>
                                {f && <span className="text-xs text-slate-500">{ROTULO_CATEGORIA[f.categoria]}</span>}
                                {link && <Link url={link}>abrir o site{b.url ? ' (link próprio)' : ''}</Link>}
                                {prox && <span className={`rounded-full px-2 py-0.5 text-xs ${prox.dias <= 3 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>
                                    próximo pedido {br(prox.data)} ({prox.dias === 0 ? 'hoje' : prox.dias === 1 ? 'amanhã' : `em ${prox.dias} dias`})</span>}
                                <button className="ml-auto text-xs text-red-700 underline dark:text-red-300" onClick={() => setLista(l => l.filter(x => x.id !== b.id))}>Remover</button>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {!b.fornecedorId && <label className="text-xs">Fornecedor<input aria-label={`Nome do fornecedor ${b.id}`} className={`block w-full ${inp}`} value={b.nome} onChange={e => set(b.id, { nome: e.target.value })} /></label>}
                                <label className="text-xs">Produto<input aria-label={`Produto de ${nomeDoContratado(b)}`} className={`block w-full ${inp}`} value={b.produto} placeholder="VR, VA, VT, odonto…" onChange={e => set(b.id, { produto: e.target.value })} /></label>
                                <label className="text-xs">Contrato / nº do cliente<input aria-label={`Contrato de ${nomeDoContratado(b)}`} className={`block w-full ${inp}`} value={b.contrato} onChange={e => set(b.id, { contrato: e.target.value })} /></label>
                                <label className="text-xs">Dia do pedido/recarga<input aria-label={`Dia do pedido de ${nomeDoContratado(b)}`} inputMode="numeric" className={`block w-full ${inp}`} value={b.diaPedido} placeholder="25" onChange={e => set(b.id, { diaPedido: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></label>
                                <label className="text-xs">Contato (gerente, e-mail, telefone)<input aria-label={`Contato de ${nomeDoContratado(b)}`} className={`block w-full ${inp}`} value={b.contato} onChange={e => set(b.id, { contato: e.target.value })} /></label>
                                <label className="text-xs sm:col-span-2">Link próprio (portal do cliente; vazio = site do catálogo)<input aria-label={`Link próprio de ${nomeDoContratado(b)}`} className={`block w-full ${inp}`} value={b.url} placeholder="https://" onChange={e => set(b.id, { url: e.target.value })} /></label>
                                <label className="text-xs sm:col-span-3">Observação<input aria-label={`Observação de ${nomeDoContratado(b)}`} className={`block w-full ${inp}`} value={b.observacao} onChange={e => set(b.id, { observacao: e.target.value })} /></label>
                            </div>
                        </div>
                    );
                })}
                {erros.length > 0 && <ul role="alert" className="list-disc rounded-sm bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(x => <li key={x}>{x}</li>)}</ul>}
                {msg && <p role="status" className="text-green-700 dark:text-green-300">{msg}</p>}
            </section>

            <section aria-label="Catálogo de fornecedores" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="mr-auto text-lg font-semibold">Fornecedores</h2>
                    <input aria-label="Buscar fornecedor" className={inp} placeholder="Buscar (Sodexo, Gympass, metrô…)" value={busca} onChange={e => setBusca(e.target.value)} />
                </div>
                {CATEGORIAS.map(c => {
                    const doTipo = filtrados.filter(f => f.categoria === c);
                    if (!doTipo.length) return null;
                    return (
                        <div key={c}>
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{ROTULO_CATEGORIA[c]}</p>
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                {doTipo.map(f => (
                                    <li key={f.id} className="flex flex-wrap items-center gap-2 py-1.5">
                                        <span className="min-w-48 font-medium"><Link url={f.url}>{f.nome}</Link>{f.antes && <span className="ml-1 text-xs text-slate-500">(antiga {f.antes})</span>}</span>
                                        <span className="flex-1 text-xs text-slate-600 dark:text-slate-300">{f.descricao}{!f.conferido && <span className="ml-1 text-amber-700 dark:text-amber-300">· endereço a conferir ao abrir</span>}</span>
                                        <button className="rounded-sm border border-slate-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-slate-600" disabled={!empresa} onClick={() => adicionar(f.id)}>Contratar</button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
                <p className="text-xs text-slate-500">Os links abrem o site oficial em outra aba. Vale-transporte: na capital, os ônibus municipais pelo Bilhete Único (SPTrans); na região metropolitana, Metrô, CPTM e EMTU pelo TOP (o cartão BOM foi substituído). Endereço que mudar: grave o certo em "link próprio" no contratado.</p>
            </section>
        </div>
    );
};

export default AdministracaoBeneficios;
