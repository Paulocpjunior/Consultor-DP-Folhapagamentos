// services/conferencia/conferenciaMotorIob.ts
//
// Conferência do motor de cálculo com a folha que o IOB transmitiu ao eSocial
// (Paulo, 07/10/2026: "pode seguir com a conferência de cálculo IOB"). É o
// critério da Fase 3 do plano: diferença zero contra o IOB por 3
// competências seguidas.
//
// Fonte do IOB: o S-1200 (rubricas e valores de cada trabalhador no mês), com
// o tipo e a natureza de cada rubrica pelo S-1010; quando vierem junto, o
// S-5001 (INSS descontado apurado pelo eSocial) e o S-5003 (base e depósito
// de FGTS). É o padrão do eSocial: vale para o .zip do "Download de eventos"
// e para os XMLs soltos, sem leitura por IA.
//
// Valores em CENTAVOS. Nada é gravado aqui.

import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { consolidarRubricas, lerXmlRubricas, vigenciaEm, type EventoRubrica, type Rubrica } from '../cadastros/rubricas';
import { centavos, lerTotalizadoresXml, type S5001, type S5003 } from './totalizadores';
import { lerZip } from '../implantacao/zip';

// ─── leitura do S-1200 ──────────────────────────────────────────────────────

export interface ItemRemun { codRubr: string; ideTabRubr: string; qtd: string; valor: number }
export interface RemuneracaoIob {
    id: string; arquivo: string; perApur: string; cpf: string; matriculas: string[]; categorias: string[];
    indRetif: string; processadoEm: string; recibo: string;
    itens: ItemRemun[];
    /** Há remuneração de períodos anteriores (infoPerAnt): fica fora da conferência do mês. */
    periodoAnterior: boolean;
}

const filhos = (e: Element, n: string) => Array.from(e.children).filter(c => c.localName === n);
const no = (e: Element | null | undefined, caminho: string) => caminho.split('/').reduce<Element | undefined>((p, n) => p && filhos(p, n)[0], e ?? undefined);
const val = (e: Element | null | undefined, caminho: string) => no(e, caminho)?.textContent?.trim() ?? '';

/** S-1200 mensais do XML (solto ou no envelope do download); os anuais (13º) ficam de fora. */
export function lerS1200Xml(xml: string, arquivo: string, raizCnpj: string): { remuneracoes: RemuneracaoIob[]; avisos: string[] } {
    const avisos: string[] = []; const remuneracoes: RemuneracaoIob[] = [];
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return { remuneracoes, avisos: [`${arquivo}: XML com DTD ou entidades não é aceito.`] };
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return { remuneracoes, avisos: [`${arquivo}: XML malformado.`] };
    for (const el of Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === 'evtRemun')) {
        if (val(el, 'ideEmpregador/nrInsc').slice(0, 8) !== raizCnpj) { avisos.push(`${arquivo}: S-1200 de outro empregador; ignorado.`); continue; }
        if (val(el, 'ideEvento/tpAmb') && val(el, 'ideEvento/tpAmb') !== '1') { avisos.push(`${arquivo}: S-1200 fora do ambiente de produção; ignorado.`); continue; }
        if (val(el, 'ideEvento/indApuracao') === '2') continue; // 13º: conferido na folha do 13º
        const perApur = val(el, 'ideEvento/perApur');
        if (!/^\d{4}-\d{2}$/.test(perApur)) { avisos.push(`${arquivo}: S-1200 sem período de apuração mensal; ignorado.`); continue; }
        let env: Element | null = el.parentElement;
        while (env && env.localName !== 'retornoEventoCompleto') env = env.parentElement;
        const ret = env ? no(env, 'recibo/eSocial/retornoEvento') : undefined;
        if (ret && val(ret, 'processamento/cdResposta') && val(ret, 'processamento/cdResposta') !== '201') { avisos.push(`${arquivo}: S-1200 recusado pelo eSocial; ignorado.`); continue; }
        const itens: ItemRemun[] = []; const matriculas = new Set<string>(); const categorias = new Set<string>();
        let periodoAnterior = false;
        for (const dm of filhos(el, 'dmDev')) {
            if (val(dm, 'codCateg')) categorias.add(val(dm, 'codCateg'));
            if (no(dm, 'infoPerAnt')) periodoAnterior = true;
            for (const est of filhos(no(dm, 'infoPerApur') ?? dm, 'ideEstabLot')) {
                for (const rem of filhos(est, 'remunPerApur')) {
                    if (val(rem, 'matricula')) matriculas.add(val(rem, 'matricula'));
                    for (const it of filhos(rem, 'itensRemun')) {
                        itens.push({ codRubr: val(it, 'codRubr'), ideTabRubr: val(it, 'ideTabRubr'), qtd: val(it, 'qtdRubr'), valor: centavos(val(it, 'vrRubr')) });
                    }
                }
            }
        }
        remuneracoes.push({
            id: el.getAttribute('Id') ?? '', arquivo, perApur, cpf: val(el, 'ideTrabalhador/cpfTrab'), matriculas: [...matriculas], categorias: [...categorias],
            indRetif: val(el, 'ideEvento/indRetif') || '1', processadoEm: ret ? val(ret, 'processamento/dhProcessamento') : '', recibo: ret ? val(ret, 'recibo/nrRecibo') : '',
            itens, periodoAnterior,
        });
    }
    return { remuneracoes, avisos };
}

/** Um S-1200 por trabalhador e mês: o retificador (ou o processado por último) vale sobre o original. */
export function ultimaRemuneracao(lista: RemuneracaoIob[]): RemuneracaoIob[] {
    const porChave = new Map<string, RemuneracaoIob>();
    const unicos = [...new Map(lista.map(r => [r.id || `${r.arquivo}|${r.cpf}|${r.perApur}`, r])).values()];
    for (const r of unicos) {
        const k = `${r.perApur}|${r.cpf}`;
        const a = porChave.get(k);
        const depois = !a || (r.processadoEm && a.processadoEm ? r.processadoEm > a.processadoEm : r.indRetif === '2' && a.indRetif !== '2');
        if (depois) porChave.set(k, r);
    }
    return [...porChave.values()];
}

export interface LeituraEsocialIob {
    remuneracoes: RemuneracaoIob[];
    rubricasDoArquivo: EventoRubrica[];
    s5001: S5001[];
    s5003: S5003[];
    avisos: string[];
}

function decodificar(bytes: Uint8Array): string {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('windows-1252').decode(bytes); }
}

/** Lê .xml e .zip (o do "Download de eventos" ou um com os XMLs): S-1200, S-1010, S-5001 e S-5003. */
export async function lerEsocialIob(arquivos: { nome: string; bytes: Uint8Array }[], cnpj: string): Promise<LeituraEsocialIob> {
    const raiz = cnpj.replace(/\D/g, '').slice(0, 8);
    const r: LeituraEsocialIob = { remuneracoes: [], rubricasDoArquivo: [], s5001: [], s5003: [], avisos: [] };
    const fila = [...arquivos]; let abertos = 0; let semNada = 0;
    while (fila.length) {
        const a = fila.shift()!;
        if (/\.zip$/i.test(a.nome)) {
            if (abertos++ > 50) { r.avisos.push(`${a.nome}: zip dentro de zip demais; não foi aberto.`); continue; }
            try { for (const x of await lerZip(a.bytes)) fila.push({ nome: `${a.nome}/${x.nome}`, bytes: x.bytes }); }
            catch (e) { r.avisos.push(`${a.nome}: ${(e as Error).message}`); }
            continue;
        }
        if (!/\.xml$/i.test(a.nome)) continue;
        const xml = decodificar(a.bytes);
        let achou = false;
        if (/evtRemun/.test(xml)) { const s = lerS1200Xml(xml, a.nome, raiz); r.remuneracoes.push(...s.remuneracoes); r.avisos.push(...s.avisos); achou = true; }
        if (/evtTabRubrica/.test(xml)) { const s = lerXmlRubricas(a.nome, xml, raiz); r.rubricasDoArquivo.push(...s.eventos); achou = true; }
        if (/evtBasesTrab|evtBasesFGTS/.test(xml)) {
            try {
                for (const t of lerTotalizadoresXml(xml, a.nome)) {
                    if (t.empregador.slice(0, 8) !== raiz || t.indApuracao === '2') continue;
                    if (t.tipo === 'S-5001') r.s5001.push(t); else if (t.tipo === 'S-5003') r.s5003.push(t);
                }
                achou = true;
            } catch (e) { r.avisos.push(`${a.nome}: ${(e as Error).message}`); }
        }
        if (!achou) semNada++;
    }
    if (semNada) r.avisos.push(`${semNada} arquivo(s) sem S-1200, S-1010, S-5001 ou S-5003 (outros eventos do download); ignorado(s).`);
    r.remuneracoes = ultimaRemuneracao(r.remuneracoes);
    const unicos = <T extends { id: string }>(l: T[]) => [...new Map(l.map(t => [t.id || Math.random().toString(), t])).values()];
    r.s5001 = unicos(r.s5001); r.s5003 = unicos(r.s5003);
    return r;
}

// ─── comparação ─────────────────────────────────────────────────────────────

/** Natureza (Tabela 03 do eSocial) das rubricas comparadas uma a uma. */
export const NATUREZA = { salario: '1000', salarioFamilia: '1409', inss: '9201', irrf: '9203' } as const;

export type ItemComparado = 'Proventos' | 'Descontos' | 'Líquido' | 'Salário' | 'INSS' | 'IRRF' | 'Salário-família' | 'INSS (S-5001)' | 'Base FGTS (S-5003)' | 'FGTS (S-5003)';
export interface LinhaItem { item: ItemComparado; motor: number; iob: number; diferenca: number; ok: boolean }
/** Rubrica do IOB no mês, com o que o S-1010 diz dela. */
export interface RubricaDoMes { codRubr: string; ideTabRubr: string; descricao: string; tpRubr: string; natRubr: string; qtd: string; valor: number }

export type SituacaoLinha = 'confere' | 'diverge' | 'sem-ficha' | 'sem-s1200' | 'motor-incompleto' | 'rubrica-sem-tipo';
export const ROTULO_SITUACAO: Record<SituacaoLinha, string> = {
    confere: 'confere', diverge: 'diverge', 'sem-ficha': 'S-1200 sem ficha', 'sem-s1200': 'sem S-1200 do IOB',
    'motor-incompleto': 'cálculo incompleto ou com erro', 'rubrica-sem-tipo': 'rubrica sem S-1010',
};

export interface LinhaFuncionario {
    competencia: string; cpf: string; nome: string; fichaId: string;
    situacao: SituacaoLinha;
    itens: LinhaItem[];
    rubricas: RubricaDoMes[];
    observacoes: string[];
}
export interface ResumoCompetencia {
    competencia: string; linhas: LinhaFuncionario[];
    confere: number; diverge: number; pendentes: number;
    /** Todos os trabalhadores comparados conferem e nada ficou pendente. */
    zerada: boolean;
}
export interface ResultadoConferenciaIob {
    competencias: ResumoCompetencia[];
    /** Maior sequência de competências seguidas sem diferença (critério da Fase 3: 3). */
    sequencia: { inicio: string; fim: string; meses: number };
    criterioAtingido: boolean;
    avisos: string[];
}

const v = (r: ResultadoCalculo, ...codigos: string[]) => r.verbas.filter(x => codigos.includes(x.codigo)).reduce((s, x) => s + x.valor, 0);
const digitos = (t: string) => (t ?? '').replace(/\D/g, '');
const proximaCompetencia = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };

export interface EntradaConferenciaIob {
    leitura: Pick<LeituraEsocialIob, 'remuneracoes' | 's5001' | 's5003'>;
    /** Rubricas da empresa (Cadastros › Incidências) já com as do arquivo. */
    rubricas: Rubrica[];
    fichas: FichaFuncionario[];
    /** Resultado do motor na competência (folha mensal). */
    motor: (competencia: string) => ResultadoCalculo[];
    /** Funcionários com férias gozadas no mês (observação na linha). */
    comFerias?: (competencia: string) => Set<string>;
    /** Tolerância por item, em centavos (padrão 0: diferença zero). */
    tolerancia?: number;
}

/** Junta as rubricas gravadas com as do arquivo (o arquivo completa; não apaga as gravadas). */
export function rubricasParaConferencia(gravadas: Rubrica[], doArquivo: EventoRubrica[], empresaId: string): { rubricas: Rubrica[]; avisos: string[] } {
    const { rubricas, avisos } = consolidarRubricas(doArquivo, empresaId);
    const mapa = new Map(gravadas.map(r => [`${r.ideTabRubr}|${r.codRubr}`, r]));
    for (const r of rubricas) if (!mapa.has(`${r.ideTabRubr}|${r.codRubr}`)) mapa.set(`${r.ideTabRubr}|${r.codRubr}`, r);
    return { rubricas: [...mapa.values()], avisos };
}

export function conferirMotorComIob(e: EntradaConferenciaIob): ResultadoConferenciaIob {
    const tol = e.tolerancia ?? 0;
    const avisos: string[] = [];
    const rubrica = new Map(e.rubricas.map(r => [`${r.ideTabRubr}|${r.codRubr}`, r]));
    const porCpf = new Map(e.fichas.map(f => [digitos(f.cpf), f]));
    const porMatricula = new Map(e.fichas.filter(f => f.matriculaEsocial).map(f => [f.matriculaEsocial, f]));
    const competencias = [...new Set(e.leitura.remuneracoes.map(r => r.perApur))].sort();
    const semRubrica = new Set<string>();
    const resumo: ResumoCompetencia[] = [];

    for (const c of competencias) {
        const motor = e.motor(c);
        const motorPorFicha = new Map(motor.map(r => [r.fichaId, r]));
        const ferias = e.comFerias?.(c) ?? new Set<string>();
        const s5001 = e.leitura.s5001.filter(t => t.perApur === c);
        const s5003 = e.leitura.s5003.filter(t => t.perApur === c);
        const linhas: LinhaFuncionario[] = [];
        const vistos = new Set<string>();
        for (const rem of e.leitura.remuneracoes.filter(r => r.perApur === c)) {
            const ficha = porCpf.get(digitos(rem.cpf)) ?? rem.matriculas.map(m => porMatricula.get(m)).find(Boolean);
            const observacoes: string[] = [];
            const rubricas: RubricaDoMes[] = rem.itens.map(it => {
                const r = rubrica.get(`${it.ideTabRubr}|${it.codRubr}`);
                const vig = r ? vigenciaEm(r, c) : undefined;
                if (!vig) semRubrica.add(`${it.codRubr} (tabela ${it.ideTabRubr || '-'})`);
                return { codRubr: it.codRubr, ideTabRubr: it.ideTabRubr, descricao: vig?.dados.dscRubr ?? '', tpRubr: vig?.dados.tpRubr ?? '', natRubr: vig?.dados.natRubr ?? '', qtd: it.qtd, valor: it.valor };
            });
            if (rem.periodoAnterior) observacoes.push('O S-1200 tem remuneração de períodos anteriores (infoPerAnt), fora desta conferência.');
            const base = { competencia: c, cpf: rem.cpf, nome: ficha?.dados.nome || rem.cpf, fichaId: ficha?.id ?? '', rubricas, observacoes };
            if (!ficha) { linhas.push({ ...base, situacao: 'sem-ficha', itens: [] }); continue; }
            vistos.add(ficha.id);
            const m = motorPorFicha.get(ficha.id);
            if (!m || m.situacao !== 'calculado') {
                if (m) observacoes.push(...m.erros, ...m.avisos);
                linhas.push({ ...base, situacao: 'motor-incompleto', itens: [] }); continue;
            }
            const soma = (f: (x: RubricaDoMes) => boolean) => rubricas.filter(f).reduce((s, x) => s + x.valor, 0);
            const semTipo = rubricas.some(x => !x.tpRubr);
            const itens: LinhaItem[] = [];
            const comparar = (item: ItemComparado, motorV: number, iobV: number) => {
                const diferenca = motorV - iobV;
                itens.push({ item, motor: motorV, iob: iobV, diferenca, ok: Math.abs(diferenca) <= tol });
            };
            if (!semTipo) {
                const prov = soma(x => x.tpRubr === '1'); const desc = soma(x => x.tpRubr === '2');
                comparar('Proventos', m.totais.proventos, prov);
                comparar('Descontos', m.totais.descontos, desc);
                comparar('Líquido', m.totais.liquido, prov - desc);
            }
            const porNatureza = (n: string) => soma(x => x.natRubr === n);
            comparar('Salário', v(m, 'SAL'), porNatureza(NATUREZA.salario));
            comparar('INSS', v(m, 'INSS'), porNatureza(NATUREZA.inss));
            comparar('IRRF', v(m, 'IRRF'), porNatureza(NATUREZA.irrf));
            comparar('Salário-família', v(m, 'SF'), porNatureza(NATUREZA.salarioFamilia));
            const t1 = s5001.filter(t => digitos(t.cpf) === digitos(rem.cpf));
            if (t1.length) comparar('INSS (S-5001)', v(m, 'INSS'), t1.flatMap(t => t.calculos).reduce((s, x) => s + x.descontado, 0));
            const t3 = s5003.filter(t => digitos(t.cpf) === digitos(rem.cpf)).flatMap(t => t.itens).filter(i => !i.periodoAnterior);
            if (t3.length) {
                comparar('Base FGTS (S-5003)', m.bases.fgts, t3.reduce((s, i) => s + i.remuneracao, 0));
                comparar('FGTS (S-5003)', m.fgts, t3.reduce((s, i) => s + i.deposito, 0));
            }
            if (semTipo) observacoes.push('Há rubrica sem o S-1010 (tipo e natureza): proventos, descontos e líquido não foram comparados.');
            const situacao: SituacaoLinha = semTipo ? 'rubrica-sem-tipo' : itens.every(i => i.ok) ? 'confere' : 'diverge';
            if (ferias.has(ficha.id)) observacoes.push('Férias no mês: o S-1200 do IOB traz as rubricas do recibo; o motor soma as férias do mês e abate o que o recibo já pagou e reteve. Se divergir, confira também a folha de férias.');
            linhas.push({ ...base, nome: m.nome, situacao, itens });
        }
        for (const m of motor) {
            if (vistos.has(m.fichaId) || m.situacao === 'erro') continue;
            const f = e.fichas.find(x => x.id === m.fichaId);
            linhas.push({ competencia: c, cpf: f?.cpf ?? '', nome: m.nome, fichaId: m.fichaId, situacao: 'sem-s1200', itens: [], rubricas: [],
                observacoes: ['O motor calculou e o arquivo não tem o S-1200 do IOB para este funcionário.'] });
        }
        linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
        const confere = linhas.filter(l => l.situacao === 'confere').length;
        const diverge = linhas.filter(l => l.situacao === 'diverge').length;
        const pendentes = linhas.length - confere - diverge;
        resumo.push({ competencia: c, linhas, confere, diverge, pendentes, zerada: confere > 0 && diverge === 0 && pendentes === 0 });
    }
    if (semRubrica.size) avisos.push(`Rubrica(s) sem S-1010 (tipo e natureza): ${[...semRubrica].slice(0, 12).join(', ')}${semRubrica.size > 12 ? '…' : ''}. Importe o S-1010 em Cadastros › Incidências ou inclua no arquivo.`);

    // Maior sequência de meses seguidos sem diferença.
    let melhor = { inicio: '', fim: '', meses: 0 }; let atual = { inicio: '', fim: '', meses: 0 };
    for (const r of resumo) {
        if (!r.zerada) { atual = { inicio: '', fim: '', meses: 0 }; continue; }
        atual = atual.meses && proximaCompetencia(atual.fim) === r.competencia ? { ...atual, fim: r.competencia, meses: atual.meses + 1 } : { inicio: r.competencia, fim: r.competencia, meses: 1 };
        if (atual.meses > melhor.meses) melhor = atual;
    }
    return { competencias: resumo, sequencia: melhor, criterioAtingido: melhor.meses >= 3, avisos };
}
