// services/cadastros/duploVinculo.ts
//
// Duplo vínculo (Arquivos › Duplo Vínculo do IOB SAGE; "múltiplos vínculos" no eSocial): o empregado que também
// recebe em outra empresa (ou de outro empregador pessoa física) informa a remuneração de lá, para o INSS do
// segurado respeitar o teto. Fica na ficha, por período (a declaração do trabalhador vale enquanto não mudar).
//
// O desconto (IN RFB 2.110/2022, art. 36; S-1200, grupo infoMV, MOS item 5):
// - outras fontes já no teto: nada a descontar aqui (indMV 3);
// - senão, a contribuição é a da tabela progressiva sobre a remuneração total (aqui + outras), limitada ao teto, e
//   esta empresa desconta a parte proporcional à remuneração dela (até o que falta para o teto): indMV 1 quando o
//   total não passa do teto, indMV 2 quando passa (base aqui = teto − outras).
// O S-1200 leva o infoMV com cada outra fonte (tpInsc, nrInsc, codCateg, vlrRemunOE).

import { cnpjValido, normalizarCnpj } from './cnpj';

/** Remuneração do trabalhador em outro empregador, por período (AAAA-MM). */
export interface OutroVinculo {
    /** 1 = CNPJ, 2 = CPF (empregador pessoa física). */
    tpInsc: '1' | '2';
    nrInsc: string;
    /** Categoria do trabalhador no outro vínculo (Tabela 01 do eSocial, ex.: 101). */
    codCateg: string;
    /** Remuneração mensal lá (centavos), a que entra na base do INSS. */
    remuneracao: number;
    desde: string;
    /** Vazio = sem fim (até mudar a declaração). */
    ate: string;
    observacao?: string;
}

export const outroVinculoVazio = (): OutroVinculo => ({ tpInsc: '1', nrInsc: '', codCateg: '101', remuneracao: 0, desde: '', ate: '', observacao: '' });

const mes = /^\d{4}-(0[1-9]|1[0-2])$/;
function cpfValido(c: string): boolean {
    if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
    const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

export function validarOutrosVinculos(lista: OutroVinculo[]): string[] {
    const erros: string[] = [];
    lista.forEach((v, i) => {
        const n = `Duplo vínculo ${i + 1}`;
        const nr = normalizarCnpj(v.nrInsc);
        if (v.tpInsc === '1' ? !cnpjValido(nr) : !cpfValido(nr)) erros.push(`${n}: ${v.tpInsc === '1' ? 'CNPJ' : 'CPF'} do outro empregador inválido.`);
        if (!/^\d{3}$/.test(v.codCateg)) erros.push(`${n}: categoria do eSocial com 3 dígitos (ex.: 101).`);
        if (!Number.isInteger(v.remuneracao) || v.remuneracao <= 0) erros.push(`${n}: informe a remuneração mensal no outro empregador.`);
        if (!mes.test(v.desde)) erros.push(`${n}: informe o mês de início (a partir de).`);
        if (v.ate && (!mes.test(v.ate) || v.ate < v.desde)) erros.push(`${n}: "até" inválido ou antes do início.`);
    });
    return erros;
}

/** Outros vínculos que valem na competência (AAAA-MM). */
export const vinculosDoMes = (lista: OutroVinculo[] | undefined, competencia: string) =>
    (lista ?? []).filter(v => v.remuneracao > 0 && mes.test(v.desde) && v.desde <= competencia && (!v.ate || competencia <= v.ate));

/** INSS progressivo, faixa a faixa, sobre a base já limitada ao teto (centavos, sem arredondar). */
export type Faixas = { ate: number | null; aliquota: number }[];
function progressivo(base: number, faixas: Faixas): number {
    let piso = 0; let total = 0;
    for (const f of faixas) {
        if (f.ate === null) break;
        const parte = Math.min(base, f.ate) - piso;
        if (parte <= 0) break;
        total += parte * f.aliquota / 100; piso = f.ate;
    }
    return total;
}

export interface InssMultiplosVinculos {
    indMV: '1' | '2' | '3';
    /** Soma das outras fontes no mês. */
    outras: number;
    /** Base desta empresa (até o que falta para o teto). */
    baseAqui: number;
    /** Contribuição sobre o total (limitado ao teto) e a parte desta empresa (centavos). */
    inssTotal: number;
    valor: number;
    memoria: string;
}

/**
 * INSS do segurado com outras fontes no mês. `base` é a base do INSS desta empresa no mês; `teto` o da tabela.
 * Sem outras fontes, null (o cálculo normal vale).
 */
export function inssComOutrosVinculos(base: number, outras: number, faixas: Faixas, teto: number, reais: (c: number) => string): InssMultiplosVinculos | null {
    if (!(outras > 0)) return null;
    if (outras >= teto) return { indMV: '3', outras, baseAqui: 0, inssTotal: 0, valor: 0, memoria: `outras fontes ${reais(outras)} já no teto ${reais(teto)}: nada a descontar aqui (indMV 3).` };
    const total = Math.min(base + outras, teto);
    const baseAqui = Math.max(0, Math.min(base, teto - outras));
    const inssTotal = progressivo(total, faixas);
    const valor = total > 0 ? Math.round(inssTotal * baseAqui / total) : 0;
    const indMV = base + outras > teto ? '2' : '1';
    return {
        indMV, outras, baseAqui, inssTotal: Math.round(inssTotal), valor,
        memoria: `duplo vínculo: base aqui ${reais(base)} + outras fontes ${reais(outras)} = ${reais(base + outras)}${base + outras > teto ? `, limitado ao teto ${reais(teto)}` : ''}; INSS sobre o total ${reais(Math.round(inssTotal))}; `
            + `parte desta empresa ${reais(Math.round(inssTotal))} × ${reais(baseAqui)} ÷ ${reais(total)} = ${reais(valor)} (indMV ${indMV}${indMV === '2' ? ': base aqui limitada a teto − outras' : ''}).`,
    };
}
