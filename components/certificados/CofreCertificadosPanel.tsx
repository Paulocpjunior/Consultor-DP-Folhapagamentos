// components/certificados/CofreCertificadosPanel.tsx
//
// Certificados digitais da carteira, lidos do cofre único do SaaS (CFI +
// acompanhamento do Departamento Legal). Só leitura: o arquivo e a senha
// nunca chegam a este app; a renovação sobe pelo app Legal.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    ROTULO_SITUACAO, cofreDaMinhaCarteira, contagemCofre, diasDaLinha, filtrarCofre, precisaAtencao,
    type FiltroCofre, type LinhaCofre,
} from '../../services/certificados/cofreCertificados';

interface Dados { linhas: LinhaCofre[]; foraDoCfi: string[]; avisos: string[]; nomes: Map<string, string> }

const br = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const cnpjFmt = (c: string) => (c?.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const prazo = (d: number | null) => (d === null ? '' : d < 0 ? `vencido há ${-d} dia(s)` : d === 0 ? 'vence hoje' : `em ${d} dia(s)`);

const FILTROS: { id: FiltroCofre; rotulo: (c: ReturnType<typeof contagemCofre>, att: number) => string }[] = [
    { id: 'atencao', rotulo: (_, a) => `Pedem atenção (${a})` },
    { id: 'vencendo', rotulo: c => `Vencem em 30 dias (${c.vencendo})` },
    { id: 'vencidos', rotulo: c => `Vencidos (${c.vencidos})` },
    { id: 'sem', rotulo: c => `Sem certificado (${c.sem})` },
    { id: 'renovados-sem-upload', rotulo: c => `Renovados sem upload (${c.renovadosSemUpload})` },
    { id: 'todos', rotulo: c => `Todos (${c.total})` },
];

const corSituacao = (l: LinhaCofre) => (!l.apto ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
    : precisaAtencao(l) ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
    : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200');

const CofreCertificadosPanel: React.FC = () => {
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [filtro, setFiltro] = useState<FiltroCofre>('atencao');

    const carregar = useCallback(async () => {
        setCarregando(true); setErro('');
        try {
            setDados(await cofreDaMinhaCarteira());
        } catch (e) {
            setErro((e as Error)?.message || String(e));
        } finally { setCarregando(false); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    const contagem = useMemo(() => contagemCofre(dados?.linhas ?? []), [dados]);
    const atencao = useMemo(() => (dados?.linhas ?? []).filter(precisaAtencao).length, [dados]);
    const lista = useMemo(() => filtrarCofre(dados?.linhas ?? [], filtro), [dados, filtro]);
    const nome = (l: LinhaCofre) => dados?.nomes.get(l.cnpj) ?? l.nome ?? l.cnpj;

    function exportar() {
        if (!dados) return;
        const linhas = dados.linhas.map(l => {
            const c = l.certificado ?? l.certificadoDaRaiz;
            return {
                Empresa: nome(l), CNPJ: cnpjFmt(l.cnpj), Situação: ROTULO_SITUACAO[l.situacao] ?? l.situacao,
                Titular: c?.titular ?? '', Tipo: c?.tipo ?? '', 'Válido até': br(c?.validoAte), Prazo: prazo(diasDaLinha(l)),
                'Vencimento no Legal': br(l.legal?.vencimentoInformado), 'Última renovação': br(l.legal?.ultimaRenovacao?.dataNova),
                Divergência: l.divergenciaLegal === 'renovado-sem-upload' ? 'Renovado no Legal sem o A1 novo no cofre' : l.divergenciaLegal === 'legal-desatualizado' ? 'Legal desatualizado' : '',
                'O que fazer': l.acao ?? '',
            };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Certificados');
        XLSX.writeFile(wb, `certificados-${new Date().toLocaleDateString('sv-SE')}.xlsx`);
    }

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">🔐 Certificados digitais</h2>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        Cofre único do SaaS: o mesmo que o Consultor Fiscal e o Departamento Legal veem. Só as empresas da sua carteira.
                        A renovação (novo .pfx) sobe pelo app Legal; aqui não se envia nem se baixa certificado.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={carregar} disabled={carregando} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600 dark:text-white">{carregando ? 'Atualizando…' : '↻ Atualizar'}</button>
                    <button onClick={exportar} disabled={!dados?.linhas.length} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600 dark:text-white">Exportar Excel</button>
                </div>
            </header>

            {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {!dados && !erro && <p className="text-sm text-slate-500">Carregando o cofre…</p>}

            {dados && (
                <>
                    <div role="group" aria-label="Filtros" className="flex flex-wrap gap-2">
                        {FILTROS.map(f => (
                            <button key={f.id} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}
                                className={`rounded-full border px-3 py-1 text-xs ${filtro === f.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`}>
                                {f.rotulo(contagem, atencao)}
                            </button>
                        ))}
                    </div>

                    {dados.foraDoCfi.length > 0 && (
                        <p className="rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                            {dados.foraDoCfi.length} empresa(s) da sua carteira não estão no cadastro central do Consultor Fiscal, então não têm certificado no cofre: {dados.foraDoCfi.map(c => dados.nomes.get(c) ?? cnpjFmt(c)).join('; ')}.
                        </p>
                    )}

                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-100 text-left text-xs dark:bg-slate-800 dark:text-slate-200">
                                <tr><th className="px-3 py-2">Empresa</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Certificado</th><th className="px-3 py-2">Válido até</th><th className="px-3 py-2">Departamento Legal</th><th className="px-3 py-2">O que fazer</th></tr>
                            </thead>
                            <tbody>
                                {lista.map(l => {
                                    const c = l.certificado ?? l.certificadoDaRaiz;
                                    return (
                                        <tr key={l.cnpj} className="border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100">
                                            <td className="px-3 py-2"><strong>{nome(l)}</strong><span className="block text-xs text-slate-500">{cnpjFmt(l.cnpj)}</span></td>
                                            <td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${corSituacao(l)}`}>{ROTULO_SITUACAO[l.situacao] ?? l.situacao}</span></td>
                                            <td className="px-3 py-2 text-xs">{c ? <>{c.titular ?? '—'}<span className="block text-slate-500">{c.tipo} · {c.emissor ?? ''}{l.certificadoDaRaiz ? ' · certificado da matriz' : ''}</span></> : '—'}</td>
                                            <td className="px-3 py-2 text-xs">{br(c?.validoAte)}<span className="block text-slate-500">{prazo(diasDaLinha(l))}</span></td>
                                            <td className="px-3 py-2 text-xs">
                                                {l.legal ? <>
                                                    Vencimento acompanhado: {br(l.legal.vencimentoInformado)}
                                                    {l.legal.ultimaRenovacao && <span className="block text-slate-500">Renovado: {br(l.legal.ultimaRenovacao.dataAntiga)} → {br(l.legal.ultimaRenovacao.dataNova)}</span>}
                                                </> : <span className="text-slate-500">—</span>}
                                                {l.divergenciaLegal === 'renovado-sem-upload' && <span className="mt-1 block rounded bg-red-50 px-1 font-medium text-red-700 dark:bg-red-900/30 dark:text-red-200">Renovado no Legal, mas o A1 novo não subiu ao cofre</span>}
                                                {l.divergenciaLegal === 'legal-desatualizado' && <span className="mt-1 block rounded bg-amber-50 px-1 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">Cofre mais novo que o acompanhamento do Legal</span>}
                                            </td>
                                            <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{l.acao ?? (l.apto ? '' : l.motivo)}</td>
                                        </tr>
                                    );
                                })}
                                {!lista.length && <tr><td colSpan={6} className="p-6 text-center text-sm text-slate-500">Nada neste filtro.</td></tr>}
                            </tbody>
                        </table>
                    </div>

                    {dados.avisos.length > 0 && (
                        <details className="text-xs text-slate-600 dark:text-slate-300">
                            <summary className="cursor-pointer">Avisos do cofre ({dados.avisos.length})</summary>
                            <ul className="mt-1 list-disc pl-5">{dados.avisos.map(a => <li key={a}>{a}</li>)}</ul>
                        </details>
                    )}
                </>
            )}
        </div>
    );
};

export default CofreCertificadosPanel;
