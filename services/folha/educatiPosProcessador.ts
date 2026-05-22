// services/folha/educatiPosProcessador.ts
//
// Pós-processador específico para clientes com fórmula de hora-aula por
// funcionário (atualmente: EDUCATI).
//
// Aplica `valor = horas × valor-hora-aula[matricula] × coeficiente` aos
// lançamentos dos eventos listados em FORMULAS_POR_EVENTO, convertendo de
// Referência (horas/aulas) para Valor (R$). Lançamentos de outros eventos
// passam batido sem alteração.
//
// Eventos cobertos e fórmula (SIMPROSP — Sindicato dos Professores SP):
//   - 0033 HORA AULA  (tipo V): aulas_semanais × valor × 4,5 semanas/mês
//     Ex.: 20 aulas/sem × R$ 34,35 × 4,5 = R$ 3.091,50
//   - 8920 FALTAS     (tipo D): horas_faltadas × valor (sem multiplicar)
//     Ex.: 4h faltadas × R$ 34,35 = R$ 137,40
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
 * Coeficiente de média de semanas no mês — usado pela CLT/SIMPROSP para
 * converter aulas semanais em salário mensal.
 */
export const SEMANAS_MES = 4.5;

interface FormulaEvento {
    /** Multiplicador adicional (1 = direto; 4,5 = aulas semanais × 4,5 semanas/mês). */
    coeficiente: number;
    /** Unidade da referência da planilha (ex.: "aulas/sem", "h"). */
    unidadeRef: string;
}

/**
 * Fórmula por evento. Eventos não listados aqui passam batido.
 *
 * O `coeficiente` é multiplicado em cima de `horas × valor-hora-aula`:
 *   - 0033 HORA AULA: planilha manda "20" = aulas semanais → ×34,35×4,5 = R$ 3.091,50
 *   - 8920 FALTAS:    planilha manda "4"  = horas do mês  → ×34,35×1   = R$ 137,40
 */
const FORMULAS_POR_EVENTO: Record<string, FormulaEvento> = {
    [EVENTO_HORA_AULA]: { coeficiente: SEMANAS_MES, unidadeRef: 'aulas/sem' },
    [EVENTO_FALTAS]:    { coeficiente: 1,           unidadeRef: 'h'         },
};

/**
 * Eventos cujos lançamentos a fórmula horas × valor-hora-aula deve
 * processar. Convertidos de rv=R (horas/aulas) para rv=V (R$).
 */
export const EVENTOS_COM_VALOR_HORA_AULA: ReadonlyArray<string> =
    Object.keys(FORMULAS_POR_EVENTO);

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
 * Aplica a fórmula `valor = horas × valor-hora-aula[matricula] × coeficiente`
 * em todos os lançamentos dos eventos listados em FORMULAS_POR_EVENTO
 * (atualmente: 0033 HORA AULA com coef=4,5 e 8920 FALTAS com coef=1).
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
 * `valor-hora-aula R$ ... × ... = R$ ...` ao convertir. Ao rodar de novo,
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
        const formula = FORMULAS_POR_EVENTO[l.evento];
        if (!formula) return l;
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

        const referencia = l.valor;
        if (typeof referencia !== 'number' || !Number.isFinite(referencia) || referencia <= 0) {
            totalMantidos++;
            alertas.push(
                `EDUCATI: ${l.coluna} — referência inválida (${referencia}) ` +
                `para matrícula ${matricula} no evento ${l.evento}. Sem conversão.`,
            );
            return l;
        }

        const valorReais = round2(referencia * valorHora * formula.coeficiente);
        const detalhe = formula.coeficiente === 1
            ? `valor-hora-aula ${fmtBRL(valorHora)} × ${referencia}${formula.unidadeRef} = ${fmtBRL(valorReais)}`
            : `valor-hora-aula ${fmtBRL(valorHora)} × ${referencia} ${formula.unidadeRef} × ${formula.coeficiente} = ${fmtBRL(valorReais)}`;
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
            `convertido(s) de referência para R$ usando a tabela valoresHoraAula do mapeamento ` +
            `(0033 × ${SEMANAS_MES} semanas/mês; 8920 direto).`,
        );
    }

    return { lancamentos: out, alertas, totalConvertidos, totalMantidos };
}
