// components/calculo/ConferenciaHolerites.tsx
//
// Aba Cálculo › "Conferir com os holerites do IOB": o PDF dos holerites é
// lido pelo Gemini (via CFI) e cada holerite é comparado com o resultado do
// motor, item a item. A IA só transcreve; ligar, comparar e sugerir o
// movimento é código (services/calculo/conferenciaHolerites).

import React, { useMemo, useState } from 'react';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { reais } from '../../services/cadastros/documentos';
import type { Movimento, ResultadoCalculo } from '../../services/calculo/motorMensal';
import { mesmoMovimento, movimentoVazio } from '../../services/calculo/movimento';
import { conferirHolerite, ligarHolerite, movimentoDoHolerite, type ConferenciaFuncionario, type HoleriteIob } from '../../services/calculo/conferenciaHolerites';
import { lerHolerites, registrarLeitura, MAX_PDF_MB } from '../../services/calculo/holeritesService';

export interface LeituraHolerites { holerites: HoleriteIob[]; arquivos: string[]; modelo: string; avisos: string[] }

interface Props {
    empresaId: string; competencia: string; fichas: FichaFuncionario[]; resultados: ResultadoCalculo[]; usuario: Usuario;
    leitura: LeituraHolerites | null; onLeitura: (l: LeituraHolerites | null) => void;
    movimentos: Record<string, Movimento>; onAplicarMovimento: (fichaId: string, m: Movimento) => void;
}

const COR = {
    confere: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    diverge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    'sem cálculo': 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};
const dif = (c: number) => `${c > 0 ? '+' : c < 0 ? '−' : ''}${reais(Math.abs(c))}`;

export interface LinhaConferida { holerite: HoleriteIob; conferencia: ConferenciaFuncionario | null; sugestao: ReturnType<typeof movimentoDoHolerite> }

/** Liga e confere todos os holerites lidos; também usado na exportação. */
export function conferirTodos(leitura: LeituraHolerites, fichas: FichaFuncionario[], resultados: ResultadoCalculo[]): { linhas: LinhaConferida[]; semHolerite: ResultadoCalculo[] } {
    const usados = new Set<string>();
    const linhas = leitura.holerites.map(h => {
        const { ficha, por } = ligarHolerite(h, fichas);
        if (ficha) usados.add(ficha.id);
        return { holerite: h, conferencia: ficha ? conferirHolerite(resultados.find(r => r.fichaId === ficha.id), h, por) : null, sugestao: movimentoDoHolerite(h) };
    });
    return { linhas, semHolerite: resultados.filter(r => !usados.has(r.fichaId)) };
}

const ConferenciaHolerites: React.FC<Props> = ({ empresaId, competencia, fichas, resultados, usuario, leitura, onLeitura, movimentos, onAplicarMovimento }) => {
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [aberto, setAberto] = useState<number | null>(null);

    const conf = useMemo(() => (leitura ? conferirTodos(leitura, fichas, resultados) : null), [leitura, fichas, resultados]);
    const cont = (s: string) => conf?.linhas.filter(l => l.conferencia?.situacao === s).length ?? 0;

    async function ler() {
        setErro(''); setAberto(null);
        const holerites: HoleriteIob[] = []; const avisos: string[] = []; let modelo = '';
        try {
            for (const [i, f] of arquivos.entries()) {
                setOcupado(`Lendo ${f.name} (${i + 1} de ${arquivos.length}) com o Gemini… pode levar um minuto.`);
                const r = await lerHolerites(f, competencia);
                holerites.push(...r.holerites); avisos.push(...r.avisos.map(a => `${f.name}: ${a}`)); modelo = r.modelo ?? modelo;
            }
            onLeitura({ holerites, arquivos: arquivos.map(f => f.name), modelo, avisos });
            registrarLeitura(usuario, empresaId, competencia, arquivos.map(f => f.name), holerites.length, modelo).catch(() => { /* auditoria não bloqueia a conferência */ });
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setOcupado(''); }
    }

    function aplicar(fichaId: string, m: Movimento, nome: string) {
        const atual = movimentos[fichaId];
        if (!movimentoVazio(atual) && !mesmoMovimento(atual, m) && !window.confirm(`${nome} já tem movimento digitado. Trocar pelo que o holerite indica?`)) return;
        onAplicarMovimento(fichaId, m);
    }

    return (
        <section aria-label="Conferência com os holerites do IOB" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div>
                <h3 className="font-semibold text-slate-800 dark:text-white">Conferir com os holerites do IOB</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                    O PDF dos holerites da competência é lido pelo Gemini (conta do escritório, pelo CFI) e não é gravado. A IA só transcreve; a comparação é feita pelo app, item a item, com tolerância de R$ 0,01. Cada leitura fica registrada na auditoria (sem nomes nem valores). Até {MAX_PDF_MB} MB por PDF; com muitos funcionários, divida em partes de uns 30.
                </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm dark:text-white">PDF dos holerites
                    <input aria-label="PDF dos holerites" className="block text-sm" type="file" accept="application/pdf,.pdf" multiple disabled={!!ocupado} onChange={e => setArquivos(Array.from(e.target.files ?? []))} />
                </label>
                <button className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!arquivos.length || !!ocupado} onClick={ler}>Ler holerites</button>
                {leitura && <button className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={() => onLeitura(null)}>Limpar leitura</button>}
            </div>
            {ocupado && <p role="status" className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

            {leitura && conf && (
                <>
                    <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                        <div className="rounded bg-slate-50 p-2 dark:bg-slate-700 dark:text-slate-100"><strong>{leitura.holerites.length}</strong> holerite(s) lido(s)</div>
                        <div className="rounded bg-green-50 p-2 dark:bg-green-900/30 dark:text-green-100"><strong>{cont('confere')}</strong> conferem</div>
                        <div className="rounded bg-red-50 p-2 dark:bg-red-900/30 dark:text-red-100"><strong>{cont('diverge')}</strong> divergem</div>
                        <div className="rounded bg-amber-50 p-2 dark:bg-amber-900/30 dark:text-amber-100"><strong>{conf.linhas.filter(l => !l.conferencia).length}</strong> sem ficha</div>
                        <div className="rounded bg-amber-50 p-2 dark:bg-amber-900/30 dark:text-amber-100"><strong>{conf.semHolerite.length}</strong> sem holerite</div>
                    </div>
                    <p className="text-xs text-slate-500">Lido por {leitura.modelo || 'Gemini'} · {leitura.arquivos.join(', ')}</p>
                    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Holerite</th><th className="p-2">Situação</th><th className="p-2">Divergências</th><th className="p-2">Movimento</th></tr></thead>
                            <tbody>
                                {conf.linhas.map(({ holerite: h, conferencia: c, sugestao }, i) => {
                                    const divergentes = c?.linhas.filter(l => !l.ok) ?? [];
                                    const temSugestao = !movimentoVazio(sugestao.movimento);
                                    const igual = c && mesmoMovimento(movimentos[c.fichaId], sugestao.movimento);
                                    return (
                                        <React.Fragment key={i}>
                                            <tr className="cursor-pointer border-t border-slate-100 align-top hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700" onClick={() => setAberto(a => (a === i ? null : i))}>
                                                <td className="p-2"><span className="font-medium">{h.nome || '(sem nome)'}</span>{h.pagina ? <span className="ml-1 text-xs text-slate-500">pág. {h.pagina}</span> : null}{c && c.ligadoPor !== 'cpf' && <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">(ligado pelo {c.ligadoPor === 'codigo' ? 'código' : 'nome'})</span>}</td>
                                                <td className="whitespace-nowrap p-2 text-xs">{c ? <span className={`rounded px-1.5 ${COR[c.situacao]}`}>{c.situacao}</span> : <span className="rounded bg-amber-100 px-1.5 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">sem ficha</span>}</td>
                                                <td className="min-w-[14rem] p-2 text-xs">{divergentes.map(l => `${l.item} ${dif(l.diferenca)}`).join('; ')}{c && c.semCorrespondente.length > 0 && `${divergentes.length ? '; ' : ''}${c.semCorrespondente.length} verba(s) do IOB sem correspondente`}</td>
                                                <td className="p-2 text-xs" onClick={e => e.stopPropagation()}>
                                                    {c && temSugestao && (igual ? <span className="text-green-700 dark:text-green-300">já aplicado</span>
                                                        : <button className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" onClick={() => aplicar(c.fichaId, sugestao.movimento, c.nome)}>Aplicar movimento do holerite</button>)}
                                                </td>
                                            </tr>
                                            {aberto === i && (
                                                <tr className="bg-slate-50 dark:bg-slate-900/40"><td colSpan={4} className="p-3 text-xs dark:text-slate-200">
                                                    {c && c.linhas.length > 0 && (
                                                        <table className="mb-2 w-full max-w-xl">
                                                            <thead className="text-left text-slate-500"><tr><th>Item</th><th className="text-right">Motor</th><th className="text-right">IOB</th><th className="text-right">Diferença</th></tr></thead>
                                                            <tbody>{c.linhas.map(l => <tr key={l.item} className={l.ok ? '' : 'font-medium text-red-700 dark:text-red-300'}><td>{l.item}</td><td className="text-right">{reais(l.motor)}</td><td className="text-right">{reais(l.iob)}</td><td className="text-right">{l.ok ? 'ok' : dif(l.diferenca)}</td></tr>)}</tbody>
                                                        </table>
                                                    )}
                                                    {c && c.semCorrespondente.length > 0 && <p>Verbas do IOB sem correspondente no motor: {c.semCorrespondente.map(v => `${v.codigo ? `${v.codigo} ` : ''}${v.descricao} ${reais(v.provento || v.desconto)}`).join('; ')}. Lance-as como lançamentos avulsos ("Aplicar movimento do holerite").</p>}
                                                    {!c && <p>Nenhuma ficha com este CPF, código do IOB ou nome nesta empresa. Confira o cadastro.</p>}
                                                    {[...(c?.avisos ?? h.avisos), ...sugestao.avisos].map(a => <p key={a} className="text-amber-700 dark:text-amber-300">{a}</p>)}
                                                    <details className="mt-1"><summary className="cursor-pointer">Verbas lidas do holerite ({h.verbas.length})</summary>
                                                        <ul className="mt-1 list-disc pl-5">{h.verbas.map((v, j) => <li key={j}>{v.codigo} {v.descricao} · ref. {v.referencia || '—'} · {v.provento ? `+${reais(v.provento)}` : `−${reais(v.desconto)}`}</li>)}</ul>
                                                    </details>
                                                </td></tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {conf.semHolerite.length > 0 && <p className="text-xs text-slate-600 dark:text-slate-300">Calculados pelo motor sem holerite no PDF: {conf.semHolerite.map(r => r.nome).join(', ')}.</p>}
                    {leitura.avisos.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">{leitura.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
                </>
            )}
        </section>
    );
};

export default ConferenciaHolerites;
