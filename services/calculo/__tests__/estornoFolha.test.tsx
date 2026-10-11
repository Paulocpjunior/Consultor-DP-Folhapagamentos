// @vitest-environment jsdom
// Estorno do cálculo: o plano (bloqueios e avisos do eSocial), o movimento zerado e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Envio, EventoEnviado } from '../../esocial/transmissaoService';
import type { FolhaGravada } from '../folhaGravada';
import type { MovimentoGravado } from '../movimento';
import { movimentoEstornado, planoDoEstorno, temLancamento } from '../estornoFolha';

const ficha = (id: string, cpf: string): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '11222333000181' }), id, cpf, situacao: 'ativo', dados: { nome: `PESSOA ${id}` } });
const FICHAS = [ficha('E1_1', '52998224725'), ficha('E1_2', '11144477735')];
const GRAVADA: FolhaGravada = { empresaId: 'E1', competencia: '2026-09', pagamento: '2026-10', gravadoPorEmail: 'dp@x', totais: { funcionarios: 2, proventos: 1, descontos: 0, liquido: 1, fgts: 0 },
    holerites: FICHAS.map(f => ({ fichaId: f.id } as FolhaGravada['holerites'][number])) };
const mov = (fichaId: string, movimento: MovimentoGravado['movimento']): MovimentoGravado => ({ id: `${fichaId}_2026-09`, empresaId: 'E1', fichaId, competencia: '2026-09', movimento });
const ev = (x: Partial<EventoEnviado>): EventoEnviado => ({ id: 'ID1', tipo: 'S-1200', perApur: '2026-09', cdResposta: 201, nrRecibo: '1.2.0000000000000000001', ...x });
const envio = (eventos: EventoEnviado[], x: Partial<Envio> = {}): Envio => ({ id: 'L1', empresaId: 'E1', cnpj: '11222333', tpAmb: 1, grupo: 3, protocolo: 'P1', dhRecepcao: '', transmissor: '', certificado: 'escritorio',
    situacao: 'processado', cdResposta: 201, descResposta: '', ocorrencias: [], eventos, enviadoPorEmail: 'dp@x', enviadoEm: '2026-10-05T10:00:00Z', consultadoEm: '2026-10-05T10:05:00Z', ...x } as Envio);
const plano = (p: Partial<Parameters<typeof planoDoEstorno>[0]>) => planoDoEstorno({ competencia: '2026-09', encerrado: false, gravada: GRAVADA, movimentos: [], envios: [], fichas: FICHAS, ...p });

describe('plano do estorno', () => {
    it('bloqueia a competência encerrada e o mês sem nada a estornar', () => {
        expect(plano({ encerrado: true }).bloqueio).toMatch(/encerrada no Fim de mês: o gestor do DP reabre/);
        expect(plano({ gravada: null }).bloqueio).toMatch(/Nada a estornar/);
        expect(plano({ gravada: null, movimentos: [mov('E1_1', { horasExtras50: 2 })] }).bloqueio).toBe('');
        const limpo = plano({});
        expect(limpo.bloqueio).toBe('');
        expect(limpo.avisos).toEqual(['Nada desta competência foi aceito no eSocial pelo Consultor: o estorno só desfaz a gravação.']);
    });

    it('avisa dos S-1200, S-1210 e S-1299 aceitos e do lote sem retorno; teste e excluídos não contam', () => {
        const envios = [
            envio([ev({ ref: 'E1_1' }), ev({ ref: 'E1_2', nrRecibo: '1.2.0000000000000000002' })]),
            envio([ev({ tipo: 'S-1210', perApur: '2026-10', ref: 'E1_1', nrRecibo: '1.2.0000000000000000003' })], { id: 'L2' }),
            envio([ev({ tipo: 'S-1299', ref: '', nrRecibo: '1.2.0000000000000000004' })], { id: 'L3', enviadoEm: '2026-10-06T10:00:00Z' }),
            envio([ev({ ref: 'E1_1', nrRecibo: '1.2.0000000000000000009' })], { id: 'L4', tpAmb: 2 }),
            envio([ev({ ref: 'E1_2', cdResposta: null, nrRecibo: '' })], { id: 'L5', situacao: 'em-processamento' }),
        ];
        const p = plano({ envios });
        expect([p.s1200Aceitos, p.s1210Aceitos, p.fechadoNoEsocial]).toEqual([2, 1, true]);
        const t = p.avisos.join(' ');
        expect(t).toMatch(/fechado no eSocial \(S-1299 aceito\).*S-1298/);
        expect(t).toMatch(/2 S-1200 de 09\/2026 aceito\(s\).*exclua \(S-3000\) primeiro o S-1210/);
        expect(t).toMatch(/1 S-1210 de 10\/2026/);
        expect(t).toMatch(/1 S-1200 de 09\/2026 enviado\(s\) sem retorno/);
        expect(t).toMatch(/DCTFWeb e a guia do FGTS Digital/);
        // S-1298 aceito depois do S-1299: reaberto. S-3000 aceito: o S-1200 excluído não conta.
        const reaberto = plano({ envios: [...envios, envio([ev({ tipo: 'S-1298', ref: '', nrRecibo: '1.2.0000000000000000005' })], { id: 'L6', enviadoEm: '2026-10-07T10:00:00Z' }),
            envio([ev({ tipo: 'S-3000', ref: 'exclui:1.2.0000000000000000002:11144477735:2026-09', nrRecibo: '1.2.0000000000000000006' })], { id: 'L7' })] });
        expect([reaberto.fechadoNoEsocial, reaberto.s1200Aceitos]).toEqual([false, 1]);
    });

    it('zerar o movimento tira os lançamentos e mantém o arredondamento e o IRRF gravado', () => {
        const m = { horasExtras50: 3, faltasDias: 1, pensaoAlimenticia: 5000, arredondamentoAnterior: 37, irrfRetido: 1200, lancamentos: [{ descricao: 'BONUS', valor: 10000, tipo: 'provento' as const, inss: true, fgts: true, irrf: true }] };
        expect(movimentoEstornado(m)).toEqual({ arredondamentoAnterior: 37, irrfRetido: 1200 });
        expect(temLancamento(m)).toBe(true);
        expect(temLancamento({ arredondamentoAnterior: 37 })).toBe(false);
        expect(plano({ movimentos: [mov('E1_1', m), mov('E1_2', { arredondamentoAnterior: 10 })] }).movimentos.map(x => x.fichaId)).toEqual(['E1_1']);
    });
});

const srv = vi.hoisted(() => ({ estornos: [] as unknown[][], salvos: [] as unknown[][] }));
vi.mock('../../esocial/transmissaoService', () => ({ listarEnvios: async () => [] }));
vi.mock('../movimentosService', () => ({
    listarMovimentos: async () => [{ id: 'E1_1_2026-09', empresaId: 'E1', fichaId: 'E1_1', competencia: '2026-09', movimento: { horasExtras50: 3, arredondamentoAnterior: 37 } }],
    salvarMovimentos: async (...a: unknown[]) => { srv.salvos.push(a); },
}));
vi.mock('../folhaGravadaService', () => ({ estornarFolha: async (...a: unknown[]) => { srv.estornos.push(a); } }));
import EstornoFolhaModal from '../../../components/calculo/EstornoFolhaModal';
afterEach(() => { cleanup(); srv.estornos.length = 0; srv.salvos.length = 0; });

describe('tela do estorno', () => {
    it('pede motivo e a confirmação; apaga a folha e zera o movimento', async () => {
        const feito = vi.fn();
        render(<EstornoFolhaModal empresaId="E1" empresaNome="ALFA" competencia="2026-09" encerrado={false} gravada={GRAVADA} fichas={FICHAS} usuario={{ id: 'u', email: 'dp@x' }} onFechar={() => {}} onEstornado={feito} />);
        await screen.findByLabelText('Avisos do estorno');
        const botao = screen.getByText('Estornar') as HTMLButtonElement;
        fireEvent.change(screen.getByLabelText('Motivo do estorno'), { target: { value: 'Faltou lançar a comissão' } });
        expect(botao.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Confirmação do estorno'), { target: { value: 'estornar' } });
        fireEvent.click(screen.getByLabelText('Zerar também o movimento'));
        expect(botao.disabled).toBe(false);
        fireEvent.click(botao);
        await waitFor(() => expect(feito).toHaveBeenCalledWith(true));
        expect(srv.estornos).toEqual([['E1', '2026-09', 'Faltou lançar a comissão', { id: 'u', email: 'dp@x' }]]);
        expect(srv.salvos[0][2]).toEqual([{ fichaId: 'E1_1', antes: { horasExtras50: 3, arredondamentoAnterior: 37 }, depois: { arredondamentoAnterior: 37 } }]);
    });
    it('competência encerrada: bloqueado', async () => {
        render(<EstornoFolhaModal empresaId="E1" empresaNome="ALFA" competencia="2026-09" encerrado gravada={GRAVADA} fichas={FICHAS} usuario={{ id: 'u', email: 'dp@x' }} onFechar={() => {}} onEstornado={() => {}} />);
        expect((await screen.findByRole('alert')).textContent).toMatch(/encerrada/);
        expect((screen.getByText('Estornar') as HTMLButtonElement).disabled).toBe(true);
    });
});
