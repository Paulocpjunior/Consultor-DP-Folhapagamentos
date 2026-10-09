// services/calculo/movimentosDoBackup.ts
//
// Histórico da folha do FolhaWin (`holerith` do schema fNNNN: codfun, anomes,
// codeven, ref, valor, descricao) → movimento mensal do Consultor, só o que as
// médias e o direito a férias usam: horas extras 50% e 100%, faltas e DSR
// descontado. O que cada evento é vem da natureza da rubrica que o IOB mandou
// ao eSocial (eventos_esocial.codeven → rubesocial/codesocial →
// esocialdadosficha_s1010.natrubr) e, sem ela, da descrição:
//   1003 = horas extraordinárias (100% pela descrição; o resto, 50%);
//   9207 = faltas; 9211 = faltas e atrasos (só se a descrição falar em falta).
// DSR descontado: desconto com "DSR"/"repouso" e "falta" na descrição.
// A referência do IOB é a quantidade (horas ou dias). Nada é gravado aqui.

import type { TabelaLida } from '../cadastros/cargaBackupIob';
import { chaveCodfun, chaveColuna } from '../cadastros/cargaBackupIob';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { Movimento } from './motorMensal';
import { validarMovimento } from './movimento';

export const TABELAS_HISTORICO = ['holerith', 'eventos_esocial', 'esocialdadosficha_s1010'];

export type Classe = 'horasExtras50' | 'horasExtras100' | 'faltasDias' | 'dsrDescontadoDias' | 'atrasosHoras';
export const CAMPOS_HISTORICO: Classe[] = ['horasExtras50', 'horasExtras100', 'faltasDias', 'dsrDescontadoDias', 'atrasosHoras'];

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O que o evento é para o movimento, pela natureza da rubrica e pela descrição; null = não entra. */
export function classificarEvento(natRubr: string, descricao: string): Classe | null {
    const d = semAcento(descricao);
    const dsr = /\bdsr\b|d\.s\.r|repouso/.test(d);
    const falta = /falta/.test(d) && !/abon|justific/.test(d);
    if (dsr) return falta || natRubr === '9207' || natRubr === '9211' ? 'dsrDescontadoDias' : null;
    if (natRubr === '1003' || (!natRubr && /hora?s?\s*extra|\bh\.?\s*e\b|\bhe\b/.test(d))) {
        if (/reflexo|media|dsr|banco/.test(d)) return null;
        return /100/.test(d) ? 'horasExtras100' : 'horasExtras50';
    }
    // Falta junto com atraso, ou em horas ("(T/H)"): horas, não dias (salário-hora × horas no motor).
    if (natRubr === '9207') return /atras|t\/h|\bhoras?\b/.test(d) ? 'atrasosHoras' : 'faltasDias';
    if (natRubr === '9211' || !natRubr) return /atras|t\/h/.test(d) ? 'atrasosHoras' : falta ? 'faltasDias' : null;
    return null;
}

/** Natureza de uma vigência da rubrica (AAAA-MM; fim vazio = em aberto). */
export interface VigenciaNatureza { iniValid: string; fimValid: string; natRubr: string }
/** Por evento do IOB, as vigências da rubrica que ele mandou ao eSocial (S-1010). */
export type NaturezasEventos = Map<string, VigenciaNatureza[]>;

const mesDe = (v: string | null) => { const d = (v ?? '').replace(/\D/g, ''); return d.length >= 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}` : ''; };

/** Natureza (Tabela 03) de cada evento do IOB, por vigência da rubrica que ele mandou ao eSocial no S-1010. */
export function naturezasDosEventos(eventos: TabelaLida | null, s1010: TabelaLida | null): NaturezasEventos {
    const r: NaturezasEventos = new Map();
    if (!eventos || !s1010) return r;
    const i = (t: TabelaLida, n: string) => t.colunas.findIndex(c => chaveColuna(c) === n);
    const [iRub, iNat, iIni, iFim] = [i(s1010, 'codrubr'), i(s1010, 'natrubr'), i(s1010, 'inivalid'), i(s1010, 'fimvalid')];
    if (iRub < 0 || iNat < 0) return r;
    const nat = new Map<string, VigenciaNatureza[]>();
    for (const l of s1010.linhas) {
        const k = chaveCodfun(l[iRub]); const n = (l[iNat] ?? '').trim();
        if (!k || !/^\d{4}$/.test(n)) continue;
        nat.set(k, [...(nat.get(k) ?? []), { iniValid: iIni >= 0 ? mesDe(l[iIni]) : '', fimValid: iFim >= 0 ? mesDe(l[iFim]) : '', natRubr: n }]);
    }
    const [iEv, iRubEs, iCodEs] = [i(eventos, 'codeven'), i(eventos, 'rubesocial'), i(eventos, 'codesocial')];
    if (iEv < 0) return r;
    for (const l of eventos.linhas) {
        const ev = chaveCodfun(l[iEv]);
        const v = [iRubEs >= 0 ? l[iRubEs] : null, iCodEs >= 0 ? l[iCodEs] : null, l[iEv]].map(x => nat.get(chaveCodfun(x))).find(Boolean);
        if (ev && v) r.set(ev, v);
    }
    return r;
}

/** Natureza do evento na competência: a vigência de maior início até ela e sem fim antes dela. */
export function naturezaEm(n: NaturezasEventos, codeven: string, competencia: string): string {
    const v = (n.get(codeven) ?? []).filter(x => (!x.iniValid || x.iniValid <= competencia) && (!x.fimValid || x.fimValid >= competencia))
        .sort((a, b) => b.iniValid.localeCompare(a.iniValid))[0];
    return v?.natRubr ?? '';
}

/** "10,5", "10.50", "10:30" → horas/dias decimais. Com `sexagesimal`, 10,30 = 10h30. */
export function quantidade(v: string | null, sexagesimal = false): number {
    const t = (v ?? '').trim();
    if (!t) return 0;
    const m = t.match(/^(-?\d+)[:,.](\d{1,2})$/);
    if (m && (sexagesimal || t.includes(':'))) return Number(m[1]) + Number(m[2].padEnd(2, '0')) / 60;
    const n = Number(t.replace(/\./g, t.includes(',') ? '' : '.').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

const competenciaDe = (v: string | null) => { const d = (v ?? '').replace(/\D/g, ''); return /^\d{6}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4)}` : ''; };
const fimDoMes = (c: string) => { const [y, m] = c.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

export interface EventoResumo {
    codeven: string; descricao: string; natRubr: string;
    /** Classe usada (a manual, quando a equipe acertou; senão a automática). */
    classe: Classe | null;
    /** Classe pela natureza e descrição, sem a manual. */
    automatica: Classe | null;
    manual: boolean;
    linhas: number; total: number;
}
export interface MovimentoImportado { fichaId: string; competencia: string; movimento: Movimento }
export interface HistoricoDaFolha {
    movimentos: MovimentoImportado[];
    /** Eventos que entraram no movimento. */
    eventos: EventoResumo[];
    /** Todos os eventos do período, para a equipe ajustar a classificação. */
    todos: EventoResumo[];
    avisos: string[]; linhas: number;
}

/** Classificação acertada pela equipe para um evento do IOB (vale sobre a automática). */
export type ClasseManual = Classe | 'ignorar';

/**
 * Soma, por funcionário e competência, as quantidades dos eventos que entram
 * no movimento. Liga pelo código IOB, no vínculo em vigor na competência.
 */
export function movimentosDoHolerith(holerith: TabelaLida, naturezas: NaturezasEventos, fichas: FichaFuncionario[], opcoes: { desde?: string; sexagesimal?: boolean; eventos?: Record<string, ClasseManual> } = {}): HistoricoDaFolha {
    const r: HistoricoDaFolha = { movimentos: [], eventos: [], todos: [], avisos: [], linhas: 0 };
    const i = (n: string) => holerith.colunas.findIndex(c => chaveColuna(c) === n);
    const [iCod, iAno, iEv, iRef, iDesc] = ['codfun', 'anomes', 'codeven', 'ref', 'descricao'].map(i);
    if ([iCod, iAno, iEv, iRef].some(x => x < 0)) { r.avisos.push('holerith sem as colunas codfun, anomes, codeven e ref.'); return r; }
    const porCodigo = new Map<string, FichaFuncionario[]>();
    for (const f of fichas) { const k = f.dados.codigoIob ? chaveCodfun(f.dados.codigoIob) : ''; if (k) porCodigo.set(k, [...(porCodigo.get(k) ?? []), f]); }
    const resumo = new Map<string, EventoResumo>();
    const soma = new Map<string, MovimentoImportado>();
    let semFicha = 0; let faltaEmHoras = 0;
    for (const l of holerith.linhas) {
        const competencia = competenciaDe(l[iAno]);
        if (!competencia || (opcoes.desde && competencia < opcoes.desde)) continue;
        r.linhas++;
        const ev = chaveCodfun(l[iEv]);
        const descricao = iDesc >= 0 ? (l[iDesc] ?? '').trim() : '';
        const natRubr = naturezaEm(naturezas, ev, competencia);
        const manual = opcoes.eventos?.[ev];
        const automatica = classificarEvento(natRubr, descricao);
        const classe = manual ? (manual === 'ignorar' ? null : manual) : automatica;
        const q = Math.abs(quantidade(l[iRef], opcoes.sexagesimal && (classe === 'horasExtras50' || classe === 'horasExtras100' || classe === 'atrasosHoras')));
        const chaveResumo = `${ev}|${natRubr}`;
        const res = resumo.get(chaveResumo) ?? { codeven: ev, descricao, natRubr, classe, automatica, manual: !!manual, linhas: 0, total: 0 };
        res.linhas++; res.total += q; resumo.set(chaveResumo, res);
        if (!classe || !q) continue;
        // Falta em horas fica de fora; pela descrição só quando a classe não foi acertada pela equipe.
        if ((classe === 'faltasDias' || classe === 'dsrDescontadoDias') && (q > 31 || (!manual && /hora/.test(semAcento(descricao))))) { faltaEmHoras++; continue; }
        const vinculos = (porCodigo.get(chaveCodfun(l[iCod])) ?? []).filter(f =>
            (!f.dados.admissao || f.dados.admissao <= fimDoMes(competencia)) && (!f.dados.dataDesligamento || `${competencia}-01` <= f.dados.dataDesligamento));
        if (vinculos.length !== 1) { semFicha++; continue; }
        const chave = `${vinculos[0].id}_${competencia}`;
        const m = soma.get(chave) ?? { fichaId: vinculos[0].id, competencia, movimento: {} };
        m.movimento[classe] = Math.round(((m.movimento[classe] ?? 0) + q) * 10000) / 10000;
        soma.set(chave, m);
    }
    r.movimentos = [...soma.values()].sort((a, b) => a.fichaId.localeCompare(b.fichaId) || a.competencia.localeCompare(b.competencia));
    r.todos = [...resumo.values()].sort((a, b) => a.codeven.localeCompare(b.codeven, 'pt-BR', { numeric: true }) || a.natRubr.localeCompare(b.natRubr));
    r.eventos = r.todos.filter(e => e.classe);
    if (semFicha) r.avisos.push(`${semFicha} lançamento(s) de funcionário sem ficha (ou com mais de um vínculo) na competência: ficaram de fora.`);
    if (faltaEmHoras) r.avisos.push(`${faltaEmHoras} lançamento(s) de falta em horas: ficaram de fora (o movimento conta faltas em dias).`);
    return r;
}

export interface MesclaMovimento {
    fichaId: string; competencia: string; antes: Movimento | null; depois: Movimento; mudou: boolean; preservados: Classe[];
    /** A mesma validação do movimento digitado (limites do mês); com erro, não grava. */
    erros: string[];
}

const diasNoMes = (c: string) => { const [a, m] = c.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };

/** Só preenche o que o movimento gravado não tem; lançado com outro valor fica e é listado. */
export function mesclarMovimentos(importados: MovimentoImportado[], existentes: Record<string, Record<string, Movimento>>): MesclaMovimento[] {
    return importados.map(imp => {
        const antes = existentes[imp.fichaId]?.[imp.competencia] ?? null;
        const depois: Movimento = { ...(antes ?? {}) };
        const preservados: Classe[] = [];
        for (const k of CAMPOS_HISTORICO) {
            const v = imp.movimento[k];
            if (v === undefined) continue;
            const atual = antes?.[k];
            if (atual === undefined || atual === 0) depois[k] = v;
            else if (atual !== v) preservados.push(k);
        }
        const mudou = CAMPOS_HISTORICO.some(k => (antes?.[k] ?? 0) !== (depois[k] ?? 0));
        return { fichaId: imp.fichaId, competencia: imp.competencia, antes, depois, mudou, preservados, erros: mudou ? validarMovimento(depois, diasNoMes(imp.competencia)) : [] };
    });
}
