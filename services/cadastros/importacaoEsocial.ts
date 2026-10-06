// services/cadastros/importacaoEsocial.ts
//
// Carga do cadastro de funcionários a partir dos XMLs do eSocial (S-2200,
// S-2205, S-2206, S-2299, S-3000), pela mesma leitura e consolidação da
// implantação. Nada é gravado aqui: o resultado vai para a prévia, e só o que
// o usuário confirma segue para o Firestore.

import { consolidar, lerXml, type Evento, type FonteXml } from '../implantacao/implantacao';
import { fichaDoEsocial, mesclarComEsocial, type FichaFuncionario, type ResultadoMescla } from './funcionarios';
import { chaveIdEvento } from './esocialDoBackup';

export interface PreviaImportacao { resultados: ResultadoMescla[]; avisos: string[] }

export interface OpcoesImportacao {
    /**
     * Recibos que o IOB guardou no backup (Id do evento → nrRecibo). O XML
     * enviado não traz o retorno: o recibo do IOB vale como processamento
     * aceito, e o evento sem recibo (envio recusado ou não concluído) fica de
     * fora — também quando o mapa vem vazio (nenhum envio aceito).
     */
    recibos?: Map<string, string> | null;
    /** Aceita leiaute 2.x e XML sem namespace (backup do IOB), com aviso. */
    leiautesAntigos?: boolean;
}

/**
 * Avisos repetidos em muitos arquivos ("arquivo: mensagem") viram uma linha só,
 * com a quantidade e um exemplo; os demais ficam como estão.
 */
export function agruparAvisos(avisos: string[], minimo = 3): string[] {
    const porMsg = new Map<string, string[]>();
    const soltos: string[] = [];
    for (const a of avisos) {
        const m = a.match(/^(.+?\.xml(?:#\d+)?|[^:]+\/[^:]+): (.+)$/);
        if (!m) { soltos.push(a); continue; }
        porMsg.set(m[2], [...(porMsg.get(m[2]) ?? []), m[1]]);
    }
    const r = [...soltos];
    for (const [msg, arquivos] of porMsg) {
        if (arquivos.length < minimo) r.push(...arquivos.map(f => `${f}: ${msg}`));
        else r.push(`${arquivos.length} arquivo(s): ${msg} Ex.: ${arquivos[0]}`);
    }
    return [...new Set(r)];
}

const SEM_RETORNO = 'Sem retorno de processamento 201 associado; aceitação não comprovada.';

export function prepararImportacao(fontes: FonteXml[], empresa: { id: string; cnpj: string }, corte: string, existentes: FichaFuncionario[], opcoes: OpcoesImportacao = {}): PreviaImportacao {
    const eventos: Evento[] = []; const avisos: string[] = [];
    let semRecibo = 0;
    for (const f of fontes) {
        try {
            const r = lerXml(f, { leiautesAntigos: opcoes.leiautesAntigos });
            avisos.push(...r.avisos);
            for (const e of r.eventos) {
                const rec = opcoes.recibos && !e.recibo ? opcoes.recibos.get(chaveIdEvento(e.id)) : undefined;
                if (rec) eventos.push({ ...e, recibo: rec, processado: true, avisos: e.avisos.filter(a => a !== SEM_RETORNO) });
                else if (opcoes.recibos && !e.processado) semRecibo++;
                else eventos.push(e);
            }
        }
        catch (e) { avisos.push(`${f.nome}: ${(e as Error).message}`); }
    }
    if (semRecibo) avisos.push(`${semRecibo} evento(s) sem recibo no IOB (envio recusado ou não concluído) ficaram de fora.`);
    // Mesma regra da implantação: admissão retificada com recibo vale como cadastro provisório.
    const consolidado = consolidar(eventos, empresa.cnpj, corte, [], { revisarAdmissaoRetificada: true });
    avisos.push(...consolidado.avisos);
    const porId = new Map(existentes.map(f => [f.id, f]));
    const resultados = consolidado.cadastros
        .map(c => mesclarComEsocial(porId.get(fichaDoEsocial(c, empresa).id), fichaDoEsocial(c, empresa)))
        .sort((a, b) => (a.ficha.dados.nome ?? '').localeCompare(b.ficha.dados.nome ?? '', 'pt-BR'));
    return { resultados, avisos: agruparAvisos(avisos) };
}

/** Só o que muda alguma coisa vai para gravação. */
export const paraGravar = (p: PreviaImportacao) => p.resultados.filter(r => r.novo || r.alteracoes.length > 0);
