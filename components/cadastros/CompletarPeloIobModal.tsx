// components/cadastros/CompletarPeloIobModal.tsx
//
// Cadastros › Funcionários › "Completar pelo backup do IOB" (Fase 2). Abre o
// backup restaurado no navegador (.zip com DBF e/ou .backup do PostgreSQL),
// a equipe escolhe a tabela de funcionários, confere o de/para proposto e vê a
// prévia: o que vai ser preenchido, o que diverge e quem ficou sem ficha.
// Só campos vazios são preenchidos; nada é gravado antes de confirmar.

import React, { useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { fonteDeBlob } from '../../services/iobSage/backupPostgres';
import { abrirRestauracao, type Restauracao, type TabelaRestauracao } from '../../services/iobSage/restauracao';
import type { Codificacao } from '../../services/iobSage/dbf';
import { CAMPOS_CARGA, aplicarComplementos, complementosFolhaWin, compararComFichas, linhaParaCampos, proporMapeamento, rotuloCarga, type CampoCarga, type Comparacao, type LinhaIob, type Mapeamento, type TabelaLida } from '../../services/cadastros/cargaBackupIob';
import { ROTULO, type CampoFicha, type FichaFuncionario } from '../../services/cadastros/funcionarios';
import { gravarImportacao, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { CODIFICACOES } from '../iobSage/RestaurarBackupModal';

interface Props { empresa: Empresa; usuario: Usuario; existentes: FichaFuncionario[]; onFechar: () => void; onGravado: () => void }

const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const sel = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const nomeTabela = (t: TabelaRestauracao) => `${t.grupo ? `${t.grupo}.` : ''}${t.tabela}`;
const semZeros = (v: string) => v.trim().replace(/^0+(?=.)/, '').toUpperCase();

const CompletarPeloIobModal: React.FC<Props> = ({ empresa, usuario, existentes, onFechar, onGravado }) => {
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [codificacao, setCodificacao] = useState<Codificacao | ''>('');
    const [rest, setRest] = useState<Restauracao | null>(null);
    const [tabelaId, setTabelaId] = useState('');
    const [mapa, setMapa] = useState<Mapeamento>({});
    const [colEmpresa, setColEmpresa] = useState('');
    const [valorEmpresa, setValorEmpresa] = useState(empresa.codigoSage ?? '');
    const [criarNovas, setCriarNovas] = useState(false);
    const [comp, setComp] = useState<Comparacao | null>(null);
    const [lidas, setLidas] = useState(0);
    const [marcados, setMarcados] = useState<Set<string>>(new Set());
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');

    // Tabelas com mais campos reconhecidos primeiro: a de funcionários tende a subir.
    const tabelas = useMemo(() => (rest?.tabelas ?? [])
        .map(t => ({ t, n: Object.keys(proporMapeamento(t.colunas)).length }))
        .sort((a, b) => b.n - a.n || nomeTabela(a.t).localeCompare(nomeTabela(b.t))), [rest]);
    const tabela = rest?.tabelas.find(t => t.id === tabelaId) ?? null;
    // FolhaWin: salário em `salarios`, PIX em `funcdoc` e matrícula do eSocial no S-1200, no mesmo schema da `func`, ligados pelo codfun.
    const complementares = useMemo(() => (tabela && rest ? ['salarios', 'funcdoc', 'esocialdadosficha_s1200_remunperapur', 'rsalfunc', 'cargos']
        .map(n => rest.tabelas.find(t => t.grupo === tabela.grupo && t.tabela.toLowerCase() === n))
        .filter((t): t is TabelaRestauracao => !!t) : []), [rest, tabela]);
    const [usarComplementares, setUsarComplementares] = useState(true);

    function escolherTabela(id: string, r = rest) {
        const t = r?.tabelas.find(x => x.id === id);
        setTabelaId(id); setComp(null);
        setMapa(t ? proporMapeamento(t.colunas) : {});
        setColEmpresa(t?.colunas.find(c => /^(cod)?(emp|empresa|codemp|codempresa|cdemp)$/i.test(c.replace(/[^a-z0-9]/gi, ''))) ?? '');
    }

    async function abrir(lista: File[], cod: Codificacao | '') {
        if (!lista.length) return;
        setOcupado('Abrindo o backup…'); setErro(''); setComp(null);
        try {
            const r = await abrirRestauracao(lista.map(f => ({ nome: f.name, fonte: fonteDeBlob(f) })), { codificacaoDbf: cod || undefined });
            setRest(r); setArquivos(lista);
            const melhor = r.tabelas.map(t => ({ t, n: Object.keys(proporMapeamento(t.colunas)).length })).sort((a, b) => b.n - a.n)[0];
            escolherTabela(melhor && melhor.n >= 3 ? melhor.t.id : '', r);
            if (!r.tabelas.length) setErro('Nenhuma tabela encontrada nos arquivos. Confira se é o Backup SQL do IOB Office (.zip e .backup).');
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    async function comparar() {
        if (!rest || !tabela) return;
        setOcupado('Lendo a tabela…'); setErro('');
        try {
            const linhas: LinhaIob[] = [];
            const iEmp = colEmpresa ? tabela.colunas.indexOf(colEmpresa) : -1;
            const alvo = semZeros(valorEmpresa);
            let n = 0;
            await rest.lerTabela(tabela, v => {
                n++;
                if (iEmp >= 0 && alvo && semZeros(v[iEmp] ?? '') !== alvo) return;
                linhas.push(linhaParaCampos(tabela.colunas, v, mapa, n));
            });
            let finais = linhas;
            if (usarComplementares && mapa.codigoIob && complementares.length) {
                const lidas: Record<string, TabelaLida> = {};
                for (const t of complementares) {
                    setOcupado(`Lendo ${nomeTabela(t)}…`);
                    const l: TabelaLida = { colunas: t.colunas, linhas: [] };
                    await rest.lerTabela(t, v => { l.linhas.push(v); });
                    lidas[t.tabela.toLowerCase()] = l;
                }
                finais = aplicarComplementos(linhas, complementosFolhaWin(lidas.salarios ?? null, lidas.funcdoc ?? null, lidas.esocialdadosficha_s1200_remunperapur ?? null, lidas.rsalfunc ?? null, lidas.cargos ?? null));
            }
            const c = compararComFichas(finais, existentes, empresa, `IOB: ${nomeTabela(tabela)}`, criarNovas);
            setComp(c); setLidas(linhas.length);
            setMarcados(new Set([...c.completar, ...c.novas].map(r => r.ficha.id)));
        } catch (e) { setErro(`${nomeTabela(tabela)}: ${(e as Error).message}`); }
        finally { setOcupado(''); }
    }

    async function gravar() {
        if (!comp || !tabela) return;
        const lista = [...comp.completar, ...comp.novas].filter(r => marcados.has(r.ficha.id));
        setOcupado(`Gravando 0 de ${lista.length}…`); setErro('');
        try {
            await gravarImportacao(lista, usuario, [...arquivos.map(f => f.name), nomeTabela(tabela)], n => setOcupado(`Gravando ${n} de ${lista.length}…`), 'Backup IOB');
            onGravado();
        } catch (e) { setErro(mensagemErro(e)); setOcupado(''); }
    }

    const temChave = !!(mapa.cpf || mapa.matriculaEsocial);
    const rotulo = (c: string) => ROTULO[c as CampoFicha] ?? c;
    const itens = comp ? [...comp.completar, ...comp.novas] : [];
    const divergencias = comp ? [
        ...comp.completar.filter(c => c.divergencias.length).map(c => ({ ficha: c.ficha, divergencias: c.divergencias })),
        ...comp.soDivergencias,
    ] : [];

    return (
        <div role="dialog" aria-modal="true" aria-label="Completar pelo backup do IOB" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-5xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Completar pelo backup do IOB — {empresa.nomeFantasia}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">Backup SQL do IOB Office (.zip com DBF e/ou .backup do PostgreSQL). O backup é lido no seu computador. Só campos <b>vazios</b> da ficha são preenchidos; valor diferente aparece como divergência e não é trocado. Nada é gravado antes de você confirmar.</p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>

                <div className="flex flex-wrap items-end gap-3">
                    <label className="text-sm dark:text-white">Arquivos do backup
                        <input className="block text-sm" type="file" multiple aria-label="Arquivos do backup do IOB" disabled={!!ocupado}
                            onChange={e => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void abrir(l, codificacao); }} />
                    </label>
                    {rest && rest.dbfs.length > 0 && (
                        <label className="text-sm dark:text-white">Acentos dos DBF
                            <select aria-label="Codificação dos DBF" className={`ml-2 ${sel}`} value={codificacao}
                                onChange={e => { const c = e.target.value as Codificacao | ''; setCodificacao(c); void abrir(arquivos, c); }}>
                                {CODIFICACOES.map(c => <option key={c.v} value={c.v}>{c.r}</option>)}
                            </select>
                        </label>
                    )}
                </div>

                {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

                {rest && rest.tabelas.length > 0 && (
                    <div className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-700">
                        <label className="block text-sm dark:text-white">Tabela de funcionários
                            <select aria-label="Tabela de funcionários" className={`ml-2 max-w-full ${sel}`} value={tabelaId} onChange={e => escolherTabela(e.target.value)}>
                                <option value="">— escolha —</option>
                                {tabelas.map(({ t, n }) => <option key={t.id} value={t.id}>{nomeTabela(t)} · {t.colunas.length} colunas{t.registros != null ? ` · ${t.registros} registros` : ''}{n ? ` · ${n} campo(s) reconhecido(s)` : ''}</option>)}
                            </select>
                        </label>

                        {tabela && (
                            <>
                                <p className="text-xs text-slate-600 dark:text-slate-300">De/para proposto pelos nomes das colunas. Confira cada um: o dicionário do IOB Office ainda não foi confirmado. CPF ou matrícula do eSocial é obrigatório para ligar com as fichas.</p>
                                <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                                    {CAMPOS_CARGA.map((c: CampoCarga) => (
                                        <label key={c} className="flex items-center justify-between gap-2 text-xs dark:text-slate-100">
                                            <span className={mapa[c] ? 'font-medium' : 'text-slate-500'}>{rotuloCarga(c)}</span>
                                            <select aria-label={`Coluna para ${rotuloCarga(c)}`} className={`w-40 ${sel} text-xs`} value={mapa[c] ?? ''}
                                                onChange={e => { const v = e.target.value; setComp(null); setMapa(m => { const n = { ...m }; if (v) n[c] = v; else delete n[c]; return n; }); }}>
                                                <option value="">— não usar —</option>
                                                {tabela.colunas.map(col => <option key={col} value={col}>{col}</option>)}
                                            </select>
                                        </label>
                                    ))}
                                </div>
                                <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-2 text-sm dark:border-slate-700 dark:text-white">
                                    <label>Coluna da empresa (se a tabela tiver várias)
                                        <select aria-label="Coluna da empresa" className={`ml-2 ${sel}`} value={colEmpresa} onChange={e => { setColEmpresa(e.target.value); setComp(null); }}>
                                            <option value="">— tabela só desta empresa —</option>
                                            {tabela.colunas.map(col => <option key={col} value={col}>{col}</option>)}
                                        </select>
                                    </label>
                                    {colEmpresa && <label>igual a<input aria-label="Código da empresa no IOB" className={`ml-2 w-24 ${sel}`} value={valorEmpresa} onChange={e => { setValorEmpresa(e.target.value); setComp(null); }} /></label>}
                                    {complementares.length > 0 && (
                                        <label className="flex items-center gap-1"><input type="checkbox" checked={usarComplementares} onChange={e => { setUsarComplementares(e.target.checked); setComp(null); }} />
                                            Trazer {complementares.map(t => ({ salarios: 'o salário atual (salarios)', funcdoc: 'a chave PIX (funcdoc)', rsalfunc: 'o cargo e o CBO (rsalfunc)', cargos: 'o nome do cargo (cargos)' } as Record<string, string>)[t.tabela.toLowerCase()] ?? 'a matrícula do eSocial (S-1200)').join(', ')} pelo código do funcionário{!mapa.codigoIob && ' (indique a coluna do código IOB)'}</label>
                                    )}
                                    <label className="flex items-center gap-1"><input type="checkbox" checked={criarNovas} onChange={e => { setCriarNovas(e.target.checked); setComp(null); }} />Criar ficha para quem não tem (com CPF válido e matrícula do eSocial)</label>
                                    <button className="ml-auto rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!temChave || !!ocupado} onClick={comparar}>Comparar com as fichas</button>
                                </div>
                                {!temChave && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">Indique a coluna do CPF ou da matrícula do eSocial.</p>}
                            </>
                        )}
                    </div>
                )}

                {comp && (
                    <>
                        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                            <div className="rounded bg-slate-50 p-2 dark:bg-slate-700 dark:text-slate-100"><strong>{lidas}</strong> linha(s) lida(s)</div>
                            <div className="rounded bg-blue-50 p-2 dark:bg-blue-900/30 dark:text-blue-100"><strong>{comp.completar.length}</strong> ficha(s) a completar</div>
                            <div className="rounded bg-green-50 p-2 dark:bg-green-900/30 dark:text-green-100"><strong>{comp.novas.length}</strong> ficha(s) nova(s)</div>
                            <div className="rounded bg-amber-50 p-2 dark:bg-amber-900/30 dark:text-amber-100"><strong>{divergencias.length}</strong> com divergência</div>
                            <div className="rounded bg-red-50 p-2 dark:bg-red-900/30 dark:text-red-100"><strong>{comp.semFicha.length + comp.ignoradas}</strong> sem ficha / sem chave</div>
                        </div>

                        <div className="max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2" /><th className="p-2">Nome</th><th className="p-2">Matrícula</th><th className="p-2">O que entra</th></tr></thead>
                                <tbody>
                                    {itens.map(r => (
                                        <tr key={r.ficha.id} className="border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100">
                                            <td className="p-2"><input type="checkbox" checked={marcados.has(r.ficha.id)} aria-label={`Gravar ${r.ficha.dados.nome || r.ficha.cpf}`}
                                                onChange={e => setMarcados(m => { const n = new Set(m); if (e.target.checked) n.add(r.ficha.id); else n.delete(r.ficha.id); return n; })} /></td>
                                            <td className="p-2">{r.ficha.dados.nome || r.ficha.cpf}</td>
                                            <td className="p-2 font-mono">{r.ficha.matriculaEsocial}</td>
                                            <td className="p-2 text-xs">{r.novo ? 'Ficha nova' : r.alteracoes.map(a => `${rotulo(a.campo)}: ${a.para}`).join('; ')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {!itens.length && <p className="p-3 text-sm text-slate-500">Nada a preencher: as fichas já têm todos os campos trazidos do IOB.</p>}
                        </div>

                        {divergencias.length > 0 && (
                            <details className="rounded border border-amber-300 p-2 text-xs dark:border-amber-700 dark:text-amber-100">
                                <summary className="cursor-pointer font-medium">Divergências entre o Consultor e o IOB (o valor do Consultor fica; confira) — {divergencias.length}</summary>
                                <ul className="mt-1 space-y-0.5">{divergencias.flatMap(d => d.divergencias.map(x => <li key={`${d.ficha.id}-${x.campo}`}>{d.ficha.dados.nome || d.ficha.cpf} · {rotulo(x.campo)}: Consultor “{x.consultor}” × IOB “{x.iob}”</li>))}</ul>
                            </details>
                        )}
                        {(comp.semFicha.length > 0 || comp.ignoradas > 0 || comp.avisos.length > 0) && (
                            <details className="rounded border border-slate-200 p-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                                <summary className="cursor-pointer font-medium">Sem ficha e avisos ({comp.semFicha.length + comp.avisos.length + (comp.ignoradas ? 1 : 0)})</summary>
                                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                                    {comp.semFicha.map(s => <li key={`s${s.linha}`}>Linha {s.linha}: {s.nome || '(sem nome)'} {s.cpf && `· CPF ${s.cpf}`} — {s.motivo}</li>)}
                                    {comp.ignoradas > 0 && <li>{comp.ignoradas} linha(s) sem CPF nem matrícula ignorada(s).</li>}
                                    {comp.avisos.map((a, i) => <li key={`a${i}`}>{a}</li>)}
                                </ul>
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

export default CompletarPeloIobModal;
