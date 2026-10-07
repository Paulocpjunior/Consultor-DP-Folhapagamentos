// components/calculo/CalculoPanel.tsx
//
// Aba "Cálculo" (Fase 3): prévia do cálculo mensal por empresa e competência,
// com o motor de services/calculo. O movimento do mês (horas extras, faltas,
// pensão, lançamentos) é gravado por funcionário e competência, com auditoria;
// o que foi digitado e ainda não salvo fica marcado. O resultado do cálculo
// não é gravado: serve para conferir o motor contra o holerite do IOB.

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import EmpresaAtivaFixa from '../empresaAtiva/EmpresaAtivaFixa';
import { listarAfastamentos, listarEnquadramentos, listarFuncionarios, listarTabelas, mensagemErro, salvarAfastamento, type Usuario } from '../../services/cadastros/cadastrosService';
import { enquadramentoVigente, type Enquadramento } from '../../services/cadastros/enquadramento';
import type { User } from '../../types';
import type { FichaFuncionario } from '../../services/cadastros/funcionarios';
import { afastamentoVazio, idAfastamento, type Afastamento } from '../../services/cadastros/afastamentos';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { calcularMensal, competenciaSeguinte, noMes, type Lancamento, type Movimento, type ResultadoCalculo } from '../../services/calculo/motorMensal';
import { somarMeses } from '../../services/prazos/calendario';
import { limparMovimento, mesmoMovimento, movimentoVazio, validarMovimento, type MovimentoGravado } from '../../services/calculo/movimento';
import { listarMovimentos, listarMovimentosDaEmpresa, listarMovimentosDoAno, salvarMovimentos } from '../../services/calculo/movimentosService';
import { calcularFerias, feriasDaCompetencia, gozosNoMes, OPCOES_FERIAS_PADRAO, type OpcoesFerias, type ResultadoFerias } from '../../services/calculo/motorFerias';
import { calcularRescisao, ROTULO_AVISO, TIPOS_RESCISAO, type AvisoPrevio, type ResultadoRescisao, type TipoRescisao } from '../../services/calculo/motorRescisao';
import { calcular13, com13, OPCOES_13_PADRAO, ultimoDiaDoMes, type Opcoes13 } from '../../services/calculo/motor13';
import ConferenciaHolerites, { conferirTodos, type LeituraHolerites } from './ConferenciaHolerites';
import { resumirFolha } from '../../services/relatorios/resumoFolha';
import { listarEnvios, type Envio } from '../../services/esocial/transmissaoService';
import StatusEsocialAfastamento from '../esocial/StatusEsocialAfastamento';
import { holeritesPdf, resumoPdf } from '../../services/relatorios/holeritePdf';

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const SITUACAO: Record<ResultadoCalculo['situacao'], [string, string]> = {
    calculado: ['calculado', 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'],
    incompleto: ['incompleto', 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'],
    erro: ['erro', 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'],
};
const decimal = (t: string) => { const n = Number(t.trim().replace(',', '.')); return t.trim() && Number.isFinite(n) && n >= 0 ? n : undefined; };
const v = (r: ResultadoCalculo, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;
const inssDe = (r: ResultadoCalculo) => v(r, 'INSS') + v(r, 'INSS13') + v(r, 'INSSFER') + v(r, 'INSSFERRET');
const irrfDe = (r: ResultadoCalculo) => v(r, 'IRRF') + v(r, 'IRRF13') + v(r, 'IRRFFER') + v(r, 'IRRFFERRET');
type Folha = 'mensal' | '13-1a' | '13-2a' | 'ferias' | 'rescisao';
interface ParamRescisao { data: string; tipo: TipoRescisao | ''; aviso: AvisoPrevio; pagamento?: string; saldoFgts?: number; adiantamento13?: number; simulada: boolean }
/** Chave da linha: o gozo nas férias (pode haver dois no mês), a ficha nas demais. */
const chave = (r: ResultadoCalculo) => (r as Partial<ResultadoFerias>).gozoId || r.fichaId;
const br = (d: string) => d.split('-').reverse().join('/');
const real = (c: number) => (c ? reais(c) : '—');

interface Dados { fichas: FichaFuncionario[]; afastamentos: Afastamento[]; tabelas: TabelaLegal[] }

const diasNoMes = (c: string) => { const [a, m] = c.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const quando = (d?: Date) => (d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

const CalculoPanel: React.FC<{ currentUser: User }> = ({ currentUser }) => {
    const usuario: Usuario = { id: currentUser.uid ?? currentUser.id, email: currentUser.email };
    const mesAnterior = somarMeses(`${new Date().toLocaleDateString('sv-SE').slice(0, 7)}-01`, -1).slice(0, 7);
    const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
    // Empresa e período ativos da sessão; fora do app (testes), escolhe aqui.
    const { ativa } = useEmpresaAtiva();
    const inicio = ativa?.competencia ?? mesAnterior;
    const [empresaId, setEmpresaId] = useState(ativa?.id ?? '');
    const [competencia, setCompetencia] = useState(inicio);
    const [pagamento, setPagamento] = useState(competenciaSeguinte(inicio));
    const [dados, setDados] = useState<Dados | null>(null);
    const [movs, setMovs] = useState<Record<string, Movimento>>({});
    const [gravados, setGravados] = useState<Record<string, MovimentoGravado> | null>(null);
    const [versao, setVersao] = useState(0);
    const [aberto, setAberto] = useState('');
    const [erro, setErro] = useState('');
    const [errosMov, setErrosMov] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const [aviso, setAviso] = useState('');
    const [conferir, setConferir] = useState(false);
    const [leitura, setLeitura] = useState<LeituraHolerites | null>(null);
    const [folha, setFolha] = useState<Folha>('mensal');
    const [ano, setAno] = useState(new Date().getFullYear());
    const [movsAno, setMovsAno] = useState<Record<string, Record<string, Movimento>> | null>(null);
    const [opcoes13, setOpcoes13] = useState<Opcoes13>(OPCOES_13_PADRAO);
    const [primeiras, setPrimeiras] = useState<Record<string, number>>({});
    const mensal = folha === 'mensal';
    const ferias = folha === 'ferias';
    const rescisao = folha === 'rescisao';
    const [paramsResc, setParamsResc] = useState<Record<string, ParamRescisao>>({});
    const [simular, setSimular] = useState<{ fichaId: string; data: string; tipo: TipoRescisao; aviso: AvisoPrevio }>({ fichaId: '', data: '', tipo: '02', aviso: 'indenizado' });
    const [abonos, setAbonos] = useState<Record<string, number>>({});
    // Férias programadas na tela (simulação): gozo motivo 15 ainda não gravado em Afastamentos.
    const [progFerias, setProgFerias] = useState({ fichaId: '', inicio: '', dias: '30', abono: '' });
    const [feriasSimuladas, setFeriasSimuladas] = useState<Afastamento[]>([]);
    const [gravandoGozo, setGravandoGozo] = useState(false);
    // Lotes do eSocial da empresa: situação do S-2230 de cada gozo gravado.
    const [enviosEsocial, setEnviosEsocial] = useState<Envio[] | null>(null);
    const [recargaEnvios, setRecargaEnvios] = useState(0);
    useEffect(() => { setEnviosEsocial(null); if (!empresaId || folha !== 'ferias') return; listarEnvios(empresaId).then(setEnviosEsocial).catch(() => setEnviosEsocial([])); }, [empresaId, folha, recargaEnvios]);
    const [opcoesFerias, setOpcoesFerias] = useState<OpcoesFerias>(OPCOES_FERIAS_PADRAO);
    const [recarga, setRecarga] = useState(0);
    // Folha mensal: movimentos de todos os meses, para os recibos de férias que tocam o mês (médias e faltas).
    const [movsEmpresa, setMovsEmpresa] = useState<Record<string, Record<string, Movimento>> | null>(null);
    const [salvos, setSalvos] = useState(0);
    const [gravandoAbono, setGravandoAbono] = useState(false);

    useEffect(() => { listarEmpresasVisiveis().then(setEmpresas).catch(e => { setErro(mensagemErro(e)); setEmpresas([]); }); }, []);
    useEffect(() => {
        setDados(null); setMovs({}); setAberto('');
        if (!empresaId) return;
        setErro('');
        Promise.all([listarFuncionarios(empresaId), listarAfastamentos(empresaId), listarTabelas()])
            .then(([fichas, afastamentos, tabelas]) => setDados({ fichas, afastamentos, tabelas }))
            .catch(e => { setErro(mensagemErro(e)); setDados({ fichas: [], afastamentos: [], tabelas: [] }); });
    }, [empresaId, recarga]);
    // Enquadramento previdenciário (parte patronal do resumo); sem ele, o resumo mostra só os segurados.
    const [enquadramentos, setEnquadramentos] = useState<Enquadramento[]>([]);
    const [erroEnq, setErroEnq] = useState('');
    useEffect(() => {
        setEnquadramentos([]); setErroEnq('');
        if (!empresaId) return;
        let valida = true;
        // Falha na leitura não pode parecer "empresa sem enquadramento": vira erro visível na tela, no PDF e no Excel.
        listarEnquadramentos(empresaId).then(l => { if (valida) setEnquadramentos(l); }).catch(e => { if (valida) setErroEnq(mensagemErro(e)); });
        return () => { valida = false; };
    }, [empresaId]);

    const compOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(competencia);
    const carregarMovimentos = () => {
        setGravados(null); setErrosMov([]);
        if (!empresaId || !compOk) { setMovs({}); return; }
        listarMovimentos(empresaId, competencia)
            .then(lista => {
                const mapa = Object.fromEntries(lista.map(g => [g.fichaId, g]));
                setGravados(mapa); setMovs(Object.fromEntries(lista.map(g => [g.fichaId, g.movimento]))); setVersao(n => n + 1);
            })
            .catch(e => { setErro(mensagemErro(e)); setGravados({}); setMovs({}); });
    };
    useEffect(carregarMovimentos, [empresaId, competencia]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => setLeitura(null), [empresaId, competencia]);
    useEffect(() => {
        setMovsEmpresa(null);
        if (!mensal || !empresaId) return;
        let valida = true;
        // Falha na leitura: mostra o erro e deixa sem histórico (o mês com férias fica "incompleto"), nunca histórico vazio inventado.
        listarMovimentosDaEmpresa(empresaId).then(m => { if (valida) setMovsEmpresa(m); }).catch(e => { if (valida) setErro(`Movimentos gravados não carregados (médias e faltas das férias): ${mensagemErro(e)}`); });
        return () => { valida = false; };
    }, [empresaId, mensal, recarga, salvos]);
    useEffect(() => {
        setMovsAno(null); setPrimeiras({});
        if (mensal || !empresaId) return;
        // Resposta antiga (troca rápida de empresa ou ano) não sobrescreve a atual.
        let valida = true;
        (ferias || rescisao ? listarMovimentosDaEmpresa(empresaId) : listarMovimentosDoAno(empresaId, ano))
            .then(m => { if (valida) setMovsAno(m); })
            .catch(e => { if (valida) setErro(`Movimentos gravados não carregados: ${mensagemErro(e)}`); });
        return () => { valida = false; };
    }, [empresaId, ano, mensal, ferias, rescisao]);
    function trocarFolha(f: Folha, a = ano) {
        setFolha(f); setAno(a); setAberto(''); setConferir(false);
        if (f === 'ferias') setAbonos({});
        setPagamento(f === 'mensal' ? competenciaSeguinte(competencia) : f === 'ferias' || f === 'rescisao' ? '' : `${a}-${f === '13-1a' ? '11' : '12'}`);
    }

    const pendentes = useMemo(() => [...new Set([...Object.keys(movs), ...Object.keys(gravados ?? {})])]
        .filter(id => id && !mesmoMovimento(movs[id], gravados?.[id]?.movimento)), [movs, gravados]);
    useEffect(() => {
        if (!pendentes.length) return;
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [pendentes.length]);
    /** Troca de empresa ou competência: pergunta antes de descartar o que não foi salvo. */
    const seguro = (f: () => void) => { if (!pendentes.length || window.confirm(`Há movimento não salvo de ${pendentes.length} funcionário(s). Descartar?`)) { setAviso(''); f(); } };

    const empresa = empresas?.find(e => e.id === empresaId);
    const resultados = useMemo(() => {
        if (!dados) return [];
        if (rescisao) {
            if (!movsAno || !/^\d{4}-\d{2}$/.test(competencia)) return [];
            // Desligados do mês (data da ficha) e simulações do mês.
            const itens = new Map<string, ParamRescisao>();
            for (const f of dados.fichas) if (f.dados.dataDesligamento?.startsWith(competencia)) itens.set(f.id, { data: f.dados.dataDesligamento, tipo: f.dados.motivoDesligamento && f.dados.motivoDesligamento in TIPOS_RESCISAO ? f.dados.motivoDesligamento as TipoRescisao : '', aviso: 'indenizado', simulada: false }); // motivo do S-2299, quando importado
            for (const [id, p] of Object.entries(paramsResc)) if (p.data.startsWith(competencia) || itens.has(id)) itens.set(id, { ...itens.get(id), ...p });
            return [...itens.entries()].flatMap(([id, p]) => {
                const f = dados.fichas.find(x => x.id === id);
                return f ? [calcularRescisao({ ficha: f, data: p.data, tipo: p.tipo, aviso: p.aviso, pagamento: p.pagamento, saldoFgts: p.saldoFgts, adiantamento13: p.adiantamento13, opcoes: opcoesFerias,
                    afastamentos: dados.afastamentos.filter(a => a.fichaId === id), tabelas: dados.tabelas, movimentos: movsAno[id] ?? {} })] : [];
            });
        }
        if (ferias) {
            if (!movsAno || !/^\d{4}-\d{2}$/.test(competencia)) return [];
            const fichas = new Map(dados.fichas.map(f => [f.id, f]));
            const gravados = new Set(dados.afastamentos.map(a => a.id));
            const simulados = feriasSimuladas.filter(g => !gravados.has(g.id));
            return gozosNoMes([...dados.afastamentos, ...simulados], new Set(fichas.keys()), competencia).map(g => calcularFerias({
                ficha: fichas.get(g.fichaId)!, gozo: g, afastamentos: dados.afastamentos.filter(a => a.fichaId === g.fichaId), tabelas: dados.tabelas,
                movimentos: movsAno[g.fichaId] ?? {}, abonoDias: abonos[g.id], opcoes: opcoesFerias,
            }));
        }
        if (!mensal) {
            if (!movsAno) return [];
            const admitidosAte = folha === '13-1a' && /^\d{4}-\d{2}$/.test(pagamento) ? ultimoDiaDoMes(pagamento) : `${ano}-12-31`;
            return com13(dados.fichas, ano, admitidosAte).map(f => calcular13({
                ano, parcela: folha === '13-1a' ? '1a' : '2a', pagamento, ficha: f, tabelas: dados.tabelas, opcoes: opcoes13,
                afastamentos: dados.afastamentos.filter(a => a.fichaId === f.id), movimentos: movsAno[f.id] ?? {}, primeiraPaga: primeiras[f.id],
            }));
        }
        if (!/^\d{4}-\d{2}$/.test(competencia)) return [];
        return noMes(dados.fichas, competencia).map(f => {
            const afs = dados.afastamentos.filter(a => a.fichaId === f.id);
            return calcularMensal({
                competencia, pagamento, ficha: f, tabelas: dados.tabelas, movimento: movs[f.id], afastamentos: afs,
                feriasDoMes: movsEmpresa ? feriasDaCompetencia(f, afs, dados.tabelas, movsEmpresa[f.id] ?? {}, competencia) : undefined,
            });
        });
    }, [dados, competencia, pagamento, movs, movsEmpresa, mensal, ferias, rescisao, paramsResc, movsAno, ano, folha, opcoes13, primeiras, abonos, opcoesFerias, feriasSimuladas]);
    const total = (f: (r: ResultadoCalculo) => number) => resultados.reduce((s, r) => s + f(r), 0);
    const sel = resultados.find(r => chave(r) === aberto);
    const nomeDe = (id: string) => dados?.fichas.find(f => f.id === id)?.dados.nome || id;
    const [verResumo, setVerResumo] = useState(false);
    // Competência da parte patronal: a do mês; o 13º na de dezembro; recibos de férias não (entram na folha do mês).
    const competenciaPatronal = mensal || rescisao ? competencia : ferias ? '' : `${ano}-12`;
    const vigente = competenciaPatronal && empresaId ? enquadramentoVigente(enquadramentos, empresaId, competenciaPatronal) : null;
    const enqVigente = vigente && 'enquadramento' in vigente ? vigente.enquadramento : undefined;
    const resumo = useMemo(() => resumirFolha(resultados, enqVigente), [resultados, enqVigente]);
    const tituloFolha = mensal ? `Folha mensal ${br(competencia)}` : ferias ? `Recibos de férias ${br(competencia)}` : rescisao ? `Rescisões ${br(competencia)}` : `13º salário ${ano} — ${folha === '13-1a' ? '1ª' : '2ª'} parcela`;
    const sufixoArquivo = mensal ? competencia : ferias ? `ferias-${competencia}` : rescisao ? `rescisao-${competencia}` : `${ano}-13-${folha === '13-1a' ? '1a' : '2a'}-parcela`;
    const avisoEnq = erroEnq && !ferias ? ` ATENÇÃO: enquadramento não carregado (${erroEnq}); a parte patronal está fora do quadro.` : '';
    const observacaoResumo = avisoEnq + (mensal
        ? 'Folha mensal: o INSS dos segurados já soma o retido nos recibos de férias da competência. O IRRF vai à DCTFWeb do mês do pagamento (regime de caixa). Rescisões do mês têm 13º e aviso no TRCT, fora desta folha.'
        : rescisao ? 'Rescisões: o INSS do saldo e do 13º e o FGTS rescisório entram na competência do desligamento, junto com a folha mensal.'
        : ferias ? 'Recibos de férias: o INSS e o FGTS de cada competência entram na folha mensal correspondente; aqui é só o valor dos recibos.'
        : 'Folha de 13º: a 2ª parcela tem INSS e IRRF próprios (apuração do 13º na DCTFWeb); a 1ª parcela só tem FGTS.');
    const opcoesPdf = () => ({ empresa: { razaoSocial: empresa?.razaoSocial ?? '', cnpj: empresa?.cnpj ?? '', codigoSage: empresa?.codigoSage }, titulo: tituloFolha, previa: true });
    function pdfHolerites(lista: ResultadoCalculo[], nome: string) {
        if (!dados) return;
        holeritesPdf(lista, dados.fichas, opcoesPdf()).save(nome);
    }

    async function salvar() {
        if (!gravados) return;
        const itens = pendentes.map(id => ({ fichaId: id, antes: gravados[id]?.movimento ?? null, depois: limparMovimento(movs[id] ?? {}) }));
        const erros = itens.flatMap(i => validarMovimento(i.depois, diasNoMes(competencia)).map(e => `${nomeDe(i.fichaId)}: ${e}`));
        setErrosMov(erros); setAviso('');
        if (erros.length) return;
        setSalvando(true);
        try {
            await salvarMovimentos(empresaId, competencia, itens, usuario);
            setAviso(`Movimento de ${itens.length} funcionário(s) salvo.`);
            carregarMovimentos(); setSalvos(n => n + 1);
        } catch (e) { setErrosMov([mensagemErro(e)]); }
        finally { setSalvando(false); }
    }

    function exportar() {
        const planilha = resultados.map(r => ({
            Nome: r.nome, Situação: r.situacao, Proventos: r.totais.proventos / 100, INSS: inssDe(r) / 100, IRRF: irrfDe(r) / 100,
            'Salário-família': v(r, 'SF') / 100, Descontos: r.totais.descontos / 100, Líquido: r.totais.liquido / 100,
            'Base INSS': r.bases.inss / 100, 'Base FGTS': r.bases.fgts / 100, 'Rendimentos IRRF': r.bases.irrf / 100, FGTS: r.fgts / 100,
            'Erros e avisos': [...r.erros, ...r.avisos].join(' | '),
        }));
        const verbas = resultados.flatMap(r => r.verbas.map(x => ({ Nome: r.nome, Código: x.codigo, Descrição: x.descricao, Referência: x.referencia, Tipo: x.tipo, Valor: x.valor / 100 })));
        const memoria = resultados.flatMap(r => r.memoria.map(m => ({ Nome: r.nome, Passo: m })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planilha), 'Resumo');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(verbas), 'Verbas');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(memoria), 'Memória');
        const e = resumo.encargos;
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
            ...resumo.porVerba.map(l => ({ Item: `${l.codigo} ${l.descricao}`, Tipo: l.tipo, Funcionários: l.funcionarios, Valor: l.valor / 100 })),
            { Item: 'Total de proventos', Tipo: '', Funcionários: '', Valor: resumo.totais.proventos / 100 },
            { Item: 'Total de descontos', Tipo: '', Funcionários: '', Valor: resumo.totais.descontos / 100 },
            { Item: 'Líquido', Tipo: '', Funcionários: '', Valor: resumo.totais.liquido / 100 },
            { Item: 'INSS dos segurados', Tipo: 'guia', Funcionários: '', Valor: e.inssSegurados / 100 },
            { Item: 'Salário-família (dedução na DCTFWeb)', Tipo: 'guia', Funcionários: '', Valor: e.salarioFamilia / 100 },
            { Item: 'Salário-maternidade (compensação na DCTFWeb)', Tipo: 'guia', Funcionários: '', Valor: e.salarioMaternidade / 100 },
            ...(e.patronal ? [
                { Item: 'Contribuição patronal', Tipo: 'guia', Funcionários: '', Valor: e.patronal.patronal / 100 },
                { Item: `RAT ajustado (${e.patronal.aliquotaRat}%)`, Tipo: 'guia', Funcionários: '', Valor: e.patronal.rat / 100 },
                { Item: 'Terceiros', Tipo: 'guia', Funcionários: '', Valor: e.patronal.terceiros / 100 },
                { Item: 'Total previdenciário (DCTFWeb)', Tipo: 'guia', Funcionários: '', Valor: (e.totalPrevidenciario ?? 0) / 100 },
            ] : erroEnq ? [{ Item: `Parte patronal NÃO CARREGADA (${erroEnq}): fora do total`, Tipo: 'guia', Funcionários: '', Valor: '' }] : []),
            { Item: 'IRRF retido', Tipo: 'guia', Funcionários: '', Valor: e.irrf / 100 },
            { Item: 'FGTS', Tipo: 'guia', Funcionários: '', Valor: e.fgts / 100 },
            { Item: 'Multa rescisória do FGTS', Tipo: 'guia', Funcionários: '', Valor: e.multaFgts / 100 },
        ]), 'Resumo da folha');
        if (leitura && dados) {
            const { linhas, semHolerite } = conferirTodos(leitura, dados.fichas, resultados, competencia);
            const conf: Record<string, string | number>[] = [
                ...linhas.flatMap(({ holerite: h, conferencia: c }): Record<string, string | number>[] => (c && c.linhas.length
                    ? c.linhas.map(l => ({ Funcionário: c.nome, Holerite: h.nome, Situação: c.situacao, Item: l.item, Motor: l.motor / 100, IOB: l.iob / 100, Diferença: l.diferenca / 100, Confere: l.ok ? 'sim' : 'não' }))
                    : [{ Funcionário: c?.nome ?? '', Holerite: h.nome, Situação: c?.situacao ?? 'sem ficha', Item: '', Motor: '', IOB: '', Diferença: '', Confere: '' }])),
                ...semHolerite.map(r => ({ Funcionário: r.nome, Holerite: '', Situação: 'sem holerite', Item: '', Motor: '', IOB: '', Diferença: '', Confere: '' })),
            ];
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conf), 'Conferência IOB');
        }
        XLSX.writeFile(wb, `calculo-${empresa?.codigoSage ?? 'empresa'}-${sufixoArquivo}.xlsx`);
    }

    return (
        <PdfContexto.Provider value={r => pdfHolerites([r], `holerite-${empresa?.codigoSage ?? 'empresa'}-${sufixoArquivo}-${(nomeDe(r.fichaId) || r.fichaId).replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}.pdf`)}>
        <div className="space-y-4">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                <strong>Prévia do motor de cálculo (Fase 3).</strong> Não substitui o cálculo do IOB enquanto não for conferido contra ele. O movimento do mês é gravado quando você clica em "Salvar movimento"; o resultado do cálculo não é gravado. 13º, férias e rescisão usam as médias de horas extras dos movimentos gravados. Adicionais, comissões e outras médias ainda não estão no motor.
            </div>
            <div className="flex flex-wrap items-end gap-3">
                {ativa ? <EmpresaAtivaFixa /> : <label className="text-sm dark:text-white">Empresa
                    <select aria-label="Empresa" className={`ml-2 ${inp}`} value={empresaId} onChange={e => { const v = e.target.value; seguro(() => setEmpresaId(v)); }}>
                        <option value="">— escolha —</option>
                        {(empresas ?? []).map(e => <option key={e.id} value={e.id}>{e.codigoSage} · {e.nomeFantasia || e.razaoSocial}</option>)}
                    </select>
                </label>}
                <label className="text-sm dark:text-white">Folha
                    <select aria-label="Folha" className={`ml-2 ${inp}`} value={folha} onChange={e => trocarFolha(e.target.value as Folha)}>
                        <option value="mensal">Mensal</option><option value="13-1a">13º — 1ª parcela</option><option value="13-2a">13º — 2ª parcela</option><option value="ferias">Férias</option><option value="rescisao">Rescisão</option>
                    </select>
                </label>
                {!mensal && !ferias && !rescisao && <label className="text-sm dark:text-white">Ano
                    <input aria-label="Ano" type="number" min={2000} max={2100} className={`ml-2 w-24 ${inp}`} value={ano} onChange={e => { const a = Number(e.target.value); if (a >= 2000 && a <= 2100) trocarFolha(folha, a); }} />
                </label>}
                {(mensal || ferias || rescisao) && <label className="text-sm dark:text-white" title={ferias ? 'Mês em que as férias começam.' : undefined}>{ferias ? 'Início das férias em' : rescisao ? 'Desligamentos em' : 'Competência'}
                    <input aria-label="Competência" type="month" className={`ml-2 ${inp}`} value={competencia} onChange={e => { const c = e.target.value; seguro(() => { setCompetencia(c); setAberto(''); if (/^\d{4}-\d{2}$/.test(c) && !ferias && !rescisao) setPagamento(competenciaSeguinte(c)); }); }} />
                </label>}
                {!ferias && !rescisao && <label className="text-sm dark:text-white" title="O IRRF segue o mês do pagamento (regime de caixa).">Pagamento em
                    <input aria-label="Mês do pagamento" type="month" className={`ml-2 ${inp}`} value={pagamento} onChange={e => setPagamento(e.target.value)} />
                </label>}
                {mensal && <button className="ml-auto rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!pendentes.length || salvando || !gravados} onClick={salvar}>
                    {salvando ? 'Salvando…' : `Salvar movimento${pendentes.length ? ` (${pendentes.length})` : ''}`}
                </button>}
                {mensal && <button className={btn} disabled={!resultados.length} aria-pressed={conferir} onClick={() => setConferir(c => !c)}>Conferir com holerites do IOB</button>}
                <button className={`${mensal ? '' : 'ml-auto '}${btn}`} disabled={!resultados.length} aria-pressed={verResumo} onClick={() => setVerResumo(x => !x)}>Resumo da folha</button>
                <button className={btn} disabled={!resultados.some(r => r.situacao !== 'erro')} onClick={() => pdfHolerites(resultados, `holerites-${empresa?.codigoSage ?? 'empresa'}-${sufixoArquivo}.pdf`)}>Holerites (PDF)</button>
                <button className={btn} disabled={!resultados.length} onClick={exportar}>Exportar Excel</button>
            </div>
            {rescisao && dados && (
                <div className="space-y-2 rounded border border-slate-200 p-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                    <p>Desligados no mês pela data da ficha (S-2299) e simulações. Confira o tipo e o aviso de cada um no detalhe. Pagamento em até 10 dias do término.</p>
                    <div className="flex flex-wrap items-end gap-2">
                        <span className="font-medium">Simular rescisão:</span>
                        <select aria-label="Funcionário a simular" className={inp} value={simular.fichaId} onChange={e => setSimular(x => ({ ...x, fichaId: e.target.value }))}>
                            <option value="">— funcionário ativo —</option>
                            {dados.fichas.filter(f => f.situacao === 'ativo' && !f.dados.dataDesligamento).map(f => <option key={f.id} value={f.id}>{f.dados.nome || f.cpf}</option>)}
                        </select>
                        <input aria-label="Data do desligamento" type="date" className={inp} value={simular.data} onChange={e => setSimular(x => ({ ...x, data: e.target.value }))} />
                        <select aria-label="Tipo da simulação" className={inp} value={simular.tipo} onChange={e => setSimular(x => ({ ...x, tipo: e.target.value as TipoRescisao }))}>
                            {Object.entries(TIPOS_RESCISAO).map(([c, t]) => <option key={c} value={c}>{c} — {t}</option>)}
                        </select>
                        <select aria-label="Aviso da simulação" className={inp} value={simular.aviso} onChange={e => setSimular(x => ({ ...x, aviso: e.target.value as AvisoPrevio }))}>
                            {Object.entries(ROTULO_AVISO).map(([c, t]) => <option key={c} value={c}>{t}</option>)}
                        </select>
                        <button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!simular.fichaId || !/^\d{4}-\d{2}-\d{2}$/.test(simular.data)}
                            onClick={() => { setParamsResc(x => ({ ...x, [simular.fichaId]: { data: simular.data, tipo: simular.tipo, aviso: simular.aviso, simulada: true } })); setCompetencia(simular.data.slice(0, 7)); setAberto(simular.fichaId); }}>Simular</button>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                        <span className="font-medium">IRRF do 13º na rescisão (confirme com o IOB; o saldo de salário segue a regra mensal):</span>
                        <label className="flex items-center gap-1"><input type="checkbox" checked={opcoesFerias.simplificado} onChange={e => setOpcoesFerias(o => ({ ...o, simplificado: e.target.checked }))} />desconto simplificado no 13º</label>
                        <label className="flex items-center gap-1"><input type="checkbox" checked={opcoesFerias.redutor} onChange={e => setOpcoesFerias(o => ({ ...o, redutor: e.target.checked }))} />redutor de 2026 no 13º</label>
                    </div>
                </div>
            )}
            {ferias && dados && (() => {
                const diasN = Number(progFerias.dias); const abonoN = Number(progFerias.abono || 0);
                const valido = !!progFerias.fichaId && /^\d{4}-\d{2}-\d{2}$/.test(progFerias.inicio) && Number.isInteger(diasN) && diasN >= 5 && diasN <= 30 && Number.isInteger(abonoN) && abonoN >= 0 && abonoN <= 10;
                function programar() {
                    const f = dados!.fichas.find(x => x.id === progFerias.fichaId);
                    if (!f || !valido) return;
                    const fim = new Date(Date.parse(`${progFerias.inicio}T00:00:00Z`) + (diasN - 1) * 86400000).toISOString().slice(0, 10);
                    const g: Afastamento = { ...afastamentoVazio(), id: idAfastamento(f.id, progFerias.inicio), empresaId: f.empresaId, fichaId: f.id, cpf: f.cpf, matriculaEsocial: f.matriculaEsocial,
                        dtInicio: progFerias.inicio, dtFim: fim, motivo: '15', abonoDias: abonoN ? String(abonoN) : '', observacao: 'Programado no Cálculo › Férias' };
                    setFeriasSimuladas(xs => [...xs.filter(x => x.fichaId !== f.id), g]);
                    setCompetencia(progFerias.inicio.slice(0, 7)); setAberto(g.id);
                }
                return (
                    <div className="space-y-2 rounded border border-slate-200 p-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                        <div className="flex flex-wrap items-end gap-2">
                            <span className="font-medium">Programar férias:</span>
                            <select aria-label="Funcionário das férias" className={inp} value={progFerias.fichaId} onChange={e => setProgFerias(x => ({ ...x, fichaId: e.target.value }))}>
                                <option value="">— funcionário ativo —</option>
                                {dados.fichas.filter(f => f.situacao !== 'desligado' && !f.dados.dataDesligamento).sort((a, b) => (a.dados.nome ?? '').localeCompare(b.dados.nome ?? '', 'pt-BR')).map(f => <option key={f.id} value={f.id}>{f.dados.nome || f.cpf}</option>)}
                            </select>
                            <label>Início<input aria-label="Início das férias programadas" type="date" className={`ml-1 ${inp}`} value={progFerias.inicio} onChange={e => setProgFerias(x => ({ ...x, inicio: e.target.value }))} /></label>
                            <label>Dias de gozo<input aria-label="Dias de gozo" inputMode="numeric" className={`ml-1 w-14 ${inp}`} value={progFerias.dias} onChange={e => setProgFerias(x => ({ ...x, dias: e.target.value.replace(/\D/g, '').slice(0, 2) }))} /></label>
                            <label>Abono (dias)<input aria-label="Dias de abono programados" inputMode="numeric" className={`ml-1 w-14 ${inp}`} value={progFerias.abono} onChange={e => setProgFerias(x => ({ ...x, abono: e.target.value.replace(/\D/g, '').slice(0, 2) }))} /></label>
                            <button className="rounded bg-blue-700 px-3 py-1.5 text-white disabled:opacity-50" disabled={!valido} onClick={programar}>Calcular</button>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400">O período aquisitivo é o mais antigo com saldo, pela admissão e pelas férias já gozadas (Cadastros › Afastamentos). A programação é uma simulação até você gravar no detalhe do recibo.</p>
                    </div>
                );
            })()}
            {ferias && (
                <div className="flex flex-wrap items-center gap-4 rounded border border-slate-200 p-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                    <span>Recibo de cada gozo lançado em Cadastros › Afastamentos (motivo 15) ou programado acima. Pagamento até 2 dias antes do início; o IRRF usa a tabela desse mês.</span>
                    <span className="font-medium">IRRF das férias (confirme com o IOB):</span>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={opcoesFerias.simplificado} onChange={e => setOpcoesFerias(o => ({ ...o, simplificado: e.target.checked }))} />desconto simplificado</label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={opcoesFerias.redutor} onChange={e => setOpcoesFerias(o => ({ ...o, redutor: e.target.checked }))} />redutor de 2026</label>
                </div>
            )}
            {folha === '13-2a' && (
                <div className="flex flex-wrap items-center gap-4 rounded border border-slate-200 p-2 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-200">
                    <span className="font-medium">IRRF do 13º (confirme a regra na norma e com o IOB):</span>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={opcoes13.redutor} onChange={e => setOpcoes13(o => ({ ...o, redutor: e.target.checked }))} />aplicar o redutor de 2026</label>
                    <label className="flex items-center gap-1"><input type="checkbox" checked={opcoes13.simplificado} onChange={e => setOpcoes13(o => ({ ...o, simplificado: e.target.checked }))} />aplicar o desconto simplificado</label>
                </div>
            )}
            {errosMov.length > 0 && <ul role="alert" aria-label="Erros do movimento" className="list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{errosMov.map(e => <li key={e}>{e}</li>)}</ul>}
            {aviso && <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">{aviso}</p>}

            {erro && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{erro}</p>}
            {empresaId && !dados && <p className="text-sm text-slate-500">Carregando…</p>}
            {dados && !mensal && !movsAno && !erro && <p className="text-sm text-slate-500">Carregando os movimentos gravados…</p>}
            {dados && !resultados.length && (mensal || movsAno) && <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-600">{mensal ? 'Nenhum funcionário com vínculo nesta competência. Confira o cadastro em Cadastros › Funcionários.' : rescisao ? `Nenhum desligamento em ${br(competencia)}. Use "Simular rescisão" para calcular a de um funcionário ativo.` : ferias ? `Nenhum gozo de férias começando em ${br(competencia).slice(0, 7)}. Use "Programar férias" acima ou lance em Cadastros › Afastamentos (motivo 15 — gozo de férias).` : `Nenhum funcionário com 13º em ${ano} (desligados recebem na rescisão). Confira o cadastro em Cadastros › Funcionários.`}</p>}

            {resultados.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                            <tr><th className="p-2">Nome</th><th className="p-2 text-right">Proventos</th><th className="p-2 text-right">INSS</th><th className="p-2 text-right">IRRF</th><th className="p-2 text-right">Sal.-família</th><th className="p-2 text-right">Líquido</th><th className="p-2 text-right">FGTS</th><th className="p-2">Situação</th></tr>
                        </thead>
                        <tbody>
                            {resultados.map(r => (
                                <tr key={chave(r)} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700 ${aberto === chave(r) ? 'bg-blue-50 dark:bg-slate-700' : ''}`} onClick={() => setAberto(a => (a === chave(r) ? '' : chave(r)))}>
                                    <td className="p-2 font-medium">{r.nome}{!mensal ? null : pendentes.includes(r.fichaId) ? <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">(não salvo)</span> : !movimentoVazio(movs[r.fichaId]) && <span className="ml-1 text-xs text-blue-700 dark:text-blue-300">(com movimento)</span>}</td>
                                    <td className="p-2 text-right">{real(r.totais.proventos)}</td>
                                    <td className="p-2 text-right">{real(inssDe(r))}</td>
                                    <td className="p-2 text-right" title={(r as Partial<ResultadoFerias>).irrf?.semRetencao ? `Sem retenção: ${(r as ResultadoFerias).irrf!.semRetencao}` : undefined}>{(r as Partial<ResultadoFerias>).irrf && !irrfDe(r) ? 'R$ 0,00' : real(irrfDe(r))}</td>
                                    <td className="p-2 text-right">{real(v(r, 'SF'))}</td>
                                    <td className="p-2 text-right font-medium">{r.situacao === 'erro' ? '—' : reais(r.totais.liquido)}</td>
                                    <td className="p-2 text-right">{real(r.fgts)}</td>
                                    <td className="p-2 text-xs" title={[...r.erros, ...r.avisos].join('\n')}><span className={`rounded px-1.5 ${SITUACAO[r.situacao][1]}`}>{SITUACAO[r.situacao][0]}</span>{r.avisos.length > 0 && <span className="ml-1 text-amber-700 dark:text-amber-300">{r.avisos.length} aviso(s)</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="border-t-2 border-slate-200 font-medium dark:border-slate-600 dark:text-white">
                            <tr><td className="p-2">Total ({resultados.length})</td><td className="p-2 text-right">{reais(total(r => r.totais.proventos))}</td><td className="p-2 text-right">{reais(total(inssDe))}</td><td className="p-2 text-right">{reais(total(irrfDe))}</td><td className="p-2 text-right">{reais(total(r => v(r, 'SF')))}</td><td className="p-2 text-right">{reais(total(r => r.totais.liquido))}</td><td className="p-2 text-right">{reais(total(r => r.fgts))}</td><td /></tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {verResumo && resultados.length > 0 && (
                <section aria-label="Resumo da folha" className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <h3 className="font-semibold text-slate-800 dark:text-white">Resumo da folha — {tituloFolha}</h3>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{resumo.funcionarios} funcionário(s){resumo.registros !== resumo.funcionarios ? ` em ${resumo.registros} cálculos` : ''}: {resumo.situacoes.calculado} calculado(s), {resumo.situacoes.incompleto} incompleto(s), {resumo.situacoes.erro} com erro (fora dos totais).</p>
                        </div>
                        <button className={btn} onClick={() => resumoPdf(resumo, opcoesPdf(), observacaoResumo).save(`resumo-${empresa?.codigoSage ?? 'empresa'}-${sufixoArquivo}.pdf`)}>Resumo (PDF)</button>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <table className="w-full text-sm dark:text-slate-100">
                            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Verba</th><th className="py-1 text-right">Func.</th><th className="py-1 text-right">Proventos</th><th className="py-1 text-right">Descontos</th></tr></thead>
                            <tbody>{resumo.porVerba.map(l => (
                                <tr key={`${l.tipo}|${l.codigo}|${l.descricao}`} className="border-t border-slate-100 dark:border-slate-700"><td className="py-1">{l.descricao}</td><td className="py-1 text-right">{l.funcionarios}</td><td className="py-1 text-right">{l.tipo === 'provento' ? reais(l.valor) : ''}</td><td className="py-1 text-right">{l.tipo === 'desconto' ? reais(l.valor) : ''}</td></tr>
                            ))}</tbody>
                            <tfoot className="border-t-2 border-slate-200 font-medium dark:border-slate-600">
                                <tr><td className="py-1" colSpan={2}>Totais</td><td className="py-1 text-right">{reais(resumo.totais.proventos)}</td><td className="py-1 text-right">{reais(resumo.totais.descontos)}</td></tr>
                                <tr><td className="py-1" colSpan={3}>Líquido</td><td className="py-1 text-right">{reais(resumo.totais.liquido)}</td></tr>
                            </tfoot>
                        </table>
                        <div className="space-y-2 text-sm dark:text-slate-100">
                            <h4 className="text-xs font-semibold uppercase text-slate-500">Para conferir as guias</h4>
                            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                                <dt>INSS dos segurados</dt><dd className="text-right">{reais(resumo.encargos.inssSegurados)}</dd>
                                <dt>Salário-família (dedução na DCTFWeb)</dt><dd className="text-right">{reais(resumo.encargos.salarioFamilia)}</dd>
                                <dt>Salário-maternidade (compensação na DCTFWeb)</dt><dd className="text-right">{reais(resumo.encargos.salarioMaternidade)}</dd>
                                {resumo.encargos.patronal && (
                                    <>
                                        <dt>Contribuição patronal</dt><dd className="text-right">{reais(resumo.encargos.patronal.patronal)}</dd>
                                        <dt>RAT ajustado ({resumo.encargos.patronal.aliquotaRat.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%)</dt><dd className="text-right">{reais(resumo.encargos.patronal.rat)}</dd>
                                        <dt>Terceiros</dt><dd className="text-right">{reais(resumo.encargos.patronal.terceiros)}</dd>
                                        <dt className="font-semibold">Total previdenciário (DCTFWeb)</dt><dd className="text-right font-semibold">{reais(resumo.encargos.totalPrevidenciario ?? 0)}</dd>
                                    </>
                                )}
                                <dt>IRRF retido</dt><dd className="text-right">{reais(resumo.encargos.irrf)}</dd>
                                <dt>FGTS</dt><dd className="text-right">{reais(resumo.encargos.fgts)}</dd>
                                {resumo.encargos.multaFgts > 0 && <><dt>Multa rescisória do FGTS</dt><dd className="text-right">{reais(resumo.encargos.multaFgts)}</dd></>}
                                <dt className="text-slate-500">Bases INSS / FGTS / IRRF</dt><dd className="text-right text-slate-500">{reais(resumo.bases.inss)} / {reais(resumo.bases.fgts)} / {reais(resumo.bases.irrf)}</dd>
                            </dl>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{observacaoResumo} {resumo.encargos.patronal
                                ? `Parte patronal pelo enquadramento de ${enqVigente!.vigencia.split('-').reverse().join('/')} (${resumo.encargos.patronal.regime === 'simples' ? 'Simples: patronal no DAS' : `base ${reais(resumo.encargos.patronal.base)}, sem o salário-maternidade`}). Confira o total com a Conferência pós-folha (S-5011).`
                                : ferias ? 'Nos recibos de férias não há parte patronal própria: ela entra na folha do mês.' : erroEnq ? '' : 'Sem enquadramento vigente (Cadastros › Enquadramento): a parte patronal não entra no quadro.'}</p>
                            {erroEnq && !ferias && <p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">Enquadramento não carregado ({erroEnq}): a parte patronal está FORA do quadro e do total. Não use estes valores para a DCTFWeb.</p>}
                        </div>
                    </div>
                </section>
            )}

            {conferir && dados && resultados.length > 0 && (
                <ConferenciaHolerites empresaId={empresaId} competencia={competencia} fichas={dados.fichas} resultados={resultados} usuario={usuario}
                    leitura={leitura} onLeitura={setLeitura} movimentos={movs}
                    onAplicarMovimento={(id, m) => { setMovs(x => ({ ...x, [id]: m })); setVersao(n => n + 1); setAviso(''); }} />
            )}

            {sel && mensal && <Holerite key={`${sel.fichaId}-${versao}`} r={sel} mov={movs[sel.fichaId] ?? {}} gravado={gravados?.[sel.fichaId]} pendente={pendentes.includes(sel.fichaId)} onMov={m => setMovs(x => ({ ...x, [sel.fichaId]: m }))} />}
            {sel && rescisao && (() => {
                const t = sel as ResultadoRescisao;
                const p: ParamRescisao = paramsResc[t.fichaId] ?? { data: t.data, tipo: t.tipo, aviso: 'indenizado', simulada: false };
                const mesPagamento = p.pagamento || t.pagamento;
                const mudar = (m: Partial<ParamRescisao>) => setParamsResc(x => ({ ...x, [t.fichaId]: { ...p, ...m } }));
                const reaisCampo = (rotulo: string, k: 'saldoFgts' | 'adiantamento13') => (
                    <label className="block">{rotulo}
                        <input aria-label={rotulo} className={`mt-0.5 block w-32 ${inp}`} defaultValue={p[k] ? (p[k]! / 100).toFixed(2).replace('.', ',') : ''}
                            onChange={e => { const c = centavosDeTexto(e.target.value); mudar({ [k]: c ?? undefined }); }} />
                    </label>
                );
                return (
                    <Holerite key={`${t.fichaId}-rescisao`} r={t}>
                        <div className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Rescisão {p.simulada ? '(simulação)' : ''}</h4>
                            <label className="block">Tipo do desligamento
                                <select aria-label="Tipo do desligamento" className={`mt-0.5 block ${inp}`} value={p.tipo} onChange={e => mudar({ tipo: e.target.value as TipoRescisao | '' })}>
                                    <option value="">— escolha —</option>
                                    {Object.entries(TIPOS_RESCISAO).map(([c, x]) => <option key={c} value={c}>{c} — {x}</option>)}
                                </select>
                            </label>
                            <label className="block">Aviso prévio
                                <select aria-label="Aviso prévio" className={`mt-0.5 block ${inp}`} value={p.aviso} onChange={e => mudar({ aviso: e.target.value as AvisoPrevio })}>
                                    {Object.entries(ROTULO_AVISO).map(([c, x]) => <option key={c} value={c}>{x}</option>)}
                                </select>
                            </label>
                            {p.simulada && <label className="block">Data do desligamento<input aria-label="Data do desligamento simulado" type="date" className={`mt-0.5 block ${inp}`} value={p.data} onChange={e => mudar({ data: e.target.value })} /></label>}
                            <label className="block">Mês do pagamento (tabela do IRRF)
                                <input aria-label="Mês do pagamento da rescisão" type="month" className={`mt-0.5 block ${inp}`} value={mesPagamento} onChange={e => mudar({ pagamento: e.target.value || undefined })} />
                            </label>
                            {reaisCampo('Saldo do FGTS para fins rescisórios (R$)', 'saldoFgts')}
                            {reaisCampo('13º já adiantado no ano (R$)', 'adiantamento13')}
                            <p>{t.diasAviso ? `Aviso de ${t.diasAviso} dias · ` : ''}fim projetado {br(t.dataProjetada)} · pagar até <strong>{t.pagarAte ? br(t.pagarAte) : '—'}</strong></p>
                            <p>Multa do FGTS{t.percentualMulta ? ` (${t.percentualMulta}%)` : ''}: <strong>{t.percentualMulta ? (t.multaFgts ? reais(t.multaFgts) : 'informe o saldo') : 'não há'}</strong> — paga por guia, fora do líquido. {t.saqueFgts}</p>
                            <p className="text-slate-500">Nada aqui é gravado. O desligamento oficial é o S-2299; a data e o motivo vêm da ficha.</p>
                            {p.simulada && <button className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" onClick={() => { setParamsResc(x => { const y = { ...x }; delete y[t.fichaId]; return y; }); setAberto(''); }}>Remover simulação</button>}
                        </div>
                    </Holerite>
                );
            })()}
            {sel && ferias && (() => {
                const f = sel as ResultadoFerias;
                return (
                    <Holerite key={`${f.gozoId}-ferias`} r={f}>
                        <div className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Recibo de férias</h4>
                            {f.periodo && <p>Período aquisitivo {br(f.periodo.inicio)} a {br(f.periodo.fim)} · concessivo até {br(f.periodo.fimConcessivo)}</p>}
                            <p>{f.diasGozo} dias de gozo · direito {f.direito} · saldo {f.saldo}{f.diasDobra ? ` · ${f.diasDobra} em dobro` : ''} · pagar até <strong>{f.pagarAte ? br(f.pagarAte) : '—'}</strong></p>
                            {f.porCompetencia.length > 0 && (
                                <table className="w-full max-w-sm"><thead className="text-left text-slate-500"><tr><th>Competência</th><th className="text-right">Dias</th><th className="text-right">Férias + 1/3</th><th className="text-right">INSS</th><th className="text-right">FGTS</th></tr></thead>
                                    <tbody>{f.porCompetencia.map(c => <tr key={c.competencia}><td>{br(c.competencia)}</td><td className="text-right">{c.dias}</td><td className="text-right">{reais(c.ferias + c.terco)}</td><td className="text-right">{reais(c.inss)}</td><td className="text-right">{reais(c.fgts)}</td></tr>)}</tbody></table>
                            )}
                            {f.irrf && (
                                <div aria-label="IRRF sobre férias" className="rounded border border-slate-200 p-2 dark:border-slate-700">
                                    <p className="font-medium">IRRF sobre férias (em separado)</p>
                                    <p>Rendimento tributável {reais(f.irrf.tributavel)} − {f.irrf.usouSimplificado ? 'desconto simplificado' : `INSS${f.irrf.dependentes ? ` e ${f.irrf.dependentes} dependente(s)` : ''}`} {reais(f.irrf.deducoes)} = base <strong>{reais(f.irrf.base)}</strong></p>
                                    <p>Tabela: {f.irrf.aliquota.toLocaleString('pt-BR')}%{f.irrf.parcelaDeduzir ? ` − ${reais(f.irrf.parcelaDeduzir)}` : ''} = {reais(f.irrf.calculado)}{f.irrf.redutor ? ` · redutor 2026 −${reais(f.irrf.redutor)}` : ''}{f.irrf.dispensado ? ` · dispensado (até R$ 10,00) −${reais(f.irrf.dispensado)}` : ''} · <strong>IRRF devido {reais(f.irrf.devido)}</strong></p>
                                    {f.irrf.semRetencao && <p role="note" className="mt-1 rounded bg-amber-50 p-1 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">Sem retenção: {f.irrf.semRetencao}.</p>}
                                </div>
                            )}
                            {(() => {
                                const gravado = dados?.afastamentos.find(a => a.id === f.gozoId);
                                const emp = empresas?.find(e => e.id === empresaId);
                                if (!gravado || !emp) return null;
                                return <StatusEsocialAfastamento afastamento={gravado} empresa={{ id: emp.id, cnpj: emp.cnpj, nome: emp.nomeFantasia || emp.razaoSocial }} usuario={usuario} envios={enviosEsocial} onAtualizado={() => setRecargaEnvios(n => n + 1)} />;
                            })()}
                            {(() => {
                                const simulado = !dados?.afastamentos.some(a => a.id === f.gozoId) ? feriasSimuladas.find(a => a.id === f.gozoId) : undefined;
                                if (!simulado) return null;
                                async function gravarGozo() {
                                    if (!simulado) return;
                                    const abono = abonos[simulado.id] ?? Number(simulado.abonoDias || 0);
                                    const g: Afastamento = { ...simulado, abonoDias: abono ? String(abono) : '', perAquisInicio: f.periodo?.inicio ?? '', perAquisFim: f.periodo?.fim ?? '' };
                                    if (!window.confirm(`Gravar as férias de ${br(g.dtInicio)} a ${br(g.dtFim)} em Cadastros › Afastamentos (motivo 15)?`)) return;
                                    setGravandoGozo(true); setErro('');
                                    try {
                                        await salvarAfastamento(null, g, usuario);
                                        setFeriasSimuladas(xs => xs.filter(x => x.id !== g.id));
                                        setRecarga(n => n + 1);
                                    } catch (e) { setErro(mensagemErro(e)); }
                                    finally { setGravandoGozo(false); }
                                }
                                return (
                                    <div className="rounded bg-amber-50 p-2 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
                                        <p><strong>Simulação:</strong> férias programadas aqui, ainda não gravadas em Afastamentos.</p>
                                        <div className="mt-1 flex flex-wrap gap-2">
                                            <button type="button" className="rounded bg-green-700 px-2 py-1 text-white disabled:opacity-50" disabled={gravandoGozo || !!f.erros?.length} onClick={gravarGozo}>{gravandoGozo ? 'Gravando…' : 'Gravar em Afastamentos'}</button>
                                            <button type="button" className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" onClick={() => { setFeriasSimuladas(xs => xs.filter(x => x.id !== simulado.id)); setAberto(''); }}>Remover simulação</button>
                                        </div>
                                    </div>
                                );
                            })()}
                            {(() => {
                                const gozo = dados?.afastamentos.find(a => a.id === f.gozoId);
                                const gravado = Number(gozo?.abonoDias || 0);
                                const mudou = abonos[f.gozoId] !== undefined && abonos[f.gozoId] !== gravado;
                                async function gravarAbono() {
                                    if (!gozo) return;
                                    setGravandoAbono(true); setErro('');
                                    try {
                                        await salvarAfastamento(gozo, { ...gozo, abonoDias: abonos[f.gozoId] ? String(abonos[f.gozoId]) : '' }, usuario);
                                        setAbonos(x => { const y = { ...x }; delete y[f.gozoId]; return y; });
                                        setRecarga(n => n + 1);
                                    } catch (e) { setErro(mensagemErro(e)); }
                                    finally { setGravandoAbono(false); }
                                }
                                return (
                                    <label className="block">Abono pecuniário (dias vendidos)
                                        <input aria-label="Dias de abono" className={`mt-0.5 block w-20 ${inp}`} defaultValue={String(abonos[f.gozoId] ?? (gravado || ''))}
                                            onChange={e => { const t = e.target.value.trim(); const n = Number(t || 0); setAbonos(x => { const y = { ...x }; if (t && Number.isInteger(n) && n >= 0) y[f.gozoId] = n; else if (!t) y[f.gozoId] = 0; else delete y[f.gozoId]; return y; }); }} />
                                        <span className="text-slate-500">Até 1/3 dos dias de direito. {gravado ? `Gravado no afastamento: ${gravado} dia(s).` : 'Nada gravado no afastamento.'} O abono gravado desconta do saldo do período nas próximas férias.</span>
                                        {mudou && gozo && <button type="button" className="mt-1 block rounded border border-slate-300 px-2 py-1 dark:border-slate-600" disabled={gravandoAbono} onClick={gravarAbono}>{gravandoAbono ? 'Gravando…' : 'Gravar abono no afastamento'}</button>}
                                    </label>
                                );
                            })()}
                            <p>Médias e faltas vêm dos movimentos gravados na folha mensal do período aquisitivo.</p>
                        </div>
                    </Holerite>
                );
            })()}
            {sel && !mensal && !ferias && !rescisao && (
                <Holerite key={`${sel.fichaId}-${folha}`} r={sel}>
                    <div className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-white">{folha === '13-1a' ? '1ª parcela do 13º' : '2ª parcela do 13º'}</h4>
                        <p>A média de horas extras vem dos movimentos gravados do ano na folha mensal. Para mudar, ajuste o movimento do mês e salve.</p>
                        {folha === '13-2a' && (
                            <label className="block">1ª parcela paga (R$), se diferente da calculada
                                <input aria-label="1ª parcela paga" className={`mt-0.5 block w-32 ${inp}`} defaultValue={primeiras[sel.fichaId] ? (primeiras[sel.fichaId] / 100).toFixed(2).replace('.', ',') : ''}
                                    onChange={e => { const c = centavosDeTexto(e.target.value); setPrimeiras(p => { const n = { ...p }; if (c !== null) n[sel.fichaId] = c; else delete n[sel.fichaId]; return n; }); }} />
                                <span className="text-slate-500">Não é gravado; use quando a 1ª parcela foi adiantada nas férias ou paga com outro valor.</span>
                            </label>
                        )}
                    </div>
                </Holerite>
            )}
        </div>
        </PdfContexto.Provider>
    );
};

const PdfContexto = React.createContext<((r: ResultadoCalculo) => void) | null>(null);

const Holerite: React.FC<{ r: ResultadoCalculo; mov?: Movimento; gravado?: MovimentoGravado; pendente?: boolean; onMov?: (m: Movimento) => void; children?: React.ReactNode }> = ({ r, mov = {}, gravado, pendente = false, onMov = () => {}, children }) => {
    const pdf = React.useContext(PdfContexto);
    const campo = (k: 'horasExtras50' | 'horasExtras100' | 'faltasDias' | 'dsrDescontadoDias' | 'feriadosLocais', rotulo: string) => (
        <label className="text-xs dark:text-slate-200">{rotulo}
            <input aria-label={rotulo} className={`mt-0.5 block w-24 ${inp}`} defaultValue={mov[k] != null ? String(mov[k]).replace('.', ',') : ''}
                onChange={e => onMov({ ...mov, [k]: decimal(e.target.value) })} />
        </label>
    );
    const lancs = mov.lancamentos ?? [];
    const setLanc = (i: number, l: Partial<Lancamento>) => onMov({ ...mov, lancamentos: lancs.map((x, j) => (j === i ? { ...x, ...l } : x)) });
    return (
        <section aria-label={`Holerite de ${r.nome}`} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-2 dark:border-slate-700 dark:bg-slate-800">
            <div>
                <h3 className="font-semibold text-slate-800 dark:text-white">{r.nome} · {r.competencia.endsWith('-13') ? `13º salário ${r.competencia.slice(0, 4)}` : r.competencia.split('-').reverse().join('/')} <span className="text-xs font-normal text-slate-500">(IRRF pelo pagamento em {r.pagamento.split('-').reverse().join('/')})</span></h3>
                {pdf && r.situacao !== 'erro' && <button className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" onClick={() => pdf(r)}>PDF deste holerite</button>}
                {r.erros.length > 0 && <ul role="alert" className="mt-2 list-disc rounded bg-red-50 p-2 pl-6 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">{r.erros.map(e => <li key={e}>{e}</li>)}</ul>}
                <table className="mt-2 w-full text-sm dark:text-slate-100">
                    <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Verba</th><th className="py-1">Ref.</th><th className="py-1 text-right">Proventos</th><th className="py-1 text-right">Descontos</th></tr></thead>
                    <tbody>{r.verbas.map(x => (
                        <tr key={x.codigo} className="border-t border-slate-100 dark:border-slate-700"><td className="py-1">{x.descricao}</td><td className="py-1 text-xs">{x.referencia}</td><td className="py-1 text-right">{x.tipo === 'provento' ? reais(x.valor) : ''}</td><td className="py-1 text-right">{x.tipo === 'desconto' ? reais(x.valor) : ''}</td></tr>
                    ))}</tbody>
                    <tfoot className="border-t-2 border-slate-200 font-medium dark:border-slate-600">
                        <tr><td className="py-1" colSpan={2}>Totais</td><td className="py-1 text-right">{reais(r.totais.proventos)}</td><td className="py-1 text-right">{reais(r.totais.descontos)}</td></tr>
                        <tr><td className="py-1" colSpan={3}>Líquido</td><td className="py-1 text-right">{reais(r.totais.liquido)}</td></tr>
                    </tfoot>
                </table>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">Base INSS {reais(r.bases.inss)} · Base FGTS {reais(r.bases.fgts)} · FGTS {reais(r.fgts)} · Rendimentos IRRF {reais(r.bases.irrf)}</p>
                <details open className="mt-2 text-xs text-slate-700 dark:text-slate-200">
                    <summary className="cursor-pointer font-medium">Memória de cálculo</summary>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-5">{r.memoria.map((m, i) => <li key={i}>{m}</li>)}</ol>
                </details>
                {r.avisos.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">{r.avisos.map(a => <li key={a}>{a}</li>)}</ul>}
            </div>
            {children ?? <div className="space-y-3">
                <div>
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Movimento do mês</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {pendente ? <span className="text-amber-700 dark:text-amber-300">Alterado e ainda não salvo.</span>
                            : gravado ? `Salvo por ${gravado.atualizadoPorEmail ?? '—'}${gravado.atualizadoEm ? ` em ${quando(gravado.atualizadoEm)}` : ''}.` : 'Sem movimento gravado.'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    {campo('horasExtras50', 'Horas extras 50%')}
                    {campo('horasExtras100', 'Horas extras 100%')}
                    {campo('faltasDias', 'Faltas (dias)')}
                    {campo('dsrDescontadoDias', 'DSR descontado (dias)')}
                    {campo('feriadosLocais', 'Feriados locais no mês')}
                    <label className="text-xs dark:text-slate-200">Pensão alimentícia (R$)
                        <input aria-label="Pensão alimentícia" className={`mt-0.5 block w-28 ${inp}`} defaultValue={mov.pensaoAlimenticia ? (mov.pensaoAlimenticia / 100).toFixed(2).replace('.', ',') : ''}
                            onChange={e => onMov({ ...mov, pensaoAlimenticia: centavosDeTexto(e.target.value) ?? undefined })} />
                    </label>
                </div>
                <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Lançamentos avulsos</p>
                    {lancs.map((l, i) => (
                        <div key={i} className="mt-1 flex flex-wrap items-center gap-2 text-xs dark:text-slate-200">
                            <input aria-label={`Descrição do lançamento ${i + 1}`} className={`w-40 ${inp}`} value={l.descricao} onChange={e => setLanc(i, { descricao: e.target.value })} />
                            <select aria-label={`Tipo do lançamento ${i + 1}`} className={inp} value={l.tipo} onChange={e => setLanc(i, { tipo: e.target.value as Lancamento['tipo'] })}><option value="provento">Provento</option><option value="desconto">Desconto</option></select>
                            <input aria-label={`Valor do lançamento ${i + 1}`} className={`w-24 ${inp}`} defaultValue={l.valor ? (l.valor / 100).toFixed(2).replace('.', ',') : ''} onChange={e => setLanc(i, { valor: centavosDeTexto(e.target.value) ?? 0 })} />
                            {(['inss', 'fgts', 'irrf'] as const).map(k => <label key={k} className="flex items-center gap-0.5"><input type="checkbox" checked={l[k]} onChange={e => setLanc(i, { [k]: e.target.checked })} />{k.toUpperCase()}</label>)}
                            <button aria-label={`Remover lançamento ${i + 1}`} className="text-red-700 dark:text-red-300" onClick={() => onMov({ ...mov, lancamentos: lancs.filter((_, j) => j !== i) })}>remover</button>
                        </div>
                    ))}
                    <button className="mt-1 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" onClick={() => onMov({ ...mov, lancamentos: [...lancs, { descricao: '', tipo: 'provento', valor: 0, inss: true, fgts: true, irrf: true }] })}>Adicionar lançamento</button>
                    <p className="mt-1 text-xs text-slate-500">Marque onde o lançamento incide. Confira com a incidência da rubrica em Cadastros › Incidências.</p>
                </div>
            </div>}
        </section>
    );
};

export default CalculoPanel;
