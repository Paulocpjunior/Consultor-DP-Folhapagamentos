// services/calculo/importacaoValores.ts
//
// Importação de valores (a "Importações › Valores" do SAGE): o arquivo de lançamentos do mês entra direto no movimento
// do Consultor, sem digitar evento a evento. Lê o layout oficial de importação de ponto do IOB SAGE FOLHAMATIC (o mesmo
// que o Apontamento gera: services/folha/apontamentoExporter.ts, documento da IOB de 25/09/2026):
//   windows3 — 40 posições: 001-006 código do funcionário · 007-010 evento · 011-024 referência (6 decimais)
//              · 025-026 brancos · 027-040 valor (2 decimais);
//   windows4 — 50 posições: os mesmos 40 e 041-044 código da empresa · 045-050 competência (MMAAAA).
// Cada linha vira um "Lançar evento" (services/calculo/lancarEvento.ts): pelo cadastro do evento do IOB, horas, dias e
// percentuais viram valor pelo salário do mês, e os eventos que o motor conhece vão ao campo próprio do movimento.
// O funcionário é achado pelo código do IOB da ficha (dados.codigoIob). Puro, sem Firebase.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import { fichaNaCompetencia } from '../cadastros/funcionarios';
import type { EventoIobSage } from '../folha/folhaTypes';
import { eventoPorCodigo, lancarEvento, tipoDaReferencia } from './lancarEvento';
import { salarioContratual, type Movimento } from './motorMensal';
import type { FormulaEvento } from './formulaEvento';

export interface LinhaValores {
    linha: number;
    codigoFuncionario: string;
    evento: string;
    /** Referência (horas, dias, %) com até 6 decimais; 0 se a linha traz valor. */
    referencia: number;
    /** Valor em reais (centavos); 0 se a linha traz referência. */
    valor: number;
    /** windows4: empresa e competência (AAAA-MM) do próprio arquivo. */
    empresa?: string;
    competencia?: string;
}

export interface LeituraValores { layout: 'windows3' | 'windows4' | ''; linhas: LinhaValores[]; erros: string[] }

/** Lê o TXT (40 ou 50 posições por linha). */
export function lerValoresIob(texto: string): LeituraValores {
    const r: LeituraValores = { layout: '', linhas: [], erros: [] };
    const brutas = texto.replace(/\r/g, '').split('\n');
    brutas.forEach((b, i) => {
        if (!b.trim()) return;
        const n = i + 1;
        const l = b.replace(/\s+$/, '');
        const tam = l.length > 40 ? 50 : 40;
        const t = l.padEnd(tam, ' ');
        if (b.length > 50 || (l.length > 40 && l.length < 45)) { r.erros.push(`Linha ${n}: ${b.length} posições; o layout tem 40 (windows3) ou 50 (windows4).`); return; }
        const cod = t.slice(0, 6); const ev = t.slice(6, 10); const ref = t.slice(10, 24); const val = t.slice(26, 40);
        if (!/^\d{6}$/.test(cod) || !/^\d{4}$/.test(ev) || !/^\d{14}$/.test(ref) || !/^\d{14}$/.test(val)) { r.erros.push(`Linha ${n}: fora do layout (código do funcionário, evento, referência e valor numéricos).`); return; }
        const linha: LinhaValores = { linha: n, codigoFuncionario: String(Number(cod)), evento: ev, referencia: Number(ref) / 1e6, valor: Number(val) };
        if (tam === 50) {
            const emp = t.slice(40, 44).trim(); const comp = t.slice(44, 50);
            if (!/^(0[1-9]|1[0-2])\d{4}$/.test(comp)) { r.erros.push(`Linha ${n}: competência ${comp} inválida (MMAAAA).`); return; }
            linha.empresa = emp; linha.competencia = `${comp.slice(2)}-${comp.slice(0, 2)}`;
        }
        if (linha.referencia > 0 && linha.valor > 0) { r.erros.push(`Linha ${n}: traz referência e valor; o IOB aceita um ou outro.`); return; }
        if (!(linha.referencia > 0) && !(linha.valor > 0)) { r.erros.push(`Linha ${n}: sem referência e sem valor.`); return; }
        r.layout = r.layout || (tam === 50 ? 'windows4' : 'windows3');
        if ((tam === 50 ? 'windows4' : 'windows3') !== r.layout) { r.erros.push(`Linha ${n}: o arquivo mistura os layouts de 40 e 50 posições.`); return; }
        r.linhas.push(linha);
    });
    if (!r.linhas.length && !r.erros.length) r.erros.push('Arquivo vazio.');
    return r;
}

export interface ResultadoLinha { linha: LinhaValores; fichaId?: string; nome?: string; mensagem: string; ok: boolean }
export interface AplicacaoValores { movimentos: Record<string, Movimento>; resultados: ResultadoLinha[]; ignoradas: number }

/**
 * Aplica as linhas ao movimento do mês de cada funcionário (o gravado ou o em edição). Linhas de outra empresa ou de
 * outra competência (windows4) ficam de fora, com o motivo.
 */
export function aplicarValores(p: {
    linhas: LinhaValores[]; competencia: string; codigoEmpresa: string;
    fichas: FichaFuncionario[]; eventos: EventoIobSage[]; movimentos: Record<string, Movimento>;
    /** Fórmulas próprias da empresa por código de evento: valem sobre a rotina do cadastro. */
    formulas?: Record<string, FormulaEvento>;
}): AplicacaoValores {
    const movimentos: Record<string, Movimento> = { ...p.movimentos };
    const resultados: ResultadoLinha[] = [];
    const porCodigo = new Map<string, FichaFuncionario[]>();
    for (const f of p.fichas) {
        const c = String(Number((f.dados.codigoIob ?? '').replace(/\D/g, '') || 'NaN'));
        if (c !== 'NaN') porCodigo.set(c, [...(porCodigo.get(c) ?? []), f]);
    }
    const empresa = p.codigoEmpresa.trim().replace(/^0+/, '');
    for (const l of p.linhas) {
        const fora = (m: string) => resultados.push({ linha: l, mensagem: m, ok: false });
        if (l.competencia && l.competencia !== p.competencia) { fora(`competência ${l.competencia} do arquivo; a ativa é ${p.competencia}.`); continue; }
        if (l.empresa && empresa && l.empresa.replace(/^0+/, '') !== empresa) { fora(`empresa ${l.empresa} do arquivo; a ativa é ${p.codigoEmpresa}.`); continue; }
        const fs = (porCodigo.get(l.codigoFuncionario) ?? []).filter(f => f.situacao === 'ativo' || (f.dados.dataDesligamento ?? '') >= `${p.competencia}-01`);
        if (!fs.length) { fora(`funcionário de código ${l.codigoFuncionario} no IOB não está nas fichas (Código no IOB).`); continue; }
        if (fs.length > 1) { fora(`código ${l.codigoFuncionario} em mais de uma ficha ativa: corrija o "Código no IOB".`); continue; }
        const f = fs[0];
        const ev = eventoPorCodigo(p.eventos, l.evento);
        if (!ev) { resultados.push({ linha: l, fichaId: f.id, nome: f.dados.nome, mensagem: `evento ${l.evento} não está no catálogo de eventos do IOB.`, ok: false }); continue; }
        const formula = p.formulas?.[ev.codigo];
        const tipo = formula ? formula.referencia : tipoDaReferencia(ev);
        let ref: number;
        // Evento por valor: a referência do Lançar evento é em centavos (como a tela lê).
        if (tipo === 'nenhuma') ref = 0;
        else if (tipo === 'valor') ref = l.valor > 0 ? l.valor : Math.round(l.referencia * 100);
        else if (l.referencia > 0) ref = l.referencia;
        else { resultados.push({ linha: l, fichaId: f.id, nome: f.dados.nome, mensagem: `evento ${ev.codigo} ${ev.descricao} é por ${tipo}, e a linha traz valor.`, ok: false }); continue; }
        const sc = salarioContratual(fichaNaCompetencia(f, p.competencia).ficha.dados);
        const sal = 'erro' in sc ? null : { mensal: sc.mensal, horasMes: sc.horasMes };
        const res = lancarEvento(ev, ref, sal, movimentos[f.id] ?? {}, formula);
        if ('erro' in res) { resultados.push({ linha: l, fichaId: f.id, nome: f.dados.nome, mensagem: res.erro, ok: false }); continue; }
        movimentos[f.id] = res.movimento;
        resultados.push({ linha: l, fichaId: f.id, nome: f.dados.nome, mensagem: res.mensagem, ok: true });
    }
    return { movimentos, resultados, ignoradas: resultados.filter(r => !r.ok).length };
}
