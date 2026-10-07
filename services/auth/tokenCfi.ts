// services/auth/tokenCfi.ts
//
// Token do usuário para o túnel do CFI (cofre de certificados, transmissão do
// eSocial, SERPRO). O CFI só aceita e-mail verificado (Paulo, 07/10/2026:
// "Token inválido: Email não verificado" da Juliana no S-2230 e no cofre).
// O "verificado" só entra num token novo: quando o e-mail acabou de ser
// verificado (aqui ou em outro aparelho), o token é renovado na hora.

import { getAuth } from 'firebase/auth';

export const AVISO_EMAIL_NAO_VERIFICADO =
    'Seu e-mail ainda não foi verificado, e o CFI (cofre de certificados e transmissão ao eSocial) só aceita e-mail verificado. ' +
    'Use "Enviar link de verificação" no aviso do topo da tela, clique no link que chegar no e-mail, depois em "Já verifiquei", e tente de novo.';

/** Resposta do CFI recusando por e-mail não verificado. */
export const ehErroEmailNaoVerificado = (mensagem: string) => /n[ãa]o\s+verificad|not\s+verified|unverified|email_verified/i.test(mensagem ?? '');

/** Token para o CFI; renova quando o e-mail passou a constar como verificado. */
export async function tokenParaCfi(forcar = false): Promise<string> {
    const auth = getAuth();
    const u = auth.currentUser;
    if (!u) throw new Error('Sessão expirada: entre de novo.');
    if (!u.emailVerified) {
        try { await u.reload(); } catch { /* sem rede: segue com o token atual */ }
        const atual = auth.currentUser ?? u;
        if (atual.emailVerified) return atual.getIdToken(true);
        return atual.getIdToken(forcar);
    }
    return u.getIdToken(forcar);
}

/**
 * Chamada ao CFI com o token; se ele recusar por e-mail não verificado e a
 * conta já estiver verificada (token antigo), tenta uma vez com token novo.
 * Sem verificação, a mensagem vira a orientação de verificar o e-mail.
 */
export async function comTokenCfi<T>(chamar: (token: string) => Promise<T>): Promise<T> {
    try { return await chamar(await tokenParaCfi()); }
    catch (e) {
        if (!ehErroEmailNaoVerificado((e as Error).message)) throw e;
        const u = getAuth().currentUser;
        if (u?.emailVerified) {
            try { return await chamar(await tokenParaCfi(true)); }
            catch (e2) { if (!ehErroEmailNaoVerificado((e2 as Error).message)) throw e2; }
        }
        throw new Error(AVISO_EMAIL_NAO_VERIFICADO);
    }
}
