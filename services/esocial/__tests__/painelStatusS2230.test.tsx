// @vitest-environment jsdom
// Retorno visual do S-2230: transmite pelo cofre ligando o evento ao afastamento e consulta o retorno.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const t = vi.hoisted(() => ({ enviar: vi.fn(), consultar: vi.fn() }));
const sv = vi.hoisted(() => ({ registrarEnvio: vi.fn(), registrarConsulta: vi.fn() }));
vi.mock('../transmissao', async orig => ({ ...(await orig<typeof import('../transmissao')>()), enviarLote: t.enviar, consultarLote: t.consultar }));
vi.mock('../transmissaoService', async orig => ({ ...(await orig<typeof import('../transmissaoService')>()), registrarEnvio: sv.registrarEnvio, registrarConsulta: sv.registrarConsulta }));
import StatusEsocialAfastamento from '../../../components/esocial/StatusEsocialAfastamento';
import { afastamentoVazio } from '../../cadastros/afastamentos';
import type { Envio } from '../transmissaoService';

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

const empresa = { id: 'E1', cnpj: '29463877000109', nome: 'ALFA' };
const usuario = { id: 'u1', email: 'ana@x.com' };
const gozo = { ...afastamentoVazio(), id: 'f1_2026-11-09', empresaId: 'E1', fichaId: 'f1', cpf: '52998224725', matriculaEsocial: '000353', motivo: '15',
    dtInicio: '2026-11-09', dtFim: '2026-11-28', perAquisInicio: '2025-10-30', perAquisFim: '2026-10-29' };

describe('situação do S-2230 na tela', () => {
    it('não enviado: transmite em produção e registra o lote com o evento ligado ao afastamento', async () => {
        const retorno = { cdResposta: 201, descResposta: 'Lote Recebido com Sucesso.', ocorrencias: [], protocolo: 'P1', dhRecepcao: '', recebido: true, grupo: 2, eventos: [], tpAmb: 1, transmissor: '' };
        t.enviar.mockResolvedValue(retorno);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const onAtualizado = vi.fn();
        render(<StatusEsocialAfastamento afastamento={gozo} empresa={empresa} usuario={usuario} envios={[]} onAtualizado={onAtualizado} />);
        expect(screen.getByText(/Não enviado/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Transmitir S-2230' }));
        await waitFor(() => expect(sv.registrarEnvio).toHaveBeenCalled());
        const p = t.enviar.mock.calls[0][0];
        expect(p).toMatchObject({ empresaId: 'E1', tpAmb: 1, confirmoProducao: true, certificado: 'escritorio' });
        expect(p.eventos[0]).toContain('<codMotAfast>15</codMotAfast><perAquis>');
        const id = p.eventos[0].match(/Id="([^"]+)"/)[1];
        expect(sv.registrarEnvio.mock.calls[0][0].refs).toEqual({ [id]: gozo.id });
        expect(onAtualizado).toHaveBeenCalled();
    });

    it('aguardando: consulta o retorno do protocolo; aceito mostra o recibo', async () => {
        const lote: Envio = { id: 'L1', empresaId: 'E1', cnpj: empresa.cnpj, tpAmb: 1, grupo: 2, protocolo: 'P1', dhRecepcao: '', transmissor: '', certificado: 'escritorio', situacao: 'enviado',
            cdResposta: 201, descResposta: '', ocorrencias: [], eventos: [{ id: 'ID1', tipo: 'S-2230', perApur: null, ref: gozo.id }], enviadoPorEmail: 'ana@x.com', enviadoEm: '2026-10-07T10:00:00.000Z', consultadoEm: null };
        t.consultar.mockResolvedValue({ situacao: 'processado', eventos: [], ocorrencias: [], cdResposta: 201, descResposta: '', tempoEstimadoConclusao: null, protocolo: 'P1', tpAmb: 1 });
        const { rerender } = render(<StatusEsocialAfastamento afastamento={gozo} empresa={empresa} usuario={usuario} envios={[lote]} onAtualizado={() => {}} />);
        expect(screen.getByText(/aguardando retorno/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Consultar retorno' }));
        await waitFor(() => expect(sv.registrarConsulta).toHaveBeenCalled());
        expect(t.consultar.mock.calls[0][0]).toMatchObject({ protocolo: 'P1', tpAmb: 1, certificado: 'escritorio' });
        const aceito = { ...lote, situacao: 'processado' as const, eventos: [{ ...lote.eventos[0], cdResposta: 201, nrRecibo: '1.2.0000000000000000009' }] };
        rerender(<StatusEsocialAfastamento afastamento={gozo} empresa={empresa} usuario={usuario} envios={[aceito]} onAtualizado={() => {}} />);
        expect(screen.getByText(/Aceito pelo eSocial/)).toBeTruthy();
        expect(screen.getByText(/Recibo 1.2.0000000000000000009/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Transmitir S-2230' })).toBeNull();
    });
});
