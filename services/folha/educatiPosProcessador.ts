// services/folha/educatiPosProcessador.ts
//
// Pós-processador específico para clientes com fórmula de hora-aula por
// funcionário (atualmente: EDUCATI).
//
// Aplica `valor = horas × valor-hora-aula[matricula]` aos lançamentos dos
// eventos listados em EVENTOS_COM_VALOR_HORA_AULA, convertendo de
// Referência (horas) para Valor (R$). Lançamentos de outros eventos passam
// batido sem alteração.
//
// Eventos cobertos:
//   - 0033 HORA AULA       (tipo V — vencimento)
//   - 8920 FALTAS          (tipo D — desconto)
// Ambos compartilham a mesma tabela: cada professor tem seu valor-hora
// próprio, e tanto a aula dada quanto a aula faltada são calculadas pelo
// mesmo R$/h.
//
// Roda DEPOIS do `parsearTemplatePadrao` e ANTES de exibir/exportar.
// O `ApontamentoFolhaPanel` busca a tabela `valoresHoraAula` do mapeamento
// em `folha_mapeamentos/<CNPJ>` — se não houver tabela, este módulo nem é
// invocado.

import type { Lancamento } from './folhaTypes';

/** Código do evento HORA AULA no catálogo IOB SAGE. */
export const EVENTO_HORA_AULA = '0033';

/** Código do evento FALTAS no catálogo IOB SAGE. */
export const EVENTO_FALTAS = '8920';

/**
 * Eventos cujos lançamentos a fórmula horas × valor-hora-aula deve
 * processar. Convertidos de rv=R (horas) para rv=V (R$).
 */
export const EVENTOS_COM_VALOR_HORA_AULA: ReadonlyArray<string> = [
    EVENTO_HORA_AULA,
    EVENTO_FALTAS,
];

export interface ResultadoPosProcessamentoHoraAula {
    lancamentos: Lancamento[];
    alertas: string[];
    /** Quantidade de lançamentos efetivamente convertidos. */
    totalConvertidos: number;
    /** Quantidade de lançamentos mantidos em horas (matrícula fora da tabela). */
    totalMantidos: number;
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function fmtBRL(n: number): string {
    return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

/** Marcador determinístico anexado à OBS pelo pós-processador. */
const MARCADOR_CONVERTIDO = 'valor-hora-aula';

/**
 * Aplica a fórmula `valor = horas × valor-hora-aula[matricula]` em todos
 * os lançamentos dos eventos listados em EVENTOS_COM_VALOR_HORA_AULA
 * (atualmente: 0033 HORA AULA e 8920 FALTAS).
 *
 * - Lançamentos com matrícula presente na tabela: convertidos para rv='V'
 *   com valor em R$. Uma observação é anexada com o detalhamento do cálculo.
 *   O `tipo` (V/D) do lançamento NÃO é alterado — o pós-processador respeita
 *   o que veio do parser (HORA AULA continua vencimento, FALTAS continua
 *   desconto).
 * - Lançamentos com matrícula ausente da tabela: mantidos como vieram
 *   e geram um alerta para revisão.
 * - Lançamentos de outros eventos: devolvidos sem alteração.
 *
 * Idempotência baseada na OBS: o pós-processador anexa um marcador
 * `valor-hora-aula R$ ... × ...h = R$ ...` ao convertir. Ao rodar de novo,
 * lançamentos cuja OBS já contém esse marcador são pulados.
 *
 * Importante: NÃO podemos usar `rv === 'V'` como guarda de idempotência
 * porque o templatePadraoParser força o `rv` para o do catálogo IOB
 * mesmo quando o XLSX envia em horas (caso do 8920 FALTAS, que tem
 * rv=V no catálogo mas a planilha EDUCATI envia em horas).
 */
export function aplicarValorHoraAulaEducati(
    lancamentos: Lancamento[],
    valoresHoraAula: Record<string, number>,
): ResultadoPosProcessamentoHoraAula {
    const alertas: string[] = [];
    let totalConvertidos = 0;
    let totalMantidos = 0;

    const out = lancamentos.map((l) => {
        if (!EVENTOS_COM_VALOR_HORA_AULA.includes(l.evento)) return l;
        if ((l.obs ?? '').includes(MARCADOR_CONVERTIDO)) return l; // já convertido

        const matricula = (l.matricula ?? '').trim();
        const valorHora = matricula ? valoresHoraAula[matricula] : undefined;

        if (valorHora === undefined || !Number.isFinite(valorHora) || valorHora <= 0) {
            totalMantidos++;
            alertas.push(
                `EDUCATI: funcionário ${matricula || '(sem matrícula)'} ("${l.funcionario}") ` +
                `não tem valor-hora-aula cadastrado. Lançamento ${l.evento} ${l.descricao_evento} ` +
                `mantido em horas (${l.valor}). Adicione a matrícula em valoresHoraAula ` +
                `no mapeamento para aplicar a fórmula.`,
            );
            return l;
        }

        const horas = l.valor;
        if (typeof horas !== 'number' || !Number.isFinite(horas) || horas <= 0) {
            totalMantidos++;
            alertas.push(
                `EDUCATI: ${l.coluna} — referência inválida (${horas}) ` +
                `para matrícula ${matricula} no evento ${l.evento}. Sem conversão.`,
            );
            return l;
        }

        const valorReais = round2(horas * valorHora);
        const detalhe =
            `valor-hora-aula ${fmtBRL(valorHora)} × ${horas}h = ${fmtBRL(valorReais)}`;
        totalConvertidos++;

        return {
            ...l,
            rv: 'V' as const,
            valor: valorReais,
            obs: l.obs ? `${l.obs} · ${detalhe}` : detalhe,
        };
    });

    if (totalConvertidos > 0) {
        alertas.unshift(
            `EDUCATI: ${totalConvertidos} lançamento(s) (${EVENTOS_COM_VALOR_HORA_AULA.join(', ')}) ` +
            `convertido(s) de horas para R$ usando a tabela valoresHoraAula do mapeamento.`,
        );
    }

    return { lancamentos: out, alertas, totalConvertidos, totalMantidos };
}
