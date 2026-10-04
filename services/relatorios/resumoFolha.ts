// services/relatorios/resumoFolha.ts
//
// Resumo da folha (Relatórios › Mensais › Resumo da Folha do IOB) a partir
// dos resultados do motor: totais por verba, bases e o quadro para conferir
// as guias. Puro, sem Firebase.
//
// O quadro de encargos só vale para a DCTFWeb e o FGTS Digital na FOLHA
// MENSAL: nela o INSS do mês já soma as férias e o retido no recibo. Nas
// outras folhas (13º, férias, rescisão), mostra só o que aquela folha tem.

import type { ResultadoCalculo } from '../calculo/motorMensal';
import { calcularPatronal, type Enquadramento, type Patronal } from '../cadastros/enquadramento';

export interface LinhaVerba { codigo: string; descricao: string; tipo: 'provento' | 'desconto'; funcionarios: number; valor: number }
export interface ResumoFolha {
    /** Pessoas distintas (um funcionário pode ter dois recibos de férias no mês). */
    funcionarios: number;
    /** Cálculos (holerites, recibos, TRCTs). */
    registros: number;
    situacoes: { calculado: number; incompleto: number; erro: number };
    porVerba: LinhaVerba[];
    totais: { proventos: number; descontos: number; liquido: number };
    bases: { inss: number; fgts: number; irrf: number };
    encargos: {
        /** Contribuição dos segurados descontada (INSS do mês, do 13º, das férias e o retido no recibo). */
        inssSegurados: number;
        /** IRRF retido (todos os IRRF da folha). Regime de caixa: vai à DCTFWeb do mês do pagamento. */
        irrf: number;
        fgts: number;
        /** Multa rescisória do FGTS (40% ou 20%), também recolhida pelo FGTS Digital. */
        multaFgts: number;
        /** Salário-família pago: deduzido da contribuição na DCTFWeb. */
        salarioFamilia: number;
        /** Salário-maternidade pago pela empresa: compensado na DCTFWeb. */
        salarioMaternidade: number;
        /** Parte patronal, quando a empresa tem enquadramento vigente. */
        patronal?: Patronal;
        /** Segurados + patronal + RAT + terceiros − salário-família − salário-maternidade. */
        totalPrevidenciario?: number;
    };
}

const INSS = ['INSS', 'INSS13', 'INSSFER', 'INSSFERRET'];
const IRRF = ['IRRF', 'IRRF13', 'IRRFFER', 'IRRFFERRET'];

/** Verbas com período no código (férias vencidas por período) somam numa linha só. */
const chaveVerba = (codigo: string) => codigo.replace(/\d{4}-\d{2}-\d{2}$/, '');

export function resumirFolha(resultados: ResultadoCalculo[], enquadramento?: Enquadramento): ResumoFolha {
    const validos = resultados.filter(r => r.situacao !== 'erro');
    const mapa = new Map<string, LinhaVerba & { fichas: Set<string> }>();
    for (const r of validos) {
        for (const v of r.verbas) {
            // Lançamentos avulsos têm código por posição (LAN1, LAN2…): agrupam pela descrição.
            const avulso = /^LAN\d+$/.test(v.codigo);
            const k = `${v.tipo}:${avulso ? `LAN:${v.descricao.trim().toUpperCase()}` : chaveVerba(v.codigo)}`;
            const l = mapa.get(k) ?? { codigo: avulso ? 'LAN' : chaveVerba(v.codigo), descricao: v.descricao, tipo: v.tipo, funcionarios: 0, valor: 0, fichas: new Set<string>() };
            l.valor += v.valor; l.fichas.add(r.fichaId); l.funcionarios = l.fichas.size;
            mapa.set(k, l);
        }
    }
    const porVerba = [...mapa.values()].map(({ fichas: _f, ...l }) => l)
        .sort((a, b) => (a.tipo === b.tipo ? b.valor - a.valor : a.tipo === 'provento' ? -1 : 1));
    const soma = (f: (r: ResultadoCalculo) => number) => validos.reduce((s, r) => s + f(r), 0);
    const somaCodigos = (codigos: string[]) => soma(r => r.verbas.filter(v => codigos.includes(v.codigo)).reduce((s, v) => s + v.valor, 0));
    const inssSegurados = somaCodigos(INSS);
    const salarioFamilia = somaCodigos(['SF']);
    const salarioMaternidade = somaCodigos(['MAT']);
    const baseInss = soma(r => r.bases.inss);
    const patronal = enquadramento ? calcularPatronal(baseInss, salarioMaternidade, enquadramento) : undefined;
    return {
        funcionarios: new Set(resultados.map(r => r.fichaId)).size,
        registros: resultados.length,
        situacoes: {
            calculado: resultados.filter(r => r.situacao === 'calculado').length,
            incompleto: resultados.filter(r => r.situacao === 'incompleto').length,
            erro: resultados.filter(r => r.situacao === 'erro').length,
        },
        porVerba,
        totais: { proventos: soma(r => r.totais.proventos), descontos: soma(r => r.totais.descontos), liquido: soma(r => r.totais.liquido) },
        bases: { inss: soma(r => r.bases.inss), fgts: soma(r => r.bases.fgts), irrf: soma(r => r.bases.irrf) },
        encargos: {
            inssSegurados,
            irrf: somaCodigos(IRRF),
            fgts: soma(r => r.fgts),
            multaFgts: soma(r => (r as ResultadoCalculo & { multaFgts?: number }).multaFgts ?? 0),
            salarioFamilia,
            salarioMaternidade,
            ...(patronal ? { patronal, totalPrevidenciario: inssSegurados + patronal.patronal + patronal.rat + patronal.terceiros - salarioFamilia - salarioMaternidade } : {}),
        },
    };
}
