// services/esocial/anomalias.ts
//
// Saúde do eSocial, etapa 3: indicadores de anomalia e conciliação Consultor × eSocial.
//
// Conciliação: os identificadores do eSocial (Id e recibo de cada evento por tipo e período, sem baixar o XML
// nem gastar a cota de download) comparados com os lotes do Consultor (esocial_envios):
//   - lote "sem resposta" cujo evento está no governo → recibo achado, o lote se resolve sem reenvio;
//   - evento aceito pelo Consultor que não aparece no governo → anomalia (excluído? outro ambiente?);
//   - evento no governo que não passou pelo Consultor → informativo (IOB ou outro sistema).
// Anomalias: folha gravada sem S-1200 aceito, competência sem S-1299 depois do prazo (dia 15 do mês seguinte),
// a mesma recusa repetida, certificado vencendo e as ocorrências mais frequentes.

import { aceito, type TpAmb } from './transmissao';
import { SITUACOES_PENDENTES, type Envio, type EventoEnviado } from './transmissaoService';
import { chaveDoEvento } from './preVoo';

export const EVENTOS_CONCILIADOS = ['S-1200', 'S-1210', 'S-1299', 'S-1298'] as const;
export interface Identificador { id: string; nrRec: string }
export type IdentificadoresDoGoverno = Partial<Record<(typeof EVENTOS_CONCILIADOS)[number], Identificador[]>>;

export interface Conciliacao {
    perApur: string;
    confirmados: number;
    /** Lote sem resposta com eventos achados no governo: Id → recibo. */
    semRespostaAchados: { envio: Envio; achados: Record<string, string> }[];
    /** Aceito no Consultor e ausente no governo. */
    naoEncontrados: { envio: Envio; evento: EventoEnviado }[];
    /** No governo e sem envio pelo Consultor. */
    foraDoConsultor: { tipo: string; id: string; nrRec: string }[];
}

const doPeriodo = (ev: EventoEnviado, perApur: string) => ev.perApur === perApur;

export function conciliar(envios: Envio[], governo: IdentificadoresDoGoverno, perApur: string, tpAmb: TpAmb = 1): Conciliacao {
    const producao = envios.filter(e => e.tpAmb === tpAmb);
    const noGoverno = new Map<string, { tipo: string; nrRec: string }>();
    const recibosNoGoverno = new Set<string>();
    for (const [tipo, ids] of Object.entries(governo)) for (const i of ids ?? []) { noGoverno.set(i.id, { tipo, nrRec: i.nrRec }); if (i.nrRec) recibosNoGoverno.add(i.nrRec); }
    const tiposConsultados = new Set(Object.keys(governo));
    const c: Conciliacao = { perApur, confirmados: 0, semRespostaAchados: [], naoEncontrados: [], foraDoConsultor: [] };
    const idsDoConsultor = new Set<string>();
    for (const envio of producao) {
        const achados: Record<string, string> = {};
        for (const ev of envio.eventos) {
            idsDoConsultor.add(ev.id);
            if (!tiposConsultados.has(ev.tipo) || !doPeriodo(ev, perApur)) continue;
            const g = noGoverno.get(ev.id);
            const aceitoAqui = aceito({ cdResposta: ev.cdResposta ?? null, nrRecibo: ev.nrRecibo ?? '' });
            if (g) {
                if (aceitoAqui) c.confirmados++;
                else if (envio.situacao === 'sem-resposta' || envio.situacao === 'transmitindo') achados[ev.id] = g.nrRec;
            } else if (aceitoAqui && !recibosNoGoverno.has(ev.nrRecibo ?? '')) c.naoEncontrados.push({ envio, evento: ev });
            else if (aceitoAqui) c.confirmados++;
        }
        if (Object.keys(achados).length) c.semRespostaAchados.push({ envio, achados });
    }
    for (const [id, g] of noGoverno) if (!idsDoConsultor.has(id)) c.foraDoConsultor.push({ tipo: g.tipo, id, nrRec: g.nrRec });
    return c;
}

export type GravidadeAnomalia = 'critico' | 'atencao' | 'info';
export type AcaoAnomalia = 'conciliar' | 'resolver-sem-resposta' | 'cofre' | 'diagnosticar' | 'fechamento' | 'eventos-folha' | 'nenhuma';
export interface Anomalia { id: string; gravidade: GravidadeAnomalia; titulo: string; detalhe: string; acao: AcaoAnomalia; envioId?: string }

export interface ContextoAnomalias {
    competencia: string;
    hoje: string;
    envios: Envio[];
    /** Trabalhadores da folha gravada da competência (CPF e nome). */
    folhaGravada: { cpf: string; nome: string }[] | null;
    /** Dias para vencer o certificado que assina pela empresa (null = sem certificado no cofre). */
    certificadoDias?: number | null;
    conciliacao?: Conciliacao | null;
}

const mesSeguinte = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };
/** Prazo dos periódicos: dia 15 do mês seguinte (o eSocial antecipa para o dia útil anterior quando cai em fim de semana). */
export const prazoPeriodicos = (competencia: string) => `${mesSeguinte(competencia)}-15`;
const compBr = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;
const aceitoNo = (env: Envio, ev: EventoEnviado) => env.situacao === 'processado' && aceito({ cdResposta: ev.cdResposta ?? null, nrRecibo: ev.nrRecibo ?? '' });

export function anomaliasDaEmpresa(c: ContextoAnomalias): Anomalia[] {
    const out: Anomalia[] = [];
    const prod = c.envios.filter(e => e.tpAmb === 1);
    const comp = c.competencia;
    const eventosProd = prod.flatMap(env => env.eventos.map(ev => ({ env, ev })));

    // Folha gravada sem S-1200 aceito pelo Consultor (pode ter ido pelo IOB: a conciliação confirma).
    if (c.folhaGravada?.length) {
        const comS1200 = new Set(eventosProd.filter(x => x.ev.tipo === 'S-1200' && x.ev.perApur === comp && aceitoNo(x.env, x.ev)).map(x => x.ev.cpf));
        const pendentes = new Set(eventosProd.filter(x => x.ev.tipo === 'S-1200' && x.ev.perApur === comp && SITUACOES_PENDENTES.includes(x.env.situacao)).map(x => x.ev.cpf));
        const faltam = c.folhaGravada.filter(t => !comS1200.has(t.cpf) && !pendentes.has(t.cpf));
        const conciliadoGov = c.conciliacao && c.conciliacao.perApur === comp ? c.conciliacao.foraDoConsultor.filter(x => x.tipo === 'S-1200').length : 0;
        if (faltam.length && conciliadoGov < faltam.length) {
            const atrasado = c.hoje > prazoPeriodicos(comp);
            out.push({ id: `folha-sem-s1200-${comp}`, gravidade: atrasado ? 'critico' : 'atencao', acao: c.conciliacao ? 'eventos-folha' : 'conciliar',
                titulo: `${faltam.length} trabalhador(es) da folha de ${compBr(comp)} sem S-1200 aceito`,
                detalhe: `${faltam.slice(0, 5).map(t => t.nome || t.cpf).join(', ')}${faltam.length > 5 ? '…' : ''}. Prazo: ${prazoPeriodicos(comp).split('-').reverse().join('/')}.${c.conciliacao ? '' : ' Se foram transmitidos pelo IOB, concilie com o eSocial para confirmar.'}` });
        }
    }

    // Competência anterior sem fechamento (S-1299) depois do prazo.
    for (const per of [...new Set(eventosProd.filter(x => x.ev.tipo === 'S-1200' && x.ev.perApur && /^\d{4}-\d{2}$/.test(x.ev.perApur) && aceitoNo(x.env, x.ev)).map(x => x.ev.perApur!))]) {
        if (c.hoje <= prazoPeriodicos(per)) continue;
        const fechou = eventosProd.some(x => x.ev.tipo === 'S-1299' && x.ev.perApur === per && aceitoNo(x.env, x.ev))
            || (c.conciliacao?.perApur === per && c.conciliacao.foraDoConsultor.some(x => x.tipo === 'S-1299'));
        if (!fechou) out.push({ id: `sem-fechamento-${per}`, gravidade: 'critico', acao: 'fechamento', titulo: `Competência ${compBr(per)} sem S-1299 aceito`, detalhe: `O prazo dos periódicos venceu em ${prazoPeriodicos(per).split('-').reverse().join('/')}. Se o fechamento foi pelo IOB, concilie; senão, transmita o S-1299 (o DCTFWeb depende dele).` });
    }

    // A mesma recusa repetida (mesmo evento do trabalhador recusado duas vezes ou mais em 30 dias).
    const limite = new Date(new Date(`${c.hoje}T12:00:00`).getTime() - 30 * 86400000).toISOString();
    const recusas = new Map<string, { n: number; ev: EventoEnviado; env: Envio }>();
    for (const { env, ev } of c.envios.flatMap(env => env.eventos.map(ev => ({ env, ev })))) {
        if ((env.enviadoEm ?? '') < limite) continue;
        const recusado = env.situacao === 'recusado' || (env.situacao === 'processado' && !aceito({ cdResposta: ev.cdResposta ?? null, nrRecibo: ev.nrRecibo ?? '' }));
        if (!recusado) continue;
        const k = chaveDoEvento(ev);
        const x = recusas.get(k);
        recusas.set(k, { n: (x?.n ?? 0) + 1, ev, env });
    }
    for (const [k, x] of recusas) if (x.n >= 2) out.push({ id: `recusa-repetida-${k}`, gravidade: 'atencao', acao: 'diagnosticar', envioId: x.env.id, titulo: `${x.ev.tipo} recusado ${x.n} vezes`, detalhe: `${x.ev.perApur ? `Competência ${compBr(x.ev.perApur)}. ` : ''}A correção não resolveu: veja o diagnóstico da ocorrência antes de transmitir de novo.` });

    // Certificado do cofre.
    if (c.certificadoDias !== undefined) {
        const d = c.certificadoDias;
        if (d === null) out.push({ id: 'certificado-ausente', gravidade: 'info', acao: 'cofre', titulo: 'Empresa sem certificado próprio no cofre', detalhe: 'As transmissões usam o certificado do escritório (procurador). Confira se a procuração eletrônica cobre o eSocial.' });
        else if (d < 0) out.push({ id: 'certificado-vencido', gravidade: 'critico', acao: 'cofre', titulo: 'Certificado da empresa vencido', detalhe: `Venceu há ${-d} dia(s). Transmita com o certificado do escritório ou renove no cofre.` });
        else if (d <= 30) out.push({ id: 'certificado-vencendo', gravidade: d <= 15 ? 'critico' : 'atencao', acao: 'cofre', titulo: `Certificado da empresa vence em ${d} dia(s)`, detalhe: 'Renove antes do fechamento da competência para não travar a transmissão.' });
    }

    // Conciliação.
    if (c.conciliacao) {
        const k = c.conciliacao;
        if (k.semRespostaAchados.length) out.push({ id: `sem-resposta-achados-${k.perApur}`, gravidade: 'atencao', acao: 'resolver-sem-resposta', titulo: `${k.semRespostaAchados.reduce((t, x) => t + Object.keys(x.achados).length, 0)} evento(s) "sem resposta" estão no eSocial`, detalhe: 'O eSocial recebeu: grave os recibos e o lote se resolve, sem reenvio.' });
        for (const x of k.naoEncontrados) out.push({ id: `nao-encontrado-${x.evento.id}`, gravidade: 'critico', acao: 'nenhuma', envioId: x.envio.id, titulo: `${x.evento.tipo} aceito pelo Consultor não aparece no eSocial`, detalhe: `Recibo ${x.evento.nrRecibo} (${compBr(k.perApur)}). Pode ter sido excluído (S-3000) ou retificado por outro sistema: confira antes do fechamento.` });
        if (k.foraDoConsultor.length) out.push({ id: `fora-${k.perApur}`, gravidade: 'info', acao: 'nenhuma', titulo: `${k.foraDoConsultor.length} evento(s) de ${compBr(k.perApur)} no eSocial que não passaram pelo Consultor`, detalhe: `${Object.entries(k.foraDoConsultor.reduce<Record<string, number>>((m, x) => ({ ...m, [x.tipo]: (m[x.tipo] ?? 0) + 1 }), {})).map(([t, n]) => `${n} ${t}`).join(', ')} — transmitidos pelo IOB ou outro sistema.` });
    }
    const ordem: Record<GravidadeAnomalia, number> = { critico: 0, atencao: 1, info: 2 };
    return out.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade]);
}

/** Ocorrências que mais se repetem nos últimos 30 dias (código, descrição, quantas vezes e em quais eventos). */
export function ocorrenciasFrequentes(envios: Envio[], hoje: string, max = 8): { codigo: string; descricao: string; vezes: number; tipos: string[] }[] {
    const limite = new Date(new Date(`${hoje}T12:00:00`).getTime() - 30 * 86400000).toISOString();
    const m = new Map<string, { codigo: string; descricao: string; vezes: number; tipos: Set<string> }>();
    for (const env of envios) {
        if ((env.enviadoEm ?? '') < limite) continue;
        const add = (o: { codigo: string; descricao: string; tipo: number | null }, tipo: string) => {
            if (o.tipo === 2) return; // advertência não impede
            const x = m.get(o.codigo) ?? { codigo: o.codigo, descricao: o.descricao, vezes: 0, tipos: new Set<string>() };
            x.vezes++; x.tipos.add(tipo); m.set(o.codigo, x);
        };
        for (const o of env.ocorrencias ?? []) add(o, 'lote');
        for (const ev of env.eventos) for (const o of ev.ocorrencias ?? []) add(o, ev.tipo);
    }
    return [...m.values()].sort((a, b) => b.vezes - a.vezes).slice(0, max).map(x => ({ ...x, tipos: [...x.tipos] }));
}
