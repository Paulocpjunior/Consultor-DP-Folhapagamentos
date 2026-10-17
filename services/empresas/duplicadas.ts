// services/empresas/duplicadas.ts
//
// Empresas cadastradas em dobro (mesmo código SAGE ou CNPJ, de antes da trava das chaves únicas). Paulo, 17/10/2026:
// "varias empresas estao duplicadas". Excluir o cadastro errado desliga funcionários, movimentos e folhas da empresa,
// então a recomendação sai do que está ligado a cada cadastro: só o cadastro sem nenhum dado pode ser excluído, e
// quem decide é o gestor, com confirmação. Nada é gravado aqui.

import type { Empresa } from './empresasTypes';

/** Quantos documentos de cada coleção estão ligados ao cadastro da empresa. */
export interface DadosDaEmpresa {
    funcionarios: number; movimentos: number; folhas: number; processos: number; esocial: number;
    afastamentos: number; rubricas: number; historico: number; fechamentos: number; guias: number; enquadramentos: number;
    /** Carteiras de colaboradores que incluem este cadastro (não são dados da empresa, mas o acesso de alguém). */
    carteiras: number;
}

export const ROTULO_DADOS: Record<Exclude<keyof DadosDaEmpresa, 'carteiras'>, string> = {
    funcionarios: 'funcionários', movimentos: 'movimentos', folhas: 'folhas gravadas', processos: 'férias/13º/rescisões',
    esocial: 'envios do eSocial', afastamentos: 'afastamentos', rubricas: 'rubricas', historico: 'histórico do SAGE',
    fechamentos: 'fechamentos', guias: 'guias', enquadramentos: 'enquadramentos',
};

export const totalDeDados = (d: DadosDaEmpresa) =>
    (Object.keys(ROTULO_DADOS) as (keyof typeof ROTULO_DADOS)[]).reduce((s, k) => s + d[k], 0);

/** "12 funcionários, 30 movimentos" (só o que tem). */
export const resumoDados = (d: DadosDaEmpresa) =>
    (Object.keys(ROTULO_DADOS) as (keyof typeof ROTULO_DADOS)[]).filter(k => d[k] > 0).map(k => `${d[k]} ${ROTULO_DADOS[k]}`).join(', ') || 'nenhum dado';

export type Recomendacao = 'manter' | 'excluir' | 'tirar-da-carteira' | 'unir';
export interface AnaliseCadastro { empresa: Empresa; dados: DadosDaEmpresa; recomendacao: Recomendacao; motivo: string }

const quando = (e: Empresa) => {
    const c = e.criadoEm as { toMillis?: () => number; seconds?: number } | undefined;
    return c?.toMillis?.() ?? (c?.seconds ?? Number.MAX_SAFE_INTEGER / 1000) * 1000;
};

/**
 * Para um grupo de cadastros repetidos: mantém o que tem dados; o vazio pode ser excluído (se não estiver na carteira
 * de ninguém); dois ou mais com dados não se resolvem excluindo — os dados precisam ser unidos antes. Sem dados em
 * nenhum, fica o mais antigo.
 */
export function analisarRepetidas(empresas: Empresa[], dados: Map<string, DadosDaEmpresa>): AnaliseCadastro[] {
    const vazio: DadosDaEmpresa = { funcionarios: 0, movimentos: 0, folhas: 0, processos: 0, esocial: 0, afastamentos: 0, rubricas: 0, historico: 0, fechamentos: 0, guias: 0, enquadramentos: 0, carteiras: 0 };
    const linhas = empresas.map(e => ({ empresa: e, dados: dados.get(e.id) ?? vazio }));
    const comDados = linhas.filter(l => totalDeDados(l.dados) > 0);
    if (comDados.length >= 2) {
        return linhas.map(l => totalDeDados(l.dados) > 0
            ? { ...l, recomendacao: 'unir' as const, motivo: `Tem dados (${resumoDados(l.dados)}) e há outro cadastro com dados: não exclua; os dados precisam ser unidos num cadastro só.` }
            : vazioSemUso(l, 'Sem dados; o cadastro repetido com dados fica.'));
    }
    const manter = comDados[0] ?? [...linhas].sort((a, b) => quando(a.empresa) - quando(b.empresa))[0];
    return linhas.map(l => (l === manter
        ? { ...l, recomendacao: 'manter' as const, motivo: comDados.length ? `É o cadastro em uso (${resumoDados(l.dados)}).` : 'Nenhum dos cadastros tem dados: fica o mais antigo.' }
        : vazioSemUso(l, `Sem dados; fica o cadastro "${manter.empresa.nomeFantasia || manter.empresa.razaoSocial}".`)));
}

function vazioSemUso(l: { empresa: Empresa; dados: DadosDaEmpresa }, base: string): AnaliseCadastro {
    if (l.dados.carteiras > 0) {
        return { ...l, recomendacao: 'tirar-da-carteira', motivo: `${base} Está na carteira de ${l.dados.carteiras} colaborador(es): troque pelo cadastro que fica em Usuários › Carteira antes de excluir.` };
    }
    return { ...l, recomendacao: 'excluir', motivo: `${base} Pode ser excluído.` };
}
