// services/calculo/processamentoAgrupado.ts
//
// Processamento agrupado (o "Processamento Agrupado" do SAGE): a folha mensal de várias empresas da carteira de uma
// vez, na mesma competência. Cada empresa é calculada como na tela de Cálculo (services/calculo/folhaDaEmpresa.ts),
// com os movimentos gravados do mês, e resumida numa linha: funcionários, situação dos cálculos, totais, adiantamento
// a pagar, encargos (INSS, IRRF, FGTS e a parte patronal) e, se pedido, o saldo das provisões de férias e 13º.
// A gravação da folha é opcional e respeita o Fim de mês (competência encerrada não é regravada).
// Puro, sem Firebase (a leitura e a gravação estão em processamentoAgrupadoService.ts).

import type { ResultadoCalculo } from './motorMensal';
import type { Provisao } from './provisoes';
import { totalSaldo } from './provisoes';
import type { ResumoFolha } from '../relatorios/resumoFolha';
import { valorDoAdiantamento } from '../bancario/favorecidos';

export type GravacaoAgrupada = 'nao-pedida' | 'gravada' | 'regravada' | 'encerrada' | 'sem-calculo' | 'falhou';

export interface LinhaAgrupada {
    empresaId: string;
    nome: string;
    codigoSage: string;
    competencia: string;
    /** Mês do pagamento usado (o regime da empresa ou o gravado no movimento). */
    pagamento: string;
    situacao: 'ok' | 'com-pendencias' | 'sem-funcionarios' | 'falhou';
    encerrada: boolean;
    gravacao: GravacaoAgrupada;
    funcionarios: number;
    calculados: number;
    incompletos: number;
    erros: number;
    proventos: number;
    descontos: number;
    liquido: number;
    /** Adiantamento salarial do mês (o que vai na remessa do dia 20). */
    adiantamento: number;
    inssSegurados: number;
    irrf: number;
    fgts: number;
    /** Patronal + RAT + terceiros; ausente sem enquadramento vigente. */
    patronal?: number;
    /** Saldo das provisões no fim do mês (principal + encargos). */
    provisao?: { ferias: number; decimo: number };
    /** Pendências por funcionário (nome: motivo) e avisos da empresa. */
    mensagens: string[];
}

export interface EntradaLinha {
    empresa: { id: string; nome: string; codigoSage: string };
    competencia: string;
    pagamento: string;
    resultados: ResultadoCalculo[];
    resumo: ResumoFolha;
    encerrada: boolean;
    gravacao: GravacaoAgrupada;
    provisao?: Provisao | null;
    avisos?: string[];
}

export function linhaDaEmpresa(e: EntradaLinha): LinhaAgrupada {
    const r = e.resumo;
    const pendentes = e.resultados.filter(x => x.situacao !== 'calculado');
    const pat = r.encargos.patronal;
    return {
        empresaId: e.empresa.id, nome: e.empresa.nome, codigoSage: e.empresa.codigoSage, competencia: e.competencia, pagamento: e.pagamento,
        situacao: !e.resultados.length ? 'sem-funcionarios' : pendentes.length ? 'com-pendencias' : 'ok',
        encerrada: e.encerrada, gravacao: e.gravacao,
        funcionarios: r.funcionarios, calculados: r.situacoes.calculado, incompletos: r.situacoes.incompleto, erros: r.situacoes.erro,
        proventos: r.totais.proventos, descontos: r.totais.descontos, liquido: r.totais.liquido,
        adiantamento: e.resultados.filter(x => x.situacao === 'calculado').reduce((s, x) => s + valorDoAdiantamento(x), 0),
        inssSegurados: r.encargos.inssSegurados, irrf: r.encargos.irrf + (r.encargos.irrfAdiantamento ?? 0), fgts: r.encargos.fgts,
        ...(pat ? { patronal: pat.patronal + pat.rat + pat.terceiros } : {}),
        ...(e.provisao ? { provisao: { ferias: totalSaldo(e.provisao.totais.ferias.atual), decimo: totalSaldo(e.provisao.totais.decimo.atual) } } : {}),
        mensagens: [
            ...(e.avisos ?? []),
            ...pendentes.map(x => `${x.nome}: ${[...x.erros, ...x.avisos][0] ?? (x.situacao === 'erro' ? 'erro no cálculo' : 'cálculo incompleto')}`),
        ],
    };
}

/** Linha de uma empresa que não pôde ser processada (leitura falhou, sem permissão etc.). */
export function linhaComFalha(empresa: { id: string; nome: string; codigoSage: string }, competencia: string, motivo: string): LinhaAgrupada {
    return {
        empresaId: empresa.id, nome: empresa.nome, codigoSage: empresa.codigoSage, competencia, pagamento: '', situacao: 'falhou', encerrada: false, gravacao: 'sem-calculo',
        funcionarios: 0, calculados: 0, incompletos: 0, erros: 0, proventos: 0, descontos: 0, liquido: 0, adiantamento: 0, inssSegurados: 0, irrf: 0, fgts: 0, mensagens: [motivo],
    };
}

/** Totais da carteira processada. */
export function totaisAgrupados(ls: LinhaAgrupada[]) {
    const s = (f: (l: LinhaAgrupada) => number) => ls.reduce((t, l) => t + f(l), 0);
    return {
        empresas: ls.length, ok: ls.filter(l => l.situacao === 'ok').length, pendencias: ls.filter(l => l.situacao === 'com-pendencias' || l.situacao === 'falhou').length,
        funcionarios: s(l => l.funcionarios), proventos: s(l => l.proventos), descontos: s(l => l.descontos), liquido: s(l => l.liquido), adiantamento: s(l => l.adiantamento),
        inssSegurados: s(l => l.inssSegurados), irrf: s(l => l.irrf), fgts: s(l => l.fgts), patronal: s(l => l.patronal ?? 0),
        provisaoFerias: s(l => l.provisao?.ferias ?? 0), provisaoDecimo: s(l => l.provisao?.decimo ?? 0),
    };
}

export const ROTULO_SITUACAO_AGRUPADA: Record<LinhaAgrupada['situacao'], string> = {
    ok: 'Calculada', 'com-pendencias': 'Com pendências', 'sem-funcionarios': 'Sem funcionários no mês', falhou: 'Não processada',
};
export const ROTULO_GRAVACAO: Record<GravacaoAgrupada, string> = {
    'nao-pedida': '—', gravada: 'Gravada', regravada: 'Regravada', encerrada: 'Competência encerrada (não regravada)', 'sem-calculo': 'Sem cálculo', falhou: 'Falhou',
};

/** Linhas da planilha (valores em reais). */
export function planilhaAgrupada(ls: LinhaAgrupada[]): (string | number)[][] {
    const v = (c: number) => Math.round(c) / 100;
    const cab = ['Código', 'Empresa', 'Competência', 'Pagamento', 'Situação', 'Gravação', 'Funcionários', 'Calculados', 'Incompletos', 'Com erro', 'Proventos', 'Descontos', 'Líquido', 'Adiantamento',
        'INSS segurados', 'IRRF', 'FGTS', 'Patronal + RAT + terceiros', 'Provisão de férias', 'Provisão de 13º', 'Pendências'];
    const t = totaisAgrupados(ls);
    return [cab,
        ...ls.map(l => [l.codigoSage, l.nome, l.competencia, l.pagamento, ROTULO_SITUACAO_AGRUPADA[l.situacao], ROTULO_GRAVACAO[l.gravacao], l.funcionarios, l.calculados, l.incompletos, l.erros,
            v(l.proventos), v(l.descontos), v(l.liquido), v(l.adiantamento), v(l.inssSegurados), v(l.irrf), v(l.fgts), l.patronal === undefined ? '' : v(l.patronal),
            l.provisao ? v(l.provisao.ferias) : '', l.provisao ? v(l.provisao.decimo) : '', l.mensagens.join(' | ')]),
        ['', `Total (${t.empresas} empresas)`, '', '', '', '', t.funcionarios, '', '', '', v(t.proventos), v(t.descontos), v(t.liquido), v(t.adiantamento), v(t.inssSegurados), v(t.irrf), v(t.fgts), v(t.patronal),
            v(t.provisaoFerias), v(t.provisaoDecimo), ''],
    ];
}
