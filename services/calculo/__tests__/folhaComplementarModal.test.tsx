// @vitest-environment jsdom
// Modal "Folha complementar": sugestão pela convenção, prévia sobre as folhas gravadas, gravação e as já gravadas (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { calcularMensal } from '../motorMensal';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';

const sv = vi.hoisted(() => ({
    gravadas: {} as Record<string, unknown>,
    existentes: [] as unknown[],
    gravar: vi.fn(async (..._a: unknown[]) => 'id'),
    excluir: vi.fn(async (_id: string) => undefined),
    convencoes: [] as unknown[],
}));
vi.mock('../folhaGravadaService', () => ({ lerFolhaGravada: async (_e: string, c: string) => (sv.gravadas[c] ? { holerites: sv.gravadas[c] } : null) }));
vi.mock('../folhaComplementarService', () => ({ listarComplementares: async () => sv.existentes, gravarComplementar: (...a: unknown[]) => sv.gravar(...a), excluirComplementar: (id: string) => sv.excluir(id) }));
vi.mock('../../sindicatos/convencoesService', () => ({ listarConvencoes: async () => sv.convencoes }));
vi.mock('../../cadastros/cadastrosService', () => ({ listarSindicatos: async () => [{ cnpj: '11111111000191', nome: 'dos Comerciários' }], mensagemErro: (e: unknown) => String(e) }));
import FolhaComplementarModal from '../../../components/calculo/FolhaComplementarModal';

afterEach(() => { cleanup(); vi.clearAllMocks(); sv.gravadas = {}; sv.existentes = []; sv.convencoes = []; });
const TAB = TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` }));
const FICHA: FichaFuncionario = { ...fichaVazia({ id: 'E1', cnpj: '44388152000189' }), id: 'f1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'ANA', admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101' } };
const mes = (c: string) => calcularMensal({ competencia: c, pagamento: c, ficha: FICHA, afastamentos: [], tabelas: TAB, folhaPagaAntesNoMes: null });
const props = { empresa: { id: 'E1', cnpj: '44388152000189', razaoSocial: 'EMPRESA EXEMPLO', sindicatos: ['11111111000191'] }, competencia: '2026-04', pagamento: '2026-04',
    fichas: [FICHA], tabelas: TAB, folhaDoMes: [mes('2026-04')], encerrado: false, usuario: { id: 'u', email: 'u@x' }, onPdf: vi.fn(), onFechar: () => {} };

describe('Folha complementar (tela)', () => {
    it('usa a convenção do sindicato, calcula sobre as folhas gravadas e grava', async () => {
        sv.gravadas = { '2026-01': [mes('2026-01')], '2026-02': [mes('2026-02')], '2026-03': [mes('2026-03')] };
        sv.convencoes = [{ id: 'c1', sindicatoCnpj: '11111111000191', tipo: 'CCT', vigenciaInicio: '2026-01-01', vigenciaFim: '2026-12-31', dataBase: '1', registroMte: 'SP000001/2026',
            reajuste: { percentual: 5, aPartirDe: '2026-01' }, pisos: [], horaExtra: { minimo50: null, minimo100: null }, adicionalNoturno: null, obrigacoes: [], arquivo: null, observacao: '' }];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<FolhaComplementarModal {...props} />);
        fireEvent.click(await screen.findByText('Usar a convenção'));
        expect((screen.getByLabelText('Descrição do instrumento') as HTMLInputElement).value).toBe('Convenção coletiva dos Comerciários 2026/2026, registro MTE SP000001/2026');
        expect((screen.getByLabelText('Percentual do reajuste') as HTMLInputElement).value).toBe('5');
        // Sem a data da celebração (convenção, tipo C), não grava.
        expect((await screen.findByRole('alert')).textContent).toMatch(/Informe a data da celebração/);
        fireEvent.change(screen.getByLabelText('Data do instrumento'), { target: { value: '2026-04-10' } });
        await waitFor(() => expect(screen.getByText('ANA', { selector: 'td' })).toBeTruthy());
        const linha = screen.getByText('ANA', { selector: 'td' }).closest('tr')!;
        expect(linha.textContent).toMatch(/01\/2026, 02\/2026, 03\/2026/);
        expect(linha.textContent).toMatch(/450,00/);
        fireEvent.click(screen.getByText('Gravar a complementar'));
        await waitFor(() => expect(sv.gravar).toHaveBeenCalled());
        const p = sv.gravar.mock.calls[0][0] as { perApur: string; instrumento: { tpAcConv: string; dtAcConv: string }; resultados: unknown[] };
        expect([p.perApur, p.instrumento.tpAcConv, p.instrumento.dtAcConv, p.resultados.length]).toEqual(['2026-04', 'C', '2026-04-10', 1]);
        fireEvent.click(screen.getByText('Holerites (PDF)'));
        expect(props.onPdf).toHaveBeenCalled();
    });

    it('lançamento avulso sem folha gravada, e a complementar já gravada pode ser aberta e excluída', async () => {
        sv.existentes = [{ id: 'E1_2026-04_J', empresaId: 'E1', perApur: '2026-04', pagamento: '2026-04', instrumento: { tpAcConv: 'J', dsc: '§ 3º do art. 27 da IN RFB nº 2.110/22' },
            lancamentos: [{ fichaId: 'f1', perRef: '2026-02', codigo: 'LAN', descricao: 'Comissão de fevereiro', tipo: 'provento', valor: 20000, inss: true, fgts: true, irrf: true }],
            resultados: [], totais: { liquido: 18000 }, gravadoPorEmail: 'u@x' }];
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<FolhaComplementarModal {...props} empresa={{ ...props.empresa, sindicatos: [] }} />);
        fireEvent.click(await screen.findByText('Abrir'));
        expect((screen.getByLabelText('Tipo do instrumento') as HTMLSelectElement).value).toBe('J');
        expect((screen.getByLabelText('Descrição do lançamento 1') as HTMLInputElement).value).toBe('Comissão de fevereiro');
        await waitFor(() => expect(screen.getByText('ANA', { selector: 'td' })).toBeTruthy());
        fireEvent.click(screen.getByText('ANA', { selector: 'td' }));
        expect(screen.getByText(/Sem folha gravada em 02\/2026: o INSS da diferença/)).toBeTruthy();
        expect(screen.getByText('Regravar a complementar')).toBeTruthy();
        fireEvent.click(screen.getByText('Excluir'));
        await waitFor(() => expect(sv.excluir).toHaveBeenCalledWith('E1_2026-04_J'));
    });

    it('competência encerrada: não grava', async () => {
        render(<FolhaComplementarModal {...props} encerrado />);
        expect((screen.getByText('Gravar a complementar') as HTMLButtonElement).disabled).toBe(true);
    });
});
