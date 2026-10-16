// components/ferias/FeriasColetivasModal.tsx
//
// Cálculo › Férias › Férias coletivas: o plano por setor (services/ferias/feriasColetivas.ts), com quem entra,
// os dias de férias, de antecipação e de licença remunerada de cada um, as regras da CLT (arts. 134, 139 e 140),
// a comunicação em PDF (Ministério do Trabalho, sindicato e aviso aos empregados) e a gravação dos gozos em
// Cadastros › Afastamentos, de onde o Cálculo › Férias tira os recibos.

import React, { useMemo, useState } from 'react';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { Movimento } from '../../services/calculo/motorMensal';
import { gravarAfastamentosColetiva, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { afastamentosParaGravar, planejarColetiva, setoresDasFichas, type FiltroSetor, type Restante, type SituacaoItem } from '../../services/ferias/feriasColetivas';
import { normalizarCnpj } from '../../services/cadastros/documentos';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const ROTULO: Record<SituacaoItem, string> = { ferias: 'Férias', proporcionais: 'Proporcionais (art. 140)', excluido: 'Fora', gravado: 'Gravado' };
const COR: Record<SituacaoItem, string> = {
    ferias: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    proporcionais: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
    excluido: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    gravado: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
};
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const br = (d: string) => d.split('-').reverse().join('/');

interface Props {
    empresa: { id: string; cnpj: string; razaoSocial: string; codigoSage?: string };
    fichas: FichaFuncionario[];
    afastamentos: Afastamento[];
    movimentos: Record<string, Record<string, Movimento>>;
    usuario: Usuario;
    onFechar: () => void;
    /** Gravou: recarregar os afastamentos e ir à competência do início. */
    onGravado: (inicio: string) => void;
}

const FeriasColetivasModal: React.FC<Props> = ({ empresa, fichas, afastamentos, movimentos, usuario, onFechar, onGravado }) => {
    const [inicio, setInicio] = useState('');
    const [dias, setDias] = useState('20');
    const [tipoSetor, setTipoSetor] = useState<FiltroSetor['tipo']>('todos');
    const [valorSetor, setValorSetor] = useState('');
    const [restante, setRestante] = useState<Restante>('licenca');
    const [meEpp, setMeEpp] = useState(false);
    const [sindicato, setSindicato] = useState('');
    const [cidade, setCidade] = useState('');
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState('');

    const setor: FiltroSetor = tipoSetor === 'todos' ? { tipo: 'todos' } : { tipo: tipoSetor, valor: valorSetor };
    const plano = { inicio, dias: Number(dias), setor, restante, meEpp, hoje: hojeSp() };
    const r = useMemo(() => (inicio ? planejarColetiva(plano, fichas, afastamentos, movimentos) : null), // eslint-disable-line react-hooks/exhaustive-deps
        [inicio, dias, tipoSetor, valorSetor, restante, meEpp, fichas, afastamentos, movimentos]);
    const gravar = r && !r.erros.length ? afastamentosParaGravar(r) : [];
    const opcoesSetor = tipoSetor === 'todos' ? [] : setoresDasFichas(fichas, tipoSetor);

    async function confirmar() {
        if (!r || !gravar.length) return;
        const pessoas = new Set(gravar.map(a => a.fichaId)).size;
        if (!window.confirm(`Gravar as férias coletivas de ${br(inicio)} a ${br(r.fim)} para ${pessoas} empregado(s) em Cadastros › Afastamentos (${gravar.length} lançamento(s))?`)) return;
        setOcupado('Gravando…'); setErro('');
        try { await gravarAfastamentosColetiva(gravar, usuario); onGravado(inicio); }
        catch (e) { setErro(`Não foi possível gravar (${mensagemErro(e)}).`); setOcupado(''); }
    }

    async function comunicacao() {
        if (!r) return;
        setOcupado('Gerando a comunicação…'); setErro('');
        try {
            const { comunicacaoColetivaPdf } = await import('../../services/ferias/comunicacaoColetivaPdf');
            const doc = comunicacaoColetivaPdf(plano, r, { razaoSocial: empresa.razaoSocial, cnpj: normalizarCnpj(empresa.cnpj), cidade, sindicato, setor: setor.tipo === 'todos' ? '' : setor.valor },
                { empresa: { razaoSocial: empresa.razaoSocial, cnpj: normalizarCnpj(empresa.cnpj), codigoSage: empresa.codigoSage }, emitidoPor: usuario.email });
            doc.save(`ferias-coletivas-${empresa.codigoSage || 'empresa'}-${inicio}.pdf`);
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    return (
        <div role="dialog" aria-modal="true" aria-label="Férias coletivas" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-5xl space-y-3 rounded-xl bg-white p-4 text-sm shadow-xl dark:bg-slate-800 dark:text-slate-100">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Férias coletivas — {empresa.razaoSocial}</h3>
                        <p className="text-slate-600 dark:text-slate-300">Para toda a empresa ou um setor (CLT, art. 139): até 2 períodos por ano, nenhum com menos de 10 dias, comunicados com 15 dias de antecedência. Quem tem menos de 12 meses goza as proporcionais e recomeça o período aquisitivo (art. 140).</p>
                    </div>
                    <button aria-label="Fechar" className="rounded-sm px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                <div className="grid gap-2 sm:grid-cols-4">
                    <label>Início<input aria-label="Início das férias coletivas" type="date" className={`block w-full ${inp}`} value={inicio} onChange={e => setInicio(e.target.value)} /></label>
                    <label>Dias<input aria-label="Dias das férias coletivas" inputMode="numeric" className={`block w-full ${inp}`} value={dias} onChange={e => setDias(e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>
                    <label>Abrangência<select aria-label="Abrangência" className={`block w-full ${inp}`} value={tipoSetor} onChange={e => { setTipoSetor(e.target.value as FiltroSetor['tipo']); setValorSetor(''); }}>
                        <option value="todos">Toda a empresa</option><option value="departamento">Departamento</option><option value="estabelecimento">Estabelecimento</option><option value="cargo">Cargo</option></select></label>
                    {tipoSetor !== 'todos' && <label>Setor<select aria-label="Setor" className={`block w-full ${inp}`} value={valorSetor} onChange={e => setValorSetor(e.target.value)}>
                        <option value="">— escolha —</option>{opcoesSetor.map(v => <option key={v} value={v}>{v}</option>)}</select></label>}
                    <label className="sm:col-span-2">Dias além do saldo (12 meses ou mais)<select aria-label="Dias além do saldo" className={`block w-full ${inp}`} value={restante} onChange={e => setRestante(e.target.value as Restante)}>
                        <option value="licenca">Licença remunerada (salário normal)</option><option value="antecipar">Antecipar férias do período em curso</option></select></label>
                    <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={meEpp} onChange={e => setMeEpp(e.target.checked)} />Microempresa ou EPP (dispensa da comunicação ao Ministério do Trabalho)</label>
                </div>

                {r && r.erros.length > 0 && <ul role="alert" className="list-disc rounded-sm bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{r.erros.map(x => <li key={x}>{x}</li>)}</ul>}
                {r && r.avisos.length > 0 && <ul className="list-disc rounded-sm bg-amber-50 p-2 pl-6 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">{r.avisos.map(x => <li key={x}>{x}</li>)}</ul>}
                {r && r.itens.length > 0 && (
                    <div className="max-h-80 overflow-auto rounded-sm border border-slate-200 dark:border-slate-700">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Empregado</th><th className="p-2">Situação</th><th className="p-2 text-right">Férias</th><th className="p-2 text-right">Antecipadas</th><th className="p-2 text-right">Licença</th><th className="p-2">Detalhe</th></tr></thead>
                            <tbody>{r.itens.map(i => (
                                <tr key={i.fichaId} className="border-t border-slate-100 align-top dark:border-slate-700">
                                    <td className="p-2">{i.nome}</td>
                                    <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs ${COR[i.situacao]}`}>{ROTULO[i.situacao]}</span></td>
                                    <td className="p-2 text-right">{i.situacao === 'excluido' ? '' : i.diasGozo}</td>
                                    <td className="p-2 text-right">{i.diasAntecipados || ''}</td>
                                    <td className="p-2 text-right">{i.diasLicenca || ''}</td>
                                    <td className="p-2 text-xs text-slate-600 dark:text-slate-300">{i.motivo}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}

                {r && !r.erros.length && (
                    <div className="grid gap-2 border-t border-slate-200 pt-2 sm:grid-cols-3 dark:border-slate-700">
                        <label className="sm:col-span-2">Sindicato (para a comunicação)<input aria-label="Sindicato da comunicação" className={`block w-full ${inp}`} value={sindicato} onChange={e => setSindicato(e.target.value)} placeholder="Sindicato dos Empregados no Comércio de…" /></label>
                        <label>Cidade<input aria-label="Cidade da comunicação" className={`block w-full ${inp}`} value={cidade} onChange={e => setCidade(e.target.value)} /></label>
                    </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                    <button className={btn} onClick={onFechar}>Fechar</button>
                    <button className={btn} disabled={!r || r.erros.length > 0 || !!ocupado} onClick={comunicacao}>Comunicação (PDF)</button>
                    <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!gravar.length || !!ocupado} onClick={confirmar}>Gravar em Afastamentos ({new Set(gravar.map(a => a.fichaId)).size})</button>
                </div>
                {ocupado && <p role="status" className="text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="text-red-700 dark:text-red-300">{erro}</p>}
                <p className="text-xs text-slate-500">Depois de gravar, os recibos saem aqui no Cálculo › Férias, na competência do início (pagamento até 2 dias antes). A licença remunerada é paga como salário normal na folha do mês.</p>
            </div>
        </div>
    );
};

export default FeriasColetivasModal;
