// services/cadastros/cargaBackupIob.ts
//
// Fase 2 (base de dados): completar o cadastro de funcionários com o que está
// no backup do IOB restaurado no navegador (tabelas DBF do .zip ou tabelas do
// PostgreSQL do .backup). Ainda não se conhece o dicionário do IOB Office —
// por isso o de/para é ASSISTIDO: o app propõe a coluna de cada campo pelo
// nome, a equipe confere, e só então a carga é comparada com as fichas.
//
// Regras:
// - Liga pelo CPF; sem CPF, pela matrícula do eSocial (campo "Matrícula" da
//   ficha do IOB). O código sequencial do IOB não liga: é ele que se quer trazer.
// - Campo vazio na ficha é PREENCHIDO com o valor do IOB (origem "IOB: ...").
// - Campo com valor diferente vira DIVERGÊNCIA listada; não é trocado.
// - Funcionário do IOB sem ficha vira ficha NOVA só com CPF válido e
//   matrícula do eSocial; senão fica listado.

import type { Valor } from '../iobSage/backupPostgres';
import { centavosDeTexto, cpfValido, dataValida } from './documentos';
import { ROTULO, ehManual, idFuncionario, fichaVazia, diffFicha, type CampoFicha, type FichaFuncionario, type ResultadoMescla } from './funcionarios';

export type CampoCarga = 'cpf' | 'matriculaEsocial' | CampoFicha;

export const CAMPOS_CARGA: CampoCarga[] = [
    'cpf', 'matriculaEsocial', 'codigoIob', 'nome', 'nascimento', 'admissao', 'dataDesligamento', 'sexo',
    'mae', 'pai', 'pis', 'ctps', 'serieCtps', 'ufCtps', 'rg', 'orgaoRg', 'emissaoRg', 'tituloEleitor',
    'cargo', 'cbo', 'funcao', 'cargoIob', 'departamentoIob', 'salario', 'unidadeSalario', 'horasSemanais', 'fimContrato', 'opcaoFgts', 'categoria', 'sindicato', 'sindicatoIob',
    'banco', 'agencia', 'conta', 'pix', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'uf', 'telefone', 'email',
];

export const rotuloCarga = (c: CampoCarga) => (c === 'cpf' ? 'CPF' : c === 'matriculaEsocial' ? 'Matrícula do eSocial' : ROTULO[c]);

/** Nome da coluna sem acento, sem separador, minúsculo: "DT_ADMISSAO" → "dtadmissao". */
export const chaveColuna = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Padrões testados contra o nome normalizado. A ordem importa: o primeiro campo
// que reconhece a coluna fica com ela. É proposta — a equipe confere na tela.
// Inclui as siglas do FolhaWin (tabela `func` do schema fNNNN, conferida no
// inventário do backup de 05/10/2026): codfun, dtres, numcp, sercp, ufcp,
// orgrg, dtemrg, numtit, codsind, bcosal, agdsal e comple.
const SINONIMOS: [CampoCarga, RegExp][] = [
    ['cpf', /^(nr|num|numero)?cpf(func|trab|empregado)?$/],
    ['pis', /^(nr|num)?(pis|pasep|pispasep|nit)(func)?$/],
    ['matriculaEsocial', /^(matricula|matric|matesocial|matriculaesocial|nrmatricula)$/],
    ['codigoIob', /^(cod|codigo|codfun|codfunc|codfuncionario|codempregado|codigofuncionario|cdfunc)$/],
    ['nome', /^(nome|nomefunc|nomefuncionario|nmfunc|nomeempregado|nmtrab)$/],
    ['nascimento', /^(dt|data)?(nasc|nascimento|nascto)$/],
    ['admissao', /^(dt|data)?(adm|admissao|admis)$/],
    ['dataDesligamento', /^(dt|data)?(demissao|desligamento|deslig|rescisao|dem|res)$/],
    ['sexo', /^sexo$/],
    ['mae', /^(nome)?(mae|nomemae)$/],
    ['pai', /^(nome)?(pai|nomepai)$/],
    ['ctps', /^((nr|num)?ctps|numcp)$/],
    ['serieCtps', /^(serie|seriectps|ctpsserie|sercp)$/],
    ['ufCtps', /^(ufctps|ctpsuf|ufcp)$/],
    ['rg', /^(nr|num)?(rg|identidade|ci)$/],
    ['orgaoRg', /^(orgao|orgaoemissor|orgaorg|emissorrg|orgrg)$/],
    ['emissaoRg', /^(dt|data)?(emissaorg|rgemissao|emissao|emrg)$/],
    ['tituloEleitor', /^(titulo|tituloeleitor|nrtitulo|numtit)$/],
    // No FolhaWin a `func` tem `cbo` (CBO antiga, de 5 dígitos, ex.: 01105) e `cbo2` (CBO 2002): vale a cbo2.
    ['cbo', /^(cbo2|cbo2002)$/],
    ['cbo', /^(cbo|codcbo)$/],
    ['cargo', /^(cargo|nomecargo|desccargo|dscargo)$/],
    ['cargoIob', /^(codcargo|cdcargo)$/],
    ['funcao', /^(funcao|nomefuncao|descfuncao)$/],
    ['departamentoIob', /^(depto|departamento|coddepto|coddepartamento)$/],
    ['salario', /^(salario|salbase|salariobase|vlrsalario|valorsalario|sal)$/],
    // FolhaWin: tipsal (M/H/D/S/Q/T), hrssem, fimcontr e dtopfg da `func`. A `catego`
    // não entra: o código do IOB não é o do eSocial; a categoria vem do S-1200 (dmdev).
    ['unidadeSalario', /^(tipsal|tiposalario|unidadesalario|undsalfixo)$/],
    ['horasSemanais', /^(hrssem|horassemanais|hrsemanal|qtdhrssem)$/],
    ['fimContrato', /^(fimcontr|dtfimcontrato|fimcontrato|dtterm)$/],
    ['opcaoFgts', /^(dtopfg|dtopfgts|dtopcaofgts|opcaofgts)$/],
    ['categoria', /^(codcateg|categoriaesocial|categesocial)$/],
    ['sindicatoIob', /^(sindicato|codsind|codsindicato|cdsindicato)$/],
    ['sindicato', /^(cnpjsindicato|cnpjsind)$/],
    ['banco', /^(banco|codbanco|cdbanco|bco|bcosal)$/],
    ['agencia', /^(agencia|ag|codagencia|agdsal)$/],
    ['conta', /^(conta|contacorrente|nrconta|cc)$/],
    ['pix', /^(pix|chavepix|vlchavepix)$/],
    ['cep', /^cep$/],
    ['logradouro', /^(endereco|logradouro|rua|ender)$/],
    ['numero', /^(numero|nr|num|nrender)$/],
    ['complemento', /^(complemento|compl|comple)$/],
    ['bairro', /^bairro$/],
    ['uf', /^(uf|estado)$/],
    ['telefone', /^(telefone|fone|tel|celular)$/],
    ['email', /^(email|correio)$/],
];

export type Mapeamento = Partial<Record<CampoCarga, string>>;

export function proporMapeamento(colunas: string[]): Mapeamento {
    const m: Mapeamento = {};
    const usadas = new Set<string>();
    for (const [campo, re] of SINONIMOS) {
        if (m[campo]) continue;
        const col = colunas.find(c => !usadas.has(c) && re.test(chaveColuna(c)));
        if (col) { m[campo] = col; usadas.add(col); }
    }
    return m;
}

/** "31/12/2025", "2025-12-31", "20251231", "2025-12-31 00:00:00" → "2025-12-31"; inválida → null. */
export function dataDoIob(v: string): string | null {
    const t = v.trim();
    let d: string | null = null;
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})/))) d = `${m[1]}-${m[2]}-${m[3]}`;
    else if ((m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) d = `${m[3]}-${m[2]}-${m[1]}`;
    else if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) d = `${m[1]}-${m[2]}-${m[3]}`;
    return d && dataValida(d) && d > '1900-01-01' ? d : null;
}

const DATAS: CampoCarga[] = ['nascimento', 'admissao', 'dataDesligamento', 'emissaoRg', 'fimContrato', 'opcaoFgts'];

/** Tabela 01 do eSocial (categorias de trabalhador). */
export const CATEGORIAS_ESOCIAL = new Set(['101', '102', '103', '104', '105', '106', '107', '108', '111', '201', '202', '301', '302', '303', '304', '305', '306', '307', '308', '309', '310', '311', '312', '313', '314', '401', '410', '501', '701', '711', '712', '721', '722', '723', '731', '734', '738', '741', '751', '761', '771', '781', '901', '902', '903', '904', '906']);

/** Tipo de salário do IOB → unidade salarial do eSocial; código numérico do IOB não é conhecido e fica de fora. */
const UNIDADE: [RegExp, string][] = [[/^(h|hora|horista)/i, '1'], [/^(d|dia|diarista)/i, '2'], [/^(s|semana|semanal|semanalista)/i, '3'], [/^(q|quinzena|quinzenal|quinzenalista)/i, '4'], [/^(m|mes|mês|mensal|mensalista)/i, '5'], [/^(t|tarefa|tarefeiro)/i, '6']];
const DIGITOS: CampoCarga[] = ['cpf', 'pis', 'cep', 'cbo'];

/** Valor do IOB já no formato da ficha; vazio ou ilegível → ''. */
export function normalizarValor(campo: CampoCarga, v: Valor): string {
    if (v === null) return '';
    const t = v.trim();
    if (!t) return '';
    if (DATAS.includes(campo)) return dataDoIob(t) ?? '';
    if (campo === 'cpf') { const d = t.replace(/\D/g, ''); return d && /^\d+$/.test(d) && d.length <= 11 && !/^0+$/.test(d) ? d.padStart(11, '0') : ''; }
    if (campo === 'cep') { const d = t.replace(/\D/g, ''); return /^0*$/.test(d) ? '' : d.length === 7 ? d.padStart(8, '0') : d; }
    // CBO só com os 6 dígitos da CBO 2002; o código antigo de 5 dígitos não vai para a ficha.
    if (campo === 'cbo') { const d = t.replace(/\D/g, ''); return /^\d{6}$/.test(d) && !/^0+$/.test(d) ? d : ''; }
    if (DIGITOS.includes(campo)) { const d = t.replace(/\D/g, ''); return /^0*$/.test(d) ? '' : d; }
    if (campo === 'salario') { const c = centavosDeTexto(t); return c ? (c / 100).toFixed(2) : ''; }
    if (campo === 'uf' || campo === 'ufCtps') return t.toUpperCase().slice(0, 2);
    if (campo === 'unidadeSalario') return /^\d/.test(t) ? '' : UNIDADE.find(([re]) => re.test(t))?.[1] ?? '';
    if (campo === 'horasSemanais') {
        const h = Number(t.replace(',', '.'));
        return Number.isFinite(h) && h > 0 && h <= 44 ? String(Math.round(h * 100) / 100) : '';
    }
    if (campo === 'categoria') { const d = t.replace(/\D/g, ''); return CATEGORIAS_ESOCIAL.has(d) ? d : ''; }
    if (campo === 'sexo') return /^m/i.test(t) ? 'M' : /^f/i.test(t) ? 'F' : '';
    if (campo === 'sindicato') return t.toUpperCase().replace(/[.\-/\s]/g, '');
    return t.replace(/\s+/g, ' ');
}

export interface LinhaIob { linha: number; valores: Partial<Record<CampoCarga, string>> }

export function linhaParaCampos(colunas: string[], valores: Valor[], m: Mapeamento, linha: number): LinhaIob {
    const out: Partial<Record<CampoCarga, string>> = {};
    for (const [campo, col] of Object.entries(m) as [CampoCarga, string][]) {
        const i = colunas.indexOf(col);
        if (i < 0) continue;
        const v = normalizarValor(campo, valores[i] ?? null);
        if (v) out[campo] = v;
    }
    // CBO vazio ou antigo na coluna escolhida: tenta a outra coluna de CBO da mesma linha.
    if (m.cbo && !out.cbo) {
        for (const [j, c] of colunas.entries()) {
            const v = c !== m.cbo && /^(cbo2?|cbo2002|codcbo)$/.test(chaveColuna(c)) ? normalizarValor('cbo', valores[j] ?? null) : '';
            if (v) { out.cbo = v; break; }
        }
    }
    return { linha, valores: out };
}

export interface Divergencia { campo: CampoFicha; consultor: string; iob: string }
export interface Comparacao {
    /** Fichas existentes com campos a preencher (ResultadoMescla pronto para gravar). */
    completar: (ResultadoMescla & { divergencias: Divergencia[] })[];
    /** Fichas existentes sem nada a preencher, mas com divergências para conferir. */
    soDivergencias: { ficha: FichaFuncionario; divergencias: Divergencia[] }[];
    novas: ResultadoMescla[];
    semFicha: { linha: number; nome: string; cpf: string; motivo: string }[];
    ignoradas: number;
    avisos: string[];
}

/** Compara as linhas do IOB com as fichas da empresa e monta a carga. */
export function compararComFichas(linhas: LinhaIob[], fichas: FichaFuncionario[], empresa: { id: string; cnpj: string }, origem: string, criarNovas: boolean): Comparacao {
    const porCpf = new Map<string, FichaFuncionario[]>();
    for (const f of fichas) porCpf.set(f.cpf, [...(porCpf.get(f.cpf) ?? []), f]);
    const porMatricula = new Map(fichas.map(f => [f.matriculaEsocial, f]));
    const r: Comparacao = { completar: [], soDivergencias: [], novas: [], semFicha: [], ignoradas: 0, avisos: [] };
    const tocadas = new Set<string>();
    for (const l of linhas) {
        const v = l.valores;
        if (!v.cpf && !v.matriculaEsocial) { r.ignoradas++; continue; }
        let ficha: FichaFuncionario | undefined;
        const doCpf = v.cpf ? porCpf.get(v.cpf) ?? [] : [];
        if (doCpf.length === 1) ficha = doCpf[0];
        else if (doCpf.length > 1) ficha = doCpf.find(f => f.matriculaEsocial === v.matriculaEsocial) ?? (v.matriculaEsocial ? undefined : doCpf.find(f => f.situacao === 'ativo'));
        if (!ficha && v.matriculaEsocial) ficha = porMatricula.get(v.matriculaEsocial);
        if (ficha && v.cpf && ficha.cpf !== v.cpf) {
            r.semFicha.push({ linha: l.linha, nome: v.nome ?? '', cpf: v.cpf, motivo: `Matrícula ${v.matriculaEsocial} pertence a outro CPF no Consultor (${ficha.cpf}). Conferir.` });
            continue;
        }
        if (ficha) {
            if (tocadas.has(ficha.id)) { r.avisos.push(`Linha ${l.linha}: segundo registro para ${ficha.dados.nome || ficha.cpf}; só o primeiro foi usado.`); continue; }
            tocadas.add(ficha.id);
            const depois: FichaFuncionario = { ...ficha, dados: { ...ficha.dados }, origens: { ...ficha.origens } };
            const divergencias: Divergencia[] = [];
            for (const [campo, valor] of Object.entries(v) as [CampoCarga, string][]) {
                if (campo === 'cpf' || campo === 'matriculaEsocial') continue;
                const atual = ficha.dados[campo];
                // CBO inválido (ex.: o de 5 dígitos de uma carga anterior) que ninguém digitou é trocado.
                const cboInvalido = campo === 'cbo' && !!atual && !/^\d{6}$/.test(atual) && !ehManual(ficha.origens.cbo);
                if (!atual || cboInvalido) { depois.dados[campo] = valor; depois.origens[campo] = origem; }
                else if (atual !== valor) divergencias.push({ campo, consultor: atual, iob: valor });
            }
            // Data de desligamento que chegou agora numa ficha ativa (e a situação não foi digitada): desligado.
            if (depois.dados.dataDesligamento && !ficha.dados.dataDesligamento && depois.situacao === 'ativo' && !ehManual(ficha.origens.situacao)) {
                depois.situacao = 'desligado'; depois.origens.situacao = origem;
            }
            const alteracoes = diffFicha(ficha, depois);
            if (alteracoes.length) r.completar.push({ ficha: depois, novo: false, alteracoes, preservados: [], divergencias });
            else if (divergencias.length) r.soDivergencias.push({ ficha, divergencias });
            continue;
        }
        const motivo = !v.cpf || !cpfValido(v.cpf) ? 'CPF ausente ou inválido no IOB.'
            : !v.matriculaEsocial ? 'Sem matrícula do eSocial no IOB: importe o S-2200 ou cadastre a ficha.'
            : !criarNovas ? 'Sem ficha no Consultor (criação de fichas novas desligada).' : '';
        if (motivo) { r.semFicha.push({ linha: l.linha, nome: v.nome ?? '', cpf: v.cpf ?? '', motivo }); continue; }
        const nova: FichaFuncionario = { ...fichaVazia(empresa), id: idFuncionario(empresa.id, v.cpf!, v.matriculaEsocial!), cpf: v.cpf!, matriculaEsocial: v.matriculaEsocial!, situacao: v.dataDesligamento ? 'desligado' : 'ativo' };
        for (const [campo, valor] of Object.entries(v) as [CampoCarga, string][]) {
            if (campo === 'cpf' || campo === 'matriculaEsocial') continue;
            nova.dados[campo] = valor; nova.origens[campo] = origem;
        }
        nova.origens.situacao = origem;
        if (r.novas.some(n => n.ficha.id === nova.id) || tocadas.has(nova.id)) { r.avisos.push(`Linha ${l.linha}: funcionário repetido no IOB; só o primeiro foi usado.`); continue; }
        r.novas.push({ ficha: nova, novo: true, alteracoes: diffFicha(null, nova), preservados: [] });
    }
    return r;
}

// ─── Tabelas complementares do FolhaWin ─────────────────────────────────────
// No FolhaWin o salário não está na `func`: fica em `salarios` (histórico, com
// o registro atual marcado em `ultimo`). A chave PIX fica em `funcdoc`
// (`vlchavepix`). As duas ligam pelo `codfun`, o código do funcionário no IOB.
// A matrícula do eSocial não fica na `func` (a coluna `matricula` vem vazia:
// o IOB gera a matrícula, `funcdoc.geramatric`); a que foi enviada ao eSocial
// está em `esocialdadosficha_s1200_remunperapur` (codfun, anomes, matricula).
// Conferido no backup da empresa 1200 (06/10/2026): 432 de 432 sem matrícula na func.

export interface TabelaLida { colunas: string[]; linhas: Valor[][] }
export type Complemento = Partial<Record<'salario' | 'pix' | 'matriculaEsocial' | 'cargo' | 'cargoIob' | 'funcao' | 'cbo' | 'categoria' | 'sindicato' | 'horasSemanais', string>>;
const CAMPOS_COMPLEMENTO: (keyof Complemento)[] = ['salario', 'pix', 'matriculaEsocial', 'cargo', 'cargoIob', 'funcao', 'cbo', 'categoria', 'sindicato', 'horasSemanais'];

/**
 * Mais tabelas do FolhaWin, com valores no padrão do eSocial (o que o IOB transmitiu):
 * - esocialdadosficha_s1200_dmdev (codfun, anomes, codcateg, codcbo): categoria e CBO do S-1200;
 * - esocialdadosficha_s1300_contribsind (codfun, anomes, cnpjsindic): CNPJ do sindicato;
 * - hist_horarios (codfun, codhorario, data) + cad_horarios (codhorario, hrsemanal): horas semanais.
 */
export interface ComplementosEsocial { dmdev?: TabelaLida | null; contribSind?: TabelaLida | null; histHorarios?: TabelaLida | null; cadHorarios?: TabelaLida | null }

/** Tabelas que a carga do FolhaWin lê no mesmo schema da `func`, com o que cada uma traz. */
export const TABELAS_COMPLEMENTARES: [string, string][] = [
    ['salarios', 'o salário atual (salarios)'], ['funcdoc', 'a chave PIX (funcdoc)'],
    ['esocialdadosficha_s1200_remunperapur', 'a matrícula do eSocial (S-1200)'],
    ['rsalfunc', 'o cargo, o CBO e o salário do histórico (rsalfunc)'], ['cargos', 'o nome do cargo (cargos)'],
    ['esocialdadosficha_s1200_dmdev', 'a categoria e o CBO do S-1200'], ['esocialdadosficha_s1300_contribsind', 'o CNPJ do sindicato (S-1300)'],
    ['hist_horarios', 'o horário (hist_horarios)'], ['cad_horarios', 'as horas semanais (cad_horarios)'],
];

/** Valor do registro mais recente de cada codfun (pela coluna de data ou anomes), só os que passam no filtro. */
function maisRecente(t: TabelaLida | null | undefined, chaveData: string, colunas: string[], valido: (v: string[]) => boolean): Map<string, string[]> {
    const r = new Map<string, { data: string; v: string[] }>();
    if (!t) return new Map();
    const iCod = col(t, 'codfun'), iData = col(t, chaveData), is = colunas.map(c => col(t, c));
    if (iCod < 0 || is.some(i => i < 0)) return new Map();
    for (const l of t.linhas) {
        const k = chaveCodfun(l[iCod]);
        const v = is.map(i => (l[i] ?? '').trim());
        if (!k || !valido(v)) continue;
        const d = iData >= 0 ? (dataDoIob(l[iData] ?? '') ?? (l[iData] ?? '').replace(/\D/g, '')) : '';
        const a = r.get(k);
        if (!a || d >= a.data) r.set(k, { data: d, v });
    }
    return new Map([...r].map(([k, x]) => [k, x.v]));
}

/** Código do funcionário sem zeros à esquerda, para ligar as tabelas. */
export const chaveCodfun = (v: Valor) => (v ?? '').trim().replace(/^0+(?=.)/, '').toUpperCase();
const sim = (v: Valor) => /^(s|t|1|true|sim|y|\.t\.)$/i.test((v ?? '').trim());
const col = (t: TabelaLida, nome: string) => t.colunas.findIndex(c => chaveColuna(c) === nome);

/**
 * Salário atual e PIX por codfun. Salário: o registro marcado como `ultimo`;
 * sem marca, o de maior `anomes`. PIX: a primeira chave preenchida.
 */
export function complementosFolhaWin(salarios: TabelaLida | null, funcdoc: TabelaLida | null, s1200: TabelaLida | null = null, rsalfunc: TabelaLida | null = null, cargos: TabelaLida | null = null, esocial: ComplementosEsocial = {}): Map<string, Complemento> {
    const r = new Map<string, Complemento>();
    const pegar = (k: string) => { let c = r.get(k); if (!c) { c = {}; r.set(k, c); } return c; };
    if (salarios) {
        const [iCod, iVal, iUlt, iAno] = ['codfun', 'valor', 'ultimo', 'anomes'].map(n => col(salarios, n));
        if (iCod >= 0 && iVal >= 0) {
            const melhor = new Map<string, { ultimo: boolean; anomes: string; valor: string }>();
            for (const l of salarios.linhas) {
                const k = chaveCodfun(l[iCod]);
                const valor = normalizarValor('salario', l[iVal] ?? null);
                if (!k || !valor) continue;
                const cand = { ultimo: iUlt >= 0 && sim(l[iUlt]), anomes: iAno >= 0 ? (l[iAno] ?? '').trim() : '', valor };
                const atual = melhor.get(k);
                if (!atual || (cand.ultimo && !atual.ultimo) || (cand.ultimo === atual.ultimo && cand.anomes > atual.anomes)) melhor.set(k, cand);
            }
            for (const [k, v] of melhor) pegar(k).salario = v.valor;
        }
    }
    if (funcdoc) {
        const [iCod, iPix] = ['codfun', 'vlchavepix'].map(n => col(funcdoc, n));
        if (iCod >= 0 && iPix >= 0) {
            for (const l of funcdoc.linhas) {
                const k = chaveCodfun(l[iCod]);
                const pix = normalizarValor('pix', l[iPix] ?? null);
                if (k && pix && !r.get(k)?.pix) pegar(k).pix = pix;
            }
        }
    }
    if (s1200) {
        // Matrícula do S-1200 mais recente de cada funcionário.
        const [iCod, iMat, iAno] = ['codfun', 'matricula', 'anomes'].map(n => col(s1200, n));
        if (iCod >= 0 && iMat >= 0) {
            const melhor = new Map<string, { anomes: string; matricula: string }>();
            for (const l of s1200.linhas) {
                const k = chaveCodfun(l[iCod]);
                const matricula = (l[iMat] ?? '').trim();
                if (!k || !matricula) continue;
                const anomes = iAno >= 0 ? (l[iAno] ?? '').replace(/\D/g, '') : '';
                const atual = melhor.get(k);
                if (!atual || anomes > atual.anomes) melhor.set(k, { anomes, matricula });
            }
            for (const [k, v] of melhor) pegar(k).matriculaEsocial = v.matricula;
        }
    }
    // Cargo: o FolhaWin não guarda na `func`. Vem do registro mais recente do
    // histórico `rsalfunc` (codcargo, funcao, cbo por data) e o nome, da tabela
    // `cargos` (codcargo → cargo/descricao e cbo); sem histórico, o codcargo da `funcdoc`.
    const tabelaCargos = new Map<string, { nome: string; cbo: string }>();
    if (cargos) {
        const [iCod, iCargo, iDesc, iCbo] = ['codcargo', 'cargo', 'descricao', 'cbo'].map(n => col(cargos, n));
        if (iCod >= 0) for (const l of cargos.linhas) {
            const k = chaveCodfun(l[iCod]);
            const nome = ((iCargo >= 0 ? l[iCargo] : '') || (iDesc >= 0 ? l[iDesc] : '') || '').trim();
            if (k) tabelaCargos.set(k, { nome, cbo: iCbo >= 0 ? normalizarValor('cbo', l[iCbo] ?? null) : '' });
        }
    }
    const codCargoPorFunc = new Map<string, { codcargo: string; funcao: string; cbo: string }>();
    if (rsalfunc) {
        const [iCod, iData, iCargo, iFk, iFuncao, iCbo, iSal] = ['codfun', 'data', 'codcargo', 'fkcodcarg', 'funcao', 'cbo', 'salario'].map(n => col(rsalfunc, n));
        if (iCod >= 0) {
            const melhor = new Map<string, { data: string; codcargo: string; funcao: string; cbo: string }>();
            // Salário: reserva para quem não tem registro em `salarios` — o do histórico mais recente.
            const salario = new Map<string, { data: string; valor: string }>();
            for (const l of rsalfunc.linhas) {
                const k = chaveCodfun(l[iCod]);
                if (!k) continue;
                const valor = iSal >= 0 ? normalizarValor('salario', l[iSal] ?? null) : '';
                const dataSal = iData >= 0 ? dataDoIob(l[iData] ?? '') ?? '' : '';
                if (valor && (!salario.has(k) || dataSal >= salario.get(k)!.data)) salario.set(k, { data: dataSal, valor });
                const cand = {
                    data: iData >= 0 ? dataDoIob(l[iData] ?? '') ?? '' : '',
                    codcargo: ((iCargo >= 0 ? l[iCargo] : '') || (iFk >= 0 ? l[iFk] : '') || '').trim(),
                    funcao: iFuncao >= 0 ? (l[iFuncao] ?? '').trim() : '',
                    cbo: iCbo >= 0 ? normalizarValor('cbo', l[iCbo] ?? null) : '',
                };
                if (!cand.codcargo && !cand.funcao && !cand.cbo) continue;
                const atual = melhor.get(k);
                if (!atual || cand.data >= atual.data) melhor.set(k, cand);
            }
            for (const [k, v] of melhor) codCargoPorFunc.set(k, v);
            for (const [k, v] of salario) if (!r.get(k)?.salario) pegar(k).salario = v.valor;
        }
    }
    if (funcdoc) {
        const [iCod, iCargo] = ['codfun', 'codcargo'].map(n => col(funcdoc, n));
        if (iCod >= 0 && iCargo >= 0) for (const l of funcdoc.linhas) {
            const k = chaveCodfun(l[iCod]);
            const codcargo = (l[iCargo] ?? '').trim();
            if (k && codcargo && !codCargoPorFunc.get(k)?.codcargo) codCargoPorFunc.set(k, { ...(codCargoPorFunc.get(k) ?? { funcao: '', cbo: '' }), codcargo });
        }
    }
    for (const [k, v] of codCargoPorFunc) {
        const c = pegar(k);
        const tab = v.codcargo ? tabelaCargos.get(chaveCodfun(v.codcargo)) : undefined;
        if (v.codcargo) c.cargoIob = v.codcargo;
        if (tab?.nome) c.cargo = tab.nome;
        // Função: só quando é texto (no FolhaWin costuma ser código).
        if (v.funcao && /[a-zA-ZÀ-ú]{3}/.test(v.funcao)) c.funcao = v.funcao;
        const cbo = [v.cbo, tab?.cbo].find(x => x && /^\d{6}$/.test(x));
        if (cbo) c.cbo = cbo;
    }
    // Categoria e CBO como foram no último S-1200 (o CBO do histórico, se houver, tem preferência).
    for (const [k, [categ, cbo]] of maisRecente(esocial.dmdev, 'anomes', ['codcateg', 'codcbo'], ([a, b]) => !!normalizarValor('categoria', a) || !!normalizarValor('cbo', b))) {
        const c = pegar(k);
        const cat = normalizarValor('categoria', categ), cb = normalizarValor('cbo', cbo);
        if (cat) c.categoria = cat;
        if (cb && !c.cbo) c.cbo = cb;
    }
    for (const [k, [cnpj]] of maisRecente(esocial.contribSind, 'anomes', ['cnpjsindic'], ([a]) => a.replace(/\D/g, '').length === 14)) pegar(k).sindicato = cnpj.replace(/\D/g, '');
    // Horas semanais pelo horário vigente do funcionário.
    if (esocial.cadHorarios) {
        const [iCod, iHrs] = ['codhorario', 'hrsemanal'].map(n => col(esocial.cadHorarios!, n));
        const horas = new Map<string, string>();
        if (iCod >= 0 && iHrs >= 0) for (const l of esocial.cadHorarios.linhas) {
            const h = normalizarValor('horasSemanais', l[iHrs] ?? null);
            if (h) horas.set(chaveCodfun(l[iCod]), h);
        }
        for (const [k, [cod]] of maisRecente(esocial.histHorarios, 'data', ['codhorario'], ([a]) => !!a)) {
            const h = horas.get(chaveCodfun(cod));
            if (h) pegar(k).horasSemanais = h;
        }
    }
    return r;
}

/**
 * Campos que decorrem dos outros, só onde a linha não os trouxe:
 * - categoria de empregado (1xx): regime trabalhista CLT e previdenciário RGPS;
 * - fim de contrato vencido (ex.: experiência já passada) não vale para quem
 *   está ativo: o contrato é por prazo indeterminado; fim futuro: prazo determinado;
 * - desligado: o fim do contrato é histórico e fica como está (prazo determinado
 *   quando houver fim depois da admissão).
 */
export function derivarContrato(linhas: LinhaIob[], hoje: string): LinhaIob[] {
    return linhas.map(l => {
        const v = { ...l.valores };
        if (v.categoria && /^1\d\d$/.test(v.categoria)) {
            if (!v.regimeTrabalhista) v.regimeTrabalhista = '1';
            if (!v.regimePrevidenciario) v.regimePrevidenciario = '1';
            const fimValido = !!v.fimContrato && (!v.admissao || v.fimContrato > v.admissao);
            if (!v.tipoContrato) {
                if (fimValido && (v.dataDesligamento || v.fimContrato! >= hoje)) v.tipoContrato = '2';
                else { v.tipoContrato = '1'; if (!v.dataDesligamento) delete v.fimContrato; }
            }
        }
        if (v.fimContrato && (v.fimContrato < hoje || v.tipoContrato === '1') && !v.dataDesligamento) delete v.fimContrato;
        return { ...l, valores: v };
    });
}

/** Acrescenta salário, PIX, matrícula do eSocial e cargo (código, nome, função, CBO) das tabelas complementares a quem não os trouxe da tabela principal. */
export function aplicarComplementos(linhas: LinhaIob[], comp: Map<string, Complemento>): LinhaIob[] {
    if (!comp.size) return linhas;
    return linhas.map(l => {
        const c = l.valores.codigoIob ? comp.get(chaveCodfun(l.valores.codigoIob)) : undefined;
        if (!c) return l;
        const extra = Object.fromEntries(CAMPOS_COMPLEMENTO.filter(k => c[k] && !l.valores[k]).map(k => [k, c[k]!]));
        return { ...l, valores: { ...l.valores, ...extra } };
    });
}
