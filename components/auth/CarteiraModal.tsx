// components/auth/CarteiraModal.tsx
//
// Destina empresas à carteira de um colaborador (como no CFI). O gestor
// mexe em qualquer empresa; o admin, só nas da carteira dele (as outras
// aparecem travadas). A trava de verdade está nas regras do Firestore.

import React, { useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { ROTULO_PAPEL, papelEfetivo, type Papel } from '../../services/auth/papeis';
import { diffCarteira, motivosRecusa } from '../../services/carteira/carteira';
import { salvarCarteira } from '../../services/carteira/carteiraService';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';

interface Props {
    alvo: { uid: string; nome: string; email: string; papel: string };
    ator: Papel;
    atorUid: string;
    usuario: Usuario;
    /** Empresas que o ator enxerga. */
    empresas: Empresa[];
    /** Carteira atual do alvo. */
    atual: string[];
    /** Carteira do ator (o admin só mexe nestas). */
    minhas: string[];
    onFechar: () => void;
    onSalvo: () => void;
}

const cnpjFmt = (c: string) => (c?.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const CarteiraModal: React.FC<Props> = ({ alvo, ator, atorUid, usuario, empresas, atual, minhas, onFechar, onSalvo }) => {
    const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(atual));
    const [busca, setBusca] = useState('');
    const [soMarcadas, setSoMarcadas] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erros, setErros] = useState<string[]>([]);

    const editavel = (id: string) => ator === 'gestor' || minhas.includes(id);
    // Empresas da carteira do alvo que o ator não enxerga continuam lá (e contam).
    const invisiveis = atual.filter(id => !empresas.some(e => e.id === id));

    const lista = useMemo(() => {
        const b = sem(busca.trim());
        return empresas.filter(e => (!soMarcadas || marcadas.has(e.id))
            && (!b || sem(`${e.nomeFantasia} ${e.razaoSocial} ${e.cnpj} ${e.codigoSage}`).includes(b)));
    }, [empresas, busca, soMarcadas, marcadas]);

    const alternar = (id: string) => setMarcadas(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    const marcarLista = (sim: boolean) => setMarcadas(m => {
        const n = new Set(m);
        for (const e of lista) if (editavel(e.id)) { if (sim) n.add(e.id); else n.delete(e.id); }
        return n;
    });

    const depois = [...marcadas];
    const { incluidas, removidas } = diffCarteira(atual, depois);

    async function salvar() {
        const v = motivosRecusa(ator, atorUid, alvo, minhas, atual, depois);
        setErros(v);
        if (v.length) return;
        setSalvando(true);
        try { await salvarCarteira({ uid: alvo.uid, nome: alvo.nome, email: alvo.email }, atual, depois, usuario); onSalvo(); }
        catch (e) { setErros([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    return (
        <div role="dialog" aria-modal="true" aria-label="Carteira do colaborador" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-2xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Carteira de {alvo.nome}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{alvo.email} · {ROTULO_PAPEL[papelEfetivo(alvo.papel)]} · {marcadas.size} empresa(s)</p>
                    </div>
                    <button aria-label="Fechar" className="px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                <p className="rounded bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                    {alvo.nome} só verá e trabalhará nas empresas marcadas (e nas que ele mesmo cadastrar).
                    {ator === 'admin' && ' Como admin, você só inclui ou retira empresas da sua própria carteira.'}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    <input aria-label="Buscar empresa" placeholder="Buscar por nome, CNPJ ou código SAGE" value={busca} onChange={e => setBusca(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" />
                    <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300"><input type="checkbox" checked={soMarcadas} onChange={e => setSoMarcadas(e.target.checked)} /> só as marcadas</label>
                    <button className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" onClick={() => marcarLista(true)}>Marcar as {lista.length} da lista</button>
                    <button className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" onClick={() => marcarLista(false)}>Desmarcar</button>
                </div>
                <ul className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded border border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
                    {lista.map(e => {
                        const pode = editavel(e.id);
                        return (
                            <li key={e.id} className={`flex items-center gap-2 px-3 py-2 ${pode ? '' : 'opacity-60'}`}>
                                <input type="checkbox" aria-label={e.nomeFantasia || e.razaoSocial} checked={marcadas.has(e.id)} disabled={!pode} onChange={() => alternar(e.id)} />
                                <span className="min-w-0 flex-1 dark:text-slate-100">
                                    <strong>{e.nomeFantasia || e.razaoSocial}</strong>
                                    <span className="block text-xs text-slate-500 dark:text-slate-400">{e.razaoSocial} · CNPJ {cnpjFmt(e.cnpj)} · SAGE {e.codigoSage}{pode ? '' : ' · fora da sua carteira'}</span>
                                </span>
                            </li>
                        );
                    })}
                    {!lista.length && <li className="p-4 text-center text-sm text-slate-500">Nenhuma empresa nesta busca.</li>}
                </ul>
                {invisiveis.length > 0 && <p className="text-xs text-slate-500">{invisiveis.length} empresa(s) desta carteira estão fora da sua visão e continuam como estão.</p>}
                {(incluidas.length > 0 || removidas.length > 0) && <p className="text-xs text-slate-600 dark:text-slate-300">Ao salvar: {incluidas.length} incluída(s), {removidas.length} retirada(s).</p>}
                {erros.length > 0 && <ul role="alert" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erros.map(x => <li key={x}>{x}</li>)}</ul>}
                <div className="flex justify-end gap-2">
                    <button className="rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:text-white" onClick={onFechar}>Cancelar</button>
                    <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={salvando || (!incluidas.length && !removidas.length)} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar carteira'}</button>
                </div>
            </div>
        </div>
    );
};

export default CarteiraModal;
