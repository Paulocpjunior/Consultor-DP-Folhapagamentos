// services/esocial/vigiaEsocial.ts
//
// Saúde do eSocial, etapa 1: o vigia. Enquanto o Consultor está aberto, consulta sozinho os protocolos da
// empresa ativa que já venceram o intervalo (filaEnvios.ts) e grava o resultado. Ninguém precisa lembrar de
// "Consultar resultado"; lote parado ou sem resposta vira alerta no menu eSocial.

import type { Usuario } from '../cadastros/cadastrosService';
import { consultarLote } from './transmissao';
import { listarPendentes, registrarConsulta, registrarFechamentoDoGoverno, type Envio } from './transmissaoService';
import { alertasDaFila, consultaVencida, type Alerta } from './filaEnvios';
import { consultarIdentificadores } from './downloadEventos';
import { conciliar, EVENTOS_CONCILIADOS, type Conciliacao, type IdentificadoresDoGoverno } from './anomalias';
import { baixarRecibosDoGoverno, importarFechamentosDoGoverno, type DepsImportacao, type ResultadoImportacao } from './fechamentoGoverno';

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

/**
 * Conciliação da competência com o eSocial (produção): os identificadores de S-1200, S-1210, S-1299 e S-1298
 * do período, sem baixar os XMLs. Devolve também quantos pedidos de download a empresa já fez hoje.
 * Com o usuário, o S-1299/S-1298 achado no governo e transmitido fora do Consultor (IOB/Folhamatic) é gravado em
 * esocial_envios (fechamentoGoverno.ts): é o registro que acende o selo do eSocial no semáforo da DCTFWeb.
 */
export async function conciliarComEsocial(empresa: { id: string; cnpj: string }, perApur: string, envios: Envio[], usuario?: Usuario,
    deps: DepsImportacao = { baixar: baixarRecibosDoGoverno, gravar: registrarFechamentoDoGoverno }): Promise<{ conciliacao: Conciliacao; pedidosHoje: number | null; importacao: ResultadoImportacao | null }> {
    const governo: IdentificadoresDoGoverno = {};
    let pedidosHoje: number | null = null;
    for (const tpEvt of EVENTOS_CONCILIADOS) {
        const r = await consultarIdentificadores({ cnpj: empresa.cnpj, tipo: 'empregador', tpEvt, perApur, certificado: 'escritorio' });
        governo[tpEvt] = r.identificadores;
        pedidosHoje = r.pedidosHoje ?? pedidosHoje;
    }
    let importacao: ResultadoImportacao | null = null;
    if (usuario) {
        importacao = await importarFechamentosDoGoverno({ empresa, perApur, tpAmb: 1, governo, envios, usuario }, deps)
            .catch(e => ({ importados: [], ignorados: [], erro: (e as Error).message }));
        pedidosHoje = importacao.pedidosHoje ?? pedidosHoje;
    }
    return { conciliacao: conciliar(envios, governo, perApur, 1), pedidosHoje, importacao };
}
