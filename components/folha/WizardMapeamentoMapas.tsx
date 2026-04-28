// components/folha/WizardMapeamentoMapas.tsx
// Wizard de primeira parametrização de uma empresa.
// Lê a primeira aba do xlsx, mostra colunas detectadas, e o usuário mapeia
// cada coluna -> evento SAGE. Ao salvar, grava no formato MapeamentoApontamento
// existente (folha_mapeamentos/{cnpj}) — sem inventar coleção nova.

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
import { norm } from '../../services/folha/apontamentoParser';

interface Props {
    empresa: Empresa;
    fileBuffer: ArrayBuffer;
    fileName: string;
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
    empresa, fileBuffer, fileName, onCancel, onSaved,
}: Props) {
    const { sheetName, headers, sampleRow, nameColIdx } = useMemo(() => {
        const wb = XLSX.read(fileBuffer, { type: 'array' });
        const first = wb.Sheets[wb.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(first, {
            header: 1,
            defval: null,
        });
        const hdrs = (rows[0] ?? []).map((h) => String(h ?? '').trim());
        // Acha a primeira coluna que parece ser o nome
        let nameIdx = 0;
        for (let i = 0; i < hdrs.length; i++) {
            if (NAME_HEADERS.has(norm(hdrs[i]))) {
                nameIdx = i;
                break;
            }
        }
        return {
            sheetName: wb.SheetNames[0],
            headers: hdrs,
            sampleRow: rows[1] ?? [],
            nameColIdx: nameIdx,
        };
    }, [fileBuffer]);

    const [rows, setRows] = useState<ColRow[]>(() =>
        headers
            .map((h, i) => ({ h, i }))
            .filter(({ i }) => i !== nameColIdx)
            .map(({ h, i }) => ({
                headerLabel: h,
                sample: sampleRow[i] === null || sampleRow[i] === undefined
                    ? '—'
                    : String(sampleRow[i]),
                eventCode: '',
                descricao: '',
                tipo: 'V',
                rv: 'V',
                ignorarSeZero: true,
            }))
    );

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
        if (mappedCount === 0) {
            setError('Mapeie pelo menos uma coluna pra um evento SAGE.');
            return;
        }
        setSaving(true);
        try {
            const mapeamento_colunas: Record<string, RegraColuna> = {};
            for (const r of rows) {
                const code = r.eventCode.trim();
                if (!code) continue;
                mapeamento_colunas[r.headerLabel] = {
                    evento: code,
                    descricao_evento: r.descricao.trim() || r.headerLabel,
                    tipo: r.tipo,
                    rv: r.rv,
                    ignorar_se_zero: r.ignorarSeZero,
                };
            }

            const mapa: MapeamentoApontamento = {
                $schema: 'apontamento-folha/mapeamento/v1',
                cliente: empresa.cnpj,
                empresa_base: empresa.codigoSage,
                competencia_default: '',
                observacoes: [
                    `Mapeamento criado via Wizard em ${new Date().toISOString()}`,
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
                        Mapear layout · {empresa.razaoSocial}
                    </h2>
                    <div className="text-sm text-slate-600 dark:text-slate-400 mt-1 space-y-0.5">
                        <div>
                            Arquivo: <code className="font-mono">{fileName}</code> · aba <code className="font-mono">{sheetName}</code> ·{' '}
                            {headers.length} colunas detectadas · SAGE {empresa.codigoSage}
                        </div>
                        <div>
                            Esse mapeamento é salvo no Firestore (folha_mapeamentos/{empresa.cnpj}).
                            Próximos meses não precisam refazer.
                        </div>
                    </div>
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
                            disabled={saving || mappedCount === 0}
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
