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
// Desoneração (CPRB) ainda não é calculada.

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
    observacao: string;
}

export const idEnquadramento = (empresaId: string, vigencia: string) => `${empresaId}_${vigencia}`;

export function enquadramentoVazio(empresaId = ''): Enquadramento {
    return { id: '', empresaId, vigencia: '', regime: 'normal', fpas: '', codigoTerceiros: '', patronal: 20, rat: 0, fap: 1, terceiros: 0, observacao: '' };
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

/** Parte patronal sobre a remuneração dos empregados (base do INSS sem teto, sem o salário-maternidade). */
export function calcularPatronal(remuneracao: number, salarioMaternidade: number, e: Enquadramento): Patronal {
    const base = Math.max(0, remuneracao - salarioMaternidade);
    const aliquotaRat = Math.round(e.rat * e.fap * 10000) / 10000;
    const memoria: string[] = [];
    if (e.regime === 'simples') {
        memoria.push('Simples Nacional (demais anexos): a contribuição patronal vai no DAS; nada patronal na folha.');
        return { regime: e.regime, base, aliquotaRat: 0, patronal: 0, rat: 0, terceiros: 0, memoria };
    }
    const patronal = Math.round(base * e.patronal / 100);
    const rat = Math.round(base * aliquotaRat / 100);
    const terceiros = e.regime === 'normal' ? Math.round(base * e.terceiros / 100) : 0;
    memoria.push(`Base patronal: ${brl(remuneracao)}${salarioMaternidade ? ` − salário-maternidade ${brl(salarioMaternidade)} (STF, Tema 72)` : ''} = ${brl(base)}.`);
    memoria.push(`Patronal ${pct(e.patronal)} = ${brl(patronal)}; RAT ${pct(e.rat)} × FAP ${e.fap.toFixed(4).replace('.', ',')} = ${pct(aliquotaRat)} → ${brl(rat)}${e.regime === 'normal' ? `; terceiros ${pct(e.terceiros)} (FPAS ${e.fpas}) = ${brl(terceiros)}` : '; sem terceiros (Simples, Anexo IV)'}.`);
    return { regime: e.regime, base, aliquotaRat, patronal, rat, terceiros, memoria };
}

/** "1,2345" → 1.2345; "5,8" → 5.8; vazio ou inválido → NaN. */
export const numeroDeTexto = (t: string) => (t.trim() && /^\d+([.,]\d+)?$/.test(t.trim()) ? Number(t.trim().replace(',', '.')) : NaN);
