// services/calculo/repasseConsignado.ts
//
// Relatório de repasse do Crédito do Trabalhador por competência (etapa 4 do estudo, F5 e F8): por trabalhador e
// contrato, o devido, o descontado na folha ou na rescisão gravadas e o motivo da diferença; o total por instituição;
// e o vencimento da guia do FGTS Digital (dia 20 do mês seguinte, antecipado para o dia útil anterior), que leva o
// consignado lido do S-5003. Vencido sem pagamento, só pelo FGTS Digital com encargos (Portaria MTE 506/2026). Puro.

import type { FichaFuncionario } from '../cadastros/funcionarios';
import type { ResultadoCalculo, Verba } from './motorMensal';
import { contratosNoMes, type ContratoConsignado } from './consignado';
import { vencimentosDaCompetencia } from '../prazos/obrigacoes';
import { codigoDaFicha } from '../relatorios/holeriteEnvio';

export type SituacaoRepasse = 'total' | 'parcial' | 'nao-descontado' | 'rescisao' | 'sem-calculo' | 'fora-da-ficha';
export const ROTULO_SITUACAO_REPASSE: Record<SituacaoRepasse, string> = {
    total: 'Descontado inteiro', parcial: 'Desconto parcial', 'nao-descontado': 'Não descontado', rescisao: 'Rescisão',
    'sem-calculo': 'Sem cálculo gravado', 'fora-da-ficha': 'Fora dos contratos da ficha',
};

export interface LinhaRepasse {
    fichaId: string; nome: string; cpf: string; codigo: string;
    instFinanc: string; nrDoc: string;
    /** Parcela do mês (folha) ou, na rescisão, o saldo devedor; null quando não se sabe. */
    devido: number | null;
    descontado: number;
    situacao: SituacaoRepasse;
    motivo: string;
    /** Doméstico: o eSocial Doméstico lança o desconto e o valor vai no DAE, fora da guia do FGTS Digital. */
    dae?: boolean;
}
export interface RepassePorInstituicao { instFinanc: string; contratos: number; valor: number }
export interface RepasseConsignado {
    competencia: string;
    /** Vencimento da guia do FGTS Digital da competência (AAAA-MM-DD). */
    vencimento: string;
    vencido: boolean;
    linhas: LinhaRepasse[];
    porInstituicao: RepassePorInstituicao[];
    /** Total da guia do FGTS Digital (sem os domésticos). */
    total: number;
    /** Descontado de domésticos: vai no DAE do eSocial Doméstico. */
    totalDae: number;
    avisos: string[];
}

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const br = (d: string) => d.split('-').reverse().join('/');
const doContrato = (c: Pick<ContratoConsignado, 'instFinanc' | 'nrDoc'>) => (v: Verba) => v.codigo === 'CONSIG' && v.descFolha?.instFinanc === c.instFinanc && v.descFolha?.nrDoc === c.nrDoc;
const soma = (vs: Verba[]) => vs.reduce((s, v) => s + v.valor, 0);
const temSalario = (r: ResultadoCalculo) => r.verbas.some(v => v.tipo === 'provento' && v.inss && !v.informativa);

/**
 * Monta o repasse da competência pela folha mensal gravada e pelas rescisões gravadas do mês. `hoje` (AAAA-MM-DD) só
 * decide se a guia já venceu.
 */
export function repasseConsignado(competencia: string, fichas: FichaFuncionario[], folha: ResultadoCalculo[], rescisoes: ResultadoCalculo[], hoje: string): RepasseConsignado {
    const vencimento = vencimentosDaCompetencia(competencia).find(v => v.id.startsWith('fgts-'))!.data;
    const linhas: LinhaRepasse[] = [];
    const avisos: string[] = [];
    const porFicha = new Map(fichas.map(f => [f.id, f]));
    const base = (f: FichaFuncionario | undefined, r: ResultadoCalculo | undefined) => ({
        fichaId: f?.id ?? r?.fichaId ?? '', nome: f?.dados.nome || r?.nome || f?.cpf || '', cpf: f?.cpf ?? '', codigo: f ? codigoDaFicha(f) : '',
    });
    const rescindidos = new Set(rescisoes.map(r => r.fichaId));

    for (const r of folha) {
        const f = porFicha.get(r.fichaId);
        const contratos = contratosNoMes(f?.consignados, competencia);
        for (const c of contratos) {
            const descontado = soma(r.verbas.filter(doContrato(c)));
            const situacao: SituacaoRepasse = descontado >= c.parcela ? 'total' : descontado > 0 ? 'parcial' : 'nao-descontado';
            const dae = f?.dados.categoria === '104';
            const motivo = dae ? 'Doméstico: o eSocial Doméstico lança o desconto e aplica os 35%; o valor vai no DAE, fora da guia do FGTS Digital. Confira lá.'
                : situacao === 'total' ? ''
                : rescindidos.has(r.fichaId) ? 'Desligado no mês: o desconto vai pela rescisão (garantia e saldo devedor).'
                : !temSalario(r) ? 'Sem remuneração com INSS no mês (afastado o mês todo ou salário-maternidade pago pelo INSS): nada a descontar; o trabalhador paga direto à instituição.'
                : `Margem de 35% esgotada: ${reais(c.parcela - descontado)} ficam com o trabalhador, avisado no holerite.`;
            linhas.push({ ...base(f, r), instFinanc: c.instFinanc, nrDoc: c.nrDoc, devido: c.parcela, descontado, situacao, motivo, ...(dae ? { dae } : {}) });
        }
        // Desconto do consignado sem contrato correspondente na ficha (contrato apagado ou alterado depois do cálculo).
        for (const v of r.verbas.filter(v => v.codigo === 'CONSIG' && v.descFolha && !contratos.some(c => doContrato(c)(v)))) {
            linhas.push({ ...base(f, r), instFinanc: v.descFolha!.instFinanc, nrDoc: v.descFolha!.nrDoc, devido: null, descontado: v.valor, situacao: 'fora-da-ficha', motivo: 'O contrato não está mais na ficha para esta competência: confira com o arquivo do Portal.' });
        }
    }

    for (const r of rescisoes) {
        const f = porFicha.get(r.fichaId);
        const contratos = contratosNoMes(f?.consignados, competencia);
        for (const c of contratos) {
            const descontado = soma(r.verbas.filter(doContrato(c)));
            const motivo = c.garantiaRescisao === undefined ? 'Sem a garantia informada: nada descontado; consulte o Portal.'
                : c.garantiaRescisao === 0 ? 'Sem garantia das verbas rescisórias: nada a descontar.'
                : descontado && c.saldoRescisao !== undefined && descontado < c.saldoRescisao ? `Limitado à garantia de ${c.garantiaRescisao}%: o saldo restante fica entre o trabalhador e a instituição.` : '';
            linhas.push({ ...base(f, r), instFinanc: c.instFinanc, nrDoc: c.nrDoc, devido: c.garantiaRescisao ? c.saldoRescisao ?? null : 0, descontado, situacao: 'rescisao', motivo });
        }
        for (const v of r.verbas.filter(v => v.codigo === 'CONSIG' && v.descFolha && !contratos.some(c => doContrato(c)(v)))) {
            linhas.push({ ...base(f, r), instFinanc: v.descFolha!.instFinanc, nrDoc: v.descFolha!.nrDoc, devido: null, descontado: v.valor, situacao: 'fora-da-ficha', motivo: 'O contrato não está mais na ficha: confira com o Portal.' });
        }
    }

    // Contratos vigentes de quem não tem folha nem rescisão gravada na competência.
    const calculados = new Set([...folha, ...rescisoes].map(r => r.fichaId));
    for (const f of fichas) {
        if (calculados.has(f.id) || f.situacao === 'desligado' && (f.dados.dataDesligamento ?? '').slice(0, 7) < competencia) continue;
        for (const c of contratosNoMes(f.consignados, competencia)) {
            linhas.push({ ...base(f, undefined), instFinanc: c.instFinanc, nrDoc: c.nrDoc, devido: c.parcela, descontado: 0, situacao: 'sem-calculo', motivo: 'Sem folha ou rescisão gravada na competência: grave o cálculo para entrar no repasse.' });
        }
    }

    linhas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || a.nrDoc.localeCompare(b.nrDoc));
    const mapa = new Map<string, RepassePorInstituicao>();
    for (const l of linhas.filter(l => l.descontado > 0 && !l.dae)) {
        const i = mapa.get(l.instFinanc) ?? { instFinanc: l.instFinanc, contratos: 0, valor: 0 };
        i.contratos += 1; i.valor += l.descontado;
        mapa.set(l.instFinanc, i);
    }
    const porInstituicao = [...mapa.values()].sort((a, b) => a.instFinanc.localeCompare(b.instFinanc));
    const total = porInstituicao.reduce((s, i) => s + i.valor, 0);
    const totalDae = linhas.filter(l => l.dae).reduce((s, l) => s + l.descontado, 0);

    const semCalculo = linhas.filter(l => l.situacao === 'sem-calculo').length;
    if (semCalculo) avisos.push(`${semCalculo} contrato(s) vigente(s) sem folha ou rescisão gravada na competência: grave os cálculos antes de conferir a guia.`);
    if (linhas.some(l => l.situacao === 'fora-da-ficha')) avisos.push('Há desconto de consignado sem contrato correspondente na ficha: confira com o arquivo do Portal Emprega Brasil e, se for o caso, retifique o S-1200.');
    const vencido = hoje > vencimento;
    if (total > 0) {
        avisos.push(`Total de ${reais(total)} a recolher na guia do FGTS Digital da competência até ${br(vencimento)} (dia 20, antecipado se não for dia útil). O FGTS Digital lê o consignado do S-5003: confira a guia com este relatório.`);
        if (vencido) avisos.push(`Guia vencida em ${br(vencimento)}: se o consignado não foi pago, regularize só pelo FGTS Digital, com IPCA, juros de 0,033% ao dia e multa de 2% (Portaria MTE 506/2026, a partir da competência 02/2026). A empresa responde como devedora solidária pelo que não repassar.`);
    }
    if (totalDae) avisos.push(`Domésticos: ${reais(totalDae)} descontados vão no DAE do eSocial Doméstico, fora da guia do FGTS Digital e do total acima.`);
    avisos.push('Retificação de mês já pago ou vencido não muda o débito no FGTS Digital: acerte com a instituição. Transferência no grupo ou sucessão: a nova empresa só desconta quando o Portal mostrar o contrato no CNPJ dela.');
    return { competencia, vencimento, vencido, linhas, porInstituicao, total, totalDae, avisos };
}

/** Descontos do consignado (rubrica CONSIG, com descFolha) da folha e das rescisões gravadas, por CPF e contrato, para a conferência com o S-5003. */
export function consignadoDaFolha(resultados: ResultadoCalculo[], fichas: FichaFuncionario[]): { cpf: string; instFinanc: string; nrDoc: string; valor: number }[] {
    const cpf = new Map(fichas.map(f => [f.id, f.cpf]));
    return resultados.flatMap(r => r.verbas.filter(v => v.codigo === 'CONSIG' && v.descFolha && cpf.get(r.fichaId))
        .map(v => ({ cpf: cpf.get(r.fichaId)!, instFinanc: v.descFolha!.instFinanc, nrDoc: v.descFolha!.nrDoc, valor: v.valor })));
}
