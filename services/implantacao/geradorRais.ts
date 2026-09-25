// services/implantacao/geradorRais.ts
//
// Gera o arquivo de declaração da RAIS a partir do cadastro unificado
// (XML do S-2200 + ficha PDF), para a rotina "Utilitários > Importações >
// Importação de Dados da RAIS2009 (Engenharia Reversa)" do IOB Office.
//
// PARAMETRIZADO POR VARIANTE, porque ainda não se sabe qual delas a IOB lê:
//   'generico'   GDRAIS Genérico 1976-2022 — registro de 461 posições
//   'anual2022'  ano-base 2022             — registro de 584 posições
// Gere as duas e teste na IOB: a que tiver o comprimento errado é rejeitada.
// Ver services/implantacao/layoutRais.ts para a transcrição comentada.
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
    generico: { rotulo: 'GDRAIS Genérico 1976-2022 (461 posições)', tamanho: 461 },
    anual2022: { rotulo: 'RAIS ano-base 2022 (584 posições)', tamanho: 584 },
};

export interface EmpresaRais {
    cnpj: string;
    razaoSocial: string;
    logradouro?: string; numero?: string; complemento?: string; bairro?: string;
    cep?: string; municipio?: string; nomeMunicipio?: string; uf?: string;
    ddd?: string; telefone?: string; email?: string;
    /** Só usados na variante anual2022 (o genérico não tem estes campos no TIPO-1). */
    cnae?: string; naturezaJuridica?: string;
}

/**
 * Códigos cuja tabela da RAIS NÃO foi confirmada contra o manual. Ficam como
 * parâmetro em vez de chute embutido: o gerador avisa sempre que usa o padrão.
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

export const PADROES_RAIS_VAZIOS: PadroesRais = {
    tipoAdmissao: '', vinculoEmpregaticio: '', tipoSalarioContratual: '', categoria: '',
};

export interface OpcoesRais {
    variante: VarianteRais;
    empresa: EmpresaRais;
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
    const e = o.empresa;
    const geracao = o.dataGeracao ?? new Date();
    const dd = String(geracao.getDate()).padStart(2, '0');
    const mm = String(geracao.getMonth() + 1).padStart(2, '0');
    r.por(1, 6, num(seq, 6));
    r.por(7, 20, num(e.cnpj, 14));
    r.por(21, 22, alfa('', 2));
    r.por(23, 23, '0');
    r.por(24, 24, '1');                       // constante
    r.por(25, 38, num(e.cnpj, 14));           // responsável = a própria empresa
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
    r.por(286, 337, alfa(e.razaoSocial, 52)); // nome do responsável
    r.por(338, 361, alfa('', 24));
    r.zeros(362, 372);                        // CPF do responsável
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
    r.zeros(276, 279);                        // número de proprietários
    r.zeros(280, 281);                        // data-base
    r.por(282, 282, '1');                     // tipo de inscrição: CNPJ
    r.por(283, 283, '0');                     // tipo de RAIS: com empregados
    r.zeros(284, 285);
    r.zeros(286, 297);                        // matrícula CEI/CNO vinculada
    r.por(298, 301, num(o.anoBase, 4));
    r.zeros(302, 302);                        // porte
    r.zeros(303, 304);                        // simples, PAT
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
    const matricula = d.matriculaIob || f.matricula;

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
        r.por(429, 458, alfa(matricula, 30));
        r.por(459, 461, num(p.categoria || d.categoria, 3));
        return r.toString();
    }

    // anual2022
    r.zeros(95, 96);                                  // nacionalidade (tabela RAIS)
    r.zeros(97, 100);                                 // ano de chegada ao país
    r.zeros(101, 102);                                // grau de instrução (tabela RAIS)
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
    r.zeros(293, 293);                                // raça/cor (tabela RAIS)
    r.por(294, 294, '2');                             // sem deficiência
    r.zeros(295, 295);
    r.por(296, 296, '2');                             // sem alvará judicial
    r.zeros(297, 305);
    r.por(306, 306, sexo);
    r.zeros(307, 339);                                // MOVIMENTO
    r.zeros(340, 495);                                // MOVIMENTO
    r.por(496, 502, num(d.municipio, 7));
    r.zeros(503, 538);                                // MOVIMENTO
    r.por(539, 539, '2');                             // filiado a sindicato: não
    r.por(540, 540, '2');
    r.por(541, 541, '2');
    r.por(542, 542, '2');
    r.por(543, 543, '2');
    r.por(544, 573, alfa(matricula, 30));
    r.por(574, 576, num(p.categoria || d.categoria, 3));
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
    anual2022: ['endereço', 'filiação', 'estado civil', 'e-mail', 'telefone', 'identidade',
        'naturalidade', 'dependentes'],
};

export function gerarArquivoRais(
    funcionarios: FuncionarioUnificado[],
    opcoes: OpcoesRais,
): ResultadoRais {
    const tam = VARIANTES_RAIS[opcoes.variante].tamanho;
    const p: PadroesRais = { ...PADROES_RAIS_VAZIOS, ...(opcoes.padroes ?? {}) };
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

    // Códigos cuja tabela da RAIS não foi confirmada. Sair zerado é melhor que
    // sair errado, mas o operador precisa saber que saiu zerado.
    const pendentes: [keyof PadroesRais, string][] = [
        ['tipoAdmissao', 'Tipo de Admissão'],
        ['vinculoEmpregaticio', 'Vínculo empregatício'],
        ['tipoSalarioContratual', 'Tipo de Salário Contratual'],
        ['categoria', 'Categoria'],
    ];
    for (const [chave, rotulo] of pendentes) {
        if (!String(p[chave] ?? '').trim()) {
            avisos.push(`${rotulo}: sem código informado — o campo sai zerado. A tabela da RAIS não é a do eSocial; confirme o código antes de importar.`);
        }
    }
    avisos.push(
        `A RAIS não transporta: ${RAIS_FORA_DO_ARQUIVO[opcoes.variante].join(', ')}. ` +
        'Esses campos continuam na digitação da ficha.',
    );
    avisos.push(
        `Layout ${VARIANTES_RAIS[opcoes.variante].rotulo}. Ainda não confirmado contra um arquivo real ` +
        'nem contra a rotina da IOB — gere as duas variantes e veja qual ela aceita.',
    );

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
