// services/calculo/adicionais.ts
//
// Adicionais de insalubridade e periculosidade automáticos (item 3b), pela ficha:
// - insalubridade (CLT, art. 192): 10%, 20% ou 40% sobre o salário mínimo — ou, quando a convenção ou o acordo
//   manda, sobre o salário contratual ou um piso informado;
// - periculosidade (CLT, art. 193, § 1º): 30% do salário-base, sem gratificações, prêmios ou PLR.
// Não se acumulam (art. 193, § 2º): o empregado escolhe; com os dois na ficha, vale o de maior valor, com aviso.
// O valor do mês é proporcional aos dias pagos, como o salário. Natureza salarial: integra a base da hora extra
// (TST, OJ 47 da SDI-1 e Súmula 132) e a remuneração de férias, 13º, aviso e rescisão (Súmula 139), com INSS,
// FGTS e IRRF.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { centavosDeTexto } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';

export interface AdicionalDeRisco {
    codigo: 'INSALUB' | 'PERICUL';
    descricao: string;
    /** Valor do mês inteiro (30 dias), em centavos. */
    mensal: number;
    referencia: string;
    memoria: string;
}
export interface ResultadoAdicional { adicional: AdicionalDeRisco | null; avisos: string[]; erro?: string }

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Adicional de risco da ficha na competência, sobre o salário mensal contratual dado. */
export function adicionalDeRisco(d: FichaFuncionario['dados'], salarioMensal: number, tabelas: TabelaLegal[], competencia: string): ResultadoAdicional {
    const avisos: string[] = [];
    const grau = Number(d.insalubridade || 0);
    const pericul = d.periculosidade === 'S';
    let insalub: AdicionalDeRisco | null = null;
    if (grau) {
        if (![10, 20, 40].includes(grau)) return { adicional: null, avisos, erro: `Grau de insalubridade ${d.insalubridade}: use 10, 20 ou 40%.` };
        const tipoBase = d.baseInsalubridade || 'minimo';
        let base = 0; let rotulo = '';
        if (tipoBase === 'minimo') {
            const t = tabelaVigente(tabelas, 'salario_minimo', competencia);
            if ('erro' in t || !t.tabela.valores.salarioMinimo) return { adicional: null, avisos, erro: `Insalubridade sobre o salário mínimo: ${'erro' in t ? t.erro : `tabela do salário mínimo de ${rotuloCompetencia(competencia)} sem o valor`} (Cadastros › Tabelas legais).` };
            base = t.tabela.valores.salarioMinimo; rotulo = `salário mínimo (${reais(base)})`;
        } else if (tipoBase === 'salario') { base = salarioMensal; rotulo = `salário contratual (${reais(base)})`; }
        else {
            base = centavosDeTexto(d.baseInsalubridadeValor ?? '') ?? 0;
            if (!base) return { adicional: null, avisos, erro: 'Insalubridade sobre valor informado: a ficha não tem o valor da base.' };
            rotulo = `piso informado (${reais(base)})`;
        }
        const mensal = Math.round(base * grau / 100);
        insalub = { codigo: 'INSALUB', descricao: 'Adicional de insalubridade', mensal, referencia: `${grau}%`, memoria: `Adicional de insalubridade: ${grau}% do ${rotulo} = ${reais(mensal)} por mês (CLT, art. 192).` };
    }
    let peric: AdicionalDeRisco | null = null;
    if (pericul) {
        const mensal = Math.round(salarioMensal * 0.3);
        peric = { codigo: 'PERICUL', descricao: 'Adicional de periculosidade', mensal, referencia: '30%', memoria: `Adicional de periculosidade: 30% do salário-base ${reais(salarioMensal)} = ${reais(mensal)} por mês (CLT, art. 193, § 1º).` };
    }
    if (insalub && peric) {
        const vale = peric.mensal >= insalub.mensal ? peric : insalub;
        avisos.push(`Insalubridade e periculosidade na ficha: não se acumulam (CLT, art. 193, § 2º). Usado o de maior valor (${vale.descricao.toLowerCase()}); confira a opção do empregado.`);
        return { adicional: vale, avisos };
    }
    return { adicional: insalub ?? peric, avisos };
}

/** Valor do adicional pelos dias pagos (mês comercial de 30 dias, como o salário). */
export const adicionalProporcional = (a: AdicionalDeRisco, diasPagos: number) => (diasPagos >= 30 ? a.mensal : Math.round(a.mensal / 30 * diasPagos));
