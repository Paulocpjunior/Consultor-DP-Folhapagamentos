// services/exportador/eventBus.ts
//
// Event bus em memoria pra sessao de apontamento.
// Coleta eventos vindos da folha (XLSX) e do ponto (ACJEF/espelho) e os mantem
// separadamente por origem, ate o momento da exportacao.
//
// Pode ser usado standalone (sem React) ou plugado num useState/Context na UI.

import type { EventoApurado, OrigemEvento } from '../../types/ponto';

export interface EstadoBus {
  folha: EventoApurado[];
  ponto: EventoApurado[];
  arquivosImportados: Array<{
    origem: OrigemEvento;
    nome: string;
    importadoEm: number;
    quantidadeEventos: number;
  }>;
}

export function criarBus(): EstadoBus {
  return { folha: [], ponto: [], arquivosImportados: [] };
}

/** Adiciona um lote de eventos vindo de um arquivo. Substitui qualquer lote anterior da mesma origem + arquivo. */
export function adicionarLote(
  bus: EstadoBus,
  origem: OrigemEvento,
  nomeArquivo: string,
  eventos: EventoApurado[],
): EstadoBus {
  // Remove eventos anteriores que vieram do mesmo arquivo (re-importacao do mesmo arquivo substitui)
  const filtra = (lista: EventoApurado[]) => lista.filter((e) => e.fonte.arquivo !== nomeArquivo);
  const arquivosLimpos = bus.arquivosImportados.filter((a) => !(a.origem === origem && a.nome === nomeArquivo));

  return {
    folha: origem === 'folha' ? [...filtra(bus.folha), ...eventos] : bus.folha,
    ponto: origem === 'ponto' ? [...filtra(bus.ponto), ...eventos] : bus.ponto,
    arquivosImportados: [
      ...arquivosLimpos,
      { origem, nome: nomeArquivo, importadoEm: Date.now(), quantidadeEventos: eventos.length },
    ],
  };
}

/** Limpa todos os eventos de uma origem (ex: usuario quer reimportar do zero). */
export function limparOrigem(bus: EstadoBus, origem: OrigemEvento): EstadoBus {
  return {
    folha: origem === 'folha' ? [] : bus.folha,
    ponto: origem === 'ponto' ? [] : bus.ponto,
    arquivosImportados: bus.arquivosImportados.filter((a) => a.origem !== origem),
  };
}

/** Reset total. */
export function limparTudo(): EstadoBus {
  return criarBus();
}

/** Retorna todos os eventos juntos, sem resolver conflitos. */
export function todosEventos(bus: EstadoBus): EventoApurado[] {
  return [...bus.folha, ...bus.ponto];
}

/** Resumo pra exibicao na UI (badge de "2 arquivos importados, 145 eventos"). */
export interface ResumoBus {
  totalFolha: number;
  totalPonto: number;
  arquivosFolha: number;
  arquivosPonto: number;
  matriculasUnicas: number;
}

export function resumir(bus: EstadoBus): ResumoBus {
  const matriculas = new Set<string>();
  for (const e of [...bus.folha, ...bus.ponto]) {
    if (e.matricula) matriculas.add(e.matricula);
  }
  return {
    totalFolha: bus.folha.length,
    totalPonto: bus.ponto.length,
    arquivosFolha: bus.arquivosImportados.filter((a) => a.origem === 'folha').length,
    arquivosPonto: bus.arquivosImportados.filter((a) => a.origem === 'ponto').length,
    matriculasUnicas: matriculas.size,
  };
}
