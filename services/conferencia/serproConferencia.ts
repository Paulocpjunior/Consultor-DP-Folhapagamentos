// services/conferencia/serproConferencia.ts
//
// Consulta ao SERPRO (Integra Contador) para a conferência pós-folha, pelo
// túnel do CFI (/api/dp-integration/*). Nada de credencial SERPRO neste app:
// o CFI já mantém o mTLS e o OAuth2.
//
// Três consultas, por CNPJ e competência:
//   - FGTS Digital: valor devido e valor recolhido;
//   - eSocial: situação do fechamento (S-1299);
//   - DCTFWeb: situação da declaração.
//
// Regra da casa: falha de consulta nunca vira "entregue", "pago" ou "zero".
// Cada consulta que falha volta com ok=false e o erro, e a conferência mostra
// isso como pendência informativa.

import type { Empresa } from '../empresas/empresasTypes';
import type { GrupoApuracao } from './totalizadores';

export interface SituacaoSerpro { ok: boolean; entregue: boolean; situacao: string; dataEntrega: string | null; erro?: string }
export interface FgtsSerpro {
    ok: boolean;
    /** Centavos. null quando o SERPRO não informou valor (o CFI devolve 0 nesse caso). */
    devido: number | null;
    realizado: number | null;
    erro?: string;
}
export interface ConsultaSerpro {
    cnpj: string;
    competencia: string;
    consultadoEm: string;
    fgts: FgtsSerpro;
    esocial: SituacaoSerpro;
    dctfweb: SituacaoSerpro;
}

/** As funções do cliente do túnel (services/serpro/serproIntegrationService.ts), injetáveis para teste. */
export interface ClienteSerpro {
    consultarFgtsRecolhimento(cnpj: string, competencia: string): Promise<{ ok: boolean; depositoDevido: number; depositoRealizado: number; erro?: string }>;
    consultarESocialFechamento(cnpj: string, competencia: string): Promise<{ ok: boolean; entregue: boolean; situacao: string; dataEntrega?: string | null; erro?: string }>;
    consultarDctfWebStatus(cnpj: string, competencia: string): Promise<{ ok: boolean; entregue: boolean; situacao: string; dataEntrega?: string | null; erro?: string }>;
}

const semPonto = (t: string) => t.trim().replace(/\.+$/, '');
const msg = (e: unknown) => semPonto((e instanceof Error ? e.message : String(e)) || 'erro desconhecido');
const paraCentavos = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : 0);

function situacao(r: PromiseSettledResult<{ ok: boolean; entregue: boolean; situacao: string; dataEntrega?: string | null; erro?: string }>): SituacaoSerpro {
    if (r.status === 'rejected') return { ok: false, entregue: false, situacao: 'indisponível', dataEntrega: null, erro: msg(r.reason) };
    const v = r.value;
    return { ok: !!v.ok, entregue: !!v.ok && !!v.entregue, situacao: v.situacao || 'INDETERMINADA', dataEntrega: v.dataEntrega ?? null, erro: v.ok ? undefined : semPonto(v.erro || 'consulta sem sucesso') };
}

export async function consultarSerproConferencia(cliente: ClienteSerpro, cnpj: string, competencia: string, agora = new Date()): Promise<ConsultaSerpro> {
    const [f, e, d] = await Promise.allSettled([
        cliente.consultarFgtsRecolhimento(cnpj, competencia),
        cliente.consultarESocialFechamento(cnpj, competencia),
        cliente.consultarDctfWebStatus(cnpj, competencia),
    ]);
    let fgts: FgtsSerpro;
    if (f.status === 'rejected') fgts = { ok: false, devido: null, realizado: null, erro: msg(f.reason) };
    else if (!f.value.ok) fgts = { ok: false, devido: null, realizado: null, erro: semPonto(f.value.erro || 'consulta sem sucesso') };
    else {
        const devido = paraCentavos(f.value.depositoDevido), realizado = paraCentavos(f.value.depositoRealizado);
        // O CFI devolve 0 quando o campo não vem: 0 e 0 é "sem valor", não "nada devido".
        fgts = devido === 0 && realizado === 0 ? { ok: true, devido: null, realizado: null } : { ok: true, devido, realizado };
    }
    return { cnpj, competencia, consultadoEm: agora.toISOString(), fgts, esocial: situacao(e), dctfweb: situacao(d) };
}

const digitos = (s: string) => s.replace(/\D/g, '');

/**
 * CNPJ de 14 dígitos para consultar o SERPRO. Os totalizadores trazem só a
 * raiz no ideEmpregador. Ordem: cadastro de empresas (matriz primeiro) e,
 * sem cadastro, o estabelecimento informado nos próprios totalizadores.
 */
export function cnpjParaSerpro(g: GrupoApuracao, empresas: Empresa[] | null): string | null {
    const raiz = digitos(g.empregador).slice(0, 8);
    if (raiz.length !== 8) return null;
    const doCadastro = (empresas ?? []).map(e => digitos(e.cnpj)).filter(c => c.length === 14 && c.startsWith(raiz));
    const matriz = doCadastro.find(c => c.slice(8, 12) === '0001');
    if (matriz || doCadastro[0]) return matriz ?? doCadastro[0];
    const dosArquivos = [
        ...g.s5001.flatMap(t => t.vinculos.map(v => v.estab)),
        ...g.s5003.flatMap(t => t.itens.map(i => i.estab)),
    ].map(digitos).filter(c => c.length === 14 && c.startsWith(raiz));
    return dosArquivos.find(c => c.slice(8, 12) === '0001') ?? dosArquivos[0] ?? null;
}
