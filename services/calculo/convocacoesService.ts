// services/calculo/convocacoesService.ts
//
// Convocações do trabalho intermitente: convocacoes_intermitente/{id}, com o id começando pelo da ficha
// ({empresa}_{cpf}_{matrícula}_{sequencial}).

import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { Convocacao } from './intermitente';

const COL = 'convocacoes_intermitente';

export const novoIdConvocacao = (fichaId: string, agora = Date.now()) => `${fichaId}_${agora.toString(36)}`;

export async function listarConvocacoes(empresaId: string): Promise<Convocacao[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return s.docs.map(d => {
        const x = d.data();
        return { id: d.id, empresaId: x.empresaId, fichaId: x.fichaId, enviadaEm: x.enviadaEm ?? '', resposta: x.resposta ?? 'pendente', respondidaEm: x.respondidaEm ?? '',
            funcao: x.funcao ?? '', local: x.local ?? '', valorHora: x.valorHora ?? 0, dias: x.dias ?? [], obs: x.obs ?? '', atualizadoPor: x.atualizadoPor,
            codigo: typeof x.codigo === 'number' ? x.codigo : undefined, dataPagamento: x.dataPagamento ?? '', jornada: x.jornada ?? '', eventos: x.eventos ?? [] };
    });
}

export async function salvarConvocacao(c: Convocacao, u: Usuario): Promise<void> {
    await setDoc(doc(db, COL, c.id), {
        empresaId: c.empresaId, fichaId: c.fichaId, enviadaEm: c.enviadaEm, resposta: c.resposta, respondidaEm: c.respondidaEm,
        funcao: c.funcao, local: c.local, valorHora: c.valorHora, dias: c.dias.map(x => ({ data: x.data, horas: x.horas })), obs: c.obs,
        ...(c.codigo ? { codigo: c.codigo } : {}), dataPagamento: c.dataPagamento ?? '', jornada: c.jornada ?? '',
        eventos: (c.eventos ?? []).map(ev => ({ descricao: ev.descricao, tipo: ev.tipo, valor: Math.round(ev.valor), inss: !!ev.inss, fgts: !!ev.fgts, irrf: !!ev.irrf })),
        atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    });
}

/** Próximo código de convocação da empresa (sequencial, como o do SAGE). */
export const proximoCodigoConvocacao = (cs: Pick<Convocacao, 'codigo'>[]) => cs.reduce((m, c) => Math.max(m, c.codigo ?? 0), 0) + 1;

export async function excluirConvocacao(id: string): Promise<void> {
    await deleteDoc(doc(db, COL, id));
}
