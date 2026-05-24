import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, listAll, getMetadata } from 'firebase/storage';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { collection, getDocs, serverTimestamp } from 'firebase/firestore';
import app from '../firebaseConfig';
import { db } from '../firebaseConfig';
import { atualizarEmpresa } from './empresasService';
import type { CertificadoDigital, CertificadoTipo, CertificadoStatus, Empresa } from './empresasTypes';

const storage = app ? getStorage(app) : null;

const FISCAL_STORAGE_BUCKET = 'consultor-fiscal-inteligente.firebasestorage.app';

function getFiscalStorage() {
    const appName = 'consultor-fiscal';
    let fiscalApp;
    try {
        fiscalApp = getApp(appName);
    } catch {
        fiscalApp = initializeApp({ storageBucket: FISCAL_STORAGE_BUCKET }, appName);
    }
    return getStorage(fiscalApp);
}

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

// ──── Descoberta automática de certificados no Storage ────────────────────────

export interface CertificadoStorage {
    cnpj: string;
    nomeArquivo: string;
    storagePath: string;
    tamanho: number;
    atualizado: string;
    contentType: string;
}

async function escanearPastaRecursivo(storageRef: any, resultado: CertificadoStorage[]): Promise<void> {
    const lista = await listAll(storageRef);

    for (const itemRef of lista.items) {
        const nome = itemRef.name.toLowerCase();
        if (nome.endsWith('.pfx') || nome.endsWith('.p12') || nome.endsWith('.cer') || nome.endsWith('.pem')) {
            const partes = itemRef.fullPath.split('/');
            let cnpj = '';
            for (const parte of partes) {
                const digits = parte.replace(/\D/g, '');
                if (digits.length >= 11 && digits.length <= 14) {
                    cnpj = digits.padStart(14, '0');
                    break;
                }
            }

            let tamanho = 0;
            let atualizado = '';
            let contentType = '';
            try {
                const meta = await getMetadata(itemRef);
                tamanho = meta.size;
                atualizado = meta.updated;
                contentType = meta.contentType || '';
            } catch {}

            resultado.push({
                cnpj,
                nomeArquivo: itemRef.name,
                storagePath: itemRef.fullPath,
                tamanho,
                atualizado,
                contentType,
            });
        }
    }

    for (const prefixRef of lista.prefixes) {
        await escanearPastaRecursivo(prefixRef, resultado);
    }
}

export async function listarCertificadosNoStorage(): Promise<CertificadoStorage[]> {
    const resultado: CertificadoStorage[] = [];
    const pastasRaiz = ['certificados', 'certificates', 'certs', ''];

    const fiscalStorage = getFiscalStorage();
    const storages = [
        { instance: fiscalStorage, label: 'fiscal' },
        ...(storage ? [{ instance: storage, label: 'dp' }] : []),
    ];

    for (const { instance, label } of storages) {
        for (const pasta of pastasRaiz) {
            try {
                const storageRef = ref(instance, pasta || undefined);
                await escanearPastaRecursivo(storageRef, resultado);
            } catch (e: any) {
                console.warn(`Storage [${label}] pasta "${pasta || '/'}" - ${e?.message || 'sem acesso'}`);
            }
        }
        if (resultado.length > 0) break;
    }

    return resultado;
}

// ──── Buscar metadados de certificados em coleções Firestore ──────────────────

export async function buscarCertificadosFirestore(): Promise<Record<string, any>[]> {
    if (!db) return [];

    const possiveisColecoes = ['certificados', 'empresas_certificados', 'certificates'];
    const resultados: Record<string, any>[] = [];

    for (const nome of possiveisColecoes) {
        try {
            const snap = await getDocs(collection(db, nome));
            if (!snap.empty) {
                snap.docs.forEach(d => {
                    resultados.push({ id: d.id, _colecao: nome, ...d.data() });
                });
                break;
            }
        } catch {
            // coleção não existe ou sem permissão
        }
    }

    return resultados;
}

// ──── Cruzamento: Empresas × Certificados ────────────────────────────────────

export interface CruzamentoCertificado {
    empresa: Empresa;
    certificadoStorage?: CertificadoStorage;
    certificadoFirestore?: Record<string, any>;
    status: 'vinculado' | 'no_storage' | 'sem_certificado';
}

export async function cruzarEmpresasComCertificados(
    empresas: Empresa[],
): Promise<CruzamentoCertificado[]> {
    const [certsStorage, certsFirestore] = await Promise.all([
        listarCertificadosNoStorage(),
        buscarCertificadosFirestore(),
    ]);

    const storagePorCnpj = new Map<string, CertificadoStorage>();
    for (const c of certsStorage) {
        const cnpjLimpo = c.cnpj.replace(/\D/g, '');
        if (!storagePorCnpj.has(cnpjLimpo)) {
            storagePorCnpj.set(cnpjLimpo, c);
        }
    }

    const firestorePorCnpj = new Map<string, Record<string, any>>();
    for (const c of certsFirestore) {
        const cnpj = (c.cnpj || c.CNPJ || '').replace(/\D/g, '');
        if (cnpj) firestorePorCnpj.set(cnpj, c);
    }

    return empresas.map(emp => {
        const cnpj = emp.cnpj.replace(/\D/g, '');
        const certStorage = storagePorCnpj.get(cnpj);
        const certFirestore = firestorePorCnpj.get(cnpj);

        let status: CruzamentoCertificado['status'] = 'sem_certificado';
        if (emp.certificado) status = 'vinculado';
        else if (certStorage) status = 'no_storage';

        return { empresa: emp, certificadoStorage: certStorage, certificadoFirestore: certFirestore, status };
    });
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
