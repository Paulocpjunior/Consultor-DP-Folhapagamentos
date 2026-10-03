// components/iobSage/RestaurarBackupModal.tsx
//
// Restaura (abre para consulta e extração) o backup PostgreSQL 12 do IOB SAGE.
// O arquivo é lido no navegador, em pedaços: nada é enviado ao servidor nem
// gravado no banco do Consultor DP. A gravação no Consultor DP vem depois do
// de/para validado (fase 2 da migração).

import React, { useMemo, useState } from 'react';
import { abrirBackup, fonteDeBlob, tabelaParaCsv, type Backup, type TabelaBackup, type Valor } from '../../services/iobSage/backupPostgres';

const botao = 'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40';
const botaoSec = 'rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-slate-200 disabled:opacity-40';
const th = 'px-2 py-1 text-left font-medium text-slate-600 dark:text-slate-300';
const td = 'px-2 py-1 text-slate-800 dark:text-slate-100';
const LIMITE_LISTA = 300;
const LINHAS_PREVIA = 50;

const tamanho = (b: number | null) => b === null ? '—' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

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
    const [backup, setBackup] = useState<Backup | null>(null);
    const [lendo, setLendo] = useState(false);
    const [erro, setErro] = useState('');
    const [esquema, setEsquema] = useState('');
    const [busca, setBusca] = useState('');
    const [previa, setPrevia] = useState<{ t: TabelaBackup; linhas: Valor[][] } | null>(null);
    const [ocupado, setOcupado] = useState('');

    const filtradas = useMemo(() => {
        if (!backup) return [];
        const b = busca.trim().toLowerCase();
        return backup.tabelas.filter(t => (!esquema || t.esquema === esquema) && (!b || `${t.esquema}.${t.tabela}`.toLowerCase().includes(b) || t.colunas.some(c => c.toLowerCase().includes(b))));
    }, [backup, esquema, busca]);

    if (!aberto) return null;

    async function abrir(f: File | undefined) {
        if (!f) return;
        setLendo(true); setErro(''); setBackup(null); setPrevia(null); setEsquema(''); setBusca('');
        try { setBackup(await abrirBackup(fonteDeBlob(f), f.name)); }
        catch (e) { setErro((e as Error).message); }
        finally { setLendo(false); }
    }

    async function verPrevia(t: TabelaBackup) {
        if (!backup) return;
        setOcupado(`${t.id}:previa`); setErro('');
        try {
            const linhas: Valor[][] = [];
            await backup.lerTabela(t, v => { linhas.push(v); return linhas.length < LINHAS_PREVIA; });
            setPrevia({ t, linhas });
        } catch (e) { setErro(`${t.esquema}.${t.tabela}: ${(e as Error).message}`); }
        finally { setOcupado(''); }
    }

    async function exportar(t: TabelaBackup) {
        if (!backup) return;
        setOcupado(`${t.id}:csv`); setErro('');
        try {
            const { blob } = await tabelaParaCsv(backup, t);
            baixar(`${nomeSeguro(t.esquema)}.${nomeSeguro(t.tabela)}.csv`, blob);
        } catch (e) { setErro(`${t.esquema}.${t.tabela}: ${(e as Error).message}`); }
        finally { setOcupado(''); }
    }

    function baixarInventario() {
        if (!backup) return;
        const linhas = ['﻿esquema;tabela;colunas;quantidade de colunas;bytes no backup',
            ...backup.tabelas.map(t => [t.esquema, t.tabela, `"${t.colunas.join(', ').replace(/"/g, '""')}"`, t.colunas.length, t.bytesNoBackup ?? ''].join(';'))];
        baixar(`inventario-${nomeSeguro(backup.banco || backup.nomeArquivo)}.csv`, new Blob([linhas.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }));
    }

    const origem12 = backup?.versaoPostgresOrigem?.startsWith('12');

    return (
        <div role="dialog" aria-modal="true" aria-label="Restaurar backup do IOB SAGE" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
            <div className="w-full max-w-6xl rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Restaurar backup do IOB SAGE (PostgreSQL 12)</h3>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            Abre o arquivo do pg_dump (.backup, .tar, .sql ou .sql.gz) para consulta: esquemas, tabelas, prévia dos dados, CSV por tabela e inventário da estrutura.
                        </p>
                        <p className="mt-1 text-xs font-medium text-green-700 dark:text-green-300">O arquivo é lido no seu computador. Nada é enviado ao servidor nem gravado no Consultor DP.</p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={onFechar}>×</button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <label className={`${botao} cursor-pointer`}>
                        {lendo ? 'Lendo o backup…' : backup ? 'Abrir outro backup' : 'Escolher arquivo de backup'}
                        <input aria-label="Arquivo de backup" type="file" className="sr-only" disabled={lendo} onChange={e => { void abrir(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {backup && <button className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:text-slate-200" onClick={baixarInventario}>Baixar inventário da estrutura (CSV)</button>}
                </div>
                {erro && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{erro}</p>}

                {backup && (
                    <>
                        <dl className="mt-4 grid gap-x-6 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700 md:grid-cols-3">
                            {[
                                ['Arquivo', `${backup.nomeArquivo} · ${tamanho(backup.tamanhoArquivo)}`],
                                ['Formato', `${backup.formato}${backup.versaoArquivo ? ` · arquivo ${backup.versaoArquivo}` : ''} · compressão ${backup.compressao}`],
                                ['Banco', backup.banco ?? '—'],
                                ['PostgreSQL de origem', backup.versaoPostgresOrigem ?? '—'],
                                ['pg_dump', backup.versaoPgDump ?? '—'],
                                ['Gerado em', backup.criadoEm ?? '—'],
                                ['Esquemas', String(backup.esquemas.length)],
                                ['Tabelas com dados', String(backup.tabelas.length)],
                                ['Objetos', backup.objetos.slice(0, 4).map(o => `${o.quantidade} ${o.tipo}`).join(' · ') || '—'],
                            ].map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500 dark:text-slate-400">{k}</dt><dd className="text-slate-800 dark:text-slate-100">{v}</dd></div>)}
                        </dl>
                        {backup.versaoPostgresOrigem && !origem12 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">O backup veio de um PostgreSQL {backup.versaoPostgresOrigem}, não do 12 esperado no IOB SAGE. A leitura funciona, mas confira se é o arquivo certo.</p>}
                        {backup.avisos.map((a, i) => <p key={i} className="mt-1 text-xs text-slate-500 dark:text-slate-400">{a}</p>)}

                        <div className="mt-4 flex flex-wrap items-end gap-3">
                            <label className="text-sm text-slate-700 dark:text-slate-200">Esquema
                                <select aria-label="Esquema" className="mt-1 block rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={esquema} onChange={e => setEsquema(e.target.value)}>
                                    <option value="">Todos ({backup.esquemas.length})</option>
                                    {backup.esquemas.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </label>
                            <label className="text-sm text-slate-700 dark:text-slate-200">Buscar tabela ou coluna
                                <input aria-label="Buscar tabela ou coluna" className="mt-1 block w-64 rounded border border-slate-300 bg-white px-2 py-1 dark:border-slate-600 dark:bg-slate-900" value={busca} onChange={e => setBusca(e.target.value)} placeholder="ex.: funcionario, salario, cpf" />
                            </label>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{filtradas.length} tabela(s){filtradas.length > LIMITE_LISTA ? `; mostrando as ${LIMITE_LISTA} primeiras, refine a busca` : ''}.</p>
                        </div>

                        <div className="mt-2 max-h-80 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="min-w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900"><tr><th className={th}>Esquema</th><th className={th}>Tabela</th><th className={th}>Colunas</th><th className={th}>No backup</th><th className={th}></th></tr></thead>
                                <tbody>{filtradas.slice(0, LIMITE_LISTA).map(t => (
                                    <tr key={t.id} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className={td}>{t.esquema}</td>
                                        <td className={`${td} font-medium`}>{t.tabela}</td>
                                        <td className={`${td} max-w-md truncate text-xs text-slate-500 dark:text-slate-400`} title={t.colunas.join(', ')}>{t.colunas.length} · {t.colunas.slice(0, 6).join(', ')}{t.colunas.length > 6 ? '…' : ''}</td>
                                        <td className={td}>{tamanho(t.bytesNoBackup)}</td>
                                        <td className={`${td} whitespace-nowrap`}>
                                            <button className={botaoSec} disabled={!!ocupado} onClick={() => void verPrevia(t)}>{ocupado === `${t.id}:previa` ? 'Lendo…' : 'Prévia'}</button>{' '}
                                            <button className={botaoSec} disabled={!!ocupado} onClick={() => void exportar(t)}>{ocupado === `${t.id}:csv` ? 'Gerando…' : 'CSV'}</button>
                                        </td>
                                    </tr>))}</tbody>
                            </table>
                        </div>

                        {previa && (
                            <div className="mt-4">
                                <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{previa.t.esquema}.{previa.t.tabela} · {previa.linhas.length < LINHAS_PREVIA ? `${previa.linhas.length} linha(s)` : `primeiras ${LINHAS_PREVIA} linhas`}</h4>
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
