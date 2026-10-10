// components/plataforma/ServicosExternosPanel.tsx
//
// Configurações › Serviços externos (autonomia, passo 3): quem atende cada serviço que o DP usa fora do
// Firebase — CFI, plataforma comum ou próprio do DP — com o endereço e um teste de alcance. A troca é feita
// no build (variáveis do repositório no GitHub); a tela mostra o que está valendo e os avisos de endereço inválido.

import React, { useMemo, useState } from 'react';
import { ROTULO_ORIGEM, SERVICOS, configuracaoDosServicos, enderecoExibido, testarAlcance, type Origem, type Servico } from '../../services/plataforma/servicos';

const COR: Record<Origem, string> = {
    cfi: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    plataforma: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    proprio: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
};
const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';

type Teste = { ok: boolean; ms: number; erro?: string } | 'testando';

const ServicosExternosPanel: React.FC = () => {
    const config = useMemo(() => configuracaoDosServicos(), []);
    const [testes, setTestes] = useState<Partial<Record<Servico, Teste>>>({});
    const avisos = [...new Set(config.flatMap(c => c.avisos))];

    const testar = async (servicos: Servico[]) => {
        setTestes(t => ({ ...t, ...Object.fromEntries(servicos.map(s => [s, 'testando'])) }));
        await Promise.all(servicos.map(async s => {
            const r = await testarAlcance(enderecoExibido(config.find(c => c.servico === s)!));
            setTestes(t => ({ ...t, [s]: r }));
        }));
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
                Tudo o que o DP faz fora do próprio banco de dados passa por um destes serviços. Hoje eles moram no CFI; quando a
                plataforma comum (ou um serviço próprio do DP) estiver no ar, a troca é só de endereço, sem mexer nas telas.
            </p>
            {avisos.length > 0 && (
                <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                    <p className="font-medium">Configuração ignorada — o serviço segue no endereço anterior:</p>
                    <ul className="mt-1 list-disc pl-5">{avisos.map(a => <li key={a}>{a}</li>)}</ul>
                </div>
            )}
            <div className="flex justify-end"><button className={btn} onClick={() => testar(config.map(c => c.servico))}>Testar todos</button></div>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <tr><th className="px-3 py-2">Serviço</th><th className="px-3 py-2">Atendido por</th><th className="px-3 py-2">Endereço</th><th className="px-3 py-2">Alcance</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {config.map(c => {
                            const t = testes[c.servico];
                            return (
                                <tr key={c.servico}>
                                    <td className="px-3 py-2 align-top">
                                        <p className="font-medium text-slate-800 dark:text-slate-100">{SERVICOS[c.servico].titulo}</p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{SERVICOS[c.servico].descricao}</p>
                                    </td>
                                    <td className="px-3 py-2 align-top"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COR[c.origem]}`}>{ROTULO_ORIGEM[c.origem]}</span></td>
                                    <td className="px-3 py-2 align-top">
                                        <code className="break-all text-xs text-slate-700 dark:text-slate-300">{enderecoExibido(c)}</code>
                                        <p className="text-[11px] text-slate-400">{SERVICOS[c.servico].variavel}</p>
                                    </td>
                                    <td className="px-3 py-2 align-top whitespace-nowrap">
                                        {t === 'testando' ? <span className="text-xs text-slate-500">testando…</span>
                                            : t ? <span className={`text-xs font-medium ${t.ok ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>{t.ok ? `responde (${t.ms} ms)` : `sem resposta: ${t.erro}`}</span>
                                                : <button className={btn} onClick={() => testar([c.servico])}>Testar</button>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <details className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                <summary className="cursor-pointer font-medium text-slate-800 dark:text-slate-100">Como trocar o endereço</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                    <li>No GitHub do DP, em Settings › Secrets and variables › Actions › <b>Variables</b>, crie <code>VITE_PLATAFORMA_URL</code> (todos os serviços) ou a variável do serviço que vai mudar (coluna Endereço).</li>
                    <li>O novo endereço precisa ser https, ter as mesmas rotas do CFI (docs/plataforma-servicos.md), aceitar o login deste app e liberar o acesso a partir do endereço do DP.</li>
                    <li>A troca vale na próxima publicação. Para voltar ao CFI, apague a variável e publique de novo.</li>
                </ol>
                <p className="mt-2 text-xs text-slate-500">O teste de alcance só confere se há um servidor respondendo; não usa o seu login nem envia nada.</p>
            </details>
        </div>
    );
};

export default ServicosExternosPanel;
