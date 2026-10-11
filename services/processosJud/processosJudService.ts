// services/processosJud/processosJudService.ts
//
// Processos do S-1070 por empresa: processos_s1070/{empresa}_{tpProc}_{nrProc}. Não se apagam: o processo excluído no
// eSocial fica inativo (o histórico do que foi enviado).

import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { idProcesso, processoVazio, type ProcessoJudAdm } from './processosJud';

const COL = 'processos_s1070';
const limpo = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export async function listarProcessos(empresaId: string): Promise<ProcessoJudAdm[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return s.docs.map(d => { const v = processoVazio(empresaId); const x = d.data() as Partial<ProcessoJudAdm>; return { ...v, ...x, vara: { ...v.vara, ...(x.vara ?? {}) }, suspensoes: x.suspensoes ?? [], id: d.id }; })
        .sort((a, b) => a.nrProc.localeCompare(b.nrProc));
}

export async function salvarProcesso(p: ProcessoJudAdm, u: Usuario): Promise<string> {
    const nr = p.nrProc.replace(/\D/g, '');
    const id = idProcesso(p.empresaId, p.tpProc, nr);
    const { id: _id, ...dados } = { ...p, nrProc: nr };
    await setDoc(doc(db, COL, id), { ...limpo(dados), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    return id;
}
