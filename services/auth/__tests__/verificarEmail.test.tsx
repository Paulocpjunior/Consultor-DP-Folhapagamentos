// @vitest-environment jsdom
// Aviso de e-mail não verificado: intervalo entre envios e orientação (caso da Juliana, 07/10/2026).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sv = vi.hoisted(() => ({ enviar: vi.fn(async () => undefined), confirmar: vi.fn(async () => false) }));
vi.mock('../authService', () => ({ enviarVerificacaoEmail: () => sv.enviar(), confirmarVerificacaoEmail: () => sv.confirmar(), remetenteVerificacao: () => 'noreply@consultor-dp-folha.firebaseapp.com' }));
import { VerificarEmail } from '../../../components/auth/PendingScreen';

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear(); });

describe('verificação de e-mail', () => {
    it('depois do envio o botão espera 2 minutos, mesmo recarregando a tela, e mostra o remetente', async () => {
        const { unmount } = render(<VerificarEmail email="juliana@x.com.br" />);
        fireEvent.click(screen.getByText('Enviar link de verificação'));
        await waitFor(() => expect(screen.getByText('Novo envio em 2 min')).toBeTruthy());
        expect((screen.getByText('Novo envio em 2 min') as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText('noreply@consultor-dp-folha.firebaseapp.com')).toBeTruthy();
        expect(screen.getByText(/lixo eletrônico \(spam\)/)).toBeTruthy();
        unmount();
        render(<VerificarEmail email="juliana@x.com.br" />);
        expect((screen.getByText('Novo envio em 2 min') as HTMLButtonElement).disabled).toBe(true);
        expect(sv.enviar).toHaveBeenCalledTimes(1);
    });

    it('bloqueio do Firebase: explica que o link já enviado vale e segura o botão por 15 minutos', async () => {
        sv.enviar.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'auth/too-many-requests' }));
        render(<VerificarEmail email="juliana@x.com.br" />);
        fireEvent.click(screen.getByText('Enviar link de verificação'));
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/bloqueou novos envios.*continua valendo/));
        expect(screen.getByText('Novo envio em 15 min')).toBeTruthy();
        // "Já verifiquei" continua disponível.
        fireEvent.click(screen.getByText('Já verifiquei'));
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/ainda não aparece como verificado/));
    });
});
