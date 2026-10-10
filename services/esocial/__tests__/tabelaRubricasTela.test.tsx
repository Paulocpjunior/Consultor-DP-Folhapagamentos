// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Rubrica } from '../../cadastros/rubricas';
import { pedidoVazio, type PedidoS1010 } from '../tabelaRubricas';

const srv = vi.hoisted(() => ({ salvos: [] as unknown[], aplicados: [] as unknown[], deParas: [] as unknown[], lotes: [] as unknown[], transmitidos: 0 }));
const dados = { dscRubr: 'Horas extras 50%', natRubr: '1003', tpRubr: '1', codIncCP: '11', codIncIRRF: '11', codIncFGTS: '11', codIncCPRP: '', observacao: '' };
const PEDIDOS: PedidoS1010[] = [
    { ...pedidoVazio('E1'), id: 'E1_a', codRubr: 'CDPHE50', ideTabRubr: 'T1', iniValid: '2026-10', dados, chaveVerba: 'HE50' },
    { ...pedidoVazio('E1', 'alteracao'), id: 'E1_b', codRubr: '0001', ideTabRubr: 'T1', iniValid: '2020-01', dados: { ...dados, dscRubr: 'Salário mensal', natRubr: '1000' } },
];
vi.mock('../pedidosS1010Service', () => ({
    listarPedidosS1010: async () => PEDIDOS,
    salvarPedidoS1010: async (p: PedidoS1010) => { srv.salvos.push(p); return 'E1_novo'; },
    descartarPedidoS1010: async () => undefined,
    aplicarPedidoS1010: async (p: PedidoS1010, nova: Rubrica, _antes: unknown, recibo: string) => { srv.aplicados.push([p.id, nova, recibo]); },
}));
vi.mock('../transmissaoService', () => ({
    listarEnvios: async () => [{ id: 'env1', empresaId: 'E1', tpAmb: 1, situacao: 'processado', protocolo: 'P1', eventos: [{ id: 'ID1', tipo: 'S-1010', perApur: null, ref: 's1010:E1_a', cdResposta: 201, nrRecibo: '1.1.REC' }] }],
    registrarConsulta: async () => undefined,
}));
vi.mock('../../empresas/empresasService', () => ({ salvarParametrosEsocialFolha: async (_id: string, p: unknown) => { srv.deParas.push(p); } }));
vi.mock('../envioSeguro', () => ({
    verificarAntesDeEnviar: async (p: { eventos: { ref: string; xml: string }[] }) => { srv.lotes.push(p.eventos); return { ok: true, achados: [], eventos: [], tpAmb: 2, empresaId: 'E1' }; },
    transmitirVerificado: async () => { srv.transmitidos++; return { situacao: 'enviado', envioId: 'x', retorno: { protocolo: 'P2' } }; },
    mensagemDaTransmissao: () => ({ ok: true, texto: 'Lote recebido pelo eSocial. Protocolo P2.' }),
}));
import TabelaRubricasEsocial from '../../../components/esocial/TabelaRubricasEsocial';

const SAL: Rubrica = { id: 'E1_T1_0001', empresaId: 'E1', codRubr: '0001', ideTabRubr: 'T1', eventoIob: '', origem: '',
    vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: 'R0', dados: { ...dados, dscRubr: 'Salário', natRubr: '1000' } }] };
const EMPRESA = { id: 'E1', cnpj: '29463877000109', nomeFantasia: 'EMPRESA X', esocialFolha: { nrInscEstab: '29463877000109', codLotacao: 'L1', rubricas: { SAL: { codRubr: '0001', ideTabRubr: 'T1' } } } };
afterEach(() => { cleanup(); for (const k of ['salvos', 'aplicados', 'deParas', 'lotes'] as const) srv[k].length = 0; srv.transmitidos = 0; vi.restoreAllMocks(); });

describe('S-1010 pelo Consultor (tela)', () => {
    it('aplica o aceito no cadastro e no de/para, monta rubrica pelo modelo e transmite só o que falta', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const onAtualizado = vi.fn();
        render(<TabelaRubricasEsocial empresa={EMPRESA as never} usuario={{ id: 'u', email: 'dp@x' }} rubricas={[SAL]} onFechar={() => undefined} onAtualizado={onAtualizado} />);

        expect(await screen.findByText('1 S-1010 aceito(s) em produção ainda fora do cadastro.')).toBeTruthy();
        fireEvent.click(screen.getByText('Atualizar a tabela de rubricas'));
        await waitFor(() => expect(srv.aplicados).toHaveLength(1));
        const [id, nova, recibo] = srv.aplicados[0] as [string, Rubrica, string];
        expect([id, recibo, nova.id, nova.vigencias.map(v => v.iniValid)]).toEqual(['E1_a', '1.1.REC', 'E1_T1_CDPHE50', ['2026-10']]);
        await waitFor(() => expect(srv.deParas).toHaveLength(1));
        expect((srv.deParas[0] as { rubricas: Record<string, unknown> }).rubricas).toEqual({ SAL: { codRubr: '0001', ideTabRubr: 'T1' }, HE50: { codRubr: 'CDPHE50', ideTabRubr: 'T1' } });
        expect(onAtualizado).toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('Verba do Consultor'), { target: { value: 'RESC:AVISO' } });
        fireEvent.click(screen.getByText('Montar pelo modelo'));
        expect((screen.getByLabelText('Descrição da rubrica') as HTMLInputElement).value).toBe('Aviso prévio indenizado');
        expect((screen.getByLabelText('Incidência do FGTS') as HTMLSelectElement).value).toBe('21');
        expect(screen.getByText(/isento de IRRF; confira o código da isenção/)).toBeTruthy();
        fireEvent.click(screen.getByText('Gravar rascunho'));
        await waitFor(() => expect(srv.salvos).toHaveLength(1));
        expect(srv.salvos[0]).toMatchObject({ acao: 'inclusao', codRubr: 'CDPRAVISO', ideTabRubr: 'T1', chaveVerba: 'RESC:AVISO', dados: { natRubr: '6003', codIncFGTS: '21' } });

        fireEvent.click(await screen.findByText('Transmitir 1 S-1010'));
        await waitFor(() => expect(srv.transmitidos).toBe(1));
        const lote = srv.lotes[0] as { ref: string; xml: string }[];
        expect(lote.map(e => e.ref)).toEqual(['s1010:E1_b']);
        expect(lote[0].xml).toContain('<alteracao><ideRubrica><codRubr>0001</codRubr>');
        expect(await screen.findByText(/Lote recebido pelo eSocial/)).toBeTruthy();
    });

    it('abre direto na alteração de uma rubrica da lista de incidências', async () => {
        render(<TabelaRubricasEsocial empresa={EMPRESA as never} usuario={{ id: 'u', email: 'dp@x' }} rubricas={[SAL]} inicio={{ acao: 'alteracao', rubrica: SAL, competencia: '2026-10' }} onFechar={() => undefined} onAtualizado={() => undefined} />);
        expect((await screen.findByLabelText('Operação do S-1010') as HTMLSelectElement).value).toBe('alteracao');
        expect((screen.getByLabelText('Vigência a mudar') as HTMLSelectElement).value).toBe('2020-01');
        fireEvent.change(screen.getByLabelText('Incidência do INSS'), { target: { value: '00' } });
        fireEvent.click(screen.getByText('Gravar rascunho'));
        await waitFor(() => expect(srv.salvos).toHaveLength(1));
        expect(srv.salvos[0]).toMatchObject({ acao: 'alteracao', codRubr: '0001', iniValid: '2020-01', dados: { codIncCP: '00', dscRubr: 'Salário' } });
    });
});
