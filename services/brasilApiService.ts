// Consulta CNPJ na BrasilAPI (gratuita, sem chave).
// Doc: https://brasilapi.com.br/docs#tag/CNPJ
import { cnpjValido, formatarCnpj, limparCnpj } from './cadastros/documentos';

export interface BrasilApiCnpj {
    cnpj: string;
    razao_social: string;
    nome_fantasia: string | null;
    municipio?: string;
    uf?: string;
}

export async function consultarCnpj(cnpj: string): Promise<BrasilApiCnpj> {
    const dig = limparCnpj(cnpj);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(dig)) throw new Error('CNPJ deve ter 14 caracteres.');
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${dig}`);
    if (!resp.ok) {
        if (resp.status === 404) throw new Error('CNPJ não encontrado na Receita.');
        throw new Error(`Erro BrasilAPI: ${resp.status}`);
    }
    return await resp.json();
}

/** CNPJ válido, também o alfanumérico (IN RFB 2.229/2024). */
export const validaCnpj = (cnpj: string) => cnpjValido(cnpj);

/** Máscara 00.000.000/0000-00, também com letras. */
export const formatCnpj = (cnpj: string) => formatarCnpj(cnpj);
