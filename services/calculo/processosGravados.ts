// services/calculo/processosGravados.ts
//
// Processos pagos fora da folha mensal, gravados como a folha do mês (services/calculo/folhaGravada.ts): os recibos de
// férias (pela competência do início do gozo), as parcelas do 13º (pelo mês do pagamento) e as rescisões (pela
// competência do desligamento), em processos_gravados/{empresa}_{tipo}_{AAAA-MM}. É o que a ficha financeira lê nos
// meses do Consultor, como os processos do SAGE. Puro, sem Firebase.

import type { ResultadoCalculo } from './motorMensal';
import { totaisDaFolha, type TotaisFolha } from './folhaGravada';

export type TipoProcesso = 'ferias' | '13-1a' | '13-2a' | 'rescisao';
export const TIPOS_PROCESSO: TipoProcesso[] = ['ferias', '13-1a', '13-2a', 'rescisao'];
export const TITULO_PROCESSO: Record<TipoProcesso, string> = { ferias: 'Férias', '13-1a': '13º 1ª parcela', '13-2a': '13º 2ª parcela', rescisao: 'Rescisão' };

export interface ProcessoGravado {
    empresaId: string;
    tipo: TipoProcesso;
    competencia: string;
    gravadoPorEmail: string;
    gravadoEm?: Date;
    totais: TotaisFolha;
    holerites: ResultadoCalculo[];
}

export const idProcesso = (empresaId: string, tipo: TipoProcesso, competencia: string) => `${empresaId}_${tipo}_${competencia}`;

/** Chave do holerite no processo: o gozo nas férias (um funcionário pode ter dois no mês), senão a ficha. */
export function chaveDoHolerite(r: ResultadoCalculo): string {
    const gozo = (r as ResultadoCalculo & { gozoId?: string }).gozoId;
    return gozo || r.fichaId;
}

/** Competência em que o processo é gravado: o mês do pagamento no 13º; a da tela nas férias e na rescisão. */
export function competenciaDoProcesso(tipo: TipoProcesso, competencia: string, ano: number, pagamento: string): string {
    if (tipo === '13-1a' || tipo === '13-2a') return /^\d{4}-(0[1-9]|1[0-2])$/.test(pagamento) && pagamento.startsWith(`${ano}-`) ? pagamento : `${ano}-${tipo === '13-1a' ? '11' : '12'}`;
    return competencia;
}

/** O que entra na gravação: os calculados e os incompletos; os com erro ficam de fora (como na folha do mês). */
export function paraGravar(resultados: ResultadoCalculo[]): { validos: ResultadoCalculo[]; totais: TotaisFolha; foraPorErro: string[] } {
    const validos = resultados.filter(r => r.situacao !== 'erro');
    return { validos, totais: totaisDaFolha(validos), foraPorErro: resultados.filter(r => r.situacao === 'erro').map(r => `${r.nome}: ${r.erros[0] ?? 'erro no cálculo'}`) };
}
