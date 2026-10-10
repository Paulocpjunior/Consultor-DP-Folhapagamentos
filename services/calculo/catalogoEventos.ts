// services/calculo/catalogoEventos.ts
//
// Catálogo de eventos do IOB para o "Lançar evento" do Cálculo: o do Firestore (Cadastros › Eventos IOB,
// com as edições da equipe) e, sem ele, o do repositório (data/eventos-iob-sage.json, carregado só quando usado).

import type { EventoIobSage } from '../folha/folhaTypes';
import { getCatalogo } from '../folha/folhaFirestoreService';

let carregando: Promise<EventoIobSage[]> | null = null;

export function carregarEventosIob(): Promise<EventoIobSage[]> {
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
