// services/prazos/obrigacoesEmpresa.ts
//
// Calendário de obrigações da folha POR EMPRESA e competência (etapa 5 dos
// ajustes do Paulo, 04/10/2026): FGTS, eSocial, DCTFWeb/DARF, EFD-Reinf,
// guias sindicais, 13º e as anuais. Parte dos vencimentos gerais
// (obrigacoes.ts) e acrescenta o que depende da empresa. Puro, sem Firebase.
//
// Regras acrescentadas aqui (fontes também na tela):
// - EFD-Reinf: dia 15 do mês seguinte; dia não útil POSTERGA (mesma régua do
//   catálogo de obrigações do CFI). Quem transmite é o fiscal; o DP acompanha
//   porque a folha alimenta os eventos de retenção.
// - Contribuição sindical dos empregados: desconto na folha de março e
//   recolhimento até 30/04 — só de quem autorizou prévia e expressamente
//   (CLT arts. 578, 579, 582 e 583, redação da Lei 13.467/2017).
// - Comprovante de rendimentos (ano anterior): até o último dia útil de
//   fevereiro (IN RFB 2.060/2021).
// - Guia sindical da convenção (assistencial/negocial): dia e meses vêm do
//   cadastro do sindicato; sem esses dados, não se inventa data.

import { diaUtilAnterior, diaUtilSeguinte, feriado, type Data } from './calendario';
import { proximaCompetencia, vencimentosDaCompetencia, type Ajuste, type Vencimento } from './obrigacoes';

export type Responsavel = 'DP' | 'Fiscal';
export type StatusObrigacao = 'pendente' | 'entregue' | 'nao-se-aplica';

export interface ObrigacaoEmpresa extends Vencimento {
    responsavel: Responsavel;
    /** Vale para toda empresa com empregados, ou só "se houver" (ex.: autorização, convenção). */
    condicao?: string;
}

/** Guia sindical da convenção, como cadastrada no sindicato. */
export interface GuiaSindical { sindicatoCnpj: string; sindicatoNome: string; dia: number; meses: number[] | 'todos'; descricao: string }

export interface MarcacaoObrigacao { status: Exclude<StatusObrigacao, 'pendente'>; atualizadoPorEmail?: string; atualizadoEm?: string; observacao?: string }

const pad = (n: number) => String(n).padStart(2, '0');
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

function venc(id: string, competencia: string, nome: string, original: Data, ajuste: Ajuste, base: string, observacao?: string): Vencimento {
    const data = ajuste === 'antecipa' ? diaUtilAnterior(original) : ajuste === 'posterga' ? diaUtilSeguinte(original) : original;
    const motivo = data !== original ? (feriado(original) ?? 'fim de semana') : '';
    return { id: `${id}-${competencia}`, competencia, nome, data, original, ajuste, base, observacao: [observacao, motivo && `${original.split('-').reverse().join('/')}: ${motivo}`].filter(Boolean).join(' · ') || undefined };
}

/** Lê "dia" e "meses" do cadastro do sindicato; sem dia válido, não há guia. */
export function guiaDoSindicato(s: { cnpj: string; nome: string; guiaDia?: string; guiaMeses?: string; guiaDescricao?: string }): GuiaSindical | null {
    const dia = Number(s.guiaDia);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) return null;
    const txt = (s.guiaMeses ?? '').trim().toLowerCase();
    let meses: number[] | 'todos' = 'todos';
    if (txt && txt !== 'todos') {
        const lista = [...new Set(txt.split(/[,;\s]+/).map(Number).filter(m => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b);
        if (!lista.length) return null;
        meses = lista;
    }
    return { sindicatoCnpj: s.cnpj, sindicatoNome: s.nome, dia, meses, descricao: (s.guiaDescricao ?? '').trim() || 'Contribuição da convenção coletiva' };
}

/**
 * Obrigações da competência AAAA-MM para uma empresa.
 * `guias`: as guias dos sindicatos dos empregados ativos da empresa.
 */
export function obrigacoesDaEmpresa(p: { competencia: string; temEmpregados: boolean; guias?: GuiaSindical[] }): ObrigacaoEmpresa[] {
    const { competencia } = p;
    const [a, m] = competencia.split('-').map(Number);
    const seg = proximaCompetencia(competencia);
    const [as, ms] = seg.split('-').map(Number);
    const semEmpregados = p.temEmpregados ? undefined : 'sem empregados ativos no cadastro: confira se há folha';

    const r: ObrigacaoEmpresa[] = vencimentosDaCompetencia(competencia).map(v => ({
        ...v, responsavel: 'DP' as const,
        // S-1299 e DCTFWeb valem mesmo sem movimento (com a indicação de "sem movimento").
        condicao: v.id.startsWith('s1299') || v.id.startsWith('dctfweb') ? undefined : semEmpregados,
    }));

    r.push({ ...venc('reinf', competencia, 'EFD-Reinf: fechamento do mês', `${seg}-15`, 'posterga', 'IN RFB 2.043/2021; catálogo de obrigações do CFI', 'transmitida pelo fiscal; a folha alimenta as retenções'), responsavel: 'Fiscal', condicao: 'se houver evento no mês' });

    if (m === 3) {
        r.push({ ...venc('sindical-anual', competencia, 'Contribuição sindical dos empregados: recolhimento (desconto na folha de março)', `${a}-04-30`, 'antecipa', 'CLT arts. 578, 579, 582 e 583 (Lei 13.467/2017)'), responsavel: 'DP', condicao: 'só de quem autorizou prévia e expressamente' });
    }
    if (m === 1) {
        r.push({ ...venc('informe-rendimentos', competencia, `Comprovante de rendimentos de ${a - 1} aos empregados`, `${a}-02-${pad(ultimoDia(a, 2))}`, 'antecipa', 'IN RFB 2.060/2021', 'último dia útil de fevereiro'), responsavel: 'DP', condicao: semEmpregados });
    }

    for (const g of p.guias ?? []) {
        if (g.meses !== 'todos' && !g.meses.includes(ms)) continue;
        const dia = Math.min(g.dia, ultimoDia(as, ms));
        r.push({
            ...venc(`guia-${g.sindicatoCnpj}`, competencia, `Guia sindical: ${g.descricao} — ${g.sindicatoNome}`, `${seg}-${pad(dia)}`, 'antecipa', 'Convenção coletiva (cadastro do sindicato)', 'dia e meses do cadastro do sindicato'),
            responsavel: 'DP',
        });
    }
    return r.sort((x, y) => x.data.localeCompare(y.data) || x.nome.localeCompare(y.nome));
}

/** Situação de cada obrigação na data de hoje, com o que foi marcado. */
export function situacao(o: ObrigacaoEmpresa, marcacao: MarcacaoObrigacao | undefined, hoje: Data): { status: StatusObrigacao; atrasada: boolean } {
    const status: StatusObrigacao = marcacao?.status ?? 'pendente';
    return { status, atrasada: status === 'pendente' && o.data < hoje };
}

/** Id da marcação no Firestore: empresa + obrigação + competência. */
export const idMarcacao = (empresaId: string, obrigacaoId: string) => `${empresaId}_${obrigacaoId}`;

/** Sindicatos dos empregados ativos da empresa (CNPJ da ficha). */
export function cnpjsSindicatosDaEmpresa(fichas: { empresaId: string; situacao?: string; dados?: { sindicato?: string } }[], empresaId: string): string[] {
    return [...new Set(fichas.filter(f => f.empresaId === empresaId && f.situacao !== 'desligado').map(f => (f.dados?.sindicato ?? '').replace(/\D/g, '')).filter(c => c.length === 14))];
}

export { proximaCompetencia };
