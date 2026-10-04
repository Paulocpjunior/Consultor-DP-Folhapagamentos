// services/carteira/carteira.ts
//
// Carteira do colaborador: as empresas em que cada usuário trabalha.
// - gestor vê todas as empresas (não precisa de carteira) e monta a carteira
//   de qualquer um;
// - admin vê só a própria carteira e monta a dos colaboradores, apenas com
//   empresas da carteira dele;
// - colaborador vê só a própria carteira (e as empresas que ele cadastrou).
// O índice fica em carteira_acessos/{uid}.empresaIds, que as regras do
// Firestore leem para liberar cada empresa. Puro, sem Firebase.

import { papelEfetivo, type Papel } from '../auth/papeis';

export interface CarteiraAcesso {
    uid: string;
    nome: string;
    email: string;
    empresaIds: string[];
}

export interface DiffCarteira { incluidas: string[]; removidas: string[] }

export function diffCarteira(antes: string[], depois: string[]): DiffCarteira {
    const a = new Set(antes), d = new Set(depois);
    return { incluidas: [...d].filter(x => !a.has(x)), removidas: [...a].filter(x => !d.has(x)) };
}

/** Lista sem repetição, na ordem em que apareceu. */
export const normalizarIds = (ids: string[]) => [...new Set(ids.map(x => x.trim()).filter(Boolean))];

/**
 * Pode o ator montar a carteira do alvo? Devolve os motivos de recusa
 * (vazio = pode). `minhas` é a carteira do ator (ignorada para o gestor).
 */
export function motivosRecusa(ator: Papel, atorUid: string, alvo: { uid: string; papel: string }, minhas: string[], antes: string[], depois: string[]): string[] {
    const papelAlvo = papelEfetivo(alvo.papel);
    if (ator === 'gestor') return [];
    if (ator !== 'admin') return ['Só gestor ou admin monta carteiras.'];
    const erros: string[] = [];
    if (alvo.uid === atorUid) erros.push('A própria carteira é montada pelo gestor.');
    if (papelAlvo !== 'colaborador') erros.push('Admin monta só a carteira de colaboradores.');
    const { incluidas, removidas } = diffCarteira(antes, depois);
    const fora = [...incluidas, ...removidas].filter(x => !minhas.includes(x));
    if (fora.length) erros.push(`${fora.length} empresa(s) fora da sua carteira: só o gestor mexe nelas.`);
    return erros;
}

/** O que a tela mostra sobre a carteira de alguém. */
export function resumoCarteira(papel: string, empresaIds: string[] | undefined): string {
    if (papelEfetivo(papel) === 'gestor') return 'todas as empresas';
    const n = empresaIds?.length ?? 0;
    return n ? `${n} empresa(s)` : 'carteira vazia';
}
