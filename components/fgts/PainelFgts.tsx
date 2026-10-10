// components/fgts/PainelFgts.tsx
//
// eSocial › FGTS Digital › Consulta de FGTS da empresa ativa (services/fgts/consultaFgts.ts): o recolhimento mês a
// mês pelo SERPRO comparado com a folha do Consultor (o resultado atualiza o popup de pendências, um aviso por
// empresa e mês), o extrato de cada funcionário (folha × S-5003) e a procuração do FGTS Digital.

import React, { useEffect, useMemo, useState } from 'react';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import { listarEmpresasVisiveis, salvarProcuracaoFgts } from '../../services/empresas/empresasService';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarFuncionarios, mensagemErro } from '../../services/cadastros/cadastrosService';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { lerFolhasDoAno } from '../../services/calculo/folhaGravadaService';
import type { FolhaGravada } from '../../services/calculo/folhaGravada';
import { lerTotalizadores, type S5003 } from '../../services/conferencia/totalizadores';
import { consultarCrfFgts, consultarFgtsRecolhimento, type CrfFgtsResult } from '../../services/serpro/serproIntegrationService';
import { gravarFgtsComId } from '../../services/esocial/esocialService';
import { competenciasAte, extratoDoFuncionario, fgtsDasFolhas, registroDoPopup, ROTULO_SITUACAO_FGTS, situacaoDoMes, situacaoProcuracao, vencimentoFgts, type MesFgts, type ProcuracaoFgts, type SituacaoFgts } from '../../services/fgts/consultaFgts';
import { LINK_FGTS_DIGITAL } from '../../services/demissoes/efetivacao';
import { reais } from '../../services/cadastros/documentos';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700';
const hojeSp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '—');
const mes = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const v = (c: number | null) => (c === null ? '—' : reais(c));
const COR: Record<SituacaoFgts, string> = {
    em_dia: 'text-green-700 dark:text-green-300', parcial: 'text-amber-700 dark:text-amber-300', atrasado: 'font-semibold text-red-700 dark:text-red-300',
    a_vencer: 'text-blue-700 dark:text-blue-300', nao_declarado: 'font-semibold text-orange-700 dark:text-orange-300', sem_movimento: 'text-slate-500', sem_consulta: 'text-slate-500',
};

const PainelFgts: React.FC = () => {
    const { ativa } = useEmpresaAtiva();
    const [empresa, setEmpresa] = useState<Empresa | null>(null);
    const [fichas, setFichas] = useState<FichaFuncionario[]>([]);
    const [folhas, setFolhas] = useState<FolhaGravada[]>([]);
    const [quantos, setQuantos] = useState(12);
    const [meses, setMeses] = useState<MesFgts[] | null>(null);
    const [crf, setCrf] = useState<CrfFgtsResult | null>(null);
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');
    const [fichaSel, setFichaSel] = useState('');
    const [s5003, setS5003] = useState<S5003[]>([]);
    const [proc, setProc] = useState<ProcuracaoFgts>({ perfil: 'consulta', validaAte: '' });
    const hoje = hojeSp();
    const ultima = useMemo(() => { const [a, m] = hoje.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; }, [hoje]);
    const competencias = useMemo(() => competenciasAte(ultima, quantos), [ultima, quantos]);

    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        setEmpresa(null); setMeses(null); setCrf(null); setFichaSel(''); setS5003([]);
        listarEmpresasVisiveis().then(l => { if (!vivo) return; const e = l.find(x => x.id === ativa.id) ?? null; setEmpresa(e); setProc(e?.procuracaoFgts ?? { perfil: 'consulta', validaAte: '' }); }).catch(() => {});
        listarFuncionarios(ativa.id).then(f => { if (vivo) setFichas(f); }).catch(e => { if (vivo) setErro(`Funcionários não carregados: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [ativa]);
    useEffect(() => {
        if (!ativa) return;
        let vivo = true;
        const anos = [...new Set(competencias.map(c => c.slice(0, 4)))];
        Promise.all(anos.map(a => lerFolhasDoAno(ativa.id, a))).then(l => { if (vivo) setFolhas(l.flat()); }).catch(() => { if (vivo) setFolhas([]); });
        return () => { vivo = false; };
    }, [ativa, competencias]);

    const fgtsFolha = useMemo(() => fgtsDasFolhas(folhas), [folhas]);
    const extrato = useMemo(() => {
        const f = fichas.find(x => x.id === fichaSel);
        return f ? extratoDoFuncionario(f, competencias, folhas, s5003, hoje) : null;
    }, [fichas, fichaSel, competencias, folhas, s5003, hoje]);
    const ordenadas = useMemo(() => [...fichas].sort((a, b) => (a.dados.nome ?? '').localeCompare(b.dados.nome ?? '', 'pt-BR')), [fichas]);

    if (!ativa) return <p className="rounded border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">Ative uma empresa para consultar o FGTS dela.</p>;
    const cnpj = ativa.cnpj.replace(/\D/g, '');
    const sp = situacaoProcuracao(empresa?.procuracaoFgts, hoje);

    async function consultar() {
        setErro(''); setMsg('');
        const r: MesFgts[] = [];
        try {
            setOcupado('Consultando o CRF do FGTS…');
            setCrf(await consultarCrfFgts(cnpj).catch(() => null));
            for (const [i, c] of competencias.entries()) {
                setOcupado(`Consultando o recolhimento de ${mes(c)} no SERPRO (${i + 1} de ${competencias.length})…`);
                const folha = fgtsFolha.has(c) ? fgtsFolha.get(c)! : null;
                try {
                    const x = await consultarFgtsRecolhimento(cnpj, c);
                    if (!x.ok) { r.push({ competencia: c, vencimento: vencimentoFgts(c), devido: null, realizado: null, folha, situacao: 'sem_consulta', erro: x.erro || x.situacao || 'sem resposta' }); continue; }
                    const devido = Math.round((x.depositoDevido || 0) * 100); const realizado = Math.round((x.depositoRealizado || 0) * 100);
                    r.push({ competencia: c, vencimento: vencimentoFgts(c), devido, realizado, folha, situacao: situacaoDoMes(c, devido, realizado, folha, hoje) });
                } catch (e) {
                    r.push({ competencia: c, vencimento: vencimentoFgts(c), devido: null, realizado: null, folha, situacao: 'sem_consulta', erro: (e as Error).message });
                }
                setMeses([...r]);
            }
            // O popup de pendências passa a refletir a consulta: um registro por empresa e mês (em dia apaga o aviso).
            setOcupado('Atualizando o aviso de pendências…');
            let n = 0;
            for (const m of r) { const reg = registroDoPopup(ativa!.id, m); if (reg) { await gravarFgtsComId(reg.id, reg.dados); n++; } }
            const conta = (s: SituacaoFgts) => r.filter(m => m.situacao === s).length;
            setMsg(`Consulta concluída: ${conta('atrasado')} em aberto, ${conta('parcial')} em parte, ${conta('nao_declarado')} sem declaração, ${conta('em_dia')} recolhido(s). ${n} mês(es) no aviso de pendências.`);
        } catch (e) { setErro(`Consulta interrompida: ${mensagemErro(e)}`); }
        finally { setOcupado(''); }
    }
    async function lerS5003(arquivos: File[]) {
        if (!arquivos.length) return;
        setErro('');
        try {
            const l = await lerTotalizadores(await Promise.all(arquivos.map(async f => ({ nome: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
            const s = l.totalizadores.filter((t): t is S5003 => t.tipo === 'S-5003' && t.empregador.replace(/\D/g, '').slice(0, 8) === cnpj.slice(0, 8));
            setS5003(s); setMsg(`${s.length} S-5003 da empresa lido(s).`);
        } catch (e) { setErro(`Arquivos não lidos: ${(e as Error).message}`); }
    }
    async function gravarProcuracao() {
        setErro('');
        try { await salvarProcuracaoFgts(ativa!.id, proc.validaAte ? proc : null); setEmpresa(e => (e ? { ...e, procuracaoFgts: proc.validaAte ? proc : undefined } : e)); setMsg('Procuração do FGTS Digital gravada.'); }
        catch (e) { setErro(`Não foi possível gravar: ${mensagemErro(e)}`); }
    }

    return (
        <section aria-label="Consulta de FGTS" className="space-y-4 rounded-lg border border-emerald-200 p-4 dark:border-emerald-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">Consulta de FGTS · {empresa?.nomeFantasia || empresa?.razaoSocial || ativa.nome}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Recolhimento pelo SERPRO (FGTS Digital) com o certificado do cofre, comparado com a folha do Consultor. O resultado atualiza o aviso de pendências.</p>
                </div>
                <a className={btn} href={LINK_FGTS_DIGITAL} target="_blank" rel="noopener noreferrer">FGTS Digital ↗</a>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
                    <p className="font-medium">Procuração do FGTS Digital</p>
                    <p className={sp.situacao === 'valida' ? 'text-green-700 dark:text-green-300' : sp.situacao === 'vencendo' ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300'}>{sp.texto}</p>
                    <div className="flex flex-wrap items-end gap-2">
                        <label>Perfil<select aria-label="Perfil da procuração" className={`block ${inp}`} value={proc.perfil} onChange={e => setProc(p => ({ ...p, perfil: e.target.value as ProcuracaoFgts['perfil'] }))}>
                            <option value="consulta">Consulta (ver e gerar guias)</option><option value="edicao">Consulta e edição</option></select></label>
                        <label>Válida até<input aria-label="Validade da procuração" type="date" className={`block ${inp}`} value={proc.validaAte} onChange={e => setProc(p => ({ ...p, validaAte: e.target.value }))} /></label>
                        <button className={btn} onClick={gravarProcuracao}>Gravar</button>
                    </div>
                </div>
                <div className="space-y-1 rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
                    <p className="font-medium">Certificado de regularidade (CRF)</p>
                    {crf ? <p className={crf.status === 'negativa' ? 'text-green-700 dark:text-green-300' : crf.status === 'indisponivel' || crf.status === 'nao_consultada' ? 'text-slate-500' : 'text-red-700 dark:text-red-300'}>
                        {crf.status === 'negativa' ? 'Regular' : crf.status === 'positiva' ? 'Irregular' : crf.status === 'positiva_efeitos_negativa' ? 'Regular com pendências (efeito de negativa)' : 'Não consultado'}{crf.validade ? ` · válido até ${br(crf.validade)}` : ''}{crf.motivo ? ` · ${crf.motivo}` : ''}</p>
                        : <p className="text-slate-500">Sai junto com a consulta dos recolhimentos.</p>}
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                    <p className="font-medium text-slate-800 dark:text-slate-100">Recolhimento mês a mês</p>
                    <label className="text-xs">Meses<select aria-label="Meses consultados" className={`ml-1 ${inp}`} value={quantos} onChange={e => setQuantos(Number(e.target.value))}>
                        {[3, 6, 12, 24].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
                    <button className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={!!ocupado} onClick={consultar}>Consultar no SERPRO</button>
                </div>
                {meses && (
                    <div className="overflow-x-auto"><table className="min-w-full text-xs">
                        <thead className="text-left text-slate-500"><tr><th className="p-1">Competência</th><th className="p-1">Vencimento</th><th className="p-1 text-right">Folha do Consultor</th><th className="p-1 text-right">Devido (FGTS Digital)</th><th className="p-1 text-right">Recolhido</th><th className="p-1">Situação</th></tr></thead>
                        <tbody>{meses.map(m => (
                            <tr key={m.competencia} className="border-t border-slate-100 dark:border-slate-700">
                                <td className="p-1">{mes(m.competencia)}</td><td className="p-1">{br(m.vencimento)}</td>
                                <td className="p-1 text-right">{v(m.folha)}</td><td className="p-1 text-right">{v(m.devido)}</td><td className="p-1 text-right">{v(m.realizado)}</td>
                                <td className={`p-1 ${COR[m.situacao]}`}>{ROTULO_SITUACAO_FGTS[m.situacao]}{m.situacao === 'parcial' || m.situacao === 'atrasado' ? ` · falta ${reais((m.devido ?? 0) - (m.realizado ?? 0))}` : ''}{m.erro ? ` · ${m.erro}` : ''}
                                    {m.folha !== null && m.devido !== null && m.devido > 0 && Math.abs(m.folha - m.devido) > 100 ? <span className="block text-amber-700 dark:text-amber-300">Folha e FGTS Digital diferem em {reais(m.folha - m.devido)}: confira na Conferência pós-folha.</span> : null}</td>
                            </tr>
                        ))}</tbody>
                    </table></div>
                )}
            </div>

            <div className="space-y-2">
                <p className="font-medium text-slate-800 dark:text-slate-100">Extrato por funcionário</p>
                <div className="flex flex-wrap items-end gap-2 text-xs">
                    <label>Funcionário<select aria-label="Funcionário do extrato" className={`block ${inp}`} value={fichaSel} onChange={e => setFichaSel(e.target.value)}>
                        <option value="">— escolha —</option>{ordenadas.map(f => <option key={f.id} value={f.id}>{f.dados.nome || f.cpf}{f.dados.dataDesligamento ? ' (desligado)' : ''}</option>)}</select></label>
                    <label>S-5003 do eSocial (.zip ou .xml do download), opcional<input aria-label="S-5003 do eSocial" type="file" accept=".zip,.xml" multiple className="block" onChange={e => lerS5003(Array.from(e.target.files ?? []))} /></label>
                </div>
                {extrato && (
                    <div className="space-y-1">
                        <div className="overflow-x-auto"><table className="min-w-full text-xs">
                            <thead className="text-left text-slate-500"><tr><th className="p-1">Competência</th><th className="p-1 text-right">Base (folha)</th><th className="p-1 text-right">FGTS (folha)</th><th className="p-1 text-right">Declarado (S-5003)</th><th className="p-1 text-right">Diferença</th></tr></thead>
                            <tbody>{extrato.linhas.map(l => (
                                <tr key={l.competencia} className="border-t border-slate-100 dark:border-slate-700">
                                    <td className="p-1">{mes(l.competencia)}</td><td className="p-1 text-right">{v(l.baseFolha)}</td><td className="p-1 text-right">{v(l.fgtsFolha)}</td><td className="p-1 text-right">{v(l.declarado)}</td>
                                    <td className={`p-1 text-right ${l.diferenca ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}`}>{l.diferenca === null ? '—' : reais(l.diferenca)}</td>
                                </tr>
                            ))}</tbody>
                            <tfoot><tr className="border-t border-slate-300 font-semibold dark:border-slate-600"><td className="p-1">Total do período</td><td className="p-1" /><td className="p-1 text-right">{reais(extrato.totalFolha)}</td><td className="p-1 text-right">{s5003.length ? reais(extrato.totalDeclarado) : '—'}</td><td className="p-1" /></tr></tfoot>
                        </table></div>
                        <p className="text-xs text-slate-600 dark:text-slate-300">Estimativa dos depósitos do contrato inteiro: <strong>{reais(extrato.estimativaContrato)}</strong> (salário × 8%, com 13º e 1/3, sem correção e sem saques; fica abaixo do saldo real). O saldo da conta é da Caixa: o "saldo para fins rescisórios" sai no FGTS Digital, por CPF ({extrato.cpf}).</p>
                    </div>
                )}
            </div>

            {ocupado && <p role="status" className="text-sm text-blue-700 dark:text-blue-300">{ocupado}</p>}
            {erro && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {msg && <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
        </section>
    );
};

export default PainelFgts;
