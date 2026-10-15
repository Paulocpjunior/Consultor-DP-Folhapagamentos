// @vitest-environment jsdom
// Holerite por e-mail e WhatsApp (Envio para email do Funcionário do SAGE): tipo, seleção e envio (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const srv = vi.hoisted(() => ({ enviados: [] as { para: string; assunto: string; mensagem: string }[], lidos: [] as string[], historico: [] as string[] }));
const ficha = (id: string, nome: string, email: string, codigoIob: string, departamento: string) =>
    ({ id, empresaId: 'E1', cnpj: '11222333000181', cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo', dados: { nome, email, codigoIob, departamento }, dependentes: [], origens: {}, pendenciasImportacao: [] });
const res = (fichaId: string, nome: string) => ({ fichaId, nome, competencia: '2026-10', pagamento: '2026-10', situacao: 'calculado', verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: 0, descontos: 0, liquido: 0 }, fgts: 0, memoria: [], avisos: [], erros: [] });
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [ficha('f1', 'HENRIQUE', 'h@ex.com', '000001', 'LOJA'), ficha('f2', 'ANA', 'a@ex.com', '000015', 'ESCRITORIO')],
    mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'E1', razaoSocial: 'ALFA LTDA', cnpj: '44388152000189' }] }));
vi.mock('../../calculo/folhaGravadaService', () => ({ lerFolhaGravada: async () => { srv.lidos.push('folha'); return { holerites: [res('f1', 'HENRIQUE'), res('f2', 'ANA')] }; } }));
vi.mock('../../calculo/processosGravadosService', () => ({ lerProcesso: async (_e: string, tipo: string) => { srv.lidos.push(tipo); return tipo === 'ferias' ? { holerites: [res('f2', 'ANA')] } : null; } }));
vi.mock('../enviosFuncionarioService', () => ({ historicoDeEnvios: (_e: string, _c: string, tipo: string) => ({ listar: async () => new Map(), registrar: async (fichaId: string) => { srv.historico.push(`${tipo}:${fichaId}`); } }) }));
vi.mock('../holeritePdf', () => ({ holeritesPdf: () => ({ output: () => new ArrayBuffer(4), save: () => undefined }), recibosAdiantamentoPdf: () => ({ output: () => new ArrayBuffer(4), save: () => undefined }) }));
vi.mock('../../pacoteCliente/spConnect', async (orig) => ({
    ...(await orig<typeof import('../../pacoteCliente/spConnect')>()),
    enviarEmailPeloEscritorio: async (e: { para: string; assunto: string; mensagem: string }) => { srv.enviados.push(e); return { remetente: 'dp@x', fonteRemetente: 'padrao', copiaPara: [] }; },
}));
import HoleriteEnvioPanel from '../../../components/relatorios/HoleriteEnvioPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); srv.enviados.length = 0; srv.lidos.length = 0; srv.historico.length = 0; vi.restoreAllMocks(); });
const ATIVA = { id: 'E1', nome: 'ALFA', cnpj: '44.388.152/0001-89', codigoSage: '1200', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };

describe('holerite por e-mail e WhatsApp (tela)', () => {
    it('mensal pela folha gravada; seleção por departamento; férias pelo processo gravado, com o título e a mensagem no e-mail', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><HoleriteEnvioPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        expect(await screen.findByText('2 de 2 documento(s) na seleção.')).toBeTruthy();
        fireEvent.change(await screen.findByLabelText('Departamento'), { target: { value: 'LOJA' } });
        expect(screen.getByText('1 de 2 documento(s) na seleção.')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Departamento'), { target: { value: '' } });
        fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'ferias' } });
        expect(await screen.findByText('1 de 1 documento(s) na seleção.')).toBeTruthy();
        expect(srv.lidos).toContain('ferias');
        fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Boas férias!' } });
        fireEvent.click(screen.getByText('Enviar'));
        fireEvent.click(await screen.findByText('Enviar 1 holerite(s) por e-mail'));
        await waitFor(() => expect(srv.enviados).toHaveLength(1));
        expect(srv.enviados[0]).toMatchObject({ para: 'a@ex.com', assunto: 'Recibo de férias 10/2026 · ALFA LTDA' });
        expect(srv.enviados[0].mensagem).toMatch(/seu recibo de férias de 10\/2026.*\n\nBoas férias!/s);
        await waitFor(() => expect(srv.historico).toEqual(['holerite-ferias:f2']));
    });
});
