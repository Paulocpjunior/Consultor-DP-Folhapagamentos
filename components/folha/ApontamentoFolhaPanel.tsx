// components/folha/ApontamentoFolhaPanel.tsx
// VERSÃO COM SELEÇÃO DE COLUNAS POR PERFIL
//
// Mudanças vs versão anterior:
//   1. Após processar o XLSX, calcula seleção inicial de colunas (perfil salvo
//      ou auto-detect: colunas com >=1 dado).
//   2. Pré-visualização ganha checkbox no header de cada coluna + badge com
//      preenchimento (ex: "Salário 102/103").
//   3. Botão "💾 Salvar como padrão" persiste seleção em folha_perfis_colunas.
//   4. Exportar passa o Set de colunas ativas pro mapper.
//   5. Funcionários sem matrícula bloqueiam a exportação (mensagem clara).

import React, { useEffect, useMemo, useState } from 'react';
// ─── Helper: filtro de abas por competência ────────────────────────────
// Aceita variações: "ABRIL 2026 ", "ABRIL 2026", "ABRIL/2026", "abril 2026"
const MESES_PT: Record<string, string> = {
    '01': 'JANEIRO', '02': 'FEVEREIRO', '03': 'MARCO',  '04': 'ABRIL',
    '05': 'MAIO',    '06': 'JUNHO',     '07': 'JULHO',  '08': 'AGOSTO',
    '09': 'SETEMBRO','10': 'OUTUBRO',   '11': 'NOVEMBRO','12': 'DEZEMBRO',
};

function normalizar(s: string): string {
    return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

export function abaCasaCompetencia(nomeAba: string, competencia: string): boolean {
    if (!nomeAba || !competencia) return false;
    const m = competencia.replace(/[^0-9]/g, '').padStart(6, '0').slice(-6);
    if (m.length !== 6) return false;
    const mes = m.slice(0, 2);
    const ano = m.slice(2);
    const mesPT = MESES_PT[mes];
    if (!mesPT) return false;
    const aba = normalizar(nomeAba);
    return aba.includes(mesPT) && aba.includes(ano);
}

import type { User } from '../../types';
import type {
    ApontamentoParseado,
    MapeamentoApontamento,
    ResultadoMapeamento,
} from '../../services/folha/folhaTypes';
import type { Empresa } from '../../types';
import { parseApontamentoFile, parseApontamentoBuffer } from '../../services/folha/apontamentoParser';
import { detectarTemplatePadrao } from '../../services/folha/templatePadraoDetector';
import { parsearTemplatePadrao } from '../../services/folha/templatePadraoParser';
import {
    getMapeamento,
    saveMatriculas,
    getCatalogo,
    addHistorico,
} from '../../services/folha/folhaFirestoreService';
import { montarLancamentos } from '../../services/folha/apontamentoMapper';
import {
    getPerfilColunas,
    savePerfilColunas,
    calcularSelecaoInicial,
    type PerfilColunas,
} from '../../services/folha/folhaPerfilColunasService';
import { exportarTXT, nomeArquivoTXT, downloadFile, type FolhaFlag, FLAG_LABELS } from '../../services/folha/apontamentoExporter';
import { listarTodasEmpresas, listarMinhasEmpresas } from '../../services/empresas/empresasService';
import WizardMapeamentoMapas from './WizardMapeamentoMapas';
import { acharEmpresaPorNome } from '../../services/empresas/matchEmpresa';
// downloadFile vem de apontamentoExporter
// FolhaFlag e FLAG_LABELS vem de apontamentoExporter; tipoParaFlag definida abaixo
import type { SessaoFolha } from './FolhaPanel';

interface Props {
    currentUser: User;
    sessao: SessaoFolha;
    onTrocarEmpresa: () => void;
}

function tipoParaFlag(tipo: string): FolhaFlag {
    const t = tipo.toLowerCase();
    if (t.includes("adiant")) return "adiantamento";
    if (t.includes("féri") || t.includes("feri")) return "ferias";
    if (t.includes("13")) return "13sal_2parc";
    return "salario";
}

const ApontamentoFolhaPanel: React.FC<Props> = ({ currentUser, sessao, onTrocarEmpresa }) => {
    const cliente = sessao.empresa.cnpj;

    const [competencia, setCompetencia] = useState(sessao.competencia);
    const [file, setFile] = useState<File | null>(null);
    const [parsed, setParsed] = useState<ApontamentoParseado | null>(null);
    const [mapa, setMapa] = useState<MapeamentoApontamento | null>(null);
    const [perfil, setPerfil] = useState<PerfilColunas | null>(null);
    const [empresaAtiva, setEmpresaAtiva] = useState<string | null>(null);
    const [matriculasEdit, setMatriculasEdit] = useState<Record<string, Record<string, string>>>({});
    const [resultado, setResultado] = useState<ResultadoMapeamento | null>(null);
    const [processando, setProcessando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [msg, setMsg] = useState<string>('');
    const [flag, setFlag] = useState<FolhaFlag>(tipoParaFlag(sessao.tipo));
    const [empresasCadastradas, setEmpresasCadastradas] = useState<Empresa[]>([]);

    // Seleção de colunas (por aba do parser)
    const [colunasAtivas, setColunasAtivas] = useState<Record<string, Set<string>>>({});
    const [perfilDirty, setPerfilDirty] = useState(false);
    const [salvandoPerfil, setSalvandoPerfil] = useState(false);

    const [showWizard, setShowWizard] = useState(false);
    const [pendingBuffer, setPendingBuffer] = useState<ArrayBuffer | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const m = await getMapeamento(cliente);
                setMapa(m);
                const p = await getPerfilColunas(cliente);
                setPerfil(p);
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

    /**
     * Após processar o parsed, calcula seleção inicial de colunas para cada aba.
     */
    function inicializarSelecaoColunas(p: ApontamentoParseado, perfilAtual: PerfilColunas | null) {
        const novo: Record<string, Set<string>> = {};
        for (const empresa of p.empresas) {
            novo[empresa.nome] = calcularSelecaoInicial(
                empresa.colunas,
                empresa.funcionarios,
                perfilAtual,
            );
        }
        setColunasAtivas(novo);
        setPerfilDirty(false);
    }

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
            // ─── Tentar Template Padrão primeiro (não depende de "mapa") ───
            const deteccaoTemplate = await detectarTemplatePadrao(file);
            console.log('[ApontamentoPanel] Detecção template padrão:', deteccaoTemplate);

            if (deteccaoTemplate.ehTemplatePadrao) {
                let mapaCatalogo = null;
                try {
                    const cat = await getCatalogo();
                    if (cat && Array.isArray(cat.eventos)) {
                        mapaCatalogo = new Map(cat.eventos.map((ev) => [ev.codigo, ev]));
                    }
                } catch (e) {
                    console.warn('[ApontamentoPanel] Catálogo indisponível, usando heurística:', e);
                }

                const r = await parsearTemplatePadrao(file, {
                    empresaNome: sessao.empresa.razaoSocial ?? cliente,
                    codigoSage: sessao.empresa.codigoSage ?? '',
                    catalogo: mapaCatalogo,
                });

                console.log('[ApontamentoPanel] Template padrão processado:', {
                    lancamentos: r.lancamentos.length,
                    funcionarios: r.funcionarios.length,
                    alertas: r.alertas.length,
                    codigosSemCatalogo: r.codigosSemCatalogo,
                });

                setParsed(null);
                setResultado({
                    lancamentos: r.lancamentos,
                    alertas: r.alertas,
                });
                setMatriculasEdit({});
                setMsg(
                    `Template Padrão · ${r.lancamentos.length} lançamento(s) de ` +
                    `${r.funcionarios.length} funcionário(s)` +
                    (r.competencia ? ` · competência ${r.competencia}` : '')
                );

                if (r.codigosSemCatalogo.length > 0) {
                    alert(
                        `Atenção: ${r.codigosSemCatalogo.length} código(s) de evento não estão no catálogo ` +
                        `da empresa nem na Tabela de Eventos do template:\n\n` +
                        r.codigosSemCatalogo.join(', ') +
                        `\n\nO Tipo (V=Vencimento ou D=Desconto) foi inferido pela descrição. Revise antes de exportar.`
                    );
                }
                return;
            }

            // ─── Fallback: fluxo legado (parser por coluna) ───
            if (!mapa) {
                const buffer = await file.arrayBuffer();
                setPendingBuffer(buffer);
                setShowWizard(true);
                return;
            }

            const p = await parseApontamentoFile(file);

            if (p.empresas.length === 0) {
                setErro(
                    'Nenhuma aba reconhecida. Verifique o XLSX — o cabeçalho deve conter ' +
                    '"NOME", "Funcionário", "Colaborador" ou "Empregado" em alguma das ' +
                    'primeiras linhas.'
                );
                return;
            }

            setParsed(p);
            setEmpresaAtiva(p.empresas[0]?.nome ?? null);
            setMatriculasEdit({});
            inicializarSelecaoColunas(p, perfil);
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

    const toggleColuna = (empresaNome: string, coluna: string) => {
        setColunasAtivas((prev) => {
            const set = new Set(prev[empresaNome] ?? []);
            if (set.has(coluna)) set.delete(coluna);
            else set.add(coluna);
            return { ...prev, [empresaNome]: set };
        });
        setPerfilDirty(true);
    };

    const marcarTodasColunas = (empresaNome: string, valor: boolean) => {
        const empresa = parsed?.empresas.find((e) => e.nome === empresaNome);
        if (!empresa) return;
        setColunasAtivas((prev) => ({
            ...prev,
            [empresaNome]: valor ? new Set(empresa.colunas) : new Set(),
        }));
        setPerfilDirty(true);
    };

    const handleSalvarPerfil = async () => {
        if (!parsed) return;
        setSalvandoPerfil(true);
        setErro(null);
        try {
            // Une as colunas ativas de todas as abas (geralmente só tem 1 aba útil)
            const todas = new Set<string>();
            Object.values(colunasAtivas).forEach((set) => set.forEach((c) => todas.add(c)));
            await savePerfilColunas(
                cliente,
                Array.from(todas),
                sessao.empresa.razaoSocial || sessao.empresa.nomeFantasia,
            );
            const novo = await getPerfilColunas(cliente);
            setPerfil(novo);
            setPerfilDirty(false);
            setMsg(`✓ Padrão de colunas salvo: ${todas.size} coluna(s) ativa(s).`);
        } catch (e) {
            setErro(e instanceof Error ? e.message : String(e));
        } finally {
            setSalvandoPerfil(false);
        }
    };

    const handleExportar = async () => {
        const usaTemplate = !parsed && !!resultado && resultado.lancamentos.length > 0;
        const usaLegado = !!parsed && !!mapa;
        if (!usaTemplate && !usaLegado) return;
        setProcessando(true);
        setErro(null);
        setMsg('');
        console.log('[handleExportar] modo:', usaTemplate ? 'TEMPLATE_PADRAO' : 'LEGADO');
        try {
            const catalogo = await getCatalogo();
            if (!catalogo) {
                throw new Error(
                    'Catálogo de eventos ainda não importado. Abra a aba "Catálogo de Eventos" e faça o bootstrap.'
                );
            }

            let r: any;
            if (usaTemplate && resultado) {
                r = {
                    lancamentos: resultado.lancamentos.slice(),
                    alertas: (resultado.alertas ?? []).slice(),
                    funcionariosSemMatricula: [],
                };
                console.log('[handleExportar] Template padrão · ' + r.lancamentos.length + ' lançamento(s) prontos.');
            } else if (parsed && mapa) {
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
                        try { await saveMatriculas(cliente, emp, mats); } catch (e) { console.warn(e); }
                    }
                }
                const colunasAtivasUnion = new Set<string>();
                Object.values(colunasAtivas).forEach((set) => set.forEach((c) => colunasAtivasUnion.add(c)));
                r = montarLancamentos(parsed, mapaComEdits, catalogo, {
                    colunasAtivas: colunasAtivasUnion,
                    exigirMatricula: true,
                });
                setResultado(r);
                if (r.funcionariosSemMatricula && r.funcionariosSemMatricula.length > 0) {
                    setErro(
                        `Exportação bloqueada: ${r.funcionariosSemMatricula.length} funcionário(s) ` +
                        `sem matrícula cadastrada. Preencha as matrículas em amarelo na tabela acima ` +
                        `e tente exportar novamente.`
                    );
                    return;
                }
            }

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

            const totais: Record<string, { funcionarios: Set<string>; lancamentos: number; valorTotal: number }> = {};
            for (const l of r.lancamentos) {
                const t = (totais[l.empresa] ??= { funcionarios: new Set(), lancamentos: 0, valorTotal: 0 });
                t.funcionarios.add(l.funcionario);
                t.lancamentos += 1;
                t.valorTotal += Number(l.valor) || 0;
            }
            const totaisJson = Object.fromEntries(
                Object.entries(totais).map(([k, v]) => [k, {
                    funcionarios: v.funcionarios.size,
                    lancamentos: v.lancamentos,
                    valorTotal: Math.round(v.valorTotal * 100) / 100,
                }])
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

    // Filtra abas que casam com a competência selecionada (filtro estrito).
    // Ex: competência "04/2026" → mostra só a aba que contém "ABRIL" e "2026" no nome.
    // Auto-seleciona primeira aba filtrada quando competência ou parsed muda
    // (evita ficar travado numa empresa que sumiu do filtro)
    useEffect(() => {
        if (!parsed) return;
        const filtradas = parsed.empresas.filter((e) => abaCasaCompetencia(e.nome, competencia));
        const candidatas = filtradas.length > 0 ? filtradas : parsed.empresas;
        if (candidatas.length === 0) return;
        const ativaAindaExiste = candidatas.some((e) => e.nome === empresaAtiva);
        if (!ativaAindaExiste) {
            setEmpresaAtiva(candidatas[0].nome);
        }
    }, [parsed, competencia, empresaAtiva]);

    const empresasFiltradas = useMemo(() => {
        if (!parsed) return [];
        if (parsed.empresas.length <= 1) return parsed.empresas;
        const filtradas = parsed.empresas.filter((e) => abaCasaCompetencia(e.nome, competencia));
        // Se nenhuma aba bate → mostra TODAS (fallback) pra não bloquear o usuário
        return filtradas.length > 0 ? filtradas : parsed.empresas;
    }, [parsed, competencia]);

    const competenciaCasaAlguma = useMemo(() => {
        if (!parsed || parsed.empresas.length <= 1) return true;
        return parsed.empresas.some((e) => abaCasaCompetencia(e.nome, competencia));
    }, [parsed, competencia]);

    // Conta preenchimento por coluna na empresa ativa
    const preenchimentoPorColuna = useMemo(() => {
        if (!empresaObj) return new Map<string, number>();
        const m = new Map<string, number>();
        for (const c of empresaObj.colunas) m.set(c, 0);
        for (const f of empresaObj.funcionarios) {
            for (const c of empresaObj.colunas) {
                const v = f.celulas[c];
                if (v !== null && v !== undefined && v !== '' && v !== 0) {
                    m.set(c, (m.get(c) ?? 0) + 1);
                }
            }
        }
        return m;
    }, [empresaObj]);

    return (
        <div className="space-y-4">
            <ContextBar sessao={sessao} currentUser={currentUser} onTrocar={onTrocarEmpresa} />

            <Section numero={1} titulo="Cliente e competência">
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                        {mapa
                            ? `Layout cadastrado: ${Object.keys(mapa.mapeamento_colunas ?? {}).length} coluna(s) mapeada(s).`
                            : 'Empresa sem layout. Wizard abrirá no Processar.'}
                        {perfil && (
                            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                                · Perfil de colunas: {perfil.colunas_ativas.length} ativa(s)
                            </span>
                        )}
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

            {parsed && empresaObj && (
                <Section numero={3} titulo="Pré-visualização, matrículas e seleção de colunas">
                    {/* Tabs de empresas */}
                    {parsed.empresas.length > 1 && (
                        <div className="flex flex-col gap-2 mb-2">
                            {!competenciaCasaAlguma && (
                                <div className="text-xs px-2 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded">
                                    ⚠ Nenhuma aba do arquivo casa com a competência <strong>{competencia}</strong>. Mostrando todas as abas — verifique se a competência ou os nomes das abas estão corretos.
                                </div>
                            )}
                            {competenciaCasaAlguma && empresasFiltradas.length < parsed.empresas.length && (
                                <div className="text-xs px-2 py-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 rounded">
                                    🔎 Filtro estrito ativo: mostrando {empresasFiltradas.length} aba(s) que casam com competência <strong>{competencia}</strong>. {parsed.empresas.length - empresasFiltradas.length} aba(s) histórica(s) ocultada(s).
                                </div>
                            )}
                            <div className="flex gap-1 flex-wrap">
                            {empresasFiltradas.map((e) => (
                                <button
                                    key={e.nome}
                                    onClick={() => setEmpresaAtiva(e.nome)}
                                    className={`px-3 py-1 text-sm rounded border ${
                                        empresaAtiva === e.nome
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {e.nome} <span className="text-xs opacity-75">({e.funcionarios.length})</span>
                                </button>
                            ))}
                            </div>
                        </div>
                    )}

                    {/* Toolbar do perfil de colunas */}
                    <div className="flex flex-wrap gap-2 items-center mb-3 p-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded">
                        <span className="text-xs text-emerald-800 dark:text-emerald-200 font-semibold">
                            🗂 Colunas selecionadas: {colunasAtivas[empresaObj.nome]?.size ?? 0} de {empresaObj.colunas.length}
                        </span>
                        <button
                            onClick={() => marcarTodasColunas(empresaObj.nome, true)}
                            className="text-xs px-2 py-0.5 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded"
                        >
                            Marcar todas
                        </button>
                        <button
                            onClick={() => marcarTodasColunas(empresaObj.nome, false)}
                            className="text-xs px-2 py-0.5 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded"
                        >
                            Desmarcar todas
                        </button>
                        <button
                            onClick={handleSalvarPerfil}
                            disabled={salvandoPerfil || !perfilDirty}
                            className="ml-auto text-xs px-2 py-1 font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Salva a seleção atual como padrão para esse cliente. Próximos meses já vêm com esse padrão marcado."
                        >
                            {salvandoPerfil ? 'Salvando…' : '💾 Salvar como padrão deste cliente'}
                        </button>
                        {perfilDirty && (
                            <span className="text-xs text-amber-700 dark:text-amber-400">⚠ alterações não salvas</span>
                        )}
                    </div>

                    {/* Tabela */}
                    <div className="overflow-auto max-h-[55vh] border border-slate-200 dark:border-slate-700 rounded-lg">
                        <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                                <tr>
                                    <th className="px-2 py-2 text-left w-[90px]">Matrícula</th>
                                    <th className="px-2 py-2 text-left">Funcionário</th>
                                    {empresaObj.colunas.map((c) => {
                                        const ativa = colunasAtivas[empresaObj.nome]?.has(c) ?? false;
                                        const preench = preenchimentoPorColuna.get(c) ?? 0;
                                        const totalFunc = empresaObj.funcionarios.length;
                                        const pct = totalFunc > 0 ? (preench * 100) / totalFunc : 0;
                                        const corBadge =
                                            preench === 0
                                                ? 'text-slate-400 bg-slate-100 dark:bg-slate-700'
                                                : pct < 10
                                                    ? 'text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-300'
                                                    : 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300';
                                        return (
                                            <th
                                                key={c}
                                                className={`px-2 py-2 text-left whitespace-nowrap ${
                                                    !ativa ? 'opacity-40' : ''
                                                }`}
                                            >
                                                <label className="flex flex-col gap-0.5 cursor-pointer">
                                                    <span className="flex items-center gap-1">
                                                        <input
                                                            type="checkbox"
                                                            checked={ativa}
                                                            onChange={() => toggleColuna(empresaObj.nome, c)}
                                                        />
                                                        <span className="text-xs">{c}</span>
                                                    </span>
                                                    <span className={`text-[10px] px-1 rounded ${corBadge}`}>
                                                        {preench}/{totalFunc}
                                                    </span>
                                                </label>
                                            </th>
                                        );
                                    })}
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
                                            <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200">{f.nome}</td>
                                            {empresaObj.colunas.map((c) => {
                                                const ativa = colunasAtivas[empresaObj.nome]?.has(c) ?? false;
                                                const v = f.celulas[c];
                                                const n = typeof v === 'number' ? v : Number(v);
                                                const cellClass = ativa ? '' : 'opacity-30';
                                                if (Number.isFinite(n) && n !== 0) {
                                                    return (
                                                        <td key={c} className={`px-2 py-1.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 ${cellClass}`}>
                                                            {n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                    );
                                                }
                                                if (v && typeof v === 'string') {
                                                    return <td key={c} className={`px-2 py-1.5 text-slate-700 dark:text-slate-300 ${cellClass}`}>{v}</td>;
                                                }
                                                return <td key={c} className={`px-2 py-1.5 text-slate-300 dark:text-slate-600 ${cellClass}`}>—</td>;
                                            })}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-3">
                        <button
                            onClick={handleSalvarMatriculas}
                            disabled={Object.keys(matriculasEdit).length === 0}
                            className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 rounded"
                        >
                            💾 Salvar matrículas
                        </button>
                        <span className="ml-3 text-xs text-slate-500 dark:text-slate-400">
                            Matrículas e perfil de colunas são memorizados no Firestore para os próximos meses.
                        </span>
                    </div>
                </Section>
            )}

            {((parsed && mapa) || (resultado && resultado.lancamentos.length > 0)) && (
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
                            Apenas as colunas marcadas serão incluídas. Funcionários sem matrícula bloqueiam a exportação.
                        </span>
                    </div>

                    {resultado && resultado.lancamentos.length > 0 && (
                        <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                            <div className="font-semibold text-green-800 dark:text-green-200">
                                ✓ {resultado.lancamentos.length} lançamento(s) gerados
                            </div>
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
                    onCancel={() => { setShowWizard(false); setPendingBuffer(null); }}
                    onSaved={async (novoMapa) => {
                        setShowWizard(false);
                        setMapa(novoMapa);
                        try {
                            const blob = new Blob([pendingBuffer]);
                            const p = await parseApontamentoFile(blob);
                            setParsed(p);
                            setEmpresaAtiva(p.empresas[0]?.nome ?? null);
                            setMatriculasEdit({});
                            inicializarSelecaoColunas(p, perfil);
                            setMsg(`Layout salvo · ${p.empresas.reduce((a, e) => a + e.funcionarios.length, 0)} funcionário(s) processado(s).`);
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

// ─── Subcomponentes ────────────────────────────────────────────────────────

const ContextBar: React.FC<{ sessao: SessaoFolha; currentUser: User; onTrocar: () => void }> = ({ sessao, currentUser, onTrocar }) => {
    const [agora, setAgora] = useState(new Date());
    useEffect(() => { const id = setInterval(() => setAgora(new Date()), 60_000); return () => clearInterval(id); }, []);
    const ini = iniciaisDe(sessao.empresa.nomeFantasia || sessao.empresa.razaoSocial || '?');
    return (
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-dashed border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white grid place-items-center font-bold text-base shadow-md">{ini}</div>
                    <div>
                        <div className="font-bold text-slate-800 dark:text-white text-base leading-tight">{sessao.empresa.nomeFantasia || sessao.empresa.razaoSocial}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{formatCnpjBr(sessao.empresa.cnpj)} · SAGE {sessao.empresa.codigoSage}</div>
                    </div>
                </div>
                <button onClick={onTrocar} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-800 hover:text-white dark:hover:bg-slate-600 rounded transition-colors">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    Trocar empresa
                </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3">
                <MetaCell label="Período" mono>{sessao.competencia}</MetaCell>
                <MetaCell label="Tipo">{sessao.tipo}</MetaCell>
                <MetaCell label="Colaborador">
                    {currentUser.name || currentUser.email}
                    {(currentUser as any).role === 'admin' && (
                        <span className="ml-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">· Admin</span>
                    )}
                </MetaCell>
                <MetaCell label="Sessão" mono>
                    {formatDataHora(sessao.iniciadaEm)}
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-mono">agora: {formatDataHora(agora)}</span>
                </MetaCell>
            </div>
        </div>
    );
};

const MetaCell: React.FC<{ label: string; mono?: boolean; children: React.ReactNode }> = ({ label, mono, children }) => (
    <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">{label}</div>
        <div className={`text-sm font-semibold text-slate-800 dark:text-white ${mono ? 'font-mono' : ''}`}>{children}</div>
    </div>
);

const Section: React.FC<{ numero: number; titulo: string; children: React.ReactNode }> = ({ numero, titulo, children }) => (
    <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-800 dark:text-white">
            <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded-full text-xs">{numero}</span>
            {titulo}
        </h3>
        {children}
    </div>
);

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
