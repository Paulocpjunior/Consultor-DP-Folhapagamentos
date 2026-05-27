import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp,
    limit as firestoreLimit,
    startAfter,
    getCountFromServer,
    type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import type {
    EventoEsocial,
    FgtsDigitalRegistro,
    TeseRecuperacao,
    EmpresaEsocialResumo,
    DashboardResumo,
    AuditLog,
    EventoTipo,
    EventoStatus,
    ObrigacaoTrabalhista,
} from './esocialTypes';
import { EVENTO_PRAZOS } from './esocialTypes';
import { listarTodasEmpresas } from '../empresas/empresasService';
import { calcularStatusCertificado } from '../empresas/certificadoService';

const COLECAO_EVENTOS = 'esocial_eventos';
const COLECAO_FGTS = 'esocial_fgts';
const COLECAO_TESES = 'esocial_teses';
const COLECAO_AUDIT = 'esocial_audit';

function getCol(name: string) {
    if (!db) throw new Error('Firebase não configurado');
    return collection(db, name);
}

// ──── Eventos eSocial ────────────────────────────────────────────────────────

export async function listarEventos(empresaId?: string): Promise<EventoEsocial[]> {
    const col = getCol(COLECAO_EVENTOS);
    const q = empresaId
        ? query(col, where('empresaId', '==', empresaId), orderBy('criadoEm', 'desc'))
        : query(col, orderBy('criadoEm', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as EventoEsocial));
}

export interface PaginatedResult<T> {
    items: T[];
    total: number;
    lastDoc: QueryDocumentSnapshot | null;
    hasMore: boolean;
}

const PAGE_SIZE = 25;

export async function listarEventosPaginado(
    empresaId?: string,
    statusFiltro?: string,
    cursor?: QueryDocumentSnapshot | null,
    pageSize: number = PAGE_SIZE,
): Promise<PaginatedResult<EventoEsocial>> {
    const col = getCol(COLECAO_EVENTOS);
    const constraints: any[] = [orderBy('criadoEm', 'desc')];
    if (empresaId) constraints.unshift(where('empresaId', '==', empresaId));
    if (statusFiltro && statusFiltro !== 'todos') constraints.push(where('status', '==', statusFiltro));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(firestoreLimit(pageSize + 1));
    const q = query(col, ...constraints);
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageSize;
    const sliced = hasMore ? docs.slice(0, pageSize) : docs;
    const countConstraints: any[] = [orderBy('criadoEm', 'desc')];
    if (empresaId) countConstraints.unshift(where('empresaId', '==', empresaId));
    if (statusFiltro && statusFiltro !== 'todos') countConstraints.push(where('status', '==', statusFiltro));
    const countSnap = await getCountFromServer(query(col, ...countConstraints));
    return {
        items: sliced.map(d => ({ id: d.id, ...d.data() } as EventoEsocial)),
        total: countSnap.data().count,
        lastDoc: sliced.length > 0 ? sliced[sliced.length - 1] : null,
        hasMore,
    };
}

export async function criarEvento(evento: Omit<EventoEsocial, 'id' | 'criadoEm'>): Promise<string> {
    const col = getCol(COLECAO_EVENTOS);
    const docRef = await addDoc(col, { ...evento, criadoEm: serverTimestamp() });
    return docRef.id;
}

export async function atualizarEvento(id: string, dados: Partial<EventoEsocial>): Promise<void> {
    if (!db) throw new Error('Firebase não configurado');
    const ref = doc(db, COLECAO_EVENTOS, id);
    await updateDoc(ref, { ...dados, atualizadoEm: serverTimestamp() });
}

export async function excluirEvento(id: string): Promise<void> {
    if (!db) throw new Error('Firebase não configurado');
    await deleteDoc(doc(db, COLECAO_EVENTOS, id));
}

// ──── FGTS Digital ───────────────────────────────────────────────────────────

export async function listarFgts(empresaId?: string): Promise<FgtsDigitalRegistro[]> {
    const col = getCol(COLECAO_FGTS);
    const q = empresaId
        ? query(col, where('empresaId', '==', empresaId), orderBy('competencia', 'desc'))
        : query(col, orderBy('competencia', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FgtsDigitalRegistro));
}

export async function criarFgts(registro: Omit<FgtsDigitalRegistro, 'id'>): Promise<string> {
    const col = getCol(COLECAO_FGTS);
    const docRef = await addDoc(col, registro);
    return docRef.id;
}

export async function atualizarFgts(id: string, dados: Partial<FgtsDigitalRegistro>): Promise<void> {
    if (!db) throw new Error('Firebase não configurado');
    await updateDoc(doc(db, COLECAO_FGTS, id), dados);
}

// ──── Teses de Recuperação ───────────────────────────────────────────────────

export async function listarTeses(empresaId?: string): Promise<TeseRecuperacao[]> {
    const col = getCol(COLECAO_TESES);
    const q = empresaId
        ? query(col, where('empresaId', '==', empresaId), orderBy('criadoEm', 'desc'))
        : query(col, orderBy('criadoEm', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as TeseRecuperacao));
}

export async function criarTese(tese: Omit<TeseRecuperacao, 'id' | 'criadoEm'>): Promise<string> {
    const col = getCol(COLECAO_TESES);
    const docRef = await addDoc(col, { ...tese, criadoEm: serverTimestamp() });
    return docRef.id;
}

export async function atualizarTese(id: string, dados: Partial<TeseRecuperacao>): Promise<void> {
    if (!db) throw new Error('Firebase não configurado');
    await updateDoc(doc(db, COLECAO_TESES, id), { ...dados });
}

// ──── Dashboard / Resumos ────────────────────────────────────────────────────

export async function calcularResumoDashboard(): Promise<DashboardResumo> {
    const eventos = await listarEventos();
    const fgts = await listarFgts();
    const teses = await listarTeses();

    const empresasIds = new Set(eventos.map(e => e.empresaId));
    fgts.forEach(f => empresasIds.add(f.empresaId));

    return {
        totalEmpresas: empresasIds.size,
        eventosPendentes: eventos.filter(e => e.status === 'pendente').length,
        eventosRejeitados: eventos.filter(e => e.status === 'rejeitado').length,
        fgtsAtrasado: fgts.filter(f => f.status === 'atrasado').length,
        tesesTotalEstimado: teses.reduce((acc, t) => acc + (t.valorEstimado || 0), 0),
    };
}

export async function calcularResumoEmpresa(empresaId: string, razaoSocial: string, cnpj: string): Promise<EmpresaEsocialResumo> {
    const eventos = await listarEventos(empresaId);
    const fgts = await listarFgts(empresaId);

    const fgtsDevidoTotal = fgts.reduce((acc, f) => acc + f.valorDevido, 0);
    const fgtsRecolhidoTotal = fgts.reduce((acc, f) => acc + f.valorRecolhido, 0);

    let fgtsStatus: 'em_dia' | 'atrasado' | 'parcial' = 'em_dia';
    if (fgts.some(f => f.status === 'atrasado')) fgtsStatus = 'atrasado';
    else if (fgts.some(f => f.status === 'parcial')) fgtsStatus = 'parcial';

    return {
        empresaId,
        razaoSocial,
        cnpj,
        totalEventos: eventos.length,
        pendentes: eventos.filter(e => e.status === 'pendente').length,
        rejeitados: eventos.filter(e => e.status === 'rejeitado').length,
        transmitidos: eventos.filter(e => e.status === 'transmitido').length,
        fgtsStatus,
        fgtsDevidoTotal,
        fgtsRecolhidoTotal,
    };
}

// ──── Calendário de Obrigações ───────────────────────────────────────────────

export function gerarCalendarioObrigacoes(competencia: string): ObrigacaoTrabalhista[] {
    const [ano, mes] = competencia.split('-').map(Number);
    const hoje = new Date();

    const obrigacoes: Omit<ObrigacaoTrabalhista, 'id' | 'competencia' | 'status'>[] = [
        { nome: 'eSocial - Eventos Periódicos (S-1299)', sigla: 'S-1299', tipo: 'esocial', diaVencimento: 15, descricao: 'Fechamento dos eventos periódicos do eSocial' },
        { nome: 'FGTS Digital - Recolhimento', sigla: 'FGTS', tipo: 'fgts', diaVencimento: 20, descricao: 'Recolhimento mensal do FGTS via FGTS Digital' },
        { nome: 'DCTFWeb Previdenciária', sigla: 'DCTFWeb', tipo: 'dctfweb', diaVencimento: 15, descricao: 'Declaração de Débitos e Créditos Tributários Federais Previdenciários' },
        { nome: 'INSS - GPS/DARF Previdenciário', sigla: 'INSS', tipo: 'inss', diaVencimento: 20, descricao: 'Recolhimento da contribuição previdenciária patronal e dos segurados' },
    ];

    return obrigacoes.map((o, idx) => {
        const dataVenc = new Date(ano, mes, o.diaVencimento);
        let status: 'pendente' | 'cumprida' | 'atrasada' = 'pendente';
        if (dataVenc < hoje) status = 'atrasada';

        return {
            ...o,
            id: `${competencia}-${idx}`,
            competencia,
            status,
        };
    });
}

// ──── Alertas de Vencimento ──────────────────────────────────────────────────

export function calcularAlertasVencimento(eventos: EventoEsocial[]): EventoEsocial[] {
    const hoje = new Date();
    const em5Dias = new Date();
    em5Dias.setDate(hoje.getDate() + 5);

    return eventos.filter(e => {
        if (e.status !== 'pendente') return false;
        const [ano, mes] = e.competencia.split('-').map(Number);
        const prazo = EVENTO_PRAZOS[e.tipo];
        if (!prazo) return false;
        const dataLimite = new Date(ano, mes, prazo.diaLimite);
        return dataLimite <= em5Dias;
    });
}

// ──── Resumo de Pendências (popup de login) ─────────────────────────────────

export interface ResumoPendencias {
    fgtsAtrasados: number;
    fgtsParciais: number;
    fgtsValorPendente: number;
    eventosPendentes: number;
    eventosRejeitados: number;
    alertasVencimento: number;
    certsVencendo: number;
    certsVencidos: number;
    temPendencias: boolean;
}

export async function calcularResumoPendencias(): Promise<ResumoPendencias> {
    const [eventos, fgts, empresas] = await Promise.all([
        listarEventos(),
        listarFgts(),
        listarTodasEmpresas(),
    ]);

    const fgtsAtrasados = fgts.filter(f => f.status === 'atrasado').length;
    const fgtsParciais = fgts.filter(f => f.status === 'parcial').length;
    const fgtsValorPendente = fgts.reduce((acc, f) => acc + Math.max(0, f.valorDevido - f.valorRecolhido), 0);

    const eventosPendentes = eventos.filter(e => e.status === 'pendente').length;
    const eventosRejeitados = eventos.filter(e => e.status === 'rejeitado').length;

    const alertas = calcularAlertasVencimento(eventos);
    const alertasVencimento = alertas.length;

    const certsVencendo = empresas.filter(e => calcularStatusCertificado(e.certificado?.validade) === 'vencendo').length;
    const certsVencidos = empresas.filter(e => calcularStatusCertificado(e.certificado?.validade) === 'vencido').length;

    const temPendencias =
        fgtsAtrasados > 0 ||
        fgtsParciais > 0 ||
        eventosPendentes > 0 ||
        eventosRejeitados > 0 ||
        alertasVencimento > 0 ||
        certsVencendo > 0 ||
        certsVencidos > 0;

    return {
        fgtsAtrasados,
        fgtsParciais,
        fgtsValorPendente,
        eventosPendentes,
        eventosRejeitados,
        alertasVencimento,
        certsVencendo,
        certsVencidos,
        temPendencias,
    };
}

// ──── Audit Log ─────────────────────────────────────────────────────────────

export async function registrarAudit(log: Omit<AuditLog, 'id' | 'criadoEm'>): Promise<void> {
    try {
        const col = getCol(COLECAO_AUDIT);
        await addDoc(col, { ...log, criadoEm: serverTimestamp() });
    } catch (e) {
        console.error('Falha ao registrar audit log:', e);
    }
}

export async function listarAuditLogs(limite: number = 50): Promise<AuditLog[]> {
    const col = getCol(COLECAO_AUDIT);
    const q = query(col, orderBy('criadoEm', 'desc'), firestoreLimit(limite));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
}

export async function listarAuditPorEvento(eventoId: string): Promise<AuditLog[]> {
    const col = getCol(COLECAO_AUDIT);
    const q = query(col, where('eventoId', '==', eventoId), orderBy('criadoEm', 'desc'), firestoreLimit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog));
}
