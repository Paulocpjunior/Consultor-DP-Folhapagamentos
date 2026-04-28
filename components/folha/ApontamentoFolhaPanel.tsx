// components/folha/ApontamentoFolhaPanel.tsx
// Upload do xlsx → preview → matrículas → export CSV/TXT/JSON.
// Parser 100% client-side (SheetJS). Persistência via Firestore.
//
// Mapeamento por EMPRESA (CNPJ): cada empresa cadastrada tem seu próprio
// folha_mapeamentos/{cnpj}. Quando não existe, abre Wizard pra criar na hora.

import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '../../types';
import type {
    ApontamentoParseado,
    MapeamentoApontamento,
    ResultadoMapeamento,
} from '../../services/folha/folhaTypes';
import { parseApontamentoFile, parseApontamentoBuffer } from '../../services/folha/apontamentoParser';
import { montarLancamentos } from '../../services/folha/apontamentoMapper';
import {
    downloadFile,
    exportarTXT,
    nomeArquivoTXT,
    FLAG_LABELS,
    type FolhaFlag,
} from '../../services/folha/apontamentoExporter';
import { listarMinhasEmpresas, listarTodasEmpresas } from '../../services/empresas/empresasService';
import { acharEmpresaPorNome } from '../../services/empresas/matchEmpresa';
import type { Empresa } from '../../services/empresas/empresasTypes';
import {
    addHistorico,
    getCatalogo,
    getMapeamento,
    saveMatriculas,
} from '../../services/folha/folhaFirestoreService';
import type { SessaoFolha } from './FolhaPanel';
import WizardMapeamentoMapas from './WizardMapeamentoMapas';

interface Props {
    currentUser: User;
    sessao: SessaoFolha;
    onTrocarEmpresa: () => void;
}

function tipoParaFlag(tipo: string): FolhaFlag {
    const t = tipo.toLowerCase();
    if (t.includes('13')) return '13' as FolhaFlag;
    if (t.includes('adiant')) return 'adiantamento' as FolhaFlag;
    if (t.includes('féri') || t.includes('feri')) return 'ferias' as FolhaFlag;
    if (t.includes('rescis')) return 'rescisao' as FolhaFlag;
    return 'salario';
}

const ApontamentoFolhaPanel: React.FC<Props> = ({ currentUser, sessao, onTrocarEmpresa }) => {
    // Cliente passa a ser o CNPJ da empresa selecionada — cada empresa tem
    // seu próprio doc em folha_mapeamentos/{cnpj}.
    const cliente = sessao.empresa.cnpj;

    const [competencia, setCompetencia] = useState(sessao.competencia);
    const [file, setFile] = useState<File | null>(null);
    const [parsed, setParsed] = useState<ApontamentoParseado | null>(null);
    const [mapa, setMapa] = useState<MapeamentoApontamento | null>(null);
    const [empresaAtiva, setEmpresaAtiva] = useState<string | null>(null);
    const [matriculasEdit, setMatriculasEdit] = useState<Record<string, Record<string, string>>>({});
    const [resultado, setResultado] = useState<ResultadoMapeamento | null>(null);
    const [processando, setProcessando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [msg, setMsg] = useState<string>('');
    const [flag, setFlag] = useState<FolhaFlag>(tipoParaFlag(sessao.tipo));
    const [empresasCadastradas, setEmpresasCadastradas] = useState<Empresa[]>([]);

    const [showWizard, setShowWizard] = useState(false);
    const [pendingBuffer, setPendingBuffer] = useState<ArrayBuffer | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const m = await getMapeamento(cliente);
                setMapa(m);
                if (!m) {
                    setMsg(
                        `Empresa "${sessao.empresa.razaoSocial}" ainda não tem layout mapeado. ` +
                        `Faça upload da planilha e o Wizard abrirá pra você configurar.`
                    );
                }
            } catch (e) {
                setErro(e instanceof Error ? e.message : String(e));
            }
        })();
    }, [cliente]);

    useEffect(() => {
        (async () => {
            try {
                const isAdminUser = (currentUser as any).role === 'admin';
                const list = isAdminUser
                    ? await listarTodasEmpresas()
                    : await listarMinhasEmpresas((currentUser as any).uid);
                setEmpresasCadastradas(list);
            } catch (e) {
                console.warn('Não foi possível carregar empresas:', e);
            }
        })();
    }, []);

    const handleProcessar = async () => {
        if (!file) {
            alert('Selecione a planilha xlsx primeiro.');
            return;
        }
        setProcessando(true);
        setErro(null);
        setMsg('');
        setResultado(null);

        try {
            // Sem mapa pra essa empresa → abre Wizard
            if (!mapa) {
                const buffer = await file.arrayBuffer();
                setPendingBuffer(buffer);
                setShowWizard(true);
                return;
            }

            const p = await parseApontamentoFile(file);

            if (p.empresas.length === 0) {
                setErro(
                    'Nenhuma aba reconhecida. O cabeçalho A1 da planilha deve ser ' +
                    '"NOME", "Funcionário", "Colaborador" ou "Empregado".'
                );
                return;
            }

            setParsed(p);
            setEmpresaAtiva(p.empresas[0]?.nome ?? null);
            setMatriculasEdit({});
            setMsg(
                `Planilha processada: ${p.empresas.reduce(
                    (a, e) => a + e.funcionarios.length,
                    0
                )} funcionário(s) em ${p.empresas.length} empresa(s).`
            );
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setProcessando(false);
        }
    };

    const handleSalvarMatriculas = async () => {
        try {
            let total = 0;
            for (const [empresa, matriculas] of Object.entries(matriculasEdit)) {
                const filtradas = Object.fromEntries(
                    Object.entries(matriculas).filter(([, v]) => v && v.trim())
                );
                if (Object.keys(filtradas).length > 0) {
                    await saveMatriculas(cliente, empresa, filtradas);
                    total += Object.keys(filtradas).length;
                }
            }
            const m = await getMapeamento(cliente);
            setMapa(m);
            setMatriculasEdit({});
            setMsg(`${total} matrícula(s) salva(s).`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        }
    };

    const handleExportar = async () => {
        if (!parsed || !mapa) return;
        setProcessando(true);
        setErro(null);
        setMsg('');
        try {
            const catalogo = await getCatalogo();
            if (!catalogo) {
                throw new Error(
                    'Catálogo de eventos ainda não importado. Abra a aba "Catálogo de Eventos" e faça o bootstrap.'
                );
            }

            const mapaComEdits: MapeamentoApontamento = {
                ...mapa,
                matriculas: Object.entries(matriculasEdit).reduce(
                    (acc, [emp, mats]) => ({
                        ...acc,
                        [emp]: { ...(acc[emp] ?? {}), ...mats },
                    }),
                    { ...(mapa.matriculas ?? {}) },
                ),
            };

            for (const [emp, mats] of Object.entries(matriculasEdit)) {
                if (Object.keys(mats).length > 0) {
                    try {
                        await saveMatriculas(cliente, emp, mats);
                    } catch (e) {
                        console.warn(`Falha ao salvar matrículas de ${emp}:`, e);
                    }
                }
            }

            const r = montarLancamentos(parsed, mapaComEdits, catalogo);
            setResultado(r);

            if (!r.lancamentos.length) {
                setErro('Nenhum lançamento foi gerado a partir do apontamento.');
                return;
            }

            const compMMAAAA = competencia.replace(/[^0-9]/g, '').padStart(6, '0').slice(-6);
            const lancamentosPorEmpresa = new Map<string, typeof r.lancamentos>();
            for (const l of r.lancamentos) {
                const arr = lancamentosPorEmpresa.get(l.empresa) ?? [];
                arr.push(l);
                lancamentosPorEmpresa.set(l.empresa, arr);
            }

            const arquivosGerados: string[] = [];
            const semCadastro: string[] = [];

            for (const [nomeEmp, lancs] of lancamentosPorEmpresa.entries()) {
                let empresaCad = acharEmpresaPorNome(nomeEmp, empresasCadastradas);
                // Fallback: aba só tem 1 empresa nos lançamentos e empresa selecionada
                // está cadastrada → usa ela (caso SPA, onde a aba é "Planilha1").
                if (!empresaCad && lancamentosPorEmpresa.size === 1) {
                    empresaCad = sessao.empresa;
                }
                if (!empresaCad) {
                    semCadastro.push(nomeEmp);
                    continue;
                }
                const lancsAjustados = lancs.map((l) => ({ ...l, codigoSage: empresaCad!.codigoSage }));
                const txt = exportarTXT(lancsAjustados);
                const nomeArq = nomeArquivoTXT(empresaCad.nomeFantasia, flag, compMMAAAA);
                downloadFile(nomeArq, txt, 'text/plain;charset=utf-8');
                arquivosGerados.push(nomeArq);
                await new Promise((res) => setTimeout(res, 250));
            }

            if (semCadastro.length) {
                r.alertas.push(
                    `Empresa(s) sem cadastro (TXT não gerado): ${semCadastro.join(', ')}. ` +
                    'Cadastre na aba Empresas e gere de novo.'
                );
            }

            const totais: Record<
                string,
                { funcionarios: Set<string>; lancamentos: number; valorTotal: number }
            > = {};
            for (const l of r.lancamentos) {
                const t = (totais[l.empresa] ??= {
                    funcionarios: new Set(),
                    lancamentos: 0,
                    valorTotal: 0,
                });
                t.funcionarios.add(l.funcionario);
                t.lancamentos += 1;
                t.valorTotal += Number(l.valor) || 0;
            }
            const totaisJson = Object.fromEntries(
                Object.entries(totais).map(([k, v]) => [
                    k,
                    {
                        funcionarios: v.funcionarios.size,
                        lancamentos: v.lancamentos,
                        valorTotal: Math.round(v.valorTotal * 100) / 100,
                    },
                ])
            );

            await addHistorico({
                cliente,
                competencia,
                timestamp: new Date().toISOString(),
                totalLancamentos: r.lancamentos.length,
                totaisPorEmpresa: totaisJson,
                alertas: r.alertas,
            });

            setMsg(
                `✓ Exportação concluída: ${r.lancamentos.length} lançamento(s) · ${arquivosGerados.length} arquivo(s) TXT baixado(s)${semCadastro.length ? ` · ${semCadastro.length} empresa(s) sem cadastro` : ''}.`
            );
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setProcessando(false);
        }
    };

    const empresaObj = useMemo(
        () => parsed?.empresas.find((e) => e.nome === empresaAtiva) ?? null,
        [parsed, empresaAtiva]
    );

    return (
        <div className="space-y-4">
            <ContextBar sessao={sessao} currentUser={currentUser} onTrocar={onTrocarEmpresa} />

            <Section numero={1} titulo="Cliente e competência">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                        {mapa
                            ? `Layout cadastrado: ${Object.keys(mapa.mapeamento_colunas ?? {}).length} coluna(s) mapeada(s).`
                            : 'Empresa sem layout. Wizard abrirá no Processar.'}
                    </div>
                    <label className="text-sm text-slate-700 dark:text-slate-300">
                        Competência:{' '}
                        <input
                            type="text"
                            value={competencia}
                            onChange={(e) => setCompetencia(e.target.value)}
                            placeholder="03/2026"
                            className="ml-2 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded w-24"
                        />
                    </label>
                    <label className="text-sm text-slate-700 dark:text-slate-300">
                        Tipo:{' '}
                        <select
                            value={flag}
                            onChange={(e) => setFlag(e.target.value as FolhaFlag)}
                            className="ml-2 px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-white rounded"
                        >
                            {(Object.keys(FLAG_LABELS) as FolhaFlag[]).map((k) => (
                                <option key={k} value={k}>{FLAG_LABELS[k]}</option>
                            ))}
                        </select>
                    </label>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">
                        {empresasCadastradas.length} empresa(s) cadastrada(s)
                    </span>
                </div>
            </Section>

            <Section numero={2} titulo="Upload do apontamento">
                <div className="flex flex-wrap gap-3 items-center">
                    <input
                        type="file"
                        accept=".xlsx,.xlsm,.xls"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="text-sm text-slate-700 dark:text-slate-300"
                    />
                    <button
                        onClick={handleProcessar}
                        disabled={processando || !file}
                        className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
                    >
                        {processando ? 'Processando…' : '⭱ Processar'}
                    </button>
                </div>
            </Section>

            {parsed && (
                <Section numero={3} titulo="Pré-visualização e matrículas">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        {parsed.empresas.map((e) => (
                            <div
                                key={e.nome}
                                className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg"
                            >
                                <div className="text-xs uppercase text-slate-500 dark:text-slate-400">
                                    {e.nome}
                                </div>
                                <div className="text-2xl font-bold text-slate-800 dark:text-white">
                                    {e.funcionarios.length}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    funcionário(s) · {e.colunas.length} coluna(s)
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-1 mb-2 flex-wrap">
                        {parsed.empresas.map((e) => (
                            <button
                                key={e.nome}
                                onClick={() => setEmpresaAtiva(e.nome)}
                                className={`px-3 py-1 text-sm rounded border transition-colors ${
                                    empresaAtiva === e.nome
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                {e.nome}{' '}
                                <span className="text-xs opacity-75">({e.funcionarios.length})</span>
                            </button>
                        ))}
                    </div>

                    {empresaObj && (
                        <div className="overflow-auto max-h-[45vh] border border-slate-200 dark:border-slate-700 rounded-lg">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                                    <tr>
                                        <th className="px-2 py-2 text-left w-[90px]">Matrícula</th>
                                        <th className="px-2 py-2 text-left">Funcionário</th>
                                        {empresaObj.colunas.map((c) => (
                                            <th key={c} className="px-2 py-2 text-left whitespace-nowrap">
                                                {c}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {empresaObj.funcionarios.map((f) => {
                                        const salva = mapa?.matriculas?.[empresaObj.nome]?.[f.nome] ?? '';
                                        const edit = matriculasEdit[empresaObj.nome]?.[f.nome];
                                        const mat = edit !== undefined ? edit : salva;
                                        return (
                                            <tr
                                                key={f.nome}
                                                className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                            >
                                                <td className="px-2 py-1.5">
                                                    <input
                                                        type="text"
                                                        value={mat}
                                                        placeholder="—"
                                                        onChange={(e) =>
                                                            setMatriculasEdit((prev) => ({
                                                                ...prev,
                                                                [empresaObj.nome]: {
                                                                    ...(prev[empresaObj.nome] ?? {}),
                                                                    [f.nome]: e.target.value,
                                                                },
                                                            }))
                                                        }
                                                        className={`w-20 px-1.5 py-0.5 text-sm font-mono border rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-white ${
                                                            mat
                                                                ? 'border-slate-300 dark:border-slate-600'
                                                                : 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                                                        }`}
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200">
                                                    {f.nome}
                                                </td>
                                                {empresaObj.colunas.map((c) => {
                                                    const v = f.celulas[c];
                                                    const n = typeof v === 'number' ? v : Number(v);
                                                    if (Number.isFinite(n) && n !== 0) {
                                                        return (
                                                            <td
                                                                key={c}
                                                                className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300"
                                                            >
                                                                {n.toLocaleString('pt-BR', {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                })}
                                                            </td>
                                                        );
                                                    }
                                                    if (v && typeof v === 'string') {
                                                        return (
                                                            <td
                                                                key={c}
                                                                className="px-2 py-1.5 text-slate-700 dark:text-slate-300"
                                                            >
                                                                {v}
                                                            </td>
                                                        );
                                                    }
                                                    return (
                                                        <td
                                                            key={c}
                                                            className="px-2 py-1.5 text-slate-300 dark:text-slate-600"
                                                        >
                                                            —
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="mt-3">
                        <button
                            onClick={handleSalvarMatriculas}
                            disabled={Object.keys(matriculasEdit).length === 0}
                            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 rounded"
                        >
                            💾 Salvar matrículas
                        </button>
                        <span className="ml-3 text-xs text-slate-500 dark:text-slate-400">
                            Matrículas são memorizadas no Firestore para os próximos meses.
                        </span>
                    </div>
                </Section>
            )}

            {parsed && mapa && (
                <Section numero={4} titulo="Exportar para IOB SAGE">
                    <div className="flex flex-wrap gap-3 items-center">
                        <button
                            onClick={handleExportar}
                            disabled={processando}
                            className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
                        >
                            ▶ Exportar TXTs por empresa
                        </button>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            1 arquivo TXT por empresa cadastrada (layout 40 chars). Valide a 1ª importação no SAGE antes de produção.
                        </span>
                    </div>

                    {resultado && (
                        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                            <div className="font-semibold text-green-800 dark:text-green-200">
                                ✓ {resultado.lancamentos.length} lançamento(s) gerados
                            </div>
                            <ResumoExportacao resultado={resultado} />
                        </div>
                    )}

                    {resultado && resultado.alertas.length > 0 && (
                        <div className="mt-2 text-xs">
                            <div className="font-semibold text-amber-700 dark:text-amber-400 mb-1">
                                Alertas ({resultado.alertas.length}):
                            </div>
                            <ul className="max-h-32 overflow-auto">
                                {resultado.alertas.slice(0, 50).map((a, i) => (
                                    <li
                                        key={i}
                                        className="px-2 py-1 mb-0.5 bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-400 text-amber-800 dark:text-amber-200"
                                    >
                                        ⚠ {a}
                                    </li>
                                ))}
                                {resultado.alertas.length > 50 && (
                                    <li className="px-2 py-1 italic text-amber-700">
                                        … e mais {resultado.alertas.length - 50} alertas
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </Section>
            )}

            {msg && (
                <div className="text-sm text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded border border-green-200 dark:border-green-800">
                    {msg}
                </div>
            )}
            {erro && (
                <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded border border-red-200 dark:border-red-800">
                    {erro}
                </div>
            )}

            {showWizard && pendingBuffer && file && (
                <WizardMapeamentoMapas
                    empresa={sessao.empresa}
                    fileBuffer={pendingBuffer}
                    fileName={file.name}
                    onCancel={() => {
                        setShowWizard(false);
                        setPendingBuffer(null);
                    }}
                    onSaved={async (novoMapa) => {
                        setShowWizard(false);
                        setMapa(novoMapa);
                        try {
                            // Reprocessa o arquivo agora que o mapa existe
                            const blob = new Blob([pendingBuffer]);
                            const p = await parseApontamentoFile(blob);
                            setParsed(p);
                            setEmpresaAtiva(p.empresas[0]?.nome ?? null);
                            setMatriculasEdit({});
                            setMsg(
                                `Layout salvo · ${p.empresas.reduce(
                                    (a, e) => a + e.funcionarios.length,
                                    0
                                )} funcionário(s) processado(s).`
                            );
                        } catch (e) {
                            setErro(e instanceof Error ? e.message : String(e));
                        } finally {
                            setPendingBuffer(null);
                        }
                    }}
                />
            )}
        </div>
    );
};

const ContextBar: React.FC<{
    sessao: SessaoFolha;
    currentUser: User;
    onTrocar: () => void;
}> = ({ sessao, currentUser, onTrocar }) => {
    const [agora, setAgora] = useState(new Date());

    useEffect(() => {
        const id = setInterval(() => setAgora(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    const ini = iniciaisDe(
        sessao.empresa.nomeFantasia || sessao.empresa.razaoSocial || '?'
    );

    return (
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-dashed border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white grid place-items-center font-bold text-base shadow-md">
                        {ini}
                    </div>
                    <div>
                        <div className="font-bold text-slate-800 dark:text-white text-base leading-tight">
                            {sessao.empresa.nomeFantasia || sessao.empresa.razaoSocial}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                            {formatCnpjBr(sessao.empresa.cnpj)} · SAGE {sessao.empresa.codigoSage}
                        </div>
                    </div>
                </div>

                <button
                    onClick={onTrocar}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-600 rounded transition-colors"
                >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Trocar empresa
                </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3">
                <MetaCell label="Período" mono>
                    {sessao.competencia}
                </MetaCell>
                <MetaCell label="Tipo">{sessao.tipo}</MetaCell>
                <MetaCell label="Colaborador">
                    {currentUser.name || currentUser.email}
                    {(currentUser as any).role === 'admin' && (
                        <span className="ml-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                            · Admin
                        </span>
                    )}
                </MetaCell>
                <MetaCell label="Sessão" mono>
                    {formatDataHora(sessao.iniciadaEm)}
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                        agora: {formatDataHora(agora)}
                    </span>
                </MetaCell>
            </div>
        </div>
    );
};

const MetaCell: React.FC<{ label: string; mono?: boolean; children: React.ReactNode }> = ({
    label,
    mono,
    children,
}) => (
    <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
            {label}
        </div>
        <div className={`text-sm font-semibold text-slate-800 dark:text-white ${mono ? 'font-mono' : ''}`}>
            {children}
        </div>
    </div>
);

const Section: React.FC<{
    numero: number;
    titulo: string;
    children: React.ReactNode;
}> = ({ numero, titulo, children }) => (
    <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-800 dark:text-white">
            <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full text-xs">
                {numero}
            </span>
            {titulo}
        </h3>
        {children}
    </div>
);

const ResumoExportacao: React.FC<{ resultado: ResultadoMapeamento }> = ({ resultado }) => {
    const porEmpresa: Record<
        string,
        { funcionarios: Set<string>; lancamentos: number; total: number }
    > = {};
    for (const l of resultado.lancamentos) {
        const t = (porEmpresa[l.empresa] ??= {
            funcionarios: new Set(),
            lancamentos: 0,
            total: 0,
        });
        t.funcionarios.add(l.funcionario);
        t.lancamentos += 1;
        t.total += Number(l.valor) || 0;
    }
    return (
        <ul className="mt-2 text-sm text-green-900 dark:text-green-100">
            {Object.entries(porEmpresa).map(([emp, t]) => (
                <li key={emp}>
                    <strong>{emp}</strong>: {t.funcionarios.size} func., {t.lancamentos}{' '}
                    lançamento(s), R${' '}
                    {t.total.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                </li>
            ))}
        </ul>
    );
};

function iniciaisDe(s: string): string {
    const partes = s.trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function formatCnpjBr(cnpj?: string): string {
    if (!cnpj) return '—';
    const d = cnpj.replace(/\D/g, '');
    if (d.length !== 14) return cnpj;
    return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function formatDataHora(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default ApontamentoFolhaPanel;
