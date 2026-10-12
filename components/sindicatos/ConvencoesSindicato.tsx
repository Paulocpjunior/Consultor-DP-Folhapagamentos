// components/sindicatos/ConvencoesSindicato.tsx
//
// Cadastros › Sindicatos › (sindicato) › Convenções: as convenções e acordos coletivos do sindicato, com o PDF e a
// vigência. Ao escolher o PDF, o texto é lido no navegador e sugere vigência, data-base, registro no MTE, reajuste
// e pisos (services/sindicatos/convencao.ts: lerTextoConvencao); a equipe confere e completa antes de gravar.

import React, { useEffect, useState } from 'react';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import { MESES } from '../../services/cadastros/sindicatos';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { avisosConvencao, convencaoVazia, lerTextoConvencao, renovacaoDoSindicato, situacaoDaConvencao, validarConvencao, type ConvencaoColetiva } from '../../services/sindicatos/convencao';
import SinalRenovacao from './SinalRenovacao';
import { TAMANHO_MAXIMO_PDF, abrirPdfConvencao, listarConvencoes, salvarConvencao } from '../../services/sindicatos/convencoesService';
import { lerTextoPdf } from '../../services/sindicatos/textoPdf';
import { contribuicaoPadrao, TIPOS_CONTRIBUICAO, type ContribuicaoConvencao, type FormaContribuicao, type RegraAvisoConvencao, type TipoContribuicao } from '../../services/sindicatos/contribuicoes';

const inp = 'w-full rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const txt = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2).replace('.', ','));
const COR = { vigente: 'text-green-700 dark:text-green-400', 'a vencer': 'text-amber-700 dark:text-amber-300', vencida: 'text-red-700 dark:text-red-300' };
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const numOuNulo = (t: string) => (t.trim() ? Number(t.replace(',', '.')) : null);
const dataValidaIso = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));
const somarUmDia = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

interface Edicao {
    c: ConvencaoColetiva;
    pisos: { descricao: string; cbo: string; valor: string }[];
    percentual: string; he50: string; he100: string; noturno: string;
    obrigacoes: string;
    contribuicoes: { tipo: TipoContribuicao; forma: FormaContribuicao; valor: string; meses: string; teto: string; descricao: string }[];
    avisos: { idade: string; anos: string; dias: string; descricao: string }[];
    pdf: File | null;
}

const paraEdicao = (c: ConvencaoColetiva): Edicao => ({
    c, pisos: c.pisos.map(p => ({ descricao: p.descricao, cbo: p.cbo, valor: txt(p.valor) })),
    percentual: c.reajuste.percentual === null ? '' : String(c.reajuste.percentual).replace('.', ','),
    he50: c.horaExtra.minimo50 === null ? '' : String(c.horaExtra.minimo50), he100: c.horaExtra.minimo100 === null ? '' : String(c.horaExtra.minimo100),
    noturno: c.adicionalNoturno === null ? '' : String(c.adicionalNoturno), obrigacoes: c.obrigacoes.map(o => o.descricao).join('\n'), pdf: null,
    contribuicoes: (c.contribuicoes ?? []).map(x => ({ tipo: x.tipo, forma: x.forma, valor: x.forma === 'valor' ? txt(x.valor) : String(x.valor).replace('.', ','), meses: x.meses.join(', '), teto: x.teto === null ? '' : txt(x.teto), descricao: x.descricao })),
    avisos: (c.avisoPrevio ?? []).map(x => ({ idade: x.idadeMinima === null ? '' : String(x.idadeMinima), anos: x.anosMinimos === null ? '' : String(x.anosMinimos), dias: String(x.diasAdicionais), descricao: x.descricao })),
});

function deEdicao(e: Edicao): { c: ConvencaoColetiva; erros: string[] } {
    const erros: string[] = [];
    const pisos = e.pisos.filter(p => p.descricao.trim() || p.valor.trim()).map((p, i) => {
        const v = centavosDeTexto(p.valor);
        if (v === null) erros.push(`Piso ${i + 1}: valor inválido.`);
        return { descricao: p.descricao.trim(), cbo: p.cbo.replace(/\D/g, ''), valor: v ?? 0 };
    });
    const obrigacoes = e.obrigacoes.split('\n').map(x => x.trim()).filter(Boolean).map((descricao, i) => ({ id: `o${i + 1}`, descricao: descricao.slice(0, 200) }));
    const contribuicoes: ContribuicaoConvencao[] = e.contribuicoes.map(x => {
        const valor = x.forma === 'valor' ? centavosDeTexto(x.valor) ?? 0 : Number(x.valor.replace(',', '.')) || 0;
        const meses = x.meses.split(/[^\d]+/).filter(Boolean).map(Number);
        const teto = x.teto.trim() ? centavosDeTexto(x.teto) ?? -1 : null;
        return { tipo: x.tipo, forma: x.forma, valor, meses, teto, descricao: x.descricao.trim().slice(0, 200) };
    });
    const avisoPrevio: RegraAvisoConvencao[] = e.avisos.map(x => ({ idadeMinima: numOuNulo(x.idade), anosMinimos: numOuNulo(x.anos), diasAdicionais: Number(x.dias) || 0, descricao: x.descricao.trim().slice(0, 200) }));
    const c: ConvencaoColetiva = { ...e.c, pisos, obrigacoes, contribuicoes, avisoPrevio, reajuste: { ...e.c.reajuste, percentual: numOuNulo(e.percentual) },
        horaExtra: { minimo50: numOuNulo(e.he50), minimo100: numOuNulo(e.he100) }, adicionalNoturno: numOuNulo(e.noturno), registroMte: e.c.registroMte.trim().toUpperCase(), observacao: e.c.observacao.trim() };
    return { c, erros };
}

const ConvencoesSindicato: React.FC<{ sindicato: Sindicato; usuario: Usuario; onAlterado?: () => void }> = ({ sindicato, usuario, onAlterado }) => {
    const [todas, setTodas] = useState<ConvencaoColetiva[] | null>(null);
    const [edicao, setEdicao] = useState<Edicao | null>(null);
    const [erros, setErros] = useState<string[]>([]);
    const [ocupado, setOcupado] = useState(''); const [msg, setMsg] = useState('');
    const carregar = () => listarConvencoes().then(setTodas).catch(e => { setTodas([]); setErros([mensagemErro(e)]); });
    useEffect(() => { carregar(); }, []);
    const lista = (todas ?? []).filter(c => c.sindicatoCnpj === sindicato.cnpj);
    const hoje = hojeSp();

    async function escolherPdf(f: File | null) {
        if (!edicao || !f) return;
        if (f.type !== 'application/pdf' || f.size > TAMANHO_MAXIMO_PDF) { setErros(['Escolha o PDF da convenção (até 20 MB).']); return; }
        setOcupado('Lendo o PDF…'); setErros([]);
        try {
            const s = lerTextoConvencao(await lerTextoPdf(await f.arrayBuffer()));
            const c = edicao.c;
            const novaVig = s.vigenciaInicio || c.vigenciaInicio;
            setEdicao({
                ...edicao, pdf: f,
                c: { ...c, vigenciaInicio: novaVig, vigenciaFim: s.vigenciaFim || c.vigenciaFim, dataBase: s.dataBase || c.dataBase, registroMte: s.registroMte || c.registroMte,
                    reajuste: { ...c.reajuste, aPartirDe: c.reajuste.aPartirDe || (s.percentual !== null && novaVig ? novaVig.slice(0, 7) : '') } },
                percentual: s.percentual !== null && !edicao.percentual ? String(s.percentual).replace('.', ',') : edicao.percentual,
                pisos: s.pisos.length && !edicao.pisos.some(p => p.valor) ? s.pisos.map(p => ({ descricao: p.descricao, cbo: '', valor: txt(p.valor) })) : edicao.pisos,
            });
            const achou = [s.vigenciaInicio && 'vigência', s.dataBase && 'data-base', s.registroMte && 'registro', s.percentual !== null && 'reajuste', s.pisos.length && `${s.pisos.length} piso(s)`].filter(Boolean);
            setMsg(achou.length ? `Lido do PDF: ${achou.join(', ')}. Confira cada campo com a convenção antes de gravar.` : 'O PDF não trouxe os campos num formato reconhecível (pode ser imagem): preencha à mão.');
        } catch (e) { setEdicao({ ...edicao, pdf: f }); setMsg(`Não deu para ler o texto do PDF (${(e as Error).message}): preencha à mão; o arquivo será guardado.`); }
        finally { setOcupado(''); }
    }

    async function gravar() {
        if (!edicao) return;
        const { c, erros: e1 } = deEdicao(edicao);
        const e2 = validarConvencao(c, lista);
        if (!edicao.c.id && !edicao.pdf) e2.push('Anexe o PDF da convenção.');
        if (e1.length || e2.length) { setErros([...e1, ...e2]); return; }
        setOcupado('Gravando…'); setErros([]);
        try { await salvarConvencao(c, edicao.pdf, usuario); setEdicao(null); setMsg('Convenção gravada.'); await carregar(); onAlterado?.(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setOcupado(''); }
    }

    const set = (k: keyof ConvencaoColetiva, v: string) => setEdicao(e => e && ({ ...e, c: { ...e.c, [k]: v } }));
    return (
        <section aria-label="Convenções coletivas" className="space-y-2 rounded-sm border border-slate-200 p-2 text-sm dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800 dark:text-white">Convenções e acordos coletivos {todas && <SinalRenovacao r={renovacaoDoSindicato(lista, sindicato.cnpj, hoje)} />}</p>
                {!edicao && <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white" onClick={() => { setErros([]); setMsg(''); setEdicao(paraEdicao({ ...convencaoVazia(sindicato.cnpj), dataBase: sindicato.dataBase })); }}>Nova convenção (PDF)</button>}
            </div>
            {!todas && <p className="text-slate-500">Carregando…</p>}
            {todas && !lista.length && !edicao && <p className="text-slate-500">Nenhuma convenção deste sindicato. Anexe o PDF da última convenção registrada no Mediador.</p>}
            {lista.length > 0 && (
                <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                    {lista.map(c => {
                        const sit = situacaoDaConvencao(c, hoje);
                        return (
                            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                                <span className="dark:text-slate-100"><strong>{c.tipo} {br(c.vigenciaInicio)} a {br(c.vigenciaFim)}</strong>{c.registroMte ? ` · ${c.registroMte}` : ''}
                                    <span className={`ml-2 text-xs ${COR[sit]}`}>{sit}</span>
                                    <span className="block text-xs text-slate-500">{[c.dataBase && `data-base ${MESES[Number(c.dataBase) - 1]}`, c.reajuste.percentual !== null && `reajuste ${String(c.reajuste.percentual).replace('.', ',')}%`, c.pisos.length && `pisos: ${c.pisos.map(p => `${p.descricao} ${reais(p.valor)}`).join(', ')}`, c.obrigacoes.length && `${c.obrigacoes.length} obrigação(ões)`, (c.contribuicoes ?? []).length && `descontos: ${c.contribuicoes.map(x => TIPOS_CONTRIBUICAO[x.tipo]?.rotulo.toLowerCase()).join(', ')}`, (c.avisoPrevio ?? []).length && 'aviso prévio a mais'].filter(Boolean).join(' · ')}</span></span>
                                <span className="flex gap-2 text-xs">
                                    {c.arquivo && <button className="text-blue-700 underline dark:text-blue-300" onClick={() => abrirPdfConvencao(c).catch(e => setErros([mensagemErro(e)]))}>Abrir PDF</button>}
                                    <button className="text-blue-700 underline dark:text-blue-300" onClick={() => { setErros([]); setMsg(''); setEdicao(paraEdicao(c)); }}>Editar</button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
            {edicao && (
                <div className="space-y-2 rounded-sm border border-blue-200 bg-blue-50/40 p-2 dark:border-blue-900 dark:bg-blue-900/10">
                    <label className="block text-xs">PDF da convenção {edicao.c.arquivo ? `(atual: ${edicao.c.arquivo.nome}; escolha outro para trocar)` : ''}
                        <input type="file" accept="application/pdf" className="block text-sm dark:text-white" aria-label="PDF da convenção" onChange={e => escolherPdf(e.target.files?.[0] ?? null)} /></label>
                    <div className="grid gap-2 sm:grid-cols-4">
                        <label className="text-xs">Tipo<select aria-label="Tipo do instrumento" className={inp} value={edicao.c.tipo} onChange={e => set('tipo', e.target.value)}><option value="CCT">Convenção (CCT)</option><option value="ACT">Acordo (ACT)</option></select></label>
                        <label className="text-xs">Vigência de<input aria-label="Início da vigência" type="date" className={inp} value={edicao.c.vigenciaInicio} disabled={!!edicao.c.id} onChange={e => set('vigenciaInicio', e.target.value)} /></label>
                        <label className="text-xs">até<input aria-label="Fim da vigência" type="date" className={inp} value={edicao.c.vigenciaFim} onChange={e => set('vigenciaFim', e.target.value)} /></label>
                        <label className="text-xs">Data-base<select aria-label="Data-base" className={inp} value={edicao.c.dataBase} onChange={e => set('dataBase', e.target.value)}><option value="">—</option>{MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}</select></label>
                        <label className="text-xs">Registro no MTE<input aria-label="Registro no MTE" className={inp} value={edicao.c.registroMte} onChange={e => set('registroMte', e.target.value)} placeholder="SP001234/2026" /></label>
                        <label className="text-xs">Reajuste (%)<input aria-label="Percentual de reajuste" className={inp} value={edicao.percentual} onChange={e => setEdicao({ ...edicao, percentual: e.target.value })} /></label>
                        <label className="text-xs">a partir de<input aria-label="Reajuste a partir de" type="month" className={inp} value={edicao.c.reajuste.aPartirDe} onChange={e => setEdicao({ ...edicao, c: { ...edicao.c, reajuste: { ...edicao.c.reajuste, aPartirDe: e.target.value } } })} /></label>
                        <label className="text-xs">Adicional noturno (%)<input aria-label="Adicional noturno" className={inp} value={edicao.noturno} onChange={e => setEdicao({ ...edicao, noturno: e.target.value })} placeholder="20" /></label>
                        <label className="text-xs">HE dias úteis (%)<input aria-label="Adicional de hora extra em dias úteis" className={inp} value={edicao.he50} onChange={e => setEdicao({ ...edicao, he50: e.target.value })} placeholder="50" /></label>
                        <label className="text-xs">HE domingos e feriados (%)<input aria-label="Adicional de hora extra em domingos e feriados" className={inp} value={edicao.he100} onChange={e => setEdicao({ ...edicao, he100: e.target.value })} placeholder="100" /></label>
                    </div>
                    <div>
                        <p className="text-xs font-medium">Pisos salariais (CBO opcional: amarra o piso ao cargo da ficha)</p>
                        {edicao.pisos.map((p, i) => (
                            <div key={i} className="mt-1 grid grid-cols-[1fr_7rem_8rem_auto] gap-1">
                                <input aria-label={`Função do piso ${i + 1}`} className={inp} value={p.descricao} onChange={e => setEdicao({ ...edicao, pisos: edicao.pisos.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)) })} />
                                <input aria-label={`CBO do piso ${i + 1}`} className={inp} value={p.cbo} placeholder="CBO" onChange={e => setEdicao({ ...edicao, pisos: edicao.pisos.map((x, j) => (j === i ? { ...x, cbo: e.target.value.replace(/\D/g, '').slice(0, 6) } : x)) })} />
                                <input aria-label={`Valor do piso ${i + 1}`} className={inp} value={p.valor} placeholder="R$" onChange={e => setEdicao({ ...edicao, pisos: edicao.pisos.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) })} />
                                <button className="text-xs text-red-600 underline" onClick={() => setEdicao({ ...edicao, pisos: edicao.pisos.filter((_, j) => j !== i) })}>Remover</button>
                            </div>
                        ))}
                        <button className="mt-1 rounded-sm border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" onClick={() => setEdicao({ ...edicao, pisos: [...edicao.pisos, { descricao: '', cbo: '', valor: '' }] })}>Adicionar piso</button>
                    </div>
                    <div>
                        <p className="text-xs font-medium">Descontos para o sindicato (quem paga vem da ficha, aba Sindicato: autorização, oposição e filiação)</p>
                        {edicao.contribuicoes.map((x, i) => {
                            const muda = (m: Partial<Edicao['contribuicoes'][number]>) => setEdicao({ ...edicao, contribuicoes: edicao.contribuicoes.map((y, j) => (j === i ? { ...y, ...m } : y)) });
                            return (
                                <div key={i} className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-[12rem_7rem_6rem_7rem_6rem_1fr_auto]">
                                    <select aria-label={`Tipo da contribuição ${i + 1}`} className={inp} value={x.tipo} onChange={e => muda({ tipo: e.target.value as TipoContribuicao })}>
                                        {(Object.keys(TIPOS_CONTRIBUICAO) as TipoContribuicao[]).map(t => <option key={t} value={t}>{TIPOS_CONTRIBUICAO[t].rotulo}</option>)}</select>
                                    <select aria-label={`Forma da contribuição ${i + 1}`} className={inp} value={x.forma} onChange={e => muda({ forma: e.target.value as FormaContribuicao })}>
                                        <option value="percentual">% do salário</option><option value="valor">Valor fixo</option><option value="dias">Dias de salário</option></select>
                                    <input aria-label={`Valor da contribuição ${i + 1}`} className={inp} value={x.valor} placeholder={x.forma === 'valor' ? 'R$' : x.forma === 'dias' ? 'dias' : '%'} onChange={e => muda({ valor: e.target.value })} />
                                    <input aria-label={`Meses da contribuição ${i + 1}`} className={inp} value={x.meses} placeholder="meses (vazio = todo mês)" title="Meses do desconto, de 1 a 12, separados por vírgula. Vazio: todo mês." onChange={e => muda({ meses: e.target.value })} />
                                    <input aria-label={`Teto da contribuição ${i + 1}`} className={inp} value={x.teto} placeholder="teto R$" onChange={e => muda({ teto: e.target.value })} />
                                    <input aria-label={`Descrição da contribuição ${i + 1}`} className={inp} value={x.descricao} placeholder="cláusula da convenção" onChange={e => muda({ descricao: e.target.value })} />
                                    <button className="text-xs text-red-600 underline" onClick={() => setEdicao({ ...edicao, contribuicoes: edicao.contribuicoes.filter((_, j) => j !== i) })}>Remover</button>
                                </div>
                            );
                        })}
                        <button className="mt-1 rounded-sm border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" onClick={() => {
                            const livre = (Object.keys(TIPOS_CONTRIBUICAO) as TipoContribuicao[]).find(t => !edicao.contribuicoes.some(x => x.tipo === t)) ?? 'assistencial';
                            const p = contribuicaoPadrao(livre);
                            setEdicao({ ...edicao, contribuicoes: [...edicao.contribuicoes, { tipo: p.tipo, forma: p.forma, valor: p.valor ? String(p.valor) : '', meses: p.meses.join(', '), teto: '', descricao: p.descricao }] });
                        }}>Adicionar contribuição</button>
                    </div>
                    <div>
                        <p className="text-xs font-medium">Aviso prévio além da Lei 12.506/2011 (dispensa sem justa causa)</p>
                        {edicao.avisos.map((x, i) => {
                            const muda = (m: Partial<Edicao['avisos'][number]>) => setEdicao({ ...edicao, avisos: edicao.avisos.map((y, j) => (j === i ? { ...y, ...m } : y)) });
                            return (
                                <div key={i} className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-[7rem_7rem_7rem_1fr_auto]">
                                    <input aria-label={`Idade mínima do aviso ${i + 1}`} className={inp} value={x.idade} placeholder="idade mín." onChange={e => muda({ idade: e.target.value.replace(/\D/g, '') })} />
                                    <input aria-label={`Anos de casa do aviso ${i + 1}`} className={inp} value={x.anos} placeholder="anos de casa" onChange={e => muda({ anos: e.target.value.replace(/\D/g, '') })} />
                                    <input aria-label={`Dias a mais do aviso ${i + 1}`} className={inp} value={x.dias} placeholder="dias a mais" onChange={e => muda({ dias: e.target.value.replace(/\D/g, '') })} />
                                    <input aria-label={`Descrição do aviso ${i + 1}`} className={inp} value={x.descricao} placeholder="cláusula da convenção" onChange={e => muda({ descricao: e.target.value })} />
                                    <button className="text-xs text-red-600 underline" onClick={() => setEdicao({ ...edicao, avisos: edicao.avisos.filter((_, j) => j !== i) })}>Remover</button>
                                </div>
                            );
                        })}
                        <button className="mt-1 rounded-sm border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" onClick={() => setEdicao({ ...edicao, avisos: [...edicao.avisos, { idade: '', anos: '', dias: '', descricao: '' }] })}>Adicionar regra de aviso</button>
                    </div>
                    <label className="block text-xs">Obrigações da convenção a conferir em cada empresa (uma por linha: cesta básica, seguro de vida, PLR, auxílio-creche…)
                        <textarea aria-label="Obrigações da convenção" rows={3} className={inp} value={edicao.obrigacoes} onChange={e => setEdicao({ ...edicao, obrigacoes: e.target.value })} /></label>
                    {(() => { const av = avisosConvencao(deEdicao(edicao).c, lista, hoje); return av.length ? <ul className="list-disc rounded-sm bg-amber-50 p-2 pl-6 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">{av.map(x => <li key={x}>{x}</li>)}</ul> : null; })()}
                    {dataValidaIso(edicao.c.vigenciaFim) && <p className="text-xs text-slate-600 dark:text-slate-300">Renovação (a nova convenção tem de valer a partir de): <strong>{br(somarUmDia(edicao.c.vigenciaFim))}</strong>. Depois dela, sem a nova cadastrada, o app conta os dias em atraso.</p>}
                    <label className="block text-xs">Observação<input aria-label="Observação da convenção" className={inp} value={edicao.c.observacao} onChange={e => set('observacao', e.target.value)} /></label>
                    <div className="flex justify-end gap-2">
                        <button className="rounded-sm border border-slate-300 px-3 py-1.5 dark:border-slate-600 dark:text-white" onClick={() => setEdicao(null)}>Cancelar</button>
                        <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!!ocupado} onClick={gravar}>Gravar convenção</button>
                    </div>
                </div>
            )}
            {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {msg && <p role="status" className="text-green-700 dark:text-green-300">{msg}</p>}
            {erros.length > 0 && <ul role="alert" className="list-disc rounded-sm bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(x => <li key={x}>{x}</li>)}</ul>}
        </section>
    );
};

export default ConvencoesSindicato;
