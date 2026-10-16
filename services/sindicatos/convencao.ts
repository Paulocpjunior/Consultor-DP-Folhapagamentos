// services/sindicatos/convencao.ts
//
// Convenção (CCT) ou acordo coletivo (ACT) de cada sindicato, com o PDF e a vigência, e a conferência da folha da
// empresa com ela:
// - vigência: vencida (renovar), a vencer em 30 dias, data-base chegada sem a convenção nova;
// - piso salarial da categoria (por CBO ou pela descrição do cargo; sem casar, o menor), proporcional à jornada;
// - reajuste da data-base: o salário a partir do mês do reajuste tem de ter subido o percentual (quem foi admitido
//   depois da data-base anterior pode ter reajuste proporcional, como a convenção disser: avisa);
// - horas extras: adicional mínimo da convenção maior que o da CLT (50%) ou o de domingos e feriados (100%);
// - obrigações que a convenção impõe (cesta básica, seguro de vida, PLR…): lista de conferência por empresa, com
//   alerta das não marcadas como cumpridas.
// O piso da convenção prevalece sobre o salário mínimo estadual (LC 103/2000), que só vale para quem não tem piso
// em lei federal, convenção ou acordo: com piso da convenção, o aviso do estadual sai da conferência.
// O texto do PDF sugere vigência, data-base, registro, reajuste e pisos (lerTextoConvencao): a equipe confirma.

import { fichaNaData, type FichaFuncionario } from '../cadastros/funcionarios';
import { dataValida, normalizarCnpj, reais } from '../cadastros/documentos';
import { salarioContratual, type Movimento } from '../calculo/motorMensal';
import type { AlertaConformidade } from '../conformidade/salarioMinimo';
import { minimoProporcional } from '../conformidade/salarioMinimo';
import { validarContribuicoes, validarRegrasAviso, type ContribuicaoConvencao, type RegraAvisoConvencao } from './contribuicoes';

export interface PisoConvencao { descricao: string; /** CBO (6 dígitos) quando a convenção amarra ao cargo. */ cbo: string; valor: number }
export interface ObrigacaoConvencao { id: string; descricao: string }
export interface ArquivoConvencao { path: string; nome: string; tamanho: number; enviadoPorEmail: string; enviadoEm: string }

export interface ConvencaoColetiva {
    id: string;
    sindicatoCnpj: string;
    tipo: 'CCT' | 'ACT';
    vigenciaInicio: string; // AAAA-MM-DD
    vigenciaFim: string;
    /** Mês da data-base, "1" a "12". */
    dataBase: string;
    /** Registro no Mediador (MTE), ex.: SP001234/2026. */
    registroMte: string;
    reajuste: { percentual: number | null; aPartirDe: string /* AAAA-MM */ };
    pisos: PisoConvencao[];
    horaExtra: { minimo50: number | null; minimo100: number | null };
    adicionalNoturno: number | null;
    obrigacoes: ObrigacaoConvencao[];
    /** Descontos para o sindicato (sindical, assistencial, confederativa, mensalidade). */
    contribuicoes: ContribuicaoConvencao[];
    /** Aviso prévio além da Lei 12.506/2011, por idade e tempo de casa. */
    avisoPrevio: RegraAvisoConvencao[];
    arquivo: ArquivoConvencao | null;
    observacao: string;
}

export function convencaoVazia(sindicatoCnpj = ''): ConvencaoColetiva {
    return { id: '', sindicatoCnpj, tipo: 'CCT', vigenciaInicio: '', vigenciaFim: '', dataBase: '', registroMte: '', reajuste: { percentual: null, aPartirDe: '' },
        pisos: [], horaExtra: { minimo50: null, minimo100: null }, adicionalNoturno: null, obrigacoes: [], contribuicoes: [], avisoPrevio: [], arquivo: null, observacao: '' };
}

export const idConvencao = (cnpj: string, vigenciaInicio: string) => `${cnpj}_${vigenciaInicio}`;
const COMP = /^\d{4}-(0[1-9]|1[0-2])$/;
const br = (d: string) => (d ? d.split('-').reverse().join('/') : '');
const somarDias = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

export function validarConvencao(c: ConvencaoColetiva, existentes: ConvencaoColetiva[] = []): string[] {
    const e: string[] = [];
    if (!/^[0-9A-Z]{12}\d{2}$/.test(c.sindicatoCnpj)) e.push('Sindicato sem CNPJ.');
    if (!dataValida(c.vigenciaInicio)) e.push('Início da vigência: data inválida.');
    if (!dataValida(c.vigenciaFim)) e.push('Fim da vigência: data inválida.');
    else if (dataValida(c.vigenciaInicio) && c.vigenciaFim < c.vigenciaInicio) e.push('Fim da vigência antes do início.');
    else if (dataValida(c.vigenciaInicio) && c.vigenciaFim > somarDias(c.vigenciaInicio, 2 * 366)) e.push('Vigência de mais de 2 anos: a CLT não permite (art. 614, § 3º).');
    if (c.dataBase && !/^([1-9]|1[0-2])$/.test(c.dataBase)) e.push('Data-base: mês de 1 a 12.');
    if (c.reajuste.percentual !== null && (!(c.reajuste.percentual > 0) || c.reajuste.percentual > 100)) e.push('Reajuste: percentual entre 0 e 100.');
    if (c.reajuste.percentual !== null && !COMP.test(c.reajuste.aPartirDe)) e.push('Reajuste: informe a partir de qual competência (AAAA-MM).');
    c.pisos.forEach((p, i) => {
        if (p.descricao.trim().length < 2) e.push(`Piso ${i + 1}: informe a função ou a faixa.`);
        if (!Number.isInteger(p.valor) || p.valor <= 0) e.push(`Piso ${i + 1}: valor inválido.`);
        if (p.cbo && !/^\d{6}$/.test(p.cbo)) e.push(`Piso ${i + 1}: CBO com 6 dígitos.`);
    });
    for (const [k, r, min] of [['minimo50', 'dias úteis', 50], ['minimo100', 'domingos e feriados', 50]] as const) {
        const v = c.horaExtra[k];
        if (v !== null && (v < min || v > 300)) e.push(`Hora extra de ${r}: adicional entre ${min}% e 300%.`);
    }
    if (c.adicionalNoturno !== null && (c.adicionalNoturno < 20 || c.adicionalNoturno > 100)) e.push('Adicional noturno: entre 20% (CLT, art. 73) e 100%.');
    c.obrigacoes.forEach((o, i) => { if (o.descricao.trim().length < 3) e.push(`Obrigação ${i + 1}: descreva a obrigação.`); });
    e.push(...validarContribuicoes(c.contribuicoes ?? []), ...validarRegrasAviso(c.avisoPrevio ?? []));
    if (c.vigenciaInicio && existentes.some(x => x.id !== c.id && x.sindicatoCnpj === c.sindicatoCnpj && x.vigenciaInicio === c.vigenciaInicio)) e.push('Já existe uma convenção deste sindicato com o mesmo início de vigência.');
    return e;
}

/** A convenção que vale no dia: a de maior início até ele (vencida ou não; quem chama confere a vigência). */
export function convencaoDoDia(convencoes: ConvencaoColetiva[], cnpj: string, dia: string): ConvencaoColetiva | undefined {
    return convencoes.filter(c => c.sindicatoCnpj === cnpj && c.vigenciaInicio <= dia).sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio))[0];
}

// ---------- Renovação: data e atraso da nova publicação ----------

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

export type SituacaoRenovacao = 'em-dia' | 'a-vencer' | 'em-atraso' | 'sem-convencao';
export interface Renovacao {
    situacao: SituacaoRenovacao;
    /** Data em que a nova convenção tem de valer: o dia seguinte ao fim da vigência da última. */
    renovacao: string;
    /** Em dia e a vencer: dias até a renovação. Em atraso: dias desde o fim da vigência sem a nova publicada. */
    dias: number;
    /** Sinalizador: verde (em dia), amarelo (até 30 dias), laranja (atraso até 30 dias), vermelho (atraso maior). */
    sinal: 'verde' | 'amarelo' | 'laranja' | 'vermelho' | 'cinza';
    rotulo: string;
    ultima?: ConvencaoColetiva;
}

/**
 * Renovação da convenção do sindicato no dia: pela última convenção cadastrada (a de maior início). Vencida e sem
 * a nova, conta os dias em atraso da nova publicação desde o fim da vigência; vigente, os dias que faltam.
 */
export function renovacaoDoSindicato(convencoes: ConvencaoColetiva[], cnpj: string, hoje: string): Renovacao {
    const ultima = convencoes.filter(c => c.sindicatoCnpj === cnpj && dataValida(c.vigenciaFim)).sort((a, b) => b.vigenciaInicio.localeCompare(a.vigenciaInicio))[0];
    if (!ultima) return { situacao: 'sem-convencao', renovacao: '', dias: 0, sinal: 'cinza', rotulo: 'sem convenção cadastrada' };
    const renovacao = somarDias(ultima.vigenciaFim, 1);
    if (ultima.vigenciaFim >= hoje) {
        const dias = diasEntre(hoje, renovacao);
        const aVencer = dias <= 30;
        return { situacao: aVencer ? 'a-vencer' : 'em-dia', renovacao, dias, sinal: aVencer ? 'amarelo' : 'verde', ultima,
            rotulo: `${aVencer ? 'renovação em' : 'vigente; renova em'} ${br(renovacao)} (${dias === 1 ? 'falta 1 dia' : `faltam ${dias} dias`})` };
    }
    const dias = diasEntre(ultima.vigenciaFim, hoje);
    return { situacao: 'em-atraso', renovacao, dias, sinal: dias > 30 ? 'vermelho' : 'laranja', ultima,
        rotulo: `nova convenção em atraso há ${dias} dia${dias === 1 ? '' : 's'} (deveria valer desde ${br(renovacao)})` };
}

/** Avisos (não bloqueiam) ao gravar: renovação fora da data-base, intervalo ou sobreposição com a anterior, convenção já vencida. */
export function avisosConvencao(c: ConvencaoColetiva, existentes: ConvencaoColetiva[], hoje: string): string[] {
    const a: string[] = [];
    if (!dataValida(c.vigenciaInicio) || !dataValida(c.vigenciaFim)) return a;
    const renovacao = somarDias(c.vigenciaFim, 1);
    if (c.dataBase && Number(renovacao.slice(5, 7)) !== Number(c.dataBase)) a.push(`A renovação (${br(renovacao)}) não cai no mês da data-base (${c.dataBase}): confira o fim da vigência.`);
    const anterior = existentes.filter(x => x.id !== c.id && x.sindicatoCnpj === c.sindicatoCnpj && x.vigenciaInicio < c.vigenciaInicio).sort((x, y) => y.vigenciaInicio.localeCompare(x.vigenciaInicio))[0];
    if (anterior) {
        const esperado = somarDias(anterior.vigenciaFim, 1);
        if (c.vigenciaInicio > esperado) a.push(`Intervalo sem convenção de ${br(esperado)} a ${br(somarDias(c.vigenciaInicio, -1))} (a anterior venceu em ${br(anterior.vigenciaFim)}).`);
        if (c.vigenciaInicio < esperado) a.push(`Vigência sobrepõe a anterior (que vai até ${br(anterior.vigenciaFim)}).`);
    }
    if (c.vigenciaFim < hoje) a.push(`Esta convenção já venceu em ${br(c.vigenciaFim)}: a nova está ${diasEntre(c.vigenciaFim, hoje)} dia(s) em atraso.`);
    return a;
}

export type SituacaoConvencao = 'vigente' | 'a vencer' | 'vencida';
export function situacaoDaConvencao(c: ConvencaoColetiva, hoje: string): SituacaoConvencao {
    if (c.vigenciaFim < hoje) return 'vencida';
    return c.vigenciaFim <= somarDias(hoje, 30) ? 'a vencer' : 'vigente';
}

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Piso da ficha: o do CBO, senão o de descrição que casa com o cargo, senão o menor. */
export function pisoDaFicha(c: ConvencaoColetiva, d: FichaFuncionario['dados']): { piso: PisoConvencao; como: 'cbo' | 'cargo' | 'menor' } | null {
    if (!c.pisos.length) return null;
    const cbo = (d.cbo ?? '').replace(/\D/g, '');
    const porCbo = cbo ? c.pisos.find(p => p.cbo === cbo) : undefined;
    if (porCbo) return { piso: porCbo, como: 'cbo' };
    const cargo = normalizar(d.cargo ?? '');
    const porCargo = cargo ? c.pisos.find(p => { const x = normalizar(p.descricao); return x.length >= 4 && (cargo.includes(x) || x.includes(cargo)); }) : undefined;
    if (porCargo) return { piso: porCargo, como: 'cargo' };
    return { piso: [...c.pisos].sort((a, b) => a.valor - b.valor)[0], como: 'menor' };
}

// ---------- Conferência ----------

export interface ChecklistConvencao { [obrigacaoId: string]: { cumprido: boolean; obs: string; porEmail: string; em: string } }

export interface EntradaConformidade {
    competencia: string;
    hoje: string;
    /** Sindicatos ligados à empresa (CNPJs); a ficha com sindicato próprio usa o dela. */
    sindicatosDaEmpresa: string[];
    nomesSindicatos: Record<string, string>;
    fichas: FichaFuncionario[];
    convencoes: ConvencaoColetiva[];
    /** Movimentos do mês por ficha (horas extras). */
    movimentos?: Record<string, Movimento>;
    /** Checklist das obrigações por convenção (id da convenção → marcações). */
    checklists?: Record<string, ChecklistConvencao>;
}

export interface ResultadoConformidade {
    alertas: AlertaConformidade[];
    /** Alertas da empresa (vigência, obrigações), sem funcionário. */
    gerais: AlertaConformidade[];
    /** Fichas cobertas por piso de convenção (o mínimo estadual não vale para elas). */
    comPiso: Set<string>;
}

const ultimoDia = (comp: string) => { const [a, m] = comp.split('-').map(Number); return `${comp}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };
const mesAnterior = (comp: string) => { const [a, m] = comp.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; };

export function conferirConvencao(e: EntradaConformidade): ResultadoConformidade {
    const alertas: AlertaConformidade[] = []; const gerais: AlertaConformidade[] = []; const comPiso = new Set<string>();
    const fim = ultimoDia(e.competencia); const ini = `${e.competencia}-01`;
    const geral = (nivel: AlertaConformidade['nivel'], regra: string, mensagem: string) => gerais.push({ fichaId: '', nome: '', nivel, regra, mensagem });
    const nomeSind = (cnpj: string) => e.nomesSindicatos[cnpj] || `sindicato ${cnpj}`;
    if (!e.sindicatosDaEmpresa.length) geral('aviso', 'sem-sindicato', 'Empresa sem sindicato vinculado (Empresas › editar): sem a conferência da convenção coletiva.');

    // Vigência e obrigações de cada sindicato da empresa.
    const usados = new Set(e.sindicatosDaEmpresa);
    for (const f of e.fichas) { const s = normalizarCnpj(f.dados.sindicato); if (s.length === 14) usados.add(s); }
    for (const cnpj of usados) {
        const c = convencaoDoDia(e.convencoes, cnpj, fim);
        if (!c) { geral('aviso', 'sem-convencao', `${nomeSind(cnpj)}: nenhuma convenção cadastrada (Cadastros › Sindicatos › Convenções).`); continue; }
        const sit = situacaoDaConvencao(c, e.hoje);
        const ren = renovacaoDoSindicato(e.convencoes, cnpj, e.hoje);
        if (ren.situacao === 'em-atraso') geral('erro', 'convencao-vencida', `${nomeSind(cnpj)}: a ${ren.ultima!.tipo} venceu em ${br(ren.ultima!.vigenciaFim)}; ${ren.rotulo}. Cadastre a nova (com o PDF) assim que for registrada no Mediador.`);
        else if (ren.situacao === 'a-vencer') geral('aviso', 'convencao-a-vencer', `${nomeSind(cnpj)}: a ${ren.ultima!.tipo} vence em ${br(ren.ultima!.vigenciaFim)}; ${ren.rotulo}.`);
        if (c.dataBase) {
            const mesBase = Number(c.dataBase); const [ano, mes] = e.competencia.split('-').map(Number);
            const ultimaBase = `${mes >= mesBase ? ano : ano - 1}-${String(mesBase).padStart(2, '0')}-01`;
            if (c.vigenciaInicio < somarDias(ultimaBase, -45) && sit !== 'vigente') geral('aviso', 'data-base', `${nomeSind(cnpj)}: a data-base (${br(ultimaBase).slice(3)}) passou e a convenção cadastrada é de ${br(c.vigenciaInicio)}. Confira se a nova já foi registrada.`);
        }
        const marc = e.checklists?.[c.id] ?? {};
        const pendentes = c.obrigacoes.filter(o => !marc[o.id]?.cumprido);
        if (pendentes.length) geral('aviso', 'obrigacoes', `${nomeSind(cnpj)}: ${pendentes.length} obrigação(ões) da ${c.tipo} sem confirmação de cumprimento: ${pendentes.map(o => o.descricao).join('; ')}.`);
    }

    let semHistorico = 0;
    for (const f0 of e.fichas) {
        const d0 = f0.dados;
        if (!d0.admissao || d0.admissao > fim || (d0.dataDesligamento && d0.dataDesligamento < ini)) continue;
        if (d0.categoria && !/^1\d\d$/.test(d0.categoria)) continue;
        const cnpj = (normalizarCnpj(d0.sindicato).length === 14 ? normalizarCnpj(d0.sindicato) : e.sindicatosDaEmpresa.length === 1 ? e.sindicatosDaEmpresa[0] : '');
        const nome = d0.nome || f0.cpf;
        if (!cnpj) { if (e.sindicatosDaEmpresa.length > 1) alertas.push({ fichaId: f0.id, nome, nivel: 'aviso', regra: 'ficha-sem-sindicato', mensagem: 'A empresa tem mais de um sindicato e a ficha não diz qual: informe o sindicato na ficha (Ident. Adm.).' }); continue; }
        const c = convencaoDoDia(e.convencoes, cnpj, fim);
        if (!c) continue;
        const d = fichaNaData(f0, fim).ficha.dados;
        const sc = salarioContratual(d);
        if ('erro' in sc) continue;
        // Piso.
        const p = pisoDaFicha(c, d);
        if (p) {
            comPiso.add(f0.id);
            const min = minimoProporcional(p.piso.valor, sc.horasMes);
            if (sc.mensal < min) alertas.push({ fichaId: f0.id, nome, nivel: p.como === 'menor' ? 'aviso' : 'erro', regra: 'piso',
                mensagem: `Salário ${reais(sc.mensal)} abaixo do piso da ${c.tipo} (${p.piso.descricao}: ${reais(min)}${sc.horasMes < 220 ? `, proporcional a ${sc.horasMes.toLocaleString('pt-BR')} h/mês` : ''})${p.como === 'menor' ? '; a função não casou com nenhum piso pelo CBO ou cargo: usado o menor' : ''}.` });
        }
        // Reajuste da data-base.
        const r = c.reajuste;
        if (r.percentual && COMP.test(r.aPartirDe) && e.competencia >= r.aPartirDe && d0.admissao < `${r.aPartirDe}-01` && !(f0.historicoSalario ?? []).length) semHistorico++;
        else if (r.percentual && COMP.test(r.aPartirDe) && e.competencia >= r.aPartirDe && d0.admissao < `${r.aPartirDe}-01`) {
            const antes = salarioContratual(fichaNaData(f0, ultimoDia(mesAnterior(r.aPartirDe))).ficha.dados);
            const depois = salarioContratual(fichaNaData(f0, ultimoDia(r.aPartirDe)).ficha.dados);
            if (!('erro' in antes) && !('erro' in depois)) {
                const devido = Math.round(antes.mensal * (1 + r.percentual / 100));
                const recente = d0.admissao > `${Number(r.aPartirDe.slice(0, 4)) - 1}${r.aPartirDe.slice(4)}-01`;
                if (depois.mensal < devido - 1) alertas.push({ fichaId: f0.id, nome, nivel: recente ? 'aviso' : 'erro', regra: 'reajuste',
                    mensagem: `Reajuste de ${pct(r.percentual)} a partir de ${br(`${r.aPartirDe}-01`).slice(3)}: salário ${reais(antes.mensal)} → ${reais(depois.mensal)}; o devido é ${reais(devido)}${recente ? ' (admitido depois da data-base anterior: confira o reajuste proporcional da convenção)' : ''}.` });
            }
        }
        // Horas extras com adicional da convenção.
        const mov = e.movimentos?.[f0.id];
        if (mov) {
            if (c.horaExtra.minimo50 && c.horaExtra.minimo50 > 50 && (mov.horasExtras50 ?? 0) > 0)
                alertas.push({ fichaId: f0.id, nome, nivel: 'erro', regra: 'hora-extra', mensagem: `Horas extras lançadas a 50%; a ${c.tipo} garante ${pct(c.horaExtra.minimo50)} nos dias úteis. Lance com o percentual da convenção.` });
            if (c.horaExtra.minimo100 && c.horaExtra.minimo100 > 100 && (mov.horasExtras100 ?? 0) > 0)
                alertas.push({ fichaId: f0.id, nome, nivel: 'erro', regra: 'hora-extra', mensagem: `Horas extras lançadas a 100%; a ${c.tipo} garante ${pct(c.horaExtra.minimo100)} em domingos e feriados.` });
        }
    }
    if (semHistorico) geral('aviso', 'reajuste-sem-historico', `${semHistorico} funcionário(s) sem histórico de salário na ficha: o reajuste da data-base não pôde ser conferido (importe os S-2206 ou a tabela de salários do SAGE).`);
    return { alertas: alertas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), gerais, comPiso };
}

// ---------- Leitura do texto do PDF ----------

const MESES: Record<string, number> = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };
const dataDe = (dia: string, mes: string, ano: string) => {
    const m = /^\d+$/.test(mes) ? Number(mes) : MESES[normalizar(mes)];
    const a = ano.length === 2 ? `20${ano}` : ano;
    const x = `${a}-${String(m).padStart(2, '0')}-${String(Number(dia)).padStart(2, '0')}`;
    return m && dataValida(x) ? x : '';
};
const valorDe = (t: string) => Math.round(Number(t.replace(/\./g, '').replace(',', '.')) * 100);

export interface SugestaoConvencao { vigenciaInicio: string; vigenciaFim: string; dataBase: string; registroMte: string; percentual: number | null; pisos: { descricao: string; valor: number }[] }

/** Sugestões tiradas do texto da convenção (o Mediador do MTE segue um padrão: cláusulas de vigência, data-base, pisos e reajuste). */
export function lerTextoConvencao(texto: string): SugestaoConvencao {
    const t = texto.replace(/\s+/g, ' ');
    const s: SugestaoConvencao = { vigenciaInicio: '', vigenciaFim: '', dataBase: '', registroMte: '', percentual: null, pisos: [] };
    const reg = t.match(/\b([A-Z]{2}\d{6}\/\d{4})\b/);
    if (reg) s.registroMte = reg[1];
    const DATA = String.raw`(\d{1,2})[º°o]?(?:\s*de\s*|[./])([A-Za-zçÇ]+|\d{1,2})(?:\s*de\s*|[./])(\d{4}|\d{2})`;
    const vig = new RegExp(String.raw`vig[eê]ncia[^.]{0,120}?${DATA}[^.]{0,40}?(?:a|at[eé])\s*${DATA}`, 'i').exec(t);
    if (vig) { s.vigenciaInicio = dataDe(vig[1], vig[2], vig[3]); s.vigenciaFim = dataDe(vig[4], vig[5], vig[6]); }
    const base = /data[\s-]*base[^.]{0,60}?(?:\d{1,2}[º°o]?\s*de\s*)?(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i.exec(t);
    if (base) s.dataBase = String(MESES[normalizar(base[1])]);
    const reaj = /(?:reajust|corrigid|majorad)[a-z]*[^.%]{0,120}?(\d{1,2}(?:,\d{1,2})?)\s*%/i.exec(t);
    if (reaj) s.percentual = Number(reaj[1].replace(',', '.'));
    const pisoBloco = /piso[s]?\s+salaria(?:l|is)(.{0,1500})/i.exec(t);
    if (pisoBloco) {
        const re = /([A-Za-zÀ-ú][A-Za-zÀ-ú\s/()-]{2,60}?)[\s:–-]*R\$\s*([\d.]+,\d{2})/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(pisoBloco[1])) && s.pisos.length < 20) {
            const desc = m[1].trim().replace(/^(?:[a-z]|\d{1,2})[).-]\s*/i, '').replace(/^(e|de|para|os|as|a|o)\s+/i, '').trim();
            s.pisos.push({ descricao: desc.slice(0, 80), valor: valorDe(m[2]) });
        }
    }
    return s;
}

/**
 * A convenção que vale para a ficha no dia: a do sindicato da ficha (ou o único da empresa), vigente no dia. Vencida
 * não vale (não há ultratividade: CLT, art. 614, § 3º).
 */
export function convencaoDaFicha(convencoes: ConvencaoColetiva[], ficha: FichaFuncionario, sindicatosDaEmpresa: string[], dia: string): ConvencaoColetiva | undefined {
    const daFicha = normalizarCnpj(ficha.dados.sindicato);
    const cnpj = daFicha.length === 14 ? daFicha : sindicatosDaEmpresa.length === 1 ? sindicatosDaEmpresa[0] : '';
    if (!cnpj) return undefined;
    const c = convencaoDoDia(convencoes, cnpj, dia);
    return c && c.vigenciaFim >= dia ? c : undefined;
}
