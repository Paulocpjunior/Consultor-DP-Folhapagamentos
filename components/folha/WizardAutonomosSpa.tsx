// components/folha/WizardAutonomosSpa.tsx
// Wizard que recebe os autônomos extraídos do XLS da SPA e permite mapear
// nome → matrícula, persistindo em folha_mapeamentos/{CNPJ}.matriculas_autonomos.
//
// Fluxo: usuário clica em "Importar Autônomos SPA" → upload do .xls →
//        wizard mostra 103 autônomos com matrícula pré-preenchida (se já houver
//        no Firestore) ou em branco → usuário completa matrículas pendentes →
//        clica em "Salvar e gerar lançamentos" → componente pai recebe Lancamento[].
//
// Salvar persiste o map em Firestore. Próximos meses já trazem tudo preenchido —
// só aparece campo amarelo para autônomo novo (caso entre alguém).

import { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { Lancamento } from '../../services/folha/folhaTypes';
import type { ResultadoAutonomosSpa } from '../../services/folha/autonomosSpaParser';
import { paraLancamentos } from '../../services/folha/autonomosSpaParser';
import { getMapeamento, saveMapeamento } from '../../services/folha/folhaFirestoreService';

interface Props {
    empresa: Empresa;
    resultado: ResultadoAutonomosSpa;
    aba: string;
    linhaCabecalho: number;
    onCancel: () => void;
    onSaved: (lancamentos: Lancamento[]) => void;
}

interface LinhaUI {
    nome: string;
    vlrFat: number;
    codigoEvento: '4991' | '4998';
    aliquotaSage: number;
    inssSpa: number;
    inssOutraFte: number;
    alerta?: string;
    matricula: string;            // editado pelo usuário
    matriculaOriginal: string;    // pra detectar mudança e salvar incrementalmente
}

export default function WizardAutonomosSpa({
    empresa, resultado, aba, linhaCabecalho, onCancel, onSaved,
}: Props) {
    const [linhas, setLinhas] = useState<LinhaUI[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    // Carrega mapeamento existente (matriculas_autonomos) do Firestore
    useEffect(() => {
        (async () => {
            try {
                const mapa = await getMapeamento(empresa.cnpj);
                const matriculasMap: Record<string, string> =
                    (mapa as any)?.matriculas_autonomos ?? {};
                const ui: LinhaUI[] = resultado.autonomos.map((a) => ({
                    nome: a.nome,
                    vlrFat: a.vlrFat,
                    codigoEvento: a.codigoEvento,
                    aliquotaSage: a.aliquotaSage,
                    inssSpa: a.inssSpa,
                    inssOutraFte: a.inssOutraFte,
                    alerta: a.alerta,
                    matricula: matriculasMap[a.nome] ?? '',
                    matriculaOriginal: matriculasMap[a.nome] ?? '',
                }));
                setLinhas(ui);
            } catch (e: any) {
                setErro(e?.message ?? 'Erro ao carregar mapeamento.');
            } finally {
                setCarregando(false);
            }
        })();
    }, [empresa.cnpj, resultado.autonomos]);

    const stats = useMemo(() => {
        const total = linhas.length;
        const preenchidas = linhas.filter((l) => l.matricula.trim()).length;
        const pendentes = total - preenchidas;
        const comAlerta = linhas.filter((l) => l.alerta).length;
        return { total, preenchidas, pendentes, comAlerta };
    }, [linhas]);

    const update = (idx: number, mat: string) => {
        setLinhas((prev) => prev.map((l, i) => (i === idx ? { ...l, matricula: mat } : l)));
    };

    const handleSalvar = async () => {
        setErro(null);
        setSalvando(true);
        try {
            // Monta o mapa nome → matrícula apenas com não-vazios
            const novoMap: Record<string, string> = {};
            for (const l of linhas) {
                const mat = l.matricula.trim();
                if (mat) novoMap[l.nome] = mat;
            }

            // Lê o mapa existente, mescla, grava
            const mapaAtual: any = (await getMapeamento(empresa.cnpj)) ?? {
                $schema: 'apontamento-folha/mapeamento/v1',
                cliente: empresa.cnpj,
                empresa_base: empresa.codigoSage,
                competencia_default: '',
                observacoes: [],
                empresas: {
                    [empresa.razaoSocial]: {
                        codigo_sage: empresa.codigoSage,
                        ativa: true,
                    },
                },
                mapeamento_colunas: {},
                regras_descontos_empresa: null,
                matriculas: {},
            };
            const mapaAtualizado = {
                ...mapaAtual,
                matriculas_autonomos: {
                    ...(mapaAtual.matriculas_autonomos ?? {}),
                    ...novoMap,
                },
                observacoes: [
                    ...(mapaAtual.observacoes ?? []),
                    `[${new Date().toISOString()}] WizardAutonomosSpa: ` +
                    `${Object.keys(novoMap).length} matrícula(s) de autônomo persistidas.`,
                ],
            };
            await saveMapeamento(mapaAtualizado);

            // Gera lançamentos só pros autônomos com matrícula preenchida
            const { lancamentos, semMatricula } = paraLancamentos(
                resultado,
                {
                    aba,
                    linhaCabecalho,
                    empresaNome: empresa.razaoSocial,
                    codigoSage: empresa.codigoSage,
                },
                novoMap,
            );

            if (semMatricula.length > 0) {
                setErro(
                    `${semMatricula.length} autônomo(s) sem matrícula: ` +
                    semMatricula.slice(0, 3).join(', ') +
                    (semMatricula.length > 3 ? `, +${semMatricula.length - 3} outros` : '') +
                    `. Preencha pra exportar.`,
                );
                setSalvando(false);
                return;
            }

            onSaved(lancamentos);
        } catch (e: any) {
            setErro(e?.message ?? 'Erro ao salvar.');
            setSalvando(false);
        }
    };

    if (carregando) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl p-8">
                    <div className="text-slate-700 dark:text-slate-200">Carregando matrículas existentes…</div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-auto p-6">
                <header className="border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                        Autônomos · {empresa.razaoSocial}
                    </h2>
                    <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 space-y-0.5">
                        <div>
                            Aba <code className="font-mono">{aba}</code> · cabeçalho L{linhaCabecalho} ·
                            {resultado.competencia ? ` competência ${resultado.competencia} ·` : ''} SAGE {empresa.codigoSage}
                        </div>
                        <div>
                            Mapeamento <code>nome → matrícula</code> é salvo no Firestore (matriculas_autonomos).
                            Próximos meses não precisam refazer.
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-4 gap-2 mb-3 text-sm">
                    <div className="px-3 py-2 bg-slate-100 dark:bg-slate-900 rounded">
                        <div className="text-xs text-slate-500">Total</div>
                        <div className="font-bold text-slate-800 dark:text-white">{stats.total}</div>
                    </div>
                    <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded">
                        <div className="text-xs text-green-700 dark:text-green-300">Com matrícula</div>
                        <div className="font-bold text-green-800 dark:text-green-200">{stats.preenchidas}</div>
                    </div>
                    <div className={`px-3 py-2 rounded ${stats.pendentes > 0 ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-slate-100 dark:bg-slate-900'}`}>
                        <div className="text-xs text-yellow-700 dark:text-yellow-300">Pendentes</div>
                        <div className={`font-bold ${stats.pendentes > 0 ? 'text-yellow-800 dark:text-yellow-200' : 'text-slate-800 dark:text-white'}`}>{stats.pendentes}</div>
                    </div>
                    <div className={`px-3 py-2 rounded ${stats.comAlerta > 0 ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-slate-100 dark:bg-slate-900'}`}>
                        <div className="text-xs text-orange-700 dark:text-orange-300">Com alerta</div>
                        <div className={`font-bold ${stats.comAlerta > 0 ? 'text-orange-800 dark:text-orange-200' : 'text-slate-800 dark:text-white'}`}>{stats.comAlerta}</div>
                    </div>
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0">
                            <tr>
                                <th className="px-2 py-2 text-left">Nome</th>
                                <th className="px-2 py-2 text-right">Vlr.Fat</th>
                                <th className="px-2 py-2 text-center">Evento</th>
                                <th className="px-2 py-2 text-center">Alíq.</th>
                                <th className="px-2 py-2 text-left">Matrícula SAGE</th>
                                <th className="px-2 py-2 text-left">Alerta</th>
                            </tr>
                        </thead>
                        <tbody>
                            {linhas.map((l, i) => {
                                const pendente = !l.matricula.trim();
                                return (
                                    <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className="px-2 py-1.5 text-slate-800 dark:text-slate-200">{l.nome}</td>
                                        <td className="px-2 py-1.5 text-right font-mono">{l.vlrFat.toFixed(2)}</td>
                                        <td className="px-2 py-1.5 text-center">
                                            <span className={`px-2 py-0.5 rounded text-xs font-mono ${l.codigoEvento === '4991' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'}`}>
                                                {l.codigoEvento}
                                            </span>
                                        </td>
                                        <td className="px-2 py-1.5 text-center text-xs text-slate-500 dark:text-slate-400">
                                            {l.aliquotaSage}%
                                        </td>
                                        <td className="px-2 py-1.5">
                                            <input
                                                type="text"
                                                maxLength={6}
                                                placeholder="000000"
                                                value={l.matricula}
                                                onChange={(e) => update(i, e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                className={`w-24 px-2 py-1 text-sm font-mono border rounded ${pendente ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 dark:border-yellow-600' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'} text-slate-800 dark:text-white`}
                                            />
                                        </td>
                                        <td className="px-2 py-1.5 text-xs text-orange-700 dark:text-orange-300">
                                            {l.alerta ?? ''}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {erro && (
                    <div className="mt-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded">
                        {erro}
                    </div>
                )}

                <footer className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                        {stats.preenchidas} de {stats.total} matrícula(s) preenchida(s)
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            disabled={salvando}
                            className="px-4 py-1.5 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSalvar}
                            disabled={salvando || stats.pendentes > 0}
                            className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
                            title={stats.pendentes > 0 ? `Preencha as ${stats.pendentes} matrícula(s) pendente(s) primeiro.` : ''}
                        >
                            {salvando ? 'Salvando…' : 'Salvar e gerar lançamentos'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
