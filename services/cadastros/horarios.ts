// services/cadastros/horarios.ts
//
// Arquivos › Horários › Tabela de Horários do IOB Office: jornada de cada dia
// da semana por empresa. O eSocial S-1.x não tem mais tabela de horários
// (o S-1050 saiu); no S-2200 vão só as horas semanais e a descrição da
// jornada, que este módulo gera a partir do horário.
//
// Os limites da CLT viram AVISOS, não bloqueios, porque há exceções legais
// (12x36, acordo de compensação, redução de intervalo por norma coletiva):
// art. 58 e 59 (jornada e horas extras), art. 66 (11 h entre jornadas),
// art. 67 (descanso semanal), art. 71 (intervalo), art. 73 (noturno, 22h-5h)
// e CF art. 7º, XIII (44 h semanais).

export type Dia = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';
export type TipoDia = 'trabalho' | 'folga' | 'dsr';
export interface DiaHorario { tipo: TipoDia; entrada: string; saidaIntervalo: string; retornoIntervalo: string; saida: string }

export interface Horario {
    id: string;
    empresaId: string;
    codigo: string;
    descricao: string;
    dias: Record<Dia, DiaHorario>;
    observacoes: string;
    /** Escala em ciclo (12x36, 24x48, revezamento, folga variável): com ela, os dias da semana não valem. */
    escala?: Escala | null;
}

/**
 * Escala: um ciclo de dias (trabalho ou folga) que se repete a partir da data de referência, o primeiro dia do ciclo.
 * 12x36 (CLT, art. 59-A), 24x48, turnos de revezamento (CF, art. 7º, XIV) e outras escalas de folga variável.
 */
export type TipoEscala = '12x36' | '24x48' | 'revezamento' | 'ciclo';
export interface Escala { tipo: TipoEscala; referencia: string; ciclo: DiaHorario[] }
export const ROTULO_ESCALA: Record<TipoEscala, string> = { '12x36': '12 x 36', '24x48': '24 x 48', revezamento: 'Turno ininterrupto de revezamento', ciclo: 'Escala com folga variável (ciclo)' };

export const DIAS: Dia[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
export const NOME_DIA: Record<Dia, string> = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };
export const ROTULO_TIPO: Record<TipoDia, string> = { trabalho: 'Trabalho', folga: 'Folga / compensado', dsr: 'DSR' };

const diaVazio = (tipo: TipoDia): DiaHorario => ({ tipo, entrada: '', saidaIntervalo: '', retornoIntervalo: '', saida: '' });

export function horarioVazio(empresaId: string): Horario {
    return {
        id: '', empresaId, codigo: '', descricao: '', observacoes: '', escala: null,
        dias: { seg: diaVazio('trabalho'), ter: diaVazio('trabalho'), qua: diaVazio('trabalho'), qui: diaVazio('trabalho'), sex: diaVazio('trabalho'), sab: diaVazio('folga'), dom: diaVazio('dsr') },
    };
}

export const idHorario = (empresaId: string, codigo: string) => `${empresaId}_${encodeURIComponent(codigo.trim())}`;

const horaValida = (h: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export interface CalculoDia { trabalhado: number; intervalo: number; noturno: number; inicio: number; fim: number; erro?: string }

/** Minutos trabalhados, de intervalo e noturnos (22h às 5h) de um dia; a saída antes da entrada vira o dia seguinte. */
export function calcularDia(d: DiaHorario): CalculoDia {
    const zero = { trabalhado: 0, intervalo: 0, noturno: 0, inicio: 0, fim: 0 };
    if (d.tipo !== 'trabalho') return zero;
    if (!horaValida(d.entrada) || !horaValida(d.saida)) return { ...zero, erro: 'informe entrada e saída (HH:MM)' };
    const temIntervalo = !!(d.saidaIntervalo || d.retornoIntervalo);
    if (temIntervalo && (!horaValida(d.saidaIntervalo) || !horaValida(d.retornoIntervalo))) return { ...zero, erro: 'intervalo incompleto ou inválido' };
    const ini = min(d.entrada);
    const rel = (h: string) => (min(h) - ini + 1440) % 1440;
    const total = rel(d.saida) || 1440;
    let si = total; let ri = total;
    if (temIntervalo) {
        si = rel(d.saidaIntervalo); ri = rel(d.retornoIntervalo);
        if (!(si > 0 && si < ri && ri < total)) return { ...zero, erro: 'intervalo fora da jornada' };
    }
    let noturno = 0;
    for (let m = 0; m < total; m++) {
        if (m >= si && m < ri) continue;
        const hora = (ini + m) % 1440;
        if (hora >= 22 * 60 || hora < 5 * 60) noturno++;
    }
    return { trabalhado: total - (ri - si), intervalo: ri - si, noturno, inicio: ini, fim: ini + total };
}

export interface Resumo { semanal: number; noturno: number; diasTrabalho: number; porDia: Record<Dia, CalculoDia> }

export function resumirHorario(h: Horario): Resumo {
    if (h.escala) { const e = resumirEscala(h.escala); return { porDia: Object.fromEntries(DIAS.map(d => [d, calcularDia(diaVazio('folga'))])) as Record<Dia, CalculoDia>, semanal: e.semanal, noturno: e.noturnoSemanal, diasTrabalho: e.diasTrabalho }; }
    const porDia = Object.fromEntries(DIAS.map(d => [d, calcularDia(h.dias[d])])) as Record<Dia, CalculoDia>;
    return {
        porDia,
        semanal: DIAS.reduce((s, d) => s + porDia[d].trabalhado, 0),
        noturno: DIAS.reduce((s, d) => s + porDia[d].noturno, 0),
        diasTrabalho: DIAS.filter(d => h.dias[d].tipo === 'trabalho').length,
    };
}

/** Hora noturna reduzida (52min30s): minutos reais × 60 / 52,5. */
export const noturnoReduzido = (minutos: number) => Math.round((minutos * 60) / 52.5);

export interface ValidacaoHorario { erros: string[]; avisos: string[] }

export function validarHorario(h: Horario, existentes: Horario[] = []): ValidacaoHorario {
    const erros: string[] = []; const avisos: string[] = [];
    if (!h.codigo.trim()) erros.push('Informe o código do horário.');
    else if (!h.id && existentes.some(e => e.empresaId === h.empresaId && e.codigo.trim() === h.codigo.trim())) erros.push('Já existe um horário com este código nesta empresa.');
    if (!h.descricao.trim()) erros.push('Informe a descrição.');
    if (h.escala) { const v = validarEscala(h.escala); return { erros: [...erros, ...v.erros], avisos: v.avisos }; }
    const r = resumirHorario(h);
    if (!r.diasTrabalho) erros.push('Marque ao menos um dia de trabalho.');
    let diasOk = true;
    for (const d of DIAS) {
        const c = r.porDia[d];
        if (c.erro) { erros.push(`${NOME_DIA[d]}: ${c.erro}.`); diasOk = false; continue; }
        if (h.dias[d].tipo !== 'trabalho') continue;
        if (c.trabalhado > 6 * 60 && c.intervalo < 60) avisos.push(`${NOME_DIA[d]}: mais de 6 h com intervalo menor que 1 h (CLT art. 71).`);
        else if (c.trabalhado > 4 * 60 && c.trabalhado <= 6 * 60 && c.intervalo < 15) avisos.push(`${NOME_DIA[d]}: de 4 h a 6 h exige intervalo de 15 min (CLT art. 71, §1º).`);
        if (c.trabalhado > 10 * 60) avisos.push(`${NOME_DIA[d]}: mais de 10 h no dia (CLT arts. 58 e 59); só com regime especial, como 12x36.`);
    }
    if (r.semanal > 44 * 60) avisos.push(`Total semanal de ${hhmm(r.semanal)} acima de 44 h (CF art. 7º, XIII).`);
    if (!DIAS.some(d => h.dias[d].tipo === 'dsr')) avisos.push('Nenhum dia marcado como DSR (CLT art. 67).');
    if (diasOk) {
        for (let i = 0; i < 7; i++) {
            const a = DIAS[i]; const b = DIAS[(i + 1) % 7];
            if (h.dias[a].tipo !== 'trabalho' || h.dias[b].tipo !== 'trabalho') continue;
            const descanso = r.porDia[b].inicio + 1440 - r.porDia[a].fim;
            if (descanso < 11 * 60) avisos.push(`De ${NOME_DIA[a]} para ${NOME_DIA[b]}: ${hhmm(Math.max(descanso, 0))} entre jornadas, menos de 11 h (CLT art. 66).`);
        }
    }
    return { erros, avisos };
}

const textoDia = (d: DiaHorario) => (d.tipo === 'trabalho'
    ? d.saidaIntervalo ? `${d.entrada}-${d.saidaIntervalo} e ${d.retornoIntervalo}-${d.saida}` : `${d.entrada}-${d.saida}`
    : d.tipo === 'dsr' ? 'DSR' : 'folga');

/** Descrição da jornada no formato do campo dscJorn do S-2200 (até 999 caracteres), juntando dias iguais seguidos. */
export function descricaoJornada(h: Horario): string {
    if (h.escala) return descricaoEscala(h.escala);
    const partes: string[] = [];
    let i = 0;
    while (i < 7) {
        let j = i;
        while (j + 1 < 7 && textoDia(h.dias[DIAS[j + 1]]) === textoDia(h.dias[DIAS[i]])) j++;
        const dias = i === j ? NOME_DIA[DIAS[i]] : j === i + 1 ? `${NOME_DIA[DIAS[i]]} e ${NOME_DIA[DIAS[j]]}` : `${NOME_DIA[DIAS[i]]} a ${NOME_DIA[DIAS[j]]}`;
        partes.push(`${dias}: ${textoDia(h.dias[DIAS[i]])}`);
        i = j + 1;
    }
    return partes.join('; ').slice(0, 999);
}

/** Horas semanais da ficha (S-2200, qtdHrsSem) × total do horário ligado a ela. */
export function conferirHorasSemanais(horasSemanais: string | undefined, h: Horario): string | null {
    if (!horasSemanais) return null;
    const ficha = Math.round(Number(horasSemanais.replace(',', '.')) * 60);
    if (Number.isNaN(ficha)) return null;
    const total = resumirHorario(h).semanal;
    return ficha === total ? null : `Horas semanais da ficha (${hhmm(ficha)}) diferentes do horário ${h.codigo} (${hhmm(total)}).`;
}

// ---------- Escalas (ciclo de dias) ----------

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const diaUTC = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;
const trabalho = (entrada: string, saidaIntervalo: string, retornoIntervalo: string, saida: string): DiaHorario => ({ tipo: 'trabalho', entrada, saidaIntervalo, retornoIntervalo, saida });

/** Ciclos prontos: 12x36 (7h às 19h, 1 h de intervalo), 24x48 (7h às 7h) e revezamento de 6 h (manhã, tarde, noite e folgas). */
export function escalaPronta(tipo: TipoEscala, referencia: string): Escala {
    if (tipo === '12x36') return { tipo, referencia, ciclo: [trabalho('07:00', '12:00', '13:00', '19:00'), diaVazio('folga')] };
    if (tipo === '24x48') return { tipo, referencia, ciclo: [trabalho('07:00', '12:00', '13:00', '07:00'), diaVazio('folga'), diaVazio('folga')] };
    if (tipo === 'revezamento') return { tipo, referencia, ciclo: [
        ...Array.from({ length: 2 }, () => trabalho('06:00', '', '', '12:00')), ...Array.from({ length: 2 }, () => trabalho('12:00', '', '', '18:00')),
        ...Array.from({ length: 2 }, () => trabalho('18:00', '', '', '00:00')), diaVazio('folga'), diaVazio('folga')] };
    return { tipo, referencia, ciclo: [...Array.from({ length: 6 }, () => trabalho('08:00', '12:00', '13:00', '16:20')), diaVazio('folga')] };
}

/** O dia do ciclo numa data (antes da referência, o ciclo corre para trás). */
export function diaDaEscala(e: Escala, data: string): { indice: number; dia: DiaHorario } {
    const n = e.ciclo.length;
    const i = ((Math.round(diaUTC(data) - diaUTC(e.referencia)) % n) + n) % n;
    return { indice: i, dia: e.ciclo[i] };
}

export interface ResumoEscala { porDiaDoCiclo: CalculoDia[]; noCiclo: number; semanal: number; noturnoSemanal: number; diasTrabalho: number }

/** Horas no ciclo e a média semanal (horas do ciclo × 7 ÷ dias do ciclo), que vai ao S-2200 (qtdHrsSem). */
export function resumirEscala(e: Escala): ResumoEscala {
    const porDiaDoCiclo = e.ciclo.map(calcularDia);
    const n = Math.max(1, e.ciclo.length);
    const noCiclo = porDiaDoCiclo.reduce((s, c) => s + c.trabalhado, 0);
    const noturno = porDiaDoCiclo.reduce((s, c) => s + c.noturno, 0);
    return { porDiaDoCiclo, noCiclo, semanal: Math.round(noCiclo * 7 / n), noturnoSemanal: Math.round(noturno * 7 / n), diasTrabalho: e.ciclo.filter(d => d.tipo === 'trabalho').length };
}

export function validarEscala(e: Escala): ValidacaoHorario {
    const erros: string[] = []; const avisos: string[] = [];
    if (!DATA.test(e.referencia)) erros.push('Escala: informe a data de referência (o primeiro dia do ciclo).');
    if (e.ciclo.length < 2 || e.ciclo.length > 42) erros.push('Escala: o ciclo tem de 2 a 42 dias.');
    const r = resumirEscala(e);
    if (!r.diasTrabalho) erros.push('Escala: marque ao menos um dia de trabalho no ciclo.');
    r.porDiaDoCiclo.forEach((c, i) => { if (c.erro) erros.push(`Escala, dia ${i + 1} do ciclo: ${c.erro}.`); });
    if (erros.length) return { erros, avisos };
    const n = e.ciclo.length;
    if (e.tipo === '12x36') {
        avisos.push('12 x 36 só por acordo individual escrito, convenção ou acordo coletivo (CLT, art. 59-A); a remuneração mensal já abrange o DSR e os feriados (parágrafo único).');
        e.ciclo.forEach((d, i) => { if (d.tipo === 'trabalho') { const c = r.porDiaDoCiclo[i]; if (c.trabalhado + c.intervalo !== 12 * 60) avisos.push(`Escala, dia ${i + 1}: ${hhmm(c.trabalhado + c.intervalo)} da entrada à saída; a 12 x 36 tem 12 h seguidas.`); } });
        if (n !== 2 || e.ciclo[1].tipo === 'trabalho') avisos.push('A 12 x 36 é um ciclo de 2 dias: um de trabalho e um de folga.');
    } else {
        // Interjornada entre dias seguidos do ciclo (o último emenda no primeiro) e uma folga a cada 7 dias.
        for (let i = 0; i < n; i++) {
            const a = e.ciclo[i]; const b = e.ciclo[(i + 1) % n];
            if (a.tipo !== 'trabalho' || b.tipo !== 'trabalho') continue;
            const descanso = r.porDiaDoCiclo[(i + 1) % n].inicio + 1440 - r.porDiaDoCiclo[i].fim;
            if (descanso < 11 * 60) avisos.push(`Escala, do dia ${i + 1} para o ${(i + 1) % n + 1}: ${hhmm(Math.max(descanso, 0))} entre jornadas, menos de 11 h (CLT, art. 66).`);
        }
        for (let i = 0; i < n; i++) {
            const janela = Array.from({ length: 7 }, (_, k) => e.ciclo[(i + k) % n]);
            if (janela.every(d => d.tipo === 'trabalho')) { avisos.push('Escala com 7 dias seguidos de trabalho: falta o descanso semanal de 24 h (CLT, art. 67).'); break; }
        }
        r.porDiaDoCiclo.forEach((c, i) => { if (c.trabalhado > 10 * 60) avisos.push(`Escala, dia ${i + 1}: mais de 10 h no dia (CLT, arts. 58 e 59).`); });
    }
    if (e.tipo === 'revezamento' && r.porDiaDoCiclo.some(c => c.trabalhado > 6 * 60)) avisos.push('Turno ininterrupto de revezamento: jornada de 6 h, salvo negociação coletiva (CF, art. 7º, XIV).');
    if (r.semanal > 44 * 60) avisos.push(`Média semanal de ${hhmm(r.semanal)} acima de 44 h (CF, art. 7º, XIII).`);
    return { erros, avisos };
}

/** dscJorn do S-2200: o tipo, os dias do ciclo e a data de referência. */
export function descricaoEscala(e: Escala): string {
    const dias = e.ciclo.map((d, i) => `${i + 1}º ${textoDia(d)}`).join('; ');
    const ref = DATA.test(e.referencia) ? e.referencia.split('-').reverse().join('/') : '—';
    return `Escala ${ROTULO_ESCALA[e.tipo]}, ciclo de ${e.ciclo.length} dias a partir de ${ref}: ${dias}`.slice(0, 999);
}

/** Tipo de jornada do S-2200 (tpJornada) sugerido pelo horário. */
export function tpJornadaDoHorario(h: Horario): string {
    if (h.escala) return h.escala.tipo === '12x36' ? '2' : h.escala.tipo === 'revezamento' ? '7' : h.escala.tipo === 'ciclo' ? '3' : '9';
    const dsr = DIAS.filter(d => h.dias[d].tipo === 'dsr');
    return dsr.length === 1 ? (dsr[0] === 'dom' ? '4' : '5') : '9';
}

export interface MesDaEscala { dias: { data: string; indice: number; dia: DiaHorario; horas: number }[]; trabalhados: number; folgas: number; horas: number; noturno: number }

/** O mês pela escala: cada dia (trabalho ou folga), os dias trabalhados, as horas e as noturnas. */
export function mesDaEscala(e: Escala, competencia: string): MesDaEscala {
    const [a, m] = competencia.split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const r: MesDaEscala = { dias: [], trabalhados: 0, folgas: 0, horas: 0, noturno: 0 };
    for (let d = 1; d <= ultimo; d++) {
        const data = `${competencia}-${String(d).padStart(2, '0')}`;
        const x = diaDaEscala(e, data);
        const c = calcularDia(x.dia);
        r.dias.push({ data, indice: x.indice, dia: x.dia, horas: c.trabalhado });
        if (x.dia.tipo === 'trabalho') { r.trabalhados++; r.horas += c.trabalhado; r.noturno += c.noturno; } else r.folgas++;
    }
    return r;
}
