// services/calculo/folhaGravada.ts
//
// Folha do mês gravada (como o processamento do SAGE): os holerites calculados ficam guardados em
// folhas_gravadas/{empresa}_{AAAA-MM}. Encerrado o mês no Fim de mês, a gravação não muda mais e é ela
// que vale (telas, PDFs e eSocial); mudar a ficha depois não altera a folha encerrada.

import type { ResultadoCalculo } from './motorMensal';

export interface TotaisFolha { funcionarios: number; proventos: number; descontos: number; liquido: number; fgts: number }

export interface FolhaGravada {
    empresaId: string;
    competencia: string;
    pagamento: string;
    gravadoPorEmail: string;
    gravadoEm?: Date;
    totais: TotaisFolha;
    holerites: ResultadoCalculo[];
}

export const idFolhaGravada = (empresaId: string, competencia: string) => `${empresaId}_${competencia}`;

/** O holerite como vai para o Firestore: sem campos indefinidos (o Firestore recusa undefined). */
export const prepararHolerite = (r: ResultadoCalculo): ResultadoCalculo => JSON.parse(JSON.stringify(r));

export function totaisDaFolha(rs: ResultadoCalculo[]): TotaisFolha {
    const t: TotaisFolha = { funcionarios: 0, proventos: 0, descontos: 0, liquido: 0, fgts: 0 };
    for (const r of rs) {
        if (r.situacao === 'erro') continue;
        t.funcionarios++; t.proventos += r.totais.proventos; t.descontos += r.totais.descontos; t.liquido += r.totais.liquido; t.fgts += r.fgts;
    }
    return t;
}

/** Erros que impedem gravar: funcionário com erro de cálculo. */
export const errosParaGravar = (rs: ResultadoCalculo[]) => rs.filter(r => r.situacao === 'erro').map(r => `${r.nome}: ${r.erros[0] ?? 'erro no cálculo'}`);

export interface Diferenca { fichaId: string; nome: string; detalhe: string }

/** O que o cálculo de hoje dá de diferente da folha gravada (líquido, bases, FGTS, funcionário a mais ou a menos). */
export function diferencasDaGravada(gravada: ResultadoCalculo[], atual: ResultadoCalculo[]): Diferenca[] {
    const out: Diferenca[] = [];
    const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const porId = new Map(atual.map(r => [r.fichaId, r]));
    for (const g of gravada) {
        const a = porId.get(g.fichaId);
        if (!a) { out.push({ fichaId: g.fichaId, nome: g.nome, detalhe: 'não aparece mais no cálculo de hoje' }); continue; }
        const campos: [string, number, number][] = [['líquido', g.totais.liquido, a.totais.liquido], ['base do INSS', g.bases.inss, a.bases.inss], ['base do IRRF', g.bases.irrf, a.bases.irrf], ['FGTS', g.fgts, a.fgts]];
        const mud = campos.filter(([, x, y]) => x !== y).map(([n, x, y]) => `${n} ${reais(x)} → ${reais(y)}`);
        if (mud.length) out.push({ fichaId: g.fichaId, nome: g.nome, detalhe: mud.join('; ') });
        porId.delete(g.fichaId);
    }
    for (const a of porId.values()) if (a.situacao !== 'erro') out.push({ fichaId: a.fichaId, nome: a.nome, detalhe: 'não estava na folha gravada' });
    return out;
}
