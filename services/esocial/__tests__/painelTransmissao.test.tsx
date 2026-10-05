// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const t = vi.hoisted(() => ({ enviar: vi.fn(), consultar: vi.fn() }));
const sv = vi.hoisted(() => ({ listar: vi.fn(), registrarEnvio: vi.fn(), registrarConsulta: vi.fn() }));
vi.mock('../transmissao', async orig => ({ ...(await orig<typeof import('../transmissao')>()), enviarLote: t.enviar, consultarLote: t.consultar }));
vi.mock('../transmissaoService', async orig => ({ ...(await orig<typeof import('../transmissaoService')>()), listarEnvios: sv.listar, registrarEnvio: sv.registrarEnvio, registrarConsulta: sv.registrarConsulta }));
import ESocialTransmissao from '../../../components/esocial/ESocialTransmissao';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

const ativa = { id: 'E1', nome: 'ALFA', cnpj: '29463877000109', codigoSage: '1', competencia: '2026-09', ativadaPor: 'a@x', ativadaEm: 1 };
const usuario = { id: 'u1', email: 'ana@x.com' };
const montar = () => render(<EmpresaAtivaProvider ativa={ativa} trocar={() => {}}><ESocialTransmissao usuario={usuario} /></EmpresaAtivaProvider>);
const retornoEnvio = { cdResposta: 201, descResposta: 'Lote Recebido com Sucesso.', ocorrencias: [], protocolo: '1.2.202610.0000000000012345', dhRecepcao: '', recebido: true, grupo: 3, eventos: [{ id: 'X', tipo: 'S-1299', perApur: '2026-09' }], tpAmb: 2, transmissor: '44388152000189' };

describe('tela de transmissão do eSocial', () => {
    it('transmite o S-1299 da competência ativa em produção restrita e registra o lote', async () => {
        sv.listar.mockResolvedValue([]);
        t.enviar.mockResolvedValue(retornoEnvio);
        sv.registrarEnvio.mockResolvedValue('env1');
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar();
        await waitFor(() => expect(sv.listar).toHaveBeenCalledWith('E1'));
        fireEvent.click(screen.getByLabelText('Houve pagamentos no período (S-1210)'));
        fireEvent.click(screen.getByRole('button', { name: 'Transmitir fechamento (S-1299)' }));
        await waitFor(() => expect(t.enviar).toHaveBeenCalled());
        const p = t.enviar.mock.calls[0][0];
        expect(p).toMatchObject({ empresaId: 'E1', cnpj: '29463877000109', tpAmb: 2, certificado: 'escritorio' });
        expect(p.confirmoProducao).toBeUndefined();
        expect(p.eventos[0]).toContain('<perApur>2026-09</perApur><tpAmb>2</tpAmb>');
        expect(p.eventos[0]).toContain('<evtPgtos>N</evtPgtos>');
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Protocolo 1.2.202610.0000000000012345'));
        expect(sv.registrarEnvio).toHaveBeenCalledWith({ empresaId: 'E1', cnpj: '29463877000109', certificado: 'escritorio', retorno: retornoEnvio }, usuario);
    });

    it('produção exige a confirmação; vai com confirmoProducao', async () => {
        sv.listar.mockResolvedValue([]);
        t.enviar.mockResolvedValue({ ...retornoEnvio, tpAmb: 1 });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar();
        fireEvent.change(screen.getByLabelText('Ambiente'), { target: { value: '1' } });
        const b = screen.getByRole('button', { name: 'Reabrir o período (S-1298)' }) as HTMLButtonElement;
        expect(b.disabled).toBe(true);
        fireEvent.click(screen.getByLabelText('Confirmo a transmissão em produção'));
        expect(b.disabled).toBe(false);
        fireEvent.click(b);
        await waitFor(() => expect(t.enviar).toHaveBeenCalled());
        expect(t.enviar.mock.calls[0][0]).toMatchObject({ tpAmb: 1, confirmoProducao: true });
        expect(t.enviar.mock.calls[0][0].eventos[0]).toContain('evtReabreEvPer');
    });

    it('lote recusado aparece com as ocorrências', async () => {
        sv.listar.mockResolvedValue([]);
        t.enviar.mockResolvedValue({ ...retornoEnvio, recebido: false, cdResposta: 402, descResposta: 'Lote incorreto', protocolo: '', ocorrencias: [{ tipo: 1, codigo: '142', descricao: 'Certificado sem procuração', localizacao: '' }] });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar();
        fireEvent.click(screen.getByRole('button', { name: 'Transmitir fechamento (S-1299)' }));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('402 Lote incorreto — 142 Certificado sem procuração'));
    });

    it('XML pronto: confere a empresa antes de enviar', async () => {
        sv.listar.mockResolvedValue([]);
        montar();
        const outro = '<eSocial><evtAdmissao Id="ID1112223330000002026100512000000001"><ideEvento><tpAmb>2</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador></evtAdmissao></eSocial>';
        const f = new File([outro], 's2200.xml', { type: 'text/xml' });
        fireEvent.change(screen.getByLabelText('Arquivos XML'), { target: { files: [f] } });
        await waitFor(() => expect(screen.getByText(/empregador 11222333 não é a empresa ativa/)).toBeTruthy());
        expect((screen.getByRole('button', { name: /Transmitir .*evento\(s\)/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('consulta o resultado e mostra recibo e ocorrências', async () => {
        const envio = { id: 'env1', empresaId: 'E1', cnpj: '29463877000109', tpAmb: 2, grupo: 3, protocolo: '1.2.202610.0000000000012345', dhRecepcao: '', transmissor: '', certificado: 'escritorio', situacao: 'enviado', cdResposta: 201, descResposta: 'Lote Recebido', ocorrencias: [], eventos: [{ id: 'X', tipo: 'S-1299', perApur: '2026-09' }], enviadoPorEmail: 'ana@x.com', enviadoEm: '2026-10-05T12:00:00Z', consultadoEm: null };
        const processado = { ...envio, situacao: 'processado', eventos: [{ id: 'X', tipo: 'S-1299', perApur: '2026-09', cdResposta: 201, descResposta: 'ok', nrRecibo: '1.1.0000000012345', ocorrencias: [{ tipo: 2, codigo: '609', descricao: 'Advertência de teste', localizacao: '' }], totalizadores: ['S-5011'] }] };
        sv.listar.mockResolvedValueOnce([envio]).mockResolvedValue([processado]);
        t.consultar.mockResolvedValue({ cdResposta: 201, descResposta: 'ok', ocorrencias: [], tempoEstimadoConclusao: null, protocolo: envio.protocolo, situacao: 'processado', tpAmb: 2, eventos: [] });
        sv.registrarConsulta.mockResolvedValue(undefined);
        montar();
        fireEvent.click(await screen.findByRole('button', { name: 'Consultar resultado' }));
        await waitFor(() => expect(t.consultar).toHaveBeenCalledWith({ empresaId: 'E1', cnpj: '29463877000109', protocolo: envio.protocolo, tpAmb: 2, certificado: 'escritorio' }));
        await waitFor(() => expect(screen.getByText(/Recibo 1.1.0000000012345 · totalizadores: S-5011/)).toBeTruthy());
        expect(screen.getByText('Advertência 609: Advertência de teste')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Consultar resultado' })).toBeNull();
    });
});
