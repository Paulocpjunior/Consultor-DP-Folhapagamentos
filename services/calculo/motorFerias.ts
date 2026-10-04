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

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { inicioBeneficio } from '../cadastros/afastamentos';
import { dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { diasEntre, somarDias, somarMeses } from '../prazos/calendario';
import { periodosFerias } from '../prazos/prazosFuncionarios';
import { diasDsr, salarioContratual, type Movimento, type ResultadoCalculo, type Verba } from './motorMensal';

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

/** Competências (AAAA-MM) dos 12 meses do período aquisitivo. */
const mesesDoPeriodo = (inicio: string) => Array.from({ length: 12 }, (_, i) => somarMeses(`${inicio.slice(0, 7)}-01`, i).slice(0, 7));

/** Dias do intervalo [de, ate] que caem em [ini, fim]. */
const intersecao = (de: string, ate: string, ini: string, fim: string) => { const a = de > ini ? de : ini; const b = ate < fim ? ate : fim; return a > b ? 0 : diasEntre(a, b) + 1; };

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
    const { ficha, gozo } = e;
    const d = ficha.dados;
    const opcoes = e.opcoes ?? OPCOES_FERIAS_PADRAO;
    const pagarAte = dataValida(gozo.dtInicio) ? somarDias(gozo.dtInicio, -2) : '';
    const pagamento = e.pagamento || pagarAte.slice(0, 7);
    const r: ResultadoFerias = {
        fichaId: ficha.id, nome: d.nome || ficha.cpf, competencia: gozo.dtInicio.slice(0, 7), pagamento, situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [],
        gozoId: gozo.id, periodo: null, direito: 0, saldo: 0, diasGozo: 0, diasDobra: 0, abonoDias: e.abonoDias ?? 0, pagarAte, porCompetencia: [],
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

    // Período aquisitivo: o informado no afastamento, ou o mais antigo em aberto antes do gozo.
    const outros = e.afastamentos.filter(a => a.motivo === '15' && a.id !== gozo.id && a.dtInicio < gozo.dtInicio);
    const periodos = periodosFerias(d.admissao, gozo.dtInicio, outros);
    const p = (gozo.perAquisInicio && periodos.find(x => x.inicio === gozo.perAquisInicio)) || periodos.find(x => x.fim < gozo.dtInicio && !x.completo) || null;
    if (!p) return erro('Nenhum período aquisitivo completo antes do início: férias antes de 12 meses de trabalho (antecipação ou férias coletivas) ainda não estão no motor.');
    if (!gozo.perAquisInicio) r.avisos.push(`Período aquisitivo não informado no afastamento: usado o mais antigo em aberto (${br(p.inicio)} a ${br(p.fim)}). Se as férias anteriores não estão lançadas em Afastamentos, informe o período aquisitivo no afastamento.`);
    r.periodo = { inicio: p.inicio, fim: p.fim, fimConcessivo: p.fimConcessivo };
    r.memoria.push(`Período aquisitivo ${br(p.inicio)} a ${br(p.fim)}; concessivo até ${br(p.fimConcessivo)}. Gozo de ${br(gozo.dtInicio)} a ${br(gozo.dtFim)} (${diasGozo} dias); pagamento até ${br(pagarAte)}.`);

    // Perda do direito (art. 133): INSS por mais de 6 meses ou licença remunerada por mais de 30 dias.
    let diasInss = 0; let diasLicenca = 0;
    for (const a of e.afastamentos) {
        if (a.fichaId && a.fichaId !== ficha.id) continue;
        const fimA = a.dtFim && dataValida(a.dtFim) ? a.dtFim : p.fim;
        if (['01', '03'].includes(a.motivo)) { const desde = a.infoMesmoMtv === 'S' ? a.dtInicio : inicioBeneficio(a); if (desde) diasInss += intersecao(desde, fimA, p.inicio, p.fim); }
        if (a.motivo === '16') diasLicenca += intersecao(a.dtInicio, fimA, p.inicio, p.fim);
    }
    if (diasInss > 180) return erro(`Perdeu o direito a estas férias: ${diasInss} dias com benefício do INSS no período aquisitivo (CLT, art. 133, IV). Um novo período começa na volta.`);
    if (diasLicenca > 30) return erro(`Perdeu o direito a estas férias: ${diasLicenca} dias de licença remunerada no período aquisitivo (CLT, art. 133, II).`);

    // Direito pelas faltas do período (movimentos gravados) e saldo.
    const meses = mesesDoPeriodo(p.inicio);
    const faltas = meses.reduce((s, c) => s + Math.floor(e.movimentos[c]?.faltasDias ?? 0), 0);
    r.direito = diasDeDireito(faltas);
    r.memoria.push(`Faltas no período (movimentos de ${rotuloCompetencia(meses[0])} a ${rotuloCompetencia(meses[11])}): ${faltas} → ${r.direito} dias de direito (CLT, art. 130).`);
    if (!r.direito) return erro(`${faltas} faltas no período aquisitivo: sem direito a férias (CLT, art. 130).`);
    // Dias já gozados no período: os outros gozos de motivo 15 (periodosFerias reconhece pelo período informado ou pelo mais antigo em aberto).
    const jaGozados = p.diasGozados;
    const abono = Math.max(0, Math.floor(e.abonoDias ?? 0));
    if (abono > Math.floor(r.direito / 3)) return erro(`Abono de ${abono} dias: o máximo é 1/3 dos dias de direito (${Math.floor(r.direito / 3)}).`);
    r.saldo = r.direito - jaGozados;
    if (diasGozo + abono > r.saldo) return erro(`Gozo de ${diasGozo} dias${abono ? ` + abono de ${abono}` : ''} passa do saldo do período (${r.saldo} de ${r.direito} dias${jaGozados ? `; ${jaGozados} já gozados` : ''}).`);
    if (jaGozados) r.memoria.push(`Saldo do período: ${r.direito} − ${jaGozados} já gozados = ${r.saldo} dias.`);

    // Remuneração: salário atual + média das horas extras do período aquisitivo (÷ 12).
    const sc = salarioContratual(d);
    r.avisos.push(...sc.avisos);
    if ('erro' in sc) return erro(sc.erro);
    r.memoria.push(sc.memoria);
    const salarioHora = sc.mensal / sc.horasMes;
    let somaVar = 0; let comMov = 0;
    for (const c of meses) {
        const mov = e.movimentos[c]; if (!mov) continue;
        comMov++;
        const he = Math.round(salarioHora * 1.5 * (mov.horasExtras50 ?? 0)) + Math.round(salarioHora * 2 * (mov.horasExtras100 ?? 0));
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
        const nDep = ficha.dependentes.filter(x => x.irrf === 'S').length;
        const legais = inssTotal + nDep * (t.valores.deducaoDependente ?? 0);
        const simpl = opcoes.simplificado ? t.valores.descontoSimplificado ?? 0 : 0;
        const usaSimpl = simpl > legais;
        const base = Math.max(0, tributavel - (usaSimpl ? simpl : legais));
        const faixa = t.faixas.find(f => f.ate === null || base <= f.ate) ?? t.faixas[t.faixas.length - 1];
        let ir = Math.max(0, Math.round(base * faixa.aliquota / 100) - faixa.deducao);
        r.memoria.push(`IRRF das férias (em separado, tabela de ${rotuloCompetencia(t.vigencia)}): ${reais(tributavel)} − ${usaSimpl ? `desconto simplificado ${reais(simpl)}` : `INSS ${reais(inssTotal)}${nDep ? ` e ${nDep} dependente(s)` : ''}`} = base ${reais(base)} × ${pct(faixa.aliquota)} − ${reais(faixa.deducao)} = ${reais(ir)}.`);
        r.avisos.push(`IRRF das férias ${opcoes.simplificado ? 'COM' : 'SEM'} desconto simplificado e ${opcoes.redutor ? 'COM' : 'SEM'} o redutor de 2026: confirme na conferência com o IOB.`);
        const v = t.valores;
        if (opcoes.redutor && ir > 0 && v.redutorAte && v.redutorMaximo && v.redutorLimite && v.redutorConstante && v.redutorCoeficiente) {
            let red = 0;
            if (tributavel <= v.redutorAte) red = Math.min(ir, v.redutorMaximo);
            else if (tributavel <= v.redutorLimite) red = Math.min(ir, Math.max(0, v.redutorConstante - Math.round(tributavel * v.redutorCoeficiente / 1_000_000)));
            if (red) { ir -= red; r.memoria.push(`Redutor sobre ${reais(tributavel)}: −${reais(red)}. IRRF ${reais(ir)}.`); }
        }
        if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada.`); ir = 0; }
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
