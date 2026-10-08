// Token do túnel do CFI com e-mail não verificado (caso da Juliana, 07/10/2026).
import { afterEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({ user: null as null | { emailVerified: boolean; reload: () => Promise<void>; getIdToken: (f?: boolean) => Promise<string> } }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ get currentUser() { return fb.user; } }) }));
import { AVISO_EMAIL_NAO_VERIFICADO, comTokenCfi, ehErroEmailNaoVerificado, erroCfi, tokenParaCfi } from '../tokenCfi';

const usuario = (verificado: boolean, verificaNoReload = false) => {
    const u = {
        emailVerified: verificado,
        reload: vi.fn(async () => { if (verificaNoReload) u.emailVerified = true; }),
        getIdToken: vi.fn(async (f?: boolean) => (f ? 'token-novo' : 'token-antigo')),
    };
    return u;
};
afterEach(() => { fb.user = null; });

describe('token para o CFI', () => {
    it('reconhece a recusa por e-mail não verificado', () => {
        expect(['Token inválido: Email não verificado: juliana@x.com', 'email not verified', 'Sem permissão'].map(ehErroEmailNaoVerificado)).toEqual([true, true, false]);
    });
    it('sem sessão pede para entrar de novo', async () => {
        await expect(tokenParaCfi()).rejects.toThrow(/Sessão expirada/);
    });
    it('e-mail verificado em outro aparelho: recarrega a conta e renova o token', async () => {
        const u = usuario(false, true); fb.user = u;
        expect(await tokenParaCfi()).toBe('token-novo');
        expect(u.reload).toHaveBeenCalled();
    });
    it('token antigo de conta já verificada: tenta de novo com token novo', async () => {
        fb.user = usuario(true);
        const chamar = vi.fn(async (t: string) => { if (t === 'token-antigo') throw erroCfi('Token inválido: Email não verificado', 401); return 'ok'; });
        expect(await comTokenCfi(chamar)).toBe('ok');
        expect(chamar.mock.calls.map(c => c[0])).toEqual(['token-antigo', 'token-novo']);
    });
    it('conta ainda sem verificação: a recusa vira a orientação de verificar o e-mail', async () => {
        fb.user = usuario(false);
        await expect(comTokenCfi(async () => { throw erroCfi('Token inválido: Email não verificado: juliana@x.com', 403); })).rejects.toThrow(AVISO_EMAIL_NAO_VERIFICADO);
        await expect(comTokenCfi(async () => { throw new Error('CNPJ fora da carteira'); })).rejects.toThrow('CNPJ fora da carteira');
    });
    it('decide pelo status: erro de negócio com "não verificado" no texto não renova o token nem vira o aviso', async () => {
        fb.user = usuario(true);
        const chamar = vi.fn(async () => { throw erroCfi('Evento não verificado pelo eSocial', 422); });
        await expect(comTokenCfi(chamar)).rejects.toThrow('Evento não verificado pelo eSocial');
        expect(chamar).toHaveBeenCalledTimes(1);
        await expect(comTokenCfi(async () => { throw new Error('Email não verificado'); })).rejects.toThrow('Email não verificado');
    });
});
