// services/esocial/preVoo.ts
//
// Saúde do eSocial, etapa 2: o pré-voo. Antes de qualquer lote sair, o Consultor confere
//   1) o XSD oficial do leiaute vigente (validadorXsd.ts);
//   2) as regras de ordem e de duplicidade, pelo histórico dos lotes da empresa (esocial_envios):
//      - o mesmo evento não sai duas vezes (Id já transmitido; mesmo evento do trabalhador ainda sem resultado);
//      - competência fechada (S-1299 aceito) só recebe periódico depois do S-1298;
//      - o S-1299 espera os periódicos da competência; o S-1210 espera o S-1200 do trabalhador;
//      - retificação leva o recibo do evento original.
// Bloqueio impede o envio, com o motivo em português; aviso pede confirmação. O erro fica aqui, não volta do governo.

import { aceito, grupoDoTipo, lerEventoXml, ROTULO_GRUPO, type EventoLido, type TpAmb } from './transmissao';
import { SITUACOES_PENDENTES, type Envio, type EventoEnviado } from './transmissaoService';
import type { ResultadoXsd } from './validadorXsd';

export type Nivel = 'bloqueio' | 'aviso';
export interface Achado { nivel: Nivel; regra: string; mensagem: string; eventoId?: string }

export interface EventoLote extends EventoLido {
    ref?: string;
    indRetif: string;
    nrRecibo: string;
    /** S-3000: recibo e tipo do evento excluído. */
    nrRecEvt: string; tpEvento: string;
    /** S-1299: houve remuneração no período. */
    evtRemun: string;
}

const pegar = (xml: string, tag: string) => (xml.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`)) || [])[1]?.trim() ?? '';

export function lerEventoLote(nome: string, xml: string, empresa: { cnpj: string }, tpAmb: TpAmb, ref?: string): EventoLote {
    const l = lerEventoXml(nome, xml, empresa, tpAmb);
    const ide = (xml.match(/<(?:\w+:)?ideEvento>([\s\S]*?)<\/(?:\w+:)?ideEvento>/) || [])[1] ?? '';
    return { ...l, ref, indRetif: pegar(ide, 'indRetif'), nrRecibo: pegar(ide, 'nrRecibo'), nrRecEvt: pegar(xml, 'nrRecEvt'), tpEvento: pegar(xml, 'tpEvento'), evtRemun: pegar(xml, 'evtRemun') };
}

const PERIODICOS = new Set(['S-1200', 'S-1202', 'S-1207', 'S-1210', 'S-1260', 'S-1270', 'S-1280', 'S-1300']);
const compBr = (p: string) => (p.length === 7 ? `${p.slice(5)}/${p.slice(0, 4)}` : p);
const cpfBr = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.***.***-${c.slice(9)}` : c);
const quem = (e: { cpf?: string }) => (e.cpf ? ` do CPF ${cpfBr(e.cpf)}` : '');

/** Chave de "o mesmo evento": não pode haver dois sem resultado ao mesmo tempo. */
export function chaveDoEvento(e: { tipo: string; cpf?: string; perApur?: string | null; ref?: string; id: string; nrRecEvt?: string }): string {
    if (e.tipo === 'S-3000') return `S-3000|${e.nrRecEvt || e.id}`;
    if (PERIODICOS.has(e.tipo) || e.tipo === 'S-1299' || e.tipo === 'S-1298') return `${e.tipo}|${e.cpf ?? ''}|${e.perApur ?? ''}`;
    return `${e.tipo}|${e.cpf ?? ''}|${e.ref || e.id}`;
}

const semResultado = (env: Envio, ev: EventoEnviado) => SITUACOES_PENDENTES.includes(env.situacao) && (ev.cdResposta === undefined || ev.cdResposta === null);
const aceitoNo = (env: Envio, ev: EventoEnviado) => env.situacao === 'processado' && aceito({ cdResposta: ev.cdResposta ?? null, nrRecibo: ev.nrRecibo ?? '' });

/** Competência fechada no eSocial pelo histórico do Consultor: o último S-1299/S-1298 aceito é um S-1299. */
export function competenciaFechada(perApur: string, historico: Envio[], tpAmb: TpAmb): { fechada: boolean; recibo: string } {
    const marcos = historico.filter(e => e.tpAmb === tpAmb).flatMap(env => env.eventos.filter(ev => (ev.tipo === 'S-1299' || ev.tipo === 'S-1298') && ev.perApur === perApur && aceitoNo(env, ev)).map(ev => ({ ev, em: env.enviadoEm ?? '' })))
        .sort((a, b) => b.em.localeCompare(a.em));
    return marcos[0]?.ev.tipo === 'S-1299' ? { fechada: true, recibo: marcos[0].ev.nrRecibo ?? '' } : { fechada: false, recibo: '' };
}

/** Regras de ordem e duplicidade do lote (sem o XSD). */
export function regrasDoLote(eventos: EventoLote[], historico: Envio[], tpAmb: TpAmb): Achado[] {
    const out: Achado[] = [];
    const bloq = (regra: string, mensagem: string, eventoId?: string) => out.push({ nivel: 'bloqueio', regra, mensagem, eventoId });
    const aviso = (regra: string, mensagem: string, eventoId?: string) => out.push({ nivel: 'aviso', regra, mensagem, eventoId });
    if (!eventos.length) { bloq('lote-vazio', 'Nenhum evento para transmitir.'); return out; }
    if (eventos.length > 50) bloq('lote-tamanho', `O lote tem ${eventos.length} eventos; o eSocial aceita até 50.`);
    for (const e of eventos.filter(x => x.erro)) bloq('leitura', `${e.nome || e.id || 'Evento'}: ${e.erro}.`, e.id);
    const grupos = [...new Set(eventos.map(e => e.grupo ?? (e.tipo ? grupoDoTipo(e.tipo) : null)))];
    if (grupos.length > 1) bloq('lote-grupo', `Um lote leva eventos de um grupo só; vieram ${grupos.map(g => (g ? ROTULO_GRUPO[g] : '?')).join(' e ')}.`);

    const mesmoAmb = historico.filter(e => e.tpAmb === tpAmb);
    const idsNoLote = new Map<string, number>();
    for (const e of eventos) idsNoLote.set(e.id, (idsNoLote.get(e.id) ?? 0) + 1);
    const chavesNoLote = new Map<string, number>();
    for (const e of eventos) { const k = chaveDoEvento(e); chavesNoLote.set(k, (chavesNoLote.get(k) ?? 0) + 1); }

    for (const e of eventos.filter(x => !x.erro)) {
        const rotulo = `${e.tipo}${quem(e)}${e.perApur ? ` (${compBr(e.perApur)})` : ''}`;
        if ((idsNoLote.get(e.id) ?? 0) > 1) bloq('id-repetido', `${rotulo}: o mesmo Id aparece mais de uma vez no lote.`, e.id);
        if ((chavesNoLote.get(chaveDoEvento(e)) ?? 0) > 1 && (idsNoLote.get(e.id) ?? 0) === 1) bloq('evento-repetido', `${rotulo}: o lote leva dois eventos iguais para o mesmo trabalhador e período.`, e.id);

        const jaFoi = historico.find(env => !['recusado', 'nao-recebido'].includes(env.situacao) && env.eventos.some(ev => ev.id === e.id));
        if (jaFoi) bloq('id-transmitido', jaFoi.situacao === 'transmitindo' || jaFoi.situacao === 'sem-resposta'
            ? `${rotulo}: o envio anterior deste evento ficou sem resposta. Confira na Saúde do eSocial (pode já estar no governo) antes de transmitir de novo.`
            : `${rotulo}: este evento (Id ${e.id}) já foi transmitido${jaFoi.protocolo ? ` no protocolo ${jaFoi.protocolo}` : ''}. Gere o evento de novo se precisar reenviar.`, e.id);

        const k = chaveDoEvento(e);
        const pendente = mesmoAmb.find(env => env.eventos.some(ev => semResultado(env, ev) && chaveDoEvento(ev) === k));
        if (pendente && !jaFoi) bloq('pendente', `${rotulo}: há um envio igual ainda sem resultado (${pendente.protocolo ? `protocolo ${pendente.protocolo}` : 'sem resposta do envio'}). Aguarde o resultado na Saúde do eSocial antes de transmitir de novo.`, e.id);

        if (e.indRetif === '2' && !e.nrRecibo) bloq('retificacao-sem-recibo', `${rotulo}: retificação sem o recibo do evento original (nrRecibo).`, e.id);

        if ((PERIODICOS.has(e.tipo) || e.tipo === 'S-1299') && e.perApur) {
            const f = competenciaFechada(e.perApur, historico, tpAmb);
            if (f.fechada) bloq('competencia-fechada', `${rotulo}: a competência ${compBr(e.perApur)} está fechada no eSocial (S-1299${f.recibo ? ` recibo ${f.recibo}` : ''}). Transmita o S-1298 (reabertura) antes.`, e.id);
        }
        if (e.tipo === 'S-1299' && e.perApur) {
            const abertos = mesmoAmb.filter(env => env.eventos.some(ev => PERIODICOS.has(ev.tipo) && ev.perApur === e.perApur && semResultado(env, ev)));
            if (abertos.length) bloq('fechamento-com-pendentes', `S-1299 (${compBr(e.perApur)}): ainda há ${abertos.length} lote(s) de periódicos da competência sem resultado. Feche depois que todos voltarem.`, e.id);
            const s1200Aceito = mesmoAmb.some(env => env.eventos.some(ev => ev.tipo === 'S-1200' && ev.perApur === e.perApur && aceitoNo(env, ev)));
            if (e.evtRemun === 'S' && !s1200Aceito) aviso('fechamento-sem-s1200', `S-1299 (${compBr(e.perApur)}): informa remuneração no período, mas não há S-1200 aceito transmitido pelo Consultor nesta competência. Se o S-1200 foi pelo IOB, siga.`, e.id);
        }
        if (e.tipo === 'S-1298' && e.perApur && !competenciaFechada(e.perApur, historico, tpAmb).fechada) {
            aviso('reabertura-sem-fechamento', `S-1298 (${compBr(e.perApur)}): não há S-1299 aceito pelo Consultor nesta competência. Se ela foi fechada pelo IOB, siga.`, e.id);
        }
        if (e.tipo === 'S-1210' && e.cpf) {
            const s1200 = mesmoAmb.find(env => env.eventos.some(ev => ev.tipo === 'S-1200' && ev.cpf === e.cpf && semResultado(env, ev)));
            if (s1200) bloq('s1210-espera-s1200', `${rotulo}: o S-1200 deste trabalhador ainda não voltou do eSocial (${s1200.protocolo ? `protocolo ${s1200.protocolo}` : 'sem resposta'}). Transmita o S-1210 depois do S-1200 aceito.`, e.id);
        }
    }
    return out;
}

/** Erros do XSD como achados. */
export function achadosDoXsd(e: Pick<EventoLote, 'id' | 'tipo' | 'cpf' | 'perApur' | 'nome'>, r: ResultadoXsd): Achado[] {
    const rotulo = `${e.tipo || e.nome}${quem(e)}${e.perApur ? ` (${compBr(e.perApur)})` : ''}`;
    if (r.indisponivel) return [{ nivel: 'aviso', regra: 'xsd-indisponivel', mensagem: `${rotulo}: não deu para conferir o XSD agora (${r.indisponivel}). O CFI e o eSocial validam no envio.`, eventoId: e.id }];
    return r.erros.slice(0, 8).map(x => ({ nivel: 'bloqueio' as const, regra: 'xsd', mensagem: `${rotulo}: ${x.mensagem}`, eventoId: e.id }))
        .concat(r.erros.length > 8 ? [{ nivel: 'bloqueio', regra: 'xsd', mensagem: `${rotulo}: e mais ${r.erros.length - 8} erro(s) do XSD.`, eventoId: e.id }] : []);
}

export const bloqueios = (a: Achado[]) => a.filter(x => x.nivel === 'bloqueio');
export const avisos = (a: Achado[]) => a.filter(x => x.nivel === 'aviso');
/** Texto curto para alerta/confirmação. */
export const textoAchados = (a: Achado[], max = 6) => a.slice(0, max).map(x => `• ${x.mensagem}`).join('\n') + (a.length > max ? `\n• e mais ${a.length - max}.` : '');
