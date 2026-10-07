// services/agenda/convite.ts
//
// Convite de agenda (.ics, RFC 5545) com os vencimentos que o DP manda ao
// cliente (Paulo, 07/10/2026: "pode seguir com o botão baixar envio da
// agenda"). O arquivo vai anexo ao e-mail ou ao WhatsApp; aberto no celular ou
// no computador, os eventos entram na agenda com lembrete. Para quem usa o
// Google Agenda, cada evento também tem um link "adicionar".

import { diaUtilAnterior, somarDias, type Data } from '../prazos/calendario';
import { vencimentosDaCompetencia } from '../prazos/obrigacoes';
import type { ResultadoFerias } from '../calculo/motorFerias';

export interface EventoAgenda {
    uid: string;
    titulo: string;
    /** Dia inteiro: início e fim (inclusive) em AAAA-MM-DD. */
    inicio: Data;
    fim?: Data;
    descricao: string;
    /** Lembrete na véspera (às 9h). */
    lembrete?: boolean;
}

const reais = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const br = (d: Data) => d.split('-').reverse().join('/');
const compBr = (c: string) => `${c.slice(5)}/${c.slice(0, 4)}`;
const dataIcs = (d: Data) => d.replace(/-/g, '');

/** Texto de propriedade do iCalendar: barra, vírgula, ponto e vírgula e quebra de linha escapados. */
export const escaparIcs = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Dobra a linha em 75 octetos (UTF-8), sem partir caractere. */
export function dobrar(linha: string): string {
    const enc = new TextEncoder();
    const partes: string[] = [];
    let atual = ''; let bytes = 0;
    for (const ch of linha) {
        const n = enc.encode(ch).length;
        const limite = partes.length ? 74 : 75; // as continuações começam com um espaço
        if (bytes + n > limite) { partes.push(atual); atual = ''; bytes = 0; }
        atual += ch; bytes += n;
    }
    partes.push(atual);
    return partes.join('\r\n ');
}

/** Calendário .ics com os eventos (dia inteiro). `agora` só para o DTSTAMP. */
export function gerarIcs(eventos: EventoAgenda[], nome: string, agora = new Date()): string {
    const stamp = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SP Assessoria//Consultor DP//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escaparIcs(nome)}`];
    for (const e of eventos) {
        linhas.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${dataIcs(e.inicio)}`, `DTEND;VALUE=DATE:${dataIcs(somarDias(e.fim ?? e.inicio, 1))}`,
            `SUMMARY:${escaparIcs(e.titulo)}`, `DESCRIPTION:${escaparIcs(e.descricao)}`, 'TRANSP:TRANSPARENT');
        if (e.lembrete) linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escaparIcs(e.titulo)}`, 'TRIGGER:-PT15H', 'END:VALARM');
        linhas.push('END:VEVENT');
    }
    linhas.push('END:VCALENDAR');
    return linhas.map(dobrar).join('\r\n') + '\r\n';
}

/** Link "adicionar ao Google Agenda" (dia inteiro). */
export function linkGoogleAgenda(e: EventoAgenda): string {
    const q = new URLSearchParams({ action: 'TEMPLATE', text: e.titulo, dates: `${dataIcs(e.inicio)}/${dataIcs(somarDias(e.fim ?? e.inicio, 1))}`, details: e.descricao });
    return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Texto para colar no WhatsApp: cada evento com a data e o link do Google Agenda. */
export function textoWhatsApp(eventos: EventoAgenda[], cabecalho: string): string {
    return [cabecalho, '', ...eventos.map(e => `• ${br(e.inicio)}${e.fim && e.fim !== e.inicio ? ` a ${br(e.fim)}` : ''}: ${e.titulo}\n  Adicionar à agenda: ${linkGoogleAgenda(e)}`),
        '', 'O arquivo .ics anexo adiciona todos os eventos de uma vez na agenda do celular ou do computador.'].join('\n');
}

/**
 * Eventos do recibo de férias: pagamento (até 2 dias antes do início,
 * antecipando para dia útil), gozo, e as guias de cada competência que as
 * férias tocam (DARF da DCTFWeb com o INSS e o IRRF; FGTS Digital).
 */
export function eventosDoReciboFerias(r: ResultadoFerias, empresa: { nome: string; cnpj: string }, gozo: { dtInicio: string; dtFim: string }): EventoAgenda[] {
    const base = `${empresa.nome} · ${r.nome}`;
    const uid = (s: string) => `ferias-${r.gozoId}-${s}@consultor-dp`;
    const ev: EventoAgenda[] = [];
    if (r.pagarAte) {
        const dia = diaUtilAnterior(r.pagarAte);
        ev.push({ uid: uid('pagamento'), titulo: `Pagar as férias de ${r.nome} (${reais(r.totais.liquido)})`, inicio: dia, lembrete: true,
            descricao: `${base}. Recibo de férias: líquido ${reais(r.totais.liquido)}. Pagamento até 2 dias antes do início do gozo (CLT, art. 145)${dia !== r.pagarAte ? `; ${br(r.pagarAte)} não é dia útil, antecipado` : ''}.` });
    }
    if (gozo.dtInicio) ev.push({ uid: uid('gozo'), titulo: `Férias de ${r.nome}`, inicio: gozo.dtInicio, fim: gozo.dtFim || undefined,
        descricao: `${base}. ${r.diasGozo} dia(s) de gozo${r.abonoDias ? ` e ${r.abonoDias} de abono pecuniário` : ''}${r.periodo ? `; período aquisitivo ${br(r.periodo.inicio)} a ${br(r.periodo.fim)}` : ''}.` });
    const irrf = r.verbas.find(v => v.codigo === 'IRRFFER')?.valor ?? 0;
    const competencias = new Set([...r.porCompetencia.map(c => c.competencia), ...(irrf ? [r.pagamento] : [])]);
    for (const c of [...competencias].sort()) {
        const pc = r.porCompetencia.find(x => x.competencia === c);
        const v = vencimentosDaCompetencia(c);
        const darf = v.find(x => x.id === `darf-${c}`)!;
        const fgts = v.find(x => x.id === `fgts-${c}`)!;
        const partes = [pc?.inss ? `INSS das férias ${reais(pc.inss)}` : '', irrf && c === r.pagamento ? `IRRF das férias ${reais(irrf)}` : ''].filter(Boolean);
        if (partes.length) ev.push({ uid: uid(`darf-${c}`), titulo: `DARF da DCTFWeb ${compBr(c)} (inclui ${partes.join(' e ')})`, inicio: darf.data, lembrete: true,
            descricao: `${base}. O DARF da DCTFWeb da competência ${compBr(c)} inclui ${partes.join(' e ')} do recibo de férias, junto com a folha do mês. ${darf.base}.${darf.observacao ? ` ${darf.observacao}.` : ''}` });
        if (pc?.fgts) ev.push({ uid: uid(`fgts-${c}`), titulo: `FGTS Digital ${compBr(c)} (inclui ${reais(pc.fgts)} das férias)`, inicio: fgts.data, lembrete: true,
            descricao: `${base}. A guia do FGTS Digital da competência ${compBr(c)} inclui ${reais(pc.fgts)} do recibo de férias. ${fgts.base}.${fgts.observacao ? ` ${fgts.observacao}.` : ''}` });
    }
    return ev.sort((a, b) => a.inicio.localeCompare(b.inicio));
}
