// @vitest-environment jsdom
// Tela "Pró-labore e autônomos (RPA)": cadastro, lançamento do mês com o cálculo, gravação e eSocial (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TABELAS_OFICIAIS_2026 } from '../../cadastros/tabelasOficiais';

const srv = vi.hoisted(() => ({
    contribuintes: [] as unknown[], cadastros: [] as unknown[], meses: [] as unknown[], gravado: null as unknown,
}));
vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [{ id: 'E1', cnpj: '44388152000189', razaoSocial: 'EMPRESA X', nomeFantasia: 'X', codigoSage: '1', criadoPor: 'u',
        esocialFolha: { nrInscEstab: '44388152000189', codLotacao: 'LOT01', rubricas: { INSS: { codRubr: 'INSS', ideTabRubr: 'T1' }, IRRF: { codRubr: 'IRRF', ideTabRubr: 'T1' } } } }],
    salvarParametrosEsocialFolha: async () => undefined,
}));
vi.mock('../../cadastros/cadastrosService', () => ({
    listarTabelas: async () => TABELAS_OFICIAIS_2026.map((t, i) => ({ ...t, id: `t${i}` })),
    listarEnquadramentos: async () => [{ id: 'q', empresaId: 'E1', vigencia: '2026-01', regime: 'normal', fpas: '515', codigoTerceiros: '0115', patronal: 20, rat: 2, fap: 1, terceiros: 5.8, observacao: '' }],
    listarRubricas: async () => [['RPA', 'SERVICOS AUTONOMOS', '3501', '1'], ['INSS', 'INSS', '9201', '2'], ['IRRF', 'IRRF', '9203', '2'], ['ISS', 'ISS RETIDO', '9222', '2']].map(([c, d, n, t]) => ({ id: c, empresaId: 'E1', codRubr: c, ideTabRubr: 'T1', eventoIob: '', origem: '',
        vigencias: [{ iniValid: '2020-01', fimValid: '', recibo: '', dados: { dscRubr: d, natRubr: n, tpRubr: t, codIncCP: '00', codIncIRRF: '09', codIncFGTS: '00', codIncCPRP: '', observacao: '' } }] })),
    mensagemErro: (e: unknown) => String(e),
    listarFuncionarios: async () => [],
}));
vi.mock('../../esocial/transmissaoService', () => ({ listarEnvios: async () => [] }));
vi.mock('../contribuintesService', () => ({
    listarContribuintes: async () => srv.contribuintes,
    salvarContribuinte: async (c: unknown) => { srv.cadastros.push(c); return 'id'; },
    lerPagamentosCI: async () => srv.gravado,
    gravarPagamentosCI: async (...a: unknown[]) => { srv.meses.push(a); },
    excluirPagamentosCI: async () => undefined,
}));
vi.mock('../../fimDeMes/fechamentoService', () => ({ lerFechamento: async () => null }));
const envio = vi.hoisted(() => ({ eventos: [] as { xml: string; ref: string }[] }));
vi.mock('../../esocial/envioSeguro', () => ({
    verificarAntesDeEnviar: async (x: { eventos: { xml: string; ref: string }[] }) => { envio.eventos.push(...x.eventos); return { ok: true, achados: [] }; },
    transmitirVerificado: async () => ({ situacao: 'enviado', retorno: { protocolo: 'P1' } }),
    mensagemDaTransmissao: () => ({ ok: true, texto: 'Lote recebido pelo eSocial. Protocolo P1.' }),
}));
import ContribuintesPanel from '../../../components/contribuintes/ContribuintesPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
import { contribuinteVazio, tsvVazio } from '../contribuinteIndividual';

afterEach(() => { cleanup(); srv.contribuintes = []; srv.cadastros.length = 0; srv.meses.length = 0; srv.gravado = null; });
const ATIVA = { id: 'E1', nome: 'X', cnpj: '44388152000189', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
const tela = () => render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ContribuintesPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);

describe('pró-labore e RPA (tela)', () => {
    it('cadastra o autônomo, com a validação', async () => {
        tela();
        fireEvent.click(await screen.findByText('+ Cadastrar'));
        fireEvent.change(screen.getByLabelText('CPF do contribuinte'), { target: { value: '390.533.447-05' } });
        fireEvent.change(screen.getByLabelText('Nome do contribuinte'), { target: { value: 'BRUNO AUTONOMO' } });
        fireEvent.click(screen.getByText('Gravar cadastro'));
        expect(screen.getByRole('alert').textContent).toMatch(/nascimento/);
        fireEvent.change(screen.getByLabelText('Nascimento do contribuinte'), { target: { value: '1985-09-01' } });
        fireEvent.change(screen.getByLabelText('CBO do contribuinte'), { target: { value: '317110' } });
        fireEvent.click(screen.getByText('Gravar cadastro'));
        await waitFor(() => expect(srv.cadastros).toHaveLength(1));
        expect(srv.cadastros[0]).toMatchObject({ cpf: '39053344705', categoria: '701', empresaId: 'E1' });
    });

    it('lança o RPA do mês, mostra o cálculo, grava e gera o eSocial com o de/para sugerido', async () => {
        srv.contribuintes = [{ ...contribuinteVazio('E1'), id: 'E1_39053344705', cpf: '39053344705', nome: 'BRUNO AUTONOMO', nascimento: '1985-09-01', categoria: '701', cbo: '317110' }];
        tela();
        fireEvent.click(await screen.findByText('+ Lançamento'));
        fireEvent.change(screen.getByLabelText('Contribuinte do lançamento 1'), { target: { value: 'E1_39053344705' } });
        fireEvent.change(screen.getByLabelText('Valor do lançamento 1'), { target: { value: '2.000,00' } });
        fireEvent.change(screen.getByLabelText('ISS do lançamento 1'), { target: { value: '5' } });
        await waitFor(() => expect(screen.getAllByText('BRUNO AUTONOMO', { selector: 'td' })).toHaveLength(2));
        const linha = screen.getAllByText('BRUNO AUTONOMO', { selector: 'td' })[1].closest('tr')!;
        expect(linha.textContent).toMatch(/2\.000,00.*220,00/);
        expect(linha.textContent).toMatch(/100,00/); // ISS 5%
        expect(linha.textContent).toMatch(/400,00$/); // 20% da empresa
        fireEvent.click(screen.getByText('Gravar o mês'));
        await waitFor(() => expect(srv.meses).toHaveLength(1));
        expect((screen.getByLabelText('Rubrica de Serviços prestados (RPA)') as HTMLSelectElement).value).toBe('T1|RPA');
        expect((screen.getByLabelText('Rubrica de ISS retido') as HTMLSelectElement).value).toBe('T1|ISS');
        expect(screen.getByText('Transmitir S-1200 (1)')).toBeTruthy();
    });

    it('diretor com FGTS (721): dados do S-2300 no cadastro e o S-2300 transmitido pela tela', async () => {
        envio.eventos.length = 0;
        srv.contribuintes = [{ ...contribuinteVazio('E1'), id: 'E1_52998224725', cpf: '52998224725', nome: 'ANA DIRETORA', nascimento: '1980-04-10', categoria: '721', cbo: '121010' }];
        tela();
        expect((await screen.findByLabelText('S-2300 e S-2399')).textContent).toMatch(/Informe o sexo/);
        fireEvent.click(screen.getByText('Editar'));
        fireEvent.change(screen.getByLabelText('Sexo'), { target: { value: 'F' } });
        fireEvent.change(screen.getByLabelText('Raça/cor'), { target: { value: '1' } });
        fireEvent.change(screen.getByLabelText('Grau de instrução'), { target: { value: '09' } });
        fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'RUA DAS FLORES' } });
        fireEvent.change(screen.getByLabelText('Número do endereço'), { target: { value: '100' } });
        fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '01001-000' } });
        fireEvent.change(screen.getByLabelText('Código do município'), { target: { value: '3550308' } });
        fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'sp' } });
        fireEvent.change(screen.getByLabelText('Data de início'), { target: { value: '2026-10-01' } });
        fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Diretora' } });
        fireEvent.change(screen.getByLabelText('Matrícula do contribuinte'), { target: { value: 'DIR-01' } });
        expect((screen.getByLabelText('Data de opção pelo FGTS') as HTMLInputElement).value).toBe('2026-10-01');
        fireEvent.click(screen.getByText('Gravar cadastro'));
        await waitFor(() => expect(srv.cadastros).toHaveLength(1));
        expect(srv.cadastros[0]).toMatchObject({ matricula: 'DIR-01', tsv: { sexo: 'F', dtInicio: '2026-10-01', dtOpcFGTS: '2026-10-01', endereco: { uf: 'SP', cep: '01001000' } } });
        // Recarrega com o cadastro gravado e transmite.
        srv.contribuintes = [{ ...(srv.cadastros[0] as object), id: 'E1_52998224725', tsv: { ...tsvVazio(), ...(srv.cadastros[0] as { tsv: object }).tsv } }];
        cleanup(); tela();
        fireEvent.click(await screen.findByText('Transmitir S-2300'));
        await waitFor(() => expect(envio.eventos).toHaveLength(1));
        expect(envio.eventos[0].ref).toBe('tsv:E1_52998224725:inicio');
        expect(envio.eventos[0].xml).toContain('<codCateg>721</codCateg>');
        expect(envio.eventos[0].xml).toContain('<FGTS><dtOpcFGTS>2026-10-01</dtOpcFGTS></FGTS>');
        expect((await screen.findByRole('status')).textContent).toMatch(/S-2300 de ANA DIRETORA: Lote recebido/);
    });
});
