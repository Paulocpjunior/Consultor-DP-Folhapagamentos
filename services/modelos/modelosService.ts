// services/modelos/modelosService.ts
//
// Persistência dos contratos e modelos: modelos_documentos/{auto}. Do escritório (empresaId '') ou de uma
// empresa. Os modelos-base (modelosBase.ts) não ficam no banco: aparecem sempre e, ao editar, viram cópia.

import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { ModeloDocumento } from './modelos';
import { MODELOS_BASE } from './modelosBase';

const COL = 'modelos_documentos';

function modeloDe(id: string, x: Record<string, unknown>): ModeloDocumento {
    return {
        id, titulo: (x.titulo as string) ?? '', categoria: (x.categoria as ModeloDocumento['categoria']) ?? 'outro', corpo: (x.corpo as string) ?? '',
        empresaId: (x.empresaId as string) ?? '', origem: (x.origem as ModeloDocumento['origem']) ?? 'consultor',
        atualizadoPorEmail: x.atualizadoPorEmail as string | undefined, atualizadoEm: (x.atualizadoEm as { toDate?: () => Date } | null)?.toDate?.(),
    };
}

export const modelosBase = (): ModeloDocumento[] => MODELOS_BASE.map(m => ({ ...m, empresaId: '', origem: 'base' }));
export const ehBase = (m: Pick<ModeloDocumento, 'origem'>) => m.origem === 'base';

/** Modelos da empresa, do escritório e os modelos-base, nessa ordem. */
export async function listarModelos(empresaId: string): Promise<ModeloDocumento[]> {
    const [daEmpresa, doEscritorio] = await Promise.all([
        getDocs(query(collection(db, COL), where('empresaId', '==', empresaId))),
        getDocs(query(collection(db, COL), where('empresaId', '==', ''))),
    ]);
    const porTitulo = (a: ModeloDocumento, b: ModeloDocumento) => a.titulo.localeCompare(b.titulo, 'pt-BR');
    return [
        ...daEmpresa.docs.map(d => modeloDe(d.id, d.data())).sort(porTitulo),
        ...doEscritorio.docs.map(d => modeloDe(d.id, d.data())).sort(porTitulo),
        ...modelosBase(),
    ];
}

/** Grava (modelo-base ou sem id: cria um novo). Devolve o id. */
export async function salvarModelo(m: Omit<ModeloDocumento, 'id' | 'atualizadoEm' | 'atualizadoPorEmail'> & { id?: string }, u: Usuario): Promise<string> {
    const dados = {
        titulo: m.titulo.trim().slice(0, 120), categoria: m.categoria, corpo: m.corpo, empresaId: m.empresaId,
        origem: m.origem === 'base' ? 'consultor' : m.origem, atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp(),
    };
    if (!m.id || m.origem === 'base') return (await addDoc(collection(db, COL), dados)).id;
    await setDoc(doc(db, COL, m.id), dados);
    return m.id;
}

export const excluirModelo = (id: string) => deleteDoc(doc(db, COL, id));
