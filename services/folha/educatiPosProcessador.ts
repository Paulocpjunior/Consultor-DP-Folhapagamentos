// services/folha/educatiPosProcessador.ts
//
// Pós-processador específico para clientes com fórmula de hora-aula por
// funcionário (atualmente: EDUCATI).
//
// Aplica `valor = horas × valor-hora-aula[matricula]` aos lançamentos do
// evento 0033 HORA AULA, convertendo de Referência (horas) para Valor (R$).
// Lançamentos de outros eventos passam batido sem alteração.
//
// Roda DEPOIS do `parsearTemplatePadrao` e ANTES de exibir/exportar.
// O `ApontamentoFolhaPanel` busca a tabela `valoresHoraAula` do mapeamento
// em `folha_mapeamentos/<CNPJ>` — se não houver tabela, este módulo nem é
// invocado.

import type { Lancamento } from './folhaTypes';

/** Código do evento HORA AULA no catálogo IOB SAGE. */
export const EVENTO_HORA_AULA = '0033';

export interface ResultadoPosProcessamentoHoraAula {
    lancamentos: Lancamento[];
    alertas: string[];
    /** Quantidade de lançamentos 0033 efetivamente convertidos. */
    totalConvertidos: number;
    /** Quantidade de lançamentos 0033 mantidos em horas (matrícula fora da tabela). */
    totalMantidos: number;
}

function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

function fmtBRL(n: number): string {
    return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

/**
 * Aplica a fórmula `valor = horas × valor-hora-aula[matricula]` em todos
 * os lançamentos do evento 0033 (HORA AULA).
 *
 * - Lançamentos com matrícula presente na tabela: convertidos para rv='V'
 *   com valor em R$. Uma observação é anexada com o detalhamento do cálculo.
 * - Lançamentos com matrícula ausente da tabela: mantidos como vieram
 *   (rv='R', horas) e geram um alerta para revisão.
 * - Lançamentos de outros eventos: devolvidos sem alteração.
 *
 * Idempotente: se um lançamento já estiver com rv='V', não é re-convertido.
 */
export function aplicarValorHoraAulaEducati(
    lancamentos: Lancamento[],
    valoresHoraAula: Record<string, number>,
): ResultadoPosProcessamentoHoraAula {
    const alertas: string[] = [];
    let totalConvertidos = 0;
    let totalMantidos = 0;

    const out = lancamentos.map((l) => {
        if (l.evento !== EVENTO_HORA_AULA) return l;
        if (l.rv === 'V') return l; // já está em R$, não re-converte

        const matricula = (l.matricula ?? '').trim();
        const valorHora = matricula ? valoresHoraAula[matricula] : undefined;

        if (valorHora === undefined || !Number.isFinite(valorHora) || valorHora <= 0) {
            totalMantidos++;
            alertas.push(
                `EDUCATI: funcionário ${matricula || '(sem matrícula)'} ("${l.funcionario}") ` +
                `não tem valor-hora-aula cadastrado. Lançamento 0033 mantido em horas (${l.valor}). ` +
                `Adicione a matrícula em valoresHoraAula no mapeamento para aplicar a fórmula.`,
            );
            return l;
        }

        const horas = l.valor;
        if (typeof horas !== 'number' || !Number.isFinite(horas) || horas <= 0) {
            totalMantidos++;
            alertas.push(
                `EDUCATI: ${l.coluna} — referência de hora-aula inválida (${horas}) ` +
                `para matrícula ${matricula}. Sem conversão.`,
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
            `EDUCATI: ${totalConvertidos} lançamento(s) de HORA AULA (0033) convertido(s) ` +
            `de horas para R$ usando a tabela valoresHoraAula do mapeamento.`,
        );
    }

    return { lancamentos: out, alertas, totalConvertidos, totalMantidos };
}
