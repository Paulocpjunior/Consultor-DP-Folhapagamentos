// services/calculo/motorRescisao.ts
//
// Rescisão (Processos › Rescisão › Cálculo do IOB), em prévia: o TRCT de um
// desligamento, montado sobre os outros motores.
// - Saldo de salário e movimento do mês: o motor mensal com a data do
//   desligamento (INSS e IRRF do mês).
// - Aviso prévio (Lei 12.506/2011): 30 dias + 3 por ano completo, até 90,
//   na dispensa sem justa causa; metade no acordo (art. 484-A). Indenizado,
//   projeta o fim do contrato para 13º e férias (OJ 82 da SDI-1 do TST); sem
//   INSS e sem IRRF, com FGTS (Súmula 305 do TST). Trabalhado, só os dias
//   além de 30 são indenizados. No pedido de demissão sem cumprir o aviso,
//   desconta 30 dias (art. 487, § 2º).
// - 13º proporcional (até a data real, com INSS e IRRF próprios) e 13º sobre
//   o aviso indenizado (avos da projeção, sem INSS). Na justa causa, não há.
// - Férias vencidas (em dobro se o concessivo passou) e proporcionais, com
//   1/3, indenizadas: sem INSS, FGTS e IRRF. Na justa causa, só as vencidas.
// - Término antecipado de contrato a termo pelo empregador: metade da
//   remuneração dos dias restantes (art. 479).
// - FGTS do mês e rescisório; multa de 40% (dispensa sem justa causa e
//   art. 479) ou 20% (acordo) sobre o saldo informado — paga por guia, fora
//   do líquido. Pagamento em até 10 dias do término (art. 477, § 6º).

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import { diasEntre, somarDias, somarMeses } from '../prazos/calendario';
import { calcularMensal, diasDsr, salarioContratual, type Movimento, type ResultadoCalculo, type Verba } from './motorMensal';
import { avosDoAno } from './motor13';
import { diasDeDireito, mesesDoPeriodo, periodosAquisitivos } from './motorFerias';
import { inssDetalhado, irrfDetalhado, type OpcoesIrrf } from './tributos';

/** Motivos do desligamento (Tabela 19 do eSocial) cobertos nesta versão. */
export const TIPOS_RESCISAO = {
    '02': 'Sem justa causa, por iniciativa do empregador',
    '07': 'Pedido de demissão',
    '01': 'Com justa causa',
    '33': 'Acordo entre as partes (art. 484-A)',
    '06': 'Término do contrato a termo',
    '03': 'Término antecipado do contrato a termo pelo empregador',
    '04': 'Término antecipado do contrato a termo pelo empregado',
} as const;
export type TipoRescisao = keyof typeof TIPOS_RESCISAO;
export type AvisoPrevio = 'indenizado' | 'trabalhado' | 'dispensado' | 'nao-cumprido';
export const ROTULO_AVISO: Record<AvisoPrevio, string> = {
    indenizado: 'Indenizado', trabalhado: 'Trabalhado', dispensado: 'Dispensado do cumprimento', 'nao-cumprido': 'Não cumprido pelo empregado (desconto)',
};

export interface EntradaRescisao {
    ficha: FichaFuncionario;
    /** Último dia do contrato (data do desligamento). */
    data: string;
    /** Motivo do desligamento; vazio = ainda não escolhido (o motivo do S-2299 não é importado para a ficha). */
    tipo: TipoRescisao | '';
    aviso: AvisoPrevio;
    /** Mês em que a rescisão é paga (AAAA-MM): define a tabela do IRRF. Padrão: o mês do prazo de 10 dias. */
    pagamento?: string;
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    /** Movimentos gravados da ficha, por competência. */
    movimentos: Record<string, Movimento>;
    /** Saldo do FGTS para fins rescisórios (extrato), em centavos. */
    saldoFgts?: number;
    /** 13º já adiantado no ano (1ª parcela ou nas férias), em centavos. */
    adiantamento13?: number;
    opcoes?: OpcoesIrrf;
}

export interface ResultadoRescisao extends ResultadoCalculo {
    tipo: TipoRescisao | '';
    data: string;
    dataProjetada: string;
    diasAviso: number;
    pagarAte: string;
    multaFgts: number;
    percentualMulta: number;
    saqueFgts: string;
}

const ALIQUOTA_FGTS = 8;
const ALIQUOTA_FGTS_APRENDIZ = 2;
const br = (d: string) => d.split('-').reverse().join('/');
const anosCompletos = (de: string, ate: string) => { let n = 0; while (somarMeses(de, 12 * (n + 1)) <= somarDias(ate, 1)) n++; return n; };

/** Dias de aviso prévio pago pelo empregador (Lei 12.506/2011). */
export function diasDeAviso(admissao: string, data: string): number {
    return Math.min(90, 30 + 3 * anosCompletos(admissao, data));
}

export function calcularRescisao(e: EntradaRescisao): ResultadoRescisao {
    const { ficha, data, tipo } = e;
    const d = ficha.dados;
    const opcoes = e.opcoes ?? { simplificado: true, redutor: true };
    const pagarAte = dataValida(data) ? somarDias(data, 10) : '';
    const pagamento = e.pagamento && /^\d{4}-(0[1-9]|1[0-2])$/.test(e.pagamento) ? e.pagamento : pagarAte.slice(0, 7);
    const r: ResultadoRescisao = {
        fichaId: ficha.id, nome: d.nome || ficha.cpf, competencia: data.slice(0, 7), pagamento, situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [],
        tipo, data, dataProjetada: data, diasAviso: 0, pagarAte, multaFgts: 0, percentualMulta: 0, saqueFgts: '',
    };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; return r; };
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    if (!tipo) return erro('Escolha o tipo do desligamento: o motivo do S-2299 ainda não é importado para a ficha.');
    if (!TIPOS_RESCISAO[tipo]) return erro('Tipo de desligamento não coberto nesta versão.');
    if (!dataValida(data)) return erro('Informe a data do desligamento.');
    if (!d.admissao || !dataValida(d.admissao)) return erro('Ficha sem data de admissão válida.');
    if (data < d.admissao) return erro('Desligamento antes da admissão.');
    const categoria = d.categoria || '';
    if (categoria && !/^1\d\d$/.test(categoria)) return erro(`Categoria ${categoria}: esta versão só calcula empregados (categorias 1xx).`);
    const aliqFgts = categoria === '103' ? ALIQUOTA_FGTS_APRENDIZ : ALIQUOTA_FGTS;
    const justa = tipo === '01';
    if (!e.pagamento && pagamento !== data.slice(0, 7)) r.avisos.push(`O prazo de pagamento cai em ${rotuloCompetencia(pagamento)}: o IRRF usa a tabela desse mês. Se a rescisão for paga antes, informe o mês do pagamento.`);
    r.memoria.push(`${TIPOS_RESCISAO[tipo]}; admissão ${br(d.admissao)}, desligamento ${br(data)}; pagamento até ${br(pagarAte)} (art. 477, § 6º).`);

    // Remuneração para aviso, 13º e férias: salário atual + média de horas extras dos 12 meses anteriores.
    const sc = salarioContratual(d);
    r.avisos.push(...sc.avisos);
    if ('erro' in sc) return erro(sc.erro);
    const salarioHora = sc.mensal / sc.horasMes;
    const ultimos12 = Array.from({ length: 12 }, (_, i) => somarMeses(`${data.slice(0, 7)}-01`, -(i + 1)).slice(0, 7));
    let somaVar = 0;
    for (const c of ultimos12) {
        const mov = e.movimentos[c]; if (!mov) continue;
        const he = Math.round(salarioHora * 1.5 * (mov.horasExtras50 ?? 0)) + Math.round(salarioHora * 2 * (mov.horasExtras100 ?? 0));
        if (!he) continue;
        const { uteis, descanso } = diasDsr(c, mov.feriadosLocais);
        somaVar += he + Math.round(he / uteis * descanso);
    }
    const media = Math.round(somaVar / 12);
    const remuneracao = sc.mensal + media;
    const diaria = remuneracao / 30;
    r.memoria.push(`Remuneração para as verbas rescisórias: ${reais(sc.mensal)}${media ? ` + média de horas extras ${reais(media)} (12 meses ÷ 12)` : ''} = ${reais(remuneracao)}.`);
    if (ultimos12.some(c => e.movimentos[c])) r.avisos.push('Média de horas extras pelos movimentos gravados dos 12 meses anteriores; comissões e adicionais ainda não entram.');

    // 1. Saldo de salário e movimento do mês, pelo motor mensal.
    const fichaDeslig: FichaFuncionario = { ...ficha, dados: { ...d, dataDesligamento: data } };
    const mes = calcularMensal({ competencia: data.slice(0, 7), pagamento, ficha: fichaDeslig, afastamentos: e.afastamentos, tabelas: e.tabelas, movimento: e.movimentos[data.slice(0, 7)] });
    if (mes.situacao === 'erro') { r.erros.push(...mes.erros); r.situacao = 'erro'; }
    for (const v of mes.verbas) r.verbas.push(v.codigo === 'SAL' ? { ...v, descricao: 'Saldo de salário' } : v.codigo === 'INSS' ? { ...v, descricao: 'INSS sobre saldo de salário' } : v.codigo === 'IRRF' ? { ...v, descricao: 'IRRF sobre saldo de salário' } : v);
    r.memoria.push(...mes.memoria.map(m => `Mês: ${m}`));
    r.avisos.push(...mes.avisos.filter(a => !a.startsWith('Desligado em')));
    // Do mensal, só as férias no mês deixam a rescisão incompleta (o desligamento é tratado aqui).
    if (mes.situacao === 'incompleto' && mes.avisos.some(a => a.startsWith('Férias de'))) r.situacao = 'incompleto';
    let fgtsBase = mes.bases.fgts;

    // 2. Aviso prévio.
    let indenizados = 0;
    if (tipo === '02' || tipo === '33') {
        const dias = diasDeAviso(d.admissao, data);
        r.diasAviso = dias;
        if (e.aviso === 'trabalhado') {
            indenizados = Math.max(0, dias - 30);
            r.memoria.push(`Aviso prévio de ${dias} dias (Lei 12.506/2011): 30 trabalhados${indenizados ? ` e ${indenizados} indenizados` : ''}.`);
        } else {
            indenizados = tipo === '33' ? Math.floor(dias / 2) : dias;
            r.memoria.push(`Aviso prévio indenizado: ${dias} dias (Lei 12.506/2011)${tipo === '33' ? `, pela metade no acordo = ${indenizados}` : ''}.`);
            if (e.aviso !== 'indenizado') r.avisos.push('Na dispensa pelo empregador, o aviso é trabalhado ou indenizado; calculado como indenizado.');
        }
        if (indenizados) {
            const v = Math.round(diaria * indenizados);
            verba({ codigo: 'AVISO', descricao: 'Aviso prévio indenizado', referencia: `${indenizados} dias`, tipo: 'provento', valor: v, inss: false, fgts: true, irrf: false });
            fgtsBase += v;
        }
        r.dataProjetada = somarDias(data, indenizados);
        if (indenizados) r.memoria.push(`Projeção do aviso: fim do contrato em ${br(r.dataProjetada)} para 13º e férias (é a data projetada do S-2299).`);
    } else if (tipo === '07' && e.aviso === 'nao-cumprido') {
        verba({ codigo: 'AVISODESC', descricao: 'Aviso prévio não cumprido (desconto)', referencia: '30 dias', tipo: 'desconto', valor: Math.round(diaria * 30), inss: false, fgts: false, irrf: false });
        r.memoria.push('Pedido de demissão sem cumprir o aviso: desconto de 30 dias (art. 487, § 2º).');
    } else if (tipo === '03') {
        if (d.fimContrato && dataValida(d.fimContrato) && d.fimContrato > data) {
            const restantes = diasEntre(data, d.fimContrato);
            const v = Math.round(diaria * restantes / 2);
            verba({ codigo: 'ART479', descricao: 'Indenização do art. 479 da CLT', referencia: `${restantes} dias ÷ 2`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
            r.memoria.push(`Art. 479: metade da remuneração dos ${restantes} dias até o fim do contrato (${br(d.fimContrato)}) = ${reais(v)}.`);
        } else r.avisos.push('Término antecipado: informe o fim do contrato na ficha para calcular a indenização do art. 479.');
    } else if (tipo === '04') r.avisos.push('Término antecipado pelo empregado: a indenização do art. 480 (até o valor do art. 479) pode ser lançada como desconto no movimento do mês.');

    // 3. 13º proporcional e sobre o aviso indenizado.
    if (!justa) {
        const ano = Number(data.slice(0, 4));
        const avosReal = avosDoAno(ano, fichaDeslig, e.afastamentos, e.movimentos).filter(m => m.conta).length;
        const fichaProj = { ...ficha, dados: { ...d, dataDesligamento: r.dataProjetada } };
        const avosProj = avosDoAno(ano, fichaProj, e.afastamentos, e.movimentos).filter(m => m.conta).length;
        // Projeção que entra no ano seguinte: os avos de lá (15 dias ou mais) também são do aviso.
        const avosSeguinte = r.dataProjetada > `${ano}-12-31` ? avosDoAno(ano + 1, fichaProj, e.afastamentos, e.movimentos).filter(m => m.conta).length : 0;
        const avosAviso = Math.max(0, avosProj - avosReal) + avosSeguinte;
        const prop = Math.round(remuneracao * avosReal / 12);
        const ind = Math.round(remuneracao * avosAviso / 12);
        verba({ codigo: '13PROP', descricao: '13º salário proporcional', referencia: `${avosReal}/12`, tipo: 'provento', valor: prop, inss: true, fgts: true, irrf: true });
        verba({ codigo: '13IND', descricao: '13º sobre o aviso indenizado', referencia: `${avosAviso}/12`, tipo: 'provento', valor: ind, inss: false, fgts: true, irrf: true });
        r.memoria.push(`13º: ${reais(remuneracao)} × ${avosReal}/12 = ${reais(prop)}${ind ? `; projeção do aviso + ${avosAviso}/12${avosSeguinte ? ` (${avosSeguinte} de ${ano + 1})` : ''} = ${reais(ind)}` : ''}.`);
        const adiantado = e.adiantamento13 ?? 0;
        if (adiantado) verba({ codigo: '13ADT', descricao: 'Adiantamento do 13º', referencia: '', tipo: 'desconto', valor: adiantado, inss: false, fgts: false, irrf: false });
        else if (data.slice(5, 7) === '12') r.avisos.push('Desligamento em dezembro: se a 1ª parcela do 13º já foi paga, informe o adiantamento.');
        // O adiantamento já teve FGTS quando foi pago: só o restante entra na base rescisória.
        fgtsBase += Math.max(0, prop - adiantado) + ind;
        if (adiantado) r.memoria.push(`FGTS do 13º: ${reais(Math.max(0, prop - adiantado))} (proporcional − adiantamento, que já teve FGTS) + ${reais(ind)}.`);
        const tInss = tabelaVigente(e.tabelas, 'inss', data.slice(0, 7));
        let inss13 = 0;
        if ('erro' in tInss) erro(tInss.erro);
        else if (prop) { const x = inssDetalhado(prop, tInss.tabela); inss13 = x.valor; r.memoria.push(`INSS do 13º (em separado): ${x.memoria}.`); }
        verba({ codigo: 'INSS13', descricao: 'INSS sobre 13º', referencia: '', tipo: 'desconto', valor: inss13, inss: false, fgts: false, irrf: false });
        const tIr = tabelaVigente(e.tabelas, 'irrf', pagamento);
        if ('erro' in tIr) erro(`IRRF: ${tIr.erro}`);
        else if (prop + ind) {
            const x = irrfDetalhado({ rendimento: prop + ind, inss: inss13, dependentes: ficha.dependentes.filter(y => y.irrf === 'S').length, tabela: tIr.tabela, opcoes, rotulo: 'IRRF do 13º (exclusivo na fonte)' });
            r.memoria.push(...x.memoria);
            verba({ codigo: 'IRRF13', descricao: 'IRRF sobre 13º', referencia: '', tipo: 'desconto', valor: x.valor, inss: false, fgts: false, irrf: false });
            if (ind) r.avisos.push('13º sobre o aviso indenizado entrou no IRRF do 13º e fora do INSS: confirme com o IOB.');
        }
    } else r.memoria.push('Justa causa: sem 13º proporcional, férias proporcionais e aviso prévio.');

    // 4. Férias vencidas e proporcionais (indenizadas: sem INSS, FGTS e IRRF).
    const gozos = e.afastamentos.filter(a => a.motivo === '15' && a.dtInicio <= data);
    const periodos = periodosAquisitivos(d.admissao, r.dataProjetada, ficha.id, e.afastamentos, e.movimentos, gozos);
    for (const p of periodos) {
        if (p.perdido) { r.memoria.push(`Férias de ${br(p.inicio)} a ${br(p.fim)}: perdidas (${p.perdido}).`); continue; }
        if (p.fim <= r.dataProjetada) {
            const saldo = Math.max(0, p.direito - p.consumido);
            if (!saldo) continue;
            const v = Math.round(diaria * saldo); const vt = Math.round(v / 3);
            const dobra = p.fimConcessivo < data;
            verba({ codigo: `FV${p.inicio}`, descricao: `Férias vencidas ${p.inicio.slice(0, 4)}/${p.fim.slice(0, 4)}`, referencia: `${saldo} dias`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
            verba({ codigo: `FV13${p.inicio}`, descricao: '1/3 sobre férias vencidas', referencia: '', tipo: 'provento', valor: vt, inss: false, fgts: false, irrf: false });
            if (dobra) {
                verba({ codigo: `FVD${p.inicio}`, descricao: 'Dobra das férias vencidas (art. 137)', referencia: `${saldo} dias`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
                verba({ codigo: `FVD13${p.inicio}`, descricao: '1/3 sobre a dobra', referencia: '', tipo: 'provento', valor: vt, inss: false, fgts: false, irrf: false });
            }
            r.memoria.push(`Férias vencidas do período ${br(p.inicio)} a ${br(p.fim)}: ${saldo} dias${p.consumido ? ` (direito ${p.direito} − ${p.consumido} usados)` : ''} = ${reais(v)} + 1/3 ${reais(vt)}${dobra ? `, em dobro (concessivo até ${br(p.fimConcessivo)})` : ''}.`);
        } else if (!justa) {
            let avos = 0;
            for (let m = 0; m < 12; m++) {
                const ini = somarMeses(p.inicio, m); const fim = somarDias(somarMeses(p.inicio, m + 1), -1);
                if (ini > r.dataProjetada) break;
                if (r.dataProjetada >= fim || diasEntre(ini, r.dataProjetada) + 1 >= 15) avos++;
            }
            const faltas = mesesDoPeriodo(p.inicio, r.dataProjetada).reduce((s, c) => s + Math.floor(e.movimentos[c]?.faltasDias ?? 0), 0);
            const direito = diasDeDireito(faltas);
            const v = Math.round(diaria * direito * avos / 12); const vt = Math.round(v / 3);
            verba({ codigo: 'FP', descricao: 'Férias proporcionais', referencia: `${avos}/12`, tipo: 'provento', valor: v, inss: false, fgts: false, irrf: false });
            verba({ codigo: 'FP13', descricao: '1/3 sobre férias proporcionais', referencia: '', tipo: 'provento', valor: vt, inss: false, fgts: false, irrf: false });
            r.memoria.push(`Férias proporcionais do período ${br(p.inicio)} a ${br(p.fim)}: ${avos}/12 de ${direito} dias${faltas ? ` (${faltas} faltas)` : ''} = ${reais(v)} + 1/3 ${reais(vt)}.`);
        }
    }

    const vencidas = r.verbas.filter(v => /^FV\d{4}-/.test(v.codigo)).length;
    if (vencidas > 1 || r.verbas.some(v => v.codigo.startsWith('FVD'))) {
        r.avisos.unshift(`${vencidas} período(s) de férias vencidas${r.verbas.some(v => v.codigo.startsWith('FVD')) ? ', com dobra' : ''}: confira se as férias já tiradas estão lançadas em Cadastros › Afastamentos (motivo 15). Sem elas, o motor as considera não gozadas.`);
        if (r.situacao === 'calculado') r.situacao = 'incompleto';
    }

    // 5. FGTS e multa (paga por guia, fora do líquido).
    r.bases.fgts = fgtsBase;
    r.bases.inss = mes.bases.inss + (r.verbas.find(v => v.codigo === '13PROP')?.valor ?? 0);
    r.bases.irrf = mes.bases.irrf + r.verbas.filter(v => v.codigo === '13PROP' || v.codigo === '13IND').reduce((s, v) => s + v.valor, 0);
    r.fgts = Math.round(fgtsBase * aliqFgts / 100);
    r.memoria.push(`FGTS do mês e rescisório: ${reais(fgtsBase)} × ${aliqFgts}% = ${reais(r.fgts)}.`);
    r.percentualMulta = tipo === '02' || tipo === '03' ? 40 : tipo === '33' ? 20 : 0;
    r.saqueFgts = ['02', '03', '06'].includes(tipo) ? 'Saque do saldo do FGTS liberado.' : tipo === '33' ? 'Saque de até 80% do saldo do FGTS (art. 484-A, § 1º); sem seguro-desemprego.' : 'Sem saque do FGTS por este motivo.';
    if (r.percentualMulta) {
        if (e.saldoFgts === undefined) r.avisos.push(`Informe o saldo do FGTS para fins rescisórios (extrato do FGTS Digital) para calcular a multa de ${r.percentualMulta}%.`);
        else {
            r.multaFgts = Math.round((e.saldoFgts + r.fgts) * r.percentualMulta / 100);
            r.memoria.push(`Multa do FGTS: (${reais(e.saldoFgts)} + ${reais(r.fgts)}) × ${r.percentualMulta}% = ${reais(r.multaFgts)}, recolhida por guia no FGTS Digital.`);
        }
    }
    r.memoria.push(r.saqueFgts);

    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    if (r.totais.liquido < 0) r.avisos.push('Líquido negativo: os descontos passam dos proventos. Confira (art. 477, § 5º limita a compensação a uma remuneração).');
    r.memoria.push(`Competência do INSS e FGTS: ${rotuloCompetencia(data.slice(0, 7))}.`);
    return r;
}
