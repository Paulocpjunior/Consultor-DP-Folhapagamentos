// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RELATORIOS, type ContextoRelatorio } from '../catalogoRelatorios';
import { tabelaPdf } from '../layoutPdf';
import { calcularMensal } from '../../calculo/motorMensal';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio } from '../../cadastros/afastamentos';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2025-05', norma: 'Lei de teste', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 }, observacao: '',
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (id: string, nome: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia(EMP), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo',
    dados: { nome, admissao: '2024-01-02', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', cargo: 'AUXILIAR', ...dados } });
const FICHAS = [
    ficha('M1', 'BRUNO', { banco: '341', agencia: '0001', conta: '12345-6', tipoConta: 'corrente', nascimento: '1990-09-12' }),
    ficha('M2', 'ANA', { admissao: '2026-09-10', tipoContrato: '2', fimContrato: '2026-12-08' }),
    ficha('M3', 'CAIO', { dataDesligamento: '2026-09-20', motivoDesligamento: '07' }),
];
const folha = FICHAS.map(f => calcularMensal({ competencia: '2026-09', ficha: f, afastamentos: [], tabelas: [INSS, IR] }));
const ctx: ContextoRelatorio = { competencia: '2026-09', hoje: '2026-10-10', fichas: FICHAS, afastamentos: [], folha };
const def = (id: string) => RELATORIOS.find(r => r.id === id)!;

describe('central de relatórios: modelos', () => {
    it('folha analítica: um por funcionário, em ordem de nome, com os totais', () => {
        const t = def('folha-analitica').montar!(ctx);
        expect(t.linhas.map(l => l[1])).toEqual(['ANA', 'BRUNO', 'CAIO']);
        expect(t.totais?.[1]).toBe('3 funcionário(s)');
        expect(t.colunas).toHaveLength(t.linhas[0].length);
    });
    it('relação bancária avisa quem está sem conta nem PIX', () => {
        const t = def('relacao-bancaria').montar!(ctx);
        expect(t.linhas.find(l => l[0] === 'BRUNO')?.slice(2, 5)).toEqual(['341', '0001', '12345-6']);
        expect(t.observacao).toContain('2 funcionário(s) sem conta nem PIX');
    });
    it('admitidos e demitidos da competência, com o motivo do desligamento', () => {
        const t = def('admitidos-demitidos').montar!(ctx);
        expect(t.linhas.map(l => [l[0], l[2]])).toEqual([['Admissão', 'ANA'], ['Desligamento', 'CAIO']]);
        expect(t.linhas[1][5]).toBe('Pedido de demissão');
    });
    it('funcionários, experiência, aniversariantes e férias', () => {
        expect(def('funcionarios').montar!(ctx).linhas.find(l => l[1] === 'CAIO')?.[7]).toBe('Desligado');
        expect(def('experiencia').montar!(ctx).linhas.map(l => l[0])).toEqual(['ANA']);
        expect(def('aniversariantes').montar!(ctx).linhas).toEqual([['12', 'BRUNO', 'AUXILIAR']]);
        const ferias = def('ferias-vencer').montar!({ ...ctx, afastamentos: [{ ...afastamentoVazio(), fichaId: 'M1', motivo: '15', dtInicio: '2025-03-01', dtFim: '2025-03-30', perAquisInicio: '2024-01-02' }] });
        expect(ferias.linhas.filter(l => l[0] === 'BRUNO').map(l => l[1])).toEqual(['02/01/2025 a 01/01/2026', '02/01/2026 a 01/01/2027']);
    });
    it('PDF no layout padrão: rodapé com emissão e "Página x de y" em todas as páginas', () => {
        const t = def('funcionarios').montar!(ctx);
        const doc = tabelaPdf({ ...t, linhas: Array.from({ length: 120 }, (_, i) => t.linhas[i % t.linhas.length]) }, { empresa: { razaoSocial: 'EMPRESA UM', cnpj: EMP.cnpj }, titulo: 'Relação de funcionários', previa: false, emitidoPor: 'dp@escritorio.com.br', orientacao: 'paisagem' }, 'Competência 09/2026');
        const n = doc.getNumberOfPages();
        expect(n).toBeGreaterThan(1);
        const texto = doc.output();
        expect(texto).toContain(`Página ${n} de ${n}`);
        expect(texto).toContain('dp@escritorio.com.br');
    });
});

// Tela: dados mockados.
const srv = vi.hoisted(() => ({ folha: null as unknown, emailEnviado: vi.fn(async (..._a: unknown[]) => ({ remetente: 'dp@escritorio.com.br', fonteRemetente: 'colaborador', copiaPara: [] })) }));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'emp1', cnpj: EMP.cnpj, razaoSocial: 'EMPRESA UM LTDA', codigoSage: '1200', contatoEnvio: { nome: 'Rita', email: 'rita@cliente.com.br' } }], salvarContatoEnvio: vi.fn() }));
vi.mock('../../cadastros/cadastrosService', () => ({ listarFuncionarios: async () => FICHAS, listarAfastamentos: async () => [], listarEnquadramentos: async () => [], mensagemErro: (e: unknown) => String(e) }));
vi.mock('../../calculo/folhaGravadaService', () => ({ lerFolhaGravada: async () => srv.folha, lerFolhasDoAno: async (_e: string, ano: string) => (ano === '2026' ? [{ competencia: '2026-09', holerites: folha }] : []) }));
vi.mock('../../pacoteCliente/spConnect', async orig => ({ ...(await orig<typeof import('../../pacoteCliente/spConnect')>()), templatesDoDp: async () => [], enviarEmailPeloEscritorio: (...a: unknown[]) => srv.emailEnviado(...a) }));
import RelatoriosPanel from '../../../components/relatorios/RelatoriosPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const ATIVA = { id: 'emp1', nome: 'Um', cnpj: EMP.cnpj, codigoSage: '1200', competencia: '2026-09', ativadaPor: 'x', ativadaEm: 1 };
const tela = () => render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><RelatoriosPanel currentUser={{ uid: 'u', email: 'dp@escritorio.com.br', role: 'colaborador' } as never} /></EmpresaAtivaProvider>);
beforeEach(() => { srv.folha = null; srv.emailEnviado.mockClear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('central de relatórios: tela', () => {
    it('relatório da folha sem a folha gravada: avisa e trava; o de funcionários sai', async () => {
        tela();
        await waitFor(() => expect(screen.getByText(/ainda não foi gravada/)).toBeTruthy());
        expect((screen.getByRole('button', { name: 'Baixar PDF' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Relação de funcionários' }));
        expect((screen.getByRole('button', { name: 'Baixar PDF' }) as HTMLButtonElement).disabled).toBe(false);
        expect(screen.getByRole('button', { name: 'Excel' })).toBeTruthy();
    });
    it('envia por e-mail do escritório para o contato cadastrado, com o PDF', async () => {
        srv.folha = { empresaId: 'emp1', competencia: '2026-09', pagamento: '2026-10', gravadoPorEmail: 'dp@escritorio.com.br', totais: { funcionarios: 3, proventos: 0, descontos: 0, liquido: 0, fgts: 0 }, holerites: folha };
        tela();
        await waitFor(() => expect(screen.getByText(/Folha gravada por/)).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Enviar ao cliente' }));
        expect((screen.getByLabelText('E-mail do contato') as HTMLInputElement).value).toBe('rita@cliente.com.br');
        expect((screen.getByLabelText('Mensagem do envio') as HTMLTextAreaElement).value).toContain('Olá, Rita!');
        fireEvent.click(screen.getByRole('button', { name: 'Enviar por e-mail (escritório)' }));
        await waitFor(() => expect(srv.emailEnviado).toHaveBeenCalled());
        const env = srv.emailEnviado.mock.calls[0][0] as { para: string; anexos: { nome: string; mime: string }[]; assunto: string };
        expect(env.para).toBe('rita@cliente.com.br');
        expect(env.anexos[0]).toMatchObject({ nome: 'folha-analitica-1200-2026-09.pdf', mime: 'application/pdf' });
        expect(env.assunto).toContain('Folha mensal (analítica) · 09/2026');
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('E-mail enviado'));
    });
    it('ficha financeira: lê as folhas do ano, filtra o funcionário e envia', async () => {
        tela();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Ficha financeira' })).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Ficha financeira' }));
        await waitFor(() => expect(screen.getByText(/1 mês\(es\) com folha gravada/)).toBeTruthy());
        expect(screen.getByText(/sem folha: Jan, Fev, Mar, Abr, Mai, Jun, Jul, Ago/)).toBeTruthy();
        expect((screen.getByLabelText('Funcionário') as HTMLSelectElement).options.length).toBe(4);
        expect((screen.getByRole('button', { name: 'Baixar PDF' }) as HTMLButtonElement).disabled).toBe(false);
        expect(screen.getByRole('button', { name: 'Excel' })).toBeTruthy();
    });
});
