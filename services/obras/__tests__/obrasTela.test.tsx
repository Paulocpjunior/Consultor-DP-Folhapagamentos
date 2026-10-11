// @vitest-environment jsdom
// Tela "Obras e lotações": cadastro da obra própria, gravação e S-1005 pelo pré-voo (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const srv = vi.hoisted(() => ({ gravadas: [] as unknown[], lotes: [] as { xml: string; ref?: string }[][] }));
vi.mock('../../cadastros/cadastrosService', () => ({ mensagemErro: (e: unknown) => String(e) }));
vi.mock('../lotacoesService', () => ({
    listarLotacoes: async () => srv.gravadas,
    salvarLotacao: async (l: unknown) => { srv.gravadas.push(l); },
    excluirLotacao: async () => undefined,
}));
vi.mock('../../esocial/envioSeguro', () => ({
    verificarAntesDeEnviar: async (p: { eventos: { xml: string; ref?: string }[] }) => { srv.lotes.push(p.eventos); return { ok: true, achados: [], eventos: [], tpAmb: 2, empresaId: 'E1' }; },
    transmitirVerificado: async () => ({ situacao: 'enviado', envioId: 'x', retorno: { protocolo: 'P1' } }),
    mensagemDaTransmissao: () => ({ ok: true, texto: 'Lote recebido pelo eSocial. Protocolo P1.' }),
}));
import ObrasLotacoesPanel from '../../../components/obras/ObrasLotacoesPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); srv.gravadas.length = 0; srv.lotes.length = 0; });
const ATIVA = { id: 'E1', nome: 'CONSTRUTORA X', cnpj: '44.388.152/0001-89', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };

describe('obras e lotações (tela)', () => {
    it('cadastra a obra própria com CNO, grava e transmite o S-1005', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ObrasLotacoesPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText('+ Nova obra ou lotação'));
        fireEvent.change(screen.getByLabelText('Código da lotação'), { target: { value: 'OBRA01' } });
        fireEvent.change(screen.getByLabelText('Descrição da lotação'), { target: { value: 'Edifício Aurora' } });
        fireEvent.change(screen.getByLabelText('CNO da obra'), { target: { value: '90.001.23456/78' } });
        fireEvent.change(screen.getByLabelText('CNAE da obra'), { target: { value: '4120-4/00' } });
        fireEvent.click(screen.getByLabelText('Patronal substituída pela CPRB'));
        fireEvent.click(screen.getByText('Gravar'));
        await screen.findByText('Lotação gravada.');
        expect(srv.gravadas[0]).toMatchObject({ codigo: 'OBRA01', tipo: '01', cno: '900012345678', cnaePrep: '4120400', substituida: true, iniValid: '2026-10' });
        fireEvent.click(screen.getByText('Transmitir S-1005 (obra)'));
        await screen.findByText(/S-1005: Lote recebido/);
        expect(srv.lotes[0][0].ref).toBe('estab:OBRA01');
        expect(srv.lotes[0][0].xml).toContain('<indSubstPatrObra>1</indSubstPatrObra>');
    });
    it('empreitada parcial sem contratante não grava', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ObrasLotacoesPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText('+ Nova obra ou lotação'));
        fireEvent.change(screen.getByLabelText('Código da lotação'), { target: { value: 'SUB01' } });
        fireEvent.change(screen.getByLabelText('Descrição da lotação'), { target: { value: 'Subempreitada' } });
        fireEvent.change(screen.getByLabelText('Tipo de lotação'), { target: { value: '02' } });
        fireEvent.click(screen.getByText('Gravar'));
        expect((await screen.findByRole('alert')).textContent).toMatch(/CNO.*Contratante/);
        expect(srv.gravadas).toHaveLength(0);
    });
});
