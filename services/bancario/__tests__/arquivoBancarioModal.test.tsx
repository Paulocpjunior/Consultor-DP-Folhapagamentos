// @vitest-environment jsdom
// Modal "Arquivo Bancário": cadastra a conta da empresa, mostra a prévia e baixa a remessa.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const sv = vi.hoisted(() => {
    type Conta = { id: string; proximoNsa: number; remessas?: { chave: string; nsa: number; em: string; quantidade: number; total: number }[] };
    const banco = { contas: [] as Conta[] };
    // Gravação da conta em transação, sobre a lista do banco.
    const salvar = vi.fn(async (_empresaId: string, conta: Conta, _nsaEditado: boolean) => {
        banco.contas = [...banco.contas.filter(c => c.id !== conta.id), conta];
        return banco.contas;
    });
    // Reserva do número em transação: lê as contas gravadas e devolve o número, gravando o seguinte (e a remessa gerada).
    const reservar = vi.fn(async (_empresaId: string, contaId: string, remessa?: { chave: string; quantidade: number; total: number }, aceitar = false) => {
        const conta = banco.contas.find(c => c.id === contaId)!;
        const repetida = remessa && conta.remessas?.find(x => x.chave === remessa.chave);
        if (repetida && !aceitar) return { nsa: 0, contas: banco.contas, repetida };
        const nsa = conta.proximoNsa;
        banco.contas = banco.contas.map(c => (c.id === contaId ? { ...c, proximoNsa: nsa + 1, remessas: [...(remessa ? [{ ...remessa, nsa, em: '2026-10-10T10:00:00.000Z' }] : []), ...(c.remessas ?? [])] } : c));
        return { nsa, contas: banco.contas };
    });
    return { salvar, reservar, banco };
});
vi.mock('../../empresas/empresasService', () => ({ gravarContaPagamento: (...a: [string, never, boolean]) => sv.salvar(...a), reservarNsa: (...a: [string, string]) => sv.reservar(...a) }));
import ArquivoBancarioModal from '../../../components/bancario/ArquivoBancarioModal';
import { fichaVazia } from '../../cadastros/funcionarios';
import type { ResultadoCalculo } from '../../calculo/motorMensal';

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); sv.banco.contas = []; });

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
        expect(sv.salvar.mock.calls[0][1]).toMatchObject({ banco: '237', conta: '12345-6', convenio: '123456', proximoNsa: 1 });
        await waitFor(() => expect(screen.getByText(/Crédito em conta \(mesmo banco\): 1/)).toBeTruthy());
        expect(screen.getByText(/ainda não conferido com o arquivo gerado pela SAGE/)).toBeTruthy();
        const fora = screen.getByText(/Fora do arquivo \(2\)/).parentElement!;
        expect(within(fora).getByText('CAIO: cálculo com erro')).toBeTruthy();
        expect(within(fora).getByText(/BRUNO: sem banco/)).toBeTruthy();
        fireEvent.click(screen.getByText('Gerar arquivo (.REM)'));
        await waitFor(() => expect(sv.reservar).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
        expect((await sv.reservar.mock.results[0].value).contas[0].proximoNsa).toBe(2);
        expect(screen.getByRole('status').textContent).toMatch(/PG\d{4}01\.REM baixado: 1 pagamento/);
        // De novo, com os mesmos pagamentos: pergunta antes (os dois arquivos no banco pagariam duas vezes).
        let gerarDeNovo = false;
        const confirmar = vi.spyOn(window, 'confirm').mockImplementation(m => !/já foi gerado/.test(m ?? '') || gerarDeNovo);
        fireEvent.click(screen.getByText('Gerar arquivo (.REM)'));
        await waitFor(() => expect(confirmar).toHaveBeenCalledWith(expect.stringMatching(/O arquivo nº 1 de Folha mensal 10\/2026 já foi gerado .* com os mesmos 1 pagamento\(s\)/)));
        expect(criar).toHaveBeenCalledTimes(1);
        expect(sv.banco.contas[0].proximoNsa).toBe(2);
        gerarDeNovo = true;
        fireEvent.click(screen.getByText('Gerar arquivo (.REM)'));
        await waitFor(() => expect(criar).toHaveBeenCalledTimes(2));
        expect(sv.banco.contas[0].proximoNsa).toBe(3);
    });

    it('editar a conta não devolve o próximo número a um já usado por outro arquivo', async () => {
        const contaGravada = { id: 'c1', banco: '237', agencia: '1234-5', agenciaDv: '', conta: '12345-6', contaDv: '', convenio: '123456', proximoNsa: 5 };
        sv.banco.contas = [contaGravada];
        render(<ArquivoBancarioModal empresa={{ ...empresa, contasPagamento: [contaGravada] }} resultados={[res('f1', 'ANA', 300000)]} fichas={fichas} titulo="Folha mensal 10/2026" dataSugerida="2026-11-06" onFechar={() => {}} />);
        fireEvent.click(await screen.findByText('Editar conta'));
        fireEvent.change(screen.getByLabelText('Convênio'), { target: { value: '999' } });
        fireEvent.click(screen.getByText('Gravar conta'));
        await waitFor(() => expect(sv.salvar).toHaveBeenCalledTimes(1));
        expect(sv.salvar.mock.calls[0][2]).toBe(false);
        fireEvent.click(screen.getByText('Editar conta'));
        fireEvent.change(screen.getByLabelText('Próximo número do arquivo'), { target: { value: '9' } });
        fireEvent.click(screen.getByText('Gravar conta'));
        await waitFor(() => expect(sv.salvar).toHaveBeenCalledTimes(2));
        expect(sv.salvar.mock.calls[1][2]).toBe(true);
    });

    it('no Safari o .REM vai dentro de um .zip e a tela diz por quê (Itaú recusou "PG081010.REM.txt")', async () => {
        const blobs: Blob[] = [];
        Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => { blobs.push(b); return 'blob:x'; }), revokeObjectURL: vi.fn() });
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15');
        const baixados: string[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { baixados.push(this.download); });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const contaGravada = { id: 'c1', banco: '237', agencia: '1234-5', agenciaDv: '', conta: '12345-6', contaDv: '', convenio: '123456', proximoNsa: 5 };
        sv.banco.contas = [contaGravada];
        render(<ArquivoBancarioModal empresa={{ ...empresa, contasPagamento: [contaGravada] }} resultados={[res('f1', 'ANA', 300000)]} fichas={fichas} titulo="Folha mensal 10/2026" dataSugerida="2026-11-06" onFechar={() => {}} />);
        fireEvent.click(await screen.findByText('Gerar arquivo (.REM)'));
        await waitFor(() => expect(baixados).toHaveLength(1));
        expect(baixados[0]).toMatch(/^PG\d{4}\d{2}\.zip$/);
        expect(blobs[0].type).toBe('application/zip');
        expect(screen.getByRole('status').textContent).toMatch(/PG\d{6}\.REM baixado dentro de PG\d{6}\.zip: .*acrescentaria "\.txt"/);
    });

    it('sem conseguir reservar o número do arquivo (permissão ou rede), não baixa: o próximo sairia repetido', async () => {
        const criar = vi.fn(() => 'blob:x');
        Object.assign(URL, { createObjectURL: criar, revokeObjectURL: vi.fn() });
        sv.reservar.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
        const contaGravada = { id: 'c1', banco: '237', agencia: '1234-5', agenciaDv: '', conta: '12345-6', contaDv: '', convenio: '123456', proximoNsa: 5 };
        sv.banco.contas = [contaGravada];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<ArquivoBancarioModal empresa={{ ...empresa, contasPagamento: [contaGravada] }} resultados={[res('f1', 'ANA', 300000)]} fichas={fichas} titulo="Folha mensal 10/2026" dataSugerida="2026-11-06" onFechar={() => {}} />);
        fireEvent.click(await screen.findByText('Gerar arquivo (.REM)'));
        await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Arquivo não gerado: não foi possível reservar o número do arquivo \(Missing or insufficient permissions\.\)/));
        expect(criar).not.toHaveBeenCalled();
    });

    it('arquivo do adiantamento: o valor de cada um vem de fora (não o líquido) e quem não tem fica fora sem aviso', async () => {
        const contaGravada = { id: 'c1', banco: '237', agencia: '1234-5', agenciaDv: '', conta: '12345-6', contaDv: '', convenio: '123456', proximoNsa: 5 };
        sv.banco.contas = [contaGravada];
        const fichas2 = [...fichas, ficha('f3', 'CAIO', { banco: '237', agencia: '0987', conta: '44444-0', tipoConta: 'corrente' })];
        const valor = (r: ResultadoCalculo) => (r.fichaId === 'f1' ? 100000 : 0);
        render(<ArquivoBancarioModal empresa={{ ...empresa, contasPagamento: [contaGravada] }} resultados={[res('f1', 'ANA', 300000), res('f3', 'CAIO', 200000)]} fichas={fichas2}
            titulo="Adiantamento salarial 10/2026" dataSugerida="2026-10-20" valorPorResultado={valor} rotuloValor="Adiantamento" onFechar={() => {}} />);
        await screen.findByText('Gerar arquivo (.REM)');
        expect(screen.getByRole('columnheader', { name: 'Adiantamento' })).toBeTruthy();
        const linhas = screen.getAllByRole('row').slice(1).map(l => l.textContent);
        expect(linhas).toHaveLength(1);
        expect(linhas[0]).toMatch(/ANA.*20\/10\/2026.*R\$\s?1\.000,00/);
        expect(screen.queryByText(/Fora do arquivo/)).toBeNull();
    });
});
