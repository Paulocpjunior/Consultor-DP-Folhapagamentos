// components/prazos/CalendarioEmpresa.tsx
//
// Calendário de obrigações da folha da empresa e competência ativas (etapa 5):
// FGTS, eSocial, DCTFWeb/DARF, EFD-Reinf, guias sindicais, 13º e anuais, com
// a marcação de entregue / não se aplica gravada para toda a equipe.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Sindicato } from '../../services/cadastros/sindicatos';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { br, diasEntre } from '../../services/prazos/calendario';
import {
    cnpjsSindicatosDaEmpresa, guiaDoSindicato, obrigacoesDaEmpresa, situacao,
    type GuiaSindical, type MarcacaoObrigacao, type ObrigacaoEmpresa,
} from '../../services/prazos/obrigacoesEmpresa';
import { desmarcarObrigacao, listarMarcacoes, marcarObrigacao } from '../../services/prazos/obrigacoesStatusService';

interface Props {
    empresa: { id: string; nome: string; competencia: string };
    fichas: FichaFuncionario[];
    sindicatos: Sindicato[];
    usuario?: Usuario;
    hoje: string;
    onTrocar?: () => void;
    onAbrirCadastros?: () => void;
}

const compBr = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const cnpjFmt = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const ROTULO = { pendente: 'pendente', entregue: 'entregue', 'nao-se-aplica': 'não se aplica' } as const;

const CalendarioEmpresa: React.FC<Props> = ({ empresa, fichas, sindicatos, usuario, hoje, onTrocar, onAbrirCadastros }) => {
    const [marcacoes, setMarcacoes] = useState<Map<string, MarcacaoObrigacao> | null>(null);
    const [erro, setErro] = useState('');
    const [gravando, setGravando] = useState('');

    const carregar = useCallback(() => {
        setErro('');
        listarMarcacoes(empresa.id, empresa.competencia).then(setMarcacoes).catch(e => { setErro(mensagemErro(e)); setMarcacoes(new Map()); });
    }, [empresa.id, empresa.competencia]);
    useEffect(() => { carregar(); }, [carregar]);

    const { obrigacoes, semGuia, foraDoCadastro } = useMemo(() => {
        const cnpjs = cnpjsSindicatosDaEmpresa(fichas, empresa.id);
        const porCnpj = new Map(sindicatos.map(s => [s.cnpj, s]));
        const guias: GuiaSindical[] = [];
        const semGuia: string[] = [];
        const foraDoCadastro: string[] = [];
        for (const c of cnpjs) {
            const s = porCnpj.get(c);
            if (!s) { foraDoCadastro.push(c); continue; }
            const g = guiaDoSindicato(s);
            if (g) guias.push(g); else semGuia.push(s.nome);
        }
        const temEmpregados = fichas.some(f => f.empresaId === empresa.id && f.situacao !== 'desligado');
        return { obrigacoes: obrigacoesDaEmpresa({ competencia: empresa.competencia, temEmpregados, guias }), semGuia, foraDoCadastro };
    }, [fichas, sindicatos, empresa.id, empresa.competencia]);

    const linhas = obrigacoes.map(o => ({ o, m: marcacoes?.get(o.id), ...situacao(o, marcacoes?.get(o.id), hoje) }));
    const cont = linhas.reduce((c, l) => ({ ...c, [l.atrasada ? 'atrasada' : l.status]: (c[l.atrasada ? 'atrasada' : l.status] ?? 0) + 1 }), {} as Record<string, number>);

    async function marcar(o: ObrigacaoEmpresa, status: MarcacaoObrigacao['status']) {
        if (!usuario) return;
        let obs = '';
        if (status === 'nao-se-aplica') {
            const r = window.prompt(`Por que "${o.nome}" não se aplica a ${empresa.nome} em ${compBr(empresa.competencia)}?`);
            if (r === null) return;
            obs = r.trim();
            if (!obs) { setErro('Informe o motivo de "não se aplica".'); return; }
        }
        setGravando(o.id); setErro('');
        try { await marcarObrigacao(empresa.id, empresa.competencia, o, status, obs, marcacoes?.get(o.id), usuario); carregar(); }
        catch (e) { setErro(mensagemErro(e)); }
        finally { setGravando(''); }
    }

    async function desfazer(o: ObrigacaoEmpresa, m: MarcacaoObrigacao) {
        if (!usuario || !window.confirm(`Voltar "${o.nome}" para pendente?`)) return;
        setGravando(o.id); setErro('');
        try { await desmarcarObrigacao(empresa.id, o, m, usuario); carregar(); }
        catch (e) { setErro(mensagemErro(e)); }
        finally { setGravando(''); }
    }

    const btn = 'rounded border px-2 py-0.5 text-xs disabled:opacity-50';
    return (
        <section aria-label="Calendário da empresa" className="rounded-lg border border-blue-200 bg-white p-4 dark:border-blue-800 dark:bg-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white">Calendário da empresa: {empresa.nome} · competência {compBr(empresa.competencia)}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">O que a folha desta competência gera e até quando. A marcação vale para toda a equipe que atende a empresa.</p>
                </div>
                {onTrocar && <button className="text-sm text-blue-700 underline dark:text-blue-300" onClick={onTrocar}>Trocar empresa ou período</button>}
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {cont.atrasada > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 text-red-800 dark:bg-red-900/40 dark:text-red-200">Atrasadas: {cont.atrasada}</span>}
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Pendentes: {cont.pendente ?? 0}</span>
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800 dark:bg-green-900/40 dark:text-green-200">Entregues: {cont.entregue ?? 0}</span>
                {cont['nao-se-aplica'] > 0 && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700 dark:bg-slate-700 dark:text-slate-200">Não se aplica: {cont['nao-se-aplica']}</span>}
            </div>

            {erro && <p role="alert" className="mt-2 rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {!usuario && <p className="mt-2 text-xs text-slate-500">Entre com seu usuário para marcar as entregas.</p>}

            <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                    <thead className="text-left text-xs text-slate-500 dark:text-slate-400"><tr><th className="p-2">Vence</th><th className="p-2">Obrigação</th><th className="p-2">Responsável</th><th className="p-2">Base legal</th><th className="p-2">Situação</th></tr></thead>
                    <tbody>
                        {linhas.map(({ o, m, status, atrasada }) => {
                            const d = diasEntre(hoje, o.data);
                            return (
                                <tr key={o.id} className={`border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100 ${atrasada ? 'bg-red-50 dark:bg-red-900/20' : status !== 'pendente' ? 'opacity-70' : ''}`}>
                                    <td className="whitespace-nowrap p-2"><strong>{br(o.data)}</strong>
                                        <span className={`block text-xs ${atrasada ? 'font-medium text-red-700 dark:text-red-300' : 'text-slate-500'}`}>{status !== 'pendente' ? '' : atrasada ? `atrasada há ${-d} dia(s)` : d === 0 ? 'vence hoje' : `em ${d} dia(s)`}</span></td>
                                    <td className="p-2">{o.nome}
                                        {o.condicao && <span className="block text-xs text-slate-500 dark:text-slate-400">{o.condicao}</span>}
                                        {o.observacao && <span className="block text-xs text-amber-700 dark:text-amber-300">{o.observacao}</span>}</td>
                                    <td className="p-2 text-xs">{o.responsavel === 'Fiscal' ? 'Fiscal (o DP acompanha)' : 'DP'}</td>
                                    <td className="p-2 text-xs text-slate-500 dark:text-slate-400">{o.base}</td>
                                    <td className="p-2 text-xs">
                                        {marcacoes === null ? '…' : m ? (
                                            <>
                                                <span className={`rounded px-1.5 py-0.5 font-medium ${m.status === 'entregue' ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{ROTULO[m.status]}</span>
                                                <span className="mt-0.5 block text-slate-500">{[m.atualizadoPorEmail, m.atualizadoEm && br(m.atualizadoEm.slice(0, 10))].filter(Boolean).join(' · ')}</span>
                                                {m.observacao && <span className="block text-slate-500">{m.observacao}</span>}
                                                {usuario && <button className={`${btn} mt-1 border-slate-300 dark:border-slate-600`} disabled={!!gravando} onClick={() => desfazer(o, m)}>Desfazer</button>}
                                            </>
                                        ) : usuario ? (
                                            <span className="flex flex-wrap gap-1">
                                                <button aria-label={`Marcar entregue: ${o.nome}`} className={`${btn} border-green-600 text-green-700 dark:text-green-300`} disabled={!!gravando} onClick={() => marcar(o, 'entregue')}>{gravando === o.id ? 'Gravando…' : 'Entregue'}</button>
                                                <button aria-label={`Não se aplica: ${o.nome}`} className={`${btn} border-slate-300 dark:border-slate-600`} disabled={!!gravando} onClick={() => marcar(o, 'nao-se-aplica')}>Não se aplica</button>
                                            </span>
                                        ) : ROTULO.pendente}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {(semGuia.length > 0 || foraDoCadastro.length > 0) && (
                <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                    {semGuia.length > 0 && <>Sindicato(s) dos empregados sem guia no cadastro: {semGuia.join('; ')}. Informe o dia da guia da convenção para ela entrar no calendário. </>}
                    {foraDoCadastro.length > 0 && <>CNPJ de sindicato nas fichas que não está cadastrado: {foraDoCadastro.map(cnpjFmt).join('; ')}. </>}
                    {onAbrirCadastros && <button className="text-blue-700 underline dark:text-blue-300" onClick={onAbrirCadastros}>Abrir Cadastros</button>}
                </p>
            )}
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Datas com o ajuste de dia útil (feriados nacionais, Carnaval e Sexta-feira Santa); feriado estadual ou municipal pode mudar a data. A EFD-Reinf é transmitida pelo fiscal: o DP marca quando confirmar com ele.
            </p>
        </section>
    );
};

export default CalendarioEmpresa;
