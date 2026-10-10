// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { calcularRescisao } from '../../calculo/motorRescisao';

const srv = vi.hoisted(() => ({ marcados: [] as unknown[] }));
vi.mock('../efetivacaoService', async orig => ({ ...(await orig<typeof import('../efetivacaoService')>()),
    lerEfetivacao: async (empresaId: string, fichaId: string, data: string) => ({ empresaId, fichaId, data, passos: {} }),
    marcarPasso: async (e: { passos: object }, passo: string, feito: boolean, obs: string) => { srv.marcados.push([passo, feito, obs]); return { ...e, passos: { ...e.passos, [passo]: { feito, obs, porEmail: 'dp@x', em: '2026-10-10T12:00:00Z' } } }; } }));
import EfetivacaoRescisao from '../../../components/demissoes/EfetivacaoRescisao';

const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'desligado',
    dados: { nome: 'ANA', admissao: '2025-06-01', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', dataDesligamento: '2026-10-05', motivoDesligamento: '02' } };
const R = calcularRescisao({ ficha: FICHA, data: '2026-10-05', tipo: '02', aviso: 'indenizado', afastamentos: [], tabelas: TAB, movimentos: {} });
afterEach(() => { cleanup(); srv.marcados.length = 0; });

describe('efetivação na tela da rescisão', () => {
    it('mostra os passos com a situação do eSocial e marca os manuais com a observação', async () => {
        render(<EfetivacaoRescisao empresa={{ id: 'E1', cnpj: '29463877000109', razaoSocial: 'EMPRESA X' } as never} ficha={FICHA} rescisao={R} usuario={{ id: 'u', email: 'dp@x' }} envios={[]} />);
        expect(screen.getByText(/Efetivação da rescisão · 1 de 7 passos/)).toBeTruthy();
        expect(screen.getByText('Requerimento do seguro-desemprego (Empregador Web)')).toBeTruthy();
        expect(screen.getByText(/16 mês\(es\) neste vínculo: 4 parcelas/)).toBeTruthy();
        fireEvent.change(await screen.findByLabelText('Observação de Requerimento do seguro-desemprego (Empregador Web)'), { target: { value: 'REQ 987' } });
        fireEvent.click(screen.getByLabelText('Requerimento do seguro-desemprego (Empregador Web)'));
        await waitFor(() => expect(srv.marcados).toEqual([['seguro', true, 'REQ 987']]));
        expect(await screen.findByText(/2 de 7 passos/)).toBeTruthy();
        fireEvent.click(screen.getByText('Dados para o Empregador Web'));
        expect(screen.getByText('Nome da mãe')).toBeTruthy();
    });
});
