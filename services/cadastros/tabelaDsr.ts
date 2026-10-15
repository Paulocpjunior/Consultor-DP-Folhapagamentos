// services/cadastros/tabelaDsr.ts
//
// Tabela para D.S.R. do IOB SAGE (Arquivos › Tabelas › Tabela para D.S.R.), por empresa e ano: em cada mês, os
// dias úteis e os domingos e feriados que o motor usa no DSR sobre as horas extras (Lei 605/1949, art. 7º). O
// "Nº horas D.S.R." do SAGE não se digita: são os domingos e feriados × 220 h ÷ 30 (5 × 7,3333 = 36,67).
//
// A "Cópia padrão" monta o ano pelo calendário com os feriados nacionais (como o SAGE, que só traz os nacionais);
// feriados estaduais, municipais e pontos facultativos quem cadastra acerta mês a mês. Sem tabela da empresa no
// ano, o motor continua pelo calendário com os feriados locais informados no movimento.
//
// As duas opções do SAGE:
// - "Descontar faltas pelos dias do mês": a falta diária (e o DSR descontado) vale salário ÷ dias do mês (28 a
//   31), não ÷ 30;
// - "Descontar DSR quando existir lançamento de falta diária": o motor avisa quando há falta sem o DSR descontado
//   informado. A conta automática (quantos DSR a falta tira) espera um holerite do SAGE para conferir.
//
// Mês encerrado (Fim de mês) não se altera: reabra o mês primeiro, como no SAGE.

import { diaSemana, feriados, somarDias } from '../prazos/calendario';

export type Mes = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12';
export const MESES: Mes[] = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
export const NOME_MES: Record<Mes, string> = { '01': 'JAN', '02': 'FEV', '03': 'MAR', '04': 'ABR', '05': 'MAI', '06': 'JUN', '07': 'JUL', '08': 'AGO', '09': 'SET', '10': 'OUT', '11': 'NOV', '12': 'DEZ' };

/** Dias úteis (segunda a sábado) e de descanso (domingos e feriados) do mês. */
export interface MesDsr { uteis: number; descanso: number }

export interface TabelaDsr {
    id: string;
    empresaId: string;
    ano: string; // AAAA
    meses: Record<Mes, MesDsr>;
    /** Desconta a falta diária (e o DSR descontado) por salário ÷ dias do mês, não ÷ 30. */
    faltasPelosDiasDoMes: boolean;
    /** Falta diária sem o DSR descontado informado vira aviso no cálculo. */
    descontarDsrNaFalta: boolean;
    observacao: string;
}

export const idTabelaDsr = (empresaId: string, ano: string) => `${empresaId}_${ano}`;

export const diasNoMes = (ano: string, mes: Mes) => new Date(Date.UTC(Number(ano), Number(mes), 0)).getUTCDate();

/** Feriado nacional por lei (sem Carnaval e Sexta-feira Santa, que dependem de lei local). */
function feriadoNacional(d: string): boolean {
    const nome = feriados(Number(d.slice(0, 4))).get(d);
    return !!nome && !/Carnaval|Sexta-feira Santa/.test(nome);
}

/** Dias úteis e de descanso (domingos e feriados nacionais) de `de` a `ate`, pelo calendário. */
export function contarDiasDsr(de: string, ate: string): MesDsr {
    let uteis = 0; let descanso = 0;
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
        if (diaSemana(d) === 0 || feriadoNacional(d)) descanso++; else uteis++;
    }
    return { uteis, descanso };
}

const fimDoMes = (ano: string, mes: Mes) => `${ano}-${mes}-${String(diasNoMes(ano, mes)).padStart(2, '0')}`;

/** "Cópia padrão": o ano pelo calendário, com os feriados nacionais. */
export function tabelaDsrPadrao(empresaId: string, ano: string): TabelaDsr {
    const meses = Object.fromEntries(MESES.map(m => [m, contarDiasDsr(`${ano}-${m}-01`, fimDoMes(ano, m))])) as Record<Mes, MesDsr>;
    return { id: idTabelaDsr(empresaId, ano), empresaId, ano, meses, faltasPelosDiasDoMes: false, descontarDsrNaFalta: false, observacao: '' };
}

/** "Cópia entre empresas": a tabela de outra empresa (ou de outro ano com os mesmos meses) para esta. */
export const copiarTabelaDsr = (origem: TabelaDsr, empresaId: string): TabelaDsr => ({ ...origem, id: idTabelaDsr(empresaId, origem.ano), empresaId, meses: { ...origem.meses } });

/** Nº horas D.S.R. do SAGE: domingos e feriados × 220 h ÷ 30. */
export const horasDsr = (descanso: number, horasMes = 220) => Math.round(descanso * horasMes / 30 * 100) / 100;

export function validarTabelaDsr(t: TabelaDsr): string[] {
    const erros: string[] = [];
    if (!t.empresaId) erros.push('Escolha a empresa.');
    if (!/^\d{4}$/.test(t.ano) || Number(t.ano) < 2000 || Number(t.ano) > 2100) erros.push('Ano inválido (AAAA).');
    if (erros.length) return erros;
    for (const m of MESES) {
        const x = t.meses[m];
        const n = NOME_MES[m];
        if (!x || !Number.isInteger(x.uteis) || !Number.isInteger(x.descanso) || x.uteis < 1 || x.descanso < 0) { erros.push(`${n}: informe dias úteis e domingos/feriados (números inteiros).`); continue; }
        const total = diasNoMes(t.ano, m);
        if (x.uteis + x.descanso !== total) erros.push(`${n}: dias úteis (${x.uteis}) + domingos/feriados (${x.descanso}) devem somar os ${total} dias do mês.`);
    }
    return erros;
}

/** Meses em que esta tabela muda em relação à anterior (para travar os meses encerrados). */
export function mesesAlterados(antes: TabelaDsr | null, depois: TabelaDsr): Mes[] {
    const mudouOpcao = !!antes && (antes.faltasPelosDiasDoMes !== depois.faltasPelosDiasDoMes || antes.descontarDsrNaFalta !== depois.descontarDsrNaFalta);
    return MESES.filter(m => mudouOpcao || !antes || antes.meses[m]?.uteis !== depois.meses[m]?.uteis || antes.meses[m]?.descanso !== depois.meses[m]?.descanso);
}

/** Tabela da empresa no ano da competência (AAAA-MM), se houver. */
export function tabelaDsrDoAno(tabelas: TabelaDsr[] | undefined, competencia: string): TabelaDsr | null {
    return tabelas?.find(t => t.ano === competencia.slice(0, 4)) ?? null;
}

/** Dias do mês da competência pela tabela da empresa, se houver. */
export function mesDaTabelaDsr(tabelas: TabelaDsr[] | undefined, competencia: string): MesDsr | null {
    return tabelaDsrDoAno(tabelas, competencia)?.meses[competencia.slice(5, 7) as Mes] ?? null;
}

/** Diferenças entre a tabela e o calendário com os feriados nacionais (para a conferência na tela). */
export function diferencasDoCalendario(t: TabelaDsr): { mes: Mes; tabela: MesDsr; calendario: MesDsr }[] {
    const padrao = tabelaDsrPadrao(t.empresaId, t.ano);
    return MESES.filter(m => t.meses[m].uteis !== padrao.meses[m].uteis || t.meses[m].descanso !== padrao.meses[m].descanso)
        .map(m => ({ mes: m, tabela: t.meses[m], calendario: padrao.meses[m] }));
}
