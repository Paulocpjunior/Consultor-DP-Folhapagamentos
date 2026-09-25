// services/implantacao/layoutCadastroIob.ts
// TXT de cadastro de funcionários para a rotina "Utilitários > Importação de
// Funcionários/Base de Cálculo" do IOB SAGE FOLHAMATIC (IOB Gestão Contábil).
//
// O layout é dado (schema-as-data), no mesmo padrão do módulo de ponto: a
// ordem, o tamanho e o tipo de cada campo ficam em um JSON editável no app,
// sem deploy. As convenções de preenchimento seguem a documentação IOB dos
// layouts de importação: campos numéricos alinhados à direita e completados
// com zeros, alfanuméricos alinhados à esquerda sem acentos, valores sem
// separadores (decimais implícitos), arquivo texto ANSI com quebra CRLF.
//
// O LAYOUT_PADRAO reúne os campos do cadastro de funcionários da IOB na
// ordem em que aparecem na tela. As posições ainda não foram homologadas em
// base de teste: confira a tela "Layout" da rotina na IOB e ajuste tamanhos,
// ordem e campos de preenchimento (branco) no editor do modal.

import { CAMPOS, type Campo } from './implantacao';
import type { FuncionarioUnificado } from './unificacao';

export type TipoCampo = 'A' | 'N' | 'D' | 'V';
export type OrigemCampo = Campo | 'codigoIob' | 'cpf' | 'cnpj' | 'cnpjRaiz' | 'constante' | 'branco';
export interface CampoLayout {
    id: string; rotulo: string; origem: OrigemCampo; tamanho: number; tipo: TipoCampo;
    decimais?: number; constante?: string; obrigatorio?: boolean; observacao?: string;
}
export interface LayoutCadastroIob {
    formato: 'consultor-dp-layout-cadastro-iob'; versao: 1; nome: string; homologado: boolean; fonte: string;
    extensao: string; formatoData: 'DDMMAAAA' | 'AAAAMMDD' | 'DD/MM/AAAA'; separador: string;
    codificacao: 'ANSI' | 'UTF-8'; quebraLinha: 'CRLF' | 'LF'; maiusculas: boolean; campos: CampoLayout[];
}
export interface CampoPosicionado extends CampoLayout { inicio: number; fim: number }
export interface RegistroGerado { chave: string; nome: string; linha: string; erros: string[] }
export interface ResultadoTxt { registros: RegistroGerado[]; conteudo: string; erros: string[]; avisos: string[]; tamanhoRegistro: number }

export const TIPOS_CAMPO: Record<TipoCampo, string> = { A: 'Alfanumérico', N: 'Numérico', D: 'Data', V: 'Valor decimal' };
export const ORIGENS_ESPECIAIS: Record<Exclude<OrigemCampo, Campo>, string> = {
    codigoIob: 'Código do funcionário na IOB (= matrícula eSocial)', cpf: 'CPF do trabalhador', cnpj: 'CNPJ da empresa (14 dígitos)',
    cnpjRaiz: 'Raiz do CNPJ (8 dígitos)', constante: 'Valor fixo (constante)', branco: 'Preenchimento em branco/zeros',
};
export const ORIGENS: Record<OrigemCampo, string> = { ...ORIGENS_ESPECIAIS, ...CAMPOS } as Record<OrigemCampo, string>;

const c = (id: string, origem: OrigemCampo, tamanho: number, tipo: TipoCampo, extra: Partial<CampoLayout> = {}): CampoLayout =>
    ({ id, rotulo: extra.rotulo || ORIGENS[origem], origem, tamanho, tipo, ...extra });

export const LAYOUT_PADRAO: LayoutCadastroIob = {
    formato: 'consultor-dp-layout-cadastro-iob', versao: 1,
    nome: 'Cadastro de funcionários — IOB SAGE FOLHAMATIC (posições a homologar)', homologado: false,
    fonte: 'IOB Gestão Contábil > Folha de Pagamento > Utilitários > Importação de Funcionários/Base de Cálculo > Layout',
    extensao: 'txt', formatoData: 'DDMMAAAA', separador: '', codificacao: 'ANSI', quebraLinha: 'CRLF', maiusculas: true,
    campos: [
        c('codigo', 'codigoIob', 6, 'N', { rotulo: 'Código do funcionário (matrícula eSocial)', obrigatorio: true }),
        c('nome', 'nome', 60, 'A', { obrigatorio: true }),
        c('cpf', 'cpf', 11, 'N', { obrigatorio: true }),
        c('pis', 'pis', 11, 'N'),
        c('nascimento', 'nascimento', 8, 'D', { obrigatorio: true }),
        c('sexo', 'sexo', 1, 'A', { observacao: 'M/F conforme eSocial' }),
        c('estadoCivil', 'estadoCivil', 1, 'N', { observacao: 'Código eSocial: 1 solteiro, 2 casado, 3 divorciado, 4 separado, 5 viúvo' }),
        c('escolaridade', 'escolaridade', 2, 'N', { observacao: 'Código eSocial grauInstr (01 a 12)' }),
        c('raca', 'raca', 1, 'N', { observacao: 'Código eSocial racaCor (1 a 6)' }),
        c('nacionalidade', 'nacionalidade', 3, 'N', { observacao: 'Código do país (105 = Brasil)' }),
        c('naturalidade', 'naturalidade', 40, 'A'),
        c('mae', 'mae', 60, 'A'),
        c('pai', 'pai', 60, 'A'),
        c('rg', 'rg', 15, 'A'),
        c('orgaoRg', 'orgaoRg', 10, 'A'),
        c('emissaoRg', 'emissaoRg', 8, 'D'),
        c('ctps', 'ctps', 8, 'N'),
        c('serieCtps', 'serieCtps', 5, 'N'),
        c('ufCtps', 'ufCtps', 2, 'A'),
        c('tituloEleitor', 'tituloEleitor', 12, 'N'),
        c('zonaEleitoral', 'zonaEleitoral', 4, 'N'),
        c('secaoEleitoral', 'secaoEleitoral', 4, 'N'),
        c('documentoMilitar', 'documentoMilitar', 15, 'A'),
        c('logradouro', 'logradouro', 60, 'A'),
        c('numero', 'numero', 10, 'A'),
        c('complemento', 'complemento', 30, 'A'),
        c('bairro', 'bairro', 40, 'A'),
        c('municipio', 'municipio', 7, 'N', { observacao: 'Código IBGE' }),
        c('uf', 'uf', 2, 'A'),
        c('cep', 'cep', 8, 'N'),
        c('telefone', 'telefone', 11, 'N'),
        c('email', 'email', 60, 'A'),
        c('admissao', 'admissao', 8, 'D', { obrigatorio: true }),
        c('cargo', 'cargo', 40, 'A', { obrigatorio: true }),
        c('cbo', 'cbo', 6, 'N'),
        c('funcao', 'funcao', 40, 'A'),
        c('categoria', 'categoria', 3, 'N', { observacao: 'Categoria eSocial (101 = empregado CLT)' }),
        c('salario', 'salario', 12, 'V', { decimais: 2, observacao: 'Salário contratual (não é apontamento)' }),
        c('unidadeSalario', 'unidadeSalario', 1, 'N', { observacao: 'eSocial undSalFixo: 5 = mensal' }),
        c('horasSemanais', 'horasSemanais', 5, 'V', { decimais: 2 }),
        c('tipoContrato', 'tipoContrato', 1, 'N', { observacao: '1 indeterminado, 2 determinado' }),
        c('fimContrato', 'fimContrato', 8, 'D'),
        c('sindicato', 'sindicato', 14, 'N', { observacao: 'CNPJ do sindicato' }),
        c('estabelecimento', 'estabelecimento', 14, 'N', { observacao: 'CNPJ do local de trabalho' }),
        c('opcaoFgts', 'opcaoFgts', 8, 'D'),
        c('departamentoIob', 'departamentoIob', 6, 'A'),
        c('cargoIob', 'cargoIob', 6, 'N'),
        c('sindicatoIob', 'sindicatoIob', 4, 'N'),
        c('matriculaEsocial', 'matriculaIob', 30, 'A', { rotulo: 'Matrícula eSocial (texto original)' }),
    ],
};

export function posicoes(layout: LayoutCadastroIob): CampoPosicionado[] {
    let inicio = 1;
    return layout.campos.map(campo => { const p = { ...campo, inicio, fim: inicio + campo.tamanho - 1 }; inicio += campo.tamanho; return p; });
}

export const semAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function valorOrigem(f: FuncionarioUnificado, campo: CampoLayout, cnpj: string): string {
    switch (campo.origem) {
        case 'codigoIob': return f.dados.matriculaIob || f.matricula;
        case 'cpf': return f.cpf;
        case 'cnpj': return cnpj.replace(/\D/g, '');
        case 'cnpjRaiz': return cnpj.replace(/\D/g, '').slice(0, 8);
        case 'constante': return campo.constante || '';
        case 'branco': return '';
        default: return f.dados[campo.origem] || '';
    }
}

export function formatarData(iso: string, formato: LayoutCadastroIob['formatoData']): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return '';
    if (formato === 'AAAAMMDD') return `${m[1]}${m[2]}${m[3]}`;
    if (formato === 'DD/MM/AAAA') return `${m[3]}/${m[2]}/${m[1]}`;
    return `${m[3]}${m[2]}${m[1]}`;
}

/** Formata um valor no campo; devolve o texto com o tamanho exato e o erro, se houver. */
export function formatarCampo(campo: CampoLayout, bruto: string, layout: LayoutCadastroIob): { texto: string; erro?: string } {
    const valor = (bruto || '').trim();
    const rotulo = campo.rotulo;
    const fixo = !layout.separador;
    if (campo.obrigatorio && !valor) return { texto: fixo ? ''.padEnd(campo.tamanho, campo.tipo === 'A' ? ' ' : '0') : '', erro: `${rotulo}: campo obrigatório vazio.` };
    if (campo.tipo === 'A') {
        let texto = semAcentos(valor).replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
        if (layout.maiusculas) texto = texto.toUpperCase();
        if (texto.length > campo.tamanho) return { texto: fixo ? texto.slice(0, campo.tamanho) : texto.slice(0, campo.tamanho), erro: `${rotulo}: "${texto}" excede ${campo.tamanho} caracteres; foi truncado.` };
        return { texto: fixo ? texto.padEnd(campo.tamanho, ' ') : texto };
    }
    if (campo.tipo === 'D') {
        if (!valor) return { texto: fixo ? ''.padStart(campo.tamanho, '0') : '' };
        const texto = formatarData(valor, layout.formatoData);
        if (!texto) return { texto: ''.padStart(campo.tamanho, '0'), erro: `${rotulo}: data "${valor}" inválida (esperado AAAA-MM-DD).` };
        if (fixo && texto.length > campo.tamanho) return { texto: texto.slice(0, campo.tamanho), erro: `${rotulo}: formato de data com ${texto.length} posições não cabe em ${campo.tamanho}.` };
        return { texto: fixo ? texto.padStart(campo.tamanho, '0') : texto };
    }
    if (campo.tipo === 'V') {
        if (!valor) return { texto: fixo ? ''.padStart(campo.tamanho, '0') : '' };
        const numero = Number(valor.replace(',', '.'));
        if (!Number.isFinite(numero) || numero < 0) return { texto: ''.padStart(campo.tamanho, '0'), erro: `${rotulo}: valor "${valor}" inválido.` };
        const decimais = campo.decimais ?? 2;
        const texto = fixo ? numero.toFixed(decimais).replace('.', '') : numero.toFixed(decimais).replace('.', ',');
        if (texto.length > campo.tamanho) return { texto: texto.slice(-campo.tamanho), erro: `${rotulo}: valor ${valor} não cabe em ${campo.tamanho} posições.` };
        return { texto: fixo ? texto.padStart(campo.tamanho, '0') : texto };
    }
    // Numérico: somente dígitos, alinhado à direita com zeros.
    const digitos = valor.replace(/\D/g, '');
    if (valor && !digitos) return { texto: ''.padStart(campo.tamanho, '0'), erro: `${rotulo}: "${valor}" não é numérico.` };
    if (digitos.length > campo.tamanho) return { texto: digitos.slice(-campo.tamanho), erro: `${rotulo}: "${digitos}" excede ${campo.tamanho} dígitos. A identificação não foi convertida.` };
    return { texto: fixo ? digitos.padStart(campo.tamanho, '0') : digitos };
}

export function gerarRegistros(funcionarios: FuncionarioUnificado[], layout: LayoutCadastroIob, cnpj: string): ResultadoTxt {
    const erros: string[] = [...validarLayout(layout)];
    const avisos: string[] = [];
    if (!layout.homologado) avisos.push('Layout não homologado em base de teste da IOB: confira posições e tamanhos na tela "Layout" da rotina de importação antes de importar.');
    const registros = funcionarios.map<RegistroGerado>(f => {
        const nome = f.dados.nome || f.cpf;
        const problemas: string[] = [];
        const partes = layout.campos.map(campo => {
            const r = formatarCampo(campo, valorOrigem(f, campo, cnpj), layout);
            if (r.erro) problemas.push(r.erro);
            return r.texto;
        });
        if (f.desligado) problemas.push('Vínculo com desligamento nos XMLs; confirmar se deve ser importado.');
        return { chave: f.chave, nome, linha: partes.join(layout.separador), erros: problemas.map(p => `${nome}: ${p}`) };
    });
    const codigos = new Map<string, number>();
    for (const f of funcionarios) { const k = (f.dados.matriculaIob || f.matricula).replace(/\D/g, ''); codigos.set(k, (codigos.get(k) || 0) + 1); }
    for (const [k, n] of codigos) if (n > 1) erros.push(`Código ${k} repetido em ${n} vínculos.`);
    const quebra = layout.quebraLinha === 'LF' ? '\n' : '\r\n';
    const tamanhoRegistro = layout.separador ? 0 : layout.campos.reduce((n, x) => n + x.tamanho, 0);
    return { registros, conteudo: registros.length ? registros.map(r => r.linha).join(quebra) + quebra : '', erros: [...erros, ...registros.flatMap(r => r.erros)], avisos, tamanhoRegistro };
}

/** Bytes do arquivo: ANSI (Windows-1252/Latin-1) sem BOM ou UTF-8. Acentos já foram removidos no formato A. */
export function codificar(conteudo: string, layout: LayoutCadastroIob): Uint8Array {
    if (layout.codificacao === 'UTF-8') return new TextEncoder().encode(conteudo);
    const bytes = new Uint8Array(conteudo.length);
    for (let i = 0; i < conteudo.length; i++) { const code = conteudo.charCodeAt(i); bytes[i] = code < 256 ? code : 0x3f; }
    return bytes;
}

export function validarLayout(layout: LayoutCadastroIob): string[] {
    const erros: string[] = [];
    if (!Array.isArray(layout.campos) || !layout.campos.length) return ['Layout sem campos.'];
    const ids = new Set<string>();
    layout.campos.forEach((campo, i) => {
        const ref = `Campo ${i + 1} (${campo.rotulo || campo.id || 'sem nome'})`;
        if (!campo.id || ids.has(campo.id)) erros.push(`${ref}: identificador ausente ou repetido.`);
        ids.add(campo.id);
        if (!Number.isInteger(campo.tamanho) || campo.tamanho < 1 || campo.tamanho > 500) erros.push(`${ref}: tamanho deve ser inteiro entre 1 e 500.`);
        if (!(campo.tipo in TIPOS_CAMPO)) erros.push(`${ref}: tipo inválido.`);
        if (!(campo.origem in ORIGENS)) erros.push(`${ref}: origem inválida.`);
        if (campo.tipo === 'V' && campo.decimais != null && (!Number.isInteger(campo.decimais) || campo.decimais < 0 || campo.decimais > 6)) erros.push(`${ref}: decimais entre 0 e 6.`);
    });
    return erros;
}

export function serializarLayout(layout: LayoutCadastroIob): string { return JSON.stringify(layout, null, 2); }

export function lerLayout(texto: string): LayoutCadastroIob {
    if (texto.length > 2 * 1024 * 1024) throw new Error('Layout excede 2 MB.');
    const d = JSON.parse(texto);
    if (d?.formato !== 'consultor-dp-layout-cadastro-iob' || d.versao !== 1) throw new Error('Arquivo não é um layout de cadastro do Consultor DP.');
    const str = (x: unknown, max = 500) => typeof x === 'string' && x.length <= max;
    if (!str(d.nome) || !str(d.fonte, 2000) || !str(d.extensao, 10) || !['DDMMAAAA', 'AAAAMMDD', 'DD/MM/AAAA'].includes(d.formatoData)
        || !str(d.separador, 3) || !['ANSI', 'UTF-8'].includes(d.codificacao) || !['CRLF', 'LF'].includes(d.quebraLinha)
        || typeof d.homologado !== 'boolean' || typeof d.maiusculas !== 'boolean' || !Array.isArray(d.campos) || d.campos.length > 500) throw new Error('Layout com cabeçalho inválido.');
    const campos: CampoLayout[] = d.campos.map((x: Record<string, unknown>) => ({
        id: String(x.id || ''), rotulo: String(x.rotulo || ''), origem: x.origem as OrigemCampo, tamanho: Number(x.tamanho), tipo: x.tipo as TipoCampo,
        decimais: x.decimais == null ? undefined : Number(x.decimais), constante: x.constante == null ? undefined : String(x.constante).slice(0, 500),
        obrigatorio: !!x.obrigatorio, observacao: x.observacao == null ? undefined : String(x.observacao).slice(0, 500),
    }));
    const layout: LayoutCadastroIob = { formato: 'consultor-dp-layout-cadastro-iob', versao: 1, nome: d.nome, homologado: d.homologado, fonte: d.fonte, extensao: d.extensao, formatoData: d.formatoData, separador: d.separador, codificacao: d.codificacao, quebraLinha: d.quebraLinha, maiusculas: d.maiusculas, campos };
    const erros = validarLayout(layout);
    if (erros.length) throw new Error(`Layout inválido: ${erros[0]}`);
    return layout;
}

const chaveLocal = (usuario: string) => `consultor-dp:layout-cadastro-iob:${usuario}`;
export function carregarLayoutLocal(usuario: string): LayoutCadastroIob | null {
    try { const t = localStorage.getItem(chaveLocal(usuario)); return t ? lerLayout(t) : null; } catch { return null; }
}
export function salvarLayoutLocal(usuario: string, layout: LayoutCadastroIob | null): void {
    try { if (layout) localStorage.setItem(chaveLocal(usuario), serializarLayout(layout)); else localStorage.removeItem(chaveLocal(usuario)); } catch { /* armazenamento indisponível */ }
}

export function nomeArquivoTxtCadastro(cnpj: string, layout: LayoutCadastroIob): string {
    return `cadastro-funcionarios-iob-${cnpj.replace(/\D/g, '') || 'empresa'}.${layout.extensao.replace(/[^a-z0-9]/gi, '') || 'txt'}`;
}
