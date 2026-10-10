// components/calculo/CalculoPanel.tsx
//
// Aba "Cálculo" (Fase 3): prévia do cálculo mensal por empresa e competência,
// com o motor de services/calculo. O movimento do mês (horas extras, faltas,
// pensão, lançamentos) é gravado por funcionário e competência, com auditoria;
// o que foi digitado e ainda não salvo fica marcado. O resultado do cálculo
// não é gravado: serve para conferir o motor contra o holerite do IOB.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import type { Empresa } from '../../services/empresas/empresasTypes';
import { atualizarParametrosFolha, listarEmpresasVisiveis } from '../../services/empresas/empresasService';
import { anteriorEncadeado, arredondaNoMes, motorHomologadoNoMes, arredondar, folhaPagaAntes, mesDoPagamento, movimentoComFechado, movimentoComIrrf, movimentoComMesPagamento, semFechado, mudarRegime, regimeNoMes, type ParametrosFolha, type RegimePagamento } from '../../services/calculo/arredondamento';
import { useEmpresaAtiva } from '../../services/empresaAtiva/empresaAtivaContext';
import EmpresaAtivaFixa from '../empresaAtiva/EmpresaAtivaFixa';
import { listarAfastamentos, listarEnquadramentos, listarFuncionarios, listarTabelas, mensagemErro, salvarAfastamento, type Usuario } from '../../services/cadastros/cadastrosService';
import { enquadramentoVigente, type Enquadramento } from '../../services/cadastros/enquadramento';
import type { User } from '../../types';
import { fichaNaCompetencia, type FichaFuncionario } from '../../services/cadastros/funcionarios';
import { eventoPorCodigo, lancarEvento, lerReferencia, tipoDaReferencia, type SalarioDoMes } from '../../services/calculo/lancarEvento';
import { carregarEventosIob } from '../../services/calculo/catalogoEventos';
import type { EventoIobSage } from '../../services/folha/folhaTypes';
import { afastamentoVazio, idAfastamento, validarAfastamento, type Afastamento } from '../../services/cadastros/afastamentos';
import type { TabelaLegal } from '../../services/cadastros/tabelasLegais';
import { centavosDeTexto, reais } from '../../services/cadastros/documentos';
import { calcularMensal, salarioContratual, competenciaAnterior, competenciaSeguinte, dataSugeridaAdiantamento, noMes, travarAdiantamentoEntreContratos, type EntradaCalculo, type Lancamento, type Movimento, type ResultadoCalculo } from '../../services/calculo/motorMensal';
import { foraDoAdiantamento, valorDoAdiantamento } from '../../services/bancario/favorecidos';
import { diaUtilAnterior, diaUtilSeguinte, quintoDiaUtilSalario, somarMeses } from '../../services/prazos/calendario';
import ArquivoBancarioModal from '../bancario/ArquivoBancarioModal';
import PacoteClienteModal from '../pacoteCliente/PacoteClienteModal';
import { eventosDaFolha } from '../../services/pacoteCliente/pacote';
import type { ContaPagamento } from '../../services/bancario/cnab240';
import { limparMovimento, mesmoMovimento, movimentoVazio, validarMovimento, type MovimentoGravado } from '../../services/calculo/movimento';
import { listarMovimentos, listarMovimentosDaEmpresa, listarMovimentosDoAno, salvarMovimentos } from '../../services/calculo/movimentosService';
import { calcularFerias, feriasDaCompetencia, gozosNoMes, OPCOES_FERIAS_PADRAO, type OpcoesFerias, type ResultadoFerias } from '../../services/calculo/motorFerias';
import { calcularRescisao, ROTULO_AVISO, TIPOS_RESCISAO, type AvisoPrevio, type ResultadoRescisao, type TipoRescisao } from '../../services/calculo/motorRescisao';
import { calcular13, com13, OPCOES_13_PADRAO, ultimoDiaDoMes, type Opcoes13 } from '../../services/calculo/motor13';
import ConferenciaHolerites, { conferirTodos, type LeituraHolerites } from './ConferenciaHolerites';
import ConferenciaEsocialIob from './ConferenciaEsocialIob';
import EventosFolhaModal from '../esocial/EventosFolhaModal';
import { ehAdmin, ehMaster } from '../../services/auth/papeis';
import CalculoAdiantamentosModal from './CalculoAdiantamentosModal';
import { recibosFeriasDaCompetencia } from '../../services/esocial/eventosFolha';
import { contextoDoHolerite, definirContextoMia } from '../../services/mia/mia';
import { resumirFolha } from '../../services/relatorios/resumoFolha';
import { listarEnvios, type Envio } from '../../services/esocial/transmissaoService';
import StatusEsocialAfastamento from '../esocial/StatusEsocialAfastamento';
import ConviteAgenda from '../agenda/ConviteAgenda';
import { eventosDoReciboFerias } from '../../services/agenda/convite';
import BeneficiosEmpresa from './BeneficiosEmpresa';
// O PDF (jspdf) só carrega no clique: a tela do Cálculo abre mais leve. O xlsx já vem no pacote principal (Folha).
const relatoriosPdf = () => import('../../services/relatorios/holeritePdf');

const inp = 'rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
const btn = 'rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700';
const SITUACAO: Record<ResultadoCalculo['situacao'], [string, string]> = {
    calculado: ['calculado', 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'],
    incompleto: ['incompleto', 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'],
    erro: ['erro', 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'],
};
const decimal = (t: string) => { const n = Number(t.trim().replace(',', '.')); return t.trim() && Number.isFinite(n) && n >= 0 ? n : undefined; };
/** Horas: decimal (8,5 = 8h30) ou hh:mm (8:30). */
const horas = (t: string) => { const m = t.trim().match(/^(\d{1,3}):([0-5]\d)$/); return m ? Number(m[1]) + Number(m[2]) / 60 : decimal(t); };
const v = (r: ResultadoCalculo, c: string) => r.verbas.find(x => x.codigo === c)?.valor ?? 0;
const inssDe = (r: ResultadoCalculo) => v(r, 'INSS') + v(r, 'INSS13') + v(r, 'INSSFER') + v(r, 'INSSFERRET');
const irrfDe = (r: ResultadoCalculo) => v(r, 'IRRF') + v(r, 'IRRF13') + v(r, 'IRRFFER') + v(r, 'IRRFFERRET');
type Folha = 'mensal' | '13-1a' | '13-2a' | 'ferias' | 'rescisao';
interface ParamRescisao { data: string; tipo: TipoRescisao | ''; aviso: AvisoPrevio; pagamento?: string; saldoFgts?: number; adiantamento13?: number; simulada: boolean }
/** Chave da linha: o gozo nas férias (pode haver dois no mês), a ficha nas demais. */
const chave = (r: ResultadoCalculo) => (r as Partial<ResultadoFerias>).gozoId || r.fichaId;
const br = (d: string) => d.split('-').reverse().join('/');
const real = (c: number) => (c ? reais(c) : '—');

/** Prazo de pagamento já no dia útil anterior quando cai em fim de semana ou feriado (o mesmo do arquivo bancário e da agenda). */
const PagarAte: React.FC<{ data: string }> = ({ data }) => {
    if (!data) return <strong>—</strong>;
    const util = diaUtilAnterior(data);
    return <><strong>{br(util)}</strong>{util !== data && <span className="text-slate-500"> ({br(data)} não é dia útil)</span>}</>;
};

interface Dados { fichas: FichaFuncionario[]; afastamentos: Afastamento[]; tabelas: TabelaLegal[] }

const diasNoMes = (c: string) => { const [a, m] = c.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
const quando = (d?: Date) => (d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

/** Ações do Cálculo agrupadas num menu (Conferir, Relatórios, Pagamento, Envios): os itens são os botões de sempre. */
const GrupoAcoes: React.FC<{ rotulo: string; children: React.ReactNode }> = ({ rotulo, children }) => (
    <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 [&::-webkit-details-marker]:hidden">
            {rotulo}<svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 opacity-60 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>
        </summary>
        {/* Escolher um item fecha o menu. */}
        <div className="absolute right-0 z-30 mt-1 flex min-w-[16rem] flex-col gap-0.5 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-slate-900/10 dark:bg-slate-800 dark:ring-white/10 [&>button]:w-full [&>button]:rounded-lg [&>button]:border-0 [&>button]:text-left [&>button]:shadow-none"
            onClick={e => { if ((e.target as HTMLElement).closest('button')) e.currentTarget.closest('details')?.removeAttribute('open'); }}>
            {children}
        </div>
    </details>
);

const CalculoPanel: React.FC<{ currentUser: User; folhaInicial?: Folha | 'adiantamento'; embutido?: boolean }> = ({ currentUser, folhaInicial, embutido = false }) => {
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
    // Movimentos do mês lidos de fato (com erro na leitura, `gravados` fica null e o "Salvar" bloqueado).
    const [movsLidos, setMovsLidos] = useState(false);
    const [versao, setVersao] = useState(0);
    const [aberto, setAberto] = useState('');
    const [erro, setErro] = useState('');
    const [errosMov, setErrosMov] = useState<string[]>([]);
    const [salvando, setSalvando] = useState(false);
    const [aviso, setAviso] = useState('');
    const [conferir, setConferir] = useState(false);
    const [conferirEsocial, setConferirEsocial] = useState(false);
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
    // Arquivo bancário da folha ou do adiantamento do mês (dia 20).
    const [arquivoBancario, setArquivoBancario] = useState<false | 'folha' | 'adiantamento'>(false);
    const [verBeneficios, setVerBeneficios] = useState(false);
    const [pacote, setPacote] = useState(false);
    const [eventosFolha, setEventosFolha] = useState(false);
    const [verAdiantamentos, setVerAdiantamentos] = useState(folhaInicial === 'adiantamento');
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
    // Cada leitura tem um número: a resposta de uma leitura já trocada (outra empresa ou competência) é descartada,
    // senão os movimentos do período anterior valeriam para o novo (Codex #117).
    const leituraMovimentos = useRef(0);
    // Rascunho do movimento (o não salvo) na sessão do navegador, por empresa e competência: trocar de aba, de tela ou
    // abrir uma simulação não perde o que foi digitado; volta ao reabrir o mês. A chave é a do mês lido (não a da tela,
    // que muda antes de a leitura nova chegar).
    const chaveRascunho = useRef('');
    const lerRascunho = (k: string): Record<string, Movimento> => { try { return JSON.parse(sessionStorage.getItem(k) ?? '{}') ?? {}; } catch { return {}; } };
    const gravarRascunho = (k: string, r: Record<string, Movimento>) => {
        try { if (Object.keys(r).length) sessionStorage.setItem(k, JSON.stringify(r)); else sessionStorage.removeItem(k); } catch { /* sem armazenamento: fica só na tela */ }
    };
    const carregarMovimentos = () => {
        const n = ++leituraMovimentos.current;
        setGravados(null); setErrosMov([]); setMovsLidos(false);
        if (!empresaId || !compOk) { setMovs({}); return; }
        listarMovimentos(empresaId, competencia)
            .then(lista => {
                if (n !== leituraMovimentos.current) return;
                const mapa = Object.fromEntries(lista.map(g => [g.fichaId, g]));
                chaveRascunho.current = `consultor-dp:rascunho-movimento:${empresaId}:${competencia}`;
                const rascunho = Object.fromEntries(Object.entries(lerRascunho(chaveRascunho.current)).filter(([id, m]) => !mesmoMovimento(m, mapa[id]?.movimento)));
                setGravados(mapa); setMovs({ ...Object.fromEntries(lista.map(g => [g.fichaId, g.movimento])), ...rascunho }); setVersao(n => n + 1); setMovsLidos(true);
                if (Object.keys(rascunho).length) setAviso(`Movimento não salvo de ${Object.keys(rascunho).length} funcionário(s) recuperado desta sessão. Confira e salve (ou troque a competência e descarte).`);
            })
            .catch(e => {
                if (n !== leituraMovimentos.current) return;
                // Sem a leitura, "Salvar" gravaria por cima do que está no banco como se o mês estivesse vazio: fica bloqueado.
                setErro(`Movimentos do mês não carregados (o "Salvar movimento" fica bloqueado até a leitura dar certo; troque a competência e volte, ou recarregue a página): ${mensagemErro(e)}`);
                setGravados(null); setMovs({});
            });
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
    // Aberto pelo menu numa folha (13º, férias, rescisão): já entra nela.
    useEffect(() => { if (folhaInicial && folhaInicial !== 'mensal' && folhaInicial !== 'adiantamento') trocarFolha(folhaInicial); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    function trocarFolha(f: Folha, a = ano) {
        setFolha(f); setAno(a); setAberto(''); setConferir(false);
        if (f === 'ferias') setAbonos({});
        setPagamento(f === 'mensal' ? mesDoPagamento(parametrosFolha, competencia) : f === 'ferias' || f === 'rescisao' ? '' : `${a}-${f === '13-1a' ? '11' : '12'}`);
    }


    const empresa = empresas?.find(e => e.id === empresaId);
    const parametrosFolha = empresa?.parametrosFolha;
    // Empresa carregada ou trocada (ou regime alterado): o mês do pagamento da folha mensal segue o regime salvo dela,
    // senão o IRRF sairia pela tabela do mês errado até alguém mexer na competência (Codex #116).
    const regimePagamento = /^\d{4}-\d{2}$/.test(competencia) ? regimeNoMes(parametrosFolha, competencia) : undefined;
    useEffect(() => {
        if (folha === 'mensal' && regimePagamento) setPagamento(regimePagamento === 'mes' ? competencia : competenciaSeguinte(competencia));
    }, [empresaId, regimePagamento]); // eslint-disable-line react-hooks/exhaustive-deps -- a competência já ajusta o pagamento
    /**
     * Arredondamento do líquido da empresa (parâmetro): o anterior é o do movimento do mês (o do holerite do IOB,
     * por exemplo) ou o atual do mês passado, encadeado desde o mês em que o arredondamento começou no Consultor.
     */
    /**
     * IRRF do adiantamento com o saldo da folha em outro mês: a folha da competência anterior, se foi paga no mês do
     * adiantamento (regime "mês seguinte"), com o IRRF gravado com o movimento dela; `null` se não houve; `undefined`
     * enquanto os movimentos gravados não chegam; `{ pendente }` sem o IRRF gravado (a folha já paga não é refeita
     * com a ficha de hoje) ou com outra folha mais antiga paga no mesmo mês (Codex #118).
     */
    const folhaPagaNoAdiantamento = useCallback((f: FichaFuncionario, c: string, pagamentoDeC: string): EntradaCalculo['folhaPagaNoAdiantamento'] => {
        if (!dados || pagamentoDeC === c) return null;
        // Sem os movimentos gravados, só quem foi admitido no mês sabe que não houve folha paga antes.
        if (!movsEmpresa) return (f.dados.admissao ?? '') < `${c}-01` ? undefined : null;
        return folhaPagaAntes(movsEmpresa[f.id] ?? {}, c, m => noMes([f], m).length > 0, m => mesDoPagamento(parametrosFolha, m));
    }, [dados, movsEmpresa, parametrosFolha]);
    const arredondarDaEmpresa = useCallback((r: ResultadoCalculo, f: FichaFuncionario, c: string, informado?: number): ResultadoCalculo => {
        if (!arredondaNoMes(parametrosFolha, c) || !dados) return r;
        // Sem os movimentos gravados (carregando ou com erro), o encadeamento sairia sem as horas, faltas e anteriores dos
        // meses passados: a folha fica incompleta até eles chegarem, a não ser que o anterior do mês esteja informado (Codex #116).
        // Em erro (e não "incompleto"): PDF, arquivo bancário e eSocial não saem com o líquido sem o arredondamento (Codex #116).
        const travar = (m: string): ResultadoCalculo => ({ ...r, situacao: 'erro', erros: [...r.erros, m] });
        // O rascunho ainda não salvo já vale no cálculo: acima de 0,99 não sai pagamento com ele (Codex #116).
        if (informado !== undefined && (informado < 0 || informado > 99)) return travar('Arredondamento anterior: no máximo R$ 0,99 (são centavos do mês anterior).');
        // No mês de início o anterior é 0 e não depende do histórico (Codex #116).
        if (informado === undefined && c > (parametrosFolha.arredondarDesde || c) && !movsEmpresa) return travar('Arredondamento do líquido: aguardando os movimentos gravados dos meses anteriores para encadear o anterior (ou informe o "Arredondamento anterior" no movimento).');
        const afs = dados.afastamentos.filter(a => a.fichaId === f.id);
        const salvos = movsEmpresa?.[f.id] ?? {};
        const desde = parametrosFolha.arredondarDesde || c;
        const anterior = informado ?? anteriorEncadeado(desde, c,
            // Mês já salvo: o mês do pagamento usado de fato (o "Pagamento em" da tela, mesmo fora do regime); senão, o do regime.
            m => {
                if (!noMes([f], m).length) return null;
                const pag = salvos[m]?.mesPagamento ?? salvos[m]?.arredondamentoPagamento ?? mesDoPagamento(parametrosFolha, m);
                return calcularMensal({ competencia: m, pagamento: pag, ficha: f, tabelas: dados.tabelas, movimento: salvos[m], afastamentos: afs,
                    feriasDoMes: feriasDaCompetencia(f, afs, dados.tabelas, salvos, m, opcoesFerias), folhaPagaNoAdiantamento: folhaPagaNoAdiantamento(f, m, pag), beneficios: parametrosFolha?.beneficios });
            },
            // O atual gravado só vale se foi encadeado do mesmo mês de início. O mês do pagamento gravado com ele é o que foi
            // usado de fato: mudar o regime depois não reescreve mês fechado (para isso, reabra o mês e salve de novo; Codex #116).
            m => salvos[m]?.arredondamentoAnterior, m => (salvos[m]?.arredondamentoDesde === desde ? salvos[m]?.arredondamentoFechado : undefined));
        return typeof anterior === 'number' ? arredondar(r, anterior) : travar(anterior.erro);
    }, [parametrosFolha, dados, movsEmpresa, opcoesFerias, folhaPagaNoAdiantamento]);
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
                    afastamentos: dados.afastamentos.filter(a => a.fichaId === id), tabelas: dados.tabelas, movimentos: movsAno[id] ?? {},
                    // Paga no próprio mês: com a folha anterior paga nele (regime "mês seguinte"), o IRRF soma as duas.
                    regimePagamento: m => mesDoPagamento(parametrosFolha, m) })] : [];
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
        // O IRRF do adiantamento soma os contratos do mesmo CPF antes do arredondamento (que depende do que o adiantamento pagou).
        const doMes = noMes(dados.fichas, competencia);
        const porId = new Map(dados.fichas.map(f => [f.id, f]));
        return travarAdiantamentoEntreContratos(doMes.map(f => {
            const afs = dados.afastamentos.filter(a => a.fichaId === f.id);
            return calcularMensal({
                competencia, pagamento, ficha: f, tabelas: dados.tabelas, movimento: movs[f.id], afastamentos: afs,
                feriasDoMes: movsEmpresa ? feriasDaCompetencia(f, afs, dados.tabelas, movsEmpresa[f.id] ?? {}, competencia, opcoesFerias) : undefined,
                folhaPagaNoAdiantamento: folhaPagaNoAdiantamento(f, competencia, pagamento), beneficios: parametrosFolha?.beneficios,
            });
        }), dados.fichas, pagamento !== competencia
            // Só os contratos da competência anterior com folha paga neste mês (pelo mês gravado ou pelo regime) e com valor:
            // sem rendimentos (afastado o mês todo, por exemplo) não pagou nada. Sem saber ainda, conta (Codex #118).
            ? noMes(dados.fichas, competenciaAnterior(competencia)).filter(f => {
                const ant = folhaPagaNoAdiantamento(f, competencia, pagamento);
                return ant === undefined || (ant !== null && ('pendente' in ant || ant.rendimentos > 0));
            })
            : [], { tabelas: dados.tabelas, folhaPaga: id => { const f = porId.get(id); return f ? folhaPagaNoAdiantamento(f, competencia, pagamento) : null; } })
            .map((r, i) => arredondarDaEmpresa(r, doMes[i], competencia, movs[doMes[i].id]?.arredondamentoAnterior));
    }, [dados, competencia, pagamento, movs, movsEmpresa, mensal, ferias, rescisao, paramsResc, movsAno, ano, folha, opcoes13, primeiras, abonos, opcoesFerias, feriasSimuladas, arredondarDaEmpresa, folhaPagaNoAdiantamento, parametrosFolha]);
    // O movimento a gravar leva o arredondamento atual do mês calculado (o anterior do mês seguinte): assim o encadeamento
    // não refaz este mês com a ficha de amanhã (Codex #116). Mudou o atual, o funcionário fica "não salvo"; sem cálculo
    // completo, fica o que já estava gravado.
    const movsParaSalvar = useMemo(() => {
        if (!mensal) return movs;
        const out = { ...movs };
        // Movimento editado perde o atual gravado antes, mesmo com o arredondamento desligado neste mês: religado, o
        // encadeamento refaz o mês em vez de confiar no valor velho (Codex #116).
        for (const id of Object.keys(movs)) if (!mesmoMovimento(semFechado(movs[id]), semFechado(gravados?.[id]?.movimento))) out[id] = semFechado(movs[id]);
        // "Pagamento em" diferente do regime: o mês usado de fato fica gravado, com ou sem arredondamento; igual ao
        // regime, nada a gravar (o regime já diz). Os meses seguintes o usam (IRRF do adiantamento; Codex #118).
        const arredonda = arredondaNoMes(parametrosFolha, competencia);
        const regime = mesDoPagamento(parametrosFolha, competencia);
        for (const r of resultados) {
            const m = movimentoComMesPagamento(out[r.fichaId], pagamento, regime, arredonda);
            if (m) out[r.fichaId] = m;
        }
        // IRRF apurado da folha paga no mês seguinte, para o adiantamento de lá, mesmo lançado à mão (Codex #118).
        for (const r of resultados) {
            const m = movimentoComIrrf(out[r.fichaId], r);
            if (m) out[r.fichaId] = m;
        }
        if (!arredonda) return out;
        const desde = parametrosFolha?.arredondarDesde || competencia;
        for (const r of resultados) {
            const m = movimentoComFechado(out[r.fichaId], gravados?.[r.fichaId]?.movimento, r, desde);
            if (m) out[r.fichaId] = m;
        }
        return out;
    }, [movs, resultados, mensal, parametrosFolha, competencia, gravados, pagamento]);
    const pendentes = useMemo(() => [...new Set([...Object.keys(movsParaSalvar), ...Object.keys(gravados ?? {})])]
        .filter(id => id && !mesmoMovimento(movsParaSalvar[id], gravados?.[id]?.movimento)), [movsParaSalvar, gravados]);
    useEffect(() => {
        if (!pendentes.length) return;
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [pendentes.length]);
    // Pagamento e pacote saem do que vale: sem movimento por salvar (o banco pagaria o rascunho) e sem simulação na tela
    // (rescisão de quem não foi desligado, férias não gravadas em Afastamentos).
    const simulacoes = rescisao ? resultados.filter(r => paramsResc[r.fichaId]?.simulada).length
        : ferias ? resultados.filter(r => !dados?.afastamentos.some(a => a.id === (r as ResultadoFerias).gozoId)).length : 0;
    const bloqueioPagamento = mensal && pendentes.length ? 'Salve o movimento antes: o pagamento sai do movimento gravado, não do rascunho.'
        : simulacoes ? `Há ${simulacoes} simulação(ões) na tela: grave (ficha ou Afastamentos) ou remova antes de gerar pagamento ou pacote.` : '';
    useEffect(() => {
        if (!gravados || !chaveRascunho.current) return;
        gravarRascunho(chaveRascunho.current, Object.fromEntries(Object.entries(movs).filter(([id, m]) => !mesmoMovimento(m, gravados[id]?.movimento))));
    }, [movs, gravados]); // eslint-disable-line react-hooks/exhaustive-deps
    /** Troca de empresa ou competência: pergunta antes de descartar o que não foi salvo. */
    const seguro = (f: () => void) => {
        if (pendentes.length && !window.confirm(`Há movimento não salvo de ${pendentes.length} funcionário(s). Descartar?`)) return;
        if (pendentes.length && chaveRascunho.current) gravarRascunho(chaveRascunho.current, {});
        setAviso(''); f();
    };
    // Conferência com o eSocial do IOB: a folha mensal de qualquer competência, com os movimentos gravados dela.
    const motorDaCompetencia = useCallback((c: string): ResultadoCalculo[] => {
        if (!dados || !movsEmpresa) return [];
        return noMes(dados.fichas, c).map(f => {
            const afs = dados.afastamentos.filter(a => a.fichaId === f.id);
            // Mês salvo com o arredondamento: o mês do pagamento usado de fato (Codex #116); senão, o do regime.
            const pag = movsEmpresa[f.id]?.[c]?.mesPagamento ?? movsEmpresa[f.id]?.[c]?.arredondamentoPagamento ?? mesDoPagamento(parametrosFolha, c);
            const r = calcularMensal({ competencia: c, pagamento: pag, ficha: f, tabelas: dados.tabelas, movimento: movsEmpresa[f.id]?.[c], afastamentos: afs,
                feriasDoMes: feriasDaCompetencia(f, afs, dados.tabelas, movsEmpresa[f.id] ?? {}, c, opcoesFerias), folhaPagaNoAdiantamento: folhaPagaNoAdiantamento(f, c, pag), beneficios: parametrosFolha?.beneficios });
            return arredondarDaEmpresa(r, f, c, movsEmpresa[f.id]?.[c]?.arredondamentoAnterior);
        });
    }, [dados, movsEmpresa, opcoesFerias, arredondarDaEmpresa, parametrosFolha, folhaPagaNoAdiantamento]);
    const comFeriasNaCompetencia = useCallback((c: string): Set<string> => {
        if (!dados || !movsEmpresa) return new Set();
        return new Set(noMes(dados.fichas, c).filter(f => feriasDaCompetencia(f, dados.afastamentos.filter(a => a.fichaId === f.id), dados.tabelas, movsEmpresa[f.id] ?? {}, c, opcoesFerias)).map(f => f.id));
    }, [dados, movsEmpresa, opcoesFerias]);
    const total = (f: (r: ResultadoCalculo) => number) => resultados.reduce((s, r) => s + f(r), 0);
    const sel = resultados.find(r => chave(r) === aberto);
    // Salário do mês da ficha aberta, para o "Lançar evento" calcular horas, dias e % como o motor.
    const salarioSel = useMemo((): SalarioDoMes | null => {
        const f = sel && dados?.fichas.find(x => x.id === sel.fichaId);
        if (!f) return null;
        const sc = salarioContratual(fichaNaCompetencia(f, competencia).ficha.dados);
        return 'erro' in sc ? null : { mensal: sc.mensal, horasMes: sc.horasMes };
    }, [sel, dados, competencia]);
    const [lancado, setLancado] = useState<{ fichaId: string; mensagem: string } | null>(null);
    useEffect(() => setLancado(null), [aberto, competencia]);
    const nomeDe = (id: string) => dados?.fichas.find(f => f.id === id)?.dados.nome || id;
    const [verResumo, setVerResumo] = useState(false);
    // Competência da parte patronal: a do mês; o 13º na de dezembro; recibos de férias não (entram na folha do mês).
    const competenciaPatronal = mensal || rescisao ? competencia : ferias ? '' : `${ano}-12`;
    const vigente = competenciaPatronal && empresaId ? enquadramentoVigente(enquadramentos, empresaId, competenciaPatronal) : null;
    const enqVigente = vigente && 'enquadramento' in vigente ? vigente.enquadramento : undefined;
    const resumo = useMemo(() => resumirFolha(resultados, enqVigente), [resultados, enqVigente]);
    // S-1200/S-1210: recibos de férias pagos na competência ou com gozo nela (as mesmas contas da folha do mês).
    // 1ª parcela do 13º no S-1200 de novembro (paga no mês): calculada como na aba do 13º, com os movimentos gravados.
    const primeiras13Esocial = useMemo(() => (mensal && eventosFolha && dados && movsEmpresa && /^\d{4}-11$/.test(competencia)
        ? com13(dados.fichas, Number(competencia.slice(0, 4)), ultimoDiaDoMes(competencia)).map(f => calcular13({ ano: Number(competencia.slice(0, 4)), parcela: '1a', pagamento: competencia, ficha: f,
            tabelas: dados.tabelas, opcoes: opcoes13, afastamentos: dados.afastamentos.filter(a => a.fichaId === f.id), movimentos: movsEmpresa[f.id] ?? {} }))
        : undefined), [mensal, eventosFolha, dados, movsEmpresa, competencia, opcoes13]);
    const recibosFeriasEsocial = useMemo(() => (mensal && eventosFolha && dados && movsEmpresa && /^\d{4}-\d{2}$/.test(competencia)
        ? recibosFeriasDaCompetencia(dados.fichas, dados.afastamentos, dados.tabelas, movsEmpresa, competencia, opcoesFerias) : undefined), [mensal, eventosFolha, dados, movsEmpresa, competencia, opcoesFerias]);
    const tituloFolha = mensal ? `Folha mensal ${br(competencia)}` : ferias ? `Recibos de férias ${br(competencia)}` : rescisao ? `Rescisões ${br(competencia)}` : `13º salário ${ano} — ${folha === '13-1a' ? '1ª' : '2ª'} parcela`;
    const sufixoArquivo = mensal ? competencia : ferias ? `ferias-${competencia}` : rescisao ? `rescisao-${competencia}` : `${ano}-13-${folha === '13-1a' ? '1a' : '2a'}-parcela`;
    // MiA: o holerite aberto (ou a lista da folha) vai como contexto da pergunta.
    useEffect(() => {
        if (sel) definirContextoMia('calculo', { tela: `Cálculo · ${tituloFolha} · ${sel.nome}`, texto: contextoDoHolerite(sel, tituloFolha) });
        else definirContextoMia('calculo', resultados.length ? { tela: `Cálculo · ${tituloFolha}`, texto: [`${tituloFolha}: ${resultados.length} cálculo(s).`, ...resultados.map(r => `- ${r.nome}: ${r.situacao}, líquido ${reais(r.totais.liquido)}${r.avisos.length ? `; avisos: ${r.avisos.join(' | ')}` : ''}${r.erros.length ? `; erros: ${r.erros.join(' | ')}` : ''}`)].join('\n') } : null);
    }, [sel, resultados, tituloFolha]);
    useEffect(() => () => definirContextoMia('calculo', null), []);
    const avisoEnq = erroEnq && !ferias ? ` ATENÇÃO: enquadramento não carregado (${erroEnq}); a parte patronal está fora do quadro.` : '';
    const observacaoResumo = avisoEnq + (mensal
        ? 'Folha mensal: o INSS dos segurados já soma o retido nos recibos de férias da competência. O IRRF vai à DCTFWeb do mês do pagamento (regime de caixa). Rescisões do mês têm 13º e aviso no TRCT, fora desta folha.'
        : rescisao ? 'Rescisões: o INSS do saldo e do 13º e o FGTS rescisório entram na competência do desligamento, junto com a folha mensal.'
        : ferias ? 'Recibos de férias: o INSS e o FGTS de cada competência entram na folha mensal correspondente; aqui é só o valor dos recibos.'
        : 'Folha de 13º: a 2ª parcela tem INSS e IRRF próprios (apuração do 13º na DCTFWeb); a 1ª parcela só tem FGTS.');
    // Motor homologado na empresa (a partir da competência ativada): documentos sem a marca de prévia.
    const competenciaDoc = mensal || ferias || rescisao ? competencia : `${ano}-12`;
    const homologado = motorHomologadoNoMes(parametrosFolha, competenciaDoc);
    const podeHomologar = ehAdmin((currentUser as { role?: string }).role) || ehMaster(currentUser.email);
    function ativarMotor(ativar: boolean) {
        if (!empresa) return;
        const desde = /^\d{4}-\d{2}$/.test(competencia) ? competencia : `${ano}-01`;
        if (ativar && !window.confirm(`Ativar o motor de cálculo da ${empresa.nomeFantasia || empresa.razaoSocial} a partir de ${br(desde)}?\n\nOs holerites, recibos e resumos passam a sair sem a marca de PRÉVIA, como documentos da folha. Ative só com o cálculo conferido com o IOB (empresa homologada).`)) return;
        if (!ativar && !window.confirm('Voltar o motor desta empresa para prévia? Os documentos voltam a sair com a marca de PRÉVIA.')) return;
        gravarParametrosFolha(p => {
            const { motorHomologado: _m, ...resto } = p ?? {};
            return ativar ? { ...resto, motorHomologado: { desde, por: currentUser.email ?? usuario.id, em: new Date().toISOString() } } : resto;
        });
    }
    const opcoesPdf = () => ({ empresa: { razaoSocial: empresa?.razaoSocial ?? '', cnpj: empresa?.cnpj ?? '', codigoSage: empresa?.codigoSage }, titulo: tituloFolha, previa: !homologado });
    async function pdfHolerites(lista: ResultadoCalculo[], nome: string) {
        if (!dados) return;
        try { (await relatoriosPdf()).holeritesPdf(lista, dados.fichas, opcoesPdf()).save(nome); }
        catch (e) { setErrosMov([`PDF não gerado: ${(e as Error).message}`]); }
    }
    /** Recibos do adiantamento do mês, na data sugerida (dia 20 ou o dia útil anterior), a mesma do arquivo do adiantamento. */
    const dataAdiantamento = dataSugeridaAdiantamento(competencia);
    const opcoesPdfAdiantamento = () => ({ ...opcoesPdf(), titulo: `Recibo de adiantamento ${br(competencia)}` });
    async function pdfAdiantamento() {
        if (!dados) return;
        try { (await relatoriosPdf()).recibosAdiantamentoPdf(resultados, dados.fichas, opcoesPdfAdiantamento(), dataAdiantamento).save(`adiantamento-${empresa?.codigoSage ?? 'empresa'}-${competencia}.pdf`); }
        catch (e) { setErrosMov([`PDF não gerado: ${(e as Error).message}`]); }
    }
    async function pdfResumo() {
        try { (await relatoriosPdf()).resumoPdf(resumo, opcoesPdf(), observacaoResumo).save(`resumo-${empresa?.codigoSage ?? 'empresa'}-${sufixoArquivo}.pdf`); }
        catch (e) { setErrosMov([`PDF não gerado: ${(e as Error).message}`]); }
    }

    // Parâmetros da folha: cada mudança parte da última (não da que estava na tela quando a anterior ainda gravava) e as
    // gravações vão em fila, para a mais nova ser a última a chegar (Codex #116).
    // Falhou a gravação: a tela volta aos últimos parâmetros gravados e as mudanças que estavam na fila atrás dela
    // (feitas sobre o valor que não gravou) são descartadas (Codex #116).
    const ultimosParametros = useRef<Record<string, ParametrosFolha | undefined>>({});
    const gravadosParametros = useRef<Record<string, ParametrosFolha | undefined>>({});
    const geracaoParametros = useRef<Record<string, number>>({});
    const filaParametros = useRef<Promise<void>>(Promise.resolve());
    function gravarParametrosFolha(mudar: (p: ParametrosFolha | undefined) => ParametrosFolha) {
        if (!empresa) return;
        const id = empresa.id;
        if (!(id in gravadosParametros.current)) gravadosParametros.current[id] = empresa.parametrosFolha;
        const novo = mudar(id in ultimosParametros.current ? ultimosParametros.current[id] : empresa.parametrosFolha);
        ultimosParametros.current[id] = novo;
        const geracao = geracaoParametros.current[id] ?? 0;
        const aplicar = (p: ParametrosFolha | undefined) => setEmpresas(l => l?.map(e => (e.id === id ? { ...e, parametrosFolha: p } : e)) ?? l);
        aplicar(novo);
        filaParametros.current = filaParametros.current.then(async () => {
            if ((geracaoParametros.current[id] ?? 0) !== geracao) return;
            try {
                // A mudança vai sobre o que está gravado (outro usuário pode ter mudado outra parte nesse meio-tempo).
                const gravado = await atualizarParametrosFolha(id, mudar);
                gravadosParametros.current[id] = gravado;
                // Última da fila: a tela passa a mostrar o gravado, com o que o outro usuário mudou.
                if (ultimosParametros.current[id] === novo) { ultimosParametros.current[id] = gravado; aplicar(gravado); }
            } catch (e) {
                geracaoParametros.current[id] = geracao + 1;
                ultimosParametros.current[id] = gravadosParametros.current[id];
                aplicar(gravadosParametros.current[id]);
                setErro(`Parâmetros da folha não gravados; a tela voltou aos últimos gravados: ${mensagemErro(e)}`);
            }
        });
    }

    async function salvar() {
        if (!gravados) return;
        const itens = pendentes.map(id => ({ fichaId: id, antes: gravados[id]?.movimento ?? null, depois: limparMovimento(movsParaSalvar[id] ?? {}) }));
        const erros = itens.flatMap(i => validarMovimento(i.depois, diasNoMes(competencia)).map(e => `${nomeDe(i.fichaId)}: ${e}`));
        setErrosMov(erros); setAviso('');
        if (erros.length) return;
        setSalvando(true);
        try {
            await salvarMovimentos(empresaId, competencia, itens, usuario);
            setAviso(`Movimento de ${itens.length} funcionário(s) salvo.`);
            if (chaveRascunho.current) gravarRascunho(chaveRascunho.current, {});
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
            ...(e.irrfAdiantamento ? [{ Item: 'IRRF retido no adiantamento (DCTFWeb do mês do adiantamento)', Tipo: 'guia', Funcionários: '', Valor: e.irrfAdiantamento / 100 }] : []),
            { Item: 'FGTS', Tipo: 'guia', Funcionários: '', Valor: e.fgts / 100 },
            { Item: 'Multa rescisória do FGTS', Tipo: 'guia', Funcionários: '', Valor: e.multaFgts / 100 },
        ]), 'Resumo da folha');
        if (leitura && dados) {
            const { linhas, semHolerite } = conferirTodos(leitura, dados.fichas, resultados, competencia, parametrosFolha?.beneficios);
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
            {homologado ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-100">
                    <span><strong>Motor de cálculo ativo</strong> para {empresa?.nomeFantasia || empresa?.razaoSocial} desde {br(parametrosFolha!.motorHomologado!.desde)} (empresa homologada; ativado por {parametrosFolha!.motorHomologado!.por}). Holerites, recibos e resumos saem sem a marca de prévia. O movimento do mês é gravado em "Salvar movimento". Adicionais, comissões e outras médias ainda não estão no motor: lance como lançamento no movimento.</span>
                    {podeHomologar && <button className="ml-auto rounded border border-green-400 px-2 py-1 text-xs dark:border-green-600" onClick={() => ativarMotor(false)}>Voltar para prévia</button>}
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                    <span><strong>Prévia do motor de cálculo.</strong> Não substitui o cálculo do IOB enquanto a empresa não for homologada: os documentos saem com a marca de PRÉVIA. O movimento do mês é gravado quando você clica em "Salvar movimento". 13º, férias e rescisão usam as médias de horas extras dos movimentos gravados. Adicionais, comissões e outras médias ainda não estão no motor.</span>
                    {podeHomologar && empresa && <button className="ml-auto rounded bg-green-700 px-3 py-1.5 text-xs font-medium text-white" title="Empresa conferida com o IOB: os documentos passam a sair sem a marca de prévia, a partir da competência da tela." onClick={() => ativarMotor(true)}>Ativar o motor para esta empresa</button>}
                </div>
            )}
            <div className="flex flex-wrap items-end gap-3">
                {ativa ? (embutido ? null : <EmpresaAtivaFixa />) : <label className="text-sm dark:text-white">Empresa
                    <select aria-label="Empresa" className={`ml-2 ${inp}`} value={empresaId} onChange={e => { const v = e.target.value; seguro(() => setEmpresaId(v)); }}>
                        <option value="">— escolha —</option>
                        {(empresas ?? []).map(e => <option key={e.id} value={e.id}>{e.codigoSage} · {e.nomeFantasia || e.razaoSocial}</option>)}
                    </select>
                </label>}
                <label className={`text-sm dark:text-white ${embutido ? 'hidden' : ''}`}>Folha
                    <select aria-label="Folha" className={`ml-2 ${inp}`} value={folha} onChange={e => trocarFolha(e.target.value as Folha)}>
                        <option value="mensal">Mensal</option><option value="13-1a">13º — 1ª parcela</option><option value="13-2a">13º — 2ª parcela</option><option value="ferias">Férias</option><option value="rescisao">Rescisão</option>
                    </select>
                </label>
                {!mensal && !ferias && !rescisao && <label className="text-sm dark:text-white">Ano
                    <input aria-label="Ano" type="number" min={2000} max={2100} className={`ml-2 w-24 ${inp}`} value={ano} onChange={e => { const a = Number(e.target.value); if (a >= 2000 && a <= 2100) trocarFolha(folha, a); }} />
                </label>}
                {(mensal || ferias || rescisao) && <label className="text-sm dark:text-white" title={ferias ? 'Mês em que as férias começam.' : undefined}>{ferias ? 'Início das férias em' : rescisao ? 'Desligamentos em' : 'Competência'}
                    <input aria-label="Competência" type="month" className={`ml-2 ${inp}`} value={competencia} onChange={e => { const c = e.target.value; seguro(() => { setCompetencia(c); setAberto(''); if (/^\d{4}-\d{2}$/.test(c) && !ferias && !rescisao) setPagamento(mesDoPagamento(parametrosFolha, c)); }); }} />
                </label>}
                {!ferias && !rescisao && <label className="text-sm dark:text-white" title="O IRRF segue o mês do pagamento (regime de caixa).">Pagamento em
                    <input aria-label="Mês do pagamento" type="month" className={`ml-2 ${inp}`} value={pagamento} onChange={e => setPagamento(e.target.value)} />
                </label>}
                {mensal && empresa && <span className="flex items-center gap-2 text-sm dark:text-white">
                    <label className="flex items-center gap-1" title="Como o IOB: o líquido sobe ao real seguinte e os centavos voltam como desconto no mês seguinte (parâmetro da empresa)."><input type="checkbox" aria-label="Arredondar o líquido" checked={!!parametrosFolha?.arredondarLiquido}
                        onChange={e => { const ligar = e.target.checked; gravarParametrosFolha(p => ({ ...p, arredondarLiquido: ligar, arredondarDesde: p?.arredondarDesde || competencia })); }} />Arredondar o líquido</label>
                    {parametrosFolha?.arredondarLiquido && <label>desde<input aria-label="Arredondamento desde" type="month" className={`ml-1 ${inp}`} value={parametrosFolha.arredondarDesde ?? ''}
                        onChange={e => { const d = e.target.value; if (/^\d{4}-\d{2}$/.test(d)) gravarParametrosFolha(p => ({ ...p, arredondarDesde: d })); }} /></label>}
                    {/* Regime da empresa: os meses passados do encadeamento são calculados com ele (o da tela vale só para a competência). */}
                    <label title="Mês em que a empresa paga a folha, a partir desta competência (os meses anteriores ficam com o regime que valia neles). Vale para o mês do pagamento sugerido e para o encadeamento do arredondamento.">folha paga
                        <select aria-label="Folha paga" className={`ml-1 ${inp}`} value={regimePagamento ?? 'seguinte'} disabled={!regimePagamento}
                            onChange={e => { const p = e.target.value as RegimePagamento; gravarParametrosFolha(atual => mudarRegime(atual, competencia, p)); setPagamento(p === 'mes' ? competencia : competenciaSeguinte(competencia)); }}>
                            <option value="mes">no próprio mês</option><option value="seguinte">no mês seguinte</option>
                        </select></label>
                    <button className={btn} aria-pressed={verBeneficios} onClick={() => setVerBeneficios(x => !x)}>Benefícios ({parametrosFolha?.beneficios?.length ?? 0})</button>
                </span>}
                {mensal && <button className="ml-auto rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={!pendentes.length || salvando || !gravados} onClick={salvar}>
                    {salvando ? 'Salvando…' : `Salvar movimento${pendentes.length ? ` (${pendentes.length})` : ''}`}
                </button>}
                <div className={`flex flex-wrap items-center gap-2 ${mensal ? '' : 'ml-auto'}`}>
                {mensal && <GrupoAcoes rotulo="Conferir">
                    {mensal && <button className={btn} disabled={!resultados.length} aria-pressed={conferir} onClick={() => setConferir(c => !c)}>Conferir com holerites do IOB</button>}
                    {mensal && <button className={btn} disabled={!empresa || !dados || !movsEmpresa} title={movsEmpresa ? '' : 'Carregando os movimentos gravados…'} aria-pressed={conferirEsocial} onClick={() => setConferirEsocial(c => !c)}>Conferir com o eSocial do IOB</button>}
                </GrupoAcoes>}
                <GrupoAcoes rotulo="Relatórios">
                    <button className={btn} disabled={!resultados.length} aria-pressed={verResumo} onClick={() => setVerResumo(x => !x)}>Resumo da folha</button>
                    <button className={btn} disabled={!resultados.some(r => r.situacao !== 'erro')} onClick={() => pdfHolerites(resultados, `holerites-${empresa?.codigoSage ?? 'empresa'}-${sufixoArquivo}.pdf`)}>Holerites (PDF)</button>
                    <button className={btn} disabled={!resultados.length} onClick={exportar}>Exportar Excel</button>
                </GrupoAcoes>
                <GrupoAcoes rotulo="Pagamento">
                    <button className={btn} disabled={!empresa || !resultados.some(r => r.situacao === 'calculado') || !!bloqueioPagamento} title={bloqueioPagamento || undefined} onClick={() => setArquivoBancario('folha')}>Arquivo bancário</button>
                    {mensal && <button className={btn} disabled={!dados || !resultados.length} title="Adiantamento salarial do mês por funcionário: valores, IRRF, arredondamento, recibos e arquivo bancário." onClick={() => setVerAdiantamentos(true)}>Cálculo de adiantamentos</button>}
                    {mensal && resultados.some(r => r.situacao === 'calculado' && valorDoAdiantamento(r) > 0) && <button className={btn} disabled={!empresa || !movsLidos || !!bloqueioPagamento} title={bloqueioPagamento || (movsLidos ? 'Remessa do adiantamento salarial do mês (dia 20 ou o dia útil anterior), com o valor de cada um.' : 'Sem os movimentos gravados do mês (carregando ou com erro na leitura): um adiantamento informado no movimento muda o valor.')} onClick={() => setArquivoBancario('adiantamento')}>Arquivo do adiantamento</button>}
                    {mensal && resultados.some(r => valorDoAdiantamento(r) > 0) && <button className={btn} disabled={!dados || !movsLidos} title={movsLidos ? `Recibo do adiantamento salarial de cada funcionário, pago em ${br(dataAdiantamento)}, para assinatura.` : 'Sem os movimentos gravados do mês (carregando ou com erro na leitura): um adiantamento informado no movimento muda o valor.'} onClick={pdfAdiantamento}>Recibos do adiantamento (PDF)</button>}
                </GrupoAcoes>
                <GrupoAcoes rotulo="Envios">
                    <button className={btn} disabled={!empresa || !resultados.some(r => r.situacao === 'calculado') || !!bloqueioPagamento} title={bloqueioPagamento || undefined} onClick={() => setPacote(true)}>Pacote do cliente</button>
                    {mensal && <button className={btn} disabled={!empresa || !resultados.some(r => r.situacao === 'calculado') || pendentes.length > 0} title={pendentes.length ? 'Salve o movimento antes: o S-1200 sai do movimento gravado.' : undefined} onClick={() => setEventosFolha(true)}>S-1200 e S-1210</button>}
                    {folha === '13-2a' && <button className={btn} disabled={!empresa || !resultados.some(r => r.situacao === 'calculado')} title="13º no eSocial: S-1200 anual e o pagamento no S-1210 do mês da 2ª parcela. A 1ª parcela vai no S-1200 de novembro." onClick={() => setEventosFolha(true)}>S-1200 anual e S-1210</button>}
                </GrupoAcoes>
                </div>
            </div>
            {mensal && empresa && verBeneficios && <BeneficiosEmpresa key={`${empresa.id}-${competencia}`} beneficios={parametrosFolha?.beneficios ?? []} competencia={competencia} onFechar={() => setVerBeneficios(false)}
                onSalvar={l => { gravarParametrosFolha(p => ({ ...p, beneficios: l })); setVerBeneficios(false); }} />}
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
                        <p className="text-slate-500 dark:text-slate-400">eSocial: o recibo vai no S-1200 do mês em que é pago, em demonstrativo próprio (Cálculo › Mensal dessa competência › "S-1200 e S-1210"), com o gozo gravado em Cadastros › Afastamentos.</p>
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
                        <button className={btn} onClick={pdfResumo}>Resumo (PDF)</button>
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
                                {(resumo.encargos.irrfAdiantamento ?? 0) > 0 && <><dt title="Pago no adiantamento, no mês da competência: vai à DCTFWeb desse mês.">IRRF retido no adiantamento</dt><dd className="text-right">{reais(resumo.encargos.irrfAdiantamento ?? 0)}</dd></>}
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

            {mensal && verAdiantamentos && dados && (
                <CalculoAdiantamentosModal empresaNome={empresa ? empresa.nomeFantasia || empresa.razaoSocial : ''} competencia={competencia} dataAdiantamento={dataAdiantamento}
                    resultados={resultados} fichas={dados.fichas} movs={movs} pendentes={pendentes.length}
                    bloqueio={!empresa ? 'Escolha a empresa.' : !movsLidos ? 'Sem os movimentos gravados do mês (carregando ou com erro na leitura).' : bloqueioPagamento || undefined}
                    onFixar={valores => { setMovs(x => ({ ...x, ...Object.fromEntries(Object.entries(valores).map(([id, v]) => [id, { ...x[id], adiantamento: v }])) })); setAviso(`Adiantamento de ${Object.keys(valores).length} funcionário(s) fixado no movimento: clique em "Salvar movimento".`); }}
                    onRecibos={pdfAdiantamento} onArquivo={() => { setVerAdiantamentos(false); setArquivoBancario('adiantamento'); }} onFechar={() => setVerAdiantamentos(false)} />
            )}
            {(mensal || folha === '13-2a') && eventosFolha && empresa && dados && (() => {
                const [pa, pm] = (/^\d{4}-\d{2}$/.test(pagamento) ? pagamento : competenciaSeguinte(competencia)).split('-').map(Number);
                // 2ª parcela do 13º: o S-1200 anual (AAAA) e o pagamento no S-1210 do mês dela (até 20/12).
                if (folha === '13-2a') return <EventosFolhaModal empresa={empresa} competencia={String(ano)} fichas={dados.fichas} resultados={resultados} dataSugerida={diaUtilAnterior(`${ano}-12-20`)} usuario={usuario}
                    onFechar={() => setEventosFolha(false)} onParametrosSalvos={esocialFolha => setEmpresas(l => l?.map(e => (e.id === empresa.id ? { ...e, esocialFolha } : e)) ?? l)} />;
                return <EventosFolhaModal empresa={empresa} competencia={competencia} fichas={dados.fichas} resultados={resultados} recibosFerias={recibosFeriasEsocial} primeirasParcelas13={primeiras13Esocial} dataSugerida={quintoDiaUtilSalario(pa, pm)} usuario={usuario}
                    onFechar={() => setEventosFolha(false)} onParametrosSalvos={esocialFolha => setEmpresas(l => l?.map(e => (e.id === empresa.id ? { ...e, esocialFolha } : e)) ?? l)} />;
            })()}
            {mensal && conferirEsocial && empresa && dados && movsEmpresa && (
                <ConferenciaEsocialIob empresa={empresa} fichas={dados.fichas} motor={motorDaCompetencia} comFerias={comFeriasNaCompetencia} />
            )}
            {conferir && dados && resultados.length > 0 && (
                <ConferenciaHolerites empresaId={empresaId} competencia={competencia} fichas={dados.fichas} resultados={resultados} usuario={usuario} beneficios={parametrosFolha?.beneficios}
                    leitura={leitura} onLeitura={setLeitura} movimentos={movs}
                    onAplicarMovimento={(id, m) => { setMovs(x => ({ ...x, [id]: m })); setVersao(n => n + 1); setAviso(''); }} />
            )}

            {sel && mensal && <Holerite key={`${sel.fichaId}-${versao}`} r={sel} mov={movs[sel.fichaId] ?? {}} gravado={gravados?.[sel.fichaId]} pendente={pendentes.includes(sel.fichaId)} arredonda={arredondaNoMes(parametrosFolha, competencia)} onMov={m => setMovs(x => ({ ...x, [sel.fichaId]: m }))}
                salario={salarioSel} lancado={lancado?.fichaId === sel.fichaId ? lancado.mensagem : ''}
                onLancar={(m, mensagem) => { setMovs(x => ({ ...x, [sel.fichaId]: m })); setLancado({ fichaId: sel.fichaId, mensagem }); setVersao(n => n + 1); }} />}
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
                            <p>{t.diasAviso ? `Aviso de ${t.diasAviso} dias · ` : ''}fim projetado {br(t.dataProjetada)} · pagar até <PagarAte data={t.pagarAte} /></p>
                            <p>Multa do FGTS{t.percentualMulta ? ` (${t.percentualMulta}%)` : ''}: <strong>{t.percentualMulta ? (t.multaFgts ? reais(t.multaFgts) : 'informe o saldo') : 'não há'}</strong> — paga por guia, fora do líquido. {t.saqueFgts}</p>
                            <p className="text-slate-500">Nada aqui é gravado. O desligamento oficial é o S-2299; a data e o motivo vêm da ficha.</p>
                            {p.simulada && <button className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600" onClick={() => { setParamsResc(x => { const y = { ...x }; delete y[t.fichaId]; return y; }); setAberto(''); }}>Remover simulação</button>}
                        </div>
                    </Holerite>
                );
            })()}
            {(arquivoBancario || pacote) && empresa && dados && (() => {
                const hoje = new Date().toISOString().slice(0, 10);
                const [pa, pm] = (/^\d{4}-\d{2}$/.test(pagamento) ? pagamento : competenciaSeguinte(competencia)).split('-').map(Number);
                const sugerida = mensal ? quintoDiaUtilSalario(pa, pm) : folha === '13-1a' ? diaUtilAnterior(`${ano}-11-30`) : folha === '13-2a' ? diaUtilAnterior(`${ano}-12-20`) : diaUtilSeguinte(hoje);
                const dataDoRecibo = ferias ? (r: ResultadoCalculo) => { const p = (r as ResultadoFerias).pagarAte; return p ? diaUtilAnterior(p) : undefined; } : undefined;
                const contasSalvas = (contas: ContaPagamento[]) => setEmpresas(l => l?.map(e => (e.id === empresa.id ? { ...e, contasPagamento: contas } : e)) ?? l);
                const nomeEmp = empresa.nomeFantasia || empresa.razaoSocial;
                const cod = empresa.codigoSage ?? 'empresa';
                if (arquivoBancario === 'adiantamento') return (
                    <ArquivoBancarioModal empresa={empresa} resultados={resultados} fichas={dados.fichas} titulo={`Adiantamento salarial ${competencia.slice(5)}/${competencia.slice(0, 4)}`}
                        dataSugerida={dataSugeridaAdiantamento(competencia)} valorPorResultado={valorDoAdiantamento} rotuloValor="Adiantamento" foraPorData={foraDoAdiantamento}
                        onFechar={() => setArquivoBancario(false)} onContasSalvas={contasSalvas} />
                );
                if (arquivoBancario) return (
                    <ArquivoBancarioModal empresa={empresa} resultados={resultados} fichas={dados.fichas} titulo={tituloFolha} dataSugerida={sugerida}
                        dataPorResultado={dataDoRecibo} onFechar={() => setArquivoBancario(false)} onContasSalvas={contasSalvas} />
                );
                const eventos = (data: string) => (ferias
                    ? (resultados as ResultadoFerias[]).filter(f => f.situacao !== 'erro').flatMap(f => {
                        const gozo = dados.afastamentos.find(a => a.id === f.gozoId) ?? feriasSimuladas.find(a => a.id === f.gozoId);
                        return gozo ? eventosDoReciboFerias(f, { nome: nomeEmp, cnpj: empresa.cnpj }, gozo) : [];
                    }).sort((a, b) => a.inicio.localeCompare(b.inicio))
                    : eventosDaFolha({ folha: folha as Exclude<Folha, 'ferias'>, empresa: { nome: nomeEmp, cnpj: empresa.cnpj }, competencia, ano,
                        pagamento: rescisao ? (resultados[0]?.pagamento || competencia) : pagamento, dataPagamento: data, resultados, encargos: resumo.encargos }));
                const recibos = mensal ? 'Holerites' : ferias ? 'Recibos de férias' : rescisao ? (homologado ? 'Rescisões (TRCT)' : 'Rescisões (TRCT em prévia)') : 'Holerites do 13º';
                return (
                    <PacoteClienteModal empresa={empresa} resultados={resultados} fichas={dados.fichas} titulo={tituloFolha} sufixo={sufixoArquivo}
                        dataSugerida={sugerida} dataPorResultado={dataDoRecibo} eventos={eventos} onFechar={() => setPacote(false)} onContasSalvas={contasSalvas}
                        onContatoSalvo={contatoEnvio => setEmpresas(l => l?.map(e => (e.id === empresa.id ? { ...e, contatoEnvio } : e)) ?? l)}
                        documentos={[
                            { id: 'holerites', rotulo: `${recibos} (PDF)`, nome: `holerites-${cod}-${sufixoArquivo}.pdf`, descricao: `${recibos.toLowerCase()} para assinatura dos funcionários`,
                                gerar: async () => (await relatoriosPdf()).holeritesPdf(resultados, dados.fichas, opcoesPdf()).output('arraybuffer') },
                            ...(mensal && movsLidos && resultados.some(r => r.situacao === 'calculado' && valorDoAdiantamento(r) > 0) ? [{ id: 'adiantamento', rotulo: 'Recibos do adiantamento (PDF)', nome: `adiantamento-${cod}-${competencia}.pdf`,
                                descricao: `recibos do adiantamento salarial pago em ${br(dataAdiantamento)}, para assinatura dos funcionários`,
                                gerar: async () => (await relatoriosPdf()).recibosAdiantamentoPdf(resultados, dados.fichas, opcoesPdfAdiantamento(), dataAdiantamento).output('arraybuffer') }] : []),
                            { id: 'resumo', rotulo: 'Resumo da folha (PDF)', nome: `resumo-${cod}-${sufixoArquivo}.pdf`, descricao: 'resumo da folha com os valores para conferir as guias',
                                gerar: async () => (await relatoriosPdf()).resumoPdf(resumo, opcoesPdf(), observacaoResumo).output('arraybuffer') },
                        ]} />
                );
            })()}
            {sel && ferias && (() => {
                const f = sel as ResultadoFerias;
                return (
                    <Holerite key={`${f.gozoId}-ferias`} r={f}>
                        <div className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
                            <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Recibo de férias</h4>
                            {f.periodo && <p>Período aquisitivo {br(f.periodo.inicio)} a {br(f.periodo.fim)} · concessivo até {br(f.periodo.fimConcessivo)}</p>}
                            <p>{f.diasGozo} dias de gozo · direito {f.direito} · saldo {f.saldo}{f.diasDobra ? ` · ${f.diasDobra} em dobro` : ''} · pagar até <PagarAte data={f.pagarAte} /></p>
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
                                const gozo = dados?.afastamentos.find(a => a.id === f.gozoId) ?? feriasSimuladas.find(a => a.id === f.gozoId);
                                const emp = empresas?.find(e => e.id === empresaId);
                                if (!gozo || !emp || f.situacao === 'erro') return null;
                                const nomeEmp = emp.nomeFantasia || emp.razaoSocial;
                                return <ConviteAgenda eventos={eventosDoReciboFerias(f, { nome: nomeEmp, cnpj: emp.cnpj }, gozo)} titulo={`${nomeEmp}: férias de ${f.nome}`}
                                    nomeArquivo={`ferias-${f.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${gozo.dtInicio}`} />;
                            })()}
                            {/* Atalho: o pacote fica na barra do topo, longe de quem está no recibo. */}
                            {f.situacao === 'calculado' && (
                                <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2 dark:border-slate-700">
                                    <span className="font-medium">Enviar ao cliente</span>
                                    <button type="button" className="rounded bg-green-700 px-2 py-1 text-white" onClick={() => setPacote(true)}>Pacote do cliente</button>
                                    <span className="text-slate-500 dark:text-slate-400">.zip com os recibos de férias de {br(competencia)}, a agenda e o LEIA-ME, com envio por WhatsApp ou e-mail.</span>
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
                                    // Criado à mão: origem "Manual" (a importação do backup/S-2230 preserva e aponta a divergência).
                                    const g: Afastamento = { ...simulado, abonoDias: abono ? String(abono) : '', perAquisInicio: f.periodo?.inicio ?? '', perAquisFim: f.periodo?.fim ?? '',
                                        origem: `Manual · ${usuario.email} · ${new Date().toISOString().slice(0, 10)} (Cálculo › Férias)` };
                                    // As mesmas conferências do cadastro de afastamentos (sobreposição com férias, doença…).
                                    const v = validarAfastamento(g, dados?.fichas.find(x => x.id === g.fichaId), (dados?.afastamentos ?? []).filter(a => a.fichaId === g.fichaId));
                                    if (v.erros.length) { setErro(`Férias não gravadas: ${v.erros.join(' ')}`); return; }
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

/** "Lançar evento" como no Sage: código do evento do IOB + referência; o Consultor calcula e põe no movimento. */
const LancarEvento: React.FC<{ mov: Movimento; salario: SalarioDoMes | null; lancado: string; onLancar: (m: Movimento, mensagem: string) => void }> = ({ mov, salario, lancado, onLancar }) => {
    const [eventos, setEventos] = useState<EventoIobSage[] | null>(null);
    const [codigo, setCodigo] = useState('');
    const [ref, setRef] = useState('');
    const [erro, setErro] = useState('');
    const carregar = () => { if (!eventos) carregarEventosIob().then(setEventos).catch(() => setErro('Não foi possível carregar o catálogo de eventos do IOB.')); };
    const ev = eventos ? eventoPorCodigo(eventos, codigo) : null;
    const tipo = ev ? tipoDaReferencia(ev) : null;
    const rotulo = { horas: 'Horas (8,5 ou 8:30)', dias: 'Dias', percentual: '%', valor: 'Valor (R$)' };
    const lancar = async () => {
        setErro('');
        const lista = eventos ?? await carregarEventosIob().catch(() => null);
        if (!lista) { setErro('Não foi possível carregar o catálogo de eventos do IOB.'); return; }
        if (!eventos) setEventos(lista);
        const e = eventoPorCodigo(lista, codigo);
        if (!e) { setErro(codigo.trim() ? `Evento ${codigo.trim()} não está no catálogo do IOB (Cadastros › Eventos IOB).` : 'Informe o código do evento.'); return; }
        const n = lerReferencia(ref, tipoDaReferencia(e));
        if (n === null) { setErro('Referência inválida.'); return; }
        const res = lancarEvento(e, n, salario, mov);
        if ('erro' in res) setErro(res.erro);
        else onLancar(res.movimento, res.mensagem);
    };
    return (
        <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Lançar evento do IOB</p>
            <form className="mt-1 flex flex-wrap items-end gap-2 text-xs dark:text-slate-200" onSubmit={e => { e.preventDefault(); void lancar(); }}>
                <label>Evento<input aria-label="Código do evento" className={`mt-0.5 block w-20 ${inp}`} value={codigo} inputMode="numeric" placeholder="0810"
                    onFocus={carregar} onChange={e => { setCodigo(e.target.value); setErro(''); }} /></label>
                <label>{tipo ? rotulo[tipo] : 'Referência'}<input aria-label="Referência do evento" className={`mt-0.5 block w-24 ${inp}`} value={ref} onChange={e => { setRef(e.target.value); setErro(''); }} /></label>
                <button type="submit" className="rounded border border-slate-300 px-2 py-1 dark:border-slate-600 dark:text-white">Lançar</button>
                {ev && <span className="pb-1 text-slate-500 dark:text-slate-400">{ev.descricao} · {ev.tipo === 'V' ? 'provento' : ev.tipo === 'D' ? 'desconto' : 'informativo'}</span>}
            </form>
            {erro && <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-300">{erro}</p>}
            {lancado && !erro && <p role="status" className="mt-1 text-xs text-green-700 dark:text-green-300">{lancado}</p>}
            <p className="mt-1 text-xs text-slate-500">Horas extras, faltas, atrasos, DSR, pensão, adiantamento e vale-transporte vão para o campo do movimento; os demais viram lançamento avulso com as incidências do evento.</p>
        </div>
    );
};

const Holerite: React.FC<{ r: ResultadoCalculo; mov?: Movimento; gravado?: MovimentoGravado; pendente?: boolean; arredonda?: boolean; onMov?: (m: Movimento) => void; salario?: SalarioDoMes | null; lancado?: string; onLancar?: (m: Movimento, mensagem: string) => void; children?: React.ReactNode }> = ({ r, mov = {}, gravado, pendente = false, arredonda = false, onMov = () => {}, salario = null, lancado = '', onLancar, children }) => {
    const pdf = React.useContext(PdfContexto);
    const emHoras = (k: string) => k === 'horasExtras50' || k === 'horasExtras100' || k === 'atrasosHoras';
    const campo = (k: 'horasExtras50' | 'horasExtras100' | 'faltasDias' | 'dsrDescontadoDias' | 'atrasosHoras' | 'feriadosLocais', rotulo: string) => (
        <label className="text-xs dark:text-slate-200" title={emHoras(k) ? 'Em horas: 8,5 ou 8:30 para 8h30. O valor sai do salário-hora.' : undefined}>{rotulo}
            <input aria-label={rotulo} className={`mt-0.5 block w-24 ${inp}`} defaultValue={mov[k] != null ? String(mov[k]).replace('.', ',') : ''}
                onChange={e => onMov({ ...mov, [k]: emHoras(k) ? horas(e.target.value) : decimal(e.target.value) })} />
        </label>
    );
    // Horas extras com outros adicionais da convenção (60%, 75%…): uma linha por percentual.
    const outras = Object.entries(mov.horasExtrasPct ?? {});
    const setOutras = (l: [string, number][]) => onMov({ ...mov, horasExtrasPct: l.length ? Object.fromEntries(l) : undefined });
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
                {onLancar && <LancarEvento mov={mov} salario={salario} lancado={lancado} onLancar={onLancar} />}
                <div className="flex flex-wrap gap-3">
                    {campo('horasExtras50', 'Horas extras 50%')}
                    {campo('horasExtras100', 'Horas extras 100%')}
                    {outras.map(([p, h], i) => (
                        <span key={i} className="flex items-end gap-1 text-xs dark:text-slate-200">
                            <label>Adicional (%)<input aria-label={`Adicional da hora extra ${i + 1}`} className={`mt-0.5 block w-16 ${inp}`} defaultValue={p}
                                onChange={e => setOutras(outras.map((x, j) => (j === i ? [e.target.value.replace(',', '.').replace(/[^\d.]/g, ''), x[1]] : x)))} /></label>
                            <label>Horas<input aria-label={`Horas da hora extra ${i + 1}`} className={`mt-0.5 block w-20 ${inp}`} defaultValue={h ? String(h).replace('.', ',') : ''}
                                onChange={e => setOutras(outras.map((x, j) => (j === i ? [x[0], horas(e.target.value) ?? 0] : x)))} /></label>
                            <button className="pb-1 text-red-700 dark:text-red-300" aria-label={`Remover hora extra ${i + 1}`} onClick={() => setOutras(outras.filter((_, j) => j !== i))}>✕</button>
                        </span>
                    ))}
                    <button className="self-end rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-600 dark:text-white" title="Hora extra com adicional da convenção diferente de 50% e 100% (60%, 75%…)"
                        onClick={() => setOutras([...outras, [String(outras.length ? '' : '60'), 0]])}>+ Hora extra com outro adicional</button>
                    {campo('faltasDias', 'Faltas (dias)')}
                    {campo('dsrDescontadoDias', 'DSR descontado (dias)')}
                    {campo('atrasosHoras', 'Faltas e atrasos (horas)')}
                    {campo('feriadosLocais', 'Feriados locais no mês')}
                    <label className="text-xs dark:text-slate-200">Pensão alimentícia (R$)
                        <input aria-label="Pensão alimentícia" className={`mt-0.5 block w-28 ${inp}`} defaultValue={mov.pensaoAlimenticia ? (mov.pensaoAlimenticia / 100).toFixed(2).replace('.', ',') : ''}
                            onChange={e => onMov({ ...mov, pensaoAlimenticia: centavosDeTexto(e.target.value) ?? undefined })} />
                    </label>
                    {/* Em branco, o motor calcula pela ficha (aba "Adiant. e VT"); preenchido, vale o valor (0 = nada no mês). */}
                    <label className="text-xs dark:text-slate-200" title="Em branco: o percentual da ficha sobre o salário do mês. Preencha com o valor pago (0 se não houve).">Adiantamento pago (R$)
                        <input aria-label="Adiantamento pago" placeholder="pela ficha" className={`mt-0.5 block w-28 ${inp}`} defaultValue={mov.adiantamento !== undefined ? (mov.adiantamento / 100).toFixed(2).replace('.', ',') : ''}
                            onChange={e => onMov({ ...mov, adiantamento: centavosDeTexto(e.target.value) ?? undefined })} />
                    </label>
                    <label className="text-xs dark:text-slate-200" title="Em branco: 6% do salário do mês, se a ficha marcar vale-transporte. Preencha com o valor descontado (0 se não houve).">Vale-transporte (R$)
                        <input aria-label="Vale-transporte descontado" placeholder="pela ficha" className={`mt-0.5 block w-28 ${inp}`} defaultValue={mov.valeTransporte !== undefined ? (mov.valeTransporte / 100).toFixed(2).replace('.', ',') : ''}
                            onChange={e => onMov({ ...mov, valeTransporte: centavosDeTexto(e.target.value) ?? undefined })} />
                    </label>
                    {arredonda && <label className="text-xs dark:text-slate-200" title="Em branco: o arredondamento atual do mês passado, encadeado pelo Consultor. Preencha com o do holerite do IOB no primeiro mês.">Arredondamento anterior (R$)
                        <input aria-label="Arredondamento anterior" placeholder="encadeado" className={`mt-0.5 block w-28 ${inp}`} defaultValue={mov.arredondamentoAnterior !== undefined ? (mov.arredondamentoAnterior / 100).toFixed(2).replace('.', ',') : ''}
                            onChange={e => onMov({ ...mov, arredondamentoAnterior: centavosDeTexto(e.target.value) ?? undefined })} />
                    </label>}
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
