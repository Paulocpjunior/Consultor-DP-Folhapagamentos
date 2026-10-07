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

export const TABELAS_HISTORICO = ['holerith', 'eventos_esocial', 'esocialdadosficha_s1010'];

export type Classe = 'horasExtras50' | 'horasExtras100' | 'faltasDias' | 'dsrDescontadoDias';
export const CAMPOS_HISTORICO: Classe[] = ['horasExtras50', 'horasExtras100', 'faltasDias', 'dsrDescontadoDias'];

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
    if (natRubr === '9207') return 'faltasDias';
    if (natRubr === '9211' || !natRubr) return falta && !/atras/.test(d) ? 'faltasDias' : null;
    return null;
}

/** Natureza (Tabela 03) de cada evento do IOB, pela rubrica que ele mandou ao eSocial no S-1010. */
export function naturezasDosEventos(eventos: TabelaLida | null, s1010: TabelaLida | null): Map<string, string> {
    const r = new Map<string, string>();
    if (!eventos || !s1010) return r;
    const i = (t: TabelaLida, n: string) => t.colunas.findIndex(c => chaveColuna(c) === n);
    const [iRub, iNat] = [i(s1010, 'codrubr'), i(s1010, 'natrubr')];
    if (iRub < 0 || iNat < 0) return r;
    const nat = new Map<string, string>();
    for (const l of s1010.linhas) {
        const k = chaveCodfun(l[iRub]); const n = (l[iNat] ?? '').trim();
        if (k && /^\d{4}$/.test(n)) nat.set(k, n);
    }
    const [iEv, iRubEs, iCodEs] = [i(eventos, 'codeven'), i(eventos, 'rubesocial'), i(eventos, 'codesocial')];
    if (iEv < 0) return r;
    for (const l of eventos.linhas) {
        const ev = chaveCodfun(l[iEv]);
        const n = [iRubEs >= 0 ? l[iRubEs] : null, iCodEs >= 0 ? l[iCodEs] : null, l[iEv]].map(x => nat.get(chaveCodfun(x))).find(Boolean);
        if (ev && n) r.set(ev, n);
    }
    return r;
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

export interface EventoResumo { codeven: string; descricao: string; natRubr: string; classe: Classe | null; linhas: number; total: number }
export interface MovimentoImportado { fichaId: string; competencia: string; movimento: Movimento }
export interface HistoricoDaFolha { movimentos: MovimentoImportado[]; eventos: EventoResumo[]; avisos: string[]; linhas: number }

/**
 * Soma, por funcionário e competência, as quantidades dos eventos que entram
 * no movimento. Liga pelo código IOB, no vínculo em vigor na competência.
 */
export function movimentosDoHolerith(holerith: TabelaLida, naturezas: Map<string, string>, fichas: FichaFuncionario[], opcoes: { desde?: string; sexagesimal?: boolean } = {}): HistoricoDaFolha {
    const r: HistoricoDaFolha = { movimentos: [], eventos: [], avisos: [], linhas: 0 };
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
        const natRubr = naturezas.get(ev) ?? '';
        const classe = classificarEvento(natRubr, descricao);
        const q = Math.abs(quantidade(l[iRef], opcoes.sexagesimal && (classe === 'horasExtras50' || classe === 'horasExtras100')));
        const res = resumo.get(ev) ?? { codeven: ev, descricao, natRubr, classe, linhas: 0, total: 0 };
        res.linhas++; res.total += q; resumo.set(ev, res);
        if (!classe || !q) continue;
        if ((classe === 'faltasDias' || classe === 'dsrDescontadoDias') && (q > 31 || /hora/.test(semAcento(descricao)))) { faltaEmHoras++; continue; }
        const vinculos = (porCodigo.get(chaveCodfun(l[iCod])) ?? []).filter(f =>
            (!f.dados.admissao || f.dados.admissao <= fimDoMes(competencia)) && (!f.dados.dataDesligamento || `${competencia}-01` <= f.dados.dataDesligamento));
        if (vinculos.length !== 1) { semFicha++; continue; }
        const chave = `${vinculos[0].id}_${competencia}`;
        const m = soma.get(chave) ?? { fichaId: vinculos[0].id, competencia, movimento: {} };
        m.movimento[classe] = Math.round(((m.movimento[classe] ?? 0) + q) * 100) / 100;
        soma.set(chave, m);
    }
    r.movimentos = [...soma.values()].sort((a, b) => a.fichaId.localeCompare(b.fichaId) || a.competencia.localeCompare(b.competencia));
    r.eventos = [...resumo.values()].filter(e => e.classe).sort((a, b) => a.codeven.localeCompare(b.codeven));
    if (semFicha) r.avisos.push(`${semFicha} lançamento(s) de funcionário sem ficha (ou com mais de um vínculo) na competência: ficaram de fora.`);
    if (faltaEmHoras) r.avisos.push(`${faltaEmHoras} lançamento(s) de falta em horas: ficaram de fora (o movimento conta faltas em dias).`);
    return r;
}

export interface MesclaMovimento { fichaId: string; competencia: string; antes: Movimento | null; depois: Movimento; mudou: boolean; preservados: Classe[] }

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
        return { fichaId: imp.fichaId, competencia: imp.competencia, antes, depois, mudou, preservados };
    });
}
