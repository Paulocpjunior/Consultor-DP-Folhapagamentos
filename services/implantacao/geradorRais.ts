// services/implantacao/geradorRais.ts
//
// Gera o arquivo de declaração da RAIS a partir do cadastro unificado
// (XML do S-2200 + ficha PDF), para a rotina "Utilitários > Importações >
// Importação de Dados da RAIS2009 (Engenharia Reversa)" do IOB Office.
//
// PARAMETRIZADO POR VARIANTE:
//   'anual2022'  registro de 584 posições — RECOMENDADO. Em 28/09/2026 a
//                própria IOB Office da SP Assessoria gerou um arquivo RAIS
//                (ano-base 2021, 152 vínculos) e ele decodifica campo a campo
//                neste layout: 584 posições, CRLF, TIPO-0/1/2/9. É o que a
//                IOB escreve, logo é o candidato natural para o que ela lê.
//   'generico'   GDRAIS Genérico 1976-2022 — 461 posições. Mantido como
//                alternativa caso a rotina "RAIS2009" recuse o anual.
// Ver services/implantacao/layoutRais.ts para a transcrição comentada.
//
// O QUE O ARQUIVO REAL ENSINOU (e este gerador espelha):
//   - matrícula (30 posições) sai NUMÉRICA, zero-preenchida à direita:
//     "000000000000000000000000000001" — não alfanumérica à esquerda;
//   - códigos de um CLT mensalista comum: tipo de admissão 01, tipo de salário
//     1 (mensal), vínculo 10, categoria = a do eSocial (101), nacionalidade
//     10, instrução com 2 dígitos igual ao eSocial (07), raça 8 = parda;
//   - município do local de trabalho sai zerado, ano de chegada zerado;
//   - o responsável no TIPO-0 é o ESCRITÓRIO (razão social, CPF e nome do
//     contador), não a empresa declarada.
//
// ESCOPO: carga CADASTRAL. Todos os campos de movimento (remunerações mês a
// mês, 13º, afastamentos, horas extras, contribuições) saem zerados de
// propósito — este módulo nunca exporta valor de folha.
//
// O QUE NÃO DÁ PARA PREENCHER: a RAIS não tem endereço do trabalhador,
// filiação, estado civil, e-mail, telefone, identidade, naturalidade nem
// dependentes; o genérico também não tem nacionalidade, grau de instrução,
// raça/cor nem município. Isso fica para a ficha, e o resultado avisa.

import { digitos } from './implantacao';
import type { FuncionarioUnificado } from './unificacao';

export type VarianteRais = 'generico' | 'anual2022';

export const VARIANTES_RAIS: Record<VarianteRais, { rotulo: string; tamanho: number }> = {
    anual2022: { rotulo: 'RAIS 584 posições — o que a IOB Office gera (recomendado)', tamanho: 584 },
    generico: { rotulo: 'GDRAIS Genérico 461 posições — alternativa', tamanho: 461 },
};

export interface EmpresaRais {
    cnpj: string;
    razaoSocial: string;
    logradouro?: string; numero?: string; complemento?: string; bairro?: string;
    cep?: string; municipio?: string; nomeMunicipio?: string; uf?: string;
    ddd?: string; telefone?: string; email?: string;
    /** Só usados na variante anual2022 (o genérico não tem estes campos no TIPO-1). */
    cnae?: string; naturezaJuridica?: string;
    /** Porte: 1 micro, 2 EPP, 3 demais. Simples/PAT: 1 sim, 2 não. Data-base: mês (01-12). */
    porte?: string; simples?: string; pat?: string; dataBase?: string; numeroProprietarios?: string;
}

/**
 * Responsável pela declaração (TIPO-0). No arquivo real da IOB é o
 * ESCRITÓRIO — razão social, endereço, e-mail, nome e CPF do contador.
 * Se omitido, a própria empresa é usada.
 */
export interface ResponsavelRais {
    cnpj: string; razaoSocial: string; nome?: string; cpf?: string;
    logradouro?: string; numero?: string; complemento?: string; bairro?: string;
    cep?: string; municipio?: string; nomeMunicipio?: string; uf?: string;
    ddd?: string; telefone?: string; email?: string;
}

/**
 * Códigos com tabela própria da RAIS. Os padrões vêm de um arquivo REAL gerado
 * pela IOB (28/09/2026) para um CLT mensalista urbano por prazo indeterminado;
 * quem for diferente disso (horista, rural, temporário, aprendiz) precisa de
 * outro código, e o gerador avisa que usou o padrão.
 */
export interface PadroesRais {
    /** Tipo de Admissão. */
    tipoAdmissao: string;
    /** Vínculo empregatício. */
    vinculoEmpregaticio: string;
    /** Tipo de Salário Contratual. */
    tipoSalarioContratual: string;
    /** Categoria (3 posições, no fim do TIPO-2). */
    categoria: string;
}

/** Padrão de CLT mensalista — os valores que a IOB gravou no arquivo real. */
export const PADROES_RAIS_CLT_MENSALISTA: PadroesRais = {
    tipoAdmissao: '01', vinculoEmpregaticio: '10', tipoSalarioContratual: '1',
    /** vazio = usa a categoria do eSocial do próprio vínculo (a IOB grava 101). */
    categoria: '',
};

/** eSocial racaCor → RAIS raça/cor (confirmado: parda = 3 no eSocial, 8 no arquivo da IOB). */
const RACA_ESOCIAL_PARA_RAIS: Record<string, string> = {
    '1': '2', '2': '4', '3': '8', '4': '6', '5': '1', '6': '9',
};

/** eSocial paisNac → RAIS nacionalidade (105 Brasil → 10 brasileiro, como no arquivo da IOB). */
const NACIONALIDADE_ESOCIAL_PARA_RAIS: Record<string, string> = { '105': '10' };

export interface OpcoesRais {
    variante: VarianteRais;
    empresa: EmpresaRais;
    /** Escritório responsável pela declaração; default = a empresa. */
    responsavel?: ResponsavelRais;
    /** Ano-base da declaração (aaaa). */
    anoBase: string;
    /** Data de geração; default = agora. */
    dataGeracao?: Date;
    padroes?: Partial<PadroesRais>;
}

export interface ResultadoRais {
    conteudo: string;
    /** Uma linha por registro, na ordem do arquivo. */
    linhas: string[];
    tamanhoRegistro: number;
    totalEstabelecimentos: number;
    totalVinculos: number;
    /** Impedem a geração. */
    erros: string[];
    /** Não impedem, mas precisam de conferência antes de importar. */
    avisos: string[];
}

// ─── Formatação ───────────────────────────────────────────────────────────

const semAcento = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' ');

/** Numérico: alinhado à direita, zeros à esquerda. Trunca pela direita. */
function num(valor: string | number | undefined | null, tam: number): string {
    const d = digitos(String(valor ?? ''));
    if (!d) return '0'.repeat(tam);
    return d.length > tam ? d.slice(-tam) : d.padStart(tam, '0');
}

/** Alfanumérico: alinhado à esquerda, espaços à direita, sem acento. */
function alfa(valor: string | undefined | null, tam: number): string {
    const t = semAcento(String(valor ?? '').trim()).toUpperCase();
    return t.length > tam ? t.slice(0, tam) : t.padEnd(tam, ' ');
}

/** ISO (aaaa-mm-dd) ou ddmmaaaa → ddmmaaaa. Vazio → zeros. */
function data8(valor: string | undefined): string {
    const v = String(valor ?? '').trim();
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}${iso[2]}${iso[1]}`;
    const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br) return `${br[1]}${br[2]}${br[3]}`;
    const d = digitos(v);
    return d.length === 8 ? d : '0'.repeat(8);
}

/** Valor decimal → inteiro com centavos implícitos, zero-preenchido. */
function valor(v: string | number | undefined, tam: number): string {
    const n = Number(String(v ?? '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return '0'.repeat(tam);
    return String(Math.round(n * 100)).padStart(tam, '0').slice(-tam);
}

/** Escreve um campo num registro, validando o tamanho. */
class Registro {
    private buf: string[];
    constructor(private tamanho: number) { this.buf = Array(tamanho).fill(' '); }
    /** `ini`/`fim` são 1-based, como no manual. */
    por(ini: number, fim: number, texto: string): void {
        const tam = fim - ini + 1;
        if (texto.length !== tam) {
            throw new Error(`Campo ${ini}-${fim}: esperado ${tam} caracteres, veio ${texto.length}.`);
        }
        for (let i = 0; i < tam; i++) this.buf[ini - 1 + i] = texto[i];
    }
    /** Preenche uma faixa com zeros — usado nos campos de movimento. */
    zeros(ini: number, fim: number): void {
        this.por(ini, fim, '0'.repeat(fim - ini + 1));
    }
    toString(): string {
        const s = this.buf.join('');
        if (s.length !== this.tamanho) throw new Error(`Registro com ${s.length} posições, esperado ${this.tamanho}.`);
        return s;
    }
}

// ─── Registros ────────────────────────────────────────────────────────────

function tipo0(seq: number, o: OpcoesRais, tam: number): string {
    const r = new Registro(tam);
    const e: ResponsavelRais = o.responsavel ?? { ...o.empresa };
    const geracao = o.dataGeracao ?? new Date();
    const dd = String(geracao.getDate()).padStart(2, '0');
    const mm = String(geracao.getMonth() + 1).padStart(2, '0');
    r.por(1, 6, num(seq, 6));
    r.por(7, 20, num(o.empresa.cnpj, 14));   // 1º estabelecimento do arquivo
    r.por(21, 22, alfa('', 2));
    r.por(23, 23, '0');
    r.por(24, 24, '1');                       // constante
    r.por(25, 38, num(e.cnpj, 14));           // responsável (escritório ou a empresa)
    r.por(39, 39, '1');                       // tipo de inscrição: 1 = CNPJ
    r.por(40, 79, alfa(e.razaoSocial, 40));
    r.por(80, 119, alfa(e.logradouro, 40));
    r.por(120, 125, num(e.numero, 6));
    r.por(126, 146, alfa(e.complemento, 21));
    r.por(147, 165, alfa(e.bairro, 19));
    r.por(166, 173, num(e.cep, 8));
    r.por(174, 180, num(e.municipio, 7));
    r.por(181, 210, alfa(e.nomeMunicipio, 30));
    r.por(211, 212, alfa(e.uf, 2));
    r.por(213, 214, num(e.ddd, 2));
    r.por(215, 223, num(e.telefone, 9));
    r.por(224, 224, '2');                     // não é retificação
    r.zeros(225, 232);                        // data da retificação
    r.por(233, 240, `${dd}${mm}${geracao.getFullYear()}`);
    r.por(241, 285, alfa(e.email, 45));
    r.por(286, 337, alfa(e.nome || e.razaoSocial, 52)); // nome do responsável
    r.por(338, 361, alfa('', 24));
    r.por(362, 372, num(e.cpf, 11));          // CPF do responsável
    r.zeros(373, 384);                        // CREA a retificar
    r.zeros(385, 392);                        // nascimento do responsável
    r.por(393, tam, alfa('', tam - 392));     // espaços até o fim (461 ou 584)
    return r.toString();
}

function tipo1(seq: number, o: OpcoesRais, tam: number): string {
    const r = new Registro(tam);
    const e = o.empresa;
    r.por(1, 6, num(seq, 6));
    r.por(7, 20, num(e.cnpj, 14));
    r.por(21, 22, alfa('', 2));
    r.por(23, 23, '1');
    r.por(24, 75, alfa(e.razaoSocial, 52));
    r.por(76, 115, alfa(e.logradouro, 40));
    r.por(116, 121, num(e.numero, 6));
    r.por(122, 142, alfa(e.complemento, 21));
    r.por(143, 161, alfa(e.bairro, 19));
    r.por(162, 169, num(e.cep, 8));
    r.por(170, 176, num(e.municipio, 7));
    r.por(177, 206, alfa(e.nomeMunicipio, 30));
    r.por(207, 208, alfa(e.uf, 2));
    r.por(209, 210, num(e.ddd, 2));
    r.por(211, 219, num(e.telefone, 9));

    if (o.variante === 'generico') {
        r.por(220, 220, '1');                 // tipo de inscrição: CNPJ
        r.por(221, 221, '0');                 // tipo de RAIS: com empregados
        r.zeros(222, 223);
        r.zeros(224, 235);                    // matrícula CEI vinculada
        r.por(236, 239, num(o.anoBase, 4));
        r.por(240, 240, '2');                 // não encerrou atividades
        r.zeros(241, 248);                    // data de encerramento
        r.zeros(249, 252);                    // natureza jurídica
        r.por(253, 423, alfa('', 171));
        r.por(424, 461, alfa('', 38));
        return r.toString();
    }

    // anual2022
    r.por(220, 264, alfa(e.email, 45));
    r.por(265, 271, num(e.cnae, 7));
    r.por(272, 275, num(e.naturezaJuridica, 4));
    r.por(276, 279, num(e.numeroProprietarios, 4));
    r.por(280, 281, num(e.dataBase, 2));
    r.por(282, 282, '1');                     // tipo de inscrição: CNPJ
    r.por(283, 283, '0');                     // tipo de RAIS: com empregados
    r.zeros(284, 285);
    r.zeros(286, 297);                        // matrícula CEI/CNO vinculada
    r.por(298, 301, num(o.anoBase, 4));
    r.por(302, 302, num(e.porte, 1));
    r.por(303, 303, num(e.simples, 1));
    r.por(304, 304, num(e.pat, 1));
    r.zeros(305, 334);                        // PAT e percentuais
    r.por(335, 335, '2');                     // não encerrou atividades
    r.zeros(336, 343);                        // data de encerramento
    r.zeros(344, 435);                        // contribuições patronais
    r.por(436, 436, '1');                     // esteve em atividade
    r.por(437, 437, '2');                     // não centraliza contribuição
    r.zeros(438, 451);                        // estabelecimento centralizador
    r.zeros(452, 454);                        // indicadores + controle de ponto
    r.por(455, 539, alfa('', 85));
    r.por(540, 584, alfa('', 45));
    return r.toString();
}

function tipo2(seq: number, f: FuncionarioUnificado, o: OpcoesRais, p: PadroesRais, tam: number): string {
    const r = new Registro(tam);
    const d = f.dados;
    const sexo = String(d.sexo ?? '').trim().toUpperCase() === 'F' ? '2' : '1';
    // A IOB grava a matrícula como NÚMERO zero-preenchido nas 30 posições
    // ("…0001"). Espelhado aqui: é o código que o funcionário terá na IOB.
    const matricula = num(d.matriculaIob || f.matricula, 30);
    const categoria = num(p.categoria || d.categoria, 3);

    r.por(1, 6, num(seq, 6));
    r.por(7, 20, num(d.estabelecimento || o.empresa.cnpj, 14));
    r.por(21, 22, alfa('', 2));
    r.por(23, 23, '2');
    r.por(24, 34, num(d.pis, 11));
    r.por(35, 86, alfa(d.nome, 52));
    r.por(87, 94, data8(d.nascimento));

    if (o.variante === 'generico') {
        r.por(95, 105, num(f.cpf, 11));
        r.por(106, 106, '0');                         // constante
        r.por(107, 114, num(d.ctps, 8));
        r.por(115, 119, num(d.serieCtps, 5));         // zeros à esquerda (nota do manual)
        r.por(120, 127, data8(d.admissao));
        r.por(128, 129, num(p.tipoAdmissao, 2));
        r.por(130, 141, valor(d.salario, 12));
        r.por(142, 142, num(p.tipoSalarioContratual, 1));
        r.por(143, 144, num(Math.trunc(Number(d.horasSemanais ?? 0)), 2));
        r.por(145, 150, num(d.cbo, 6));
        r.por(151, 152, num(p.vinculoEmpregaticio, 2));
        r.zeros(153, 154);                            // código do desligamento
        r.zeros(155, 158);                            // data do desligamento
        r.zeros(159, 342);                            // MOVIMENTO
        r.por(343, 343, '2');                         // sem deficiência
        r.zeros(344, 344);                            // tipo de deficiência
        r.zeros(345, 423);                            // MOVIMENTO
        r.por(424, 424, '2');                         // aprendiz grávida: não
        r.por(425, 425, '2');                         // trabalho parcial: não
        r.por(426, 426, '2');                         // teletrabalho: não
        r.por(427, 427, '2');                         // trabalho intermitente: não
        r.por(428, 428, sexo);
        r.por(429, 458, matricula);
        r.por(459, 461, categoria);
        return r.toString();
    }

    // anual2022
    r.por(95, 96, num(NACIONALIDADE_ESOCIAL_PARA_RAIS[digitos(d.nacionalidade ?? '')] ?? '', 2));
    r.zeros(97, 100);                                 // ano de chegada ao país (IOB grava 0000)
    r.por(101, 102, num(d.escolaridade, 2));          // mesma numeração do eSocial (07 = médio completo)
    r.por(103, 113, num(f.cpf, 11));
    r.por(114, 121, num(d.ctps, 8));
    r.por(122, 126, num(d.serieCtps, 5));
    r.por(127, 134, data8(d.admissao));
    r.por(135, 136, num(p.tipoAdmissao, 2));
    r.por(137, 145, valor(d.salario, 9));
    r.por(146, 146, num(p.tipoSalarioContratual, 1));
    r.por(147, 148, num(Math.trunc(Number(d.horasSemanais ?? 0)), 2));
    r.por(149, 154, num(d.cbo, 6));
    r.por(155, 156, num(p.vinculoEmpregaticio, 2));
    r.zeros(157, 158);
    r.zeros(159, 162);
    r.zeros(163, 292);                                // MOVIMENTO
    r.por(293, 293, num(RACA_ESOCIAL_PARA_RAIS[digitos(d.raca ?? '')] ?? '', 1));
    r.por(294, 294, '2');                             // sem deficiência
    r.zeros(295, 295);
    r.por(296, 296, '2');                             // sem alvará judicial
    r.zeros(297, 305);
    r.por(306, 306, sexo);
    r.zeros(307, 339);                                // MOVIMENTO
    r.zeros(340, 495);                                // MOVIMENTO
    r.zeros(496, 502);                                // município do local de trabalho: a IOB grava 0000000
    r.zeros(503, 538);                                // MOVIMENTO
    r.por(539, 539, '2');                             // filiado a sindicato: não
    r.por(540, 540, '2');
    r.por(541, 541, '2');
    r.por(542, 542, '2');
    r.por(543, 543, '2');
    r.por(544, 573, matricula);
    r.por(574, 576, categoria);
    r.por(577, 584, alfa('', 8));
    return r.toString();
}

function tipo9(seq: number, o: OpcoesRais, estab: number, vinc: number, tam: number): string {
    const r = new Registro(tam);
    r.por(1, 6, num(seq, 6));
    r.por(7, 20, num(o.empresa.cnpj, 14));
    r.por(21, 22, alfa('', 2));
    r.por(23, 23, '9');
    r.por(24, 29, num(estab, 6));
    r.por(30, 35, num(vinc, 6));
    r.por(36, tam, alfa('', tam - 35));
    return r.toString();
}

// ─── Geração ──────────────────────────────────────────────────────────────

/** Campos do cadastro que a RAIS simplesmente não tem — informativo. */
export const RAIS_FORA_DO_ARQUIVO: Record<VarianteRais, string[]> = {
    generico: ['nacionalidade', 'grau de instrução', 'raça/cor', 'município do local de trabalho',
        'endereço', 'filiação', 'estado civil', 'e-mail', 'telefone', 'identidade', 'naturalidade', 'dependentes'],
    anual2022: ['município do local de trabalho (a IOB grava zerado)', 'endereço', 'filiação', 'estado civil',
        'e-mail', 'telefone', 'identidade', 'naturalidade', 'dependentes'],
};

export function gerarArquivoRais(
    funcionarios: FuncionarioUnificado[],
    opcoes: OpcoesRais,
): ResultadoRais {
    const tam = VARIANTES_RAIS[opcoes.variante].tamanho;
    // Só sobrescreve o padrão com o que veio PREENCHIDO: a tela manda os
    // quatro campos sempre, vazios quando o usuário não mexeu.
    const p: PadroesRais = { ...PADROES_RAIS_CLT_MENSALISTA };
    for (const k of Object.keys(p) as (keyof PadroesRais)[]) {
        const v = String(opcoes.padroes?.[k] ?? '').trim();
        if (v) p[k] = v;
    }
    const erros: string[] = [];
    const avisos: string[] = [];

    if (digitos(opcoes.empresa.cnpj).length !== 14) {
        erros.push('CNPJ da empresa inválido: informe os 14 dígitos.');
    }
    if (!opcoes.empresa.razaoSocial?.trim()) {
        erros.push('Razão social da empresa não informada.');
    }
    if (!/^\d{4}$/.test(String(opcoes.anoBase))) {
        erros.push('Ano-base inválido: informe 4 dígitos (ex.: 2009).');
    }
    const ativos = funcionarios.filter(f => !f.desligado);
    if (!ativos.length) erros.push('Nenhum funcionário ativo para gerar.');

    // Padrões de CLT mensalista urbano, prazo indeterminado — os valores que a
    // IOB gravou num arquivo real. Quem não for isso precisa de outro código.
    const usouPadrao = (['tipoAdmissao', 'vinculoEmpregaticio', 'tipoSalarioContratual'] as const)
        .filter(k => !opcoes.padroes || !String(opcoes.padroes[k] ?? '').trim());
    if (usouPadrao.length) {
        avisos.push(
            `Códigos no padrão de CLT mensalista urbano (tipo de admissão ${p.tipoAdmissao}, vínculo ${p.vinculoEmpregaticio}, ` +
            `tipo de salário ${p.tipoSalarioContratual}) — os mesmos que a IOB grava. Horista, rural, temporário ou aprendiz precisam de outro código.`,
        );
    }
    if (!opcoes.responsavel) {
        avisos.push('Responsável pela declaração (TIPO-0) = a própria empresa. No arquivo da IOB é o escritório; informe-o se a rotina exigir.');
    }
    avisos.push(
        `A RAIS não transporta: ${RAIS_FORA_DO_ARQUIVO[opcoes.variante].join(', ')}. ` +
        'Esses campos continuam na digitação da ficha.',
    );
    if (opcoes.variante === 'anual2022') {
        avisos.push('Layout de 584 posições — o mesmo que a IOB Office gera (conferido contra arquivo real de 28/09/2026). Falta só o teste na rotina de importação.');
    } else {
        avisos.push('Layout genérico de 461 posições — alternativa. A IOB Office GERA o de 584; use este só se o anual for recusado.');
    }

    if (erros.length) {
        return { conteudo: '', linhas: [], tamanhoRegistro: tam, totalEstabelecimentos: 0, totalVinculos: 0, erros, avisos };
    }

    const linhas: string[] = [];
    let seq = 1;
    linhas.push(tipo0(seq++, opcoes, tam));
    linhas.push(tipo1(seq++, opcoes, tam));
    for (const f of ativos) {
        if (!f.dados.nome?.trim()) { erros.push(`${f.matricula}: sem nome, registro não gerado.`); continue; }
        if (digitos(f.cpf).length !== 11) { erros.push(`${f.dados.nome}: CPF inválido, registro não gerado.`); continue; }
        linhas.push(tipo2(seq++, f, opcoes, p, tam));
    }
    const totalVinculos = linhas.length - 2;
    linhas.push(tipo9(seq, opcoes, 1, totalVinculos, tam));

    return {
        conteudo: linhas.join('\r\n') + '\r\n',
        linhas,
        tamanhoRegistro: tam,
        totalEstabelecimentos: 1,
        totalVinculos,
        erros,
        avisos,
    };
}
