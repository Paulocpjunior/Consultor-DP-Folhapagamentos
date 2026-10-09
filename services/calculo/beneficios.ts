// services/calculo/beneficios.ts
//
// Benefícios da empresa com desconto (ou provento) fixo na folha, como a
// assistência odontológica do IOB (evento 7001, ref. = vidas): a empresa
// cadastra o benefício uma vez (valor por vida, incidências) e a ficha diz
// quem aderiu, com quantas vidas e desde quando. O motor mensal lança sozinho.

import type { TipoVerba, Verba } from './motorMensal';

export interface Beneficio {
    id: string;
    nome: string;
    /** Código do evento no IOB (7001, por exemplo), para a conferência e o de/para. */
    codigoIob?: string;
    tipo: TipoVerba;
    /** Valor por vida no mês, em centavos. */
    valor: number;
    inss: boolean; fgts: boolean; irrf: boolean;
    /** Desligado na empresa: deixa de entrar na folha de todos. */
    ativo: boolean;
    /**
     * Definições anteriores, cada uma valendo até a competência `ate` (inclusive): mudar o valor, o tipo, as
     * incidências ou desativar não reescreve os meses passados (Codex #122).
     */
    historico?: DefinicaoBeneficio[];
}

/** O que muda num benefício ao longo do tempo. */
export type DefinicaoBeneficio = Pick<Beneficio, 'tipo' | 'valor' | 'inss' | 'fgts' | 'irrf' | 'ativo'> & { ate: string };

const definicao = (b: Beneficio) => ({ tipo: b.tipo, valor: b.valor, inss: b.inss, fgts: b.fgts, irrf: b.irrf, ativo: b.ativo });
const mesAnterior = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`; };

/** A definição do benefício que valia na competência: a do histórico que a cobre, ou a atual. */
export function definicaoNoMes(b: Beneficio, competencia: string): Omit<DefinicaoBeneficio, 'ate'> {
    const h = [...(b.historico ?? [])].sort((x, y) => x.ate.localeCompare(y.ate)).find(x => x.ate >= competencia);
    return h ? { tipo: h.tipo, valor: h.valor, inss: h.inss, fgts: h.fgts, irrf: h.irrf, ativo: h.ativo } : definicao(b);
}

/**
 * Lista a gravar a partir da editada: o benefício cuja definição mudou guarda a anterior no histórico, valendo
 * até o mês anterior a `aPartirDe` (a competência da tela); a nova vale dali em diante. Benefício removido sai.
 */
export function comHistorico(antes: Beneficio[], depois: Beneficio[], aPartirDe: string): Beneficio[] {
    const porId = new Map(antes.map(b => [b.id, b]));
    return depois.map(b => {
        const a = porId.get(b.id);
        const historico = a?.historico ?? b.historico;
        if (!a || JSON.stringify(definicao(a)) === JSON.stringify(definicao(b)) || !COMPETENCIA.test(aPartirDe)) return { ...b, ...(historico ? { historico } : {}) };
        const ate = mesAnterior(aPartirDe);
        // Mudar de novo no mesmo mês substitui a mudança anterior desse mês (o histórico não ganha uma faixa vazia).
        const anteriores = (historico ?? []).filter(x => x.ate < ate);
        const ultimo = (historico ?? []).find(x => x.ate === ate);
        return { ...b, historico: [...anteriores, ultimo ?? { ...definicao(a), ate }] };
    });
}

export interface AdesaoBeneficio {
    beneficioId: string;
    /** Quantidade de vidas (titular e dependentes no plano). */
    vidas: number;
    /** Competências (AAAA-MM) de início e fim; em branco, sem limite. */
    desde?: string;
    ate?: string;
}

const COMPETENCIA = /^\d{4}-\d{2}$/;

/** Prefixo do código da verba de benefício no motor (BEN-<id>). */
export const PREFIXO_BENEFICIO = 'BEN-';

export const novoBeneficio = (): Beneficio => ({ id: Math.random().toString(36).slice(2, 10), nome: '', codigoIob: '', tipo: 'desconto', valor: 0, inss: false, fgts: false, irrf: false, ativo: true });

/** Erros do cadastro de benefícios da empresa. */
export function validarBeneficios(lista: Beneficio[]): string[] {
    const erros: string[] = [];
    lista.forEach((b, i) => {
        const n = `Benefício ${i + 1}${b.nome.trim() ? ` (${b.nome.trim()})` : ''}`;
        if (!b.nome.trim()) erros.push(`${n}: informe o nome.`);
        if (!(b.valor > 0)) erros.push(`${n}: informe o valor por vida.`);
        if (b.tipo !== 'desconto' && b.tipo !== 'provento') erros.push(`${n}: tipo inválido.`);
    });
    const nomes = lista.map(b => b.nome.trim().toUpperCase()).filter(Boolean);
    if (new Set(nomes).size !== nomes.length) erros.push('Há benefícios com o mesmo nome.');
    return erros;
}

/** Erros das adesões da ficha. */
export function validarAdesoes(adesoes: AdesaoBeneficio[]): string[] {
    const erros: string[] = [];
    for (const a of adesoes) {
        if (!(Number.isInteger(a.vidas) && a.vidas >= 1 && a.vidas <= 20)) erros.push('Benefícios: vidas entre 1 e 20.');
        if ((a.desde && !COMPETENCIA.test(a.desde)) || (a.ate && !COMPETENCIA.test(a.ate))) erros.push('Benefícios: início e fim no formato AAAA-MM.');
        if (a.desde && a.ate && a.ate < a.desde) erros.push('Benefícios: fim antes do início.');
    }
    // Mais de um período do mesmo benefício (as vidas mudaram): não podem se sobrepor, senão o mês desconta duas vezes.
    adesoes.forEach((a, i) => adesoes.slice(i + 1).forEach(b => {
        if (a.beneficioId !== b.beneficioId) return;
        const ini = (x: AdesaoBeneficio) => x.desde || '0000-00'; const fim = (x: AdesaoBeneficio) => x.ate || '9999-99';
        if (ini(a) <= fim(b) && ini(b) <= fim(a)) erros.push('Benefícios: períodos do mesmo benefício se sobrepõem (feche o anterior com "até" antes de abrir o novo).');
    }));
    if (adesoes.some(a => !a.beneficioId)) erros.push('Benefícios: escolha o benefício.');
    return [...new Set(erros)];
}

/** Verbas dos benefícios da ficha vigentes na competência (valor por vida × vidas), com a memória. */
export function verbasDosBeneficios(catalogo: Beneficio[] | undefined, adesoes: AdesaoBeneficio[] | undefined, competencia: string): { verbas: Verba[]; memoria: string[] } {
    const verbas: Verba[] = []; const memoria: string[] = [];
    const porId = new Map((catalogo ?? []).map(b => [b.id, b]));
    for (const a of adesoes ?? []) {
        const b = porId.get(a.beneficioId);
        if (!b || !(a.vidas > 0)) continue;
        if ((a.desde && a.desde > competencia) || (a.ate && a.ate < competencia)) continue;
        const d = definicaoNoMes(b, competencia);
        if (!d.ativo || !(d.valor > 0)) continue;
        const valor = Math.round(d.valor * a.vidas);
        verbas.push({ codigo: `${PREFIXO_BENEFICIO}${b.id}`, descricao: b.nome, referencia: `${a.vidas} vida${a.vidas > 1 ? 's' : ''}`, tipo: d.tipo, valor, inss: d.inss, fgts: d.fgts, irrf: d.irrf });
        memoria.push(`${b.nome}${b.codigoIob ? ` (evento ${b.codigoIob} do IOB)` : ''}: ${(d.valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por vida × ${a.vidas} = ${(valor / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (benefício da empresa).`);
    }
    return { verbas, memoria };
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** A linha do holerite do IOB é um benefício cadastrado (pelo código do evento ou pelo começo do nome)? */
export function ehBeneficio(catalogo: Beneficio[] | undefined, codigo: string, descricao: string): boolean {
    const d = semAcento(descricao);
    return (catalogo ?? []).some(b => (!!b.codigoIob && b.codigoIob.replace(/^0+/, '') === codigo.replace(/^0+/, ''))
        || (d.length >= 8 && semAcento(b.nome).startsWith(d.slice(0, 18))));
}
