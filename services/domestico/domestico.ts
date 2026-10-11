// services/domestico/domestico.ts
//
// Empregado doméstico (categoria 104 do eSocial; LC 150/2015): caseiro, cozinheira, babá, cuidador, motorista
// particular, jardineiro… Folha calculada pelo mesmo motor, com as regras próprias:
// - FGTS de 8% e mais 3,2% de indenização compensatória (art. 22), que substitui a multa de 40% na dispensa;
// - encargos do empregador no DAE do eSocial Doméstico: INSS patronal 8% e GILRAT 0,8% (art. 34), com o INSS do
//   empregado, o IRRF, o FGTS e os 3,2%; vence no dia 7 do mês seguinte (art. 35), antecipado se não for dia útil;
// - doença: o INSS paga desde o primeiro dia (o empregador doméstico não paga os 15 primeiros; Lei 8.213/1991, art. 60);
// - salário-maternidade pago direto pelo INSS (Lei 8.213/1991, art. 73, I), com FGTS sobre a remuneração do período;
// - férias fracionadas em até 2 períodos, um com 14 dias ou mais (art. 17, § 2º).

import type { ResultadoCalculo } from '../calculo/motorMensal';
import { diaUtilAnterior, somarMeses } from '../prazos/calendario';
import { reais } from '../cadastros/documentos';

export const CATEGORIA_DOMESTICO = '104';
export const ehDomestico = (categoria?: string) => (categoria ?? '') === CATEGORIA_DOMESTICO;

/** Indenização compensatória da perda do emprego: 3,2% da remuneração (LC 150/2015, art. 22). */
export const ALIQUOTA_INDENIZACAO = 3.2;
export const ALIQUOTA_PATRONAL = 8;
export const ALIQUOTA_GILRAT = 0.8;

export const indenizacaoCompensatoria = (baseFgts: number) => Math.round(baseFgts * 32 / 1000);

/** Funções domésticas comuns e o CBO. As marcadas "conferido" foram confirmadas na CBO; as demais, conferir na tabela. */
export const FUNCOES_DOMESTICAS: { cbo: string; titulo: string; conferido: boolean }[] = [
    { cbo: '512105', titulo: 'Empregado doméstico nos serviços gerais (inclui caseiro)', conferido: true },
    { cbo: '516205', titulo: 'Babá', conferido: true },
    { cbo: '513210', titulo: 'Cozinheiro do serviço doméstico', conferido: false },
    { cbo: '516210', titulo: 'Cuidador de idosos', conferido: false },
    { cbo: '622010', titulo: 'Jardineiro', conferido: false },
    { cbo: '782305', titulo: 'Motorista de carro de passeio (particular)', conferido: false },
];

export type QuemMovimenta = 'empregado' | 'empregador' | 'metade' | 'conferir';

/**
 * Destino dos 3,2% depositados no contrato, pelo motivo do desligamento (LC 150/2015, art. 22): na dispensa sem justa
 * causa, o empregado saca; na justa causa, no pedido de demissão, no fim do contrato a termo, na aposentadoria e no
 * falecimento, o empregador movimenta; na culpa recíproca, metade para cada.
 */
export function destinoIndenizacao(tipo: string): { quem: QuemMovimenta; texto: string } {
    if (['02', '03'].includes(tipo)) return { quem: 'empregado', texto: 'Os 3,2% depositados no contrato vão para o empregado, que saca com o FGTS (LC 150/2015, art. 22).' };
    if (['01', '07', '06', '04'].includes(tipo)) return { quem: 'empregador', texto: 'Os 3,2% depositados no contrato voltam para o empregador, que os movimenta (LC 150/2015, art. 22, § 1º).' };
    if (tipo === '05') return { quem: 'metade', texto: 'Culpa recíproca: metade dos 3,2% para cada parte (LC 150/2015, art. 22, § 2º).' };
    return { quem: 'conferir', texto: 'A LC 150/2015 não trata deste motivo para os 3,2%: confira o destino no eSocial Doméstico antes de pagar.' };
}

/** Vencimento do DAE da competência: dia 7 do mês seguinte, antecipado para o dia útil anterior (LC 150/2015, art. 35). */
export function vencimentoDae(competencia: string): string {
    return diaUtilAnterior(`${somarMeses(`${competencia}-01`, 1).slice(0, 7)}-07`);
}

export interface ItemDae { rotulo: string; base: number; aliquota: string; valor: number }
export interface DaeDomestico { competencia: string; vencimento: string; empregados: number; itens: ItemDae[]; total: number; avisos: string[] }

const soma = (rs: ResultadoCalculo[], codigos: string[]) => rs.reduce((s, r) => s + r.verbas.filter(v => codigos.includes(v.codigo)).reduce((t, v) => t + v.valor, 0), 0);

/**
 * O DAE da folha mensal dos domésticos, para conferir com o gerado no eSocial Doméstico: INSS do empregado (retido),
 * INSS patronal 8%, GILRAT 0,8%, FGTS 8%, indenização compensatória 3,2% e IRRF, menos o salário-família pago.
 */
export function calcularDae(resultados: ResultadoCalculo[], competencia: string): DaeDomestico {
    const rs = resultados.filter(r => r.situacao !== 'erro');
    const baseInss = rs.reduce((s, r) => s + r.bases.inss, 0);
    const baseFgts = rs.reduce((s, r) => s + r.bases.fgts, 0);
    const itens: ItemDae[] = [
        { rotulo: 'INSS do empregado (descontado)', base: baseInss, aliquota: 'tabela', valor: soma(rs, ['INSS', 'INSSFERRET']) },
        { rotulo: 'INSS do empregador', base: baseInss, aliquota: '8%', valor: Math.round(baseInss * ALIQUOTA_PATRONAL / 100) },
        { rotulo: 'Seguro contra acidentes (GILRAT)', base: baseInss, aliquota: '0,8%', valor: Math.round(baseInss * 8 / 1000) },
        { rotulo: 'FGTS', base: baseFgts, aliquota: '8%', valor: rs.reduce((s, r) => s + r.fgts, 0) },
        { rotulo: 'Indenização compensatória (FGTS)', base: baseFgts, aliquota: '3,2%', valor: rs.reduce((s, r) => s + (r.fgtsIndenizacao ?? 0), 0) },
        { rotulo: 'IRRF', base: rs.reduce((s, r) => s + r.bases.irrf, 0), aliquota: 'tabela', valor: soma(rs, ['IRRF', 'IRRFFERRET']) },
        { rotulo: 'Salário-família pago (dedução)', base: 0, aliquota: '', valor: -soma(rs, ['SF']) },
    ];
    const avisos: string[] = [];
    if (rs.some(r => r.situacao === 'incompleto')) avisos.push('Há holerite incompleto: o DAE muda quando ele for completado.');
    if (rs.some(r => r.verbas.some(v => v.codigo === 'FERMES'))) avisos.push('Férias no mês: o INSS e o IRRF das férias entram no DAE da competência do pagamento do recibo; confira no eSocial Doméstico.');
    return { competencia, vencimento: vencimentoDae(competencia), empregados: rs.length, itens, total: itens.reduce((s, i) => s + i.valor, 0), avisos };
}

export const resumoDae = (d: DaeDomestico) => `DAE de ${d.competencia.slice(5)}/${d.competencia.slice(0, 4)}: ${reais(d.total)}, vence em ${d.vencimento.split('-').reverse().join('/')}.`;
