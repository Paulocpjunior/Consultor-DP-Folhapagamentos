// services/bancario/favorecidos.ts
//
// Quem recebe pelo arquivo bancário: o líquido de cada recibo calculado com os
// dados bancários da ficha. Usado pelo "Arquivo Bancário" e pelo pacote do
// cliente, para os dois gerarem o mesmo arquivo. No arquivo do adiantamento,
// o valor de cada um é o adiantamento do mês (com o arredondamento dele).

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { adiantamentoDoMes, dataSugeridaAdiantamento, type ResultadoCalculo } from '../calculo/motorMensal';
import { arredondamentoDoAdiantamento } from '../calculo/arredondamento';
import type { Favorecido } from './cnab240';

/**
 * O que se paga no dia do adiantamento: o adiantamento do mês e, se a empresa arredonda, o arredondamento dele
 * (466,67 + 0,33 = 467,00 no caso do IOB). É o mesmo valor do S-1210 do adiantamento.
 */
export const valorDoAdiantamento = (r: Pick<ResultadoCalculo, 'verbas'>) => {
    const a = adiantamentoDoMes(r);
    return a > 0 ? a + arredondamentoDoAdiantamento(r) : 0;
};

export interface FavorecidosDaFolha {
    favorecidos: Favorecido[];
    /** Recibos que nem entram na conta (cálculo com erro ou incompleto). */
    foraDoCalculo: { nome: string; motivo: string }[];
}

const br = (d: string) => d.split('-').reverse().join('/');
/**
 * Data do adiantamento mudada no arquivo: o valor foi calculado para o dia 20 (ou o útil anterior) da competência.
 * Como no eSocial: data fora da competência, data antes da admissão, ou admissão/desligamento entre a data nova e a
 * do cálculo deixam o funcionário fora (Codex #117), a não ser que o adiantamento esteja informado no movimento.
 */
export function foraDoAdiantamento(r: ResultadoCalculo, f: FichaFuncionario | undefined, data: string): string | undefined {
    if (data.slice(0, 7) !== r.competencia) return `data ${br(data)} fora de ${r.competencia.slice(5)}/${r.competencia.slice(0, 4)}: o adiantamento foi calculado para a competência`;
    const d = f?.dados ?? {};
    if ((d.admissao ?? '') > data) return `admitido em ${br(d.admissao ?? '')}, depois de ${br(data)}`;
    const sugerida = dataSugeridaAdiantamento(r.competencia);
    const comVinculo = (dia: string) => (d.admissao ?? '') <= dia && !(d.dataDesligamento && d.dataDesligamento < dia);
    if (!r.adiantamentoInformado && data !== sugerida && comVinculo(data) !== comVinculo(sugerida))
        return `admissão ou desligamento entre ${br(data)} e ${br(sugerida)} (data do cálculo): informe no movimento o adiantamento pago (ou 0) e recalcule`;
    return undefined;
}

/**
 * `valorDoRecibo`: o valor a pagar de cada recibo (padrão: o líquido); zero fica fora, sem aviso (não recebe neste arquivo).
 * `foraPorData`: motivo para deixar o recibo fora pela data do pagamento (arquivo do adiantamento).
 */
export function favorecidosDaFolha(resultados: ResultadoCalculo[], fichas: FichaFuncionario[], dataPadrao: string, dataDoRecibo?: (r: ResultadoCalculo) => string | undefined,
    valorDoRecibo?: (r: ResultadoCalculo) => number, foraPorData?: (r: ResultadoCalculo, f: FichaFuncionario | undefined, data: string) => string | undefined): FavorecidosDaFolha {
    const porId = new Map(fichas.map(f => [f.id, f]));
    const favorecidos: Favorecido[] = []; const foraDoCalculo: FavorecidosDaFolha['foraDoCalculo'] = [];
    for (const r of resultados) {
        if (r.situacao !== 'calculado') { foraDoCalculo.push({ nome: r.nome, motivo: r.situacao === 'erro' ? 'cálculo com erro' : 'cálculo incompleto' }); continue; }
        const valor = valorDoRecibo ? valorDoRecibo(r) : r.totais.liquido;
        if (valorDoRecibo && valor <= 0) continue;
        const f = porId.get(r.fichaId);
        const dataPagamento = dataDoRecibo?.(r) || dataPadrao;
        const motivo = foraPorData?.(r, f, dataPagamento);
        if (motivo) { foraDoCalculo.push({ nome: r.nome, motivo }); continue; }
        const d = f?.dados ?? {};
        favorecidos.push({
            ref: (d.codigoIob || f?.matriculaEsocial || r.fichaId).slice(0, 20), nome: r.nome, cpf: f?.cpf ?? '',
            banco: d.banco ?? '', agencia: d.agencia ?? '', conta: d.conta ?? '', tipoConta: d.tipoConta ?? '', pix: d.pix ?? '',
            valor, dataPagamento,
            logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro, cidade: d.municipio, cep: d.cep, uf: d.uf,
        });
    }
    return { favorecidos, foraDoCalculo };
}
