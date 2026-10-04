// services/prazos/obrigacoes.ts
//
// Vencimentos do DP que valem para todas as empresas, por competência.
// Regras conferidas em 04/10/2026 (fontes na tela e no histórico):
// - S-1299 e DCTFWeb: dia 15 do mês seguinte; dia não útil POSTERGA para o
//   dia útil seguinte (IN RFB 2.162/2023; Manual do eSocial S-1.3).
// - DARF da DCTFWeb (contribuições previdenciárias e IRRF) e FGTS Digital:
//   dia 20 do mês seguinte; dia não útil ANTECIPA para o dia útil anterior
//   (Lei 8.212/1991 art. 30; Lei 11.196/2005 art. 70; Lei 8.036/1990 art. 15,
//   redação da Lei 14.438/2022).
// - Salário: 5º dia útil do mês seguinte (CLT art. 459, §1º).
// - 13º: 1ª parcela até 30/11 e 2ª até 20/12 (Lei 4.749/1965), antecipando
//   quando não há expediente; S-1299 anual e DARF do 13º até 20/12.

import { diaUtilAnterior, diaUtilSeguinte, feriado, quintoDiaUtilSalario, type Data } from './calendario';

export type Ajuste = 'antecipa' | 'posterga' | 'quinto-dia-util';
export interface Vencimento { id: string; competencia: string; nome: string; data: Data; original: Data; ajuste: Ajuste; base: string; observacao?: string }

const pad = (n: number) => String(n).padStart(2, '0');
export function proximaCompetencia(c: string): string {
    const [a, m] = c.split('-').map(Number);
    return m === 12 ? `${a + 1}-01` : `${a}-${pad(m + 1)}`;
}

function venc(id: string, competencia: string, nome: string, original: Data, ajuste: Ajuste, base: string, observacao?: string): Vencimento {
    const data = ajuste === 'antecipa' ? diaUtilAnterior(original) : ajuste === 'posterga' ? diaUtilSeguinte(original) : original;
    const motivo = data !== original ? (feriado(original) ?? 'fim de semana') : '';
    return { id: `${id}-${competencia}`, competencia, nome, data, original, ajuste, base, observacao: [observacao, motivo && `${original.split('-').reverse().join('/')}: ${motivo}`].filter(Boolean).join(' · ') || undefined };
}

/** Vencimentos referentes à competência AAAA-MM (a maioria cai no mês seguinte). */
export function vencimentosDaCompetencia(competencia: string): Vencimento[] {
    const [a, m] = competencia.split('-').map(Number);
    const seg = proximaCompetencia(competencia);
    const [as, ms] = seg.split('-').map(Number);
    const r: Vencimento[] = [
        venc('salario', competencia, 'Pagamento dos salários (5º dia útil)', quintoDiaUtilSalario(as, ms), 'quinto-dia-util', 'CLT art. 459, §1º', 'sábado conta como dia útil'),
        venc('s1299', competencia, 'eSocial: fechamento dos periódicos (S-1299)', `${seg}-15`, 'posterga', 'Manual do eSocial S-1.3; IN RFB 2.162/2023'),
        venc('dctfweb', competencia, 'DCTFWeb: transmissão', `${seg}-15`, 'posterga', 'IN RFB 2.162/2023'),
        venc('darf', competencia, 'DARF da DCTFWeb (INSS e IRRF)', `${seg}-20`, 'antecipa', 'Lei 8.212/1991 art. 30; Lei 11.196/2005 art. 70'),
        venc('fgts', competencia, 'FGTS Digital: guia mensal', `${seg}-20`, 'antecipa', 'Lei 8.036/1990 art. 15 (Lei 14.438/2022)'),
    ];
    if (m === 11) r.push(venc('13-1', competencia, '13º salário: 1ª parcela', `${a}-11-30`, 'antecipa', 'Lei 4.749/1965 art. 2º'));
    if (m === 12) {
        r.push(venc('13-2', competencia, '13º salário: 2ª parcela', `${a}-12-20`, 'antecipa', 'Lei 4.749/1965 art. 1º'));
        r.push(venc('s1299-anual', `${a}`, 'eSocial: fechamento anual do 13º (S-1299)', `${a}-12-20`, 'posterga', 'Manual do eSocial S-1.3', 'conferir a regra de dia não útil no manual vigente'));
        r.push(venc('darf-13', `${a}`, 'DARF do INSS sobre o 13º', `${a}-12-20`, 'antecipa', 'Lei 8.212/1991 art. 30'));
    }
    return r.sort((x, y) => x.data.localeCompare(y.data));
}

/** Vencimentos que caem entre duas datas (inclusive), olhando as competências que podem gerá-los. */
export function vencimentosNoPeriodo(de: Data, ate: Data): Vencimento[] {
    const [a, m] = de.split('-').map(Number);
    let c = m === 1 ? `${a - 1}-12` : `${a}-${pad(m - 1)}`;
    const r: Vencimento[] = [];
    while (c <= ate.slice(0, 7)) {
        r.push(...vencimentosDaCompetencia(c).filter(v => v.data >= de && v.data <= ate));
        c = proximaCompetencia(c);
    }
    return r.sort((x, y) => x.data.localeCompare(y.data));
}
