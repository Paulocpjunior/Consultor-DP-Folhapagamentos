// services/calculo/lancarEvento.ts
//
// "Lançar evento" no movimento do mês, como no Sage: digita-se o código do evento do IOB e a
// referência (horas, dias, % ou valor) e o Consultor calcula pelo cadastro do evento
// (rotina de cálculo, coeficiente, tipo e incidências). Eventos que o motor já conhece (horas
// extras, faltas, atrasos, DSR, pensão, adiantamento, vale-transporte, arredondamento) vão para o
// campo próprio do movimento, para entrar no DSR, nas médias e no IRRF como hoje; os demais viram
// lançamento avulso com as incidências do cadastro.

import { reais } from '../cadastros/documentos';
import type { EventoIobSage } from '../folha/folhaTypes';
import type { CampoNumerico } from './movimento';
import type { Lancamento, Movimento } from './motorMensal';

export interface SalarioDoMes { mensal: number; horasMes: number }
export type Lancado = { movimento: Movimento; mensagem: string } | { erro: string };

/** Como a referência é lida: horas (8:30), dias, percentual ou valor em R$. */
export type TipoReferencia = 'horas' | 'dias' | 'percentual' | 'valor';

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

const ROTINAS_HORAS = ['020', '120', '999'];

/** Percentual escrito na descrição (HORA EXTRA 60% → 60). */
const percentualDaDescricao = (descricao: string) => {
    const m = descricao.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/);
    return m ? Number(m[1].replace(',', '.')) : null;
};

/** Hora extra comum (HORA EXTRA 60%, HORAS EXTRAS 100%, HE 75%): vai para o campo de horas extras do movimento. */
const horaExtraSimples = (descricao: string) => /^(HORAS? EXTRAS?|HE) \d{1,3}(?:[.,]\d{1,2})? ?%$/.test(sem(descricao));

/** O que o motor calcula sozinho: não se lança. */
function calculadoPeloConsultor(ev: EventoIobSage): string | null {
    const d = sem(ev.descricao);
    if (ev.ro === '000') return 'o salário sai da ficha do funcionário (Cadastros › Funcionários)';
    if (['030', '240', '350'].includes(ev.ro) || /^(INSS|IRRF|I\.?R\.?R\.?F|FGTS|BASE)\b/.test(d)) return 'INSS, IRRF, FGTS e as bases saem do cálculo do Consultor';
    if (/^ARREDONDAMENTO ATU/.test(d)) return 'o arredondamento atual é calculado pelo Consultor (Parâmetros da folha)';
    if (/SALARIO.?FAMILIA/.test(d)) return 'o salário-família sai do cálculo do Consultor';
    return null;
}

/** Campo próprio do movimento para os eventos que o motor já trata. */
function campoDoMovimento(ev: EventoIobSage): CampoNumerico | 'pensao' | null {
    const d = sem(ev.descricao);
    if (ev.tipo !== 'D') return null;
    if (/^(FALTAS E ATRASOS|ATRASOS)( \(T\/H\))?$/.test(d) && ROTINAS_HORAS.includes(ev.ro)) return 'atrasosHoras';
    if (/^FALTAS( \(DIAS\))?$/.test(d) && ev.ro === '080') return 'faltasDias';
    if (/^(DESCONTO DSR|DSR SOBRE FALTAS|DSR S\/ ?FALTAS)$/.test(d) && ev.ro === '080') return 'dsrDescontadoDias';
    if (/^PENSAO ALIMENT/.test(d) && !/ S\/ ?/.test(d)) return 'pensao';
    if (/^ADIANTAMENTO( SALARIAL| \(VALE\))?$/.test(d)) return 'adiantamento';
    if (/^VALE.?TRANSPORTE$/.test(d)) return 'valeTransporte';
    if (/^ARREDONDAMENTO ANT/.test(d)) return 'arredondamentoAnterior';
    return null;
}

/** Como a referência do evento é lida (o rótulo do campo e o formato na tela). */
export function tipoDaReferencia(ev: EventoIobSage): TipoReferencia {
    const campo = campoDoMovimento(ev);
    if (campo === 'atrasosHoras') return 'horas';
    if (campo === 'faltasDias' || campo === 'dsrDescontadoDias') return 'dias';
    if (campo && !(campo === 'valeTransporte' && ev.rv === 'R' && ev.ro === '040')) return 'valor';
    if (ev.rv === 'V') return 'valor';
    if (ROTINAS_HORAS.includes(ev.ro)) return 'horas';
    if (ev.ro === '080') return 'dias';
    if (ev.ro === '040') return 'percentual';
    return 'valor';
}

/** Lê a referência digitada: horas em decimal ou hh:mm, dias e % em decimal, valor em R$ (1.234,56). */
export function lerReferencia(texto: string, tipo: TipoReferencia): number | null {
    const t = texto.trim();
    if (!t) return null;
    if (tipo === 'horas') {
        const m = t.match(/^(\d{1,3}):([0-5]\d)$/);
        if (m) return Number(m[1]) + Number(m[2]) / 60;
    }
    if (tipo === 'valor') {
        const limpo = t.replace(/^R\$\s*/, '');
        if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(limpo)) return null;
        // 1.234,56 e 1.234 (milhar) no padrão brasileiro; 45.9 com ponto decimal também vale.
        const n = Number(/,/.test(limpo) || /^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '').replace(',', '.') : limpo);
        return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
    }
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
}

const ROTULO_RO: Record<string, string> = { '010': 'especial', '020': 'horas', '030': 'base', '040': '% do salário', '060': 'normal', '080': 'dias', '120': 'hora extra 60 min', '140': '% do bruto', '160': 'gorjeta', '180': 'especial', '240': 'salário INSS', '350': 'dedução', '999': 'horas' };
const PARA_AVULSO = 'Lance o valor como lançamento avulso ou corrija o evento em Cadastros › Eventos IOB.';

/** O coeficiente do cadastro bate com o % da descrição? (ADICIONAL NOTURNO 20% com coeficiente 1 pagaria a hora inteira.) */
function coeficienteConfere(ev: EventoIobSage): string | null {
    const pct = percentualDaDescricao(ev.descricao);
    if (pct === null || !ev.coeficiente) return null;
    const ok = [pct / 100, 1 + pct / 100, ...(ev.ro === '040' ? [pct] : [])].some(c => Math.abs(c - ev.coeficiente) < 1e-6);
    return ok ? null : `Evento ${ev.codigo} (${ev.descricao}): o coeficiente do cadastro (${num(ev.coeficiente)}) não confere com o ${num(pct)}% da descrição. ${PARA_AVULSO}`;
}

/** Valor do evento pela rotina do IOB, em centavos, e a memória da conta. */
function valorPelaRotina(ev: EventoIobSage, ref: number, sal: SalarioDoMes | null): { valor: number; memoria: string } | { erro: string } {
    const tipo = tipoDaReferencia(ev);
    if (tipo === 'valor') {
        if (ev.rv === 'R' && !campoDoMovimento(ev) && !(ev.ro === '060' && ev.coeficiente === 1)) return { erro: `Evento ${ev.codigo} (${ev.descricao}): rotina ${ev.ro} (${ROTULO_RO[ev.ro] ?? 'sem descrição'}) não é calculada pelo Consultor. ${PARA_AVULSO}` };
        return { valor: Math.round(ref), memoria: `${reais(Math.round(ref))} informado` };
    }
    if (!sal) return { erro: 'Ficha sem salário: não há como calcular pela referência.' };
    const conf = coeficienteConfere(ev);
    if (conf) return { erro: conf };
    const c = ev.coeficiente;
    if (tipo === 'horas') {
        if (!c) return { erro: `Evento ${ev.codigo} (${ev.descricao}): coeficiente zero no cadastro. ${PARA_AVULSO}` };
        const hora = sal.mensal / sal.horasMes;
        return { valor: Math.round(hora * c * ref), memoria: `${num(ref)} h × ${reais(Math.round(hora))}/h (salário ÷ ${num(sal.horasMes)} h)${c === 1 ? '' : ` × ${num(c)}`}` };
    }
    if (tipo === 'dias') {
        if (!c) return { erro: `Evento ${ev.codigo} (${ev.descricao}): coeficiente zero no cadastro. ${PARA_AVULSO}` };
        const diaria = sal.mensal / 30;
        return { valor: Math.round(diaria * c * ref), memoria: `${num(ref)} dia(s) × ${reais(Math.round(diaria))} (salário ÷ 30)${c === 1 ? '' : ` × ${num(c)}`}` };
    }
    // % do salário: coeficiente 0 = a referência é o percentual; 0,4 = 40%; 10 = 10% (× a referência, como o quinquênio).
    const pct = !c ? ref : (c >= 1 ? c : c * 100) * ref;
    if (pct > 100) return { erro: `Evento ${ev.codigo} (${ev.descricao}): daria ${num(pct)}% do salário. Confira a referência (coeficiente ${num(c)} no cadastro).` };
    return { valor: Math.round(sal.mensal * pct / 100), memoria: `${num(pct)}% de ${reais(sal.mensal)}${c ? ` (${c >= 1 ? num(c) : num(c * 100)}%${ref === 1 ? '' : ` × ${num(ref)}`})` : ''}` };
}

/**
 * Lança o evento no movimento. Campos próprios são substituídos (como no Sage, o evento vale uma vez por mês);
 * o lançamento avulso do mesmo código também.
 */
export function lancarEvento(ev: EventoIobSage, ref: number, sal: SalarioDoMes | null, mov: Movimento): Lancado {
    const titulo = `${ev.codigo} ${ev.descricao}`;
    // O tipo do cadastro é V ou D, mas o catálogo extraído do PDF do IOB tem eventos com N (informativo) e S.
    const tipoNoCadastro: string = ev.tipo;
    if (tipoNoCadastro === 'N') return { erro: `Evento ${titulo}: é informativo (não é provento nem desconto) e não entra no holerite.` };
    if (ev.tipo !== 'V' && ev.tipo !== 'D') return { erro: `Evento ${titulo}: o tipo "${ev.tipo}" do cadastro não é vencimento (V) nem desconto (D). Corrija em Cadastros › Eventos IOB ou use lançamento avulso.` };
    const calc = calculadoPeloConsultor(ev);
    if (calc) return { erro: `Evento ${titulo}: ${calc}.` };
    if (!(ref > 0)) return { erro: 'Informe a referência (maior que zero).' };
    const tipo = tipoDaReferencia(ev);

    // Hora extra comum: o campo de horas extras (entra no DSR e nas médias de férias, 13º e rescisão).
    if (ev.tipo === 'V' && tipo === 'horas' && horaExtraSimples(ev.descricao)) {
        const pct = percentualDaDescricao(ev.descricao)!;
        if (ev.coeficiente && Math.abs(ev.coeficiente - (1 + pct / 100)) > 1e-6) return { erro: coeficienteConfere(ev) ?? `Evento ${titulo}: coeficiente ${num(ev.coeficiente)} não confere com ${num(pct)}%. ${PARA_AVULSO}` };
        if (ref > 300) return { erro: 'Horas extras: no máximo 300 horas.' };
        const h = Math.round(ref * 10000) / 10000;
        if (pct === 50 || pct === 100) {
            const k = pct === 50 ? 'horasExtras50' : 'horasExtras100';
            const antes = mov[k];
            return { movimento: { ...mov, [k]: h }, mensagem: `${titulo}: ${num(h)} h em "Horas extras ${pct}%"${antes ? ` (antes ${num(antes)} h)` : ''}.` };
        }
        const chave = String(pct);
        const antes = mov.horasExtrasPct?.[chave];
        return { movimento: { ...mov, horasExtrasPct: { ...mov.horasExtrasPct, [chave]: h } }, mensagem: `${titulo}: ${num(h)} h de hora extra ${num(pct)}%${antes ? ` (antes ${num(antes)} h)` : ''}.` };
    }

    const campo = campoDoMovimento(ev);
    if (campo === 'atrasosHoras' || campo === 'faltasDias' || campo === 'dsrDescontadoDias') {
        if (ev.rv === 'V') return { erro: `Evento ${titulo}: cadastrado por valor; o Consultor desconta pela quantidade. Use o campo do movimento ou lançamento avulso.` };
        const q = campo === 'atrasosHoras' ? Math.round(ref * 10000) / 10000 : Math.round(ref * 100) / 100;
        if (campo !== 'atrasosHoras' && q > 31) return { erro: 'No máximo 31 dias.' };
        const rotulo = { atrasosHoras: 'Faltas e atrasos (horas)', faltasDias: 'Faltas (dias)', dsrDescontadoDias: 'DSR descontado (dias)' }[campo];
        const antes = mov[campo];
        return { movimento: { ...mov, [campo]: q }, mensagem: `${titulo}: ${num(q)} em "${rotulo}"${antes ? ` (antes ${num(antes)})` : ''}.` };
    }
    if (campo) {
        // Pensão, adiantamento, vale-transporte e arredondamento anterior: valores do movimento.
        const v = valorPelaRotina(ev, ref, sal);
        if ('erro' in v) return v;
        if (campo === 'arredondamentoAnterior' && v.valor > 99) return { erro: 'Arredondamento anterior: no máximo R$ 0,99.' };
        const k = campo === 'pensao' ? 'pensaoAlimenticia' : campo;
        const rotulo = { pensaoAlimenticia: 'Pensão alimentícia', adiantamento: 'Adiantamento pago', valeTransporte: 'Vale-transporte', arredondamentoAnterior: 'Arredondamento anterior' }[k as 'adiantamento'];
        const antes = mov[k];
        return { movimento: { ...mov, [k]: v.valor }, mensagem: `${titulo}: ${reais(v.valor)} em "${rotulo}" (${v.memoria})${antes !== undefined ? `; antes ${reais(antes)}` : ''}.` };
    }

    const v = valorPelaRotina(ev, ref, sal);
    if ('erro' in v) return v;
    if (!(v.valor > 0)) return { erro: `Evento ${titulo}: o valor calculado é zero.` };
    const l: Lancamento = { descricao: titulo, tipo: ev.tipo === 'V' ? 'provento' : 'desconto', valor: v.valor, inss: ev.incidencias.in === 'S', fgts: ev.incidencias.fg === 'S', irrf: ev.incidencias.ir === 'S' };
    const lancs = mov.lancamentos ?? [];
    const i = lancs.findIndex(x => x.descricao.startsWith(`${ev.codigo} `));
    const inc = (['inss', 'fgts', 'irrf'] as const).filter(k => l[k]).map(k => k.toUpperCase()).join(', ') || 'sem incidências';
    return {
        movimento: { ...mov, lancamentos: i >= 0 ? lancs.map((x, j) => (j === i ? l : x)) : [...lancs, l] },
        mensagem: `${titulo}: ${l.tipo} de ${reais(v.valor)} (${v.memoria}; ${inc})${i >= 0 ? `; substituiu ${reais(lancs[i].valor)}` : ''}.`,
    };
}

/** Procura o evento pelo código (aceita 810 por 0810). */
export const eventoPorCodigo = (eventos: EventoIobSage[], codigo: string) => {
    const c = codigo.trim().replace(/\D/g, '');
    return c ? eventos.find(e => e.codigo === c.padStart(4, '0')) ?? null : null;
};
