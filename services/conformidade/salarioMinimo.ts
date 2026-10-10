// services/conformidade/salarioMinimo.ts
//
// Salário contratual × salário mínimo:
// - federal (CF, art. 7º, IV; vale em todo o território nacional): abaixo dele é erro. Na jornada menor que a
//   de 44 horas, o mínimo é proporcional às horas (TST, OJ 358 da SDI-1); o aprendiz tem o mínimo-hora
//   garantido (CLT, art. 428, § 2º), também proporcional;
// - estadual (piso regional da LC 103/2000, por UF, como o de São Paulo): vale para quem não tem piso definido
//   em lei federal, convenção ou acordo coletivo. Abaixo do menor piso da UF é aviso, para conferir a categoria
//   e a convenção (com a convenção cadastrada, o piso dela prevalece).
// A UF é a da empresa (o local de trabalho).

import { salarioContratual } from '../calculo/motorMensal';
import { fichaNaData, type FichaFuncionario } from '../cadastros/funcionarios';
import { reais } from '../cadastros/documentos';
import { rotuloCompetencia, tabelaVigente, type TabelaLegal } from '../cadastros/tabelasLegais';

export type NivelAlerta = 'erro' | 'aviso';
export interface AlertaConformidade { fichaId: string; nome: string; nivel: NivelAlerta; regra: string; mensagem: string }

const HORAS_PADRAO = 220;

/** O mínimo proporcional à jornada (horas do mês da ficha ÷ 220). */
export const minimoProporcional = (minimo: number, horasMes: number) => Math.round(minimo * Math.min(1, horasMes / HORAS_PADRAO));

export interface ResultadoMinimos { federal: number | null; estadual: { uf: string; norma: string; menor: number; pisos: { descricao: string; valor: number }[] } | null; avisos: string[] }

/** Mínimos vigentes na competência: o federal e o da UF (quando a UF tem piso regional cadastrado). */
export function minimosVigentes(tabelas: TabelaLegal[], uf: string, competencia: string): ResultadoMinimos {
    const avisos: string[] = [];
    const f = tabelaVigente(tabelas, 'salario_minimo', competencia);
    const federal = 'erro' in f ? null : f.tabela.valores.salarioMinimo ?? null;
    if ('erro' in f) avisos.push(`${f.erro} (Cadastros › Tabelas legais).`);
    let estadual: ResultadoMinimos['estadual'] = null;
    if (!uf) avisos.push('Empresa sem UF no cadastro (Empresas › editar): sem a conferência do salário mínimo estadual.');
    else {
        const e = tabelaVigente(tabelas, 'salario_minimo_estadual', competencia, uf);
        if (!('erro' in e) && e.tabela.pisos?.length) {
            const pisos = e.tabela.pisos;
            estadual = { uf, norma: e.tabela.norma, menor: Math.min(...pisos.map(x => x.valor)), pisos };
        }
    }
    return { federal, estadual, avisos };
}

export function conferirSalarioMinimo(fichas: FichaFuncionario[], tabelas: TabelaLegal[], uf: string, competencia: string): { alertas: AlertaConformidade[]; avisos: string[] } {
    const m = minimosVigentes(tabelas, uf, competencia);
    const alertas: AlertaConformidade[] = [];
    const [a, mm] = competencia.split('-').map(Number);
    const fimMes = `${competencia}-${String(new Date(Date.UTC(a, mm, 0)).getUTCDate()).padStart(2, '0')}`;
    for (const f of fichas) {
        // O salário vigente no fim da competência, pelo histórico.
        const d = fichaNaData(f, fimMes).ficha.dados;
        if (!d.admissao || d.admissao > fimMes || (d.dataDesligamento && d.dataDesligamento < `${competencia}-01`)) continue;
        if (d.categoria && !/^1\d\d$/.test(d.categoria)) continue;
        if (d.categoria === '111') continue; // intermitente: por hora trabalhada
        const sc = salarioContratual(d);
        if ('erro' in sc) continue;
        const nome = d.nome || f.cpf;
        const jornada = sc.horasMes < HORAS_PADRAO ? ` (proporcional a ${sc.horasMes.toLocaleString('pt-BR')} h/mês)` : '';
        if (m.federal) {
            const min = minimoProporcional(m.federal, sc.horasMes);
            if (sc.mensal < min) {
                alertas.push({ fichaId: f.id, nome, nivel: 'erro', regra: 'minimo-federal', mensagem: `Salário ${reais(sc.mensal)} abaixo do mínimo federal de ${rotuloCompetencia(competencia)}: ${reais(min)}${jornada} (CF, art. 7º, IV).` });
                continue;
            }
        }
        if (m.estadual) {
            const min = minimoProporcional(m.estadual.menor, sc.horasMes);
            if (sc.mensal < min) alertas.push({ fichaId: f.id, nome, nivel: 'aviso', regra: 'minimo-estadual',
                mensagem: `Salário ${reais(sc.mensal)} abaixo do menor piso estadual de ${m.estadual.uf}: ${reais(min)}${jornada} (${m.estadual.norma}). Vale para quem não tem piso em lei federal, convenção ou acordo coletivo (LC 103/2000): confira a categoria e a convenção.` });
        }
    }
    return { alertas: alertas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), avisos: m.avisos };
}
