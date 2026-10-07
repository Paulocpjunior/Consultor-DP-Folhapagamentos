// services/calculo/motorMensal.ts
//
// Fase 3: motor do cálculo mensal (Processos › Pagamento Mensal › Cálculo da
// Folha do IOB). Primeira versão, em PRÉVIA: calcula um funcionário numa
// competência a partir da ficha, dos afastamentos, das tabelas legais e do
// movimento digitado, e devolve cada verba com a memória de cálculo. Não grava
// nada e não substitui o IOB enquanto não for conferido contra ele.
//
// Cobre: salário mensal, por hora ou por dia, proporcional (admissão,
// desligamento, afastamentos); primeiros 15 dias de doença/acidente;
// salário-maternidade; horas extras 50%/100% com reflexo no DSR; faltas e DSR
// descontado; lançamentos avulsos; INSS progressivo; salário-família; IRRF
// com desconto simplificado, dependentes, pensão e o redutor de 2026; FGTS.
// Fica de fora (aviso e situação "incompleto"): férias, 13º, rescisão,
// adicionais e médias de variáveis.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { inicioBeneficio, rotuloMotivo } from '../cadastros/afastamentos';
import { centavosDeTexto, dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { diaSemana, feriados, somarDias, somarMeses } from '../prazos/calendario';

export type TipoVerba = 'provento' | 'desconto';
export interface Incidencias { inss: boolean; fgts: boolean; irrf: boolean }
export interface Verba extends Incidencias { codigo: string; descricao: string; referencia: string; tipo: TipoVerba; valor: number }
export interface Lancamento extends Incidencias { descricao: string; tipo: TipoVerba; valor: number }

/** Movimento do mês digitado pela equipe. Horas em decimal (1,5 = 1h30); valores em centavos. */
export interface Movimento {
    horasExtras50?: number;
    horasExtras100?: number;
    faltasDias?: number;
    dsrDescontadoDias?: number;
    /** Feriados estaduais/municipais no mês (entram como descanso no DSR das horas extras). */
    feriadosLocais?: number;
    pensaoAlimenticia?: number;
    lancamentos?: Lancamento[];
}

export interface EntradaCalculo {
    competencia: string; // AAAA-MM
    /** Mês do pagamento (regime de caixa do IRRF). Padrão: mês seguinte à competência. */
    pagamento?: string;
    ficha: FichaFuncionario;
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    movimento?: Movimento;
    /**
     * Férias desta competência já pagas no recibo (soma dos gozos): entram na
     * base do INSS e do FGTS do mês, e o INSS já retido no recibo é abatido.
     * Sem isto, o mês com férias fica "incompleto".
     */
    feriasDoMes?: { dias: number; ferias: number; terco: number; inss: number; irrf?: number };
}

export type Situacao = 'calculado' | 'incompleto' | 'erro';
export interface ResultadoCalculo {
    fichaId: string;
    nome: string;
    competencia: string;
    pagamento: string;
    situacao: Situacao;
    verbas: Verba[];
    bases: { inss: number; fgts: number; irrf: number };
    totais: { proventos: number; descontos: number; liquido: number };
    fgts: number;
    memoria: string[];
    avisos: string[];
    erros: string[];
    /** Como o IRRF do mês foi deduzido (o S-1210 informa as deduções de dependentes). */
    deducoesIrrf?: { simplificado: boolean; dependentes: { cpf: string; nome: string }[]; porDependente: number; pensao: number };
}

/** FGTS: 8% (Lei 8.036/1990, art. 15); aprendiz 2% (§ 7º). */
const ALIQUOTA_FGTS = 8;
const ALIQUOTA_FGTS_APRENDIZ = 2;
/** Retenção de IRRF até R$ 10,00 é dispensada (Lei 9.430/1996, art. 67). */
const IRRF_MINIMO = 1000;

const MATERNIDADE = ['17', '18', '19', '20', '33', '35', '43'];
const DOENCA = ['01', '03'];
const REMUNERADO = ['16'];
const FERIAS = ['15'];
/** Remuneração depende do caso: o motor não paga e avisa. */
const CONFERIR = ['14', '24', '25'];

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const brData = (d: string) => d.split('-').reverse().join('/');
const ultimoDia = (comp: string) => { const [a, m] = comp.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };
const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c);
export const competenciaSeguinte = (c: string) => somarMeses(`${c}-01`, 1).slice(0, 7);

/** Feriados nacionais por lei (sem Carnaval e Sexta-feira Santa, que dependem de lei local). */
function feriadoNacional(d: string): boolean {
    const nome = feriados(Number(d.slice(0, 4))).get(d);
    return !!nome && !/Carnaval|Sexta-feira Santa/.test(nome);
}

/** Dias úteis (segunda a sábado) e de descanso (domingos e feriados nacionais) do mês, para o DSR. */
export function diasDsr(competencia: string, feriadosLocais = 0): { uteis: number; descanso: number } {
    let uteis = 0; let descanso = 0;
    for (let d = `${competencia}-01`; d <= ultimoDia(competencia); d = somarDias(d, 1)) {
        if (diaSemana(d) === 0 || feriadoNacional(d)) descanso++; else uteis++;
    }
    const n = Math.max(0, Math.min(feriadosLocais, uteis));
    return { uteis: uteis - n, descanso: descanso + n };
}

export type SalarioContratual = { mensal: number; horasMes: number; memoria: string; avisos: string[] } | { erro: string; avisos: string[] };

/** Salário mensal da ficha (mês, hora × horas semanais × 5, dia × 30, quinzena × 2) e as horas do mês. */
export function salarioContratual(d: FichaFuncionario['dados']): SalarioContratual {
    const avisos: string[] = [];
    const contratual = centavosDeTexto(d.salario ?? '');
    if (!contratual) return { erro: 'Ficha sem salário fixo.', avisos };
    const horasSemanais = Number((d.horasSemanais ?? '').replace(',', '.'));
    const horasMes = horasSemanais > 0 ? Math.round(horasSemanais * 5 * 100) / 100 : 220;
    if (!(horasSemanais > 0)) avisos.push('Ficha sem horas semanais: usado divisor de 220 horas.');
    const unidade = d.unidadeSalario || '5';
    if (!d.unidadeSalario) avisos.push('Ficha sem unidade salarial: tratado como salário mensal.');
    if (unidade === '5') return { mensal: contratual, horasMes, memoria: `Salário mensal: ${reais(contratual)}.`, avisos };
    if (unidade === '1') { const mensal = Math.round(contratual * horasMes); return { mensal, horasMes, memoria: `Salário por hora ${reais(contratual)} × ${num(horasMes)} h (semanais × 5, DSR incluído) = ${reais(mensal)}.`, avisos }; }
    if (unidade === '2') return { mensal: contratual * 30, horasMes, memoria: `Salário por dia ${reais(contratual)} × 30 = ${reais(contratual * 30)}.`, avisos };
    if (unidade === '4') return { mensal: contratual * 2, horasMes, memoria: `Salário por quinzena ${reais(contratual)} × 2 = ${reais(contratual * 2)}.`, avisos };
    return { erro: `Unidade salarial ${unidade}: não calculada nesta versão (só mês, hora, dia e quinzena).`, avisos };
}

type Dia = 'pago' | 'maternidade' | 'ferias' | 'naoPago';

export function calcularMensal(e: EntradaCalculo): ResultadoCalculo {
    const { competencia, ficha } = e;
    const pagamento = e.pagamento || (competenciaValida(competencia) ? competenciaSeguinte(competencia) : '');
    const mov = e.movimento ?? {};
    const r: ResultadoCalculo = {
        fichaId: ficha.id, nome: ficha.dados.nome || ficha.cpf, competencia, pagamento, situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [],
    };
    const fim = (s: Situacao) => { if (s === 'incompleto' && r.situacao === 'calculado') r.situacao = s; if (s === 'erro') r.situacao = s; };
    const erro = (m: string) => { r.erros.push(m); fim('erro'); return r; };
    const incompleto = (m: string) => { r.avisos.push(m); fim('incompleto'); };
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    const d = ficha.dados;

    if (!competenciaValida(competencia)) return erro('Competência inválida.');
    if (!competenciaValida(pagamento)) return erro('Mês do pagamento inválido.');
    const ini = `${competencia}-01`; const ult = ultimoDia(competencia);
    if (!d.admissao || !dataValida(d.admissao)) return erro('Ficha sem data de admissão válida.');
    if (d.admissao > ult) return erro(`Admitido em ${brData(d.admissao)}, depois da competência.`);
    const deslig = d.dataDesligamento && dataValida(d.dataDesligamento) ? d.dataDesligamento : '';
    if (deslig && deslig < ini) return erro(`Desligado em ${brData(deslig)}, antes da competência.`);
    const categoria = d.categoria || '';
    if (categoria && !/^1\d\d$/.test(categoria)) return erro(`Categoria ${categoria}: esta versão só calcula empregados (categorias 1xx).`);
    if (!categoria) r.avisos.push('Ficha sem categoria do eSocial: calculado como empregado (101).');
    const aprendiz = categoria === '103';

    // 1. Salário contratual e salário-hora.
    const sc = salarioContratual(d);
    r.avisos.push(...sc.avisos);
    if ('erro' in sc) return erro(sc.erro);
    const { mensal, horasMes } = sc;
    r.memoria.push(sc.memoria);
    const salarioHora = mensal / horasMes;
    const diaria = mensal / 30;

    // 2. Dias do mês: vínculo e afastamentos.
    const de = d.admissao > ini ? d.admissao : ini;
    const ate = deslig && deslig < ult ? deslig : ult;
    const dias = new Map<string, Dia>();
    for (let x = de; x <= ate; x = somarDias(x, 1)) dias.set(x, 'pago');
    const mesInteiro = de === ini && ate === ult;
    if (!mesInteiro) r.memoria.push(`Vínculo no mês: ${brData(de)} a ${brData(ate)} (${dias.size} dia(s)).`);
    if (deslig && deslig <= ult) incompleto(`Desligado em ${brData(deslig)}: só o saldo de salário foi calculado; a rescisão não está no motor.`);

    let diasAcidenteInss = 0;
    for (const a of e.afastamentos) {
        if (a.fichaId && a.fichaId !== ficha.id) continue;
        const aIni = a.dtInicio > de ? a.dtInicio : de;
        const aFim = a.dtFim && a.dtFim < ate ? a.dtFim : ate;
        if (aIni > aFim) continue;
        const rotulo = rotuloMotivo(a.motivo);
        let n = 0;
        if (REMUNERADO.includes(a.motivo)) { r.memoria.push(`Afastamento ${rotulo} de ${brData(aIni)} a ${brData(aFim)}: remunerado pela empresa.`); continue; }
        const beneficio = DOENCA.includes(a.motivo) ? (a.infoMesmoMtv === 'S' ? a.dtInicio : inicioBeneficio(a)) : null;
        for (let x = aIni; x <= aFim; x = somarDias(x, 1)) {
            if (DOENCA.includes(a.motivo)) {
                if (beneficio && x >= beneficio) { dias.set(x, 'naoPago'); n++; if (a.motivo === '01') diasAcidenteInss++; }
            } else if (MATERNIDADE.includes(a.motivo)) { dias.set(x, 'maternidade'); n++; }
            else if (FERIAS.includes(a.motivo)) { dias.set(x, 'ferias'); n++; }
            else { dias.set(x, 'naoPago'); n++; }
        }
        if (DOENCA.includes(a.motivo)) {
            r.memoria.push(a.infoMesmoMtv === 'S'
                ? `Afastamento ${rotulo} desde ${brData(a.dtInicio)}, mesmo motivo de afastamento anterior (60 dias): benefício do INSS desde o início; ${n} dia(s) sem salário no mês.`
                : `Afastamento ${rotulo} desde ${brData(a.dtInicio)}: empresa paga os 15 primeiros dias; INSS a partir de ${brData(beneficio!)}; ${n} dia(s) sem salário no mês.`);
        } else if (MATERNIDADE.includes(a.motivo)) r.memoria.push(`Afastamento ${rotulo}: ${n} dia(s) de salário-maternidade no mês.`);
        else if (FERIAS.includes(a.motivo)) {
            if (e.feriasDoMes) r.memoria.push(`Férias de ${brData(aIni)} a ${brData(aFim)} (${n} dia(s)): pagas no recibo de férias; esses dias saem do salário.`);
            else incompleto(`Férias de ${brData(aIni)} a ${brData(aFim)} (${n} dia(s)): o recibo de férias sai em Cálculo › Folha › Férias; sem ele, o INSS e o FGTS do mês não somam as férias.`);
        }
        else {
            r.memoria.push(`Afastamento ${rotulo} de ${brData(aIni)} a ${brData(aFim)}: ${n} dia(s) sem salário.`);
            if (CONFERIR.includes(a.motivo)) r.avisos.push(`Afastamento ${rotulo}: a remuneração depende do caso; o motor não pagou esses dias. Confira.`);
        }
    }
    const contar = (t: Dia) => [...dias.values()].filter(v => v === t).length;
    // Mês comercial: mês inteiro sem afastamento vale 30 dias. Com afastamento,
    // pagam-se os dias trabalhados (até 30); em fevereiro, 30 menos os afastados.
    const L = Number(ult.slice(8));
    const base30 = mesInteiro ? 30 : Math.min(30, dias.size);
    const realPago = contar('pago'); const realMat = contar('maternidade');
    // Com férias no mês, salário + férias fecham 30 dias (o recibo paga os dias de férias): 30 − os dias fora.
    const comFerias = contar('ferias') > 0;
    const diasPagos = !mesInteiro ? Math.min(30, realPago) : L >= 30 && !comFerias ? Math.min(30, realPago) : Math.max(0, 30 - (L - realPago));
    const diasMat = Math.min(30 - diasPagos, realMat === dias.size ? base30 : realMat);
    if (!mesInteiro || realPago < dias.size) r.memoria.push(`Dias a pagar: ${diasPagos} (dias trabalhados no mês; mês inteiro vale 30).`);
    if (!mesInteiro) r.avisos.push('Mês parcial: salário proporcional aos dias do vínculo (máximo 30). Confira a regra com o IOB.');

    // 3. Proventos.
    const sal = diasPagos === 30 ? mensal : Math.round(diaria * diasPagos);
    verba({ codigo: 'SAL', descricao: 'Salário', referencia: `${diasPagos} dias`, tipo: 'provento', valor: sal, inss: true, fgts: true, irrf: true });
    if (diasMat) {
        const v = diasMat === 30 ? mensal : Math.round(diaria * diasMat);
        verba({ codigo: 'MAT', descricao: 'Salário-maternidade', referencia: `${diasMat} dias`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.avisos.push('Salário-maternidade pelo salário fixo; média de variáveis não está no motor. A empresa compensa o valor na DCTFWeb.');
    }
    const he50 = mov.horasExtras50 ?? 0; const he100 = mov.horasExtras100 ?? 0;
    let totalHe = 0;
    if (he50 > 0) {
        const v = Math.round(salarioHora * 1.5 * he50); totalHe += v;
        verba({ codigo: 'HE50', descricao: 'Horas extras 50%', referencia: `${num(he50)} h`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`Horas extras 50%: ${num(he50)} h × ${reais(Math.round(salarioHora))}/h × 1,5 = ${reais(v)}.`);
    }
    if (he100 > 0) {
        const v = Math.round(salarioHora * 2 * he100); totalHe += v;
        verba({ codigo: 'HE100', descricao: 'Horas extras 100%', referencia: `${num(he100)} h`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`Horas extras 100%: ${num(he100)} h × ${reais(Math.round(salarioHora))}/h × 2 = ${reais(v)}.`);
    }
    if (totalHe) {
        const { uteis, descanso } = diasDsr(competencia, mov.feriadosLocais);
        const v = Math.round(totalHe / uteis * descanso);
        verba({ codigo: 'DSRHE', descricao: 'DSR sobre horas extras', referencia: `${descanso}/${uteis}`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`DSR sobre horas extras: ${reais(totalHe)} ÷ ${uteis} dias úteis × ${descanso} domingos e feriados = ${reais(v)}${mov.feriadosLocais ? ` (com ${mov.feriadosLocais} feriado(s) local(is))` : ' (só feriados nacionais; informe os locais)'}.`);
    }

    // 4. Descontos do movimento.
    const faltas = mov.faltasDias ?? 0; const dsrDesc = mov.dsrDescontadoDias ?? 0;
    if (faltas > 0) verba({ codigo: 'FALTA', descricao: 'Faltas', referencia: `${num(faltas)} dias`, tipo: 'desconto', valor: Math.round(diaria * faltas), inss: true, fgts: true, irrf: true });
    if (dsrDesc > 0) verba({ codigo: 'DSRF', descricao: 'DSR descontado (faltas)', referencia: `${num(dsrDesc)} dias`, tipo: 'desconto', valor: Math.round(diaria * dsrDesc), inss: true, fgts: true, irrf: true });
    if (faltas > 0 || dsrDesc > 0) r.memoria.push(`Faltas e DSR: ${reais(Math.round(diaria))} por dia (salário ÷ 30).`);
    (mov.lancamentos ?? []).forEach((l, i) => verba({ ...l, codigo: `LAN${i + 1}`, referencia: '', valor: Math.round(l.valor) }));

    // Férias do mês pagas no recibo: entram nas bases do INSS e do FGTS (não no IRRF, que foi em separado).
    const fm = e.feriasDoMes;
    if (fm && fm.ferias + fm.terco > 0) {
        verba({ codigo: 'FERMES', descricao: 'Férias + 1/3 do mês (pagas no recibo)', referencia: `${fm.dias} dias`, tipo: 'provento', valor: fm.ferias + fm.terco, inss: true, fgts: true, irrf: false });
        // O que o recibo já pagou e reteve (parte desta competência): líquido, INSS e IRRF, como no holerite do IOB.
        const irrfFer = fm.irrf ?? 0;
        verba({ codigo: 'FERPAGO', descricao: 'Líquido das férias pago no recibo', referencia: '', tipo: 'desconto', valor: Math.max(0, fm.ferias + fm.terco - fm.inss - irrfFer), inss: false, fgts: false, irrf: false });
        verba({ codigo: 'INSSFERRET', descricao: 'INSS das férias (retido no recibo)', referencia: '', tipo: 'desconto', valor: fm.inss, inss: false, fgts: false, irrf: false });
        verba({ codigo: 'IRRFFERRET', descricao: 'IRRF das férias (retido no recibo)', referencia: '', tipo: 'desconto', valor: irrfFer, inss: false, fgts: false, irrf: false });
        r.memoria.push(`Férias do mês: ${reais(fm.ferias + fm.terco)} (${fm.dias} dias, pagos no recibo) somados às bases do INSS e do FGTS; o IRRF das férias foi em separado. Saem o líquido pago no recibo e o INSS e o IRRF já retidos nele.`);
    }

    // 5. Bases.
    const soma = (f: (v: Verba) => boolean) => r.verbas.filter(f).reduce((s, v) => s + (v.tipo === 'provento' ? v.valor : -v.valor), 0);
    r.bases.inss = Math.max(0, soma(v => v.inss));
    r.bases.irrf = Math.max(0, soma(v => v.irrf));
    const diasFgtsAcidente = Math.min(diasAcidenteInss, Math.max(0, 30 - diasPagos - diasMat));
    const fgtsAcidente = Math.round(diaria * diasFgtsAcidente);
    r.bases.fgts = Math.max(0, soma(v => v.fgts)) + fgtsAcidente;
    if (fgtsAcidente) r.memoria.push(`FGTS sobre ${diasFgtsAcidente} dia(s) de afastamento por acidente do trabalho: ${reais(fgtsAcidente)} somados à base (Lei 8.036/1990, art. 15, § 5º).`);

    // 6. INSS do segurado (competência).
    const tInss = tabelaVigente(e.tabelas, 'inss', competencia);
    let inss = 0;
    if ('erro' in tInss) erro(tInss.erro);
    else {
        const t = tInss.tabela;
        const teto = t.faixas[t.faixas.length - 1]?.ate ?? r.bases.inss;
        const base = Math.min(r.bases.inss, teto);
        let piso = 0; const partes: string[] = [];
        let total = 0;
        for (const f of t.faixas) {
            if (f.ate === null) break;
            const parte = Math.min(base, f.ate) - piso;
            if (parte <= 0) break;
            total += parte * f.aliquota / 100;
            partes.push(`${reais(parte)} × ${pct(f.aliquota)}`);
            piso = f.ate;
        }
        const inssTotal = Math.round(total);
        const retido = fm?.inss ?? 0;
        inss = Math.max(0, inssTotal - retido);
        verba({ codigo: 'INSS', descricao: 'INSS', referencia: base ? pct(Math.round(inssTotal / base * 10000) / 100) : '', tipo: 'desconto', valor: inss, inss: false, fgts: false, irrf: false });
        r.memoria.push(`INSS (tabela de ${rotuloCompetencia(t.vigencia)}, ${t.norma}): base ${reais(r.bases.inss)}${base < r.bases.inss ? `, limitada ao teto ${reais(base)}` : ''}; ${partes.join(' + ') || 'sem base'} = ${reais(inssTotal)}${retido ? ` − ${reais(retido)} já retidos no recibo de férias = ${reais(inss)}` : ''}.`);
    }

    // 7. Salário-família (competência).
    const filhos = ficha.dependentes.filter(x => x.salarioFamilia === 'S');
    if (filhos.length) {
        const tSf = tabelaVigente(e.tabelas, 'salario_familia', competencia);
        if ('erro' in tSf) r.avisos.push(`Salário-família não calculado: ${tSf.erro}`);
        else {
            const { cotaSalarioFamilia: cota = 0, limiteSalarioFamilia: limite = 0 } = tSf.tabela.valores;
            const comDireito = filhos.filter(x => {
                if (!dataValida(x.nascimento)) { r.avisos.push(`Salário-família: dependente ${x.nome || ''} sem nascimento válido; não contado.`); return false; }
                const quatorze = `${Number(x.nascimento.slice(0, 4)) + 14}${x.nascimento.slice(4, 7)}`;
                return quatorze >= competencia; // devido até o mês em que completa 14 anos
            });
            if (r.bases.inss > limite) r.memoria.push(`Salário-família: remuneração ${reais(r.bases.inss)} acima do limite ${reais(limite)}; sem direito.`);
            else if (comDireito.length) {
                const proporcional = !mesInteiro;
                const v = proporcional ? Math.round(cota * comDireito.length * base30 / 30) : cota * comDireito.length;
                verba({ codigo: 'SF', descricao: 'Salário-família', referencia: `${comDireito.length} cota(s)`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
                r.memoria.push(`Salário-família: ${comDireito.length} × ${reais(cota)}${proporcional ? ` × ${base30}/30 (mês de admissão ou desligamento)` : ''} = ${reais(v)}.`);
                if (filhos.length) r.avisos.push('Salário-família: filho inválido de qualquer idade não é reconhecido pelo cadastro; confira se houver.');
            }
        }
    }

    // 8. Pensão alimentícia (valor fixo da decisão).
    const pensao = Math.round(mov.pensaoAlimenticia ?? 0);
    if (pensao > 0) verba({ codigo: 'PENSAO', descricao: 'Pensão alimentícia', referencia: '', tipo: 'desconto', valor: pensao, inss: false, fgts: false, irrf: false });

    // 9. IRRF (regime de caixa: tabela do mês do pagamento).
    const tIr = tabelaVigente(e.tabelas, 'irrf', pagamento);
    if ('erro' in tIr) erro(`IRRF: ${tIr.erro}`);
    else if (r.bases.irrf > 0) {
        const t = tIr.tabela;
        const nDep = ficha.dependentes.filter(x => x.irrf === 'S').length;
        const dep = nDep * (t.valores.deducaoDependente ?? 0);
        const legais = inss + dep + pensao;
        const simplificado = t.valores.descontoSimplificado ?? 0;
        const usaSimpl = simplificado > legais;
        const deducao = usaSimpl ? simplificado : legais;
        r.deducoesIrrf = { simplificado: usaSimpl, dependentes: ficha.dependentes.filter(x => x.irrf === 'S').map(x => ({ cpf: x.cpf, nome: x.nome })), porDependente: t.valores.deducaoDependente ?? 0, pensao };
        const base = Math.max(0, r.bases.irrf - deducao);
        const faixa = t.faixas.find(f => f.ate === null || base <= f.ate) ?? t.faixas[t.faixas.length - 1];
        let ir = Math.max(0, Math.round(base * faixa.aliquota / 100) - faixa.deducao);
        r.memoria.push(`IRRF (pagamento em ${rotuloCompetencia(pagamento)}, tabela de ${rotuloCompetencia(t.vigencia)}, ${t.norma}): rendimentos ${reais(r.bases.irrf)}; `
            + (usaSimpl ? `desconto simplificado ${reais(simplificado)} (maior que as deduções legais de ${reais(legais)})` : `deduções legais ${reais(legais)} (INSS ${reais(inss)}${nDep ? ` + ${nDep} dependente(s) ${reais(dep)}` : ''}${pensao ? ` + pensão ${reais(pensao)}` : ''})`)
            + `; base ${reais(base)} × ${pct(faixa.aliquota)} − ${reais(faixa.deducao)} = ${reais(ir)}.`);
        const v = t.valores;
        if (ir > 0 && v.redutorAte && v.redutorMaximo && v.redutorLimite && v.redutorConstante && v.redutorCoeficiente) {
            const R = r.bases.irrf;
            let red = 0;
            if (R <= v.redutorAte) red = Math.min(ir, v.redutorMaximo);
            else if (R <= v.redutorLimite) red = Math.min(ir, Math.max(0, v.redutorConstante - Math.round(R * v.redutorCoeficiente / 1_000_000)));
            if (red) {
                ir -= red;
                r.memoria.push(R <= v.redutorAte
                    ? `Redutor: rendimentos até ${reais(v.redutorAte)}; redução de ${reais(red)} (até ${reais(v.redutorMaximo)}). IRRF ${reais(ir)}.`
                    : `Redutor: ${reais(v.redutorConstante)} − ${(v.redutorCoeficiente / 1_000_000).toFixed(6).replace('.', ',')} × ${reais(R)} = ${reais(red)}. IRRF ${reais(ir)}.`);
            }
        }
        if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
        verba({ codigo: 'IRRF', descricao: 'IRRF', referencia: faixa.aliquota ? pct(faixa.aliquota) : '', tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
    }

    // 10. FGTS e totais.
    const aliqFgts = aprendiz ? ALIQUOTA_FGTS_APRENDIZ : ALIQUOTA_FGTS;
    r.fgts = Math.round(r.bases.fgts * aliqFgts / 100);
    r.memoria.push(`FGTS: ${reais(r.bases.fgts)} × ${aliqFgts}% = ${reais(r.fgts)}${aprendiz ? ' (aprendiz)' : ''}.`);
    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    if (r.totais.liquido < 0) r.avisos.push('Líquido negativo: confira os descontos.');
    return r;
}

/** Funcionários com vínculo em algum dia da competência. */
export function noMes(fichas: FichaFuncionario[], competencia: string): FichaFuncionario[] {
    const ini = `${competencia}-01`; const ult = ultimoDia(competencia);
    return fichas.filter(f => (f.dados.admissao ?? '') <= ult && !!f.dados.admissao && (!f.dados.dataDesligamento || f.dados.dataDesligamento >= ini));
}
