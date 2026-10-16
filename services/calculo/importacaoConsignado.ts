// services/calculo/importacaoConsignado.ts
//
// Crédito do Trabalhador, etapa 3 do estudo (D4 e F1): importa o arquivo de empréstimos da competência baixado no Portal
// Emprega Brasil (CSV, XLS/XLSX ou JSON, matriz e filiais juntas) e propõe, ficha a ficha, o que muda nos contratos:
// contrato novo, parcela alterada (renegociação), contrato que volta e contrato que sumiu do arquivo (quitado, suspenso ou
// portado). Nada é gravado aqui: a tela mostra a prévia e só grava o que o usuário confirmar.
//
// O guia oficial do leiaute (versão 1.4) não abre do ambiente em que isto foi escrito; os nomes de coluna abaixo vêm de
// fontes secundárias (ifConcessora.codigo, contrato, cpf, matricula, valorParcela, competencia). Por isso a coluna de
// cada campo é sugerida pelo nome e conferida na tela, e um arquivo com outros nomes funciona escolhendo as colunas. Puro.

import * as XLSX from 'xlsx';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { NR_DOC_CONSIGNADO, type ContratoConsignado } from './consignado';
import { cpfValido } from '../implantacao/implantacao';

export type CampoArquivo = 'cpf' | 'matricula' | 'instFinanc' | 'nrDoc' | 'parcela' | 'competencia' | 'nome' | 'cnpj';
export const CAMPOS_ARQUIVO: { campo: CampoArquivo; rotulo: string; obrigatorio: boolean }[] = [
    { campo: 'cpf', rotulo: 'CPF do trabalhador', obrigatorio: true },
    { campo: 'instFinanc', rotulo: 'Instituição (código da Tabela 37)', obrigatorio: true },
    { campo: 'nrDoc', rotulo: 'Número do contrato', obrigatorio: true },
    { campo: 'parcela', rotulo: 'Valor da parcela', obrigatorio: true },
    { campo: 'competencia', rotulo: 'Competência', obrigatorio: false },
    { campo: 'matricula', rotulo: 'Matrícula', obrigatorio: false },
    { campo: 'cnpj', rotulo: 'CNPJ do empregador', obrigatorio: false },
    { campo: 'nome', rotulo: 'Nome do trabalhador', obrigatorio: false },
];
export type MapaColunas = Partial<Record<CampoArquivo, string>>;

export interface ArquivoLido { colunas: string[]; linhas: Record<string, string>[] }

/** Nome de coluna sem acento, caixa e pontuação: "ifConcessora.codigo" → "ifconcessoracodigo". */
const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Só nomes exatos (depois de normalizar): "ifConcessora.nome" não pode virar o nome do trabalhador.
const NOMES: Record<CampoArquivo, string[]> = {
    cpf: ['cpf', 'cpftrabalhador', 'cpfempregado', 'cpfdotrabalhador', 'nrcpf', 'cpfmutuario'],
    matricula: ['matricula', 'matriculaesocial', 'matriculatrabalhador', 'matriculaempregado'],
    instFinanc: ['ifconcessoracodigo', 'codigoifconcessora', 'codigoif', 'codif', 'instfinanc', 'codigoinstituicao', 'codigoinstituicaofinanceira', 'instituicaofinanceiracodigo', 'codigobanco', 'banco'],
    nrDoc: ['contrato', 'numerocontrato', 'numerodocontrato', 'nrcontrato', 'nrdoc', 'contratonumero'],
    parcela: ['valorparcela', 'valordaparcela', 'vlparcela', 'parcela', 'valorparcelamensal'],
    competencia: ['competencia', 'competenciadesconto', 'mescompetencia', 'perapur', 'mesreferencia'],
    nome: ['nome', 'nometrabalhador', 'nomeempregado', 'nomedotrabalhador'],
    cnpj: ['cnpj', 'cnpjempregador', 'cnpjempresa', 'inscricaoempregador', 'nrinscempregador'],
};

/** Sugere a coluna de cada campo pelo nome; o que não for reconhecido fica para o usuário escolher na tela. */
export function sugerirColunas(colunas: string[]): MapaColunas {
    const mapa: MapaColunas = {};
    for (const { campo } of CAMPOS_ARQUIVO) {
        const achada = NOMES[campo].map(n => colunas.find(c => chave(c) === n)).find(Boolean);
        if (achada) mapa[campo] = achada;
    }
    return mapa;
}

// ---------- Leitura do arquivo ----------

/** Objeto do JSON em linha plana: { ifConcessora: { codigo: '341' } } → { 'ifConcessora.codigo': '341' }. */
function achatar(o: unknown, prefixo = '', saida: Record<string, string> = {}): Record<string, string> {
    if (o && typeof o === 'object' && !Array.isArray(o)) {
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) achatar(v, prefixo ? `${prefixo}.${k}` : k, saida);
    } else if (prefixo) saida[prefixo] = o === null || o === undefined ? '' : String(o);
    return saida;
}
/** A primeira lista de objetos do JSON (o arquivo pode vir como lista ou dentro de um objeto). */
function listaDoJson(j: unknown): unknown[] | null {
    if (Array.isArray(j)) return j.some(x => x && typeof x === 'object') ? j : null;
    if (j && typeof j === 'object') for (const v of Object.values(j as Record<string, unknown>)) { const l = listaDoJson(v); if (l) return l; }
    return null;
}

function lerCsv(texto: string): ArquivoLido {
    const t = texto.replace(/^﻿/, '');
    const primeira = t.split(/\r?\n/, 1)[0] ?? '';
    const sep = [';', '\t', ',', '|'].map(s => [s, primeira.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
    const linhas: string[][] = [];
    let campo = '', linha: string[] = [], aspas = false;
    for (let i = 0; i < t.length; i++) {
        const ch = t[i];
        if (aspas) {
            if (ch === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else campo += ch;
        } else if (ch === '"') aspas = true;
        else if (ch === sep) { linha.push(campo); campo = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && t[i + 1] === '\n') i++;
            linha.push(campo); campo = '';
            if (linha.some(c => c.trim())) linhas.push(linha);
            linha = [];
        } else campo += ch;
    }
    linha.push(campo);
    if (linha.some(c => c.trim())) linhas.push(linha);
    const [cab = [], ...resto] = linhas;
    const colunas = cab.map(c => c.trim());
    return { colunas, linhas: resto.map(l => Object.fromEntries(colunas.map((c, i) => [c, (l[i] ?? '').trim()]))) };
}

/** Lê o arquivo do Portal (CSV, XLS/XLSX ou JSON) em colunas e linhas de texto. Lança erro com mensagem para a tela. */
export function lerArquivoEmprestimos(nome: string, conteudo: ArrayBuffer): ArquivoLido {
    const ext = nome.toLowerCase().split('.').pop() ?? '';
    if (ext === 'xls' || ext === 'xlsx') {
        const wb = XLSX.read(conteudo, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('Planilha vazia.');
        // raw: false traz o texto como aparece na célula (CPF e contrato sem virar número em notação científica).
        const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { raw: false, defval: '' }).map(l => Object.fromEntries(Object.entries(l).map(([k, v]) => [k.trim(), String(v).trim()])));
        const colunas = (XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false })[0] ?? []).map(c => String(c).trim()).filter(Boolean);
        return { colunas, linhas };
    }
    const texto = new TextDecoder('utf-8').decode(conteudo);
    if (ext === 'json' || /^\s*[[{]/.test(texto)) {
        let j: unknown;
        try { j = JSON.parse(texto.replace(/^﻿/, '')); } catch { throw new Error('JSON inválido: confira se o arquivo é o baixado do Portal, sem edição.'); }
        const lista = listaDoJson(j);
        if (!lista) throw new Error('O JSON não traz uma lista de empréstimos.');
        const linhas = lista.map(x => achatar(x));
        return { colunas: [...new Set(linhas.flatMap(l => Object.keys(l)))], linhas };
    }
    return lerCsv(texto);
}

// ---------- Valores ----------

const digitos = (s: string) => s.replace(/\D/g, '');
/** Centavos de "1.234,56", "1234,56", "1234.56", "1,234.56" ou "1234". Inválido: null. */
export function centavos(s: string): number | null {
    const t = s.replace(/[R$\s]/g, '');
    if (!/^-?[\d.,]+$/.test(t)) return null;
    const ultV = t.lastIndexOf(','), ultP = t.lastIndexOf('.');
    let n: string;
    if (ultV >= 0 && ultP >= 0) n = ultV > ultP ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (ultV >= 0) n = t.replace(/\./g, '').replace(',', '.');
    // Só ponto: decimal com até 2 casas depois dele ("1234.5"); com 3, separador de milhar ("1.234").
    else if (ultP >= 0) n = t.length - ultP - 1 <= 2 && t.indexOf('.') === ultP ? t : t.replace(/\./g, '');
    else n = t;
    const v = Number(n);
    return Number.isFinite(v) ? Math.round(v * 100) : null;
}
/** AAAA-MM de "2026-10", "202610", "10/2026", "10-2026", "2026/10" ou "2026-10-01". */
export function competenciaDoArquivo(s: string): string | null {
    const t = s.trim();
    let m = /^(\d{4})[-/]?(\d{2})(?:[-/]\d{2})?$/.exec(t);
    if (m) return Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null;
    m = /^(\d{1,2})[-/](\d{4})$/.exec(t);
    if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12 ? `${m[2]}-${m[1].padStart(2, '0')}` : null;
    return null;
}
const mesAnterior = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; };
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (c: string) => c.split('-').reverse().join('/');

// ---------- Prévia ----------

export type TipoAcao = 'novo' | 'parcela' | 'reativado' | 'ausente' | 'igual';
export const ROTULO_ACAO: Record<TipoAcao, string> = { novo: 'Contrato novo', parcela: 'Parcela alterada', reativado: 'Contrato de volta', ausente: 'Fora do arquivo', igual: 'Sem mudança' };
export interface AcaoImportacao {
    id: string; tipo: TipoAcao;
    fichaId: string; nome: string; cpf: string;
    instFinanc: string; nrDoc: string;
    parcelaAntes?: number; parcela?: number;
    descricao: string;
}
export interface PendenciaImportacao { linha: number; cpf: string; nrDoc: string; motivo: string }
export interface PreviaImportacao { competencia: string; acoes: AcaoImportacao[]; pendencias: PendenciaImportacao[]; avisos: string[]; lidas: number }

const vigente = (c: ContratoConsignado, comp: string) => c.inicio <= comp && (!c.fim || c.fim >= comp);
const ativaNaCompetencia = (f: FichaFuncionario, comp: string) => (f.dados.admissao ?? '').slice(0, 7) <= comp && !(f.dados.dataDesligamento && f.dados.dataDesligamento.slice(0, 7) < comp);

/**
 * Compara o arquivo da competência com os contratos das fichas da empresa. `cnpjEmpresa` (só dígitos ou formatado)
 * confere a raiz do empregador quando o arquivo traz o CNPJ.
 */
export function previaImportacao(arq: ArquivoLido, mapa: MapaColunas, competencia: string, fichas: FichaFuncionario[], cnpjEmpresa: string): PreviaImportacao {
    const pendencias: PendenciaImportacao[] = [];
    const avisos: string[] = [];
    const acoes: AcaoImportacao[] = [];
    const faltam = CAMPOS_ARQUIVO.filter(c => c.obrigatorio && !mapa[c.campo]).map(c => c.rotulo);
    if (faltam.length) return { competencia, acoes, pendencias, avisos: [`Escolha a coluna de: ${faltam.join(', ')}.`], lidas: 0 };
    const val = (l: Record<string, string>, c: CampoArquivo) => (mapa[c] ? l[mapa[c]!] ?? '' : '').trim();
    const raiz = digitos(cnpjEmpresa).slice(0, 8);

    // Linhas válidas do arquivo, por ficha.
    const porFicha = new Map<string, { ficha: FichaFuncionario; contratos: Map<string, { instFinanc: string; nrDoc: string; parcela: number; linha: number }> }>();
    let outraComp = 0;
    // Linha recusada de um CPF: os contratos dele não podem ser dados como fora do arquivo (Codex #277). Linha sem CPF
    // legível pode ser de qualquer um: nenhum contrato sai por ausência.
    const cpfsRecusados = new Set<string>();
    let cpfIlegivel = false;
    arq.linhas.forEach((l, i) => {
        const linha = i + 2; // 1 = cabeçalho
        const cpf = digitos(val(l, 'cpf')).padStart(11, '0');
        const nrDoc = val(l, 'nrDoc');
        const p = (motivo: string) => { pendencias.push({ linha, cpf, nrDoc, motivo }); cpfsRecusados.add(cpf); };
        // O Excel tira o zero à esquerda: completa até 11 e confere os dígitos verificadores.
        if (!cpfValido(cpf)) { cpfIlegivel = true; return p('CPF inválido.'); }
        const compTxt = val(l, 'competencia');
        if (compTxt) {
            const c = competenciaDoArquivo(compTxt);
            if (!c) return p(`Competência "${compTxt}" não reconhecida.`);
            if (c !== competencia) { outraComp++; return p(`Linha da competência ${br(c)}, não de ${br(competencia)}.`); }
        }
        const cnpj = digitos(val(l, 'cnpj'));
        if (cnpj && raiz && cnpj.slice(0, 8) !== raiz) return p('CNPJ de outro empregador.');
        const inst = digitos(val(l, 'instFinanc'));
        if (!inst || inst.length > 3) return p(`Instituição "${val(l, 'instFinanc')}" fora do código de 3 dígitos da Tabela 37.`);
        if (!NR_DOC_CONSIGNADO.test(nrDoc)) return p('Número do contrato fora do padrão do eSocial (2 a 15 caracteres: letras, números e . / - _ no meio).');
        const parcela = centavos(val(l, 'parcela'));
        if (parcela === null || parcela <= 0) return p(`Valor da parcela "${val(l, 'parcela')}" inválido.`);
        let cand = fichas.filter(f => f.cpf === cpf);
        if (!cand.length) return p('CPF sem ficha nesta empresa.');
        const mat = val(l, 'matricula');
        if (cand.length > 1 && mat) cand = cand.filter(f => f.matriculaEsocial === mat || f.dados.codigoIob === mat);
        if (cand.length > 1) cand = cand.filter(f => ativaNaCompetencia(f, competencia));
        if (cand.length !== 1) return p(cand.length ? 'Mais de um vínculo ativo no CPF: informe a coluna da matrícula.' : 'Nenhum vínculo ativo do CPF na competência.');
        const f = cand[0];
        const reg = porFicha.get(f.id) ?? { ficha: f, contratos: new Map() };
        const k = `${inst.padStart(3, '0')}|${nrDoc}`;
        const ja = reg.contratos.get(k);
        if (ja && ja.parcela !== parcela) return p(`Contrato repetido no arquivo com outra parcela (linha ${ja.linha}).`);
        if (!ja) reg.contratos.set(k, { instFinanc: inst.padStart(3, '0'), nrDoc, parcela, linha });
        porFicha.set(f.id, reg);
    });
    if (outraComp && outraComp === arq.linhas.length) {
        avisos.push(`O arquivo não é da competência ${br(competencia)}: confira a competência da tela ou baixe o arquivo certo. Nada a gravar.`);
        return { competencia, acoes, pendencias, avisos, lidas: arq.linhas.length };
    }
    if (cpfIlegivel) avisos.push('Há linha com CPF ilegível: nenhum contrato foi dado como fora do arquivo. Corrija o arquivo (baixe de novo no Portal) para tratar quitações e portabilidades.');
    else if (cpfsRecusados.size) avisos.push('Os contratos de quem teve linha recusada não foram dados como fora do arquivo: confira essas linhas.');

    // Ações por ficha: o que o arquivo traz e o que a ficha tem vigente na competência.
    const base = (f: FichaFuncionario) => ({ fichaId: f.id, nome: f.dados.nome || f.cpf, cpf: f.cpf });
    for (const f of fichas) {
        const doArquivo = porFicha.get(f.id)?.contratos ?? new Map();
        for (const [k, a] of doArquivo) {
            const mesmos = (f.consignados ?? []).filter(c => `${c.instFinanc}|${c.nrDoc}` === k);
            const atual = mesmos.find(c => vigente(c, competencia));
            const id = `${f.id}|${k}`;
            if (!mesmos.length) acoes.push({ id, tipo: 'novo', ...base(f), ...a, descricao: `Novo contrato, parcela de ${reais(a.parcela)} a partir de ${br(competencia)}.` });
            else if (!atual) acoes.push({ id, tipo: 'reativado', ...base(f), ...a, descricao: `O contrato estava encerrado ou começava depois; volta com parcela de ${reais(a.parcela)} a partir de ${br(competencia)}.` });
            else if (atual.parcela !== a.parcela) acoes.push({ id, tipo: 'parcela', ...base(f), ...a, parcelaAntes: atual.parcela, descricao: `Parcela de ${reais(atual.parcela)} para ${reais(a.parcela)} a partir de ${br(competencia)} (renegociação ou portabilidade); o valor anterior fica nos meses passados.` });
            else acoes.push({ id, tipo: 'igual', ...base(f), ...a, parcelaAntes: atual.parcela, descricao: 'Igual ao da ficha.' });
        }
        if (!ativaNaCompetencia(f, competencia) || cpfIlegivel || cpfsRecusados.has(f.cpf)) continue;
        for (const c of (f.consignados ?? []).filter(c => vigente(c, competencia) && !doArquivo.has(`${c.instFinanc}|${c.nrDoc}`))) {
            acoes.push({ id: `${f.id}|${c.instFinanc}|${c.nrDoc}`, tipo: 'ausente', ...base(f), instFinanc: c.instFinanc, nrDoc: c.nrDoc, parcelaAntes: c.parcela,
                descricao: c.inicio >= competencia ? `Não está no arquivo: o contrato lançado para começar em ${br(c.inicio)} sai da ficha.` : `Não está no arquivo (quitado, suspenso ou portado): o desconto termina em ${br(mesAnterior(competencia))}.` });
        }
    }
    const ordem: TipoAcao[] = ['novo', 'parcela', 'reativado', 'ausente', 'igual'];
    acoes.sort((a, b) => ordem.indexOf(a.tipo) - ordem.indexOf(b.tipo) || a.nome.localeCompare(b.nome, 'pt-BR') || a.nrDoc.localeCompare(b.nrDoc));
    if (!arq.linhas.length) avisos.push('Arquivo sem linhas: se a empresa não tem empréstimos na competência, os contratos vigentes aparecem como fora do arquivo.');
    return { competencia, acoes, pendencias, avisos, lidas: arq.linhas.length };
}

/**
 * Aplica as ações escolhidas e devolve só as fichas que mudaram. Os meses anteriores à competência ficam como estavam:
 * a parcela nova abre um período a partir dela, e o contrato fora do arquivo termina no mês anterior. Garantia, saldo
 * devedor e consulta da rescisão seguem com o contrato.
 */
export function aplicarImportacao(fichas: FichaFuncionario[], acoes: AcaoImportacao[], competencia: string): FichaFuncionario[] {
    const antes = mesAnterior(competencia);
    const porFicha = new Map<string, AcaoImportacao[]>();
    for (const a of acoes.filter(a => a.tipo !== 'igual')) porFicha.set(a.fichaId, [...(porFicha.get(a.fichaId) ?? []), a]);
    const mudadas: FichaFuncionario[] = [];
    for (const f of fichas) {
        const lista = porFicha.get(f.id);
        if (!lista) continue;
        let cs = [...(f.consignados ?? [])];
        for (const a of lista) {
            const mesmo = (c: ContratoConsignado) => c.instFinanc === a.instFinanc && c.nrDoc === a.nrDoc;
            if (a.tipo === 'novo') cs.push({ instFinanc: a.instFinanc, nrDoc: a.nrDoc, parcela: a.parcela!, inicio: competencia });
            else if (a.tipo === 'parcela' || a.tipo === 'reativado') {
                const modelo = [...cs].reverse().find(mesmo);
                const extras = modelo ? { saldoRescisao: modelo.saldoRescisao, garantiaRescisao: modelo.garantiaRescisao, consultaRescisao: modelo.consultaRescisao, observacao: modelo.observacao, ...(modelo.fim && modelo.fim >= competencia ? { fim: modelo.fim } : {}) } : {};
                // Os períodos desde a competência saem; os anteriores terminam no mês anterior.
                cs = cs.flatMap(c => (!mesmo(c) || (c.fim && c.fim < competencia) ? [c] : c.inicio >= competencia ? [] : [{ ...c, fim: antes }]));
                cs.push(JSON.parse(JSON.stringify({ ...extras, instFinanc: a.instFinanc, nrDoc: a.nrDoc, parcela: a.parcela!, inicio: competencia })));
            } else if (a.tipo === 'ausente') cs = cs.flatMap(c => (!mesmo(c) || !vigente(c, competencia) ? [c] : c.inicio >= competencia ? [] : [{ ...c, fim: antes }]));
        }
        mudadas.push({ ...f, consignados: cs.sort((x, y) => x.inicio.localeCompare(y.inicio) || x.nrDoc.localeCompare(y.nrDoc)) });
    }
    return mudadas;
}
