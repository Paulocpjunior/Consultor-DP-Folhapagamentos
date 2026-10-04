// components/iobSage/RestaurarBackupModal.tsx
//
// Restaura (abre para consulta e extração) o backup do IOB SAGE. No modo SQL,
// o "Backup SQL" da linha Office tem duas partes: um .zip com o cadastro das
// empresas (DBF) e um .backup com os dados da folha (PostgreSQL). O modal
// aceita as duas juntas. Tudo é lido no navegador: nada é enviado ao servidor
// nem gravado no Consultor DP. A gravação vem depois do de/para (fase 2).

import React, { useMemo, useState } from 'react';
import { fonteDeBlob, type Valor } from '../../services/iobSage/backupPostgres';
import { abrirRestauracao, exportarCsv, type Restauracao, type TabelaRestauracao, type TipoArquivo } from '../../services/iobSage/restauracao';
import type { Codificacao } from '../../services/iobSage/dbf';

const botao = 'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40';
const botaoSec = 'rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-slate-200 disabled:opacity-40';
const th = 'px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300';
const td = 'px-2 py-1 text-slate-800 dark:text-slate-100';
const LIMITE_LISTA = 300;
const LINHAS_PREVIA = 50;

const tamanho = (b: number | null) => b === null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
const ROTULO_TIPO: Record<TipoArquivo, string> = { pg_dump: 'PostgreSQL', zip: 'ZIP', dbf: 'Tabela DBF', memo: 'Memo DBF', outro: 'Outro' };
export const CODIFICACOES: { v: Codificacao | ''; r: string }[] = [
    { v: '', r: 'automática (pelo arquivo)' }, { v: 'cp850', r: 'DOS 850 (latino)' }, { v: 'windows-1252', r: 'Windows 1252' }, { v: 'cp437', r: 'DOS 437' },
];

function baixar(nome: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const nomeSeguro = (s: string) => s.replace(/[^\w.-]+/g, '_');

interface Props { aberto: boolean; onFechar: () => void }

const RestaurarBackupModal: React.FC<Props> = ({ aberto, onFechar }) => {
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [restauracao, setRestauracao] = useState<Restauracao | null>(null);
    const [lendo, setLendo] = useState(false);
    const [erro, setErro] = useState('');
    const [grupo, setGrupo] = useState('');
    const [busca, setBusca] = useState('');
    const [codificacao, setCodificacao] = useState<Codificacao | ''>('');
    const [previa, setPrevia] = useState<{ t: TabelaRestauracao; linhas: Valor[][] } | null>(null);
    const [ocupado, setOcupado] = useState('');

    const filtradas = useMemo(() => {
        if (!restauracao) return [];
        const b = busca.trim().toLowerCase();
        return restauracao.tabelas.filter(t => (!grupo || t.grupo === grupo) && (!b || `${t.grupo}.${t.tabela}`.toLowerCase().includes(b) || t.colunas.some(c => c.toLowerCase().includes(b))));
    }, [restauracao, grupo, busca]);

    if (!aberto) return null;

    async function abrir(lista: File[], cod: Codificacao | '') {
        if (!lista.length) return;
        setLendo(true); setErro(''); setPrevia(null);
        try {
            setRestauracao(await abrirRestauracao(lista.map(f => ({ nome: f.name, fonte: fonteDeBlob(f) })), { codificacaoDbf: cod || undefined }));
            setArquivos(lista);
        } catch (e) { setErro((e as Error).message); }
        finally { setLendo(false); }
    }

    async function verPrevia(t: TabelaRestauracao) {
        if (!restauracao) return;
        setOcupado(`${t.id}:previa`); setErro('');
        try {
            const linhas: Valor[][] = [];
            await restauracao.lerTabela(t, v => { linhas.push(v); return linhas.length < LINHAS_PREVIA; });
            setPrevia({ t, linhas });
        } catch (e) { setErro(`${t.grupo}.${t.tabela}: ${(e as Error).message}`); }
        finally { setOcupado(''); }
    }

    async function exportar(t: TabelaRestauracao) {
        if (!restauracao) return;
        setOcupado(`${t.id}:csv`); setErro('');
        try {
            const { blob } = await exportarCsv(restauracao, t);
            baixar(`${nomeSeguro(t.grupo)}.${nomeSeguro(t.tabela)}.csv`, blob);
        } catch (e) { setErro(`${t.grupo}.${t.tabela}: ${(e as Error).message}`); }
        finally { setOcupado(''); }
    }

    function baixarInventario() {
        if (!restauracao) return;
        const linhas = ['﻿origem;grupo;tabela;colunas;quantidade de colunas;registros;bytes no backup;arquivo',
            ...restauracao.tabelas.map(t => [t.origem, t.grupo, t.tabela, `"${t.colunas.join(', ').replace(/"/g, '""')}"`, t.colunas.length, t.registros ?? '', t.bytes ?? '', t.arquivo].join(';'))];
        baixar('inventario-backup-iob-sage.csv', new Blob([linhas.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    }

    const r = restauracao;
    return (
        <div role="dialog" aria-modal="true" aria-label="Restaurar backup do IOB SAGE" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
            <div className="w-full max-w-6xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Restaurar backup do IOB SAGE</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            No modo SQL, o Backup SQL do IOB Office tem duas partes: o <b>.zip</b> com o cadastro das empresas (tabelas DBF) e o <b>.backup</b> com os dados da folha (PostgreSQL). Escolha as duas juntas. Também abre .tar, .sql, .sql.gz e DBF soltos.
                        </p>
                        <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-300">Os arquivos são lidos no seu computador. Nada é enviado ao servidor nem gravado no Consultor DP.</p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={onFechar}>×</button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <label className={`${botao} cursor-pointer`}>
                        {lendo ? 'Lendo…' : r ? 'Escolher outros arquivos' : 'Escolher arquivos do backup'}
                        <input aria-label="Arquivos do backup" type="file" multiple className="sr-only" disabled={lendo}
                            onChange={e => { const l = Array.from(e.target.files ?? []); e.target.value = ''; setGrupo(''); setBusca(''); void abrir(l, codificacao); }} />
                    </label>
                    {r && <button className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:text-slate-200" onClick={baixarInventario}>Baixar inventário da estrutura (CSV)</button>}
                    {r && r.dbfs.length > 0 && (
                        <label className="text-sm text-slate-700 dark:text-slate-200">Acentos dos DBF
                            <select aria-label="Codificação dos DBF" className="ml-2 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={codificacao}
                                onChange={e => { const c = e.target.value as Codificacao | ''; setCodificacao(c); void abrir(arquivos, c); }}>
                                {CODIFICACOES.map(c => <option key={c.v} value={c.v}>{c.r}</option>)}
                            </select>
                        </label>
                    )}
                </div>
                {erro && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{erro}</p>}

                {r && (
                    <>
                        <h4 className="mt-4 text-sm font-semibold text-slate-800 dark:text-white">Arquivos ({r.arquivos.length})</h4>
                        <div className="mt-1 max-h-48 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="min-w-full text-xs">
                                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900"><tr><th className={th}>Arquivo</th><th className={th}>Tipo</th><th className={th}>Tamanho</th><th className={th}>Conteúdo</th></tr></thead>
                                <tbody>{r.arquivos.map(a => (
                                    <tr key={a.caminho} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className={`${td} font-mono`}>{a.caminho}</td><td className={td}>{ROTULO_TIPO[a.tipo]}</td><td className={td}>{tamanho(a.tamanho)}</td><td className={td}>{a.detalhe}</td>
                                    </tr>))}</tbody>
                            </table>
                        </div>

                        {r.backups.map(b => (
                            <dl key={b.nomeArquivo} className="mt-3 grid gap-x-6 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 md:grid-cols-4">
                                {[
                                    ['Parte PostgreSQL', b.nomeArquivo],
                                    ['PostgreSQL de origem', b.versaoPostgresOrigem ?? '—'],
                                    ['Banco', b.banco ?? '—'],
                                    ['Gerado em', b.criadoEm ?? '—'],
                                    ['Formato', `${b.formato}${b.versaoArquivo ? ` · arquivo ${b.versaoArquivo}` : ''}`],
                                    ['pg_dump', b.versaoPgDump ?? '—'],
                                    ['Esquemas', String(b.esquemas.length)],
                                    ['Tabelas com dados', String(b.tabelas.length)],
                                ].map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500 dark:text-slate-400">{k}</dt><dd className="text-slate-800 dark:text-slate-100">{v}</dd></div>)}
                                {b.versaoPostgresOrigem && !b.versaoPostgresOrigem.startsWith('12') && <p className="col-span-full text-xs text-amber-700 dark:text-amber-300">Veio de um PostgreSQL {b.versaoPostgresOrigem}, não do 12 esperado. A leitura funciona; confira se é o arquivo certo.</p>}
                            </dl>
                        ))}
                        {r.avisos.map((a, i) => <p key={i} className="mt-1 text-xs text-amber-700 dark:text-amber-300">{a}</p>)}

                        <div className="mt-4 flex flex-wrap items-end gap-3">
                            <label className="text-sm text-slate-700 dark:text-slate-200">Esquema ou pasta
                                <select aria-label="Esquema ou pasta" className="mt-1 block max-w-xs rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={grupo} onChange={e => setGrupo(e.target.value)}>
                                    <option value="">Todos ({r.grupos.length})</option>
                                    {r.grupos.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </label>
                            <label className="text-sm text-slate-700 dark:text-slate-200">Buscar tabela ou coluna
                                <input aria-label="Buscar tabela ou coluna" className="mt-1 block w-64 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={busca} onChange={e => setBusca(e.target.value)} placeholder="ex.: empresa, cnpj, salario" />
                            </label>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{filtradas.length} tabela(s){filtradas.length > LIMITE_LISTA ? `; mostrando as ${LIMITE_LISTA} primeiras, refine a busca` : ''}.</p>
                        </div>

                        <div className="mt-2 max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="min-w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900"><tr><th className={th}>Origem</th><th className={th}>Esquema / pasta</th><th className={th}>Tabela</th><th className={th}>Colunas</th><th className={th}>Registros</th><th className={th}>No backup</th><th className={th}></th></tr></thead>
                                <tbody>{filtradas.slice(0, LIMITE_LISTA).map(t => (
                                    <tr key={t.id} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className={td}><span className={`rounded px-1.5 py-0.5 text-xs ${t.origem === 'dbf' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'}`}>{t.origem === 'dbf' ? 'DBF' : 'PostgreSQL'}</span></td>
                                        <td className={`${td} text-xs`}>{t.grupo}</td>
                                        <td className={`${td} font-medium`}>{t.tabela}</td>
                                        <td className={`${td} max-w-md truncate text-xs text-slate-500 dark:text-slate-400`} title={t.colunas.join(', ')}>{t.colunas.length} · {t.colunas.slice(0, 6).join(', ')}{t.colunas.length > 6 ? '…' : ''}</td>
                                        <td className={td}>{t.registros ?? '—'}</td>
                                        <td className={td}>{tamanho(t.bytes)}</td>
                                        <td className={`${td} whitespace-nowrap`}>
                                            <button className={botaoSec} disabled={!!ocupado} onClick={() => void verPrevia(t)}>{ocupado === `${t.id}:previa` ? 'Lendo…' : 'Prévia'}</button>{' '}
                                            <button className={botaoSec} disabled={!!ocupado} onClick={() => void exportar(t)}>{ocupado === `${t.id}:csv` ? 'Gerando…' : 'CSV'}</button>
                                        </td>
                                    </tr>))}</tbody>
                            </table>
                        </div>

                        {previa && (
                            <div className="mt-4">
                                <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{previa.t.grupo} › {previa.t.tabela} · {previa.linhas.length < LINHAS_PREVIA ? `${previa.linhas.length} linha(s)` : `primeiras ${LINHAS_PREVIA} linhas`}</h4>
                                <div className="mt-2 max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                                    <table className="min-w-full text-xs">
                                        <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900"><tr>{previa.t.colunas.map(c => <th key={c} className={th}>{c}</th>)}</tr></thead>
                                        <tbody>{previa.linhas.map((l, i) => (
                                            <tr key={i} className="border-t border-slate-100 dark:border-slate-700">{l.map((v, j) => <td key={j} className={`${td} max-w-xs truncate`} title={v ?? 'nulo'}>{v === null ? <span className="text-slate-400">nulo</span> : v}</td>)}</tr>))}</tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Gravar estes dados no Consultor DP depende do de/para validado de empresas, funcionários e eventos (fase 2). Até lá, o backup serve para consulta, inventário e extração.</p>
                    </>
                )}
            </div>
        </div>
    );
};

export default RestaurarBackupModal;
