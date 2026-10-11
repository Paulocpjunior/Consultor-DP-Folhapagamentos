// services/calculo/processosGravadosService.ts
//
// Persistência dos processos fora da folha mensal (services/calculo/processosGravados.ts):
// processos_gravados/{empresa}_{tipo}_{AAAA-MM} (resumo) e .../holerites/{gozo ou ficha}. As regras recusam gravar em
// competência encerrada no Fim de mês.

import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import type { ResultadoCalculo } from './motorMensal';
import { prepararHolerite } from './folhaGravada';
import { chaveDoHolerite, idProcesso, paraGravar, type ProcessoGravado, type TipoProcesso } from './processosGravados';

const COL = 'processos_gravados';

async function comHolerites(id: string, x: Record<string, unknown>): Promise<ProcessoGravado> {
    const hs = await getDocs(collection(db, COL, id, 'holerites'));
    const ordem = (x.chaves as string[] | undefined) ?? [];
    const holerites = hs.docs.sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id)).map(d => d.data().resultado as ResultadoCalculo);
    const em = x.gravadoEm as { toDate?: () => Date } | undefined;
    return { empresaId: x.empresaId as string, tipo: x.tipo as TipoProcesso, competencia: x.competencia as string, gravadoPorEmail: x.gravadoPorEmail as string, gravadoEm: em?.toDate?.(), totais: x.totais as ProcessoGravado['totais'], holerites };
}

export async function lerProcesso(empresaId: string, tipo: TipoProcesso, competencia: string): Promise<ProcessoGravado | null> {
    const id = idProcesso(empresaId, tipo, competencia);
    const p = await getDoc(doc(db, COL, id));
    return p.exists() ? comHolerites(id, p.data()) : null;
}

/** Processos gravados do ano (todas as competências e tipos), para a ficha financeira. */
export async function lerProcessosDoAno(empresaId: string, ano: string): Promise<ProcessoGravado[]> {
    const s = await getDocs(query(collection(db, COL), where('empresaId', '==', empresaId), where('ano', '==', ano)));
    return Promise.all(s.docs.map(d => comHolerites(d.id, d.data())));
}

/** Grava (ou regrava, com a competência aberta) o processo; holerites de quem saiu dele são apagados. */
export async function gravarProcesso(empresaId: string, tipo: TipoProcesso, competencia: string, resultados: ResultadoCalculo[], u: Usuario, antes: string[] = []): Promise<void> {
    const id = idProcesso(empresaId, tipo, competencia);
    const { validos, totais } = paraGravar(resultados);
    if (validos.length > 450) throw new Error('Mais de 450 holerites: a gravação em um só lote ainda não é suportada.');
    const chaves = validos.map(chaveDoHolerite);
    const b = writeBatch(db);
    b.set(doc(db, COL, id), { empresaId, tipo, competencia, ano: competencia.slice(0, 4), chaves, totais, gravadoPor: u.id, gravadoPorEmail: u.email, gravadoEm: serverTimestamp() });
    validos.forEach((r, i) => b.set(doc(db, COL, id, 'holerites', chaves[i]), { empresaId, competencia, fichaId: r.fichaId, resultado: prepararHolerite(r) }));
    for (const c of antes) if (!chaves.includes(c)) b.delete(doc(db, COL, id, 'holerites', c));
    await b.commit();
}
