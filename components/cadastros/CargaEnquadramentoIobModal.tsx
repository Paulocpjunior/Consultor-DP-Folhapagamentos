// components/cadastros/CargaEnquadramentoIobModal.tsx
//
// Cadastros › Enquadramento › "Carregar do backup do IOB": propõe o
// enquadramento (regime, RAT, FAP por período e, quando houver, FPAS e
// terceiros) de TODAS as empresas da carteira a partir do backup do FolhaWin
// aberto no navegador. A equipe confere e grava; nada é sobrescrito.

import React, { useEffect, useMemo, useState } from 'react';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { fonteDeBlob } from '../../services/iobSage/backupPostgres';
import { abrirRestauracao, type Restauracao, type TabelaRestauracao } from '../../services/iobSage/restauracao';
import type { TabelaLida } from '../../services/cadastros/cargaBackupIob';
import {
    aplicarFpasPadrao, codigoDoSchema, gravavel, proporEnquadramentos, sugestoesTerceiros,
    type PropostaEnquadramento, type ResultadoCargaEnq, type TabelasEnquadramento,
} from '../../services/cadastros/cargaEnquadramentoIob';
import { REGIMES, numeroDeTexto } from '../../services/cadastros/enquadramento';
import { gravarEnquadramentosEmLote, listarTodosEnquadramentos, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';

interface Props { usuario: Usuario; onFechar: () => void; onGravado: () => void }

const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white';
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const comp = (c: string) => c.split('-').reverse().join('/');
const chave = (p: PropostaEnquadramento) => p.enquadramento.id;
type Filtro = 'prontas' | 'pendencias' | 'cadastradas' | 'erros';

/** Tabela pelo nome: prefere a do diretório "empresa" do FolhaWin (há cópias em subpastas). */
export function acharTabela(r: Restauracao, nome: string): TabelaRestauracao | null {
    const c = r.tabelas.filter(t => t.tabela.toUpperCase() === nome.toUpperCase());
    return c.find(t => /(^|\/)empresa$/i.test(t.grupo)) ?? c[0] ?? null;
}

const CargaEnquadramentoIobModal: React.FC<Props> = ({ usuario, onFechar, onGravado }) => {
    const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
    const [res, setRes] = useState<ResultadoCargaEnq | null>(null);
    const [terc, setTerc] = useState<TabelaLida | null>(null);
    const [marcados, setMarcados] = useState<Set<string>>(new Set());
    const [filtro, setFiltro] = useState<Filtro>('prontas');
    const [padrao, setPadrao] = useState({ fpas: '', codigoTerceiros: '', terceiros: '' });
    const [corte, setCorte] = useState(`${new Date().getFullYear() - 1}-01`);
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');

    useEffect(() => { listarEmpresasVisiveis().then(setEmpresas).catch(e => { setErro(mensagemErro(e)); setEmpresas([]); }); }, []);

    async function abrir(lista: File[]) {
        if (!lista.length || !empresas) return;
        setOcupado('Abrindo o backup…'); setErro(''); setRes(null);
        try {
            const r = await abrirRestauracao(lista.map(f => ({ nome: f.name, fonte: fonteDeBlob(f) })));
            const ler = async (t: TabelaRestauracao | null): Promise<TabelaLida | null> => {
                if (!t) return null;
                setOcupado(`Lendo ${t.tabela}…`);
                const l: TabelaLida = { colunas: t.colunas, linhas: [] };
                await r.lerTabela(t, v => { l.linhas.push(v); });
                return l;
            };
            const tabelas: TabelasEnquadramento = {
                es1005: await ler(acharTabela(r, 'ES_S1005')), esocialEmpresa: await ler(acharTabela(r, 'ESOCIALEMPRESA')),
                es1000: await ler(acharTabela(r, 'ES_S1000')), terc: await ler(acharTabela(r, 'TERC')), schemas: [],
            };
            // Schemas fNNNN do .backup da folha: um por empresa.
            const doSchema = (grupo: string, nome: string) => r.tabelas.find(x => x.grupo === grupo && x.tabela.toLowerCase() === nome) ?? null;
            for (const grupo of [...new Set(r.tabelas.map(x => x.grupo))].filter(g => codigoDoSchema(g))) {
                const [depto, deptoMa, s1000] = [doSchema(grupo, 'depto'), doSchema(grupo, 'depto_ma'), doSchema(grupo, 'esocialdadosficha_s1000')];
                if (depto || deptoMa || s1000) tabelas.schemas!.push({ grupo, depto: await ler(depto), deptoMa: await ler(deptoMa), s1000: await ler(s1000) });
            }
            if (!tabelas.es1005 && !tabelas.esocialEmpresa && !tabelas.es1000 && !tabelas.schemas!.length) {
                setErro('O backup não tem as tabelas do enquadramento: abra o .zip do FolhaWin (pasta "empresa") ou o .backup da folha (schemas fNNNN).');
                return;
            }
            setOcupado('Conferindo com o cadastro…');
            const existentes = await listarTodosEnquadramentos();
            const resultado = proporEnquadramentos(tabelas, empresas.map(e => ({ id: e.id, nome: e.nomeFantasia || e.razaoSocial, cnpj: e.cnpj, codigoSage: e.codigoSage ?? '' })), existentes, corte);
            setTerc(tabelas.terc ?? null); setRes(resultado);
            setMarcados(new Set(resultado.propostas.filter(p => gravavel(p) && !p.pendencias.length).map(chave)));
        } catch (e) { setErro((e as Error).message); }
        finally { setOcupado(''); }
    }

    const terceirosPadrao = numeroDeTexto(padrao.terceiros || '0');
    const propostas = useMemo(() => (res?.propostas ?? []).map(p => (/^\d{3}$/.test(padrao.fpas) && Number.isFinite(terceirosPadrao)
        ? aplicarFpasPadrao(p, { fpas: padrao.fpas, codigoTerceiros: padrao.codigoTerceiros, terceiros: terceirosPadrao }) : p)), [res, padrao, terceirosPadrao]);
    // Falta só o FPAS: o FPAS padrão resolve, então fica em "com pendência".
    const soFaltaFpas = (p: PropostaEnquadramento) => p.erros.length > 0 && p.erros.every(x => x === 'FPAS: 3 dígitos.');
    const grupo = (p: PropostaEnquadramento): Filtro => (p.existente ? 'cadastradas' : p.erros.length && !soFaltaFpas(p) ? 'erros' : p.erros.length || p.pendencias.length ? 'pendencias' : 'prontas');
    const contagem = propostas.reduce((m, p) => ({ ...m, [grupo(p)]: (m[grupo(p)] ?? 0) + 1 }), {} as Record<Filtro, number>);
    const lista = propostas.filter(p => grupo(p) === filtro);
    const selecionadas = propostas.filter(p => marcados.has(chave(p)) && gravavel(p));
    const sugestoes = useMemo(() => sugestoesTerceiros(terc), [terc]);
    // Conta pela proposta original: com o FPAS padrão aplicado, o campo continua na tela para ser trocado.
    const semFpas = (res?.propostas ?? []).filter(p => p.enquadramento.regime === 'normal' && !p.enquadramento.fpas).length;

    async function gravar() {
        if (!selecionadas.length) return;
        if (!window.confirm(`Gravar ${selecionadas.length} enquadramento(s)?`)) return;
        setOcupado(`Gravando 0 de ${selecionadas.length}…`); setErro('');
        try {
            await gravarEnquadramentosEmLote(selecionadas.map(p => p.enquadramento), usuario, 'Backup IOB (ES_S1005, ESOCIALEMPRESA, ES_S1000)', n => setOcupado(`Gravando ${n} de ${selecionadas.length}…`));
            onGravado();
        } catch (e) { setErro(mensagemErro(e)); setOcupado(''); }
    }

    const marcarTodas = (sim: boolean) => setMarcados(m => { const n = new Set(m); for (const p of lista) if (gravavel(p)) { if (sim) n.add(chave(p)); else n.delete(chave(p)); } return n; });

    return (
        <div role="dialog" aria-modal="true" aria-label="Carregar enquadramento do backup do IOB" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-6xl space-y-3 rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Carregar enquadramento do backup do IOB</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Para todas as empresas da sua carteira, pelo código SAGE. Abra o .zip do FolhaWin (regime, RAT, CNAE e FAP de todas as empresas) e/ou o .backup da folha (por empresa: FPAS, terceiros, RAT e FAP mês a mês do depto_ma e a classificação tributária do S-1000).
                            O FPAS e os terceiros ficam na folha de cada empresa e só vêm com o Backup SQL completo; sem ele, informe o FPAS padrão abaixo para quem você marcar. Enquadramento já cadastrado não é trocado.
                        </p>
                    </div>
                    <button aria-label="Fechar" className="rounded px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>

                <div className="flex flex-wrap items-end gap-3 text-sm dark:text-white">
                    <label>Arquivos do backup
                        <input className="block text-sm" type="file" multiple aria-label="Arquivos do backup do IOB" disabled={!!ocupado || !empresas}
                            onChange={e => { const l = Array.from(e.target.files ?? []); e.target.value = ''; void abrir(l); }} />
                    </label>
                    <label>Períodos do FAP a partir de
                        <input aria-label="Períodos a partir de" type="month" className={`ml-2 ${inp}`} value={corte} onChange={e => setCorte(e.target.value)} disabled={!!res} />
                    </label>
                </div>

                {ocupado && <p className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
                {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}

                {res && (
                    <>
                        {semFpas > 0 && (
                            <fieldset className="flex flex-wrap items-end gap-2 rounded border border-amber-300 p-2 text-sm dark:border-amber-700 dark:text-white">
                                <legend className="px-1 text-xs font-medium">FPAS padrão para as {semFpas} proposta(s) do regime normal sem FPAS no backup</legend>
                                {sugestoes.length > 0 && (
                                    <label>Da tabela TERC do IOB
                                        <select aria-label="Sugestão da TERC" className={`ml-2 ${inp}`} value="" onChange={e => { const s = sugestoes[Number(e.target.value)]; if (s) setPadrao({ fpas: s.fpas, codigoTerceiros: s.codigo, terceiros: Number.isFinite(s.percentual) ? num(s.percentual) : '' }); }}>
                                            <option value="">— escolher —</option>
                                            {sugestoes.map((s, i) => <option key={i} value={i}>FPAS {s.fpas} · {s.codigo || '—'} · {Number.isFinite(s.percentual) ? `${num(s.percentual)}%` : '?'}{s.descricao ? ` · ${s.descricao}` : ''}</option>)}
                                        </select>
                                    </label>
                                )}
                                <label>FPAS<input aria-label="FPAS padrão" className={`ml-1 w-16 ${inp}`} value={padrao.fpas} onChange={e => setPadrao({ ...padrao, fpas: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></label>
                                <label>Código de terceiros<input aria-label="Código de terceiros padrão" className={`ml-1 w-20 ${inp}`} value={padrao.codigoTerceiros} onChange={e => setPadrao({ ...padrao, codigoTerceiros: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
                                <label>Terceiros (%)<input aria-label="Terceiros padrão" className={`ml-1 w-20 ${inp}`} value={padrao.terceiros} onChange={e => setPadrao({ ...padrao, terceiros: e.target.value })} /></label>
                                <span className="text-xs text-slate-600 dark:text-slate-300">Vale só para quem você marcar; cada uma fica com a pendência "FPAS padrão aplicado: conferir".</span>
                            </fieldset>
                        )}

                        <div role="group" aria-label="Filtros" className="flex flex-wrap gap-2">
                            {([['prontas', 'Prontas'], ['pendencias', 'Com pendência'], ['cadastradas', 'Já cadastradas'], ['erros', 'Com erro']] as [Filtro, string][]).map(([f, r]) => (
                                <button key={f} aria-pressed={filtro === f} onClick={() => setFiltro(f)}
                                    className={`rounded-full border px-3 py-1 text-xs ${filtro === f ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`}>{r} ({contagem[f] ?? 0})</button>
                            ))}
                            {(filtro === 'prontas' || filtro === 'pendencias') && <>
                                <button className="text-xs text-blue-700 underline dark:text-blue-300" onClick={() => marcarTodas(true)}>marcar todas</button>
                                <button className="text-xs text-blue-700 underline dark:text-blue-300" onClick={() => marcarTodas(false)}>desmarcar</button>
                            </>}
                        </div>

                        <div className="max-h-[50vh] overflow-auto rounded border border-slate-200 dark:border-slate-700">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2" /><th className="p-2">Empresa</th><th className="p-2">Vigência</th><th className="p-2">Regime</th><th className="p-2">RAT × FAP</th><th className="p-2">FPAS · terceiros</th><th className="p-2">Conferir</th></tr></thead>
                                <tbody>
                                    {lista.map(p => {
                                        const e = p.enquadramento;
                                        return (
                                            <tr key={chave(p)} className="border-t border-slate-100 align-top dark:border-slate-700 dark:text-slate-100">
                                                <td className="p-2">{gravavel(p) && <input type="checkbox" aria-label={`Gravar ${p.empresa.nome} ${comp(e.vigencia)}`} checked={marcados.has(chave(p))}
                                                    onChange={x => setMarcados(m => { const n = new Set(m); if (x.target.checked) n.add(chave(p)); else n.delete(chave(p)); return n; })} />}</td>
                                                <td className="p-2"><strong>{p.empresa.nome}</strong><span className="block text-xs text-slate-500">SAGE {p.empresa.codigoSage}</span></td>
                                                <td className="p-2">{comp(e.vigencia)}</td>
                                                <td className="p-2 text-xs">{REGIMES[e.regime].split(':')[0]}</td>
                                                <td className="p-2 text-xs">{e.regime === 'simples' ? '—' : `${e.rat}% × ${e.fap.toFixed(4).replace('.', ',')}`}</td>
                                                <td className="p-2 text-xs">{e.regime === 'normal' ? (e.fpas ? `${e.fpas} · ${e.codigoTerceiros || '—'} · ${num(e.terceiros)}%` : 'sem FPAS') : '—'}</td>
                                                <td className="p-2 text-xs">
                                                    {p.erros.map(x => <span key={x} className="block text-red-700 dark:text-red-300">{x}</span>)}
                                                    {p.diferencas.map(x => <span key={x} className="block text-amber-700 dark:text-amber-300">{x}</span>)}
                                                    {p.existente && !p.diferencas.length && <span className="block text-slate-500">Já cadastrado igual.</span>}
                                                    {p.pendencias.map(x => <span key={x} className="block text-slate-600 dark:text-slate-300">{x}</span>)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {!lista.length && <p className="p-3 text-sm text-slate-500">Nada neste filtro.</p>}
                        </div>

                        {(res.semDados.length > 0 || res.semEmpresa.length > 0 || res.avisos.length > 0) && (
                            <details className="rounded border border-slate-200 p-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                                <summary className="cursor-pointer font-medium">Sem correspondência e avisos</summary>
                                {res.semDados.length > 0 && <p className="mt-1">Empresas da carteira sem dado no backup ({res.semDados.length}): {res.semDados.map(e => `${e.nome} (SAGE ${e.codigoSage || '—'})`).join('; ')}.</p>}
                                {res.semEmpresa.length > 0 && <p className="mt-1">Códigos do IOB sem empresa no Consultor ou fora da sua carteira ({res.semEmpresa.length}): {res.semEmpresa.slice(0, 200).join(', ')}{res.semEmpresa.length > 200 ? '…' : ''}.</p>}
                                {res.avisos.map(a => <p key={a} className="mt-1">{a}</p>)}
                            </details>
                        )}

                        <div className="flex justify-end gap-2">
                            <button className={btn} onClick={onFechar}>Cancelar</button>
                            <button className="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!selecionadas.length || !!ocupado} onClick={gravar}>Gravar {selecionadas.length} enquadramento(s)</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CargaEnquadramentoIobModal;
