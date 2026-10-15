// services/calculo/recibosIntermitente.ts
//
// Trabalho Intermitente do IOB SAGE (Processos › Trabalho Intermitente): os recibos de cada convocação paga no mês, a
// Listagem de Convocação e os Valores de Salários para Bancos. Os recibos saem do cálculo do mês (calcularMensal da
// categoria 111): um por data de pagamento (Convocacao.dataPagamento) ou um só, pago com a folha. Puro, sem Firebase.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { TabelaRelatorio } from '../relatorios/layoutPdf';
import { diasNaCompetencia, horasDe, inicioDe, fimDe, ROTULO_RESPOSTA, valorHoraDaFicha, type Convocacao } from './intermitente';
import type { ResultadoCalculo } from './motorMensal';

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d || '—');
const cpfFmt = (c: string) => (c.length === 11 ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : c);
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** Um recibo do intermitente no mês: as convocações pagas nele, o período trabalhado e o cálculo. */
export interface ReciboDoMes {
    fichaId: string;
    nome: string;
    /** Data do pagamento (AAAA-MM-DD); a da folha quando a convocação não tem data própria. */
    dataPagamento: string;
    convocacoes: Convocacao[];
    /** 1º e último dia trabalhado na competência. */
    periodo: [string, string];
    resultado: ResultadoCalculo;
}

/** Os recibos do mês a partir dos cálculos dos intermitentes (`dataFolha`: o pagamento da folha, AAAA-MM-DD). */
export function recibosDoMes(resultados: ResultadoCalculo[], convocacoes: Convocacao[], competencia: string, dataFolha: string): ReciboDoMes[] {
    const out: ReciboDoMes[] = [];
    for (const r of resultados) {
        // Recibo e banco só com o cálculo completo (o incompleto deixou parcela de fora), como o holerite da folha.
        if (!r.diasIntermitente || r.situacao !== 'calculado' || !r.verbas.length) continue;
        const doMes = diasNaCompetencia(convocacoes, r.fichaId, competencia);
        const periodo = (ids: string[]): [string, string] => {
            const dias = doMes.filter(x => ids.includes(x.convocacao.id)).flatMap(x => x.dias.map(d => d.data)).sort();
            return [dias[0] ?? '', dias[dias.length - 1] ?? ''];
        };
        const partes = r.recibosIntermitente?.length
            ? r.recibosIntermitente.map(x => ({ data: x.dataPagamento, ids: x.convocacoes, resultado: x.resultado }))
            : [{ data: '', ids: doMes.map(x => x.convocacao.id), resultado: r }];
        for (const p of partes) out.push({
            fichaId: r.fichaId, nome: r.nome, dataPagamento: p.data || dataFolha,
            convocacoes: doMes.filter(x => p.ids.includes(x.convocacao.id)).map(x => x.convocacao), periodo: periodo(p.ids), resultado: p.resultado,
        });
    }
    return out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.dataPagamento.localeCompare(b.dataPagamento));
}

/** Seleção do Holerite e da Listagem do SAGE: por funcionário ou por convocação; por data de convocação ou de pagamento. */
export interface FiltroIntermitente {
    fichaIds?: string[];
    convocacaoId?: string;
    por: 'convocacao' | 'pagamento';
    de: string;
    ate: string;
}
const noIntervalo = (ini: string, fim: string, f: FiltroIntermitente) => (!f.de || fim >= f.de) && (!f.ate || ini <= f.ate);

export function filtrarRecibos(recibos: ReciboDoMes[], f: FiltroIntermitente): ReciboDoMes[] {
    return recibos.filter(x => (!f.fichaIds?.length || f.fichaIds.includes(x.fichaId))
        && (!f.convocacaoId || x.convocacoes.some(c => c.id === f.convocacaoId))
        && (f.por === 'pagamento' ? noIntervalo(x.dataPagamento, x.dataPagamento, f) : noIntervalo(x.periodo[0], x.periodo[1], f)));
}

/** Listagem de Convocação Intermitente: código, funcionário, período, dias, horas, valor e resposta. */
export function listagemConvocacoes(convocacoes: Convocacao[], fichas: FichaFuncionario[], f: FiltroIntermitente, ordem: 'nome' | 'codigo' = 'nome', separarDepartamento = false): TabelaRelatorio {
    const ficha = new Map(fichas.map(x => [x.id, x]));
    const nome = (c: Convocacao) => ficha.get(c.fichaId)?.dados.nome || c.fichaId;
    const depto = (c: Convocacao) => ficha.get(c.fichaId)?.dados.departamento || '';
    const itens = convocacoes.filter(c => c.dias.length
        && (!f.fichaIds?.length || f.fichaIds.includes(c.fichaId)) && (!f.convocacaoId || c.id === f.convocacaoId)
        && (f.por === 'pagamento' ? !!c.dataPagamento && noIntervalo(c.dataPagamento, c.dataPagamento, f) : noIntervalo(inicioDe(c), fimDe(c), f)))
        .sort((a, b) => (separarDepartamento ? depto(a).localeCompare(depto(b), 'pt-BR') : 0)
            || (ordem === 'codigo' ? (a.codigo ?? 0) - (b.codigo ?? 0) : nome(a).localeCompare(nome(b), 'pt-BR')) || inicioDe(a).localeCompare(inicioDe(b)));
    let horas = 0; let total = 0;
    const linhas = itens.map(c => {
        const fi = ficha.get(c.fichaId);
        const vh = c.valorHora || (fi ? valorHoraDaFicha(fi.dados) : 0);
        const h = horasDe(c); const v = Math.round(h * vh);
        if (c.resposta !== 'recusada') { horas += h; total += v; }
        return [c.codigo ? String(c.codigo) : '—', nome(c), ...(separarDepartamento ? [depto(c) || '—'] : []), `${br(inicioDe(c))} a ${br(fimDe(c))}`, String(c.dias.length), num(h), brl(vh), brl(v),
            ROTULO_RESPOSTA[c.resposta], c.dataPagamento ? br(c.dataPagamento) : 'com a folha', c.funcao || ''];
    });
    return {
        colunas: [{ titulo: 'Cód.', largura: 12 }, { titulo: 'Funcionário' }, ...(separarDepartamento ? [{ titulo: 'Departamento', largura: 26 }] : []), { titulo: 'Período', largura: 40 },
            { titulo: 'Dias', alinhar: 'direita', largura: 11 }, { titulo: 'Horas', alinhar: 'direita', largura: 14 }, { titulo: 'Valor hora', alinhar: 'direita', largura: 20 },
            { titulo: 'Valor (horas)', alinhar: 'direita', largura: 24 }, { titulo: 'Resposta', largura: 30 }, { titulo: 'Pagamento', largura: 22 }, { titulo: 'Função', largura: 28 }],
        linhas,
        totais: ['', `${itens.length} convocação(ões)`, ...(separarDepartamento ? [''] : []), '', '', num(horas), '', brl(total), '', '', ''],
        observacao: 'Valor (horas) = horas × valor da hora, sem DSR, férias, 13º e adicionais (o recibo traz o cálculo completo). Convocações recusadas ficam fora dos totais.',
    };
}

/** Valores de Salários para Bancos — Intermitente: o líquido de cada recibo, com os dados bancários da ficha. */
export function bancosIntermitente(recibos: ReciboDoMes[], fichas: FichaFuncionario[], o: { separa: 'convocacao' | 'banco' | 'departamento'; documento: 'cpf' | 'rg' | 'codigo' | 'nenhum' }): TabelaRelatorio {
    const ficha = new Map(fichas.map(x => [x.id, x]));
    const chave = (x: ReciboDoMes) => {
        const d = ficha.get(x.fichaId)?.dados ?? {};
        return o.separa === 'banco' ? (d.banco || (d.pix ? 'PIX' : 'sem banco')) : o.separa === 'departamento' ? (d.departamento || 'sem departamento')
            : `${x.convocacoes.map(c => (c.codigo ? `nº ${c.codigo}` : inicioDe(c))).join(', ')} · pago em ${br(x.dataPagamento)}`;
    };
    const itens = recibos.filter(x => x.resultado.totais.liquido > 0).sort((a, b) => chave(a).localeCompare(chave(b), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
    const docDe = (x: ReciboDoMes) => {
        const fi = ficha.get(x.fichaId);
        return o.documento === 'cpf' ? cpfFmt(fi?.cpf ?? '') : o.documento === 'rg' ? [fi?.dados.rg, fi?.dados.orgaoRg].filter(Boolean).join(' ')
            : o.documento === 'codigo' ? x.convocacoes.map(c => c.codigo ?? '').join(', ') : '';
    };
    const linhas: string[][] = [];
    const comDoc = o.documento !== 'nenhum';
    const grupos = new Map<string, ReciboDoMes[]>();
    for (const x of itens) grupos.set(chave(x), [...(grupos.get(chave(x)) ?? []), x]);
    for (const [g, xs] of grupos) {
        linhas.push([g, ...Array(comDoc ? 5 : 4).fill(''), '']);
        for (const x of xs) {
            const d = ficha.get(x.fichaId)?.dados ?? {};
            linhas.push([d.banco || '—', d.agencia || '', d.conta || (d.pix ? `PIX ${d.pix}` : 'sem conta'), ...(comDoc ? [docDe(x)] : []), x.nome, br(x.dataPagamento), brl(x.resultado.totais.liquido)]);
        }
        linhas.push([`Total: ${xs.length} recibo(s)`, ...Array(comDoc ? 5 : 4).fill(''), brl(xs.reduce((s, x) => s + x.resultado.totais.liquido, 0))]);
    }
    const total = itens.reduce((s, x) => s + x.resultado.totais.liquido, 0);
    return {
        colunas: [{ titulo: 'Banco', largura: 16 }, { titulo: 'Agência', largura: 18 }, { titulo: 'Conta/DV', largura: 28 },
            ...(comDoc ? [{ titulo: o.documento === 'cpf' ? 'C.P.F.' : o.documento === 'rg' ? 'R.G.' : 'Convocação', largura: 28 }] : []),
            { titulo: 'Funcionário' }, { titulo: 'Pagamento', largura: 22 }, { titulo: 'Valor', alinhar: 'direita', largura: 24 }],
        linhas,
        totais: ['Total geral', ...Array(comDoc ? 4 : 3).fill(''), `${itens.length} recibo(s)`, brl(total)],
    };
}
