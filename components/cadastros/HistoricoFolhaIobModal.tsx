// components/cadastros/HistoricoFolhaIobModal.tsx
//
// Histórico da folha pelo Backup SQL do IOB: horas extras, faltas e DSR
// descontado de cada mês, para as médias de férias, 13º e rescisão e para o
// direito a férias (faltas). Lê o `holerith` do schema da empresa no
// navegador, mostra a prévia e só grava o que a equipe confirmar.

import React, { useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { TabelaLida } from '../../services/cadastros/cargaBackupIob';
import { codigoDoSchema, codigoIob } from '../../services/cadastros/cargaEnquadramentoIob';
import { mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { abrirRestauracao } from '../../services/iobSage/restauracao';
import { fonteDeBlob } from '../../services/iobSage/backupPostgres';
import { listarMovimentosDaEmpresa, salvarMovimentos } from '../../services/calculo/movimentosService';
import { ROTULO_MOVIMENTO } from '../../services/calculo/movimento';
import {
    CAMPOS_HISTORICO, TABELAS_HISTORICO, mesclarMovimentos, movimentosDoHolerith, naturezasDosEventos,
    type EventoResumo, type MesclaMovimento,
} from '../../services/calculo/movimentosDoBackup';

interface Props { empresa: Empresa; usuario: Usuario; fichas: FichaFuncionario[]; onFechar: () => void; onGravado: () => void }

const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const comp = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
/** Padrão: os últimos 3 anos (cobre o período aquisitivo e o concessivo das férias em aberto). */
const tresAnosAtras = () => { const d = new Date(); return `${d.getFullYear() - 3}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const HistoricoFolhaIobModal: React.FC<Props> = ({ empresa, usuario, fichas, onFechar, onGravado }) => {
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [desde, setDesde] = useState(tresAnosAtras());
    const [sexagesimal, setSexagesimal] = useState(false);
    const [previa, setPrevia] = useState<{ itens: MesclaMovimento[]; eventos: EventoResumo[]; avisos: string[]; linhas: number } | null>(null);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const nome = useMemo(() => new Map(fichas.map(f => [f.id, f.dados.nome || f.cpf])), [fichas]);

    async function ler() {
        setOcupado('Abrindo o backup do IOB…'); setErro(''); setPrevia(null);
        try {
            const rest = await abrirRestauracao(arquivos.map(f => ({ nome: f.name, fonte: fonteDeBlob(f) })));
            const codigo = codigoIob(empresa.codigoSage);
            const lidas: Record<string, TabelaLida> = {};
            for (const n of TABELAS_HISTORICO) {
                const t = rest.tabelas.find(x => x.origem === 'postgres' && x.tabela.toLowerCase() === n && codigoDoSchema(x.grupo) === codigo);
                if (!t) continue;
                setOcupado(`Lendo ${t.grupo}.${t.tabela}…`);
                const l: TabelaLida = { colunas: t.colunas, linhas: [] };
                await rest.lerTabela(t, v => { l.linhas.push(v); });
                lidas[n] = l;
            }
            if (!lidas.holerith) { setErro(`O backup não tem a tabela holerith do schema f${codigo} (empresa ${empresa.codigoSage}).`); return; }
            const naturezas = naturezasDosEventos(lidas.eventos_esocial ?? null, lidas.esocialdadosficha_s1010 ?? null);
            const h = movimentosDoHolerith(lidas.holerith, naturezas, fichas, { desde, sexagesimal });
            setOcupado('Comparando com os movimentos gravados…');
            const existentes = await listarMovimentosDaEmpresa(empresa.id, c => c >= desde);
            const avisos = [...h.avisos];
            if (!naturezas.size) avisos.unshift('Sem as rubricas do eSocial no backup (eventos_esocial/S-1010): eventos reconhecidos só pela descrição. Confira a lista abaixo.');
            setPrevia({ itens: mesclarMovimentos(h.movimentos, existentes), eventos: h.eventos, avisos, linhas: h.linhas });
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    const gravar = previa?.itens.filter(i => i.mudou && !i.erros.length) ?? [];
    const comErro = previa?.itens.filter(i => i.mudou && i.erros.length) ?? [];
    async function confirmar() {
        if (!previa) return;
        const porComp = new Map<string, MesclaMovimento[]>();
        for (const i of gravar) porComp.set(i.competencia, [...(porComp.get(i.competencia) ?? []), i]);
        try {
            let n = 0;
            for (const [c, itens] of porComp) {
                setOcupado(`Gravando ${n} de ${gravar.length}…`);
                await salvarMovimentos(empresa.id, c, itens.map(i => ({ fichaId: i.fichaId, antes: i.antes, depois: i.depois })), usuario);
                n += itens.length;
            }
            onGravado();
        } catch (e) { setErro(mensagemErro(e)); setOcupado(''); }
    }

    const preservados = previa?.itens.filter(i => i.preservados.length) ?? [];
    return (
        <div role="dialog" aria-modal="true" aria-label="Histórico da folha do IOB" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-4xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Histórico da folha pelo backup do IOB — {empresa.nomeFantasia}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Horas extras (50% e 100%), faltas e DSR descontado de cada mês, tirados dos holerites do IOB, para as médias de férias, 13º e rescisão e para o direito a férias.
                            O evento é reconhecido pela natureza da rubrica que o IOB mandou ao eSocial (1003 horas extras; 9207/9211 faltas) ou pela descrição.
                            Só preenche o que o movimento do mês ainda não tem; nada é gravado antes de você confirmar.
                        </p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                <div className="flex flex-wrap items-end gap-3 text-sm dark:text-white">
                    <label>Backup SQL do IOB<input className="block text-sm" type="file" multiple accept=".backup,.sql,.gz,.tar" aria-label="Backup do IOB" onChange={e => { setArquivos(Array.from(e.target.files ?? [])); setPrevia(null); }} /></label>
                    <label>Meses a partir de<input className={`ml-2 ${inp}`} type="month" aria-label="Meses a partir de" value={desde} onChange={e => { setDesde(e.target.value); setPrevia(null); }} /></label>
                    <label className="flex items-center gap-1" title="Marque se o IOB guarda as horas como 10,30 = 10h30.">
                        <input type="checkbox" checked={sexagesimal} onChange={e => { setSexagesimal(e.target.checked); setPrevia(null); }} />Horas no formato hh,mm
                    </label>
                    <button className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!arquivos.length || !!ocupado || !/^\d{4}-\d{2}$/.test(desde)} onClick={ler}>Ler o backup</button>
                </div>
                {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {previa && (
                    <>
                        <details open className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700 dark:text-slate-200">
                            <summary className="cursor-pointer text-sm font-medium">Eventos reconhecidos ({previa.eventos.length}) em {num(previa.linhas)} lançamento(s) desde {comp(desde)} — confira com o IOB</summary>
                            <table className="mt-1 w-full">
                                <thead className="text-left text-slate-500"><tr><th className="p-1">Evento</th><th className="p-1">Descrição</th><th className="p-1">Natureza</th><th className="p-1">Vai para</th><th className="p-1 text-right">Lançamentos</th><th className="p-1 text-right">Quantidade</th></tr></thead>
                                <tbody>{previa.eventos.map(e => (
                                    <tr key={`${e.codeven}|${e.natRubr}`} className="border-t border-slate-100 dark:border-slate-700">
                                        <td className="p-1 font-mono">{e.codeven}</td><td className="p-1">{e.descricao}</td><td className="p-1">{e.natRubr || 'pela descrição'}</td>
                                        <td className="p-1">{e.classe ? ROTULO_MOVIMENTO[e.classe] : ''}</td><td className="p-1 text-right">{e.linhas}</td><td className="p-1 text-right">{num(e.total)}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </details>
                        {comErro.length > 0 && (
                            <details open className="rounded border border-red-300 p-2 text-xs text-red-800 dark:border-red-800 dark:text-red-200">
                                <summary className="cursor-pointer font-medium">{comErro.length} mês(es) fora dos limites do movimento: não serão gravados (confira no IOB)</summary>
                                <ul className="mt-1">{comErro.map(i => <li key={`${i.fichaId}_${i.competencia}`}>{nome.get(i.fichaId)} · {comp(i.competencia)} · {i.erros.join(' ')}</li>)}</ul>
                            </details>
                        )}
                        {preservados.length > 0 && (
                            <details className="rounded border border-amber-300 p-2 text-xs dark:border-amber-700 dark:text-amber-100">
                                <summary className="cursor-pointer font-medium">{preservados.length} mês(es) já lançado(s) com outro valor: mantido o lançado</summary>
                                <ul className="mt-1">{preservados.map(i => <li key={`${i.fichaId}_${i.competencia}`}>{nome.get(i.fichaId)} · {comp(i.competencia)} · {i.preservados.map(k => ROTULO_MOVIMENTO[k]).join(', ')}</li>)}</ul>
                            </details>
                        )}
                        <div className="max-h-72 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900">
                                    <tr><th className="p-2">Funcionário</th><th className="p-2">Mês</th>{CAMPOS_HISTORICO.map(k => <th key={k} className="p-2 text-right">{ROTULO_MOVIMENTO[k]}</th>)}</tr>
                                </thead>
                                <tbody>{gravar.map(i => (
                                    <tr key={`${i.fichaId}_${i.competencia}`} className="border-t border-slate-100 dark:border-slate-700 dark:text-slate-100">
                                        <td className="p-2">{nome.get(i.fichaId)}</td><td className="p-2">{comp(i.competencia)}</td>
                                        {CAMPOS_HISTORICO.map(k => <td key={k} className="p-2 text-right">{i.depois[k] ? num(i.depois[k]!) : ''}</td>)}
                                    </tr>
                                ))}</tbody>
                            </table>
                            {!gravar.length && <p className="p-3 text-sm text-slate-500">Nada novo a gravar nesse período.</p>}
                        </div>
                        {previa.avisos.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-300">{previa.avisos.map((a, k) => <li key={k}>{a}</li>)}</ul>}
                        <div className="flex justify-end gap-2">
                            <button className={btn} onClick={onFechar}>Cancelar</button>
                            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!gravar.length || !!ocupado} onClick={confirmar}>Gravar {gravar.length} mês(es)</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default HistoricoFolhaIobModal;
