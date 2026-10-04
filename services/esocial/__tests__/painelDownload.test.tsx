// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ESocialDownload from '../../../components/esocial/ESocialDownload';

const tunel = vi.hoisted(() => ({ callFiscal: vi.fn() }));
const zip = vi.hoisted(() => ({ baixarBytes: vi.fn() }));
vi.mock('../../serpro/serproIntegrationService', () => tunel);
vi.mock('../../implantacao/zip', async orig => ({ ...(await orig<typeof import('../../implantacao/zip')>()), baixarBytes: zip.baixarBytes }));
vi.mock('../../empresas/empresasService', () => ({
    listarTodasEmpresas: async () => [{ id: 'emp1', cnpj: '11222333000181', razaoSocial: 'EMPRESA UM', nomeFantasia: 'Um', codigoSage: '0229', criadoPor: 'u' }],
}));
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [{ id: 'f1', empresaId: 'emp1', cnpj: '', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dados: { nome: 'ANA', admissao: '2025-03-01' }, dependentes: [], origens: {}, pendenciasImportacao: [] }],
}));

const ID1 = 'ID1112223330000002026091600000000001';
const ID2 = 'ID1112223330000002026100100000000002';

beforeEach(() => { tunel.callFiscal.mockReset(); zip.baixarBytes.mockReset(); });
afterEach(cleanup);

describe('download de eventos do eSocial na interface', () => {
    it('consulta por trabalhador, baixa os marcados e salva o .zip', async () => {
        tunel.callFiscal.mockImplementation(async (rota: string, corpo: Record<string, unknown>) => {
            if (rota === '/esocial/download/identificadores') return { cdResposta: 200, descResposta: 'OK', qtdeTotal: 2, dhUltimoEvtRetornado: '2026-10-01T10:00:00', identificadores: [{ id: ID1, nrRec: '1.1' }, { id: ID2, nrRec: '1.2' }], pedidosHoje: 1, corpo };
            return {
                cdResposta: 200, descResposta: 'OK', pedidosHoje: 2, arquivos: [
                    { cdResposta: 200, descResposta: 'OK', id: ID1, elemento: 'evtAdmissao', evt: `<eSocial><evtAdmissao Id="${ID1}"><trabalhador><cpfTrab>52998224725</cpfTrab></trabalhador></evtAdmissao></eSocial>`, rec: '<eSocial><retornoEvento/></eSocial>' },
                    { cdResposta: 402, descResposta: 'Evento não encontrado.', id: ID2, elemento: '', evt: '', rec: '' },
                ],
            };
        });
        render(<ESocialDownload />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        fireEvent.change(screen.getByLabelText('CPF do trabalhador'), { target: { value: '529.982.247-25' } });
        await waitFor(() => expect(screen.getByText(/ANA · admissão 01\/03\/2025/)).toBeTruthy());
        fireEvent.click(screen.getByText('usar a admissão como início'));
        fireEvent.click(screen.getByText('Consultar no eSocial'));
        await waitFor(() => expect(screen.getByText(ID1)).toBeTruthy());
        expect(tunel.callFiscal.mock.calls[0]).toEqual(['/esocial/download/identificadores', expect.objectContaining({ cnpj: '11222333000181', tipo: 'trabalhador', cpfTrab: '52998224725', dtIni: '2025-03-01', dtFim: '2025-03-31', certificado: 'escritorio' })]);
        expect(screen.getByText(/Pedidos hoje para esta empresa: 1/)).toBeTruthy();
        fireEvent.click(screen.getByText('Baixar 2 evento(s)'));
        await waitFor(() => expect(screen.getByText('Eventos baixados nesta sessão (1)')).toBeTruthy());
        expect(tunel.callFiscal.mock.calls[1]).toEqual(['/esocial/download/eventos', { cnpj: '11222333000181', ids: [ID1, ID2], certificado: 'escritorio' }]);
        expect(screen.getByText(`${ID2}: 402 - Evento não encontrado.`)).toBeTruthy();
        expect(screen.getByText('S-2200')).toBeTruthy();
        fireEvent.click(screen.getByText('Salvar .zip'));
        expect(zip.baixarBytes).toHaveBeenCalledWith(expect.stringMatching(/^esocial-0229-\d{4}-\d{2}-\d{2}\.zip$/), expect.any(Uint8Array), 'application/zip');
    });

    it('erro do túnel aparece; consulta por competência manda tpEvt e perApur', async () => {
        tunel.callFiscal.mockRejectedValue(new Error('O certificado A1 do escritório não está no cofre do CFI.'));
        render(<ESocialDownload />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        fireEvent.change(screen.getByLabelText('Tipo de consulta'), { target: { value: 'empregador' } });
        fireEvent.change(screen.getByLabelText('Tipo de evento'), { target: { value: 'S-5011' } });
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-09' } });
        fireEvent.click(screen.getByText('Consultar no eSocial'));
        expect((await screen.findByRole('alert')).textContent).toContain('não está no cofre');
        // período acima de 31 dias não chega ao eSocial
        fireEvent.change(screen.getByLabelText('Tipo de consulta'), { target: { value: 'trabalhador' } });
        fireEvent.change(screen.getByLabelText('CPF do trabalhador'), { target: { value: '52998224725' } });
        fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2025-01-01' } });
        fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2025-06-30' } });
        expect(screen.getByRole('status').textContent).toBe('O eSocial aceita no máximo 31 dias por consulta.');
        expect(screen.getByText('Consultar no eSocial').hasAttribute('disabled')).toBe(true);
        expect(tunel.callFiscal.mock.calls[0][1]).toMatchObject({ tipo: 'empregador', tpEvt: 'S-5011', perApur: '2026-09' });
    });
});
