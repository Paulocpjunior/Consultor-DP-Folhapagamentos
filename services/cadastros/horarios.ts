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
}

export const DIAS: Dia[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
export const NOME_DIA: Record<Dia, string> = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };
export const ROTULO_TIPO: Record<TipoDia, string> = { trabalho: 'Trabalho', folga: 'Folga / compensado', dsr: 'DSR' };

const diaVazio = (tipo: TipoDia): DiaHorario => ({ tipo, entrada: '', saidaIntervalo: '', retornoIntervalo: '', saida: '' });

export function horarioVazio(empresaId: string): Horario {
    return {
        id: '', empresaId, codigo: '', descricao: '', observacoes: '',
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
