// services/esocial/envioSeguro.ts
//
// Envio do eSocial com o pré-voo e a fila (Saúde do eSocial). Todas as telas que transmitem passam por aqui:
//   1) verificarAntesDeEnviar: XSD oficial + regras de ordem e duplicidade pelo histórico da empresa;
//   2) transmitirVerificado: registra o lote ANTES de sair, envia pelo CFI e grava a resposta — ou, se ela não
//      volta, deixa o lote "sem resposta" (nunca perdido) para conferir antes de qualquer reenvio.

import type { Usuario } from '../cadastros/cadastrosService';
import { enviarLote, type Certificado, type RetornoEnvio, type TpAmb } from './transmissao';
import { concluirEnvio, listarEnvios, registrarFalhaEnvio, registrarIntencao, type Envio } from './transmissaoService';
import { achadosDoXsd, bloqueios, lerEventoLote, regrasDoLote, type Achado, type EventoLote } from './preVoo';
import { validarPeloXsd } from './validadorXsd';

export interface EventoParaEnvio { xml: string; nome?: string; /** Registro do Consultor que gerou o evento. */ ref?: string }
export interface Empresa { id: string; cnpj: string }

export interface ResultadoPreVoo { eventos: EventoLote[]; achados: Achado[]; ok: boolean; tpAmb: TpAmb; empresaId: string }

export async function verificarAntesDeEnviar(p: { empresa: Empresa; eventos: EventoParaEnvio[]; tpAmb: TpAmb; historico?: Envio[] }): Promise<ResultadoPreVoo> {
    const eventos = p.eventos.map((e, i) => lerEventoLote(e.nome ?? `evento ${i + 1}`, e.xml, p.empresa, p.tpAmb, e.ref));
    const historico = p.historico ?? await listarEnvios(p.empresa.id);
    const achados = regrasDoLote(eventos, historico, p.tpAmb);
    for (const e of eventos.filter(x => !x.erro)) achados.push(...achadosDoXsd(e, await validarPeloXsd(e.xml)));
    return { eventos, achados, ok: bloqueios(achados).length === 0, tpAmb: p.tpAmb, empresaId: p.empresa.id };
}

export class ErroPreVoo extends Error {
    constructor(public achados: Achado[]) { super(`O pré-voo barrou o envio: ${bloqueios(achados).map(a => a.mensagem).join(' · ')}`); }
}

export type ResultadoTransmissao =
    | { situacao: 'enviado' | 'recusado'; envioId: string; retorno: RetornoEnvio }
    | { situacao: 'sem-resposta' | 'nao-recebido'; envioId: string; erro: string };

/** Envia um lote que passou no pré-voo. */
export async function transmitirVerificado(pv: ResultadoPreVoo, p: { empresa: Empresa; certificado: Certificado; usuario: Usuario }): Promise<ResultadoTransmissao> {
    if (!pv.ok) throw new ErroPreVoo(pv.achados);
    if (pv.empresaId !== p.empresa.id) throw new Error('O pré-voo é de outra empresa.');
    const grupo = pv.eventos[0]?.grupo ?? 0;
    const envioId = await registrarIntencao({
        empresaId: p.empresa.id, cnpj: p.empresa.cnpj, certificado: p.certificado, tpAmb: pv.tpAmb, grupo,
        eventos: pv.eventos.map(e => ({ id: e.id, tipo: e.tipo, perApur: e.perApur || null, ref: e.ref, cpf: e.cpf || undefined })),
    }, p.usuario);
    let retorno: RetornoEnvio;
    try {
        retorno = await enviarLote({ empresaId: p.empresa.id, cnpj: p.empresa.cnpj, eventos: pv.eventos.map(e => e.xml), tpAmb: pv.tpAmb, certificado: p.certificado, ...(pv.tpAmb === 1 ? { confirmoProducao: true } : {}) });
    } catch (e) {
        const situacao = await registrarFalhaEnvio(envioId, e).catch(() => 'sem-resposta' as const);
        return { situacao, envioId, erro: (e as Error)?.message ?? String(e) };
    }
    await concluirEnvio(envioId, retorno);
    return { situacao: retorno.recebido ? 'enviado' : 'recusado', envioId, retorno };
}

/** Mensagem curta do resultado para a tela. */
export function mensagemDaTransmissao(r: ResultadoTransmissao): { ok: boolean; texto: string } {
    if (r.situacao === 'enviado') return { ok: true, texto: `Lote recebido pelo eSocial. Protocolo ${r.retorno.protocolo}. O resultado é consultado automaticamente (Saúde do eSocial).` };
    if (r.situacao === 'recusado') return { ok: false, texto: `eSocial recusou o lote: ${r.retorno.cdResposta ?? ''} ${r.retorno.descResposta}${r.retorno.ocorrencias.length ? ` — ${r.retorno.ocorrencias.map(o => `${o.codigo} ${o.descricao}`).join('; ')}` : ''}`.trim() };
    if (!('erro' in r)) return { ok: false, texto: '' };
    if (r.situacao === 'nao-recebido') return { ok: false, texto: `O envio não saiu (${r.erro}). Nada chegou ao eSocial: corrija e transmita de novo.` };
    return { ok: false, texto: `Sem resposta do envio (${r.erro}). O lote ficou registrado como "sem resposta": NÃO transmita de novo; confira em eSocial › Saúde do eSocial.` };
}
