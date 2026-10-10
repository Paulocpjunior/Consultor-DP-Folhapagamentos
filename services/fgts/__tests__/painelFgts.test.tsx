// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia } from '../../cadastros/funcionarios';

const srv = vi.hoisted(() => ({ gravados: [] as unknown[][], procuracao: [] as unknown[] }));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'E1', cnpj: '29463877000109', razaoSocial: 'EMPRESA X', nomeFantasia: 'X' }], salvarProcuracaoFgts: async (...a: unknown[]) => { srv.procuracao.push(a); } }));
vi.mock('../../cadastros/cadastrosService', () => ({ listarFuncionarios: async () => [{ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo', dados: { nome: 'ANA', admissao: '2025-06-01', salario: '3000.00', unidadeSalario: '5', categoria: '101' } }], mensagemErro: (e: unknown) => String(e) }));
vi.mock('../../calculo/folhaGravadaService', () => ({ lerFolhasDoAno: async () => [] }));
vi.mock('../../serpro/serproIntegrationService', () => ({
    consultarCrfFgts: async () => ({ ok: true, status: 'negativa', validade: '2026-11-01' }),
    // Um mês em aberto (o mais antigo), os demais recolhidos.
    consultarFgtsRecolhimento: async (_c: string, comp: string) => (comp === '2026-07' ? { ok: true, regular: false, depositoDevido: 2400, depositoRealizado: 0 } : { ok: true, regular: true, depositoDevido: 2400, depositoRealizado: 2400 }),
}));
vi.mock('../../esocial/esocialService', () => ({ gravarFgtsComId: async (...a: unknown[]) => { srv.gravados.push(a); } }));

import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
import PainelFgts from '../../../components/fgts/PainelFgts';
const ATIVA = { id: 'E1', nome: 'X', cnpj: '29463877000109', codigoSage: '1', competencia: '2026-09', ativadaPor: 'u', ativadaEm: 0 };
afterEach(() => { cleanup(); srv.gravados.length = 0; srv.procuracao.length = 0; vi.useRealTimers(); });

describe('Consulta de FGTS na tela', () => {
    it('consulta os meses no SERPRO, mostra a situação e atualiza o aviso de pendências sem duplicar', async () => {
        vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-25T12:00:00-03:00'));
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><PainelFgts /></EmpresaAtivaProvider>);
        fireEvent.change(screen.getByLabelText('Meses consultados'), { target: { value: '3' } });
        fireEvent.click(screen.getByText('Consultar no SERPRO'));
        await screen.findByText(/Consulta concluída: 1 em aberto, 0 em parte, 0 sem declaração, 2 recolhido/);
        expect(screen.getByText(/Em aberto \(vencido\) · falta R\$\s2\.400,00/)).toBeTruthy();
        expect(screen.getByText(/Regular · válido até 01\/11\/2026/)).toBeTruthy();
        expect(srv.gravados.map(g => g[0])).toEqual(['serpro_E1_2026-09', 'serpro_E1_2026-08', 'serpro_E1_2026-07']);
        expect(srv.gravados[2][1]).toMatchObject({ status: 'atrasado', valorDevido: 2400, valorRecolhido: 0 });
    });
    it('procuração: avisa a falta e grava perfil e validade', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><PainelFgts /></EmpresaAtivaProvider>);
        expect(await screen.findByText(/Sem procuração do FGTS Digital registrada/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Validade da procuração'), { target: { value: '2027-10-01' } });
        fireEvent.click(screen.getByText('Gravar'));
        await waitFor(() => expect(srv.procuracao).toEqual([['E1', { perfil: 'consulta', validaAte: '2027-10-01' }]]));
    });
});
