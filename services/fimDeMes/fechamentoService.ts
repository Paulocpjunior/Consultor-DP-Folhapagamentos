// services/fimDeMes/fechamentoService.ts
//
// Persistência do Fim de mês: fechamentos/{empresa}_{AAAA-MM} e fechamentos_pedidos/{auto}.
// As regras (firestore.rules) travam movimentos e afastamentos do período encerrado e deixam
// só o gestor reabrir e decidir os pedidos.

import { addDoc, arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { EMAIL_MASTER } from '../auth/papeis';
import { enviarEmailPeloEscritorio } from '../pacoteCliente/spConnect';
import { idFechamento, type Fechamento, type PedidoReabertura } from './fechamento';

const FECH = 'fechamentos';
const PED = 'fechamentos_pedidos';
const data = (t: unknown) => (t as { toDate?: () => Date } | null)?.toDate?.();

function fechamentoDe(id: string, x: Record<string, unknown>): Fechamento {
    return {
        id, empresaId: x.empresaId as string, competencia: x.competencia as string, situacao: x.situacao as Fechamento['situacao'],
        encerradoPorEmail: x.encerradoPorEmail as string | undefined, encerradoEm: data(x.encerradoEm), checklist: (x.checklist as Record<string, boolean>) ?? {},
        reabertoPorEmail: x.reabertoPorEmail as string | undefined, reabertoEm: data(x.reabertoEm), motivoReabertura: x.motivoReabertura as string | undefined,
        historico: (x.historico as Fechamento['historico']) ?? [],
    };
}
function pedidoDe(id: string, x: Record<string, unknown>): PedidoReabertura {
    return {
        id, empresaId: x.empresaId as string, empresaNome: (x.empresaNome as string) ?? '', competencia: x.competencia as string, motivo: x.motivo as string,
        situacao: x.situacao as PedidoReabertura['situacao'], pedidoPorEmail: (x.pedidoPorEmail as string) ?? '', pedidoEm: data(x.pedidoEm),
        decididoPorEmail: x.decididoPorEmail as string | undefined, decididoEm: data(x.decididoEm), resposta: x.resposta as string | undefined,
    };
}

export async function lerFechamento(empresaId: string, competencia: string): Promise<Fechamento | null> {
    const s = await getDoc(doc(db, FECH, idFechamento(empresaId, competencia)));
    return s.exists() ? fechamentoDe(s.id, s.data()) : null;
}

export async function listarFechamentos(empresaId: string): Promise<Fechamento[]> {
    const s = await getDocs(query(collection(db, FECH), where('empresaId', '==', empresaId)));
    return s.docs.map(d => fechamentoDe(d.id, d.data())).sort((a, b) => b.competencia.localeCompare(a.competencia));
}

/** Encerra (ou reencerra, depois de reaberto) com a lista de conferência. */
export async function encerrarPeriodo(empresaId: string, competencia: string, checklist: Record<string, boolean>, u: Usuario): Promise<void> {
    await setDoc(doc(db, FECH, idFechamento(empresaId, competencia)), {
        empresaId, competencia, situacao: 'encerrado', checklist,
        encerradoPor: u.id, encerradoPorEmail: u.email, encerradoEm: serverTimestamp(),
        historico: arrayUnion({ acao: 'encerrado', porEmail: u.email, em: new Date().toISOString() }),
    }, { merge: true });
}

/** Só o gestor: reabre com o motivo (e aprova o pedido, quando veio de um). */
export async function reabrirPeriodo(empresaId: string, competencia: string, motivo: string, u: Usuario, pedidoId?: string): Promise<void> {
    const b = writeBatch(db);
    b.update(doc(db, FECH, idFechamento(empresaId, competencia)), {
        situacao: 'reaberto', reabertoPor: u.id, reabertoPorEmail: u.email, reabertoEm: serverTimestamp(), motivoReabertura: motivo,
        ...(pedidoId ? { pedidoId } : {}),
        historico: arrayUnion({ acao: 'reaberto', porEmail: u.email, em: new Date().toISOString(), motivo }),
    });
    if (pedidoId) b.update(doc(db, PED, pedidoId), { situacao: 'aprovado', decididoPor: u.id, decididoPorEmail: u.email, decididoEm: serverTimestamp() });
    await b.commit();
}

export async function recusarPedido(pedidoId: string, resposta: string, u: Usuario): Promise<void> {
    await updateDoc(doc(db, PED, pedidoId), { situacao: 'recusado', decididoPor: u.id, decididoPorEmail: u.email, decididoEm: serverTimestamp(), resposta });
}

/**
 * Pede a reabertura e avisa o gestor do DP por e-mail (pelo escritório, via CFI). O pedido vale mesmo se o e-mail
 * falhar: o gestor o vê no Fim de mês e no aviso do cabeçalho. Devolve o erro do e-mail, se houver.
 */
export async function pedirReabertura(p: { empresaId: string; empresaNome: string; cnpj: string; competencia: string; motivo: string }, u: Usuario,
    enviar: typeof enviarEmailPeloEscritorio = enviarEmailPeloEscritorio): Promise<{ id: string; erroEmail?: string }> {
    const ref = await addDoc(collection(db, PED), {
        empresaId: p.empresaId, empresaNome: p.empresaNome, competencia: p.competencia, motivo: p.motivo, situacao: 'pendente',
        pedidoPor: u.id, pedidoPorEmail: u.email, pedidoEm: serverTimestamp(),
    });
    const comp = p.competencia.split('-').reverse().join('/');
    try {
        await enviar({
            empresaId: p.empresaId, cnpj: p.cnpj, empresaNome: p.empresaNome, titulo: 'Pedido de reabertura', competencia: p.competencia, para: EMAIL_MASTER,
            assunto: `Consultor DP: pedido de reabertura de ${comp} — ${p.empresaNome}`,
            mensagem: `${u.email} pediu a reabertura da competência ${comp} da empresa ${p.empresaNome}, encerrada no Fim de mês.\n\nMotivo: ${p.motivo}\n\nAprove ou recuse no Consultor DP, menu Fim de mês › Pedidos de reabertura.`,
            anexos: [],
        });
        return { id: ref.id };
    } catch (e) {
        return { id: ref.id, erroEmail: (e as Error)?.message ?? String(e) };
    }
}

export async function listarPedidosPendentes(): Promise<PedidoReabertura[]> {
    const s = await getDocs(query(collection(db, PED), where('situacao', '==', 'pendente')));
    return s.docs.map(d => pedidoDe(d.id, d.data())).sort((a, b) => (a.pedidoEm?.getTime() ?? 0) - (b.pedidoEm?.getTime() ?? 0));
}

export async function listarPedidosDaEmpresa(empresaId: string): Promise<PedidoReabertura[]> {
    const s = await getDocs(query(collection(db, PED), where('empresaId', '==', empresaId)));
    return s.docs.map(d => pedidoDe(d.id, d.data())).sort((a, b) => (b.pedidoEm?.getTime() ?? 0) - (a.pedidoEm?.getTime() ?? 0));
}
