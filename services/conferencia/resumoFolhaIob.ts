// services/conferencia/resumoFolhaIob.ts
//
// Comparação da folha que o IOB CALCULOU (relatório exportado: folha mensal,
// resumo ou relação analítica, em Excel ou CSV) com o que o eSocial DEVOLVEU
// (S-5001, S-5003, S-5011, S-5013).
//
// Pega o que a conferência pelos totalizadores não vê: funcionário calculado
// no IOB e não transmitido (ou transmitido com valor diferente do calculado).
//
// Ainda não há exemplo do relatório real do escritório, então o leitor não
// assume layout: acha a linha de cabeçalho pelos nomes das colunas, propõe o
// mapeamento por sinônimos e deixa a equipe corrigir na tela. Quando chegar
// o primeiro relatório real, ele vira teste de regressão.

import * as XLSX from 'xlsx';
import type { GrupoApuracao } from './totalizadores';

export type CampoResumo = 'cpf' | 'matricula' | 'nome' | 'baseInss' | 'inss' | 'baseFgts' | 'fgts' | 'baseIrrf' | 'irrf' | 'liquido';

export const ROTULO_CAMPO: Record<CampoResumo, string> = {
    cpf: 'CPF', matricula: 'Matrícula / código', nome: 'Nome',
    baseInss: 'Base do INSS', inss: 'INSS descontado', baseFgts: 'Base do FGTS', fgts: 'FGTS (depósito)',
    baseIrrf: 'Base do IRRF', irrf: 'IRRF', liquido: 'Líquido',
};

/** Ordem importa: o mais específico primeiro (base antes do valor). */
const SINONIMOS: [CampoResumo, RegExp][] = [
    ['cpf', /\bc\.?p\.?f\b/],
    ['baseInss', /(base|bc|sal[aá]rio).{0,20}(inss|prev|contrib)|sal.{0,6}contribui/],
    ['baseFgts', /(base|bc|remun).{0,20}fgts/],
    ['baseIrrf', /(base|bc).{0,20}(irrf|\bir\b|imposto)/],
    ['inss', /\binss\b|previd[eê]ncia|contrib.{0,10}segurado/],
    ['fgts', /\bfgts\b|dep[oó]sito/],
    ['irrf', /\birrf\b|\bir\b|imposto de renda/],
    ['liquido', /l[ií]quido/],
    ['matricula', /matr[ií]c|c[oó]d(igo)?\.?\s*(do\s*)?(func|empr|trab)|^c[oó]d(igo)?\.?$|^cod\.?$/],
    ['nome', /nome|funcion[aá]rio|empregado|trabalhador/],
];

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export type Mapeamento = Partial<Record<CampoResumo, number>>;

export interface PlanilhaResumo {
    arquivo: string;
    aba: string;
    abas: string[];
    linhaCabecalho: number;
    cabecalho: string[];
    linhas: unknown[][];
    mapeamento: Mapeamento;
}

/** Propõe o mapeamento olhando os nomes das colunas. Cada coluna vai para um campo só. */
export function proporMapeamento(cabecalho: string[]): Mapeamento {
    const m: Mapeamento = {};
    const usadas = new Set<number>();
    for (const [campo, re] of SINONIMOS) {
        const i = cabecalho.findIndex((c, j) => !usadas.has(j) && re.test(normal(String(c ?? ''))));
        if (i >= 0 && m[campo] === undefined) { m[campo] = i; usadas.add(i); }
    }
    return m;
}

/** Linha de cabeçalho = a primeira (até a 30ª) que acerta pelo menos 3 campos. */
function acharCabecalho(linhas: unknown[][]): number {
    for (let i = 0; i < Math.min(30, linhas.length); i++) {
        const m = proporMapeamento((linhas[i] ?? []).map(c => String(c ?? '')));
        if (Object.keys(m).length >= 3) return i;
    }
    return 0;
}

export function lerPlanilhaResumo(bytes: ArrayBuffer | Uint8Array, arquivo: string, abaEscolhida?: string): PlanilhaResumo {
    const wb = XLSX.read(bytes, { type: 'array', cellDates: false, raw: false });
    if (!wb.SheetNames.length) throw new Error(`${arquivo}: planilha sem abas.`);
    // Sem aba escolhida: a que tiver cabeçalho reconhecível.
    const pontos = (n: string) => {
        const l = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: '', raw: true });
        return Object.keys(proporMapeamento((l[acharCabecalho(l)] ?? []).map(c => String(c ?? '')))).length;
    };
    const aba = abaEscolhida && wb.SheetNames.includes(abaEscolhida) ? abaEscolhida : [...wb.SheetNames].sort((a, b) => pontos(b) - pontos(a))[0];
    const todas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, defval: '', raw: true });
    const linhaCabecalho = acharCabecalho(todas);
    const cabecalho = (todas[linhaCabecalho] ?? []).map(c => String(c ?? '').trim());
    return { arquivo, aba, abas: wb.SheetNames, linhaCabecalho, cabecalho, linhas: todas.slice(linhaCabecalho + 1), mapeamento: proporMapeamento(cabecalho) };
}

/** Número do relatório em centavos: aceita número da célula, "1.234,56", "1234.56", "(12,00)", "12,00-". */
export function centavosDeCelula(v: unknown): number | null {
    if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
    let s = String(v ?? '').replace(/R\$|\s/g, '');
    if (!s) return null;
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
    if (s.startsWith('-')) { neg = true; s = s.slice(1); }
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const c = Math.round(Number(s) * 100);
    return neg ? -c : c;
}

const VALORES: CampoResumo[] = ['baseInss', 'inss', 'baseFgts', 'fgts', 'baseIrrf', 'irrf', 'liquido'];

export interface FuncionarioResumo {
    linha: number;
    cpf: string;
    matricula: string;
    nome: string;
    valores: Partial<Record<CampoResumo, number>>;
}

/** Extrai os funcionários. Linhas de total, subtotal e em branco ficam fora. */
export function extrairFuncionarios(p: PlanilhaResumo, m: Mapeamento = p.mapeamento): FuncionarioResumo[] {
    const out: FuncionarioResumo[] = [];
    p.linhas.forEach((l, i) => {
        const txt = (c?: number) => (c === undefined ? '' : String(l[c] ?? '').trim());
        const nome = txt(m.nome), cpf = txt(m.cpf).replace(/\D/g, ''), matricula = txt(m.matricula).replace(/\.0+$/, '');
        if (/\b(sub)?totais?\b|total geral|^total/i.test(`${nome} ${matricula}`)) return;
        if (!nome && !cpf && !matricula) return;
        const valores: Partial<Record<CampoResumo, number>> = {};
        for (const c of VALORES) {
            const idx = m[c];
            if (idx === undefined) continue;
            const v = centavosDeCelula(l[idx]);
            if (v !== null) valores[c] = v;
        }
        if (!Object.keys(valores).length && !cpf) return;
        out.push({ linha: p.linhaCabecalho + 2 + i, cpf: cpf.length === 11 ? cpf : '', matricula, nome, valores });
    });
    return out;
}

// ─── comparação com os totalizadores ─────────────────────────────────────

export interface LinhaComparacao {
    nome: string;
    cpf: string;
    matricula: string;
    encontradoNoESocial: boolean;
    inssIob: number | null; inssESocial: number | null;
    baseInssIob: number | null; baseInssESocial: number | null;
    baseFgtsIob: number | null; baseFgtsESocial: number | null;
    fgtsIob: number | null; fgtsESocial: number | null;
}

export interface PendenciaResumo { gravidade: 'critica' | 'atencao' | 'info'; cpf?: string; matricula?: string; mensagem: string; diferenca?: number }

export interface ComparacaoResumo {
    arquivo: string;
    funcionarios: number;
    chave: 'cpf' | 'matricula' | 'nenhuma';
    linhas: LinhaComparacao[];
    totais: { campo: string; iob: number; eSocial: number | null }[];
    pendencias: PendenciaResumo[];
}

const CR_NAO_INSS = new Set(['160601']);
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const soma = (xs: (number | undefined)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);

export function compararResumoIob(funcs: FuncionarioResumo[], g: GrupoApuracao, arquivo: string, tolerancia = 100): ComparacaoResumo {
    const pend: PendenciaResumo[] = [];
    // Índices do eSocial por CPF e por matrícula (a matrícula do eSocial; o
    // código sequencial do IOB não casa com ela — por isso o CPF vem primeiro).
    const porCpf5001 = new Map(g.s5001.map(t => [t.cpf, t]));
    const porCpf5003 = new Map(g.s5003.map(t => [t.cpf, t]));
    const cpfPorMatricula = new Map<string, string>();
    for (const t of g.s5001) for (const v of t.vinculos) if (v.matricula) cpfPorMatricula.set(v.matricula.replace(/^0+/, ''), t.cpf);
    for (const t of g.s5003) for (const i of t.itens) if (i.matricula) cpfPorMatricula.set(i.matricula.replace(/^0+/, ''), t.cpf);

    const temCpf = funcs.some(f => f.cpf);
    const chave: ComparacaoResumo['chave'] = temCpf ? 'cpf' : funcs.some(f => f.matricula) ? 'matricula' : 'nenhuma';
    if (chave === 'nenhuma') pend.push({ gravidade: 'atencao', mensagem: 'O relatório não tem coluna de CPF nem de matrícula mapeada: só os totais foram comparados.' });
    else if (chave === 'matricula') pend.push({ gravidade: 'info', mensagem: 'Comparação por matrícula. Se o relatório traz o código sequencial do IOB (000001…), ele não casa com a matrícula do eSocial: prefira um relatório com CPF.' });

    const linhas: LinhaComparacao[] = [];
    const vistos = new Set<string>();
    for (const f of funcs) {
        const cpf = f.cpf || (chave === 'matricula' ? cpfPorMatricula.get(f.matricula.replace(/^0+/, '')) ?? '' : '');
        const s1 = cpf ? porCpf5001.get(cpf) : undefined;
        const s3 = cpf ? porCpf5003.get(cpf) : undefined;
        if (cpf) vistos.add(cpf);
        const inssES = s1 ? soma(s1.calculos.filter(c => !CR_NAO_INSS.has(c.tpCR)).map(c => c.descontado)) : null;
        const baseInssES = s1 ? soma(s1.vinculos.flatMap(v => v.bases.filter(b => b.tpValor === '11' && b.ind13 !== '1').map(b => b.valor))) : null;
        const correntes = s3?.itens.filter(i => !i.periodoAnterior) ?? [];
        const baseFgtsES = s3 ? soma(correntes.map(i => i.remuneracao)) : null;
        const fgtsES = s3 ? soma(correntes.map(i => i.deposito)) : null;
        const l: LinhaComparacao = {
            nome: f.nome, cpf, matricula: f.matricula, encontradoNoESocial: !!(s1 || s3),
            inssIob: f.valores.inss ?? null, inssESocial: inssES,
            baseInssIob: f.valores.baseInss ?? null, baseInssESocial: baseInssES,
            baseFgtsIob: f.valores.baseFgts ?? null, baseFgtsESocial: baseFgtsES,
            fgtsIob: f.valores.fgts ?? null, fgtsESocial: fgtsES,
        };
        linhas.push(l);
        if (chave === 'nenhuma') continue;
        const id = { cpf: cpf || undefined, matricula: f.matricula || undefined };
        const quem = f.nome || f.matricula || cpf;
        if (!l.encontradoNoESocial) {
            const temValor = (f.valores.inss ?? 0) > 0 || (f.valores.fgts ?? 0) > 0 || (f.valores.liquido ?? 0) > 0;
            pend.push({ ...id, gravidade: temValor ? 'critica' : 'atencao', mensagem: `${quem} está na folha do IOB e não tem totalizador do eSocial no lote: folha calculada e não transmitida, ou arquivo faltando no lote.` });
            continue;
        }
        const comparar = (iob: number | null, es: number | null, rotulo: string) => {
            if (iob === null || es === null) return;
            const d = iob - es;
            if (!d) return;
            pend.push({ ...id, gravidade: Math.abs(d) <= tolerancia ? 'info' : 'critica', diferenca: d, mensagem: `${quem}: ${rotulo} no IOB ${reais(iob)}, no eSocial ${reais(es)} (${reais(Math.abs(d))} ${d > 0 ? 'a mais no IOB' : 'a menos no IOB'}). O IOB transmitiu algo diferente do que calculou: confira se houve recálculo depois do envio.` });
        };
        comparar(l.inssIob, l.inssESocial, 'INSS descontado');
        comparar(l.baseInssIob, l.baseInssESocial, 'base do INSS');
        comparar(l.baseFgtsIob, l.baseFgtsESocial, 'base do FGTS');
        comparar(l.fgtsIob, l.fgtsESocial, 'FGTS');
    }
    if (chave !== 'nenhuma') {
        for (const t of g.s5001) if (!vistos.has(t.cpf)) pend.push({ gravidade: 'atencao', cpf: t.cpf, mensagem: 'Trabalhador com totalizador no eSocial que não aparece no relatório do IOB: confira se o relatório é da mesma competência e empresa, ou se é evento de outra folha.' });
    }

    const cs = g.s5011[0], fg = g.s5013[0];
    const fgtsMensal = fg ? soma(fg.bases.filter(b => !b.periodoAnterior && !/^(2[1-9]|3[0-2]|4[5-9]|50)$/.test(b.tpValor)).map(b => b.valorFgts)) : null;
    const baseFgtsMensal = fg ? soma(fg.bases.filter(b => !b.periodoAnterior && !/^(2[1-9]|3[0-2]|4[5-9]|50)$/.test(b.tpValor)).map(b => b.base)) : null;
    const totais = [
        { campo: 'INSS descontado dos segurados', iob: soma(funcs.map(f => f.valores.inss)), eSocial: cs?.descontadoSegurados ?? null, tem: funcs.some(f => f.valores.inss !== undefined) },
        { campo: 'Base do FGTS (mensal)', iob: soma(funcs.map(f => f.valores.baseFgts)), eSocial: baseFgtsMensal, tem: funcs.some(f => f.valores.baseFgts !== undefined) },
        { campo: 'FGTS (mensal)', iob: soma(funcs.map(f => f.valores.fgts)), eSocial: fgtsMensal, tem: funcs.some(f => f.valores.fgts !== undefined) },
    ].filter(t => t.tem).map(({ campo, iob, eSocial }) => ({ campo, iob, eSocial }));
    for (const t of totais) {
        if (t.eSocial === null || t.iob === t.eSocial) continue;
        const d = t.iob - t.eSocial;
        pend.push({ gravidade: Math.abs(d) <= tolerancia ? 'info' : 'critica', diferenca: d, mensagem: `Total — ${t.campo}: IOB ${reais(t.iob)}, eSocial ${reais(t.eSocial)}. Veja os funcionários apontados abaixo.` });
    }
    return { arquivo, funcionarios: funcs.length, chave, linhas, totais, pendencias: pend };
}
