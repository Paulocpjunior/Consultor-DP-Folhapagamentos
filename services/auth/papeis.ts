// services/auth/papeis.ts
//
// Hierarquia de papéis: gestor > admin > colaborador > pendente.
// - gestor: tudo o que o admin faz, mais promover/rebaixar admins e gestores
//   e excluir empresas;
// - admin: aprova usuários como colaborador e administra colaboradores;
// - colaborador: trabalha;
// - pendente: espera aprovação.
// O e-mail master (o mesmo do CFI e do app Legal), verificado, é sempre
// gestor: é quem destrava o primeiro gestor (o authService grava isso no
// perfil). As regras do Firestore repetem estas regras; aqui é só a tela.

export type Papel = 'gestor' | 'admin' | 'colaborador' | 'pendente';

export const EMAIL_MASTER = 'junior@spassessoriacontabil.com.br';

export const ROTULO_PAPEL: Record<Papel, string> = { gestor: 'Gestor', admin: 'Admin', colaborador: 'Colaborador', pendente: 'Pendente' };

const NIVEL: Record<Papel, number> = { pendente: 0, colaborador: 1, admin: 2, gestor: 3 };

export const ehMaster = (email?: string | null) => (email ?? '').trim().toLowerCase() === EMAIL_MASTER;

/** Papel conhecido; qualquer outro valor conta como pendente. */
export function papelEfetivo(role: string | undefined): Papel {
    return role === 'gestor' || role === 'admin' || role === 'colaborador' ? role : 'pendente';
}

/** Admin ou gestor (quem administra). */
export const ehAdmin = (role: string | undefined) => NIVEL[papelEfetivo(role)] >= NIVEL.admin;
export const ehGestor = (role: string | undefined) => papelEfetivo(role) === 'gestor';
export const ehAprovado = (role: string | undefined) => papelEfetivo(role) !== 'pendente';

/**
 * Quem pode mudar o papel de quem, e para qual:
 * - ninguém muda o próprio papel;
 * - gestor muda qualquer um para qualquer papel;
 * - admin só mexe em pendente/colaborador, e só para pendente/colaborador.
 */
export function podeMudarPapel(ator: Papel, ehOProprio: boolean, atual: Papel, novo: Papel): boolean {
    if (ehOProprio || atual === novo) return false;
    if (ator === 'gestor') return true;
    if (ator === 'admin') return NIVEL[atual] <= NIVEL.colaborador && NIVEL[novo] <= NIVEL.colaborador;
    return false;
}

/** Papéis que o ator pode dar a um usuário com o papel atual (para os botões da tela). */
export function papeisPermitidos(ator: Papel, ehOProprio: boolean, atual: Papel): Papel[] {
    return (['gestor', 'admin', 'colaborador', 'pendente'] as Papel[]).filter(p => podeMudarPapel(ator, ehOProprio, atual, p));
}
