// @vitest-environment jsdom
// Importação de valores pelo layout de ponto do IOB (Windows 3 e 4): leitura, lançamento no movimento e a tela (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { EventoIobSage } from '../../folha/folhaTypes';
import { aplicarValores, lerValoresIob } from '../importacaoValores';

const ev = (codigo: string, descricao: string, x: Partial<EventoIobSage> = {}): EventoIobSage => ({ codigo, descricao, tipo: 'V', rv: 'R', ro: '020', coeficiente: 0, incidencias: { in: 'S', ir: 'S', fg: 'S' }, ...x } as EventoIobSage);
const EVENTOS = [ev('0010', 'HORA EXTRA 50%', { coeficiente: 1.5 }), ev('0200', 'COMISSOES', { rv: 'V', ro: '001' }), ev('0300', 'FALTAS (DIAS)', { tipo: 'D', ro: '080' })];
const ficha = (id: string, codigoIob: string): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id, cpf: id, situacao: 'ativo',
    dados: { nome: `PESSOA ${id}`, codigoIob, admissao: '2025-01-02', salario: '2200.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101' } });
const FICHAS = [ficha('A', '123'), ficha('B', '000456')];
const linha = (cod: number, evt: string, ref: number, valor: number, extra = '') => `${String(cod).padStart(6, '0')}${evt}${String(Math.round(ref * 1e6)).padStart(14, '0')}  ${String(valor).padStart(14, '0')}${extra}`;

const srv = vi.hoisted(() => ({ salvos: [] as unknown[][] }));
vi.mock('../../cadastros/cadastrosService', () => ({ listarFuncionarios: async () => FICHAS, mensagemErro: (e: unknown) => String(e) }));
vi.mock('../catalogoEventos', () => ({ carregarEventosIob: async () => EVENTOS }));
vi.mock('../movimentosService', () => ({ listarMovimentos: async () => [], salvarMovimentos: async (...a: unknown[]) => { srv.salvos.push(a); } }));
vi.mock('../../fimDeMes/fechamentoService', () => ({ lerFechamento: async () => null }));
import ImportacaoValoresPanel from '../../../components/calculo/ImportacaoValoresPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
afterEach(() => { cleanup(); srv.salvos.length = 0; });

describe('leitura do TXT', () => {
    it('Windows 3: código, evento, referência com 6 decimais e valor com 2', () => {
        const r = lerValoresIob([linha(123, '0010', 10.5, 0), linha(456, '0200', 0, 150000), ''].join('\r\n'));
        expect(r.erros).toEqual([]);
        expect(r.layout).toBe('windows3');
        expect(r.linhas).toEqual([
            { linha: 1, codigoFuncionario: '123', evento: '0010', referencia: 10.5, valor: 0 },
            { linha: 2, codigoFuncionario: '456', evento: '0200', referencia: 0, valor: 150000 },
        ]);
    });
    it('Windows 4: empresa e competência; erros de layout', () => {
        const r = lerValoresIob(linha(123, '0010', 2, 0, '0606102026'));
        expect(r.linhas[0]).toMatchObject({ empresa: '0606', competencia: '2026-10' });
        const e = lerValoresIob([linha(1, '0010', 1, 100), 'ABC', linha(1, '0010', 1, 0, '0606132026'), linha(1, '0010', 0, 0), linha(1, '0010', 1, 0, '0606102026') + 'XXXXX'].join('\n')).erros.join(' ');
        for (const m of [/referência e valor/, /fora do layout/, /competência 132026/, /sem referência e sem valor/, /55 posições/]) expect(e).toMatch(m);
        expect(lerValoresIob([linha(1, '0010', 1, 0), linha(1, '0010', 1, 0, '0606102026')].join('\n')).erros.join(' ')).toMatch(/mistura os layouts/);
        expect(lerValoresIob('').erros).toEqual(['Arquivo vazio.']);
    });
});

describe('lançamento no movimento', () => {
    it('hora extra no campo próprio, comissão como lançamento, falta em dias; reimportar não duplica', () => {
        const linhas = lerValoresIob([linha(123, '0010', 10.5, 0), linha(456, '0200', 0, 150000), linha(456, '0300', 2, 0)].join('\n')).linhas;
        const a = aplicarValores({ linhas, competencia: '2026-10', codigoEmpresa: '0606', fichas: FICHAS, eventos: EVENTOS, movimentos: {} });
        expect(a.resultados.filter(r => !r.ok).map(r => r.mensagem)).toEqual([]);
        expect(a.movimentos.A.horasExtras50).toBe(10.5);
        expect(a.movimentos.B.lancamentos).toEqual([expect.objectContaining({ descricao: '0200 COMISSOES', valor: 150000, tipo: 'provento' })]);
        expect(a.movimentos.B.faltasDias).toBe(2);
        const b = aplicarValores({ linhas, competencia: '2026-10', codigoEmpresa: '0606', fichas: FICHAS, eventos: EVENTOS, movimentos: a.movimentos });
        expect(b.movimentos.B.lancamentos).toHaveLength(1);
    });
    it('fora: funcionário sem ficha, código repetido, evento desconhecido, valor em evento por horas, outra competência ou empresa', () => {
        const linhas = lerValoresIob([linha(123, '0010', 1, 0, '0606092026'), linha(123, '0010', 1, 0, '0700102026')].join('\n'));
        const a = aplicarValores({ linhas: [...lerValoresIob([linha(999, '0010', 1, 0), linha(123, '9999', 1, 0), linha(123, '0010', 0, 5000)].join('\n')).linhas], competencia: '2026-10', codigoEmpresa: '0606', fichas: FICHAS, eventos: EVENTOS, movimentos: {} });
        expect(a.resultados.map(r => r.ok)).toEqual([false, false, false]);
        expect(a.resultados.map(r => r.mensagem).join(' ')).toMatch(/999 no IOB não está nas fichas.*9999 não está no catálogo.*é por horas, e a linha traz valor/);
        const w4 = aplicarValores({ linhas: linhas.linhas, competencia: '2026-10', codigoEmpresa: '0606', fichas: FICHAS, eventos: EVENTOS, movimentos: {} });
        expect(w4.resultados.map(r => r.mensagem).join(' ')).toMatch(/competência 2026-09.*empresa 0700/);
        const dup = aplicarValores({ linhas: lerValoresIob(linha(123, '0010', 1, 0)).linhas, competencia: '2026-10', codigoEmpresa: '0606', fichas: [...FICHAS, ficha('C', '0123')], eventos: EVENTOS, movimentos: {} });
        expect(dup.resultados[0].mensagem).toMatch(/mais de uma ficha ativa/);
    });
});

describe('tela', () => {
    it('lê o arquivo, mostra o resultado e grava no movimento', async () => {
        const ATIVA = { id: 'E1', nome: 'ALFA', cnpj: '44388152000189', codigoSage: '0606', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ImportacaoValoresPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        const arquivo = new File([[linha(123, '0010', 10.5, 0), linha(999, '0010', 1, 0)].join('\r\n')], 'ponto.txt', { type: 'text/plain' });
        Object.defineProperty(arquivo, 'arrayBuffer', { value: async () => new TextEncoder().encode([linha(123, '0010', 10.5, 0), linha(999, '0010', 1, 0)].join('\r\n')).buffer });
        await waitFor(() => expect(screen.getByLabelText('Arquivo de valores')).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Arquivo de valores'), { target: { files: [arquivo] } });
        const sec = await screen.findByLabelText('Lançamentos importados');
        await waitFor(() => expect(sec.textContent).toMatch(/1 lançamento\(s\) prontos · 1 fora · 1 funcionário/));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        fireEvent.click(screen.getByText('Gravar no movimento'));
        await waitFor(() => expect(srv.salvos).toHaveLength(1));
        expect(srv.salvos[0][1]).toBe('2026-10');
        expect(srv.salvos[0][2]).toEqual([expect.objectContaining({ fichaId: 'A', antes: null, depois: expect.objectContaining({ horasExtras50: 10.5 }) })]);
    });
});
