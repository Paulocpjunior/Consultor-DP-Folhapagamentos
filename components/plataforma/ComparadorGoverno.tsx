// components/plataforma/ComparadorGoverno.tsx
//
// Configurações › Serviços externos › Comparar CFI × plataforma (governo). Só admin/gestor (o painel decide). Para a
// empresa ativa e a competência escolhida, chama as mesmas rotas de leitura nos dois hosts com o mesmo token e mostra
// HTTP, ok e as diferenças de negócio lado a lado (services/plataforma/comparadorGoverno.ts). Nada é gravado; o
// endereço colado vale só para esta comparação.

import React, { useEffect, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { CONSULTAS_COBRADAS, ROTAS_COMPARADAS, compararGoverno, hostDaPlataforma, type Comparacao, type RespostaHost } from '../../services/plataforma/comparadorGoverno';
import { HOST_CFI_INTEGRACAO } from '../../services/plataforma/servicos';
import { normalizarCnpj } from '../../services/cadastros/documentos';

const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
const valor = (v: unknown) => (v === undefined ? '(ausente)' : JSON.stringify(v));

const Lado: React.FC<{ r: RespostaHost }> = ({ r }) => (
    <span className={`text-xs ${r.http >= 200 && r.http < 300 ? 'text-slate-700 dark:text-slate-200' : 'text-red-700 dark:text-red-300'}`}>
        HTTP {r.http || '—'} · ok {r.ok === null ? '—' : String(r.ok)}{r.erro ? ` · ${r.erro}` : ''}
    </span>
);

/** `onColado`: avisa o endereço colado válido (o painel pré-preenche o teste no navegador com ele). */
const ComparadorGoverno: React.FC<{ env?: Record<string, string | undefined>; onColado?: (url: string) => void }> = ({ env, onColado }) => {
    const { ativa } = useEmpresaAtiva();
    const [colado, setColado] = useState('');
    const [competencia, setCompetencia] = useState(ativa?.competencia ?? '');
    const [ciente, setCiente] = useState(false);
    const [rodando, setRodando] = useState(false);
    const [erro, setErro] = useState('');
    const [resultado, setResultado] = useState<Comparacao[] | null>(null);
    // Trocou a empresa ou o período ativo: a competência acompanha e o resultado anterior sai.
    useEffect(() => { setCompetencia(ativa?.competencia ?? ''); setResultado(null); }, [ativa?.id, ativa?.competencia]);
    const host = hostDaPlataforma(colado, env);
    const coladoValido = !host.doBuild && host.url ? host.url : '';
    useEffect(() => { if (coladoValido) onColado?.(coladoValido); }, [coladoValido, onColado]);
    const cnpj = normalizarCnpj(ativa?.cnpj);
    const compOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia);
    const pronto = !!host.url && !!ativa && cnpj.length === 14 && compOk && ciente && !rodando;

    async function comparar() {
        if (!pronto || !ativa || !host.url) return;
        setRodando(true); setErro(''); setResultado(null);
        try {
            setResultado(await compararGoverno({ empresaId: ativa.id, cnpj, competencia }, { cfi: HOST_CFI_INTEGRACAO, plataforma: host.url }));
        } catch (e) {
            setErro((e as Error).message || 'Falha na comparação.');
        } finally {
            setRodando(false); setCiente(false);
        }
    }

    return (
        <section aria-label="Comparar CFI × plataforma (governo)" className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <div>
                <h3 className="font-medium text-slate-800 dark:text-slate-100">Comparar CFI × plataforma (governo)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Chama as mesmas consultas de leitura no CFI e na plataforma, com o seu login, e mostra as diferenças. Nada é gravado
                    e nada é enviado ou transmitido: {ROTAS_COMPARADAS.map(r => r.titulo).join('; ')}. A consulta de pagamentos fica de fora
                    (pede o número do documento) e o download do eSocial também (gasta a cota do dia).
                </p>
            </div>
            {!ativa ? <p className="text-sm text-slate-500 dark:text-slate-400">Ative uma empresa para comparar.</p> : (
                <p className="text-sm text-slate-700 dark:text-slate-200">Empresa ativa: <b>{ativa.nome}</b> · CNPJ {ativa.cnpj}</p>
            )}
            <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm text-slate-700 dark:text-slate-200">
                    Competência
                    <input type="month" aria-label="Competência da comparação" className="ml-2 rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                        value={competencia} onChange={e => setCompetencia(e.target.value)} />
                </label>
                {host.doBuild ? (
                    <p className="text-xs text-slate-600 dark:text-slate-300">Plataforma: <code className="break-all">{host.url}</code> (endereço deste build)</p>
                ) : (
                    <label className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                        Endereço da plataforma (só para esta comparação; não é gravado)
                        <input type="url" aria-label="Endereço da plataforma" placeholder="https://…" className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                            value={colado} onChange={e => setColado(e.target.value)} />
                        {colado.trim() && host.aviso && <span className="text-xs text-red-700 dark:text-red-300">{host.aviso}</span>}
                    </label>
                )}
            </div>
            <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                Cada consulta ao SERPRO é cobrada, e aqui cada item vai aos dois serviços (2× por item): esta comparação faz {CONSULTAS_COBRADAS} consultas
                cobradas ({ROTAS_COMPARADAS.filter(r => r.serpro).map(r => r.titulo).join(' e ')}). A situação dos DARF não vai ao SERPRO.
                <label className="mt-1 flex items-center gap-2">
                    <input type="checkbox" checked={ciente} onChange={e => setCiente(e.target.checked)} />
                    Entendi o custo e quero comparar.
                </label>
            </div>
            <button className={btn} disabled={!pronto} onClick={() => void comparar()}>{rodando ? 'Comparando…' : 'Comparar'}</button>
            {erro && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{erro}</p>}
            {resultado && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <tr><th className="px-3 py-2">Consulta</th><th className="px-3 py-2">CFI</th><th className="px-3 py-2">Plataforma</th><th className="px-3 py-2">Diferenças de negócio</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {resultado.map(c => (
                                <tr key={c.rota} data-rota={c.rota}>
                                    <td className="px-3 py-2 align-top"><p className="font-medium text-slate-800 dark:text-slate-100">{c.titulo}</p><code className="text-[11px] text-slate-500">{c.rota}</code></td>
                                    <td className="px-3 py-2 align-top"><Lado r={c.cfi} /></td>
                                    <td className="px-3 py-2 align-top"><Lado r={c.plataforma} /></td>
                                    <td className="px-3 py-2 align-top">
                                        {c.iguais ? <span className="text-xs font-medium text-green-700 dark:text-green-300">iguais</span>
                                            : !c.diferencas.length ? <span className="text-xs text-amber-700 dark:text-amber-300">só o HTTP difere</span>
                                                : (
                                                    <ul className="space-y-0.5 text-xs">
                                                        {c.diferencas.map(d => (
                                                            <li key={d.caminho}><code>{d.caminho}</code>: CFI <code className="break-all">{valor(d.cfi)}</code> × plataforma <code className="break-all">{valor(d.plataforma)}</code></li>
                                                        ))}
                                                    </ul>
                                                )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
};

export default ComparadorGoverno;
