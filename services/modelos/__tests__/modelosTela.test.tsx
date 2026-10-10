// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { blocosDoTexto, preencherModelo } from '../modelos';
import { MODELOS_BASE } from '../modelosBase';
import { modeloPdf } from '../modeloPdf';

const EMP = { id: 'emp1', cnpj: '11222333000181' };
const FICHA: FichaFuncionario = { ...fichaVazia(EMP), id: 'M1', cpf: '52998224725', matriculaEsocial: 'M1', situacao: 'ativo',
    dados: { nome: 'BRUNO SILVA', admissao: '2026-10-01', salario: '3000.00', cargo: 'AUXILIAR', cbo: '411010', horasSemanais: '44' } };

const srv = vi.hoisted(() => ({
    salvos: [] as unknown[],
    emailEnviado: vi.fn(async (..._a: unknown[]) => ({ remetente: 'dp@escritorio.com.br', fonteRemetente: 'colaborador', copiaPara: [] })),
}));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [{ id: 'emp1', cnpj: EMP.cnpj, razaoSocial: 'EMPRESA UM LTDA', codigoSage: '1200', contatoEnvio: { nome: 'Rita', email: 'rita@cliente.com.br' } }], salvarContatoEnvio: vi.fn() }));
vi.mock('../../cadastros/cadastrosService', () => ({ listarFuncionarios: async () => [FICHA], mensagemErro: (e: unknown) => String(e) }));
vi.mock('../../pacoteCliente/spConnect', async orig => ({ ...(await orig<typeof import('../../pacoteCliente/spConnect')>()), templatesDoDp: async () => [], enviarEmailPeloEscritorio: (...a: unknown[]) => srv.emailEnviado(...a) }));
vi.mock('../modelosService', async orig => ({
    ...(await orig<typeof import('../modelosService')>()),
    listarModelos: async () => (await orig<typeof import('../modelosService')>()).modelosBase(),
    salvarModelo: vi.fn(async (m: unknown) => { srv.salvos.push(m); return 'novo1'; }),
    excluirModelo: vi.fn(),
}));
vi.mock('../../iobSage/restauracao', () => ({
    abrirRestauracao: async () => {
        const t = { id: 't1', origem: 'dbf', grupo: 'folha', tabela: 'TEXTOS', colunas: ['CODIGO', 'DESCRICAO', 'TEXTO'], registros: 2, bytes: 1, arquivo: 'TEXTOS.DBF' };
        return { arquivos: [], backups: [], dbfs: [], grupos: [], avisos: [], tabelas: [t, { ...t, id: 't2', tabela: 'FUNCIONARIOS', colunas: ['CODIGO', 'NOME'] }],
            lerTabela: async (_t: unknown, ao: (v: (string | null)[]) => void) => {
                ao(['1', 'SUSPENSAO', String.raw`{\rtf1 Fica suspenso o empregado #NOME#, CPF #CPF#.\par}`]);
                ao(['2', 'DECLARACAO DIVERSA', 'Declaro que #NOME# trabalha aqui. #XPTO#']);
                return 2;
            } };
    },
}));
import ModelosPanel from '../../../components/relatorios/ModelosPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const ATIVA = { id: 'emp1', nome: 'Um', cnpj: EMP.cnpj, codigoSage: '1200', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
const tela = (role = 'colaborador') => render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ModelosPanel currentUser={{ uid: 'u', email: 'dp@escritorio.com.br', role } as never} /></EmpresaAtivaProvider>);
beforeEach(() => { srv.salvos = []; srv.emailEnviado.mockClear(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('contratos e modelos: PDF', () => {
    it('contrato de experiência em PDF, com várias páginas e as assinaturas', () => {
        const m = MODELOS_BASE.find(x => x.id === 'base-contrato-experiencia')!;
        const { texto } = preencherModelo(m.corpo, { ficha: FICHA, empresa: { razaoSocial: 'EMPRESA UM LTDA', cnpj: EMP.cnpj }, hoje: '2026-10-10' });
        const doc = modeloPdf(blocosDoTexto(texto), { empresa: { razaoSocial: 'EMPRESA UM LTDA', cnpj: EMP.cnpj }, titulo: m.titulo, previa: false }, 'BRUNO SILVA', { empregador: 'EMPRESA UM LTDA', empregado: 'BRUNO SILVA', testemunhas: true });
        expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
        const bytes = doc.output('arraybuffer');
        expect(bytes.byteLength).toBeGreaterThan(3000);
    });
});

describe('contratos e modelos: tela', () => {
    it('gera o contrato do funcionário: prévia preenchida e aviso do que falta na ficha', async () => {
        tela();
        await waitFor(() => expect(screen.getByRole('button', { name: /Contrato de experiência/ })).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /Contrato de experiência/ }));
        expect((screen.getByRole('button', { name: 'Baixar PDF' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Funcionário'), { target: { value: 'M1' } });
        const previa = screen.getByLabelText('Prévia do documento');
        expect(previa.textContent).toContain('BRUNO SILVA');
        expect(previa.textContent).toContain('três mil reais');
        expect(previa.textContent).toContain('14/11/2026');
        expect(screen.getByText(/Sem dado na ficha/).textContent).toContain('PIS');
        fireEvent.change(screen.getByLabelText('Dias de experiência'), { target: { value: '30' } });
        expect(screen.getByLabelText('Prévia do documento').textContent).toContain('30/10/2026');
        expect((screen.getByRole('button', { name: 'Baixar PDF' }) as HTMLButtonElement).disabled).toBe(false);
    });
    it('advertência pede o motivo e envia por e-mail ao contato da empresa', async () => {
        tela();
        await waitFor(() => expect(screen.getByRole('button', { name: /Advertência disciplinar/ })).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /Advertência disciplinar/ }));
        fireEvent.change(screen.getByLabelText('Funcionário'), { target: { value: 'M1' } });
        fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'atrasos reiterados' } });
        expect(screen.getByLabelText('Prévia do documento').textContent).toContain('atrasos reiterados');
        fireEvent.click(screen.getByRole('button', { name: 'Enviar ao cliente' }));
        fireEvent.click(screen.getByRole('button', { name: 'Enviar por e-mail (escritório)' }));
        await waitFor(() => expect(srv.emailEnviado).toHaveBeenCalled());
        const env = srv.emailEnviado.mock.calls[0][0] as { para: string; anexos: { nome: string }[] };
        expect(env.para).toBe('rita@cliente.com.br');
        expect(env.anexos[0].nome).toBe('advertencia-disciplinar-bruno.pdf');
    });
    it('modelo-base vira cópia da empresa ao personalizar; colaborador não grava no escritório', async () => {
        tela();
        await waitFor(() => expect(screen.getByRole('button', { name: /Pedido de demissão/ })).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: /Pedido de demissão/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Personalizar (cópia)' }));
        expect((screen.getByLabelText('Título do modelo') as HTMLInputElement).value).toBe('Pedido de demissão (cópia)');
        const opEscritorio = screen.getByRole('option', { name: /Todas as empresas/ }) as HTMLOptionElement;
        expect(opEscritorio.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Texto do modelo'), { target: { value: '# PEDIDO\n\n{{funcionario.nome}} {{campo.inexistente}}\n\n{{assinaturas}}' } });
        expect(screen.getByRole('alert').textContent).toContain('{{campo.inexistente}}');
        fireEvent.click(screen.getByRole('button', { name: 'Gravar modelo' }));
        await waitFor(() => expect(srv.salvos).toHaveLength(1));
        expect(srv.salvos[0]).toMatchObject({ titulo: 'Pedido de demissão (cópia)', empresaId: 'emp1', categoria: 'desligamento' });
        expect((srv.salvos[0] as { id?: string }).id).toBeUndefined();
    });
    it('importa os textos do SAGE: RTF convertido, campos ligados e gravados na empresa', async () => {
        tela();
        await waitFor(() => expect(screen.getByRole('button', { name: 'Importar do SAGE' })).toBeTruthy());
        fireEvent.click(screen.getByRole('button', { name: 'Importar do SAGE' }));
        const arquivo = new File(['x'], 'folha.zip');
        fireEvent.change(screen.getByLabelText('Arquivos do backup do SAGE'), { target: { files: [arquivo] } });
        await waitFor(() => expect(screen.getByRole('button', { name: /TEXTOS/ })).toBeTruthy());
        expect(screen.queryByRole('button', { name: /FUNCIONARIOS/ })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /TEXTOS/ }));
        await waitFor(() => expect(screen.getByLabelText('Importar SUSPENSAO')).toBeTruthy());
        expect((screen.getByLabelText('Categoria de SUSPENSAO') as HTMLSelectElement).value).toBe('disciplinar');
        expect((screen.getByLabelText('Campo para #NOME#') as HTMLSelectElement).value).toBe('funcionario.nome');
        expect((screen.getByLabelText('Campo para #XPTO#') as HTMLSelectElement).value).toBe('');
        expect((screen.getByLabelText('Gravar como') as HTMLSelectElement).value).toBe('empresa');
        fireEvent.click(screen.getByRole('button', { name: 'Gravar 2 modelo(s)' }));
        await waitFor(() => expect(srv.salvos).toHaveLength(2));
        expect(srv.salvos[0]).toMatchObject({ titulo: 'SUSPENSAO', categoria: 'disciplinar', empresaId: 'emp1', origem: 'sage', corpo: '# SUSPENSAO\n\nFica suspenso o empregado {{funcionario.nome}}, CPF {{funcionario.cpf}}.' });
        expect((srv.salvos[1] as { corpo: string }).corpo).toContain('#XPTO#');
        await waitFor(() => expect(screen.getByRole('status').textContent).toContain('2 modelo(s) importado(s) do SAGE'));
    });
});
