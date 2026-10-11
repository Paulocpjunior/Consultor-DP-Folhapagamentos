// services/sindicatos/contribuicoes.ts
//
// O que a convenção coletiva leva para o cálculo:
// - Descontos para o sindicato, cada um com a sua regra de quem paga:
//   - contribuição sindical (CLT, arts. 578, 579 e 582): só de quem autorizou prévia e expressamente, por escrito e
//     individualmente (ADI 5.794); um dia de trabalho, na folha de março, salvo outra regra cadastrada;
//   - contribuição assistencial ou negocial (CLT, art. 513, "e"): de todos da categoria, se a convenção prever e garantir
//     o direito de oposição (STF, Tema 935); quem se opôs não paga;
//   - contribuição confederativa: só dos filiados ao sindicato (STF, Súmula Vinculante 40);
//   - mensalidade associativa: só dos filiados.
// - Aviso prévio além da Lei 12.506/2011: dias a mais na dispensa sem justa causa, por idade e tempo de casa.
// A regra de cada um vem da convenção cadastrada; a autorização, a oposição e a filiação vêm da ficha (aba Sindicato).

import { aniversario, somarDias } from '../prazos/calendario';
import { dataValida, reais } from '../cadastros/documentos';
import type { FichaFuncionario } from '../cadastros/funcionarios';

export type TipoContribuicao = 'sindical' | 'assistencial' | 'confederativa' | 'mensalidade';
export type FormaContribuicao = 'percentual' | 'valor' | 'dias';

export interface ContribuicaoConvencao {
    tipo: TipoContribuicao;
    /** Percentual do salário, valor fixo (centavos) ou dias de salário. */
    forma: FormaContribuicao;
    valor: number;
    /** Meses do desconto (1 a 12); vazio = todo mês. */
    meses: number[];
    /** Teto do desconto (centavos), quando a convenção limita. */
    teto: number | null;
    descricao: string;
}

export interface RegraAvisoConvencao {
    /** Idade mínima na data do desligamento (anos); null = qualquer. */
    idadeMinima: number | null;
    /** Tempo de casa mínimo (anos completos); null = qualquer. */
    anosMinimos: number | null;
    /** Dias de aviso além dos da Lei 12.506/2011. */
    diasAdicionais: number;
    descricao: string;
}

export const TIPOS_CONTRIBUICAO: Record<TipoContribuicao, { rotulo: string; codigo: string; regra: string }> = {
    sindical: { rotulo: 'Contribuição sindical', codigo: 'CONTSIND', regra: 'só com autorização prévia e expressa do empregado (CLT, art. 579)' },
    assistencial: { rotulo: 'Contribuição assistencial/negocial', codigo: 'CONTASSIST', regra: 'de todos, salvo quem exerceu o direito de oposição (STF, Tema 935)' },
    confederativa: { rotulo: 'Contribuição confederativa', codigo: 'CONTCONF', regra: 'só dos filiados ao sindicato (STF, Súmula Vinculante 40)' },
    mensalidade: { rotulo: 'Mensalidade associativa', codigo: 'MENSSIND', regra: 'só dos filiados ao sindicato' },
};

export const contribuicaoPadrao = (tipo: TipoContribuicao): ContribuicaoConvencao => (tipo === 'sindical'
    ? { tipo, forma: 'dias', valor: 1, meses: [3], teto: null, descricao: 'Um dia de trabalho, na folha de março (CLT, arts. 580 e 582)' }
    : { tipo, forma: 'percentual', valor: 0, meses: [], teto: null, descricao: '' });

export function validarContribuicoes(cs: ContribuicaoConvencao[]): string[] {
    const e: string[] = [];
    cs.forEach((c, i) => {
        const q = `${TIPOS_CONTRIBUICAO[c.tipo]?.rotulo ?? `Contribuição ${i + 1}`}`;
        if (!TIPOS_CONTRIBUICAO[c.tipo]) e.push(`Contribuição ${i + 1}: tipo inválido.`);
        if (!(c.valor > 0)) e.push(`${q}: informe o valor.`);
        else if (c.forma === 'percentual' && c.valor > 100) e.push(`${q}: percentual acima de 100%.`);
        else if (c.forma === 'dias' && c.valor > 30) e.push(`${q}: mais de 30 dias de salário.`);
        if (c.meses.some(m => !Number.isInteger(m) || m < 1 || m > 12)) e.push(`${q}: meses de 1 a 12.`);
        if (c.teto !== null && !(c.teto > 0)) e.push(`${q}: teto inválido.`);
    });
    const tipos = cs.map(c => c.tipo);
    if (new Set(tipos).size !== tipos.length) e.push('Cada tipo de contribuição só uma vez por convenção.');
    return e;
}

export function validarRegrasAviso(rs: RegraAvisoConvencao[]): string[] {
    const e: string[] = [];
    rs.forEach((r, i) => {
        if (!Number.isInteger(r.diasAdicionais) || r.diasAdicionais <= 0 || r.diasAdicionais > 180) e.push(`Aviso prévio, regra ${i + 1}: dias a mais entre 1 e 180.`);
        if (r.idadeMinima !== null && (r.idadeMinima < 14 || r.idadeMinima > 100)) e.push(`Aviso prévio, regra ${i + 1}: idade mínima inválida.`);
        if (r.anosMinimos !== null && (r.anosMinimos < 0 || r.anosMinimos > 60)) e.push(`Aviso prévio, regra ${i + 1}: tempo de casa inválido.`);
    });
    return e;
}

export interface DescontoSindical { codigo: string; descricao: string; referencia: string; valor: number }

/** Quem paga cada contribuição, pela ficha: autorização, oposição e filiação. */
function paga(tipo: TipoContribuicao, d: FichaFuncionario['dados']): boolean {
    if (tipo === 'sindical') return d.contribuicaoSindical === 'S';
    if (tipo === 'assistencial') return d.oposicaoAssistencial !== 'S';
    return d.associadoSindicato === 'S';
}

/**
 * Descontos para o sindicato na folha do mês. `mensal` é o salário contratual do mês e `diaria` o salário de um dia
 * (com o adicional fixo); quem não paga sai na memória com o motivo.
 */
export function descontosSindicais(contribuicoes: ContribuicaoConvencao[] | undefined, ficha: FichaFuncionario, competencia: string, mensal: number, diaria: number): { descontos: DescontoSindical[]; memoria: string[]; avisos: string[] } {
    const out = { descontos: [] as DescontoSindical[], memoria: [] as string[], avisos: [] as string[] };
    const mes = Number(competencia.slice(5, 7));
    for (const c of contribuicoes ?? []) {
        if (c.meses.length && !c.meses.includes(mes)) continue;
        const def = TIPOS_CONTRIBUICAO[c.tipo];
        if (!def) continue;
        if (!paga(c.tipo, ficha.dados)) { out.memoria.push(`${def.rotulo}: não descontada (${def.regra}).`); continue; }
        let valor = c.forma === 'percentual' ? Math.round(mensal * c.valor / 100) : c.forma === 'dias' ? Math.round(diaria * c.valor) : Math.round(c.valor);
        const ref = c.forma === 'percentual' ? `${String(c.valor).replace('.', ',')}%` : c.forma === 'dias' ? `${String(c.valor).replace('.', ',')} dia(s)` : '';
        const comTeto = c.teto !== null && valor > c.teto;
        if (comTeto) valor = c.teto!;
        if (valor <= 0) continue;
        out.descontos.push({ codigo: def.codigo, descricao: def.rotulo, referencia: ref, valor });
        out.memoria.push(`${def.rotulo} da convenção: ${c.forma === 'percentual' ? `${ref} de ${reais(mensal)}` : c.forma === 'dias' ? `${ref} × ${reais(Math.round(diaria))}` : 'valor fixo'}${comTeto ? `, limitada ao teto de ${reais(c.teto!)}` : ''} = ${reais(valor)} (${def.regra}).`);
    }
    if (out.descontos.some(x => x.codigo === 'CONTSIND') && ficha.dados.admissao && ficha.dados.admissao.slice(0, 7) === competencia)
        out.avisos.push('Contribuição sindical no mês da admissão: confira se o empregado já não pagou no ano por outro empregador (CLT, art. 602).');
    return out;
}

const anosCompletos = (de: string, ate: string) => { let n = 0; while (aniversario(de, n + 1) <= somarDias(ate, 1)) n++; return n; };

/** Dias de aviso a mais pela convenção, na data do desligamento: a regra cumprida que dá mais dias. */
export function avisoDaConvencao(regras: RegraAvisoConvencao[] | undefined, ficha: FichaFuncionario, data: string): { dias: number; regra: string } | null {
    const d = ficha.dados;
    if (!regras?.length || !dataValida(data) || !d.admissao || !dataValida(d.admissao)) return null;
    const idade = d.nascimento && dataValida(d.nascimento) ? anosCompletos(d.nascimento, data) : null;
    const casa = anosCompletos(d.admissao, data);
    const cumpre = regras.filter(r => (r.idadeMinima === null || (idade !== null && idade >= r.idadeMinima)) && (r.anosMinimos === null || casa >= r.anosMinimos));
    if (!cumpre.length) return null;
    const melhor = cumpre.reduce((a, b) => (b.diasAdicionais > a.diasAdicionais ? b : a));
    const cond = [melhor.idadeMinima !== null && `${melhor.idadeMinima} anos de idade ou mais`, melhor.anosMinimos !== null && `${melhor.anosMinimos} ano(s) de casa ou mais`].filter(Boolean).join(' e ');
    return { dias: melhor.diasAdicionais, regra: `${melhor.descricao || 'convenção coletiva'}${cond ? ` (${cond})` : ''}` };
}
