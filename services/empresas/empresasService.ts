import {
    collection, doc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
    query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Empresa, EmpresaInput } from './empresasTypes';

export async function listarMinhasEmpresas(uid: string): Promise<Empresa[]> {
    const q = query(
        collection(db, 'empresas'),
        where('criadoPor', '==', uid),
        orderBy('nomeFantasia', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function listarTodasEmpresas(): Promise<Empresa[]> {
    const q = query(collection(db, 'empresas'), orderBy('nomeFantasia', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function criarEmpresa(uid: string, input: EmpresaInput): Promise<string> {
    const cnpjLimpo = input.cnpj.replace(/\D/g, '');
    const todas = await listarTodasEmpresas();
    if (todas.some((e) => e.cnpj === cnpjLimpo)) {
        throw new Error('Já existe uma empresa cadastrada com este CNPJ.');
    }
    const ref = await addDoc(collection(db, 'empresas'), {
        cnpj: cnpjLimpo,
        razaoSocial: input.razaoSocial.trim(),
        nomeFantasia: input.nomeFantasia.trim(),
        codigoSage: input.codigoSage.padStart(4, '0').slice(0, 4),
        criadoPor: uid,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
    });
    return ref.id;
}

export async function atualizarEmpresa(id: string, input: Partial<EmpresaInput> & Record<string, any>): Promise<void> {
    const patch: any = { atualizadoEm: serverTimestamp() };
    if (input.cnpj         !== undefined) patch.cnpj         = input.cnpj.replace(/\D/g, '');
    if (input.razaoSocial  !== undefined) patch.razaoSocial  = input.razaoSocial.trim();
    if (input.nomeFantasia !== undefined) patch.nomeFantasia = input.nomeFantasia.trim();
    if (input.codigoSage   !== undefined) patch.codigoSage   = input.codigoSage.padStart(4, '0').slice(0, 4);
    if ('certificado' in input) patch.certificado = input.certificado;
    await updateDoc(doc(db, 'empresas', id), patch);
}

export async function excluirEmpresa(id: string): Promise<void> {
    await deleteDoc(doc(db, 'empresas', id));
}

export async function buscarEmpresa(id: string): Promise<Empresa | null> {
    const snap = await getDoc(doc(db, 'empresas', id));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) }) : null;
}
