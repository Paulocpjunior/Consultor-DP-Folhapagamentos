// Consulta CNPJ na BrasilAPI (gratuita, sem chave).
// Doc: https://brasilapi.com.br/docs#tag/CNPJ
export interface BrasilApiCnpj {
    cnpj: string;
    razao_social: string;
    nome_fantasia: string | null;
    municipio?: string;
    uf?: string;
}

export async function consultarCnpj(cnpj: string): Promise<BrasilApiCnpj> {
    const dig = cnpj.replace(/\D/g, '');
    if (dig.length !== 14) throw new Error('CNPJ deve ter 14 dígitos.');
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${dig}`);
    if (!resp.ok) {
        if (resp.status === 404) throw new Error('CNPJ não encontrado na Receita.');
        throw new Error(`Erro BrasilAPI: ${resp.status}`);
    }
    return await resp.json();
}

export function validaCnpj(cnpj: string): boolean {
    const c = cnpj.replace(/\D/g, '');
    if (c.length !== 14) return false;
    if (/^(\d)\1{13}$/.test(c)) return false;

    const calc = (slice: string) => {
        const w = slice.length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
        const sum = slice.split('').reduce((s, d, i) => s + Number(d) * w[i], 0);
        const r = sum % 11;
        return r < 2 ? 0 : 11 - r;
    };
    return calc(c.slice(0, 12)) === Number(c[12]) && calc(c.slice(0, 13)) === Number(c[13]);
}

export function formatCnpj(cnpj: string): string {
    const c = cnpj.replace(/\D/g, '');
    if (c.length !== 14) return cnpj;
    return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12,14)}`;
}
