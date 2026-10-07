// @vitest-environment jsdom
// Modal "Arquivo Bancário": cadastra a conta da empresa, mostra a prévia e baixa a remessa.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const sv = vi.hoisted(() => ({ salvar: vi.fn(async (..._a: unknown[]) => undefined) }));
vi.mock('../../empresas/empresasService', () => ({ salvarContasPagamento: (...a: unknown[]) => sv.salvar(...a) }));
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
        await waitFor(() => expect(sv.salvar).toHaveBeenCalledTimes(2));
        expect(criar).toHaveBeenCalledTimes(1);
        expect((sv.salvar.mock.calls[1][1] as { proximoNsa: number }[])[0].proximoNsa).toBe(2);
        expect(screen.getByRole('status').textContent).toMatch(/CNAB240_237_\d{8}_000001\.REM baixado: 1 pagamento/);
    });
});
