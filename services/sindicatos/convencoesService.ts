// services/sindicatos/convencoesService.ts
//
// Convenções coletivas (convencoes_coletivas/{cnpj do sindicato}_{início da vigência}) com o PDF no Storage
// (convencoes/{cnpj}/{início}-{hora}.pdf) e o checklist das obrigações por empresa
// (convencao_checklist/{empresa}_{convenção}). A convenção é do sindicato: serve a todas as empresas dele.

import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import app, { db } from '../firebaseConfig';
import { limpo, type Usuario } from '../cadastros/cadastrosService';
import { convencaoVazia, idConvencao, type ChecklistConvencao, type ConvencaoColetiva } from './convencao';

const COL = 'convencoes_coletivas';
const CHECK = 'convencao_checklist';
export const TAMANHO_MAXIMO_PDF = 20 * 1024 * 1024;

const deDoc = (id: string, x: Record<string, unknown>): ConvencaoColetiva => {
    const v = convencaoVazia();
    return { ...v, ...(x as Partial<ConvencaoColetiva>), id, reajuste: { ...v.reajuste, ...(x.reajuste as object ?? {}) }, horaExtra: { ...v.horaExtra, ...(x.horaExtra as object ?? {}) },
        pisos: (x.pisos as ConvencaoColetiva['pisos']) ?? [], obrigacoes: (x.obrigacoes as ConvencaoColetiva['obrigacoes']) ?? [], contribuicoes: (x.contribuicoes as ConvencaoColetiva['contribuicoes']) ?? [], avisoPrevio: (x.avisoPrevio as ConvencaoColetiva['avisoPrevio']) ?? [], arquivo: (x.arquivo as ConvencaoColetiva['arquivo']) ?? null };
};

export async function listarConvencoes(): Promise<ConvencaoColetiva[]> {
    const s = await getDocs(collection(db, COL));
    return s.docs.map(d => deDoc(d.id, d.data())).sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio));
}

const storage = async () => { const m = await import('firebase/storage'); return { m, st: m.getStorage(app!) }; };

/** Grava a convenção; com o PDF, sobe o arquivo antes (o documento só aponta para ele depois do upload). */
export async function salvarConvencao(c: ConvencaoColetiva, pdf: File | null, u: Usuario): Promise<ConvencaoColetiva> {
    if (pdf && (pdf.type !== 'application/pdf' || pdf.size > TAMANHO_MAXIMO_PDF)) throw new Error('Envie o PDF da convenção (até 20 MB).');
    const id = idConvencao(c.sindicatoCnpj, c.vigenciaInicio);
    let arquivo = c.arquivo;
    if (pdf) {
        const { m, st } = await storage();
        const path = `convencoes/${c.sindicatoCnpj}/${c.vigenciaInicio}-${Date.now()}.pdf`;
        await m.uploadBytes(m.ref(st, path), pdf, { contentType: 'application/pdf', customMetadata: { enviadoPor: u.email } });
        arquivo = { path, nome: pdf.name.slice(0, 120), tamanho: pdf.size, enviadoPorEmail: u.email, enviadoEm: new Date().toISOString() };
    }
    const salvo: ConvencaoColetiva = { ...c, id, arquivo };
    const { id: _id, ...campos } = salvo;
    await setDoc(doc(db, COL, id), { ...limpo(campos), atualizadoPor: u.id, atualizadoPorEmail: u.email, atualizadoEm: serverTimestamp() });
    return salvo;
}

/** Abre o PDF da convenção numa aba (lido pelo SDK, com a permissão de quem está logado). */
export async function abrirPdfConvencao(c: ConvencaoColetiva): Promise<void> {
    if (!c.arquivo) return;
    const { m, st } = await storage();
    const blob = await m.getBlob(m.ref(st, c.arquivo.path));
    window.open(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })), '_blank');
}

// ---------- Checklist das obrigações por empresa ----------

export async function listarChecklists(empresaId: string): Promise<Record<string, ChecklistConvencao>> {
    const s = await getDocs(query(collection(db, CHECK), where('empresaId', '==', empresaId)));
    return Object.fromEntries(s.docs.map(d => [String(d.data().convencaoId), (d.data().itens as ChecklistConvencao) ?? {}]));
}

export async function marcarObrigacao(empresaId: string, convencaoId: string, atual: ChecklistConvencao, obrigacaoId: string, cumprido: boolean, obs: string, u: Usuario): Promise<ChecklistConvencao> {
    const itens = { ...atual, [obrigacaoId]: { cumprido, obs: obs.trim().slice(0, 300), porEmail: u.email, em: new Date().toISOString() } };
    await setDoc(doc(db, CHECK, `${empresaId}_${convencaoId}`), { empresaId, convencaoId, itens, atualizadoPor: u.id, atualizadoEm: serverTimestamp() });
    return itens;
}
