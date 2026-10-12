// components/processosJud/SeletorProcesso.tsx
//
// Escolha de um processo do S-1070 da empresa (Cadastros › Processos judiciais e administrativos) e do código da
// suspensão dele, para o S-1010 (incidência suspensa) e as obras (RAT, FAP e terceiros).

import React, { useEffect, useState } from 'react';
import { listarProcessos } from '../../services/processosJud/processosJudService';
import { rotuloProcesso, type ProcessoJudAdm } from '../../services/processosJud/processosJud';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';

/** Processos da empresa (lidos uma vez por empresa). */
export function useProcessos(empresaId: string): ProcessoJudAdm[] {
    const [ps, setPs] = useState<ProcessoJudAdm[]>([]);
    useEffect(() => {
        let vivo = true;
        if (empresaId) listarProcessos(empresaId).then(l => { if (vivo) setPs(l.filter(p => p.ativo && p.indMatProc === '1')); }).catch(() => undefined);
        return () => { vivo = false; };
    }, [empresaId]);
    return ps;
}

export interface Escolha { tpProc: '1' | '2'; nrProc: string; codSusp: string }

const SeletorProcesso: React.FC<{ rotulo: string; processos: ProcessoJudAdm[]; valor: Escolha | null | undefined; onChange: (e: Escolha | null) => void; soJudicial?: boolean; semSuspensao?: boolean }> = ({ rotulo, processos, valor, onChange, soJudicial, semSuspensao }) => {
    const lista = processos.filter(p => (soJudicial ? p.tpProc === '2' : p.tpProc === '1' || p.tpProc === '2'));
    const p = lista.find(x => x.nrProc === valor?.nrProc);
    return (
        <span className="inline-flex flex-wrap items-end gap-1">
            <label className="text-xs">{rotulo}<select aria-label={rotulo} className={`block ${inp}`} value={valor?.nrProc ?? ''} onChange={e => {
                const q = lista.find(x => x.nrProc === e.target.value);
                onChange(q ? { tpProc: q.tpProc as '1' | '2', nrProc: q.nrProc, codSusp: q.suspensoes[0]?.codSusp ?? '' } : null);
            }}>
                <option value="">{lista.length ? '— processo do S-1070 —' : 'cadastre em Processos (S-1070)'}</option>
                {lista.map(x => <option key={x.id} value={x.nrProc}>{rotuloProcesso(x)}</option>)}
            </select></label>
            {p && !semSuspensao && <label className="text-xs">Suspensão<select aria-label={`Suspensão de ${rotulo}`} className={`block ${inp}`} value={valor?.codSusp ?? ''} onChange={e => onChange({ ...valor!, codSusp: e.target.value })}>
                {p.suspensoes.map(s => <option key={s.codSusp} value={s.codSusp}>{s.codSusp} · {s.indSusp}</option>)}</select></label>}
        </span>
    );
};

export default SeletorProcesso;
