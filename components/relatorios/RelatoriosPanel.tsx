// components/relatorios/RelatoriosPanel.tsx
//
// Central de relatórios da empresa ativa: os modelos do SAGE (Mensais, Funcionários, Férias) no layout do
// Consultor, com visualizar e imprimir, PDF, Excel e envio ao cliente (e-mail do escritório e WhatsApp).
// Os relatórios da folha usam a folha gravada do mês (Folha do mês › Cálculo mensal › Gravar a folha do mês).

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { User } from '../../types';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarAfastamentos, listarEnquadramentos, listarFuncionarios, mensagemErro } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { Enquadramento } from '../../services/cadastros/enquadramento';
import { enquadramentoVigente } from '../../services/cadastros/enquadramento';
import { lerFolhaGravada, lerFolhasDoAno } from '../../services/calculo/folhaGravadaService';
import { avisosDeFerias, fichasFinanceiras, MESES_CURTOS, mesesSemFolha, type FolhaDoMes } from '../../services/relatorios/relatoriosAnuais';
import type { FolhaGravada } from '../../services/calculo/folhaGravada';
import { motorHomologadoNoMes } from '../../services/calculo/arredondamento';
import { resumirFolha } from '../../services/relatorios/resumoFolha';
import { GRUPOS_RELATORIO, RELATORIOS, type ContextoRelatorio, type DefRelatorio } from '../../services/relatorios/catalogoRelatorios';
import { tabelaPdf, type OpcoesPdf } from '../../services/relatorios/layoutPdf';
import EntregaRelatorio, { type ArquivoRelatorio } from './EntregaRelatorio';

const relatoriosPdf = () => import('../../services/relatorios/holeritePdf');
const anuaisPdf = () => import('../../services/relatorios/relatoriosAnuaisPdf');
const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
const ICONE_GRUPO: Record<string, string> = { Mensais: '🧾', 'Funcionários': '👥', 'Férias': '🌴', Anuais: '📅' };
const brData = (d: string) => d.split('-').reverse().join('/');

interface Dados { empresa: Empresa | undefined; fichas: FichaFuncionario[]; afastamentos: Afastamento[]; enquadramentos: Enquadramento[]; folha: FolhaGravada | null }

const RelatoriosPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const { ativa } = useEmpresaAtiva();
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState('');
    const [selId, setSelId] = useState(RELATORIOS[0].id);
    const [orientacao, setOrientacao] = useState<'auto' | 'retrato' | 'paisagem'>('auto');
    const [enviar, setEnviar] = useState(false);
    const [gerando, setGerando] = useState(false);
    const [ano, setAno] = useState(() => ativa?.competencia.slice(0, 4) ?? String(new Date().getFullYear()));
    const [fichaAnual, setFichaAnual] = useState('');
    const [folhasAno, setFolhasAno] = useState<FolhaDoMes[] | null>(null);

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setDados(null); setErro('');
        Promise.all([listarEmpresasVisiveis(), listarFuncionarios(ativa.id), listarAfastamentos(ativa.id), listarEnquadramentos(ativa.id).catch(() => []), lerFolhaGravada(ativa.id, ativa.competencia).catch(() => null)])
            .then(([emps, fichas, afastamentos, enquadramentos, folha]) => { if (vivo) setDados({ empresa: emps.find(e => e.id === ativa.id), fichas, afastamentos, enquadramentos, folha }); })
            .catch(e => { if (vivo) setErro(mensagemErro(e)); });
        return () => { vivo = false; };
    }, [ativa]);

    const sel = RELATORIOS.find(r => r.id === selId)!;
    // Ficha financeira: as folhas gravadas do ano escolhido, lidas quando o relatório é aberto.
    useEffect(() => {
        if (!ativa || sel.tipo !== 'ficha-financeira') return;
        let vivo = true;
        setFolhasAno(null);
        lerFolhasDoAno(ativa.id, ano).then(l => { if (vivo) setFolhasAno(l.map(f => ({ competencia: f.competencia, holerites: f.holerites }))); }).catch(e => { if (vivo) { setErro(mensagemErro(e)); setFolhasAno([]); } });
        return () => { vivo = false; };
    }, [ativa, sel.tipo, ano]);
    const ctx = useMemo((): ContextoRelatorio | null => (ativa && dados ? {
        competencia: ativa.competencia, hoje: new Date().toLocaleDateString('sv-SE'), fichas: dados.fichas, afastamentos: dados.afastamentos, folha: dados.folha?.holerites ?? null,
    } : null), [ativa, dados]);
    if (!ativa) return <p className="text-sm text-slate-500">Ative uma empresa e um período.</p>;

    const comp = ativa.competencia.split('-').reverse().join('/');
    const faltaFolha = (sel.precisaFolha && !dados?.folha) || (sel.tipo === 'ficha-financeira' && !folhasAno);
    const fichas = folhasAno ? fichasFinanceiras(ano, folhasAno, fichaAnual || undefined) : [];
    const semFolha = folhasAno ? mesesSemFolha(ano, folhasAno, ativa.competencia) : [];
    const avisos = dados && sel.tipo === 'aviso-ferias' ? avisosDeFerias(ativa.competencia, new Date().toLocaleDateString('sv-SE'), dados.fichas, dados.afastamentos) : [];
    const dadosDaFicha = (fichaId: string) => {
        const f = dados?.fichas.find(x => x.id === fichaId);
        return f ? [`Matrícula ${f.matriculaEsocial}`, `CPF ${f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`, f.dados.admissao && `admissão ${brData(f.dados.admissao)}`, f.dados.cargo, f.dados.dataDesligamento && `desligamento ${brData(f.dados.dataDesligamento)}`].filter(Boolean).join(' · ') : '';
    };
    const opcoes = (d: DefRelatorio): OpcoesPdf => ({
        empresa: { razaoSocial: dados?.empresa?.razaoSocial || ativa.nome, cnpj: ativa.cnpj.replace(/\D/g, ''), codigoSage: ativa.codigoSage },
        titulo: d.titulo, previa: d.precisaFolha && !motorHomologadoNoMes(dados?.empresa?.parametrosFolha, ativa.competencia), emitidoPor: currentUser.email,
        orientacao: orientacao === 'auto' ? d.orientacao ?? 'retrato' : orientacao,
    });
    const nomeArquivo = (d: DefRelatorio) => `${d.id}-${ativa.codigoSage || 'empresa'}-${d.tipo === 'ficha-financeira' ? ano : ativa.competencia}.pdf`;

    async function gerarPdf(d: DefRelatorio) {
        if (!ctx || !dados) throw new Error('Carregando os dados da empresa…');
        const o = opcoes(d);
        if (d.tipo === 'tabela') return tabelaPdf(d.montar!(ctx), o, `Competência ${comp}`);
        if (d.tipo === 'ficha-financeira') {
            const obs = `Pelas folhas mensais gravadas (Folha do mês › Cálculo mensal › Gravar a folha do mês).${semFolha.length ? ` Meses sem folha gravada: ${semFolha.join(', ')}.` : ''} Férias, 13º e rescisão pagos fora da folha mensal ainda não entram.`;
            return (await anuaisPdf()).fichaFinanceiraPdf(fichas, ano, o, obs, dadosDaFicha);
        }
        if (d.tipo === 'aviso-ferias') return (await anuaisPdf()).avisoFeriasPdf(avisos, { ...o, previa: false }, { razaoSocial: dados.empresa?.razaoSocial || ativa!.nome });
        const p = await relatoriosPdf();
        const folha = dados.folha?.holerites ?? [];
        if (d.tipo === 'holerites') return p.holeritesPdf(folha, dados.fichas, o);
        const enq = enquadramentoVigente(dados.enquadramentos, ativa!.id, ativa!.competencia);
        return p.resumoPdf(resumirFolha(folha, 'enquadramento' in enq ? enq.enquadramento : undefined), o, '');
    }
    const arquivo = async (): Promise<ArquivoRelatorio> => ({ nome: nomeArquivo(sel), bytes: new Uint8Array((await gerarPdf(sel)).output('arraybuffer')) });
    const agir = async (f: () => Promise<void>) => { setGerando(true); setErro(''); try { await f(); } catch (e) { setErro((e as Error).message); } finally { setGerando(false); } };
    const abrir = (imprimir: boolean) => agir(async () => { const doc = await gerarPdf(sel); if (imprimir) doc.autoPrint(); window.open(doc.output('bloburl') as unknown as string, '_blank'); });
    const baixar = () => agir(async () => { (await gerarPdf(sel)).save(nomeArquivo(sel)); });
    const excel = () => agir(async () => {
        if (!ctx) return;
        if (sel.tipo === 'ficha-financeira') {
            const linhas = fichas.flatMap(f => f.linhas.map(l => [f.nome, l.codigo, l.descricao, ...l.meses.map(v => (v === null ? '' : v / 100)), l.total / 100]));
            const ws = XLSX.utils.aoa_to_sheet([[sel.titulo, '', `Ano ${ano}`], [dados?.empresa?.razaoSocial || ativa.nome], [], ['Funcionário', 'Código', 'Descrição', ...MESES_CURTOS, 'Total'], ...linhas]);
            const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Ficha financeira');
            XLSX.writeFile(wb, nomeArquivo(sel).replace(/\.pdf$/, '.xlsx'));
            return;
        }
        if (!sel.montar) return;
        const t = sel.montar(ctx);
        const ws = XLSX.utils.aoa_to_sheet([[sel.titulo, '', `Competência ${comp}`], [dados?.empresa?.razaoSocial || ativa.nome], [], t.colunas.map(c => c.titulo), ...t.linhas, ...(t.totais ? [t.totais] : [])]);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
        XLSX.writeFile(wb, nomeArquivo(sel).replace(/\.pdf$/, '.xlsx'));
    });

    return (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
            <nav aria-label="Modelos de relatório" className="space-y-4">
                {GRUPOS_RELATORIO.map(g => (
                    <div key={g}>
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{ICONE_GRUPO[g]} {g}</p>
                        <ul className="space-y-1">
                            {RELATORIOS.filter(r => r.grupo === g).map(r => (
                                <li key={r.id}>
                                    <button onClick={() => { setSelId(r.id); setEnviar(false); }} aria-current={r.id === selId}
                                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${r.id === selId ? 'bg-teal-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                                        {r.titulo}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </nav>
            <section aria-label={sel.titulo} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{sel.titulo}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{sel.descricao} Competência {comp}.</p>
                </div>
                {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {!dados && !erro && <p className="text-sm text-slate-500">Carregando os dados da empresa…</p>}
                {dados && faltaFolha && (
                    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
                        A folha de {comp} ainda não foi gravada. Em Folha do mês › Cálculo mensal, salve o movimento e clique em "Gravar a folha do mês": os relatórios da folha saem dela.
                    </p>
                )}
                {sel.tipo === 'ficha-financeira' && (
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs text-slate-600 dark:text-slate-300">Ano
                            <select aria-label="Ano" className="mt-0.5 block rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" value={ano} onChange={e => setAno(e.target.value)}>
                                {Array.from({ length: 4 }, (_, i) => String(Number(ativa.competencia.slice(0, 4)) - i)).map(a => <option key={a} value={a}>{a}</option>)}
                            </select>
                        </label>
                        <label className="text-xs text-slate-600 dark:text-slate-300">Funcionário
                            <select aria-label="Funcionário" className="mt-0.5 block rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" value={fichaAnual} onChange={e => setFichaAnual(e.target.value)}>
                                <option value="">Todos ({folhasAno ? fichasFinanceiras(ano, folhasAno).length : '…'})</option>
                                {folhasAno && fichasFinanceiras(ano, folhasAno).map(f => <option key={f.fichaId} value={f.fichaId}>{f.nome}</option>)}
                            </select>
                        </label>
                        {!folhasAno && <span className="text-sm text-slate-500">Lendo as folhas gravadas de {ano}…</span>}
                        {folhasAno && <span className="text-xs text-slate-500">{12 - mesesSemFolha(ano, folhasAno, `${ano}-12`).length} mês(es) com folha gravada{semFolha.length ? ` · sem folha: ${semFolha.join(', ')}` : ''}</span>}
                    </div>
                )}
                {sel.tipo === 'aviso-ferias' && dados && (
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                        {avisos.length ? <p>{avisos.length} aviso(s): {avisos.map(a => `${a.nome} (${brData(a.inicio)})`).join(', ')}.</p> : <p>Nenhum gozo de férias começa em {comp} ou no mês seguinte (Cadastros › Afastamentos, motivo 15).</p>}
                        {avisos.some(a => a.avisoForaDoPrazo) && <p className="mt-1 rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">Fora do prazo de 30 dias (art. 135): {avisos.filter(a => a.avisoForaDoPrazo).map(a => a.nome).join(', ')}. O aviso sai com a data de hoje.</p>}
                    </div>
                )}
                {dados?.folha && sel.precisaFolha && <p className="text-xs text-slate-500">Folha gravada por {dados.folha.gravadoPorEmail}: {dados.folha.totais.funcionarios} holerite(s).</p>}
                <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs text-slate-600 dark:text-slate-300">Orientação
                        <select aria-label="Orientação" className="mt-0.5 block rounded-lg border border-slate-300 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-950" value={orientacao} onChange={e => setOrientacao(e.target.value as typeof orientacao)}>
                            <option value="auto">Padrão do modelo ({sel.orientacao === 'paisagem' ? 'paisagem' : 'retrato'})</option><option value="retrato">Retrato</option><option value="paisagem">Paisagem</option>
                        </select>
                    </label>
                    <button className={btn} disabled={!dados || faltaFolha || gerando} onClick={() => abrir(false)}>Visualizar</button>
                    <button className={btn} disabled={!dados || faltaFolha || gerando} onClick={() => abrir(true)}>Imprimir</button>
                    <button className={btn} disabled={!dados || faltaFolha || gerando} onClick={baixar}>Baixar PDF</button>
                    {(sel.tipo === 'tabela' || sel.tipo === 'ficha-financeira') && <button className={btn} disabled={!dados || faltaFolha || gerando} onClick={excel}>Excel</button>}
                    <button className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-500 disabled:opacity-50" disabled={!dados || faltaFolha} aria-pressed={enviar} onClick={() => setEnviar(x => !x)}>Enviar ao cliente</button>
                </div>
                {enviar && dados && !faltaFolha && (
                    <EntregaRelatorio key={sel.id} empresa={{ id: ativa.id, cnpj: ativa.cnpj.replace(/\D/g, ''), nome: dados.empresa?.nomeFantasia || dados.empresa?.razaoSocial || ativa.nome, codigoSage: ativa.codigoSage, contatoEnvio: dados.empresa?.contatoEnvio }}
                        titulo={sel.titulo} competencia={sel.tipo === 'ficha-financeira' ? `${ano}-12` : ativa.competencia} gerar={arquivo} />
                )}
            </section>
        </div>
    );
};

export default RelatoriosPanel;
