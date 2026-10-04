// services/cadastros/documentos.ts
//
// Validação de documentos usada pelos cadastros. CPF vem da implantação;
// CNPJ aceita o formato alfanumérico da Receita (IN RFB 2.229/2024), em que
// cada caractere vale o código ASCII menos 48 e os dígitos verificadores
// continuam numéricos.

export { cpfValido, dataValida, digitos } from '../implantacao/implantacao';

export const limparCnpj = (v: string) => v.toUpperCase().replace(/[.\-/\s]/g, '');

export function cnpjValido(valor: string): boolean {
    const c = limparCnpj(valor);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1+$/.test(c)) return false;
    const v = [...c].map(ch => ch.charCodeAt(0) - 48);
    const dv = (n: number) => {
        const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const resto = pesos.reduce((s, p, i) => s + p * v[i], 0) % 11;
        return resto < 2 ? 0 : 11 - resto;
    };
    return dv(12) === v[12] && dv(13) === v[13];
}

/** PIS/PASEP/NIT: pesos 3,2,9,8,7,6,5,4,3,2; resto menor que 2 dá dígito 0. */
export function pisValido(valor: string): boolean {
    const p = valor.replace(/\D/g, '');
    if (!/^\d{11}$/.test(p) || /^(\d)\1+$/.test(p)) return false;
    const resto = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2].reduce((s, peso, i) => s + peso * Number(p[i]), 0) % 11;
    return (resto < 2 ? 0 : 11 - resto) === Number(p[10]);
}

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

/** Valor monetário digitado ("1.518,00", "1518.5", "R$ 1.518") em centavos; null se não for número. */
export function centavosDeTexto(texto: string): number | null {
    let t = texto.replace(/R\$|\s/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Math.round(Number(t) * 100);
}

export const reais = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
