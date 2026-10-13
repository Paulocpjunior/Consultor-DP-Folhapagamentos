// services/plataforma/comparadorGoverno.ts
//
// Comparador CFI × plataforma do serviço "governo" (Configurações › Serviços externos), para conferir a troca de
// VITE_SERVICO_GOVERNO_URL antes e depois de ligá-la. Para a empresa ativa e uma competência, chama a MESMA rota de
// LEITURA nos dois hosts (o CFI de sempre e a plataforma), com o MESMO token do usuário, e mostra lado a lado o HTTP,
// o `ok` e as diferenças nos campos de negócio (sem carimbos de hora, ids de requisição nem campos de diagnóstico).
//
// Regras:
// - só leitura: a lista de rotas é fechada (ROTAS_COMPARADAS) e `compararRota` recusa qualquer outra. Nada de envio,
//   transmissão, DARF, comprovante nem download do eSocial (este gasta a cota diária);
// - nada é gravado no DP;
// - `pagamentos/consultar` fica de fora: pede os números dos documentos ou o intervalo de arrecadação, que esta tela
//   não conhece (e grava auditoria nos dois servidores);
// - cada consulta ao SERPRO é cobrada, e aqui cada item vai aos dois hosts: 2× por item que vai ao SERPRO.

import { tokenParaCfi } from '../auth/tokenCfi';
import { HOST_CFI_INTEGRACAO, PREFIXO_INTEGRACAO, configuracaoDoServico, enderecoValido } from './servicos';

export interface RotaComparada {
    rota: string;
    titulo: string;
    /** Vai ao SERPRO (consulta cobrada). */
    serpro: boolean;
    corpo: (p: { empresaId: string; cnpj: string; competencia: string }) => Record<string, string>;
}

/** As únicas rotas que o comparador chama. Todas de leitura. */
export const ROTAS_COMPARADAS: readonly RotaComparada[] = [
    { rota: '/dctfweb/status', titulo: 'DCTFWeb — situação (recibo)', serpro: true, corpo: ({ empresaId, cnpj, competencia }) => ({ empresaId, cnpj, competencia }) },
    { rota: '/dctfweb/debitos', titulo: 'DCTFWeb — débitos da declaração', serpro: true, corpo: ({ empresaId, cnpj, competencia }) => ({ empresaId, cnpj, competencia }) },
    { rota: '/pagamentos/situacao-darf', titulo: 'Situação dos DARF (conferida pelo cron do CFI)', serpro: false, corpo: ({ empresaId, cnpj }) => ({ empresaId, cnpj }) },
];

/** Consultas cobradas numa comparação completa (2 por item que vai ao SERPRO: CFI e plataforma). */
export const CONSULTAS_COBRADAS = ROTAS_COMPARADAS.filter(r => r.serpro).length * 2;

/**
 * Campos que mudam a cada chamada ou dizem respeito ao servidor, não ao negócio. Comparados sem caixa; chave que
 * começa com "_" também fica de fora.
 */
export const CAMPOS_VOLATEIS = [
    'consultadoEm', 'conferidoEm', 'geradoEm', 'atualizadoEm', 'respondidoEm', 'timestamp', 'horario',
    'requestId', 'idRequisicao', 'requisicaoId', 'traceId', 'correlationId',
    'ms', 'duracaoMs', 'latenciaMs', 'diagnostico', 'debug', 'instancia', 'versao', 'revisao',
] as const;
const VOLATEIS = new Set(CAMPOS_VOLATEIS.map(c => c.toLowerCase()));
export const campoVolatil = (chave: string) => chave.startsWith('_') || VOLATEIS.has(chave.toLowerCase());

/** Caminho → valor de cada folha do JSON, sem os campos voláteis. */
function folhas(v: unknown, caminho = '', saida = new Map<string, unknown>()): Map<string, unknown> {
    if (Array.isArray(v)) {
        if (!v.length) saida.set(caminho, []);
        v.forEach((x, i) => folhas(x, `${caminho}[${i}]`, saida));
    } else if (v && typeof v === 'object') {
        const entradas = Object.entries(v as Record<string, unknown>).filter(([k]) => !campoVolatil(k));
        if (!entradas.length) saida.set(caminho, {});
        for (const [k, x] of entradas) folhas(x, caminho ? `${caminho}.${k}` : k, saida);
    } else {
        saida.set(caminho, v);
    }
    return saida;
}

export interface Diferenca { caminho: string; cfi: unknown; plataforma: unknown }

/** Diferenças nos campos de negócio (campo ausente de um lado aparece como undefined). */
export function diffNegocio(cfi: unknown, plataforma: unknown): Diferenca[] {
    const a = folhas(cfi), b = folhas(plataforma);
    const caminhos = [...new Set([...a.keys(), ...b.keys()])].sort();
    return caminhos
        .filter(c => JSON.stringify(a.get(c)) !== JSON.stringify(b.get(c)))
        .map(c => ({ caminho: c || '(resposta)', cfi: a.get(c), plataforma: b.get(c) }));
}

export interface RespostaHost { http: number; ok: boolean | null; corpo: unknown; erro?: string }

/** POST de leitura num host, com o token dado. Não lança: falha de rede vira http 0 com o erro. */
export async function postarNoHost(base: string, rota: string, corpo: object, token: string, fetchImpl: typeof fetch = fetch): Promise<RespostaHost> {
    try {
        const r = await fetchImpl(`${base}${PREFIXO_INTEGRACAO}${rota}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify(corpo),
        });
        const json = await r.json().catch(() => null) as Record<string, unknown> | null;
        const ok = json && typeof json.ok === 'boolean' ? json.ok : null;
        const erro = json && typeof json.error === 'string' ? json.error : undefined;
        return { http: r.status, ok, corpo: json, ...(erro ? { erro } : {}) };
    } catch (e) {
        return { http: 0, ok: null, corpo: null, erro: (e as Error)?.message || 'sem conexão' };
    }
}

export interface Comparacao {
    rota: string;
    titulo: string;
    serpro: boolean;
    cfi: RespostaHost;
    plataforma: RespostaHost;
    diferencas: Diferenca[];
    /** Mesmo HTTP e nenhuma diferença de negócio. */
    iguais: boolean;
}

/** Uma rota da lista nos dois hosts, em paralelo, com o mesmo token. Rota fora da lista é recusada. */
export async function compararRota(
    rota: string, p: { empresaId: string; cnpj: string; competencia: string }, hosts: { cfi: string; plataforma: string }, token: string, fetchImpl: typeof fetch = fetch,
): Promise<Comparacao> {
    const def = ROTAS_COMPARADAS.find(r => r.rota === rota);
    if (!def) throw new Error(`Rota fora do comparador (só leitura): ${rota}`);
    const corpo = def.corpo(p);
    const [cfi, plataforma] = await Promise.all([
        postarNoHost(hosts.cfi, rota, corpo, token, fetchImpl),
        postarNoHost(hosts.plataforma, rota, corpo, token, fetchImpl),
    ]);
    const diferencas = diffNegocio(cfi.corpo, plataforma.corpo);
    return { rota, titulo: def.titulo, serpro: def.serpro, cfi, plataforma, diferencas, iguais: cfi.http === plataforma.http && !diferencas.length };
}

/** Todas as rotas da lista, uma de cada vez (o SERPRO não gosta de rajada), com um token só. */
export async function compararGoverno(
    p: { empresaId: string; cnpj: string; competencia: string }, hosts: { cfi: string; plataforma: string },
    op: { fetchImpl?: typeof fetch; token?: () => Promise<string> } = {},
): Promise<Comparacao[]> {
    const token = await (op.token ?? (() => tokenParaCfi()))();
    const saida: Comparacao[] = [];
    for (const r of ROTAS_COMPARADAS) saida.push(await compararRota(r.rota, p, hosts, token, op.fetchImpl));
    return saida;
}

type Env = Record<string, string | undefined>;
const envDoBuild = (): Env => ((import.meta as unknown as { env?: Env }).env ?? {});

/**
 * Endereço da plataforma para a comparação: o do build (VITE_SERVICO_GOVERNO_URL ou VITE_PLATAFORMA_URL), ou o colado
 * na tela (validado por enderecoValido; nunca gravado). O próprio CFI não serve.
 */
export function hostDaPlataforma(colado: string, env: Env = envDoBuild()): { url: string | null; doBuild: boolean; aviso?: string } {
    const doBuild = configuracaoDoServico('governo', env).base;
    if (doBuild) return { url: doBuild, doBuild: true };
    const v = enderecoValido(colado);
    if (!v.url) return { url: null, doBuild: false, ...(v.aviso ? { aviso: `${v.aviso}.` } : {}) };
    if (new URL(v.url).origin === new URL(HOST_CFI_INTEGRACAO).origin) return { url: null, doBuild: false, aviso: 'Este é o endereço do próprio CFI.' };
    return { url: v.url, doBuild: false };
}
