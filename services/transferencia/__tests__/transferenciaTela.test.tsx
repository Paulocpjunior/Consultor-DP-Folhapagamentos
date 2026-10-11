// @vitest-environment jsdom
// Transferência: gravação no banco (passos e avisos) e a tela, do cadastro à transmissão do S-2299 (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, idFuncionario, type FichaFuncionario } from '../../cadastros/funcionarios';
import { afastamentoVazio } from '../../cadastros/afastamentos';

const srv = vi.hoisted(() => ({ docs: new Map<string, unknown>(), fichas: [] as unknown[], salvos: [] as unknown[], afs: [] as unknown[], movs: [] as unknown[][], envios: [] as { xml: string; ref: string }[], falhaMov: '' }));
vi.mock('../../firebaseConfig', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
    collection: (_db: unknown, c: string) => c, doc: (_db: unknown, c: string, id: string) => `${c}/${id}`, where: (...a: unknown[]) => a, query: (c: string, w: unknown[]) => ({ c, w }),
    serverTimestamp: () => 'agora', setDoc: async (k: string, v: unknown) => { srv.docs.set(k, v); },
    getDocs: async (q: { w: [string, string, string] }) => ({ docs: [...srv.docs.entries()].filter(([k, v]) => k.startsWith('transferencias/') && (v as Record<string, string>)[q.w[0]] === q.w[2]).map(([k, v]) => ({ id: k.split('/')[1], data: () => v })) }),
}));
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async (id: string) => (srv.fichas as FichaFuncionario[]).filter(f => f.empresaId === id),
    listarAfastamentos: async () => srv.afs,
    salvarFuncionario: async (antes: unknown, f: FichaFuncionario) => { srv.salvos.push([antes, f]); const i = (srv.fichas as FichaFuncionario[]).findIndex(x => x.id === f.id); if (i >= 0) srv.fichas[i] = f; else srv.fichas.push(f); },
    salvarAfastamento: async (_a: unknown, a: unknown) => { srv.salvos.push(['afa', a]); },
    mensagemErro: (e: unknown) => (e as Error).message,
}));
vi.mock('../../calculo/movimentosService', () => ({
    listarMovimentosDaEmpresa: async () => ({ [FICHA.id]: { '2026-08': { horasExtras50: 2 }, '2026-09': { faltas: 1 }, '2026-11': { faltas: 3 } } }),
    salvarMovimentos: async (...a: unknown[]) => { if (a[1] === srv.falhaMov) throw new Error('encerrado'); srv.movs.push(a); },
}));
vi.mock('../../empresas/empresasService', () => ({ listarEmpresasVisiveis: async () => [
    { id: 'E1', cnpj: '44388152000189', razaoSocial: 'ALFA LTDA', nomeFantasia: 'ALFA', codigoSage: '0001', criadoPor: 'u' },
    { id: 'E2', cnpj: '29463877000109', razaoSocial: 'BETA LTDA', nomeFantasia: 'BETA', codigoSage: '0002', criadoPor: 'u' },
    { id: 'E3', cnpj: '44388152000270', razaoSocial: 'ALFA FILIAL', nomeFantasia: 'ALFA FILIAL', codigoSage: '0003', criadoPor: 'u' }] }));
vi.mock('../../esocial/transmissaoService', () => ({ listarEnvios: async () => [] }));
vi.mock('../../esocial/envioSeguro', () => ({
    verificarAntesDeEnviar: async (x: { eventos: { xml: string; ref: string }[] }) => { srv.envios.push(...x.eventos); return { ok: true, achados: [] }; },
    transmitirVerificado: async () => ({ situacao: 'enviado' }), mensagemDaTransmissao: () => ({ ok: true, texto: 'Lote recebido.' }),
}));
import { efetivarTransferencia } from '../transferenciaService';
import { contratoPadrao } from '../../esocial/admissao';
import TransferenciaPanel from '../../../components/transferencia/TransferenciaPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';

const ORIGEM = { id: 'E1', cnpj: '44388152000189', nome: 'ALFA' };
const DESTINO = { id: 'E2', cnpj: '29463877000109', nome: 'BETA' };
const FICHA: FichaFuncionario = {
    ...fichaVazia(ORIGEM), id: idFuncionario('E1', '52998224725', 'A-10'), cpf: '52998224725', matriculaEsocial: 'A-10',
    dados: { nome: 'ANA TESTE', nascimento: '1990-01-01', sexo: 'F', raca: '1', escolaridade: '07', logradouro: 'RUA A', numero: '10', cep: '01001000', municipio: '3550308', uf: 'SP',
        admissao: '2020-03-02', categoria: '101', cargo: 'AUXILIAR', cbo: '411005', salario: '2500.00', unidadeSalario: '5', horasSemanais: '44', sindicato: '11222333000181', estabelecimento: '44388152000189', jornada: 'Seg a sex 8h às 17h' },
};
const USUARIO = { id: 'u', email: 'dp@x' };
afterEach(() => { cleanup(); srv.docs.clear(); srv.fichas = []; srv.salvos.length = 0; srv.afs = []; srv.movs.length = 0; srv.envios.length = 0; srv.falhaMov = ''; });

describe('gravação da transferência', () => {
    it('registro, ficha no destino, férias, movimentos anteriores e a origem desligada', async () => {
        srv.fichas = [FICHA];
        srv.afs = [{ ...afastamentoVazio(), id: `${FICHA.id}_2025-01-06`, empresaId: 'E1', fichaId: FICHA.id, cpf: FICHA.cpf, dtInicio: '2025-01-06', dtFim: '2025-02-04', motivo: '15', recibos: ['1'] }];
        srv.falhaMov = '2026-08';
        const r = await efetivarTransferencia({ ficha: FICHA, origem: ORIGEM, destino: DESTINO, data: '2026-11-01', matricula: 'B-77', estabelecimento: DESTINO.cnpj }, contratoPadrao(FICHA), USUARIO);
        expect(r.situacao).toBe('efetivada');
        expect(srv.docs.get(`transferencias/${FICHA.id}_2026-11-01`)).toMatchObject({ empresaId: 'E1', destinoId: 'E2', situacao: 'efetivada', matricula: 'B-77', atualizadoPor: 'u' });
        const nova = idFuncionario('E2', '52998224725', 'B-77');
        expect(srv.salvos[0]).toEqual([null, expect.objectContaining({ id: nova, empresaId: 'E2' })]);
        expect(srv.salvos[1]).toEqual(['afa', expect.objectContaining({ fichaId: nova, recibos: [] })]);
        expect(srv.movs.map(m => m[1])).toEqual(['2026-09']);
        expect(r.avisos.join(' ')).toMatch(/Movimentos não copiados.*2026-08/);
        expect(srv.salvos.at(-1)).toEqual([FICHA, expect.objectContaining({ situacao: 'desligado', dados: expect.objectContaining({ dataDesligamento: '2026-10-31', motivoDesligamento: '11' }) })]);
    });
});

describe('tela da transferência', () => {
    it('grava pela tela e transmite o S-2299 da origem', async () => {
        srv.fichas = [FICHA];
        const ATIVA = { id: 'E1', nome: 'ALFA', cnpj: '44388152000189', codigoSage: '0001', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><TransferenciaPanel usuario={USUARIO} /></EmpresaAtivaProvider>);
        await screen.findByRole('option', { name: /ANA TESTE/ });
        // A filial (mesma raiz) não aparece como destino.
        expect(screen.queryByRole('option', { name: /ALFA FILIAL/ })).toBeNull();
        fireEvent.change(screen.getByLabelText('Funcionário a transferir'), { target: { value: FICHA.id } });
        fireEvent.change(screen.getByLabelText('Empresa de destino'), { target: { value: 'E2' } });
        fireEvent.change(screen.getByLabelText('Data da transferência'), { target: { value: '2026-11-01' } });
        fireEvent.change(screen.getByLabelText('Matrícula no destino'), { target: { value: 'B-77' } });
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        await waitFor(() => expect((screen.getByText('Gravar a transferência') as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByText('Gravar a transferência'));
        const lista = await screen.findByLabelText('Transferências');
        expect(lista.textContent).toMatch(/ANA TESTE/);
        expect(lista.textContent).toMatch(/A-10 → B-77/);
        fireEvent.click(screen.getAllByText('Transmitir')[0]);
        await waitFor(() => expect(srv.envios).toHaveLength(1));
        expect(srv.envios[0].ref).toBe(`transf-saida:${FICHA.id}:2026-11-01`);
        expect(srv.envios[0].xml).toContain('<mtvDeslig>11</mtvDeslig><dtDeslig>2026-10-31</dtDeslig>');
    });
});
