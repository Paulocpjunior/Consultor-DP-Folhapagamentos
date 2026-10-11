// services/contribuintes/contribuinteIndividual.ts
//
// Pró-labore de sócio ou diretor e RPA de autônomo (contribuintes individuais), como o "Retiradas/Pró-labore" e o
// "Autônomos" do SAGE:
// - INSS do segurado: 11% da remuneração, até o teto do salário de contribuição (Lei 8.212/1991, art. 21 e art. 30,
//   § 4º; Lei 10.666/2003, art. 4º). Com remuneração em outras fontes no mês, desconta só até completar o teto, e o
//   S-1200 informa o grupo infoMV (MOS, S-1200, item 5): 1 (desconto normal), 2 (até o teto) ou 3 (nada a descontar);
// - parte da empresa: 20% sobre a remuneração do contribuinte individual (Lei 8.212/1991, art. 22, III), sem RAT e sem
//   terceiros; no Simples Nacional fora do Anexo IV, a contribuição patronal está no DAS;
// - IRRF pela tabela progressiva do mês do pagamento, com as deduções (INSS e dependentes) ou o desconto simplificado
//   e o redutor; retenção até R$ 10,00 dispensada;
// - ISS do autônomo não inscrito no município, quando o tomador retém (alíquota da lei municipal, informada);
// - sem FGTS, férias e 13º.
// Categorias: 701 (autônomo), 722 (diretor não empregado sem FGTS) e 723 (sócio). A 723 e a 722 exigem o S-2300 antes do
// S-1200; o autônomo (701) pode ir sem ele, com os dados no próprio S-1200 (MOS, S-1200, item 23).

import { cpfValido, dataValida, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import type { Enquadramento } from '../cadastros/enquadramento';
import { apurarIrrf, type ResultadoCalculo, type Verba } from '../calculo/motorMensal';
import { IRRF_MINIMO } from '../calculo/tributos';

export type CategoriaCI = '701' | '722' | '723';
export const CATEGORIAS_CI: Record<CategoriaCI, { rotulo: string; tipo: 'prolabore' | 'rpa'; exigeS2300: boolean }> = {
    '723': { rotulo: '723 · Sócio ou empresário (pró-labore)', tipo: 'prolabore', exigeS2300: true },
    '722': { rotulo: '722 · Diretor não empregado sem FGTS (pró-labore)', tipo: 'prolabore', exigeS2300: true },
    '701': { rotulo: '701 · Autônomo em geral (RPA)', tipo: 'rpa', exigeS2300: false },
};

export interface DependenteCI { cpf: string; nome: string; nascimento: string; /** Tabela 07 do eSocial. */ tipo: string }

export interface ContribuinteIndividual {
    id: string;
    empresaId: string;
    cpf: string;
    nome: string;
    nascimento: string;
    categoria: CategoriaCI;
    cbo: string;
    /** PIS/PASEP/NIT. */
    nit: string;
    /** S-2300 (TSVE) já enviado: o S-1200 vai sem os dados cadastrais; com a matrícula dele, quando houver. */
    s2300: boolean;
    matricula: string;
    /** Autônomo inscrito no município do serviço (ISS por conta própria): o tomador não retém. */
    inscritoIss: boolean;
    dependentes: DependenteCI[];
    ativo: boolean;
    observacao: string;
}

export const contribuinteVazio = (empresaId: string): ContribuinteIndividual => ({
    id: '', empresaId, cpf: '', nome: '', nascimento: '', categoria: '701', cbo: '', nit: '', s2300: false, matricula: '', inscritoIss: false, dependentes: [], ativo: true, observacao: '',
});
export const idContribuinte = (empresaId: string, cpf: string) => `${empresaId}_${cpf.replace(/\D/g, '')}`;

export function validarContribuinte(c: ContribuinteIndividual): string[] {
    const e: string[] = [];
    if (!cpfValido(c.cpf.replace(/\D/g, ''))) e.push('CPF inválido.');
    if (c.nome.trim().length < 3) e.push('Informe o nome.');
    if (!dataValida(c.nascimento)) e.push('Informe a data de nascimento.');
    if (!CATEGORIAS_CI[c.categoria]) e.push('Escolha a categoria.');
    if (!/^\d{6}$/.test(c.cbo)) e.push('CBO com 6 dígitos (o S-1200 exige para quem vai sem o S-2300).');
    if (CATEGORIAS_CI[c.categoria]?.exigeS2300 && !c.s2300) e.push('Sócio e diretor (722, 723) precisam do S-2300 enviado antes do S-1200: marque quando ele estiver no eSocial.');
    if (c.matricula && c.matricula.length > 30) e.push('Matrícula com até 30 caracteres.');
    c.dependentes.forEach((d, i) => {
        if (!cpfValido(d.cpf.replace(/\D/g, ''))) e.push(`Dependente ${i + 1}: CPF inválido.`);
        if (!d.nome.trim()) e.push(`Dependente ${i + 1}: informe o nome.`);
        if (!dataValida(d.nascimento)) e.push(`Dependente ${i + 1}: data de nascimento.`);
        if (!/^\d{2}$/.test(d.tipo) || d.tipo === '99') e.push(`Dependente ${i + 1}: tipo da Tabela 07 (01 a 12).`);
    });
    return e;
}

/** Remuneração em outra fonte no mês (para o teto do INSS e o infoMV do S-1200). */
export interface OutraFonte { tpInsc: '1' | '2'; nrInsc: string; codCateg: string; valor: number }

export interface LancamentoCI {
    contribuinteId: string;
    /** Valor bruto do pró-labore ou dos serviços do mês (centavos). */
    valor: number;
    descricao: string;
    dataPagamento: string;
    /** Alíquota do ISS retido (%), só no RPA de autônomo não inscrito. */
    issAliquota: number;
    outrasFontes: OutraFonte[];
}

export interface ResultadoCI extends ResultadoCalculo {
    categoria: CategoriaCI;
    dataPagamento: string;
    /** 1, 2 ou 3 (S-1200, infoMV), quando há outras fontes. */
    indMV?: '1' | '2' | '3';
    outrasFontes: OutraFonte[];
    patronal: { base: number; aliquota: number; valor: number } | null;
}

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
const br = (d: string) => d.split('-').reverse().join('/');

export function validarLancamentos(competencia: string, ls: LancamentoCI[], contribuintes: ContribuinteIndividual[]): string[] {
    const e: string[] = [];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) e.push('Competência inválida.');
    const vistos = new Set<string>();
    ls.forEach((l, i) => {
        const c = contribuintes.find(x => x.id === l.contribuinteId);
        const q = c ? c.nome : `Lançamento ${i + 1}`;
        if (!c) e.push(`Lançamento ${i + 1}: escolha o sócio ou autônomo.`);
        else if (vistos.has(c.id)) e.push(`${q} aparece duas vezes: some os serviços do mês num lançamento só (o INSS e o IRRF são do mês).`);
        if (c) vistos.add(c.id);
        if (!(l.valor > 0)) e.push(`${q}: informe o valor.`);
        if (!dataValida(l.dataPagamento)) e.push(`${q}: informe a data do pagamento.`);
        else if (/^\d{4}-\d{2}$/.test(competencia) && l.dataPagamento.slice(0, 7) < competencia) e.push(`${q}: pagamento antes da competência.`);
        if (l.issAliquota < 0 || l.issAliquota > 5) e.push(`${q}: ISS entre 0% e 5% (LC 116/2003, art. 8º).`);
        l.outrasFontes.forEach((o, j) => {
            const n = o.nrInsc.replace(/\D/g, '');
            if (!(o.tpInsc === '1' ? n.length === 14 : n.length === 11)) e.push(`${q}, outra fonte ${j + 1}: CNPJ ou CPF inválido.`);
            if (!/^\d{3}$/.test(o.codCateg)) e.push(`${q}, outra fonte ${j + 1}: categoria (3 dígitos).`);
            if (!(o.valor > 0)) e.push(`${q}, outra fonte ${j + 1}: informe a remuneração.`);
        });
    });
    return e;
}

/**
 * Calcula o pró-labore ou o RPA do mês. A parte patronal sai do enquadramento da empresa (sem ele, fica de fora,
 * com aviso).
 */
export function calcularCI(c: ContribuinteIndividual, l: LancamentoCI, competencia: string, tabelas: TabelaLegal[], enquadramento?: Enquadramento): ResultadoCI {
    const def = CATEGORIAS_CI[c.categoria];
    const r: ResultadoCI = {
        fichaId: c.id, nome: c.nome, competencia, pagamento: l.dataPagamento.slice(0, 7), situacao: 'calculado',
        verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0,
        memoria: [], avisos: [], erros: [], categoria: c.categoria, dataPagamento: l.dataPagamento, outrasFontes: l.outrasFontes, patronal: null,
    };
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; return r; };
    if (!def) return erro('Categoria não coberta.');
    if (!(l.valor > 0)) return erro('Sem valor no mês.');
    const prolabore = def.tipo === 'prolabore';
    verba({ codigo: prolabore ? 'PROLAB' : 'RPA', descricao: prolabore ? 'Pró-labore' : `Serviços prestados${l.descricao.trim() ? ` (${l.descricao.trim()})` : ''}`, referencia: '', tipo: 'provento', valor: l.valor, inss: true, fgts: false, irrf: true });

    // INSS do segurado: 11% até o teto, descontado o que já houve em outras fontes no mês.
    const tInss = tabelaVigente(tabelas, 'inss', competencia);
    let inss = 0;
    if ('erro' in tInss) return erro(`INSS: ${tInss.erro}`);
    const teto = tInss.tabela.faixas[tInss.tabela.faixas.length - 1]?.ate ?? l.valor;
    const outras = l.outrasFontes.reduce((s, o) => s + o.valor, 0);
    const base = Math.max(0, Math.min(l.valor, teto - outras));
    inss = Math.round(base * 11 / 100);
    if (outras) r.indMV = outras >= teto ? '3' : outras + l.valor > teto ? '2' : '1';
    r.bases.inss = base;
    r.memoria.push(`INSS do contribuinte individual: 11% sobre ${reais(base)}${base < l.valor ? ` (teto ${reais(teto)}${outras ? ` − ${reais(outras)} já recebidos em outras fontes` : ''})` : ''} = ${reais(inss)} (Lei 8.212/1991, art. 21; Lei 10.666/2003, art. 4º).`);
    if (r.indMV === '3') r.memoria.push('Outras fontes já chegaram ao teto: nada a descontar (S-1200, indMV 3).');
    verba({ codigo: 'INSS', descricao: 'INSS', referencia: '11%', tipo: 'desconto', valor: inss, inss: false, fgts: false, irrf: false });

    // IRRF do mês do pagamento.
    const tIr = tabelaVigente(tabelas, 'irrf', r.pagamento);
    if ('erro' in tIr) return erro(`IRRF: ${tIr.erro}`);
    const t = tIr.tabela;
    const dep = c.dependentes.length * (t.valores.deducaoDependente ?? 0);
    const legais = inss + dep;
    const a = apurarIrrf(t, l.valor, legais);
    let ir = a.valor;
    r.bases.irrf = l.valor;
    r.memoria.push(`IRRF (pagamento em ${br(l.dataPagamento)}, tabela de ${rotuloCompetencia(t.vigencia)}): ${reais(l.valor)} − ${a.simplificado ? `desconto simplificado ${reais(a.deducao)}` : `deduções legais ${reais(legais)}${c.dependentes.length ? ` (INSS + ${c.dependentes.length} dependente(s))` : ''}`} = base ${reais(a.base)} × ${pct(a.aliquota)} − ${reais(a.deducaoFaixa)} = ${reais(a.bruto)}.`, ...a.memoriaRedutor);
    if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
    r.irrfApurado = { rendimentos: l.valor, deducoesLegais: legais, valor: ir };
    r.deducoesIrrf = { simplificado: a.simplificado, dependentes: c.dependentes.map(d => ({ cpf: d.cpf, nome: d.nome })), porDependente: t.valores.deducaoDependente ?? 0, pensao: 0 };
    verba({ codigo: 'IRRF', descricao: 'IRRF', referencia: a.aliquota ? pct(a.aliquota) : '', tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });

    // ISS retido do autônomo não inscrito no município.
    if (!prolabore) {
        if (c.inscritoIss) r.memoria.push('ISS: autônomo inscrito no município, recolhe por conta própria; sem retenção.');
        else if (l.issAliquota > 0) {
            const iss = Math.round(l.valor * l.issAliquota / 100);
            verba({ codigo: 'ISS', descricao: 'ISS retido', referencia: pct(l.issAliquota), tipo: 'desconto', valor: iss, inss: false, fgts: false, irrf: false });
            r.memoria.push(`ISS retido: ${pct(l.issAliquota)} de ${reais(l.valor)} = ${reais(iss)} (alíquota da lei do município do serviço).`);
        } else r.avisos.push('Autônomo não inscrito no município: confira se a lei municipal manda o tomador reter o ISS (informe a alíquota).');
    }

    // Parte da empresa: 20% sobre a remuneração, sem teto (Lei 8.212/1991, art. 22, III).
    if (!enquadramento) r.avisos.push('Empresa sem enquadramento previdenciário vigente (Cadastros › Enquadramento): a parte patronal de 20% não foi calculada.');
    else if (enquadramento.regime === 'simples') { r.patronal = { base: l.valor, aliquota: 0, valor: 0 }; r.memoria.push('Parte da empresa: Simples Nacional fora do Anexo IV, a contribuição patronal está no DAS.'); }
    else { const v = Math.round(l.valor * 20 / 100); r.patronal = { base: l.valor, aliquota: 20, valor: v }; r.memoria.push(`Parte da empresa: 20% de ${reais(l.valor)} = ${reais(v)} (Lei 8.212/1991, art. 22, III), sem RAT e sem terceiros.`); }

    if (def.exigeS2300 && !c.s2300) r.avisos.push('Sem o S-2300 no eSocial: o S-1200 do sócio ou diretor só vai depois dele.');
    r.totais.proventos = r.verbas.filter(v => v.tipo === 'provento').reduce((s, v) => s + v.valor, 0);
    r.totais.descontos = r.verbas.filter(v => v.tipo === 'desconto').reduce((s, v) => s + v.valor, 0);
    r.totais.liquido = r.totais.proventos - r.totais.descontos;
    return r;
}

/** Totais do mês: o que vai na DCTFWeb e o que se paga. */
export function totaisCI(rs: ResultadoCI[]) {
    const ok = rs.filter(r => r.situacao !== 'erro');
    const v = (c: string) => ok.reduce((s, r) => s + r.verbas.filter(x => x.codigo === c).reduce((t, x) => t + x.valor, 0), 0);
    return {
        quantidade: ok.length, bruto: ok.reduce((s, r) => s + r.totais.proventos, 0), inssRetido: v('INSS'), irrf: v('IRRF'), iss: v('ISS'),
        patronal: ok.reduce((s, r) => s + (r.patronal?.valor ?? 0), 0), liquido: ok.reduce((s, r) => s + r.totais.liquido, 0),
    };
}
