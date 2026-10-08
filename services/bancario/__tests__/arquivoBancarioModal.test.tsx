// @vitest-environment jsdom
// Modal "Arquivo Bancário": cadastra a conta da empresa, mostra a prévia e baixa a remessa.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const sv = vi.hoisted(() => {
    const salvar = vi.fn(async (..._a: unknown[]) => undefined);
    // Reserva do número em transação: lê as contas gravadas (a última gravação) e devolve o número, gravando o seguinte.
    const reservar = vi.fn(async (_empresaId: string, contaId: string) => {
        const contas = (salvar.mock.calls.at(-1)?.[1] ?? []) as { id: string; proximoNsa: number }[];
        const nsa = contas.find(c => c.id === contaId)?.proximoNsa ?? 1;
        return { nsa, contas: contas.map(c => (c.id === contaId ? { ...c, proximoNsa: nsa + 1 } : c)) };
    });
    return { salvar, reservar };
});
vi.mock('../../empresas/empresasService', () => ({ salvarContasPagamento: (...a: unknown[]) => sv.salvar(...a), reservarNsa: (e: string, c: string) => sv.reservar(e, c) }));
import ArquivoBancarioModal from '../../../components/bancario/ArquivoBancarioModal';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });

const empresa = { id: 'E1', cnpj: '44388152000189', razaoSocial: 'S&P ASSESSORIA CONTABIL S/S', nomeFantasia: 'SP', codigoSage: '1200', criadoPor: 'g' };
const ficha = (id: string, nome: string, dados: Record<string, string>) => ({ ...fichaVazia({ id: 'E1', cnpj: empresa.cnpj }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo' as const, dados: { nome, ...dados } });
const fichas = [ficha('f1', 'ANA', { banco: '237', agencia: '0987', conta: '55555-0', tipoConta: 'corrente' }), ficha('f2', 'BRUNO', {})];
const res = (fichaId: string, nome: string, liquido: number, situacao = 'calculado'): ResultadoCalculo => ({ fichaId, nome, competencia: '2026-10', pagamento: '2026-11', situacao,
    verbas: [], bases: { inss: 0, fgts: 0, irrf: 0 }, totais: { proventos: liquido, descontos: 0, liquido }, fgts: 0, memoria: [], avisos: [], erros: [] } as unknown as ResultadoCalculo);

describe('modal Arquivo Bancário', () => {
    it('sem conta: cadastra; prévia com quem entra e quem fica de fora; gera o .REM e grava o próximo número', async () => {
        const criar = vi.fn(() => 'blob:x');
        Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<ArquivoBancarioModal empresa={empresa} resultados={[res('f1', 'ANA', 250000), res('f2', 'BRUNO', 180000), res('f3', 'CAIO', 0, 'erro')]} fichas={fichas}
            titulo="Folha mensal 10/2026" dataSugerida="2026-11-06" onFechar={() => {}} />);
        fireEvent.change(screen.getByLabelText('Banco da empresa'), { target: { value: '237' } });
        fireEvent.change(screen.getByLabelText('Agência da empresa'), { target: { value: '1234-5' } });
        fireEvent.change(screen.getByLabelText('Conta da empresa'), { target: { value: '12345-6' } });
        fireEvent.change(screen.getByLabelText('Convênio'), { target: { value: '123456' } });
        fireEvent.click(screen.getByText('Gravar conta'));
        await waitFor(() => expect(sv.salvar).toHaveBeenCalledTimes(1));
        expect((sv.salvar.mock.calls[0][1] as { banco: string; conta: string }[])[0]).toMatchObject({ banco: '237', conta: '12345-6', convenio: '123456', proximoNsa: 1 });
        await waitFor(() => expect(screen.getByText(/Crédito em conta \(mesmo banco\): 1/)).toBeTruthy());
        expect(screen.getByText(/ainda não conferido com o arquivo gerado pela SAGE/)).toBeTruthy();
        const fora = screen.getByText(/Fora do arquivo \(2\)/).parentElement!;
        expect(within(fora).getByText('CAIO: cálculo com erro')).toBeTruthy();
        expect(within(fora).getByText(/BRUNO: sem banco/)).toBeTruthy();
        fireEvent.click(screen.getByText('Gerar arquivo (.REM)'));
        await waitFor(() => expect(sv.reservar).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
        expect((await sv.reservar.mock.results[0].value).contas[0].proximoNsa).toBe(2);
        expect(screen.getByRole('status').textContent).toMatch(/CNAB240_237_\d{8}_000001\.REM baixado: 1 pagamento/);
    });

    it('sem conseguir reservar o número do arquivo (permissão ou rede), não baixa: o próximo sairia repetido', async () => {
        const criar = vi.fn(() => 'blob:x');
        Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() });
        sv.reservar.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
        const contaGravada = { id: 'c1', banco: '237', agencia: '1234-5', agenciaDv: '', conta: '12345-6', contaDv: '', convenio: '123456', proximoNsa: 5 };
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<ArquivoBancarioModal empresa={{ ...empresa, contasPagamento: [contaGravada] }} resultados={[res('f1', 'ANA', 300000)]} fichas={fichas} titulo="Folha mensal 10/2026" dataSugerida="2026-11-06" onFechar={() => {}} />);
        fireEvent.click(await screen.findByText('Gerar arquivo (.REM)'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Arquivo não gerado: não foi possível reservar o número do arquivo \(Missing or insufficient permissions\.\)/));
        expect(criar).not.toHaveBeenCalled();
    });
});
