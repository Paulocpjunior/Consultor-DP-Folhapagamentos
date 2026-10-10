// services/calculo/motorFerias.ts
//
// Férias (Processos › Férias › Cálculo do IOB), em prévia: o recibo de cada
// gozo lançado em Cadastros › Afastamentos com o motivo 15 (gozo de férias,
// como no S-2230). Regras da CLT:
// - período aquisitivo de 12 meses desde a admissão; concessivo nos 12
//   seguintes; dias gozados depois do concessivo saem em dobro (art. 137);
// - dias de direito pelas faltas injustificadas do período (art. 130):
//   até 5 → 30; 6–14 → 24; 15–23 → 18; 24–32 → 12; mais de 32 → nenhum;
// - perde o direito quem ficou mais de 6 meses com benefício do INSS ou mais
//   de 30 dias de licença remunerada no período (art. 133);
// - remuneração = salário do gozo + média das horas extras do período
//   aquisitivo (art. 142, § 5º); 1/3 constitucional; abono pecuniário de até
//   1/3 dos dias de direito (art. 143), com o seu 1/3, sem INSS, FGTS e IRRF;
// - pagamento até 2 dias antes do início (art. 145).
// INSS: sobre férias + 1/3 de cada competência do gozo, pela tabela daquela
// competência (a folha do mês ajusta com o salário). IRRF: em separado, pela
// tabela do mês do pagamento; desconto simplificado e redutor como opções.
// A dobra não entra no INSS nem no FGTS (Lei 8.212, art. 28, § 9º, "d").

import { fichaNaData, memoriaDoHistorico, type FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { inicioBeneficio } from '../cadastros/afastamentos';
import { dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { aniversario, diaUtilAnterior, diasEntre, somarDias, somarMeses } from '../prazos/calendario';
import { diasDsr, salarioContratual, valorHorasExtras, type Movimento, type ResultadoCalculo, type Verba } from './motorMensal';

export interface OpcoesFerias { simplificado: boolean; redutor: boolean }
export const OPCOES_FERIAS_PADRAO: OpcoesFerias = { simplificado: true, redutor: true };

export interface EntradaFerias {
    ficha: FichaFuncionario;
    /** O gozo (afastamento de motivo 15) a calcular. */
    gozo: Afastamento;
    /** Todos os afastamentos da ficha (para INSS no período e outros gozos). */
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    /** Movimentos gravados da ficha, por competência (médias e faltas). */
    movimentos: Record<string, Movimento>;
    abonoDias?: number;
    /** Mês do pagamento (AAAA-MM). Padrão: o mês de 2 dias antes do início. */
    pagamento?: string;
    opcoes?: OpcoesFerias;
}

export interface CompetenciaFerias { competencia: string; dias: number; ferias: number; terco: number; inss: number; fgts: number }
export interface ResultadoFerias extends ResultadoCalculo {
    gozoId: string;
    periodo: { inicio: string; fim: string; fimConcessivo: string } | null;
    direito: number; saldo: number; diasGozo: number; diasDobra: number; abonoDias: number;
    pagarAte: string;
    porCompetencia: CompetenciaFerias[];
    /** IRRF das férias, sempre informado (também quando não há retenção). */
    irrf: InfoIrrfFerias | null;
}

export interface InfoIrrfFerias {
    tributavel: number; deducoes: number; usouSimplificado: boolean; dependentes: number;
    base: number; aliquota: number; parcelaDeduzir: number;
    /** Imposto pela tabela, antes do redutor e da dispensa. */
    calculado: number; redutor: number; dispensado: number; devido: number;
    /** Por que não há retenção (vazio quando há). */
    semRetencao: string;
}

const ALIQUOTA_FGTS = 8;
const ALIQUOTA_FGTS_APRENDIZ = 2;
const IRRF_MINIMO = 1000;
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const br = (d: string) => d.split('-').reverse().join('/');

/** Dias de férias pelas faltas injustificadas do período aquisitivo (CLT, art. 130). */
export function diasDeDireito(faltas: number): number {
    return faltas <= 5 ? 30 : faltas <= 14 ? 24 : faltas <= 23 ? 18 : faltas <= 32 ? 12 : 0;
}

/** Competências (AAAA-MM) que o período toca: 12, ou 13 quando começa depois do dia 1º (o mês do fim é parcial). */
export function mesesDoPeriodo(inicio: string, fim: string): string[] {
    const out: string[] = [];
    for (let c = inicio.slice(0, 7); c <= fim.slice(0, 7); c = somarMeses(`${c}-01`, 1).slice(0, 7)) out.push(c);
    return out;
}

/** Afastamentos que suspendem o contrato e adiam o fim do período aquisitivo. */
const SUSPENSAO = ['21', '29', '44', '45'];

/** Dias do intervalo [de, ate] que caem em [ini, fim]. */
const intersecao = (de: string, ate: string, ini: string, fim: string) => { const a = de > ini ? de : ini; const b = ate < fim ? ate : fim; return a > b ? 0 : diasEntre(a, b) + 1; };

const diasDoGozo = (a: Afastamento) => (a.dtFim && dataValida(a.dtFim) ? diasEntre(a.dtInicio, a.dtFim) + 1 : 0);
export const abonoDoGozo = (a: Afastamento) => { const n = Number(a.abonoDias || 0); return Number.isInteger(n) && n > 0 ? n : 0; };

export interface PeriodoAquisitivo {
    inicio: string; fim: string; fimConcessivo: string;
    /** Motivo da perda do direito (art. 133), ou ''. */
    perdido: string;
    /** Dias de contrato suspenso no período: o fim foi adiado por eles. */
    suspensos?: number;
    faltas: number; direito: number;
    /** Dias já usados: gozos anteriores + abonos vendidos. */
    consumido: number;
}

/**
 * Períodos aquisitivos desde a admissão até `ate`. Com perda do direito
 * (art. 133: mais de 6 meses de INSS ou mais de 30 dias de licença
 * remunerada), o período fica perdido e o próximo começa na volta ao
 * trabalho (§ 2º). Os gozos informados entram no período deles (pelo início
 * informado) ou no mais antigo com saldo.
 */
export function periodosAquisitivos(admissao: string, ate: string, fichaId: string, afastamentos: Afastamento[], movimentos: Record<string, Movimento>, gozosAnteriores: Afastamento[]): PeriodoAquisitivo[] {
    const ps: PeriodoAquisitivo[] = [];
    let inicio = admissao;
    const daFicha = (a: Afastamento) => !a.fichaId || a.fichaId === fichaId;
    for (let guarda = 0; inicio <= ate && guarda < 100; guarda++) {
        // Contrato suspenso (licença não remunerada, serviço militar, suspensões dos motivos 44 e 45) não conta no período
        // aquisitivo: o fim é adiado pelos dias suspensos (o adiamento pode alcançar outra suspensão; refaz até parar).
        let fim = somarDias(aniversario(inicio, 1), -1); let suspensos = 0;
        for (let k = 0; k < 10; k++) {
            const n = afastamentos.filter(a => daFicha(a) && SUSPENSAO.includes(a.motivo))
                .reduce((t, a) => t + intersecao(a.dtInicio, a.dtFim && dataValida(a.dtFim) ? a.dtFim : ate, inicio, fim), 0);
            if (n === suspensos) break;
            suspensos = n; fim = somarDias(somarDias(aniversario(inicio, 1), -1), n);
        }
        const fimConcessivo = somarDias(aniversario(somarDias(fim, 1), 1), -1);
        let diasInss = 0; let diasLicenca = 0; let fimInss = ''; let fimLicenca = ''; let semFimInss = false; let semFimLicenca = false;
        for (const a of afastamentos) {
            if (a.fichaId && a.fichaId !== fichaId) continue;
            const aberto = !a.dtFim || !dataValida(a.dtFim);
            const fimA = aberto ? fim : a.dtFim;
            if (['01', '03'].includes(a.motivo)) {
                const desde = a.infoMesmoMtv === 'S' ? a.dtInicio : inicioBeneficio(a);
                const n = desde ? intersecao(desde, fimA, inicio, fim) : 0;
                if (n) { diasInss += n; if (aberto) semFimInss = true; else if (a.dtFim > fimInss) fimInss = a.dtFim; }
            }
            if (a.motivo === '16') {
                const n = intersecao(a.dtInicio, fimA, inicio, fim);
                if (n) { diasLicenca += n; if (aberto) semFimLicenca = true; else if (a.dtFim > fimLicenca) fimLicenca = a.dtFim; }
            }
        }
        const perdaInss = diasInss > 180; const perdaLicenca = !perdaInss && diasLicenca > 30;
        if (perdaInss || perdaLicenca) {
            ps.push({ inicio, fim, fimConcessivo, faltas: 0, direito: 0, consumido: 0,
                perdido: perdaInss ? `${diasInss} dias com benefício do INSS (CLT, art. 133, IV)` : `${diasLicenca} dias de licença remunerada (CLT, art. 133, II)` });
            if (perdaInss ? semFimInss : semFimLicenca) break; // ainda afastado: o novo período começa na volta
            inicio = somarDias(perdaInss ? fimInss : fimLicenca, 1);
            continue;
        }
        // Suspensão disciplinar (motivo 30) conta como falta injustificada (art. 130).
        const disciplinar = afastamentos.filter(a => daFicha(a) && a.motivo === '30').reduce((t, a) => t + intersecao(a.dtInicio, a.dtFim && dataValida(a.dtFim) ? a.dtFim : ate, inicio, fim), 0);
        const faltas = mesesDoPeriodo(inicio, fim).reduce((s, c) => s + Math.floor(movimentos[c]?.faltasDias ?? 0), 0) + disciplinar;
        ps.push({ inicio, fim, fimConcessivo, perdido: '', faltas, direito: diasDeDireito(faltas), consumido: 0, ...(suspensos ? { suspensos } : {}) });
        inicio = somarDias(fim, 1);
    }
    for (const g of [...gozosAnteriores].sort((a, b) => a.dtInicio.localeCompare(b.dtInicio))) {
        const p = (g.perAquisInicio && ps.find(x => x.inicio === g.perAquisInicio)) || ps.find(x => !x.perdido && x.fim < g.dtInicio && x.consumido < x.direito);
        if (p) p.consumido += diasDoGozo(g) + abonoDoGozo(g);
    }
    return ps;
}

function inssDaTabela(base: number, t: TabelaLegal): { valor: number; partes: string[] } {
    const teto = t.faixas[t.faixas.length - 1]?.ate ?? base;
    const b = Math.min(base, teto);
    let piso = 0; let total = 0; const partes: string[] = [];
    for (const f of t.faixas) {
        if (f.ate === null) break;
        const parte = Math.min(b, f.ate) - piso;
        if (parte <= 0) break;
        total += parte * f.aliquota / 100; partes.push(`${reais(parte)} × ${pct(f.aliquota)}`); piso = f.ate;
    }
    return { valor: Math.round(total), partes };
}

export function calcularFerias(e: EntradaFerias): ResultadoFerias {
    const { gozo } = e;
    // Remuneração das férias pelo salário da concessão (CLT, art. 142): o do início do gozo, pelo histórico.
    const naConcessao = fichaNaData(e.ficha, gozo.dtInicio);
    const ficha = naConcessao.ficha;
    const d = ficha.dados;
    const opcoes = e.opcoes ?? OPCOES_FERIAS_PADRAO;
    const pagarAte = dataValida(gozo.dtInicio) ? somarDias(gozo.dtInicio, -2) : '';
    // Mês do pagamento: o do dia útil até 2 dias antes (fim de semana no início do mês volta ao mês anterior), como no arquivo bancário e no S-1210.
    const pagamento = e.pagamento || (pagarAte ? diaUtilAnterior(pagarAte).slice(0, 7) : '');
    const r: ResultadoFerias = {
        fichaId: ficha.id, nome: d.nome || ficha.cpf, competencia: gozo.dtInicio.slice(0, 7), pagamento, situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [],
        gozoId: gozo.id, periodo: null, direito: 0, saldo: 0, diasGozo: 0, diasDobra: 0, abonoDias: e.abonoDias ?? 0, pagarAte, porCompetencia: [], irrf: null,
    };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; return r; };
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };

    if (gozo.motivo !== '15') return erro('O afastamento não é de férias (motivo 15).');
    if (!dataValida(gozo.dtInicio) || !gozo.dtFim || !dataValida(gozo.dtFim) || gozo.dtFim < gozo.dtInicio) return erro('Informe o início e o término das férias no afastamento.');
    if (!d.admissao || !dataValida(d.admissao)) return erro('Ficha sem data de admissão válida.');
    const categoria = d.categoria || '';
    if (categoria && !/^1\d\d$/.test(categoria)) return erro(`Categoria ${categoria}: esta versão só calcula empregados (categorias 1xx).`);
    const aprendiz = categoria === '103';
    const diasGozo = diasEntre(gozo.dtInicio, gozo.dtFim) + 1;
    r.diasGozo = diasGozo;
    if (diasGozo < 5) r.avisos.push('Período de férias com menos de 5 dias (CLT, art. 134, § 1º).');

    // Período aquisitivo: o informado no afastamento, ou o mais antigo com saldo antes do gozo.
    const outros = e.afastamentos.filter(a => a.motivo === '15' && a.id !== gozo.id && a.dtInicio < gozo.dtInicio);
    const periodos = periodosAquisitivos(d.admissao, gozo.dtInicio, ficha.id, e.afastamentos, e.movimentos, outros);
    const informado = gozo.perAquisInicio ? periodos.find(x => x.inicio === gozo.perAquisInicio) : undefined;
    if (informado?.perdido) return erro(`Período ${br(informado.inicio)} a ${br(informado.fim)} perdido: ${informado.perdido}. O novo período começa na volta ao trabalho.`);
    if (gozo.perAquisInicio && !informado) r.avisos.push(`O período aquisitivo informado no afastamento (início ${br(gozo.perAquisInicio)}) não bate com os períodos calculados desde a admissão; usado o mais antigo com saldo.`);
    const p = informado || periodos.find(x => !x.perdido && x.fim < gozo.dtInicio && x.consumido < x.direito) || null;
    const perdidos = periodos.filter(x => x.perdido);
    if (!p) {
        const ultimo = periodos[periodos.length - 1];
        return erro(`Nenhum período aquisitivo completo com saldo antes do início.${perdidos.length ? ` Período perdido: ${perdidos.map(x => `${br(x.inicio)} a ${br(x.fim)} (${x.perdido})`).join('; ')}.` : ''}${ultimo && !ultimo.perdido ? ` O período atual (${br(ultimo.inicio)} a ${br(ultimo.fim)}) ainda não completou.` : ''} Férias antecipadas ou coletivas ainda não estão no motor.`);
    }
    if (!gozo.perAquisInicio) r.avisos.push(`Período aquisitivo não informado no afastamento: usado o mais antigo com saldo (${br(p.inicio)} a ${br(p.fim)}). Se as férias anteriores não estão lançadas em Afastamentos, informe o período aquisitivo no afastamento.`);
    for (const x of perdidos) r.memoria.push(`Período ${br(x.inicio)} a ${br(x.fim)} perdido: ${x.perdido}; o seguinte começa na volta.`);
    r.periodo = { inicio: p.inicio, fim: p.fim, fimConcessivo: p.fimConcessivo };
    if (p.suspensos) r.memoria.push(`Período aquisitivo adiado em ${p.suspensos} dia(s) de contrato suspenso (licença não remunerada, serviço militar ou suspensão).`);
    r.memoria.push(`Período aquisitivo ${br(p.inicio)} a ${br(p.fim)}; concessivo até ${br(p.fimConcessivo)}. Gozo de ${br(gozo.dtInicio)} a ${br(gozo.dtFim)} (${diasGozo} dias); pagamento até ${br(pagarAte)}.`);

    // Direito pelas faltas do período (movimentos gravados) e saldo (gozos e abonos anteriores).
    const meses = mesesDoPeriodo(p.inicio, p.fim);
    r.direito = p.direito;
    r.memoria.push(`Faltas no período (movimentos de ${rotuloCompetencia(meses[0])} a ${rotuloCompetencia(meses[meses.length - 1])}): ${p.faltas} → ${r.direito} dias de direito (CLT, art. 130).`);
    if (meses.length > 12) r.avisos.push('O período começa no meio do mês: as faltas e horas extras do primeiro e do último mês entram inteiras (o movimento é mensal).');
    if (!r.direito) return erro(`${p.faltas} faltas no período aquisitivo: sem direito a férias (CLT, art. 130).`);
    const jaUsados = p.consumido;
    const abono = Math.max(0, Math.floor(e.abonoDias ?? abonoDoGozo(gozo)));
    r.abonoDias = abono;
    if (abono > Math.floor(r.direito / 3)) return erro(`Abono de ${abono} dias: o máximo é 1/3 dos dias de direito (${Math.floor(r.direito / 3)}).`);
    r.saldo = r.direito - jaUsados;
    if (diasGozo + abono > r.saldo) return erro(`Gozo de ${diasGozo} dias${abono ? ` + abono de ${abono}` : ''} passa do saldo do período (${r.saldo} de ${r.direito} dias${jaUsados ? `; ${jaUsados} já usados em gozos e abonos anteriores` : ''}).`);
    if (jaUsados) r.memoria.push(`Saldo do período: ${r.direito} − ${jaUsados} já usados (gozos e abonos anteriores) = ${r.saldo} dias.`);

    // Remuneração: salário da concessão + média das horas extras do período aquisitivo (÷ 12).
    const sc = salarioContratual(d);
    r.avisos.push(...sc.avisos);
    if ('erro' in sc) return erro(sc.erro);
    r.memoria.push(sc.memoria);
    if (naConcessao.faixa) r.memoria.push(memoriaDoHistorico(naConcessao.faixa, `no início das férias (${br(gozo.dtInicio)})`, !!naConcessao.antesDoHistorico));
    if (naConcessao.antesDoHistorico) r.avisos.push('Data anterior ao histórico de salário da ficha: usado o salário mais antigo conhecido; confira.');
    const salarioHora = sc.mensal / sc.horasMes;
    let somaVar = 0; let comMov = 0;
    for (const c of meses) {
        const mov = e.movimentos[c]; if (!mov) continue;
        comMov++;
        const he = valorHorasExtras(salarioHora, mov).valor;
        if (!he) continue;
        const { uteis, descanso } = diasDsr(c, mov.feriadosLocais);
        somaVar += he + Math.round(he / uteis * descanso);
    }
    const media = Math.round(somaVar / 12);
    if (media) r.memoria.push(`Média de horas extras com DSR no período: ${reais(somaVar)} ÷ 12 = ${reais(media)} (hora atual ${reais(Math.round(salarioHora))}).`);
    r.avisos.push(`Média pelos movimentos gravados no Consultor (${comMov} de 12 meses do período com movimento); comissões e adicionais ainda não entram.`);
    const remuneracao = sc.mensal + media;
    const diaria = remuneracao / 30;

    // Dias por competência e dias em dobro (depois do fim do concessivo).
    const porMes = new Map<string, number>();
    for (let x = gozo.dtInicio; x <= gozo.dtFim; x = somarDias(x, 1)) porMes.set(x.slice(0, 7), (porMes.get(x.slice(0, 7)) ?? 0) + 1);
    r.diasDobra = gozo.dtFim > p.fimConcessivo ? intersecao(gozo.dtInicio, gozo.dtFim, somarDias(p.fimConcessivo, 1), gozo.dtFim) : 0;

    const ferias = Math.round(diaria * diasGozo);
    const terco = Math.round(ferias / 3);
    r.memoria.push(`Férias: (${reais(sc.mensal)}${media ? ` + ${reais(media)}` : ''}) ÷ 30 × ${diasGozo} = ${reais(ferias)}; 1/3 constitucional ${reais(terco)}.`);
    verba({ codigo: 'FER', descricao: 'Férias', referencia: `${diasGozo} dias`, tipo: 'provento', valor: ferias, inss: true, fgts: true, irrf: true });
    verba({ codigo: 'FER13', descricao: '1/3 constitucional de férias', referencia: '', tipo: 'provento', valor: terco, inss: true, fgts: true, irrf: true });
    if (r.diasDobra) {
        const dobra = Math.round(diaria * r.diasDobra); const dobraTerco = Math.round(dobra / 3);
        verba({ codigo: 'FERDOB', descricao: 'Dobra de férias (art. 137)', referencia: `${r.diasDobra} dias`, tipo: 'provento', valor: dobra, inss: false, fgts: false, irrf: true });
        verba({ codigo: 'FERDOB13', descricao: '1/3 sobre a dobra de férias', referencia: '', tipo: 'provento', valor: dobraTerco, inss: false, fgts: false, irrf: true });
        r.memoria.push(`${r.diasDobra} dia(s) depois do fim do concessivo (${br(p.fimConcessivo)}): dobra ${reais(dobra)} + 1/3 ${reais(dobraTerco)}, sem INSS e FGTS.`);
        r.avisos.push('Férias fora do período concessivo: pagamento em dobro dos dias excedentes (CLT, art. 137).');
    }
    if (abono) {
        const v = Math.round(diaria * abono); const vt = Math.round(v / 3);
        verba({ codigo: 'ABONO', descricao: 'Abono pecuniário', referencia: `${abono} dias`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
        verba({ codigo: 'ABONO13', descricao: '1/3 sobre o abono pecuniário', referencia: '', tipo: 'provento', valor: vt, inss: false, fgts: false, irrf: false });
        r.memoria.push(`Abono pecuniário: ${abono} dias = ${reais(v)} + 1/3 ${reais(vt)}; sem INSS, FGTS e IRRF.`);
    }

    // INSS e FGTS por competência do gozo.
    let inssTotal = 0; let distribuido = 0; let terDistrib = 0;
    const comps = [...porMes.entries()];
    comps.forEach(([c, dias], i) => {
        const ultimo = i === comps.length - 1;
        const fm = ultimo ? ferias - distribuido : Math.round(ferias * dias / diasGozo);
        const tm = ultimo ? terco - terDistrib : Math.round(terco * dias / diasGozo);
        distribuido += fm; terDistrib += tm;
        const t = tabelaVigente(e.tabelas, 'inss', c);
        let inss = 0;
        if ('erro' in t) erro(t.erro);
        else { const x = inssDaTabela(fm + tm, t.tabela); inss = x.valor; r.memoria.push(`INSS de ${rotuloCompetencia(c)} (${dias} dias): ${reais(fm + tm)} → ${x.partes.join(' + ')} = ${reais(inss)}.`); }
        inssTotal += inss;
        r.porCompetencia.push({ competencia: c, dias, ferias: fm, terco: tm, inss, fgts: Math.round((fm + tm) * (aprendiz ? ALIQUOTA_FGTS_APRENDIZ : ALIQUOTA_FGTS) / 100) });
    });
    if (comps.length > 1) r.avisos.push('Férias em duas competências: o INSS de cada uma é ajustado com o salário na folha do mês.');
    verba({ codigo: 'INSSFER', descricao: 'INSS sobre férias', referencia: '', tipo: 'desconto', valor: inssTotal, inss: false, fgts: false, irrf: false });
    r.bases.inss = ferias + terco;
    r.bases.fgts = ferias + terco;
    r.fgts = r.porCompetencia.reduce((s, x) => s + x.fgts, 0);

    // IRRF em separado, tabela do mês do pagamento.
    const tributavel = r.verbas.filter(v => v.irrf && v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.bases.irrf = tributavel;
    const tIr = tabelaVigente(e.tabelas, 'irrf', pagamento);
    if ('erro' in tIr) erro(`IRRF: ${tIr.erro}`);
    else {
        const t = tIr.tabela;
        const nDep = ficha.dependentes.filter(x => x.irrf === 'S' && x.pensao !== 'S').length; // quem recebe pensão deduz só por ela (Lei 9.250/1995, art. 35, § 4º)
        const legais = inssTotal + nDep * (t.valores.deducaoDependente ?? 0);
        const simpl = opcoes.simplificado ? t.valores.descontoSimplificado ?? 0 : 0;
        const usaSimpl = simpl > legais;
        const base = Math.max(0, tributavel - (usaSimpl ? simpl : legais));
        const faixa = t.faixas.find(f => f.ate === null || base <= f.ate) ?? t.faixas[t.faixas.length - 1];
        const calculado = Math.max(0, Math.round(base * faixa.aliquota / 100) - faixa.deducao);
        let ir = calculado; let red = 0; let dispensado = 0;
        r.memoria.push(`IRRF das férias (em separado, tabela de ${rotuloCompetencia(t.vigencia)}): ${reais(tributavel)} − ${usaSimpl ? `desconto simplificado ${reais(simpl)}` : `INSS ${reais(inssTotal)}${nDep ? ` e ${nDep} dependente(s)` : ''}`} = base ${reais(base)} × ${pct(faixa.aliquota)} − ${reais(faixa.deducao)} = ${reais(ir)}.`);
        r.avisos.push(`IRRF das férias ${opcoes.simplificado ? 'COM' : 'SEM'} desconto simplificado e ${opcoes.redutor ? 'COM' : 'SEM'} o redutor de 2026: confirme na conferência com o IOB.`);
        const v = t.valores;
        if (opcoes.redutor && ir > 0 && v.redutorAte && v.redutorMaximo && v.redutorLimite && v.redutorConstante && v.redutorCoeficiente) {
            if (tributavel <= v.redutorAte) red = Math.min(ir, v.redutorMaximo);
            else if (tributavel <= v.redutorLimite) red = Math.min(ir, Math.max(0, v.redutorConstante - Math.round(tributavel * v.redutorCoeficiente / 1_000_000)));
            if (red) { ir -= red; r.memoria.push(`Redutor sobre ${reais(tributavel)}: −${reais(red)}. IRRF ${reais(ir)}.`); }
        }
        if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada.`); dispensado = ir; ir = 0; }
        const semRetencao = ir > 0 ? ''
            : !calculado ? `base de ${reais(base)} na faixa isenta da tabela${faixa.ate !== null ? ` (até ${reais(faixa.ate)})` : ''}`
            : red && !dispensado ? `imposto de ${reais(calculado)} zerado pelo redutor de 2026 (Lei 15.270/2025)`
            : `imposto de ${reais(dispensado)} abaixo do mínimo de retenção (R$ 10,00)`;
        r.irrf = { tributavel, deducoes: usaSimpl ? simpl : legais, usouSimplificado: usaSimpl, dependentes: nDep, base, aliquota: faixa.aliquota, parcelaDeduzir: faixa.deducao,
            calculado, redutor: red, dispensado, devido: ir, semRetencao };
        if (semRetencao) r.avisos.push(`IRRF sobre férias sem retenção: ${semRetencao}. Rendimento tributável de ${reais(tributavel)} informado no recibo.`);
        verba({ codigo: 'IRRFFER', descricao: 'IRRF sobre férias', referencia: faixa.aliquota ? pct(faixa.aliquota) : '', tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
    }

    r.memoria.push(`FGTS: ${r.porCompetencia.map(x => `${rotuloCompetencia(x.competencia)} ${reais(x.fgts)}`).join('; ')} (recolhido com a folha de cada mês).`);
    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    r.memoria.push(`Remuneração usada: ${reais(remuneracao)}; diária ${reais(Math.round(diaria))} (${num(sc.horasMes)} h/mês).`);
    return r;
}

/** Gozos de férias (motivo 15) que começam na competência, das fichas da empresa. */
export function gozosNoMes(afastamentos: Afastamento[], fichaIds: Set<string>, competencia: string): Afastamento[] {
    return afastamentos.filter(a => a.motivo === '15' && fichaIds.has(a.fichaId) && a.dtInicio.slice(0, 7) === competencia)
        .sort((a, b) => a.dtInicio.localeCompare(b.dtInicio));
}

/**
 * Férias da competência para a folha do mês: soma a parte da competência de
 * cada recibo cujo gozo toca o mês. Se algum recibo der erro, devolve
 * undefined (a folha fica "incompleto" e aponta o recibo).
 */
export interface ParteDaCompetencia { dias: number; ferias: number; terco: number; inss: number; irrf: number }

/**
 * Parte de um recibo de férias numa competência do gozo: dias, férias, 1/3 e
 * INSS da competência, e o IRRF do recibo (em separado) na proporção de
 * férias + 1/3. É o que a folha do mês soma e abate (FERMES, FERPAGO…).
 */
export function parteDaCompetencia(r: ResultadoFerias, competencia: string): ParteDaCompetencia | undefined {
    const c = r.porCompetencia.find(x => x.competencia === competencia);
    if (!c) return undefined;
    const irrf = r.verbas.find(v => v.codigo === 'IRRFFER')?.valor ?? 0;
    const total = r.porCompetencia.reduce((s, x) => s + x.ferias + x.terco, 0);
    return { dias: c.dias, ferias: c.ferias, terco: c.terco, inss: c.inss, irrf: irrf && total ? Math.round(irrf * (c.ferias + c.terco) / total) : 0 };
}

/** `opcoes`: as mesmas do recibo entregue (desconto simplificado, redutor), para a folha abater o que ele de fato reteve. */
export function feriasDaCompetencia(ficha: FichaFuncionario, afastamentos: Afastamento[], tabelas: TabelaLegal[], movimentos: Record<string, Movimento>, competencia: string, opcoes?: OpcoesFerias): ParteDaCompetencia | undefined {
    const ini = `${competencia}-01`;
    const gozos = afastamentos.filter(a => a.fichaId === ficha.id && a.motivo === '15' && a.dtInicio.slice(0, 7) <= competencia && (!a.dtFim || a.dtFim >= ini));
    if (!gozos.length) return undefined;
    const soma = { dias: 0, ferias: 0, terco: 0, inss: 0, irrf: 0 };
    for (const gozo of gozos) {
        const r = calcularFerias({ ficha, gozo, afastamentos, tabelas, movimentos, opcoes });
        if (r.situacao === 'erro') return undefined;
        const c = parteDaCompetencia(r, competencia);
        if (!c) continue;
        soma.dias += c.dias; soma.ferias += c.ferias; soma.terco += c.terco; soma.inss += c.inss; soma.irrf += c.irrf;
    }
    return soma;
}
