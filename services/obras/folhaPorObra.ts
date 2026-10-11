// services/obras/folhaPorObra.ts
//
// Folha por obra (lotação tributária): o rateio dos proventos de cada funcionário entre as obras em que trabalhou no mês
// (dias do movimento, ou a obra da ficha) e os encargos por obra — INSS dos segurados, cota patronal (com a CPRB e a
// reoneração gradual), RAT × FAP (o da obra própria, se diferente), terceiros e FGTS. Puro, sem Firebase.
//
// Regra do rateio: cada provento se divide pelos dias (o centavo que sobra fica na obra com mais dias); descontos ficam
// na obra principal (a de mais dias). É assim que o S-1200 sai, um ideEstabLot por obra, e que as bases do S-5001 e da
// DCTFWeb se formam por lotação.

import type { ResultadoCalculo } from '../calculo/motorMensal';
import { calcularPatronal, type Enquadramento, type Patronal } from '../cadastros/enquadramento';
import { ehObraPropria, type Lotacao } from './lotacoes';

export interface PesoLotacao { codigo: string; peso: number }

/** Divide um valor em centavos pelos pesos; o resto vai para o de maior peso (o primeiro, no empate). */
export function repartir(valor: number, pesos: number[]): number[] {
    const total = pesos.reduce((s, p) => s + p, 0);
    if (!pesos.length || !(total > 0)) return pesos.map((_, i) => (i === 0 ? valor : 0));
    const partes = pesos.map(p => Math.floor(valor * p / total));
    const resto = valor - partes.reduce((s, x) => s + x, 0);
    const maior = pesos.indexOf(Math.max(...pesos));
    partes[maior] += resto;
    return partes;
}

/** Índice da obra principal (a de mais dias; no empate, a primeira). */
export const principal = (lot: PesoLotacao[]) => lot.reduce((m, x, i) => (x.peso > lot[m].peso ? i : m), 0);

/** As verbas do resultado por obra: proventos pelos dias, descontos na principal. Sem obras, tudo na `padrao`. */
export function verbasPorLotacao<V extends { tipo: 'provento' | 'desconto'; valor: number }>(verbas: V[], lotacoes: PesoLotacao[] | undefined, padrao: string): { codigo: string; verbas: V[] }[] {
    const lot = lotacoes?.length ? lotacoes : [{ codigo: padrao, peso: 1 }];
    if (lot.length === 1) return [{ codigo: lot[0].codigo, verbas }];
    const p = principal(lot);
    const out = lot.map(l => ({ codigo: l.codigo, verbas: [] as V[] }));
    for (const v of verbas) {
        if (v.tipo === 'desconto') { out[p].verbas.push(v); continue; }
        repartir(v.valor, lot.map(l => l.peso)).forEach((valor, i) => { if (valor > 0) out[i].verbas.push({ ...v, valor }); });
    }
    return out.filter(x => x.verbas.length);
}

/** Verbas de 13º salário (fora da cota patronal na transição da CPRB). */
const DECIMO = ['13', '13INT', '13PROP', '13IND'];
const INSS_SEGURADO = ['INSS', 'INSS13', 'INSSFERRET'];

export interface EncargosObra {
    codigo: string;
    descricao: string;
    tipo: string;
    funcionarios: number;
    proventos: number;
    baseInss: number;
    inssSegurados: number;
    fgts: number;
    salarioMaternidade: number;
    salarioFamilia: number;
    patronal?: Patronal;
    totalPrevidenciario?: number;
}

/**
 * Encargos por obra na competência. `lotacoes`: o cadastro (Cadastros › Obras e lotações); `padrao`: a lotação dos
 * parâmetros do eSocial, para quem não tem obra. Obra própria com RAT/FAP próprios usa os dela; obra própria com a
 * patronal não substituída (S-1005) paga os 20% inteiros mesmo na CPRB.
 */
export function encargosPorLotacao(resultados: ResultadoCalculo[], lotacoes: Lotacao[], padrao: string, enquadramento?: Enquadramento, competencia?: string): EncargosObra[] {
    const porCodigo = new Map(lotacoes.map(l => [l.codigo, l]));
    const linhas = new Map<string, EncargosObra & { fichas: Set<string>; decimo: number }>();
    const linha = (codigo: string) => {
        let x = linhas.get(codigo);
        if (!x) {
            const l = porCodigo.get(codigo);
            x = { codigo, descricao: l?.descricao ?? (codigo === padrao ? 'Lotação dos parâmetros do eSocial' : 'Lotação não cadastrada'), tipo: l?.tipo ?? '', funcionarios: 0, proventos: 0, baseInss: 0,
                inssSegurados: 0, fgts: 0, salarioMaternidade: 0, salarioFamilia: 0, fichas: new Set(), decimo: 0 };
            linhas.set(codigo, x);
        }
        return x;
    };
    for (const r of resultados.filter(x => x.situacao !== 'erro')) {
        const lot = r.lotacoes?.length ? r.lotacoes : [{ codigo: padrao, peso: 1 }];
        const pesos = lot.map(l => l.peso);
        const p = principal(lot);
        const somar = (f: (i: number, v: number) => void, valor: number, soPrincipal = false) => (soPrincipal ? f(p, valor) : repartir(valor, pesos).forEach((v, i) => f(i, v)));
        const cod = (codigos: string[]) => r.verbas.filter(v => codigos.includes(v.codigo)).reduce((s, v) => s + v.valor, 0);
        lot.forEach(l => linha(l.codigo).fichas.add(r.fichaId));
        somar((i, v) => { linha(lot[i].codigo).proventos += v; }, r.totais.proventos);
        somar((i, v) => { linha(lot[i].codigo).baseInss += v; }, r.bases.inss);
        somar((i, v) => { linha(lot[i].codigo).fgts += v; }, r.fgts);
        somar((i, v) => { linha(lot[i].codigo).salarioMaternidade += v; }, cod(['MAT']));
        somar((i, v) => { linha(lot[i].codigo).decimo += v; }, cod(DECIMO));
        somar((i, v) => { linha(lot[i].codigo).inssSegurados += v; }, cod(INSS_SEGURADO), true);
        somar((i, v) => { linha(lot[i].codigo).salarioFamilia += v; }, cod(['SF']), true);
    }
    return [...linhas.values()].map(({ fichas, decimo, ...x }) => {
        const l = porCodigo.get(x.codigo);
        const obra = l && ehObraPropria(l);
        const patronal = enquadramento ? calcularPatronal(x.baseInss, x.salarioMaternidade, enquadramento, {
            competencia, decimoTerceiro: decimo,
            naoSubstituida: !!(obra && l!.construtora && !l!.substituida),
            ...(obra && l!.aliqRat ? { rat: Number(l!.aliqRat) } : {}),
            ...(obra && l!.fap ? { fap: Number(l!.fap.replace(',', '.')) } : {}),
        }) : undefined;
        return { ...x, funcionarios: fichas.size, ...(patronal ? { patronal, totalPrevidenciario: x.inssSegurados + patronal.patronal + patronal.rat + patronal.terceiros - x.salarioFamilia - x.salarioMaternidade } : {}) };
    }).sort((a, b) => a.codigo.localeCompare(b.codigo));
}
