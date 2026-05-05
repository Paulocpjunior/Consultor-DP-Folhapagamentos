// services/exportador/merger.ts
//
// Merger: combina eventos de folha + ponto, detecta conflitos (mesma matricula +
// mesmo codigo de evento com valores diferentes) e aplica resolucoes do usuario.
//
// Conflito = mesma matricula + mesmo codigo de evento, com pelo menos uma origem
// trazendo valor diferente da outra. Mesma matricula + mesmo codigo + mesmo valor
// nao e conflito (e silenciosamente deduplicado).

import type {
  EventoApurado,
  ConflitoEvento,
  ResolucaoConflito,
  ResultadoMerge,
} from '../../types/ponto';
import type { EstadoBus } from './eventBus';

const TOLERANCIA = 0.001; // diferencas menores que 0.001 horas (~3.6s) nao contam como conflito

function chaveAgrupamento(e: EventoApurado): string {
  return `${e.matricula ?? '__sem_matricula__'}::${e.evento}`;
}

/**
 * Detecta conflitos entre eventos de folha e ponto.
 * Eventos sem matricula mapeada ficam de fora do merge (precisam ser cadastrados antes).
 */
export function detectarConflitos(bus: EstadoBus): ResultadoMerge {
  const resultado: ResultadoMerge = { eventosResolvidos: [], conflitos: [] };

  // Agrupar todos os eventos por chave (matricula + codigo)
  const grupos = new Map<string, EventoApurado[]>();
  for (const e of [...bus.folha, ...bus.ponto]) {
    if (!e.matricula) continue; // ignora os sem matricula (sao tratados em outro fluxo)
    const k = chaveAgrupamento(e);
    const arr = grupos.get(k) ?? [];
    arr.push(e);
    grupos.set(k, arr);
  }

  for (const [, eventos] of grupos) {
    if (eventos.length === 1) {
      // Sem competicao: passa direto
      resultado.eventosResolvidos.push(eventos[0]);
      continue;
    }

    // Mais de um evento pra mesma matricula+codigo: pode ou nao ser conflito.
    // Agrupa por origem e verifica se valores divergem.
    const porOrigem = new Map<string, EventoApurado[]>();
    for (const e of eventos) {
      const arr = porOrigem.get(e.origem) ?? [];
      arr.push(e);
      porOrigem.set(e.origem, arr);
    }

    // Soma os valores de cada origem (ex: ponto pode ter trazido 2 lancamentos do mesmo codigo no mes)
    const valoresPorOrigem = new Map<string, { valor: number; eventos: EventoApurado[] }>();
    for (const [origem, lista] of porOrigem) {
      const soma = lista.reduce((s, e) => s + e.valor, 0);
      valoresPorOrigem.set(origem, { valor: soma, eventos: lista });
    }

    // Se so tem 1 origem (ex: 2 eventos vieram so do ponto): nao e conflito, e duplicidade interna
    if (valoresPorOrigem.size === 1) {
      // Consolida em 1 evento somado
      const [[, info]] = Array.from(valoresPorOrigem.entries());
      const base = info.eventos[0];
      resultado.eventosResolvidos.push({ ...base, valor: info.valor });
      continue;
    }

    // 2+ origens: verificar se valores divergem
    const valores = Array.from(valoresPorOrigem.values()).map((v) => v.valor);
    const max = Math.max(...valores);
    const min = Math.min(...valores);
    if (max - min < TOLERANCIA) {
      // Valores praticamente iguais: nao e conflito de verdade. Pega o primeiro e segue.
      const base = eventos[0];
      resultado.eventosResolvidos.push(base);
      continue;
    }

    // Conflito real
    const ref = eventos[0];
    const conflito: ConflitoEvento = {
      matricula: ref.matricula!,
      nomeFuncionario: ref.nomeFuncionario,
      evento: ref.evento,
      descricao: ref.descricao,
      unidade: ref.unidade,
      candidatos: Array.from(valoresPorOrigem.entries()).map(([origem, info]) => ({
        origem: origem as 'folha' | 'ponto',
        valor: info.valor,
        fonte: info.eventos[0].fonte,
      })),
    };
    resultado.conflitos.push(conflito);
  }

  return resultado;
}

/**
 * Aplica as resolucoes que o usuario deu no modal e retorna a lista final de eventos.
 * As chaves de `resolucoes` devem ser `${matricula}::${evento}`.
 */
export function aplicarResolucoes(
  resolvidos: EventoApurado[],
  conflitos: ConflitoEvento[],
  resolucoes: Map<string, ResolucaoConflito>,
): EventoApurado[] {
  const finais = [...resolvidos];

  for (const c of conflitos) {
    const chave = `${c.matricula}::${c.evento}`;
    const r = resolucoes.get(chave);
    if (!r) {
      // Nao resolvido: omite por seguranca (com aviso na UI)
      continue;
    }

    const base: EventoApurado = {
      matricula: c.matricula,
      nomeFuncionario: c.nomeFuncionario,
      evento: c.evento,
      descricao: c.descricao,
      valor: 0,
      unidade: c.unidade,
      rv: 'V', // sera ajustado abaixo
      origem: 'folha',
      fonte: { arquivo: 'merger', tipoArquivo: 'xlsx_folha' },
    };

    if (r.tipo === 'usar_origem') {
      const cand = c.candidatos.find((x) => x.origem === r.origem);
      if (!cand) continue;
      finais.push({ ...base, valor: cand.valor, origem: cand.origem, fonte: cand.fonte });
    } else if (r.tipo === 'somar') {
      const soma = c.candidatos.reduce((s, x) => s + x.valor, 0);
      finais.push({ ...base, valor: soma, fonte: c.candidatos[0].fonte });
    } else if (r.tipo === 'valor_customizado') {
      finais.push({ ...base, valor: r.valor, fonte: c.candidatos[0].fonte });
    }
    // 'ignorar' nao adiciona nada
  }

  return finais;
}

/** Helper pra montar a chave da Map de resolucoes a partir de um conflito. */
export function chaveResolucao(c: ConflitoEvento): string {
  return `${c.matricula}::${c.evento}`;
}
