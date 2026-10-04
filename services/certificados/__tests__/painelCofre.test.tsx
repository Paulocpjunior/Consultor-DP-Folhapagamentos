// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const meta = (validoAte: string, dias: number) => ({ cnpj: null, tipo: 'A1', titular: 'TITULAR', emissor: 'AC X', validoAte, diasParaVencer: dias, faixaAlerta: dias <= 30 ? String(dias) : null });
const cofre = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../cofreCertificados', async orig => ({ ...(await orig<typeof import('../cofreCertificados')>()), cofreDaMinhaCarteira: cofre.fn }));
vi.mock('xlsx', () => ({ utils: { book_new: () => ({}), book_append_sheet: () => {}, json_to_sheet: () => ({}) }, writeFile: vi.fn() }));
import CofreCertificadosPanel from '../../../components/certificados/CofreCertificadosPanel';

afterEach(cleanup);

describe('painel do cofre de certificados', () => {
    it('abre em "pedem atenção", mostra o Legal e a renovação sem upload; filtros trocam a lista', async () => {
        cofre.fn.mockResolvedValue({
            linhas: [
                { cnpj: '11222333000181', nome: 'ALFA', apto: true, situacao: 'apto-proprio', motivo: '', acao: null, certificado: meta('2027-05-01T00:00:00Z', 200), certificadoDaRaiz: null, legal: null, divergenciaLegal: null },
                { cnpj: '11444777000161', nome: 'BETA', apto: true, situacao: 'apto-proprio', motivo: '', acao: 'Vence em 10 dia(s) — providencie a renovação.', certificado: meta('2026-10-14T00:00:00Z', 10), certificadoDaRaiz: null,
                    legal: { vencimentoInformado: '2027-10-14', tipoDetalhe: 'A1', responsavel: 'Legal', empresaInativa: false, ultimaRenovacao: { dataAntiga: '2026-10-14', dataNova: '2027-10-14', registradaEm: null } }, divergenciaLegal: 'renovado-sem-upload' },
            ],
            avisos: ['Só metadado.'], foraDoCfi: ['99999999000191'], nomes: new Map([['11444777000161', '0002 · Beta']]),
        });
        render(<CofreCertificadosPanel />);
        await waitFor(() => expect(screen.getByText('0002 · Beta')).toBeTruthy());
        expect(screen.queryByText('ALFA')).toBeNull();
        const beta = screen.getByText('0002 · Beta').closest('tr')!;
        expect(within(beta).getByText('Renovado no Legal, mas o A1 novo não subiu ao cofre')).toBeTruthy();
        expect(within(beta).getByText(/Renovado: 14\/10\/2026 → 14\/10\/2027/)).toBeTruthy();
        expect(within(beta).getByText('em 10 dia(s)')).toBeTruthy();
        expect(screen.getByText(/1 empresa\(s\) da sua carteira não estão no cadastro central/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Todos (2)' }));
        expect(screen.getByText('ALFA')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Vencidos (0)' }));
        expect(screen.getByText('Nada neste filtro.')).toBeTruthy();
    });

    it('erro do cofre aparece com a mensagem', async () => {
        cofre.fn.mockRejectedValue(new Error('O cofre recusou o acesso: entre de novo.'));
        render(<CofreCertificadosPanel />);
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('recusou o acesso'));
    });
});
