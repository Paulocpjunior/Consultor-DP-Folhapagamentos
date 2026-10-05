// components/cadastros/SindicatosCadastro.tsx
//
// Arquivos › Sindicatos: identificação, data-base e convenção coletiva.

import React, { useCallback, useState } from 'react';
import { MESES, normalizarSindicato, sindicatoVazio, situacaoConvencao, validarSindicato, type Sindicato } from '../../services/cadastros/sindicatos';
import { excluirSindicato, mensagemErro, salvarSindicato, type Usuario } from '../../services/cadastros/cadastrosService';
import { UFS, centavosDeTexto, reais } from '../../services/cadastros/documentos';

interface Props { sindicatos: Sindicato[] | null; erroLista: string; usuario: Usuario; isAdmin: boolean; onRecarregar: () => void }

const inp = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const fmtCnpj = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const COR_CONV = { sem: 'text-slate-400', vigente: 'text-green-700 dark:text-green-400', 'a vencer': 'text-amber-700 dark:text-amber-300', vencida: 'text-red-700 dark:text-red-300' };

const SindicatosCadastro: React.FC<Props> = ({ sindicatos, erroLista, usuario, isAdmin, onRecarregar }) => {
    const [edicao, setEdicao] = useState<{ antes: Sindicato | null; s: Sindicato; piso: string } | null>(null);
    const [erros, setErros] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const hoje = new Date().toISOString().slice(0, 10);

    const abrir = useCallback((antes: Sindicato | null) => {
        setErros([]);
        const s = antes ?? sindicatoVazio();
        setEdicao({ antes, s, piso: s.pisoSalarial !== null ? (s.pisoSalarial / 100).toFixed(2).replace('.', ',') : '' });
    }, []);

    async function salvar() {
        if (!edicao) return;
        const piso = edicao.piso.trim() ? centavosDeTexto(edicao.piso) : null;
        if (edicao.piso.trim() && piso === null) { setErros(['Piso salarial: valor inválido.']); return; }
        const s = normalizarSindicato({ ...edicao.s, pisoSalarial: piso });
        const v = validarSindicato(s, sindicatos ?? [], edicao.antes?.id ?? '');
        if (v.length) { setErros(v); return; }
        setSalvando(true);
        try { await salvarSindicato(edicao.antes, s, usuario); setEdicao(null); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    async function excluir() {
        if (!edicao?.antes || !window.confirm(`Excluir o sindicato ${edicao.antes.nome}?`)) return;
        setSalvando(true);
        try { await excluirSindicato(edicao.antes, usuario); setEdicao(null); onRecarregar(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    const set = (k: keyof Sindicato, v: string) => setEdicao(e => e && ({ ...e, s: { ...e.s, [k]: v } }));
    const texto = (k: keyof Sindicato, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
        <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">{rotulo}</span>
            <input className={inp} value={String(edicao?.s[k] ?? '')} onChange={e => set(k, e.target.value)} aria-label={rotulo} {...extra} /></label>
    );

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <button className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white" onClick={() => abrir(null)}>Novo sindicato</button>
                <p className="text-sm text-slate-600 dark:text-slate-300">Cadastro único do escritório: o mesmo sindicato serve a várias empresas. A ficha do funcionário liga pelo CNPJ que vem do S-2200.</p>
            </div>
            {erroLista && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erroLista}</p>}
            {!sindicatos && !erroLista && <p className="text-sm text-slate-500">Carregando…</p>}
            {sindicatos?.length === 0 && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">Nenhum sindicato cadastrado.</p>}
            {!!sindicatos?.length && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400"><tr><th className="p-2">Cód. IOB</th><th className="p-2">Nome</th><th className="p-2">CNPJ</th><th className="p-2">Data-base</th><th className="p-2">Piso</th><th className="p-2">Convenção</th></tr></thead>
                        <tbody>
                            {sindicatos.map(s => {
                                const conv = situacaoConvencao(s, hoje);
                                return (
                                    <tr key={s.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700" onClick={() => abrir(s)}>
                                        <td className="p-2 font-mono">{s.codigoIob || '—'}</td>
                                        <td className="p-2 font-medium">{s.nome}</td>
                                        <td className="p-2 font-mono">{fmtCnpj(s.cnpj)}</td>
                                        <td className="p-2">{s.dataBase ? MESES[Number(s.dataBase) - 1] : '—'}</td>
                                        <td className="p-2">{s.pisoSalarial !== null ? reais(s.pisoSalarial) : '—'}</td>
                                        <td className={`p-2 ${COR_CONV[conv]}`}>{conv === 'sem' ? 'sem vigência' : `${conv} (até ${s.vigenciaFim.split('-').reverse().join('/')})`}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {edicao && (
                <div role="dialog" aria-modal="true" aria-label="Sindicato" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
                    <div className="my-4 w-full max-w-3xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                        <div className="flex items-start justify-between">
                            <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{edicao.antes ? edicao.antes.nome : 'Novo sindicato'}</h3>
                            <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={() => setEdicao(null)}>×</button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            {texto('cnpj', 'CNPJ', { disabled: !!edicao.antes })}
                            <div className="sm:col-span-2">{texto('nome', 'Nome')}</div>
                            {texto('codigoIob', 'Código no IOB')}
                            <div className="sm:col-span-2">{texto('categoria', 'Categoria representada')}</div>
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Data-base</span>
                                <select className={inp} value={edicao.s.dataBase} onChange={e => set('dataBase', e.target.value)} aria-label="Data-base"><option value="">—</option>{MESES.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}</select></label>
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">UF</span>
                                <select className={inp} value={edicao.s.uf} onChange={e => set('uf', e.target.value)} aria-label="UF"><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></label>
                            {texto('municipio', 'Município / base territorial')}
                        </div>
                        <fieldset className="grid gap-3 rounded border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
                            <legend className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">Convenção coletiva vigente</legend>
                            {texto('registroMte', 'Registro no Mediador (MTE)')}
                            {texto('vigenciaInicio', 'Início da vigência', { type: 'date' })}
                            {texto('vigenciaFim', 'Fim da vigência', { type: 'date' })}
                            <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Piso salarial (R$)</span>
                                <input className={inp} value={edicao.piso} onChange={e => setEdicao({ ...edicao, piso: e.target.value })} aria-label="Piso salarial" placeholder="0,00" /></label>
                            <div className="sm:col-span-2">{texto('contribuicao', 'Contribuição / desconto sindical (como prevê a convenção)')}</div>
                        </fieldset>
                        <fieldset className="grid gap-3 rounded border border-slate-200 p-3 sm:grid-cols-3 dark:border-slate-700">
                            <legend className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">Guia sindical no calendário de obrigações</legend>
                            {texto('guiaDia', 'Dia de vencimento (mês seguinte)', { inputMode: 'numeric', placeholder: '10' })}
                            {texto('guiaMeses', 'Competências (todos ou 3, 9)', { placeholder: 'todos' })}
                            {texto('guiaDescricao', 'Descrição da guia', { placeholder: 'Contribuição assistencial' })}
                            <p className="text-xs text-slate-500 sm:col-span-3 dark:text-slate-400">Sem o dia, a guia não entra no calendário (não se inventa data). Dia que não existe no mês vira o último dia; dia não útil antecipa.</p>
                        </fieldset>
                        <label className="block"><span className="text-xs font-medium text-slate-600 dark:text-slate-300">Observações (adicionais, aviso prévio, cláusulas que o DP precisa lembrar)</span>
                            <textarea className={inp} rows={3} value={edicao.s.observacoes} onChange={e => set('observacoes', e.target.value)} aria-label="Observações" /></label>
                        {erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(e => <li key={e}>{e}</li>)}</ul>}
                        <div className="flex justify-between gap-2">
                            <div>{edicao.antes && isAdmin && <button className="rounded border border-red-300 px-3 py-2 text-sm text-red-700 dark:text-red-300" disabled={salvando} onClick={excluir}>Excluir</button>}</div>
                            <div className="flex gap-2">
                                <button className="rounded border border-slate-300 px-4 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={() => setEdicao(null)}>Cancelar</button>
                                <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={salvando} onClick={salvar}>{salvando ? 'Gravando…' : 'Gravar'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SindicatosCadastro;
