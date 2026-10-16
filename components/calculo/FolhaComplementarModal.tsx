// components/calculo/FolhaComplementarModal.tsx
//
// Cálculo › Folha complementar: diferenças de meses já fechados, pagas com a folha da competência (reajuste
// retroativo da convenção ou do acordo, lei, dissídio, parcela conhecida depois do fechamento). O reajuste corre
// sobre as folhas gravadas; o resto se lança à mão. Prévia por funcionário, gravação na competência e holerites em
// PDF. No eSocial, vai no S-1200 da competência (infoPerAnt), pela tela "S-1200 e S-1210" (services/calculo/complementar.ts).

import React, { useEffect, useMemo, useState } from 'react';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import type { Afastamento } from '../../services/cadastros/afastamentos';
import type { Movimento } from '../../services/calculo/motorMensal';
import { listarMovimentosDaEmpresa } from '../../services/calculo/movimentosService';
import { complemento13, diferenca13DoReajuste, diferencasDaRescisao, juntarDiferencas, type DiferencasDosMotores } from '../../services/calculo/complementaresMotores';
import type { ResultadoCalculo } from '../../services/calculo/motorMensal';
import { centavosDeTexto, normalizarCnpj, reais } from '../../services/cadastros/documentos';
import { listarSindicatos, mensagemErro, type Usuario } from '../../services/cadastros/cadastrosService';
import { lerFolhaGravada } from '../../services/calculo/folhaGravadaService';
import { listarConvencoes } from '../../services/sindicatos/convencoesService';
import { convencaoDoDia } from '../../services/sindicatos/convencao';
import { excluirComplementar, gravarComplementar, listarComplementares, type FolhaComplementarGravada } from '../../services/calculo/folhaComplementarService';
import {
    calcularComplementar, DSC_TIPO_J, noSindicatoDoReajuste, exigeDataAcConv, FGTS_CONVERSAO, mesesEntre, rotuloTpAcConv, sugestaoDaConvencao, TIPOS_AC_CONV, totaisComplementar, VERBAS_LANCAVEIS,
    type Instrumento, type LancamentoComplementar, type ResultadoComplementar, type TpAcConv,
} from '../../services/calculo/complementar';

const inp = 'rounded-sm border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded-sm border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const br = (c: string) => (c ? `${c.slice(5, 7)}/${c.slice(0, 4)}` : '');
const anterior = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; };
const SITUACAO: Record<ResultadoCalculo['situacao'], string> = {
    calculado: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
    incompleto: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    erro: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

interface LinhaLancamento { fichaId: string; perRef: string; codigo: string; descricao: string; valor: string; inss: boolean; fgts: boolean; irrf: boolean }
const linhaVazia = (perRef: string): LinhaLancamento => ({ fichaId: '', perRef, codigo: 'SAL', descricao: '', valor: '', inss: true, fgts: true, irrf: true });
/** Tipo E: a linha é a base do FGTS do mês do afastamento (rubrica informativa, só FGTS). */
const linhaDoTipoE = (l: LinhaLancamento): LinhaLancamento => ({ ...l, codigo: FGTS_CONVERSAO, inss: false, fgts: true, irrf: false });

interface Props {
    empresa: { id: string; cnpj: string; razaoSocial: string; sindicatos?: string[] };
    /** Competência da folha com que a complementar é escriturada (a do instrumento). */
    competencia: string;
    /** Mês do pagamento da folha da competência. */
    pagamento: string;
    fichas: FichaFuncionario[];
    /** Afastamentos da empresa (13º e rescisões refeitos pelos motores). */
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    /** Holerites da folha da competência (o IRRF soma o dela). */
    folhaDoMes: ResultadoCalculo[];
    encerrado: boolean;
    usuario: Usuario;
    onPdf: (lista: ResultadoComplementar[], instrumento: Instrumento) => void;
    onFechar: () => void;
}

const FolhaComplementarModal: React.FC<Props> = ({ empresa, competencia, pagamento, fichas, afastamentos, tabelas, folhaDoMes, encerrado, usuario, onPdf, onFechar }) => {
    const [tipo, setTipo] = useState<TpAcConv>('C');
    const [dtAcConv, setDtAcConv] = useState('');
    const [dsc, setDsc] = useState('');
    const [pag, setPag] = useState(pagamento);
    const [comReajuste, setComReajuste] = useState(true);
    const [pct, setPct] = useState('');
    const [de, setDe] = useState('');
    const [ate, setAte] = useState(anterior(competencia));
    // Dissídio por sindicato (como o SAGE): só os funcionários com o sindicato da convenção na ficha. Vazio = todos.
    const [sindicato, setSindicato] = useState('');
    const [nomesSindicatos, setNomesSindicatos] = useState<Record<string, string>>({});
    const [linhas, setLinhas] = useState<LinhaLancamento[]>([]);
    // 13º e rescisões pelos motores: a diferença do 13º e as rescisões no reajuste; em janeiro, o 13º complementar do ano anterior.
    const [com13Dif, setCom13Dif] = useState(false);
    const [comRescisoes, setComRescisoes] = useState(false);
    const [comComplemento13, setComComplemento13] = useState(false);
    const [movimentos, setMovimentos] = useState<Record<string, Record<string, Movimento>> | null>(null);
    const janeiro = competencia.endsWith('-01');
    const anoAnterior = Number(competencia.slice(0, 4)) - 1;
    const [gravadas, setGravadas] = useState<Record<string, ResultadoCalculo[]>>({});
    const [lendo, setLendo] = useState(false);
    const [existentes, setExistentes] = useState<FolhaComplementarGravada[]>([]);
    const [recarga, setRecarga] = useState(0);
    const [sugestao, setSugestao] = useState<ReturnType<typeof sugestaoDaConvencao>>(null);
    const [aberto, setAberto] = useState('');
    const [ocupado, setOcupado] = useState(''); const [erro, setErro] = useState(''); const [msg, setMsg] = useState('');

    useEffect(() => {
        let vivo = true;
        listarComplementares(empresa.id, competencia).then(c => { if (vivo) setExistentes(c); }).catch(e => { if (vivo) setErro(`Complementares gravadas não carregadas: ${mensagemErro(e)}`); });
        return () => { vivo = false; };
    }, [empresa.id, competencia, recarga]);
    // Convenção do sindicato da empresa com reajuste a partir de um mês anterior: sugestão do instrumento e do reajuste.
    useEffect(() => {
        const cnpjs = empresa.sindicatos ?? [];
        if (!cnpjs.length) return;
        let vivo = true;
        Promise.all([listarConvencoes(), listarSindicatos()]).then(([convs, sinds]) => {
            if (!vivo) return;
            setNomesSindicatos(Object.fromEntries(sinds.map(x => [normalizarCnpj(x.cnpj), x.nome])));
            for (const cnpj of cnpjs) {
                const c = convencaoDoDia(convs, cnpj, `${competencia}-01`);
                const s = c && sugestaoDaConvencao(c, competencia, sinds.find(x => x.cnpj === cnpj)?.nome ?? '', cnpj);
                if (s) { setSugestao(s); return; }
            }
        }).catch(() => { /* sem convenção: preenche à mão */ });
        return () => { vivo = false; };
    }, [empresa.sindicatos, competencia]);

    // Folhas gravadas dos meses de referência (o reajuste corre sobre elas; o INSS da diferença soma a base delas).
    const meses = useMemo(() => {
        const m = new Set<string>(comReajuste ? mesesEntre(de, ate) : []);
        for (const l of linhas) if (/^\d{4}-\d{2}$/.test(l.perRef) && l.perRef < competencia) m.add(l.perRef);
        return [...m].filter(x => x < competencia).sort();
    }, [comReajuste, de, ate, linhas, competencia]);
    useEffect(() => {
        const faltam = meses.filter(m => !(m in gravadas));
        if (!faltam.length) return;
        let vivo = true;
        setLendo(true);
        Promise.all(faltam.map(m => lerFolhaGravada(empresa.id, m).then(g => [m, g?.holerites ?? []] as const).catch(() => [m, []] as const)))
            .then(lidas => { if (vivo) setGravadas(g => ({ ...g, ...Object.fromEntries(lidas) })); })
            .finally(() => { if (vivo) setLendo(false); });
        return () => { vivo = false; };
    }, [meses, gravadas, empresa.id]);

    const instrumento: Instrumento = { tpAcConv: tipo, dtAcConv: dtAcConv || undefined, dsc };
    const reajuste = comReajuste ? { pct: Number(pct.replace(',', '.')) || 0, de, ate, ...(sindicato ? { sindicato } : {}) } : undefined;
    // Sindicatos para o filtro: os da empresa e os que aparecem nas fichas; a contagem de quem entra no reajuste.
    const opcoesSindicato = useMemo(() => [...new Set([...(empresa.sindicatos ?? []), ...fichas.map(f => f.dados.sindicato ?? '')].map(c => normalizarCnpj(c)).filter(c => c.length === 14))].sort(), [empresa.sindicatos, fichas]);
    const contagemSindicato = useMemo(() => {
        const n = { sim: 0, nao: 0, sem: 0 };
        for (const f of fichas) n[noSindicatoDoReajuste(f, { sindicato })]++;
        return n;
    }, [fichas, sindicato]);
    const precisaMotores = (comComplemento13 && janeiro) || (comReajuste && (com13Dif || comRescisoes));
    useEffect(() => {
        if (!precisaMotores || movimentos) return;
        let vivo = true;
        listarMovimentosDaEmpresa(empresa.id).then(m => { if (vivo) setMovimentos(m); }).catch(e => { if (vivo) { setMovimentos({}); setErro(`Movimentos não carregados (as médias saem sem eles): ${mensagemErro(e)}`); } });
        return () => { vivo = false; };
    }, [precisaMotores, movimentos, empresa.id]);
    const dezembros = reajuste ? mesesEntre(reajuste.de, reajuste.ate).filter(m => m.endsWith('-12')).map(m => Number(m.slice(0, 4))) : [];
    const motores = useMemo<DiferencasDosMotores | null>(() => {
        if (!precisaMotores) return { diferencas: [], decimos: [], avisos: [] };
        if (!movimentos) return null;
        const d = { fichas, afastamentos, movimentos, tabelas };
        const partes: DiferencasDosMotores[] = [];
        if (comComplemento13 && janeiro) partes.push(complemento13(d, anoAnterior));
        if (reajuste && reajuste.pct > 0 && /^\d{4}-\d{2}$/.test(reajuste.de) && /^\d{4}-\d{2}$/.test(reajuste.ate)) {
            const doSindicato = { ...d, fichas: fichas.filter(f => noSindicatoDoReajuste(f, reajuste) !== 'nao') };
            if (com13Dif) for (const ano of dezembros) partes.push(diferenca13DoReajuste(doSindicato, ano, reajuste.pct));
            if (comRescisoes) partes.push(diferencasDaRescisao(doSindicato, reajuste, gravadas));
        }
        return juntarDiferencas(...partes);
    }, [precisaMotores, movimentos, fichas, afastamentos, tabelas, comComplemento13, janeiro, anoAnterior, JSON.stringify(reajuste), com13Dif, comRescisoes, gravadas]); // eslint-disable-line react-hooks/exhaustive-deps
    const lancamentos: LancamentoComplementar[] = linhas.map(l => {
        const verba = VERBAS_LANCAVEIS.find(v => v.codigo === l.codigo);
        return { fichaId: l.fichaId, perRef: l.perRef, codigo: l.codigo, descricao: l.descricao, tipo: verba?.tipo ?? 'provento', valor: centavosDeTexto(l.valor) ?? 0, inss: l.inss, fgts: l.fgts, irrf: l.irrf };
    });
    // Só calcula com todas as folhas dos meses lidas (senão avisaria "sem folha gravada" por um instante).
    const carregado = meses.every(m => m in gravadas) && !!motores;
    const calculo = useMemo(() => {
        if (!carregado || !motores) return null;
        const c = calcularComplementar({ perApur: competencia, pagamento: pag, instrumento, reajuste, lancamentos, fichas, gravadas, folhaDoMes, tabelas, diferencas: motores.diferencas, decimos: motores.decimos });
        return { ...c, avisos: [...c.avisos, ...motores.avisos] };
    }, [carregado, motores, competencia, pag, JSON.stringify(instrumento), JSON.stringify(reajuste), JSON.stringify(lancamentos), fichas, gravadas, folhaDoMes, tabelas]); // eslint-disable-line react-hooks/exhaustive-deps
    const resultados = calculo?.resultados ?? [];
    const tot = totaisComplementar(resultados);
    const doMesmoTipo = existentes.find(c => c.instrumento.tpAcConv === tipo);

    function aplicarSugestao() {
        if (!sugestao) return;
        setTipo(sugestao.instrumento.tpAcConv); setDsc(sugestao.instrumento.dsc);
        setComReajuste(true); setPct(String(sugestao.reajuste.pct).replace('.', ',')); setDe(sugestao.reajuste.de); setAte(sugestao.reajuste.ate); setSindicato(sugestao.reajuste.sindicato ?? '');
        setMsg('Preenchido pela convenção: confira e informe a data da celebração.');
    }
    function abrir(c: FolhaComplementarGravada) {
        setTipo(c.instrumento.tpAcConv); setDtAcConv(c.instrumento.dtAcConv ?? ''); setDsc(c.instrumento.dsc); setPag(c.pagamento);
        setComReajuste(!!c.reajuste);
        setCom13Dif(!!c.opcoes?.decimo); setComRescisoes(!!c.opcoes?.rescisoes); setComComplemento13(!!c.opcoes?.complemento13);
        if (c.reajuste) { setPct(String(c.reajuste.pct).replace('.', ',')); setDe(c.reajuste.de); setAte(c.reajuste.ate); setSindicato(c.reajuste.sindicato ?? ''); }
        setLinhas(c.lancamentos.map(l => ({ fichaId: l.fichaId, perRef: l.perRef, codigo: l.codigo, descricao: l.codigo === 'LAN' || l.descricao !== VERBAS_LANCAVEIS.find(v => v.codigo === l.codigo)?.descricao ? l.descricao : '', valor: (l.valor / 100).toFixed(2).replace('.', ','), inss: l.inss, fgts: l.fgts, irrf: l.irrf })));
        setMsg(`Complementar ${c.instrumento.tpAcConv} aberta para conferir ou regravar.`);
    }
    async function gravar() {
        if (!calculo || calculo.erros.length || !resultados.length) return;
        const comErro = resultados.filter(r => r.situacao === 'erro');
        if (comErro.length && !window.confirm(`${comErro.length} funcionário(s) com erro ficam fora:\n${comErro.slice(0, 5).map(r => `${r.nome}: ${r.erros[0]}`).join('\n')}\n\nGravar assim mesmo?`)) return;
        if (doMesmoTipo && !window.confirm(`Já há complementar ${tipo} gravada em ${br(competencia)}: substituir?`)) return;
        setOcupado('Gravando…'); setErro('');
        try {
            await gravarComplementar({ empresaId: empresa.id, perApur: competencia, pagamento: pag, instrumento, reajuste, lancamentos, resultados, opcoes: { decimo: com13Dif, rescisoes: comRescisoes, complemento13: comComplemento13 } }, usuario);
            setMsg('Complementar gravada. Ela vai no S-1200 da competência pela tela "S-1200 e S-1210", paga com a folha.'); setRecarga(n => n + 1);
        } catch (e) { setErro(`Não foi possível gravar (${mensagemErro(e)}).`); }
        finally { setOcupado(''); }
    }
    async function excluir(c: FolhaComplementarGravada) {
        if (!window.confirm(`Excluir a complementar ${c.instrumento.tpAcConv} (${c.resultados.length} funcionário(s)) de ${br(competencia)}?`)) return;
        setOcupado('Excluindo…'); setErro('');
        try { await excluirComplementar(c.id); setMsg('Complementar excluída.'); setRecarga(n => n + 1); }
        catch (e) { setErro(`Não foi possível excluir (${mensagemErro(e)}).`); }
        finally { setOcupado(''); }
    }
    const mudarLinha = (i: number, x: Partial<LinhaLancamento>) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...x } : l)));
    const ativos = useMemo(() => [...fichas].sort((a, b) => (a.dados.nome ?? '').localeCompare(b.dados.nome ?? '', 'pt-BR')), [fichas]);

    return (
        <div role="dialog" aria-modal="true" aria-label="Folha complementar" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 sm:p-4">
            <div className="my-4 w-full max-w-6xl space-y-3 rounded-xl bg-white p-4 text-sm shadow-xl dark:bg-slate-800 dark:text-slate-100">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Folha complementar — {br(competencia)} — {empresa.razaoSocial}</h3>
                        <p className="text-slate-600 dark:text-slate-300">Diferenças de meses já fechados, pagas com a folha de {br(competencia)} (a competência em que o instrumento foi celebrado). INSS refeito mês a mês pela tabela de cada um, FGTS de 8% e IRRF no mês do pagamento, somado à folha. No eSocial, vai no S-1200 de {br(competencia)} com as diferenças por mês de referência.</p>
                    </div>
                    <button aria-label="Fechar" className="rounded-sm px-2 text-xl text-slate-500" onClick={onFechar}>×</button>
                </div>

                {existentes.length > 0 && (
                    <ul aria-label="Complementares gravadas" className="space-y-1 rounded-sm border border-slate-200 p-2 text-xs dark:border-slate-700">
                        {existentes.map(c => (
                            <li key={c.id} className="flex flex-wrap items-center gap-2">
                                <span>📁 <strong>{c.instrumento.tpAcConv} – {rotuloTpAcConv(c.instrumento.tpAcConv)}</strong>: {c.instrumento.dsc} · {c.resultados.length} funcionário(s), líquido {reais(c.totais?.liquido ?? 0)} · por {c.gravadoPorEmail}</span>
                                <button className={btn} onClick={() => abrir(c)}>Abrir</button>
                                <button className={btn} onClick={() => onPdf(c.resultados, c.instrumento)}>Holerites (PDF)</button>
                                {!encerrado && <button className={btn} disabled={!!ocupado} onClick={() => excluir(c)}>Excluir</button>}
                            </li>
                        ))}
                    </ul>
                )}
                {sugestao && (
                    <p role="note" className="flex flex-wrap items-center gap-2 rounded-sm bg-blue-50 p-2 text-xs text-blue-900 dark:bg-blue-900/30 dark:text-blue-100">
                        Convenção do sindicato com reajuste de {String(sugestao.reajuste.pct).replace('.', ',')}% a partir de {br(sugestao.reajuste.de)}.
                        <button className={btn} onClick={aplicarSugestao}>Usar a convenção</button>
                    </p>
                )}

                <section className="grid gap-2 sm:grid-cols-4">
                    <label className="sm:col-span-2">Fato gerador (tpAcConv)<select aria-label="Tipo do instrumento" className={`block w-full ${inp}`} value={tipo} onChange={e => { const t = e.target.value as TpAcConv; setTipo(t); if (t === 'J' && !dsc.trim()) setDsc(DSC_TIPO_J); if (t === 'E') { setComReajuste(false); setLinhas(ls => ls.map(linhaDoTipoE)); } else setLinhas(ls => ls.map(l => (l.codigo === FGTS_CONVERSAO ? linhaVazia(l.perRef) : l))); }}>
                        {TIPOS_AC_CONV.map(t => <option key={t.codigo} value={t.codigo} disabled={!t.suportado} title={t.motivo}>{t.codigo} – {t.rotulo}{t.suportado ? '' : t.codigo === 'H' ? ' (aguarda regulamentação)' : t.codigo === 'I' ? ' (servidor público; Justiça Comum)' : ' (pelo IOB)'}</option>)}</select></label>
                    <label>{tipo === 'E' ? 'Data da notificação da decisão' : exigeDataAcConv(tipo) ? 'Data da celebração/publicação' : 'Data (opcional)'}<input aria-label="Data do instrumento" type="date" className={`block w-full ${inp}`} value={dtAcConv} onChange={e => setDtAcConv(e.target.value)} /></label>
                    <label>Pagamento em<input aria-label="Mês do pagamento" type="month" className={`block w-full ${inp}`} value={pag} onChange={e => setPag(e.target.value)} /></label>
                    <label className="sm:col-span-4">Descrição do instrumento<input aria-label="Descrição do instrumento" maxLength={255} className={`block w-full ${inp}`} value={dsc} placeholder="Convenção coletiva dos comerciários de São Paulo 2026/2027" onChange={e => setDsc(e.target.value)} /></label>
                </section>

                {tipo === 'E' && (
                    <p className="rounded-sm bg-blue-50 p-2 text-xs text-blue-900 dark:bg-blue-900/20 dark:text-blue-100">Conversão do auxílio-doença em acidentário: lance, para cada mês do afastamento anterior a {br(competencia)}, a remuneração que seria devida no mês (base do FGTS). Vai em rubrica informativa só com FGTS, sem INSS, IRRF ou pagamento; o FGTS de cada mês é da competência dele, com os encargos desde então (MOS, S-1200, itens 18.8 e 18.9).</p>
                )}
                <section hidden={tipo === 'E'} className="space-y-2 rounded-sm border border-slate-200 p-2 dark:border-slate-700">
                    <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={comReajuste} onChange={e => setComReajuste(e.target.checked)} />Reajuste retroativo sobre as folhas gravadas</label>
                    {comReajuste && (
                        <div className="grid gap-2 sm:grid-cols-4">
                            <label>Percentual (%)<input aria-label="Percentual do reajuste" inputMode="decimal" className={`block w-full ${inp}`} value={pct} onChange={e => setPct(e.target.value.replace(/[^\d,.]/g, ''))} /></label>
                            <label>De<input aria-label="Reajuste de" type="month" className={`block w-full ${inp}`} value={de} onChange={e => setDe(e.target.value)} /></label>
                            <label>Até<input aria-label="Reajuste até" type="month" className={`block w-full ${inp}`} value={ate} onChange={e => setAte(e.target.value)} /></label>
                            <label className="sm:col-span-2">Sindicato<select aria-label="Sindicato do reajuste" className={`block w-full ${inp}`} value={sindicato} onChange={e => setSindicato(e.target.value)}>
                                <option value="">Todos os funcionários</option>
                                {opcoesSindicato.map(c => <option key={c} value={c}>{nomesSindicatos[c] ? `${nomesSindicatos[c]} — ` : ''}{c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</option>)}
                            </select></label>
                            <p className="self-end text-xs text-slate-500 sm:col-span-2">{sindicato
                                ? `${contagemSindicato.sim} funcionário(s) com este sindicato na ficha${contagemSindicato.sem ? `, ${contagemSindicato.sem} sem sindicato na ficha (entram, com aviso)` : ''}${contagemSindicato.nao ? `; ${contagemSindicato.nao} de outro sindicato ficam fora` : ''}.`
                                : 'O reajuste vale para todos os funcionários com folha gravada nos meses.'}</p>
                            <p className="self-end text-xs text-slate-500">Reajusta salário, periculosidade, maternidade, horas extras, DSR, férias do mês e faltas, no mesmo código (o de/para do eSocial vale).</p>
                            <label className="flex items-center gap-2 sm:col-span-2" title={dezembros.length ? 'O 13º é pela remuneração de dezembro: o percentual sobre o 13º do ano, no mês de referência de dezembro.' : 'O reajuste não pega dezembro.'}>
                                <input type="checkbox" disabled={!dezembros.length} checked={com13Dif && dezembros.length > 0} onChange={e => setCom13Dif(e.target.checked)} />Diferença do 13º{dezembros.length ? ` de ${dezembros.join(', ')}` : ' (o reajuste não pega dezembro)'}</label>
                            <label className="flex items-center gap-2 sm:col-span-2" title="Desligados com o desligamento nos meses do reajuste: a rescisão é refeita com o salário reajustado (aviso, 13º e férias).">
                                <input type="checkbox" checked={comRescisoes} onChange={e => setComRescisoes(e.target.checked)} />Rescisões no período (rescisão complementar dos desligados)</label>
                        </div>
                    )}
                </section>

                <section className="space-y-1 rounded-sm border border-slate-200 p-2 dark:border-slate-700">
                    <label className="flex items-center gap-2 font-medium">
                        <input type="checkbox" disabled={!janeiro} checked={comComplemento13 && janeiro} onChange={e => {
                            setComComplemento13(e.target.checked);
                            if (e.target.checked) { setTipo('J'); setComReajuste(false); if (!dsc.trim()) setDsc(`13º salário complementar de ${anoAnterior} (variáveis de dezembro; Decreto 10.854/2021, art. 77)`); }
                        }} />13º complementar de {janeiro ? anoAnterior : 'dezembro'} (variáveis de dezembro)</label>
                    <p className="text-xs text-slate-500">{janeiro
                        ? `A média do 13º com as variáveis de dezembro (movimento gravado), menos o pago na 2ª parcela; pago até 10/01 (Decreto 10.854/2021, art. 77). No eSocial, no S-1200 de janeiro com o tipo J e o mês de referência 12/${anoAnterior}, rubrica de natureza 5005.`
                        : 'Disponível na competência de janeiro: o complemento do 13º do ano anterior vai no S-1200 de janeiro.'}</p>
                </section>

                <section className="space-y-2 rounded-sm border border-slate-200 p-2 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2"><p className="font-medium">Lançamentos (diferenças avulsas, 13º, comissões…)</p>
                        <button className={btn} onClick={() => setLinhas(l => [...l, tipo === 'E' ? linhaDoTipoE(linhaVazia(anterior(competencia))) : linhaVazia(anterior(competencia))])}>+ Lançamento</button></div>
                    {linhas.map((l, i) => (
                        <div key={i} className="grid items-end gap-2 sm:grid-cols-12">
                            <label className="sm:col-span-3">Funcionário<select aria-label={`Funcionário do lançamento ${i + 1}`} className={`block w-full ${inp}`} value={l.fichaId} onChange={e => mudarLinha(i, { fichaId: e.target.value })}>
                                <option value="">— escolha —</option>{ativos.map(f => <option key={f.id} value={f.id}>{f.dados.nome || f.matriculaEsocial}</option>)}</select></label>
                            <label className="sm:col-span-2">Mês de referência<input aria-label={`Mês do lançamento ${i + 1}`} type="month" className={`block w-full ${inp}`} value={l.perRef} onChange={e => mudarLinha(i, { perRef: e.target.value })} /></label>
                            <label className="sm:col-span-2">Verba<select aria-label={`Verba do lançamento ${i + 1}`} className={`block w-full ${inp}`} value={l.codigo} onChange={e => mudarLinha(i, { codigo: e.target.value })}>
                                {VERBAS_LANCAVEIS.filter(v => (tipo === 'E') === (v.codigo === FGTS_CONVERSAO)).map(v => <option key={v.codigo} value={v.codigo}>{v.codigo === 'LAN' ? 'Avulso (descreva)' : v.descricao}</option>)}</select></label>
                            <label className="sm:col-span-2">Descrição<input aria-label={`Descrição do lançamento ${i + 1}`} className={`block w-full ${inp}`} value={l.descricao} placeholder={l.codigo === 'LAN' ? 'obrigatória' : 'opcional'} onChange={e => mudarLinha(i, { descricao: e.target.value })} /></label>
                            <label>Valor<input aria-label={`Valor do lançamento ${i + 1}`} inputMode="decimal" className={`block w-full ${inp}`} value={l.valor} onChange={e => mudarLinha(i, { valor: e.target.value })} /></label>
                            <div className="flex gap-2 text-xs sm:col-span-2">
                                {(['inss', 'fgts', 'irrf'] as const).map(k => <label key={k} className="flex items-center gap-1"><input type="checkbox" disabled={l.codigo === FGTS_CONVERSAO} checked={l[k]} onChange={e => mudarLinha(i, { [k]: e.target.checked })} />{k.toUpperCase()}</label>)}
                                <button aria-label={`Remover o lançamento ${i + 1}`} className="text-red-600" onClick={() => setLinhas(ls => ls.filter((_, j) => j !== i))}>×</button>
                            </div>
                        </div>
                    ))}
                </section>

                {(lendo || (precisaMotores && !movimentos)) && <p className="text-slate-500">Lendo as folhas gravadas e os movimentos…</p>}
                {calculo && calculo.erros.length > 0 && <ul role="alert" className="list-disc rounded-sm bg-red-50 p-2 pl-6 text-red-800 dark:bg-red-900/30 dark:text-red-200">{calculo.erros.map(x => <li key={x}>{x}</li>)}</ul>}
                {calculo && calculo.avisos.length > 0 && <ul className="list-disc rounded-sm bg-amber-50 p-2 pl-6 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">{calculo.avisos.map(x => <li key={x}>{x}</li>)}</ul>}
                {resultados.length > 0 && (
                    <div className="max-h-96 overflow-auto rounded-sm border border-slate-200 dark:border-slate-700">
                        <table className="w-full">
                            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900"><tr><th className="p-2">Funcionário</th><th className="p-2">Meses</th><th className="p-2 text-right">Diferenças</th><th className="p-2 text-right">INSS</th><th className="p-2 text-right">IRRF</th><th className="p-2 text-right">Líquido</th><th className="p-2 text-right">FGTS</th><th className="p-2">Situação</th></tr></thead>
                            <tbody>{resultados.map(r => (
                                <React.Fragment key={r.fichaId}>
                                    <tr className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/40" onClick={() => setAberto(a => (a === r.fichaId ? '' : r.fichaId))}>
                                        <td className="p-2">{r.nome}</td>
                                        <td className="p-2">{r.meses.map(m => br(m.perRef)).join(', ')}</td>
                                        <td className="p-2 text-right">{reais(r.totais.proventos)}</td>
                                        <td className="p-2 text-right">{reais(r.meses.reduce((s, m) => s + m.inss + (m.inss13 ?? 0), 0))}</td>
                                        <td className="p-2 text-right">{reais(r.verbas.filter(v => v.codigo === 'IRRF' || v.codigo === 'IRRF13').reduce((s, v) => s + v.valor, 0))}</td>
                                        <td className="p-2 text-right font-medium">{reais(r.totais.liquido)}</td>
                                        <td className="p-2 text-right">{reais(r.fgts)}</td>
                                        <td className="p-2"><span className={`rounded-full px-2 py-0.5 text-xs ${SITUACAO[r.situacao]}`}>{r.situacao}</span></td>
                                    </tr>
                                    {aberto === r.fichaId && (
                                        <tr><td colSpan={8} className="bg-slate-50 p-2 text-xs dark:bg-slate-900/50">
                                            <ul className="list-disc pl-5">{r.verbas.map((v, i) => <li key={i}>{v.descricao} ({v.referencia}): {v.tipo === 'desconto' ? '−' : ''}{reais(v.valor)}</li>)}</ul>
                                            {[...r.erros, ...new Set(r.avisos)].map(x => <p key={x} className="mt-1 text-amber-800 dark:text-amber-200">⚠ {x}</p>)}
                                            <details className="mt-1"><summary className="cursor-pointer">Memória de cálculo</summary><ul className="list-disc pl-5">{r.memoria.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
                                        </td></tr>
                                    )}
                                </React.Fragment>
                            ))}</tbody>
                            <tfoot className="border-t border-slate-200 font-medium dark:border-slate-700"><tr>
                                <td className="p-2">{tot.funcionarios} funcionário(s)</td><td />
                                <td className="p-2 text-right">{reais(tot.proventos)}</td><td className="p-2 text-right">{reais(tot.inss)}</td><td className="p-2 text-right">{reais(tot.irrf)}</td>
                                <td className="p-2 text-right">{reais(tot.liquido)}</td><td className="p-2 text-right">{reais(tot.fgts)}</td><td />
                            </tr></tfoot>
                        </table>
                    </div>
                )}

                {erro && <p role="alert" className="rounded-sm bg-red-50 p-2 text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
                {msg && <p role="status" className="rounded-sm bg-green-50 p-2 text-green-800 dark:bg-green-900/30 dark:text-green-200">{msg}</p>}
                <div className="flex flex-wrap justify-end gap-2">
                    <button className={btn} disabled={!resultados.some(r => r.situacao !== 'erro')} onClick={() => onPdf(resultados, instrumento)}>Holerites (PDF)</button>
                    <button className="rounded-sm bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={encerrado || !!ocupado || !calculo || calculo.erros.length > 0 || !resultados.some(r => r.situacao !== 'erro')}
                        title={encerrado ? 'Competência encerrada no Fim de mês.' : undefined} onClick={gravar}>{ocupado || (doMesmoTipo ? 'Regravar a complementar' : 'Gravar a complementar')}</button>
                    <button className={btn} onClick={onFechar}>Fechar</button>
                </div>
            </div>
        </div>
    );
};

export default FolhaComplementarModal;
