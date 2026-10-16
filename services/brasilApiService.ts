// Consulta CNPJ na BrasilAPI (gratuita, sem chave).
// Doc: https://brasilapi.com.br/docs#tag/CNPJ
import { cnpjValido, formatarCnpj, limparCnpj } from './cadastros/cnpj';

export interface BrasilApiCnpj {
    cnpj: string;
    razao_social: string;
    nome_fantasia: string | null;
    municipio?: string;
    uf?: string;
}

export async function consultarCnpj(cnpj: string): Promise<BrasilApiCnpj> {
    const dig = limparCnpj(cnpj);
    if (dig.length !== 14) throw new Error('CNPJ deve ter 14 posições.');
    const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${dig}`);
    if (!resp.ok) {
        if (resp.status === 404) throw new Error('CNPJ não encontrado na Receita.');
        throw new Error(`Erro BrasilAPI: ${resp.status}`);
    }
    return await resp.json();
}

// CNPJ numérico ou alfanumérico (IN RFB 2.229/2024): a regra está em cadastros/documentos.
export const validaCnpj = (cnpj: string): boolean => cnpjValido(cnpj);
export const formatCnpj = (cnpj: string): string => formatarCnpj(cnpj);
