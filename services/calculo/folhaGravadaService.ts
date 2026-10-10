// services/calculo/folhaGravadaService.ts
//
// Persistência da folha gravada: folhas_gravadas/{empresa}_{AAAA-MM} (resumo) e .../holerites/{fichaId}.
// As regras recusam gravar em competência encerrada no Fim de mês.

import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { ResultadoCalculo } from './motorMensal';
import { idFolhaGravada, prepararHolerite, totaisDaFolha, type FolhaGravada } from './folhaGravada';

const COL = 'folhas_gravadas';

export async function lerFolhaGravada(empresaId: string, competencia: string): Promise<FolhaGravada | null> {
    const id = idFolhaGravada(empresaId, competencia);
    const p = await getDoc(doc(db, COL, id));
    if (!p.exists()) return null;
    const hs = await getDocs(collection(db, COL, id, 'holerites'));
    const x = p.data();
    const ordem = (x.fichaIds as string[] | undefined) ?? [];
    const holerites = hs.docs.map(d => d.data().resultado as ResultadoCalculo).sort((a, b) => ordem.indexOf(a.fichaId) - ordem.indexOf(b.fichaId));
    return { empresaId: x.empresaId, competencia: x.competencia, pagamento: x.pagamento, gravadoPorEmail: x.gravadoPorEmail, gravadoEm: x.gravadoEm?.toDate?.(), totais: x.totais, holerites };
}

/** Grava (ou regrava, com o período aberto) a folha do mês; holerites de quem saiu da folha são apagados. */
export async function gravarFolha(empresaId: string, competencia: string, pagamento: string, resultados: ResultadoCalculo[], u: Usuario, antes: string[] = []): Promise<void> {
    const id = idFolhaGravada(empresaId, competencia);
    const validos = resultados.filter(r => r.situacao !== 'erro');
    if (validos.length > 450) throw new Error('Folha com mais de 450 funcionários: a gravação em um só lote ainda não é suportada.');
    const b = writeBatch(db);
    b.set(doc(db, COL, id), {
        empresaId, competencia, pagamento, fichaIds: validos.map(r => r.fichaId), totais: totaisDaFolha(validos),
        gravadoPor: u.id, gravadoPorEmail: u.email, gravadoEm: serverTimestamp(),
    });
    for (const r of validos) b.set(doc(db, COL, id, 'holerites', r.fichaId), { empresaId, competencia, fichaId: r.fichaId, resultado: prepararHolerite(r) });
    for (const fichaId of antes) if (!validos.some(r => r.fichaId === fichaId)) b.delete(doc(db, COL, id, 'holerites', fichaId));
    await b.commit();
}

/** Folhas gravadas do ano (as que existem), para a ficha financeira. */
export async function lerFolhasDoAno(empresaId: string, ano: string): Promise<FolhaGravada[]> {
    const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`);
    const lidas = await Promise.all(meses.map(c => lerFolhaGravada(empresaId, c).catch(() => null)));
    return lidas.filter((f): f is FolhaGravada => !!f);
}
