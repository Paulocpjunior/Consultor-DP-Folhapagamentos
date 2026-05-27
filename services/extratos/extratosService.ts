import {
    collection, doc, addDoc, getDocs, updateDoc,
    query, where, orderBy, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { ExtratoTransacao, ConciliacaoResult, ConciliacaoItem } from './extratosTypes';

const COL = 'extratos_transacoes';

/**
 * Importa um lote de transações no Firestore.
 * Usa writeBatch para atomicidade (máx 500 por batch).
 */
export async function importarTransacoes(
    transacoes: Omit<ExtratoTransacao, 'id'>[],
): Promise<number> {
    if (!db) throw new Error('Firebase não configurado');
    if (transacoes.length === 0) return 0;

    // Split into chunks of 500 (Firestore batch limit)
    const chunks: Omit<ExtratoTransacao, 'id'>[][] = [];
    for (let i = 0; i < transacoes.length; i += 500) {
        chunks.push(transacoes.slice(i, i + 500));
    }

    let total = 0;
    for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const t of chunk) {
            const ref = doc(collection(db, COL));
            batch.set(ref, {
                ...t,
                importadoEm: serverTimestamp(),
            });
        }
        await batch.commit();
        total += chunk.length;
    }

    return total;
}

/**
 * Lista transações filtradas por empresa e período.
 */
export async function listarTransacoes(
    empresaId: string,
    periodo: string,
): Promise<ExtratoTransacao[]> {
    if (!db) return [];
    const q = query(
        collection(db, COL),
        where('empresaId', '==', empresaId),
        where('periodo', '==', periodo),
        orderBy('data', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/**
 * Lista TODAS as transações de uma empresa (sem filtro de período).
 */
export async function listarTodasTransacoes(
    empresaId: string,
): Promise<ExtratoTransacao[]> {
    if (!db) return [];
    const q = query(
        collection(db, COL),
        where('empresaId', '==', empresaId),
        orderBy('data', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/**
 * Atualiza a categoria de uma transação (override manual).
 */
export async function atualizarCategoria(
    id: string,
    categoria: string,
): Promise<void> {
    if (!db) throw new Error('Firebase não configurado');
    await updateDoc(doc(db, COL, id), {
        categoria,
        categoriaManual: true,
    });
}

/**
 * Calcula conciliação entre folha (esperado) e extrato (real).
 * Agrupa por categoria e compara valores.
 */
export async function calcularConciliacao(
    empresaId: string,
    periodo: string,
): Promise<ConciliacaoResult> {
    const transacoes = await listarTransacoes(empresaId, periodo);

    // Agrupar extrato por categoria
    const extratoMap = new Map<string, number>();
    for (const t of transacoes) {
        const cat = t.categoria || 'Outros';
        const val = t.tipo === 'debito' ? Math.abs(t.valor) : t.valor;
        extratoMap.set(cat, (extratoMap.get(cat) || 0) + val);
    }

    // Categorias padrão da folha (esperado) — valores serão comparados
    const categoriasFolha = [
        'Salário', 'FGTS', 'INSS', 'IRRF',
        'Vale Transporte', 'Vale Alimentação',
        '13o Salário', 'Férias', 'Rescisão',
    ];

    const todasCats = new Set([...categoriasFolha, ...extratoMap.keys()]);
    const itens: ConciliacaoItem[] = [];

    let totalFolha = 0;
    let totalExtrato = 0;
    let conciliados = 0;
    let divergencias = 0;
    let ausentesFolha = 0;
    let ausentesExtrato = 0;

    for (const cat of todasCats) {
        if (cat === 'Outros') continue;
        const valorExtrato = extratoMap.get(cat) || 0;
        // Folha — placeholder: we match against extrato data
        // In a full implementation, this would read from folha collections
        const valorFolha = 0; // TODO: integrate with folha data
        const diferenca = valorExtrato - valorFolha;

        let status: ConciliacaoItem['status'];
        if (valorFolha === 0 && valorExtrato > 0) {
            status = 'ausente_folha';
            ausentesFolha++;
        } else if (valorFolha > 0 && valorExtrato === 0) {
            status = 'ausente_extrato';
            ausentesExtrato++;
        } else if (Math.abs(diferenca) < 0.01) {
            status = 'conciliado';
            conciliados++;
        } else {
            status = 'divergencia';
            divergencias++;
        }

        totalFolha += valorFolha;
        totalExtrato += valorExtrato;

        itens.push({ descricao: cat, valorFolha, valorExtrato, diferenca, status });
    }

    return {
        itens,
        totalFolha,
        totalExtrato,
        diferenca: totalExtrato - totalFolha,
        conciliados,
        divergencias,
        ausentesFolha,
        ausentesExtrato,
    };
}
