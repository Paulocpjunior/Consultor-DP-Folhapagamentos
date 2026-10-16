// services/calculo/automaticosEmLote.ts
//
// Lançamentos automáticos em lote (o que ainda prende ao SAGE, item 3): os automáticos vindos do backup do IOB chegam
// sem "Lança na rescisão" e sem "Pago no adiantamento" (a tabela lancauto não traz essas marcas de forma confiável).
// Aqui a equipe marca por evento, para todas as fichas da empresa de uma vez, com prévia; nada muda além das duas marcas.
// Puro.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { LancamentoAutomatico } from './lancamentosAutomaticos';

export type MarcaRescisao = 'nao' | 'proporcional' | 'integral';
export interface MarcacaoEvento { naRescisao?: MarcaRescisao; noAdiantamento?: boolean }
export interface ResumoEventoAutomatico {
    codigo: string; descricao: string; fichas: number; lancamentos: number;
    rescisao: Record<MarcaRescisao, number>;
    adiantamento: { sim: number; nao: number };
}

export const codigoAutomatico = (c: string) => (c ?? '').trim().replace(/^0+(?=\d{4})/, '').padStart(4, '0');
const marcaRescisao = (l: LancamentoAutomatico): MarcaRescisao => l.naRescisao ?? 'nao';

/** Os eventos dos automáticos das fichas, com quantas fichas e como estão marcados hoje. */
export function resumoAutomaticos(fichas: Pick<FichaFuncionario, 'id' | 'lancamentosAutomaticos'>[]): ResumoEventoAutomatico[] {
    const mapa = new Map<string, ResumoEventoAutomatico & { ids: Set<string> }>();
    for (const f of fichas) for (const l of f.lancamentosAutomaticos ?? []) {
        const codigo = codigoAutomatico(l.codigoEvento);
        const r = mapa.get(codigo) ?? { codigo, descricao: '', fichas: 0, lancamentos: 0, rescisao: { nao: 0, proporcional: 0, integral: 0 }, adiantamento: { sim: 0, nao: 0 }, ids: new Set<string>() };
        if (!r.descricao && l.descricao) r.descricao = l.descricao;
        r.ids.add(f.id); r.lancamentos++;
        r.rescisao[marcaRescisao(l)]++;
        r.adiantamento[l.noAdiantamento ? 'sim' : 'nao']++;
        mapa.set(codigo, r);
    }
    return [...mapa.values()].map(({ ids, ...r }) => ({ ...r, fichas: ids.size })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

/** Aplica as marcações por evento e devolve só as fichas que mudaram (e quantos lançamentos mudaram). */
export function aplicarMarcacoes<F extends Pick<FichaFuncionario, 'id' | 'lancamentosAutomaticos'>>(fichas: F[], marcacoes: Record<string, MarcacaoEvento>): { fichas: F[]; lancamentos: number } {
    let lancamentos = 0;
    const mudadas: F[] = [];
    for (const f of fichas) {
        let mudou = false;
        const novos = (f.lancamentosAutomaticos ?? []).map(l => {
            const m = marcacoes[codigoAutomatico(l.codigoEvento)];
            if (!m) return l;
            const n: LancamentoAutomatico = { ...l };
            if (m.naRescisao) { if (m.naRescisao === 'nao') delete n.naRescisao; else n.naRescisao = m.naRescisao; }
            if (m.noAdiantamento !== undefined) { if (m.noAdiantamento) n.noAdiantamento = true; else delete n.noAdiantamento; }
            if (marcaRescisao(n) === marcaRescisao(l) && !!n.noAdiantamento === !!l.noAdiantamento) return l;
            mudou = true; lancamentos++;
            return n;
        });
        if (mudou) mudadas.push({ ...f, lancamentosAutomaticos: novos });
    }
    return { fichas: mudadas, lancamentos };
}
