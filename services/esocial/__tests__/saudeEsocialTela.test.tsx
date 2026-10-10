// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Envio } from '../transmissaoService';

const sv = vi.hoisted(() => ({
    envios: [] as unknown[], pendentes: [] as unknown[],
    verificar: vi.fn(async (..._a: unknown[]) => undefined), liberar: vi.fn(async (..._a: unknown[]) => undefined), registrarConsulta: vi.fn(async (..._a: unknown[]) => undefined),
    baixar: vi.fn(async (..._a: unknown[]) => ({ cdResposta: 200, descResposta: '', pedidosHoje: 1, arquivos: [] as unknown[] })),
    consultar: vi.fn(async (..._a: unknown[]) => ({ situacao: 'processado', eventos: [], ocorrencias: [], cdResposta: 201, descResposta: '', tempoEstimadoConclusao: null, protocolo: 'P', tpAmb: 1 })),
}));
vi.mock('../transmissaoService', async orig => ({ ...(await orig<typeof import('../transmissaoService')>()), listarEnvios: async () => sv.envios, listarPendentes: async () => sv.pendentes,
    registrarVerificacao: (...a: unknown[]) => sv.verificar(...a), liberarReenvio: (...a: unknown[]) => sv.liberar(...a), registrarConsulta: (...a: unknown[]) => sv.registrarConsulta(...a) }));
vi.mock('../downloadEventos', async orig => ({ ...(await orig<typeof import('../downloadEventos')>()), baixarEventos: (...a: unknown[]) => sv.baixar(...a) }));
vi.mock('../transmissao', async orig => ({ ...(await orig<typeof import('../transmissao')>()), consultarLote: (...a: unknown[]) => sv.consultar(...a) }));
import SaudeEsocialPanel from '../../../components/esocial/SaudeEsocialPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
import { rodadaDoVigia } from '../vigiaEsocial';

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
const ativa = { id: 'E1', nome: 'ALFA', cnpj: '29463877000109', codigoSage: '1', competencia: '2026-09', ativadaPor: 'a@x', ativadaEm: 1 };
const usuario = { id: 'u1', email: 'ana@x.com' };
const iso = (minAtras: number) => new Date(Date.now() - minAtras * 60_000).toISOString();
const lote = (o: Partial<Envio>): Envio => ({ id: 'L', empresaId: 'E1', cnpj: ativa.cnpj, tpAmb: 1, grupo: 3, protocolo: 'P1', dhRecepcao: '', transmissor: '', certificado: 'escritorio', situacao: 'enviado',
    cdResposta: 201, descResposta: '', ocorrencias: [], eventos: [{ id: 'ID1', tipo: 'S-1200', perApur: '2026-09' }], enviadoPorEmail: 'ana@x.com', enviadoEm: iso(1), consultadoEm: null, ...o });
const montar = () => render(<EmpresaAtivaProvider ativa={ativa} trocar={() => {}}><SaudeEsocialPanel usuario={usuario} /></EmpresaAtivaProvider>);

describe('Saúde do eSocial: tela', () => {
    it('fila saudável', async () => {
        sv.envios = [lote({ situacao: 'processado', eventos: [{ id: 'ID1', tipo: 'S-1200', perApur: '2026-09', cdResposta: 201, nrRecibo: '1.1.1' }] })];
        montar();
        await waitFor(() => expect(screen.getByText(/Fila saudável/)).toBeTruthy());
        expect(screen.getByText(/1 aceito\(s\)/)).toBeTruthy();
    });
    it('sem resposta: crítico; confere no eSocial pelo Id e grava os recibos achados', async () => {
        sv.envios = [lote({ id: 'S', situacao: 'sem-resposta', protocolo: '', erroEnvio: 'Failed to fetch', enviadoEm: iso(5) })];
        sv.baixar.mockResolvedValueOnce({ cdResposta: 200, descResposta: '', pedidosHoje: 1, arquivos: [{ id: 'ID1', rec: '<retornoEvento><cdResposta>201</cdResposta><nrRecibo>1.1.0000000000000000077</nrRecibo></retornoEvento>' }] });
        montar();
        await waitFor(() => expect(screen.getByText(/sem resposta do envio/)).toBeTruthy());
        expect(screen.getByText(/Não transmita de novo/)).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Liberar reenvio' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Conferir no eSocial' }));
        await waitFor(() => expect(sv.verificar).toHaveBeenCalled());
        expect(sv.baixar).toHaveBeenCalledWith(ativa.cnpj, ['ID1'], 'escritorio');
        expect(sv.verificar.mock.calls[0][1]).toEqual({ ID1: '1.1.0000000000000000077' });
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Nada a reenviar'));
    });
    it('sem resposta há mais de 30 min: libera o reenvio com confirmação', async () => {
        sv.envios = [lote({ id: 'S', tpAmb: 2, situacao: 'sem-resposta', protocolo: '', enviadoEm: iso(40) })];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        montar();
        const b = await screen.findByRole('button', { name: 'Liberar reenvio' });
        expect(screen.queryByRole('button', { name: 'Conferir no eSocial' })).toBeNull();
        fireEvent.click(b);
        await waitFor(() => expect(sv.liberar).toHaveBeenCalled());
    });
    it('lote parado: consulta agora', async () => {
        sv.envios = [lote({ id: 'P', situacao: 'em-processamento', enviadoEm: iso(50) })];
        montar();
        await waitFor(() => expect(screen.getByText(/parado há 50 min/)).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Consultar agora' }));
        await waitFor(() => expect(sv.registrarConsulta).toHaveBeenCalled());
        expect(sv.consultar.mock.calls[0][0]).toMatchObject({ protocolo: 'P1', tpAmb: 1 });
    });
});

describe('vigia', () => {
    it('consulta só os vencidos e devolve os alertas', async () => {
        sv.pendentes = [lote({ id: 'A', enviadoEm: iso(1) }), lote({ id: 'B', protocolo: 'P2', enviadoEm: new Date().toISOString() }), lote({ id: 'C', situacao: 'sem-resposta', protocolo: '', enviadoEm: iso(5) })];
        const r = await rodadaDoVigia(ativa, usuario);
        expect(sv.consultar).toHaveBeenCalledTimes(1);
        expect(sv.consultar.mock.calls[0][0]).toMatchObject({ protocolo: 'P1' });
        expect(r.consultados).toBe(1);
        expect(r.alertas.map(a => a.envioId)).toEqual(['C']);
    });
});
