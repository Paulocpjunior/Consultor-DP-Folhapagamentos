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
import { ROTULO, idFuncionario, fichaVazia, diffFicha, type CampoFicha, type FichaFuncionario, type ResultadoMescla } from './funcionarios';

export type CampoCarga = 'cpf' | 'matriculaEsocial' | CampoFicha;

export const CAMPOS_CARGA: CampoCarga[] = [
    'cpf', 'matriculaEsocial', 'codigoIob', 'nome', 'nascimento', 'admissao', 'dataDesligamento', 'sexo',
    'mae', 'pai', 'pis', 'ctps', 'serieCtps', 'ufCtps', 'rg', 'orgaoRg', 'emissaoRg', 'tituloEleitor',
    'cargo', 'cbo', 'funcao', 'cargoIob', 'departamentoIob', 'salario', 'sindicato', 'sindicatoIob',
    'banco', 'agencia', 'conta', 'pix', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'uf', 'telefone', 'email',
];

export const rotuloCarga = (c: CampoCarga) => (c === 'cpf' ? 'CPF' : c === 'matriculaEsocial' ? 'Matrícula do eSocial' : ROTULO[c]);

/** Nome da coluna sem acento, sem separador, minúsculo: "DT_ADMISSAO" → "dtadmissao". */
export const chaveColuna = (c: string) => c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Padrões testados contra o nome normalizado. A ordem importa: o primeiro campo
// que reconhece a coluna fica com ela. É proposta — a equipe confere na tela.
const SINONIMOS: [CampoCarga, RegExp][] = [
    ['cpf', /^(nr|num|numero)?cpf(func|trab|empregado)?$/],
    ['pis', /^(nr|num)?(pis|pasep|pispasep|nit)(func)?$/],
    ['matriculaEsocial', /^(matricula|matric|matesocial|matriculaesocial|nrmatricula)$/],
    ['codigoIob', /^(cod|codigo|codfunc|codfuncionario|codempregado|codigofuncionario|cdfunc)$/],
    ['nome', /^(nome|nomefunc|nomefuncionario|nmfunc|nomeempregado|nmtrab)$/],
    ['nascimento', /^(dt|data)?(nasc|nascimento|nascto)$/],
    ['admissao', /^(dt|data)?(adm|admissao|admis)$/],
    ['dataDesligamento', /^(dt|data)?(demissao|desligamento|deslig|rescisao|dem)$/],
    ['sexo', /^sexo$/],
    ['mae', /^(nome)?(mae|nomemae)$/],
    ['pai', /^(nome)?(pai|nomepai)$/],
    ['ctps', /^(nr|num)?ctps$/],
    ['serieCtps', /^(serie|seriectps|ctpsserie)$/],
    ['ufCtps', /^(ufctps|ctpsuf)$/],
    ['rg', /^(nr|num)?(rg|identidade|ci)$/],
    ['orgaoRg', /^(orgao|orgaoemissor|orgaorg|emissorrg)$/],
    ['emissaoRg', /^(dt|data)?(emissaorg|rgemissao|emissao)$/],
    ['tituloEleitor', /^(titulo|tituloeleitor|nrtitulo)$/],
    ['cbo', /^(cbo|codcbo)$/],
    ['cargo', /^(cargo|nomecargo|desccargo|dscargo)$/],
    ['cargoIob', /^(codcargo|cdcargo)$/],
    ['funcao', /^(funcao|nomefuncao|descfuncao)$/],
    ['departamentoIob', /^(depto|departamento|coddepto|coddepartamento)$/],
    ['salario', /^(salario|salbase|salariobase|vlrsalario|valorsalario|sal)$/],
    ['sindicatoIob', /^(sindicato|codsindicato|cdsindicato)$/],
    ['sindicato', /^(cnpjsindicato|cnpjsind)$/],
    ['banco', /^(banco|codbanco|cdbanco|bco)$/],
    ['agencia', /^(agencia|ag|codagencia)$/],
    ['conta', /^(conta|contacorrente|nrconta|cc)$/],
    ['pix', /^(pix|chavepix)$/],
    ['cep', /^cep$/],
    ['logradouro', /^(endereco|logradouro|rua|ender)$/],
    ['numero', /^(numero|nr|num|nrender)$/],
    ['complemento', /^(complemento|compl)$/],
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

const DATAS: CampoCarga[] = ['nascimento', 'admissao', 'dataDesligamento', 'emissaoRg'];
const DIGITOS: CampoCarga[] = ['cpf', 'pis', 'cep', 'cbo'];

/** Valor do IOB já no formato da ficha; vazio ou ilegível → ''. */
export function normalizarValor(campo: CampoCarga, v: Valor): string {
    if (v === null) return '';
    const t = v.trim();
    if (!t) return '';
    if (DATAS.includes(campo)) return dataDoIob(t) ?? '';
    if (campo === 'cpf') { const d = t.replace(/\D/g, ''); return d && /^\d+$/.test(d) && d.length <= 11 && !/^0+$/.test(d) ? d.padStart(11, '0') : ''; }
    if (DIGITOS.includes(campo)) { const d = t.replace(/\D/g, ''); return /^0*$/.test(d) ? '' : d; }
    if (campo === 'salario') { const c = centavosDeTexto(t); return c ? (c / 100).toFixed(2) : ''; }
    if (campo === 'uf' || campo === 'ufCtps') return t.toUpperCase().slice(0, 2);
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
                if (!atual) { depois.dados[campo] = valor; depois.origens[campo] = origem; }
                else if (atual !== valor) divergencias.push({ campo, consultor: atual, iob: valor });
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
