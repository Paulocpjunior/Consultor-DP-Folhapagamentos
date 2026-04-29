// services/folha/folhaEventosCrudService.ts
// CRUD manual de eventos no catálogo IOB SAGE + auditoria.
// Reusa getCatalogo/setCatalogo que já existem em folhaFirestoreService.

import {
    addDoc,
    collection,
    getDocs,
    limit as fsLimit,
    orderBy,
    query,
    serverTimestamp,
    where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getCatalogo, setCatalogo } from './folhaFirestoreService';
import type { CatalogoEventos, EventoIobSage } from './folhaTypes';
import type { User } from '../../types';

// Coleção plana de auditoria — facilita consultar por evento ou geral
const AUDIT_COL = 'folha_eventos_audit';

export type AuditAction = 'create' | 'update' | 'delete' | 'recode';

export interface AuditEntry {
    id: string;
    eventoCod: string;
    action: AuditAction;
    timestamp: { toDate: () => Date } | null;
    user: { uid: string; name: string; email: string | null };
    before: EventoIobSage | null;
    after: EventoIobSage | null;
    changes: string[];
    notes?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function userInfo(currentUser: User) {
    const u = currentUser as User & {
        uid?: string;
        name?: string;
        displayName?: string;
        email?: string;
    };
    return {
        uid: u.uid || 'unknown',
        name: u.name || u.displayName || u.email || 'anônimo',
        email: u.email || null,
    };
}

function normalizeCod(c: string): string {
    return String(c || '').trim().padStart(4, '0');
}

function normalizeRO(r: string): string {
    return String(r || '000').trim().padStart(3, '0');
}

const CAMPOS_INCIDENCIA: Array<keyof EventoIobSage['incidencias']> = [
    'ir', 'in', 'irf', 'inf', 'fg', 'rt', 'vr',
];

export function sanitizeEvento(raw: Partial<EventoIobSage>): EventoIobSage {
    const inc = raw.incidencias || ({} as EventoIobSage['incidencias']);
    const novo: EventoIobSage = {
        codigo: normalizeCod(raw.codigo || ''),
        descricao: String(raw.descricao || '').trim().toUpperCase().slice(0, 40),
        tipo: raw.tipo === 'D' ? 'D' : 'V',
        incidencias: {
            ir: inc.ir === 'S' ? 'S' : 'N',
            in: inc.in === 'S' ? 'S' : 'N',
            irf: inc.irf === 'S' ? 'S' : 'N',
            inf: inc.inf === 'S' ? 'S' : 'N',
            fg: inc.fg === 'S' ? 'S' : 'N',
            rt: inc.rt === 'S' ? 'S' : 'N',
            vr: inc.vr === 'S' ? 'S' : 'N',
        },
        rv: raw.rv === 'V' ? 'V' : 'R',
        coeficiente: Number.isFinite(Number(raw.coeficiente)) ? Number(raw.coeficiente) : 1,
        ro: normalizeRO(raw.ro || '000'),
    };
    return novo;
}

function diffEventos(antes: EventoIobSage | null, depois: EventoIobSage): string[] {
    if (!antes) return ['*nova criação*'];
    const changes: string[] = [];
    if (antes.codigo !== depois.codigo) changes.push('codigo');
    if (antes.descricao !== depois.descricao) changes.push('descricao');
    if (antes.tipo !== depois.tipo) changes.push('tipo');
    if (antes.rv !== depois.rv) changes.push('rv');
    if (antes.coeficiente !== depois.coeficiente) changes.push('coeficiente');
    if (antes.ro !== depois.ro) changes.push('ro');
    CAMPOS_INCIDENCIA.forEach((k) => {
        if (antes.incidencias[k] !== depois.incidencias[k]) changes.push(`inc.${k}`);
    });
    return changes;
}

async function logAudit(entry: Omit<AuditEntry, 'id' | 'timestamp'>) {
    if (!db) throw new Error('Firestore não está configurado.');
    await addDoc(collection(db, AUDIT_COL), {
        ...entry,
        timestamp: serverTimestamp(),
    });
}

// ─── API pública ────────────────────────────────────────────────────

/**
 * Cria um novo evento no catálogo.
 * Falha se já existir evento com o mesmo código.
 */
export async function criarEvento(
    raw: Partial<EventoIobSage>,
    currentUser: User
): Promise<{ catalogo: CatalogoEventos; evento: EventoIobSage }> {
    const novo = sanitizeEvento(raw);
    if (!novo.codigo || !novo.descricao) {
        throw new Error('Código e descrição são obrigatórios.');
    }
    const catalogo = await getCatalogo();
    if (!catalogo) throw new Error('Catálogo não encontrado.');
    if (catalogo.eventos.some((e) => e.codigo === novo.codigo)) {
        throw new Error(`Já existe evento com código ${novo.codigo}.`);
    }
    const novoCatalogo: CatalogoEventos = {
        ...catalogo,
        eventos: [...catalogo.eventos, novo].sort((a, b) => a.codigo.localeCompare(b.codigo)),
    };
    await setCatalogo(novoCatalogo);
    await logAudit({
        eventoCod: novo.codigo,
        action: 'create',
        user: userInfo(currentUser),
        before: null,
        after: novo,
        changes: ['*nova criação*'],
        notes: `Evento ${novo.codigo} criado manualmente.`,
    });
    return { catalogo: novoCatalogo, evento: novo };
}

/**
 * Edita um evento existente. Se o código mudou, é recode (delete antigo + create novo).
 */
export async function editarEvento(
    codOriginal: string,
    raw: Partial<EventoIobSage>,
    currentUser: User
): Promise<{ catalogo: CatalogoEventos; evento: EventoIobSage }> {
    const codAntigo = normalizeCod(codOriginal);
    const novo = sanitizeEvento(raw);
    if (!novo.codigo || !novo.descricao) {
        throw new Error('Código e descrição são obrigatórios.');
    }
    const catalogo = await getCatalogo();
    if (!catalogo) throw new Error('Catálogo não encontrado.');

    const idx = catalogo.eventos.findIndex((e) => e.codigo === codAntigo);
    if (idx === -1) throw new Error(`Evento ${codAntigo} não existe no catálogo.`);
    const before = catalogo.eventos[idx];
    const houveRecode = codAntigo !== novo.codigo;

    if (houveRecode && catalogo.eventos.some((e) => e.codigo === novo.codigo)) {
        throw new Error(`Já existe evento com o novo código ${novo.codigo}.`);
    }

    const changes = diffEventos(before, novo);
    if (changes.length === 0) {
        return { catalogo, evento: before };
    }

    const novosEventos = [...catalogo.eventos];
    novosEventos[idx] = novo;
    novosEventos.sort((a, b) => a.codigo.localeCompare(b.codigo));
    const novoCatalogo: CatalogoEventos = { ...catalogo, eventos: novosEventos };
    await setCatalogo(novoCatalogo);

    await logAudit({
        eventoCod: novo.codigo,
        action: houveRecode ? 'recode' : 'update',
        user: userInfo(currentUser),
        before,
        after: novo,
        changes,
        notes: houveRecode
            ? `Código alterado de ${codAntigo} para ${novo.codigo}. Reveja referências em apontamentos e exportações SAGE.`
            : `Campos alterados: ${changes.join(', ')}`,
    });

    return { catalogo: novoCatalogo, evento: novo };
}

/**
 * Exclui um evento do catálogo.
 */
export async function excluirEvento(
    cod: string,
    currentUser: User
): Promise<CatalogoEventos> {
    const c = normalizeCod(cod);
    const catalogo = await getCatalogo();
    if (!catalogo) throw new Error('Catálogo não encontrado.');
    const before = catalogo.eventos.find((e) => e.codigo === c);
    if (!before) throw new Error(`Evento ${c} não existe.`);
    const novoCatalogo: CatalogoEventos = {
        ...catalogo,
        eventos: catalogo.eventos.filter((e) => e.codigo !== c),
    };
    await setCatalogo(novoCatalogo);
    await logAudit({
        eventoCod: c,
        action: 'delete',
        user: userInfo(currentUser),
        before,
        after: null,
        changes: [],
        notes: `Evento ${c} excluído.`,
    });
    return novoCatalogo;
}

/**
 * Histórico de auditoria de um evento específico (mais recente primeiro).
 */
export async function getHistoricoEvento(cod: string, max = 20): Promise<AuditEntry[]> {
    if (!db) return [];
    const c = normalizeCod(cod);
    try {
        const q = query(
            collection(db, AUDIT_COL),
            where('eventoCod', '==', c),
            orderBy('timestamp', 'desc'),
            fsLimit(max)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditEntry, 'id'>) }));
    } catch (e) {
        console.warn('Histórico do evento indisponível (provavelmente índice composto pendente):', e);
        return [];
    }
}

/**
 * Histórico geral da empresa (últimas N entradas).
 */
export async function getHistoricoGeral(max = 100): Promise<AuditEntry[]> {
    if (!db) return [];
    try {
        const q = query(
            collection(db, AUDIT_COL),
            orderBy('timestamp', 'desc'),
            fsLimit(max)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditEntry, 'id'>) }));
    } catch (e) {
        console.warn('Histórico geral indisponível:', e);
        return [];
    }
}
