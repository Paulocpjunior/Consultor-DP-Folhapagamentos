import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { serverTimestamp } from 'firebase/firestore';
import app from '../firebaseConfig';
import { atualizarEmpresa } from './empresasService';
import type { CertificadoDigital, CertificadoTipo, CertificadoStatus, Empresa } from './empresasTypes';

const storage = app ? getStorage(app) : null;

export async function uploadCertificado(
    empresaId: string,
    cnpj: string,
    uid: string,
    arquivo: File,
    tipo: CertificadoTipo,
    validade: string,
    meta?: { emissao?: string; emissor?: string; titular?: string },
): Promise<CertificadoDigital> {
    if (!storage) throw new Error('Firebase Storage não configurado');

    const storagePath = `certificados/${cnpj}/${arquivo.name}`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, arquivo);

    const certificado: CertificadoDigital = {
        tipo,
        storagePath,
        nomeArquivo: arquivo.name,
        validade,
        emissao: meta?.emissao,
        emissor: meta?.emissor,
        titular: meta?.titular,
        uploadEm: serverTimestamp(),
        uploadPor: uid,
    };

    await atualizarEmpresa(empresaId, { certificado } as any);
    return certificado;
}

export async function removerCertificado(empresaId: string, storagePath: string): Promise<void> {
    if (!storage) throw new Error('Firebase Storage não configurado');

    try {
        await deleteObject(ref(storage, storagePath));
    } catch (e: any) {
        if (e?.code !== 'storage/object-not-found') throw e;
    }

    await atualizarEmpresa(empresaId, { certificado: null } as any);
}

export async function getUrlDownload(storagePath: string): Promise<string> {
    if (!storage) throw new Error('Firebase Storage não configurado');
    return getDownloadURL(ref(storage, storagePath));
}

export function calcularStatusCertificado(validade?: string): CertificadoStatus {
    if (!validade) return 'sem_certificado';
    const hoje = new Date();
    const dataVal = new Date(validade + 'T23:59:59');
    if (dataVal < hoje) return 'vencido';
    const em30Dias = new Date();
    em30Dias.setDate(hoje.getDate() + 30);
    if (dataVal <= em30Dias) return 'vencendo';
    return 'valido';
}

export function diasParaVencer(validade: string): number {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataVal = new Date(validade + 'T00:00:00');
    return Math.ceil((dataVal.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

export function getStatusLabel(status: CertificadoStatus): { label: string; cls: string } {
    switch (status) {
        case 'valido':
            return { label: 'Válido', cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' };
        case 'vencendo':
            return { label: 'Vencendo', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' };
        case 'vencido':
            return { label: 'Vencido', cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' };
        case 'sem_certificado':
            return { label: 'Sem certificado', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' };
    }
}
