// services/empresas/buscaEmpresas.ts
//
// Busca de empresa por nome, razão social, CNPJ ou código SAGE: sem acento,
// sem diferença de maiúscula, CNPJ com ou sem pontuação e código SAGE com ou
// sem zeros à esquerda ("1200", "272" acha "0272").

import type { Empresa } from './empresasTypes';
import { limparCnpj } from '../cadastros/documentos';

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const semZeros = (t: string) => t.replace(/^0+(?=\d)/, '');

export function filtrarEmpresas<T extends Pick<Empresa, 'nomeFantasia' | 'razaoSocial' | 'cnpj' | 'codigoSage'>>(empresas: T[], filtro: string): T[] {
    const f = semAcento(filtro.trim());
    if (!f) return empresas;
    const digitos = f.replace(/\D/g, '');
    // CNPJ alfanumérico: letras e números, sem pontuação ("12abc" acha 12.ABC.345/01DE-35).
    const cnpj = limparCnpj(f);
    const soNumero = /^[\d./\-\s]+$/.test(f);
    return empresas.filter(e => {
        if (semAcento(`${e.nomeFantasia ?? ''} ${e.razaoSocial ?? ''}`).includes(f)) return true;
        if (cnpj && /\d/.test(cnpj) && limparCnpj(e.cnpj ?? '').includes(cnpj)) return true;
        if (!digitos) return false;
        const sage = String(e.codigoSage ?? '');
        return soNumero && (sage === digitos || semZeros(sage) === semZeros(digitos) || sage.includes(digitos));
    });
}
