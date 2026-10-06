// services/empresas/chavesUnicas.ts
//
// Código SAGE e CNPJ são únicos entre as empresas (Paulo, 06/10/2026: "você
// deve bloquear o cadastro de empresas com a mesma numeração, exemplo 1200").
// A trava de verdade está nas regras do Firestore: cada empresa reserva as
// suas chaves em empresas_unicos/{sage_0000 | cnpj_00000000000000}, e uma
// chave já reservada por outra empresa não pode ser tomada. A conferência pela
// lista (empresas visíveis) só serve para a mensagem chegar antes.

import type { Empresa } from './empresasTypes';

/** Código SAGE como é gravado na empresa: 4 dígitos com zeros à esquerda. */
export const normalizarSage = (c: string) => String(c ?? '').replace(/\D/g, '').padStart(4, '0').slice(0, 4);
export const chaveSage = (c: string) => `sage_${normalizarSage(c)}`;
export const chaveCnpj = (c: string) => `cnpj_${String(c ?? '').replace(/\D/g, '')}`;

export interface ChaveUnica { chave: string; empresaId: string; criadoPor: string }

/** Empresas que repetem o código SAGE ou o CNPJ (só entre as que a pessoa enxerga). */
export function repetidas(empresas: Pick<Empresa, 'id' | 'cnpj' | 'codigoSage' | 'nomeFantasia' | 'razaoSocial'>[]): { tipo: 'sage' | 'cnpj'; valor: string; empresas: typeof empresas }[] {
    const grupos = new Map<string, typeof empresas>();
    for (const e of empresas) {
        for (const k of [e.codigoSage ? chaveSage(e.codigoSage) : '', e.cnpj ? chaveCnpj(e.cnpj) : ''].filter(Boolean)) {
            grupos.set(k, [...(grupos.get(k) ?? []), e]);
        }
    }
    return [...grupos].filter(([, l]) => l.length > 1).map(([k, l]) => ({ tipo: k.startsWith('sage_') ? 'sage' as const : 'cnpj' as const, valor: k.slice(5), empresas: l }))
        .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.valor.localeCompare(b.valor));
}

/** Mensagem para o conflito, com o nome da outra empresa quando ela é visível. */
export function mensagemConflito(tipo: 'sage' | 'cnpj', valor: string, outra?: Pick<Empresa, 'nomeFantasia' | 'razaoSocial'> | null): string {
    const quem = outra ? ` pela empresa "${outra.nomeFantasia || outra.razaoSocial}"` : ' por outra empresa (fora da sua carteira)';
    return tipo === 'sage' ? `O código SAGE ${normalizarSage(valor)} já está em uso${quem}.` : `O CNPJ ${valor} já está cadastrado${quem}.`;
}
