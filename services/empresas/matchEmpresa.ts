import type { Empresa } from './empresasTypes';

export function normalizar(s: string): string {
    return (s ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

export function acharEmpresaPorNome(nomeAba: string, empresas: Empresa[]): Empresa | null {
    const alvo = normalizar(nomeAba);
    if (!alvo) return null;
    let m = empresas.find((e) => normalizar(e.nomeFantasia) === alvo);
    if (m) return m;
    m = empresas.find((e) => normalizar(e.razaoSocial) === alvo);
    if (m) return m;
    m = empresas.find((e) => {
        const nf = normalizar(e.nomeFantasia);
        return nf.includes(alvo) || alvo.includes(nf);
    });
    return m ?? null;
}
