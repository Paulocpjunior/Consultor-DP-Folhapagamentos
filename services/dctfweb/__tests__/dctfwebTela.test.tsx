// @vitest-environment jsdom
// Tela "DCTFWeb da folha": consulta, DARF e transmissão pelo túnel do CFI (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const srv = vi.hoisted(() => ({
    entregue: false, insumos: 'pronto' as 'pronto' | 'incompleto', darfs: [] as unknown[], transmissoes: [] as unknown[], baixados: [] as string[], consultas: [] as unknown[][],
}));
const selos = (reinf: string) => [
    { departamento: 'dp-folha', rotulo: '👥 DP/Folha — eSocial', estado: 'recebido', detalhe: 'Fechamento (S-1299) transmitido.' },
    { departamento: 'contabil', rotulo: '📊 Contábil — EFD-Reinf', estado: reinf, detalhe: 'Reinf.' },
    { departamento: 'fiscal', rotulo: '🧾 Fiscal — MIT', estado: 'recebido', detalhe: 'MIT encerrado.' },
];
vi.mock('../../serpro/serproIntegrationService', () => ({
    consultarDctfWebStatus: async (...a: unknown[]) => (srv.consultas.push(['status', ...a]), { ok: true, entregue: srv.entregue, situacao: srv.entregue ? 'ATIVA' : 'EM_ANDAMENTO', dataEntrega: srv.entregue ? '2026-10-12' : null }),
    consultarInsumosDctfweb: async () => (srv.insumos === 'pronto'
        ? { ok: true, selos: selos('sem-movimento'), veredito: 'pronto', frase: 'Os três insumos confirmados.' }
        : { ok: true, selos: selos('pendente'), veredito: 'incompleto', frase: 'Falta insumo de: 📊 Contábil — EFD-Reinf.' }),
    consultarDctfWebDebitos: async (...a: unknown[]) => (srv.consultas.push(['debitos', ...a]), { ok: true, fonte: 'serpro', debitos: [{ codReceita: '108201', codigo: '1082', extensao: '01', descricao: 'CP SEGURADOS', valor: 810 }, { codReceita: '113801', codigo: '1138', extensao: '01', descricao: 'CP PATRONAL', valor: 2050 }] }),
    gerarDarfDctfweb: async (...a: unknown[]) => { srv.darfs.push(a); return { ok: true, emAndamento: a[3], valor: 2860, numeroDocumento: '07.01', codigoBarras: '8582', vencimento: '2026-10-20', pdfBase64: 'JVBERg==', mensagens: [], fonte: 'serpro' }; },
    transmitirDctfweb: async (...a: unknown[]) => { srv.transmissoes.push(a); srv.entregue = true; return { numeroRecibo: '1.2.3' }; },
}));
const guias = vi.hoisted(() => ({ registradas: [] as unknown[] }));
vi.mock('../../guias/pagamentoGuiasService', () => ({ registrarGuiaEmitida: async (...a: unknown[]) => { guias.registradas.push(a); } }));
vi.mock('../../implantacao/zip', () => ({ baixarBytes: (nome: string) => { srv.baixados.push(nome); } }));
import DctfwebFolhaPanel from '../../../components/dctfweb/DctfwebFolhaPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); srv.entregue = false; srv.insumos = 'pronto'; srv.darfs.length = 0; srv.transmissoes.length = 0; srv.baixados.length = 0; srv.consultas.length = 0; guias.registradas.length = 0; vi.restoreAllMocks(); });
const ATIVA = { id: 'E1', nome: 'EMPRESA X', cnpj: '44.388.152/0001-89', codigoSage: '1200', competencia: '2026-09', ativadaPor: 'x', ativadaEm: 1 };
const tela = () => render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><DctfwebFolhaPanel /></EmpresaAtivaProvider>);

describe('DCTFWeb da folha (tela)', () => {
    it('consulta, emite o DARF em andamento e transmite com os três insumos confirmados', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        tela();
        expect(screen.getByText(/DARF da folha vence em 20\/10\/2026/)).toBeTruthy();
        fireEvent.click(screen.getByText('Consultar a DCTFWeb'));
        await screen.findByText(/Em andamento \(EM_ANDAMENTO\)/);
        expect(screen.getByText(/R\$\s*2\.860,00/)).toBeTruthy();
        // Situação e débitos levam a empresa ativa junto com o CNPJ (a plataforma confere a carteira).
        expect(srv.consultas).toEqual([['status', 'E1', '44388152000189', '2026-09'], ['debitos', 'E1', '44388152000189', '2026-09']]);
        fireEvent.click(screen.getByText('Emitir DARF (declaração em andamento)'));
        await screen.findByText(/DARF emitido e baixado/);
        expect(srv.darfs).toEqual([['E1', '44388152000189', '2026-09', true]]);
        expect(srv.baixados).toEqual(['DARF-DCTFWeb-1200-2026-09-em-andamento.pdf']);
        fireEvent.click(screen.getByText('Transmitir a DCTFWeb'));
        await screen.findByText(/DCTFWeb transmitida: recibo 1\.2\.3/);
        expect(srv.transmissoes).toEqual([['E1', '44388152000189', '2026-09', { retificadora: false, motivo: undefined }]]);
        // Transmitida: a tela passa para a retificadora e o DARF da ativa.
        await screen.findByText('Emitir DARF (declaração ativa)');
        expect(screen.getByText('Transmitir a retificadora')).toBeTruthy();
    });

    it('com o Reinf pendente, o DP não transmite; o Fiscal transmite com justificativa', async () => {
        srv.insumos = 'incompleto';
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        tela();
        fireEvent.click(screen.getByText('Consultar a DCTFWeb'));
        await screen.findByText(/a transmissão é do Fiscal/);
        const botao = screen.getByText('Transmitir a DCTFWeb') as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        fireEvent.click(screen.getByLabelText(/Confirmo: transmitir sem o insumo pendente/));
        fireEvent.click(botao);
        await screen.findByText(/justificativa da transmissão com insumo pendente/);
        expect(srv.transmissoes).toHaveLength(0);
        fireEvent.change(screen.getByLabelText('Justificativa'), { target: { value: 'Reinf entra amanhã, o prazo vence hoje' } });
        fireEvent.click(botao);
        await waitFor(() => expect(srv.transmissoes).toHaveLength(1));
        expect(srv.transmissoes[0]).toEqual(['E1', '44388152000189', '2026-09', { retificadora: false, motivo: undefined, confirmarInsumosPendentes: true, justificativa: 'Reinf entra amanhã, o prazo vence hoje' }]);
    });

    it('o DARF emitido fica registrado para a baixa no Pagamento de guias', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><DctfwebFolhaPanel usuario={{ id: 'u1', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(screen.getByText('Consultar a DCTFWeb'));
        fireEvent.click(await screen.findByText('Emitir DARF (declaração em andamento)'));
        await screen.findByText(/Registrado em Prazos do DP para a baixa do pagamento/);
        expect(guias.registradas).toEqual([['E1', '2026-09', expect.objectContaining({ id: 'darf-2026-09', data: '2026-10-20' }), { valorDevido: 286000, numeroDocumento: '07.01' }, { id: 'u1', email: 'dp@x' }]]);
    });
});
