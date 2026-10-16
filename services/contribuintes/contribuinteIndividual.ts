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
// - sem férias e 13º; sem FGTS, exceto o diretor não empregado que a empresa equiparou aos empregados para o FGTS
//   (categoria 721; Lei 8.036/1990, art. 16): 8% sobre o pró-labore, recolhidos pelo FGTS Digital a partir do S-1200.
// Categorias: 701 (autônomo), 721 e 722 (diretor não empregado com e sem FGTS) e 723 (sócio). A 721, a 722 e a 723 exigem
// o S-2300 antes do S-1200 (o Consultor gera o S-2300 e o S-2399: services/esocial/eventosTSV.ts); o autônomo (701) pode
// ir sem ele, com os dados no próprio S-1200 (MOS, S-1200, item 23).
// Transportador autônomo (711 passageiros, 712 carga), sobre o valor bruto do frete:
// - INSS de 11% e parte da empresa de 20% sobre a base de 20% do frete (Decreto 3.048/1999, art. 201, § 4º);
// - SEST 1,5% e SENAT 1,0% sobre a mesma base, descontados do transportador (o S-5001 calcula com os códigos 121802 e
//   122102 para as categorias 711, 712 e 734 — XSD do S-5001, leiaute S-1.3);
// - IRRF sobre 10% do frete (carga) ou 60% (passageiros) (Lei 7.713/1988, art. 9º, com a Lei 12.794/2013);
// - sem ISS retido (frete intermunicipal é ICMS; o municipal fica fora desta tela).

import { cpfValido, dataValida, normalizarCnpj, reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';
import type { Enquadramento } from '../cadastros/enquadramento';
import { apurarIrrf, type ResultadoCalculo, type Verba } from '../calculo/motorMensal';
import { IRRF_MINIMO } from '../calculo/tributos';

export type CategoriaCI = '701' | '711' | '712' | '721' | '722' | '723';
export const CATEGORIAS_CI: Record<CategoriaCI, { rotulo: string; tipo: 'prolabore' | 'rpa'; exigeS2300: boolean; transportador?: 'passageiros' | 'carga'; fgts?: boolean }> = {
    '723': { rotulo: '723 · Sócio ou empresário (pró-labore)', tipo: 'prolabore', exigeS2300: true },
    '721': { rotulo: '721 · Diretor não empregado com FGTS (pró-labore)', tipo: 'prolabore', exigeS2300: true, fgts: true },
    '722': { rotulo: '722 · Diretor não empregado sem FGTS (pró-labore)', tipo: 'prolabore', exigeS2300: true },
    '701': { rotulo: '701 · Autônomo em geral (RPA)', tipo: 'rpa', exigeS2300: false },
    '712': { rotulo: '712 · Transportador autônomo de carga (frete)', tipo: 'rpa', exigeS2300: false, transportador: 'carga' },
    '711': { rotulo: '711 · Transportador autônomo de passageiros (frete)', tipo: 'rpa', exigeS2300: false, transportador: 'passageiros' },
};
/** Base do INSS e do SEST/SENAT do transportador: 20% do frete; base do IRRF: 10% (carga) ou 60% (passageiros). */
export const BASE_INSS_FRETE = 20;
export const BASE_IRRF_FRETE: Record<'passageiros' | 'carga', number> = { carga: 10, passageiros: 60 };
export const ALIQ_SEST = 1.5;
export const ALIQ_SENAT = 1.0;
/** FGTS do diretor não empregado equiparado (721): 8% (Lei 8.036/1990, art. 15 e art. 16). */
export const ALIQ_FGTS_DIRETOR = 8;

export interface DependenteCI { cpf: string; nome: string; nascimento: string; /** Tabela 07 do eSocial. */ tipo: string }

/**
 * Dados do S-2300 (início do trabalhador sem vínculo) e do S-2399 (término), para o Consultor gerar os dois eventos.
 * Valores em centavos; códigos das tabelas do eSocial.
 */
export interface DadosTSV {
    sexo: '' | 'M' | 'F';
    /** 1 branca, 2 preta, 3 parda, 4 amarela, 5 indígena, 6 não informado. */
    racaCor: string;
    /** 1 solteiro, 2 casado, 3 divorciado, 4 separado, 5 viúvo (opcional). */
    estCiv: string;
    /** 01 a 12 (grau de instrução do eSocial). */
    grauInstr: string;
    /** Tabela 06 do eSocial (105 = Brasil). */
    paisNascto: string;
    paisNac: string;
    endereco: { logradouro: string; numero: string; complemento: string; bairro: string; cep: string; codMunic: string; uf: string };
    /** Posse do diretor ou entrada do sócio no contrato social. */
    dtInicio: string;
    /** Início anterior à obrigatoriedade dos eventos não periódicos na empresa (cadIni S). */
    cadastramentoInicial: boolean;
    cargo: string;
    /** Pró-labore fixo mensal (0 = variável). */
    remuneracao: number;
    /** Opção pelo FGTS (721). */
    dtOpcFGTS: string;
    dtTermino: string;
    /** Motivo do término do diretor com FGTS (721): 01 a 07 e 99 do S-2399. */
    mtvDesligTSV: string;
}
export const tsvVazio = (): DadosTSV => ({
    sexo: '', racaCor: '', estCiv: '', grauInstr: '', paisNascto: '105', paisNac: '105',
    endereco: { logradouro: '', numero: '', complemento: '', bairro: '', cep: '', codMunic: '', uf: '' },
    dtInicio: '', cadastramentoInicial: false, cargo: '', remuneracao: 0, dtOpcFGTS: '', dtTermino: '', mtvDesligTSV: '',
});
/** Completa o cadastro gravado antes dos dados do S-2300 (ou com parte deles). */
export const comTsv = (c: ContribuinteIndividual): ContribuinteIndividual => {
    const v = tsvVazio();
    const t: Partial<DadosTSV> = c.tsv ?? {};
    return { ...c, tsv: { ...v, ...t, endereco: { ...v.endereco, ...(t.endereco ?? {}) } } };
};

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
    /** Dados do S-2300 e do S-2399 gerados pelo Consultor. */
    tsv: DadosTSV;
}

export const contribuinteVazio = (empresaId: string): ContribuinteIndividual => ({
    id: '', empresaId, cpf: '', nome: '', nascimento: '', categoria: '701', cbo: '', nit: '', s2300: false, matricula: '', inscritoIss: false, dependentes: [], ativo: true, observacao: '', tsv: tsvVazio(),
});
export const idContribuinte = (empresaId: string, cpf: string) => `${empresaId}_${cpf.replace(/\D/g, '')}`;

export function validarContribuinte(c: ContribuinteIndividual): string[] {
    const e: string[] = [];
    if (!cpfValido(c.cpf.replace(/\D/g, ''))) e.push('CPF inválido.');
    if (c.nome.trim().length < 3) e.push('Informe o nome.');
    if (!dataValida(c.nascimento)) e.push('Informe a data de nascimento.');
    if (!CATEGORIAS_CI[c.categoria]) e.push('Escolha a categoria.');
    if (!/^\d{6}$/.test(c.cbo)) e.push('CBO com 6 dígitos (o S-1200 exige para quem vai sem o S-2300).');
    if (c.matricula && c.matricula.length > 30) e.push('Matrícula com até 30 caracteres.');
    const t = c.tsv;
    if (t?.dtInicio && !dataValida(t.dtInicio)) e.push('Data de início (S-2300) inválida.');
    if (t?.dtTermino && !dataValida(t.dtTermino)) e.push('Data do término (S-2399) inválida.');
    else if (t?.dtTermino && t.dtInicio && t.dtTermino < t.dtInicio) e.push('Término antes do início.');
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

/** Rubrica informativa do S-1200 (tpRubr 3): as bases do transportador. */
export interface InformativaCI { codigo: 'BASEFRETE' | 'BASEIRFRETE'; descricao: string; valor: number }

export interface ResultadoCI extends ResultadoCalculo {
    categoria: CategoriaCI;
    informativas: InformativaCI[];
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
        const fim = c?.tsv?.dtTermino;
        if (c && fim && /^\d{4}-\d{2}$/.test(competencia) && competencia > fim.slice(0, 7)) e.push(`${q}: término em ${br(fim)} (S-2399); sem pró-labore nas competências seguintes.`);
        if (!(l.valor > 0)) e.push(`${q}: informe o valor.`);
        if (!dataValida(l.dataPagamento)) e.push(`${q}: informe a data do pagamento.`);
        else if (/^\d{4}-\d{2}$/.test(competencia) && l.dataPagamento.slice(0, 7) < competencia) e.push(`${q}: pagamento antes da competência.`);
        if (l.issAliquota < 0 || l.issAliquota > 5) e.push(`${q}: ISS entre 0% e 5% (LC 116/2003, art. 8º).`);
        if (c && CATEGORIAS_CI[c.categoria]?.transportador && l.issAliquota > 0) e.push(`${q}: transportador autônomo sem ISS retido nesta tela.`);
        l.outrasFontes.forEach((o, j) => {
            const n = normalizarCnpj(o.nrInsc);
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
        memoria: [], avisos: [], erros: [], categoria: c.categoria, dataPagamento: l.dataPagamento, outrasFontes: l.outrasFontes, patronal: null, informativas: [],
    };
    const verba = (v: Verba) => { if (v.valor > 0) r.verbas.push(v); };
    const erro = (m: string) => { r.erros.push(m); r.situacao = 'erro'; return r; };
    if (!def) return erro('Categoria não coberta.');
    if (!(l.valor > 0)) return erro('Sem valor no mês.');
    const prolabore = def.tipo === 'prolabore';
    const transp = def.transportador;
    // Transportador: as bases saem do frete (20% para o INSS e o SEST/SENAT; 10% ou 60% para o IRRF).
    const remuneracao = transp ? Math.round(l.valor * BASE_INSS_FRETE / 100) : l.valor;
    const rendimentoIr = transp ? Math.round(l.valor * BASE_IRRF_FRETE[transp] / 100) : l.valor;
    if (transp) {
        verba({ codigo: 'FRETE', descricao: `Frete (transporte de ${transp})${l.descricao.trim() ? ` — ${l.descricao.trim()}` : ''}`, referencia: '', tipo: 'provento', valor: l.valor, inss: false, fgts: false, irrf: false });
        r.informativas.push({ codigo: 'BASEFRETE', descricao: `Base do INSS e do SEST/SENAT (${BASE_INSS_FRETE}% do frete)`, valor: remuneracao });
        r.informativas.push({ codigo: 'BASEIRFRETE', descricao: `Rendimento tributável do IRRF (${BASE_IRRF_FRETE[transp]}% do frete)`, valor: rendimentoIr });
        r.memoria.push(`Frete de ${reais(l.valor)}: base do INSS ${BASE_INSS_FRETE}% = ${reais(remuneracao)} (Decreto 3.048/1999, art. 201, § 4º); rendimento tributável ${BASE_IRRF_FRETE[transp]}% = ${reais(rendimentoIr)} (Lei 7.713/1988, art. 9º).`);
    } else verba({ codigo: def.fgts ? 'PROLABFGTS' : prolabore ? 'PROLAB' : 'RPA', descricao: prolabore ? 'Pró-labore' : `Serviços prestados${l.descricao.trim() ? ` (${l.descricao.trim()})` : ''}`, referencia: '', tipo: 'provento', valor: l.valor, inss: true, fgts: !!def.fgts, irrf: true });
    if (def.fgts) {
        r.bases.fgts = l.valor;
        r.fgts = Math.round(l.valor * ALIQ_FGTS_DIRETOR / 100);
        r.memoria.push(`FGTS do diretor não empregado equiparado (721): ${ALIQ_FGTS_DIRETOR}% de ${reais(l.valor)} = ${reais(r.fgts)} (Lei 8.036/1990, art. 15 e art. 16), sem desconto do diretor; a guia sai do FGTS Digital a partir do S-1200.`);
    }

    // INSS do segurado: 11% até o teto, descontado o que já houve em outras fontes no mês.
    const tInss = tabelaVigente(tabelas, 'inss', competencia);
    let inss = 0;
    if ('erro' in tInss) return erro(`INSS: ${tInss.erro}`);
    const teto = tInss.tabela.faixas[tInss.tabela.faixas.length - 1]?.ate ?? remuneracao;
    const outras = l.outrasFontes.reduce((s, o) => s + o.valor, 0);
    const base = Math.max(0, Math.min(remuneracao, teto - outras));
    inss = Math.round(base * 11 / 100);
    if (outras) r.indMV = outras >= teto ? '3' : outras + remuneracao > teto ? '2' : '1';
    r.bases.inss = base;
    r.memoria.push(`INSS do contribuinte individual: 11% sobre ${reais(base)}${base < remuneracao ? ` (teto ${reais(teto)}${outras ? ` − ${reais(outras)} já recebidos em outras fontes` : ''})` : ''} = ${reais(inss)} (Lei 8.212/1991, art. 21; Lei 10.666/2003, art. 4º).`);
    if (r.indMV === '3') r.memoria.push('Outras fontes já chegaram ao teto: nada a descontar (S-1200, indMV 3).');
    verba({ codigo: 'INSS', descricao: 'INSS', referencia: '11%', tipo: 'desconto', valor: inss, inss: false, fgts: false, irrf: false });
    if (transp) {
        // SEST e SENAT sobre toda a base de 20% (o S-5001 soma as bases da categoria, sem o teto).
        const sest = Math.round(remuneracao * ALIQ_SEST / 100);
        const senat = Math.round(remuneracao * ALIQ_SENAT / 100);
        verba({ codigo: 'SEST', descricao: 'SEST', referencia: pct(ALIQ_SEST), tipo: 'desconto', valor: sest, inss: false, fgts: false, irrf: false });
        verba({ codigo: 'SENAT', descricao: 'SENAT', referencia: pct(ALIQ_SENAT), tipo: 'desconto', valor: senat, inss: false, fgts: false, irrf: false });
        r.memoria.push(`SEST ${pct(ALIQ_SEST)} e SENAT ${pct(ALIQ_SENAT)} sobre ${reais(remuneracao)} = ${reais(sest)} e ${reais(senat)}, descontados do transportador (códigos 121802 e 122102 no S-5001).`);
    }

    // IRRF do mês do pagamento.
    const tIr = tabelaVigente(tabelas, 'irrf', r.pagamento);
    if ('erro' in tIr) return erro(`IRRF: ${tIr.erro}`);
    const t = tIr.tabela;
    const dep = c.dependentes.length * (t.valores.deducaoDependente ?? 0);
    const legais = inss + dep;
    const a = apurarIrrf(t, rendimentoIr, legais);
    let ir = a.valor;
    r.bases.irrf = rendimentoIr;
    r.memoria.push(`IRRF (pagamento em ${br(l.dataPagamento)}, tabela de ${rotuloCompetencia(t.vigencia)}): ${reais(rendimentoIr)} − ${a.simplificado ? `desconto simplificado ${reais(a.deducao)}` : `deduções legais ${reais(legais)}${c.dependentes.length ? ` (INSS + ${c.dependentes.length} dependente(s))` : ''}`} = base ${reais(a.base)} × ${pct(a.aliquota)} − ${reais(a.deducaoFaixa)} = ${reais(a.bruto)}.`, ...a.memoriaRedutor);
    if (ir > 0 && ir <= IRRF_MINIMO) { r.memoria.push(`IRRF de ${reais(ir)} não retido: até R$ 10,00 a retenção é dispensada (Lei 9.430/1996, art. 67).`); ir = 0; }
    r.irrfApurado = { rendimentos: rendimentoIr, deducoesLegais: legais, valor: ir };
    r.deducoesIrrf = { simplificado: a.simplificado, dependentes: c.dependentes.map(d => ({ cpf: d.cpf, nome: d.nome })), porDependente: t.valores.deducaoDependente ?? 0, pensao: 0 };
    verba({ codigo: 'IRRF', descricao: 'IRRF', referencia: a.aliquota ? pct(a.aliquota) : '', tipo: 'desconto', valor: ir, inss: false, fgts: false, irrf: false });

    // ISS retido do autônomo não inscrito no município.
    if (!prolabore && !transp) {
        if (c.inscritoIss) r.memoria.push('ISS: autônomo inscrito no município, recolhe por conta própria; sem retenção.');
        else if (l.issAliquota > 0) {
            const iss = Math.round(l.valor * l.issAliquota / 100);
            verba({ codigo: 'ISS', descricao: 'ISS retido', referencia: pct(l.issAliquota), tipo: 'desconto', valor: iss, inss: false, fgts: false, irrf: false });
            r.memoria.push(`ISS retido: ${pct(l.issAliquota)} de ${reais(l.valor)} = ${reais(iss)} (alíquota da lei do município do serviço).`);
        } else r.avisos.push('Autônomo não inscrito no município: confira se a lei municipal manda o tomador reter o ISS (informe a alíquota).');
    }

    // Parte da empresa: 20% sobre a remuneração, sem teto (Lei 8.212/1991, art. 22, III).
    if (!enquadramento) r.avisos.push('Empresa sem enquadramento previdenciário vigente (Cadastros › Enquadramento): a parte patronal de 20% não foi calculada.');
    else if (enquadramento.regime === 'simples') { r.patronal = { base: remuneracao, aliquota: 0, valor: 0 }; r.memoria.push('Parte da empresa: Simples Nacional fora do Anexo IV, a contribuição patronal está no DAS.'); }
    else { const v = Math.round(remuneracao * 20 / 100); r.patronal = { base: remuneracao, aliquota: 20, valor: v }; r.memoria.push(`Parte da empresa: 20% de ${reais(remuneracao)} = ${reais(v)} (Lei 8.212/1991, art. 22, III), sem RAT e sem terceiros.`); }

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
        quantidade: ok.length, bruto: ok.reduce((s, r) => s + r.totais.proventos, 0), inssRetido: v('INSS'), irrf: v('IRRF'), iss: v('ISS'), sestSenat: v('SEST') + v('SENAT'), fgts: ok.reduce((s, r) => s + r.fgts, 0),
        patronal: ok.reduce((s, r) => s + (r.patronal?.valor ?? 0), 0), liquido: ok.reduce((s, r) => s + r.totais.liquido, 0),
    };
}
