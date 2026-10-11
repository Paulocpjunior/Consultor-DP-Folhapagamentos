// services/calculo/folhaGravadaService.ts
//
// Persistência da folha gravada: folhas_gravadas/{empresa}_{AAAA-MM} (resumo) e .../holerites/{fichaId}.
// As regras recusam gravar em competência encerrada no Fim de mês.

import { collection, doc, getDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { auditar, diffObjeto, type Usuario } from '../cadastros/cadastrosService';
import type { ResultadoCalculo } from './motorMensal';
import { idFolhaGravada, prepararHolerite, totaisDaFolha, type FolhaGravada } from './folhaGravada';
import { gravarEmLotes, type Escrita } from './lotesFirestore';

const COL = 'folhas_gravadas';

export async function lerFolhaGravada(empresaId: string, competencia: string): Promise<FolhaGravada | null> {
    const id = idFolhaGravada(empresaId, competencia);
    const p = await getDoc(doc(db, COL, id));
    if (!p.exists()) return null;
    const hs = await getDocs(collection(db, COL, id, 'holerites'));
    const x = p.data();
    const ordem = (x.fichaIds as string[] | undefined) ?? [];
    // Só os holerites do resumo: uma gravação em lotes que falhou no meio não mistura holerites de fora.
    const naFolha = new Set(ordem);
    const holerites = hs.docs.map(d => d.data().resultado as ResultadoCalculo).filter(h => !ordem.length || naFolha.has(h.fichaId))
        .sort((a, b) => ordem.indexOf(a.fichaId) - ordem.indexOf(b.fichaId));
    return { empresaId: x.empresaId, competencia: x.competencia, pagamento: x.pagamento, gravadoPorEmail: x.gravadoPorEmail, gravadoEm: x.gravadoEm?.toDate?.(), totais: x.totais, holerites };
}

/** Grava (ou regrava, com o período aberto) a folha do mês; holerites de quem saiu da folha são apagados. */
export async function gravarFolha(empresaId: string, competencia: string, pagamento: string, resultados: ResultadoCalculo[], u: Usuario, antes: string[] = []): Promise<void> {
    const id = idFolhaGravada(empresaId, competencia);
    const validos = resultados.filter(r => r.situacao !== 'erro');
    // Em lotes (folhas grandes): holerites e exclusões primeiro, o resumo por último.
    const escritas: Escrita[] = [
        ...validos.map(r => (b => { b.set(doc(db, COL, id, 'holerites', r.fichaId), { empresaId, competencia, fichaId: r.fichaId, resultado: prepararHolerite(r) }); }) as Escrita),
        ...antes.filter(fichaId => !validos.some(r => r.fichaId === fichaId)).map(fichaId => (b => { b.delete(doc(db, COL, id, 'holerites', fichaId)); }) as Escrita),
        b => b.set(doc(db, COL, id), {
            empresaId, competencia, pagamento, fichaIds: validos.map(r => r.fichaId), totais: totaisDaFolha(validos),
            gravadoPor: u.id, gravadoPorEmail: u.email, gravadoEm: serverTimestamp(),
        }),
    ];
    await gravarEmLotes(db, escritas);
}

/** Folhas gravadas do ano (as que existem), para a ficha financeira. */
export async function lerFolhasDoAno(empresaId: string, ano: string): Promise<FolhaGravada[]> {
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    const lidas = await Promise.all(meses.map(c => lerFolhaGravada(empresaId, c).catch(() => null)));
    return lidas.filter((f): f is FolhaGravada => !!f);
}

/**
 * Estorno do cálculo: apaga a folha gravada da competência (resumo e holerites), com o registro na auditoria (quem,
 * quando, o motivo e os totais que saíram). As regras só deixam com a competência aberta no Fim de mês.
 */
export async function estornarFolha(empresaId: string, competencia: string, motivo: string, u: Usuario): Promise<void> {
    const id = idFolhaGravada(empresaId, competencia);
    const p = await getDoc(doc(db, COL, id));
    if (!p.exists()) throw new Error('Não há folha gravada nesta competência (outra pessoa pode tê-la estornado).');
    const hs = await getDocs(collection(db, COL, id, 'holerites'));
    const x = p.data();
    // Em lotes (folhas grandes): o resumo e a auditoria primeiro (a folha deixa de existir), depois os holerites.
    const escritas: Escrita[] = [
        b => { b.delete(doc(db, COL, id)); auditar(b, u, COL, id, 'estornar folha', diffObjeto({ totais: x.totais, pagamento: x.pagamento, gravadoPorEmail: x.gravadoPorEmail }, {}), { empresaId, competencia, motivo: motivo.trim().slice(0, 500) }); },
        ...hs.docs.map(h => (b => { b.delete(h.ref); }) as Escrita),
    ];
    await gravarEmLotes(db, escritas);
}
