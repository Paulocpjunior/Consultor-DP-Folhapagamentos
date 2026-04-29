// services/folha/folhaPerfilColunasService.ts
// CRUD do perfil de seleção de colunas por cliente.
// Cada cliente (CNPJ) pode ter um conjunto de colunas marcadas como
// "ativas pra importação" — esse conjunto é o padrão pros próximos meses.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

const COL = 'folha_perfis_colunas';

export interface PerfilColunas {
    cnpj: string;
    cliente?: string;
    colunas_ativas: string[];
    atualizadoEm?: { toDate: () => Date } | null;
    atualizadoPor?: { uid: string; name: string; email: string | null };
}

function userInfo() {
    const u = auth?.currentUser;
    if (!u) return { uid: 'anonymous', name: 'anônimo', email: null };
    return {
        uid: u.uid,
        name: u.displayName || u.email || u.uid,
        email: u.email || null,
    };
}

function normalizeCnpj(cnpj: string): string {
    return String(cnpj || '').replace(/\D/g, '');
}

/**
 * Busca o perfil salvo de um cliente. Retorna null se nunca foi salvo.
 */
export async function getPerfilColunas(cnpj: string): Promise<PerfilColunas | null> {
    if (!db) return null;
    const c = normalizeCnpj(cnpj);
    if (!c) return null;
    try {
        const ref = doc(db, COL, c);
        const snap = await getDoc(ref);
        if (!snap.exists()) return null;
        const data = snap.data() as PerfilColunas;
        return { ...data, cnpj: c };
    } catch (e) {
        console.warn('Erro ao buscar perfil de colunas:', e);
        return null;
    }
}

/**
 * Salva o perfil de colunas como padrão pra esse cliente.
 */
export async function savePerfilColunas(
    cnpj: string,
    colunasAtivas: string[],
    cliente?: string,
): Promise<void> {
    if (!db) throw new Error('Firestore não está configurado.');
    const c = normalizeCnpj(cnpj);
    if (!c) throw new Error('CNPJ inválido.');
    const ref = doc(db, COL, c);
    await setDoc(ref, {
        cnpj: c,
        cliente: cliente ?? null,
        colunas_ativas: Array.from(new Set(colunasAtivas)).sort(),
        atualizadoEm: serverTimestamp(),
        atualizadoPor: userInfo(),
    }, { merge: false });
}

/**
 * Determina o estado inicial dos checkboxes pra UMA aba do parser:
 * - Se cliente tem perfil salvo: usa o perfil (intersecta com colunas que existem nesta aba)
 * - Se não tem perfil: marca colunas que tenham >=1 funcionário com dado neste mês
 *
 * Retorna um Set de nomes de colunas que devem vir marcadas.
 */
export function calcularSelecaoInicial(
    colunasDaAba: string[],
    funcionariosDaAba: Array<{ celulas: Record<string, unknown> }>,
    perfilSalvo: PerfilColunas | null,
): Set<string> {
    if (perfilSalvo && Array.isArray(perfilSalvo.colunas_ativas)) {
        // Usa perfil salvo, mas só pra colunas que ainda existem nesta aba
        return new Set(perfilSalvo.colunas_ativas.filter((c) => colunasDaAba.includes(c)));
    }

    // Sem perfil → auto-detect: marca colunas com pelo menos 1 funcionário com dado
    const ativas = new Set<string>();
    for (const col of colunasDaAba) {
        for (const f of funcionariosDaAba) {
            const v = f.celulas[col];
            if (v !== null && v !== undefined && v !== '' && v !== 0) {
                ativas.add(col);
                break;
            }
        }
    }
    return ativas;
}
