// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { webcrypto } from 'node:crypto';
import CadastrosPanel from '../../../components/cadastros/CadastrosPanel';
import type { FichaFuncionario } from '../funcionarios';

const svc = vi.hoisted(() => ({
    listarFuncionarios: vi.fn(), gravarImportacao: vi.fn(), salvarFuncionario: vi.fn(), excluirFuncionario: vi.fn(), historico: vi.fn(),
    listarSindicatos: vi.fn(), salvarSindicato: vi.fn(), excluirSindicato: vi.fn(),
    listarTabelas: vi.fn(), salvarTabela: vi.fn(), excluirTabela: vi.fn(),
    listarHorarios: vi.fn(), salvarHorario: vi.fn(), excluirHorario: vi.fn(),
    listarAfastamentos: vi.fn(), salvarAfastamento: vi.fn(), gravarAfastamentosImportados: vi.fn(), excluirAfastamento: vi.fn(),
}));
vi.mock('../cadastrosService', async orig => ({ ...(await orig<typeof import('../cadastrosService')>()), ...svc }));
vi.mock('../../empresas/empresasService', () => ({
    listarTodasEmpresas: async () => [{ id: 'emp1', cnpj: '11222333000181', razaoSocial: 'EMPRESA TESTE LTDA', nomeFantasia: 'Empresa Teste', codigoSage: '0229', criadoPor: 'u' }],
}));

const CPF = '52998224725';
const xml = `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00"><evtAdmissao Id="IDADM1"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><trabalhador><cpfTrab>${CPF}</cpfTrab><nmTrab>PESSOA IMPORTADA</nmTrab><nascimento><dtNascto>1990-01-01</dtNascto></nascimento></trabalhador><vinculo><matricula>M-1</matricula><infoRegimeTrab><infoCeletista><dtAdm>2026-02-01</dtAdm></infoCeletista></infoRegimeTrab><infoContrato><nmCargo>AUXILIAR</nmCargo><CBOCargo>411005</CBOCargo><codCateg>101</codCateg><remuneracao><vrSalFx>2000.00</vrSalFx></remuneracao></infoContrato></vinculo></evtAdmissao></eSocial>`;
const usuario = { id: 'uid1', name: 'Ana', email: 'ana@sp.com', role: 'colaborador' as const, uid: 'uid1' };

beforeEach(() => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    Object.values(svc).forEach(f => f.mockReset());
    svc.listarSindicatos.mockResolvedValue([]);
    svc.listarTabelas.mockResolvedValue([]);
    svc.listarFuncionarios.mockResolvedValue([]);
    svc.gravarImportacao.mockResolvedValue(undefined);
    svc.salvarFuncionario.mockResolvedValue(undefined);
    svc.historico.mockResolvedValue([]);
    svc.listarHorarios.mockResolvedValue([]);
    svc.listarAfastamentos.mockResolvedValue([]);
    svc.salvarHorario.mockResolvedValue(undefined);
    svc.salvarAfastamento.mockResolvedValue(undefined);
    svc.gravarAfastamentosImportados.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function abrirEmpresa(sub?: 'funcionarios' | 'horarios' | 'afastamentos') {
    render(<CadastrosPanel currentUser={usuario} subInicial={sub} />);
    await waitFor(() => expect(screen.getByRole('option', { name: /0229/ })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Empresa'), { target: { value: 'emp1' } });
    await waitFor(() => expect(svc.listarHorarios).toHaveBeenCalledWith('emp1'));
}

describe('Cadastros na interface', () => {
    it('importa o XML do eSocial com prévia e grava só depois de confirmar', async () => {
        await abrirEmpresa();
        await waitFor(() => expect(screen.getByText(/Nenhum funcionário cadastrado/)).toBeTruthy());
        fireEvent.click(screen.getByText('Importar do eSocial (XML)'));
        const dlg = screen.getByRole('dialog', { name: 'Importar do eSocial' });
        fireEvent.change(within(dlg).getByLabelText('XMLs do eSocial'), { target: { files: [{ name: 'adm.xml', size: xml.length, text: async () => xml }] } });
        fireEvent.click(within(dlg).getByText('Ler arquivos'));
        await waitFor(() => expect(within(dlg).getByText('PESSOA IMPORTADA')).toBeTruthy());
        expect(within(dlg).getByText('Ficha nova')).toBeTruthy();
        expect(svc.gravarImportacao).not.toHaveBeenCalled();
        fireEvent.click(within(dlg).getByText('Gravar 1 ficha(s)'));
        await waitFor(() => expect(svc.gravarImportacao).toHaveBeenCalledTimes(1));
        const [resultados, u, arquivos] = svc.gravarImportacao.mock.calls[0];
        expect(resultados[0].ficha).toMatchObject({ id: `emp1_${CPF}_M-1`, cpf: CPF, matriculaEsocial: 'M-1', dados: { nome: 'PESSOA IMPORTADA', cargo: 'AUXILIAR' } });
        expect(u).toEqual({ id: 'uid1', email: 'ana@sp.com' });
        expect(arquivos).toEqual(['adm.xml']);
        expect(svc.listarFuncionarios).toHaveBeenCalledTimes(2);
    });

    it('edita a ficha: grava com origem Manual e bloqueia erro de validação', async () => {
        const ficha: FichaFuncionario = { id: `emp1_${CPF}_M-1`, empresaId: 'emp1', cnpj: '11222333000181', cpf: CPF, matriculaEsocial: 'M-1', situacao: 'ativo', dados: { nome: 'PESSOA', admissao: '2026-02-01', salario: '2000.00' }, dependentes: [], origens: { salario: 'eSocial: S-2200' }, pendenciasImportacao: [] };
        svc.listarFuncionarios.mockResolvedValue([ficha]);
        await abrirEmpresa();
        fireEvent.click(await screen.findByText('PESSOA'));
        const dlg = screen.getByRole('dialog', { name: 'Ficha do funcionário' });
        fireEvent.click(within(dlg).getByText('Ident. Adm.'));
        fireEvent.change(within(dlg).getByLabelText('Salário fixo'), { target: { value: '2.150,00' } });
        fireEvent.change(within(dlg).getByLabelText('CBO'), { target: { value: '12' } });
        fireEvent.click(within(dlg).getByText('Gravar'));
        expect(within(dlg).getByRole('alert').textContent).toContain('CBO deve ter 6 dígitos.');
        expect(svc.salvarFuncionario).not.toHaveBeenCalled();
        fireEvent.change(within(dlg).getByLabelText('CBO'), { target: { value: '411005' } });
        fireEvent.change(within(dlg).getByLabelText('Código no IOB'), { target: { value: '000001' } });
        fireEvent.click(within(dlg).getByText('Gravar'));
        await waitFor(() => expect(svc.salvarFuncionario).toHaveBeenCalledTimes(1));
        const [antes, depois] = svc.salvarFuncionario.mock.calls[0];
        expect(antes).toBe(ficha);
        expect(depois.dados).toMatchObject({ salario: '2150.00', cbo: '411005', codigoIob: '000001' });
        expect(depois.origens.salario).toMatch(/^Manual · ana@sp\.com · \d{4}-\d{2}-\d{2}$/);
    });

    it('tabela legal sem norma não grava; regra não publicada vira mensagem clara', async () => {
        svc.listarTabelas.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }));
        render(<CadastrosPanel currentUser={usuario} subInicial="tabelas" />);
        expect((await screen.findByRole('alert')).textContent).toContain('firebase deploy --only firestore:rules --project consultor-dp-folha');
        fireEvent.click(screen.getAllByText('Nova vigência')[2]);
        const dlg = screen.getByRole('dialog', { name: 'Tabela legal' });
        fireEvent.change(within(dlg).getByLabelText('Vigência'), { target: { value: '2026-01' } });
        fireEvent.change(within(dlg).getByLabelText('Salário mínimo mensal'), { target: { value: '1.000,00' } });
        fireEvent.click(within(dlg).getByText('Gravar'));
        expect(within(dlg).getByRole('alert').textContent).toContain('Informe a norma');
        fireEvent.change(within(dlg).getByLabelText('Norma'), { target: { value: 'Decreto fictício de teste' } });
        svc.salvarTabela.mockResolvedValue('t1');
        fireEvent.click(within(dlg).getByText('Gravar'));
        await waitFor(() => expect(svc.salvarTabela).toHaveBeenCalledTimes(1));
        expect(svc.salvarTabela.mock.calls[0][1]).toMatchObject({ tipo: 'salario_minimo', vigencia: '2026-01', valores: { salarioMinimo: 100000 }, norma: 'Decreto fictício de teste' });
    });

    it('horário: grava com id da empresa e código, mostra total e descrição da jornada', async () => {
        await abrirEmpresa('horarios');
        await waitFor(() => expect(screen.getByText(/Nenhum horário cadastrado/)).toBeTruthy());
        fireEvent.click(screen.getByText('Novo horário'));
        const dlg = screen.getByRole('dialog', { name: 'Horário' });
        fireEvent.change(within(dlg).getByLabelText('Código do horário'), { target: { value: '001' } });
        fireEvent.change(within(dlg).getByLabelText('Descrição do horário'), { target: { value: 'Comercial' } });
        for (const d of ['Seg', 'Ter', 'Qua', 'Qui', 'Sex']) {
            fireEvent.change(within(dlg).getByLabelText(`entrada ${d}`), { target: { value: '08:00' } });
            fireEvent.change(within(dlg).getByLabelText(`saidaIntervalo ${d}`), { target: { value: '12:00' } });
            fireEvent.change(within(dlg).getByLabelText(`retornoIntervalo ${d}`), { target: { value: '13:00' } });
            fireEvent.change(within(dlg).getByLabelText(`saida ${d}`), { target: { value: '17:48' } });
        }
        expect(within(dlg).getByText('44:00')).toBeTruthy();
        expect(within(dlg).getByText('Seg a Sex: 08:00-12:00 e 13:00-17:48; Sáb: folga; Dom: DSR')).toBeTruthy();
        fireEvent.click(within(dlg).getByText('Gravar'));
        await waitFor(() => expect(svc.salvarHorario).toHaveBeenCalledTimes(1));
        expect(svc.salvarHorario.mock.calls[0][1]).toMatchObject({ id: 'emp1_001', empresaId: 'emp1', codigo: '001', descricao: 'Comercial' });
        expect(svc.listarHorarios).toHaveBeenCalledTimes(2);
    });

    it('afastamento: importa o S-2230 com prévia e lança à mão com validação', async () => {
        const ficha: FichaFuncionario = { id: `emp1_${CPF}_M-1`, empresaId: 'emp1', cnpj: '11222333000181', cpf: CPF, matriculaEsocial: 'M-1', situacao: 'ativo', dados: { nome: 'PESSOA', admissao: '2026-02-01' }, dependentes: [], origens: {}, pendenciasImportacao: [] };
        svc.listarFuncionarios.mockResolvedValue([ficha]);
        await abrirEmpresa('afastamentos');
        await waitFor(() => expect(screen.getByText('Importar S-2230 (XML)').hasAttribute('disabled')).toBe(false));
        const s2230 = `<eSocial xmlns="http://www.esocial.gov.br/schema/eventoCompleto/retornoEventoCompleto/v1_0_0"><retornoEventoCompleto><evento><eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAfastTemp/v_S_01_03_00"><evtAfastTemp Id="IDA1"><ideEvento><indRetif>1</indRetif><tpAmb>1</tpAmb></ideEvento><ideEmpregador><tpInsc>1</tpInsc><nrInsc>11222333</nrInsc></ideEmpregador><ideVinculo><cpfTrab>${CPF}</cpfTrab><matricula>M-1</matricula></ideVinculo><infoAfastamento><iniAfastamento><dtIniAfast>2026-05-04</dtIniAfast><codMotAfast>03</codMotAfast></iniAfastamento></infoAfastamento></evtAfastTemp></eSocial></evento><recibo><eSocial xmlns="http://www.esocial.gov.br/schema/evt/retornoEvento/v1_3_0"><retornoEvento Id="IDA1"><processamento><cdResposta>201</cdResposta></processamento><recibo><nrRecibo>1.9</nrRecibo></recibo></retornoEvento></eSocial></recibo></retornoEventoCompleto></eSocial>`;
        fireEvent.click(screen.getByText('Importar S-2230 (XML)'));
        const imp = screen.getByRole('dialog', { name: 'Importar S-2230' });
        fireEvent.change(within(imp).getByLabelText('XMLs do S-2230'), { target: { files: [{ name: 'afast.xml', size: s2230.length, text: async () => s2230 }] } });
        fireEvent.click(within(imp).getByText('Ler arquivos'));
        await waitFor(() => expect(within(imp).getByText('Novo')).toBeTruthy());
        fireEvent.click(within(imp).getByText('Gravar 1 afastamento(s)'));
        await waitFor(() => expect(svc.gravarAfastamentosImportados).toHaveBeenCalledTimes(1));
        expect(svc.gravarAfastamentosImportados.mock.calls[0][0][0].afastamento).toMatchObject({ id: `emp1_${CPF}_M-1_2026-05-04`, motivo: '03', dtFim: '', recibos: ['1.9'] });

        fireEvent.click(screen.getByText('Novo afastamento'));
        const dlg = screen.getByRole('dialog', { name: 'Afastamento' });
        fireEvent.change(within(dlg).getByLabelText('Funcionário'), { target: { value: ficha.id } });
        fireEvent.change(within(dlg).getByLabelText('Início do afastamento'), { target: { value: '2026-01-10' } });
        fireEvent.change(within(dlg).getByLabelText('Motivo'), { target: { value: '15' } });
        fireEvent.click(within(dlg).getByText('Gravar'));
        expect(within(dlg).getByRole('alert').textContent).toContain('Início anterior à admissão.');
        fireEvent.change(within(dlg).getByLabelText('Início do afastamento'), { target: { value: '2026-07-01' } });
        fireEvent.change(within(dlg).getByLabelText('Término do afastamento'), { target: { value: '2026-07-30' } });
        fireEvent.click(within(dlg).getByText('Gravar'));
        await waitFor(() => expect(svc.salvarAfastamento).toHaveBeenCalledTimes(1));
        expect(svc.salvarAfastamento.mock.calls[0][1]).toMatchObject({ id: `emp1_${CPF}_M-1_2026-07-01`, cpf: CPF, motivo: '15', dtFim: '2026-07-30', origem: expect.stringMatching(/^Manual · ana@sp\.com/) });
    });
});
