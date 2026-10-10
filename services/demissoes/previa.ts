// services/demissoes/previa.ts
//
// Demissões › Prévia de rescisão (Paulo, 10/10/2026: "um dos pedidos que mais nos demanda tempo e trabalho são
// cálculo de prévia de rescisões; devemos criar este modal com os valores válidos, geração de relatórios, envio e
// ou impressão aos clientes, sem a necessidade de validar a rescisão junto ao eSocial").
//
// Cada cenário (motivo, aviso, data) é a rescisão do motor (calcularRescisao), a mesma do TRCT. Por cima dela:
// - o custo da empresa: verbas brutas + FGTS do mês e rescisório + multa do FGTS + parte patronal (CPP, RAT,
//   terceiros) pelo enquadramento vigente;
// - os alertas que mudam a decisão: afastamento em aberto, contrato a termo, férias em dobro, data-base;
// - a estimativa do saldo do FGTS quando o extrato não foi informado (só para a multa, sempre dita como estimativa).
// Nada aqui vai ao eSocial nem grava a ficha: é simulação.

import { calcularRescisao, PERMITE_SAQUE_FGTS, TIPOS_RESCISAO, type AvisoPrevio, type ResultadoRescisao, type TipoRescisao } from '../calculo/motorRescisao';
import { salarioContratual, type Movimento } from '../calculo/motorMensal';
import type { OpcoesIrrf } from '../calculo/tributos';
import { fichaNaData, type FichaFuncionario } from '../cadastros/funcionarios';
import { emAberto, rotuloMotivo, type Afastamento } from '../cadastros/afastamentos';
import type { TabelaLegal } from '../cadastros/tabelasLegais';
import type { Sindicato } from '../cadastros/sindicatos';
import { calcularPatronal, type Enquadramento, type Patronal } from '../cadastros/enquadramento';
import { reais } from '../cadastros/documentos';
import { diasEntre, somarDias, somarMeses } from '../prazos/calendario';

export interface CenarioDemissao { id: string; tipo: TipoRescisao; aviso: AvisoPrevio; data: string }

/** Os três cenários que o cliente mais pergunta: dispensa, pedido de demissão e acordo. */
export function cenariosPadrao(data: string): CenarioDemissao[] {
    return [
        { id: 'c1', tipo: '02', aviso: 'indenizado', data },
        { id: 'c2', tipo: '07', aviso: 'trabalhado', data },
        { id: 'c3', tipo: '33', aviso: 'indenizado', data },
    ];
}

export interface CustoDemissao {
    proventos: number; descontos: number; liquido: number;
    /** FGTS do mês e rescisório (depósito na guia). */
    fgts: number;
    /** Multa do FGTS (40% ou 20%); estimada quando o saldo não foi informado. */
    multaFgts: number;
    multaEstimada: boolean;
    /** CPP + RAT + terceiros sobre a base do INSS (no Simples, no DAS: zero aqui). */
    patronal: Patronal | null;
    /** Indenização adicional da data-base (Lei 7.238/1984, art. 9º), quando cabe. */
    indenizacaoDataBase: number;
    /** Tudo o que sai do caixa da empresa por causa da rescisão. */
    total: number;
}

export interface ResultadoCenario { cenario: CenarioDemissao; r: ResultadoRescisao; custo: CustoDemissao; alertas: string[] }

export interface EntradaPrevia {
    ficha: FichaFuncionario;
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    movimentos: Record<string, Movimento>;
    cenarios: CenarioDemissao[];
    /** Saldo do FGTS para fins rescisórios (extrato), em centavos. Sem ele, a multa é estimada. */
    saldoFgts?: number;
    adiantamento13?: number;
    enquadramento?: Enquadramento;
    sindicato?: Sindicato;
    opcoes?: OpcoesIrrf;
    regimePagamento?: (competencia: string) => string;
}

const br = (d: string) => d.split('-').reverse().join('/');
const ALIQUOTA = (f: FichaFuncionario) => ((f.dados.categoria ?? '').replace(/\D/g, '') === '103' ? 0.02 : 0.08);

/**
 * Saldo do FGTS estimado pelos depósitos do contrato: alíquota × salário de cada mês (pelo histórico da ficha), mais
 * o 13º e o 1/3 de férias proporcionais (1/12 e 1/36 ao mês). Sem a correção (JAM), sem saques e sem as variáveis:
 * fica ABAIXO do saldo real. Serve só para a ordem de grandeza da multa; o valor certo é o do extrato.
 */
export function saldoFgtsEstimado(ficha: FichaFuncionario, ate: string): number {
    const adm = ficha.dados.admissao ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(adm) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || ate < adm) return 0;
    const aliq = ALIQUOTA(ficha);
    let total = 0;
    for (let m = 0; m < 600; m++) {
        const inicio = somarMeses(adm, m);
        if (inicio > ate) break;
        const fim = somarDias(somarMeses(adm, m + 1), -1);
        const dias = Math.min(30, diasEntre(inicio, fim > ate ? ate : fim) + 1);
        const sc = salarioContratual(fichaNaData(ficha, inicio).ficha.dados);
        if ('erro' in sc) continue;
        total += sc.mensal * aliq * (1 + 1 / 12 + 1 / 36) * dias / 30;
    }
    return Math.round(total);
}

const PERCENTUAL_MULTA: Partial<Record<TipoRescisao, number>> = { '02': 40, '03': 40, '33': 20 };

/** Indenização adicional (Lei 7.238/1984, art. 9º; TST, Súmulas 182 e 314): dispensa sem justa causa nos 30 dias antes da data-base, contada a projeção do aviso. */
export function indenizacaoDataBase(r: Pick<ResultadoRescisao, 'tipo' | 'data' | 'dataProjetada'>, sindicato: Sindicato | undefined, salarioMensal: number): { valor: number; dataBase: string } | null {
    if (!sindicato?.dataBase || !/^([1-9]|1[0-2])$/.test(sindicato.dataBase) || !['02', '03'].includes(r.tipo)) return null;
    const fim = r.dataProjetada || r.data;
    const mes = Number(sindicato.dataBase);
    // A próxima data-base a partir do fim do contrato (projetado) e a do ano dele.
    for (const ano of [Number(fim.slice(0, 4)), Number(fim.slice(0, 4)) + 1]) {
        const dataBase = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const dias = diasEntre(fim, dataBase);
        if (dias >= 1 && dias <= 30) return { valor: salarioMensal, dataBase };
    }
    return null;
}

/** Alertas que mudam a decisão (fora as do próprio cálculo, que vêm em r.avisos). */
export function alertasDaDemissao(e: Pick<EntradaPrevia, 'ficha' | 'afastamentos' | 'sindicato'>, c: CenarioDemissao, r: ResultadoRescisao): string[] {
    const a: string[] = []; const d = e.ficha.dados;
    const aberto = e.afastamentos.find(x => x.motivo !== '15' && emAberto(x, c.data));
    if (aberto) a.push(`Afastado em ${br(c.data)} (${rotuloMotivo(aberto.motivo)}, desde ${br(aberto.dtInicio)}): o eSocial só aceita o desligamento depois do fim do afastamento, salvo pedido de demissão e outras exceções do MOS. Confira estabilidade (acidente de trabalho: 12 meses, Lei 8.213/1991, art. 118).`);
    if (d.tipoContrato && d.tipoContrato !== '1' && d.fimContrato && d.fimContrato > c.data) {
        if (c.tipo === '02' || c.tipo === '07') a.push(`Contrato a termo até ${br(d.fimContrato)}: o término antecipado é o motivo 03 (pelo empregador, art. 479) ou 04 (pelo empregado, art. 480), salvo cláusula de rescisão antecipada (art. 481).`);
    }
    if (d.fimContrato && d.fimContrato === c.data && c.tipo !== '06' && d.tipoContrato && d.tipoContrato !== '1') a.push('A data é o fim do contrato a termo: o motivo é 06 (término do contrato), sem aviso prévio nem multa do FGTS.');
    if (r.verbas.some(v => v.codigo.startsWith('FVD'))) a.push('Há férias vencidas em dobro (art. 137): conceder antes da rescisão não evita a dobra, mas confira se o gozo não foi lançado em Cadastros › Afastamentos.');
    if (c.tipo === '33') a.push('Acordo (art. 484-A): aviso indenizado e multa do FGTS pela metade; o trabalhador saca 80% do FGTS e não tem seguro-desemprego.');
    if (c.tipo === '07' && c.aviso === 'nao-cumprido') a.push('Pedido de demissão sem cumprir o aviso: o desconto de 30 dias (art. 487, § 2º) depende de o empregado não ter sido dispensado do cumprimento.');
    const db = indenizacaoDataBase(r, e.sindicato, salarioDoMes(e.ficha, c.data));
    if (db) a.push(`Dispensa nos 30 dias antes da data-base (${br(db.dataBase)}, contada a projeção do aviso): indenização adicional de um salário, ${reais(db.valor)} (Lei 7.238/1984, art. 9º; Súmula 182 do TST). Incluída no custo; avalie mudar a data.`);
    return a;
}

const salarioDoMes = (f: FichaFuncionario, data: string) => { const sc = salarioContratual(fichaNaData(f, data).ficha.dados); return 'erro' in sc ? 0 : sc.mensal; };

/** Calcula cada cenário: a rescisão do motor, o custo da empresa e os alertas. */
export function calcularPrevia(e: EntradaPrevia): ResultadoCenario[] {
    const afs = e.afastamentos.filter(a => a.fichaId === e.ficha.id);
    return e.cenarios.map(c => {
        const pct = PERCENTUAL_MULTA[c.tipo] ?? 0;
        const estimar = pct > 0 && !(e.saldoFgts && e.saldoFgts > 0);
        const saldo = estimar ? saldoFgtsEstimado(e.ficha, c.data) : e.saldoFgts;
        const r = calcularRescisao({ ficha: e.ficha, data: c.data, tipo: c.tipo, aviso: c.aviso, afastamentos: afs, tabelas: e.tabelas, movimentos: e.movimentos,
            saldoFgts: saldo || undefined, adiantamento13: e.adiantamento13, opcoes: e.opcoes, regimePagamento: e.regimePagamento });
        if (estimar) r.avisos = r.avisos.filter(x => !/saldo do FGTS/i.test(x));
        const patronal = e.enquadramento ? calcularPatronal(r.bases.inss, 0, e.enquadramento) : null;
        const db = indenizacaoDataBase(r, e.sindicato, salarioDoMes(e.ficha, c.data));
        const indDb = db?.valor ?? 0;
        const encargos = patronal ? patronal.patronal + patronal.rat + patronal.terceiros : 0;
        const custo: CustoDemissao = {
            proventos: r.totais.proventos, descontos: r.totais.descontos, liquido: r.totais.liquido,
            fgts: r.fgts, multaFgts: r.multaFgts, multaEstimada: estimar && r.multaFgts > 0, patronal, indenizacaoDataBase: indDb,
            total: r.totais.proventos + r.fgts + r.multaFgts + encargos + indDb,
        };
        return { cenario: c, r, custo, alertas: alertasDaDemissao({ ficha: e.ficha, afastamentos: afs, sindicato: e.sindicato }, c, r) };
    });
}

export const rotuloCenario = (c: Pick<CenarioDemissao, 'tipo' | 'aviso'>) => `${TIPOS_RESCISAO[c.tipo]}${['02', '33', '07'].includes(c.tipo) ? ` · aviso ${({ indenizado: 'indenizado', trabalhado: 'trabalhado', dispensado: 'dispensado', 'nao-cumprido': 'não cumprido' } as Record<AvisoPrevio, string>)[c.aviso]}` : ''}`;
export const sacaFgts = (tipo: TipoRescisao) => (tipo === '33' ? 'Saca 80% do FGTS' : PERMITE_SAQUE_FGTS.includes(tipo) ? 'Saca o FGTS' : 'Não saca o FGTS');
/** Seguro-desemprego só na dispensa sem justa causa (e rescisão indireta): aqui, motivos 02 e 03. O direito depende dos meses trabalhados. */
export const podeSeguroDesemprego = (tipo: TipoRescisao) => tipo === '02' || tipo === '03';

/** Resumo gravado no histórico (sem as verbas: elas se recalculam pelos parâmetros). */
export interface ResumoCenario { tipo: TipoRescisao; aviso: AvisoPrevio; data: string; liquido: number; custoTotal: number; multaFgts: number; multaEstimada: boolean }
export const resumoDoCenario = (x: ResultadoCenario): ResumoCenario => ({ tipo: x.cenario.tipo, aviso: x.cenario.aviso, data: x.cenario.data, liquido: x.custo.liquido, custoTotal: x.custo.total, multaFgts: x.custo.multaFgts, multaEstimada: x.custo.multaEstimada });
