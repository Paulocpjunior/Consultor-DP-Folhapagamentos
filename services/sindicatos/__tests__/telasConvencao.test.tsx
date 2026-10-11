// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import { sindicatoVazio } from '../../cadastros/sindicatos';
import { tabelaVazia } from '../../cadastros/tabelasLegais';
import { convencaoVazia, type ConvencaoColetiva } from '../convencao';

const SIND = '11222333000181';
const CCT: ConvencaoColetiva = { ...convencaoVazia(SIND), id: `${SIND}_2026-05-01`, vigenciaInicio: '2026-05-01', vigenciaFim: '2027-04-30', dataBase: '5',
    pisos: [{ descricao: 'Geral', cbo: '', valor: 200000 }], obrigacoes: [{ id: 'o1', descricao: 'Cesta básica mensal' }] };
const srv = vi.hoisted(() => ({ salvas: [] as unknown[], marcadas: [] as unknown[], convencoes: [] as unknown[] }));
vi.mock('../convencoesService', () => ({
    TAMANHO_MAXIMO_PDF: 20 * 1024 * 1024,
    listarConvencoes: async () => srv.convencoes,
    salvarConvencao: async (c: ConvencaoColetiva, pdf: File | null) => { srv.salvas.push([c, pdf?.name]); return c; },
    abrirPdfConvencao: async () => undefined,
    listarChecklists: async () => ({}),
    marcarObrigacao: async (_e: string, _c: string, atual: object, id: string, cumprido: boolean) => { srv.marcadas.push([id, cumprido]); return { ...atual, [id]: { cumprido, obs: '', porEmail: 'dp@x', em: 'agora' } }; },
}));
vi.mock('../textoPdf', () => ({ lerTextoPdf: async () => 'CONVENÇÃO COLETIVA DE TRABALHO 2026/2027 NÚMERO DE REGISTRO NO MTE: SP001234/2026 a vigência no período de 01º de maio de 2026 a 30 de abril de 2027 e a data-base da categoria em 01º de maio. PISO SALARIAL: a) Geral: R$ 2.000,00. Os salários serão reajustados pelo percentual de 5,5%.' }));
const ficha = (id: string, salario: string): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo',
    dados: { nome: id.toUpperCase(), admissao: '2024-03-10', salario, unidadeSalario: '5', horasSemanais: '44', categoria: '101' } });
const FED = { ...tabelaVazia('salario_minimo'), id: 'f', vigencia: '2026-01', norma: 'Decreto 12.797/2025', valores: { salarioMinimo: 162100 } };
const SP = { ...tabelaVazia('salario_minimo_estadual'), id: 'sp', vigencia: '2026-01', norma: 'Lei estadual (teste)', uf: 'SP', pisos: [{ descricao: 'Piso único', valor: 210000 }] };
vi.mock('../../cadastros/cadastrosService', () => ({
    listarFuncionarios: async () => [ficha('ana', '1950.00'), ficha('bia', '2050.00')],
    listarTabelas: async () => [FED, SP],
    listarSindicatos: async () => [{ ...sindicatoVazio(), id: SIND, cnpj: SIND, nome: 'SINDICATO X' }],
    mensagemErro: (e: unknown) => String(e),
}));
vi.mock('../../calculo/movimentosService', () => ({ listarMovimentos: async () => [] }));
import ConvencoesSindicato from '../../../components/sindicatos/ConvencoesSindicato';
import ConformidadePanel from '../../../components/conformidade/ConformidadePanel';
import SindicatosCadastro from '../../../components/cadastros/SindicatosCadastro';

afterEach(() => { cleanup(); srv.salvas.length = 0; srv.marcadas.length = 0; srv.convencoes = []; });

describe('convenções do sindicato (tela)', () => {
    it('lê o PDF, pré-preenche e grava com o arquivo', async () => {
        render(<ConvencoesSindicato sindicato={{ ...sindicatoVazio(), id: SIND, cnpj: SIND, nome: 'SINDICATO X' }} usuario={{ id: 'u', email: 'dp@x' }} />);
        fireEvent.click(await screen.findByText('Nova convenção (PDF)'));
        const pdf = new File(['%PDF'], 'cct-2026.pdf', { type: 'application/pdf' });
        Object.defineProperty(pdf, 'arrayBuffer', { value: async () => new ArrayBuffer(4) });
        fireEvent.change(screen.getByLabelText('PDF da convenção'), { target: { files: [pdf] } });
        await waitFor(() => expect((screen.getByLabelText('Início da vigência') as HTMLInputElement).value).toBe('2026-05-01'));
        expect((screen.getByLabelText('Fim da vigência') as HTMLInputElement).value).toBe('2027-04-30');
        expect((screen.getByLabelText('Registro no MTE') as HTMLInputElement).value).toBe('SP001234/2026');
        expect((screen.getByLabelText('Percentual de reajuste') as HTMLInputElement).value).toBe('5,5');
        expect((screen.getByLabelText('Valor do piso 1') as HTMLInputElement).value).toBe('2000,00');
        expect(screen.getByText(/Lido do PDF: vigência, data-base, registro, reajuste, 1 piso/)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Obrigações da convenção'), { target: { value: 'Cesta básica mensal\nSeguro de vida' } });
        fireEvent.click(screen.getByText('Gravar convenção'));
        await waitFor(() => expect(srv.salvas).toHaveLength(1));
        const [c, nome] = srv.salvas[0] as [ConvencaoColetiva, string];
        expect(nome).toBe('cct-2026.pdf');
        expect(c).toMatchObject({ sindicatoCnpj: SIND, vigenciaInicio: '2026-05-01', dataBase: '5', reajuste: { percentual: 5.5, aPartirDe: '2026-05' }, pisos: [{ descricao: 'Geral', valor: 200000 }] });
        expect(c.obrigacoes.map(o => o.descricao)).toEqual(['Cesta básica mensal', 'Seguro de vida']);
    });
});

describe('conformidade (tela)', () => {
    it('piso da convenção, estadual suprimido para quem tem piso e checklist das obrigações', async () => {
        srv.convencoes = [CCT];
        const empresa = { id: 'E1', cnpj: '29463877000109', razaoSocial: 'X', nomeFantasia: 'X', codigoSage: '1', criadoPor: 'u', uf: 'SP', sindicatos: [SIND] };
        render(<ConformidadePanel empresa={empresa} usuario={{ id: 'u', email: 'dp@x' }} competenciaInicial="2026-10" />);
        expect(await screen.findByText(/ANA:/)).toBeTruthy();
        const textos = screen.getAllByRole('listitem').map(li => li.textContent ?? '');
        expect(textos.some(t => /ANA:.*abaixo do piso da CCT/.test(t))).toBe(true);
        expect(textos.some(t => /piso estadual/.test(t))).toBe(false); // o piso da convenção prevalece (LC 103/2000)
        expect(screen.getByText(/obrigação\(ões\) da CCT sem confirmação/)).toBeTruthy();
        fireEvent.click(screen.getByLabelText('Cumprida: Cesta básica mensal'));
        await waitFor(() => expect(srv.marcadas).toEqual([['o1', true]]));
        await waitFor(() => expect(screen.queryByText(/obrigação\(ões\) da CCT sem confirmação/)).toBeNull());
    });
});

describe('sindicatos (tela): renovação da convenção', () => {
    it('sinaliza a nova publicação em atraso com a contagem de dias', async () => {
        const hoje = new Date().toISOString().slice(0, 10);
        const fim = new Date(Date.parse(`${hoje}T00:00:00Z`) - 10 * 86400000).toISOString().slice(0, 10);
        srv.convencoes = [{ ...CCT, vigenciaInicio: '2025-01-01', vigenciaFim: fim }];
        render(<SindicatosCadastro sindicatos={[{ ...sindicatoVazio(), id: SIND, cnpj: SIND, nome: 'SINDICATO X' }]} erroLista="" usuario={{ id: 'u', email: 'dp@x' }} isAdmin={false} onRecarregar={() => undefined} />);
        expect((await screen.findByRole('alert')).textContent).toMatch(/nova publicação em atraso: SINDICATO X \(10 dias\)/);
        expect(screen.getByText('10 dias em atraso')).toBeTruthy();
    });
});
