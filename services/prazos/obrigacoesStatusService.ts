// services/prazos/obrigacoesStatusService.ts
//
// Marcações do calendário de obrigações por empresa e competência:
//   obrigacoes_status/{empresaId}_{obrigação-AAAA-MM}
//   { empresaId, obrigacao, competencia, nome, status, observacao, atualizadoPor, atualizadoPorEmail, atualizadoEm }
// Toda marcação (e o "desfazer") vai num lote com o registro em cadastro_audit.

import { collection, deleteField, doc, getDocs, query, serverTimestamp, where, writeBatch, type Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { auditar, type Usuario } from '../cadastros/cadastrosService';
import { idMarcacao, type MarcacaoObrigacao, type ObrigacaoEmpresa } from './obrigacoesEmpresa';

const COL = 'obrigacoes_status';
const ROTULO = { entregue: 'entregue', 'nao-se-aplica': 'não se aplica' } as const;

/** Marcações da empresa na competência, pelo id da obrigação. */
export async function listarMarcacoes(empresaId: string, competencia: string): Promise<Map<string, MarcacaoObrigacao>> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId), where('competencia', '==', competencia)));
    return new Map(s.docs.map(d => {
        const x = d.data();
        const em = (x.atualizadoEm as Timestamp | null)?.toDate?.();
        return [x.obrigacao as string, { status: x.status, atualizadoPorEmail: x.atualizadoPorEmail, atualizadoEm: em ? em.toISOString() : undefined, observacao: x.observacao || undefined }];
    }));
}

/** `competencia`: a de trabalho (a obrigação anual do 13º leva só o ano). */
export async function marcarObrigacao(empresaId: string, competencia: string, o: ObrigacaoEmpresa, status: MarcacaoObrigacao['status'], observacao: string, antes: MarcacaoObrigacao | undefined, u: Usuario): Promise<void> {
    const id = idMarcacao(empresaId, o.id);
    const obs = observacao.trim().slice(0, 500);
    const lote = writeBatch(db);
    lote.set(doc(db, COL, id), {
        empresaId, obrigacao: o.id, competencia, nome: o.nome, vencimento: o.data, status,
        observacao: obs || deleteField(), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    }, { merge: true });
    auditar(lote, u, COL, id, antes ? 'editar' : 'criar', [{ campo: o.nome, de: antes ? ROTULO[antes.status] : 'pendente', para: obs ? `${ROTULO[status]} (${obs})` : ROTULO[status] }] as never, { empresaId });
    await lote.commit();
}

export async function desmarcarObrigacao(empresaId: string, o: ObrigacaoEmpresa, antes: MarcacaoObrigacao, u: Usuario): Promise<void> {
    const id = idMarcacao(empresaId, o.id);
    const lote = writeBatch(db);
    lote.delete(doc(db, COL, id));
    auditar(lote, u, COL, id, 'excluir', [{ campo: o.nome, de: ROTULO[antes.status], para: 'pendente' }] as never, { empresaId });
    await lote.commit();
}
