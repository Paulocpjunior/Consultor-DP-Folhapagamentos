// services/cadastros/cnpj.ts
//
// CNPJ numérico e alfanumérico. Desde 07/2026 a Receita emite CNPJ com letras
// (IN RFB 2.229/2024): 12 posições com letras maiúsculas ou números e 2
// dígitos verificadores numéricos, calculados pelo módulo 11 de sempre com o
// valor de cada caractere = código ASCII − 48 (0–9 valem 0–9, A vale 17, Z vale 42).
// O CNPJ só de números continua valendo e dá o mesmo resultado.
// O leiaute S-1.3 do eSocial já aceita: TS_cnpj = [A-Z0-9]{12}\d{2}, raiz no
// ideEmpregador = [A-Z0-9]{8}. Sem dependências: a implantação usa daqui.

const FORMATO = /^[0-9A-Z]{12}\d{2}$/;

/** CNPJ como é gravado: só letras e números, em maiúsculas (numérico ou alfanumérico). */
export const limparCnpj = (v: string | null | undefined) => String(v ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
/**
 * CNPJ de um campo ou arquivo: com o formato do CNPJ (numérico ou alfanumérico), letras e números em maiúsculas;
 * fora dele, só os dígitos, como antes (o CPF, a inscrição incompleta e o texto com rótulo não mudam).
 */
export function normalizarCnpj(valor: string | null | undefined): string {
    const c = limparCnpj(valor ?? '');
    return FORMATO.test(c) ? c : String(valor ?? '').replace(/\D/g, '');
}
/** Raiz do CNPJ (8 posições), com as letras do alfanumérico: é o nrInsc do ideEmpregador no eSocial. */
export const raizCnpj = (v: string | null | undefined) => limparCnpj(v).slice(0, 8);

/** 00.000.000/0000-00 (também com letras: 12.ABC.345/01DE-35); o que não tem 14 posições volta como veio. */
export function formatarCnpj(valor: string): string {
    const c = limparCnpj(valor);
    if (c.length !== 14) return valor;
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

export function cnpjValido(valor: string): boolean {
    const c = limparCnpj(valor);
    if (!FORMATO.test(c) || /^(\d)\1+$/.test(c)) return false;
    const v = [...c].map(ch => ch.charCodeAt(0) - 48);
    const dv = (n: number) => {
        const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const resto = pesos.reduce((s, p, i) => s + p * v[i], 0) % 11;
        return resto < 2 ? 0 : 11 - resto;
    };
    return dv(12) === v[12] && dv(13) === v[13];
}
