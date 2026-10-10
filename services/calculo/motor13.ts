// services/calculo/motor13.ts
//
// 13º salário (Processos › 13º Salário › Cálculo do IOB), em prévia, como o
// cálculo mensal. Base legal: Lei 4.090/1962 (1/12 por mês, fração de 15
// dias ou mais conta como mês inteiro) e Lei 4.749/1965 (1ª parcela entre
// fevereiro e novembro, metade; 2ª até 20 de dezembro).
//
// - Avos: mês a mês, conta os dias trabalhados no vínculo. Saem os dias pagos
//   pelo INSS (doença/acidente do 16º dia em diante, que têm abono anual do
//   INSS), as suspensões e licenças não remuneradas e as faltas do movimento.
//   Férias, licença remunerada e salário-maternidade contam.
// - Média de horas extras: horas dos movimentos gravados nos meses antes do
//   pagamento × valor da hora atual × adicional, com o DSR de cada mês,
//   dividido pelos meses com vínculo no período.
// - 1ª parcela: metade do 13º com os avos projetados até dezembro; sem INSS
//   e sem IRRF; FGTS no mês do pagamento.
// - 2ª parcela: 13º integral − 1ª parcela; INSS do 13º em separado (tabela de
//   dezembro), IRRF exclusivo na fonte sobre o 13º integral (tabela do mês do
//   pagamento); FGTS sobre o que falta.
// O desconto simplificado e o redutor de 2026 no IRRF do 13º ficam como
// opção da tela, com aviso, até a conferência com o IOB confirmar a regra.
// 13º na rescisão fica de fora.

import { fichaNaData, memoriaDoHistorico, type FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { inicioBeneficio } from '../cadastros/afastamentos';
import { dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { somarDias } from '../prazos/calendario';
import { diasDsr, salarioContratual, valorHorasExtras, type Movimento, type ResultadoCalculo, type Verba } from './motorMensal';

export type Parcela13 = '1a' | '2a';
export interface Opcoes13 { simplificado: boolean; redutor: boolean }
export const OPCOES_13_PADRAO: Opcoes13 = { simplificado: false, redutor: true };

export interface Entrada13 {
    ano: number;
    parcela: Parcela13;
    /** Mês do pagamento (AAAA-MM). Padrão: novembro (1ª) e dezembro (2ª). */
    pagamento?: string;
    ficha: FichaFuncionario;
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    /** Movimentos gravados do ano, por competência (AAAA-MM). */
    movimentos: Record<string, Movimento>;
    /** Valor efetivamente pago na 1ª parcela, se diferente do calculado (ex.: adiantado nas férias). */
    primeiraPaga?: number;
    opcoes?: Opcoes13;
}

const ALIQUOTA_FGTS = 8;
const ALIQUOTA_FGTS_APRENDIZ = 2;
const IRRF_MINIMO = 1000;
const NAO_CONTA = (motivo: string) => !['15', '16', '17', '18', '19', '20', '33', '35', '43'].includes(motivo);
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const brData = (d: string) => d.split('-').reverse().join('/');
const pad = (n: number) => String(n).padStart(2, '0');
const somarMesesComp = (comp: string, n: number) => { const [a, m] = comp.split('-').map(Number); const t = a * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`; };
const ultimoDia = (comp: string) => { const [a, m] = comp.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };

export interface MesAvo { competencia: string; dias: number; conta: boolean; motivo: string }

/** Avos do ano, mês a mês (o mês conta com 15 dias ou mais trabalhados). */
export function avosDoAno(ano: number, ficha: FichaFuncionario, afastamentos: Afastamento[], movimentos: Record<string, Movimento>): MesAvo[] {
    const adm = ficha.dados.admissao ?? '';
    const deslig = ficha.dados.dataDesligamento && dataValida(ficha.dados.dataDesligamento) ? ficha.dados.dataDesligamento : '';
    const meses: MesAvo[] = [];
    for (let m = 1; m <= 12; m++) {
        const comp = `${ano}-${pad(m)}`;
        const ini = `${comp}-01`; const ult = ultimoDia(comp);
        const de = adm > ini ? adm : ini;
        const ate = deslig && deslig < ult ? deslig : ult;
        if (!adm || de > ate) { meses.push({ competencia: comp, dias: 0, conta: false, motivo: adm > ult ? 'antes da admissão' : 'depois do desligamento' }); continue; }
        const fora = new Set<string>();
        const motivos = new Set<string>();
        for (const a of afastamentos) {
            if (a.fichaId && a.fichaId !== ficha.id) continue;
            if (!NAO_CONTA(a.motivo)) continue;
            const desde = ['01', '03'].includes(a.motivo) ? (a.infoMesmoMtv === 'S' ? a.dtInicio : inicioBeneficio(a)) : a.dtInicio;
            if (!desde) continue;
            const aIni = desde > de ? desde : de;
            const aFim = a.dtFim && a.dtFim < ate ? a.dtFim : ate;
            for (let x = aIni; x <= aFim; x = somarDias(x, 1)) { fora.add(x); motivos.add(['01', '03'].includes(a.motivo) ? 'INSS' : `afastamento ${a.motivo}`); }
        }
        let dias = 0;
        for (let x = de; x <= ate; x = somarDias(x, 1)) if (!fora.has(x)) dias++;
        const faltas = Math.floor(movimentos[comp]?.faltasDias ?? 0);
        if (faltas) motivos.add(`${faltas} falta(s)`);
        dias = Math.max(0, dias - faltas);
        meses.push({ competencia: comp, dias, conta: dias >= 15, motivo: [...motivos].join(', ') });
    }
    return meses;
}

export function calcular13(e: Entrada13): ResultadoCalculo {
    const { ano, parcela } = e;
    const opcoes = e.opcoes ?? OPCOES_13_PADRAO;
    const pagamento = e.pagamento || `${ano}-${parcela === '1a' ? '11' : '12'}`;
    // Salário pelo histórico: na 2ª parcela, o de dezembro (Lei 4.090/1962, art. 1º, § 1º); no adiantamento,
    // o do mês anterior ao pagamento (Lei 4.749/1965, art. 2º).
    const dataSalario = parcela === '2a' ? `${ano}-12-31` : /^\d{4}-\d{2}$/.test(pagamento) ? ultimoDia(somarMesesComp(pagamento, -1)) : '';
    const naData = dataSalario ? fichaNaData(e.ficha, dataSalario) : { ficha: e.ficha, faixa: null };
    const ficha = naData.ficha;
    const d = ficha.dados;
    const r: ResultadoCalculo = {
        fichaId: ficha.id, nome: d.nome || ficha.cpf, competencia: `${ano}-13`, pagamento, situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [],
    };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; return r; };
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(pagamento)) return erro('Mês do pagamento inválido.');
    if (!d.admissao || !dataValida(d.admissao)) return erro('Ficha sem data de admissão válida.');
    if (d.admissao > `${ano}-12-31`) return erro(`Admitido em ${brData(d.admissao)}, depois do ano.`);
    if (parcela === '1a' && d.admissao > ultimoDia(pagamento)) return erro(`Admitido em ${brData(d.admissao)}, depois do pagamento da 1ª parcela: recebe o 13º inteiro na 2ª.`);
    const deslig = d.dataDesligamento && dataValida(d.dataDesligamento) ? d.dataDesligamento : '';
    if (deslig && deslig < `${ano}-12-31`) return erro(`Desligado em ${brData(deslig)}: o 13º é pago na rescisão, que ainda não está no motor.`);
    const categoria = d.categoria || '';
    if (categoria && !/^1\d\d$/.test(categoria)) return erro(`Categoria ${categoria}: esta versão só calcula empregados (categorias 1xx).`);
    const aprendiz = categoria === '103';

    const sc = salarioContratual(d);
    r.avisos.push(...sc.avisos);
    if ('erro' in sc) return erro(sc.erro);
    r.memoria.push(sc.memoria);
    if (naData.faixa) r.memoria.push(memoriaDoHistorico(naData.faixa, parcela === '2a' ? `em dezembro de ${ano}` : `no mês anterior ao adiantamento (${brData(dataSalario).slice(3)})`, !!naData.antesDoHistorico));
    if (naData.antesDoHistorico) r.avisos.push('Data anterior ao histórico de salário da ficha: usado o salário mais antigo conhecido; confira.');
    const salarioHora = sc.mensal / sc.horasMes;

    // Avos: na 1ª parcela, os meses depois do pagamento são projetados como trabalhados.
    const meses = avosDoAno(ano, ficha, e.afastamentos, e.movimentos);
    const avos = meses.filter(m => m.conta).length;
    const naoContam = meses.filter(m => !m.conta && m.motivo !== 'antes da admissão');
    r.memoria.push(`Avos: ${avos}/12${naoContam.length ? ` (não contam: ${naoContam.map(m => `${rotuloCompetencia(m.competencia)} ${m.dias} dia(s)${m.motivo ? `, ${m.motivo}` : ''}`).join('; ')})` : ''}.`);
    // 1ª parcela (Decreto 10.854/2021, arts. 76 a 78): quem tem o ano inteiro recebe
    // metade da remuneração (avos projetados até dezembro); quem foi admitido no
    // ano recebe metade dos avos já cumpridos até o mês do pagamento.
    const admitidoNoAno = d.admissao > `${ano}-01-01`;
    const avos1 = admitidoNoAno ? meses.filter(m => m.conta && m.competencia <= pagamento).length : avos;
    if (parcela === '1a') r.avisos.push(admitidoNoAno
        ? `Admitido no ano: 1ª parcela pelos ${avos1} avo(s) cumpridos até ${rotuloCompetencia(pagamento)}.`
        : '1ª parcela com os avos projetados até dezembro (afastamentos sem término seguem até o fim do ano).');
    if (!avos) return erro('Nenhum avo no ano (nenhum mês com 15 dias ou mais trabalhados).');

    // Média de horas extras dos meses antes do pagamento, com o valor da hora atual.
    // Divisor: os meses do período que dão avo (15 dias ou mais trabalhados).
    const periodo = meses.filter(m => m.competencia < pagamento && m.conta);
    let somaVar = 0; let horas = 0;
    for (const m of periodo) {
        const mov = e.movimentos[m.competencia]; if (!mov) continue;
        const { valor: he, horas: h } = valorHorasExtras(salarioHora, mov);
        if (!he) continue;
        const { uteis, descanso } = diasDsr(m.competencia, mov.feriadosLocais);
        somaVar += he + Math.round(he / uteis * descanso);
        horas += h;
    }
    const media = periodo.length ? Math.round(somaVar / periodo.length) : 0;
    if (media) r.memoria.push(`Média de horas extras com DSR: ${reais(somaVar)} em ${num(horas)} h nos movimentos de ${periodo.length} mês(es) ÷ ${periodo.length} = ${reais(media)} (hora atual ${reais(Math.round(salarioHora))}).`);
    if (periodo.length) r.avisos.push(`Média pelos movimentos gravados no Consultor (${periodo.filter(m => e.movimentos[m.competencia]).length} de ${periodo.length} mês(es) com movimento). Meses sem movimento contam como sem horas extras; outras variáveis (comissões, adicionais) ainda não entram.`);

    const remuneracao = sc.mensal + media;
    const integral = Math.round(remuneracao * avos / 12);
    r.memoria.push(`13º integral: (${reais(sc.mensal)}${media ? ` + ${reais(media)}` : ''}) × ${avos}/12 = ${reais(integral)}.`);
    const primeiraCalculada = Math.round(remuneracao * avos1 / 12 / 2);
    const aliqFgts = aprendiz ? ALIQUOTA_FGTS_APRENDIZ : ALIQUOTA_FGTS;

    if (parcela === '1a') {
        verba({ codigo: '13A', descricao: '13º salário — 1ª parcela', referencia: `${avos1}/12`, tipo: 'provento', valor: primeiraCalculada, inss: false, fgts: true, irrf: false });
        r.memoria.push(`1ª parcela: metade de (${reais(remuneracao)} × ${avos1}/12) = ${reais(primeiraCalculada)}; sem INSS e sem IRRF (descontados na 2ª).`);
        r.bases.fgts = primeiraCalculada;
    } else {
        // Sem valor informado, desconta o que a 1ª parcela calculou em novembro
        // (avos projetados e média até outubro), que é o que foi pago.
        const r1 = e.primeiraPaga === undefined ? calcular13({ ...e, parcela: '1a', pagamento: `${ano}-11` }) : null;
        // 1ª de novembro com erro (ex.: admitido depois de novembro) = nada foi adiantado.
        const primeiraNov = r1 && r1.situacao !== 'erro' ? r1.verbas.find(x => x.codigo === '13A')?.valor ?? 0 : 0;
        const primeira = e.primeiraPaga ?? primeiraNov;
        if (e.primeiraPaga !== undefined) r.memoria.push(`1ª parcela informada como paga: ${reais(primeira)}.`);
        else if (!primeira) r.memoria.push('Sem adiantamento: não houve 1ª parcela em novembro.');
        else {
            r.memoria.push(`Adiantamento: ${reais(primeira)}, o valor da 1ª parcela calculada para novembro.`);
            r.avisos.push('Adiantamento descontado pelo valor calculado da 1ª parcela em novembro; se o pago foi outro (ex.: nas férias), informe.');
        }
        verba({ codigo: '13', descricao: '13º salário', referencia: `${avos}/12`, tipo: 'provento', valor: integral, inss: true, fgts: true, irrf: true });
        verba({ codigo: '13ADT', descricao: 'Adiantamento do 13º (1ª parcela)', referencia: '', tipo: 'desconto', valor: primeira, inss: false, fgts: false, irrf: false });
        r.bases.inss = integral; r.bases.irrf = integral; r.bases.fgts = Math.max(0, integral - primeira);

        // INSS do 13º: em separado, tabela de dezembro.
        const tInss = tabelaVigente(e.tabelas, 'inss', `${ano}-12`);
        let inss = 0;
        if ('erro' in tInss) erro(tInss.erro);
        else {
            const t = tInss.tabela;
            const teto = t.faixas[t.faixas.length - 1]?.ate ?? integral;
            const base = Math.min(integral, teto);
            let piso = 0; let total = 0; const partes: string[] = [];
            for (const f of t.faixas) {
                if (f.ate === null) break;
                const parte = Math.min(base, f.ate) - piso;
                if (parte <= 0) break;
                total += parte * f.aliquota / 100; partes.push(`${reais(parte)} × ${pct(f.aliquota)}`); piso = f.ate;
            }
            inss = Math.round(total);
            verba({ codigo: 'INSS13', descricao: 'INSS sobre 13º', referencia: base ? pct(Math.round(inss / base * 10000) / 100) : '', tipo: 'desconto', valor: inss, inss: false, fgts: false, irrf: false });
            r.memoria.push(`INSS do 13º (em separado, tabela de ${rotuloCompetencia(t.vigencia)}): ${partes.join(' + ')} = ${reais(inss)}.`);
        }

        // IRRF do 13º: exclusivo na fonte, sobre o integral.
        const tIr = tabelaVigente(e.tabelas, 'irrf', pagamento);
        if ('erro' in tIr) erro(`IRRF: ${tIr.erro}`);
        else {
            const t = tIr.tabela;
            const nDep = ficha.dependentes.filter(x => x.irrf === 'S' && x.pensao !== 'S').length; // quem recebe pensão deduz só por ela (Lei 9.250/1995, art. 35, § 4º)
            const legais = inss + nDep * (t.valores.deducaoDependente ?? 0);
            const simpl = opcoes.simplificado ? t.valores.descontoSimplificado ?? 0 : 0;
            const usaSimpl = simpl > legais;
            const deducao = usaSimpl ? simpl : legais;
            const base = Math.max(0, integral - deducao);
            // Dependentes deduzidos no IRRF do 13º: vão no S-1210 (dedDepen, tpRend 12).
            r.deducoesIrrf = { simplificado: usaSimpl, dependentes: ficha.dependentes.filter(x => x.irrf === 'S' && x.pensao !== 'S').map(x => ({ cpf: x.cpf, nome: x.nome })), porDependente: t.valores.deducaoDependente ?? 0, pensao: 0 };
            const faixa = t.faixas.find(f => f.ate === null || base <= f.ate) ?? t.faixas[t.faixas.length - 1];
            let ir = Math.max(0, Math.round(base * faixa.aliquota / 100) - faixa.deducao);
            r.memoria.push(`IRRF do 13º (exclusivo na fonte, tabela de ${rotuloCompetencia(t.vigencia)}): ${reais(integral)} − ${usaSimpl ? `desconto simplificado ${reais(simpl)}` : `INSS ${reais(inss)}${nDep ? ` e ${nDep} dependente(s)` : ''}`} = base ${reais(base)} × ${pct(faixa.aliquota)} − ${reais(faixa.deducao)} = ${reais(ir)}.`);
            r.avisos.push(`IRRF do 13º ${opcoes.simplificado ? 'COM' : 'SEM'} desconto simplificado e ${opcoes.redutor ? 'COM' : 'SEM'} o redutor de 2026: confirme a regra na norma e na conferência com o IOB.`);
            const v = t.valores;
            if (opcoes.redutor && ir > 0 && v.redutorAte && v.redutorMaximo && v.redutorLimite && v.redutorConstante && v.redutorCoeficiente) {
                let red = 0;
                if (integral <= v.redutorAte) red = Math.min(ir, v.redutorMaximo);
                else if (integral <= v.redutorLimite) red = Math.min(ir, Math.max(0, v.redutorConstante - Math.round(integral * v.redutorCoeficiente / 1_000_000)));
                if (red) { ir -= red; r.memoria.push(`Redutor sobre ${reais(integral)}: −${reais(red)}. IRRF ${reais(ir)}.`); }
            }
            if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada.`); ir = 0; }
            verba({ codigo: 'IRRF13', descricao: 'IRRF sobre 13º', referencia: faixa.aliquota ? pct(faixa.aliquota) : '', tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });
        }
    }

    r.fgts = Math.round(r.bases.fgts * aliqFgts / 100);
    r.memoria.push(`FGTS: ${reais(r.bases.fgts)} × ${aliqFgts}% = ${reais(r.fgts)}${parcela === '2a' ? ' (13º menos a 1ª parcela, que já teve FGTS)' : ''}.`);
    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    if (r.totais.liquido < 0) r.avisos.push('Líquido negativo: a 1ª parcela paga passa da 2ª. Confira.');
    return r;
}

/**
 * Funcionários com 13º do ano (vínculo em dezembro; os desligados recebem na
 * rescisão). Na 1ª parcela, `admitidosAte` tira quem entra depois do pagamento.
 */
export function com13(fichas: FichaFuncionario[], ano: number, admitidosAte = `${ano}-12-31`): FichaFuncionario[] {
    return fichas.filter(f => !!f.dados.admissao && f.dados.admissao <= admitidosAte && (!f.dados.dataDesligamento || f.dados.dataDesligamento >= `${ano}-12-31`));
}

export const ultimoDiaDoMes = ultimoDia;
