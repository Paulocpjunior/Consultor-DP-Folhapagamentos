// components/cadastros/IncidenciasCadastro.tsx
//
// Eventos do IOB × rubricas do eSocial (S-1010) da empresa: as marcas de
// incidência do IOB (IN, IR, FG) conferidas com os códigos de incidência da
// rubrica vigente na competência. Daqui sai também o S-1010 pelo Consultor
// (components/esocial/TabelaRubricasEsocial.tsx): rubrica nova, correção e exclusão.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Empresa } from '../../services/empresas/empresasTypes';
import type { EventoIobSage } from '../../services/folha/folhaTypes';
import { getCatalogo } from '../../services/folha/folhaFirestoreService';
import {
    COD_INC_CP, COD_INC_FGTS, TP_RUBR, codigoEvento, conferirIncidencias, consolidarRubricas, lerXmlRubricas, mesclarRubricas, rotuloCodigo, rotuloIrrf,
    situacaoGeral, vigenciaEm, type ItemConferencia, type MesclaRubrica, type Rubrica, type SituacaoInc,
} from '../../services/cadastros/rubricas';
import { gravarRubricasImportadas, listarRubricas, mensagemErro, salvarVinculoRubrica, type Usuario } from '../../services/cadastros/cadastrosService';
import { fontesDosArquivos } from './lerArquivosXml';
import TabelaRubricasEsocial, { type InicioS1010 } from '../esocial/TabelaRubricasEsocial';

interface Props { empresa: Empresa; usuario: Usuario }

const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const COR: Record<SituacaoInc | 'sem', string> = {
    ok: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    divergente: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    conferir: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    suspensa: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
    sem: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};
const ROTULO: Record<SituacaoInc | 'sem', string> = { ok: 'OK', divergente: 'Divergente', conferir: 'Conferir', suspensa: 'Suspensa (processo)', sem: 'Sem evento no IOB' };
const marca = (s: 'S' | 'N') => (s === 'S' ? 'S' : '–');

interface Linha { r: Rubrica; ev?: EventoIobSage; itens: ItemConferencia[]; situacao: SituacaoInc | 'sem' | 'fora' }

const IncidenciasCadastro: React.FC<Props> = ({ empresa, usuario }) => {
    const [rubricas, setRubricas] = useState<Rubrica[] | null>(null);
    const [eventos, setEventos] = useState<EventoIobSage[]>([]);
    const [erro, setErro] = useState('');
    const [competencia, setCompetencia] = useState(new Date().toISOString().slice(0, 7));
    const [filtro, setFiltro] = useState<'problemas' | 'todas'>('problemas');
    const [importar, setImportar] = useState(false);
    const [vincular, setVincular] = useState<Rubrica | null>(null);
    const [s1010, setS1010] = useState<{ inicio: InicioS1010 | null } | null>(null);

    const carregar = () => {
        setErro(''); setRubricas(null);
        listarRubricas(empresa.id).then(setRubricas).catch(e => { setErro(mensagemErro(e)); setRubricas([]); });
    };
    useEffect(carregar, [empresa.id]);
    useEffect(() => { getCatalogo().then(c => setEventos(c?.eventos ?? [])).catch(e => setErro(mensagemErro(e))); }, []);

    const porCodigo = useMemo(() => new Map(eventos.map(e => [e.codigo, e])), [eventos]);
    const linhas: Linha[] = useMemo(() => (rubricas ?? []).map(r => {
        const v = vigenciaEm(r, competencia);
        if (!v) return { r, itens: [], situacao: 'fora' as const };
        const ev = porCodigo.get(codigoEvento(r));
        if (!ev) return { r, itens: [], situacao: 'sem' as const };
        const itens = conferirIncidencias(ev, v);
        return { r, ev, itens, situacao: situacaoGeral(itens) };
    }).filter(l => l.situacao !== 'fora'), [rubricas, competencia, porCodigo]);
    const visiveis = linhas.filter(l => filtro === 'todas' || l.situacao !== 'ok');
    const contagem = linhas.reduce<Record<string, number>>((m, l) => ({ ...m, [l.situacao]: (m[l.situacao] ?? 0) + 1 }), {});

    function exportar() {
        const dados = linhas.map(l => {
            const v = vigenciaEm(l.r, competencia)!;
            return {
                'Rubrica': l.r.codRubr, 'Tabela': l.r.ideTabRubr, 'Descrição eSocial': v.dados.dscRubr, 'Natureza': v.dados.natRubr, 'Tipo eSocial': TP_RUBR[v.dados.tpRubr] ?? v.dados.tpRubr,
                'codIncCP': v.dados.codIncCP, 'codIncIRRF': v.dados.codIncIRRF, 'codIncFGTS': v.dados.codIncFGTS, 'Vigência': v.iniValid,
                'Evento IOB': l.ev?.codigo ?? '', 'Descrição IOB': l.ev?.descricao ?? '', 'Tipo IOB': l.ev?.tipo ?? '',
                'IN': l.ev?.incidencias.in ?? '', 'INF': l.ev?.incidencias.inf ?? '', 'IR': l.ev?.incidencias.ir ?? '', 'IRF': l.ev?.incidencias.irf ?? '', 'FG': l.ev?.incidencias.fg ?? '',
                'Situação': ROTULO[l.situacao as SituacaoInc | 'sem'], 'Detalhes': l.itens.filter(i => i.situacao !== 'ok').map(i => `${i.tributo}: ${i.mensagem}`).join(' | '),
            };
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), 'Incidências');
        XLSX.writeFile(wb, `incidencias-${empresa.codigoSage}-${competencia}.xlsx`);
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
                Cada rubrica que a empresa enviou ao eSocial (S-1010) ao lado do evento do IOB com o mesmo código. Se as incidências discordam, a folha do IOB e os totalizadores do eSocial (S-5001, S-5003) não fecham.
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <button className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!rubricas} onClick={() => setImportar(true)}>Importar S-1010 (XML)</button>
                <button className={btn} disabled={!rubricas} onClick={() => setS1010({ inicio: null })}>S-1010 pelo Consultor</button>
                <button className={btn} disabled={!linhas.length} onClick={exportar}>Exportar Excel</button>
                <label className="ml-auto text-sm dark:text-white">Competência <input type="month" className="ml-1 rounded border border-slate-300 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-900" value={competencia} onChange={e => setCompetencia(e.target.value)} aria-label="Competência das incidências" /></label>
                <select className="rounded border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={filtro} onChange={e => setFiltro(e.target.value as typeof filtro)} aria-label="Filtro das incidências">
                    <option value="problemas">Só o que precisa de atenção</option><option value="todas">Todas</option>
                </select>
            </div>
            {linhas.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs">
                    {(['divergente', 'conferir', 'sem', 'suspensa', 'ok'] as const).filter(s => contagem[s]).map(s => <span key={s} className={`rounded-full px-2.5 py-1 ${COR[s]}`}>{ROTULO[s]}: {contagem[s]}</span>)}
                </div>
            )}
            {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {!rubricas && !erro && <p className="text-sm text-slate-500">Carregando…</p>}
            {rubricas?.length === 0 && !erro && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">Nenhuma rubrica desta empresa. Importe os XMLs do S-1010 baixados do eSocial.</p>}
            {rubricas && rubricas.length > 0 && !linhas.length && <p className="text-sm text-slate-500">Nenhuma rubrica vigente em {competencia}.</p>}
            {visiveis.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <tr><th className="p-2">Rubrica eSocial</th><th className="p-2">INSS · IRRF · FGTS (eSocial)</th><th className="p-2">Evento IOB</th><th className="p-2" title="IN/INF, IR/IRF, FG">IOB IN · IR · FG</th><th className="p-2">Situação</th></tr>
                        </thead>
                        <tbody>
                            {visiveis.map(l => {
                                const v = vigenciaEm(l.r, competencia)!;
                                return (
                                    <tr key={l.r.id} className="border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100">
                                        <td className="p-2"><span className="font-mono">{l.r.codRubr}</span> <span className="text-xs text-slate-500">({TP_RUBR[v.dados.tpRubr] ?? v.dados.tpRubr} · nat. {v.dados.natRubr})</span><span className="block text-xs">{v.dados.dscRubr}</span></td>
                                        <td className="p-2 font-mono text-xs">
                                            <span title={rotuloCodigo(COD_INC_CP, v.dados.codIncCP, 'tabela')}>{v.dados.codIncCP}</span> · <span title={rotuloIrrf(v.dados.codIncIRRF)}>{v.dados.codIncIRRF}</span> · <span title={rotuloCodigo(COD_INC_FGTS, v.dados.codIncFGTS, 'tabela')}>{v.dados.codIncFGTS}</span>
                                        </td>
                                        <td className="p-2">
                                            {l.ev ? <><span className="font-mono">{l.ev.codigo}</span> <span className="text-xs text-slate-500">({l.ev.tipo})</span><span className="block text-xs">{l.ev.descricao}</span></> : <span className="text-xs text-slate-500">—</span>}
                                            <button className="block text-xs text-blue-700 underline dark:text-blue-300" onClick={() => setVincular(l.r)}>{l.r.eventoIob ? `vínculo manual: ${l.r.eventoIob}` : 'ligar a outro evento'}</button>
                                        </td>
                                        <td className="p-2 font-mono text-xs">{l.ev ? `${marca(l.ev.incidencias.in === 'S' || l.ev.incidencias.inf === 'S' ? 'S' : 'N')} · ${marca(l.ev.incidencias.ir === 'S' || l.ev.incidencias.irf === 'S' ? 'S' : 'N')} · ${marca(l.ev.incidencias.fg)}` : ''}</td>
                                        <td className="p-2 text-xs">
                                            <span className={`rounded px-2 py-0.5 ${COR[l.situacao as SituacaoInc | 'sem']}`}>{ROTULO[l.situacao as SituacaoInc | 'sem']}</span>
                                            <ul className="mt-1 space-y-0.5">{l.itens.filter(i => i.situacao !== 'ok').map(i => <li key={i.tributo}><strong>{i.tributo}:</strong> {i.mensagem}</li>)}</ul>
                                            {l.situacao !== 'ok' && <button className="mt-1 block text-blue-700 underline dark:text-blue-300" onClick={() => setS1010({ inicio: { acao: 'alteracao', rubrica: l.r, competencia } })}>Corrigir no eSocial (S-1010)</button>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {importar && rubricas && <ImportarS1010Modal empresa={empresa} existentes={rubricas} usuario={usuario} onFechar={() => setImportar(false)} onGravado={() => { setImportar(false); carregar(); }} />}
            {s1010 && rubricas && <TabelaRubricasEsocial empresa={empresa} usuario={usuario} rubricas={rubricas} inicio={s1010.inicio} onFechar={() => setS1010(null)} onAtualizado={() => { listarRubricas(empresa.id).then(setRubricas).catch(e => setErro(mensagemErro(e))); }} />}
            {vincular && <VinculoModal r={vincular} eventos={porCodigo} usuario={usuario} onFechar={() => setVincular(null)} onSalvo={() => { setVincular(null); carregar(); }} />}
        </div>
    );
};

const VinculoModal: React.FC<{ r: Rubrica; eventos: Map<string, EventoIobSage>; usuario: Usuario; onFechar: () => void; onSalvo: () => void }> = ({ r, eventos, usuario, onFechar, onSalvo }) => {
    const [codigo, setCodigo] = useState(r.eventoIob);
    const [erro, setErro] = useState('');
    const alvo = codigo ? eventos.get(codigo.padStart(4, '0')) : undefined;
    async function salvar() {
        if (codigo && !alvo) { setErro('Evento não existe no catálogo do IOB.'); return; }
        try { await salvarVinculoRubrica(r, codigo ? codigo.padStart(4, '0') : '', usuario); onSalvo(); }
        catch (e) { setErro(mensagemErro(e)); }
    }
    return (
        <div role="dialog" aria-modal="true" aria-label="Vínculo da rubrica" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <h3 className="font-semibold text-slate-800 dark:text-white">Rubrica {r.codRubr} → evento do IOB</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300">Vazio = ligar pelo próprio código da rubrica. Use quando o código no eSocial não é o código do evento no IOB.</p>
                <input className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white" value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Código do evento IOB" placeholder="ex.: 0001" />
                {alvo && <p className="text-sm text-green-700 dark:text-green-400">{alvo.codigo} · {alvo.descricao} ({alvo.tipo})</p>}
                {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
                <div className="flex justify-end gap-2"><button className={btn} onClick={onFechar}>Cancelar</button><button className="rounded bg-blue-700 px-4 py-2 text-sm text-white" onClick={salvar}>Gravar</button></div>
            </div>
        </div>
    );
};

const ImportarS1010Modal: React.FC<{ empresa: Empresa; existentes: Rubrica[]; usuario: Usuario; onFechar: () => void; onGravado: () => void }> = ({ empresa, existentes, usuario, onFechar, onGravado }) => {
    const [arquivos, setArquivos] = useState<File[]>([]);
    const [previa, setPrevia] = useState<{ itens: MesclaRubrica[]; avisos: string[]; nomes: string[] } | null>(null);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');

    async function ler() {
        setOcupado('Lendo os XMLs…'); setErro('');
        try {
            const { fontes, problemas } = await fontesDosArquivos(arquivos);
            const lidos = fontes.map(f => lerXmlRubricas(f.nome, f.xml, empresa.cnpj.slice(0, 8)));
            const c = consolidarRubricas(lidos.flatMap(l => l.eventos), empresa.id);
            setPrevia({ itens: mesclarRubricas(c.rubricas, existentes), avisos: [...problemas, ...lidos.flatMap(l => l.avisos), ...c.avisos], nomes: fontes.map(f => f.nome) });
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }
    const gravar = previa?.itens.filter(i => i.mudou) ?? [];
    async function confirmar() {
        if (!previa) return;
        setOcupado('Gravando…'); setErro('');
        try { await gravarRubricasImportadas(gravar, existentes, usuario, previa.nomes); onGravado(); }
        catch (e) { setErro(mensagemErro(e)); setOcupado(''); }
    }
    return (
        <div role="dialog" aria-modal="true" aria-label="Importar S-1010" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-4xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Importar rubricas (S-1010) — {empresa.nomeFantasia}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">XMLs do S-1010 baixados do eSocial, soltos ou em .zip. Inclusões, alterações e exclusões são aplicadas na ordem de processamento. Só eventos com recibo entram; nada é gravado antes de você confirmar.</p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <input className="text-sm dark:text-white" type="file" multiple accept=".xml,.zip" onChange={e => { setArquivos(Array.from(e.target.files ?? [])); setPrevia(null); }} aria-label="XMLs do S-1010" />
                    <button className="rounded bg-blue-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={!arquivos.length || !!ocupado} onClick={ler}>Ler arquivos</button>
                </div>
                {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {previa && (
                    <>
                        <p className="text-sm dark:text-white">{previa.itens.length} rubrica(s) nos arquivos: {previa.itens.filter(i => i.novo).length} nova(s), {previa.itens.filter(i => !i.novo && i.mudou).length} atualizada(s), {previa.itens.filter(i => !i.mudou).length} sem mudança.</p>
                        <div className="max-h-72 overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Rubrica</th><th className="p-2">Descrição</th><th className="p-2">Vigências</th><th className="p-2">Situação</th></tr></thead>
                                <tbody>{previa.itens.map(i => (
                                    <tr key={i.rubrica.id} className="border-t border-slate-100 dark:border-slate-700 dark:text-slate-100">
                                        <td className="p-2 font-mono">{i.rubrica.codRubr}</td>
                                        <td className="p-2">{i.rubrica.vigencias[i.rubrica.vigencias.length - 1].dados.dscRubr}</td>
                                        <td className="p-2 text-xs">{i.rubrica.vigencias.map(v => `${v.iniValid}${v.fimValid ? ` a ${v.fimValid}` : ''}`).join('; ')}</td>
                                        <td className="p-2 text-xs">{i.novo ? 'Nova' : i.mudou ? 'Atualizada' : 'Sem mudança'}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                            {!previa.itens.length && <p className="p-3 text-sm text-slate-500">Nenhuma rubrica desta empresa nos arquivos.</p>}
                        </div>
                        {previa.avisos.length > 0 && (
                            <details open={!previa.itens.length} className="text-xs text-slate-600 dark:text-slate-300">
                                <summary className="cursor-pointer">Avisos da leitura ({previa.avisos.length})</summary>
                                <ul className="mt-1 list-disc pl-5">{previa.avisos.map((a, k) => <li key={k}>{a}</li>)}</ul>
                            </details>
                        )}
                        <div className="flex justify-end gap-2">
                            <button className={btn} onClick={onFechar}>Cancelar</button>
                            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!gravar.length || !!ocupado} onClick={confirmar}>Gravar {gravar.length} rubrica(s)</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default IncidenciasCadastro;
