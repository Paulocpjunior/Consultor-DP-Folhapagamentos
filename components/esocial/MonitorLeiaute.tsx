// components/esocial/MonitorLeiaute.tsx
//
// Saúde do eSocial, etapa 5: leiaute em uso, versões citadas na documentação técnica, novidades com o resumo
// de IA (para conferir) e a situação do monitor agendado.

import React, { useEffect, useState } from 'react';
import { lerMonitorLeiaute, situacaoDoMonitor, type MonitorLeiaute as Monitor } from '../../services/esocial/monitorLeiaute';
import { ROTULO_VERSAO_XSD } from '../../services/esocial/validadorXsd';

const COR = { critico: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100', atencao: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100', ok: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100' } as const;

const MonitorLeiaute: React.FC = () => {
    const [m, setM] = useState<Monitor | null | undefined>(undefined);
    const [erro, setErro] = useState('');
    useEffect(() => { lerMonitorLeiaute().then(setM).catch(e => { setErro((e as Error).message); setM(null); }); }, []);
    if (m === undefined) return <p className="text-sm text-slate-500">Lendo o monitor do leiaute…</p>;
    const situacao = situacaoDoMonitor(m, Date.now());
    return (
        <section aria-label="Leiaute e notas técnicas" className="space-y-2">
            <h3 className="font-semibold text-slate-800 dark:text-white">Leiaute e notas técnicas</h3>
            <p className="text-xs text-slate-500">Em uso no pré-voo: {ROTULO_VERSAO_XSD}.{m?.verificadoEm ? ` Documentação técnica conferida em ${new Date(m.verificadoEm).toLocaleString('pt-BR')}.` : ''}{m?.versoes.length ? ` Versões citadas: ${m.versoes.join(', ')}.` : ''}</p>
            {erro && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{erro}</p>}
            {situacao.map(s => <div key={s.titulo} className={`rounded-lg border p-3 text-sm ${COR[s.gravidade]}`}><p className="font-medium">{s.titulo}</p><p className="opacity-90">{s.detalhe}</p></div>)}
            {!!m?.novidades.length && (
                <ul className="space-y-2">
                    {m.novidades.slice(0, 8).map(n => (
                        <li key={n.url} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                            <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 underline dark:text-blue-300">{n.titulo}</a>
                            <span className="ml-2 text-xs text-slate-500">detectado em {new Date(n.detectadoEm).toLocaleDateString('pt-BR')}</span>
                            {n.resumo && <div className="mt-1 rounded bg-violet-50 p-2 text-slate-800 dark:bg-violet-950/30 dark:text-slate-100"><p className="text-xs font-medium text-violet-800 dark:text-violet-300">Resumo de IA ({n.resumoModelo}) — confira no documento</p><p className="whitespace-pre-line">{n.resumo}</p></div>}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default MonitorLeiaute;
