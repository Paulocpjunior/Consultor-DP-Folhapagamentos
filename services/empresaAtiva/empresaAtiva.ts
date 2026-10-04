// services/empresaAtiva/empresaAtiva.ts
//
// Empresa e período ATIVOS da sessão (como no CFI): depois do login, o
// colaborador ativa UMA empresa da carteira e a competência de trabalho; é
// nela que todas as telas trabalham até ele trocar.
// - Tela que trabalha sobre um cliente exige a ativação; Usuários e o
//   cadastro de Empresas não (são sobre o conjunto, não sobre um cliente).
// - Trocar de empresa limpa o que estava na tela (as telas remontam).
// - Sair limpa a ativação; recarregar a página (F5) não.
// Guardada no navegador por usuário; sem Firestore.

export interface EmpresaAtiva {
    id: string;
    nome: string;
    cnpj: string;
    codigoSage: string;
    /** AAAA-MM */
    competencia: string;
    ativadaPor: string;
    ativadaEm: number;
}

export type AbaApp = 'folha' | 'cadastros' | 'calculo' | 'prazos' | 'empresas' | 'esocial' | 'iobsage' | 'admin';

/** Abas que NÃO exigem empresa ativa. Lista curta e explícita: o padrão é exigir. */
export const DISPENSAM_EMPRESA_ATIVA: AbaApp[] = ['admin', 'empresas'];

export const exigeEmpresaAtiva = (aba: AbaApp) => !DISPENSAM_EMPRESA_ATIVA.includes(aba);

const chave = (uid: string) => `dp_empresa_ativa:${uid}`;
export const competenciaValida = (c: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c);

/** Mês anterior ao de hoje (a folha que normalmente se fecha). */
export function competenciaPadrao(hoje = new Date()): string {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const competenciaBr = (c: string) => (competenciaValida(c) ? `${c.slice(5)}/${c.slice(0, 4)}` : c);

function valida(x: unknown): x is EmpresaAtiva {
    const e = x as EmpresaAtiva;
    return !!e && typeof e.id === 'string' && !!e.id && typeof e.nome === 'string' && competenciaValida(e.competencia ?? '');
}

export function lerEmpresaAtiva(uid: string): EmpresaAtiva | null {
    try {
        const v = JSON.parse(localStorage.getItem(chave(uid)) ?? 'null');
        return valida(v) ? v : null;
    } catch { return null; }
}

export function gravarEmpresaAtiva(uid: string, e: EmpresaAtiva): void {
    try { localStorage.setItem(chave(uid), JSON.stringify(e)); } catch { /* navegador sem armazenamento: vale só nesta aba */ }
}

export function limparEmpresaAtiva(uid: string): void {
    try { localStorage.removeItem(chave(uid)); } catch { /* idem */ }
}

/** A ativação guardada só vale se a empresa ainda estiver entre as visíveis (a carteira pode ter mudado). */
export function ativacaoAindaValida(e: EmpresaAtiva | null, visiveis: { id: string }[]): EmpresaAtiva | null {
    return e && visiveis.some(v => v.id === e.id) ? e : null;
}
