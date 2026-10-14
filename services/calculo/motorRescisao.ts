// services/calculo/motorRescisao.ts
//
// Rescisão (Processos › Rescisão › Cálculo do IOB), em prévia: o TRCT de um
// desligamento, montado sobre os outros motores.
// - Saldo de salário e movimento do mês: o motor mensal com a data do
//   desligamento (INSS e IRRF do mês).
// - Aviso prévio (Lei 12.506/2011): 30 dias + 3 por ano completo, até 90,
//   na dispensa sem justa causa; metade no acordo (art. 484-A). Indenizado,
//   projeta o fim do contrato para 13º e férias (OJ 82 da SDI-1 do TST); sem
//   INSS e sem IRRF, com FGTS (Súmula 305 do TST). Trabalhado, só os dias
//   além de 30 são indenizados. No pedido de demissão sem cumprir o aviso,
//   desconta 30 dias (art. 487, § 2º).
// - 13º proporcional (até a data real, com INSS e IRRF próprios) e 13º sobre
//   o aviso indenizado (avos da projeção, sem INSS). Na justa causa, não há.
// - Férias vencidas (em dobro se o concessivo passou) e proporcionais, com
//   1/3, indenizadas: sem INSS, FGTS e IRRF. Na justa causa, só as vencidas.
// - Término antecipado de contrato a termo pelo empregador: metade da
//   remuneração dos dias restantes (art. 479). Pelo empregado, com a opção
//   "Indenização do art. 480" (como no SAGE): desconto do mesmo valor, que é o
//   teto do art. 480, § 1º (natureza 6904 do eSocial).
// - Descontos maiores que os proventos: "Insuficiência de saldo" (natureza 2930)
//   zera o líquido, como no SAGE; o que sobra o empregado continua devendo.
// - FGTS do mês e rescisório; multa de 40% (dispensa sem justa causa e
//   art. 479) ou 20% (acordo) sobre o saldo informado — paga por guia, fora
//   do líquido. Pagamento em até 10 dias do término (art. 477, § 6º).
// - Intermitente (categoria 111; Portaria MTb 349/2018, art. 5º, incorporada à Portaria MTP 671/2021): aviso prévio e
//   verbas rescisórias pela média dos valores recebidos nos meses com remuneração dos últimos 12 (ou do contrato, se
//   menor). Férias e 13º proporcionais já foram pagos a cada convocação (CLT, art. 452-A, § 6º): na rescisão vão as
//   convocações do mês até o desligamento (com as parcelas delas) e, no aviso indenizado, a projeção (13º e férias + 1/3
//   sobre os avos do aviso). O S-2299 leva os dias trabalhados no mês (infoInterm; 0 se não houve).
// - Culpa recíproca (05; CLT, art. 484; TST, Súmula 14): metade do aviso prévio, do 13º e das férias proporcionais;
//   férias vencidas inteiras; multa de 20% do FGTS (Lei 8.036/1990, art. 18, § 2º) e saque (art. 20, I).
// - Falecimento do empregado (10): saldo, 13º e férias vencidas e proporcionais, sem aviso e sem multa; os valores vão
//   aos dependentes ou sucessores (Lei 6.858/1980), sem IRRF na rescisão (o S-2299 vai com indApurIR 1 e sem S-1210;
//   MOS, S-2299, item 11.1); saque do FGTS pelos dependentes (Lei 8.036/1990, art. 20, IV).
// - Rescisão indireta (17; CLT, art. 483): as verbas da dispensa sem justa causa (aviso, multa de 40% e saque).

import { fichaNaData, memoriaDoHistorico, type FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { aniversario, diasEntre, somarDias, somarMeses } from '../prazos/calendario';
import { calcularMensal, competenciaAnterior, mediaDasVariaveis, percentualDaPensao, salarioContratual, type Movimento, type ResultadoCalculo, type Verba } from './motorMensal';
import { avosDoAno, primeiraParcelaNasFerias } from './motor13';
import { descontosConsignado } from './consignado';
import { folhaPagaAntes } from './arredondamento';
import { diasDeDireito, feriasDaCompetencia, mesesDoPeriodo, periodosAquisitivos } from './motorFerias';
import { inssDetalhado, irrfDetalhado, type OpcoesIrrf } from './tributos';
import { adicionalDeRisco } from './adicionais';
import { destinoIndenizacao, ehDomestico, indenizacaoCompensatoria } from '../domestico/domestico';
import type { Convocacao } from './intermitente';
import type { ContribuicaoConvencao } from '../sindicatos/contribuicoes';

/** Motivos do desligamento (Tabela 19 do eSocial) cobertos nesta versão. */
export const TIPOS_RESCISAO = {
    '02': 'Sem justa causa, por iniciativa do empregador',
    '07': 'Pedido de demissão',
    '01': 'Com justa causa',
    '33': 'Acordo entre as partes (art. 484-A)',
    '06': 'Término do contrato a termo',
    '03': 'Término antecipado do contrato a termo pelo empregador',
    '04': 'Término antecipado do contrato a termo pelo empregado',
    '05': 'Culpa recíproca (art. 484)',
    '10': 'Falecimento do empregado',
    '17': 'Rescisão indireta (art. 483)',
    '47': 'Encerramento da empresa, do estabelecimento ou de parte das atividades',
    '48': 'Falecimento do empregador individual sem continuação da atividade',
    '09': 'Opção do empregado pelo falecimento do empregador individual (art. 483, § 2º)',
    '26': 'Paralisação por ato de autoridade (fato do príncipe, art. 486)',
    '49': 'Falecimento do empregador doméstico sem continuação da atividade',
    '27': 'Força maior (art. 501)',
    '08': 'Por interesse do empregado (arts. 394 e 483, § 1º, da CLT)',
    '41': 'Aprendiz: desempenho insuficiente ou inadaptação (art. 433, I)',
    '42': 'Aprendiz: ausência injustificada à escola com perda do ano letivo (art. 433, III)',
} as const;
/** Motivos que, na Tabela 19 (leiaute S-1.3), valem só para algumas categorias. */
export const CATEGORIAS_DO_MOTIVO: Partial<Record<TipoRescisao, { so?: string[]; exceto?: string[]; texto: string }>> = {
    '41': { so: ['103'], texto: 'só para o aprendiz (categoria 103)' },
    '42': { so: ['103'], texto: 'só para o aprendiz (categoria 103)' },
    '47': { exceto: ['104'], texto: 'não vale para o doméstico (categoria 104)' },
    '48': { exceto: ['104'], texto: 'não vale para o doméstico (categoria 104; o dele é o 49)' },
    '26': { exceto: ['104'], texto: 'não vale para o doméstico (categoria 104)' },
    '49': { so: ['104'], texto: 'só para o empregado doméstico (categoria 104)' },
};
/** Motivos com aviso prévio do empregador (indenizado ou trabalhado): dispensa, acordo, indireta, culpa recíproca e o fim da atividade. */
const COM_AVISO: readonly string[] = ['02', '33', '17', '05', '47', '48', '26'];
/** Dispensa sem justa causa, para a convenção (dias a mais de aviso) e a multa de 40%. */
const DISPENSA: readonly string[] = ['02', '17', '47', '48', '26'];

/**
 * Motivos que só se usam com o fato que os ampara (Paulo, 12/10/2026: "deve ser cadastrado de forma que o uso só ocorre
 * quando houver uma das situações; todas devem obedecer o amparo legal"). Sem a data e a descrição do fato, a rescisão
 * fica incompleta e o S-2299 não sai.
 */
export const AMPARO_DO_MOTIVO: Partial<Record<TipoRescisao, { pede: string; base: string }>> = {
    '09': { pede: 'Data do óbito do empregador individual e a certidão de óbito (número, cartório)', base: 'CLT, art. 483, § 2º' },
    '26': { pede: 'Data e identificação do ato da autoridade que paralisou a atividade (órgão, número, publicação)', base: 'CLT, art. 486' },
    '27': { pede: 'Data e descrição do fato de força maior que extinguiu a empresa ou o estabelecimento', base: 'CLT, arts. 501 e 502' },
    '47': { pede: 'Data e documento do encerramento (baixa, distrato, ata ou supressão da atividade)', base: 'CLT, art. 477; TST, Súmula 44' },
    '48': { pede: 'Data do óbito do empregador individual e a certidão de óbito (número, cartório)', base: 'CLT, art. 485' },
    '49': { pede: 'Data do óbito do empregador doméstico e a certidão de óbito (número, cartório)', base: 'LC 150/2015, art. 22' },
};
export interface AmparoMotivo { data: string; descricao: string }

/** Erro do amparo do motivo (vazio = em ordem ou o motivo não pede). O fato vem no dia do desligamento ou antes. */
export function erroDoAmparo(tipo: string, amparo: AmparoMotivo | undefined, dataDesligamento: string): string {
    const req = AMPARO_DO_MOTIVO[tipo as TipoRescisao];
    if (!req) return '';
    const falta = `Motivo ${tipo} (${req.base}): informe ${req.pede.charAt(0).toLowerCase()}${req.pede.slice(1)}. Sem o fato que ampara o motivo, a rescisão não fecha.`;
    if (!amparo || !/^\d{4}-\d{2}-\d{2}$/.test(amparo.data) || (amparo.descricao ?? '').trim().length < 10) return falta;
    if (dataDesligamento && amparo.data > dataDesligamento) return `Motivo ${tipo}: o fato (${amparo.data.split('-').reverse().join('/')}) é posterior ao desligamento; o motivo só se usa depois dele.`;
    return '';
}
export type TipoRescisao = keyof typeof TIPOS_RESCISAO;
/**
 * Motivos com saque do FGTS: só nestes há guia rescisória do FGTS Digital. Nos
 * demais (pedido de demissão, justa causa, término antecipado pelo empregado)
 * o FGTS do mês vai na guia mensal (FAQ do FGTS Digital 04.04).
 */
export const PERMITE_SAQUE_FGTS: readonly string[] = ['02', '03', '05', '06', '10', '17', '33', '27', '47', '48', '09', '26', '49'];
/** Motivos em que o aviso prévio e as proporcionais vão pela metade: acordo (art. 484-A) e culpa recíproca (Súmula 14 do TST). */
export const AVISO_PELA_METADE: readonly string[] = ['33', '05'];
export type AvisoPrevio = 'indenizado' | 'trabalhado' | 'dispensado' | 'nao-cumprido';
export const ROTULO_AVISO: Record<AvisoPrevio, string> = {
    indenizado: 'Indenizado', trabalhado: 'Trabalhado', dispensado: 'Dispensado do cumprimento', 'nao-cumprido': 'Não cumprido pelo empregado (desconto)',
};

export interface EntradaRescisao {
    ficha: FichaFuncionario;
    /** Último dia do contrato (data do desligamento). */
    data: string;
    /** Motivo do desligamento; vazio = ainda não escolhido (o motivo do S-2299 não é importado para a ficha). */
    tipo: TipoRescisao | '';
    aviso: AvisoPrevio;
    /** Mês em que a rescisão é paga (AAAA-MM): define a tabela do IRRF. Padrão: o mês do prazo de 10 dias. */
    pagamento?: string;
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    /** Movimentos gravados da ficha, por competência. */
    movimentos: Record<string, Movimento>;
    /** Saldo do FGTS para fins rescisórios (extrato), em centavos. */
    saldoFgts?: number;
    /** 13º já adiantado no ano (1ª parcela ou nas férias), em centavos. */
    adiantamento13?: number;
    opcoes?: OpcoesIrrf;
    /**
     * Mês em que a empresa paga a folha de cada competência (o regime dos parâmetros). Com a rescisão paga no próprio
     * mês e a folha anterior paga nele, o IRRF soma as duas (regime de caixa). Sem ele, o IRRF é só da rescisão.
     */
    regimePagamento?: (competencia: string) => string;
    /** Aviso prévio a mais pela convenção (avisoDaConvencao), na dispensa sem justa causa. */
    avisoConvencao?: { dias: number; regra: string } | null;
    /** Contribuições da convenção (o mês da rescisão desconta como a folha). */
    contribuicoesSindicais?: ContribuicaoConvencao[];
    /** Intermitente: as convocações do empregado (média dos 12 meses e as do mês do desligamento). */
    convocacoes?: Convocacao[];
    /** Fato que ampara os motivos 09, 26, 27, 47, 48 e 49 (AMPARO_DO_MOTIVO). */
    amparo?: AmparoMotivo;
    /**
     * Motivo 04 (término antecipado do contrato a termo pelo empregado): descontar a indenização do art. 480 da CLT,
     * metade da remuneração dos dias que faltavam (o teto do § 1º, igual ao art. 479). É opção, como no SAGE: o
     * empregador pode abrir mão. Sem ela, nada é descontado.
     */
    indenizacao480?: boolean;
}

export interface ResultadoRescisao extends ResultadoCalculo {
    tipo: TipoRescisao | '';
    data: string;
    dataProjetada: string;
    diasAviso: number;
    pagarAte: string;
    multaFgts: number;
    percentualMulta: number;
    saqueFgts: string;
    /** Deduções do IRRF do 13º da rescisão (tributação exclusiva, tpRend 12 no S-1210). As do saldo vêm em deducoesIrrf. */
    deducoes13?: { simplificado: boolean; dependentes: { cpf: string; nome: string }[]; porDependente: number; pensao: number };
    /** O fato que ampara o motivo, quando ele pede (vai na memória e no TRCT). */
    amparo?: AmparoMotivo;
}

const ALIQUOTA_FGTS = 8;
const ALIQUOTA_FGTS_APRENDIZ = 2;
const br = (d: string) => d.split('-').reverse().join('/');
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const anosCompletos = (de: string, ate: string) => { let n = 0; while (aniversario(de, n + 1) <= somarDias(ate, 1)) n++; return n; };

/** Avos da projeção do aviso indenizado: 1/12 a cada 30 dias, e mais 1/12 se sobrarem 15 dias ou mais. */
export const avosDaProjecao = (dias: number) => Math.floor(dias / 30) + (dias % 30 >= 15 ? 1 : 0);

/** Dias de aviso prévio pago pelo empregador (Lei 12.506/2011). */
export function diasDeAviso(admissao: string, data: string): number {
    return Math.min(90, 30 + 3 * anosCompletos(admissao, data));
}

export function calcularRescisao(e: EntradaRescisao): ResultadoRescisao {
    const { data, tipo } = e;
    // Salário vigente no desligamento, pelo histórico (aviso, 13º e férias saem da remuneração da extinção).
    const naExtincao = fichaNaData(e.ficha, data);
    const ficha = naExtincao.ficha;
    const d = ficha.dados;
    const opcoes = e.opcoes ?? { simplificado: true, redutor: true };
    const pagarAte = dataValida(data) ? somarDias(data, 10) : '';
    const pagamento = e.pagamento && /^\d{4}-(0[1-9]|1[0-2])$/.test(e.pagamento) ? e.pagamento : pagarAte.slice(0, 7);
    const r: ResultadoRescisao = {
        fichaId: ficha.id, nome: d.nome || ficha.cpf, competencia: data.slice(0, 7), pagamento, situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [],
        tipo, data, dataProjetada: data, diasAviso: 0, pagarAte, multaFgts: 0, percentualMulta: 0, saqueFgts: '',
    };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; return r; };
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    const motivoFicha = d.motivoDesligamento || '';
    if (!tipo) return erro(motivoFicha && !(motivoFicha in TIPOS_RESCISAO)
        ? `Motivo ${motivoFicha} do S-2299 ainda não é coberto pelo motor. Escolha um dos tipos cobertos para simular.`
        : 'Escolha o tipo do desligamento (a ficha não tem o motivo do S-2299).');
    if (!TIPOS_RESCISAO[tipo]) return erro('Tipo de desligamento não coberto nesta versão.');
    if (!dataValida(data)) return erro('Informe a data do desligamento.');
    if (!d.admissao || !dataValida(d.admissao)) return erro('Ficha sem data de admissão válida.');
    if (data < d.admissao) return erro('Desligamento antes da admissão.');
    const categoria = d.categoria || '';
    if (categoria && !/^1\d\d$/.test(categoria)) return erro(`Categoria ${categoria}: esta versão só calcula empregados (categorias 1xx).`);
    const restricao = CATEGORIAS_DO_MOTIVO[tipo];
    if (restricao && ((restricao.so && !restricao.so.includes(categoria)) || (restricao.exceto && restricao.exceto.includes(categoria)))) {
        return erro(`Motivo ${tipo} (${TIPOS_RESCISAO[tipo]}): ${restricao.texto}, pela Tabela 19 do eSocial.`);
    }
    const semAmparo = erroDoAmparo(tipo, e.amparo, data);
    if (AMPARO_DO_MOTIVO[tipo] && !semAmparo && e.amparo) {
        r.amparo = { data: e.amparo.data, descricao: e.amparo.descricao.trim() };
        r.memoria.push(`Amparo do motivo ${tipo} (${AMPARO_DO_MOTIVO[tipo]!.base}): ${r.amparo.descricao}, em ${br(r.amparo.data)}.`);
    }
    // Doméstico (LC 150/2015): sem multa de 40% ou 20%; os 3,2% depositados no contrato substituem a multa (art. 22).
    const domestico = ehDomestico(categoria);
    const interm = categoria === '111';
    const aliqFgts = categoria === '103' ? ALIQUOTA_FGTS_APRENDIZ : ALIQUOTA_FGTS;
    const justa = tipo === '01';
    if (motivoFicha && motivoFicha !== tipo && d.dataDesligamento === data) r.avisos.push(`O S-2299 informou o motivo ${motivoFicha}; o cálculo usa ${tipo}.`);
    if (!e.pagamento && pagamento !== data.slice(0, 7)) r.avisos.push(`O prazo de pagamento cai em ${rotuloCompetencia(pagamento)}: o IRRF usa a tabela desse mês. Se a rescisão for paga antes, informe o mês do pagamento.`);
    r.memoria.push(`${TIPOS_RESCISAO[tipo]}; admissão ${br(d.admissao)}, desligamento ${br(data)}; pagamento até ${br(pagarAte)} (art. 477, § 6º).`);

    const ultimos12 = Array.from({ length: 12 }, (_, i) => somarMeses(`${data.slice(0, 7)}-01`, -(i + 1)).slice(0, 7));
    let remuneracao: number;
    if (interm) {
        // Média dos meses com remuneração (horas, DSR, adicionais, horas extras e lançamentos salariais; sem as férias e o
        // 13º proporcionais, que são parcelas da própria convocação).
        if (e.convocacoes === undefined) return erro('Intermitente: as convocações não foram carregadas. Abra a rescisão pela tela do cálculo.');
        const PARCELAS = ['FERINT', 'FERINT13', '13INT'];
        const porMes = ultimos12.filter(c => c >= d.admissao.slice(0, 7)).map(c => {
            const m = calcularMensal({ competencia: c, pagamento: c, ficha, afastamentos: e.afastamentos, tabelas: e.tabelas, movimento: e.movimentos[c], convocacoes: e.convocacoes });
            return { c, valor: m.verbas.filter(v => v.tipo === 'provento' && v.inss && !PARCELAS.includes(v.codigo)).reduce((t, v) => t + v.valor, 0) };
        }).filter(x => x.valor > 0);
        remuneracao = porMes.length ? Math.round(porMes.reduce((t, x) => t + x.valor, 0) / porMes.length) : 0;
        r.memoria.push(porMes.length
            ? `Intermitente: remuneração para as verbas rescisórias = média dos ${porMes.length} mês(es) com remuneração nos 12 anteriores (${porMes.map(x => `${rotuloCompetencia(x.c)} ${reais(x.valor)}`).join('; ')}) = ${reais(remuneracao)} (Portaria MTb 349/2018, art. 5º; Portaria MTP 671/2021).`
            : 'Intermitente: nenhum mês com remuneração nos 12 anteriores; sem média, o aviso e a projeção ficam zerados.');
        if (!porMes.length) r.avisos.push('Intermitente sem convocação paga nos 12 meses anteriores: aviso e projeção sem valor. Confira as convocações.');
        r.memoria.push('Intermitente: férias e 13º proporcionais foram pagos a cada convocação (CLT, art. 452-A, § 6º) e não se repetem na rescisão.');
    } else {
        // Remuneração para aviso, 13º e férias: salário do desligamento + média de horas extras dos 12 meses anteriores.
        const sc = salarioContratual(d);
        r.avisos.push(...sc.avisos);
        if ('erro' in sc) return erro(sc.erro);
        if (naExtincao.faixa) r.memoria.push(memoriaDoHistorico(naExtincao.faixa, `no desligamento (${br(data)})`, !!naExtincao.antesDoHistorico));
        if (naExtincao.antesDoHistorico) r.avisos.push('Data anterior ao histórico de salário da ficha: usado o salário mais antigo conhecido; confira.');
        // Insalubridade ou periculosidade: integra a remuneração das verbas rescisórias (TST, Súmula 139) e a hora das médias.
        const adic = adicionalDeRisco(d, sc.mensal, e.tabelas, data.slice(0, 7));
        if (adic.erro) return erro(adic.erro);
        const adicional = adic.adicional?.mensal ?? 0;
        const salarioHora = (sc.mensal + adicional) / sc.horasMes;
        // Pelos meses de vínculo dentro dos 12 (admitido há menos de um ano: os meses trabalhados), como no 13º.
        const mesesMedia = Math.max(1, ultimos12.filter(c => c >= d.admissao.slice(0, 7)).length);
        const mv = mediaDasVariaveis(salarioHora, e.movimentos, ultimos12, mesesMedia, `${mesesMedia}`);
        const somaVar = mv.horasExtras + mv.outras;
        const media = mv.media;
        remuneracao = sc.mensal + adicional + media;
        const oQue = mv.outras ? (mv.horasExtras ? 'média das variáveis (horas extras com DSR e lançamentos)' : 'média dos lançamentos variáveis') : 'média de horas extras';
        r.memoria.push(`Remuneração para as verbas rescisórias: ${reais(sc.mensal)}${adicional ? ` + ${adic.adicional!.descricao.toLowerCase()} ${reais(adicional)}` : ''}${media ? ` + ${oQue} ${reais(media)} (${reais(somaVar)} ÷ ${mesesMedia} ${mesesMedia === 1 ? 'mês' : 'meses'} de vínculo nos 12 anteriores)` : ''} = ${reais(remuneracao)}.`);
        if (ultimos12.some(c => e.movimentos[c])) r.avisos.push('Média pelos movimentos gravados dos 12 meses anteriores: horas extras com DSR e os lançamentos que entram na média.');
    }
    const diaria = remuneracao / 30;

    // 1. Saldo de salário e movimento do mês, pelo motor mensal.
    const fichaDeslig: FichaFuncionario = { ...ficha, dados: { ...d, dataDesligamento: data } };
    const comp = data.slice(0, 7);
    // Rescisão paga no próprio mês, com a folha anterior paga nele: o IRRF do saldo soma a folha (regime de caixa).
    const folhaPagaAntesNoMes = pagamento === comp && e.regimePagamento
        ? folhaPagaAntes(e.movimentos, comp, m => d.admissao.slice(0, 7) <= m, e.regimePagamento) : null;
    // O consignado sai uma vez só, no fim, sobre as verbas rescisórias (não no saldo de salário).
    const mes = calcularMensal({ competencia: comp, pagamento, ficha: { ...fichaDeslig, consignados: [] }, afastamentos: e.afastamentos, tabelas: e.tabelas, movimento: e.movimentos[comp], contribuicoesSindicais: e.contribuicoesSindicais,
        feriasDoMes: feriasDaCompetencia(fichaDeslig, e.afastamentos, e.tabelas, e.movimentos, comp), folhaPagaAntesNoMes, convocacoes: e.convocacoes });
    if (interm) r.diasIntermitente = mes.diasIntermitente ?? [];
    if (mes.situacao === 'erro') { r.erros.push(...mes.erros); r.situacao = 'erro'; }
    for (const v of mes.verbas) r.verbas.push(v.codigo === 'SAL' ? { ...v, descricao: 'Saldo de salário' } : v.codigo === 'INSS' ? { ...v, descricao: 'INSS sobre saldo de salário' } : v.codigo === 'IRRF' ? { ...v, descricao: 'IRRF sobre saldo de salário' } : v);
    // Arredondamento do mês anterior (o que a folha passada pagou a mais para fechar o real): volta na rescisão,
    // que não arredonda de novo. O informado no movimento do mês vale sobre o gravado no mês anterior.
    const arredAnt = e.movimentos[comp]?.arredondamentoAnterior ?? e.movimentos[competenciaAnterior(comp)]?.arredondamentoFechado ?? 0;
    if (arredAnt > 0 && arredAnt <= 99) {
        verba({ codigo: 'ARREDANT', descricao: 'Arredondamento anterior', referencia: '', tipo: 'desconto', valor: arredAnt, inss: false, fgts: false, irrf: false });
        r.memoria.push(`Arredondamento anterior: ${reais(arredAnt)} pagos a mais na folha passada, descontados (a rescisão não arredonda).`);
    }
    r.memoria.push(...mes.memoria.map(m => `Mês: ${m}`));
    // Deduções do IRRF do saldo (tpRend 11 no S-1210 do pagamento da rescisão).
    if (mes.deducoesIrrf) r.deducoesIrrf = mes.deducoesIrrf;
    r.avisos.push(...mes.avisos.filter(a => !a.startsWith('Desligado em')));
    // Do mensal, só as férias no mês deixam a rescisão incompleta (o desligamento é tratado aqui).
    if (mes.situacao === 'incompleto' && mes.avisos.some(a => a.startsWith('Férias de'))) r.situacao = 'incompleto';
    let fgtsBase = mes.bases.fgts;

    // 2. Aviso prévio.
    let indenizados = 0;
    const metade = AVISO_PELA_METADE.includes(tipo);
    const rotuloMetade = tipo === '05' ? 'pela metade na culpa recíproca' : 'pela metade no acordo';
    if (COM_AVISO.includes(tipo)) {
        const legal = diasDeAviso(d.admissao, data);
        // Convenção: dias a mais na dispensa sem justa causa (no acordo do art. 484-A, a convenção não se aplica sozinha).
        const extra = DISPENSA.includes(tipo) && e.avisoConvencao?.dias ? e.avisoConvencao.dias : 0;
        if (tipo === '33' && e.avisoConvencao?.dias) r.avisos.push(`A convenção dá ${e.avisoConvencao.dias} dia(s) a mais de aviso na dispensa (${e.avisoConvencao.regra}); no acordo do art. 484-A, confira se ela se aplica.`);
        const dias = legal + extra;
        r.diasAviso = dias;
        if (extra) r.memoria.push(`Aviso prévio da convenção: ${extra} dia(s) além dos ${legal} da Lei 12.506/2011 (${e.avisoConvencao!.regra}), indenizados e projetados no contrato.`);
        // Dias pagos do aviso: no acordo (art. 484-A, I, "a"), a metade do indenizado, inclusive meio dia.
        let pagos = 0;
        if (e.aviso === 'trabalhado') {
            indenizados = Math.max(0, dias - 30);
            pagos = metade ? indenizados / 2 : indenizados;
            r.memoria.push(`Aviso prévio de ${dias} dias (Lei 12.506/2011): 30 trabalhados${indenizados ? ` e ${indenizados} indenizados${metade ? `, ${rotuloMetade} = ${num(pagos)}` : ''}` : ''}.`);
        } else {
            indenizados = metade ? Math.floor(dias / 2) : dias;
            pagos = metade ? dias / 2 : dias;
            r.memoria.push(`Aviso prévio indenizado: ${dias} dias (Lei 12.506/2011)${metade ? `, ${rotuloMetade} = ${num(pagos)}` : ''}.`);
            if (e.aviso !== 'indenizado') r.avisos.push('Na dispensa pelo empregador, o aviso é trabalhado ou indenizado; calculado como indenizado.');
        }
        if (pagos) {
            const v = Math.round(diaria * pagos);
            verba({ codigo: 'AVISO', descricao: 'Aviso prévio indenizado', referencia: `${num(pagos)} dias`, tipo: 'provento', valor: v, inss: false, fgts: true, irrf: false });
            fgtsBase += v;
        }
        r.dataProjetada = somarDias(data, indenizados);
        if (indenizados) r.memoria.push(`Projeção do aviso: fim do contrato em ${br(r.dataProjetada)} para 13º e férias (é a data projetada do S-2299).`);
        if (d.dataProjetadaAviso && d.dataDesligamento === data && d.dataProjetadaAviso !== r.dataProjetada) r.avisos.push(`O S-2299 informou o fim projetado em ${br(d.dataProjetadaAviso)}; o cálculo projetou ${br(r.dataProjetada)}. Confira os dias de aviso.`);
    } else if (tipo === '07' && e.aviso === 'nao-cumprido') {
        verba({ codigo: 'AVISODESC', descricao: 'Aviso prévio não cumprido (desconto)', referencia: '30 dias', tipo: 'desconto', valor: Math.round(diaria * 30), inss: false, fgts: false, irrf: false });
        r.memoria.push('Pedido de demissão sem cumprir o aviso: desconto de 30 dias (art. 487, § 2º).');
    } else if (tipo === '03') {
        if (d.fimContrato && dataValida(d.fimContrato) && d.fimContrato > data) {
            const restantes = diasEntre(data, d.fimContrato);
            const v = Math.round(diaria * restantes / 2);
            verba({ codigo: 'ART479', descricao: 'Indenização do art. 479 da CLT', referencia: `${restantes} dias ÷ 2`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
            r.memoria.push(`Art. 479: metade da remuneração dos ${restantes} dias até o fim do contrato (${br(d.fimContrato)}) = ${reais(v)}.`);
        } else r.avisos.push('Término antecipado: informe o fim do contrato na ficha para calcular a indenização do art. 479.');
    } else if (tipo === '04') {
        if (!e.indenizacao480) r.avisos.push('Término antecipado pelo empregado: a indenização do art. 480 não foi descontada. Para descontar (metade da remuneração dos dias que faltavam), marque "Indenização do art. 480".');
        else if (d.fimContrato && dataValida(d.fimContrato) && d.fimContrato > data) {
            const restantes = diasEntre(data, d.fimContrato);
            const v = Math.round(diaria * restantes / 2);
            verba({ codigo: 'ART480', descricao: 'Indenização do art. 480 da CLT', referencia: `${num(restantes / 2)} dias`, tipo: 'desconto', valor: v, inss: false, fgts: false, irrf: false });
            r.memoria.push(`Art. 480: metade da remuneração dos ${restantes} dias até o fim do contrato (${br(d.fimContrato)}) = ${num(restantes / 2)} dias × ${reais(Math.round(diaria))} = ${reais(v)}, descontada (o teto do § 1º é o valor do art. 479).`);
        } else r.avisos.push('Indenização do art. 480: informe o fim do contrato na ficha (Ident. Adm.) para calcular o desconto.');
    }
    else if (tipo === '27') {
        r.memoria.push('Força maior (arts. 501 e 502): sem aviso prévio; 13º e férias proporcionais integrais; multa do FGTS de 20% (Lei 8.036/1990, art. 18, § 2º).');
        r.avisos.push('Força maior: a extinção precisa ser do estabelecimento ou da empresa e o fato, imprevisível e alheio ao empregador (art. 501). Contrato a termo tem a indenização do art. 479 pela metade (art. 502, III): lance no movimento, se for o caso.');
    } else if (tipo === '08') r.memoria.push('Rescisão por interesse do empregado (arts. 394 e 483, § 1º): sem aviso prévio de nenhuma das partes.');
    else if (tipo === '41' || tipo === '42') r.memoria.push('Extinção antecipada da aprendizagem (art. 433): sem aviso prévio e sem as indenizações dos arts. 479 e 480 (art. 433, § 2º).');
    else if (tipo === '09') r.memoria.push('Opção do empregado pelo falecimento do empregador individual (art. 483, § 2º): sem aviso prévio de nenhuma das partes e sem multa do FGTS; saque liberado (Lei 8.036/1990, art. 20, II).');
    else if (tipo === '49') r.memoria.push('Falecimento do empregador doméstico sem continuação: extinção sem culpa do empregado; sem aviso prévio; os 3,2% vão para o empregado (LC 150/2015, art. 22).');
    if (tipo === '26') {
        r.memoria.push('Fato do príncipe (art. 486): verbas da dispensa sem justa causa, com o aviso prévio; a indenização (a multa de 40% do FGTS) fica a cargo do governo responsável.');
        r.avisos.push('Fato do príncipe (art. 486): a guia rescisória do FGTS sai com a multa pelo FGTS Digital; o ressarcimento do governo responsável é pedido à parte (art. 486, § 1º). Confira com o jurídico antes de pagar.');
    }
    if (tipo === '47' || tipo === '48') r.memoria.push(`${tipo === '47' ? 'Encerramento da atividade' : 'Falecimento do empregador individual sem continuação (art. 485)'}: verbas da dispensa sem justa causa, com o aviso prévio (TST, Súmula 44) e a multa de 40%.`);

    // 3. 13º proporcional e sobre o aviso indenizado.
    if (!justa) {
        const ano = Number(data.slice(0, 4));
        // Intermitente: o 13º proporcional já foi pago a cada convocação; da projeção do aviso, 1/12 por 30 dias (15 ou mais, 1/12).
        const avosReal = interm ? 0 : avosDoAno(ano, fichaDeslig, e.afastamentos, e.movimentos).filter(m => m.conta).length;
        const fichaProj = { ...ficha, dados: { ...d, dataDesligamento: r.dataProjetada } };
        const avosProj = interm ? 0 : avosDoAno(ano, fichaProj, e.afastamentos, e.movimentos).filter(m => m.conta).length;
        // Projeção que entra no ano seguinte: os avos de lá (15 dias ou mais) também são do aviso.
        const avosSeguinte = !interm && r.dataProjetada > `${ano}-12-31` ? avosDoAno(ano + 1, fichaProj, e.afastamentos, e.movimentos).filter(m => m.conta).length : 0;
        const avosAviso = interm ? avosDaProjecao(indenizados) : Math.max(0, avosProj - avosReal) + avosSeguinte;
        // Culpa recíproca: metade do 13º (TST, Súmula 14).
        const fator = tipo === '05' ? 0.5 : 1;
        const prop = Math.round(remuneracao * avosReal / 12 * fator);
        const ind = Math.round(remuneracao * avosAviso / 12 * fator);
        if (fator !== 1) r.memoria.push('Culpa recíproca: 13º, aviso prévio e férias proporcionais pela metade (TST, Súmula 14).');
        verba({ codigo: '13PROP', descricao: '13º salário proporcional', referencia: `${avosReal}/12`, tipo: 'provento', valor: prop, inss: true, fgts: true, irrf: true });
        // O reflexo do aviso indenizado no 13º é remuneração: tem INSS (Nota PGFN/CRJ 485/2016).
        verba({ codigo: '13IND', descricao: '13º sobre o aviso indenizado', referencia: `${avosAviso}/12`, tipo: 'provento', valor: ind, inss: true, fgts: true, irrf: true });
        r.memoria.push(`13º: ${reais(remuneracao)} × ${avosReal}/12 = ${reais(prop)}${ind ? `; projeção do aviso + ${avosAviso}/12${avosSeguinte ? ` (${avosSeguinte} de ${ano + 1})` : ''} = ${reais(ind)}` : ''}.`);
        // Sem o adiantamento informado: a 1ª parcela paga com as férias do ano, antes do desligamento (Lei 4.749/1965, art. 2º, § 2º).
        const nasFerias = e.adiantamento13 === undefined && !interm ? primeiraParcelaNasFerias({ ano, ficha, afastamentos: e.afastamentos, tabelas: e.tabelas, movimentos: e.movimentos }) : null;
        const feriasAntes = nasFerias && nasFerias.valor > 0 && nasFerias.pagamento <= data.slice(0, 7) ? nasFerias : null;
        const adiantado = e.adiantamento13 ?? feriasAntes?.valor ?? 0;
        if (feriasAntes) r.memoria.push(`Adiantamento do 13º: ${reais(feriasAntes.valor)}, a 1ª parcela paga com as férias de ${br(feriasAntes.gozo.dtInicio)} (informe outro valor se o pago foi diferente).`);
        if (adiantado) verba({ codigo: '13ADT', descricao: 'Adiantamento do 13º', referencia: '', tipo: 'desconto', valor: adiantado, inss: false, fgts: false, irrf: false });
        else if (!interm && data.slice(5, 7) === '12') r.avisos.push('Desligamento em dezembro: se a 1ª parcela do 13º já foi paga, informe o adiantamento.');
        else if (prop) r.avisos.push('Se o 13º foi adiantado no ano (nas férias, por exemplo), informe o adiantamento: senão ele sai inteiro.');
        // O adiantamento já teve FGTS quando foi pago: só o restante entra na base rescisória.
        fgtsBase += Math.max(0, prop - adiantado) + ind;
        if (adiantado) r.memoria.push(`FGTS do 13º: ${reais(Math.max(0, prop - adiantado))} (proporcional − adiantamento, que já teve FGTS) + ${reais(ind)}.`);
        const tInss = tabelaVigente(e.tabelas, 'inss', data.slice(0, 7));
        let inss13 = 0;
        if ('erro' in tInss) erro(tInss.erro);
        else if (prop + ind) { const x = inssDetalhado(prop + ind, tInss.tabela); inss13 = x.valor; r.memoria.push(`INSS do 13º (em separado, proporcional + aviso indenizado): ${x.memoria}.`); }
        verba({ codigo: 'INSS13', descricao: 'INSS sobre 13º', referencia: '', tipo: 'desconto', valor: inss13, inss: false, fgts: false, irrf: false });
        const tIr = tabelaVigente(e.tabelas, 'irrf', pagamento);
        if ('erro' in tIr) erro(`IRRF: ${tIr.erro}`);
        else if (prop + ind) {
            // Pensão sobre o 13º da rescisão (movimento do mês do desligamento): desconto e dedução no IRRF do 13º.
            let pensao13 = Math.max(0, Math.round(e.movimentos[comp]?.pensao13 ?? 0));
            // Pensão em % (a fórmula do SAGE), sem valor informado: sobre o 13º da rescisão menos o INSS dele.
            const pctPensao13 = pensao13 ? null : percentualDaPensao(e.movimentos, comp);
            if (pctPensao13) {
                pensao13 = Math.round(Math.max(0, prop + ind - inss13) * pctPensao13.pct / 100);
                r.memoria.push(`Pensão alimentícia sobre o 13º da rescisão: ${pctPensao13.pct.toLocaleString('pt-BR')}% (movimento de ${rotuloCompetencia(pctPensao13.competencia)}) de (${reais(prop + ind)} − INSS ${reais(inss13)}) = ${reais(pensao13)}.`);
            }
            if (pensao13) verba({ codigo: 'PENSAO13', descricao: 'Pensão alimentícia sobre 13º', referencia: pctPensao13 ? `${pctPensao13.pct.toLocaleString('pt-BR')}%` : '', tipo: 'desconto', valor: pensao13, inss: false, fgts: false, irrf: false });
            const x = irrfDetalhado({ rendimento: prop + ind, inss: inss13, dependentes: ficha.dependentes.filter(y => y.irrf === 'S' && y.pensao !== 'S').length, pensao: pensao13, tabela: tIr.tabela, opcoes, rotulo: 'IRRF do 13º (exclusivo na fonte)' });
            r.memoria.push(...x.memoria);
            const deps13 = ficha.dependentes.filter(y => y.irrf === 'S' && y.pensao !== 'S');
            r.deducoes13 = { simplificado: x.simplificado, dependentes: deps13.map(y => ({ cpf: y.cpf, nome: y.nome })), porDependente: tIr.tabela.valores.deducaoDependente ?? 0, pensao: pensao13 };
            verba({ codigo: 'IRRF13', descricao: 'IRRF sobre 13º', referencia: '', tipo: 'desconto', valor: x.valor, inss: false, fgts: false, irrf: false });
        }
    } else r.memoria.push('Justa causa: sem 13º proporcional, férias proporcionais e aviso prévio.');

    // 4. Férias vencidas e proporcionais (indenizadas: sem INSS, FGTS e IRRF).
    const gozos = e.afastamentos.filter(a => a.motivo === '15' && a.dtInicio <= data);
    // Intermitente: as férias foram pagas a cada convocação; só a projeção do aviso indenizado (avos × média + 1/3).
    const periodos = interm ? [] : periodosAquisitivos(d.admissao, r.dataProjetada, ficha.id, e.afastamentos, e.movimentos, gozos);
    if (interm && !justa && indenizados) {
        const avos = avosDaProjecao(indenizados);
        const v = Math.round(remuneracao * avos / 12); const vt = Math.round(v / 3);
        verba({ codigo: 'FP', descricao: 'Férias indenizadas sobre o aviso prévio', referencia: `${avos}/12`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
        verba({ codigo: 'FP13', descricao: '1/3 sobre as férias do aviso prévio', referencia: '', tipo: 'provento', valor: vt, inss: false, fgts: false, irrf: false });
        if (v) r.memoria.push(`Intermitente: férias sobre a projeção do aviso: ${reais(remuneracao)} × ${avos}/12 = ${reais(v)} + 1/3 ${reais(vt)} (indenizadas).`);
    }
    for (const p of periodos) {
        if (p.perdido) { r.memoria.push(`Férias de ${br(p.inicio)} a ${br(p.fim)}: perdidas (${p.perdido}).`); continue; }
        if (p.fim <= r.dataProjetada) {
            const saldo = Math.max(0, p.direito - p.consumido);
            if (!saldo) continue;
            const v = Math.round(diaria * saldo); const vt = Math.round(v / 3);
            const dobra = p.fimConcessivo < data;
            verba({ codigo: `FV${p.inicio}`, descricao: `Férias vencidas ${p.inicio.slice(0, 4)}/${p.fim.slice(0, 4)}`, referencia: `${saldo} dias`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
            verba({ codigo: `FV13${p.inicio}`, descricao: '1/3 sobre férias vencidas', referencia: '', tipo: 'provento', valor: vt, inss: false, fgts: false, irrf: false });
            if (dobra) {
                verba({ codigo: `FVD${p.inicio}`, descricao: 'Dobra das férias vencidas (art. 137)', referencia: `${saldo} dias`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
                verba({ codigo: `FVD13${p.inicio}`, descricao: '1/3 sobre a dobra', referencia: '', tipo: 'provento', valor: vt, inss: false, fgts: false, irrf: false });
            }
            r.memoria.push(`Férias vencidas do período ${br(p.inicio)} a ${br(p.fim)}: ${saldo} dias${p.consumido ? ` (direito ${p.direito} − ${p.consumido} usados)` : ''} = ${reais(v)} + 1/3 ${reais(vt)}${dobra ? `, em dobro (concessivo até ${br(p.fimConcessivo)})` : ''}.`);
        } else if (!justa) {
            let avos = 0;
            for (let m = 0; m < 12; m++) {
                const ini = somarMeses(p.inicio, m); const fim = somarDias(somarMeses(p.inicio, m + 1), -1);
                if (ini > r.dataProjetada) break;
                if (r.dataProjetada >= fim || diasEntre(ini, r.dataProjetada) + 1 >= 15) avos++;
            }
            const faltas = mesesDoPeriodo(p.inicio, r.dataProjetada).reduce((s, c) => s + Math.floor(e.movimentos[c]?.faltasDias ?? 0), 0);
            const direito = diasDeDireito(faltas);
            const v = Math.round(diaria * direito * avos / 12 * (tipo === '05' ? 0.5 : 1)); const vt = Math.round(v / 3);
            verba({ codigo: 'FP', descricao: 'Férias proporcionais', referencia: `${avos}/12`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
            verba({ codigo: 'FP13', descricao: '1/3 sobre férias proporcionais', referencia: '', tipo: 'provento', valor: vt, inss: false, fgts: false, irrf: false });
            r.memoria.push(`Férias proporcionais do período ${br(p.inicio)} a ${br(p.fim)}: ${avos}/12 de ${direito} dias${faltas ? ` (${faltas} faltas)` : ''} = ${reais(v)} + 1/3 ${reais(vt)}.`);
        }
    }

    const vencidas = r.verbas.filter(v => /^FV\d{4}-/.test(v.codigo)).length;
    if (vencidas > 1 || r.verbas.some(v => v.codigo.startsWith('FVD'))) {
        r.avisos.unshift(`${vencidas} período(s) de férias vencidas${r.verbas.some(v => v.codigo.startsWith('FVD')) ? ', com dobra' : ''}: confira se as férias já tiradas estão lançadas em Cadastros › Afastamentos (motivo 15). Sem elas, o motor as considera não gozadas.`);
        if (r.situacao === 'calculado') r.situacao = 'incompleto';
    }

    // 5. FGTS e multa (paga por guia, fora do líquido).
    r.bases.fgts = fgtsBase;
    r.bases.inss = mes.bases.inss + (r.verbas.find(v => v.codigo === '13PROP')?.valor ?? 0);
    r.bases.irrf = mes.bases.irrf + r.verbas.filter(v => v.codigo === '13PROP' || v.codigo === '13IND').reduce((s, v) => s + v.valor, 0);
    r.fgts = Math.round(fgtsBase * aliqFgts / 100);
    r.memoria.push(`FGTS do mês e rescisório: ${reais(fgtsBase)} × ${aliqFgts}% = ${reais(r.fgts)}.`);
    r.percentualMulta = domestico ? 0 : DISPENSA.includes(tipo) || tipo === '03' ? 40 : tipo === '33' || tipo === '05' || tipo === '27' ? 20 : 0;
    r.saqueFgts = tipo === '33' ? 'Saque de até 80% do saldo do FGTS (art. 484-A, § 1º); sem seguro-desemprego.'
        : tipo === '10' ? 'Saque do FGTS pelos dependentes habilitados na Previdência ou, sem eles, pelos sucessores (Lei 8.036/1990, art. 20, IV; Lei 6.858/1980).'
        : tipo === '05' ? 'Saque do saldo do FGTS liberado (Lei 8.036/1990, art. 20, I), com a multa de 20% (art. 18, § 2º); sem seguro-desemprego.'
        : tipo === '27' ? 'Saque do saldo do FGTS liberado (Lei 8.036/1990, art. 20, I), com a multa de 20% (art. 18, § 2º).'
        : tipo === '47' || tipo === '48' || tipo === '26' ? 'Saque do saldo do FGTS liberado (Lei 8.036/1990, art. 20, I e II), com a multa de 40%.'
        : tipo === '09' ? 'Saque do saldo do FGTS liberado (Lei 8.036/1990, art. 20, II: falecimento do empregador individual); sem multa.'
        : tipo === '49' ? 'Saque do saldo do FGTS liberado, com os 3,2% da indenização compensatória (LC 150/2015, art. 22).'
        : PERMITE_SAQUE_FGTS.includes(tipo) ? 'Saque do saldo do FGTS liberado.' : 'Sem saque do FGTS por este motivo.';
    if (domestico) {
        // Fim do contrato a termo: o eSocial Doméstico gera o DAE do mês só com os 8%, sem os 3,2%.
        r.fgtsIndenizacao = tipo === '06' ? 0 : indenizacaoCompensatoria(fgtsBase);
        const destino = destinoIndenizacao(tipo);
        r.memoria.push(tipo === '06' ? 'Indenização compensatória (3,2%): não incide no mês do fim do contrato a termo.' : `Indenização compensatória do doméstico: ${reais(fgtsBase)} × 3,2% = ${reais(r.fgtsIndenizacao)} (LC 150/2015, art. 22).`,
            'Sem multa de 40%: no doméstico, os 3,2% depositados mês a mês fazem esse papel.', destino.texto);
        if (destino.quem === 'conferir') r.avisos.push(destino.texto);
        if (['02', '03'].includes(tipo)) r.avisos.push('Seguro-desemprego do doméstico: 3 parcelas de um salário mínimo, para quem trabalhou 15 meses nos últimos 24 (LC 150/2015, art. 26). Guia pelo Empregador Web.');
    }
    if (r.percentualMulta) {
        if (e.saldoFgts === undefined) r.avisos.push(`Informe o saldo do FGTS para fins rescisórios (extrato do FGTS Digital) para calcular a multa de ${r.percentualMulta}%.`);
        else {
            r.multaFgts = Math.round((e.saldoFgts + r.fgts) * r.percentualMulta / 100);
            r.memoria.push(`Multa do FGTS: (${reais(e.saldoFgts)} + ${reais(r.fgts)}) × ${r.percentualMulta}% = ${reais(r.multaFgts)}, recolhida por guia no FGTS Digital.`);
        }
    }
    r.memoria.push(r.saqueFgts);

    // Crédito do Trabalhador: a parcela do mês (ou o saldo informado pela instituição) das verbas rescisórias, até 35%
    // da verba disponível (Lei 10.820/2003); o que não couber a instituição cobra do ex-empregado.
    const consig = descontosConsignado(ficha.consignados, comp, r.verbas, { rescisao: true });
    for (const v of consig.verbas) r.verbas.push(v);
    if (consig.memoria.length) r.memoria.push(...consig.memoria);
    r.avisos.push(...consig.avisos);

    // Falecimento: os valores vão aos dependentes ou sucessores; sem IRRF na rescisão do falecido (MOS, S-2299, item 11.1).
    if (tipo === '10') {
        const ir = r.verbas.filter(v => v.codigo === 'IRRF' || v.codigo === 'IRRF13').reduce((s, v) => s + v.valor, 0);
        r.verbas = r.verbas.filter(v => v.codigo !== 'IRRF' && v.codigo !== 'IRRF13');
        r.memoria.push(`Falecimento: sem IRRF na rescisão${ir ? ` (os ${reais(ir)} calculados não são retidos)` : ''}; o S-2299 vai com indApurIR 1 e sem S-1210, e a retenção, se houver, é com o CPF de quem recebe, na EFD-Reinf (MOS, S-2299, item 11.1).`);
        r.avisos.push('Falecimento: pague aos dependentes habilitados na Previdência ou, sem eles, aos sucessores indicados em alvará judicial (Lei 6.858/1980). A data do desligamento é a do óbito.');
    }
    if (percentualDaPensao(e.movimentos, comp)) r.avisos.push('Pensão em %: entra no saldo de salário e no 13º. Se a decisão também alcança as férias indenizadas ou o aviso prévio indenizado, lance a pensão sobre eles nos eventos da rescisão.');
    if (semAmparo) { r.avisos.unshift(semAmparo); if (r.situacao === 'calculado') r.situacao = 'incompleto'; }
    if (tipo === '17') r.avisos.push('Rescisão indireta reconhecida em juízo: o S-2299 vai com o número do processo e sem as verbas, e os valores pelo S-2500 (MOS, S-2299, item 20). O S-2299 com as verbas é para a rescisão indireta reconhecida pelo empregador.');
    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    if (r.totais.liquido < 0) {
        // Como o SAGE: a "Insuficiência de saldo" (natureza 2930) completa os proventos e o líquido fica zero. O que
        // passou continua sendo dívida do empregado, cobrada à parte; a rescisão não sai negativa.
        const falta = -r.totais.liquido;
        verba({ codigo: 'INSUFSALDO', descricao: 'Insuficiência de saldo rescisório', referencia: '', tipo: 'provento', valor: falta, inss: false, fgts: false, irrf: false });
        r.totais.proventos += falta;
        r.totais.liquido = 0;
        r.memoria.push(`Insuficiência de saldo: os descontos passaram dos proventos em ${reais(falta)}; a verba completa os proventos e o líquido fica zero.`);
        r.avisos.push(`Insuficiência de saldo de ${reais(falta)}: o empregado continua devendo esse valor (cobrança fora da rescisão). Na rescisão, a compensação é limitada a uma remuneração (CLT, art. 477, § 5º): confira os descontos.`);
    }
    r.memoria.push(`Competência do INSS e FGTS: ${rotuloCompetencia(data.slice(0, 7))}.`);
    return r;
}
