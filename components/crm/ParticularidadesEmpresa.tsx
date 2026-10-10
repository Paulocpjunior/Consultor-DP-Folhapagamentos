// components/crm/ParticularidadesEmpresa.tsx
//
// Botão "Particularidades" ao lado da empresa ativa: o que o CRM do DP (Jotform) diz dela —
// responsável, fechamento, adiantamento, dia do pagamento, sindicato, dissídio e as observações.

import React, { useEffect, useRef, useState } from 'react';
import { lerCrmDaEmpresa } from '../../services/crm/crmService';
import type { EmpresaCrm } from '../../services/crm/crmDp';

const Linha: React.FC<{ rotulo: string; valor?: string }> = ({ rotulo, valor }) => valor ? (
    <div className="flex gap-2 py-0.5"><dt className="w-32 shrink-0 text-slate-500 dark:text-slate-400">{rotulo}</dt><dd className="min-w-0 text-slate-800 dark:text-slate-100">{valor}</dd></div>
) : null;

const ParticularidadesEmpresa: React.FC<{ cnpj: string }> = ({ cnpj }) => {
    const [crm, setCrm] = useState<EmpresaCrm | null>(null);
    const [aberto, setAberto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        setCrm(null); setAberto(false);
        let vivo = true;
        lerCrmDaEmpresa(cnpj).then(c => { if (vivo) setCrm(c); }).catch(() => { /* sem CRM ou sem acesso: sem botão */ });
        return () => { vivo = false; };
    }, [cnpj]);
    useEffect(() => {
        if (!aberto) return;
        const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, [aberto]);
    if (!crm) return null;
    return (
        <div ref={ref} className="relative">
            <button onClick={() => setAberto(a => !a)} aria-expanded={aberto} title="Particularidades da empresa (CRM do DP)"
                className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium ring-1 ${crm.particularidades ? 'bg-amber-400/20 text-amber-100 ring-amber-300/40 hover:bg-amber-400/30' : 'bg-white/5 text-slate-200 ring-white/15 hover:bg-white/10'}`}>
                <span aria-hidden>ⓘ</span><span className="hidden sm:inline">Particularidades</span>
            </button>
            {aberto && (
                <div role="dialog" aria-label="Particularidades da empresa" className="absolute right-0 top-full z-50 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl bg-white p-4 text-xs text-slate-800 shadow-2xl ring-1 ring-slate-900/10 dark:bg-slate-800 dark:text-slate-100 dark:ring-white/10">
                    <p className="mb-2 text-sm font-semibold">{crm.nome}</p>
                    <dl>
                        <Linha rotulo="Responsável" valor={crm.colaborador?.nome} />
                        <Linha rotulo="Tributação" valor={crm.tributacao} />
                        <Linha rotulo="Fechamento" valor={crm.fechamento.join(', ')} />
                        <Linha rotulo="Adiantamento" valor={crm.adiantamento} />
                        <Linha rotulo="Pagamento" valor={crm.diaPagamento} />
                        <Linha rotulo="VT e VR" valor={crm.valeTransporte} />
                        <Linha rotulo="Desoneração" valor={crm.desoneracao} />
                        <Linha rotulo="Sindicato" valor={crm.sindicatos.join(', ')} />
                        <Linha rotulo="Dissídio" valor={crm.dissidio} />
                    </dl>
                    {crm.particularidades && <p className="mt-2 whitespace-pre-line rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">{crm.particularidades}</p>}
                    <p className="mt-2 text-[10px] text-slate-400">Fonte: CRM do DP no Jotform. Altere lá.</p>
                </div>
            )}
        </div>
    );
};

export default ParticularidadesEmpresa;
