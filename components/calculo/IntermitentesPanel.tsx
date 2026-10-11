// components/calculo/IntermitentesPanel.tsx
//
// Folha do mês › Trabalho intermitente: as convocações de cada empregado intermitente (categoria 111) da empresa ativa.
// A convocação aceita entra na folha do mês pelos dias trabalhados (Cálculo mensal), com as parcelas do art. 452-A, § 6º.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarAfastamentos, listarFuncionarios, listarTabelas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { tabelaVigente, type TabelaLegal } from '../../services/cadastros/tabelasLegais';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import {
    convocacaoVazia, diasDoPeriodo, ehIntermitente, fimDe, horasDe, inicioDe, periodosDeFerias, ROTULO_RESPOSTA, validarConvocacao, valorHoraDaFicha,
    type Convocacao, type RespostaConvocacao,
} from '../../services/calculo/intermitente';
import { excluirConvocacao, listarConvocacoes, novoIdConvocacao, salvarConvocacao } from '../../services/calculo/convocacoesService';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const btnP = 'rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40';
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '—');
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const hoje = () => new Date().toLocaleDateString('sv-SE');

/** Texto da convocação para enviar ao empregado (art. 452-A, §§ 1º e 2º). */
export function textoDaConvocacao(c: Convocacao, f: FichaFuncionario, empresa: string, valorHora: number): string {
    const dias = [...c.dias].sort((a, b) => a.data.localeCompare(b.data)).map(d => `${br(d.data)} (${d.horas.toLocaleString('pt-BR')} h)`).join(', ');
    return `CONVOCAÇÃO PARA TRABALHO INTERMITENTE\n\n${empresa} convoca ${f.dados.nome ?? ''} (CPF ${f.cpf}) para prestar serviços`
        + `${c.funcao ? ` de ${c.funcao}` : ''}${c.local ? ` em ${c.local}` : ''}, nos dias ${dias}, total de ${horasDe(c).toLocaleString('pt-BR')} horas, `
        + `com remuneração de ${reais(valorHora)} por hora, mais DSR, férias proporcionais com 1/3, 13º proporcional e adicionais legais, pagos ao fim do período (CLT, art. 452-A, § 6º).\n\n`
        + 'Responda em até 1 (um) dia útil. Sem resposta, a convocação é considerada recusada; a recusa não descaracteriza o contrato (CLT, art. 452-A, §§ 2º e 3º).\n\n'
        + `Data da convocação: ${br(c.enviadaEm)}`;
}

const IntermitentesPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [convs, setConvs] = useState<Convocacao[]>([]);
    const [afast, setAfast] = useState<Afastamento[]>([]);
    const [tabelas, setTabelas] = useState<TabelaLegal[]>([]);
    const [fichaId, setFichaId] = useState('');
    const [c, setC] = useState<Convocacao | null>(null);
    const [periodo, setPeriodo] = useState({ inicio: '', fim: '', semana: [1, 2, 3, 4, 5], horas: '8' });
    const [valorTxt, setValorTxt] = useState('');
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setC(null); setFichaId('');
        Promise.all([listarFuncionarios(ativa.id), listarConvocacoes(ativa.id), listarAfastamentos(ativa.id), listarTabelas()])
            .then(([fs, cs, as, ts]) => { if (vivo) { setFichas(fs.filter(ehIntermitente)); setConvs(cs); setAfast(as); setTabelas(ts); } })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa]);

    const ficha = fichas.find(f => f.id === fichaId) ?? null;
    const doEmpregado = useMemo(() => convs.filter(x => x.fichaId === fichaId).sort((a, b) => inicioDe(b).localeCompare(inicioDe(a))), [convs, fichaId]);
    const ferias = useMemo(() => afast.filter(a => a.fichaId === fichaId && a.motivo === '15').map(a => ({ inicio: a.dtInicio, fim: a.dtFim })), [afast, fichaId]);
    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa.</p>;

    const competencia = (c && inicioDe(c).slice(0, 7)) || ativa.competencia;
    const sm = tabelaVigente(tabelas, 'salario_minimo', competencia);
    const valorHoraMinimo = 'erro' in sm ? undefined : Math.round((sm.tabela.valores.salarioMinimo ?? 0) / 220) || undefined;
    const valorHoraFicha = ficha ? valorHoraDaFicha(ficha.dados) : 0;
    const v = c && ficha ? validarConvocacao(c, ficha, { outras: doEmpregado, feriasGozo: ferias, valorHoraMinimo, valorHoraFicha }) : null;
    const muda = (x: Partial<Convocacao>) => setC(a => (a ? { ...a, ...x } : a));

    function nova() {
        if (!ficha) return;
        setErro(''); setMsg(''); setValorTxt('');
        setC({ ...convocacaoVazia(ativa!.id, ficha.id, novoIdConvocacao(ficha.id)), enviadaEm: hoje() });
    }
    function abrir(x: Convocacao) { setErro(''); setMsg(''); setC(x); setValorTxt(x.valorHora ? (x.valorHora / 100).toFixed(2).replace('.', ',') : ''); }
    async function gravar() {
        if (!c || !v) return;
        if (v.erros.length) { setErro(v.erros.join(' ')); return; }
        setOcupado(true); setErro('');
        try {
            await salvarConvocacao(c, usuario);
            setConvs(await listarConvocacoes(ativa!.id));
            setMsg('Convocação gravada.');
        } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
    }
    async function excluir() {
        if (!c || !window.confirm('Excluir esta convocação?')) return;
        setOcupado(true);
        try { await excluirConvocacao(c.id); setConvs(await listarConvocacoes(ativa!.id)); setC(null); setMsg('Convocação excluída.'); }
        catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(false); }
    }
    async function copiarTexto() {
        if (!c || !ficha) return;
        const texto = textoDaConvocacao(c, ficha, ativa!.nome, c.valorHora || valorHoraFicha);
        try { await navigator.clipboard.writeText(texto); setMsg('Texto da convocação copiado: envie ao empregado (e-mail ou WhatsApp) e guarde o aceite.'); }
        catch { setMsg(texto); }
    }

    const aquisitivos = ficha?.dados.admissao ? periodosDeFerias(ficha.dados.admissao, hoje()) : [];
    return (
        <div className="space-y-4 text-sm dark:text-slate-100">
            <div>
                <h2 className="text-lg font-semibold">Trabalho intermitente</h2>
                <p className="text-slate-600 dark:text-slate-300">
                    Convocações dos empregados intermitentes (categoria 111). Convoque com pelo menos 3 dias corridos de antecedência; o empregado tem 1 dia útil para responder.
                    A convocação aceita entra no Cálculo mensal pelos dias trabalhados, com DSR, férias proporcionais com 1/3, 13º proporcional e adicionais (CLT, art. 452-A).
                </p>
            </div>
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="whitespace-pre-wrap rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}

            <div className="flex flex-wrap items-end gap-3">
                <label>Empregado<select aria-label="Empregado intermitente" className={`block ${inp}`} value={fichaId} onChange={e => { setFichaId(e.target.value); setC(null); }}>
                    <option value="">{fichas.length ? 'Escolha…' : 'Nenhum intermitente (categoria 111) na empresa'}</option>
                    {fichas.map(f => <option key={f.id} value={f.id}>{f.dados.nome ?? f.cpf}{f.situacao === 'desligado' ? ' (desligado)' : ''}</option>)}
                </select></label>
                {ficha && <span>Valor da hora na ficha: <strong>{valorHoraFicha ? reais(valorHoraFicha) : '—'}</strong></span>}
                {ficha && <button className={btnP} onClick={nova}>+ Nova convocação</button>}
            </div>

            {ficha && aquisitivos.length > 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-300">
                    Férias (§ 9º): {aquisitivos.map(a => `aquisitivo ${br(a.aquisitivo[0])} a ${br(a.aquisitivo[1])}, 1 mês sem convocação até ${br(a.concederAte)}`).join('; ')}.
                    Lance o gozo em Cadastros › Afastamentos (férias): convocação nesse mês é recusada.
                </p>
            )}

            {ficha && !c && (
                <table className="w-full text-left text-xs">
                    <thead className="text-slate-500"><tr><th className="p-1">Período</th><th className="p-1">Dias</th><th className="p-1">Horas</th><th className="p-1">Função</th><th className="p-1">Enviada</th><th className="p-1">Resposta</th></tr></thead>
                    <tbody>
                        {!doEmpregado.length && <tr><td colSpan={6} className="p-1 text-slate-500">Nenhuma convocação.</td></tr>}
                        {doEmpregado.map(x => (
                            <tr key={x.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => abrir(x)}>
                                <td className="p-1">{br(inicioDe(x))} a {br(fimDe(x))}</td><td className="p-1">{x.dias.length}</td><td className="p-1">{horasDe(x).toLocaleString('pt-BR')}</td>
                                <td className="p-1">{x.funcao || '—'}</td><td className="p-1">{br(x.enviadaEm)}</td><td className="p-1">{ROTULO_RESPOSTA[x.resposta]}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {ficha && c && v && (
                <section className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-end gap-3">
                        <label>Enviada em<input aria-label="Enviada em" type="date" className={`block ${inp}`} value={c.enviadaEm} onChange={e => muda({ enviadaEm: e.target.value })} /></label>
                        <label>Função<input aria-label="Função" className={`block w-40 ${inp}`} value={c.funcao} onChange={e => muda({ funcao: e.target.value })} /></label>
                        <label>Local<input aria-label="Local" className={`block w-48 ${inp}`} value={c.local} onChange={e => muda({ local: e.target.value })} /></label>
                        <label>Valor da hora (vazio = ficha)<input aria-label="Valor da hora" inputMode="decimal" className={`block w-28 text-right ${inp}`} value={valorTxt}
                            onChange={e => setValorTxt(e.target.value)} onBlur={() => muda({ valorHora: centavosDeTexto(valorTxt) ?? 0 })} /></label>
                    </div>
                    <div className="flex flex-wrap items-end gap-3 rounded bg-slate-50 p-2 dark:bg-slate-800">
                        <label>De<input aria-label="Início do período" type="date" className={`block ${inp}`} value={periodo.inicio} onChange={e => setPeriodo({ ...periodo, inicio: e.target.value })} /></label>
                        <label>Até<input aria-label="Fim do período" type="date" className={`block ${inp}`} value={periodo.fim} onChange={e => setPeriodo({ ...periodo, fim: e.target.value })} /></label>
                        <span className="flex gap-1">{SEMANA.map((s, i) => (
                            <label key={s} className="flex items-center gap-0.5 text-xs"><input type="checkbox" aria-label={s} checked={periodo.semana.includes(i)}
                                onChange={e => setPeriodo({ ...periodo, semana: e.target.checked ? [...periodo.semana, i] : periodo.semana.filter(x => x !== i) })} />{s}</label>
                        ))}</span>
                        <label>Horas por dia<input aria-label="Horas por dia" inputMode="decimal" className={`block w-16 ${inp}`} value={periodo.horas} onChange={e => setPeriodo({ ...periodo, horas: e.target.value })} /></label>
                        <button className={btn} onClick={() => {
                            const novos = diasDoPeriodo(periodo.inicio, periodo.fim, periodo.semana, Number(periodo.horas.replace(',', '.')) || 0);
                            const fora = c.dias.filter(d => !novos.some(n => n.data === d.data));
                            muda({ dias: [...fora, ...novos].sort((a, b) => a.data.localeCompare(b.data)) });
                        }}>Incluir os dias</button>
                    </div>
                    {c.dias.length > 0 && (
                        <table className="text-xs"><thead className="text-left text-slate-500"><tr><th className="p-1">Dia</th><th className="p-1">Horas</th><th /></tr></thead>
                            <tbody>{c.dias.map((d, i) => (
                                <tr key={d.data}><td className="p-1 font-mono">{br(d.data)} {SEMANA[new Date(`${d.data}T12:00:00Z`).getUTCDay()]}</td>
                                    <td className="p-1"><input aria-label={`Horas de ${br(d.data)}`} inputMode="decimal" className={`w-16 ${inp}`} defaultValue={String(d.horas).replace('.', ',')}
                                        onBlur={e => muda({ dias: c.dias.map((y, j) => (j === i ? { ...y, horas: Number(e.target.value.replace(',', '.')) || 0 } : y)) })} /></td>
                                    <td className="p-1"><button className="text-xs text-red-700" onClick={() => muda({ dias: c.dias.filter((_, j) => j !== i) })}>Tirar</button></td></tr>
                            ))}</tbody>
                        </table>
                    )}
                    <p className="text-xs text-slate-500">Depois do serviço, acerte aqui as horas efetivamente trabalhadas: é o que vai para a folha.</p>
                    <div className="flex flex-wrap items-end gap-3">
                        <label>Resposta<select aria-label="Resposta" className={`block ${inp}`} value={c.resposta} onChange={e => muda({ resposta: e.target.value as RespostaConvocacao })}>
                            {Object.entries(ROTULO_RESPOSTA).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
                        </select></label>
                        {c.resposta !== 'pendente' && <label>Respondida em<input aria-label="Respondida em" type="date" className={`block ${inp}`} value={c.respondidaEm} onChange={e => muda({ respondidaEm: e.target.value })} /></label>}
                        <label className="grow">Observação<input aria-label="Observação" className={`block w-full ${inp}`} value={c.obs} onChange={e => muda({ obs: e.target.value })} /></label>
                    </div>
                    <p>Total: {horasDe(c).toLocaleString('pt-BR')} h × {reais(c.valorHora || valorHoraFicha)} = <strong>{reais(Math.round(horasDe(c) * (c.valorHora || valorHoraFicha)))}</strong> (sem DSR, férias, 13º e adicionais)</p>
                    {(v.erros.length > 0 || v.avisos.length > 0) && (
                        <ul className="list-disc space-y-0.5 pl-5 text-xs">
                            {v.erros.map(e => <li key={e} className="text-red-700 dark:text-red-300">{e}</li>)}
                            {v.avisos.map(e => <li key={e} className="text-amber-700 dark:text-amber-300">{e}</li>)}
                        </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button className={btnP} disabled={ocupado} onClick={gravar}>Gravar a convocação</button>
                        <button className={btn} disabled={!c.dias.length} onClick={copiarTexto}>Copiar o texto da convocação</button>
                        <button className={btn} onClick={() => setC(null)}>Voltar</button>
                        {convs.some(x => x.id === c.id) && <button className={`${btn} text-red-700`} disabled={ocupado} onClick={excluir}>Excluir</button>}
                    </div>
                </section>
            )}
        </div>
    );
};

export default IntermitentesPanel;
