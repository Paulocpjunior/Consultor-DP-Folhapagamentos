// services/certificados/cofreCertificados.ts
//
// Cofre de certificados ÚNICO do SaaS: o arquivo e a senha moram no CFI
// (cifrados); o app Legal acompanha vencimentos e renovações. Este app só
// LÊ o panorama pelo túnel do cadastro central — metadado, nunca a chave —
// e mostra apenas as empresas da carteira (o gestor vê todas).
// Assim, quando um certificado é renovado ou vence, o DP vê o mesmo que o
// CFI e o Legal. Quem assina continua sendo o CFI.

import { comTokenCfi, ehErroEmailNaoVerificado, erroCfi } from '../auth/tokenCfi';

const CFI_URL = 'https://consultor-fiscal-inteligente-zricstsjqa-uw.a.run.app';
const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

export type SituacaoCofre = 'apto-proprio' | 'apto-pela-raiz' | 'sem-certificado' | 'a3-nao-assina-em-nuvem' | 'cadastro-incompleto' | 'vencido';
export type DivergenciaLegal = 'renovado-sem-upload' | 'legal-desatualizado' | null;

export interface MetaCertificado {
    cnpj: string | null;
    tipo: string;
    titular: string | null;
    emissor: string | null;
    validoAte: string | null;
    diasParaVencer: number | null;
    faixaAlerta: string | null;
}

export interface AcompanhamentoLegal {
    vencimentoInformado: string | null;
    tipoDetalhe: string | null;
    responsavel: string | null;
    empresaInativa: boolean;
    ultimaRenovacao: { dataAntiga: string | null; dataNova: string; registradaEm: string | null } | null;
}

export interface LinhaCofre {
    cnpj: string;
    nome: string | null;
    apto: boolean;
    situacao: SituacaoCofre;
    motivo: string;
    acao: string | null;
    certificado: MetaCertificado | null;
    certificadoDaRaiz: MetaCertificado | null;
    legal?: AcompanhamentoLegal | null;
    divergenciaLegal?: DivergenciaLegal;
}

export interface PanoramaCofre { linhas: LinhaCofre[]; avisos: string[] }

export const ROTULO_SITUACAO: Record<SituacaoCofre, string> = {
    'apto-proprio': 'Apto (A1 próprio)',
    'apto-pela-raiz': 'Apto (A1 da matriz)',
    'sem-certificado': 'Sem certificado',
    'a3-nao-assina-em-nuvem': 'A3 (token físico)',
    'cadastro-incompleto': 'Cadastro incompleto',
    vencido: 'Vencido',
};

export type FiltroCofre = 'todos' | 'atencao' | 'vencendo' | 'vencidos' | 'sem' | 'renovados-sem-upload';

/** Dias até vencer do certificado que assina por esta empresa (o próprio ou o da matriz). */
export const diasDaLinha = (l: LinhaCofre) => (l.certificado ?? l.certificadoDaRaiz)?.diasParaVencer ?? null;

/** Precisa de alguém olhar: vencido, vencendo em 30 dias, sem certificado, incompleto ou renovado sem upload. */
export function precisaAtencao(l: LinhaCofre): boolean {
    const d = diasDaLinha(l);
    return !l.apto || (d !== null && d <= 30) || l.divergenciaLegal === 'renovado-sem-upload';
}

export function filtrarCofre(linhas: LinhaCofre[], filtro: FiltroCofre): LinhaCofre[] {
    switch (filtro) {
        case 'atencao': return linhas.filter(precisaAtencao);
        case 'vencendo': return linhas.filter(l => { const d = diasDaLinha(l); return l.apto && d !== null && d <= 30; });
        case 'vencidos': return linhas.filter(l => l.situacao === 'vencido');
        case 'sem': return linhas.filter(l => l.situacao === 'sem-certificado' || l.situacao === 'cadastro-incompleto');
        case 'renovados-sem-upload': return linhas.filter(l => l.divergenciaLegal === 'renovado-sem-upload');
        default: return linhas;
    }
}

/**
 * Só as empresas que o usuário enxerga (carteira), pelo CNPJ. `cnpjs` nulo =
 * gestor (todas). Empresa da carteira que o CFI não conhece vem à parte:
 * sem cadastro central, ela não tem certificado em lugar nenhum do SaaS.
 */
export function cofreDaCarteira(linhas: LinhaCofre[], cnpjs: string[] | null): { linhas: LinhaCofre[]; foraDoCfi: string[] } {
    if (!cnpjs) return { linhas: ordenar(linhas), foraDoCfi: [] };
    const alvo = new Set(cnpjs.map(soDigitos).filter(c => c.length === 14));
    const doCfi = linhas.filter(l => alvo.has(soDigitos(l.cnpj)));
    const conhecidos = new Set(doCfi.map(l => soDigitos(l.cnpj)));
    return { linhas: ordenar(doCfi), foraDoCfi: [...alvo].filter(c => !conhecidos.has(c)) };
}

/** Quem pede atenção primeiro; depois quem vence antes. */
function ordenar(linhas: LinhaCofre[]): LinhaCofre[] {
    const chave = (l: LinhaCofre) => [precisaAtencao(l) ? 0 : 1, diasDaLinha(l) ?? -99999] as const;
    return [...linhas].sort((a, b) => { const x = chave(a), y = chave(b); return x[0] - y[0] || x[1] - y[1] || (a.nome ?? '').localeCompare(b.nome ?? ''); });
}

export function contagemCofre(linhas: LinhaCofre[]) {
    return {
        total: linhas.length,
        aptas: linhas.filter(l => l.apto).length,
        vencendo: filtrarCofre(linhas, 'vencendo').length,
        vencidos: filtrarCofre(linhas, 'vencidos').length,
        sem: filtrarCofre(linhas, 'sem').length,
        renovadosSemUpload: filtrarCofre(linhas, 'renovados-sem-upload').length,
    };
}

/**
 * Panorama do cofre pelo túnel do CFI. `cnpjs` = a carteira de quem pergunta:
 * o CFI devolve só essas empresas (nulo = gestor, todas). Lança erro com
 * mensagem clara (a tela mostra).
 */
export async function buscarCofre(getToken: () => Promise<string>, deps: { fetchImpl?: typeof fetch; cnpjs?: string[] | null } = {}): Promise<PanoramaCofre> {
    const doFetch = deps.fetchImpl ?? fetch;
    const token = await getToken();
    const lista = deps.cnpjs ? [...new Set(deps.cnpjs.map(soDigitos).filter(c => c.length === 14))] : null;
    if (lista && !lista.length) return { linhas: [], avisos: [] };
    const query = lista ? `?cnpjs=${lista.join(',')}` : '';
    let resp: Response;
    try {
        resp = await doFetch(`${CFI_URL}/api/admin/cadastro/certificados${query}`, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
        throw new Error('Não foi possível falar com o cofre de certificados (Consultor Fiscal). Verifique a conexão e tente de novo.');
    }
    const corpo = await resp.json().catch(() => ({}));
    if (resp.status === 401 || resp.status === 403) {
        const motivo = String(corpo?.error ?? '');
        // "e-mail não verificado" vai com o texto do CFI, para comTokenCfi renovar o token ou orientar a verificação.
        throw erroCfi(ehErroEmailNaoVerificado(motivo) ? motivo : 'O cofre recusou o acesso: entre de novo com o e-mail do escritório (verificado).', resp.status);
    }
    if (!resp.ok || corpo?.ok !== true || !Array.isArray(corpo.linhas)) throw new Error(corpo?.error ? `Cofre de certificados: ${corpo.error}` : 'Resposta inesperada do cofre de certificados.');
    return { linhas: corpo.linhas as LinhaCofre[], avisos: Array.isArray(corpo.avisos) ? corpo.avisos : [] };
}


/** Panorama do cofre só da carteira do usuário logado (o gestor vê todas). */
export async function cofreDaMinhaCarteira(): Promise<PanoramaCofre & { foraDoCfi: string[]; nomes: Map<string, string> }> {
    const [{ escopoAtual }, { listarEmpresasVisiveis }] = await Promise.all([import('../carteira/carteiraService'), import('../empresas/empresasService')]);
    const [escopo, empresas] = await Promise.all([escopoAtual(), listarEmpresasVisiveis()]);
    // Fora do gestor, o CFI devolve só a carteira (o filtro abaixo é só a segunda trava).
    const cnpjs = escopo.todas ? null : empresas.map(e => e.cnpj);
    const cofre = await comTokenCfi(token => buscarCofre(async () => token, { cnpjs }));
    const r = cofreDaCarteira(cofre.linhas, cnpjs);
    const nomes = new Map(empresas.map(e => [soDigitos(e.cnpj), `${e.codigoSage} · ${e.nomeFantasia || e.razaoSocial}`]));
    return { ...r, avisos: cofre.avisos, nomes };
}
