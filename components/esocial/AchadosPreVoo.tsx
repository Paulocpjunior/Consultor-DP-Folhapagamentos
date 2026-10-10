// components/esocial/AchadosPreVoo.tsx
//
// Resultado do pré-voo do eSocial (XSD oficial + regras de ordem): o que barrou o envio e os avisos.

import React from 'react';
import type { Achado } from '../../services/esocial/preVoo';

const AchadosPreVoo: React.FC<{ achados: Achado[] }> = ({ achados }) => {
    if (!achados.length) return null;
    const bloq = achados.filter(a => a.nivel === 'bloqueio');
    const av = achados.filter(a => a.nivel === 'aviso');
    return (
        <div aria-label="Pré-voo do eSocial" className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
            {bloq.length > 0 && (
                <div>
                    <p className="font-semibold text-red-800 dark:text-red-200">⛔ Pré-voo: {bloq.length} ponto(s) impedem o envio</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-red-800 dark:text-red-200">{bloq.map((a, i) => <li key={i}>{a.mensagem}</li>)}</ul>
                </div>
            )}
            {av.length > 0 && (
                <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-200">⚠️ Avisos ({av.length})</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-800 dark:text-amber-200">{av.map((a, i) => <li key={i}>{a.mensagem}</li>)}</ul>
                </div>
            )}
        </div>
    );
};

export default AchadosPreVoo;
