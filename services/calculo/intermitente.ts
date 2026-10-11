// services/calculo/intermitente.ts
//
// Trabalho intermitente (CLT, art. 452-A, incluído pela Lei 13.467/2017; Portaria MTP 671/2021): o empregado (categoria
// 111 do eSocial) só trabalha quando convocado e recebe por convocação.
//
// Convocação (art. 452-A):
//   - com pelo menos 3 dias corridos de antecedência, informando a jornada (§ 1º);
//   - o empregado tem 1 dia útil para responder; o silêncio é recusa (§ 2º), e a recusa não descaracteriza a
//     subordinação (§ 3º);
//   - o valor da hora não pode ser menor que o do salário mínimo nem que o dos demais empregados da mesma função (caput);
//   - a cada 12 meses, o empregado tem direito a 1 mês de férias, em que não pode ser convocado pelo mesmo empregador (§ 9º).
// Pagamento, ao fim de cada período de prestação de serviço e nunca por período maior que um mês (§ 6º; Portaria MTP
// 671/2021): a remuneração, o repouso semanal remunerado, os adicionais legais, as férias proporcionais com 1/3 e o 13º
// proporcional, discriminados no recibo (§ 7º). INSS e FGTS sobre os valores pagos no mês (§ 8º).
//
// Como o Consultor calcula (a folha mensal paga as horas trabalhadas na competência):
//   - remuneração = horas × valor da hora (o da convocação ou, sem ele, o da ficha);
//   - DSR, por convocação: remuneração ÷ dias úteis do período convocado × domingos e feriados dele (Lei 605/1949);
//   - adicional de insalubridade ou periculosidade da ficha, proporcional às horas (horas ÷ horas do mês da ficha);
//   - férias proporcionais = 1/12 da remuneração do mês (horas, DSR, adicionais, horas extras), mais 1/3;
//     13º proporcional = 1/12 da mesma remuneração;
//   - INSS: remuneração, DSR, adicionais, férias e 1/3 juntos (base mensal); o 13º em separado (Lei 8.212/1991, art. 28,
//     § 7º);
//   - IRRF (tabela do mês do pagamento): a remuneração na tabela mensal; as férias com 1/3 em separado (IN SRF 15/2001,
//     art. 13); o 13º em separado, tributação exclusiva (Lei 7.713/1988, art. 26);
//   - FGTS de 8% sobre tudo (Lei 8.036/1990, art. 15).
// Incidências sobre as férias do intermitente: o Consultor trata como férias gozadas (INSS e FGTS), não indenizadas.
// Está como aviso no cálculo para conferir com a contabilidade e o S-1010 da empresa.

import { centavosDeTexto, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente } from '../cadastros/tabelasLegais';
import { fichaNaCompetencia, type FichaFuncionario } from '../cadastros/funcionarios';
import { diaSemana, diasEntre, feriado, somarDias } from '../prazos/calendario';
import { adicionalDeRisco } from './adicionais';
import { inssDetalhado, irrfDetalhado } from './tributos';
import type { EntradaCalculo, ResultadoCalculo, Verba } from './motorMensal';

export const CATEGORIA_INTERMITENTE = '111';
export const ehIntermitente = (f: Pick<FichaFuncionario, 'dados'>) => f.dados.categoria === CATEGORIA_INTERMITENTE;

/** Um dia convocado e as horas (decimal: 7,5 = 7h30). */
export interface DiaConvocado { data: string; horas: number }
export type RespostaConvocacao = 'pendente' | 'aceita' | 'recusada';
export const ROTULO_RESPOSTA: Record<RespostaConvocacao, string> = { pendente: 'Aguardando resposta', aceita: 'Aceita', recusada: 'Recusada' };

export interface Convocacao {
    id: string;
    empresaId: string;
    fichaId: string;
    /** Dia em que a convocação foi enviada ao empregado (AAAA-MM-DD). */
    enviadaEm: string;
    resposta: RespostaConvocacao;
    respondidaEm: string;
    /** Função e local do serviço (vão no aviso de convocação). */
    funcao: string;
    local: string;
    /** Valor da hora em centavos; 0 = o da ficha. */
    valorHora: number;
    /** Dias e horas: os convocados; depois do serviço, os efetivamente trabalhados. */
    dias: DiaConvocado[];
    obs: string;
    atualizadoPor?: string;
}

export const convocacaoVazia = (empresaId: string, fichaId: string, id: string): Convocacao => ({
    id, empresaId, fichaId, enviadaEm: '', resposta: 'pendente', respondidaEm: '', funcao: '', local: '', valorHora: 0, dias: [], obs: '',
});

const data = /^\d{4}-\d{2}-\d{2}$/;
const brData = (d: string) => d.split('-').reverse().join('/');
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const ehUtil = (d: string) => diaSemana(d) !== 0 && diaSemana(d) !== 6 && !feriado(d);
/** Próximo dia útil depois de `d` (sábado, domingo e feriado nacional não contam). */
function diaUtilSeguinte(d: string): string {
    let x = somarDias(d, 1);
    while (!ehUtil(x)) x = somarDias(x, 1);
    return x;
}

/** Dias do período nos dias da semana escolhidos (0 = domingo … 6 = sábado), com as mesmas horas em cada um. */
export function diasDoPeriodo(inicio: string, fim: string, diasDaSemana: number[], horas: number): DiaConvocado[] {
    if (!data.test(inicio) || !data.test(fim) || fim < inicio || diasEntre(inicio, fim) > 366) return [];
    const out: DiaConvocado[] = [];
    for (let d = inicio; d <= fim; d = somarDias(d, 1)) if (diasDaSemana.includes(diaSemana(d))) out.push({ data: d, horas });
    return out;
}

export const inicioDe = (c: Pick<Convocacao, 'dias'>) => c.dias.map(x => x.data).sort()[0] ?? '';
export const fimDe = (c: Pick<Convocacao, 'dias'>) => c.dias.map(x => x.data).sort().at(-1) ?? '';
export const horasDe = (c: Pick<Convocacao, 'dias'>) => c.dias.reduce((s, x) => s + x.horas, 0);

/** Horas do mês da ficha (o divisor): as informadas, as semanais × 5 ou 220. */
export function horasMesDaFicha(d: FichaFuncionario['dados']): number {
    const informadas = Number((d.horasMes ?? '').replace(',', '.'));
    const semanais = Number((d.horasSemanais ?? '').replace(',', '.'));
    return informadas >= 1 && informadas <= 300 ? informadas : semanais > 0 ? semanais * 5 : 220;
}

/** Valor da hora pela ficha: o salário por hora; por dia ou por mês, dividido pelas horas (centavos). */
export function valorHoraDaFicha(d: FichaFuncionario['dados']): number {
    const contratual = centavosDeTexto(d.salario ?? '') ?? 0;
    if (!contratual) return 0;
    const horasMes = horasMesDaFicha(d);
    const unidade = d.unidadeSalario || '1';
    if (unidade === '1') return contratual;
    if (unidade === '2') return Math.round(contratual / (horasMes / 30));
    return Math.round(contratual / horasMes);
}

export interface Validacao { erros: string[]; avisos: string[] }

/**
 * Convocação: datas, horas, prazos do art. 452-A e conflito com outra convocação ou com as férias do intermitente.
 * `outras`: as demais convocações do empregado; `feriasGozo`: períodos de férias (afastamento 15) do empregado;
 * `valorHoraMinimo`: o salário mínimo-hora vigente (centavos), quando conhecido.
 */
export function validarConvocacao(c: Convocacao, ficha: FichaFuncionario, p: { outras?: Convocacao[]; feriasGozo?: { inicio: string; fim: string }[]; valorHoraMinimo?: number; valorHoraFicha?: number } = {}): Validacao {
    const erros: string[] = []; const avisos: string[] = [];
    if (!ehIntermitente(ficha)) erros.push('A ficha não é de intermitente (categoria 111 do eSocial).');
    if (!c.dias.length) erros.push('Informe os dias e as horas da convocação.');
    const vistos = new Set<string>();
    for (const d of c.dias) {
        if (!data.test(d.data)) { erros.push(`Data inválida: ${d.data || '(vazia)'}.`); continue; }
        if (vistos.has(d.data)) erros.push(`${brData(d.data)} repetido na convocação.`);
        vistos.add(d.data);
        if (!(d.horas > 0) || d.horas > 24) erros.push(`${brData(d.data)}: horas entre 0 e 24.`);
        else if (d.horas > 10) avisos.push(`${brData(d.data)}: ${num(d.horas)} h passam de 10 h no dia (8 h + 2 h extras; CLT, art. 59).`);
        if (ficha.dados.admissao && d.data < ficha.dados.admissao) erros.push(`${brData(d.data)}: antes da admissão (${brData(ficha.dados.admissao)}).`);
        if (ficha.dados.dataDesligamento && d.data > ficha.dados.dataDesligamento) erros.push(`${brData(d.data)}: depois do desligamento (${brData(ficha.dados.dataDesligamento)}).`);
        for (const f of p.feriasGozo ?? []) if (d.data >= f.inicio && d.data <= (f.fim || f.inicio))
            erros.push(`${brData(d.data)}: o empregado está de férias (${brData(f.inicio)} a ${brData(f.fim || f.inicio)}) e não pode ser convocado (art. 452-A, § 9º).`);
    }
    for (const o of p.outras ?? []) {
        if (o.id === c.id || o.resposta === 'recusada') continue;
        const comuns = o.dias.filter(x => vistos.has(x.data)).map(x => brData(x.data));
        if (comuns.length) erros.push(`Dia(s) ${comuns.join(', ')} já em outra convocação.`);
    }
    if (c.valorHora < 0) erros.push('Valor da hora não pode ser negativo.');
    const vh = c.valorHora > 0 ? c.valorHora : p.valorHoraFicha ?? 0;
    if (!vh) erros.push('Sem valor da hora: informe na convocação ou o salário na ficha.');
    else if (p.valorHoraMinimo && vh < p.valorHoraMinimo) erros.push(`Valor da hora ${reais(vh)} abaixo do salário mínimo-hora (${reais(p.valorHoraMinimo)}; art. 452-A, caput).`);
    const ini = inicioDe(c);
    if (!data.test(c.enviadaEm)) erros.push('Informe a data em que a convocação foi enviada.');
    else if (ini && c.enviadaEm > ini) erros.push('A convocação foi enviada depois do início do serviço.');
    else if (ini && diasEntre(c.enviadaEm, ini) < 3) avisos.push(`Convocação com ${diasEntre(c.enviadaEm, ini)} dia(s) de antecedência: a CLT pede pelo menos 3 dias corridos (art. 452-A, § 1º).`);
    if (c.resposta !== 'pendente') {
        if (!data.test(c.respondidaEm)) erros.push('Informe a data da resposta do empregado.');
        else if (data.test(c.enviadaEm) && c.respondidaEm < c.enviadaEm) erros.push('A resposta é anterior ao envio da convocação.');
        else if (c.resposta === 'aceita' && data.test(c.enviadaEm) && c.respondidaEm > diaUtilSeguinte(c.enviadaEm))
            avisos.push(`Aceite em ${brData(c.respondidaEm)}, depois de 1 dia útil do envio (até ${brData(diaUtilSeguinte(c.enviadaEm))}): pela CLT o silêncio é recusa (art. 452-A, § 2º). Guarde o aceite por escrito.`);
    }
    return { erros, avisos };
}

/** Períodos aquisitivos de férias do intermitente: a cada 12 meses, 1 mês sem convocação nos 12 meses seguintes (§ 9º). */
export function periodosDeFerias(admissao: string, ate: string): { aquisitivo: [string, string]; concederAte: string }[] {
    if (!data.test(admissao) || !data.test(ate)) return [];
    const out: { aquisitivo: [string, string]; concederAte: string }[] = [];
    const mais = (d: string, anos: number) => { const [a, m, dd] = d.split('-'); return `${Number(a) + anos}-${m}-${dd === '29' && m === '02' ? '28' : dd}`; };
    for (let i = 0; i < 60; i++) {
        const ini = mais(admissao, i); const fim = somarDias(mais(admissao, i + 1), -1);
        if (fim > ate) break;
        out.push({ aquisitivo: [ini, fim], concederAte: somarDias(mais(admissao, i + 2), -1) });
    }
    return out;
}

/** Dias trabalhados na competência (convocações aceitas), com o valor da hora de cada um. */
export function diasNaCompetencia(convocacoes: Convocacao[], fichaId: string, competencia: string): { convocacao: Convocacao; dias: DiaConvocado[] }[] {
    return convocacoes.filter(c => c.fichaId === fichaId && c.resposta === 'aceita')
        .map(c => ({ convocacao: c, dias: c.dias.filter(d => d.data.slice(0, 7) === competencia && d.horas > 0).sort((a, b) => a.data.localeCompare(b.data)) }))
        .filter(x => x.dias.length);
}

/**
 * Folha mensal do intermitente: as convocações aceitas com dias na competência. Chamada pelo motor mensal
 * (calcularMensal) para a categoria 111; usa o mesmo resultado (verbas, bases, totais) e grava os dias trabalhados
 * para o S-1200 (infoInterm).
 */
export function calcularIntermitente(e: EntradaCalculo, r: ResultadoCalculo): ResultadoCalculo {
    const { competencia } = e;
    const ficha = fichaNaCompetencia(e.ficha, competencia).ficha;
    const d = ficha.dados;
    const mov = e.movimento ?? {};
    const pagamento = r.pagamento;
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; return r; };
    const conv = diasNaCompetencia(e.convocacoes ?? [], ficha.id, competencia);
    r.memoria.push('Trabalho intermitente (CLT, art. 452-A): paga as horas das convocações aceitas na competência, o DSR, os adicionais, as férias proporcionais com 1/3 e o 13º proporcional (§ 6º).');
    if (e.convocacoes === undefined) { r.avisos.push('Convocações do intermitente não carregadas: abra a folha pela tela do cálculo.'); r.situacao = 'incompleto'; return r; }
    if (!conv.length) {
        r.memoria.push(`Nenhuma convocação aceita com dias em ${rotuloCompetencia(competencia)}: sem remuneração no mês (o S-1200 não vai).`);
        r.diasIntermitente = [];
        return r;
    }

    // Valor da hora da ficha: salário ÷ horas do mês (por hora, o próprio).
    const horasMesFicha = horasMesDaFicha(d);
    const valorHoraFicha = valorHoraDaFicha(d);

    // 1. Horas e DSR por convocação.
    let remuneracao = 0; let dsr = 0; let horasTotal = 0;
    const dias: { dia: number; horas: number }[] = [];
    for (const { convocacao: c, dias: ds } of conv) {
        const vh = c.valorHora > 0 ? c.valorHora : valorHoraFicha;
        if (!vh) return erro(`Convocação de ${brData(ds[0].data)}: sem valor da hora (nem na convocação nem na ficha).`);
        const horas = ds.reduce((s, x) => s + x.horas, 0);
        const v = Math.round(vh * horas);
        remuneracao += v; horasTotal += horas;
        for (const x of ds) {
            const dia = Number(x.data.slice(8));
            const ja = dias.find(y => y.dia === dia);
            if (ja) ja.horas += x.horas; else dias.push({ dia, horas: x.horas });
        }
        // DSR do período convocado (Lei 605/1949, art. 7º): do 1º ao último dia da convocação no mês, estendido até o
        // domingo (ou feriado) logo em seguida, passando pelo sábado; dias úteis contam o sábado, como no mensalista.
        const descansa = (x: string) => diaSemana(x) === 0 || !!feriado(x);
        let fimDsr = ds[ds.length - 1].data;
        for (let x = somarDias(fimDsr, 1); x.slice(0, 7) === competencia && (diaSemana(x) === 6 || descansa(x)); x = somarDias(x, 1)) {
            fimDsr = x;
            if (descansa(x)) break;
        }
        let uteis = 0; let descanso = 0;
        for (let x = ds[0].data; x <= fimDsr; x = somarDias(x, 1)) { if (descansa(x)) descanso++; else uteis++; }
        const dsrC = uteis && descanso ? Math.round(v / uteis * descanso) : 0;
        dsr += dsrC;
        r.memoria.push(`Convocação ${c.funcao ? `(${c.funcao}) ` : ''}com ${ds.length} dia(s) entre ${brData(ds[0].data)} e ${brData(ds[ds.length - 1].data)}: ${num(horas)} h × ${reais(vh)}/h${c.valorHora > 0 ? ' (valor da convocação)' : ' (valor da ficha)'} = ${reais(v)}`
            + (dsrC ? `; DSR ${reais(v)} ÷ ${uteis} dia(s) útil(eis) × ${descanso} domingo(s)/feriado(s) = ${reais(dsrC)}.` : '; sem domingo ou feriado no período, sem DSR.'));
    }
    verba({ codigo: 'INTERM', descricao: 'Remuneração do trabalho intermitente', referencia: `${num(horasTotal)} h`, tipo: 'provento', valor: remuneracao, inss: true, fgts: true, irrf: true });
    verba({ codigo: 'DSRINT', descricao: 'DSR do trabalho intermitente', referencia: '', tipo: 'provento', valor: dsr, inss: true, fgts: true, irrf: true });
    r.diasIntermitente = dias.sort((a, b) => a.dia - b.dia);
    if (mov.feriadosLocais) r.avisos.push('Feriados locais do movimento não entram no DSR do intermitente: lance a diferença como provento, se houver.');

    // 2. Adicional de risco, proporcional às horas.
    const valorHoraMedio = horasTotal ? remuneracao / horasTotal : valorHoraFicha;
    const adic = adicionalDeRisco(d, Math.round(valorHoraFicha * horasMesFicha), e.tabelas, competencia);
    r.avisos.push(...adic.avisos);
    let adicional = 0;
    if (adic.erro) { r.avisos.push(adic.erro); r.situacao = 'incompleto'; }
    else if (adic.adicional) {
        adicional = Math.round(adic.adicional.mensal * horasTotal / horasMesFicha);
        verba({ codigo: adic.adicional.codigo, descricao: adic.adicional.descricao, referencia: `${adic.adicional.referencia} · ${num(horasTotal)} h`, tipo: 'provento', valor: adicional, inss: true, fgts: true, irrf: true });
        r.memoria.push(`${adic.adicional.descricao}: ${reais(adic.adicional.mensal)} (mês de ${num(horasMesFicha)} h) × ${num(horasTotal)} h ÷ ${num(horasMesFicha)} h = ${reais(adicional)}.`);
    }

    // 3. Horas extras do movimento (sobre o valor médio da hora com o adicional) e lançamentos.
    const vhExtra = valorHoraMedio + (horasTotal ? adicional / horasTotal : 0);
    let extras = 0;
    for (const [pct, h, cod] of [[50, mov.horasExtras50 ?? 0, 'HE50'], [100, mov.horasExtras100 ?? 0, 'HE100']] as [number, number, string][]) {
        if (!(h > 0)) continue;
        const v = Math.round(vhExtra * (1 + pct / 100) * h); extras += v;
        verba({ codigo: cod, descricao: `Horas extras ${pct}%`, referencia: `${num(h)} h`, tipo: 'provento', valor: v, inss: true, fgts: true, irrf: true });
        r.memoria.push(`Horas extras ${pct}%: ${num(h)} h × ${reais(Math.round(vhExtra))}/h × ${num(1 + pct / 100)} = ${reais(v)}.`);
    }
    let salariais = 0;
    (mov.lancamentos ?? []).forEach((l, i) => {
        verba({ ...l, codigo: `LAN${i + 1}`, referencia: '', valor: Math.round(l.valor) });
        if (l.tipo === 'provento' && l.inss) salariais += Math.round(l.valor);
    });

    // 4. Férias proporcionais com 1/3 e 13º proporcional (§ 6º, II e III): 1/12 da remuneração do mês.
    const baseProporcionais = remuneracao + dsr + adicional + extras + salariais;
    const ferias = Math.round(baseProporcionais / 12);
    const terco = Math.round(ferias / 3);
    const decimo = Math.round(baseProporcionais / 12);
    verba({ codigo: 'FERINT', descricao: 'Férias proporcionais (intermitente)', referencia: '1/12', tipo: 'provento', valor: ferias, inss: true, fgts: true, irrf: true });
    verba({ codigo: 'FERINT13', descricao: '1/3 das férias proporcionais (intermitente)', referencia: '', tipo: 'provento', valor: terco, inss: true, fgts: true, irrf: true });
    verba({ codigo: '13INT', descricao: '13º salário proporcional (intermitente)', referencia: '1/12', tipo: 'provento', valor: decimo, inss: true, fgts: true, irrf: true });
    r.memoria.push(`Férias proporcionais: ${reais(baseProporcionais)} (remuneração do mês) ÷ 12 = ${reais(ferias)}, mais 1/3 = ${reais(terco)}; 13º proporcional: ${reais(baseProporcionais)} ÷ 12 = ${reais(decimo)}.`);
    r.avisos.push('Intermitente: as férias proporcionais com 1/3 entram nas bases do INSS e do FGTS (tratadas como férias gozadas, não indenizadas). Confira as incidências das rubricas no S-1010 com a contabilidade.');

    // 5. INSS: mensal (com as férias) e o do 13º em separado.
    const tInss = tabelaVigente(e.tabelas, 'inss', competencia);
    if ('erro' in tInss) return erro(tInss.erro);
    const lanc = (f: (v: Verba) => boolean) => r.verbas.filter(f).reduce((s, v) => s + (v.tipo === 'provento' ? v.valor : -v.valor), 0);
    const baseInss = Math.max(0, lanc(v => v.inss && v.codigo !== '13INT'));
    const inss = inssDetalhado(baseInss, tInss.tabela);
    const inss13 = inssDetalhado(decimo, tInss.tabela);
    verba({ codigo: 'INSS', descricao: 'INSS', referencia: '', tipo: 'desconto', valor: inss.valor, inss: false, fgts: false, irrf: false });
    verba({ codigo: 'INSS13', descricao: 'INSS sobre 13º salário', referencia: '', tipo: 'desconto', valor: inss13.valor, inss: false, fgts: false, irrf: false });
    r.memoria.push(`INSS do mês (tabela de ${rotuloCompetencia(tInss.tabela.vigencia)}): ${inss.memoria}.`, `INSS do 13º (em separado): ${inss13.memoria}.`);
    r.bases.inss = baseInss + decimo;
    const minimo = tabelaVigente(e.tabelas, 'salario_minimo', competencia);
    const sm = 'erro' in minimo ? 0 : minimo.tabela.valores.salarioMinimo ?? 0;
    if (sm && baseInss < sm) r.avisos.push(`Remuneração do mês (${reais(baseInss)}) abaixo do salário mínimo (${reais(sm)}): o próprio empregado pode complementar a contribuição para o mês contar para a Previdência (EC 103/2019, art. 29). Oriente o empregado.`);

    // 6. Salário-família (cota integral se a remuneração do mês está no limite).
    const filhos = ficha.dependentes.filter(x => x.salarioFamilia === 'S');
    if (filhos.length) r.avisos.push('Salário-família do intermitente: não calculado nesta versão; confira e lance se houver direito.');

    // 7. Pensão alimentícia do movimento (sobre o mês e sobre o 13º).
    const pensao = Math.round(mov.pensaoAlimenticia ?? 0);
    const pensao13 = Math.round(mov.pensao13 ?? 0);
    verba({ codigo: 'PENSAO', descricao: 'Pensão alimentícia', referencia: '', tipo: 'desconto', valor: pensao, inss: false, fgts: false, irrf: false });
    verba({ codigo: 'PENSAO13', descricao: 'Pensão alimentícia sobre 13º', referencia: '', tipo: 'desconto', valor: pensao13, inss: false, fgts: false, irrf: false });

    // 8. IRRF (tabela do mês do pagamento): mensal, férias em separado e 13º exclusivo.
    const tIr = tabelaVigente(e.tabelas, 'irrf', pagamento);
    if ('erro' in tIr) return erro(`IRRF: ${tIr.erro}`);
    const deps = ficha.dependentes.filter(x => x.irrf === 'S' && x.pensao !== 'S');
    const opcoes = { simplificado: true, redutor: true };
    const feriasTotal = ferias + terco;
    // O INSS do mês tem as férias: a parte delas (proporcional) deduz no IRRF das férias.
    const inssFerias = baseInss ? Math.round(inss.valor * feriasTotal / baseInss) : 0;
    const rendMensal = Math.max(0, lanc(v => v.irrf && !['FERINT', 'FERINT13', '13INT'].includes(v.codigo)));
    const irMes = irrfDetalhado({ rendimento: rendMensal, inss: inss.valor - inssFerias, dependentes: deps.length, pensao, tabela: tIr.tabela, opcoes, rotulo: `IRRF do mês (pagamento em ${rotuloCompetencia(pagamento)})` });
    const irFer = irrfDetalhado({ rendimento: feriasTotal, inss: inssFerias, dependentes: deps.length, tabela: tIr.tabela, opcoes, rotulo: 'IRRF das férias proporcionais (em separado)' });
    const ir13 = irrfDetalhado({ rendimento: decimo, inss: inss13.valor, dependentes: deps.length, pensao: pensao13, tabela: tIr.tabela, opcoes, rotulo: 'IRRF do 13º proporcional (exclusivo na fonte)' });
    verba({ codigo: 'IRRF', descricao: 'IRRF', referencia: irMes.aliquota ? `${num(irMes.aliquota)}%` : '', tipo: 'desconto', valor: irMes.valor, inss: false, fgts: false, irrf: false });
    verba({ codigo: 'IRRFFER', descricao: 'IRRF sobre férias', referencia: irFer.aliquota ? `${num(irFer.aliquota)}%` : '', tipo: 'desconto', valor: irFer.valor, inss: false, fgts: false, irrf: false });
    verba({ codigo: 'IRRF13', descricao: 'IRRF sobre 13º salário', referencia: ir13.aliquota ? `${num(ir13.aliquota)}%` : '', tipo: 'desconto', valor: ir13.valor, inss: false, fgts: false, irrf: false });
    r.memoria.push(...irMes.memoria, ...irFer.memoria, ...ir13.memoria);
    if (inssFerias) r.memoria.push(`INSS deduzido no IRRF das férias: ${reais(inss.valor)} × ${reais(feriasTotal)} ÷ ${reais(baseInss)} = ${reais(inssFerias)} (o restante no IRRF do mês).`);
    r.bases.irrf = rendMensal;
    r.irrfApurado = { rendimentos: rendMensal, deducoesLegais: irMes.simplificado ? 0 : inss.valor - inssFerias + pensao, valor: irMes.valor };
    const porDependente = tIr.tabela.valores.deducaoDependente ?? 0;
    const lista = deps.map(x => ({ cpf: x.cpf, nome: x.nome }));
    r.deducoesIrrf = { simplificado: irMes.simplificado, dependentes: lista, porDependente, pensao };
    r.deducoesIntermitente = {
        ferias: { simplificado: irFer.simplificado, dependentes: lista, porDependente },
        decimo: { simplificado: ir13.simplificado, dependentes: lista, porDependente, pensao: pensao13 },
    };

    // 9. FGTS de 8% sobre tudo.
    r.bases.fgts = Math.max(0, lanc(v => v.fgts));
    r.fgts = Math.round(r.bases.fgts * 8 / 100);
    r.memoria.push(`FGTS: ${reais(r.bases.fgts)} × 8% = ${reais(r.fgts)} (art. 452-A, § 8º).`);
    if (d.valeTransporte === 'S' && mov.valeTransporte === undefined) r.avisos.push('Vale-transporte do intermitente: informe no movimento o desconto do mês (6% das horas pagas, limitado ao custo dos dias convocados).');
    else if (mov.valeTransporte) verba({ codigo: 'VT', descricao: 'Vale-transporte', referencia: '', tipo: 'desconto', valor: Math.round(mov.valeTransporte), inss: false, fgts: false, irrf: false });

    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    if (r.totais.liquido < 0) r.avisos.push('Líquido negativo: confira os descontos.');
    if (r.avisos.some(a => /não carregadas/.test(a))) r.situacao = 'incompleto';
    return r;
}
