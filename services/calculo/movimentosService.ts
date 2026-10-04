// services/calculo/movimentosService.ts
//
// Persistência do movimento do mês: calculo_movimentos/{idDaFicha}_{AAAA-MM}.
// Cada gravação vai num lote com o registro em cadastro_audit (só inclusão),
// como nos cadastros. As regras estão em firestore.rules.

import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { auditar, diffObjeto, limpo, type Usuario } from '../cadastros/cadastrosService';
import type { Movimento } from './motorMensal';
import { idMovimento, limparMovimento, type MovimentoGravado } from './movimento';

const MOV = 'calculo_movimentos';

export async function listarMovimentos(empresaId: string, competencia: string): Promise<MovimentoGravado[]> {
    const snap = await getDocs(query(collection(db, MOV), where('empresaId', '==', empresaId), where('competencia', '==', competencia)));
    return snap.docs.map(d => {
        const x = d.data();
        return { id: d.id, empresaId: x.empresaId, fichaId: x.fichaId, competencia: x.competencia, movimento: x.movimento ?? {}, atualizadoPorEmail: x.atualizadoPorEmail, atualizadoEm: x.atualizadoEm?.toDate?.() };
    });
}

export interface MovimentoParaGravar { fichaId: string; antes: Movimento | null; depois: Movimento }

/** Grava os movimentos alterados (movimento + auditoria = 2 escritas cada), em lotes. */
export async function salvarMovimentos(empresaId: string, competencia: string, itens: MovimentoParaGravar[], u: Usuario): Promise<void> {
    for (let i = 0; i < itens.length; i += 200) {
        const lote = writeBatch(db);
        for (const { fichaId, antes, depois } of itens.slice(i, i + 200)) {
            const id = idMovimento(fichaId, competencia);
            const movimento = limpo(limparMovimento(depois));
            lote.set(doc(db, MOV, id), { empresaId, fichaId, competencia, movimento, atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
            auditar(lote, u, MOV, id, antes ? 'editar movimento' : 'lançar movimento', diffObjeto(antes && limparMovimento(antes), movimento), { empresaId, competencia });
        }
        await lote.commit();
    }
}

/** Movimentos gravados de uma empresa, por ficha e competência (médias e faltas). Consulta só pela empresa: sem índice composto. */
export async function listarMovimentosDaEmpresa(empresaId: string, filtro: (competencia: string) => boolean = () => true): Promise<Record<string, Record<string, Movimento>>> {
    const snap = await getDocs(query(collection(db, MOV), where('empresaId', '==', empresaId)));
    const out: Record<string, Record<string, Movimento>> = {};
    for (const d of snap.docs) {
        const x = d.data();
        if (typeof x.competencia !== 'string' || !filtro(x.competencia)) continue;
        (out[x.fichaId] ??= {})[x.competencia] = x.movimento ?? {};
    }
    return out;
}

/** Movimentos do ano (para as médias do 13º). */
export const listarMovimentosDoAno = (empresaId: string, ano: number) => listarMovimentosDaEmpresa(empresaId, c => c.startsWith(`${ano}-`));
