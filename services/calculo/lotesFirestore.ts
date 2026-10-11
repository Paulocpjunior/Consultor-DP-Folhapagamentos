// services/calculo/lotesFirestore.ts
//
// Gravação em vários lotes do Firestore (até 500 escritas por lote): a folha e os processos gravados de empresas com
// mais de 450 funcionários. As escritas vão em ordem; quem chama põe o documento-resumo por último ao gravar e por
// primeiro ao apagar, para que uma falha no meio nunca deixe uma folha "completa" pela metade.

import { writeBatch, type Firestore, type WriteBatch } from 'firebase/firestore';

export type Escrita = (b: WriteBatch) => void;
export const ESCRITAS_POR_LOTE = 400;

/** Separa as escritas em lotes de até `tamanho` (o resumo, a auditoria e os holerites contam como uma escrita cada). */
export function dividirEmLotes<T>(itens: T[], tamanho = ESCRITAS_POR_LOTE): T[][] {
    const r: T[][] = [];
    for (let i = 0; i < itens.length; i += tamanho) r.push(itens.slice(i, i + tamanho));
    return r.length ? r : [[]];
}

/** Executa as escritas em lotes, na ordem. */
export async function gravarEmLotes(db: Firestore, escritas: Escrita[], tamanho = ESCRITAS_POR_LOTE): Promise<number> {
    const lotes = dividirEmLotes(escritas, tamanho);
    for (const l of lotes) {
        const b = writeBatch(db);
        for (const e of l) e(b);
        await b.commit();
    }
    return lotes.length;
}
