/**
 * services/cadastroCentralConferencia.ts — as empresas do DP conferidas
 * contra o cadastro central do CFI (item 9 do SaaS, 08/08).
 *
 * "Empresa se cadastra SÓ no CFI — 1 vez cadastrado, todos os módulos têm
 * acesso." Este app ainda tem coleção própria de empresas (projeto Firebase
 * separado), e cadastro duplicado não fica igual ao central: fica PARECIDO,
 * que é pior porque ninguém desconfia.
 *
 * A conferência busca o cadastro central pelo TÚNEL, direto do navegador
 * (mesmo caminho do gate de departamento — o CFI já aceita o token deste
 * projeto na rota do cadastro e o CORS conhece estas origens), e acende:
 *   - CNPJ daqui que o CFI NÃO conhece (digitação errada aqui, ou empresa
 *     fora do cadastro central — e aí fora de TODOS os módulos);
 *   - nome divergente para o MESMO CNPJ (info, lado a lado).
 *
 * ALERTA, NUNCA CONTORNO: nada é reescrito em lugar nenhum. Quem arruma é
 * gente, na fonte. E falha do túnel não acende nada — vigilância que falha
 * em silêncio é melhor que alarme falso para a tela inteira.
 */

const CFI_URL = 'https://consultor-fiscal-inteligente-zricstsjqa-uw.a.run.app';

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export interface EmpresaCentralMin { cnpj: string; nome: string | null }

export interface ConferenciaCadastroCentral {
    conferidas: number;
    foraDoCadastro: Array<{ cnpj: string; nome: string | null }>;
    nomesDivergentes: Array<{ cnpj: string; nomeAqui: string; nomeCentral: string }>;
    semCnpj: number;
    totalCentral: number;
}

/** A régua, pura — é ela que o teste tranca. */
export function conferirEmpresas(
    daqui: Array<{ cnpj?: unknown; razaoSocial?: unknown; nomeFantasia?: unknown }>,
    central: EmpresaCentralMin[],
): ConferenciaCadastroCentral {
    const porCnpj = new Map<string, EmpresaCentralMin>();
    for (const e of central) {
        const c = soDigitos(e?.cnpj);
        if (c.length === 14) porCnpj.set(c, e);
    }

    const foraDoCadastro: ConferenciaCadastroCentral['foraDoCadastro'] = [];
    const nomesDivergentes: ConferenciaCadastroCentral['nomesDivergentes'] = [];
    let semCnpj = 0;
    let conferidas = 0;

    for (const e of daqui) {
        const cnpj = soDigitos(e?.cnpj);
        const nomeAqui = String(e?.razaoSocial || e?.nomeFantasia || '').trim();
        if (cnpj.length !== 14) { semCnpj += 1; continue; }
        const c = porCnpj.get(cnpj);
        if (!c) {
            foraDoCadastro.push({ cnpj, nome: nomeAqui || null });
            continue;
        }
        conferidas += 1;
        const nomeCentral = String(c.nome || '').trim();
        // Régua grosseira de propósito (mesma da Legalização): só decide o que
        // MOSTRAR lado a lado — variação de sufixo/pontuação não é divergência.
        const a = nomeAqui.toUpperCase().slice(0, 10);
        const b = nomeCentral.toUpperCase().slice(0, 10);
        if (nomeAqui && nomeCentral && !nomeCentral.toUpperCase().startsWith(a) && !nomeAqui.toUpperCase().startsWith(b)) {
            nomesDivergentes.push({ cnpj, nomeAqui, nomeCentral });
        }
    }

    return { conferidas, foraDoCadastro, nomesDivergentes, semCnpj, totalCentral: porCnpj.size };
}

/**
 * Busca o cadastro central pelo túnel. Nunca lança: falha devolve null e a
 * tela simplesmente não mostra o bloco — indeterminado não vira alarme.
 */
export async function buscarCadastroCentral(
    getToken: () => Promise<string>,
    deps: { fetchImpl?: typeof fetch } = {},
): Promise<EmpresaCentralMin[] | null> {
    const doFetch = deps.fetchImpl ?? fetch;
    try {
        const token = await getToken();
        const resp = await doFetch(`${CFI_URL}/api/admin/cadastro/empresas`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const corpo = await resp.json().catch(() => ({}));
        if (!resp.ok || corpo?.ok !== true || !Array.isArray(corpo.empresas)) return null;
        return corpo.empresas.map((e: any) => ({ cnpj: e.cnpj, nome: e.nome ?? null }));
    } catch {
        return null;
    }
}
