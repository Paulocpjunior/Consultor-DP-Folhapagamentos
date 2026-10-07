// components/iobSage/RestaurarEmpresaNoConsultor.tsx
//
// Dentro da tela "Restaurar backup do IOB SAGE": escolhe a empresa do backup
// (schema fNNNN, ligada pelo código SAGE), confere os parâmetros e restaura
// tudo no Consultor numa sequência só (eSocial, fichas, enquadramento,
// afastamentos e férias, histórico da folha). Mostra o resumo de cada etapa
// antes de gravar. Os parâmetros acertados na empresa piloto ficam salvos.

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { Restauracao } from '../../services/iobSage/restauracao';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { empresasDoBackup, planejarRestauracao, type Existentes, type ParametrosRestauracao, type PlanoRestauracao } from '../../services/iobSage/restaurarEmpresa';
import { carregarExistentes, gravarRestauracao, lerParametros, salvarParametros } from '../../services/iobSage/restaurarEmpresaService';

interface Props { restauracao: Restauracao; arquivos: string[]; usuario?: Usuario; podeRestaurar: boolean }

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const botao = 'rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-40';

const RestaurarEmpresaNoConsultor: React.FC<Props> = ({ restauracao, arquivos, usuario, podeRestaurar }) => {
    const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
    const [codigo, setCodigo] = useState('');
    const [param, setParam] = useState<ParametrosRestauracao>(lerParametros);
    const [plano, setPlano] = useState<{ empresa: Empresa; existentes: Existentes; plano: PlanoRestauracao } | null>(null);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const [feito, setFeito] = useState('');

    useEffect(() => { listarEmpresasVisiveis().then(setEmpresas).catch(e => { setErro(mensagemErro(e)); setEmpresas([]); }); }, []);
    const doBackup = useMemo(() => (empresas ? empresasDoBackup(restauracao, empresas) : []), [restauracao, empresas]);
    const escolhida = doBackup.find(x => x.codigo === codigo);
    const mudar = (p: Partial<ParametrosRestauracao>) => { setParam(x => ({ ...x, ...p })); setPlano(null); };

    async function preparar() {
        if (!escolhida?.empresa) return;
        setErro(''); setFeito(''); setPlano(null);
        try {
            salvarParametros(param);
            setOcupado('Lendo o que já está gravado no Consultor…');
            const existentes = await carregarExistentes(escolhida.empresa.id);
            const p = await planejarRestauracao(restauracao, escolhida.empresa, existentes, param, setOcupado);
            setPlano({ empresa: escolhida.empresa, existentes, plano: p });
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
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
                    <select aria-label="Empresa do backup" className={`ml-2 ${inp}`} value={codigo} onChange={e => { setCodigo(e.target.value); setPlano(null); setFeito(''); }}>
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
                <label>Terceiros (%)<input aria-label="Terceiros (%)" className={`block w-20 ${inp}`} inputMode="decimal" value={param.terceiros || ''} onChange={e => mudar({ terceiros: Number(e.target.value.replace(',', '.')) || 0 })} /></label>
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
        </section>
    );
};

export default RestaurarEmpresaNoConsultor;
