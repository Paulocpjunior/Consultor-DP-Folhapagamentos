// services/cadastros/importacaoEsocial.ts
//
// Carga do cadastro de funcionários a partir dos XMLs do eSocial (S-2200,
// S-2205, S-2206, S-2299, S-3000), pela mesma leitura e consolidação da
// implantação. Nada é gravado aqui: o resultado vai para a prévia, e só o que
// o usuário confirma segue para o Firestore.

import { consolidar, lerXml, type Evento, type FonteXml } from '../implantacao/implantacao';
import { fichaDoEsocial, mesclarComEsocial, type FichaFuncionario, type ResultadoMescla } from './funcionarios';

export interface PreviaImportacao { resultados: ResultadoMescla[]; avisos: string[] }

export function prepararImportacao(fontes: FonteXml[], empresa: { id: string; cnpj: string }, corte: string, existentes: FichaFuncionario[]): PreviaImportacao {
    const eventos: Evento[] = []; const avisos: string[] = [];
    for (const f of fontes) {
        try { const r = lerXml(f); eventos.push(...r.eventos); avisos.push(...r.avisos); }
        catch (e) { avisos.push(`${f.nome}: ${(e as Error).message}`); }
    }
    // Mesma regra da implantação: admissão retificada com recibo vale como cadastro provisório.
    const consolidado = consolidar(eventos, empresa.cnpj, corte, [], { revisarAdmissaoRetificada: true });
    avisos.push(...consolidado.avisos);
    const porId = new Map(existentes.map(f => [f.id, f]));
    const resultados = consolidado.cadastros
        .map(c => mesclarComEsocial(porId.get(fichaDoEsocial(c, empresa).id), fichaDoEsocial(c, empresa)))
        .sort((a, b) => (a.ficha.dados.nome ?? '').localeCompare(b.ficha.dados.nome ?? '', 'pt-BR'));
    return { resultados, avisos: [...new Set(avisos)] };
}

/** Só o que muda alguma coisa vai para gravação. */
export const paraGravar = (p: PreviaImportacao) => p.resultados.filter(r => r.novo || r.alteracoes.length > 0);
