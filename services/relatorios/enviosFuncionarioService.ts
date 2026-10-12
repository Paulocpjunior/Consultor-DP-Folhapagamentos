// services/relatorios/enviosFuncionarioService.ts
//
// Histórico dos envios ao funcionário no Firestore (services/relatorios/enviosFuncionario.ts):
//   envios_funcionario/{empresaId}_{AAAA-MM}_{tipo}_{fichaId}
// Cada envio grava só o canal dele (merge), com o autor. Não se apaga.

import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { idEnvio, registroDoEnvio, type CanalEnvio, type EnviosDaFicha, type HistoricoDeEnvios, type HistoricoEnvios, type RegistroCanal, type TipoEnvio } from './enviosFuncionario';

const COL = 'envios_funcionario';

export async function listarEnvios(empresaId: string, competencia: string, tipo: TipoEnvio): Promise<HistoricoEnvios> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId), where('competencia', '==', competencia), where('tipo', '==', tipo)));
    return new Map(s.docs.map(d => [d.data().fichaId as string, (d.data().canais ?? {}) as EnviosDaFicha]));
}

export async function registrarEnvio(empresaId: string, competencia: string, tipo: TipoEnvio, fichaId: string, canal: CanalEnvio, r: RegistroCanal, u: Usuario): Promise<void> {
    await setDoc(doc(db, COL, idEnvio(empresaId, competencia, tipo, fichaId)), {
        empresaId, fichaId, competencia, tipo, canais: { [canal]: r }, atualizadoPor: u.id, atualizadoEm: serverTimestamp(),
    }, { merge: true });
}

/** O histórico para a tela (empresa, competência e tipo fixos). */
export const historicoDeEnvios = (empresaId: string, competencia: string, tipo: TipoEnvio, u: Usuario): HistoricoDeEnvios => ({
    listar: () => listarEnvios(empresaId, competencia, tipo),
    registrar: (fichaId, canal, destino, erro) => registrarEnvio(empresaId, competencia, tipo, fichaId, canal, registroDoEnvio(canal, destino, u.email, erro), u),
});
