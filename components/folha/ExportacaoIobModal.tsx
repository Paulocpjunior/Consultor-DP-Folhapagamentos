import React, { useEffect, useRef } from 'react';
export type ModoExportacao = 'cadastro' | 'apontamentos';
interface Props {
    modo: ModoExportacao; onFechar: () => void; onModo?: (modo: ModoExportacao) => void;
    quantidade: number | null; ocupado?: boolean; onExportar: () => void; onConferencia?: () => void; onModeloExcel?: () => void;
}
/** Mesmo diálogo para implantação e rotina mensal; cada modo possui seu próprio contrato de saída. */
export default function ExportacaoIobModal({ modo, onFechar, onModo, quantidade, ocupado, onExportar, onConferencia, onModeloExcel }: Props) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => {
        const anterior = document.activeElement as HTMLElement | null;
        const d = ref.current!;
        if (d.showModal) d.showModal(); else d.setAttribute('open', '');
        return () => { if (d.close) d.close(); anterior?.focus(); };
    }, []);
    const cadastro = modo === 'cadastro';
    return <dialog ref={ref} onCancel={e => { e.preventDefault(); if (!ocupado) onFechar(); }} aria-labelledby="titulo-exportacao-iob" className="w-[min(95vw,640px)] rounded-xl bg-white p-6 text-slate-800 shadow-xl backdrop:bg-black/50 dark:bg-slate-800 dark:text-white">
        <h3 id="titulo-exportacao-iob" className="text-xl font-bold">Exportar para IOB SAGE</h3>
        <label className="mt-4 block text-sm">Modo de exportação<select value={modo} disabled={ocupado || !onModo} onChange={e => onModo?.(e.target.value as ModoExportacao)} className="mt-1 w-full rounded border bg-white p-2 text-slate-900">
            <option value="cadastro">Primeiro acesso — implantação cadastral</option><option value="apontamentos">Rotina mensal — apontamentos</option>
        </select></label>
        <p className="my-4 text-sm">{cadastro ? `${quantidade} vínculo(s). Dados cadastrais unificados, incluindo salário contratual; sem lançamentos, referências ou valores de apontamento.` : `${quantidade == null ? 'Arquivo processado' : `${quantidade} lançamento(s) preparado(s)`}. A exportação mantém as validações de empresa, competência, matrícula e eventos.`}</p>
        {cadastro && <p className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-900"><strong>Compatibilidade cadastral IOB pendente.</strong> O Excel preenchido, o pacote JSON e o CSV são para conferência. O TXT mensal contém apenas matrícula, evento, referência e valor; não transporta nome, CPF ou endereço. Não devem ser importados na rotina de apontamentos. As pendências de histórico acompanham os dados.</p>}
        <div className="flex flex-wrap gap-3">
            {cadastro && onModeloExcel && <button disabled={ocupado || quantidade === 0} onClick={onModeloExcel} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-40">Baixar Excel preenchido (conferência)</button>}
            <button disabled={ocupado || quantidade === 0} onClick={onExportar} className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-40">{cadastro ? 'Baixar pacote cadastral (JSON)' : 'Confirmar exportação dos TXTs'}</button>
            {cadastro && onConferencia && <button disabled={ocupado || quantidade === 0} onClick={onConferencia} className="rounded border px-3 py-2 text-sm disabled:opacity-40">Baixar conferência CSV</button>}
            <button disabled={ocupado} onClick={onFechar} className="rounded border px-3 py-2 text-sm">Fechar</button>
        </div>
    </dialog>;
}
