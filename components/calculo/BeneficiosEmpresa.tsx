// components/calculo/BeneficiosEmpresa.tsx
//
// Benefícios da empresa (parâmetros da folha): nome, código do evento no IOB,
// valor por vida e incidências. Quem aderiu e com quantas vidas fica na ficha
// (Cadastros › Funcionários › aba "Benefícios").

import React, { useState } from 'react';
import { novoBeneficio, validarBeneficios, type Beneficio } from '../../services/calculo/beneficios';
import { centavosDeTexto } from '../../services/cadastros/documentos';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const reaisTexto = (c: number) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

const BeneficiosEmpresa: React.FC<{ beneficios: Beneficio[]; onSalvar: (l: Beneficio[]) => void; onFechar: () => void }> = ({ beneficios, onSalvar, onFechar }) => {
    const [lista, setLista] = useState<Beneficio[]>(beneficios);
    const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(beneficios.map(b => [b.id, reaisTexto(b.valor)])));
    const [erros, setErros] = useState<string[]>([]);
    const set = (id: string, m: Partial<Beneficio>) => setLista(l => l.map(b => (b.id === id ? { ...b, ...m } : b)));
    const salvar = () => {
        const limpa = lista.map(b => ({ ...b, nome: b.nome.trim().replace(/\s+/g, ' '), codigoIob: (b.codigoIob ?? '').trim() }));
        const e = validarBeneficios(limpa);
        setErros(e);
        if (!e.length) onSalvar(limpa);
    };
    return (
        <section aria-label="Benefícios da empresa" className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">Benefícios da empresa</h3>
                <button className="text-xs underline" onClick={onFechar}>fechar</button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">Descontos (ou proventos) fixos por vida, como a assistência odontológica do IOB (evento 7001, ref. = vidas). Quem tem o benefício e com quantas vidas é marcado na ficha, aba "Benefícios". O motor lança todo mês.</p>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-xs">
                    <thead className="text-left text-slate-500"><tr><th className="p-1">Nome</th><th className="p-1">Evento IOB</th><th className="p-1">Tipo</th><th className="p-1">Valor por vida (R$)</th><th className="p-1">INSS</th><th className="p-1">FGTS</th><th className="p-1">IRRF</th><th className="p-1">Ativo</th><th /></tr></thead>
                    <tbody>{lista.map((b, i) => (
                        <tr key={b.id} className="border-t border-slate-100 dark:border-slate-700">
                            <td className="p-1"><input aria-label={`Nome do benefício ${i + 1}`} className={`w-48 ${inp}`} value={b.nome} onChange={e => set(b.id, { nome: e.target.value })} /></td>
                            <td className="p-1"><input aria-label={`Evento IOB do benefício ${i + 1}`} className={`w-20 ${inp}`} value={b.codigoIob ?? ''} onChange={e => set(b.id, { codigoIob: e.target.value })} /></td>
                            <td className="p-1"><select aria-label={`Tipo do benefício ${i + 1}`} className={inp} value={b.tipo} onChange={e => set(b.id, { tipo: e.target.value as Beneficio['tipo'] })}><option value="desconto">Desconto</option><option value="provento">Provento</option></select></td>
                            <td className="p-1"><input aria-label={`Valor por vida do benefício ${i + 1}`} className={`w-24 ${inp}`} value={valores[b.id] ?? ''}
                                onChange={e => { const t = e.target.value; setValores(v => ({ ...v, [b.id]: t })); set(b.id, { valor: centavosDeTexto(t) ?? 0 }); }} /></td>
                            {(['inss', 'fgts', 'irrf'] as const).map(k => <td key={k} className="p-1 text-center"><input type="checkbox" aria-label={`${k.toUpperCase()} do benefício ${i + 1}`} checked={b[k]} onChange={e => set(b.id, { [k]: e.target.checked })} /></td>)}
                            <td className="p-1 text-center"><input type="checkbox" aria-label={`Benefício ${i + 1} ativo`} checked={b.ativo} onChange={e => set(b.id, { ativo: e.target.checked })} /></td>
                            <td className="p-1"><button className="text-red-700 underline dark:text-red-300" onClick={() => setLista(l => l.filter(x => x.id !== b.id))}>remover</button></td>
                        </tr>
                    ))}</tbody>
                </table>
            </div>
            {!lista.length && <p className="text-xs text-slate-500">Nenhum benefício cadastrado.</p>}
            {erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
            <div className="flex flex-wrap gap-2">
                <button className="rounded border border-slate-300 px-3 py-1.5 text-xs dark:border-slate-600" onClick={() => setLista(l => [...l, novoBeneficio()])}>Adicionar benefício</button>
                <button className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" onClick={salvar}>Salvar benefícios</button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Incidências: confira com a rubrica do evento em Cadastros › Incidências (assistência odontológica descontada do empregado normalmente não incide em INSS, FGTS nem IRRF).</p>
        </section>
    );
};

export default BeneficiosEmpresa;
