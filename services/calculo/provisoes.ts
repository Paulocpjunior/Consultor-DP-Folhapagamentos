// services/calculo/provisoes.ts
//
// Provisão de férias e de 13º salário (Processos › Férias/13º › Provisão do SAGE), pelo método do saldo: no
// fim de cada mês, o que a empresa já deve a cada empregado se ele saísse de férias ou recebesse o 13º hoje,
// com os encargos (INSS patronal pelo enquadramento e FGTS). O movimento do mês, para a contabilidade:
//
//     saldo anterior + constituição − baixas = saldo atual   →   constituição = atual − anterior + baixas
//
// - Férias: vencidas (saldo de dias dos períodos fechados), em dobro quando o concessivo venceu (art. 137,
//   sem encargos: art. 28, § 9º, "d", da Lei 8.212), proporcionais (avos do período em curso, 15 dias ou mais
//   no mês, dias de direito pelas faltas: art. 130) e o 1/3 de tudo.
// - 13º: remuneração × avos do ano (15 dias ou mais no mês, sem os afastamentos que não contam).
// - Remuneração: a do fim do mês, como na rescisão (salário pelo histórico + insalubridade ou periculosidade
//   + média das variáveis dos 12 meses anteriores). A diferença de um mês para o outro por reajuste ou média
//   entra na constituição (o "complemento" do SAGE).
// - Baixas: férias pelos gozos que começam no mês (dias + abono, com o 1/3, pela remuneração do mês); 13º em
//   dezembro (pago até 20/12; a 1ª parcela é adiantamento e não baixa a provisão); desligamento pelo saldo no
//   dia do desligamento (pago na rescisão).
// - Encargos: INSS patronal + RAT × FAP + terceiros pelo regime (Simples dos demais anexos: nada na folha);
//   FGTS de 8% (aprendiz, 2%).

import { fichaNaData, type FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { dataValida, reais } from '../cadastros/documentos';
import type { TabelaLegal } from '../cadastros/tabelasLegais';
import { enquadramentoVigente, type Enquadramento } from '../cadastros/enquadramento';
import { adicionalDeRisco } from './adicionais';
import { avosDoAno } from './motor13';
import { diasDeDireito, mesesDoPeriodo, periodosAquisitivos, abonoDoGozo } from './motorFerias';
import { mediaDasVariaveis, salarioContratual, type Movimento } from './motorMensal';
import { diasEntre, somarDias, somarMeses } from '../prazos/calendario';

const pad = (n: number) => String(n).padStart(2, '0');
export const ultimoDiaDoMes = (comp: string) => { const [a, m] = comp.split('-').map(Number); return `${comp}-${pad(new Date(Date.UTC(a, m, 0)).getUTCDate())}`; };
export const mesAnterior = (comp: string) => somarMeses(`${comp}-01`, -1).slice(0, 7);
const br = (d: string) => d.split('-').reverse().join('/');

/** Valores em centavos: o principal e os encargos sobre ele. */
export interface Saldo { principal: number; inss: number; fgts: number }
export const saldoZero = (): Saldo => ({ principal: 0, inss: 0, fgts: 0 });
export const totalSaldo = (s: Saldo) => s.principal + s.inss + s.fgts;
const somar = (a: Saldo, b: Saldo): Saldo => ({ principal: a.principal + b.principal, inss: a.inss + b.inss, fgts: a.fgts + b.fgts });
const menos = (a: Saldo, b: Saldo): Saldo => ({ principal: a.principal - b.principal, inss: a.inss - b.inss, fgts: a.fgts - b.fgts });

/** Movimento da provisão no mês (constituição = atual − anterior + baixa; negativa = reversão). */
export interface Movimentacao { anterior: Saldo; constituicao: Saldo; baixa: Saldo; atual: Saldo }

/** Alíquotas dos encargos sobre a provisão, em %. */
export interface Encargos { inss: number; fgts: number; memoria: string }

export function aliquotasEncargos(e: Enquadramento | null, categoria: string): Encargos {
    const fgts = categoria === '103' ? 2 : 8;
    if (!e) return { inss: 0, fgts, memoria: `sem enquadramento: INSS patronal 0%; FGTS ${fgts}%` };
    const rat = Math.round(e.rat * e.fap * 10000) / 10000;
    const inss = e.regime === 'simples' ? 0 : Math.round((e.patronal + rat + (e.regime === 'normal' ? e.terceiros : 0)) * 10000) / 10000;
    const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
    const memoria = e.regime === 'simples' ? `Simples Nacional (demais anexos): INSS patronal no DAS; FGTS ${fgts}%`
        : `INSS ${fmt(e.patronal)}% + RAT × FAP ${fmt(rat)}%${e.regime === 'normal' ? ` + terceiros ${fmt(e.terceiros)}%` : ''} = ${fmt(inss)}%; FGTS ${fgts}%`;
    return { inss, fgts, memoria };
}

const comEncargos = (principal: number, enc: Encargos, semEncargos = 0): Saldo =>
    ({ principal: principal + semEncargos, inss: Math.round(principal * enc.inss / 100), fgts: Math.round(principal * enc.fgts / 100) });

/** Posição de um empregado num dia: o que se deve de férias e de 13º (sem encargos). */
export interface Posicao {
    remuneracao: number;
    diasVencidos: number; avosFerias: number; diasProporcionais: number;
    /** Férias vencidas + proporcionais + 1/3 (base dos encargos). */
    ferias: number;
    /** Dobra das vencidas fora do concessivo + 1/3 (sem encargos). */
    dobra: number;
    avos13: number; decimo: number;
    memoria: string[]; avisos: string[];
}

export interface DadosProvisao { afastamentos: Afastamento[]; tabelas: TabelaLegal[]; movimentos: Record<string, Movimento> }

/** Remuneração no dia, como na rescisão: salário do histórico + adicional de risco + média das variáveis. */
function remuneracaoNoDia(f: FichaFuncionario, data: string, d: DadosProvisao): { valor: number; memoria: string; avisos: string[] } | { erro: string } {
    const naData = fichaNaData(f, data);
    const dados = naData.ficha.dados;
    const sc = salarioContratual(dados);
    if ('erro' in sc) return { erro: sc.erro };
    const adic = adicionalDeRisco(dados, sc.mensal, d.tabelas, data.slice(0, 7));
    if (adic.erro) return { erro: adic.erro };
    const adicional = adic.adicional?.mensal ?? 0;
    const ultimos12 = Array.from({ length: 12 }, (_, i) => somarMeses(`${data.slice(0, 7)}-01`, -(i + 1)).slice(0, 7));
    const meses = Math.max(1, ultimos12.filter(c => c >= (dados.admissao ?? '').slice(0, 7)).length);
    const mv = mediaDasVariaveis((sc.mensal + adicional) / sc.horasMes, d.movimentos, ultimos12, meses, `${meses}`);
    const valor = Math.round(sc.mensal + adicional + mv.media);
    const avisos = [...sc.avisos, ...(naData.antesDoHistorico ? ['Data anterior ao histórico de salário: usado o salário mais antigo conhecido.'] : [])];
    return { valor, avisos, memoria: `remuneração ${reais(sc.mensal)}${adicional ? ` + ${adic.adicional!.descricao.toLowerCase()} ${reais(adicional)}` : ''}${mv.media ? ` + média das variáveis ${reais(mv.media)}` : ''} = ${reais(valor)}` };
}

/**
 * Posição no dia `data` (fim do mês ou desligamento). `ate13` limita os avos do 13º ao mês da data;
 * no desligamento, a ficha vem com a data de desligamento.
 */
export function posicaoNoDia(ficha: FichaFuncionario, data: string, d: DadosProvisao): Posicao | { erro: string } {
    const adm = ficha.dados.admissao ?? '';
    if (!adm || !dataValida(adm)) return { erro: 'Ficha sem data de admissão válida.' };
    const rem = remuneracaoNoDia(ficha, data, d);
    if ('erro' in rem) return rem;
    const diaria = rem.valor / 30;
    const memoria = [rem.memoria]; const avisos = [...rem.avisos];

    // Férias: períodos até a data, com os gozos que começaram até ela.
    const gozos = d.afastamentos.filter(a => a.motivo === '15' && (!a.fichaId || a.fichaId === ficha.id) && a.dtInicio <= data);
    const periodos = periodosAquisitivos(adm, data, ficha.id, d.afastamentos, d.movimentos, gozos);
    let diasVencidos = 0; let vencidas = 0; let dobra = 0; let avosFerias = 0; let diasProporcionais = 0; let proporcionais = 0;
    for (const p of periodos) {
        if (p.perdido) continue;
        if (p.fim <= data) {
            const saldo = Math.max(0, p.direito - p.consumido);
            if (!saldo) continue;
            diasVencidos += saldo;
            const v = Math.round(diaria * saldo);
            vencidas += v;
            if (p.fimConcessivo < data) { dobra += v; avisos.push(`Férias de ${br(p.inicio)} a ${br(p.fim)} fora do concessivo (até ${br(p.fimConcessivo)}): ${saldo} dias em dobro (art. 137).`); }
        } else {
            let avos = 0;
            for (let m = 0; m < 12; m++) {
                const ini = somarMeses(p.inicio, m); const fim = somarDias(somarMeses(p.inicio, m + 1), -1);
                if (ini > data) break;
                if (data >= fim || diasEntre(ini, data) + 1 >= 15) avos++;
            }
            const faltas = mesesDoPeriodo(p.inicio, data).reduce((s, c) => s + Math.floor(d.movimentos[c]?.faltasDias ?? 0), 0);
            const dias = diasDeDireito(faltas) * avos / 12;
            avosFerias = avos; diasProporcionais = Math.round(dias * 100) / 100;
            proporcionais = Math.round(diaria * dias);
        }
    }
    const ferias = vencidas + proporcionais + Math.round((vencidas + proporcionais) / 3);
    const dobraTotal = dobra + Math.round(dobra / 3);
    if (diasVencidos || avosFerias) memoria.push(`férias: ${diasVencidos} dia(s) vencido(s) ${reais(vencidas)} + ${avosFerias}/12 proporcionais (${diasProporcionais.toLocaleString('pt-BR')} dias) ${reais(proporcionais)} + 1/3 = ${reais(ferias)}${dobraTotal ? `; dobra + 1/3 ${reais(dobraTotal)}` : ''}`);

    // 13º: avos do ano até o mês da data.
    const comp = data.slice(0, 7);
    const avos13 = avosDoAno(Number(data.slice(0, 4)), ficha, d.afastamentos, d.movimentos).filter(m => m.competencia <= comp && m.conta).length;
    const decimo = Math.round(rem.valor * avos13 / 12);
    if (avos13) memoria.push(`13º: ${reais(rem.valor)} × ${avos13}/12 = ${reais(decimo)}`);
    return { remuneracao: rem.valor, diasVencidos, avosFerias, diasProporcionais, ferias, dobra: dobraTotal, avos13, decimo, memoria, avisos };
}

export interface LinhaProvisao {
    fichaId: string; nome: string; matricula: string;
    situacao: 'ativo' | 'admitido' | 'desligado';
    remuneracao: number; diasVencidos: number; avosFerias: number; avos13: number;
    ferias: Movimentacao; decimo: Movimentacao;
    memoria: string[]; avisos: string[]; erro?: string;
}

export interface Provisao {
    competencia: string;
    encargos: Encargos | null;
    linhas: LinhaProvisao[];
    totais: { ferias: Movimentacao; decimo: Movimentacao };
    avisos: string[];
}

const movZero = (): Movimentacao => ({ anterior: saldoZero(), constituicao: saldoZero(), baixa: saldoZero(), atual: saldoZero() });
const somarMov = (a: Movimentacao, b: Movimentacao): Movimentacao => ({ anterior: somar(a.anterior, b.anterior), constituicao: somar(a.constituicao, b.constituicao), baixa: somar(a.baixa, b.baixa), atual: somar(a.atual, b.atual) });
const fechar = (anterior: Saldo, baixa: Saldo, atual: Saldo): Movimentacao => ({ anterior, baixa, atual, constituicao: somar(menos(atual, anterior), baixa) });

/** Categorias com férias e 13º pela CLT (empregados); intermitente recebe a cada convocação. */
const temProvisao = (cat: string) => !cat || (/^1\d\d$/.test(cat) && cat !== '111');

export interface EntradaProvisao { competencia: string; fichas: FichaFuncionario[]; afastamentos: Afastamento[]; tabelas: TabelaLegal[]; movimentos: Record<string, Record<string, Movimento>>; enquadramentos: Enquadramento[]; empresaId: string }

export function calcularProvisao(e: EntradaProvisao): Provisao {
    const fim = ultimoDiaDoMes(e.competencia);
    const ini = `${e.competencia}-01`;
    const fimAnt = ultimoDiaDoMes(mesAnterior(e.competencia));
    const avisos: string[] = [];
    const enqR = enquadramentoVigente(e.enquadramentos, e.empresaId, e.competencia);
    const enq = 'enquadramento' in enqR ? enqR.enquadramento : null;
    if (!enq) avisos.push(`${enqR && 'erro' in enqR ? enqR.erro : ''} A provisão sai sem o INSS patronal.`.trim());
    const dezembro = e.competencia.endsWith('-12');
    const linhas: LinhaProvisao[] = [];

    for (const f of e.fichas) {
        const d = f.dados; const cat = d.categoria ?? '';
        const adm = d.admissao ?? ''; const deslig = d.dataDesligamento && dataValida(d.dataDesligamento) ? d.dataDesligamento : '';
        if (!adm || adm > fim || (deslig && deslig < ini) || !temProvisao(cat)) continue;
        const dados: DadosProvisao = { afastamentos: e.afastamentos.filter(a => !a.fichaId || a.fichaId === f.id), tabelas: e.tabelas, movimentos: e.movimentos[f.id] ?? {} };
        const enc = aliquotasEncargos(enq, cat);
        const base: Omit<LinhaProvisao, 'ferias' | 'decimo'> = { fichaId: f.id, nome: d.nome || f.cpf, matricula: f.matriculaEsocial ?? '', situacao: deslig && deslig <= fim ? 'desligado' : adm >= ini ? 'admitido' : 'ativo',
            remuneracao: 0, diasVencidos: 0, avosFerias: 0, avos13: 0, memoria: [], avisos: [] };
        const fichaAteste = (data: string): FichaFuncionario => (deslig && deslig <= data ? f : { ...f, dados: { ...d, dataDesligamento: '' } });

        // Saldo anterior: posição no fim do mês anterior (zero para quem foi admitido no mês e em janeiro para o 13º).
        let anterior: Posicao | null = null;
        if (adm <= fimAnt) {
            const p = posicaoNoDia(fichaAteste(fimAnt), fimAnt, dados);
            if ('erro' in p) { linhas.push({ ...base, erro: p.erro, ferias: movZero(), decimo: movZero() }); continue; }
            anterior = p;
        }
        const antFerias = anterior ? comEncargos(anterior.ferias, enc, anterior.dobra) : saldoZero();
        const antDecimo = anterior && !e.competencia.endsWith('-01') ? comEncargos(anterior.decimo, enc) : saldoZero();

        if (base.situacao === 'desligado') {
            // Pago na rescisão: baixa pelo saldo no dia do desligamento; nada fica provisionado.
            const p = posicaoNoDia(f, deslig, dados);
            if ('erro' in p) { linhas.push({ ...base, erro: p.erro, ferias: movZero(), decimo: movZero() }); continue; }
            linhas.push({ ...base, remuneracao: p.remuneracao, diasVencidos: p.diasVencidos, avosFerias: p.avosFerias, avos13: p.avos13,
                memoria: [`Desligamento em ${br(deslig)}: baixa pelo pago na rescisão.`, ...p.memoria], avisos: p.avisos,
                ferias: fechar(antFerias, comEncargos(p.ferias, enc, p.dobra), saldoZero()), decimo: fechar(antDecimo, comEncargos(p.decimo, enc), saldoZero()) });
            continue;
        }
        const p = posicaoNoDia(fichaAteste(fim), fim, dados);
        if ('erro' in p) { linhas.push({ ...base, erro: p.erro, ferias: movZero(), decimo: movZero() }); continue; }
        const memoria = [...p.memoria];
        // Baixa das férias: gozos que começam no mês (o recibo é pago antes do início), pela remuneração do mês.
        const diaria = p.remuneracao / 30;
        const gozosDoMes = dados.afastamentos.filter(a => a.motivo === '15' && a.dtInicio >= ini && a.dtInicio <= fim);
        const diasBaixa = gozosDoMes.reduce((s, a) => s + (a.dtFim && dataValida(a.dtFim) ? diasEntre(a.dtInicio, a.dtFim) + 1 : 0) + abonoDoGozo(a), 0);
        const valorBaixa = Math.round(diaria * diasBaixa); const baixaFerias = valorBaixa + Math.round(valorBaixa / 3);
        if (diasBaixa) memoria.push(`baixa de férias: ${diasBaixa} dia(s) de gozo e abono iniciado(s) no mês = ${reais(baixaFerias)} com o 1/3`);
        // 13º: pago em dezembro (2ª parcela até 20/12): a provisão do ano é baixada e zera.
        const atualDecimo = dezembro ? saldoZero() : comEncargos(p.decimo, enc);
        const baixaDecimo = dezembro ? comEncargos(p.decimo, enc) : saldoZero();
        if (dezembro && p.decimo) memoria.push(`13º pago em dezembro: baixa de ${reais(p.decimo)}`);
        linhas.push({ ...base, remuneracao: p.remuneracao, diasVencidos: p.diasVencidos, avosFerias: p.avosFerias, avos13: p.avos13, memoria, avisos: p.avisos,
            ferias: fechar(antFerias, comEncargos(baixaFerias, enc), comEncargos(p.ferias, enc, p.dobra)),
            decimo: fechar(antDecimo, baixaDecimo, atualDecimo) });
    }
    linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const totais = linhas.reduce((t, l) => ({ ferias: somarMov(t.ferias, l.ferias), decimo: somarMov(t.decimo, l.decimo) }), { ferias: movZero(), decimo: movZero() });
    const comErro = linhas.filter(l => l.erro);
    if (comErro.length) avisos.push(`${comErro.length} funcionário(s) fora da provisão por erro no cadastro: ${comErro.map(l => `${l.nome} (${l.erro})`).join('; ')}.`);
    return { competencia: e.competencia, encargos: enq ? aliquotasEncargos(enq, '101') : null, linhas, totais, avisos };
}

/** Lançamento contábil do mês (débito despesa, crédito provisão; a baixa debita a provisão contra o pagamento). */
export function lancamentosDoMes(p: Provisao): { conta: string; constituicao: number; baixa: number; saldo: number }[] {
    const l = (conta: string, m: Movimentacao, k: keyof Saldo) => ({ conta, constituicao: m.constituicao[k], baixa: m.baixa[k], saldo: m.atual[k] });
    return [
        l('Provisão de férias e 1/3', p.totais.ferias, 'principal'), l('INSS sobre a provisão de férias', p.totais.ferias, 'inss'), l('FGTS sobre a provisão de férias', p.totais.ferias, 'fgts'),
        l('Provisão de 13º salário', p.totais.decimo, 'principal'), l('INSS sobre a provisão de 13º', p.totais.decimo, 'inss'), l('FGTS sobre a provisão de 13º', p.totais.decimo, 'fgts'),
    ];
}
