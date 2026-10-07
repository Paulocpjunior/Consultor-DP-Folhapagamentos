// services/bancario/favorecidos.ts
//
// Quem recebe pelo arquivo bancário: o líquido de cada recibo calculado com os
// dados bancários da ficha. Usado pelo "Arquivo Bancário" e pelo pacote do
// cliente, para os dois gerarem o mesmo arquivo.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { ResultadoCalculo } from '../calculo/motorMensal';
import type { Favorecido } from './cnab240';

export interface FavorecidosDaFolha {
    favorecidos: Favorecido[];
    /** Recibos que nem entram na conta (cálculo com erro ou incompleto). */
    foraDoCalculo: { nome: string; motivo: string }[];
}

export function favorecidosDaFolha(resultados: ResultadoCalculo[], fichas: FichaFuncionario[], dataPadrao: string, dataDoRecibo?: (r: ResultadoCalculo) => string | undefined): FavorecidosDaFolha {
    const porId = new Map(fichas.map(f => [f.id, f]));
    const favorecidos: Favorecido[] = []; const foraDoCalculo: FavorecidosDaFolha['foraDoCalculo'] = [];
    for (const r of resultados) {
        if (r.situacao !== 'calculado') { foraDoCalculo.push({ nome: r.nome, motivo: r.situacao === 'erro' ? 'cálculo com erro' : 'cálculo incompleto' }); continue; }
        const f = porId.get(r.fichaId);
        const d = f?.dados ?? {};
        favorecidos.push({
            ref: (d.codigoIob || f?.matriculaEsocial || r.fichaId).slice(0, 20), nome: r.nome, cpf: f?.cpf ?? '',
            banco: d.banco ?? '', agencia: d.agencia ?? '', conta: d.conta ?? '', tipoConta: d.tipoConta ?? '', pix: d.pix ?? '',
            valor: r.totais.liquido, dataPagamento: dataDoRecibo?.(r) || dataPadrao,
            logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro, cidade: d.municipio, cep: d.cep, uf: d.uf,
        });
    }
    return { favorecidos, foraDoCalculo };
}
