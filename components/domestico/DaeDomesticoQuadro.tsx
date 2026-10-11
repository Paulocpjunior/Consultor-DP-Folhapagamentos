// components/domestico/DaeDomesticoQuadro.tsx
//
// Cálculo › Folha mensal com empregados domésticos (categoria 104): o DAE esperado (INSS do empregado e do empregador,
// GILRAT, FGTS, indenização compensatória, IRRF e o salário-família deduzido), com o vencimento, para conferir com o
// gerado no eSocial Doméstico depois de lançar a folha lá.

import React from 'react';
import { reais } from '../../services/cadastros/documentos';
import type { DaeDomestico } from '../../services/domestico/domestico';

const br = (d: string) => d.split('-').reverse().join('/');

const DaeDomesticoQuadro: React.FC<{ dae: DaeDomestico }> = ({ dae }) => (
    <section aria-label="DAE do eSocial Doméstico" className="space-y-2 rounded-lg border border-violet-300 bg-violet-50 p-3 text-sm text-violet-950 dark:border-violet-700 dark:bg-violet-900/20 dark:text-violet-100">
        <p>🏠 <strong>Empregados domésticos ({dae.empregados})</strong>: a folha vai pelo eSocial Doméstico (módulo web), que gera o DAE. Valores esperados para conferir lá — vencimento em <strong>{br(dae.vencimento)}</strong> (dia 7, antecipado se não for dia útil; LC 150/2015, art. 35).</p>
        <table className="w-full max-w-2xl text-xs">
            <thead className="text-left text-violet-700 dark:text-violet-300"><tr><th className="py-1">Item</th><th className="py-1 text-right">Base</th><th className="py-1 text-right">Alíquota</th><th className="py-1 text-right">Valor</th></tr></thead>
            <tbody>{dae.itens.map(i => (
                <tr key={i.rotulo} className="border-t border-violet-200 dark:border-violet-800">
                    <td className="py-1">{i.rotulo}</td><td className="py-1 text-right">{i.base ? reais(i.base) : ''}</td><td className="py-1 text-right">{i.aliquota}</td><td className="py-1 text-right">{reais(i.valor)}</td>
                </tr>
            ))}</tbody>
            <tfoot><tr className="border-t border-violet-300 font-semibold dark:border-violet-700"><td className="py-1" colSpan={3}>Total do DAE</td><td className="py-1 text-right">{reais(dae.total)}</td></tr></tfoot>
        </table>
        {dae.avisos.map(a => <p key={a} className="text-xs">⚠ {a}</p>)}
        <p className="text-xs text-violet-800 dark:text-violet-300">Doença: o INSS paga desde o 1º dia. Salário-maternidade: pago direto pelo INSS, com FGTS (8% + 3,2%) pelo empregador. Os 3,2% substituem a multa de 40% na dispensa.</p>
    </section>
);

export default DaeDomesticoQuadro;
