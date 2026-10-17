// services/relatorios/historicoSageService.ts
//
// Persistência do histórico de holerites do SAGE para a ficha financeira: historico_sage/{fichaId}_{AAAA}, um por
// funcionário e ano. Gravado na restauração do backup (regrava por cima ao restaurar de novo); lido pelo relatório.

import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { HistoricoSageAno } from './historicoSage';

const COL = 'historico_sage';
const LOTE = 400;

export const idHistoricoSage = (h: Pick<HistoricoSageAno, 'fichaId' | 'ano'>) => `${h.fichaId}_${h.ano}`;

export async function gravarHistoricoSage(anos: HistoricoSageAno[], u: Usuario, origem: string[], aoProgresso: (n: number) => void = () => {}): Promise<void> {
    for (let i = 0; i < anos.length; i += LOTE) {
        const b = writeBatch(db);
        for (const h of anos.slice(i, i + LOTE)) {
            b.set(doc(db, COL, idHistoricoSage(h)), {
                empresaId: h.empresaId, fichaId: h.fichaId, ano: h.ano, nome: h.nome, linhas: h.linhas,
                ...(h.porFinalidade ? { porFinalidade: h.porFinalidade } : {}), ...(h.comNaturezas !== undefined ? { comNaturezas: h.comNaturezas } : {}),
                origem: origem.join(', ').slice(0, 500), gravadoPor: u.id, gravadoEm: serverTimestamp(),
            });
        }
        await b.commit();
        aoProgresso(Math.min(i + LOTE, anos.length));
    }
}

export async function lerHistoricoSageDoAno(empresaId: string, ano: string): Promise<HistoricoSageAno[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId), where('ano', '==', ano)));
    return s.docs.map(d => {
        const x = d.data();
        return { empresaId: x.empresaId, fichaId: x.fichaId, ano: x.ano, nome: x.nome ?? '', linhas: x.linhas ?? [],
            ...(x.porFinalidade ? { porFinalidade: x.porFinalidade } : {}), ...(x.comNaturezas !== undefined ? { comNaturezas: !!x.comNaturezas } : {}) };
    });
}
