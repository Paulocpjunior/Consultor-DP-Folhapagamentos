// services/processoTrabalhista/processosService.ts
//
// Persistência dos processos trabalhistas: processos_trabalhistas/{empresa}_{número do processo}, com os
// trabalhadores (S-2500) e os pagamentos (S-2501). Não se apaga pelo DP (só o admin): o processo é a memória do que
// foi ao eSocial. Os envios ficam na fila de sempre (esocial_envios), com a referência do processo.

import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { idProcesso, processoVazio, type ProcessoTrabalhista } from './processoTrabalhista';

const COL = 'processos_trabalhistas';
const limpo = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export async function listarProcessos(empresaId: string): Promise<ProcessoTrabalhista[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId)));
    return s.docs.map(d => ({ ...processoVazio(empresaId), ...(d.data() as Partial<ProcessoTrabalhista>) }))
        .sort((a, b) => a.nrProcTrab.localeCompare(b.nrProcTrab));
}

export async function salvarProcesso(p: ProcessoTrabalhista, u: Usuario): Promise<void> {
    const nrProcTrab = p.nrProcTrab.replace(/\D/g, '');
    await setDoc(doc(db, COL, idProcesso(p.empresaId, nrProcTrab)), {
        ...limpo({ ...p, nrProcTrab }), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    });
}
