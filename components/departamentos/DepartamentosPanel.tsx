// components/departamentos/DepartamentosPanel.tsx
//
// Cadastros › Departamentos: os departamentos (e centros de custo) da empresa ativa, para a folha por departamento.
// Os códigos que já estão nas fichas (o departamento do IOB) entram de uma vez pelo botão "Trazer das fichas".

import React, { useEffect, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarFuncionarios, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { contarPorDepartamento, departamentosDasFichas, departamentoVazio, validarDepartamento, type Departamento } from '../../services/departamentos/departamentos';
import { criarDepartamentos, excluirDepartamento, listarDepartamentos, salvarDepartamento } from '../../services/departamentos/departamentosService';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-slate-600';
const btnP = 'rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40';

const DepartamentosPanel: React.FC<{ usuario: Usuario }> = ({ usuario }) => {
    const { ativa } = useEmpresaAtiva();
    const [lista, setLista] = useState<Departamento[]>([]);
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [d, setD] = useState<Departamento | null>(null);
    const [nova, setNova] = useState(false);
    const [erro, setErro] = useState('');
    const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        Promise.all([listarDepartamentos(ativa.id), listarFuncionarios(ativa.id)])
            .then(([ds, fs]) => { if (vivo) { setLista(ds); setFichas(fs); } })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa]);

    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa.</p>;
    const contagem = contarPorDepartamento(fichas.filter(f => f.situacao !== 'desligado'));
    const faltam = departamentosDasFichas(fichas, lista, ativa.id);
    const erros = d ? validarDepartamento(d, lista.filter(o => !(o.codigo === d.codigo && !nova))) : [];

    async function recarregar() { setLista(await listarDepartamentos(ativa!.id)); }
    async function gravar() {
        if (!d) return;
        if (erros.length) { setErro(erros.join(' ')); return; }
        setErro(''); setMsg('');
        try { await salvarDepartamento(d, usuario); await recarregar(); setD(null); setNova(false); setMsg('Departamento gravado.'); } catch (e) { setErro(mensagemErro(e)); }
    }
    async function trazer() {
        setErro(''); setMsg('');
        try { await criarDepartamentos(faltam, usuario); await recarregar(); setMsg(`${faltam.length} departamento(s) criados a partir das fichas. Dê nome a cada um.`); } catch (e) { setErro(mensagemErro(e)); }
    }
    async function excluir(x: Departamento) {
        if (!window.confirm(`Excluir o departamento ${x.codigo}? As fichas continuam com o código.`)) return;
        try { await excluirDepartamento(x); await recarregar(); } catch (e) { setErro(mensagemErro(e)); }
    }

    return (
        <div className="space-y-4 text-sm dark:text-slate-100">
            <div>
                <h2 className="text-lg font-semibold">Departamentos</h2>
                <p className="text-slate-600 dark:text-slate-300">Departamentos e centros de custo da empresa. O departamento do funcionário é o da ficha (Ident. Adm.) ou, sem ele, o do IOB. No Cálculo mensal, a folha, os holerites e o resumo saem por departamento ou por obra.</p>
            </div>
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
            <div className="flex flex-wrap gap-2">
                <button className={btnP} onClick={() => { setErro(''); setMsg(''); setNova(true); setD(departamentoVazio(ativa.id)); }}>+ Novo departamento</button>
                <button className={btn} disabled={!faltam.length} onClick={trazer}>Trazer das fichas ({faltam.length})</button>
            </div>
            {d && (
                <section className="flex flex-wrap items-end gap-3 rounded border border-slate-200 p-3 dark:border-slate-700">
                    <label>Código<input aria-label="Código do departamento" disabled={!nova} className={`block w-28 font-mono ${inp}`} value={d.codigo} onChange={e => setD({ ...d, codigo: e.target.value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 20) })} /></label>
                    <label className="grow">Nome<input aria-label="Nome do departamento" className={`block w-full ${inp}`} value={d.nome} onChange={e => setD({ ...d, nome: e.target.value })} /></label>
                    <label>Centro de custo<input aria-label="Centro de custo" className={`block w-32 ${inp}`} value={d.centroCusto} onChange={e => setD({ ...d, centroCusto: e.target.value.slice(0, 30) })} /></label>
                    <label className="flex items-center gap-1"><input type="checkbox" aria-label="Ativo" checked={d.ativo} onChange={e => setD({ ...d, ativo: e.target.checked })} />Ativo</label>
                    <button className={btnP} onClick={gravar}>Gravar</button>
                    <button className={btn} onClick={() => { setD(null); setNova(false); }}>Cancelar</button>
                    {erros.length > 0 && <ul className="w-full list-disc pl-5 text-xs text-red-700 dark:text-red-300">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
                </section>
            )}
            <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500"><tr><th className="p-1">Código</th><th className="p-1">Nome</th><th className="p-1">Centro de custo</th><th className="p-1 text-right">Funcionários ativos</th><th /></tr></thead>
                <tbody>
                    {!lista.length && <tr><td colSpan={5} className="p-1 text-slate-500">Nenhum departamento cadastrado.</td></tr>}
                    {lista.map(x => (
                        <tr key={x.codigo} className="border-t border-slate-100 dark:border-slate-700">
                            <td className="p-1 font-mono">{x.codigo}</td><td className="p-1">{x.nome}{!x.ativo && <span className="ml-1 text-xs text-slate-500">(inativo)</span>}</td><td className="p-1">{x.centroCusto || '—'}</td>
                            <td className="p-1 text-right">{contagem.get(x.codigo) ?? 0}</td>
                            <td className="p-1 text-right"><button className="text-xs text-blue-700 dark:text-blue-300" onClick={() => { setNova(false); setD(x); }}>Editar</button> <button className="text-xs text-red-700" onClick={() => excluir(x)}>Excluir</button></td>
                        </tr>
                    ))}
                    {(contagem.get('(sem departamento)') ?? 0) > 0 && <tr className="border-t border-slate-100 text-slate-500 dark:border-slate-700"><td className="p-1" colSpan={3}>Sem departamento na ficha</td><td className="p-1 text-right">{contagem.get('(sem departamento)')}</td><td /></tr>}
                </tbody>
            </table>
        </div>
    );
};

export default DepartamentosPanel;
