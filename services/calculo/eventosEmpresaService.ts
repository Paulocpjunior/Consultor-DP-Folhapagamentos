// services/calculo/eventosEmpresaService.ts
//
// Firestore da tabela de eventos da empresa: eventos_empresa/{empresa}, um documento por empresa. Gravar substitui a
// tabela inteira; apagar volta ao catálogo geral.

import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { EventoIobSage } from '../folha/folhaTypes';
import type { ModoTabelaEventos, TabelaEventosEmpresa } from './eventosEmpresa';

const COL = 'eventos_empresa';

export async function lerTabelaEventosEmpresa(empresaId: string): Promise<TabelaEventosEmpresa | null> {
    const s = await getDoc(doc(db, COL, empresaId));
    if (!s.exists()) return null;
    const x = s.data() as Omit<TabelaEventosEmpresa, 'atualizadoEm'> & { atualizadoEm?: { toDate?: () => Date } };
    return { ...x, atualizadoEm: x.atualizadoEm?.toDate?.() ?? null };
}

export async function gravarTabelaEventosEmpresa(empresaId: string, eventos: EventoIobSage[], modo: ModoTabelaEventos, origem: string, u: Usuario): Promise<void> {
    await setDoc(doc(db, COL, empresaId), { empresaId, eventos, modo, origem, atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
}

export async function apagarTabelaEventosEmpresa(empresaId: string): Promise<void> {
    await deleteDoc(doc(db, COL, empresaId));
}
