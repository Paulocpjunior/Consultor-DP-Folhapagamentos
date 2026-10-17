// services/empresas/duplicadas.ts
//
// Empresas cadastradas em dobro (mesmo código SAGE ou CNPJ, de antes da trava das chaves únicas). Paulo, 17/10/2026:
// "varias empresas estao duplicadas". Excluir o cadastro errado desliga da empresa tudo o que é dela, então a
// recomendação sai do que está ligado a cada cadastro: só o cadastro sem nenhum dado (nas coleções da empresa e nas
// configurações gravadas no próprio cadastro) pode ser excluído, e quem decide é o gestor, com confirmação. Coleção
// que não pôde ser conferida conta como dado. Nada é gravado aqui.

import type { Empresa } from './empresasTypes';
import { chaveCnpj, chaveSage } from './chavesUnicas';

/** O que está ligado ao cadastro da empresa. */
export interface DadosDaEmpresa {
    /** Documentos por coleção (empresaId ou id da empresa). */
    porColecao: Record<string, number>;
    /** Configurações gravadas no próprio cadastro (contas, eSocial da folha, benefícios, certificado…). */
    configuracoes: string[];
    /** Carteiras de colaboradores que incluem este cadastro (o acesso de alguém, não dado da empresa). */
    carteiras: number;
    /** Coleções que não puderam ser contadas: na dúvida, o cadastro não é vazio. */
    naoConferidas: string[];
}

export const ROTULO_COLECAO: Record<string, string> = {
    cadastro_funcionarios: 'funcionários', calculo_movimentos: 'movimentos', folhas_gravadas: 'folhas gravadas', processos_gravados: 'férias/13º/rescisões',
    esocial_envios: 'envios do eSocial', cadastro_afastamentos: 'afastamentos', cadastro_rubricas: 'rubricas', historico_sage: 'histórico do SAGE',
    fechamentos: 'fechamentos', pagamentos_guias: 'guias', cadastro_enquadramentos: 'enquadramentos', cadastro_cargos: 'cargos',
    cadastro_horarios: 'horários', cadastro_dsr: 'tabelas de DSR', departamentos: 'departamentos', lotacoes: 'lotações/obras',
    processos_trabalhistas: 'processos trabalhistas', folhas_complementares: 'folhas complementares', convocacoes_intermitente: 'convocações',
    contribuintes_individuais: 'contribuintes individuais', transferencias: 'transferências', processos_s1070: 'processos do S-1070',
    demissoes_previas: 'prévias de demissão', rescisoes_efetivacao: 'rescisões efetivadas', envios_funcionario: 'envios ao funcionário',
    esocial_s1010: 'pedidos do S-1010', conferencias_motor: 'conferências do motor', vt_itinerarios: 'itinerários de VT',
    obrigacoes_status: 'obrigações marcadas', fechamentos_pedidos: 'pedidos de reabertura', convencao_checklist: 'checklists de convenção',
    esocial_eventos: 'eventos do eSocial', esocial_fgts: 'registros do FGTS', modelos_documentos: 'modelos de documentos',
    contabil_folha: 'integração contábil', eventos_empresa: 'tabela de eventos da empresa',
};

/** Campos do cadastro que não são configuração (o que se digita ao cadastrar e os carimbos). */
const BASICOS = new Set(['id', 'cnpj', 'razaoSocial', 'nomeFantasia', 'codigoSage', 'uf', 'municipio', 'sindicatos', 'criadoPor', 'criadoEm', 'atualizadoEm']);
const preenchido = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length) && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length);
/** Configurações gravadas no próprio cadastro da empresa. */
export const configuracoesDoCadastro = (e: Record<string, unknown>) => Object.keys(e).filter(k => !BASICOS.has(k) && preenchido(e[k])).sort();

export const temDados = (d: DadosDaEmpresa) =>
    Object.values(d.porColecao).some(n => n > 0) || d.configuracoes.length > 0 || d.naoConferidas.length > 0;

/** "12 funcionários, 30 movimentos, configurações: esocialFolha" (só o que tem). */
export function resumoDados(d: DadosDaEmpresa): string {
    const partes = Object.entries(d.porColecao).filter(([, n]) => n > 0).map(([c, n]) => `${n} ${ROTULO_COLECAO[c] ?? c}`);
    if (d.configuracoes.length) partes.push(`configurações no cadastro (${d.configuracoes.join(', ')})`);
    if (d.naoConferidas.length) partes.push(`não conferido: ${d.naoConferidas.map(c => ROTULO_COLECAO[c] ?? c).join(', ')}`);
    return partes.join(', ') || 'nenhum dado';
}

export type Recomendacao = 'manter' | 'excluir' | 'tirar-da-carteira' | 'unir';
export interface AnaliseCadastro { empresa: Empresa; dados: DadosDaEmpresa; recomendacao: Recomendacao; motivo: string }

const VAZIO: DadosDaEmpresa = { porColecao: {}, configuracoes: [], carteiras: 0, naoConferidas: [] };
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
    const linhas = empresas.map(e => ({ empresa: e, dados: dados.get(e.id) ?? VAZIO }));
    const comDados = linhas.filter(l => temDados(l.dados));
    if (comDados.length >= 2) {
        return linhas.map(l => temDados(l.dados)
            ? { ...l, recomendacao: 'unir' as const, motivo: `Tem dados (${resumoDados(l.dados)}) e há outro cadastro com dados: não exclua; os dados precisam ser unidos num cadastro só.` }
            : vazioSemUso(l, 'Sem dados; o cadastro repetido com dados fica.'));
    }
    const manter = comDados[0] ?? [...linhas].sort((a, b) => quando(a.empresa) - quando(b.empresa))[0];
    return linhas.map(l => (l === manter
        ? { ...l, recomendacao: 'manter' as const, motivo: comDados.length ? `É o cadastro em uso (${resumoDados(l.dados)}).` : 'Nenhum dos cadastros tem dados: fica o mais antigo.' }
        : vazioSemUso(l, `Sem dados; fica o cadastro "${manter.empresa.nomeFantasia || manter.empresa.razaoSocial}" (id ${manter.empresa.id}).`)));
}

function vazioSemUso(l: { empresa: Empresa; dados: DadosDaEmpresa }, base: string): AnaliseCadastro {
    if (l.dados.carteiras > 0) {
        return { ...l, recomendacao: 'tirar-da-carteira', motivo: `${base} Está na carteira de ${l.dados.carteiras} colaborador(es): troque pelo cadastro que fica em Usuários › Carteira antes de excluir.` };
    }
    return { ...l, recomendacao: 'excluir', motivo: `${base} Pode ser excluído.` };
}

/** O cadastro ainda repete o código SAGE ou o CNPJ de outro cadastro existente (conferido de novo antes de excluir). */
export function aindaRepetida(alvo: Pick<Empresa, 'id' | 'cnpj' | 'codigoSage'>, empresas: Pick<Empresa, 'id' | 'cnpj' | 'codigoSage'>[]): boolean {
    const chaves = new Set([alvo.codigoSage ? chaveSage(alvo.codigoSage) : '', alvo.cnpj ? chaveCnpj(alvo.cnpj) : ''].filter(Boolean));
    return empresas.some(e => e.id !== alvo.id && ((e.codigoSage && chaves.has(chaveSage(e.codigoSage))) || (e.cnpj && chaves.has(chaveCnpj(e.cnpj)))));
}
