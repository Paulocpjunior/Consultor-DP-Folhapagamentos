// services/bancario/favorecidos.ts
//
// Quem recebe pelo arquivo bancário: o líquido de cada recibo calculado com os
// dados bancários da ficha. Usado pelo "Arquivo Bancário" e pelo pacote do
// cliente, para os dois gerarem o mesmo arquivo. No arquivo do adiantamento,
// o valor de cada um é o adiantamento do mês (com o arredondamento dele).

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { adiantamentoDoMes, type ResultadoCalculo } from '../calculo/motorMensal';
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

/** `valorDoRecibo`: o valor a pagar de cada recibo (padrão: o líquido); zero fica fora, sem aviso (não recebe neste arquivo). */
export function favorecidosDaFolha(resultados: ResultadoCalculo[], fichas: FichaFuncionario[], dataPadrao: string, dataDoRecibo?: (r: ResultadoCalculo) => string | undefined,
    valorDoRecibo?: (r: ResultadoCalculo) => number): FavorecidosDaFolha {
    const porId = new Map(fichas.map(f => [f.id, f]));
    const favorecidos: Favorecido[] = []; const foraDoCalculo: FavorecidosDaFolha['foraDoCalculo'] = [];
    for (const r of resultados) {
        if (r.situacao !== 'calculado') { foraDoCalculo.push({ nome: r.nome, motivo: r.situacao === 'erro' ? 'cálculo com erro' : 'cálculo incompleto' }); continue; }
        const valor = valorDoRecibo ? valorDoRecibo(r) : r.totais.liquido;
        if (valorDoRecibo && valor <= 0) continue;
        const f = porId.get(r.fichaId);
        const d = f?.dados ?? {};
        favorecidos.push({
            ref: (d.codigoIob || f?.matriculaEsocial || r.fichaId).slice(0, 20), nome: r.nome, cpf: f?.cpf ?? '',
            banco: d.banco ?? '', agencia: d.agencia ?? '', conta: d.conta ?? '', tipoConta: d.tipoConta ?? '', pix: d.pix ?? '',
            valor, dataPagamento: dataDoRecibo?.(r) || dataPadrao,
            logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro, cidade: d.municipio, cep: d.cep, uf: d.uf,
        });
    }
    return { favorecidos, foraDoCalculo };
}
