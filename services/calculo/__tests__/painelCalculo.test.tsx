// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CalculoPanel from '../../../components/calculo/CalculoPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { TabelaLegal } from '../../cadastros/tabelasLegais';

const xlsx = vi.hoisted(() => ({ writeFile: vi.fn() }));
vi.mock('xlsx', async orig => ({ ...(await orig<typeof import('xlsx')>()), writeFile: xlsx.writeFile }));
const emp = vi.hoisted(() => ({ parametrosFolha: undefined as unknown, atualizar: vi.fn() }));
vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [{ id: 'emp1', cnpj: '11222333000181', razaoSocial: 'EMPRESA UM', nomeFantasia: 'Um', codigoSage: '0229', criadoPor: 'u', ...(emp.parametrosFolha ? { parametrosFolha: emp.parametrosFolha } : {}) }],
    atualizarParametrosFolha: async (_id: string, mudar: (p: unknown) => unknown) => { const novo = mudar(emp.parametrosFolha); emp.atualizar(novo); return novo; },
}));
const EMP = { id: 'emp1', cnpj: '11222333000181' };
const ficha = (id: string, nome: string, dados: FichaFuncionario['dados']): FichaFuncionario => ({ ...fichaVazia(EMP), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo', dados: { nome, admissao: '2024-01-02', unidadeSalario: '5', horasSemanais: '44', categoria: '101', ...dados } });
const INSS: TabelaLegal = { id: 'i', tipo: 'inss', vigencia: '2025-01', norma: 'Portaria de teste', observacao: '', valores: {},
    faixas: [{ ate: 151800, aliquota: 7.5, deducao: 0 }, { ate: 279388, aliquota: 9, deducao: 0 }, { ate: 419083, aliquota: 12, deducao: 0 }, { ate: 815741, aliquota: 14, deducao: 0 }] };
const IR: TabelaLegal = { id: 'r', tipo: 'irrf', vigencia: '2025-05', norma: 'Lei de teste', observacao: '', valores: { deducaoDependente: 18959, descontoSimplificado: 60720 },
    faixas: [{ ate: 242880, aliquota: 0, deducao: 0 }, { ate: 282665, aliquota: 7.5, deducao: 18216 }, { ate: 375105, aliquota: 15, deducao: 39416 }, { ate: 466468, aliquota: 22.5, deducao: 67549 }, { ate: null, aliquota: 27.5, deducao: 90873 }] };
const cad = vi.hoisted(() => ({ afastamentos: [] as unknown[], enquadramentos: [] as unknown[], erroEnq: '', salvar: vi.fn(async (..._a: unknown[]) => undefined) }));
vi.mock('../../cadastros/cadastrosService', () => ({
    mensagemErro: (e: unknown) => String(e),
    listarFuncionarios: async () => [ficha('f1', 'ANA', { salario: '2200.00' }), ficha('f2', 'BRUNO', { salario: '' }), ficha('f3', 'CAIO', { salario: '3000.00', admissao: '2030-01-01' })],
    listarAfastamentos: async () => cad.afastamentos,
    salvarAfastamento: (...a: unknown[]) => cad.salvar(...a),
    listarEnquadramentos: async () => { if (cad.erroEnq) throw new Error(cad.erroEnq); return cad.enquadramentos; },
    listarTabelas: async () => [INSS, IR],
}));

const movs = vi.hoisted(() => ({ listarMovimentos: vi.fn(), salvarMovimentos: vi.fn(), listarMovimentosDoAno: vi.fn(), listarMovimentosDaEmpresa: vi.fn() }));
vi.mock('../movimentosService', () => movs);
const hol = vi.hoisted(() => ({ lerHolerites: vi.fn(), registrarLeitura: vi.fn(), MAX_PDF_MB: 14 }));
vi.mock('../holeritesService', () => hol);
const pdf = vi.hoisted(() => ({ save: vi.fn(), holeritesPdf: vi.fn(), resumoPdf: vi.fn() }));
vi.mock('../../relatorios/holeritePdf', () => ({ holeritesPdf: pdf.holeritesPdf, resumoPdf: pdf.resumoPdf }));
vi.mock('../catalogoEventos', () => ({ carregarEventosIob: async () => (await import('../../../data/eventos-iob-sage.json')).default.eventos }));
const USER = { uid: 'u1', email: 'dp@escritorio.com.br', role: 'colaborador' } as never;

beforeEach(() => {
    movs.listarMovimentos.mockReset().mockResolvedValue([]);
    movs.salvarMovimentos.mockReset().mockResolvedValue(undefined);
    movs.listarMovimentosDoAno.mockReset().mockResolvedValue({});
    movs.listarMovimentosDaEmpresa.mockReset().mockResolvedValue({});
    cad.afastamentos = [];
    cad.enquadramentos = [];
    cad.erroEnq = '';
    pdf.save.mockReset(); pdf.holeritesPdf.mockReset().mockReturnValue({ save: pdf.save }); pdf.resumoPdf.mockReset().mockReturnValue({ save: pdf.save });
});
afterEach(() => { cleanup(); sessionStorage.clear(); });

/** O PDF carrega no clique (import dinâmico): espera o arquivo sair (o Excel sai na hora). */
async function clicarGerando(alvo: HTMLElement, f: { mock: { calls: unknown[] } }) {
    const antes = f.mock.calls.length;
    fireEvent.click(alvo);
    await waitFor(() => expect(f.mock.calls.length).toBeGreaterThan(antes));
}

describe('aba Cálculo', () => {
    it('com empresa e período ativos: sem seletor de empresa, já na competência ativa', async () => {
        const ativa = { id: 'emp1', nome: 'Um', cnpj: '11222333000181', codigoSage: '0229', competencia: '2026-03', ativadaPor: 'dp@escritorio.com.br', ativadaEm: 1 };
        render(<EmpresaAtivaProvider ativa={ativa} trocar={() => {}}><CalculoPanel currentUser={USER} /></EmpresaAtivaProvider>);
        expect(screen.queryByLabelText('Empresa')).toBeNull();
        expect(screen.getByLabelText('Empresa ativa').textContent).toBe('0229 · Um');
        expect((screen.getByLabelText('Competência') as HTMLInputElement).value).toBe('2026-03');
        expect((screen.getByLabelText('Mês do pagamento') as HTMLInputElement).value).toBe('2026-04');
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
    });

    it('calcula a empresa, abre o holerite, aplica o movimento e exporta', async () => {
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        expect((screen.getByLabelText('Mês do pagamento') as HTMLInputElement).value).toBe('2026-04');
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        expect(screen.queryByText('CAIO')).toBeNull(); // admitido depois da competência
        expect(screen.getByText('BRUNO').closest('tr')!.textContent).toContain('erro');

        fireEvent.click(screen.getByText('ANA'));
        const holerite = screen.getByRole('region', { name: 'Holerite de ANA' });
        expect(within(holerite).getByText('Salário').closest('tr')!.textContent).toContain('2.200,00');
        fireEvent.change(within(holerite).getByLabelText('Horas extras 50%'), { target: { value: '10' } });
        await waitFor(() => expect(within(holerite).getByText('Horas extras 50%', { selector: 'td' })).toBeTruthy());
        expect(within(holerite).getByText('Horas extras 50%', { selector: 'td' }).closest('tr')!.textContent).toContain('150,00');
        expect(within(holerite).getByText('DSR sobre horas extras').closest('tr')!.textContent).toContain('28,85');
        expect(screen.getByText('(não salvo)')).toBeTruthy();

        fireEvent.click(within(holerite).getByText('Adicionar lançamento'));
        fireEvent.change(within(holerite).getByLabelText('Descrição do lançamento 1'), { target: { value: 'Vale-transporte' } });
        fireEvent.change(within(holerite).getByLabelText('Tipo do lançamento 1'), { target: { value: 'desconto' } });
        fireEvent.change(within(holerite).getByLabelText('Valor do lançamento 1'), { target: { value: '132,00' } });
        await waitFor(() => expect(within(holerite).getByText('Vale-transporte', { selector: 'td' })).toBeTruthy());

        await clicarGerando(screen.getByText('Exportar Excel'), xlsx.writeFile);
        expect(xlsx.writeFile).toHaveBeenCalledWith(expect.anything(), 'calculo-0229-2026-03.xlsx');
    });

    it('lançar evento: código do IOB e referência, como no Sage', async () => {
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        fireEvent.click(screen.getByText('ANA'));
        const lancar = async (codigo: string, ref: string) => {
            const h = screen.getByRole('region', { name: 'Holerite de ANA' });
            fireEvent.focus(within(h).getByLabelText('Código do evento'));
            fireEvent.change(within(h).getByLabelText('Código do evento'), { target: { value: codigo } });
            fireEvent.change(within(h).getByLabelText('Referência do evento'), { target: { value: ref } });
            fireEvent.click(within(h).getByText('Lançar'));
        };

        // Hora extra 50%: vai para o campo do movimento (entra no DSR), com o mesmo valor de digitar as horas.
        await lancar('810', '10');
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('0810 HORA EXTRA 50%: 10 h em "Horas extras 50%"'));
        let h = screen.getByRole('region', { name: 'Holerite de ANA' });
        expect((within(h).getByLabelText('Horas extras 50%') as HTMLInputElement).value).toBe('10');
        expect(within(h).getByText('Horas extras 50%', { selector: 'td' }).closest('tr')!.textContent).toContain('150,00');
        expect(within(h).getByText('DSR sobre horas extras').closest('tr')!.textContent).toContain('28,85');
        expect(screen.getByText('(não salvo)')).toBeTruthy();

        // Adicional noturno 25%: lançamento avulso calculado (10 h × R$ 10,00 × 0,25) com as incidências do evento.
        await lancar('0211', '10');
        await waitFor(() => expect(screen.getByText('0211 ADICIONAL NOTURNO 25%', { selector: 'td' })).toBeTruthy());
        h = screen.getByRole('region', { name: 'Holerite de ANA' });
        expect(within(h).getByText('0211 ADICIONAL NOTURNO 25%', { selector: 'td' }).closest('tr')!.textContent).toContain('25,00');
        expect((within(h).getByLabelText('Descrição do lançamento 1') as HTMLInputElement).value).toBe('0211 ADICIONAL NOTURNO 25%');

        // O que o Consultor calcula sozinho não se lança.
        await lancar('5700', '10');
        await waitFor(() => expect(screen.getByText(/INSS, IRRF, FGTS e as bases saem do cálculo do Consultor/)).toBeTruthy());
        await lancar('12345', '1');
        await waitFor(() => expect(screen.getByText(/Evento 12345 não está no catálogo/)).toBeTruthy());
    });

    it('aberto pelo menu: entra na folha escolhida, sem o seletor de folha; ações agrupadas', async () => {
        const ativa = { id: 'emp1', nome: 'Um', cnpj: '11222333000181', codigoSage: '0229', competencia: '2026-03', ativadaPor: 'dp@escritorio.com.br', ativadaEm: 1 };
        const { unmount } = render(<EmpresaAtivaProvider ativa={ativa} trocar={() => {}}><CalculoPanel currentUser={USER} folhaInicial="ferias" embutido /></EmpresaAtivaProvider>);
        await waitFor(() => expect(screen.getByLabelText('Início das férias em')).toBeTruthy());
        expect((screen.getByLabelText('Folha') as HTMLSelectElement).value).toBe('ferias');
        expect(screen.getByLabelText('Folha').closest('label')!.className).toContain('hidden');
        unmount();

        render(<EmpresaAtivaProvider ativa={ativa} trocar={() => {}}><CalculoPanel currentUser={USER} folhaInicial="adiantamento" embutido /></EmpresaAtivaProvider>);
        await waitFor(() => expect(screen.getByRole('dialog', { name: /Cálculo de adiantamentos/i })).toBeTruthy());
        for (const g of ['Conferir', 'Relatórios', 'Pagamento', 'Envios']) expect(screen.getByText(g, { selector: 'summary' })).toBeTruthy();
        expect(screen.getByText('Holerites (PDF)').closest('details')!.textContent).toContain('Relatórios');
    });

    it('carrega o movimento gravado, valida e salva só o que mudou', async () => {
        // Com o IRRF da folha de março, paga em abril, gravado junto: o adiantamento de abril usa (Codex #118).
        const GRAVADO = { horasExtras50: 10, irrfRendimentos: 237885, irrfDeducoes: 19133, irrfRetido: 0, irrfPagamento: '2026-04' };
        movs.listarMovimentos.mockResolvedValue([{ id: 'f1_2026-03', empresaId: 'emp1', fichaId: 'f1', competencia: '2026-03', movimento: GRAVADO, atualizadoPorEmail: 'ana@x.com', atualizadoEm: new Date(2026, 3, 2, 10, 30) }]);
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('(com movimento)')).toBeTruthy());
        expect(movs.listarMovimentos).toHaveBeenLastCalledWith('emp1', '2026-03');
        expect(screen.getByText('ANA').closest('tr')!.textContent).toContain('2.378,85'); // 2.200 + 150 + DSR 28,85 (março/2026: 26 úteis, 5 descansos)

        fireEvent.click(screen.getByText('ANA'));
        const holerite = screen.getByRole('region', { name: 'Holerite de ANA' });
        expect(within(holerite).getByText(/Salvo por ana@x.com em 02\/04\/2026/)).toBeTruthy();
        expect((within(holerite).getByLabelText('Horas extras 50%') as HTMLInputElement).value).toBe('10');
        expect(screen.getByText('Salvar movimento').hasAttribute('disabled')).toBe(true);

        fireEvent.change(within(holerite).getByLabelText('Faltas (dias)'), { target: { value: '1' } });
        fireEvent.click(within(holerite).getByText('Adicionar lançamento'));
        fireEvent.change(within(holerite).getByLabelText('Valor do lançamento 1'), { target: { value: '50,00' } });
        fireEvent.click(screen.getByText('Salvar movimento (1)'));
        expect(screen.getByRole('alert', { name: 'Erros do movimento' }).textContent).toContain('ANA: Lançamento 1: informe a descrição.');
        expect(movs.salvarMovimentos).not.toHaveBeenCalled();

        fireEvent.click(within(holerite).getByText('remover'));
        fireEvent.click(screen.getByText('Salvar movimento (1)'));
        await waitFor(() => expect(movs.salvarMovimentos).toHaveBeenCalledTimes(1));
        expect(movs.salvarMovimentos).toHaveBeenCalledWith('emp1', '2026-03', [{ fichaId: 'f1', antes: GRAVADO, depois: expect.objectContaining({ horasExtras50: 10, faltasDias: 1, irrfPagamento: '2026-04' }) }], { id: 'u1', email: 'dp@escritorio.com.br' });
        await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Movimento de 1 funcionário(s) salvo.'));
        expect(movs.listarMovimentos).toHaveBeenCalledTimes(2);
    });

    it('pergunta antes de trocar a competência com movimento não salvo', async () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        fireEvent.click(screen.getByText('ANA'));
        fireEvent.change(screen.getByLabelText('Horas extras 50%'), { target: { value: '2' } });
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-04' } });
        expect(confirmar).toHaveBeenCalledWith('Há movimento não salvo de 1 funcionário(s). Descartar?');
        expect((screen.getByLabelText('Competência') as HTMLInputElement).value).toBe('2026-03');
        confirmar.mockRestore();
    });

    it('rascunho: bloqueia arquivo bancário e pacote, volta ao reabrir a tela; erro na leitura bloqueia o "Salvar"', async () => {
        const abrir = async () => {
            render(<CalculoPanel currentUser={USER} />);
            await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
            fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
            fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
            await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        };
        await abrir();
        fireEvent.click(screen.getByText('ANA'));
        fireEvent.change(screen.getByLabelText('Horas extras 50%'), { target: { value: '2' } });
        const banco = screen.getByText('Arquivo bancário') as HTMLButtonElement;
        expect(banco.disabled).toBe(true);
        expect(banco.title).toMatch(/Salve o movimento antes/);
        expect((screen.getByText('Pacote do cliente') as HTMLButtonElement).disabled).toBe(true);
        // Saiu da tela (outra aba do app) e voltou: o digitado volta, ainda por salvar.
        cleanup();
        await abrir();
        await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Movimento não salvo de 1 funcionário\(s\) recuperado/));
        expect(screen.getByText('Salvar movimento (1)')).toBeTruthy();
        cleanup(); sessionStorage.clear();
        // Leitura do mês com erro: nada a salvar por cima do gravado.
        movs.listarMovimentos.mockRejectedValue(new Error('unavailable'));
        await abrir();
        await waitFor(() => expect(screen.getByText(/Movimentos do mês não carregados \(o "Salvar movimento" fica bloqueado/)).toBeTruthy());
        fireEvent.click(screen.getByText('ANA'));
        fireEvent.change(screen.getByLabelText('Horas extras 50%'), { target: { value: '2' } });
        expect((screen.getByText(/^Salvar movimento/) as HTMLButtonElement).disabled).toBe(true);
    });

    it('confere com os holerites lidos pelo Gemini e aplica o movimento do holerite', async () => {
        const P = (descricao: string, provento: number, referencia = '') => ({ codigo: '', descricao, referencia, provento, desconto: 0 });
        const D = (descricao: string, desconto: number) => ({ codigo: '', descricao, referencia: '', provento: 0, desconto });
        hol.registrarLeitura.mockReset().mockResolvedValue(undefined);
        hol.lerHolerites.mockReset().mockResolvedValue({ ok: true, modelo: 'gemini-3.8-flash', avisos: [], holerites: [
            { pagina: 1, nome: 'ANA', cpf: '52998224725', codigo: '', competencia: '2026-03', cargo: '', salarioBase: null, baseInss: null, baseFgts: null, fgtsMes: null, baseIrrf: null, avisos: [],
                verbas: [P('SALARIO', 220000, '30,00'), P('HORAS EXTRAS 50%', 15000, '10,00'), P('DSR S/ HORAS EXTRAS', 2885), D('INSS', 19133)], totalProventos: 237885, totalDescontos: 19133, liquido: 218752 },
            { pagina: 2, nome: 'FULANO SEM FICHA', cpf: '', codigo: '', competencia: '2026-03', cargo: '', salarioBase: null, baseInss: null, baseFgts: null, fgtsMes: null, baseIrrf: null, avisos: [],
                verbas: [P('SALARIO', 100000)], totalProventos: 100000, totalDescontos: 0, liquido: 100000 },
        ] });
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        fireEvent.click(screen.getByText('Conferir com holerites do IOB'));
        const sec = screen.getByRole('region', { name: 'Conferência com os holerites do IOB' });
        fireEvent.change(within(sec).getByLabelText('PDF dos holerites'), { target: { files: [new File(['%PDF-1.7'], 'holerites-03.pdf', { type: 'application/pdf' })] } });
        fireEvent.click(within(sec).getByText('Ler holerites'));
        await waitFor(() => expect(within(sec).getByText('FULANO SEM FICHA')).toBeTruthy());
        expect(hol.lerHolerites).toHaveBeenCalledWith(expect.any(File), '2026-03');
        expect(hol.registrarLeitura).toHaveBeenCalledWith({ id: 'u1', email: 'dp@escritorio.com.br' }, 'emp1', '2026-03', ['holerites-03.pdf'], 2, 'gemini-3.8-flash');
        // Sem o movimento, o motor não tem as horas extras: diverge
        const linhaAna = within(sec).getByText('ANA').closest('tr')!;
        expect(linhaAna.textContent).toContain('diverge');
        expect(within(sec).getByText('FULANO SEM FICHA').closest('tr')!.textContent).toContain('sem ficha');
        expect(within(within(sec).getByText('FULANO SEM FICHA').closest('tr')!).queryByText('Aplicar movimento do holerite')).toBeNull();
        expect(within(sec).getByText(/sem holerite no PDF: BRUNO/)).toBeTruthy();

        fireEvent.click(within(linhaAna).getByText('Aplicar movimento do holerite'));
        await waitFor(() => expect(within(sec).getByText('ANA').closest('tr')!.textContent).toContain('confere'));
        expect(within(sec).getByText('já aplicado')).toBeTruthy();
        expect(screen.getByText('Salvar movimento (1)')).toBeTruthy();

        await clicarGerando(screen.getByText('Exportar Excel'), xlsx.writeFile);
        const wb = xlsx.writeFile.mock.calls.at(-1)![0];
        expect(wb.SheetNames).toEqual(['Resumo', 'Verbas', 'Memória', 'Resumo da folha', 'Conferência IOB']);
    });

    it('13º: 1ª e 2ª parcelas com a média dos movimentos do ano', async () => {
        movs.listarMovimentosDoAno.mockResolvedValue({ f1: { '2026-03': { horasExtras50: 10 } } });
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        fireEvent.change(screen.getByLabelText('Folha'), { target: { value: '13-1a' } });
        fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '2026' } });
        expect((screen.getByLabelText('Mês do pagamento') as HTMLInputElement).value).toBe('2026-11');
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        expect(movs.listarMovimentosDoAno).toHaveBeenLastCalledWith('emp1', 2026);
        expect(screen.queryByRole('button', { name: /Salvar movimento/ })).toBeNull();
        expect(screen.queryByText('Conferir com holerites do IOB')).toBeNull();
        expect(screen.queryByText('CAIO')).toBeNull(); // admitido em 2030
        // (2.200 + média: (150 + DSR 28,85) ÷ 10 meses jan–out) ÷ 2
        expect(screen.getByText('ANA').closest('tr')!.textContent).toMatch(/1\.108,95/); // (220.000 + 1.789) ÷ 2 = 110.894,5 → 1.108,95

        fireEvent.change(screen.getByLabelText('Folha'), { target: { value: '13-2a' } });
        expect((screen.getByLabelText('Mês do pagamento') as HTMLInputElement).value).toBe('2026-12');
        expect(screen.getByLabelText(/aplicar o redutor de 2026/)).toBeTruthy();
        fireEvent.click(screen.getByText('ANA'));
        const hol = screen.getByRole('region', { name: 'Holerite de ANA' });
        expect(within(hol).getByText(/13º salário 2026/)).toBeTruthy();
        fireEvent.change(within(hol).getByLabelText('1ª parcela paga'), { target: { value: '1.000,00' } });
        await waitFor(() => expect(within(hol).getByText('Adiantamento do 13º (1ª parcela)').closest('tr')!.textContent).toContain('1.000,00'));
        await clicarGerando(screen.getByText('Exportar Excel'), xlsx.writeFile);
        expect(xlsx.writeFile).toHaveBeenLastCalledWith(expect.anything(), 'calculo-0229-2026-13-2a-parcela.xlsx');
    });

    it('férias: recibo de cada gozo do mês, com abono e pagamento até 2 dias antes', async () => {
        const gozo = { id: 'g1', empresaId: 'emp1', fichaId: 'f1', cpf: '', matriculaEsocial: 'f1', dtInicio: '2025-07-01', dtFim: '2025-07-20', motivo: '15', infoMesmoMtv: '', tpAcidTransito: '', observacao: '', perAquisInicio: '2024-01-02', perAquisFim: '2025-01-01', origem: '', recibos: [] };
        cad.afastamentos = [gozo];
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        fireEvent.change(screen.getByLabelText('Folha'), { target: { value: 'ferias' } });
        expect(screen.queryByLabelText('Mês do pagamento')).toBeNull();
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2025-06' } });
        await waitFor(() => expect(screen.getByText(/Nenhum gozo de férias começando em 06\/2025/)).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2025-07' } });
        await waitFor(() => expect(screen.getByRole('cell', { name: 'ANA' })).toBeTruthy());
        expect(movs.listarMovimentosDaEmpresa).toHaveBeenCalledWith('emp1');
        // 2.200 ÷ 30 × 20 = 1.466,67 + 1/3 488,89 = 1.955,56
        expect(screen.getByRole('cell', { name: 'ANA' }).closest('tr')!.textContent).toContain('1.955,56');
        fireEvent.click(screen.getByRole('cell', { name: 'ANA' }));
        const rec = screen.getByRole('region', { name: 'Holerite de ANA' });
        // 29/06/2025 é domingo: o prazo aparece no dia útil anterior.
        expect(within(rec).getByText(/pagar até/).textContent).toContain('27/06/2025 (29/06/2025 não é dia útil)');
        fireEvent.change(within(rec).getByLabelText('Dias de abono'), { target: { value: '10' } });
        await waitFor(() => expect(within(rec).getByText('Abono pecuniário')).toBeTruthy());
        await clicarGerando(screen.getByText('Exportar Excel'), xlsx.writeFile);
        expect(xlsx.writeFile).toHaveBeenLastCalledWith(expect.anything(), 'calculo-0229-ferias-2025-07.xlsx');
    });

    it('férias: programa o gozo na tela (simulação), calcula e grava em Afastamentos', async () => {
        cad.afastamentos = [];
        const gravar = cad.salvar; gravar.mockClear();
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        fireEvent.change(screen.getByLabelText('Folha'), { target: { value: 'ferias' } });
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2025-06' } });
        await waitFor(() => expect(screen.getByLabelText('Funcionário das férias')).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Funcionário das férias'), { target: { value: 'f1' } });
        fireEvent.change(screen.getByLabelText('Início das férias programadas'), { target: { value: '2025-07-01' } });
        fireEvent.change(screen.getByLabelText('Dias de gozo'), { target: { value: '20' } });
        fireEvent.click(screen.getByText('Calcular'));
        const rec = await screen.findByRole('region', { name: 'Holerite de ANA' });
        // Mesmo gozo do teste anterior (20 dias a partir de 01/07/2025): 1.955,56.
        expect(screen.getByRole('cell', { name: 'ANA' }).closest('tr')!.textContent).toContain('1.955,56');
        expect(within(rec).getByText(/ainda não gravadas em Afastamentos/)).toBeTruthy();
        // Convite de agenda para o cliente: pagamento, gozo e guias, baixado como .ics.
        const agenda = within(rec).getByLabelText('Convite de agenda');
        expect(within(agenda).getByText(/Férias de ANA/)).toBeTruthy();
        const criar = vi.fn(() => 'blob:x'); const revogar = vi.fn();
        Object.assign(URL, { createObjectURL: criar, revokeObjectURL: revogar });
        fireEvent.click(within(agenda).getByText('Baixar convite de agenda (.ics)'));
        expect(criar).toHaveBeenCalledTimes(1);
        expect(((criar.mock.calls[0] as unknown[])[0] as Blob).type).toBe('text/calendar;charset=utf-8');
        expect(within(agenda).getByRole('status').textContent).toMatch(/anexe o .ics/);
        fireEvent.click(within(rec).getByText('Gravar em Afastamentos'));
        await waitFor(() => expect(gravar).toHaveBeenCalledTimes(1));
        expect(gravar.mock.calls[0][0]).toBeNull();
        expect(gravar.mock.calls[0][1]).toMatchObject({ id: 'f1_2025-07-01', fichaId: 'f1', motivo: '15', dtInicio: '2025-07-01', dtFim: '2025-07-20' });
        confirmar.mockRestore();
    });

    it('rescisão: simula a de um ativo, com aviso, multa do FGTS e prazo', async () => {
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        fireEvent.change(screen.getByLabelText('Folha'), { target: { value: 'rescisao' } });
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        await waitFor(() => expect(screen.getByText(/Nenhum desligamento em 03\/2026/)).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Funcionário a simular'), { target: { value: 'f1' } });
        fireEvent.change(screen.getByLabelText('Data do desligamento'), { target: { value: '2026-03-10' } });
        fireEvent.click(screen.getByText('Simular'));
        const det = await screen.findByRole('region', { name: 'Holerite de ANA' });
        expect(within(det).getByText('Aviso prévio indenizado').closest('tr')!.textContent).toContain('2.640,00'); // 2.200 ÷ 30 × 36
        expect(within(det).getByText(/pagar até/).textContent).toContain('20/03/2026');
        expect((within(det).getByLabelText('Mês do pagamento da rescisão') as HTMLInputElement).value).toBe('2026-03');
        expect(within(det).getByText(/paga por guia, fora do líquido/).textContent).toContain('informe o saldo');
        fireEvent.change(within(det).getByLabelText('Saldo do FGTS para fins rescisórios (R$)'), { target: { value: '5.000,00' } });
        await waitFor(() => expect(within(det).getByText(/paga por guia, fora do líquido/).textContent).toMatch(/R\$\s[\d.]+,\d{2}/));
        fireEvent.change(within(det).getByLabelText('Tipo do desligamento'), { target: { value: '07' } });
        await waitFor(() => expect(within(det).queryByText('Aviso prévio indenizado')).toBeNull());
        expect(within(det).getByText(/paga por guia, fora do líquido/).textContent).toContain('não há');
        await clicarGerando(screen.getByText('Exportar Excel'), xlsx.writeFile);
        expect(xlsx.writeFile).toHaveBeenLastCalledWith(expect.anything(), 'calculo-0229-rescisao-2026-03.xlsx');
        fireEvent.click(within(det).getByText('Remover simulação'));
        await waitFor(() => expect(screen.getByText(/Nenhum desligamento em 03\/2026/)).toBeTruthy());
    });

    it('folha do mês com férias: soma o recibo e não fica incompleta', async () => {
        cad.afastamentos = [{ id: 'g1', empresaId: 'emp1', fichaId: 'f1', cpf: '', matriculaEsocial: 'f1', dtInicio: '2025-07-01', dtFim: '2025-07-20', motivo: '15', infoMesmoMtv: '', tpAcidTransito: '', observacao: '', perAquisInicio: '2024-01-02', perAquisFim: '', origem: '', recibos: [] }];
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2025-07' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA').closest('tr')!.textContent).toContain('calculado'));
        expect(movs.listarMovimentosDaEmpresa).toHaveBeenCalledWith('emp1');
        fireEvent.click(screen.getByText('ANA'));
        const hol = screen.getByRole('region', { name: 'Holerite de ANA' });
        expect(within(hol).getByText('Férias do mês (pagas no recibo)')).toBeTruthy();
        expect(within(hol).getByText('1/3 de férias do mês (pago no recibo)')).toBeTruthy();
        expect(within(hol).getByText('Líquido das férias pago no recibo')).toBeTruthy();
        expect(within(hol).getByText('INSS das férias (retido no recibo)')).toBeTruthy();
    });

    it('falha ao carregar os movimentos: mostra o erro e o mês com férias fica incompleto', async () => {
        cad.afastamentos = [{ id: 'g1', empresaId: 'emp1', fichaId: 'f1', cpf: '', matriculaEsocial: 'f1', dtInicio: '2025-07-01', dtFim: '2025-07-20', motivo: '15', infoMesmoMtv: '', tpAcidTransito: '', observacao: '', perAquisInicio: '2024-01-02', perAquisFim: '', origem: '', recibos: [] }];
        movs.listarMovimentosDaEmpresa.mockRejectedValue(new Error('rede'));
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2025-07' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText(/Movimentos gravados não carregados/)).toBeTruthy());
        expect(screen.getByText('ANA').closest('tr')!.textContent).toContain('incompleto');
    });

    it('motor homologado na empresa: documentos sem a marca de prévia; o admin ativa e volta para prévia', async () => {
        emp.parametrosFolha = { motorHomologado: { desde: '2026-03', por: 'gestor@x', em: '2026-10-10T10:00:00Z' } };
        try {
            render(<CalculoPanel currentUser={USER} />);
            await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
            fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
            fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
            await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
            expect(screen.getByText('Motor de cálculo ativo')).toBeTruthy();
            await clicarGerando(screen.getByText('Holerites (PDF)'), pdf.save);
            expect(pdf.holeritesPdf.mock.calls.at(-1)![2]).toMatchObject({ previa: false });
            // Competência antes da ativação: prévia.
            vi.spyOn(window, 'confirm').mockReturnValue(true);
            fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-02' } });
            await waitFor(() => expect(screen.getByText('Prévia do motor de cálculo.')).toBeTruthy());
            cleanup();
            // Admin ativa a partir da competência da tela.
            emp.parametrosFolha = undefined;
            render(<CalculoPanel currentUser={{ ...(USER as object), role: 'admin' } as never} />);
            await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
            fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
            fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
            fireEvent.click(await screen.findByText('Ativar o motor para esta empresa'));
            await waitFor(() => expect(emp.atualizar).toHaveBeenCalledWith(expect.objectContaining({ motorHomologado: expect.objectContaining({ desde: '2026-03', por: 'dp@escritorio.com.br' }) })));
            await waitFor(() => expect(screen.getByText('Motor de cálculo ativo')).toBeTruthy());
        } finally { emp.parametrosFolha = undefined; vi.restoreAllMocks(); }
    });

    it('colaborador não vê o botão de ativar o motor', async () => {
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('Prévia do motor de cálculo.')).toBeTruthy());
        expect(screen.queryByText('Ativar o motor para esta empresa')).toBeNull();
    });

    it('relatórios: resumo da folha na tela, holerites e resumo em PDF', async () => {
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        fireEvent.click(screen.getByText('Resumo da folha'));
        const sec = screen.getByRole('region', { name: 'Resumo da folha' });
        expect(within(sec).getByText(/2 funcionário\(s\): 1 calculado\(s\), 0 incompleto\(s\), 1 com erro/)).toBeTruthy();
        expect(within(sec).getByText('INSS dos segurados').nextElementSibling!.textContent).toMatch(/175,23/); // 2.200: 113,85 + 682,00 × 9% = 61,38
        await clicarGerando(within(sec).getByText('Resumo (PDF)'), pdf.save);
        expect(pdf.resumoPdf).toHaveBeenCalledWith(expect.objectContaining({ funcionarios: 2 }), expect.objectContaining({ titulo: 'Folha mensal 03/2026', previa: true }), expect.stringContaining('Folha mensal'));
        expect(pdf.save).toHaveBeenLastCalledWith('resumo-0229-2026-03.pdf');
        await clicarGerando(screen.getByText('Holerites (PDF)'), pdf.save);
        expect(pdf.holeritesPdf.mock.calls[0][0]).toHaveLength(2);
        expect(pdf.save).toHaveBeenLastCalledWith('holerites-0229-2026-03.pdf');
        fireEvent.click(screen.getByText('ANA'));
        await clicarGerando(screen.getByText('PDF deste holerite'), pdf.save);
        expect(pdf.holeritesPdf.mock.calls[1][0].map((r: { nome: string }) => r.nome)).toEqual(['ANA']);
        expect(pdf.save).toHaveBeenLastCalledWith('holerite-0229-2026-03-ana.pdf');
    });

    it('resumo com enquadramento: parte patronal e total previdenciário da DCTFWeb', async () => {
        cad.enquadramentos = [{ id: 'emp1_2026-01', empresaId: 'emp1', vigencia: '2026-01', regime: 'normal', fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1, terceiros: 5.8, observacao: '' }];
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        fireEvent.click(screen.getByText('Resumo da folha'));
        const sec = screen.getByRole('region', { name: 'Resumo da folha' });
        await waitFor(() => expect(within(sec).getByText('Contribuição patronal')).toBeTruthy());
        // base 2.200: patronal 440,00; RAT 2% 44,00; terceiros 5,8% 127,60; segurados 175,23
        expect(within(sec).getByText('Contribuição patronal').nextElementSibling!.textContent).toMatch(/440,00/);
        expect(within(sec).getByText('Terceiros').nextElementSibling!.textContent).toMatch(/127,60/);
        expect(within(sec).getByText('Total previdenciário (DCTFWeb)').nextElementSibling!.textContent).toMatch(/786,83/);
        expect(within(sec).getByText(/Parte patronal pelo enquadramento de 01\/2026/)).toBeTruthy();
    });

    it('falha ao carregar o enquadramento aparece no resumo, no PDF e no Excel', async () => {
        cad.erroEnq = 'sem permissão';
        render(<CalculoPanel currentUser={USER} />);
        await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Competência'), { target: { value: '2026-03' } });
        fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
        await waitFor(() => expect(screen.getByText('ANA')).toBeTruthy());
        fireEvent.click(screen.getByText('Resumo da folha'));
        const sec = screen.getByRole('region', { name: 'Resumo da folha' });
        await waitFor(() => expect(within(sec).getByRole('alert').textContent).toContain('Enquadramento não carregado (Error: sem permissão)'));
        await clicarGerando(within(sec).getByText('Resumo (PDF)'), pdf.save);
        expect(pdf.resumoPdf.mock.calls.at(-1)![2]).toContain('ATENÇÃO: enquadramento não carregado');
        await clicarGerando(screen.getByText('Exportar Excel'), xlsx.writeFile);
        const wb = xlsx.writeFile.mock.calls.at(-1)![0];
        expect(JSON.stringify(wb.Sheets['Resumo da folha'])).toContain('Parte patronal NÃO CARREGADA');
    });
});
