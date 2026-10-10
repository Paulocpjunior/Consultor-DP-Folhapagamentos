// services/esocial/pedidosS1010Service.ts
//
// Pedidos do S-1010 (esocial_s1010/{empresa}_{auto}): o rascunho montado pela equipe, a transmissão pelo pré-voo
// (ref s1010:{id} no registro de envios) e, aceito em produção, a rubrica atualizada no cadastro no mesmo lote em
// que o pedido vira "aplicado". Nada se apaga: o pedido que não vai sair fica "descartado".

import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { gravarRubricaDoS1010, limpo, type Usuario } from '../cadastros/cadastrosService';
import type { Rubrica } from '../cadastros/rubricas';
import type { PedidoS1010 } from './tabelaRubricas';

const COL = 'esocial_s1010';

const deDoc = (id: string, x: Record<string, unknown>): PedidoS1010 & { criadoEm?: Date } => ({
    id, empresaId: String(x.empresaId ?? ''), acao: (x.acao as PedidoS1010['acao']) ?? 'inclusao',
    codRubr: String(x.codRubr ?? ''), ideTabRubr: String(x.ideTabRubr ?? ''), iniValid: String(x.iniValid ?? ''), fimValid: String(x.fimValid ?? ''),
    novaIniValid: String(x.novaIniValid ?? ''), novaFimValid: String(x.novaFimValid ?? ''), dados: (x.dados as PedidoS1010['dados']) ?? null,
    chaveVerba: String(x.chaveVerba ?? ''), situacao: (x.situacao as PedidoS1010['situacao']) ?? 'rascunho', recibo: String(x.recibo ?? ''),
    criadoPorEmail: String(x.criadoPorEmail ?? ''), criadoEm: (x.criadoEm as { toDate?: () => Date } | null)?.toDate?.(),
});

/** Pedidos da empresa, do mais recente ao mais antigo. */
export async function listarPedidosS1010(empresaId: string): Promise<(PedidoS1010 & { criadoEm?: Date })[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return s.docs.map(d => deDoc(d.id, d.data())).sort((a, b) => (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0));
}

const campos = (p: PedidoS1010) => limpo({
    empresaId: p.empresaId, acao: p.acao, codRubr: p.codRubr, ideTabRubr: p.ideTabRubr, iniValid: p.iniValid, fimValid: p.fimValid,
    novaIniValid: p.novaIniValid, novaFimValid: p.novaFimValid, dados: p.dados, chaveVerba: p.chaveVerba,
});

/** Grava o rascunho (novo ou editado). Devolve o id. */
export async function salvarPedidoS1010(p: PedidoS1010, u: Usuario): Promise<string> {
    if (p.id) {
        await updateDoc(doc(db, COL, p.id), { ...campos(p), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
        return p.id;
    }
    const id = `${p.empresaId}_${doc(collection(db, COL)).id}`;
    await setDoc(doc(db, COL, id), {
        ...campos(p), situacao: 'rascunho', recibo: '', criadoPor: u.id, criadoPorEmail: u.email, criadoEm: serverTimestamp(),
        atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    });
    return id;
}

export const descartarPedidoS1010 = (p: PedidoS1010, u: Usuario) =>
    updateDoc(doc(db, COL, p.id), { situacao: 'descartado', atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });

/** S-1010 aceito: a rubrica no cadastro e o pedido "aplicado" (com o recibo) no mesmo lote. */
export async function aplicarPedidoS1010(p: PedidoS1010, nova: Rubrica, antes: Rubrica | undefined, recibo: string, u: Usuario): Promise<void> {
    await gravarRubricaDoS1010(nova, antes, u, recibo, lote => lote.update(doc(db, COL, p.id), {
        situacao: 'aplicado', recibo, atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    }));
}
