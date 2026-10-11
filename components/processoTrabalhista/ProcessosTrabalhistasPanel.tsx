// components/processoTrabalhista/ProcessosTrabalhistasPanel.tsx
//
// eSocial › Processos trabalhistas (S-2500 e S-2501) da empresa ativa. O DP cadastra o processo (judicial ou acordo em
// CCP/NINTER), o trabalhador com o período e as bases mês a mês do cálculo homologado, e cada pagamento com as
// contribuições por código de receita e o IRRF. Transmite pelo pré-voo e pela fila de sempre (CFI, A1 do cofre).

import React, { useEffect, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { centavosDeTexto, reais, UFS } from '../../services/cadastros/documentos';
import {
    CR_IRRF, gerarS2500, gerarS2501, mesesEntre, processoVazio, REPERCUSSOES, ROTULO_ORIGEM, TIPOS_CCP, totaisDoPagamento, validarPagamento, validarProcesso,
    type IrrfProcesso, type PagamentoProcesso, type PagamentoTrabalhador, type ProcessoTrabalhista, type TrabalhadorProcesso,
} from '../../services/processoTrabalhista/processoTrabalhista';
import { listarProcessos, salvarProcesso } from '../../services/processoTrabalhista/processosService';
import { verificarAntesDeEnviar, transmitirVerificado, mensagemDaTransmissao } from '../../services/esocial/envioSeguro';
import type { TpAmb } from '../../services/esocial/transmissao';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const btnP = 'rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40';
const hoje = () => new Date().toLocaleDateString('sv-SE');

/** Campo de valor em reais: guarda o texto enquanto digita e devolve centavos ao sair. */
const Valor: React.FC<{ rotulo: string; valor: number; onChange: (c: number) => void }> = ({ rotulo, valor, onChange }) => {
    const [t, setT] = useState(valor ? (valor / 100).toFixed(2).replace('.', ',') : '');
    useEffect(() => { setT(valor ? (valor / 100).toFixed(2).replace('.', ',') : ''); }, [valor]);
    return <input aria-label={rotulo} className={`${inp} w-28 text-right`} inputMode="decimal" value={t} onChange={e => setT(e.target.value)} onBlur={() => onChange(centavosDeTexto(t) ?? 0)} />;
};

const irrfVazio = (tpCR: string): IrrfProcesso => ({ tpCR, vrCR: 0, vrCR13: 0, rendTrib: 0, rendTrib13: 0, jurosMora: 0, isentoNTrib: 0, descIsento: '', prevOficial: 0, prevOficial13: 0 });

const ProcessosTrabalhistasPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [processos, setProcessos] = useState<ProcessoTrabalhista[]>([]);
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [p, setP] = useState<ProcessoTrabalhista | null>(null);
    const [tpAmb, setTpAmb] = useState<TpAmb>(2);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setP(null);
        Promise.all([listarProcessos(ativa.id), listarFuncionarios(ativa.id)])
            .then(([ps, fs]) => { if (vivo) { setProcessos(ps); setFichas(fs); } })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa]);

    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa.</p>;
    const empresa = { id: ativa.id, cnpj: ativa.cnpj.replace(/\D/g, '') };
    const muda = (x: Partial<ProcessoTrabalhista>) => setP(a => (a ? { ...a, ...x } : a));
    const mudaTrab = (i: number, x: Partial<TrabalhadorProcesso>) => setP(a => (a ? { ...a, trabalhadores: a.trabalhadores.map((t, j) => (j === i ? { ...t, ...x } : t)) } : a));
    const mudaPag = (i: number, x: Partial<PagamentoProcesso>) => setP(a => (a ? { ...a, pagamentos: a.pagamentos.map((g, j) => (j === i ? { ...g, ...x } : g)) } : a));
    const mudaPagTrab = (gi: number, ti: number, x: Partial<PagamentoTrabalhador>) => setP(a => (a ? {
        ...a, pagamentos: a.pagamentos.map((g, j) => (j === gi ? { ...g, trabalhadores: g.trabalhadores.map((t, k) => (k === ti ? { ...t, ...x } : t)) } : g)),
    } : a));
    const validacao = p ? validarProcesso(p, hoje()) : null;

    async function gravar() {
        if (!p || !validacao) return;
        if (validacao.erros.length) { setErro(validacao.erros.join(' ')); return; }
        setOcupado('Gravando o processo…'); setErro(''); setMsg('');
        try {
            await salvarProcesso(p, usuario);
            setProcessos(await listarProcessos(ativa!.id));
            setMsg('Processo gravado.');
        } catch (e) { setErro(mensagemErro(e)); } finally { setOcupado(''); }
    }

    async function transmitir(xml: string, ref: string, rotulo: string) {
        if (tpAmb === 1 && !window.confirm(`Transmitir o ${rotulo} em PRODUÇÃO? A entrega ao eSocial não se desfaz.`)) return;
        setOcupado(`Transmitindo o ${rotulo}…`); setErro(''); setMsg('');
        try {
            const pv = await verificarAntesDeEnviar({ empresa, eventos: [{ xml, ref }], tpAmb });
            if (!pv.ok) { setErro(`O pré-voo barrou: ${pv.achados.filter(a => a.nivel === 'bloqueio').map(a => a.mensagem).join(' · ')}`); return; }
            const m = mensagemDaTransmissao(await transmitirVerificado(pv, { empresa, certificado: 'escritorio', usuario }));
            (m.ok ? setMsg : setErro)(`${rotulo}: ${m.texto}`);
        } catch (e) { setErro(`${rotulo}: ${(e as Error).message}`); } finally { setOcupado(''); }
    }

    function enviarS2500(t: TrabalhadorProcesso) {
        if (!p || !validacao) return;
        if (validacao.erros.length) { setErro(validacao.erros.join(' ')); return; }
        try {
            const { xml } = gerarS2500({ cnpj: empresa.cnpj, tpAmb, processo: p, cpf: t.cpf, nrRecibo: t.reciboS2500 || undefined });
            void transmitir(xml, `proc:${p.nrProcTrab}:${t.cpf}`, t.reciboS2500 ? 'S-2500 (retificação)' : 'S-2500');
        } catch (e) { setErro((e as Error).message); }
    }

    function enviarS2501(g: PagamentoProcesso) {
        if (!p) return;
        const v = validarPagamento(p, g);
        if (v.erros.length) { setErro(v.erros.join(' ')); return; }
        try {
            const { xml } = gerarS2501({ cnpj: empresa.cnpj, tpAmb, processo: p, pagamento: g, nrRecibo: g.reciboS2501 || undefined });
            void transmitir(xml, `proc:${p.nrProcTrab}:${g.perApurPgto}`, g.reciboS2501 ? 'S-2501 (retificação)' : 'S-2501');
        } catch (e) { setErro((e as Error).message); }
    }

    function incluirFicha(fichaId: string) {
        const f = fichas.find(x => x.id === fichaId);
        if (!f || !p || p.trabalhadores.some(t => t.cpf === f.cpf)) return;
        muda({ trabalhadores: [...p.trabalhadores, { fichaId: f.id, cpf: f.cpf, nome: f.dados.nome ?? f.cpf, matricula: f.matriculaEsocial, compIni: '', compFim: '', indReperc: '1', periodos: [] }] });
    }

    return (
        <div className="space-y-4 text-sm dark:text-slate-100">
            <div>
                <h2 className="text-lg font-semibold">Processos trabalhistas (S-2500 e S-2501)</h2>
                <p className="text-slate-600 dark:text-slate-300">
                    Decisões e acordos da Justiça do Trabalho e das CCP/NINTER vão pelo eSocial: o S-2500 leva o processo e as bases mês a mês; o S-2501, os tributos de cada pagamento
                    (até o dia 15 do mês seguinte). Os valores vêm do cálculo homologado. Nesta versão: trabalhador com vínculo no eSocial, sem mudança de datas, categoria ou motivo do desligamento.
                </p>
            </div>
            {ocupado && <p className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}

            {!p && (
                <section className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                    <div className="flex items-center justify-between"><p className="font-medium">Processos da empresa</p><button className={btnP} onClick={() => { setErro(''); setMsg(''); setP(processoVazio(ativa.id)); }}>+ Novo processo</button></div>
                    {!processos.length && <p className="text-slate-500">Nenhum processo cadastrado.</p>}
                    {processos.map(x => (
                        <button key={x.nrProcTrab} className="block w-full rounded border border-slate-100 p-2 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => { setErro(''); setMsg(''); setP(x); }}>
                            <span className="font-mono">{x.nrProcTrab}</span> · {ROTULO_ORIGEM[x.origem]} · {x.trabalhadores.map(t => t.nome).join(', ') || 'sem trabalhador'} · {x.pagamentos.length} pagamento(s)
                        </button>
                    ))}
                </section>
            )}

            {p && validacao && (
                <>
                    <section className="space-y-2 rounded border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex flex-wrap items-end gap-3">
                            <label>Origem<select aria-label="Origem" className={`block ${inp}`} value={p.origem} onChange={e => muda({ origem: e.target.value as '1' | '2' })}>{Object.entries(ROTULO_ORIGEM).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
                            <label>{p.origem === '1' ? 'Número do processo (CNJ, 20 dígitos)' : 'Número da ata/conciliação'}<input aria-label="Número do processo" className={`block w-64 font-mono ${inp}`} value={p.nrProcTrab} onChange={e => muda({ nrProcTrab: e.target.value.replace(/[^\d.-]/g, '') })} /></label>
                            {p.origem === '1' ? (
                                <>
                                    <label>Data da decisão<input aria-label="Data da decisão" type="date" className={`block ${inp}`} value={p.dtSent} onChange={e => muda({ dtSent: e.target.value })} /></label>
                                    <label>UF da Vara<select aria-label="UF da Vara" className={`block ${inp}`} value={p.ufVara} onChange={e => muda({ ufVara: e.target.value })}><option value="">—</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}</select></label>
                                    <label>Município (IBGE)<input aria-label="Município da Vara" className={`block w-24 ${inp}`} value={p.codMunic} onChange={e => muda({ codMunic: e.target.value.replace(/\D/g, '').slice(0, 7) })} /></label>
                                    <label>Vara<input aria-label="Vara" className={`block w-16 ${inp}`} value={p.idVara} onChange={e => muda({ idVara: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
                                </>
                            ) : (
                                <>
                                    <label>Data do acordo<input aria-label="Data do acordo" type="date" className={`block ${inp}`} value={p.dtCCP} onChange={e => muda({ dtCCP: e.target.value })} /></label>
                                    <label>Âmbito<select aria-label="Âmbito do acordo" className={`block ${inp}`} value={p.tpCCP} onChange={e => muda({ tpCCP: e.target.value })}><option value="">—</option>{Object.entries(TIPOS_CCP).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
                                    <label>CNPJ do sindicato<input aria-label="CNPJ do sindicato" className={`block w-40 ${inp}`} value={p.cnpjCCP} onChange={e => muda({ cnpjCCP: e.target.value })} /></label>
                                </>
                            )}
                        </div>
                        <label className="block">Observação<input aria-label="Observação do processo" className={`block w-full ${inp}`} value={p.obs} onChange={e => muda({ obs: e.target.value })} /></label>
                    </section>

                    <section className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex flex-wrap items-center gap-2"><p className="font-medium">Trabalhadores (S-2500)</p>
                            <select aria-label="Incluir funcionário" className={inp} value="" onChange={e => incluirFicha(e.target.value)}>
                                <option value="">+ Incluir funcionário…</option>
                                {fichas.filter(f => !p.trabalhadores.some(t => t.cpf === f.cpf)).map(f => <option key={f.id} value={f.id}>{f.dados.nome ?? f.cpf}{f.situacao === 'desligado' ? ' (desligado)' : ''}</option>)}
                            </select>
                        </div>
                        {p.trabalhadores.map((t, i) => (
                            <div key={t.cpf} className="space-y-2 rounded bg-slate-50 p-2 dark:bg-slate-800">
                                <div className="flex flex-wrap items-end gap-3">
                                    <span className="font-medium">{t.nome} · CPF {t.cpf} · matrícula {t.matricula || '—'}</span>
                                    <label>De<input aria-label={`Competência inicial de ${t.nome}`} type="month" className={`block ${inp}`} value={t.compIni} onChange={e => mudaTrab(i, { compIni: e.target.value })} /></label>
                                    <label>Até<input aria-label={`Competência final de ${t.nome}`} type="month" className={`block ${inp}`} value={t.compFim} onChange={e => mudaTrab(i, { compFim: e.target.value })} /></label>
                                    <label>Repercussão<select aria-label={`Repercussão de ${t.nome}`} className={`block ${inp}`} value={t.indReperc} onChange={e => mudaTrab(i, { indReperc: e.target.value as TrabalhadorProcesso['indReperc'] })}>{Object.entries(REPERCUSSOES).map(([k, r]) => <option key={k} value={k}>{r}</option>)}</select></label>
                                    {t.indReperc === '1' && <button className={btn} onClick={() => mudaTrab(i, { periodos: mesesEntre(t.compIni, t.compFim).map(m => t.periodos.find(x => x.perRef === m) ?? { perRef: m, bcCpMensal: 0, bcCp13: 0, bcFgts: 0 }) })}>Montar os meses</button>}
                                    <label>Recibo do S-2500 (para retificar)<input aria-label={`Recibo do S-2500 de ${t.nome}`} className={`block w-48 ${inp}`} value={t.reciboS2500 ?? ''} onChange={e => mudaTrab(i, { reciboS2500: e.target.value.trim() })} /></label>
                                    <button className={btnP} disabled={!!ocupado} onClick={() => enviarS2500(t)}>Transmitir S-2500</button>
                                </div>
                                {t.indReperc === '1' && t.periodos.length > 0 && (
                                    <table className="text-xs"><thead className="text-left text-slate-500"><tr><th className="p-1">Mês</th><th className="p-1">Base INSS</th><th className="p-1">Base INSS 13º</th><th className="p-1">Base FGTS</th></tr></thead>
                                        <tbody>{t.periodos.map((x, k) => (
                                            <tr key={x.perRef}><td className="p-1 font-mono">{x.perRef}</td>
                                                {(['bcCpMensal', 'bcCp13', 'bcFgts'] as const).map(c => <td key={c} className="p-1"><Valor rotulo={`${c} ${x.perRef} de ${t.nome}`} valor={x[c]} onChange={val => mudaTrab(i, { periodos: t.periodos.map((y, z) => (z === k ? { ...y, [c]: val } : y)) })} /></td>)}
                                            </tr>
                                        ))}</tbody>
                                    </table>
                                )}
                            </div>
                        ))}
                    </section>

                    <section className="space-y-3 rounded border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex items-center gap-2"><p className="font-medium">Pagamentos (S-2501)</p>
                            <button className={btn} disabled={!p.trabalhadores.length} onClick={() => muda({ pagamentos: [...p.pagamentos, { perApurPgto: ativa.competencia, ideSeqProc: '', obs: '', trabalhadores: p.trabalhadores.filter(t => t.indReperc !== '2').map(t => ({ cpf: t.cpf, contribuicoes: [], irrf: [] })) }] })}>+ Pagamento</button>
                        </div>
                        {p.pagamentos.map((g, gi) => {
                            const tot = totaisDoPagamento(g);
                            return (
                                <div key={gi} className="space-y-2 rounded bg-slate-50 p-2 dark:bg-slate-800">
                                    <div className="flex flex-wrap items-end gap-3">
                                        <label>Mês do pagamento<input aria-label="Mês do pagamento" type="month" className={`block ${inp}`} value={g.perApurPgto} onChange={e => mudaPag(gi, { perApurPgto: e.target.value })} /></label>
                                        <label>Sequencial (parcelas no mesmo mês)<input aria-label="Sequencial do pagamento" className={`block w-16 ${inp}`} value={g.ideSeqProc} onChange={e => mudaPag(gi, { ideSeqProc: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
                                        <label>Recibo do S-2501 (para retificar)<input aria-label="Recibo do S-2501" className={`block w-48 ${inp}`} value={g.reciboS2501 ?? ''} onChange={e => mudaPag(gi, { reciboS2501: e.target.value.trim() })} /></label>
                                        <span>Contribuições {reais(tot.contribuicoes)} · IRRF {reais(tot.irrf)}</span>
                                        <button className={btnP} disabled={!!ocupado} onClick={() => enviarS2501(g)}>Transmitir S-2501</button>
                                    </div>
                                    {g.trabalhadores.map((t, ti) => {
                                        const tp = p.trabalhadores.find(x => x.cpf === t.cpf);
                                        return (
                                            <div key={t.cpf} className="space-y-1 border-t border-slate-200 pt-2 dark:border-slate-700">
                                                <p className="font-medium">{tp?.nome ?? t.cpf}</p>
                                                {t.contribuicoes.map((c, ci) => (
                                                    <div key={ci} className="flex flex-wrap items-center gap-2">
                                                        <select aria-label="Mês da contribuição" className={inp} value={c.perRef} onChange={e => mudaPagTrab(gi, ti, { contribuicoes: t.contribuicoes.map((y, z) => (z === ci ? { ...y, perRef: e.target.value } : y)) })}>
                                                            <option value="">—</option>{tp?.periodos.map(x => <option key={x.perRef} value={x.perRef}>{x.perRef}</option>)}
                                                        </select>
                                                        <input aria-label="Código de receita da contribuição" placeholder="Código (Tabela 29)" className={`w-36 font-mono ${inp}`} value={c.tpCR} onChange={e => mudaPagTrab(gi, ti, { contribuicoes: t.contribuicoes.map((y, z) => (z === ci ? { ...y, tpCR: e.target.value.replace(/\D/g, '').slice(0, 6) } : y)) })} />
                                                        <Valor rotulo="Valor da contribuição" valor={c.valor} onChange={val => mudaPagTrab(gi, ti, { contribuicoes: t.contribuicoes.map((y, z) => (z === ci ? { ...y, valor: val } : y)) })} />
                                                        <button className={btn} onClick={() => mudaPagTrab(gi, ti, { contribuicoes: t.contribuicoes.filter((_, z) => z !== ci) })}>Tirar</button>
                                                    </div>
                                                ))}
                                                <button className={btn} onClick={() => mudaPagTrab(gi, ti, { contribuicoes: [...t.contribuicoes, { perRef: tp?.periodos[0]?.perRef ?? '', tpCR: '', valor: 0 }] })}>+ Contribuição</button>
                                                {t.irrf.map((r, ri) => {
                                                    const set = (x: Partial<IrrfProcesso>) => mudaPagTrab(gi, ti, { irrf: t.irrf.map((y, z) => (z === ri ? { ...y, ...x } : y)) });
                                                    return (
                                                        <div key={ri} className="flex flex-wrap items-end gap-2">
                                                            <label>IRRF<select aria-label="Código do IRRF" className={`block ${inp}`} value={r.tpCR} onChange={e => set({ tpCR: e.target.value, rra: e.target.value === '188951' ? r.rra ?? { descRRA: '', qtdMeses: 0, custas: 0, advogados: 0 } : undefined })}>{Object.entries(CR_IRRF).map(([k, x]) => <option key={k} value={k}>{k} · {x}</option>)}</select></label>
                                                            <label>IR retido<Valor rotulo="IR retido" valor={r.vrCR} onChange={v => set({ vrCR: v })} /></label>
                                                            <label>Rendimento tributável<Valor rotulo="Rendimento tributável" valor={r.rendTrib} onChange={v => set({ rendTrib: v })} /></label>
                                                            {r.tpCR !== '188951' && <label>IR do 13º<Valor rotulo="IR do 13º" valor={r.vrCR13} onChange={v => set({ vrCR13: v })} /></label>}
                                                            {r.tpCR !== '188951' && <label>Tributável 13º<Valor rotulo="Rendimento tributável do 13º" valor={r.rendTrib13} onChange={v => set({ rendTrib13: v })} /></label>}
                                                            <label>Juros de mora<Valor rotulo="Juros de mora" valor={r.jurosMora} onChange={v => set({ jurosMora: v })} /></label>
                                                            <label>INSS deduzido<Valor rotulo="Previdência oficial" valor={r.prevOficial} onChange={v => set({ prevOficial: v })} /></label>
                                                            <label>Isento/não tributável<Valor rotulo="Rendimento isento" valor={r.isentoNTrib} onChange={v => set({ isentoNTrib: v })} /></label>
                                                            {r.isentoNTrib > 0 && <label>Qual<input aria-label="Descrição do isento" className={`block w-40 ${inp}`} value={r.descIsento} onChange={e => set({ descIsento: e.target.value })} /></label>}
                                                            {r.rra && (
                                                                <>
                                                                    <label>Descrição do RRA<input aria-label="Descrição do RRA" className={`block w-48 ${inp}`} value={r.rra.descRRA} onChange={e => set({ rra: { ...r.rra!, descRRA: e.target.value } })} /></label>
                                                                    <label>Meses<input aria-label="Meses do RRA" className={`block w-16 ${inp}`} inputMode="decimal" value={r.rra.qtdMeses || ''} onChange={e => set({ rra: { ...r.rra!, qtdMeses: Number(e.target.value.replace(',', '.')) || 0 } })} /></label>
                                                                    <label>Custas<Valor rotulo="Custas judiciais" valor={r.rra.custas} onChange={v => set({ rra: { ...r.rra!, custas: v } })} /></label>
                                                                    <label>Advogados<Valor rotulo="Despesas com advogados" valor={r.rra.advogados} onChange={v => set({ rra: { ...r.rra!, advogados: v } })} /></label>
                                                                </>
                                                            )}
                                                            <button className={btn} onClick={() => mudaPagTrab(gi, ti, { irrf: t.irrf.filter((_, z) => z !== ri) })}>Tirar</button>
                                                        </div>
                                                    );
                                                })}
                                                <button className={btn} onClick={() => mudaPagTrab(gi, ti, { irrf: [...t.irrf, irrfVazio(p.origem === '1' ? '593656' : '056152')] })}>+ IRRF</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                        <p className="text-xs text-slate-500">Códigos de receita das contribuições: os da Tabela 29 vigente, como na guia (6 dígitos). O IRRF de RRA (188951) vale para rendimentos de anos anteriores ao do pagamento.</p>
                    </section>

                    {(validacao.erros.length > 0 || validacao.avisos.length > 0) && (
                        <ul className="list-disc space-y-0.5 pl-5 text-xs">
                            {validacao.erros.map(e => <li key={e} className="text-red-700 dark:text-red-300">{e}</li>)}
                            {validacao.avisos.map(e => <li key={e} className="text-amber-700 dark:text-amber-300">{e}</li>)}
                        </ul>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <button className={btnP} disabled={!!ocupado} onClick={gravar}>Gravar o processo</button>
                        <button className={btn} onClick={() => setP(null)}>Voltar à lista</button>
                        <select aria-label="Ambiente do eSocial" className={inp} value={tpAmb} onChange={e => setTpAmb(Number(e.target.value) as TpAmb)}><option value={2}>Produção restrita</option><option value={1}>Produção</option></select>
                    </div>
                </>
            )}
        </div>
    );
};

export default ProcessosTrabalhistasPanel;
