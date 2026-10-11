// services/calculo/folhaComplementarService.ts
//
// Persistência da folha complementar: folhas_complementares/{empresa}_{competência}_{tipo do instrumento}. Uma por
// instrumento na competência; regravar substitui. As regras recusam gravar ou apagar com a competência encerrada.

import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { Instrumento, LancamentoComplementar, ReajusteRetroativo, ResultadoComplementar } from './complementar';
import { totaisComplementar } from './complementar';

const COL = 'folhas_complementares';

export interface FolhaComplementarGravada {
    id: string;
    empresaId: string;
    perApur: string;
    pagamento: string;
    instrumento: Instrumento;
    reajuste?: ReajusteRetroativo;
    lancamentos: LancamentoComplementar[];
    /** O que entrou pelos motores: diferença do 13º, rescisões e o 13º complementar. */
    opcoes?: OpcoesComplementar;
    resultados: ResultadoComplementar[];
    totais: ReturnType<typeof totaisComplementar>;
    gravadoPorEmail: string;
    gravadoEm?: Date;
}

export interface OpcoesComplementar { decimo: boolean; rescisoes: boolean; complemento13: boolean }

export const idComplementar = (empresaId: string, perApur: string, tpAcConv: string) => `${empresaId}_${perApur}_${tpAcConv}`;

/** Limite do documento do Firestore (1 MiB), com folga. */
const LIMITE_BYTES = 900_000;

export async function listarComplementares(empresaId: string, perApur: string): Promise<FolhaComplementarGravada[]> {
    const q = query(collection(db, COL), where('empresaId', '==', empresaId), where('perApur', '==', perApur));
    const s = await getDocs(q);
    return s.docs.map(d => {
        const x = d.data();
        return {
            id: d.id, empresaId: x.empresaId, perApur: x.perApur, pagamento: x.pagamento,
            instrumento: { tpAcConv: x.tpAcConv, dtAcConv: x.dtAcConv || undefined, dsc: x.dsc },
            reajuste: x.reajuste ?? undefined, lancamentos: x.lancamentos ?? [], opcoes: x.opcoes ?? undefined, resultados: x.resultados ?? [], totais: x.totais,
            gravadoPorEmail: x.gravadoPorEmail, gravadoEm: x.gravadoEm?.toDate?.(),
        };
    }).sort((a, b) => a.instrumento.tpAcConv.localeCompare(b.instrumento.tpAcConv));
}

/** Grava (ou regrava) a complementar do instrumento na competência. Só os resultados sem erro. */
export async function gravarComplementar(p: { empresaId: string; perApur: string; pagamento: string; instrumento: Instrumento; reajuste?: ReajusteRetroativo; lancamentos?: LancamentoComplementar[]; opcoes?: OpcoesComplementar; resultados: ResultadoComplementar[] }, u: Usuario): Promise<string> {
    const validos = p.resultados.filter(r => r.situacao !== 'erro');
    const id = idComplementar(p.empresaId, p.perApur, p.instrumento.tpAcConv);
    // O Firestore recusa undefined: o JSON tira os campos vazios.
    const dados = JSON.parse(JSON.stringify({
        empresaId: p.empresaId, perApur: p.perApur, pagamento: p.pagamento, tpAcConv: p.instrumento.tpAcConv, dtAcConv: p.instrumento.dtAcConv ?? '', dsc: p.instrumento.dsc.trim(),
        reajuste: p.reajuste ?? null, lancamentos: p.lancamentos ?? [], opcoes: p.opcoes ?? null, resultados: validos, totais: totaisComplementar(validos),
        gravadoPor: u.id, gravadoPorEmail: u.email,
    }));
    if (new Blob([JSON.stringify(dados)]).size > LIMITE_BYTES) throw new Error('Complementar grande demais para gravar num documento só: divida por instrumento ou por período.');
    await setDoc(doc(db, COL, id), { ...dados, gravadoEm: serverTimestamp() });
    return id;
}

export async function excluirComplementar(id: string): Promise<void> {
    await deleteDoc(doc(db, COL, id));
}
