// components/cadastros/FuncionariosCadastro.tsx
//
// Arquivos › Funcionários: lista por empresa, ficha, importação do XML do
// eSocial com prévia, carga complementar pelo backup do IOB e exportação Excel.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { fichaVazia, linhasPlanilha, validarFicha, ROTULO, type CampoFicha, type FichaFuncionario } from '../../services/cadastros/funcionarios';
import { gravarImportacao, listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { paraGravar, prepararImportacao, type PreviaImportacao } from '../../services/cadastros/importacaoEsocial';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import type { Horario } from '../../services/cadastros/horarios';
import { emAberto, type Afastamento } from '../../services/cadastros/afastamentos';
import { fontesDosArquivos } from './lerArquivosXml';
import FichaFuncionarioModal from './FichaFuncionarioModal';
import CompletarPeloIobModal from './CompletarPeloIobModal';

interface Props { empresa: Empresa; usuario: Usuario; isAdmin: boolean; sindicatos: Sindicato[]; horarios: Horario[]; afastamentos: Afastamento[] }

const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const fmtCpf = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const fmtData = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d ?? '');

const FuncionariosCadastro: React.FC<Props> = ({ empresa, usuario, isAdmin, sindicatos, horarios, afastamentos }) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const afastadoHoje = useMemo(() => new Map(afastamentos.filter(a => emAberto(a, hoje)).map(a => [a.fichaId, a])), [afastamentos, hoje]);
    const [fichas, setFichas] = useState<FichaFuncionario[] | null>(null);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');
    const [situacao, setSituacao] = useState<'ativo' | 'desligado' | ''>('ativo');
    const [aberta, setAberta] = useState<{ ficha: FichaFuncionario; nova: boolean } | null>(null);
    const [importar, setImportar] = useState(false);
    const [completarIob, setCompletarIob] = useState(false);

    const carregar = useCallback(() => {
        setErro(''); setFichas(null);
        listarFuncionarios(empresa.id).then(setFichas).catch(e => { setErro(mensagemErro(e)); setFichas([]); });
    }, [empresa.id]);
    useEffect(carregar, [carregar]);

    const filtradas = useMemo(() => (fichas ?? []).filter(f => (!situacao || f.situacao === situacao)
        && `${f.dados.nome ?? ''} ${f.cpf} ${f.matriculaEsocial} ${f.dados.codigoIob ?? ''} ${f.dados.cargo ?? ''}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'))), [fichas, situacao, busca]);
    const contagem = { ativo: fichas?.filter(f => f.situacao === 'ativo').length ?? 0, desligado: fichas?.filter(f => f.situacao === 'desligado').length ?? 0 };

    function exportar() {
        const ws = XLSX.utils.json_to_sheet(linhasPlanilha(filtradas));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Funcionários');
        XLSX.writeFile(wb, `funcionarios-${empresa.codigoSage}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <button className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white" onClick={() => setAberta({ ficha: fichaVazia(empresa), nova: true })}>Nova ficha</button>
                <button className={btn} onClick={() => setImportar(true)}>Importar do eSocial (XML)</button>
                <button className={btn} disabled={!fichas} onClick={() => setCompletarIob(true)}>Completar pelo backup do IOB</button>
                <button className={btn} disabled={!filtradas.length} onClick={exportar}>Exportar Excel</button>
                <input className="ml-auto w-full rounded border border-slate-300 px-3 py-2 text-sm sm:w-64 dark:border-slate-600 dark:bg-slate-900 dark:text-white" placeholder="Buscar nome, CPF, matrícula, cargo" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar funcionário" />
                <select className="rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={situacao} onChange={e => setSituacao(e.target.value as typeof situacao)} aria-label="Situação">
                    <option value="ativo">Ativos ({contagem.ativo})</option><option value="desligado">Desligados ({contagem.desligado})</option><option value="">Todos ({fichas?.length ?? 0})</option>
                </select>
            </div>

            {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {!fichas && <p className="text-sm text-slate-500">Carregando…</p>}
            {fichas && !fichas.length && !erro && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">Nenhum funcionário cadastrado nesta empresa. Comece pela importação dos XMLs do eSocial (S-2200 e alterações) ou por uma nova ficha.</p>}

            {filtradas.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <tr><th className="p-2">Cód. IOB</th><th className="p-2">Matrícula eSocial</th><th className="p-2">Nome</th><th className="p-2">CPF</th><th className="p-2">Cargo</th><th className="p-2">Admissão</th><th className="p-2">Situação</th><th className="p-2">Conferir</th></tr>
                        </thead>
                        <tbody>
                            {filtradas.map(f => {
                                const v = validarFicha(f);
                                return (
                                    <tr key={f.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50 dark:border-slate-700 dark:hover:bg-slate-700" onClick={() => setAberta({ ficha: f, nova: false })}>
                                        <td className="p-2 font-mono">{f.dados.codigoIob || '—'}</td>
                                        <td className="p-2 font-mono">{f.matriculaEsocial}</td>
                                        <td className="p-2 font-medium text-slate-800 dark:text-white">{f.dados.nome}</td>
                                        <td className="p-2 font-mono">{fmtCpf(f.cpf)}</td>
                                        <td className="p-2">{f.dados.cargo}</td>
                                        <td className="p-2">{fmtData(f.dados.admissao)}</td>
                                        <td className="p-2">{f.situacao === 'ativo' ? (afastadoHoje.has(f.id) ? <span className="text-amber-700 dark:text-amber-300" title={`Motivo ${afastadoHoje.get(f.id)!.motivo}`}>Afastado desde {fmtData(afastadoHoje.get(f.id)!.dtInicio)}</span> : 'Ativo') : `Desligado ${fmtData(f.dados.dataDesligamento)}`}</td>
                                        <td className="p-2 text-xs" title={[...v.erros, ...v.avisos, ...f.pendenciasImportacao].join('\n')}>
                                            {v.erros.length > 0 && <span className="mr-1 rounded bg-red-100 px-1.5 text-red-800 dark:bg-red-900/40 dark:text-red-200">{v.erros.length} erro(s)</span>}
                                            {v.avisos.length + f.pendenciasImportacao.length > 0 && <span className="rounded bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{v.avisos.length + f.pendenciasImportacao.length}</span>}
                                            {!v.erros.length && !v.avisos.length && !f.pendenciasImportacao.length && <span className="text-green-700 dark:text-green-400">ok</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {aberta && <FichaFuncionarioModal key={aberta.ficha.id || 'nova'} ficha={aberta.ficha} nova={aberta.nova} sindicatos={sindicatos} horarios={horarios} afastamentos={afastamentos.filter(a => a.fichaId === aberta.ficha.id)} usuario={usuario} isAdmin={isAdmin}
                onFechar={() => setAberta(null)} onSalvo={() => { setAberta(null); carregar(); }} />}
            {importar && fichas && <ImportarEsocialModal empresa={empresa} usuario={usuario} existentes={fichas} onFechar={() => setImportar(false)} onGravado={() => { setImportar(false); carregar(); }} />}
            {completarIob && fichas && <CompletarPeloIobModal empresa={empresa} usuario={usuario} existentes={fichas} onFechar={() => setCompletarIob(false)} onGravado={() => { setCompletarIob(false); carregar(); }} />}
        </div>
    );
};

const ImportarEsocialModal: React.FC<{ empresa: Empresa; usuario: Usuario; existentes: FichaFuncionario[]; onFechar: () => void; onGravado: () => void }> = ({ empresa, usuario, existentes, onFechar, onGravado }) => {
    const [corte, setCorte] = useState(new Date().toISOString().slice(0, 10));
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
    const [problemas, setProblemas] = useState<string[]>([]);
    const [nomes, setNomes] = useState<string[]>([]);
    const [marcados, setMarcados] = useState<Set<string>>(new Set());
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');

    async function ler() {
        setOcupado('Lendo os XMLs…'); setErro('');
        try {
            const { fontes, problemas } = await fontesDosArquivos(arquivos);
            const p = prepararImportacao(fontes, empresa, corte, existentes);
            setPrevia(p); setProblemas(problemas); setNomes(fontes.map(f => f.nome));
            setMarcados(new Set(paraGravar(p).map(r => r.ficha.id)));
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    async function gravar() {
        if (!previa) return;
        const sel = paraGravar(previa).filter(r => marcados.has(r.ficha.id));
        setOcupado(`Gravando 0 de ${sel.length}…`); setErro('');
        try { await gravarImportacao(sel, usuario, nomes, n => setOcupado(`Gravando ${n} de ${sel.length}…`)); onGravado(); }
        catch (e) { setErro(mensagemErro(e)); setOcupado(''); }
    }

    const novos = previa?.resultados.filter(r => r.novo).length ?? 0;
    const atualizados = previa?.resultados.filter(r => !r.novo && r.alteracoes.length).length ?? 0;
    const iguais = previa?.resultados.filter(r => !r.novo && !r.alteracoes.length).length ?? 0;
    const preservados = previa?.resultados.flatMap(r => r.preservados.map(p => ({ ...p, nome: r.ficha.dados.nome ?? r.ficha.cpf }))) ?? [];

    return (
        <div role="dialog" aria-modal="true" aria-label="Importar do eSocial" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-4xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Importar funcionários do eSocial — {empresa.nomeFantasia}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">XMLs baixados do eSocial (S-2200, S-2205, S-2206, S-2299, S-3000), soltos ou em .zip. Só eventos com recibo de processamento entram. Nada é gravado antes de você confirmar.</p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="text-sm dark:text-white">Arquivos<input className="block text-sm" type="file" multiple accept=".xml,.zip" onChange={e => { setArquivos(Array.from(e.target.files ?? [])); setPrevia(null); }} aria-label="XMLs do eSocial" /></label>
                    <label className="text-sm dark:text-white">Considerar eventos até<input className="block rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900" type="date" value={corte} onChange={e => { setCorte(e.target.value); setPrevia(null); }} /></label>
                    <button className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!arquivos.length || !!ocupado} onClick={ler}>Ler arquivos</button>
                </div>

                {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

                {previa && (
                    <>
                        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                            <div className="rounded bg-green-50 p-2 dark:bg-green-900/30 dark:text-green-100"><strong>{novos}</strong> novo(s)</div>
                            <div className="rounded bg-blue-50 p-2 dark:bg-blue-900/30 dark:text-blue-100"><strong>{atualizados}</strong> com alteração</div>
                            <div className="rounded bg-slate-50 p-2 dark:bg-slate-700 dark:text-slate-100"><strong>{iguais}</strong> sem mudança</div>
                            <div className="rounded bg-amber-50 p-2 dark:bg-amber-900/30 dark:text-amber-100"><strong>{preservados.length}</strong> edição(ões) manual(is) mantida(s)</div>
                        </div>
                        {preservados.length > 0 && (
                            <details open className="rounded border border-amber-300 p-2 text-xs dark:border-amber-700 dark:text-amber-100">
                                <summary className="cursor-pointer font-medium">Campos editados à mão que divergem do eSocial (o valor manual fica; confira)</summary>
                                <ul className="mt-1 space-y-0.5">{preservados.map((p, i) => <li key={i}>{p.nome} · {ROTULO[p.campo as CampoFicha] ?? p.campo}: manual “{p.manual}” × eSocial “{p.esocial}”</li>)}</ul>
                            </details>
                        )}
                        <div className="max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2" /><th className="p-2">Nome</th><th className="p-2">Matrícula</th><th className="p-2">O que muda</th><th className="p-2">Pendências</th></tr></thead>
                                <tbody>
                                    {previa.resultados.map(r => {
                                        const muda = r.novo || r.alteracoes.length > 0;
                                        return (
                                            <tr key={r.ficha.id} className="border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100">
                                                <td className="p-2"><input type="checkbox" disabled={!muda} checked={marcados.has(r.ficha.id)} aria-label={`Gravar ${r.ficha.dados.nome}`}
                                                    onChange={e => setMarcados(m => { const n = new Set(m); if (e.target.checked) n.add(r.ficha.id); else n.delete(r.ficha.id); return n; })} /></td>
                                                <td className="p-2">{r.ficha.dados.nome}{r.ficha.situacao === 'desligado' && <span className="ml-1 text-xs text-slate-500">(desligado)</span>}</td>
                                                <td className="p-2 font-mono">{r.ficha.matriculaEsocial}</td>
                                                <td className="p-2 text-xs">{r.novo ? 'Ficha nova' : r.alteracoes.length ? r.alteracoes.map(a => `${ROTULO[a.campo as CampoFicha] ?? a.campo}: ${a.de || '∅'} → ${a.para || '∅'}`).join('; ') : 'Nada'}</td>
                                                <td className="p-2 text-xs text-amber-700 dark:text-amber-300">{r.ficha.pendenciasImportacao.length || ''}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {!previa.resultados.length && <p className="p-3 text-sm text-slate-500">Nenhum vínculo desta empresa nos arquivos.</p>}
                        </div>
                        {[...problemas, ...previa.avisos].length > 0 && (
                            <details open={!previa.resultados.length} className="text-xs text-slate-600 dark:text-slate-300">
                                <summary className="cursor-pointer">Avisos da leitura ({problemas.length + previa.avisos.length})</summary>
                                <ul className="mt-1 list-disc pl-5">{[...problemas, ...previa.avisos].map((a, i) => <li key={i}>{a}</li>)}</ul>
                            </details>
                        )}
                        <div className="flex justify-end gap-2">
                            <button className={btn} onClick={onFechar}>Cancelar</button>
                            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!marcados.size || !!ocupado} onClick={gravar}>Gravar {marcados.size} ficha(s)</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default FuncionariosCadastro;
