// services/contribuintes/contribuintesService.ts
//
// Persistência do pró-labore e do RPA: contribuintes_individuais/{empresa}_{cpf} (cadastro; não se apaga, fica inativo)
// e pagamentos_ci/{empresa}_{competência} (os lançamentos e os cálculos do mês; regrava ou apaga com o mês aberto).

import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type { Usuario } from '../cadastros/cadastrosService';
import { contribuinteVazio, idContribuinte, totaisCI, type ContribuinteIndividual, type LancamentoCI, type ResultadoCI } from './contribuinteIndividual';

const CAD = 'contribuintes_individuais';
const PAG = 'pagamentos_ci';
const limpo = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export async function listarContribuintes(empresaId: string): Promise<ContribuinteIndividual[]> {
    const s = await getDocs(query(collection(db, CAD), where('empresaId', '==', empresaId)));
    return s.docs.map(d => ({ ...contribuinteVazio(empresaId), ...(d.data() as Partial<ContribuinteIndividual>), id: d.id }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function salvarContribuinte(c: ContribuinteIndividual, u: Usuario): Promise<string> {
    const cpf = c.cpf.replace(/\D/g, '');
    const id = idContribuinte(c.empresaId, cpf);
    const { id: _id, ...dados } = { ...c, cpf };
    await setDoc(doc(db, CAD, id), { ...limpo(dados), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    return id;
}

export interface PagamentosCIGravados { lancamentos: LancamentoCI[]; resultados: ResultadoCI[]; gravadoPorEmail: string; gravadoEm?: Date }

export async function lerPagamentosCI(empresaId: string, competencia: string): Promise<PagamentosCIGravados | null> {
    const s = await getDoc(doc(db, PAG, `${empresaId}_${competencia}`));
    if (!s.exists()) return null;
    const x = s.data();
    return { lancamentos: x.lancamentos ?? [], resultados: x.resultados ?? [], gravadoPorEmail: x.gravadoPorEmail ?? '', gravadoEm: x.gravadoEm?.toDate?.() };
}

export async function gravarPagamentosCI(empresaId: string, competencia: string, lancamentos: LancamentoCI[], resultados: ResultadoCI[], u: Usuario): Promise<void> {
    const validos = resultados.filter(r => r.situacao !== 'erro');
    await setDoc(doc(db, PAG, `${empresaId}_${competencia}`), {
        empresaId, competencia, lancamentos: limpo(lancamentos), resultados: limpo(validos), totais: totaisCI(validos),
        gravadoPor: u.id, gravadoPorEmail: u.email, gravadoEm: serverTimestamp(),
    });
}

export async function excluirPagamentosCI(empresaId: string, competencia: string): Promise<void> {
    await deleteDoc(doc(db, PAG, `${empresaId}_${competencia}`));
}
