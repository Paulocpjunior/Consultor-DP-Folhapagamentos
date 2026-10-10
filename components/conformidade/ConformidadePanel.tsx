// components/conformidade/ConformidadePanel.tsx
//
// Cadastros › Conformidade: a folha da empresa conferida com o salário mínimo (federal e estadual da UF) e com a
// convenção coletiva dos sindicatos dela (vigência, data-base, pisos, reajuste, horas extras) na competência, e o
// checklist das obrigações da convenção (marcado por empresa, com quem e quando).

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import type { Movimento } from '../../services/calculo/motorMensal';
import { listarFuncionarios, listarSindicatos, listarTabelas, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { listarMovimentos } from '../../services/calculo/movimentosService';
import { conferirSalarioMinimo, type AlertaConformidade } from '../../services/conformidade/salarioMinimo';
import { conferirConvencao, convencaoDoDia, type ChecklistConvencao, type ConvencaoColetiva } from '../../services/sindicatos/convencao';
import { listarChecklists, listarConvencoes, marcarObrigacao } from '../../services/sindicatos/convencoesService';

interface Dados { fichas: FichaFuncionario[]; tabelas: TabelaLegal[]; sindicatos: Sindicato[]; convencoes: ConvencaoColetiva[]; checklists: Record<string, ChecklistConvencao>; movimentos: Record<string, Movimento> }
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const COR = { erro: 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200', aviso: 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100' };

export function juntarAlertas(minimo: { alertas: AlertaConformidade[] }, comPiso: Set<string>, convencao: AlertaConformidade[]): AlertaConformidade[] {
    // O piso estadual não vale para quem tem piso em convenção (LC 103/2000).
    const doMinimo = minimo.alertas.filter(a => !(a.regra === 'minimo-estadual' && comPiso.has(a.fichaId)));
    return [...doMinimo, ...convencao].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.nivel === b.nivel ? 0 : a.nivel === 'erro' ? -1 : 1));
}

const ConformidadePanel: React.FC<{ empresa: Empresa; usuario: Usuario; competenciaInicial?: string }> = ({ empresa, usuario, competenciaInicial }) => {
    const [competencia, setCompetencia] = useState(competenciaInicial ?? hojeSp().slice(0, 7));
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState('');
    const [obs, setObs] = useState<Record<string, string>>({});

    useEffect(() => {
        let vivo = true; setDados(null); setErro('');
        Promise.all([listarFuncionarios(empresa.id), listarTabelas(), listarSindicatos(), listarConvencoes(), listarChecklists(empresa.id), listarMovimentos(empresa.id, competencia)])
            .then(([fichas, tabelas, sindicatos, convencoes, checklists, movs]) => { if (vivo) setDados({ fichas, tabelas, sindicatos, convencoes, checklists, movimentos: Object.fromEntries(movs.map(m => [m.fichaId, m.movimento])) }); })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [empresa.id, competencia]);

    const r = useMemo(() => {
        if (!dados) return null;
        const nomes = Object.fromEntries(dados.sindicatos.map(s => [s.cnpj, s.nome]));
        const conv = conferirConvencao({ competencia, hoje: hojeSp(), sindicatosDaEmpresa: empresa.sindicatos ?? [], nomesSindicatos: nomes, fichas: dados.fichas, convencoes: dados.convencoes, movimentos: dados.movimentos, checklists: dados.checklists });
        const min = conferirSalarioMinimo(dados.fichas, dados.tabelas, empresa.uf ?? '', competencia);
        const alertas = juntarAlertas(min, conv.comPiso, conv.alertas);
        const gerais = [...min.avisos.map(m => ({ fichaId: '', nome: '', nivel: 'aviso' as const, regra: 'minimo', mensagem: m })), ...conv.gerais];
        const [a, m] = competencia.split('-').map(Number);
        const fim = `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
        const vigentes = (empresa.sindicatos ?? []).map(cnpj => ({ cnpj, nome: nomes[cnpj] || cnpj, c: convencaoDoDia(dados.convencoes, cnpj, fim) })).filter(x => x.c && x.c.obrigacoes.length);
        return { alertas, gerais, vigentes };
    }, [dados, competencia, empresa]);

    async function marcar(c: ConvencaoColetiva, obrigacaoId: string, cumprido: boolean) {
        if (!dados) return;
        try {
            const itens = await marcarObrigacao(empresa.id, c.id, dados.checklists[c.id] ?? {}, obrigacaoId, cumprido, obs[`${c.id}|${obrigacaoId}`] ?? dados.checklists[c.id]?.[obrigacaoId]?.obs ?? '', usuario);
            setDados({ ...dados, checklists: { ...dados.checklists, [c.id]: itens } });
        } catch (e) { setErro(mensagemErro(e)); }
    }

    const erros = r ? [...r.gerais, ...r.alertas].filter(a => a.nivel === 'erro').length : 0;
    const avisos = r ? [...r.gerais, ...r.alertas].filter(a => a.nivel === 'aviso').length : 0;
    return (
        <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">A folha conferida com o salário mínimo federal e estadual ({empresa.uf || 'UF não informada'}) e com a convenção coletiva dos sindicatos da empresa: vigência, data-base, pisos, reajuste, horas extras e as obrigações da convenção.</p>
            <div className="flex flex-wrap items-center gap-3">
                <label className="dark:text-white">Competência <input type="month" aria-label="Competência da conformidade" className="ml-1 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" value={competencia} onChange={e => setCompetencia(e.target.value)} /></label>
                {r && <span className={`rounded-full px-2.5 py-1 text-xs ${erros ? COR.erro : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'}`}>{erros} erro(s)</span>}
                {r && <span className={`rounded-full px-2.5 py-1 text-xs ${avisos ? COR.aviso : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'}`}>{avisos} aviso(s)</span>}
            </div>
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {!dados && !erro && <p className="text-slate-500">Carregando…</p>}
            {r && r.gerais.length > 0 && (
                <section aria-label="Empresa" className="space-y-1">
                    <p className="font-medium dark:text-white">Empresa</p>
                    {r.gerais.map((a, i) => <p key={i} className={`rounded p-2 ${COR[a.nivel]}`}>{a.mensagem}</p>)}
                </section>
            )}
            {r && (
                <section aria-label="Funcionários" className="space-y-1">
                    <p className="font-medium dark:text-white">Funcionários</p>
                    {!r.alertas.length ? <p className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">Nenhum funcionário fora do mínimo ou da convenção em {competencia.split('-').reverse().join('/')}.</p>
                        : <ul className="space-y-1">{r.alertas.map((a, i) => <li key={i} className={`rounded p-2 ${COR[a.nivel]}`}><strong>{a.nome}:</strong> {a.mensagem}</li>)}</ul>}
                </section>
            )}
            {r && r.vigentes.length > 0 && (
                <section aria-label="Obrigações da convenção" className="space-y-2">
                    <p className="font-medium dark:text-white">Obrigações da convenção</p>
                    {r.vigentes.map(({ cnpj, nome, c }) => (
                        <div key={cnpj} className="rounded border border-slate-200 p-2 dark:border-slate-700">
                            <p className="text-xs text-slate-500">{nome} · {c!.tipo} até {c!.vigenciaFim.split('-').reverse().join('/')}</p>
                            <ul className="mt-1 space-y-1">{c!.obrigacoes.map(o => {
                                const m = dados!.checklists[c!.id]?.[o.id];
                                const k = `${c!.id}|${o.id}`;
                                return (
                                    <li key={o.id} className="flex flex-wrap items-center gap-2 dark:text-slate-100">
                                        <label className="flex items-center gap-2"><input type="checkbox" checked={!!m?.cumprido} onChange={e => marcar(c!, o.id, e.target.checked)} aria-label={`Cumprida: ${o.descricao}`} />{o.descricao}</label>
                                        <input className="min-w-40 flex-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900" placeholder="como é cumprida (fornecedor, apólice…)" aria-label={`Observação: ${o.descricao}`}
                                            value={obs[k] ?? m?.obs ?? ''} onChange={e => setObs(x => ({ ...x, [k]: e.target.value }))} onBlur={() => obs[k] !== undefined && m && marcar(c!, o.id, m.cumprido)} />
                                        {m && <span className="text-xs text-slate-500">{m.cumprido ? 'cumprida' : 'pendente'} · {m.porEmail}</span>}
                                    </li>
                                );
                            })}</ul>
                        </div>
                    ))}
                </section>
            )}
        </div>
    );
};

export default ConformidadePanel;
