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
    const doc = limparCnpj(filtro.trim());
    const soNumero = /^[\d./\-\s]+$/.test(f);
    return empresas.filter(e => {
        if (semAcento(`${e.nomeFantasia ?? ''} ${e.razaoSocial ?? ''}`).includes(f)) return true;
        if (!digitos) return false;
        if ((e.cnpj ?? '').replace(/\D/g, '').includes(digitos)) return true;
        // CNPJ alfanumérico: o trecho digitado com letras (sem pontuação).
        if (doc.length >= 3 && /[A-Z]/.test(doc) && limparCnpj(e.cnpj ?? '').includes(doc)) return true;
        const sage = String(e.codigoSage ?? '');
        return soNumero && (sage === digitos || semZeros(sage) === semZeros(digitos) || sage.includes(digitos));
    });
}
