// components/iobSage/RestaurarEmpresaNoConsultor.tsx
//
// Dentro da tela "Restaurar backup do IOB SAGE": escolhe a empresa do backup
// (schema fNNNN, ligada pelo código SAGE), confere os parâmetros e restaura
// tudo no Consultor numa sequência só (eSocial, fichas, enquadramento,
// afastamentos e férias, histórico da folha). Mostra o resumo de cada etapa
// antes de gravar. Os parâmetros acertados na empresa piloto ficam salvos.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { Restauracao } from '../../services/iobSage/restauracao';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { empresasDoBackup, planejarRestauracao, type Existentes, type ParametrosRestauracao, type PlanoRestauracao } from '../../services/iobSage/restaurarEmpresa';
import { CAMPOS_HISTORICO, type ClasseManual, type EventoResumo } from '../../services/calculo/movimentosDoBackup';
import { ROTULO_MOVIMENTO } from '../../services/calculo/movimento';
import { carregarExistentes, gravarRestauracao, lerParametros, salvarParametros } from '../../services/iobSage/restaurarEmpresaService';

interface Props { restauracao: Restauracao; arquivos: string[]; usuario?: Usuario; podeRestaurar: boolean }

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const botao = 'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40';

const RestaurarEmpresaNoConsultor: React.FC<Props> = ({ restauracao, arquivos, usuario, podeRestaurar }) => {
    const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
    const [codigo, setCodigo] = useState('');
    const [param, setParam] = useState<ParametrosRestauracao>(lerParametros);
    // Texto do campo como digitado ("5,8", "0,0"): converter a cada tecla perderia a vírgula.
    const [terceirosTxt, setTerceirosTxt] = useState(() => (param.terceiros ? String(param.terceiros).replace('.', ',') : ''));
    const [plano, setPlano] = useState<{ empresa: Empresa; existentes: Existentes; plano: PlanoRestauracao } | null>(null);
    // Eventos do último preparo: a tabela continua aberta enquanto a equipe acerta vários eventos.
    const [eventos, setEventos] = useState<EventoResumo[]>([]);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [feito, setFeito] = useState('');

    // Cada preparo tem um número: resultado de um preparo antigo (outro backup, empresa ou parâmetro) é descartado.
    const pedido = useRef(0);
    const descartarPlano = () => { pedido.current++; setPlano(null); };

    useEffect(() => { listarEmpresasVisiveis().then(setEmpresas).catch(e => { setErro(mensagemErro(e)); setEmpresas([]); }); }, []);
    // Outro backup aberto: o plano do anterior não vale mais.
    useEffect(() => { descartarPlano(); setEventos([]); setFeito(''); setOcupado(''); }, [restauracao, arquivos.join('|')]);
    const doBackup = useMemo(() => (empresas ? empresasDoBackup(restauracao, empresas) : []), [restauracao, empresas]);
    const escolhida = doBackup.find(x => x.codigo === codigo);
    const mudar = (p: Partial<ParametrosRestauracao>) => { setParam(x => ({ ...x, ...p })); descartarPlano(); };
    // "" = automático (tira o acerto); o plano é refeito em "Preparar".
    const classificar = (codeven: string, valor: ClasseManual | '') => {
        const eventos = { ...param.eventos };
        if (valor) eventos[codeven] = valor; else delete eventos[codeven];
        mudar({ eventos });
    };

    async function preparar() {
        if (!escolhida?.empresa) return;
        const meu = ++pedido.current;
        const atual = () => meu === pedido.current;
        setErro(''); setFeito(''); setPlano(null);
        try {
            salvarParametros(param);
            setOcupado('Lendo o que já está gravado no Consultor…');
            const existentes = await carregarExistentes(escolhida.empresa.id);
            const p = await planejarRestauracao(restauracao, escolhida.empresa, existentes, param, m => { if (atual()) setOcupado(m); });
            if (atual()) { setPlano({ empresa: escolhida.empresa, existentes, plano: p }); setEventos(p.eventosHistorico); }
        } catch (e) { if (atual()) setErro((e as Error).message); }
        finally { if (atual()) setOcupado(''); }
    }

    async function gravar() {
        if (!plano || !usuario) return;
        const { plano: p, empresa } = plano;
        if (!window.confirm(`Restaurar ${empresa.nomeFantasia || empresa.razaoSocial} no Consultor?\n\n${p.fichas.length} ficha(s), ${p.enquadramentos.length} enquadramento(s), ${p.afastamentos.length} afastamento(s)/férias, ${p.movimentos.length} mês(es) de histórico.`)) return;
        setErro('');
        try {
            await gravarRestauracao(p, empresa, plano.existentes, usuario, arquivos, setOcupado);
            setFeito(`${empresa.nomeFantasia || empresa.razaoSocial} restaurada: ${p.fichas.length} ficha(s), ${p.enquadramentos.length} enquadramento(s), ${p.afastamentos.length} afastamento(s)/férias e ${p.movimentos.length} mês(es) de histórico gravados.`);
            setPlano(null);
        } catch (e) { setErro(mensagemErro(e)); }
        finally { setOcupado(''); }
    }

    const total = plano ? plano.plano.fichas.length + plano.plano.enquadramentos.length + plano.plano.afastamentos.length + plano.plano.movimentos.length : 0;
    return (
        <section aria-label="Restaurar empresa no Consultor" className="space-y-3 rounded-lg border-2 border-blue-300 p-3 dark:border-blue-800">
            <div>
                <h4 className="font-semibold text-slate-800 dark:text-white">Restaurar a empresa no Consultor</h4>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                    Traz do backup, numa sequência só: vínculos pelo eSocial transmitido, fichas (func e complementares), enquadramento, afastamentos e férias, e o histórico da folha (horas extras e faltas).
                    Só completa o que falta: o que já está no Consultor (inclusive o digitado à mão) é mantido. Acerte os parâmetros na empresa piloto; eles ficam salvos para as próximas.
                </p>
            </div>
            {!podeRestaurar && <p className="text-xs text-amber-700 dark:text-amber-300">Só o gestor restaura empresas.</p>}
            <div className="flex flex-wrap items-end gap-3 text-sm dark:text-slate-100">
                <label>Empresa do backup
                    <select aria-label="Empresa do backup" className={`ml-2 ${inp}`} value={codigo} onChange={e => { setCodigo(e.target.value); descartarPlano(); setEventos([]); setFeito(''); setOcupado(''); }}>
                        <option value="">— escolha —</option>
                        {doBackup.map(x => <option key={x.grupo} value={x.codigo} disabled={!x.empresa}>{x.codigo} · {x.empresa ? x.empresa.nomeFantasia || x.empresa.razaoSocial : 'sem empresa no Consultor (cadastre com este código SAGE)'}</option>)}
                    </select>
                </label>
            </div>
            <fieldset className="grid gap-2 rounded border border-slate-200 p-2 text-xs sm:grid-cols-3 dark:border-slate-700 dark:text-slate-200">
                <legend className="px-1 font-medium">Parâmetros (salvos para as próximas empresas)</legend>
                <label>Histórico da folha a partir de<input aria-label="Histórico a partir de" type="month" className={`block ${inp}`} value={param.historicoDesde} onChange={e => mudar({ historicoDesde: e.target.value })} /></label>
                <label>FAP a partir de<input aria-label="FAP a partir de" type="month" className={`block ${inp}`} value={param.fapDesde} onChange={e => mudar({ fapDesde: e.target.value })} /></label>
                <label className="flex items-center gap-1 self-end"><input type="checkbox" checked={param.sexagesimal} onChange={e => mudar({ sexagesimal: e.target.checked })} />Horas no formato hh,mm</label>
                <label>FPAS padrão (sem FPAS no backup)<input aria-label="FPAS padrão" className={`block w-20 ${inp}`} value={param.fpas} onChange={e => mudar({ fpas: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
                <label>Código de terceiros<input aria-label="Código de terceiros" className={`block w-24 ${inp}`} value={param.codigoTerceiros} onChange={e => mudar({ codigoTerceiros: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
                <label>Terceiros (%)<input aria-label="Terceiros (%)" className={`block w-20 ${inp}`} inputMode="decimal" value={terceirosTxt} onChange={e => {
                    const t = e.target.value.replace('.', ',').replace(/[^\d,]/g, '').replace(/(,.*),/g, '$1').slice(0, 6);
                    setTerceirosTxt(t);
                    mudar({ terceiros: Number(t.replace(',', '.')) || 0 });
                }} /></label>
                <label className="flex items-center gap-1 sm:col-span-3"><input type="checkbox" checked={param.criarFichas} onChange={e => mudar({ criarFichas: e.target.checked })} />Criar ficha para quem está no IOB com CPF e matrícula do eSocial e ainda não tem ficha</label>
            </fieldset>
            <div className="flex flex-wrap gap-2">
                <button className={botao} disabled={!podeRestaurar || !escolhida?.empresa || !!ocupado} onClick={preparar}>Preparar a restauração</button>
                {plano && <button className="rounded bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40" disabled={!total || !!ocupado || !usuario} onClick={gravar}>Gravar tudo ({total})</button>}
            </div>
            {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {feito && <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{feito} Confira em Cadastros e calcule em Cálculo; depois siga com a próxima empresa.</p>}
            {plano && (
                <ol className="space-y-2 text-sm">
                    {plano.plano.etapas.map((e, i) => (
                        <li key={i} className="rounded border border-slate-200 p-2 dark:border-slate-700 dark:text-slate-100">
                            <p><strong>{i + 1}. {e.titulo}</strong> — {e.resumo}</p>
                            {e.avisos.length > 0 && (
                                <details className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                                    <summary className="cursor-pointer">Avisos ({e.avisos.length})</summary>
                                    <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5">{e.avisos.map((a, k) => <li key={k}>{a}</li>)}</ul>
                                </details>
                            )}
                        </li>
                    ))}
                </ol>
            )}
            {eventos.length > 0 && (
                // A classe mostrada é a do último preparo; o select mostra o acerto atual.
                <details open className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700 dark:text-slate-200">
                    <summary className="cursor-pointer text-sm font-medium">Eventos do histórico ({eventos.length}) — confira com o IOB e acerte o que for preciso</summary>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">A classificação automática vem da natureza da rubrica (S-1010) e da descrição. Ao mudar um evento, o acerto fica salvo nos parâmetros; clique em "Preparar a restauração" de novo antes de gravar.</p>
                    <div className="mt-1 max-h-96 overflow-auto">
                        <table className="w-full">
                            <thead className="text-left text-slate-500"><tr><th className="p-1">Evento</th><th className="p-1">Descrição</th><th className="p-1">Natureza</th><th className="p-1 text-right">Lançamentos</th><th className="p-1 text-right">Quantidade</th><th className="p-1">Vai para</th></tr></thead>
                            <tbody>{eventos.map(e => (
                                <tr key={`${e.codeven}|${e.natRubr}`} className={`border-t border-slate-100 dark:border-slate-700 ${e.classe ? 'font-medium' : ''}`}>
                                    <td className="p-1 font-mono">{e.codeven}</td><td className="p-1">{e.descricao}</td><td className="p-1">{e.natRubr || '—'}</td>
                                    <td className="p-1 text-right">{e.linhas}</td><td className="p-1 text-right">{num(e.total)}</td>
                                    <td className="p-1">
                                        <select aria-label={`Classificação do evento ${e.codeven}`} className={inp} disabled={!!ocupado} value={param.eventos[e.codeven] ?? ''} onChange={ev => classificar(e.codeven, ev.target.value as ClasseManual | '')}>
                                            <option value="">Automático: {e.automatica ? ROTULO_MOVIMENTO[e.automatica] : 'não entra'}</option>
                                            {CAMPOS_HISTORICO.map(c => <option key={c} value={c}>{ROTULO_MOVIMENTO[c]}</option>)}
                                            <option value="ignorar">Não entra (ignorar)</option>
                                        </select>
                                    </td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                </details>
            )}
        </section>
    );
};

export default RestaurarEmpresaNoConsultor;
