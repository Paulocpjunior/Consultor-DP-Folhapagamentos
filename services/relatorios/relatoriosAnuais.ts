// services/relatorios/relatoriosAnuais.ts
//
// Relatórios R3 da Central (parte pura):
// - Ficha financeira: o ano do funcionário mês a mês e verba a verba, pelas folhas GRAVADAS (as que valem),
//   com totais, bases e FGTS — como a Ficha Financeira do SAGE (Relatórios › Funcionários). Os meses sem folha gravada
//   vêm do histórico de holerites do SAGE (historico_sage, gravado na restauração do backup), quando houver.
// - Aviso de férias (CLT, art. 135): comunicado ao empregado com 30 dias de antecedência, pelos gozos lançados
//   em Cadastros › Afastamentos (motivo 15).

import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import { mesesDoHistorico, type HistoricoSageAno, type LinhaHistoricoSage } from './historicoSage';

export const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export interface FolhaDoMes { competencia: string; holerites: ResultadoCalculo[] }
export interface LinhaFicha {
    codigo: string; descricao: string; tipo: 'provento' | 'desconto' | 'total' | 'base'; meses: (number | null)[]; total: number;
    /** Evento do SAGE (meses sem folha gravada no Consultor). */
    sage?: boolean;
}
export interface FichaFinanceira {
    fichaId: string; nome: string; linhas: LinhaFicha[]; mesesComFolha: number[];
    /** Meses (0 a 11) que vieram do histórico do SAGE: a folha gravada no Consultor, quando existe, vale sobre ele. */
    mesesSage: number[];
}

const soma = (v: (number | null)[]) => v.reduce<number>((s, x) => s + (x ?? 0), 0);

/**
 * Ficha financeira de cada funcionário que aparece nas folhas gravadas do ano ou no histórico do SAGE. No mesmo mês,
 * a folha gravada no Consultor vale; o SAGE só preenche os meses sem ela.
 */
export function fichasFinanceiras(ano: string, folhas: FolhaDoMes[], filtroFichaId?: string, historico: HistoricoSageAno[] = []): FichaFinanceira[] {
    const doAno = folhas.filter(f => f.competencia.startsWith(`${ano}-`));
    const porFicha = new Map<string, { nome: string; porMes: Map<number, ResultadoCalculo>; sage: LinhaHistoricoSage[] }>();
    for (const f of doAno) {
        const m = Number(f.competencia.slice(5, 7)) - 1;
        for (const r of f.holerites) {
            if (r.situacao === 'erro' || (filtroFichaId && r.fichaId !== filtroFichaId)) continue;
            const x = porFicha.get(r.fichaId) ?? { nome: r.nome, porMes: new Map(), sage: [] };
            x.porMes.set(m, r); x.nome = r.nome || x.nome;
            porFicha.set(r.fichaId, x);
        }
    }
    for (const h of historico) {
        if (h.ano !== ano || (filtroFichaId && h.fichaId !== filtroFichaId)) continue;
        const x = porFicha.get(h.fichaId) ?? { nome: h.nome, porMes: new Map(), sage: [] };
        x.sage.push(...h.linhas);
        porFicha.set(h.fichaId, x);
    }
    const out: FichaFinanceira[] = [];
    for (const [fichaId, { nome, porMes, sage }] of porFicha) {
        const verbas = new Map<string, LinhaFicha>();
        for (const [m, r] of porMes) {
            for (const v of r.verbas) {
                const k = `${v.tipo}|${v.codigo}`;
                const l = verbas.get(k) ?? { codigo: v.codigo, descricao: v.descricao, tipo: v.tipo, meses: Array(12).fill(null), total: 0 };
                l.meses[m] = (l.meses[m] ?? 0) + v.valor;
                verbas.set(k, l);
            }
        }
        const mesesSage = mesesDoHistorico({ linhas: sage }).filter(m => !porMes.has(m));
        const doSage = (l: LinhaHistoricoSage) => l.meses.map((v, m) => (mesesSage.includes(m) ? v : null));
        const somaSage = (tipo: LinhaHistoricoSage['tipo'], m: number) => sage.filter(l => l.tipo === tipo).reduce((s, l) => s + (l.meses[m] ?? 0), 0);
        const linhasSage = new Map<string, LinhaFicha>();
        for (const l of sage) {
            const meses = doSage(l);
            if (meses.every(v => v === null)) continue;
            const tipo = l.tipo === 'informativo' ? 'base' : l.tipo;
            const k = `${tipo}|${l.codigo}`;
            const x = linhasSage.get(k) ?? { codigo: l.codigo, descricao: l.descricao, tipo, meses: Array(12).fill(null), total: 0, sage: true };
            meses.forEach((v, m) => { if (v !== null) x.meses[m] = (x.meses[m] ?? 0) + v; });
            linhasSage.set(k, x);
        }
        const ordenar = (lista: Iterable<LinhaFicha>, t: LinhaFicha['tipo']) => [...lista].filter(l => l.tipo === t).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));
        const porMesDe = (f: (r: ResultadoCalculo) => number, s?: (m: number) => number) =>
            Array.from({ length: 12 }, (_, m) => (porMes.has(m) ? f(porMes.get(m)!) : s && mesesSage.includes(m) ? s(m) : null));
        const linha = (codigo: string, descricao: string, tipo: LinhaFicha['tipo'], meses: (number | null)[]): LinhaFicha => ({ codigo, descricao, tipo, meses, total: soma(meses) });
        const linhas = [
            ...ordenar(verbas.values(), 'provento'), ...ordenar(linhasSage.values(), 'provento'),
            ...ordenar(verbas.values(), 'desconto'), ...ordenar(linhasSage.values(), 'desconto'),
            linha('', 'Total de proventos', 'total', porMesDe(r => r.totais.proventos, m => somaSage('provento', m))),
            linha('', 'Total de descontos', 'total', porMesDe(r => r.totais.descontos, m => somaSage('desconto', m))),
            linha('', 'Líquido', 'total', porMesDe(r => r.totais.liquido, m => somaSage('provento', m) - somaSage('desconto', m))),
            linha('', 'Base do INSS', 'base', porMesDe(r => r.bases.inss)),
            linha('', 'Base do IRRF', 'base', porMesDe(r => r.bases.irrf)),
            linha('', 'Base do FGTS', 'base', porMesDe(r => r.bases.fgts)),
            linha('', 'FGTS do mês', 'base', porMesDe(r => r.fgts)),
            ...ordenar(linhasSage.values(), 'base'),
        ].map(l => ({ ...l, total: soma(l.meses) }));
        out.push({ fichaId, nome, linhas, mesesComFolha: [...porMes.keys()].sort((a, b) => a - b), mesesSage });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Meses do ano (até a competência) sem folha gravada nem histórico do SAGE. */
export function mesesSemFolha(ano: string, folhas: FolhaDoMes[], ateCompetencia: string, historico: HistoricoSageAno[] = []): string[] {
    const ate = ateCompetencia.startsWith(`${ano}-`) ? Number(ateCompetencia.slice(5, 7)) : 12;
    const com = new Set(folhas.filter(f => f.competencia.startsWith(`${ano}-`) && f.holerites.length).map(f => Number(f.competencia.slice(5, 7))));
    for (const h of historico) if (h.ano === ano) for (const m of mesesDoHistorico(h)) com.add(m + 1);
    return Array.from({ length: ate }, (_, i) => i + 1).filter(m => !com.has(m)).map(m => MESES_CURTOS[m - 1]);
}

// ─── Aviso de férias ────────────────────────────────────────────────────────

export interface AvisoFerias {
    fichaId: string; nome: string; cargo: string; ctps: string; matricula: string;
    perAquisInicio: string; perAquisFim: string; inicio: string; fim: string; dias: number; retorno: string;
    abonoDias: number; dataAviso: string; avisoForaDoPrazo: boolean;
}

const somarDias = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toLocaleDateString('sv-SE'); };
const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
const mesSeguinte = (c: string) => { const [a, m] = c.split('-').map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`; };

/**
 * Avisos dos gozos que começam na competência ou no mês seguinte. A data do aviso é 30 dias antes do início
 * (art. 135); se esse dia já passou, vale hoje e a tela avisa que o prazo não foi cumprido.
 */
export function avisosDeFerias(competencia: string, hoje: string, fichas: FichaFuncionario[], afastamentos: Afastamento[]): AvisoFerias[] {
    const meses = [competencia, mesSeguinte(competencia)];
    const porId = new Map(fichas.map(f => [f.id, f]));
    return afastamentos.filter(a => a.motivo === '15' && a.dtInicio && meses.includes(a.dtInicio.slice(0, 7)) && porId.has(a.fichaId))
        .map(a => {
            const f = porId.get(a.fichaId)!;
            const fim = a.dtFim || a.dtInicio;
            const prazo = somarDias(a.dtInicio, -30);
            const d = f.dados;
            return {
                fichaId: f.id, nome: d.nome || f.cpf, cargo: d.cargo ?? '', matricula: f.matriculaEsocial,
                ctps: [d.ctps, d.serieCtps && `série ${d.serieCtps}`, d.ufCtps].filter(Boolean).join(' ') || 'digital',
                perAquisInicio: a.perAquisInicio, perAquisFim: a.perAquisFim, inicio: a.dtInicio, fim, dias: diasEntre(a.dtInicio, fim) + 1,
                retorno: somarDias(fim, 1), abonoDias: Number(a.abonoDias || 0), dataAviso: prazo < hoje ? hoje : prazo, avisoForaDoPrazo: prazo < hoje,
            };
        })
        .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
