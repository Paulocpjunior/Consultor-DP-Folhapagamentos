// services/modelos/modelos.ts
//
// Contratos e modelos de documentos personalizáveis (como os "Textos" do SAGE: contratos, advertência,
// suspensão…): o texto do modelo tem campos {{funcionario.nome}}, {{empresa.cnpj}}… preenchidos com a ficha
// e a empresa. Marcação simples: "# " título, "## " subtítulo, linha em branco separa parágrafos,
// {{assinaturas}} insere os campos de assinatura do empregador e do empregado (e testemunhas).

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { centavosDeTexto } from '../cadastros/documentos';

export type CategoriaModelo = 'contrato' | 'termo' | 'disciplinar' | 'desligamento' | 'declaracao' | 'outro';
export const ROTULO_CATEGORIA: Record<CategoriaModelo, string> = {
    contrato: 'Contratos', termo: 'Termos e prorrogações', disciplinar: 'Advertência e suspensão', desligamento: 'Desligamento', declaracao: 'Declarações', outro: 'Outros',
};

export interface ModeloDocumento {
    id: string;
    titulo: string;
    categoria: CategoriaModelo;
    corpo: string;
    /** Vazio: modelo do escritório (todas as empresas); preenchido: só desta empresa. */
    empresaId: string;
    origem: 'consultor' | 'sage' | 'base';
    atualizadoPorEmail?: string;
    atualizadoEm?: Date;
}

export interface ContextoModelo {
    ficha: FichaFuncionario | null;
    empresa: { razaoSocial: string; nomeFantasia?: string; cnpj: string; codigoSage?: string };
    hoje: string;
    /** Valores digitados na hora (ex.: dias de experiência, motivo da advertência). */
    extras?: Record<string, string>;
}

// ─── Valores por extenso ────────────────────────────────────────────────────

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
    if (n === 100) return 'cem';
    const c = Math.floor(n / 100); const r = n % 100;
    const partes: string[] = [];
    if (c) partes.push(CENTENAS[c]);
    if (r) partes.push(r < 20 ? UNIDADES[r] : DEZENAS[Math.floor(r / 10)] + (r % 10 ? ` e ${UNIDADES[r % 10]}` : ''));
    return partes.join(' e ');
}

/** Número inteiro por extenso (até 999.999.999). */
export function numeroPorExtenso(n: number): string {
    n = Math.floor(Math.abs(n));
    if (n === 0) return 'zero';
    const milhoes = Math.floor(n / 1_000_000); const milhares = Math.floor((n % 1_000_000) / 1000); const resto = n % 1000;
    const partes: [string, number][] = [];
    if (milhoes) partes.push([milhoes === 1 ? 'um milhão' : `${ate999(milhoes)} milhões`, milhoes]);
    if (milhares) partes.push([milhares === 1 ? 'mil' : `${ate999(milhares)} mil`, milhares]);
    if (resto) partes.push([ate999(resto), resto]);
    // "e" antes da última parte quando ela é menor que 100 ou centena redonda (mil e duzentos; mil quinhentos e vinte).
    return partes.map(([t], i) => (i === 0 ? t : (i === partes.length - 1 && (partes[i][1] < 100 || partes[i][1] % 100 === 0) ? ' e ' : ' ') + t)).join('');
}

/** Valor em reais por extenso: "três mil reais", "mil, quinhentos e vinte reais e cinquenta centavos". */
export function reaisPorExtenso(centavos: number): string {
    const r = Math.floor(Math.abs(centavos) / 100); const c = Math.abs(centavos) % 100;
    const parteReais = r ? `${numeroPorExtenso(r)}${r % 1_000_000 === 0 && r >= 1_000_000 ? ' de' : ''} ${r === 1 ? 'real' : 'reais'}` : '';
    const parteCent = c ? `${numeroPorExtenso(c)} ${c === 1 ? 'centavo' : 'centavos'}` : '';
    return [parteReais, parteCent].filter(Boolean).join(' e ') || 'zero reais';
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const dataPorExtenso = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${Number(d.slice(8))} de ${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}` : d);

// ─── Campos ─────────────────────────────────────────────────────────────────

const br = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d ?? '');
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const cnpjFmt = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);
const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const somarDias = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE'); };
const ESTADO_CIVIL: Record<string, string> = { '1': 'solteiro(a)', '2': 'casado(a)', '3': 'divorciado(a)', '4': 'separado(a)', '5': 'viúvo(a)' };

export interface CampoModelo { chave: string; rotulo: string; grupo: 'Funcionário' | 'Contrato' | 'Empresa' | 'Data' | 'Digitado'; valor: (c: ContextoModelo) => string }

const f = (c: ContextoModelo) => c.ficha?.dados ?? {};
const salario = (c: ContextoModelo) => centavosDeTexto(f(c).salario ?? '') ?? 0;
const diasExp = (c: ContextoModelo) => Number(c.extras?.diasExperiencia || 45);

export const CAMPOS_MODELO: CampoModelo[] = [
    { chave: 'funcionario.nome', rotulo: 'Nome', grupo: 'Funcionário', valor: c => f(c).nome ?? '' },
    { chave: 'funcionario.cpf', rotulo: 'CPF', grupo: 'Funcionário', valor: c => cpfFmt(c.ficha?.cpf ?? '') },
    { chave: 'funcionario.rg', rotulo: 'RG', grupo: 'Funcionário', valor: c => [f(c).rg, f(c).orgaoRg].filter(Boolean).join(' ') },
    { chave: 'funcionario.ctps', rotulo: 'CTPS', grupo: 'Funcionário', valor: c => [f(c).ctps, f(c).serieCtps && `série ${f(c).serieCtps}`, f(c).ufCtps].filter(Boolean).join(' ') || 'digital' },
    { chave: 'funcionario.pis', rotulo: 'PIS', grupo: 'Funcionário', valor: c => f(c).pis ?? '' },
    { chave: 'funcionario.nascimento', rotulo: 'Nascimento', grupo: 'Funcionário', valor: c => br(f(c).nascimento) },
    { chave: 'funcionario.estadoCivil', rotulo: 'Estado civil', grupo: 'Funcionário', valor: c => ESTADO_CIVIL[f(c).estadoCivil ?? ''] ?? '' },
    { chave: 'funcionario.nacionalidade', rotulo: 'Nacionalidade', grupo: 'Funcionário', valor: c => (f(c).nacionalidade === '105' || !f(c).nacionalidade ? 'brasileiro(a)' : f(c).nacionalidade ?? '') },
    { chave: 'funcionario.endereco', rotulo: 'Endereço completo', grupo: 'Funcionário', valor: c => { const d = f(c); return [[d.logradouro, d.numero].filter(Boolean).join(', '), d.complemento, d.bairro, [d.municipio, d.uf].filter(Boolean).join('/'), d.cep && `CEP ${d.cep}`].filter(Boolean).join(' – '); } },
    { chave: 'funcionario.matricula', rotulo: 'Matrícula', grupo: 'Funcionário', valor: c => c.ficha?.matriculaEsocial ?? '' },
    { chave: 'contrato.cargo', rotulo: 'Cargo', grupo: 'Contrato', valor: c => f(c).cargo ?? '' },
    { chave: 'contrato.cbo', rotulo: 'CBO', grupo: 'Contrato', valor: c => f(c).cbo ?? '' },
    { chave: 'contrato.admissao', rotulo: 'Data de admissão', grupo: 'Contrato', valor: c => br(f(c).admissao) },
    { chave: 'contrato.salario', rotulo: 'Salário', grupo: 'Contrato', valor: c => brl(salario(c)) },
    { chave: 'contrato.salarioExtenso', rotulo: 'Salário por extenso', grupo: 'Contrato', valor: c => reaisPorExtenso(salario(c)) },
    { chave: 'contrato.horasSemanais', rotulo: 'Horas semanais', grupo: 'Contrato', valor: c => f(c).horasSemanais ?? '' },
    { chave: 'contrato.jornada', rotulo: 'Jornada / horário', grupo: 'Contrato', valor: c => f(c).jornada || [f(c).horarioTrabalho, f(c).horarioIntervalo && `intervalo ${f(c).horarioIntervalo}`].filter(Boolean).join(', ') },
    { chave: 'contrato.diasExperiencia', rotulo: 'Dias de experiência', grupo: 'Contrato', valor: c => String(diasExp(c)) },
    { chave: 'contrato.fimExperiencia', rotulo: 'Fim da experiência', grupo: 'Contrato', valor: c => (f(c).admissao ? br(somarDias(f(c).admissao!, diasExp(c) - 1)) : '') },
    { chave: 'contrato.fimProrrogacao', rotulo: 'Fim da prorrogação (até 90 dias)', grupo: 'Contrato', valor: c => (f(c).admissao ? br(somarDias(f(c).admissao!, 89)) : '') },
    { chave: 'contrato.fimContrato', rotulo: 'Fim do contrato (ficha)', grupo: 'Contrato', valor: c => br(f(c).fimContrato) },
    { chave: 'contrato.desligamento', rotulo: 'Data de desligamento', grupo: 'Contrato', valor: c => br(f(c).dataDesligamento) },
    { chave: 'empresa.razaoSocial', rotulo: 'Razão social', grupo: 'Empresa', valor: c => c.empresa.razaoSocial },
    { chave: 'empresa.nomeFantasia', rotulo: 'Nome fantasia', grupo: 'Empresa', valor: c => c.empresa.nomeFantasia || c.empresa.razaoSocial },
    { chave: 'empresa.cnpj', rotulo: 'CNPJ', grupo: 'Empresa', valor: c => cnpjFmt(c.empresa.cnpj) },
    { chave: 'data.hoje', rotulo: 'Data de hoje', grupo: 'Data', valor: c => br(c.hoje) },
    { chave: 'data.extenso', rotulo: 'Data de hoje por extenso', grupo: 'Data', valor: c => dataPorExtenso(c.hoje) },
    { chave: 'digitado.motivo', rotulo: 'Motivo (digitado na hora)', grupo: 'Digitado', valor: c => c.extras?.motivo ?? '' },
    { chave: 'digitado.dias', rotulo: 'Dias (digitado na hora)', grupo: 'Digitado', valor: c => c.extras?.dias ?? '' },
    { chave: 'digitado.data', rotulo: 'Data (digitada na hora)', grupo: 'Digitado', valor: c => br(c.extras?.data) },
    { chave: 'digitado.cidade', rotulo: 'Cidade (digitada na hora)', grupo: 'Digitado', valor: c => c.extras?.cidade || 'São Paulo' },
];
const PORCHAVE = new Map(CAMPOS_MODELO.map(c => [c.chave, c]));

/** Campos usados no texto (para pedir os digitados e conferir os desconhecidos). */
export function camposDoTexto(corpo: string): { conhecidos: string[]; desconhecidos: string[] } {
    const usados = [...new Set([...corpo.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]))].filter(k => k !== 'assinaturas');
    return { conhecidos: usados.filter(k => PORCHAVE.has(k)), desconhecidos: usados.filter(k => !PORCHAVE.has(k)) };
}

/** Texto do modelo com os campos preenchidos; campo vazio fica com uma linha para preencher à mão. */
export function preencherModelo(corpo: string, c: ContextoModelo): { texto: string; vazios: string[] } {
    const vazios = new Set<string>();
    const texto = corpo.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (todo, k: string) => {
        if (k === 'assinaturas') return todo;
        const campo = PORCHAVE.get(k);
        const v = campo ? campo.valor(c).trim() : '';
        if (!v) { vazios.add(campo?.rotulo ?? k); return '________________'; }
        return v;
    });
    return { texto, vazios: [...vazios] };
}

/** Blocos para o PDF: título, subtítulo, parágrafo e assinaturas. */
export type Bloco = { tipo: 'titulo' | 'subtitulo' | 'paragrafo'; texto: string } | { tipo: 'assinaturas' };
export function blocosDoTexto(texto: string): Bloco[] {
    const out: Bloco[] = [];
    for (const parte of texto.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
        const t = parte.trim();
        if (!t) continue;
        if (/^\{\{\s*assinaturas\s*\}\}$/.test(t)) out.push({ tipo: 'assinaturas' });
        else if (t.startsWith('## ')) out.push({ tipo: 'subtitulo', texto: t.slice(3).trim() });
        else if (t.startsWith('# ')) out.push({ tipo: 'titulo', texto: t.slice(2).trim() });
        else out.push({ tipo: 'paragrafo', texto: t.replace(/\s*\n\s*/g, ' ') });
    }
    return out;
}

// ─── Textos do SAGE (backup) ────────────────────────────────────────────────

/** Grupos do RTF que não são texto (tabelas de fonte e cor, estilos, metadados, imagens…). */
const DESTINOS_IGNORADOS = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'latentstyles', 'datastore', 'object']);

/** RTF do SAGE em texto: ignora os grupos de controle, converte \par em quebra e os \'hh (Windows-1252). */
export function rtfParaTexto(rtf: string): string {
    if (!/^\s*\{\\rtf/.test(rtf)) return rtf;
    const cp1252 = new TextDecoder('windows-1252');
    const pilha: boolean[] = [];
    let ignorar = false; let out = ''; let pularUnicode = 0; let i = 0;
    const emitir = (t: string) => { if (!ignorar) out += t; };
    while (i < rtf.length) {
        const ch = rtf[i];
        if (ch === '{') { pilha.push(ignorar); i++; if (rtf.startsWith('\\*', i)) ignorar = true; continue; }
        if (ch === '}') { ignorar = pilha.pop() ?? false; i++; continue; }
        if (ch === '\\') {
            const prox = rtf[i + 1];
            if (prox === '\\' || prox === '{' || prox === '}') { emitir(prox); i += 2; continue; }
            if (prox === "'") {
                if (pularUnicode > 0) pularUnicode--; else emitir(cp1252.decode(new Uint8Array([parseInt(rtf.slice(i + 2, i + 4), 16)])));
                i += 4; continue;
            }
            const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
            if (!m) { i += 2; continue; }
            i += m[0].length;
            const [, palavra, num] = m;
            if (DESTINOS_IGNORADOS.has(palavra)) ignorar = true;
            else if (palavra === 'par' || palavra === 'line') emitir('\n');
            else if (palavra === 'tab') emitir('\t');
            else if (palavra === 'u' && num) { emitir(String.fromCharCode(Number(num) < 0 ? Number(num) + 65536 : Number(num))); pularUnicode = 1; }
            continue;
        }
        if (ch === '\r' || ch === '\n') { i++; continue; }
        if (pularUnicode > 0) { pularUnicode--; i++; continue; }
        emitir(ch); i++;
    }
    return out.split('\n').map(l => l.replace(/^[ \t]+|[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Marcadores de campo de outro sistema no texto (#NOME#, @NOME@, <<NOME>>, [NOME]), para ligar aos campos do Consultor. */
export function marcadoresEstranhos(texto: string): string[] {
    const r = [/#([A-Z_][A-Z0-9_. ]{1,30})#/g, /@([A-Z_][A-Z0-9_.]{1,30})@/g, /<<\s*([^<>]{1,30})\s*>>/g, /\[([A-Z_][A-Z0-9_. ]{1,30})\]/g];
    const out = new Set<string>();
    for (const re of r) for (const m of texto.matchAll(re)) out.add(m[0]);
    return [...out];
}

/** Troca os marcadores do SAGE pelos campos do Consultor ({{chave}}), conforme a ligação feita na tela. */
export const converterMarcadores = (texto: string, ligacao: Record<string, string>) =>
    Object.entries(ligacao).reduce((t, [de, para]) => (para ? t.split(de).join(`{{${para}}}`) : t), texto);

/** Sugestão de campo para um marcador do SAGE, pelo nome. */
export function sugerirCampo(marcador: string): string {
    const n = marcador.replace(/[#@<>[\]]/g, '').trim().toUpperCase();
    const regras: [RegExp, string][] = [
        [/DATA.*EXT/, 'data.extenso'], [/SALARIO.*EXT|EXTENSO/, 'contrato.salarioExtenso'], [/SALARIO/, 'contrato.salario'], [/CARGO|FUNCAO/, 'contrato.cargo'], [/CBO/, 'contrato.cbo'],
        [/ADMISS/, 'contrato.admissao'], [/RAZAO|EMPRESA|EMPREGADOR/, 'empresa.razaoSocial'], [/CNPJ|CGC/, 'empresa.cnpj'],
        [/CPF/, 'funcionario.cpf'], [/(^|[_ .])RG($|[_ .])|IDENT/, 'funcionario.rg'], [/CTPS|CARTEIRA/, 'funcionario.ctps'], [/PIS/, 'funcionario.pis'],
        [/ENDERE|RUA|LOGRAD/, 'funcionario.endereco'], [/NASC/, 'funcionario.nascimento'], [/CIVIL/, 'funcionario.estadoCivil'],
        [/NACION/, 'funcionario.nacionalidade'], [/NOME|EMPREGADO|FUNCIONARIO/, 'funcionario.nome'], [/HORARIO|JORNADA/, 'contrato.jornada'],
        [/DATA|HOJE/, 'data.hoje'], [/CIDADE/, 'digitado.cidade'],
    ];
    return regras.find(([re]) => re.test(n))?.[1] ?? '';
}

/** Tabela do backup que parece guardar textos (contratos, advertências…): pelo nome ou por ter coluna de texto longo. */
export function pareceTabelaDeTextos(nome: string, colunas: string[]): boolean {
    return /text|contr|model|carta|declar|termo|document|advert|suspens/i.test(nome)
        || colunas.some(c => /^(texto|conteudo|corpo|memo|modelo|documento|rtf)/i.test(c));
}

export interface TextoImportado { chave: string; titulo: string; corpo: string }

/**
 * Textos de uma tabela do backup: a coluna do texto é a de conteúdo mais longo (ou em RTF); o título, a coluna
 * de nome/descrição. Texto gravado em várias linhas (código + sequência + linha) é juntado na ordem.
 */
export function textosDaTabela(colunas: string[], linhas: (string | null)[][]): TextoImportado[] {
    if (!linhas.length) return [];
    const media = colunas.map((_, i) => linhas.reduce((s, l) => s + (l[i]?.length ?? 0), 0) / linhas.length);
    const rtf = colunas.findIndex((_, i) => linhas.some(l => /^\s*\{\\rtf/.test(l[i] ?? '')));
    const iCorpo = rtf >= 0 ? rtf : media.indexOf(Math.max(...media));
    const nomeIdx = (re: RegExp) => colunas.findIndex((c, i) => i !== iCorpo && re.test(c));
    let iTitulo = nomeIdx(/titulo|descr|nome|assunto/i);
    const iCodigo = colunas.findIndex((c, i) => i !== iCorpo && i !== iTitulo && /^(cod|codigo|id|numero|cdtexto|codtexto)/i.test(c));
    if (iTitulo < 0) iTitulo = colunas.findIndex((_, i) => i !== iCorpo && i !== iCodigo && media[i] > 2 && linhas.some(l => /[a-zA-Z]{3}/.test(l[i] ?? '')));
    const iSeq = nomeIdx(/^(seq|sequencia|linha|ordem|nrlinha)/i);
    const chaveDe = (l: (string | null)[]) => (iCodigo >= 0 ? l[iCodigo] ?? '' : iTitulo >= 0 ? l[iTitulo] ?? '' : '');

    if (iSeq >= 0 && (iCodigo >= 0 || iTitulo >= 0)) {
        const grupos = new Map<string, { titulo: string; partes: [number, string][] }>();
        for (const l of linhas) {
            const k = chaveDe(l);
            const g = grupos.get(k) ?? { titulo: '', partes: [] };
            if (!g.titulo && iTitulo >= 0) g.titulo = (l[iTitulo] ?? '').trim();
            g.partes.push([Number(l[iSeq] ?? 0), l[iCorpo] ?? '']);
            grupos.set(k, g);
        }
        return [...grupos].map(([chave, g]) => ({ chave, titulo: g.titulo || `Texto ${chave}`, corpo: rtfParaTexto(g.partes.sort((a, b) => a[0] - b[0]).map(p => p[1]).join('\n')) }))
            .filter(t => t.corpo.trim());
    }
    return linhas.map((l, i) => ({ chave: chaveDe(l) || String(i + 1), titulo: (iTitulo >= 0 ? l[iTitulo]?.trim() : '') || `Texto ${chaveDe(l) || i + 1}`, corpo: rtfParaTexto(l[iCorpo] ?? '') }))
        .filter(t => t.corpo.trim());
}

/** Categoria sugerida pelo título do texto. */
export function categoriaPeloTitulo(titulo: string): CategoriaModelo {
    const t = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/advert|suspens/.test(t)) return 'disciplinar';
    if (/prorrog|termo|acordo|aditivo/.test(t)) return 'termo';
    if (/contrato/.test(t)) return 'contrato';
    if (/aviso|demiss|dispensa|rescis|deslig/.test(t)) return 'desligamento';
    if (/declara|opcao|vale|dependente|recibo|autoriza/.test(t)) return 'declaracao';
    return 'outro';
}
