// services/folha/folhaFirestoreService.ts
// Persistência do módulo Folha no Firestore.
// Coleções:
//   folha_catalogo          — doc id = "iob_sage" (catálogo de 599 eventos)
//   folha_selecoes_eventos  — doc id = "<CLIENTE>" (códigos selecionados)
//   folha_mapeamentos       — doc id = "<CLIENTE>" (mapeamento do apontamento)
//   folha_historico         — subcoleção por cliente (cada export vira um doc)

import {
    doc,
    getDoc,
    setDoc,
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    limit,
    getDocs,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type {
    CatalogoEventos,
    HistoricoExportacao,
    MapeamentoApontamento,
    SelecaoEventos,
} from './folhaTypes';

const COL = {
    catalogo: 'folha_catalogo',
    selecoes: 'folha_selecoes_eventos',
    mapeamentos: 'folha_mapeamentos',
    historico: 'folha_historico',
} as const;

// ─── Catálogo ───────────────────────────────────────────────────────────

export async function getCatalogo(): Promise<CatalogoEventos | null> {
    const snap = await getDoc(doc(db, COL.catalogo, 'iob_sage'));
    return snap.exists() ? (snap.data() as CatalogoEventos) : null;
}

export async function setCatalogo(catalogo: CatalogoEventos): Promise<void> {
    await setDoc(doc(db, COL.catalogo, 'iob_sage'), catalogo);
}

// ─── Seleção de eventos por cliente ────────────────────────────────────

export async function getSelecao(cliente: string): Promise<SelecaoEventos> {
    const snap = await getDoc(doc(db, COL.selecoes, cliente));
    if (!snap.exists()) {
        return { cliente, codigos: [], atualizadoEm: '', total: 0 };
    }
    return snap.data() as SelecaoEventos;
}

export async function saveSelecao(cliente: string, codigos: string[]): Promise<SelecaoEventos> {
    const ordenados = Array.from(new Set(codigos)).sort();
    const payload: SelecaoEventos = {
        cliente,
        codigos: ordenados,
        atualizadoEm: new Date().toISOString(),
        total: ordenados.length,
    };
    await setDoc(doc(db, COL.selecoes, cliente), payload);
    return payload;
}

// ─── Mapeamento do apontamento por cliente ─────────────────────────────

export async function getMapeamento(cliente: string): Promise<MapeamentoApontamento | null> {
    const snap = await getDoc(doc(db, COL.mapeamentos, cliente));
    return snap.exists() ? (snap.data() as MapeamentoApontamento) : null;
}

export async function saveMapeamento(mapa: MapeamentoApontamento): Promise<void> {
    await setDoc(doc(db, COL.mapeamentos, mapa.cliente), mapa);
}

/**
 * Atualiza matrículas de uma empresa preservando o resto do mapeamento.
 * Versão idempotente: cria o documento se não existir (merge).
 */
export async function saveMatriculas(
    cliente: string,
    empresa: string,
    matriculas: Record<string, string>,
): Promise<void> {
    const ref = doc(db, COL.mapeamentos, cliente);
    await setDoc(
        ref,
        { matriculas: { [empresa]: matriculas } },
        { merge: true },
    );
}

// ─── Histórico de exportações ──────────────────────────────────────────

export async function addHistorico(registro: HistoricoExportacao): Promise<void> {
    const col = collection(db, COL.historico, registro.cliente, 'exportacoes');
    await addDoc(col, { ...registro, criadoEm: serverTimestamp() });
}

export async function listHistorico(cliente: string, max = 20): Promise<HistoricoExportacao[]> {
    const col = collection(db, COL.historico, cliente, 'exportacoes');
    const q = query(col, orderBy('criadoEm', 'desc'), limit(max));
    const snap = await getDocs(q);
    return snap.docs.map((d: { data: () => unknown }) => d.data() as HistoricoExportacao);
}
