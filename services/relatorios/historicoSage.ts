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
/**
 * Totais do mês de uma finalidade do holerith (coluna `final`: folha, adiantamento, férias, 13º… do SAGE), em centavos,
 * para conferir o motor só com a folha mensal: proventos, descontos e o valor das naturezas comparadas uma a uma.
 */
export interface TotaisMesSage {
    proventos: number; descontos: number; porNatureza: Record<string, number>;
    /** Lançamentos de provento ou desconto sem a natureza no mês (evento sem S-1010 ou fora da vigência): as naturezas não fecham. */
    semNatureza?: number;
}
/** Naturezas (Tabela 03) guardadas nos totais: salário, salário-família, INSS, IRRF e as licenças. */
export const NATUREZAS_TOTAIS = ['1000', '1409', '9201', '9203', '4050', '4052'];
/** Um funcionário num ano: historico_sage/{fichaId}_{ano}. */
export interface HistoricoSageAno {
    empresaId: string; fichaId: string; ano: string; nome: string; linhas: LinhaHistoricoSage[];
    /** Por finalidade do holerith, os totais de cada mês (índice 0 a 11; null = sem lançamento). Gravado desde 17/10/2026. */
    porFinalidade?: Record<string, (TotaisMesSage | null)[]>;
    /** O backup trouxe a natureza das rubricas (S-1010 do IOB): sem ela, salário, INSS e IRRF não são conferidos um a um. */
    comNaturezas?: boolean;
}
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
        const a: HistoricoSageAno & { porChave: Map<string, LinhaHistoricoSage> } = porAno.get(k)
            ?? { empresaId, fichaId: ficha.id, ano, nome: ficha.dados.nome || ficha.cpf, linhas: [], porChave: new Map(), comNaturezas: naturezas.size > 0 };
        const chave = `${tipo}|${ev}`;
        const linha = a.porChave.get(chave) ?? { codigo: ev, descricao, tipo, meses: Array(12).fill(null) };
        const m = Number(competencia.slice(5, 7)) - 1;
        linha.meses[m] = (linha.meses[m] ?? 0) + v;
        // Totais por finalidade, para a conferência do motor com a folha mensal do SAGE.
        a.porFinalidade ??= {};
        const meses = (a.porFinalidade[fin] ??= Array(12).fill(null));
        const t = (meses[m] ??= { proventos: 0, descontos: 0, porNatureza: {} });
        if (tipo === 'provento') t.proventos += v;
        else if (tipo === 'desconto') t.descontos += v;
        const nat = rub?.natRubr ?? '';
        if (NATUREZAS_TOTAIS.includes(nat)) t.porNatureza[nat] = (t.porNatureza[nat] ?? 0) + v;
        else if (!nat && tipo !== 'informativo') t.semNatureza = (t.semNatureza ?? 0) + 1;
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
