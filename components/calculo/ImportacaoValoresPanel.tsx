// components/calculo/ImportacaoValoresPanel.tsx
//
// Folha do mês › Importação de valores: o TXT de lançamentos no layout de importação de ponto do IOB (windows3 de 40
// posições ou windows4 de 50, o mesmo que o Apontamento gera) entra no movimento do mês da empresa ativa
// (services/calculo/importacaoValores.ts). Mostra linha a linha o que foi lançado e o que ficou de fora, e grava no
// movimento (o mesmo do Cálculo mensal); competência encerrada no Fim de mês não recebe.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { carregarEventosIob } from '../../services/calculo/catalogoEventos';
import type { EventoIobSage } from '../../services/folha/folhaTypes';
import { listarMovimentos, salvarMovimentos } from '../../services/calculo/movimentosService';
import type { Movimento } from '../../services/calculo/motorMensal';
import { mesmoMovimento } from '../../services/calculo/movimento';
import { lerFechamento } from '../../services/fimDeMes/fechamentoService';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { FormulaEvento } from '../../services/calculo/formulaEvento';
import { aplicarValores, lerValoresIob, type LeituraValores } from '../../services/calculo/importacaoValores';

const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 6 });

const ImportacaoValoresPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const competencia = ativa?.competencia ?? '';
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [eventos, setEventos] = useState<EventoIobSage[]>([]);
    const [gravados, setGravados] = useState<Record<string, Movimento>>({});
    const [encerrado, setEncerrado] = useState(false);
    const [leitura, setLeitura] = useState<LeituraValores | null>(null);
    const [formulas, setFormulas] = useState<Record<string, FormulaEvento> | undefined>(undefined);
    const [arquivo, setArquivo] = useState('');
    const [recarga, setRecarga] = useState(0);
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa || !competencia) return;
        let vivo = true;
        Promise.all([listarFuncionarios(ativa.id), carregarEventosIob(), listarMovimentos(ativa.id, competencia), lerFechamento(ativa.id, competencia).catch(() => null), listarEmpresasVisiveis().catch(() => [])])
            .then(([fs, evs, movs, fech, emps]) => {
                if (!vivo) return;
                setFichas(fs); setEventos(evs); setGravados(Object.fromEntries(movs.map(m => [m.fichaId, m.movimento]))); setEncerrado(fech?.situacao === 'encerrado');
                setFormulas(emps.find(x => x.id === ativa.id)?.parametrosFolha?.formulasEventos);
            })
            .catch(e => { if (vivo) setErro(`Dados não carregados (o movimento gravado é preciso para não sobrescrever): ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa, competencia, recarga]);

    const aplicacao = useMemo(() => (leitura && ativa ? aplicarValores({ linhas: leitura.linhas, competencia, codigoEmpresa: ativa.codigoSage, fichas, eventos, movimentos: gravados, formulas }) : null), [leitura, ativa, competencia, fichas, eventos, gravados, formulas]);
    const mudados = aplicacao ? Object.keys(aplicacao.movimentos).filter(id => !mesmoMovimento(aplicacao.movimentos[id], gravados[id])) : [];

    async function abrir(f: File) {
        setErro(''); setMsg('');
        const buf = await f.arrayBuffer();
        // O TXT do IOB é ANSI (Windows-1252); em UTF-8 sem erro, vale o UTF-8.
        let texto: string;
        try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { texto = new TextDecoder('windows-1252').decode(buf); }
        setArquivo(f.name); setLeitura(lerValoresIob(texto));
    }
    async function gravar() {
        if (!ativa || !aplicacao || !mudados.length || encerrado) return;
        if (!window.confirm(`Gravar os lançamentos de ${mudados.length} funcionário(s) no movimento de ${br(competencia)}?`)) return;
        setOcupado('Gravando no movimento…'); setErro('');
        try {
            await salvarMovimentos(ativa.id, competencia, mudados.map(id => ({ fichaId: id, antes: gravados[id] ?? null, depois: aplicacao.movimentos[id] })), usuario);
            setMsg(`Movimento de ${mudados.length} funcionário(s) gravado. Confira o cálculo em Folha do mês › Cálculo mensal.`);
            setLeitura(null); setRecarga(n => n + 1);
        } catch (x) { setErro(`Não foi possível gravar (${mensagemErro(x)}). Se outra pessoa salvou o movimento agora, abra de novo e importe outra vez.`); }
        finally { setOcupado(''); }
    }

    if (!ativa) return <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Ative a empresa e a competência.</p>;
    return (
        <div className="space-y-4 text-sm">
            <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-white">Importação de valores · {competencia ? br(competencia) : '—'}</h2>
                <p className="text-slate-600 dark:text-slate-300">O arquivo de lançamentos no layout de importação de ponto do IOB SAGE (Windows 3, de 40 posições, ou Windows 4, de 50, com a empresa e a competência) entra no movimento do mês: cada linha é um "Lançar evento" pelo cadastro do evento (horas, dias, % ou valor). O funcionário é achado pelo "Código no IOB" da ficha. O Apontamento gera esse arquivo a partir da planilha do cliente.</p>
            </div>
            {encerrado && <p role="note" className="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">Competência encerrada no Fim de mês: o movimento não recebe lançamentos. Peça a reabertura ao gestor do DP.</p>}
            <section className="flex flex-wrap items-center gap-3 rounded border border-slate-200 p-3 dark:border-slate-700">
                <label className={btn}>Escolher o arquivo (.txt)<input aria-label="Arquivo de valores" type="file" accept=".txt,text/plain" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void abrir(f); e.target.value = ''; }} /></label>
                {arquivo && <span className="text-slate-500">{arquivo}{leitura?.layout ? ` · ${leitura.layout === 'windows4' ? 'Windows 4 (50 posições)' : 'Windows 3 (40 posições)'}` : ''}</span>}
            </section>
            {leitura && leitura.erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{leitura.erros.map(x => <li key={x}>{x}</li>)}</ul>}
            {aplicacao && aplicacao.resultados.length > 0 && (
                <section aria-label="Lançamentos importados" className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{aplicacao.resultados.length - aplicacao.ignoradas} lançamento(s) prontos · {aplicacao.ignoradas} fora · {mudados.length} funcionário(s) com o movimento alterado</p>
                        <button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!mudados.length || encerrado || !!ocupado} onClick={gravar}>Gravar no movimento</button>
                    </div>
                    <div className="max-h-96 overflow-auto">
                        <table className="w-full text-xs"><thead className="sticky top-0 bg-white text-left text-slate-500 dark:bg-slate-800"><tr><th className="p-1">Linha</th><th className="p-1">Código</th><th className="p-1">Funcionário</th><th className="p-1">Evento</th><th className="p-1 text-right">Ref./valor</th><th className="p-1">Resultado</th></tr></thead>
                            <tbody>{aplicacao.resultados.map(r => (
                                <tr key={r.linha.linha} className={`border-t border-slate-100 dark:border-slate-700 ${r.ok ? '' : 'text-red-700 dark:text-red-300'}`}>
                                    <td className="p-1">{r.linha.linha}</td><td className="p-1 font-mono">{r.linha.codigoFuncionario}</td><td className="p-1">{r.nome ?? '—'}</td><td className="p-1 font-mono">{r.linha.evento}</td>
                                    <td className="p-1 text-right">{r.linha.valor ? `R$ ${(r.linha.valor / 100).toFixed(2).replace('.', ',')}` : num(r.linha.referencia)}</td><td className="p-1">{r.ok ? '✓ ' : '✗ '}{r.mensagem}</td>
                                </tr>
                            ))}</tbody></table>
                    </div>
                </section>
            )}
            {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
        </div>
    );
};

export default ImportacaoValoresPanel;
