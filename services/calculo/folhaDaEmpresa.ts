// services/calculo/folhaDaEmpresa.ts
//
// A folha mensal de uma empresa inteira, como a tela de Cálculo faz (components/calculo/CalculoPanel.tsx), num lugar
// só, para a tela e o processamento agrupado (várias empresas de uma vez) darem o mesmo resultado:
// - quem está na competência, cada um pelo motor mensal, com as férias do mês, as convocações do intermitente, os
//   benefícios e as contribuições da convenção;
// - o IRRF do adiantamento somando os contratos do mesmo CPF e a folha da competência anterior paga no mesmo mês
//   (regime "mês seguinte"; Codex #118);
// - o arredondamento do líquido da empresa, encadeado desde o mês em que começou (Codex #116).
// Puro, sem Firebase.

import { anteriorEncadeado, arredondaNoMes, arredondar, folhaPagaAntes, mesDoPagamento, type ParametrosFolha } from './arredondamento';
import { calcularMensal, competenciaAnterior, noMes, travarAdiantamentoEntreContratos, type EntradaCalculo, type Movimento, type ResultadoCalculo } from './motorMensal';
import { feriasDaCompetencia, type OpcoesFerias } from './motorFerias';
import type { Convocacao } from './intermitente';
import { inicioNaEmpresa, type FichaFuncionario } from '../cadastros/funcionarios';
import type { Afastamento } from '../cadastros/afastamentos';
import type { TabelaLegal } from '../cadastros/tabelasLegais';
import type { TabelaDsr } from '../cadastros/tabelaDsr';
import type { ConvencaoColetiva } from '../sindicatos/convencao';

export interface DadosFolhaEmpresa {
    fichas: FichaFuncionario[];
    afastamentos: Afastamento[];
    tabelas: TabelaLegal[];
    /** Convocações do intermitente; sem elas (erro de leitura), a categoria 111 fica incompleta. */
    convocacoes?: Convocacao[];
    /** Movimentos gravados por ficha e competência; null enquanto não lidos (ou com erro na leitura). */
    movimentosEmpresa: Record<string, Record<string, Movimento>> | null;
    parametrosFolha?: ParametrosFolha;
    /** Convenção do sindicato da ficha no dia. */
    convencaoDe: (f: FichaFuncionario, dia: string) => ConvencaoColetiva | undefined;
    opcoesFerias: OpcoesFerias;
    /** Tabela para D.S.R. da empresa, por ano (Tabelas legais). */
    tabelasDsr?: TabelaDsr[];
}

/**
 * IRRF do adiantamento com o saldo da folha em outro mês: a folha da competência anterior, se foi paga no mês do
 * adiantamento (regime "mês seguinte"), com o IRRF gravado com o movimento dela; `null` se não houve; `undefined`
 * enquanto os movimentos gravados não chegam; `{ pendente }` sem o IRRF gravado (a folha já paga não é refeita
 * com a ficha de hoje) ou com outra folha mais antiga paga no mesmo mês (Codex #118).
 */
export function criarFolhaPagaNoAdiantamento(d: DadosFolhaEmpresa) {
    return (f: FichaFuncionario, c: string, pagamentoDeC: string): EntradaCalculo['folhaPagaNoAdiantamento'] => {
        if (pagamentoDeC === c) return null;
        // Sem os movimentos gravados, só quem foi admitido no mês sabe que não houve folha paga antes.
        if (!d.movimentosEmpresa) return inicioNaEmpresa(f.dados) < `${c}-01` ? undefined : null;
        return folhaPagaAntes(d.movimentosEmpresa[f.id] ?? {}, c, m => noMes([f], m).length > 0, m => mesDoPagamento(d.parametrosFolha, m));
    };
}

/**
 * Arredondamento do líquido da empresa (parâmetro): o anterior é o do movimento do mês (o do holerite do IOB,
 * por exemplo) ou o atual do mês passado, encadeado desde o mês em que o arredondamento começou no Consultor.
 */
export function criarArredondamento(d: DadosFolhaEmpresa, folhaPaga = criarFolhaPagaNoAdiantamento(d)) {
    const p = d.parametrosFolha;
    return (r: ResultadoCalculo, f: FichaFuncionario, c: string, informado?: number): ResultadoCalculo => {
        if (!p || !arredondaNoMes(p, c)) return r;
        // Sem os movimentos gravados (carregando ou com erro), o encadeamento sairia sem as horas, faltas e anteriores dos
        // meses passados: a folha fica incompleta até eles chegarem, a não ser que o anterior do mês esteja informado (Codex #116).
        // Em erro (e não "incompleto"): PDF, arquivo bancário e eSocial não saem com o líquido sem o arredondamento (Codex #116).
        const travar = (m: string): ResultadoCalculo => ({ ...r, situacao: 'erro', erros: [...r.erros, m] });
        // O rascunho ainda não salvo já vale no cálculo: acima de 0,99 não sai pagamento com ele (Codex #116).
        if (informado !== undefined && (informado < 0 || informado > 99)) return travar('Arredondamento anterior: no máximo R$ 0,99 (são centavos do mês anterior).');
        // No mês de início o anterior é 0 e não depende do histórico (Codex #116).
        if (informado === undefined && c > (p.arredondarDesde || c) && !d.movimentosEmpresa) return travar('Arredondamento do líquido: aguardando os movimentos gravados dos meses anteriores para encadear o anterior (ou informe o "Arredondamento anterior" no movimento).');
        const afs = d.afastamentos.filter(a => a.fichaId === f.id);
        const salvos = d.movimentosEmpresa?.[f.id] ?? {};
        const desde = p.arredondarDesde || c;
        const anterior = informado ?? anteriorEncadeado(desde, c,
            // Mês já salvo: o mês do pagamento usado de fato (o "Pagamento em" da tela, mesmo fora do regime); senão, o do regime.
            m => {
                if (!noMes([f], m).length) return null;
                const pag = salvos[m]?.mesPagamento ?? salvos[m]?.arredondamentoPagamento ?? mesDoPagamento(p, m);
                return calcularMensal({ competencia: m, pagamento: pag, ficha: f, tabelas: d.tabelas, movimento: salvos[m], afastamentos: afs,
                    feriasDoMes: feriasDaCompetencia(f, afs, d.tabelas, salvos, m, d.opcoesFerias), folhaPagaNoAdiantamento: folhaPaga(f, m, pag), beneficios: p.beneficios,
                    contribuicoesSindicais: d.convencaoDe(f, `${m}-01`)?.contribuicoes, convocacoes: d.convocacoes, tabelasDsr: d.tabelasDsr });
            },
            // O atual gravado só vale se foi encadeado do mesmo mês de início. O mês do pagamento gravado com ele é o que foi
            // usado de fato: mudar o regime depois não reescreve mês fechado (para isso, reabra o mês e salve de novo; Codex #116).
            m => salvos[m]?.arredondamentoAnterior, m => (salvos[m]?.arredondamentoDesde === desde ? salvos[m]?.arredondamentoFechado : undefined));
        return typeof anterior === 'number' ? arredondar(r, anterior) : travar(anterior.erro);
    };
}

/** Folha mensal da competência, com o pagamento no mês informado e os movimentos do mês (gravados ou em edição). */
export function calcularFolhaMensal(d: DadosFolhaEmpresa, competencia: string, pagamento: string, movs: Record<string, Movimento>): ResultadoCalculo[] {
    if (!/^\d{4}-\d{2}$/.test(competencia)) return [];
    const folhaPaga = criarFolhaPagaNoAdiantamento(d);
    const arredondarDaEmpresa = criarArredondamento(d, folhaPaga);
    // O IRRF do adiantamento soma os contratos do mesmo CPF antes do arredondamento (que depende do que o adiantamento pagou).
    const doMes = noMes(d.fichas, competencia);
    const porId = new Map(d.fichas.map(f => [f.id, f]));
    return travarAdiantamentoEntreContratos(doMes.map(f => {
        const afs = d.afastamentos.filter(a => a.fichaId === f.id);
        return calcularMensal({
            competencia, pagamento, ficha: f, tabelas: d.tabelas, movimento: movs[f.id], afastamentos: afs,
            feriasDoMes: d.movimentosEmpresa ? feriasDaCompetencia(f, afs, d.tabelas, d.movimentosEmpresa[f.id] ?? {}, competencia, d.opcoesFerias) : undefined,
            folhaPagaNoAdiantamento: folhaPaga(f, competencia, pagamento), beneficios: d.parametrosFolha?.beneficios,
            contribuicoesSindicais: d.convencaoDe(f, `${competencia}-01`)?.contribuicoes, convocacoes: d.convocacoes, tabelasDsr: d.tabelasDsr,
        });
    }), d.fichas, pagamento !== competencia
        // Só os contratos da competência anterior com folha paga neste mês (pelo mês gravado ou pelo regime) e com valor:
        // sem rendimentos (afastado o mês todo, por exemplo) não pagou nada. Sem saber ainda, conta (Codex #118).
        ? noMes(d.fichas, competenciaAnterior(competencia)).filter(f => {
            const ant = folhaPaga(f, competencia, pagamento);
            return ant === undefined || (ant !== null && ('pendente' in ant || ant.rendimentos > 0));
        })
        : [], { tabelas: d.tabelas, folhaPaga: id => { const f = porId.get(id); return f ? folhaPaga(f, competencia, pagamento) : null; } })
        .map((r, i) => arredondarDaEmpresa(r, doMes[i], competencia, movs[doMes[i].id]?.arredondamentoAnterior));
}
