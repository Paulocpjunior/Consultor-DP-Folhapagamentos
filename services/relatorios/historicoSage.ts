// services/relatorios/historicoSage.ts
//
// Ficha financeira dos anos anteriores ao Consultor, pelo histórico de holerites do SAGE (`holerith` do schema
// fNNNN no Backup SQL: codfun, anomes, codeven, valor, vl_ven, vl_des, descricao). Vira, por funcionário e ano,
// as linhas da ficha (evento × mês, em centavos), gravadas em historico_sage/{fichaId}_{AAAA}. Nada é gravado aqui.
//
// Provento, desconto ou informativo (bases, FGTS), nesta ordem:
//   1. o tipo da rubrica que o IOB mandou ao eSocial (S-1010 tpRubr: 1 vencimento, 2 desconto, 3 e 4 informativa);
//   2. a coluna do valor no holerith (vl_ven = vencimento, vl_des = desconto), quando só uma está preenchida;
//   3. a natureza da rubrica (Tabela 03: 99xx informativa, 9xxx desconto, as outras vencimento);
//   4. a descrição (INSS, IRRF, faltas, adiantamento, vale, contribuição, pensão… = desconto; base, FGTS = informativo).
// Totais e líquido do próprio holerith ("TOTAL…", "LÍQUIDO…") ficam de fora: a ficha soma de novo.

import type { TabelaLida } from '../cadastros/cargaBackupIob';
import { chaveCodfun, chaveColuna } from '../cadastros/cargaBackupIob';
import type { FichaFuncionario } from '../cadastros/funcionarios';
import { competenciaDe, fichasPorCodigoIob, quantidade, vigenciaEm, vinculosEm, type NaturezasEventos } from '../calculo/movimentosDoBackup';

export type TipoHistorico = 'provento' | 'desconto' | 'informativo';
export interface LinhaHistoricoSage { codigo: string; descricao: string; tipo: TipoHistorico; meses: (number | null)[] }
/** Um funcionário num ano: historico_sage/{fichaId}_{ano}. */
export interface HistoricoSageAno { empresaId: string; fichaId: string; ano: string; nome: string; linhas: LinhaHistoricoSage[] }
export interface ResultadoHistoricoSage {
    anos: HistoricoSageAno[];
    linhas: number; semFicha: number; avisos: string[];
    /** Quantos lançamentos vieram de cada finalidade do holerith (coluna `final`), para conferir com o SAGE. */
    finalidades: Record<string, number>;
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Total ou líquido calculado pelo próprio SAGE: a ficha refaz a soma. */
export const ehTotalizador = (descricao: string) => /^\s*(total|tot\.|liquido|liq\.)/.test(semAcento(descricao));

/** Tipo do lançamento (ver o cabeçalho). */
export function tipoDoLancamento(x: { tpRubr?: string; vlVen?: number; vlDes?: number; natRubr?: string; descricao: string }): TipoHistorico {
    if (x.tpRubr === '1') return 'provento';
    if (x.tpRubr === '2') return 'desconto';
    if (x.tpRubr === '3' || x.tpRubr === '4') return 'informativo';
    const ven = Math.abs(x.vlVen ?? 0); const des = Math.abs(x.vlDes ?? 0);
    if (ven && !des) return 'provento';
    if (des && !ven) return 'desconto';
    const n = x.natRubr ?? '';
    if (/^99\d\d$/.test(n)) return 'informativo';
    if (/^9\d{3}$/.test(n)) return 'desconto';
    if (/^\d{4}$/.test(n)) return 'provento';
    const d = semAcento(x.descricao);
    if (/\bbase\b|\bbc\b|\bfgts\b|deposito|salario.contribuicao|sal\.?\s*contr/.test(d)) return 'informativo';
    if (/\binss\b|\birrf?\b|imposto|contrib|\bdesc(onto|ontos)?\b|falta|atraso|adiant|\bvale\b|\bv\.?t\b|pens|emprest|consign|coparticip|mensalidade|\bdsr\b.*falta/.test(d)) return 'desconto';
    return 'provento';
}

const centavos = (v: string | null) => Math.round(Math.abs(quantidade(v)) * 100);

/**
 * Ficha financeira do SAGE por funcionário e ano, desde `desde` (AAAA-MM). Liga pelo código IOB, no vínculo em vigor
 * na competência (o mesmo do histórico da folha); lançamento sem ficha (ou com mais de um vínculo) fica de fora.
 */
export function historicoDoHolerith(holerith: TabelaLida, naturezas: NaturezasEventos, fichas: FichaFuncionario[], empresaId: string, opcoes: { desde?: string } = {}): ResultadoHistoricoSage {
    const r: ResultadoHistoricoSage = { anos: [], linhas: 0, semFicha: 0, avisos: [], finalidades: {} };
    const i = (n: string) => holerith.colunas.findIndex(c => chaveColuna(c) === n);
    const [iCod, iAno, iEv, iVal, iVen, iDes, iDesc, iFin] = ['codfun', 'anomes', 'codeven', 'valor', 'vlven', 'vldes', 'descricao', 'final'].map(i);
    if ([iCod, iAno, iEv].some(x => x < 0) || (iVal < 0 && iVen < 0 && iDes < 0)) {
        r.avisos.push('holerith sem as colunas codfun, anomes, codeven e valor: a ficha financeira do SAGE não veio.');
        return r;
    }
    const porCodigo = fichasPorCodigoIob(fichas);
    const porAno = new Map<string, HistoricoSageAno & { porChave: Map<string, LinhaHistoricoSage> }>();
    for (const l of holerith.linhas) {
        const competencia = competenciaDe(l[iAno]);
        if (!competencia || (opcoes.desde && competencia < opcoes.desde)) continue;
        const descricao = iDesc >= 0 ? (l[iDesc] ?? '').trim() : '';
        if (ehTotalizador(descricao)) continue;
        const vlVen = iVen >= 0 ? centavos(l[iVen]) : 0;
        const vlDes = iDes >= 0 ? centavos(l[iDes]) : 0;
        const valor = iVal >= 0 ? centavos(l[iVal]) : 0;
        const v = valor || vlVen || vlDes;
        if (!v) continue;
        r.linhas++;
        const fin = iFin >= 0 ? (l[iFin] ?? '').trim() || '(vazio)' : '(sem coluna)';
        r.finalidades[fin] = (r.finalidades[fin] ?? 0) + 1;
        const vinculos = vinculosEm(porCodigo, l[iCod], competencia);
        if (vinculos.length !== 1) { r.semFicha++; continue; }
        const ficha = vinculos[0];
        const ev = chaveCodfun(l[iEv]);
        const rub = vigenciaEm(naturezas, ev, competencia);
        const tipo = tipoDoLancamento({ tpRubr: rub?.tpRubr, vlVen, vlDes, natRubr: rub?.natRubr, descricao });
        const ano = competencia.slice(0, 4);
        const k = `${ficha.id}_${ano}`;
        const a = porAno.get(k) ?? { empresaId, fichaId: ficha.id, ano, nome: ficha.dados.nome || ficha.cpf, linhas: [], porChave: new Map() };
        const chave = `${tipo}|${ev}`;
        const linha = a.porChave.get(chave) ?? { codigo: ev, descricao, tipo, meses: Array(12).fill(null) };
        const m = Number(competencia.slice(5, 7)) - 1;
        linha.meses[m] = (linha.meses[m] ?? 0) + v;
        if (!linha.descricao) linha.descricao = descricao;
        a.porChave.set(chave, linha); porAno.set(k, a);
    }
    const ordem: TipoHistorico[] = ['provento', 'desconto', 'informativo'];
    r.anos = [...porAno.values()].map(({ porChave, ...a }) => ({
        ...a,
        linhas: [...porChave.values()].sort((x, y) => ordem.indexOf(x.tipo) - ordem.indexOf(y.tipo) || x.codigo.localeCompare(y.codigo, 'pt-BR', { numeric: true })),
    })).sort((a, b) => a.fichaId.localeCompare(b.fichaId) || a.ano.localeCompare(b.ano));
    if (r.semFicha) r.avisos.push(`${r.semFicha} lançamento(s) de funcionário sem ficha (ou com mais de um vínculo) na competência: ficaram fora da ficha financeira.`);
    return r;
}

/** Meses (0 a 11) com algum lançamento do SAGE. */
export const mesesDoHistorico = (h: Pick<HistoricoSageAno, 'linhas'>) =>
    Array.from({ length: 12 }, (_, m) => m).filter(m => h.linhas.some(l => l.meses[m] !== null));
