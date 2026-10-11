// services/cadastros/enquadramento.ts
//
// Enquadramento previdenciário da empresa (parte patronal da folha), com
// vigência: o FAP muda todo ano e o regime pode mudar. Nada vem pronto: quem
// cadastra informa a partir do FPAS, do CNAE/RAT e do FAP publicado.
//
// Regras (Lei 8.212/1991, art. 22; LC 123/2006, art. 13, § 3º, e art. 18, § 5º-C):
// - normal (lucro presumido/real): 20% + RAT × FAP + terceiros;
// - Simples Nacional, Anexo IV: 20% + RAT × FAP na folha, sem terceiros;
// - Simples Nacional, demais anexos: a CPP vai no DAS; nada patronal na folha.
// O salário-maternidade fica fora da base patronal (STF, RE 576.967, Tema 72).
// Desoneração (CPRB, Lei 12.546/2011, arts. 7º a 9º) com a reoneração gradual da Lei 14.973/2024 (IN RFB 2.242/2024):
// a cota patronal de 20% sobre a folha volta aos poucos — 25% dela em 2025 (5%), 50% em 2026 (10%), 75% em 2027 (15%) e
// inteira a partir de 2028 —, e a CPRB sobre a receita cai na mesma proporção (80%, 60%, 40% da alíquota; construção
// civil: 4,5% → 3,6%, 2,7%, 1,8%), declarada pelo Fiscal na EFD-Reinf (R-2060). Na transição, não há cota patronal
// sobre o 13º salário. RAT e terceiros seguem inteiros sobre a folha. A empresa precisa manter, no ano, pelo menos 75%
// da média de empregados do ano anterior; senão, volta aos 20% a partir do ano seguinte.
// Obra própria com a patronal não substituída (S-1005, indSubstPatrObra = 2) paga os 20% inteiros sobre a folha dela.

export type RegimePatronal = 'normal' | 'simples-iv' | 'simples';
export const REGIMES: Record<RegimePatronal, string> = {
    normal: 'Normal (lucro presumido ou real): 20% + RAT × FAP + terceiros',
    'simples-iv': 'Simples Nacional, Anexo IV: 20% + RAT × FAP, sem terceiros',
    simples: 'Simples Nacional, demais anexos: contribuição patronal no DAS',
};

export interface Enquadramento {
    id: string;
    empresaId: string;
    vigencia: string; // AAAA-MM
    regime: RegimePatronal;
    fpas: string;
    codigoTerceiros: string;
    /** Percentuais: 20 = 20%; RAT 1, 2 ou 3; FAP 0,5000 a 2,0000; terceiros 5,8 = 5,8%. */
    patronal: number;
    rat: number;
    fap: number;
    terceiros: number;
    /** Optante pela CPRB (desoneração da folha): a cota patronal segue a reoneração gradual (Lei 14.973/2024). */
    cprb?: boolean;
    observacao: string;
}

export const idEnquadramento = (empresaId: string, vigencia: string) => `${empresaId}_${vigencia}`;

export function enquadramentoVazio(empresaId = ''): Enquadramento {
    return { id: '', empresaId, vigencia: '', regime: 'normal', fpas: '', codigoTerceiros: '', patronal: 20, rat: 0, fap: 1, terceiros: 0, cprb: false, observacao: '' };
}

const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
const quatroCasas = (n: number) => Math.abs(n * 10000 - Math.round(n * 10000)) < 1e-6;

export function validarEnquadramento(e: Enquadramento, existentes: Enquadramento[] = []): string[] {
    const erros: string[] = [];
    if (!e.empresaId) erros.push('Empresa não informada.');
    if (!competenciaValida(e.vigencia)) erros.push('Vigência deve ser um mês no formato AAAA-MM.');
    if (!REGIMES[e.regime]) erros.push('Escolha o regime.');
    if (existentes.some(x => x.id !== e.id && x.empresaId === e.empresaId && x.vigencia === e.vigencia)) erros.push('Já existe enquadramento desta empresa com esta vigência.');
    if (e.regime === 'simples') return erros;
    if (!(e.patronal > 0 && e.patronal <= 30)) erros.push('Contribuição patronal: entre 0 e 30% (em regra, 20%).');
    if (![1, 2, 3].includes(e.rat)) erros.push('RAT: 1, 2 ou 3% (pelo CNAE preponderante).');
    if (!(e.fap >= 0.5 && e.fap <= 2) || !quatroCasas(e.fap)) erros.push('FAP: entre 0,5000 e 2,0000, com até 4 casas.');
    if (e.cprb && e.regime !== 'normal') erros.push('CPRB (desoneração) só no regime normal (lucro presumido ou real).');
    if (e.cprb && e.vigencia >= '2028-01') erros.push('A CPRB acabou em 2027 (Lei 14.973/2024): a partir de 2028, a cota patronal é de 20% sobre a folha.');
    if (e.regime === 'normal') {
        if (!/^\d{3}$/.test(e.fpas)) erros.push('FPAS: 3 dígitos.');
        if (!(e.terceiros >= 0 && e.terceiros <= 10)) erros.push('Terceiros: entre 0 e 10%.');
    } else if (e.terceiros) erros.push('Simples Nacional (Anexo IV): sem contribuição para terceiros.');
    return erros;
}

export type ResultadoVigenciaEnq = { enquadramento: Enquadramento } | { erro: string };

/** Enquadramento que vale na competência: o de maior vigência até ela. */
export function enquadramentoVigente(lista: Enquadramento[], empresaId: string, competencia: string): ResultadoVigenciaEnq {
    const c = lista.filter(x => x.empresaId === empresaId && x.vigencia <= competencia).sort((a, b) => b.vigencia.localeCompare(a.vigencia));
    if (!c.length) return { erro: 'Empresa sem enquadramento previdenciário vigente (Cadastros › Enquadramento): sem a parte patronal.' };
    return { enquadramento: c[0] };
}

export interface Patronal {
    regime: RegimePatronal;
    base: number;
    aliquotaRat: number; // RAT × FAP, em %
    patronal: number;
    rat: number;
    terceiros: number;
    memoria: string[];
}

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
const brl = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Reoneração gradual (Lei 14.973/2024): fração da cota patronal de 20% devida sobre a folha por quem está na CPRB, pelo
 * ano da competência. Até 2024, nada (a CPRB substituía a cota inteira); de 2028 em diante, inteira.
 */
export function fatorReoneracao(competencia: string): number {
    const ano = Number(competencia.slice(0, 4));
    return ano <= 2024 ? 0 : ano === 2025 ? 0.25 : ano === 2026 ? 0.5 : ano === 2027 ? 0.75 : 1;
}

/** Opções do cálculo patronal: a competência (reoneração), o 13º da base, e o RAT/FAP e a substituição da obra. */
export interface OpcoesPatronal {
    competencia?: string;
    /** 13º salário dentro da remuneração: na transição da CPRB, fora da cota patronal. */
    decimoTerceiro?: number;
    /** Obra própria com a patronal não substituída pela CPRB (S-1005, indSubstPatrObra = 2): 20% inteiros. */
    naoSubstituida?: boolean;
    /** RAT (1 a 3) e FAP da obra, quando diferentes dos da empresa. */
    rat?: number;
    fap?: number;
}

/** Parte patronal sobre a remuneração dos empregados (base do INSS sem teto, sem o salário-maternidade). */
export function calcularPatronal(remuneracao: number, salarioMaternidade: number, e: Enquadramento, o: OpcoesPatronal = {}): Patronal {
    const base = Math.max(0, remuneracao - salarioMaternidade);
    const rat0 = o.rat ?? e.rat; const fap0 = o.fap ?? e.fap;
    const aliquotaRat = Math.round(rat0 * fap0 * 10000) / 10000;
    const memoria: string[] = [];
    if (e.regime === 'simples') {
        memoria.push('Simples Nacional (demais anexos): a contribuição patronal vai no DAS; nada patronal na folha.');
        return { regime: e.regime, base, aliquotaRat: 0, patronal: 0, rat: 0, terceiros: 0, memoria };
    }
    memoria.push(`Base patronal: ${brl(remuneracao)}${salarioMaternidade ? ` − salário-maternidade ${brl(salarioMaternidade)} (STF, Tema 72)` : ''} = ${brl(base)}.`);
    let patronal: number;
    let rotuloPatronal = `Patronal ${pct(e.patronal)}`;
    if (e.cprb && e.regime === 'normal' && !o.naoSubstituida && o.competencia) {
        const fator = fatorReoneracao(o.competencia);
        const ano = o.competencia.slice(0, 4);
        const transicao = fator > 0 && fator < 1;
        const decimo = transicao ? Math.min(base, Math.max(0, o.decimoTerceiro ?? 0)) : 0;
        const aliq = Math.round(e.patronal * fator * 10000) / 10000;
        patronal = Math.round((base - decimo) * aliq / 100);
        rotuloPatronal = `Patronal na CPRB em ${ano}: ${pct(e.patronal)} × ${pct(fator * 100)} = ${pct(aliq)}${decimo ? ` sobre ${brl(base - decimo)} (sem o 13º de ${brl(decimo)})` : ''}`;
        memoria.push(fator === 0
            ? 'Empresa na CPRB: a cota patronal sobre a folha é substituída pela contribuição sobre a receita bruta (Lei 12.546/2011).'
            : fator < 1
                ? `Empresa na CPRB, reoneração gradual (Lei 14.973/2024; IN RFB 2.242/2024): ${pct(fator * 100)} da cota patronal sobre a folha em ${ano}; sem cota patronal sobre o 13º na transição. A CPRB sobre a receita (${fator === 0.25 ? 80 : fator === 0.5 ? 60 : 40}% da alíquota; construção civil ${fator === 0.25 ? '3,6' : fator === 0.5 ? '2,7' : '1,8'}%) é do Fiscal, na EFD-Reinf (R-2060). Mantenha 75% da média de empregados do ano anterior.`
                : `A CPRB acabou em 2027 (Lei 14.973/2024): em ${ano}, cota patronal inteira sobre a folha. Atualize o enquadramento.`);
    } else {
        patronal = Math.round(base * e.patronal / 100);
        if (e.cprb && o.naoSubstituida) memoria.push('Obra com a patronal não substituída pela CPRB (S-1005): 20% sobre a folha da obra.');
        if (e.cprb && !o.competencia) memoria.push('Empresa na CPRB: sem a competência, a cota patronal foi calculada inteira. Confira.');
    }
    const rat = Math.round(base * aliquotaRat / 100);
    const terceiros = e.regime === 'normal' ? Math.round(base * e.terceiros / 100) : 0;
    memoria.push(`${rotuloPatronal} = ${brl(patronal)}; RAT ${pct(rat0)} × FAP ${fap0.toFixed(4).replace('.', ',')} = ${pct(aliquotaRat)} → ${brl(rat)}${o.rat !== undefined || o.fap !== undefined ? ' (da obra)' : ''}${e.regime === 'normal' ? `; terceiros ${pct(e.terceiros)} (FPAS ${e.fpas}) = ${brl(terceiros)}` : '; sem terceiros (Simples, Anexo IV)'}.`);
    return { regime: e.regime, base, aliquotaRat, patronal, rat, terceiros, memoria };
}

/** "1,2345" → 1.2345; "5,8" → 5.8; vazio ou inválido → NaN. */
export const numeroDeTexto = (t: string) => (t.trim() && /^\d+([.,]\d+)?$/.test(t.trim()) ? Number(t.trim().replace(',', '.')) : NaN);
