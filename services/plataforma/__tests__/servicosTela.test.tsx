// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServicosExternosPanel from '../../../components/plataforma/ServicosExternosPanel';
import { HOST_CFI, HOST_CFI_INTEGRACAO } from '../servicos';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Configurações › Serviços externos', () => {
    it('mostra os cinco serviços no CFI e testa o alcance sem login', async () => {
        const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(null, { status: 200 }));
        vi.stubGlobal('fetch', f);
        render(<ServicosExternosPanel />);
        for (const t of ['Cadastro central', 'Cofre de certificados', 'Governo', 'Mensagens', 'Inteligência artificial']) expect(screen.getByText(t)).toBeTruthy();
        expect(screen.getAllByText('CFI')).toHaveLength(5);
        expect(screen.getAllByText(HOST_CFI)).toHaveLength(2);
        expect(screen.getAllByText(HOST_CFI_INTEGRACAO)).toHaveLength(3);
        expect(screen.queryByRole('alert')).toBeNull();
        fireEvent.click(screen.getByText('Testar todos'));
        await waitFor(() => expect(screen.getAllByText(/^responde/)).toHaveLength(5));
        expect(f.mock.calls.every(([, init]) => init?.mode === 'no-cors' && !init?.headers)).toBe(true);
    });
});
