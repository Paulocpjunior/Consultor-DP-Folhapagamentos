// services/crm/crmDp.ts
//
// CRM do DP (Jotform, "Controle DP RH_2022") no Consultor: cada empresa do CRM com o colaborador
// responsável e as particularidades. Sincronizado para crm_dp/{CNPJ ou CPF} pelo job do GitHub
// (scripts/crm). Aqui: ligar o CRM às empresas do Consultor e sugerir a carteira de cada pessoa.

import type { Empresa } from '../empresas/empresasTypes';

export interface ColaboradorCrm { jotformId: string; nome: string; email: string; empresas?: number; exemplos?: string[] }

export interface EmpresaCrm {
    documento: string;
    codigoSage: string;
    nome: string;
    tributacao: string;
    fechamento: string[];
    adiantamento: string;
    diaPagamento: string;
    valeTransporte: string;
    desoneracao: string;
    sindicatos: string[];
    dissidio: string;
    particularidades: string;
    colaborador: ColaboradorCrm | null;
    ativoNoCrm: boolean;
}

/** jotformId do responsável → uid do usuário do Consultor (ligação feita pelo gestor ou admin). */
export type MapaColaboradores = Record<string, string>;

const digitos = (t: string | undefined) => (t ?? '').replace(/\D/g, '');
const codigo = (t: string | undefined) => digitos(t).replace(/^0+/, '');

/** Empresa do Consultor que corresponde à do CRM: pelo CNPJ ou CPF; sem ele, pelo código SAGE. */
export function empresaDoCrm(c: Pick<EmpresaCrm, 'documento' | 'codigoSage'>, empresas: Empresa[]): Empresa | undefined {
    return empresas.find(e => digitos(e.cnpj) === c.documento)
        ?? (c.codigoSage ? empresas.find(e => codigo(e.codigoSage) === codigo(c.codigoSage)) : undefined);
}

/** Os responsáveis do CRM que são esta pessoa: ligados pelo gestor ou com o mesmo e-mail. */
export function idsDoUsuario(colaboradores: ColaboradorCrm[], mapa: MapaColaboradores, u: { uid: string; email: string }): string[] {
    const email = u.email.trim().toLowerCase();
    return colaboradores.filter(c => mapa[c.jotformId] === u.uid || (!!email && c.email === email && !(c.jotformId in mapa))).map(c => c.jotformId);
}

/** Sugestão de carteira: as empresas do CRM desta pessoa, separadas entre as do Consultor e as que ainda não foram cadastradas. */
export function sugestaoCarteira(crm: EmpresaCrm[], empresas: Empresa[], ids: string[]): { empresaIds: string[]; naoCadastradas: EmpresaCrm[] } {
    const meus = crm.filter(c => c.ativoNoCrm && c.colaborador && ids.includes(c.colaborador.jotformId));
    const empresaIds: string[] = [];
    const naoCadastradas: EmpresaCrm[] = [];
    for (const c of meus) {
        const e = empresaDoCrm(c, empresas);
        if (e) { if (!empresaIds.includes(e.id)) empresaIds.push(e.id); } else naoCadastradas.push(c);
    }
    return { empresaIds, naoCadastradas };
}

export const rotuloColaborador = (c: ColaboradorCrm) =>
    `${c.nome || `Responsável …${c.jotformId.slice(-4)}`}${c.empresas ? ` · ${c.empresas} empresa(s)` : ''}${c.exemplos?.length ? ` (ex.: ${c.exemplos.join(', ')})` : ''}`;
