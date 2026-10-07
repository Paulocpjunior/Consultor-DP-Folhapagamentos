// services/backups/guardaService.ts
//
// backups_guarda/{sha256}: inventário dos backups do IOB SAGE guardados fora
// do Consultor. Só o gestor registra; admin e gestor consultam; ninguém
// altera nem apaga (firestore.rules).

import { collection, doc, getDocs, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { RegistroGuarda } from './guarda';

const COL = 'backups_guarda';

export async function listarGuarda(): Promise<RegistroGuarda[]> {
    const snap = await getDocs(query(collection(db, COL), orderBy('dataBackup', 'desc')));
    return snap.docs.map(d => {
        const x = d.data();
        return {
            id: d.id, sha256: x.sha256, arquivo: x.arquivo, tamanho: x.tamanho, dataBackup: x.dataBackup, empresas: x.empresas ?? [],
            localGuarda: x.localGuarda, observacao: x.observacao ?? '', registradoPor: x.registradoPor, registradoPorEmail: x.registradoPorEmail,
            registradoEm: x.registradoEm?.toDate?.(),
        };
    });
}

/** Inclui o registro; o mesmo arquivo (mesmo SHA-256) já registrado é recusado pelas regras. */
export async function registrarGuarda(r: Omit<RegistroGuarda, 'id' | 'registradoPor' | 'registradoPorEmail' | 'registradoEm'>, u: Usuario): Promise<void> {
    await setDoc(doc(db, COL, r.sha256), {
        sha256: r.sha256, arquivo: r.arquivo.trim(), tamanho: r.tamanho, dataBackup: r.dataBackup, empresas: r.empresas,
        localGuarda: r.localGuarda.trim(), observacao: r.observacao.trim(),
        registradoPor: u.id, registradoPorEmail: u.email, registradoEm: serverTimestamp(),
    });
}
