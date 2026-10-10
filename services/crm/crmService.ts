// services/crm/crmService.ts
//
// Leitura do CRM do DP sincronizado do Jotform (crm_dp, crm_dp_meta) e a ligação dos responsáveis
// do CRM com os usuários do Consultor (crm_dp_mapa/colaboradores). A gravação do crm_dp é só do job.

import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { ColaboradorCrm, EmpresaCrm, MapaColaboradores } from './crmDp';

const data = (t: unknown) => (t as { toDate?: () => Date } | null)?.toDate?.();

export async function lerCrmDaEmpresa(cnpj: string): Promise<EmpresaCrm | null> {
    const d = cnpj.replace(/\D/g, '');
    if (d.length !== 14) return null;
    const s = await getDoc(doc(db, 'crm_dp', d));
    return s.exists() ? (s.data() as EmpresaCrm) : null;
}

export interface CrmCompleto { empresas: EmpresaCrm[]; colaboradores: ColaboradorCrm[]; mapa: MapaColaboradores; sincronizadoEm?: Date }

/** Gestor e admin: o CRM inteiro, os responsáveis e a ligação com os usuários. Sem sincronização ainda: null. */
export async function lerCrmCompleto(): Promise<CrmCompleto | null> {
    const [meta, emps, mapa] = await Promise.all([getDoc(doc(db, 'crm_dp_meta', 'sincronizacao')), getDocs(collection(db, 'crm_dp')), getDoc(doc(db, 'crm_dp_mapa', 'colaboradores'))]);
    if (!meta.exists()) return null;
    return {
        empresas: emps.docs.map(d => d.data() as EmpresaCrm),
        colaboradores: (meta.data().colaboradores as ColaboradorCrm[]) ?? [],
        mapa: (mapa.data() as MapaColaboradores | undefined) ?? {},
        sincronizadoEm: data(meta.data().em),
    };
}

/** Liga (ou desliga, com uid vazio) um responsável do CRM a um usuário do Consultor. */
export async function ligarColaborador(jotformId: string, uid: string): Promise<void> {
    await setDoc(doc(db, 'crm_dp_mapa', 'colaboradores'), { [jotformId]: uid }, { merge: true });
}
