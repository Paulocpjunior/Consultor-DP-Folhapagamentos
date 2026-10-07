// components/iobSage/GuardaBackups.tsx
//
// Registro de guarda dos backups do IOB SAGE: o arquivo original fica no
// UNAS Pro 4; aqui fica o inventário com o SHA-256, calculado no navegador
// (o arquivo não sai do computador). "Conferir" recalcula e compara.

import React, { useEffect, useState } from 'react';
import type { Usuario } from '../../services/cadastros/cadastrosService';
import { mensagemErro } from '../../services/cadastros/cadastrosService';
import { fonteDeBlob } from '../../services/iobSage/backupPostgres';
import { abrirRestauracao } from '../../services/iobSage/restauracao';
import { codigoDoSchema } from '../../services/cadastros/cargaEnquadramentoIob';
import { sha256DaFonte } from '../../services/backups/sha256';
import { LOCAL_PADRAO, conferirArquivo, tamanhoLegivel, validarRegistro, type Conferencia, type RegistroGuarda } from '../../services/backups/guarda';
import { listarGuarda, registrarGuarda } from '../../services/backups/guardaService';

interface Props { usuario?: Usuario; podeRegistrar: boolean }

const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const inp = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const br = (d: string) => d.split('-').reverse().join('/');

/** Empresas do backup (schemas fNNNN do PostgreSQL); sem conseguir ler, lista vazia. */
async function empresasDoArquivo(f: File): Promise<string[]> {
    try {
        const r = await abrirRestauracao([{ nome: f.name, fonte: fonteDeBlob(f) }]);
        return [...new Set(r.grupos.map(codigoDoSchema).filter(Boolean))].sort((a, b) => Number(a) - Number(b));
    } catch { return []; }
}

const GuardaBackups: React.FC<Props> = ({ usuario, podeRegistrar }) => {
    const [lista, setLista] = useState<RegistroGuarda[] | null>(null);
    const [erro, setErro] = useState('');
    const [ocupado, setOcupado] = useState('');
    const [novo, setNovo] = useState<Omit<RegistroGuarda, 'id' | 'registradoPor' | 'registradoPorEmail' | 'registradoEm'> | null>(null);
    const [conferencia, setConferencia] = useState<{ arquivo: string; resultado: Conferencia } | null>(null);

    const carregar = () => listarGuarda().then(setLista).catch(e => { setErro(mensagemErro(e)); setLista([]); });
    useEffect(() => { void carregar(); }, []);

    async function assinar(f: File): Promise<string> {
        return sha256DaFonte(fonteDeBlob(f), p => setOcupado(`Calculando a assinatura de ${f.name}… ${Math.round(p * 100)}%`));
    }

    async function escolherParaRegistrar(f: File | undefined) {
        if (!f) return;
        setErro(''); setConferencia(null);
        try {
            const sha256 = await assinar(f);
            setOcupado('Lendo as empresas do backup…');
            const empresas = await empresasDoArquivo(f);
            setNovo({ sha256, arquivo: f.name, tamanho: f.size, dataBackup: new Date(f.lastModified).toISOString().slice(0, 10), empresas, localGuarda: LOCAL_PADRAO, observacao: '' });
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    async function confirmar() {
        if (!novo || !usuario) return;
        const erros = validarRegistro({ ...novo, id: novo.sha256, registradoPor: usuario.id, registradoPorEmail: usuario.email });
        if (erros.length) { setErro(erros.join(' ')); return; }
        if (lista?.some(r => r.sha256 === novo.sha256)) { setErro('Este arquivo (mesma assinatura) já está registrado.'); return; }
        setOcupado('Registrando…'); setErro('');
        try { await registrarGuarda(novo, usuario); setNovo(null); await carregar(); }
        catch (e) { setErro(mensagemErro(e)); }
        finally { setOcupado(''); }
    }

    async function conferir(f: File | undefined) {
        if (!f || !lista) return;
        setErro(''); setNovo(null);
        try { setConferencia({ arquivo: f.name, resultado: conferirArquivo(lista, await assinar(f), f.name, f.size) }); }
        catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    return (
        <section aria-label="Registro de guarda dos backups" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div>
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Registro de guarda dos backups do IOB SAGE</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                    O arquivo original fica guardado no {LOCAL_PADRAO}, sem alteração (dados pessoais com guarda obrigatória). Aqui fica só o inventário, com a assinatura SHA-256 calculada neste computador, que prova depois que o arquivo guardado é o mesmo. Registro não se altera nem se apaga.
                </p>
            </div>
            <div className="flex flex-wrap gap-2">
                <label className={`${btn} cursor-pointer ${!podeRegistrar || ocupado ? 'pointer-events-none opacity-50' : ''}`} title={podeRegistrar ? undefined : 'Só o gestor registra.'}>
                    Registrar backup<input type="file" className="hidden" aria-label="Arquivo para registrar" disabled={!podeRegistrar || !!ocupado} onChange={e => { void escolherParaRegistrar(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                <label className={`${btn} cursor-pointer ${!lista || ocupado ? 'pointer-events-none opacity-50' : ''}`}>
                    Conferir um arquivo<input type="file" className="hidden" aria-label="Arquivo para conferir" disabled={!lista || !!ocupado} onChange={e => { void conferir(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
            </div>
            {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

            {conferencia && (
                <p role="status" className={`rounded p-2 text-sm ${conferencia.resultado.situacao === 'integro' ? 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'}`}>
                    {conferencia.resultado.situacao === 'integro' && `${conferencia.arquivo}: íntegro — igual ao registrado em ${br(conferencia.resultado.registro.dataBackup)} (${conferencia.resultado.registro.localGuarda}).`}
                    {conferencia.resultado.situacao === 'nome-diferente' && `${conferencia.arquivo}: conteúdo igual ao registrado como "${conferencia.resultado.registro.arquivo}" (renomeado).`}
                    {conferencia.resultado.situacao === 'alterado' && `${conferencia.arquivo}: ATENÇÃO — há registro com este nome, mas a assinatura é outra: o arquivo foi alterado ou corrompido.`}
                    {conferencia.resultado.situacao === 'nao-registrado' && `${conferencia.arquivo}: não está no registro de guarda.`}
                </p>
            )}

            {novo && (
                <div className="space-y-2 rounded border border-blue-200 p-3 text-sm dark:border-blue-800 dark:text-slate-100">
                    <p><strong>{novo.arquivo}</strong> · {tamanhoLegivel(novo.tamanho)} · empresas {novo.empresas.length ? novo.empresas.join(', ') : 'não identificadas'}</p>
                    <p className="break-all font-mono text-xs text-slate-500">SHA-256 {novo.sha256}</p>
                    <div className="grid gap-2 sm:grid-cols-3">
                        <label>Data do backup<input className={inp} type="date" value={novo.dataBackup} onChange={e => setNovo({ ...novo, dataBackup: e.target.value })} /></label>
                        <label className="sm:col-span-2">Onde está guardado<input className={inp} value={novo.localGuarda} onChange={e => setNovo({ ...novo, localGuarda: e.target.value })} /></label>
                    </div>
                    <label className="block">Observação<input className={inp} value={novo.observacao} onChange={e => setNovo({ ...novo, observacao: e.target.value })} placeholder="Ex.: pasta, responsável pela cópia, prazo de guarda" /></label>
                    <div className="flex justify-end gap-2">
                        <button className={btn} onClick={() => setNovo(null)}>Cancelar</button>
                        <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!!ocupado} onClick={confirmar}>Registrar</button>
                    </div>
                </div>
            )}

            {lista && lista.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-left text-xs text-slate-500"><tr><th className="p-2">Data</th><th className="p-2">Arquivo</th><th className="p-2">Empresas</th><th className="p-2">Tamanho</th><th className="p-2">Guardado em</th><th className="p-2">Registrado por</th></tr></thead>
                        <tbody>{lista.map(r => (
                            <tr key={r.id} className="border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100" title={`SHA-256 ${r.sha256}${r.observacao ? `\n${r.observacao}` : ''}`}>
                                <td className="p-2">{br(r.dataBackup)}</td><td className="p-2 break-all">{r.arquivo}</td><td className="p-2">{r.empresas.join(', ') || '—'}</td>
                                <td className="p-2">{tamanhoLegivel(r.tamanho)}</td><td className="p-2">{r.localGuarda}</td><td className="p-2 text-xs">{r.registradoPorEmail}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
            )}
            {lista && !lista.length && !erro && <p className="text-sm text-slate-500">Nenhum backup registrado ainda.</p>}
        </section>
    );
};

export default GuardaBackups;
