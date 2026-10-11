// @vitest-environment jsdom
// Tela "Processos trabalhistas": cadastro do processo e do trabalhador, bases, gravação e S-2500 (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const srv = vi.hoisted(() => ({ gravados: [] as unknown[], lotes: [] as { xml: string; ref?: string }[][] }));
const NR = (() => { const n = '0001234', resto = '20255020001'; const dv = String(98n - (BigInt(`${n}${resto}00`) % 97n)).padStart(2, '0'); return `${n}${dv}${resto}`; })();
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [{ id: 'E1_52998224725_M1', empresaId: 'E1', cnpj: '44388152000189', cpf: '52998224725', matriculaEsocial: '000052', situacao: 'desligado', dados: { nome: 'ANA' }, dependentes: [], origens: {}, pendenciasImportacao: [] }],
    mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../processosService', () => ({ listarProcessos: async () => [], salvarProcesso: async (p: unknown) => { srv.gravados.push(p); } }));
vi.mock('../../esocial/envioSeguro', () => ({
    verificarAntesDeEnviar: async (p: { eventos: { xml: string; ref?: string }[] }) => { srv.lotes.push(p.eventos); return { ok: true, achados: [], eventos: [], tpAmb: 2, empresaId: 'E1' }; },
    transmitirVerificado: async () => ({ situacao: 'enviado', envioId: 'x', retorno: { protocolo: 'P1' } }),
    mensagemDaTransmissao: () => ({ ok: true, texto: 'Lote recebido pelo eSocial. Protocolo P1.' }),
}));
import ProcessosTrabalhistasPanel from '../../../components/processoTrabalhista/ProcessosTrabalhistasPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

afterEach(() => { cleanup(); srv.gravados.length = 0; srv.lotes.length = 0; });
const ATIVA = { id: 'E1', nome: 'X', cnpj: '44.388.152/0001-89', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };

describe('processos trabalhistas (tela)', () => {
    it('cadastra o processo judicial, monta as bases, grava e transmite o S-2500', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ProcessosTrabalhistasPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText('+ Novo processo'));
        fireEvent.change(screen.getByLabelText('Número do processo'), { target: { value: NR } });
        fireEvent.change(screen.getByLabelText('Data da decisão'), { target: { value: '2026-08-20' } });
        fireEvent.change(screen.getByLabelText('UF da Vara'), { target: { value: 'SP' } });
        fireEvent.change(screen.getByLabelText('Município da Vara'), { target: { value: '3550308' } });
        fireEvent.change(screen.getByLabelText('Vara'), { target: { value: '12' } });
        await waitFor(() => expect(screen.getAllByRole('option', { name: /ANA/ }).length).toBeGreaterThan(0));
        fireEvent.change(screen.getByLabelText('Incluir funcionário'), { target: { value: 'E1_52998224725_M1' } });
        fireEvent.change(screen.getByLabelText('Competência inicial de ANA'), { target: { value: '2024-11' } });
        fireEvent.change(screen.getByLabelText('Competência final de ANA'), { target: { value: '2024-12' } });
        fireEvent.click(screen.getByText('Montar os meses'));
        const base = screen.getByLabelText('bcCpMensal 2024-11 de ANA');
        fireEvent.change(base, { target: { value: '500,00' } });
        fireEvent.blur(base);
        fireEvent.click(screen.getByText('Gravar o processo'));
        await screen.findByText('Processo gravado.');
        expect(srv.gravados[0]).toMatchObject({ nrProcTrab: NR, trabalhadores: [{ cpf: '52998224725', matricula: '000052', periodos: [{ perRef: '2024-11', bcCpMensal: 50000 }, { perRef: '2024-12', bcCpMensal: 0 }] }] });
        fireEvent.click(screen.getByText('Transmitir S-2500'));
        await screen.findByText(/S-2500: Lote recebido/);
        expect(srv.lotes[0][0].ref).toBe(`proc:${NR}:52998224725`);
        expect(srv.lotes[0][0].xml).toContain('<vrBcCpMensal>500.00</vrBcCpMensal>');
    });

    it('não grava com erro: mostra o que falta', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ProcessosTrabalhistasPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText('+ Novo processo'));
        fireEvent.click(screen.getByText('Gravar o processo'));
        await screen.findByRole('alert');
        expect(screen.getByRole('alert').textContent).toMatch(/padrão do CNJ.*Inclua o trabalhador/);
        expect(srv.gravados).toHaveLength(0);
    });

    it('reconhecimento de vínculo de quem não tem ficha: dados do contrato no S-2500', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ProcessosTrabalhistasPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText('+ Novo processo'));
        fireEvent.change(screen.getByLabelText('Número do processo'), { target: { value: NR } });
        fireEvent.change(screen.getByLabelText('Data da decisão'), { target: { value: '2026-08-20' } });
        fireEvent.change(screen.getByLabelText('UF da Vara'), { target: { value: 'SP' } });
        fireEvent.change(screen.getByLabelText('Município da Vara'), { target: { value: '3550308' } });
        fireEvent.change(screen.getByLabelText('Vara'), { target: { value: '12' } });
        fireEvent.click(screen.getByText('+ Trabalhador sem ficha'));
        fireEvent.change(screen.getByLabelText('CPF do trabalhador 1'), { target: { value: '111.444.777-35' } });
        expect((screen.getByLabelText('Tipo de contrato de 11144477735') as HTMLSelectElement).value).toBe('5');
        fireEvent.change(screen.getByLabelText('Nome de 11144477735'), { target: { value: 'bruno' } });
        fireEvent.change(screen.getByLabelText('Nascimento de BRUNO'), { target: { value: '1990-04-02' } });
        fireEvent.change(screen.getByLabelText('Matrícula nova de BRUNO'), { target: { value: 'PROC-0001' } });
        fireEvent.change(screen.getByLabelText('CBO de BRUNO'), { target: { value: '411010' } });
        const sal = screen.getByLabelText('Salário de BRUNO');
        fireEvent.change(sal, { target: { value: '2.500,00' } });
        fireEvent.blur(sal);
        fireEvent.change(screen.getByLabelText('Admissão de BRUNO'), { target: { value: '2024-11-04' } });
        fireEvent.change(screen.getByLabelText('Desligamento de BRUNO'), { target: { value: '2024-12-31' } });
        fireEvent.change(screen.getByLabelText('Motivo do desligamento de BRUNO'), { target: { value: '02' } });
        fireEvent.change(screen.getByLabelText('Competência inicial de BRUNO'), { target: { value: '2024-11' } });
        fireEvent.change(screen.getByLabelText('Competência final de BRUNO'), { target: { value: '2024-12' } });
        fireEvent.click(screen.getByText('Montar os meses'));
        fireEvent.click(screen.getByText('Gravar o processo'));
        await screen.findByText('Processo gravado.');
        expect(srv.gravados[0]).toMatchObject({ trabalhadores: [{ fichaId: '', cpf: '11144477735', nome: 'BRUNO', tpContr: '5', contrato: { salario: 250000, dtAdm: '2024-11-04', mtvDeslig: '02' } }] });
        fireEvent.click(screen.getByText('Transmitir S-2500'));
        await screen.findByText(/S-2500: Lote recebido/);
        expect(srv.lotes[0][0].xml).toContain('<nmTrab>BRUNO</nmTrab><dtNascto>1990-04-02</dtNascto><infoContr><tpContr>5</tpContr><indContr>N</indContr>');
        expect(srv.lotes[0][0].xml).toContain('<vrSalFx>2500.00</vrSalFx>');
    });

    it('Justiça Comum: cota patronal e sem S-2501; tipo 8 pede o responsável direto; tipo 9 os contratos incorporados', async () => {
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ProcessosTrabalhistasPanel usuario={{ id: 'u', email: 'dp@x' }} /></EmpresaAtivaProvider>);
        fireEvent.click(await screen.findByText('+ Novo processo'));
        fireEvent.change(screen.getByLabelText('Origem'), { target: { value: '3' } });
        expect(screen.getByLabelText('Cota patronal da requisição')).toBeTruthy();
        expect(screen.getByText(/Justiça Comum não tem S-2501/)).toBeTruthy();
        await waitFor(() => expect(screen.getAllByRole('option', { name: /ANA/ }).length).toBeGreaterThan(0));
        fireEvent.change(screen.getByLabelText('Incluir funcionário'), { target: { value: 'E1_52998224725_M1' } });
        expect((screen.getByText('+ Pagamento') as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Tipo de contrato de ANA'), { target: { value: '9' } });
        fireEvent.click(screen.getByText('+ Contrato incorporado'));
        fireEvent.change(screen.getByLabelText('Matrícula incorporada 1 de ANA'), { target: { value: '000031' } });
        fireEvent.change(screen.getByLabelText('Tipo de contrato de ANA'), { target: { value: '8' } });
        fireEvent.click(screen.getByLabelText('Responsável direto'));
        fireEvent.change(screen.getByLabelText('Inscrição do responsável'), { target: { value: '11.222.333/0001-81' } });
        expect((screen.getByLabelText('Inscrição do responsável') as HTMLInputElement).value).toBe('11222333000181');
        expect(screen.getByLabelText('Admissão no responsável')).toBeTruthy();
    });
});
