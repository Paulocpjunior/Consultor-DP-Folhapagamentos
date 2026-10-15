// services/calculo/intermitente.ts
//
// Trabalho intermitente (CLT, art. 452-A, incluído pela Lei 13.467/2017; Portaria MTP 671/2021): o empregado (categoria
// 111 do eSocial) só trabalha quando convocado e recebe por convocação.
//
// Convocação (art. 452-A):
//   - com pelo menos 3 dias corridos de antecedência, informando a jornada (§ 1º);
//   - o empregado tem 1 dia útil para responder; o silêncio é recusa (§ 2º), e a recusa não descaracteriza a
//     subordinação (§ 3º);
//   - o valor da hora não pode ser menor que o do salário mínimo nem que o dos demais empregados da mesma função (caput);
//   - a cada 12 meses, o empregado tem direito a 1 mês de férias, em que não pode ser convocado pelo mesmo empregador (§ 9º).
// Pagamento, ao fim de cada período de prestação de serviço e nunca por período maior que um mês (§ 6º; Portaria MTP
// 671/2021): a remuneração, o repouso semanal remunerado, os adicionais legais, as férias proporcionais com 1/3 e o 13º
// proporcional, discriminados no recibo (§ 7º). INSS e FGTS sobre os valores pagos no mês (§ 8º).
//
// Como o Consultor calcula (a folha mensal paga as horas trabalhadas na competência):
//   - remuneração = horas × valor da hora (o da convocação ou, sem ele, o da ficha);
//   - DSR, por convocação: remuneração ÷ dias úteis do período convocado × domingos e feriados dele (Lei 605/1949);
//   - adicional de insalubridade ou periculosidade da ficha, proporcional às horas (horas ÷ horas do mês da ficha);
//   - férias proporcionais = 1/12 da remuneração do mês (horas, DSR, adicionais, horas extras), mais 1/3;
//     13º proporcional = 1/12 da mesma remuneração;
//   - INSS: remuneração, DSR, adicionais, férias e 1/3 juntos (base mensal); o 13º em separado (Lei 8.212/1991, art. 28,
//     § 7º);
//   - IRRF (tabela do mês do pagamento): a remuneração na tabela mensal; as férias com 1/3 em separado (IN SRF 15/2001,
//     art. 13); o 13º em separado, tributação exclusiva (Lei 7.713/1988, art. 26);
//   - FGTS de 8% sobre tudo (Lei 8.036/1990, art. 15).
// Incidências sobre as férias do intermitente: a Receita entende que as férias com 1/3 pagas a cada convocação integram a
// base da contribuição, salvo quando indenizadas (Solução de Consulta Cosit 17/2019; IN RFB 2.110/2022), e o Consultor as
// trata assim (INSS e FGTS). O aviso no cálculo pede para conferir as rubricas do S-1010 com a contabilidade.

import { centavosDeTexto, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente } from '../cadastros/tabelasLegais';
import { fichaNaCompetencia, type FichaFuncionario } from '../cadastros/funcionarios';
import { diaSemana, diasEntre, feriado, quintoDiaUtilSalario, somarDias, somarMeses } from '../prazos/calendario';
import { adicionalDeRisco } from './adicionais';
import { inssDetalhado, irrfDetalhado } from './tributos';
import type { EntradaCalculo, Lancamento, Movimento, ResultadoCalculo, Verba } from './motorMensal';

export const CATEGORIA_INTERMITENTE = '111';
const competenciaSeguinteDe = (c: string) => somarMeses(`${c}-01`, 1).slice(0, 7);
export const ehIntermitente = (f: Pick<FichaFuncionario, 'dados'>) => f.dados.categoria === CATEGORIA_INTERMITENTE;

/** Um dia convocado e as horas (decimal: 7,5 = 7h30). */
export interface DiaConvocado { data: string; horas: number }
export type RespostaConvocacao = 'pendente' | 'aceita' | 'recusada';
export const ROTULO_RESPOSTA: Record<RespostaConvocacao, string> = { pendente: 'Aguardando resposta', aceita: 'Aceita', recusada: 'Recusada' };

export interface Convocacao {
    id: string;
    empresaId: string;
    fichaId: string;
    /** Dia em que a convocação foi enviada ao empregado (AAAA-MM-DD). */
    enviadaEm: string;
    resposta: RespostaConvocacao;
    respondidaEm: string;
    /** Função e local do serviço (vão no aviso de convocação). */
    funcao: string;
    local: string;
    /** Valor da hora em centavos; 0 = o da ficha. */
    valorHora: number;
    /** Dias e horas: os convocados; depois do serviço, os efetivamente trabalhados. */
    dias: DiaConvocado[];
    obs: string;
    atualizadoPor?: string;
    /** Código da convocação na empresa (sequencial, como o do SAGE). */
    codigo?: number;
    /** Data do pagamento (AAAA-MM-DD): recibo e demonstrativo próprios; vazio = paga com a folha do mês. */
    dataPagamento?: string;
    /** Jornada da convocação (texto: horário e intervalo), como no Cadastro de Convocação do SAGE. */
    jornada?: string;
    /** Eventos digitados na convocação (Digitação de Eventos para Trabalho Intermitente do SAGE). */
    eventos?: Lancamento[];
}

export const convocacaoVazia = (empresaId: string, fichaId: string, id: string): Convocacao => ({
    id, empresaId, fichaId, enviadaEm: '', resposta: 'pendente', respondidaEm: '', funcao: '', local: '', valorHora: 0, dias: [], obs: '',
});

const data = /^\d{4}-\d{2}-\d{2}$/;
const brData = (d: string) => d.split('-').reverse().join('/');
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const ehUtil = (d: string) => diaSemana(d) !== 0 && diaSemana(d) !== 6 && !feriado(d);
/** Próximo dia útil depois de `d` (sábado, domingo e feriado nacional não contam). */
function diaUtilSeguinte(d: string): string {
    let x = somarDias(d, 1);
    while (!ehUtil(x)) x = somarDias(x, 1);
    return x;
}

/** Dias do período nos dias da semana escolhidos (0 = domingo … 6 = sábado), com as mesmas horas em cada um. */
export function diasDoPeriodo(inicio: string, fim: string, diasDaSemana: number[], horas: number): DiaConvocado[] {
    if (!data.test(inicio) || !data.test(fim) || fim < inicio || diasEntre(inicio, fim) > 366) return [];
    const out: DiaConvocado[] = [];
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (diasDaSemana.includes(diaSemana(d))) out.push({ data: d, horas });
    return out;
}

export const inicioDe = (c: Pick<Convocacao, 'dias'>) => c.dias.map(x => x.data).sort()[0] ?? '';
export const fimDe = (c: Pick<Convocacao, 'dias'>) => c.dias.map(x => x.data).sort().at(-1) ?? '';
export const horasDe = (c: Pick<Convocacao, 'dias'>) => c.dias.reduce((s, x) => s + x.horas, 0);

/** Horas do mês da ficha (o divisor): as informadas, as semanais × 5 ou 220. */
export function horasMesDaFicha(d: FichaFuncionario['dados']): number {
    const informadas = Number((d.horasMes ?? '').replace(',', '.'));
    const semanais = Number((d.horasSemanais ?? '').replace(',', '.'));
    return informadas >= 1 && informadas <= 300 ? informadas : semanais > 0 ? semanais * 5 : 220;
}

/** Valor da hora pela ficha: o salário por hora; por dia ou por mês, dividido pelas horas (centavos). */
export function valorHoraDaFicha(d: FichaFuncionario['dados']): number {
    const contratual = centavosDeTexto(d.salario ?? '') ?? 0;
    if (!contratual) return 0;
    const horasMes = horasMesDaFicha(d);
    const unidade = d.unidadeSalario || '1';
    if (unidade === '1') return contratual;
    if (unidade === '2') return Math.round(contratual / (horasMes / 30));
    return Math.round(contratual / horasMes);
}

export interface Validacao { erros: string[]; avisos: string[] }

/**
 * Convocação: datas, horas, prazos do art. 452-A e conflito com outra convocação ou com as férias do intermitente.
 * `outras`: as demais convocações do empregado; `feriasGozo`: períodos de férias (afastamento 15) do empregado;
 * `valorHoraMinimo`: o salário mínimo-hora vigente (centavos), quando conhecido.
 */
export function validarConvocacao(c: Convocacao, ficha: FichaFuncionario, p: { outras?: Convocacao[]; feriasGozo?: { inicio: string; fim: string }[]; valorHoraMinimo?: number; valorHoraFicha?: number } = {}): Validacao {
    const erros: string[] = []; const avisos: string[] = [];
    if (!ehIntermitente(ficha)) erros.push('A ficha não é de intermitente (categoria 111 do eSocial).');
    if (!c.dias.length) erros.push('Informe os dias e as horas da convocação.');
    const vistos = new Set<string>();
    for (const d of c.dias) {
        if (!data.test(d.data)) { erros.push(`Data inválida: ${d.data || '(vazia)'}.`); continue; }
        if (vistos.has(d.data)) erros.push(`${brData(d.data)} repetido na convocação.`);
        vistos.add(d.data);
        if (!(d.horas > 0) || d.horas > 24) erros.push(`${brData(d.data)}: horas entre 0 e 24.`);
        else if (d.horas > 10) avisos.push(`${brData(d.data)}: ${num(d.horas)} h passam de 10 h no dia (8 h + 2 h extras; CLT, art. 59).`);
        if (ficha.dados.admissao && d.data < ficha.dados.admissao) erros.push(`${brData(d.data)}: antes da admissão (${brData(ficha.dados.admissao)}).`);
        if (ficha.dados.dataDesligamento && d.data > ficha.dados.dataDesligamento) erros.push(`${brData(d.data)}: depois do desligamento (${brData(ficha.dados.dataDesligamento)}).`);
        for (const f of p.feriasGozo ?? []) if (d.data >= f.inicio && d.data <= (f.fim || f.inicio))
            erros.push(`${brData(d.data)}: o empregado está de férias (${brData(f.inicio)} a ${brData(f.fim || f.inicio)}) e não pode ser convocado (art. 452-A, § 9º).`);
    }
    for (const o of p.outras ?? []) {
        if (o.id === c.id || o.resposta === 'recusada') continue;
        const comuns = o.dias.filter(x => vistos.has(x.data)).map(x => brData(x.data));
        if (comuns.length) erros.push(`Dia(s) ${comuns.join(', ')} já em outra convocação.`);
    }
    if (c.valorHora < 0) erros.push('Valor da hora não pode ser negativo.');
    const fim = fimDe(c);
    if (c.dataPagamento) {
        if (!data.test(c.dataPagamento)) erros.push('Data do pagamento inválida.');
        else if (fim && c.dataPagamento < fim) erros.push(`Pagamento em ${brData(c.dataPagamento)}, antes do fim da convocação (${brData(fim)}): o intermitente recebe ao fim do período de prestação de serviço (art. 452-A, § 6º).`);
        else if (fim) {
            const [a, m] = somarMeses(`${fim.slice(0, 7)}-01`, 1).slice(0, 7).split('-').map(Number);
            const limite = quintoDiaUtilSalario(a, m);
            if (c.dataPagamento > limite) avisos.push(`Pagamento em ${brData(c.dataPagamento)}, depois do 5º dia útil do mês seguinte ao serviço (${brData(limite)}; CLT, art. 459, § 1º).`);
        }
    }
    (c.eventos ?? []).forEach((ev, i) => {
        if (!ev.descricao.trim()) erros.push(`Evento ${i + 1} da convocação sem descrição.`);
        if (!(ev.valor > 0)) erros.push(`Evento ${i + 1} da convocação sem valor.`);
    });
    const vh = c.valorHora > 0 ? c.valorHora : p.valorHoraFicha ?? 0;
    if (!vh) erros.push('Sem valor da hora: informe na convocação ou o salário na ficha.');
    else if (p.valorHoraMinimo && vh < p.valorHoraMinimo) erros.push(`Valor da hora ${reais(vh)} abaixo do salário mínimo-hora (${reais(p.valorHoraMinimo)}; art. 452-A, caput).`);
    const ini = inicioDe(c);
    if (!data.test(c.enviadaEm)) erros.push('Informe a data em que a convocação foi enviada.');
    else if (ini && c.enviadaEm > ini) erros.push('A convocação foi enviada depois do início do serviço.');
    else if (ini && diasEntre(c.enviadaEm, ini) < 3) avisos.push(`Convocação com ${diasEntre(c.enviadaEm, ini)} dia(s) de antecedência: a CLT pede pelo menos 3 dias corridos (art. 452-A, § 1º).`);
    if (c.resposta !== 'pendente') {
        if (!data.test(c.respondidaEm)) erros.push('Informe a data da resposta do empregado.');
        else if (data.test(c.enviadaEm) && c.respondidaEm < c.enviadaEm) erros.push('A resposta é anterior ao envio da convocação.');
        else if (c.resposta === 'aceita' && data.test(c.enviadaEm) && c.respondidaEm > diaUtilSeguinte(c.enviadaEm))
            avisos.push(`Aceite em ${brData(c.respondidaEm)}, depois de 1 dia útil do envio (até ${brData(diaUtilSeguinte(c.enviadaEm))}): pela CLT o silêncio é recusa (art. 452-A, § 2º). Guarde o aceite por escrito.`);
    }
    return { erros, avisos };
}

/** Períodos aquisitivos de férias do intermitente: a cada 12 meses, 1 mês sem convocação nos 12 meses seguintes (§ 9º). */
export function periodosDeFerias(admissao: string, ate: string): { aquisitivo: [string, string]; concederAte: string }[] {
    if (!data.test(admissao) || !data.test(ate)) return [];
    const out: { aquisitivo: [string, string]; concederAte: string }[] = [];
    const mais = (d: string, anos: number) => { const [a, m, dd] = d.split('-'); return `${Number(a) + anos}-${m}-${dd === '29' && m === '02' ? '28' : dd}`; };
    for (let i = 0; i < 60; i++) {
        const ini = mais(admissao, i); const fim = somarDias(mais(admissao, i + 1), -1);
        if (fim > ate) break;
        out.push({ aquisitivo: [ini, fim], concederAte: somarDias(mais(admissao, i + 2), -1) });
    }
    return out;
}

/** Dias trabalhados na competência (convocações aceitas), com o valor da hora de cada um. */
export function diasNaCompetencia(convocacoes: Convocacao[], fichaId: string, competencia: string): { convocacao: Convocacao; dias: DiaConvocado[] }[] {
    return convocacoes.filter(c => c.fichaId === fichaId && c.resposta === 'aceita')
        .map(c => ({ convocacao: c, dias: c.dias.filter(d => d.data.slice(0, 7) === competencia && d.horas > 0).sort((a, b) => a.data.localeCompare(b.data)) }))
        .filter(x => x.dias.length);
}

/**
 * Folha mensal do intermitente: as convocações aceitas com dias na competência. Chamada pelo motor mensal
 * (calcularMensal) para a categoria 111; usa o mesmo resultado (verbas, bases, totais) e grava os dias trabalhados
 * para o S-1200 (infoInterm).
 */
export function calcularIntermitente(e: EntradaCalculo, r: ResultadoCalculo): ResultadoCalculo {
    const { competencia } = e;
    const ficha = fichaNaCompetencia(e.ficha, competencia).ficha;
    const d = ficha.dados;
    const mov = e.movimento ?? {};
    // Desligado no mês (rescisão): só os dias até o desligamento.
    const deslig = d.dataDesligamento || '';
    const conv = diasNaCompetencia(e.convocacoes ?? [], ficha.id, competencia)
        .map(x => ({ ...x, dias: deslig ? x.dias.filter(y => y.data <= deslig) : x.dias })).filter(x => x.dias.length);
    r.memoria.push('Trabalho intermitente (CLT, art. 452-A): paga as horas das convocações aceitas na competência, o DSR, os adicionais, as férias proporcionais com 1/3 e o 13º proporcional (§ 6º).');
    if (e.convocacoes === undefined) { r.avisos.push('Convocações do intermitente não carregadas: abra a folha pela tela do cálculo.'); r.situacao = 'incompleto'; return r; }
    if (!conv.length) {
        r.memoria.push(`Nenhuma convocação aceita com dias em ${rotuloCompetencia(competencia)}: sem remuneração no mês (o S-1200 não vai).`);
        r.diasIntermitente = [];
        return r;
    }
    const dias: { dia: number; horas: number }[] = [];
    for (const x of conv.flatMap(y => y.dias)) {
        const dia = Number(x.data.slice(8));
        const ja = dias.find(y => y.dia === dia);
        if (ja) ja.horas += x.horas; else dias.push({ dia, horas: x.horas });
    }

    // Um recibo por data de pagamento (§ 6º: pago ao fim de cada período de prestação de serviço; MOS, S-1200, item 3.3:
    // um demonstrativo por data de pagamento). Convocação sem data própria: paga com a folha, no último recibo.
    const grupos = recibosPorPagamento(conv);
    const ac = acumuladoVazio();
    if (grupos.length === 1 && !grupos[0].dataPagamento) {
        parcela(e, r, ficha, conv, mov, true, ac, r.pagamento);
        if (r.situacao !== 'erro') r.diasIntermitente = dias.sort((a, b) => a.dia - b.dia);
        return r;
    }
    r.recibosIntermitente = [];
    grupos.forEach((g, i) => {
        const p: ResultadoCalculo = {
            ...r, pagamento: g.dataPagamento ? g.dataPagamento.slice(0, 7) : r.pagamento, situacao: 'calculado',
            verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0, memoria: [], avisos: [], erros: [],
        };
        delete p.recibosIntermitente;
        parcela(e, p, ficha, g.conv, i === grupos.length - 1 ? mov : {}, i === grupos.length - 1, ac, p.pagamento);
        r.recibosIntermitente!.push({ dataPagamento: g.dataPagamento, convocacoes: g.conv.map(x => x.convocacao.id), resultado: p });
    });
    // A folha do mês é a soma dos recibos (resumo, guias e totais); o eSocial usa cada recibo.
    const recibos = r.recibosIntermitente;
    for (const { dataPagamento, resultado: p } of recibos) {
        r.memoria.push(`— Recibo ${dataPagamento ? `pago em ${brData(dataPagamento)}` : 'pago com a folha'}:`, ...p.memoria);
        for (const a of p.avisos) if (!r.avisos.includes(a)) r.avisos.push(a);
        r.erros.push(...p.erros);
        for (const v of p.verbas) {
            const ja = r.verbas.find(x => x.codigo === v.codigo && x.descricao === v.descricao);
            if (ja) { ja.valor += v.valor; if (ja.referencia !== v.referencia) ja.referencia = ''; } else r.verbas.push({ ...v });
        }
        r.bases.inss += p.bases.inss; r.bases.fgts += p.bases.fgts; r.bases.irrf += p.bases.irrf; r.fgts += p.fgts;
    }
    const interm = r.verbas.find(v => v.codigo === 'INTERM');
    if (interm) interm.referencia = `${num(conv.reduce((s, x) => s + x.dias.reduce((t, y) => t + y.horas, 0), 0))} h`;
    const ultimo = recibos[recibos.length - 1].resultado;
    r.irrfApurado = ultimo.irrfApurado; r.deducoesIrrf = ultimo.deducoesIrrf; r.deducoesIntermitente = ultimo.deducoesIntermitente;
    r.basesIntermitente = ultimo.basesIntermitente;
    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    if (r.erros.length) r.situacao = 'erro';
    else if (recibos.some(x => x.resultado.situacao === 'incompleto')) r.situacao = 'incompleto';
    if (r.situacao !== 'erro') r.diasIntermitente = dias.sort((a, b) => a.dia - b.dia);
    if (new Set(recibos.map(x => x.resultado.pagamento)).size > 1) r.avisos.push('Recibos do intermitente pagos em meses diferentes: o IRRF de cada mês soma só os recibos deste empregado pagos nele; outros pagamentos no mesmo mês (a folha de outra competência, por exemplo) não entram. Confira.');
    return r;
}

/** Valores e bases de um recibo do intermitente (como o Recibo da Convocação do SAGE: INSS, FGTS e IRRF do mês, das férias e do 13º). */
export interface BasesIntermitente {
    inss: { base: number; valor: number }; inss13: { base: number; valor: number };
    fgts: { base: number; valor: number }; fgtsFerias: { base: number; valor: number }; fgts13: { base: number; valor: number };
    irrf: { base: number; valor: number }; irrfFerias: { base: number; valor: number }; irrf13: { base: number; valor: number };
}
/** Recibo de uma data de pagamento (uma ou mais convocações). */
export interface ReciboIntermitente { dataPagamento: string; convocacoes: string[]; resultado: ResultadoCalculo }

type ConvDoMes = { convocacao: Convocacao; dias: DiaConvocado[] };
type AcIr = { rend: number; inss: number; pensao: number; ir: number };
/** Acumulado do empregado no mês: o INSS pela competência; o IRRF por mês do pagamento (regime de caixa). */
interface Acumulado { baseInss: number; inss: number; base13: number; inss13: number; lan: number; fgts: BasesIntermitente['fgts']; fgtsFerias: BasesIntermitente['fgts']; fgts13: BasesIntermitente['fgts']; irrf: Map<string, { mes: AcIr; ferias: AcIr; decimo: AcIr }> }
const acumuladoVazio = (): Acumulado => ({ baseInss: 0, inss: 0, base13: 0, inss13: 0, lan: 0, fgts: { base: 0, valor: 0 }, fgtsFerias: { base: 0, valor: 0 }, fgts13: { base: 0, valor: 0 }, irrf: new Map() });
const acIrVazio = (): AcIr => ({ rend: 0, inss: 0, pensao: 0, ir: 0 });

/** Convocações do mês por data de pagamento: as datadas em ordem, e as sem data (pagas com a folha) por último. */
export function recibosPorPagamento<T extends { convocacao: Pick<Convocacao, 'dataPagamento'> }>(conv: T[]): { dataPagamento: string; conv: T[] }[] {
    const m = new Map<string, T[]>();
    for (const c of conv) {
        const k = data.test(c.convocacao.dataPagamento ?? '') ? c.convocacao.dataPagamento! : '';
        m.set(k, [...(m.get(k) ?? []), c]);
    }
    return [...m].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))).map(([dataPagamento, conv]) => ({ dataPagamento, conv }));
}

/**
 * Um recibo do intermitente: as convocações dele e, no último (`doMes`), o movimento do mês (horas extras, lançamentos,
 * pensão, vale-transporte) e o salário-família. INSS sobre o acumulado da competência e IRRF sobre o acumulado do mês do
 * pagamento, menos o já descontado nos recibos anteriores.
 */
function parcela(e: EntradaCalculo, r: ResultadoCalculo, ficha: FichaFuncionario, conv: ConvDoMes[], mov: Movimento, doMes: boolean, ac: Acumulado, mesPg: string): void {
    const { competencia } = e;
    const d = ficha.dados;
    const deslig = d.dataDesligamento || '';
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; };
    const primeiro = !ac.baseInss && !ac.base13;

    // Valor da hora da ficha: salário ÷ horas do mês (por hora, o próprio).
    const horasMesFicha = horasMesDaFicha(d);
    const valorHoraFicha = valorHoraDaFicha(d);

    // 1. Horas e DSR por convocação.
    let remuneracao = 0; let dsr = 0; let horasTotal = 0;
    for (const { convocacao: c, dias: ds } of conv) {
        const vh = c.valorHora > 0 ? c.valorHora : valorHoraFicha;
        if (!vh) { erro(`Convocação de ${brData(ds[0].data)}: sem valor da hora (nem na convocação nem na ficha).`); return; }
        const horas = ds.reduce((s, x) => s + x.horas, 0);
        const v = Math.round(vh * horas);
        remuneracao += v; horasTotal += horas;
        // DSR do período convocado (Lei 605/1949, art. 7º): do 1º ao último dia da convocação no mês, estendido até o
        // domingo (ou feriado) logo em seguida, passando pelo sábado; dias úteis contam o sábado, como no mensalista.
        const descansa = (x: string) => diaSemana(x) === 0 || !!feriado(x);
        let fimDsr = ds[ds.length - 1].data;
        for (let x = somarDias(fimDsr, 1); x.slice(0, 7) === competencia && (diaSemana(x) === 6 || descansa(x)); x = somarDias(x, 1)) {
            fimDsr = x;
            if (descansa(x)) break;
        }
        let uteis = 0; let descanso = 0;
        for (let x = ds[0].data; x <= fimDsr; x = somarDias(x, 1)) { if (descansa(x)) descanso++; else uteis++; }
        const dsrC = uteis && descanso ? Math.round(v / uteis * descanso) : 0;
        dsr += dsrC;
        r.memoria.push(`Convocação ${c.codigo ? `${c.codigo} ` : ''}${c.funcao ? `(${c.funcao}) ` : ''}com ${ds.length} dia(s) entre ${brData(ds[0].data)} e ${brData(ds[ds.length - 1].data)}: ${num(horas)} h × ${reais(vh)}/h${c.valorHora > 0 ? ' (valor da convocação)' : ' (valor da ficha)'} = ${reais(v)}`
            + (dsrC ? `; DSR ${reais(v)} ÷ ${uteis} dia(s) útil(eis) × ${descanso} domingo(s)/feriado(s) = ${reais(dsrC)}.` : '; sem domingo ou feriado no período, sem DSR.'));
    }
    verba({ codigo: 'INTERM', descricao: 'Remuneração do trabalho intermitente', referencia: `${num(horasTotal)} h`, tipo: 'provento', valor: remuneracao, inss: true, fgts: true, irrf: true });
    verba({ codigo: 'DSRINT', descricao: 'DSR do trabalho intermitente', referencia: '', tipo: 'provento', valor: dsr, inss: true, fgts: true, irrf: true });
    if (mov.feriadosLocais) r.avisos.push('Feriados locais do movimento não entram no DSR do intermitente: lance a diferença como provento, se houver.');

    // 2. Adicional de risco, proporcional às horas.
    const valorHoraMedio = horasTotal ? remuneracao / horasTotal : valorHoraFicha;
    const adic = adicionalDeRisco(d, Math.round(valorHoraFicha * horasMesFicha), e.tabelas, competencia);
    r.avisos.push(...adic.avisos);
    let adicional = 0;
    if (adic.erro) { r.avisos.push(adic.erro); r.situacao = 'incompleto'; }
    else if (adic.adicional) {
        adicional = Math.round(adic.adicional.mensal * horasTotal / horasMesFicha);
        verba({ codigo: adic.adicional.codigo, descricao: adic.adicional.descricao, referencia: `${adic.adicional.referencia} · ${num(horasTotal)} h`, tipo: 'provento', valor: adicional, inss: true, fgts: true, irrf: true });
        r.memoria.push(`${adic.adicional.descricao}: ${reais(adic.adicional.mensal)} (mês de ${num(horasMesFicha)} h) × ${num(horasTotal)} h ÷ ${num(horasMesFicha)} h = ${reais(adicional)}.`);
    }

    // 3. Horas extras do movimento (sobre o valor médio da hora com o adicional), lançamentos do movimento e os eventos
    //    digitados na convocação (Digitação de Eventos do SAGE).
    const vhExtra = valorHoraMedio + (horasTotal ? adicional / horasTotal : 0);
    let extras = 0;
    for (const [pct, h, cod] of [[50, mov.horasExtras50 ?? 0, 'HE50'], [100, mov.horasExtras100 ?? 0, 'HE100']] as [number, number, string][]) {
        if (!(h > 0)) continue;
        const v = Math.round(vhExtra * (1 + pct / 100) * h); extras += v;
        verba({ codigo: cod, descricao: `Horas extras ${pct}%`, referencia: `${num(h)} h`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`Horas extras ${pct}%: ${num(h)} h × ${reais(Math.round(vhExtra))}/h × ${num(1 + pct / 100)} = ${reais(v)}.`);
    }
    let salariais = 0;
    for (const l of [...(mov.lancamentos ?? []), ...conv.flatMap(x => x.convocacao.eventos ?? [])]) {
        ac.lan++;
        verba({ ...l, codigo: `LAN${ac.lan}`, referencia: '', valor: Math.round(l.valor) });
        if (l.tipo === 'provento' && l.inss) salariais += Math.round(l.valor);
    }

    // 4. Férias proporcionais com 1/3 e 13º proporcional (§ 6º, II e III): 1/12 da remuneração do mês.
    const baseProporcionais = remuneracao + dsr + adicional + extras + salariais;
    const ferias = Math.round(baseProporcionais / 12);
    const terco = Math.round(ferias / 3);
    const decimo = Math.round(baseProporcionais / 12);
    verba({ codigo: 'FERINT', descricao: 'Férias proporcionais (intermitente)', referencia: '1/12', tipo: 'provento', valor: ferias, inss: true, fgts: true, irrf: true });
    verba({ codigo: 'FERINT13', descricao: '1/3 das férias proporcionais (intermitente)', referencia: '', tipo: 'provento', valor: terco, inss: true, fgts: true, irrf: true });
    verba({ codigo: '13INT', descricao: '13º salário proporcional (intermitente)', referencia: '1/12', tipo: 'provento', valor: decimo, inss: true, fgts: true, irrf: true });
    r.memoria.push(`Férias proporcionais: ${reais(baseProporcionais)} (remuneração do mês) ÷ 12 = ${reais(ferias)}, mais 1/3 = ${reais(terco)}; 13º proporcional: ${reais(baseProporcionais)} ÷ 12 = ${reais(decimo)}.`);
    r.avisos.push('Intermitente: as férias proporcionais com 1/3 entram nas bases do INSS e do FGTS (Solução de Consulta Cosit 17/2019: integram a base, salvo quando indenizadas). Confira as incidências das rubricas no S-1010.');

    // 5. INSS: mensal (com as férias) e o do 13º em separado, sobre o acumulado da competência.
    const tInss = tabelaVigente(e.tabelas, 'inss', competencia);
    if ('erro' in tInss) { erro(tInss.erro); return; }
    const lanc = (f: (v: Verba) => boolean) => r.verbas.filter(f).reduce((s, v) => s + (v.tipo === 'provento' ? v.valor : -v.valor), 0);
    const baseInss = Math.max(0, lanc(v => v.inss && v.codigo !== '13INT'));
    const inssT = inssDetalhado(ac.baseInss + baseInss, tInss.tabela);
    const inss13T = inssDetalhado(ac.base13 + decimo, tInss.tabela);
    const inssV = Math.max(0, inssT.valor - ac.inss);
    const inss13V = Math.max(0, inss13T.valor - ac.inss13);
    verba({ codigo: 'INSS', descricao: 'INSS', referencia: '', tipo: 'desconto', valor: inssV, inss: false, fgts: false, irrf: false });
    verba({ codigo: 'INSS13', descricao: 'INSS sobre 13º salário', referencia: '', tipo: 'desconto', valor: inss13V, inss: false, fgts: false, irrf: false });
    if (primeiro) r.memoria.push(`INSS do mês (tabela de ${rotuloCompetencia(tInss.tabela.vigencia)}): ${inssT.memoria}.`, `INSS do 13º (em separado): ${inss13T.memoria}.`);
    else r.memoria.push(`INSS do mês sobre o acumulado da competência (tabela de ${rotuloCompetencia(tInss.tabela.vigencia)}): ${inssT.memoria}; menos ${reais(ac.inss)} já descontado = ${reais(inssV)}.`,
        `INSS do 13º sobre o acumulado: ${inss13T.memoria}; menos ${reais(ac.inss13)} já descontado = ${reais(inss13V)}.`);
    r.bases.inss = baseInss + decimo;
    ac.baseInss += baseInss; ac.inss += inssV; ac.base13 += decimo; ac.inss13 += inss13V;
    const minimo = tabelaVigente(e.tabelas, 'salario_minimo', competencia);
    const sm = 'erro' in minimo ? 0 : minimo.tabela.valores.salarioMinimo ?? 0;
    if (doMes && sm && ac.baseInss < sm) r.avisos.push(`Remuneração do mês (${reais(ac.baseInss)}) abaixo do salário mínimo (${reais(sm)}): o próprio empregado pode complementar a contribuição para o mês contar para a Previdência (EC 103/2019, art. 29). Oriente o empregado.`);

    // 6. Salário-família (Lei 8.213/1991, arts. 65 e 66): no mês com remuneração, se ela está no limite da tabela; cota
    // integral, proporcional aos dias de vínculo nos meses de admissão e de desligamento (Portaria Interministerial
    // MTP/ME 12/2022). Não há regra própria para o intermitente: vale a dos demais empregados. Vai no último recibo do mês.
    const filhos = doMes ? ficha.dependentes.filter(x => x.salarioFamilia === 'S') : [];
    if (filhos.length) {
        const tSf = tabelaVigente(e.tabelas, 'salario_familia', competencia);
        if ('erro' in tSf) r.avisos.push(`Salário-família não calculado: ${tSf.erro}`);
        else {
            const { cotaSalarioFamilia: cota = 0, limiteSalarioFamilia: limite = 0 } = tSf.tabela.valores;
            const comDireito = filhos.filter(x => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(x.nascimento)) { r.avisos.push(`Salário-família: dependente ${x.nome || ''} sem nascimento válido; não contado.`); return false; }
                return `${Number(x.nascimento.slice(0, 4)) + 14}${x.nascimento.slice(4, 7)}` >= competencia; // até o mês em que completa 14 anos
            });
            const remuneracaoMes = ac.baseInss; // salário de contribuição do mês (todos os recibos), sem o 13º
            if (remuneracaoMes > limite) r.memoria.push(`Salário-família: remuneração do mês ${reais(remuneracaoMes)} acima do limite ${reais(limite)}; sem direito.`);
            else if (comDireito.length) {
                const ini = `${competencia}-01`;
                const fimMes = somarDias(`${competenciaSeguinteDe(competencia)}-01`, -1);
                const de = d.admissao > ini ? d.admissao : ini;
                const ate = deslig && deslig < fimMes ? deslig : fimMes;
                const parcial = de !== ini || ate !== fimMes;
                const nDias = parcial ? Math.min(30, diasEntre(de, ate) + 1) : 30;
                const valor = parcial ? Math.round(cota * comDireito.length * nDias / 30) : cota * comDireito.length;
                verba({ codigo: 'SF', descricao: 'Salário-família', referencia: `${comDireito.length} cota(s)`, tipo: 'provento', valor, inss: false, fgts: false, irrf: false });
                r.memoria.push(`Salário-família: ${comDireito.length} × ${reais(cota)}${parcial ? ` × ${nDias}/30 (mês de admissão ou desligamento)` : ''} = ${reais(valor)} (remuneração do mês ${reais(remuneracaoMes)}, no limite de ${reais(limite)}).`);
                r.avisos.push('Salário-família do intermitente: pela regra geral (cota integral no mês com remuneração; proporcional na admissão e no desligamento). Não há regra própria na norma; confira.');
            }
        }
    }

    // 7. Pensão alimentícia do movimento (sobre o mês e sobre o 13º).
    const pensao = Math.round(mov.pensaoAlimenticia ?? 0);
    const pensao13 = Math.round(mov.pensao13 ?? 0);
    verba({ codigo: 'PENSAO', descricao: 'Pensão alimentícia', referencia: '', tipo: 'desconto', valor: pensao, inss: false, fgts: false, irrf: false });
    verba({ codigo: 'PENSAO13', descricao: 'Pensão alimentícia sobre 13º', referencia: '', tipo: 'desconto', valor: pensao13, inss: false, fgts: false, irrf: false });

    // 8. IRRF (tabela do mês do pagamento): mensal, férias em separado e 13º exclusivo, sobre o acumulado do mês do
    //    pagamento, menos o já retido nos recibos anteriores pagos nele.
    const tIr = tabelaVigente(e.tabelas, 'irrf', mesPg);
    if ('erro' in tIr) { erro(`IRRF: ${tIr.erro}`); return; }
    const a = ac.irrf.get(mesPg) ?? { mes: acIrVazio(), ferias: acIrVazio(), decimo: acIrVazio() };
    ac.irrf.set(mesPg, a);
    const acumula = a.mes.rend + a.ferias.rend + a.decimo.rend > 0;
    const deps = ficha.dependentes.filter(x => x.irrf === 'S' && x.pensao !== 'S');
    const opcoes = { simplificado: true, redutor: true };
    const feriasTotal = ferias + terco;
    // O INSS do recibo tem as férias: a parte delas (proporcional) deduz no IRRF das férias.
    const inssFerias = baseInss ? Math.round(inssV * feriasTotal / baseInss) : 0;
    const rendMensal = Math.max(0, lanc(v => v.irrf && !['FERINT', 'FERINT13', '13INT'].includes(v.codigo)));
    const sufixo = acumula ? ', acumulado no mês do pagamento' : '';
    const irMes = irrfDetalhado({ rendimento: a.mes.rend + rendMensal, inss: a.mes.inss + inssV - inssFerias, dependentes: deps.length, pensao: a.mes.pensao + pensao, tabela: tIr.tabela, opcoes, rotulo: `IRRF do mês (pagamento em ${rotuloCompetencia(mesPg)}${sufixo})` });
    const irFer = irrfDetalhado({ rendimento: a.ferias.rend + feriasTotal, inss: a.ferias.inss + inssFerias, dependentes: deps.length, tabela: tIr.tabela, opcoes, rotulo: `IRRF das férias proporcionais (em separado${sufixo})` });
    const ir13 = irrfDetalhado({ rendimento: a.decimo.rend + decimo, inss: a.decimo.inss + inss13V, dependentes: deps.length, pensao: a.decimo.pensao + pensao13, tabela: tIr.tabela, opcoes, rotulo: `IRRF do 13º proporcional (exclusivo na fonte${sufixo})` });
    const irMesV = Math.max(0, irMes.valor - a.mes.ir); const irFerV = Math.max(0, irFer.valor - a.ferias.ir); const ir13V = Math.max(0, ir13.valor - a.decimo.ir);
    verba({ codigo: 'IRRF', descricao: 'IRRF', referencia: irMes.aliquota ? `${num(irMes.aliquota)}%` : '', tipo: 'desconto', valor: irMesV, inss: false, fgts: false, irrf: false });
    verba({ codigo: 'IRRFFER', descricao: 'IRRF sobre férias', referencia: irFer.aliquota ? `${num(irFer.aliquota)}%` : '', tipo: 'desconto', valor: irFerV, inss: false, fgts: false, irrf: false });
    verba({ codigo: 'IRRF13', descricao: 'IRRF sobre 13º salário', referencia: ir13.aliquota ? `${num(ir13.aliquota)}%` : '', tipo: 'desconto', valor: ir13V, inss: false, fgts: false, irrf: false });
    r.memoria.push(...irMes.memoria, ...irFer.memoria, ...ir13.memoria);
    if (acumula) r.memoria.push(`Já retido nos recibos anteriores pagos em ${rotuloCompetencia(mesPg)}: IRRF ${reais(a.mes.ir)}, das férias ${reais(a.ferias.ir)} e do 13º ${reais(a.decimo.ir)}; neste recibo ${reais(irMesV)}, ${reais(irFerV)} e ${reais(ir13V)}.`);
    if (inssFerias) r.memoria.push(`INSS deduzido no IRRF das férias: ${reais(inssV)} × ${reais(feriasTotal)} ÷ ${reais(baseInss)} = ${reais(inssFerias)} (o restante no IRRF do mês).`);
    a.mes = { rend: a.mes.rend + rendMensal, inss: a.mes.inss + inssV - inssFerias, pensao: a.mes.pensao + pensao, ir: a.mes.ir + irMesV };
    a.ferias = { rend: a.ferias.rend + feriasTotal, inss: a.ferias.inss + inssFerias, pensao: 0, ir: a.ferias.ir + irFerV };
    a.decimo = { rend: a.decimo.rend + decimo, inss: a.decimo.inss + inss13V, pensao: a.decimo.pensao + pensao13, ir: a.decimo.ir + ir13V };
    r.bases.irrf = rendMensal;
    r.irrfApurado = { rendimentos: rendMensal, deducoesLegais: irMes.simplificado ? 0 : inssV - inssFerias + pensao, valor: irMesV };
    const porDependente = tIr.tabela.valores.deducaoDependente ?? 0;
    const lista = deps.map(x => ({ cpf: x.cpf, nome: x.nome }));
    r.deducoesIrrf = { simplificado: irMes.simplificado, dependentes: lista, porDependente, pensao };
    r.deducoesIntermitente = {
        ferias: { simplificado: irFer.simplificado, dependentes: lista, porDependente },
        decimo: { simplificado: ir13.simplificado, dependentes: lista, porDependente, pensao: pensao13 },
    };

    // 9. FGTS de 8% sobre tudo.
    r.bases.fgts = Math.max(0, lanc(v => v.fgts));
    r.fgts = Math.round(r.bases.fgts * 8 / 100);
    r.memoria.push(`FGTS: ${reais(r.bases.fgts)} × 8% = ${reais(r.fgts)} (art. 452-A, § 8º).`);
    if (d.valeTransporte === 'S' && doMes && mov.valeTransporte === undefined) r.avisos.push('Vale-transporte do intermitente: informe no movimento o desconto do mês (6% das horas pagas, limitado ao custo dos dias convocados).');
    else if (mov.valeTransporte) verba({ codigo: 'VT', descricao: 'Vale-transporte', referencia: '', tipo: 'desconto', valor: Math.round(mov.valeTransporte), inss: false, fgts: false, irrf: false });

    // Bases do recibo e as acumuladas do empregado no mês (o quadro "Bases da Convocação" do SAGE).
    const fgtsDe = (f: (v: Verba) => boolean) => { const base = Math.max(0, lanc(v => v.fgts && f(v))); return { base, valor: Math.round(base * 8 / 100) }; };
    const fF = fgtsDe(v => v.codigo === 'FERINT' || v.codigo === 'FERINT13'); const f13 = fgtsDe(v => v.codigo === '13INT');
    const fM = { base: r.bases.fgts - fF.base - f13.base, valor: r.fgts - fF.valor - f13.valor };
    const soma = (x: { base: number; valor: number }, y: { base: number; valor: number }) => ({ base: x.base + y.base, valor: x.valor + y.valor });
    ac.fgts = soma(ac.fgts, fM); ac.fgtsFerias = soma(ac.fgtsFerias, fF); ac.fgts13 = soma(ac.fgts13, f13);
    r.basesIntermitente = {
        recibo: {
            inss: { base: baseInss, valor: inssV }, inss13: { base: decimo, valor: inss13V }, fgts: fM, fgtsFerias: fF, fgts13: f13,
            irrf: { base: rendMensal, valor: irMesV }, irrfFerias: { base: feriasTotal, valor: irFerV }, irrf13: { base: decimo, valor: ir13V },
        },
        acumulado: {
            inss: { base: ac.baseInss, valor: ac.inss }, inss13: { base: ac.base13, valor: ac.inss13 }, fgts: { ...ac.fgts }, fgtsFerias: { ...ac.fgtsFerias }, fgts13: { ...ac.fgts13 },
            irrf: { base: a.mes.rend, valor: a.mes.ir }, irrfFerias: { base: a.ferias.rend, valor: a.ferias.ir }, irrf13: { base: a.decimo.rend, valor: a.decimo.ir },
        },
    };

    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    if (r.totais.liquido < 0) r.avisos.push('Líquido negativo: confira os descontos.');
    if (r.avisos.some(x => /não carregadas/.test(x))) r.situacao = 'incompleto';
}
