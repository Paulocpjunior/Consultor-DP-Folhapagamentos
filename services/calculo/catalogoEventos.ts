// services/calculo/catalogoEventos.ts
//
// Catálogo de eventos do IOB para o "Lançar evento" do Cálculo: o do Firestore (Cadastros › Eventos IOB,
// com as edições da equipe) e, sem ele, o do repositório (data/eventos-iob-sage.json, carregado só quando usado).
// Com a empresa, vale a tabela de eventos dela (eventos_empresa), que substitui ou completa o catálogo geral.

import type { EventoIobSage } from '../folha/folhaTypes';
import { getCatalogo } from '../folha/folhaFirestoreService';
import { eventosDaEmpresa } from './eventosEmpresa';
import { lerTabelaEventosEmpresa } from './eventosEmpresaService';

let carregando: Promise<EventoIobSage[]> | null = null;
const porEmpresa = new Map<string, Promise<EventoIobSage[]>>();

function catalogoGeral(): Promise<EventoIobSage[]> {
    carregando ??= (async () => {
        try {
            const c = await getCatalogo();
            if (c?.eventos?.length) return c.eventos;
        } catch { /* sem acesso ao catálogo gravado: vale o do repositório */ }
        const json = await import('../../data/eventos-iob-sage.json');
        return (json.default as { eventos: EventoIobSage[] }).eventos;
    })();
    carregando.catch(() => { carregando = null; });
    return carregando;
}

/** Catálogo da empresa (a tabela dela sobre o geral) ou, sem empresa, o geral. */
export function carregarEventosIob(empresaId?: string): Promise<EventoIobSage[]> {
    if (!empresaId) return catalogoGeral();
    let p = porEmpresa.get(empresaId);
    if (!p) {
        p = Promise.all([catalogoGeral(), lerTabelaEventosEmpresa(empresaId).catch(() => null)]).then(([g, t]) => eventosDaEmpresa(g, t));
        p.catch(() => porEmpresa.delete(empresaId));
        porEmpresa.set(empresaId, p);
    }
    return p;
}

/** Depois de gravar ou apagar a tabela da empresa: a próxima leitura busca de novo. */
export function esquecerEventosDaEmpresa(empresaId: string) { porEmpresa.delete(empresaId); }
