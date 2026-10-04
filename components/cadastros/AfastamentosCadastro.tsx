// components/cadastros/AfastamentosCadastro.tsx
//
// Arquivos › Afastamentos/Retorno (S-2230): lista por empresa, lançamento
// manual e importação dos XMLs do S-2230 com prévia.

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import {
    ACID_TRANSITO, MOTIVOS, afastamentoVazio, consolidarAfastamentos, diasNaCompetencia, duracao, emAberto, idAfastamento, inicioBeneficio,
    lerXmlAfastamentos, mesclarAfastamentos, rotuloMotivo, validarAfastamento, type Afastamento, type MesclaAfastamento,
} from '../../services/cadastros/afastamentos';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { excluirAfastamento, gravarAfastamentosImportados, listarFuncionarios, mensagemErro, salvarAfastamento, type Usuario } from '../../services/cadastros/cadastrosService';
import { fontesDosArquivos } from './lerArquivosXml';

interface Props { empresa: Empresa; afastamentos: Afastamento[] | null; erroLista: string; usuario: Usuario; isAdmin: boolean; onRecarregar: () => void }

const inp = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const hoje = () => new Date().toISOString().slice(0, 10);

const AfastamentosCadastro: React.FC<Props> = ({ empresa, afastamentos, erroLista, usuario, isAdmin, onRecarregar }) => {
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [filtro, setFiltro] = useState<'abertos' | 'competencia' | 'todos'>('abertos');
    const [competencia, setCompetencia] = useState(hoje().slice(0, 7));
    const [edicao, setEdicao] = useState<{ antes: Afastamento | null; a: Afastamento } | null>(null);
    const [importar, setImportar] = useState(false);

    useEffect(() => { listarFuncionarios(empresa.id).then(setFichas).catch(() => setFichas([])); }, [empresa.id]);
    const nome = useMemo(() => new Map(fichas.map(f => [f.id, f.dados.nome || f.cpf])), [fichas]);

    const lista = (afastamentos ?? []).filter(a => filtro === 'todos' || (filtro === 'abertos' ? emAberto(a, hoje()) : diasNaCompetencia(a, competencia) > 0));

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <button className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white" disabled={!fichas.length} onClick={() => setEdicao({ antes: null, a: { ...afastamentoVazio(), empresaId: empresa.id } })}>Novo afastamento</button>
                <button className={btn} disabled={!fichas.length || !afastamentos} onClick={() => setImportar(true)}>Importar S-2230 (XML)</button>
                <select className="ml-auto rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)} aria-label="Filtro de afastamentos">
                    <option value="abertos">Afastados hoje</option><option value="competencia">Na competência</option><option value="todos">Todos</option>
                </select>
                {filtro === 'competencia' && <input type="month" className="rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={competencia} onChange={e => setCompetencia(e.target.value)} aria-label="Competência" />}
            </div>
            {!fichas.length && <p className="text-sm text-slate-500">Cadastre ou importe os funcionários desta empresa antes de lançar afastamentos.</p>}
            {erroLista && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erroLista}</p>}
            {!afastamentos && !erroLista && <p className="text-sm text-slate-500">Carregando…</p>}
            {afastamentos && !lista.length && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">Nenhum afastamento neste filtro.</p>}
            {lista.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr><th className="p-2">Funcionário</th><th className="p-2">Motivo</th><th className="p-2">Início</th><th className="p-2">Término</th><th className="p-2">Dias</th>{filtro === 'competencia' && <th className="p-2">Na competência</th>}<th className="p-2">Origem</th></tr></thead>
                        <tbody>
                            {lista.map(a => (
                                <tr key={a.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700" onClick={() => setEdicao({ antes: a, a: { ...a } })}>
                                    <td className="p-2 font-medium">{nome.get(a.fichaId) ?? a.cpf}</td>
                                    <td className="p-2 text-xs">{rotuloMotivo(a.motivo)}</td>
                                    <td className="p-2">{br(a.dtInicio)}</td>
                                    <td className="p-2">{a.dtFim ? br(a.dtFim) : <span className="text-amber-700 dark:text-amber-300">em aberto</span>}</td>
                                    <td className="p-2">{duracao(a) ?? '—'}</td>
                                    {filtro === 'competencia' && <td className="p-2">{diasNaCompetencia(a, competencia)}</td>}
                                    <td className="p-2 text-xs text-slate-500">{a.origem.startsWith('Manual') ? 'Manual' : 'eSocial'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {edicao && <AfastamentoModal key={edicao.antes?.id ?? 'novo'} antes={edicao.antes} inicial={edicao.a} fichas={fichas} todos={afastamentos ?? []} usuario={usuario} isAdmin={isAdmin}
                onFechar={() => setEdicao(null)} onSalvo={() => { setEdicao(null); onRecarregar(); }} />}
            {importar && afastamentos && <ImportarS2230Modal empresa={empresa} fichas={fichas} existentes={afastamentos} usuario={usuario} onFechar={() => setImportar(false)} onGravado={() => { setImportar(false); onRecarregar(); }} />}
        </div>
    );
};

const AfastamentoModal: React.FC<{ antes: Afastamento | null; inicial: Afastamento; fichas: FichaFuncionario[]; todos: Afastamento[]; usuario: Usuario; isAdmin: boolean; onFechar: () => void; onSalvo: () => void }> = ({ antes, inicial, fichas, todos, usuario, isAdmin, onFechar, onSalvo }) => {
    const [a, setA] = useState<Afastamento>(inicial);
    const [erros, setErros] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const ficha = fichas.find(f => f.id === a.fichaId);
    const set = (k: keyof Afastamento, v: string) => setA(x => ({ ...x, [k]: v }));
    const doencaOuAcidente = ['01', '03'].includes(a.motivo);
    const v = validarAfastamento(a, ficha, todos);
    const beneficio = inicioBeneficio(a);

    async function salvar() {
        if (v.erros.length) { setErros(v.erros); return; }
        const pronto: Afastamento = {
            ...a, cpf: ficha!.cpf, matriculaEsocial: ficha!.matriculaEsocial, id: antes?.id ?? idAfastamento(a.fichaId, a.dtInicio),
            infoMesmoMtv: doencaOuAcidente ? a.infoMesmoMtv : '', tpAcidTransito: doencaOuAcidente ? a.tpAcidTransito : '',
            observacao: a.observacao.trim(), origem: `Manual · ${usuario.email} · ${hoje()}`,
        };
        setSalvando(true); setErros([]);
        try { await salvarAfastamento(antes, pronto, usuario); onSalvo(); }
        catch (e) { setErros([mensagemErro(e)]); setSalvando(false); }
    }

    async function excluir() {
        if (!antes || !window.confirm('Excluir este afastamento? A exclusão fica no histórico.')) return;
        setSalvando(true);
        try { await excluirAfastamento(antes, usuario); onSalvo(); }
        catch (e) { setErros([mensagemErro(e)]); setSalvando(false); }
    }

    return (
        <div role="dialog" aria-modal="true" aria-label="Afastamento" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-2xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Arquivos › Afastamentos/Retorno · S-2230</p>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{antes ? (ficha?.dados.nome ?? antes.cpf) : 'Novo afastamento'}</h3>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                {antes && <p className="text-xs text-slate-500">{antes.origem}{antes.recibos.length ? ` · recibo(s) ${antes.recibos.join(', ')}` : ''}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Funcionário</span>
                        <select className={inp} value={a.fichaId} disabled={!!antes} onChange={e => set('fichaId', e.target.value)} aria-label="Funcionário">
                            <option value="">Selecione</option>
                            {fichas.map(f => <option key={f.id} value={f.id}>{f.dados.nome || f.cpf} · mat. {f.matriculaEsocial}{f.situacao === 'desligado' ? ' (desligado)' : ''}</option>)}
                        </select></label>
                    <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Início</span>
                        <input className={inp} type="date" value={a.dtInicio} disabled={!!antes} onChange={e => set('dtInicio', e.target.value)} aria-label="Início do afastamento" /></label>
                    <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Término (vazio = em aberto)</span>
                        <input className={inp} type="date" value={a.dtFim} onChange={e => set('dtFim', e.target.value)} aria-label="Término do afastamento" /></label>
                    <label className="block sm:col-span-2"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Motivo (Tabela 18 do eSocial)</span>
                        <select className={inp} value={MOTIVOS[a.motivo] || !a.motivo ? a.motivo : 'outro'} onChange={e => set('motivo', e.target.value === 'outro' ? '00' : e.target.value)} aria-label="Motivo">
                            <option value="">Selecione</option>
                            {Object.keys(MOTIVOS).map(c => <option key={c} value={c}>{rotuloMotivo(c)}</option>)}
                            <option value="outro">Outro código da Tabela 18…</option>
                        </select></label>
                    {a.motivo && !MOTIVOS[a.motivo] && (
                        <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Código (2 dígitos)</span>
                            <input className={inp} value={a.motivo} maxLength={2} onChange={e => set('motivo', e.target.value.replace(/\D/g, ''))} aria-label="Código do motivo" /></label>
                    )}
                    {doencaOuAcidente && (
                        <>
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Mesma doença do afastamento anterior, em 60 dias?</span>
                                <select className={inp} value={a.infoMesmoMtv} onChange={e => set('infoMesmoMtv', e.target.value)} aria-label="Mesmo motivo"><option value="">—</option><option value="S">Sim</option><option value="N">Não</option></select></label>
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Acidente de trânsito</span>
                                <select className={inp} value={a.tpAcidTransito} onChange={e => set('tpAcidTransito', e.target.value)} aria-label="Acidente de trânsito"><option value="">Não</option>{Object.entries(ACID_TRANSITO).map(([c, r]) => <option key={c} value={c}>{r}</option>)}</select></label>
                        </>
                    )}
                    {a.motivo === '15' && (
                        <>
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Período aquisitivo: início</span>
                                <input className={inp} type="date" value={a.perAquisInicio} onChange={e => set('perAquisInicio', e.target.value)} aria-label="Início do período aquisitivo" /></label>
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Período aquisitivo: fim</span>
                                <input className={inp} type="date" value={a.perAquisFim} onChange={e => set('perAquisFim', e.target.value)} aria-label="Fim do período aquisitivo" /></label>
                        </>
                    )}
                    <label className="block sm:col-span-2"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Observação</span>
                        <textarea className={inp} rows={2} value={a.observacao} onChange={e => set('observacao', e.target.value)} aria-label="Observação do afastamento" /></label>
                </div>
                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {duracao(a) !== null && <p>Duração: {duracao(a)} dia(s).</p>}
                    {beneficio && <p>Empresa paga os 15 primeiros dias; o INSS a partir de {br(beneficio)} (Lei 8.213/1991, art. 60).</p>}
                    {doencaOuAcidente && a.infoMesmoMtv === 'S' && <p>Mesma doença em 60 dias: a contagem dos 15 dias soma o afastamento anterior; confira.</p>}
                </div>
                {v.avisos.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">{v.avisos.join(' ')}</p>}
                {erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
                <div className="flex justify-between gap-2">
                    <div>{antes && isAdmin && <button className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 dark:text-red-300" disabled={salvando} onClick={excluir}>Excluir</button>}</div>
                    <div className="flex gap-2">
                        <button className={btn} onClick={onFechar}>Cancelar</button>
                        <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={salvando} onClick={salvar}>{salvando ? 'Gravando…' : 'Gravar'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ImportarS2230Modal: React.FC<{ empresa: Empresa; fichas: FichaFuncionario[]; existentes: Afastamento[]; usuario: Usuario; onFechar: () => void; onGravado: () => void }> = ({ empresa, fichas, existentes, usuario, onFechar, onGravado }) => {
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [previa, setPrevia] = useState<{ itens: MesclaAfastamento[]; avisos: string[]; nomes: string[] } | null>(null);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const nome = new Map(fichas.map(f => [f.id, f.dados.nome || f.cpf]));

    async function ler() {
        setOcupado('Lendo os XMLs…'); setErro('');
        try {
            const { fontes, problemas } = await fontesDosArquivos(arquivos);
            const lidos = fontes.map(f => lerXmlAfastamentos(f.nome, f.xml, empresa.cnpj.slice(0, 8)));
            const c = consolidarAfastamentos(lidos.flatMap(l => l.eventos), empresa, fichas);
            setPrevia({ itens: mesclarAfastamentos(c.afastamentos, existentes), avisos: [...problemas, ...lidos.flatMap(l => l.avisos), ...c.avisos], nomes: fontes.map(f => f.nome) });
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    const gravar = previa?.itens.filter(i => i.mudou) ?? [];
    async function confirmar() {
        if (!previa) return;
        setOcupado('Gravando…'); setErro('');
        try { await gravarAfastamentosImportados(gravar, existentes, usuario, previa.nomes); onGravado(); }
        catch (e) { setErro(mensagemErro(e)); setOcupado(''); }
    }

    return (
        <div role="dialog" aria-modal="true" aria-label="Importar S-2230" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-4xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Importar afastamentos (S-2230) — {empresa.nomeFantasia}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">XMLs do S-2230 e dos S-3000 que os excluem, soltos ou em .zip. Início e término podem vir em arquivos separados. Só eventos com recibo de processamento entram; nada é gravado antes de você confirmar.</p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <input className="text-sm dark:text-white" type="file" multiple accept=".xml,.zip" onChange={e => { setArquivos(Array.from(e.target.files ?? [])); setPrevia(null); }} aria-label="XMLs do S-2230" />
                    <button className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!arquivos.length || !!ocupado} onClick={ler}>Ler arquivos</button>
                </div>
                {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {previa && (
                    <>
                        <div className="max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Funcionário</th><th className="p-2">Motivo</th><th className="p-2">Início</th><th className="p-2">Término</th><th className="p-2">Situação</th></tr></thead>
                                <tbody>
                                    {previa.itens.map(i => (
                                        <tr key={i.afastamento.id} className="border-t border-slate-100 dark:border-slate-700 dark:text-slate-100">
                                            <td className="p-2">{nome.get(i.afastamento.fichaId)}</td>
                                            <td className="p-2 text-xs">{rotuloMotivo(i.afastamento.motivo)}</td>
                                            <td className="p-2">{br(i.afastamento.dtInicio)}</td>
                                            <td className="p-2">{br(i.afastamento.dtFim) || 'em aberto'}</td>
                                            <td className="p-2 text-xs">{i.novo ? 'Novo' : i.preservado ? <span className="text-amber-700 dark:text-amber-300">Lançado à mão e diferente do eSocial: mantido o manual</span> : i.mudou ? 'Atualizado' : 'Sem mudança'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!previa.itens.length && <p className="p-3 text-sm text-slate-500">Nenhum afastamento desta empresa nos arquivos.</p>}
                        </div>
                        {previa.avisos.length > 0 && (
                            <details open={!previa.itens.length} className="text-xs text-slate-600 dark:text-slate-300">
                                <summary className="cursor-pointer">Avisos da leitura ({previa.avisos.length})</summary>
                                <ul className="mt-1 list-disc pl-5">{previa.avisos.map((a, k) => <li key={k}>{a}</li>)}</ul>
                            </details>
                        )}
                        <div className="flex justify-end gap-2">
                            <button className={btn} onClick={onFechar}>Cancelar</button>
                            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!gravar.length || !!ocupado} onClick={confirmar}>Gravar {gravar.length} afastamento(s)</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AfastamentosCadastro;
