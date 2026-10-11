// services/contabil/contabilService.ts
//
// Plano de contas da folha por empresa (services/contabil/integracaoContabil.ts): contabil_folha/{empresa}.

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { configVazia, type ConfigContabil } from './integracaoContabil';

const COL = 'contabil_folha';

export async function lerConfigContabil(empresaId: string): Promise<ConfigContabil> {
    const s = await getDoc(doc(db, COL, empresaId));
    if (!s.exists()) return configVazia(empresaId);
    const x = s.data() as Partial<ConfigContabil>;
    return { ...configVazia(empresaId), ...x, contas: { ...(x.contas ?? {}) }, empresaId };
}

export async function salvarConfigContabil(c: ConfigContabil, u: Usuario): Promise<void> {
    const contas = Object.fromEntries(Object.entries(c.contas).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    await setDoc(doc(db, COL, c.empresaId), { empresaId: c.empresaId, contas, porCentroCusto: c.porCentroCusto, atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
}
