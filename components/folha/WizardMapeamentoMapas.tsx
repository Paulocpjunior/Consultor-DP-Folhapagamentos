// components/folha/WizardMapeamentoMapas.tsx
// Wizard de parametrização do layout de uma empresa.
// Lê a aba escolhida do xlsx, mostra colunas detectadas, e o usuário mapeia
// cada coluna -> evento SAGE. Ao salvar, grava no formato MapeamentoApontamento
// existente (folha_mapeamentos/{cnpj}) — sem inventar coleção nova.
//
// v2 — modo AJUSTE: quando a empresa já tem mapeamento (`mapaExistente`), o
// wizard vem pré-preenchido com as regras atuais e o salvamento PRESERVA o
// resto do documento (matrículas, empresas, campo_matricula, regra_salario,
// regras_descontos_empresa…). Antes o setDoc gravava um doc novo do zero e
// apagava as matrículas já cadastradas. Também dá pra escolher a aba —
// arquivos com várias abas não ficam presos na primeira.

import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type {
    MapeamentoApontamento,
    RegraColuna,
    TipoEvento,
    ReferenciaValor,
} from '../../services/folha/folhaTypes';
import {
    saveMapeamento,
    getCatalogo,
} from '../../services/folha/folhaFirestoreService';
import {
    norm,
    findHeader,
    normalizarHeader,
    chaveComparacaoHeader,
} from '../../services/folha/apontamentoParser';

interface Props {
    empresa: Empresa;
    fileBuffer: ArrayBuffer;
    fileName: string;
    /** Mapeamento já gravado no Firestore — ativa o modo AJUSTE. */
    mapaExistente?: MapeamentoApontamento | null;
    /** Aba que o usuário está vendo no painel; vira a aba inicial do wizard. */
    abaPreferida?: string | null;
    onCancel: () => void;
    onSaved: (mapa: MapeamentoApontamento) => void;
}

interface ColRow {
    headerLabel: string;
    sample: string;
    eventCode: string;
    descricao: string;
    tipo: TipoEvento;
    rv: ReferenciaValor;
    ignorarSeZero: boolean;
}

const NAME_HEADERS = new Set([
    'nome', 'nome completo', 'funcionario', 'funcionarios',
    'colaborador', 'colaboradores', 'empregado', 'empregados',
]);

export default function WizardMapeamentoMapas({
    empresa, fileBuffer, fileName, mapaExistente, abaPreferida, onCancel, onSaved,
}: Props) {
    const modoAjuste = !!mapaExistente;

    const workbook = useMemo(() => XLSX.read(fileBuffer, { type: 'array' }), [fileBuffer]);
    const sheetNames = workbook.SheetNames;

    // Aba inicial = a que o painel está exibindo (quando existe no arquivo).
    const [sheetName, setSheetName] = useState<string>(() =>
        abaPreferida && sheetNames.includes(abaPreferida) ? abaPreferida : sheetNames[0],
    );

    const { headers, sampleRow, nameColIdx } = useMemo(() => {
        const first = workbook.Sheets[sheetName];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(first, {
            header: 1,
            defval: null,
            blankrows: false,
        });

        // Detecta linha do cabeçalho (mesma heurística do apontamentoParser):
        // varre as primeiras 15 linhas/30 colunas procurando "Nome",
        // "Funcionário", "Colaborador", etc. Layouts onde A1 é título
        // (ex.: Waldesa "WALDESA MOTOMERCANTIL CNPJ...") são tratados
        // corretamente — header em L2, não L0.
        const found = findHeader(rows);
        const headerRow = found?.headerRow ?? 0;
        const nameIdx = found?.nameCol ?? 0;

        // normalizarHeader (NBSP/ZWSP → espaço, colapsa whitespace) — mesma
        // normalização do apontamentoParser, pra gravar no mapeamento a MESMA
        // grafia que o parser vai produzir ao ler a planilha.
        const rawHdrs = (rows[headerRow] ?? []).map((h) => normalizarHeader(h));

        // Trim ao último cabeçalho não-vazio: evita expor centenas/milhares
        // de colunas vazias quando o XLSX tem range inflado por formatação.
        let lastNonEmpty = -1;
        for (let i = 0; i < rawHdrs.length; i++) {
            if (rawHdrs[i]) lastNonEmpty = i;
        }
        const hdrs = rawHdrs.slice(0, lastNonEmpty + 1);

        // Linha de dados de exemplo = primeira linha após o cabeçalho
        const sample = rows[headerRow + 1] ?? [];

        return {
            headers: hdrs,
            sampleRow: sample,
            nameColIdx: nameIdx,
        };
    }, [workbook, sheetName]);

    // Linhas do wizard, pré-preenchidas com o mapeamento atual do cliente
    // (modo AJUSTE). Sem isso, reabrir o wizard obrigaria a remapear tudo.
    const linhasIniciais = useMemo<ColRow[]>(() => {
        const regrasPorChave = new Map<string, RegraColuna>();
        for (const [col, regra] of Object.entries(mapaExistente?.mapeamento_colunas ?? {})) {
            regrasPorChave.set(chaveComparacaoHeader(col), regra);
        }
        return headers
            .map((h, i) => ({ h, i }))
            .filter(({ h, i }) => i !== nameColIdx && h.trim() !== '')
            .map(({ h, i }) => {
                const regra = regrasPorChave.get(chaveComparacaoHeader(h));
                return {
                    headerLabel: h,
                    sample: sampleRow[i] === null || sampleRow[i] === undefined
                        ? '—'
                        : String(sampleRow[i]),
                    eventCode: regra?.evento ?? '',
                    descricao: regra?.descricao_evento ?? '',
                    tipo: regra?.tipo ?? 'V',
                    rv: regra?.rv ?? 'V',
                    ignorarSeZero: regra?.ignorar_se_zero ?? true,
                } as ColRow;
            });
    }, [headers, sampleRow, nameColIdx, mapaExistente]);

    const [rows, setRows] = useState<ColRow[]>(linhasIniciais);
    useEffect(() => { setRows(linhasIniciais); }, [linhasIniciais]);

    const [catalogoEventos, setCatalogoEventos] = useState<string[]>([]);
    useEffect(() => {
        (async () => {
            try {
                const c = await getCatalogo();
                if (c && (c as any).eventos) {
                    const eventos = (c as any).eventos;
                    if (Array.isArray(eventos)) {
                        setCatalogoEventos(eventos.map((e: any) => e.codigo).filter(Boolean));
                    }
                }
            } catch (e) {
                // catálogo opcional
            }
        })();
    }, []);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const update = (idx: number, patch: Partial<ColRow>) => {
        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    };

    const mappedCount = rows.filter((r) => r.eventCode.trim()).length;

    const handleSave = async () => {
        setError(null);
        // No modo ajuste o cliente já tem regras gravadas (inclusive de colunas
        // que não estão nesta aba), então zero colunas aqui é um estado válido.
        if (mappedCount === 0 && !modoAjuste) {
            setError('Mapeie pelo menos uma coluna pra um evento SAGE.');
            return;
        }
        setSaving(true);
        try {
            // Parte das regras já gravadas: colunas de OUTROS layouts/abas que
            // não aparecem nesta tela continuam valendo. As colunas listadas
            // aqui são sobrescritas (ou removidas, se o código foi apagado).
            const mapeamento_colunas: Record<string, RegraColuna> = {
                ...(mapaExistente?.mapeamento_colunas ?? {}),
            };
            for (const r of rows) {
                const chave = chaveComparacaoHeader(r.headerLabel);
                const chaveAntiga = Object.keys(mapeamento_colunas).find(
                    (k) => chaveComparacaoHeader(k) === chave,
                );
                const code = r.eventCode.trim();
                // Grafia antiga da mesma coluna sai — fica só a da planilha atual.
                if (chaveAntiga) delete mapeamento_colunas[chaveAntiga];
                if (!code) continue;
                mapeamento_colunas[r.headerLabel] = {
                    evento: code,
                    descricao_evento: r.descricao.trim() || r.headerLabel,
                    tipo: r.tipo,
                    rv: r.rv,
                    ignorar_se_zero: r.ignorarSeZero,
                };
            }

            const carimbo = modoAjuste
                ? `Mapeamento ajustado via Wizard em ${new Date().toISOString()} (aba "${sheetName}")`
                : `Mapeamento criado via Wizard em ${new Date().toISOString()}`;

            const mapa: MapeamentoApontamento = mapaExistente
                // Modo AJUSTE: preserva TUDO que já existe no documento
                // (matrículas, empresas, campo_matricula, regra_salario,
                // regras_descontos_empresa…) e troca só as regras de coluna.
                ? {
                    ...mapaExistente,
                    cliente: empresa.cnpj,
                    empresa_base: mapaExistente.empresa_base || empresa.codigoSage,
                    mapeamento_colunas,
                    observacoes: [...(mapaExistente.observacoes ?? []), carimbo].slice(-10),
                }
                : {
                    $schema: 'apontamento-folha/mapeamento/v1',
                    cliente: empresa.cnpj,
                    empresa_base: empresa.codigoSage,
                    competencia_default: '',
                    observacoes: [
                        carimbo,
                        `Empresa: ${empresa.razaoSocial} (${empresa.cnpj})`,
                        `Aba detectada: ${sheetName}`,
                    ],
                    empresas: {
                        [sheetName]: {
                            codigo_sage: empresa.codigoSage,
                            ativa: true,
                        },
                    },
                    mapeamento_colunas,
                    regras_descontos_empresa: {
                        coluna: '',
                        campo_obs: 'OBS',
                        evento_padrao: {
                            evento: '',
                            descricao_evento: '',
                            tipo: 'D',
                            rv: 'V',
                        },
                        regras: [],
                    },
                    matriculas: {},
                };

            await saveMapeamento(mapa);
            onSaved(mapa);
        } catch (e: any) {
            setError(e?.message ?? 'Erro ao salvar.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-auto p-6">
                <header className="border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                        {modoAjuste ? 'Ajustar mapeamento' : 'Mapear layout'} · {empresa.razaoSocial}
                    </h2>
                    <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span>Arquivo: <code className="font-mono">{fileName}</code></span>
                            <span>· aba</span>
                            {sheetNames.length > 1 ? (
                                <select
                                    value={sheetName}
                                    onChange={(e) => setSheetName(e.target.value)}
                                    className="px-2 py-0.5 text-sm font-mono border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                                >
                                    {sheetNames.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            ) : (
                                <code className="font-mono">{sheetName}</code>
                            )}
                            <span>· {headers.length} colunas detectadas · SAGE {empresa.codigoSage}</span>
                        </div>
                        <div>
                            Esse mapeamento é salvo no Firestore (folha_mapeamentos/{empresa.cnpj}).
                            Próximos meses não precisam refazer.
                        </div>
                    </div>
                    {modoAjuste && (
                        <div className="mt-3 px-3 py-2 text-xs bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded">
                            As colunas já mapeadas vêm preenchidas. Preencha o evento das que estão em branco
                            (é o que faz a coluna virar lançamento no TXT) ou apague o código para desativar
                            uma coluna. <strong>Matrículas cadastradas e demais configurações são preservadas.</strong>
                        </div>
                    )}
                </header>

                <div className="mb-3 text-xs text-slate-600 dark:text-slate-400">
                    <b>Tipo:</b> V = vencimento (paga), D = desconto.{' '}
                    <b>RV:</b> V = valor R$, R = referência (horas/quantidade).
                </div>

                <div className="border border-slate-200 dark:border-slate-700 rounded overflow-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0">
                            <tr>
                                <th className="px-2 py-2 text-left">Coluna</th>
                                <th className="px-2 py-2 text-left">Exemplo</th>
                                <th className="px-2 py-2 text-left">Evento SAGE</th>
                                <th className="px-2 py-2 text-left">Descrição</th>
                                <th className="px-2 py-2 text-center">Tipo</th>
                                <th className="px-2 py-2 text-center">RV</th>
                                <th className="px-2 py-2 text-center" title="Ignorar quando valor = 0">Skip 0</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={i} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="px-2 py-1.5 font-medium text-slate-800 dark:text-slate-200">
                                        {r.headerLabel || <i className="text-slate-400">(vazio)</i>}
                                    </td>
                                    <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400 font-mono text-xs">
                                        {r.sample}
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input
                                            type="text"
                                            maxLength={6}
                                            placeholder="0000"
                                            value={r.eventCode}
                                            onChange={(e) => update(i, { eventCode: e.target.value })}
                                            list={catalogoEventos.length > 0 ? `eventos-list-${i}` : undefined}
                                            className="w-20 px-2 py-1 text-sm font-mono border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                                        />
                                        {catalogoEventos.length > 0 && (
                                            <datalist id={`eventos-list-${i}`}>
                                                {catalogoEventos.map((c) => (
                                                    <option key={c} value={c} />
                                                ))}
                                            </datalist>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5">
                                        <input
                                            type="text"
                                            placeholder={r.headerLabel}
                                            value={r.descricao}
                                            onChange={(e) => update(i, { descricao: e.target.value })}
                                            className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                                        />
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        {r.eventCode.trim() && (
                                            <select
                                                value={r.tipo}
                                                onChange={(e) => update(i, { tipo: e.target.value as TipoEvento })}
                                                className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                                            >
                                                <option value="V">V</option>
                                                <option value="D">D</option>
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        {r.eventCode.trim() && (
                                            <select
                                                value={r.rv}
                                                onChange={(e) => update(i, { rv: e.target.value as ReferenciaValor })}
                                                className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                                            >
                                                <option value="V">V</option>
                                                <option value="R">R</option>
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                        {r.eventCode.trim() && (
                                            <input
                                                type="checkbox"
                                                checked={r.ignorarSeZero}
                                                onChange={(e) => update(i, { ignorarSeZero: e.target.checked })}
                                                className="w-4 h-4"
                                            />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {error && (
                    <div className="mt-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm rounded">
                        {error}
                    </div>
                )}

                <footer className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                        {mappedCount} de {rows.length} colunas mapeadas
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={onCancel}
                            disabled={saving}
                            className="px-4 py-1.5 text-sm border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || (mappedCount === 0 && !modoAjuste)}
                            className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
                        >
                            {saving ? 'Salvando…' : 'Salvar e processar'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
