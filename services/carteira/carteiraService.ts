// services/carteira/carteiraService.ts
//
// Persistência da carteira e o "escopo" do usuário logado (quais empresas
// ele enxerga). As regras do Firestore são a trava de verdade; aqui as
// consultas já pedem só o que o usuário pode ler, senão o Firestore recusa
// a consulta inteira.
//   carteira_acessos/{uid}  { uid, nome, email, empresaIds[], atualizadoPor, atualizadoEm }
// Toda gravação vai num lote com o registro em cadastro_audit.

import { getAuth } from 'firebase/auth';
import {
    collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch,
    type DocumentSnapshot, type QueryConstraint, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import app, { db } from '../firebaseConfig';
import { papelEfetivo } from '../auth/papeis';
import { auditar, type Usuario } from '../cadastros/cadastrosService';
import { diffCarteira, normalizarIds, type CarteiraAcesso } from './carteira';

const COL = 'carteira_acessos';
/** Limite do Firestore para o operador "in". */
export const LOTE_IN = 30;

export interface Escopo {
    uid: string;
    /** Gestor: enxerga todas as empresas (sem filtro). */
    todas: boolean;
    /** Empresas da carteira e as cadastradas pelo usuário (vazio para o gestor). */
    empresaIds: string[];
}

let cache: { uid: string; promessa: Promise<Escopo> } | null = null;

/** Esquece o escopo guardado (depois de mudar a carteira ou o papel). */
export function esquecerEscopo() { cache = null; }

/** Papel e carteira do usuário logado (uma leitura de cada por sessão). */
export function escopoAtual(): Promise<Escopo> {
    const uid = getAuth(app!).currentUser?.uid;
    if (!uid) return Promise.reject(new Error('Usuário não autenticado.'));
    if (cache?.uid === uid) return cache.promessa;
    const promessa = (async (): Promise<Escopo> => {
        const u = await getDoc(doc(db, 'users', uid));
        if (papelEfetivo(u.data()?.role) === 'gestor') return { uid, todas: true, empresaIds: [] };
        // Carteira + empresas que o próprio usuário cadastrou (as regras liberam as duas).
        const [c, criadas] = await Promise.all([
            getDoc(doc(db, COL, uid)),
            getDocs(query(collection(db, 'empresas'), where('criadoPor', '==', uid))),
        ]);
        return { uid, todas: false, empresaIds: normalizarIds([...((c.data()?.empresaIds as string[]) ?? []), ...criadas.docs.map(d => d.id)]) };
    })();
    cache = { uid, promessa };
    promessa.catch(() => { if (cache?.promessa === promessa) cache = null; });
    return promessa;
}

const lotes = <T,>(xs: T[], n = LOTE_IN) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Documentos de uma coleção por empresa, respeitando a carteira: o gestor
 * consulta sem filtro; os outros, empresaId "in" a carteira (em lotes de 30).
 */
export async function consultarPorEmpresas(colecao: string, ...restricoes: QueryConstraint[]): Promise<QueryDocumentSnapshot[]> {
    const e = await escopoAtual();
    if (e.todas) return (await getDocs(query(collection(db, colecao), ...restricoes))).docs;
    const partes = await Promise.all(lotes(e.empresaIds).map(ids => getDocs(query(collection(db, colecao), where('empresaId', 'in', ids), ...restricoes))));
    return partes.flatMap(p => p.docs);
}

/** Empresas pelo id, uma leitura por empresa (a regra libera empresa por empresa). Ids sem documento ficam de fora. */
export async function lerEmpresasPorId(ids: string[]): Promise<DocumentSnapshot[]> {
    // Uma empresa apagada ou sem permissão não derruba a lista inteira.
    const snaps = await Promise.all(normalizarIds(ids).map(id => getDoc(doc(db, 'empresas', id)).catch(() => null)));
    return snaps.filter((s): s is DocumentSnapshot => !!s?.exists());
}

export async function lerCarteira(uid: string): Promise<string[]> {
    const s = await getDoc(doc(db, COL, uid));
    return normalizarIds((s.data()?.empresaIds as string[]) ?? []);
}

/** Todas as carteiras (gestor e admin). */
export async function listarCarteiras(): Promise<Map<string, string[]>> {
    const s = await getDocs(collection(db, COL));
    return new Map(s.docs.map(d => [d.id, normalizarIds((d.data().empresaIds as string[]) ?? [])]));
}

export async function salvarCarteira(alvo: Omit<CarteiraAcesso, 'empresaIds'>, antes: string[], depois: string[], u: Usuario): Promise<void> {
    const ids = normalizarIds(depois);
    const { incluidas, removidas } = diffCarteira(antes, ids);
    if (!incluidas.length && !removidas.length) return;
    const lote = writeBatch(db);
    lote.set(doc(db, COL, alvo.uid), { uid: alvo.uid, nome: alvo.nome, email: alvo.email, empresaIds: ids, atualizadoPor: u.id, atualizadoEm: serverTimestamp() });
    auditar(lote, u, COL, alvo.uid, 'carteira', [
        ...incluidas.map(id => ({ campo: `empresa ${id}`, de: '', para: 'incluída' })),
        ...removidas.map(id => ({ campo: `empresa ${id}`, de: 'na carteira', para: 'removida' })),
    ] as never, { alvoEmail: alvo.email });
    await lote.commit();
    if (alvo.uid === getAuth(app!).currentUser?.uid) esquecerEscopo();
}
