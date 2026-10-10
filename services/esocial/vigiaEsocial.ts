// services/esocial/vigiaEsocial.ts
//
// Saúde do eSocial, etapa 1: o vigia. Enquanto o Consultor está aberto, consulta sozinho os protocolos da
// empresa ativa que já venceram o intervalo (filaEnvios.ts) e grava o resultado. Ninguém precisa lembrar de
// "Consultar resultado"; lote parado ou sem resposta vira alerta no menu eSocial.

import type { Usuario } from '../cadastros/cadastrosService';
import { consultarLote } from './transmissao';
import { listarPendentes, registrarConsulta, type Envio } from './transmissaoService';
import { alertasDaFila, consultaVencida, type Alerta } from './filaEnvios';

export interface RodadaVigia { pendentes: Envio[]; consultados: number; mudaram: number; alertas: Alerta[]; erro?: string }

/** Uma rodada: consulta os vencidos (até `limite` por vez) e devolve os alertas da fila pendente. */
export async function rodadaDoVigia(empresa: { id: string; cnpj: string }, usuario: Usuario, agora = Date.now(), limite = 5): Promise<RodadaVigia> {
    let pendentes = await listarPendentes(empresa.id);
    let consultados = 0, mudaram = 0; let erro: string | undefined;
    for (const e of pendentes.filter(x => consultaVencida(x, agora)).slice(0, limite)) {
        try {
            const r = await consultarLote({ empresaId: empresa.id, cnpj: empresa.cnpj, protocolo: e.protocolo, tpAmb: e.tpAmb, certificado: e.certificado });
            await registrarConsulta(e, r, usuario);
            consultados++;
            if (r.situacao !== e.situacao) mudaram++;
        } catch (x) { erro = (x as Error).message; }
    }
    if (consultados) pendentes = await listarPendentes(empresa.id);
    return { pendentes, consultados, mudaram, alertas: alertasDaFila(pendentes, Date.now()), ...(erro ? { erro } : {}) };
}
