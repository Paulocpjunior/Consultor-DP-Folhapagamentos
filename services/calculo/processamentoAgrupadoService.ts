// services/calculo/processamentoAgrupadoService.ts
//
// Leitura e gravação do processamento agrupado (services/calculo/processamentoAgrupado.ts): para cada empresa, os
// cadastros, os movimentos gravados do mês e da empresa, o enquadramento, as obras, o Fim de mês e a folha gravada;
// o cálculo é o da tela (folhaDaEmpresa.ts). Uma empresa por vez, para não pesar no banco; a falha numa não para as
// outras. Só os movimentos gravados entram (o rascunho não salvo fica na tela de Cálculo de quem digitou).

import type { Empresa } from '../empresas/empresasTypes';
import { listarAfastamentos, listarEnquadramentos, listarFuncionarios, listarTabelasDsr, mensagemErro, type Usuario } from '../cadastros/cadastrosService';
import { enquadramentoVigente } from '../cadastros/enquadramento';
import type { TabelaLegal } from '../cadastros/tabelasLegais';
import { listarConvocacoes } from './convocacoesService';
import { listarMovimentos, listarMovimentosDaEmpresa } from './movimentosService';
import { gravarFolha, lerFolhaGravada } from './folhaGravadaService';
import { lerFechamento } from '../fimDeMes/fechamentoService';
import { listarLotacoes } from '../obras/lotacoesService';
import { convencaoDaFicha, type ConvencaoColetiva } from '../sindicatos/convencao';
import { mesDoPagamento } from './arredondamento';
import { OPCOES_FERIAS_PADRAO } from './motorFerias';
import { calcularFolhaMensal } from './folhaDaEmpresa';
import { calcularProvisao } from './provisoes';
import { calcular13, com13, feriasComAdiantamento13, ultimoDiaDoMes } from './motor13';
import { resumirFolha } from '../relatorios/resumoFolha';
import { linhaComFalha, linhaDaEmpresa, type GravacaoAgrupada, type LinhaAgrupada } from './processamentoAgrupado';

/** O que processar: a folha mensal ou uma das parcelas do 13º (rotina anual) do ano da competência. */
export type FolhaAgrupada = 'mensal' | '13-1a' | '13-2a';

export interface OpcoesAgrupado {
    competencia: string;
    /** Padrão: a folha mensal. No 13º, vale o ano da competência; não grava nem calcula provisões. */
    folha?: FolhaAgrupada;
    /** Grava a folha do mês de cada empresa com a competência aberta. */
    gravar: boolean;
    /** Calcula também o saldo das provisões de férias e 13º. */
    provisoes: boolean;
    usuario: Usuario;
    /** Lidos uma vez para todas as empresas. */
    tabelas: TabelaLegal[];
    convencoes: ConvencaoColetiva[];
}

const nomeDa = (e: Empresa) => ({ id: e.id, nome: e.nomeFantasia || e.razaoSocial, codigoSage: e.codigoSage });

export async function processarEmpresa(e: Empresa, o: OpcoesAgrupado): Promise<LinhaAgrupada> {
    if (o.folha === '13-1a' || o.folha === '13-2a') return processar13(e, { ...o, folha: o.folha });
    const c = o.competencia;
    try {
        const [fichas, afastamentos, convocacoes, doMes, daEmpresa, enquadramentos, lotacoes, fechamento, gravada, tabelasDsr] = await Promise.all([
            listarFuncionarios(e.id), listarAfastamentos(e.id), listarConvocacoes(e.id).catch(() => undefined), listarMovimentos(e.id, c), listarMovimentosDaEmpresa(e.id),
            listarEnquadramentos(e.id).catch(() => null), listarLotacoes(e.id).catch(() => []), lerFechamento(e.id, c).catch(() => null), lerFolhaGravada(e.id, c).catch(() => null),
            listarTabelasDsr(e.id).catch(() => undefined),
        ]);
        const avisos: string[] = [];
        const movs = Object.fromEntries(doMes.map(g => [g.fichaId, g.movimento]));
        // Mês do pagamento: o gravado com o movimento (o "Pagamento em" da tela), quando um só; senão, o regime da empresa.
        const gravados = [...new Set(doMes.map(g => g.movimento.mesPagamento).filter((m): m is string => !!m))];
        const regime = mesDoPagamento(e.parametrosFolha, c);
        const pagamento = gravados.length === 1 ? gravados[0] : regime;
        if (gravados.length > 1) avisos.push(`Movimentos com meses de pagamento diferentes (${gravados.join(', ')}): calculado com o do regime (${regime}). Confira na tela de Cálculo.`);
        if (!convocacoes) avisos.push('Convocações do intermitente não lidas: a categoria 111 fica incompleta.');
        const resultados = calcularFolhaMensal({
            fichas, afastamentos, tabelas: o.tabelas, convocacoes, movimentosEmpresa: daEmpresa, parametrosFolha: e.parametrosFolha,
            convencaoDe: (f, dia) => convencaoDaFicha(o.convencoes, f, e.sindicatos ?? [], dia), opcoesFerias: { ...OPCOES_FERIAS_PADRAO, provisaoConsignado: !!e.parametrosFolha?.provisaoConsignado }, tabelasDsr,
        }, c, pagamento, movs);
        let enq;
        if (enquadramentos === null) avisos.push('Enquadramento não lido: sem a parte patronal.');
        else {
            const v = enquadramentoVigente(enquadramentos, e.id, c);
            if ('enquadramento' in v) enq = v.enquadramento; else avisos.push(v.erro);
        }
        const encerrada = fechamento?.situacao === 'encerrado';
        // Competência encerrada com a folha gravada: o resumo é o do gravado (como na tela de Cálculo).
        const base = encerrada && gravada ? gravada.holerites : resultados;
        if (encerrada && gravada) avisos.push('Competência encerrada: valores da folha gravada.');
        const resumo = resumirFolha(base, enq, { lotacoes, lotacaoPadrao: e.esocialFolha?.codLotacao });
        let gravacao: GravacaoAgrupada = 'nao-pedida';
        if (o.gravar) {
            if (encerrada) gravacao = 'encerrada';
            else if (!resultados.some(r => r.situacao !== 'erro')) gravacao = 'sem-calculo';
            else {
                try {
                    await gravarFolha(e.id, c, pagamento, resultados, o.usuario, gravada?.holerites.map(h => h.fichaId));
                    gravacao = gravada ? 'regravada' : 'gravada';
                } catch (x) { gravacao = 'falhou'; avisos.push(`Folha não gravada: ${mensagemErro(x)}`); }
            }
        }
        const provisao = o.provisoes ? calcularProvisao({ competencia: c, fichas, afastamentos, tabelas: o.tabelas, movimentos: daEmpresa, enquadramentos: enquadramentos ?? [], empresaId: e.id }) : null;
        return linhaDaEmpresa({ empresa: nomeDa(e), competencia: c, pagamento: encerrada && gravada ? gravada.pagamento : pagamento, resultados: base, resumo, encerrada, gravacao, provisao, avisos });
    } catch (x) {
        return linhaComFalha(nomeDa(e), c, `Dados não lidos: ${mensagemErro(x)}`);
    }
}

/**
 * 13º de várias empresas (Processos › 13º Salário, em lote): o mesmo cálculo da tela, com os movimentos gravados do ano
 * (médias e faltas), a parcela única de cada empresa e a 1ª parcela já paga com as férias. Pagamento em novembro (1ª)
 * ou dezembro (2ª); a parte patronal pelo enquadramento de dezembro. Só a prévia: a folha do 13º não é gravada.
 */
async function processar13(e: Empresa, o: OpcoesAgrupado & { folha: '13-1a' | '13-2a' }): Promise<LinhaAgrupada> {
    const ano = Number(o.competencia.slice(0, 4));
    const primeira = o.folha === '13-1a';
    const c = `${ano}-13`;
    try {
        const [fichas, afastamentos, daEmpresa, enquadramentos, lotacoes, tabelasDsr] = await Promise.all([
            listarFuncionarios(e.id), listarAfastamentos(e.id), listarMovimentosDaEmpresa(e.id, comp => comp.startsWith(`${ano}-`)),
            listarEnquadramentos(e.id).catch(() => null), listarLotacoes(e.id).catch(() => []), listarTabelasDsr(e.id).catch(() => undefined),
        ]);
        const avisos: string[] = [];
        const pagamento = `${ano}-${primeira ? '11' : '12'}`;
        const parcelaUnica = (e.parametrosFolha?.parcelaUnica13 ?? []).includes(ano);
        let elegiveis = com13(fichas, ano, primeira ? ultimoDiaDoMes(pagamento) : `${ano}-12-31`);
        if (primeira && parcelaUnica) { avisos.push(`Parcela única em ${ano} (parâmetro da empresa): sem 1ª parcela; o 13º sai inteiro na 2ª.`); elegiveis = []; }
        if (primeira) {
            const nasFerias = elegiveis.filter(f => feriasComAdiantamento13(ano, afastamentos, f.id));
            if (nasFerias.length) avisos.push(`${nasFerias.length} funcionário(s) já receberam a 1ª parcela com as férias: fora desta parcela.`);
            elegiveis = elegiveis.filter(f => !nasFerias.includes(f));
        }
        const resultados = elegiveis.map(f => calcular13({
            ano, parcela: primeira ? '1a' : '2a', pagamento, ficha: f, afastamentos: afastamentos.filter(a => a.fichaId === f.id), tabelas: o.tabelas,
            movimentos: daEmpresa[f.id] ?? {}, parcelaUnica, tabelasDsr,
        }));
        let enq;
        if (enquadramentos === null) avisos.push('Enquadramento não lido: sem a parte patronal.');
        else {
            const v = enquadramentoVigente(enquadramentos, e.id, `${ano}-12`);
            if ('enquadramento' in v) enq = v.enquadramento; else avisos.push(v.erro);
        }
        const resumo = resumirFolha(resultados, enq, { lotacoes, lotacaoPadrao: e.esocialFolha?.codLotacao });
        return linhaDaEmpresa({ empresa: nomeDa(e), competencia: c, pagamento, resultados, resumo, encerrada: false, gravacao: 'nao-pedida', avisos });
    } catch (x) {
        return linhaComFalha(nomeDa(e), c, `Dados não lidos: ${mensagemErro(x)}`);
    }
}

/** Processa as empresas em sequência, avisando o andamento. */
export async function processarEmpresas(empresas: Empresa[], o: OpcoesAgrupado, andamento?: (feitas: number, linha: LinhaAgrupada) => void): Promise<LinhaAgrupada[]> {
    const out: LinhaAgrupada[] = [];
    for (const e of empresas) {
        const l = await processarEmpresa(e, o);
        out.push(l);
        andamento?.(out.length, l);
    }
    return out;
}
