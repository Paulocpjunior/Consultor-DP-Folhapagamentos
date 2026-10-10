// components/calculo/CalculoAdiantamentosModal.tsx
//
// "Cálculo de Adiantamentos": o adiantamento salarial da competência numa tela
// própria, por funcionário (percentual da ficha ou valor informado, IRRF do
// adiantamento quando o saldo da folha é pago no mês seguinte, arredondamento e
// o que se paga no dia), com os totais, os recibos, o arquivo bancário e a
// opção de fixar no movimento o valor pago (desligamento, afastamento ou
// reajuste depois do dia não mudam o desconto na folha).

import React, { useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { adiantamentoDoMes, type Movimento, type ResultadoCalculo } from '../../services/calculo/motorMensal';
import { arredondamentoDoAdiantamento } from '../../services/calculo/arredondamento';
import { foraDoAdiantamento, valorDoAdiantamento } from '../../services/bancario/favorecidos';
import { reais } from '../../services/cadastros/documentos';

const br = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600 dark:text-white';

interface Props {
    empresaNome: string;
    competencia: string;
    /** Dia do adiantamento (20 ou o dia útil anterior). */
    dataAdiantamento: string;
    resultados: ResultadoCalculo[];
    fichas: FichaFuncionario[];
    movs: Record<string, Movimento>;
    /** Funcionários com movimento ainda não salvo. */
    pendentes: number;
    /** Motivo para não gerar o arquivo bancário (movimento por salvar, leitura do mês pendente). */
    bloqueio?: string;
    onFixar: (valores: Record<string, number>) => void;
    onRecibos: () => void;
    onArquivo: () => void;
    onFechar: () => void;
}

export interface LinhaAdiantamento {
    fichaId: string; nome: string; matricula: string; percentual: string; informado: boolean;
    adiantamento: number; irrf: number; irrfCpf: boolean; arredondamento: number; aPagar: number; situacao: string;
}

/** Linhas do adiantamento da competência: quem tem percentual na ficha ou valor no movimento. */
export function linhasDoAdiantamento(resultados: ResultadoCalculo[], fichas: FichaFuncionario[], movs: Record<string, Movimento>, data: string): LinhaAdiantamento[] {
    const porId = new Map(fichas.map(f => [f.id, f]));
    return resultados.flatMap(r => {
        const f = porId.get(r.fichaId);
        const pct = (f?.dados.adiantamentoPct ?? '').trim();
        if (!(Number(pct.replace(',', '.')) > 0) && movs[r.fichaId]?.adiantamento === undefined && !adiantamentoDoMes(r)) return [];
        const fora = r.situacao === 'calculado' ? foraDoAdiantamento(r, f, data) : undefined;
        const situacao = r.situacao === 'erro' ? `erro: ${r.erros.join(' ')}` : r.situacao === 'incompleto' ? `incompleto: ${r.avisos.slice(-1).join('')}` : fora ? `fora do arquivo: ${fora}` : 'ok';
        return [{
            fichaId: r.fichaId, nome: r.nome, matricula: f?.matriculaEsocial ?? '', percentual: pct ? `${pct}%` : '', informado: !!r.adiantamentoInformado,
            adiantamento: adiantamentoDoMes(r), irrf: r.irrfAdiantamento ?? 0, irrfCpf: !!r.irrfAdiantamentoCpf, arredondamento: arredondamentoDoAdiantamento(r),
            aPagar: r.situacao === 'erro' ? 0 : valorDoAdiantamento(r), situacao,
        }];
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const CalculoAdiantamentosModal: React.FC<Props> = ({ empresaNome, competencia, dataAdiantamento, resultados, fichas, movs, pendentes, bloqueio, onFixar, onRecibos, onArquivo, onFechar }) => {
    const linhas = useMemo(() => linhasDoAdiantamento(resultados, fichas, movs, dataAdiantamento), [resultados, fichas, movs, dataAdiantamento]);
    const soma = (k: 'adiantamento' | 'irrf' | 'arredondamento' | 'aPagar') => linhas.reduce((s, l) => s + l[k], 0);
    const aFixar = linhas.filter(l => !l.informado && l.adiantamento > 0 && !l.situacao.startsWith('erro'));
    const mes = `${competencia.slice(5)}/${competencia.slice(0, 4)}`;

    function exportar() {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas.map(l => ({
            Nome: l.nome, Matrícula: l.matricula, Percentual: l.percentual, Origem: l.informado ? 'informado no movimento' : 'pela ficha',
            Adiantamento: l.adiantamento / 100, 'IRRF do adiantamento': l.irrf / 100, Arredondamento: l.arredondamento / 100, 'A pagar': l.aPagar / 100, Situação: l.situacao,
        }))), 'Adiantamentos');
        XLSX.writeFile(wb, `adiantamentos-${competencia}.xlsx`);
    }

    return (
        <div role="dialog" aria-label="Cálculo de Adiantamentos" className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4">
            <div className="w-full max-w-5xl space-y-3 rounded-lg bg-white p-4 text-sm shadow-xl dark:bg-slate-800 dark:text-slate-100">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h3 className="text-lg font-semibold">Cálculo de Adiantamentos · {mes}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{empresaNome} · adiantamento salarial pago em {br(dataAdiantamento)} (dia 20 ou o dia útil anterior). Percentual da aba "Adiant. e VT" da ficha sobre o salário do mês, ou o valor informado no movimento.</p>
                    </div>
                    <button className="text-slate-500" aria-label="Fechar" onClick={onFechar}>✕</button>
                </div>

                {!linhas.length ? <p className="rounded border border-dashed border-slate-300 p-6 text-center text-slate-500 dark:border-slate-600">Ninguém com adiantamento em {mes}: informe o percentual na ficha (aba "Adiant. e VT") ou o valor no movimento.</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-slate-500"><tr>
                                <th className="py-1">Funcionário</th><th className="py-1">%</th><th className="py-1 text-right">Adiantamento</th><th className="py-1 text-right">IRRF</th>
                                <th className="py-1 text-right">Arredond.</th><th className="py-1 text-right">A pagar</th><th className="py-1">Situação</th>
                            </tr></thead>
                            <tbody>{linhas.map(l => (
                                <tr key={l.fichaId} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="py-1">{l.nome}{l.matricula ? <span className="text-xs text-slate-500"> · {l.matricula}</span> : null}</td>
                                    <td className="py-1 text-xs">{l.informado ? 'informado' : l.percentual}</td>
                                    <td className="py-1 text-right">{reais(l.adiantamento)}</td>
                                    <td className="py-1 text-right" title={l.irrfCpf ? 'Somando os contratos do mesmo CPF' : undefined}>{l.irrf ? `${reais(l.irrf)}${l.irrfCpf ? ' (CPF)' : ''}` : '—'}</td>
                                    <td className="py-1 text-right">{l.arredondamento ? reais(l.arredondamento) : '—'}</td>
                                    <td className="py-1 text-right font-medium">{reais(l.aPagar)}</td>
                                    <td className={`py-1 text-xs ${l.situacao === 'ok' ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'}`}>{l.situacao}</td>
                                </tr>
                            ))}</tbody>
                            <tfoot className="border-t-2 border-slate-200 font-medium dark:border-slate-600"><tr>
                                <td className="py-1" colSpan={2}>Total ({linhas.length})</td>
                                <td className="py-1 text-right">{reais(soma('adiantamento'))}</td><td className="py-1 text-right">{reais(soma('irrf'))}</td>
                                <td className="py-1 text-right">{reais(soma('arredondamento'))}</td><td className="py-1 text-right">{reais(soma('aPagar'))}</td><td />
                            </tr></tfoot>
                        </table>
                    </div>
                )}

                <div className="space-y-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
                    <p><strong>Fixar o valor pago:</strong> grava o adiantamento de cada um como "Adiantamento pago" no movimento do mês. Depois disso, desligamento, afastamento ou reajuste lançados após o dia {br(dataAdiantamento).slice(0, 5)} não mudam o desconto na folha.{pendentes ? ` Há ${pendentes} funcionário(s) com movimento por salvar.` : ''}</p>
                    <div className="flex flex-wrap gap-2">
                        <button className={btn} disabled={!aFixar.length} onClick={() => onFixar(Object.fromEntries(aFixar.map(l => [l.fichaId, l.adiantamento])))}>Fixar os valores no movimento ({aFixar.length})</button>
                        <button className={btn} disabled={!linhas.some(l => l.aPagar > 0)} onClick={onRecibos}>Recibos (PDF)</button>
                        <button className={btn} disabled={!linhas.some(l => l.aPagar > 0) || !!bloqueio} title={bloqueio} onClick={onArquivo}>Arquivo bancário</button>
                        <button className={btn} disabled={!linhas.length} onClick={exportar}>Exportar Excel</button>
                    </div>
                    {bloqueio && <p className="text-amber-700 dark:text-amber-300">{bloqueio}</p>}
                </div>
            </div>
        </div>
    );
};

export default CalculoAdiantamentosModal;
