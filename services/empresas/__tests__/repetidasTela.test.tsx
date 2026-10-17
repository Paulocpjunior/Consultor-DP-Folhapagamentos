// @vitest-environment jsdom
// Tela Empresas: análise dos cadastros repetidos e exclusão só do vazio, com confirmação (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const sv = vi.hoisted(() => ({
    listar: vi.fn(async () => [] as unknown[]),
    excluir: vi.fn(async (_id: string) => {}),
    dados: vi.fn(async (_id: string) => ({}) as unknown),
}));
vi.mock('../empresasService', () => ({ listarEmpresasVisiveis: () => sv.listar(), excluirEmpresa: (id: string) => sv.excluir(id), protegerEmpresasExistentes: vi.fn() }));
vi.mock('../duplicadasService', () => ({ dadosDaEmpresa: (id: string) => sv.dados(id) }));
vi.mock('../../certificados/cofreCertificados', () => ({ ROTULO_SITUACAO: {}, cofreDaMinhaCarteira: async () => ({ linhas: [] }), diasDaLinha: () => null, precisaAtencao: () => false }));
vi.mock('../../cadastroCentralConferencia', () => ({ buscarCadastroCentral: async () => null, conferirEmpresas: () => null }));
vi.mock('../../auth/tokenCfi', () => ({ tokenParaCfi: async () => '' }));
import EmpresasPanel from '../../../components/empresas/EmpresasPanel';

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const zero = { porColecao: {}, configuracoes: [] as string[], carteiras: 0, naoConferidas: [] as string[] };
const emp = (id: string, s: number) => ({ id, nomeFantasia: 'BRISKA FILIAL', razaoSocial: 'BRISKA LTDA', cnpj: '11222333000262', codigoSage: '0002', criadoPor: 'u', criadoEm: { seconds: s } });

describe('Empresas: cadastros repetidos', () => {
    it('o gestor analisa; só o vazio tem "Excluir", que confere de novo antes de apagar', async () => {
        sv.listar.mockResolvedValue([emp('AAAAAAAAAAAAAAAAAAA1', 1), emp('AAAAAAAAAAAAAAAAAAA2', 2)]);
        sv.dados.mockImplementation(async (id: string) => (id.endsWith('1') ? { ...zero, porColecao: { cadastro_funcionarios: 12, folhas_gravadas: 3 } } : zero));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<EmpresasPanel currentUser={{ id: 'g', uid: 'g', role: 'gestor', email: 'g@x' } as never} />);
        fireEvent.click(await screen.findByText(/Analisar repetidas/));
        await waitFor(() => expect(screen.getByText(/É o cadastro em uso \(12 funcionários, 3 folhas gravadas\)/)).toBeTruthy());
        const botoes = screen.getAllByText('Excluir este cadastro');
        expect(botoes).toHaveLength(1);
        fireEvent.click(botoes[0]);
        await waitFor(() => expect(sv.excluir).toHaveBeenCalledWith('AAAAAAAAAAAAAAAAAAA2'));
        expect(sv.excluir).toHaveBeenCalledTimes(1);
    });
    it('dados novos depois da análise: não exclui', async () => {
        sv.listar.mockResolvedValue([emp('AAAAAAAAAAAAAAAAAAA1', 1), emp('AAAAAAAAAAAAAAAAAAA2', 2)]);
        let chamadas = 0;
        sv.dados.mockImplementation(async (id: string) => (id.endsWith('1') ? { ...zero, porColecao: { cadastro_funcionarios: 1 } } : (++chamadas > 1 ? { ...zero, porColecao: { calculo_movimentos: 1 } } : zero)));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<EmpresasPanel currentUser={{ id: 'g', uid: 'g', role: 'gestor', email: 'g@x' } as never} />);
        fireEvent.click(await screen.findByText(/Analisar repetidas/));
        fireEvent.click(await screen.findByText('Excluir este cadastro'));
        await waitFor(() => expect(screen.getByText(/ganhou dados ou entrou numa carteira/)).toBeTruthy());
        expect(sv.excluir).not.toHaveBeenCalled();
    });
    it('cadastro corrigido depois da análise (não repete mais): não exclui', async () => {
        sv.listar.mockResolvedValueOnce([emp('AAAAAAAAAAAAAAAAAAA1', 1), emp('AAAAAAAAAAAAAAAAAAA2', 2)])
            .mockResolvedValue([emp('AAAAAAAAAAAAAAAAAAA1', 1), { ...emp('AAAAAAAAAAAAAAAAAAA2', 2), cnpj: '99888777000155', codigoSage: '0099' }]);
        sv.dados.mockImplementation(async (id: string) => (id.endsWith('1') ? { ...zero, porColecao: { cadastro_funcionarios: 1 } } : zero));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<EmpresasPanel currentUser={{ id: 'g', uid: 'g', role: 'gestor', email: 'g@x' } as never} />);
        fireEvent.click(await screen.findByText(/Analisar repetidas/));
        fireEvent.click(await screen.findByText('Excluir este cadastro'));
        await waitFor(() => expect(screen.getByText(/não está mais repetida/)).toBeTruthy());
        expect(sv.excluir).not.toHaveBeenCalled();
    });
    it('excluir pela lista: empresa com dados não é excluída', async () => {
        sv.listar.mockResolvedValue([{ ...emp('AAAAAAAAAAAAAAAAAAA1', 1), cnpj: '99888777000155', codigoSage: '0099' }]);
        sv.dados.mockResolvedValue({ ...zero, configuracoes: ['esocialFolha'] });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<EmpresasPanel currentUser={{ id: 'g', uid: 'g', role: 'gestor', email: 'g@x' } as never} />);
        fireEvent.click(await screen.findByText(/🗑 Excluir/));
        await waitFor(() => expect(screen.getByText(/não pode ser excluída: tem configurações no cadastro \(esocialFolha\)/)).toBeTruthy());
        expect(sv.excluir).not.toHaveBeenCalled();
    });
});

