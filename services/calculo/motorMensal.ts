// services/calculo/motorMensal.ts
//
// Fase 3: motor do cálculo mensal (Processos › Pagamento Mensal › Cálculo da
// Folha do IOB). Primeira versão, em PRÉVIA: calcula um funcionário numa
// competência a partir da ficha, dos afastamentos, das tabelas legais e do
// movimento digitado, e devolve cada verba com a memória de cálculo. Não grava
// nada e não substitui o IOB enquanto não for conferido contra ele.
//
// Cobre: salário mensal, por hora ou por dia, proporcional (admissão,
// desligamento, afastamentos); primeiros 15 dias de doença/acidente;
// salário-maternidade; horas extras 50%/100% com reflexo no DSR; faltas e DSR
// descontado; lançamentos avulsos; adiantamento salarial e vale-transporte
// (desconto); INSS progressivo; salário-família; IRRF
// com desconto simplificado, dependentes, pensão e o redutor de 2026; FGTS.
// Fica de fora (aviso e situação "incompleto"): férias, 13º, rescisão,
// adicionais e médias de variáveis.

import { verbasDosBeneficios, type Beneficio } from './beneficios';
import { fichaNaCompetencia, memoriaDoHistorico, type FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { inicioBeneficio, rotuloMotivo } from '../cadastros/afastamentos';
import { centavosDeTexto, dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { diaSemana, diaUtilAnterior, feriados, somarDias, somarMeses } from '../prazos/calendario';

export type TipoVerba = 'provento' | 'desconto';
export interface Incidencias { inss: boolean; fgts: boolean; irrf: boolean }
export interface Verba extends Incidencias { codigo: string; descricao: string; referencia: string; tipo: TipoVerba; valor: number }
export interface Lancamento extends Incidencias {
    descricao: string; tipo: TipoVerba; valor: number;
    /** Entra na média de férias, 13º e rescisão (comissão, adicional noturno…). Sem marcar: provento com INSS entra. */
    media?: boolean;
}

/** Lançamento que entra nas médias: o marcado, ou o provento de natureza salarial (com INSS) quando não marcado. */
export const entraNaMedia = (l: Lancamento) => l.media ?? (l.tipo === 'provento' && l.inss);

/** Movimento do mês digitado pela equipe. Horas em decimal (1,5 = 1h30); valores em centavos. */
export interface Movimento {
    horasExtras50?: number;
    horasExtras100?: number;
    /** Horas extras com outros adicionais da convenção (60%, 70%, 75%…): percentual → horas. */
    horasExtrasPct?: Record<string, number>;
    faltasDias?: number;
    dsrDescontadoDias?: number;
    /** Faltas e atrasos em horas (o "FALTAS E ATRASOS (T/H)" do IOB): salário-hora × horas, com INSS, FGTS e IRRF. */
    atrasosHoras?: number;
    /** Feriados estaduais/municipais no mês (entram como descanso no DSR das horas extras). */
    feriadosLocais?: number;
    pensaoAlimenticia?: number;
    /** Pensão alimentícia sobre o 13º pago no mês (centavos): 1ª ou 2ª parcela, ou o 13º da rescisão; deduz no IRRF do 13º. */
    pensao13?: number;
    /** Adiantamento salarial pago no mês (centavos): substitui o calculado pelo percentual da ficha. 0 = não pago. */
    adiantamento?: number;
    /** Vale-transporte descontado no mês (centavos): substitui o calculado pela ficha (holerite do IOB). */
    valeTransporte?: number;
    /** Arredondamento do mês anterior (centavos) a descontar, quando a empresa arredonda o líquido: vale no lugar do encadeado. */
    arredondamentoAnterior?: number;
    /**
     * Arredondamento atual do mês, gravado ao salvar o movimento (centavos, até 0,99): é o anterior do mês seguinte.
     * Com ele, o encadeamento não recalcula este mês com a ficha de hoje (dependentes, VT mudados depois; Codex #116).
     */
    arredondamentoFechado?: number;
    /** Mês de início do arredondamento quando o atual foi gravado: mudou o início, o gravado não vale (Codex #116). */
    arredondamentoDesde?: string;
    /** Mês do pagamento com que o atual foi calculado: mudou o regime daquele mês, o gravado não vale (Codex #116). */
    arredondamentoPagamento?: string;
    /**
     * Mês do pagamento usado de fato, quando o "Pagamento em" da tela foi diferente do regime da empresa (gravado com
     * ou sem arredondamento). Os meses seguintes o usam no lugar do regime (IRRF do adiantamento; Codex #118).
     */
    mesPagamento?: string;
    /**
     * IRRF apurado nesta folha, gravado ao salvar quando ela é paga no mês seguinte (rendimentos, deduções legais e
     * o retido, em centavos, e o mês do pagamento): o adiantamento daquele mês soma o que foi pago de fato, sem
     * refazer a folha com a ficha de hoje (Codex #118).
     */
    irrfRendimentos?: number;
    irrfDeducoes?: number;
    irrfRetido?: number;
    irrfPagamento?: string;
    lancamentos?: Lancamento[];
}

export interface EntradaCalculo {
    competencia: string; // AAAA-MM
    /** Mês do pagamento (regime de caixa do IRRF). Padrão: mês seguinte à competência. */
    pagamento?: string;
    ficha: FichaFuncionario;
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    movimento?: Movimento;
    /**
     * Férias desta competência já pagas no recibo (soma dos gozos): entram na
     * base do INSS e do FGTS do mês, e o INSS já retido no recibo é abatido.
     * Sem isto, o mês com férias fica "incompleto".
     */
    feriasDoMes?: { dias: number; ferias: number; terco: number; inss: number; irrf?: number };
    /**
     * Folha paga no mês do adiantamento, antes dele (a da competência anterior, quando a empresa paga no mês seguinte),
     * com o IRRF apurado nela; `null` se não houve. Só é usada quando o adiantamento é pago num mês e o saldo da folha
     * em outro: o IRRF do adiantamento é o do mês dele (regime de caixa), sobre tudo o que foi pago no mês, menos o
     * que a folha anterior já reteve (RIR/1999, art. 621; conferido com o IOB, 08/2026). `{ pendente }`: a folha paga
     * antes não é conhecida (sem o IRRF gravado dela, por exemplo), com o que falta para o aviso.
     */
    folhaPagaNoAdiantamento?: IrrfApurado & { competencia: string } | { pendente: string } | null;
    /**
     * Pagamento no próprio mês da competência (rescisão paga no mês) com a folha anterior paga nele (empresa que paga
     * no mês seguinte): o IRRF soma o que já foi pago no mês (a folha anterior e o adiantamento) e desconta o que já foi
     * retido (RIR/1999, art. 621). `{ pendente }`: a folha anterior não é conhecida. Só vale com pagamento = competência.
     */
    folhaPagaAntesNoMes?: IrrfApurado & { competencia: string } | { pendente: string } | null;
    /** Benefícios da empresa (parâmetros da folha): os da ficha vigentes no mês entram como verbas. */
    beneficios?: Beneficio[];
}

/** O IRRF de um pagamento da folha: rendimentos tributáveis, deduções legais (INSS, dependentes, pensão) e o retido. */
export interface IrrfApurado { rendimentos: number; deducoesLegais: number; valor: number }

export type Situacao = 'calculado' | 'incompleto' | 'erro';
export interface ResultadoCalculo {
    fichaId: string;
    nome: string;
    competencia: string;
    pagamento: string;
    situacao: Situacao;
    verbas: Verba[];
    bases: { inss: number; fgts: number; irrf: number };
    totais: { proventos: number; descontos: number; liquido: number };
    fgts: number;
    memoria: string[];
    avisos: string[];
    erros: string[];
    /** Adiantamento salarial informado no movimento (vale como foi, sem a regra da data). */
    adiantamentoInformado?: boolean;
    /** Como o IRRF do mês foi deduzido (o S-1210 informa as deduções de dependentes). */
    deducoesIrrf?: { simplificado: boolean; dependentes: { cpf: string; nome: string }[]; porDependente: number; pensao: number };
    /** O IRRF apurado na folha (para o adiantamento do mês seguinte, quando ela é paga junto com ele). */
    irrfApurado?: IrrfApurado;
    /** Adiantamento pago num mês e saldo da folha em outro: o IRRF retido no adiantamento (já fora da base da folha). */
    irrfAdiantamento?: number;
    /** O que entrou no IRRF do adiantamento deste contrato, para somar os contratos do mesmo CPF. */
    irrfAdiantamentoApuracao?: { rendimentos: number; deducoesLegais: number; jaRetido: number; adiantamento: number; dependentes: number };
    /** IRRF do adiantamento apurado com os outros contratos do CPF (o valor é a parte deste contrato). */
    irrfAdiantamentoCpf?: boolean;
    /** Competência da folha anterior somada no IRRF do adiantamento (paga antes dele, até o 5º dia útil). */
    irrfAdiantamentoFolha?: string;
    /** Incompleto só pelo IRRF do adiantamento (falta a folha paga antes dele): o IRRF da folha em si está completo e pode ser gravado. */
    soFaltaFolhaDoAdiantamento?: boolean;
    /** Sem folha anterior no mês: dependentes deduzidos no IRRF do adiantamento (vão no S-1210 do mês dele; Codex #118). */
    deducoesAdiantamento?: { dependentes: { cpf: string; nome: string }[]; porDependente: number };
}

/** FGTS: 8% (Lei 8.036/1990, art. 15); aprendiz 2% (§ 7º). */
const ALIQUOTA_FGTS = 8;
const ALIQUOTA_FGTS_APRENDIZ = 2;
/** Retenção de IRRF até R$ 10,00 é dispensada (Lei 9.430/1996, art. 67). */
const IRRF_MINIMO = 1000;

const MATERNIDADE = ['17', '18', '19', '20', '33', '35', '43'];
/** Prorrogação da licença-maternidade (Empresa Cidadã, Lei 11.770/2008): a empresa paga e não compensa na DCTFWeb. */
const PRORROGACAO = '18';
/** Afastamentos com FGTS sobre a remuneração (Lei 8.036/1990, art. 15, § 5º): acidente do trabalho e serviço militar. */
const FGTS_NO_AFASTAMENTO = ['01', '29'];
const DOENCA = ['01', '03'];
const REMUNERADO = ['16'];
const FERIAS = ['15'];
/** Remuneração depende do caso: o motor não paga e avisa. */
const CONFERIR = ['14', '24', '25'];

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const brData = (d: string) => d.split('-').reverse().join('/');
const ultimoDia = (comp: string) => { const [a, m] = comp.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
export const competenciaSeguinte = (c: string) => somarMeses(`${c}-01`, 1).slice(0, 7);
export const competenciaAnterior = (c: string) => somarMeses(`${c}-01`, -1).slice(0, 7);

/** Feriados nacionais por lei (sem Carnaval e Sexta-feira Santa, que dependem de lei local). */
function feriadoNacional(d: string): boolean {
    const nome = feriados(Number(d.slice(0, 4))).get(d);
    return !!nome && !/Carnaval|Sexta-feira Santa/.test(nome);
}

/** Dias úteis (segunda a sábado) e de descanso (domingos e feriados nacionais) do mês, para o DSR. */
export function diasDsr(competencia: string, feriadosLocais = 0, de = `${competencia}-01`, ate = ultimoDia(competencia)): { uteis: number; descanso: number } {
    let uteis = 0; let descanso = 0;
    // Mês parcial (admissão ou desligamento): só os dias do vínculo.
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
        if (diaSemana(d) === 0 || feriadoNacional(d)) descanso++; else uteis++;
    }
    const n = Math.max(0, Math.min(feriadosLocais, uteis));
    return { uteis: uteis - n, descanso: descanso + n };
}

export type SalarioContratual = { mensal: number; horasMes: number; memoria: string; avisos: string[] } | { erro: string; avisos: string[] };

/** Salário mensal da ficha (mês, hora × horas semanais × 5, dia × 30, quinzena × 2) e as horas do mês. */
export function salarioContratual(d: FichaFuncionario['dados']): SalarioContratual {
    const avisos: string[] = [];
    const contratual = centavosDeTexto(d.salario ?? '');
    if (!contratual) return { erro: 'Ficha sem salário fixo.', avisos };
    const horasSemanais = Number((d.horasSemanais ?? '').replace(',', '.'));
    // Horas mês da ficha (o divisor do IOB, 220 para quem tem 44 h) vale sobre semanais × 5.
    const informadas = Number((d.horasMes ?? '').replace(',', '.'));
    const horasMes = informadas >= 1 && informadas <= 300 ? informadas : horasSemanais > 0 ? Math.round(horasSemanais * 5 * 100) / 100 : 220;
    if (!(informadas >= 1 && informadas <= 300) && !(horasSemanais > 0)) avisos.push('Ficha sem horas semanais: usado divisor de 220 horas.');
    const unidade = d.unidadeSalario || '5';
    if (!d.unidadeSalario) avisos.push('Ficha sem unidade salarial: tratado como salário mensal.');
    if (unidade === '5') return { mensal: contratual, horasMes, memoria: `Salário mensal: ${reais(contratual)}.`, avisos };
    if (unidade === '1') { const mensal = Math.round(contratual * horasMes); return { mensal, horasMes, memoria: `Salário por hora ${reais(contratual)} × ${num(horasMes)} h (${informadas >= 1 && informadas <= 300 ? 'horas mês da ficha' : 'semanais × 5'}, DSR incluído) = ${reais(mensal)}.`, avisos }; }
    if (unidade === '2') return { mensal: contratual * 30, horasMes, memoria: `Salário por dia ${reais(contratual)} × 30 = ${reais(contratual * 30)}.`, avisos };
    if (unidade === '4') return { mensal: contratual * 2, horasMes, memoria: `Salário por quinzena ${reais(contratual)} × 2 = ${reais(contratual * 2)}.`, avisos };
    return { erro: `Unidade salarial ${unidade}: não calculada nesta versão (só mês, hora, dia e quinzena).`, avisos };
}

type Dia = 'pago' | 'maternidade' | 'prorrogacao' | 'ferias' | 'naoPago';

/**
 * Dias de salário no mês comercial. Mês inteiro sem afastamento vale 30; com afastamento, os dias trabalhados (até 30).
 * Em fevereiro (e com férias no mês), 30 menos os dias fora quando o afastamento acaba dentro do mês; afastado até o fim
 * do mês, só os dias trabalhados, e sem nenhum dia trabalhado, nada (antes, fevereiro inteiro afastado pagava 2 dias, e a
 * doença desde 01/02 pagava 17 em vez dos 15 da empresa; auditoria de 10/2026).
 */
function diasPagosNoMes(dias: Map<string, Dia>, mesInteiro: boolean, L: number): number {
    const vals = [...dias.values()];
    const realPago = vals.filter(v => v === 'pago').length;
    if (realPago === 0) return 0;
    const comFerias = vals.includes('ferias');
    if (!mesInteiro || (L >= 30 && !comFerias)) return Math.min(30, realPago);
    if (!comFerias && vals[vals.length - 1] !== 'pago') return realPago;
    return Math.max(0, 30 - (L - realPago));
}

export function calcularMensal(e: EntradaCalculo): ResultadoCalculo {
    const { competencia } = e;
    // Competência anterior a um reajuste: o salário vigente naquele mês, pelo histórico dos S-2200/S-2206.
    const naCompetencia = fichaNaCompetencia(e.ficha, competencia);
    const ficha = naCompetencia.ficha;
    const pagamento = e.pagamento || (competenciaValida(competencia) ? competenciaSeguinte(competencia) : '');
    const mov = e.movimento ?? {};
    const r: ResultadoCalculo = {
        fichaId: ficha.id, nome: ficha.dados.nome || ficha.cpf, competencia, pagamento, situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [],
    };
    const fim = (s: Situacao) => { if (s === 'incompleto' && r.situacao === 'calculado') r.situacao = s; if (s === 'erro') r.situacao = s; };
    const erro = (m: string) => { r.erros.push(m); fim('erro'); return r; };
    const incompleto = (m: string) => { r.avisos.push(m); fim('incompleto'); };
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    const d = ficha.dados;

    if (!competenciaValida(competencia)) return erro('Competência inválida.');
    if (!competenciaValida(pagamento)) return erro('Mês do pagamento inválido.');
    const ini = `${competencia}-01`; const ult = ultimoDia(competencia);
    if (!d.admissao || !dataValida(d.admissao)) return erro('Ficha sem data de admissão válida.');
    if (d.admissao > ult) return erro(`Admitido em ${brData(d.admissao)}, depois da competência.`);
    const deslig = d.dataDesligamento && dataValida(d.dataDesligamento) ? d.dataDesligamento : '';
    if (deslig && deslig < ini) return erro(`Desligado em ${brData(deslig)}, antes da competência.`);
    const categoria = d.categoria || '';
    if (categoria && !/^1\d\d$/.test(categoria)) return erro(`Categoria ${categoria}: esta versão só calcula empregados (categorias 1xx).`);
    // Doméstico (FGTS de 3,2% da LC 150, sem multa de 40%) e intermitente (pago por convocação) têm regras próprias.
    if (categoria === '104') return erro('Empregado doméstico (categoria 104): o motor ainda não calcula (FGTS com os 3,2% da LC 150/2015). Calcule pelo IOB.');
    if (categoria === '111') return erro('Intermitente (categoria 111): o motor ainda não calcula a remuneração por convocação. Calcule pelo IOB.');
    if (!categoria) r.avisos.push('Ficha sem categoria do eSocial: calculado como empregado (101).');
    const aprendiz = categoria === '103';

    // 1. Salário contratual e salário-hora.
    const sc = salarioContratual(d);
    r.avisos.push(...sc.avisos);
    if ('erro' in sc) return erro(sc.erro);
    const { mensal, horasMes } = sc;
    r.memoria.push(sc.memoria);
    if (naCompetencia.faixa) r.memoria.push(memoriaDoHistorico(naCompetencia.faixa, 'na competência', !!naCompetencia.antesDoHistorico));
    if (naCompetencia.antesDoHistorico) r.avisos.push('Data anterior ao histórico de salário da ficha: usado o salário mais antigo conhecido; confira.');
    if (naCompetencia.alteradoNoMes) r.avisos.push(`Salário alterado em ${brData(naCompetencia.alteradoNoMes)}, no meio do mês: o motor usa o vigente no fim do mês; confira se o IOB pagou proporcional.`);
    const salarioHora = mensal / horasMes;
    const diaria = mensal / 30;

    // 2. Dias do mês: vínculo e afastamentos.
    const de = d.admissao > ini ? d.admissao : ini;
    const ate = deslig && deslig < ult ? deslig : ult;
    const dias = new Map<string, Dia>();
    for (let x = de; x <= ate; x = somarDias(x, 1)) dias.set(x, 'pago');
    const mesInteiro = de === ini && ate === ult;
    if (!mesInteiro) r.memoria.push(`Vínculo no mês: ${brData(de)} a ${brData(ate)} (${dias.size} dia(s)).`);
    if (deslig && deslig <= ult) incompleto(`Desligado em ${brData(deslig)}: só o saldo de salário foi calculado; a rescisão não está no motor.`);

    let diasAcidenteInss = 0;
    // Benefício do INSS (doença) que começou antes do mês: o salário-família é pago pelo INSS (Decreto 3.048/1999, art. 82).
    let beneficioDeMesAnterior = false;
    // Dias pagos sem deslocamento (afastamento remunerado, 15 primeiros dias de doença): sem vale-transporte (Codex #115).
    const semTransporte = new Set<string>();
    for (const a of e.afastamentos) {
        if (a.fichaId && a.fichaId !== ficha.id) continue;
        const aIni = a.dtInicio > de ? a.dtInicio : de;
        const aFim = a.dtFim && a.dtFim < ate ? a.dtFim : ate;
        if (aIni > aFim) continue;
        const rotulo = rotuloMotivo(a.motivo);
        let n = 0;
        if (REMUNERADO.includes(a.motivo)) {
            for (let x = aIni; x <= aFim; x = somarDias(x, 1)) semTransporte.add(x);
            r.memoria.push(`Afastamento ${rotulo} de ${brData(aIni)} a ${brData(aFim)}: remunerado pela empresa.`); continue;
        }
        const beneficio = DOENCA.includes(a.motivo) ? (a.infoMesmoMtv === 'S' ? a.dtInicio : inicioBeneficio(a)) : null;
        for (let x = aIni; x <= aFim; x = somarDias(x, 1)) {
            if (DOENCA.includes(a.motivo)) {
                if (beneficio && x >= beneficio) { dias.set(x, 'naoPago'); n++; if (FGTS_NO_AFASTAMENTO.includes(a.motivo)) diasAcidenteInss++; if (beneficio < ini) beneficioDeMesAnterior = true; }
                else semTransporte.add(x);
            } else if (a.motivo === PRORROGACAO) { dias.set(x, 'prorrogacao'); n++; }
            else if (MATERNIDADE.includes(a.motivo)) { dias.set(x, 'maternidade'); n++; }
            else if (FERIAS.includes(a.motivo)) { dias.set(x, 'ferias'); n++; }
            else { dias.set(x, 'naoPago'); n++; if (FGTS_NO_AFASTAMENTO.includes(a.motivo)) diasAcidenteInss++; }
        }
        if (DOENCA.includes(a.motivo)) {
            r.memoria.push(a.infoMesmoMtv === 'S'
                ? `Afastamento ${rotulo} desde ${brData(a.dtInicio)}, mesmo motivo de afastamento anterior (60 dias): benefício do INSS desde o início; ${n} dia(s) sem salário no mês.`
                : `Afastamento ${rotulo} desde ${brData(a.dtInicio)}: empresa paga os 15 primeiros dias; INSS a partir de ${brData(beneficio!)}; ${n} dia(s) sem salário no mês.`);
            // Afastamento anterior do mesmo motivo com menos de 15 dias: a empresa completa os 15 (Decreto 3.048/1999, art. 75, § 5º).
            if (a.infoMesmoMtv === 'S') r.avisos.push(`Afastamento ${rotulo} com o mesmo motivo de outro nos últimos 60 dias: o motor põe o INSS desde o 1º dia. Se o anterior teve menos de 15 dias, a empresa completa os 15; confira e lance os dias no movimento.`);
        } else if (a.motivo === PRORROGACAO) r.memoria.push(`Afastamento ${rotulo}: ${n} dia(s) de prorrogação da licença-maternidade no mês, pagos pela empresa (sem compensação na DCTFWeb).`);
        else if (MATERNIDADE.includes(a.motivo)) r.memoria.push(`Afastamento ${rotulo}: ${n} dia(s) de salário-maternidade no mês.`);
        else if (FERIAS.includes(a.motivo)) {
            if (e.feriasDoMes) r.memoria.push(`Férias de ${brData(aIni)} a ${brData(aFim)} (${n} dia(s)): pagas no recibo de férias; esses dias saem do salário.`);
            else incompleto(`Férias de ${brData(aIni)} a ${brData(aFim)} (${n} dia(s)): o recibo de férias sai em Cálculo › Folha › Férias; sem ele, o INSS e o FGTS do mês não somam as férias.`);
        }
        else {
            r.memoria.push(`Afastamento ${rotulo} de ${brData(aIni)} a ${brData(aFim)}: ${n} dia(s) sem salário.`);
            if (CONFERIR.includes(a.motivo)) r.avisos.push(`Afastamento ${rotulo}: a remuneração depende do caso; o motor não pagou esses dias. Confira.`);
        }
    }
    const contar = (t: Dia) => [...dias.values()].filter(v => v === t).length;
    // Mês comercial: mês inteiro sem afastamento vale 30 dias. Com afastamento,
    // pagam-se os dias trabalhados (até 30); em fevereiro, 30 menos os afastados.
    const L = Number(ult.slice(8));
    const base30 = mesInteiro ? 30 : Math.min(30, dias.size);
    const realPago = contar('pago'); const realProrr = contar('prorrogacao'); const realMat = contar('maternidade') + realProrr;
    // Com férias no mês, salário + férias fecham 30 dias (o recibo paga os dias de férias): 30 − os dias fora.
    const comFerias = contar('ferias') > 0;
    const diasPagos = diasPagosNoMes(dias, mesInteiro, L);
    // Licença-maternidade até o fim do mês (ou o mês todo): completa o mês comercial (em fevereiro, os 2 dias que faltam).
    const diasMatTotal = realMat && mesInteiro && !comFerias && contar('naoPago') === 0 ? 30 - diasPagos : Math.min(30 - diasPagos, realMat === dias.size ? base30 : realMat);
    const diasProrr = !realProrr ? 0 : realProrr === realMat ? diasMatTotal : Math.min(diasMatTotal, realProrr);
    const diasMat = diasMatTotal - diasProrr;
    if (!mesInteiro || realPago < dias.size) r.memoria.push(`Dias a pagar: ${diasPagos} (dias trabalhados no mês; mês inteiro vale 30).`);
    if (!mesInteiro) r.avisos.push('Mês parcial: salário proporcional aos dias do vínculo (máximo 30). Confira a regra com o IOB.');

    // 3. Proventos.
    const sal = diasPagos === 30 ? mensal : Math.round(diaria * diasPagos);
    verba({ codigo: 'SAL', descricao: 'Salário', referencia: `${diasPagos} dias`, tipo: 'provento', valor: sal, inss: true, fgts: true, irrf: true });
    if (diasProrr) {
        const v = diasProrr === 30 ? mensal : Math.round(diaria * diasProrr);
        verba({ codigo: 'MATPRORR', descricao: 'Prorrogação da licença-maternidade (Empresa Cidadã)', referencia: `${diasProrr} dias`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.avisos.push('Prorrogação da licença-maternidade (Lei 11.770/2008): paga pela empresa, sem compensação na DCTFWeb (a dedução é no IRPJ). Média de variáveis não está no motor.');
    }
    if (diasMat) {
        const v = diasMat === 30 ? mensal : Math.round(diaria * diasMat);
        verba({ codigo: 'MAT', descricao: 'Salário-maternidade', referencia: `${diasMat} dias`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.avisos.push('Salário-maternidade pelo salário fixo; média de variáveis não está no motor. A empresa compensa o valor na DCTFWeb.');
    }
    const he50 = mov.horasExtras50 ?? 0; const he100 = mov.horasExtras100 ?? 0;
    let totalHe = 0;
    if (he50 > 0) {
        const v = Math.round(salarioHora * 1.5 * he50); totalHe += v;
        verba({ codigo: 'HE50', descricao: 'Horas extras 50%', referencia: `${num(he50)} h`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`Horas extras 50%: ${num(he50)} h × ${reais(Math.round(salarioHora))}/h × 1,5 = ${reais(v)}.`);
    }
    if (he100 > 0) {
        const v = Math.round(salarioHora * 2 * he100); totalHe += v;
        verba({ codigo: 'HE100', descricao: 'Horas extras 100%', referencia: `${num(he100)} h`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`Horas extras 100%: ${num(he100)} h × ${reais(Math.round(salarioHora))}/h × 2 = ${reais(v)}.`);
    }
    for (const [p, h] of outrasHorasExtras(mov)) {
        const v = Math.round(salarioHora * (1 + p / 100) * h); totalHe += v;
        verba({ codigo: `HE${String(p).replace('.', '_')}`, descricao: `Horas extras ${num(p)}%`, referencia: `${num(h)} h`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`Horas extras ${num(p)}%: ${num(h)} h × ${reais(Math.round(salarioHora))}/h × ${num(1 + p / 100)} = ${reais(v)}.`);
    }
    if (totalHe) {
        const { uteis, descanso } = diasDsr(competencia, mov.feriadosLocais, de, ate);
        const v = Math.round(totalHe / uteis * descanso);
        verba({ codigo: 'DSRHE', descricao: 'DSR sobre horas extras', referencia: `${descanso}/${uteis}`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`DSR sobre horas extras: ${reais(totalHe)} ÷ ${uteis} dias úteis × ${descanso} domingos e feriados = ${reais(v)}${mov.feriadosLocais ? ` (com ${mov.feriadosLocais} feriado(s) local(is))` : ' (só feriados nacionais; informe os locais)'}.`);
    }

    // 4. Descontos do movimento.
    const faltas = mov.faltasDias ?? 0; const dsrDesc = mov.dsrDescontadoDias ?? 0;
    if (faltas > 0) verba({ codigo: 'FALTA', descricao: 'Faltas', referencia: `${num(faltas)} dias`, tipo: 'desconto', valor: Math.round(diaria * faltas), inss: true, fgts: true, irrf: true });
    if (dsrDesc > 0) verba({ codigo: 'DSRF', descricao: 'DSR descontado (faltas)', referencia: `${num(dsrDesc)} dias`, tipo: 'desconto', valor: Math.round(diaria * dsrDesc), inss: true, fgts: true, irrf: true });
    if (faltas > 0 || dsrDesc > 0) r.memoria.push(`Faltas e DSR: ${reais(Math.round(diaria))} por dia (salário ÷ 30).`);
    const atrasos = mov.atrasosHoras ?? 0;
    if (atrasos > 0) {
        const v = Math.round(salarioHora * atrasos);
        verba({ codigo: 'ATRASO', descricao: 'Faltas e atrasos (horas)', referencia: `${num(atrasos)} h`, tipo: 'desconto', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`Faltas e atrasos: ${num(atrasos)} h × ${reais(Math.round(salarioHora))}/h (salário ÷ ${num(horasMes)} h) = ${reais(v)}.`);
    }
    (mov.lancamentos ?? []).forEach((l, i) => verba({ ...l, codigo: `LAN${i + 1}`, referencia: '', valor: Math.round(l.valor) }));
    const ben = verbasDosBeneficios(e.beneficios, ficha.beneficios, competencia);
    // Sem salário no mês (afastado o mês todo pelo INSS, licença não remunerada): o desconto do benefício deixaria o
    // líquido negativo; fica de fora, com aviso, para ser cobrado à parte.
    if (ben.verbas.length && !diasPagos && !diasMatTotal) r.avisos.push(`Sem salário no mês: ${ben.verbas.map(b => b.descricao).join(', ')} não ${ben.verbas.length > 1 ? 'foram lançados' : 'foi lançado'}. Cobre à parte, se for o caso.`);
    else { ben.verbas.forEach(verba); r.memoria.push(...ben.memoria); }

    // Vale-transporte: desconto de 6% do salário básico do mês (Lei 7.418/1985, art. 4º, parágrafo único;
    // Decreto 10.854/2021, art. 114), sem adicionais; nunca acima do custo do benefício, quando informado.
    if (mov.valeTransporte !== undefined) {
        const v = Math.max(0, Math.round(mov.valeTransporte));
        verba({ codigo: 'VT', descricao: 'Vale-transporte', referencia: '', tipo: 'desconto', valor: v, inss: false, fgts: false, irrf: false });
        if (v) r.memoria.push(`Vale-transporte: ${reais(v)} descontados no mês (informado no movimento).`);
    } else if (d.valeTransporte === 'S') {
        // Dias com deslocamento: os pagos, menos os de afastamento remunerado, os 15 primeiros de doença e as faltas
        // do movimento (Codex #115).
        // Com dias sem deslocamento, conta o menor entre o mês comercial e os dias de calendário que sobram: em fevereiro,
        // o afastamento do mês inteiro (28 datas) deixaria 2 dos 30 comerciais (Codex #115).
        const semDesloc = [...semTransporte].filter(x => dias.get(x) === 'pago').length;
        const comDesloc = semDesloc ? Math.min(diasPagos - semDesloc, realPago - semDesloc) : diasPagos;
        const diasVT = Math.max(0, comDesloc - faltas);
        const base = diasVT === diasPagos ? sal : Math.round(sal * diasVT / Math.max(1, diasPagos));
        const seis = Math.round(base * 6 / 100);
        // O custo da ficha é o do mês inteiro: em mês parcial (admissão, férias, afastamento) vale o dos dias com
        // deslocamento, proporcional ao benefício concedido (Decreto 10.854/2021, art. 115; Codex #115).
        const custoMes = centavosDeTexto(d.valeTransporteCusto ?? '') ?? 0;
        const custo = custoMes > 0 && diasVT < 30 ? Math.round(custoMes * diasVT / 30) : custoMes;
        const v = custo > 0 ? Math.min(seis, custo) : seis;
        verba({ codigo: 'VT', descricao: 'Vale-transporte', referencia: '6%', tipo: 'desconto', valor: v, inss: false, fgts: false, irrf: false });
        r.memoria.push(`Vale-transporte: 6% de ${reais(base)} (salário ${diasVT === diasPagos ? 'do mês' : `de ${num(diasVT)} dia(s) com deslocamento; faltas e afastamento remunerado não contam`}) = ${reais(seis)}${custo > 0 ? `; custo do benefício ${reais(custo)}${custo !== custoMes ? ` (${reais(custoMes)} × ${diasVT}/30 dias)` : ''}${v < seis ? ', que limita o desconto' : ''}` : ' (sem o custo do benefício na ficha: se ele for menor, o desconto é o custo)'}.`);
    }

    // Adiantamento salarial: o percentual da ficha sobre o salário do mês (o IOB calcula assim), ou o valor
    // efetivamente pago, informado no movimento. Pago antes, num demonstrativo próprio do S-1200; aqui, o desconto.
    const pctAd = Number((d.adiantamentoPct ?? '').replace(',', '.')) || 0;
    // Automático só para quem tinha vínculo no dia do adiantamento (dia 20 ou o útil anterior): admitido depois, ou
    // desligado antes, não recebeu (Codex #115). O valor pago num caso desses vai no movimento.
    const diaAdiant = dataSugeridaAdiantamento(competencia);
    const semVinculoNoDia = d.admissao > diaAdiant || (!!deslig && deslig < diaAdiant);
    // O automático é pelo salário do mês como estava no dia do adiantamento: desligamento ou afastamento que começa depois
    // dele não muda o que já foi pago (antes, a rescisão de 27/03 descontava menos que os 40% pagos em 20/03).
    const doFicha = (a: Afastamento) => !a.fichaId || a.fichaId === ficha.id;
    const mudouDepois = (!!deslig && deslig > diaAdiant && deslig < ult) || e.afastamentos.some(a => doFicha(a) && a.dtInicio > diaAdiant && a.dtInicio <= ult);
    const salNoDiaDoAdiantamento = () => {
        const m = new Map<string, Dia>();
        for (let x = de; x <= ult; x = somarDias(x, 1)) m.set(x, 'pago');
        for (const a of e.afastamentos) {
            if (!doFicha(a) || a.dtInicio > diaAdiant || REMUNERADO.includes(a.motivo)) continue;
            const beneficio = DOENCA.includes(a.motivo) ? (a.infoMesmoMtv === 'S' ? a.dtInicio : inicioBeneficio(a)) : null;
            for (let x = a.dtInicio > de ? a.dtInicio : de; x <= (a.dtFim && a.dtFim < ult ? a.dtFim : ult); x = somarDias(x, 1)) {
                if (DOENCA.includes(a.motivo)) { if (beneficio && x >= beneficio) m.set(x, 'naoPago'); }
                else m.set(x, a.motivo === PRORROGACAO ? 'prorrogacao' : MATERNIDADE.includes(a.motivo) ? 'maternidade' : FERIAS.includes(a.motivo) ? 'ferias' : 'naoPago');
            }
        }
        const dp = diasPagosNoMes(m, de === ini, L);
        return dp === 30 ? mensal : Math.round(diaria * dp);
    };
    const baseAdiant = mudouDepois ? salNoDiaDoAdiantamento() : sal;
    const adiant = mov.adiantamento !== undefined ? Math.max(0, Math.round(mov.adiantamento)) : semVinculoNoDia ? 0 : Math.round(baseAdiant * pctAd / 100);
    if (mov.adiantamento !== undefined) r.adiantamentoInformado = true;
    if (pctAd > 0 && mov.adiantamento === undefined && semVinculoNoDia) r.memoria.push(`Adiantamento salarial: sem vínculo em ${brData(diaAdiant)} (dia do adiantamento), não calculado.`);
    if (adiant > 0) {
        verba({ codigo: 'ADIANT', descricao: 'Adiantamento salarial', referencia: mov.adiantamento !== undefined ? '' : `${num(pctAd)}%`, tipo: 'desconto', valor: adiant, inss: false, fgts: false, irrf: false });
        r.memoria.push(mov.adiantamento !== undefined ? `Adiantamento salarial: ${reais(adiant)} pagos no mês (informado no movimento).` : `Adiantamento salarial: ${num(pctAd)}% de ${reais(baseAdiant)} (salário do mês${mudouDepois ? ` como estava em ${brData(diaAdiant)}, dia do adiantamento` : ''}) = ${reais(adiant)}, descontado aqui.`);
    }

    // Férias do mês pagas no recibo: entram nas bases do INSS e do FGTS (não no IRRF, que foi em separado).
    const fm = e.feriasDoMes;
    if (fm && fm.ferias + fm.terco > 0) {
        // Férias e 1/3 em linhas próprias, como no holerite do IOB (no eSocial, naturezas 1016 e 1017).
        verba({ codigo: 'FERMES', descricao: 'Férias do mês (pagas no recibo)', referencia: `${fm.dias} dias`, tipo: 'provento', valor: fm.ferias, inss: true, fgts: true, irrf: false });
        verba({ codigo: 'FERMES13', descricao: '1/3 de férias do mês (pago no recibo)', referencia: '', tipo: 'provento', valor: fm.terco, inss: true, fgts: true, irrf: false });
        // O que o recibo já pagou e reteve (parte desta competência): líquido, INSS e IRRF, como no holerite do IOB.
        const irrfFer = fm.irrf ?? 0;
        verba({ codigo: 'FERPAGO', descricao: 'Líquido das férias pago no recibo', referencia: '', tipo: 'desconto', valor: Math.max(0, fm.ferias + fm.terco - fm.inss - irrfFer), inss: false, fgts: false, irrf: false });
        verba({ codigo: 'INSSFERRET', descricao: 'INSS das férias (retido no recibo)', referencia: '', tipo: 'desconto', valor: fm.inss, inss: false, fgts: false, irrf: false });
        verba({ codigo: 'IRRFFERRET', descricao: 'IRRF das férias (retido no recibo)', referencia: '', tipo: 'desconto', valor: irrfFer, inss: false, fgts: false, irrf: false });
        r.memoria.push(`Férias do mês: ${reais(fm.ferias + fm.terco)} (${fm.dias} dias, pagos no recibo) somados às bases do INSS e do FGTS; o IRRF das férias foi em separado. Saem o líquido pago no recibo e o INSS e o IRRF já retidos nele.`);
    }

    // 5. Bases.
    const soma = (f: (v: Verba) => boolean) => r.verbas.filter(f).reduce((s, v) => s + (v.tipo === 'provento' ? v.valor : -v.valor), 0);
    r.bases.inss = Math.max(0, soma(v => v.inss));
    r.bases.irrf = Math.max(0, soma(v => v.irrf));
    // Adiantamento pago em mês diferente do saldo: foi tributado no mês dele e sai da base da folha (Codex #115; IOB 08/2026).
    const adiantSeparado = adiant > 0 && pagamento !== competencia;
    if (adiantSeparado) {
        r.bases.irrf = Math.max(0, r.bases.irrf - adiant);
        r.memoria.push(`IRRF: o adiantamento de ${reais(adiant)} foi pago em ${rotuloCompetencia(competencia)} e tributado lá; sai dos rendimentos da folha paga em ${rotuloCompetencia(pagamento)}.`);
    }
    const diasFgtsAcidente = Math.min(diasAcidenteInss, Math.max(0, 30 - diasPagos - diasMatTotal));
    const fgtsAcidente = Math.round(diaria * diasFgtsAcidente);
    r.bases.fgts = Math.max(0, soma(v => v.fgts)) + fgtsAcidente;
    if (fgtsAcidente) r.memoria.push(`FGTS sobre ${diasFgtsAcidente} dia(s) de afastamento por acidente do trabalho ou serviço militar: ${reais(fgtsAcidente)} somados à base (Lei 8.036/1990, art. 15, § 5º).`);

    // 6. INSS do segurado (competência).
    const tInss = tabelaVigente(e.tabelas, 'inss', competencia);
    let inss = 0;
    if ('erro' in tInss) erro(tInss.erro);
    else {
        const t = tInss.tabela;
        const teto = t.faixas[t.faixas.length - 1]?.ate ?? r.bases.inss;
        const base = Math.min(r.bases.inss, teto);
        let piso = 0; const partes: string[] = [];
        let total = 0;
        for (const f of t.faixas) {
            if (f.ate === null) break;
            const parte = Math.min(base, f.ate) - piso;
            if (parte <= 0) break;
            total += parte * f.aliquota / 100;
            partes.push(`${reais(parte)} × ${pct(f.aliquota)}`);
            piso = f.ate;
        }
        const inssTotal = Math.round(total);
        const retido = fm?.inss ?? 0;
        inss = Math.max(0, inssTotal - retido);
        verba({ codigo: 'INSS', descricao: 'INSS', referencia: base ? pct(Math.round(inssTotal / base * 10000) / 100) : '', tipo: 'desconto', valor: inss, inss: false, fgts: false, irrf: false });
        r.memoria.push(`INSS (tabela de ${rotuloCompetencia(t.vigencia)}, ${t.norma}): base ${reais(r.bases.inss)}${base < r.bases.inss ? `, limitada ao teto ${reais(base)}` : ''}; ${partes.join(' + ') || 'sem base'} = ${reais(inssTotal)}${retido ? ` − ${reais(retido)} já retidos no recibo de férias = ${reais(inss)}` : ''}.`);
    }

    // 7. Salário-família (competência).
    const filhos = ficha.dependentes.filter(x => x.salarioFamilia === 'S');
    if (filhos.length) {
        const tSf = tabelaVigente(e.tabelas, 'salario_familia', competencia);
        if ('erro' in tSf) r.avisos.push(`Salário-família não calculado: ${tSf.erro}`);
        else {
            const { cotaSalarioFamilia: cota = 0, limiteSalarioFamilia: limite = 0 } = tSf.tabela.valores;
            const comDireito = filhos.filter(x => {
                if (!dataValida(x.nascimento)) { r.avisos.push(`Salário-família: dependente ${x.nome || ''} sem nascimento válido; não contado.`); return false; }
                const quatorze = `${Number(x.nascimento.slice(0, 4)) + 14}${x.nascimento.slice(4, 7)}`;
                return quatorze >= competencia; // devido até o mês em que completa 14 anos
            });
            if (beneficioDeMesAnterior) r.memoria.push('Salário-família: em benefício do INSS desde mês anterior; quem paga é o INSS (Decreto 3.048/1999, art. 82, § 2º).');
            else if (r.bases.inss > limite) r.memoria.push(`Salário-família: remuneração ${reais(r.bases.inss)} acima do limite ${reais(limite)}; sem direito.`);
            else if (comDireito.length) {
                const proporcional = !mesInteiro;
                const v = proporcional ? Math.round(cota * comDireito.length * base30 / 30) : cota * comDireito.length;
                verba({ codigo: 'SF', descricao: 'Salário-família', referencia: `${comDireito.length} cota(s)`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
                r.memoria.push(`Salário-família: ${comDireito.length} × ${reais(cota)}${proporcional ? ` × ${base30}/30 (mês de admissão ou desligamento)` : ''} = ${reais(v)}.`);
                if (filhos.length) r.avisos.push('Salário-família: filho inválido de qualquer idade não é reconhecido pelo cadastro; confira se houver.');
            }
        }
    }

    // 8. Pensão alimentícia (valor fixo da decisão).
    const pensao = Math.round(mov.pensaoAlimenticia ?? 0);
    if (pensao > 0) verba({ codigo: 'PENSAO', descricao: 'Pensão alimentícia', referencia: '', tipo: 'desconto', valor: pensao, inss: false, fgts: false, irrf: false });

    // 9. IRRF (regime de caixa: tabela do mês do pagamento).
    const tIr = tabelaVigente(e.tabelas, 'irrf', pagamento);
    // Quem recebe pensão não deduz também como dependente (Lei 9.250/1995, art. 35, § 4º): a pensão já deduz o valor pago.
    const depsIrrf = ficha.dependentes.filter(x => x.irrf === 'S' && x.pensao !== 'S');
    if (ficha.dependentes.some(x => x.irrf === 'S' && x.pensao === 'S')) r.avisos.push('Dependente marcado no IRRF que também recebe pensão: deduzido só pela pensão. Acerte a ficha (IRRF = Não).');
    const nDep = depsIrrf.length;
    if ('erro' in tIr) erro(`IRRF: ${tIr.erro}`);
    else {
        const t = tIr.tabela;
        const dep = nDep * (t.valores.deducaoDependente ?? 0);
        const legais = inss + dep + pensao;
        r.irrfApurado = { rendimentos: r.bases.irrf, deducoesLegais: legais, valor: 0 };
        // Pago no próprio mês, com a folha anterior paga nele (rescisão de quem recebe no mês seguinte): o IRRF é do mês
        // inteiro (RIR/1999, art. 621), sobre a folha anterior + este pagamento, menos o que a folha anterior e o
        // adiantamento do dia 20 já retiveram. Os dependentes contam uma vez (já estão nas deduções da folha anterior).
        const entradaMes = pagamento === competencia ? e.folhaPagaAntesNoMes : null;
        if (entradaMes && 'pendente' in entradaMes) incompleto(`IRRF: a folha anterior foi paga em ${rotuloCompetencia(pagamento)}, o mesmo mês deste pagamento, e o imposto soma as duas (${entradaMes.pendente}).`);
        const antMes = entradaMes && !('pendente' in entradaMes) ? entradaMes : null;
        const retidoAdiant = antMes && adiant > 0 ? (() => { const v = Math.max(0, apurarIrrf(t, antMes.rendimentos + adiant, antMes.deducoesLegais).valor - antMes.valor); return v <= IRRF_MINIMO ? 0 : v; })() : 0;
        if (r.bases.irrf > 0 && antMes) {
            const R = antMes.rendimentos + r.bases.irrf;
            const L2 = antMes.deducoesLegais + inss + pensao;
            const a = apurarIrrf(t, R, L2);
            let ir = Math.max(0, a.valor - antMes.valor - retidoAdiant);
            r.deducoesIrrf = { simplificado: a.simplificado, dependentes: depsIrrf.map(x => ({ cpf: x.cpf, nome: x.nome })), porDependente: t.valores.deducaoDependente ?? 0, pensao };
            r.memoria.push(`IRRF do mês (pagamento em ${rotuloCompetencia(pagamento)}, tabela de ${rotuloCompetencia(t.vigencia)}): folha de ${rotuloCompetencia(antMes.competencia)} paga no mês ${reais(antMes.rendimentos)} + este pagamento ${reais(r.bases.irrf)} = ${reais(R)}; `
                + `${a.simplificado ? `desconto simplificado ${reais(a.deducao)}` : `deduções legais ${reais(L2)}`}; base ${reais(a.base)} × ${pct(a.aliquota)} − ${reais(a.deducaoFaixa)} = ${reais(a.bruto)}`
                + `${a.memoriaRedutor.length ? ` (${a.memoriaRedutor.join(' ')})` : ''}; menos ${reais(antMes.valor)} retidos na folha anterior${retidoAdiant ? ` e ${reais(retidoAdiant)} no adiantamento` : ''} = ${reais(ir)}.`);
            if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
            r.irrfApurado.valor = ir;
            verba({ codigo: 'IRRF', descricao: 'IRRF', referencia: a.aliquota ? pct(a.aliquota) : '', tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
        } else if (r.bases.irrf > 0) {
            const a = apurarIrrf(t, r.bases.irrf, legais);
            r.deducoesIrrf = { simplificado: a.simplificado, dependentes: depsIrrf.map(x => ({ cpf: x.cpf, nome: x.nome })), porDependente: t.valores.deducaoDependente ?? 0, pensao };
            r.memoria.push(`IRRF (pagamento em ${rotuloCompetencia(pagamento)}, tabela de ${rotuloCompetencia(t.vigencia)}, ${t.norma}): rendimentos ${reais(r.bases.irrf)}; `
                + (a.simplificado ? `desconto simplificado ${reais(a.deducao)} (maior que as deduções legais de ${reais(legais)})` : `deduções legais ${reais(legais)} (INSS ${reais(inss)}${nDep ? ` + ${nDep} dependente(s) ${reais(dep)}` : ''}${pensao ? ` + pensão ${reais(pensao)}` : ''})`)
                + `; base ${reais(a.base)} × ${pct(a.aliquota)} − ${reais(a.deducaoFaixa)} = ${reais(a.bruto)}.`, ...a.memoriaRedutor);
            let ir = a.valor;
            if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
            r.irrfApurado.valor = ir;
            verba({ codigo: 'IRRF', descricao: 'IRRF', referencia: a.aliquota ? pct(a.aliquota) : '', tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
        }
    }

    // 9a. IRRF do adiantamento pago num mês com o saldo da folha em outro: regime de caixa no mês do adiantamento,
    // sobre tudo o que foi pago no mês (a folha anterior, paga nele, e o adiantamento), menos o que a folha anterior
    // já reteve (RIR/1999, art. 621). Conferido com o IOB (08/2026). Sai do valor pago no adiantamento, não da folha.
    if (adiantSeparado) {
        const entrada = e.folhaPagaNoAdiantamento;
        const pendente = entrada === undefined ? 'movimentos gravados ainda não carregados' : entrada && 'pendente' in entrada ? entrada.pendente : '';
        const ant = entrada && !('pendente' in entrada) ? entrada : null;
        const tA = tabelaVigente(e.tabelas, 'irrf', competencia);
        if (pendente) {
            r.avisos.push(`IRRF do adiantamento (pago em ${rotuloCompetencia(competencia)}, saldo em ${rotuloCompetencia(pagamento)}): falta a folha paga em ${rotuloCompetencia(competencia)}, antes dele, para calcular (${pendente}). Confira o IRRF.`);
            if (r.situacao === 'calculado') { r.situacao = 'incompleto'; r.soFaltaFolhaDoAdiantamento = true; }
        } else if ('erro' in tA) erro(`IRRF do adiantamento: ${tA.erro}`);
        else {
            // Sem folha paga antes no mês (admissão, mudança de regime): o adiantamento é o primeiro pagamento, e os
            // dependentes deduzem dele (Codex #118); INSS e pensão não há.
            const pagos = ant ?? { rendimentos: 0, deducoesLegais: nDep * (tA.tabela.valores.deducaoDependente ?? 0), valor: 0, competencia: '' };
            const R = pagos.rendimentos + adiant;
            const a = apurarIrrf(tA.tabela, R, pagos.deducoesLegais);
            let ir = Math.max(0, a.valor - pagos.valor);
            r.memoria.push(`IRRF do adiantamento (pago em ${rotuloCompetencia(competencia)}, tabela de ${rotuloCompetencia(tA.tabela.vigencia)}): `
                + (ant ? `rendimentos pagos no mês ${reais(pagos.rendimentos)} (folha de ${rotuloCompetencia(ant.competencia)}) + adiantamento ${reais(adiant)} = ${reais(R)}` : `adiantamento ${reais(adiant)} (nenhuma folha paga antes no mês${nDep ? `; ${nDep} dependente(s)` : ''})`)
                + `; ${a.simplificado ? `desconto simplificado ${reais(a.deducao)}` : `deduções legais ${reais(pagos.deducoesLegais)}`}; base ${reais(a.base)} × ${pct(a.aliquota)} − ${reais(a.deducaoFaixa)} = ${reais(a.bruto)}`
                + `${a.memoriaRedutor.length ? ` (${a.memoriaRedutor.join(' ')})` : ''}; menos ${reais(pagos.valor)} já retidos = ${reais(ir)}.`);
            if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF do adiantamento de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
            r.irrfAdiantamento = ir;
            r.irrfAdiantamentoApuracao = { rendimentos: pagos.rendimentos, deducoesLegais: pagos.deducoesLegais, jaRetido: pagos.valor, adiantamento: adiant, dependentes: nDep * (tA.tabela.valores.deducaoDependente ?? 0) };
            if (ant) r.irrfAdiantamentoFolha = ant.competencia;
            else if (!a.simplificado && nDep) r.deducoesAdiantamento = { dependentes: depsIrrf.map(x => ({ cpf: x.cpf, nome: x.nome })), porDependente: tA.tabela.valores.deducaoDependente ?? 0 };
        }
    }

    // 10. FGTS e totais.
    const aliqFgts = aprendiz ? ALIQUOTA_FGTS_APRENDIZ : ALIQUOTA_FGTS;
    r.fgts = Math.round(r.bases.fgts * aliqFgts / 100);
    r.memoria.push(`FGTS: ${reais(r.bases.fgts)} × ${aliqFgts}% = ${reais(r.fgts)}${aprendiz ? ' (aprendiz)' : ''}.`);
    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    if (r.totais.liquido < 0) r.avisos.push('Líquido negativo: confira os descontos.');
    return r;
}

/** Horas extras com outros adicionais (percentual, horas), em ordem; 50% e 100% têm campos próprios. */
export function outrasHorasExtras(mov: Pick<Movimento, 'horasExtrasPct'>): [number, number][] {
    return Object.entries(mov.horasExtrasPct ?? {}).map(([p, h]) => [Number(p), Number(h)] as [number, number])
        .filter(([p, h]) => p > 0 && p !== 50 && p !== 100 && h > 0).sort((a, b) => a[0] - b[0]);
}

/** Valor das horas extras do mês (50%, 100% e os outros adicionais) pelo salário-hora dado, sem o DSR: base das médias. */
export function valorHorasExtras(salarioHora: number, mov: Movimento): { valor: number; horas: number } {
    let valor = Math.round(salarioHora * 1.5 * (mov.horasExtras50 ?? 0)) + Math.round(salarioHora * 2 * (mov.horasExtras100 ?? 0));
    let horas = (mov.horasExtras50 ?? 0) + (mov.horasExtras100 ?? 0);
    for (const [p, h] of outrasHorasExtras(mov)) { valor += Math.round(salarioHora * (1 + p / 100) * h); horas += h; }
    return { valor, horas };
}

/**
 * Variáveis do mês para as médias de férias, 13º e rescisão, pelo salário-hora dado: horas extras com o DSR
 * e os lançamentos que entram na média (comissões, adicional noturno, gratificações habituais…).
 */
export function variaveisDoMes(salarioHora: number, mov: Movimento, competencia: string): { horasExtras: number; horas: number; outras: number } {
    const { valor: he, horas } = valorHorasExtras(salarioHora, mov);
    let horasExtras = 0;
    if (he) { const { uteis, descanso } = diasDsr(competencia, mov.feriadosLocais); horasExtras = he + Math.round(he / uteis * descanso); }
    const outras = (mov.lancamentos ?? []).filter(entraNaMedia).reduce((s, l) => s + (l.tipo === 'provento' ? l.valor : -l.valor), 0);
    return { horasExtras, horas, outras: Math.max(0, outras) };
}

/** Média das variáveis nos meses dados, dividida pelo divisor, com a memória do cálculo. */
export function mediaDasVariaveis(salarioHora: number, movimentos: Record<string, Movimento>, comps: string[], divisor: number, rotuloDivisor: string): { media: number; horasExtras: number; outras: number; horas: number; memoria: string[] } {
    let horasExtras = 0; let outras = 0; let horas = 0;
    for (const c of comps) {
        const mov = movimentos[c]; if (!mov) continue;
        const v = variaveisDoMes(salarioHora, mov, c);
        horasExtras += v.horasExtras; outras += v.outras; horas += v.horas;
    }
    const d = Math.max(1, divisor);
    const media = Math.round((horasExtras + outras) / d);
    const memoria: string[] = [];
    const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (horasExtras && !outras) memoria.push(`Média de horas extras com DSR: ${brl(horasExtras)}${horas ? ` em ${horas.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} h` : ''} ÷ ${rotuloDivisor} = ${brl(media)} (hora atual ${brl(Math.round(salarioHora))}).`);
    else if (outras) memoria.push(`Média das variáveis: ${horasExtras ? `horas extras com DSR ${brl(horasExtras)} + ` : ''}lançamentos que entram na média (comissões, adicionais…) ${brl(outras)} = ${brl(horasExtras + outras)} ÷ ${rotuloDivisor} = ${brl(media)}.`);
    return { media, horasExtras, outras, horas, memoria };
}

/** Data sugerida do adiantamento: dia 20 da competência, ou o dia útil anterior (20/09/2026 caiu num domingo e o IOB pagou em 18/09). */
export const dataSugeridaAdiantamento = (competencia: string) => (/^\d{4}-\d{2}$/.test(competencia) ? diaUtilAnterior(`${competencia}-20`) : '');

/** Adiantamento salarial do mês (desconto ADIANT da folha): o que foi pago antes, no demonstrativo próprio. */
export const adiantamentoDoMes = (r: Pick<ResultadoCalculo, 'verbas'>) => r.verbas.find(v => v.codigo === 'ADIANT')?.valor ?? 0;

/**
 * Mais de um contrato no mesmo CPF com IRRF do adiantamento: o imposto do mês é do CPF (a tabela e as deduções
 * valem uma vez para tudo o que foi pago), e cada contrato é calculado sozinho. Até o motor somar os contratos,
 * esses ficam incompletos, com aviso (Codex #118). Da competência, conta o contrato com pagamento no mês: o
 * adiantamento ou a rescisão de um desligamento no mês até a data sugerida do adiantamento (um contrato admitido ou
 * desligado depois dela não paga nada antes do adiantamento). A data em que a rescisão foi paga não fica gravada no
 * Consultor: desligado antes do adiantamento, conta, e o aviso manda conferir. `pagosNoMes`: contratos da competência anterior com folha paga no mês do adiantamento (um contrato
 * encerrado no mês passado também entra na conta do CPF); quem filtra é a tela, pelo valor pago (Codex #118).
 */
export function travarAdiantamentoEntreContratos<R extends ResultadoCalculo>(resultados: R[], fichas: (Pick<FichaFuncionario, 'id' | 'cpf' | 'dados'> & Partial<Pick<FichaFuncionario, 'dependentes'>>)[], pagosNoMes: Pick<FichaFuncionario, 'id' | 'cpf'>[] = [],
    soma?: { tabelas: TabelaLegal[]; folhaPaga: (fichaId: string) => (IrrfApurado & { competencia: string }) | { pendente: string } | null | undefined }): R[] {
    const cpfDe = new Map(fichas.map(f => [f.id, f.cpf.replace(/\D/g, '')]));
    const desligadoNoMes = new Map(fichas.map(f => [f.id, f.dados.dataDesligamento ?? '']));
    const contratosDoCpf = new Map<string, Set<string>>();
    const somar = (id: string, cpf: string | undefined) => { if (cpf) contratosDoCpf.set(cpf, (contratosDoCpf.get(cpf) ?? new Set()).add(id)); };
    for (const r of resultados) {
        const deslig = desligadoNoMes.get(r.fichaId) ?? '';
        if (adiantamentoDoMes(r) > 0 || (deslig.startsWith(r.competencia) && deslig <= dataSugeridaAdiantamento(r.competencia))) somar(r.fichaId, cpfDe.get(r.fichaId));
    }
    for (const f of pagosNoMes) somar(f.id, f.cpf.replace(/\D/g, ''));
    const porCpf = new Map([...contratosDoCpf].map(([c, ids]) => [c, ids.size]));
    // Somar os contratos: o IRRF do mês é de tudo o que foi pago ao CPF (RIR/1999, art. 621). Precisa da apuração de
    // cada contrato com adiantamento e da folha paga no mês dos que só têm ela; com rescisão no mês, ou o que faltar,
    // continua travado (a data em que a rescisão foi paga não fica gravada).
    const somados = new Map<string, Map<string, { valor: number; memoria: string }>>();
    if (soma) for (const [c, ids] of contratosDoCpf) {
        if (ids.size < 2) continue;
        const doCpf = resultados.filter(r => ids.has(r.fichaId));
        const comAdiant = doCpf.filter(r => adiantamentoDoMes(r) > 0);
        if (comAdiant.some(r => !r.irrfAdiantamentoApuracao || r.situacao === 'erro')) continue;
        if (doCpf.some(r => { const dl = desligadoNoMes.get(r.fichaId) ?? ''; return dl.startsWith(r.competencia) && dl <= dataSugeridaAdiantamento(r.competencia); })) continue;
        const comp = comAdiant[0]?.competencia; if (!comp) continue;
        const t = tabelaVigente(soma.tabelas, 'irrf', comp); if ('erro' in t) continue;
        const ded = t.tabela.valores.deducaoDependente ?? 0;
        // Só a folha paga no mês (contrato da competência anterior que não tem adiantamento agora).
        const so = [...ids].filter(id => !comAdiant.some(r => r.fichaId === id)).map(id => ({ id, f: fichas.find(x => x.id === id), a: soma.folhaPaga(id) }));
        if (so.some(x => x.a === undefined || (x.a && 'pendente' in x.a))) continue;
        const partes = [...comAdiant.map(r => ({ ...r.irrfAdiantamentoApuracao! })),
            ...so.filter(x => x.a).map(x => { const a = x.a as IrrfApurado; const dep = ded * (x.f?.dependentes?.filter(d => d.irrf === 'S' && d.pensao !== 'S').length ?? 0);
                return { rendimentos: a.rendimentos, deducoesLegais: a.deducoesLegais, jaRetido: a.valor, adiantamento: 0, dependentes: Math.min(dep, a.deducoesLegais) }; })];
        const R = partes.reduce((s, p) => s + p.rendimentos + p.adiantamento, 0);
        // Dependentes uma vez só: cada contrato os deduziu na sua folha.
        const L = partes.reduce((s, p) => s + p.deducoesLegais - p.dependentes, 0) + Math.max(0, ...partes.map(p => p.dependentes));
        const retido = partes.reduce((s, p) => s + p.jaRetido, 0);
        const a = apurarIrrf(t.tabela, R, L);
        let ir = Math.max(0, a.valor - retido);
        if (ir > 0 && ir <= IRRF_MINIMO) ir = 0;
        // Cada contrato retém a parte proporcional ao seu adiantamento (o último leva o arredondamento).
        const totalAdiant = comAdiant.reduce((s, r) => s + adiantamentoDoMes(r), 0);
        const m = new Map<string, { valor: number; memoria: string }>(); let resto = ir;
        comAdiant.forEach((r, i) => {
            const v = i === comAdiant.length - 1 ? resto : Math.round(ir * adiantamentoDoMes(r) / Math.max(1, totalAdiant)); resto -= v;
            m.set(r.fichaId, { valor: v, memoria: `IRRF do adiantamento somando os ${ids.size} contratos do CPF (RIR/1999, art. 621): pagos no mês ${reais(R)}; `
                + `${a.simplificado ? `desconto simplificado ${reais(a.deducao)}` : `deduções legais ${reais(L)} (dependentes uma vez)`}; IRRF do mês ${reais(a.valor)} − ${reais(retido)} já retidos = ${reais(ir)}${ir === 0 && a.valor - retido > 0 ? ' (até R$ 10,00, dispensado)' : ''}; `
                + `este contrato retém ${reais(v)} (proporcional ao adiantamento de ${reais(adiantamentoDoMes(r))}).` });
        });
        somados.set(c, m);
    }
    return resultados.map(r => {
        const c = cpfDe.get(r.fichaId);
        const s = c ? somados.get(c) : undefined;
        if (s && r.irrfAdiantamento !== undefined) {
            const x = s.get(r.fichaId);
            if (x) return { ...r, irrfAdiantamento: x.valor, irrfAdiantamentoCpf: true, memoria: [...r.memoria, x.memoria] };
        }
        if (s) return r;
        if (!c || (porCpf.get(c) ?? 0) < 2 || r.irrfAdiantamento === undefined || r.situacao === 'erro') return r;
        // O IRRF por contrato está errado: sai do resultado, para não ir ao resumo nem ao lembrete do DARF (Codex #118).
        return { ...r, situacao: 'incompleto', irrfAdiantamento: undefined, irrfAdiantamentoFolha: undefined, deducoesAdiantamento: undefined, avisos: [...r.avisos, 'IRRF do adiantamento com mais de um contrato no CPF: o imposto do mês é de tudo o que foi pago ao CPF, e o Consultor ainda calcula cada contrato sozinho. Confira pelo IOB (um contrato desligado no mês conta pela rescisão, que pode ter sido paga antes do adiantamento).'] };
    });
}

/**
 * IRRF pela tabela progressiva: o maior entre as deduções legais e o desconto simplificado, a faixa e o redutor
 * (Lei 15.270/2025) sobre os rendimentos. Sem a dispensa de R$ 10,00, que é de cada retenção.
 */
export function apurarIrrf(t: TabelaLegal, rendimentos: number, legais: number) {
    const v = t.valores;
    const simplificadoValor = v.descontoSimplificado ?? 0;
    const simplificado = simplificadoValor > legais;
    const deducao = simplificado ? simplificadoValor : legais;
    const base = Math.max(0, rendimentos - deducao);
    const faixa = t.faixas.find(f => f.ate === null || base <= f.ate) ?? t.faixas[t.faixas.length - 1];
    const bruto = Math.max(0, Math.round(base * faixa.aliquota / 100) - faixa.deducao);
    let valor = bruto;
    const memoriaRedutor: string[] = [];
    if (bruto > 0 && v.redutorAte && v.redutorMaximo && v.redutorLimite && v.redutorConstante && v.redutorCoeficiente) {
        let red = 0;
        if (rendimentos <= v.redutorAte) red = Math.min(bruto, v.redutorMaximo);
        else if (rendimentos <= v.redutorLimite) red = Math.min(bruto, Math.max(0, v.redutorConstante - Math.round(rendimentos * v.redutorCoeficiente / 1_000_000)));
        if (red) {
            valor -= red;
            memoriaRedutor.push(rendimentos <= v.redutorAte
                ? `Redutor: rendimentos até ${reais(v.redutorAte)}; redução de ${reais(red)} (até ${reais(v.redutorMaximo)}). IRRF ${reais(valor)}.`
                : `Redutor: ${reais(v.redutorConstante)} − ${(v.redutorCoeficiente / 1_000_000).toFixed(6).replace('.', ',')} × ${reais(rendimentos)} = ${reais(red)}. IRRF ${reais(valor)}.`);
        }
    }
    return { simplificado, deducao, base, aliquota: faixa.aliquota, deducaoFaixa: faixa.deducao, bruto, valor, memoriaRedutor };
}

/** Funcionários com vínculo em algum dia da competência. */
export function noMes(fichas: FichaFuncionario[], competencia: string): FichaFuncionario[] {
    const ini = `${competencia}-01`; const ult = ultimoDia(competencia);
    return fichas.filter(f => (f.dados.admissao ?? '') <= ult && !!f.dados.admissao && (!f.dados.dataDesligamento || f.dados.dataDesligamento >= ini));
}
