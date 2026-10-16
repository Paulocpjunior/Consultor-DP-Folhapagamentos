// @vitest-environment jsdom
// Folha do mês › Crédito do Trabalhador: importar o arquivo do Portal, prévia e gravação só do que foi marcado (dados fictícios).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FichaFuncionario } from '../../cadastros/funcionarios';

const gravados = vi.hoisted(() => [] as { fichas: FichaFuncionario[]; arquivos: string[]; fonte?: string }[]);
const encerrado = vi.hoisted(() => ({ sim: false, falha: 0 }));
vi.mock('../../cadastros/cadastrosService', () => ({
    mensagemErro: (e: unknown) => String(e),
    gravarImportacao: async (rs: { ficha: FichaFuncionario }[], _u: unknown, arquivos: string[], _p: unknown, fonte?: string) => { gravados.push({ fichas: rs.map(r => r.ficha), arquivos, fonte }); },
}));
vi.mock('../../fimDeMes/fechamentoService', () => ({ lerFechamento: async () => { if (encerrado.falha > 0) { encerrado.falha--; throw new Error('sem rede'); } return encerrado.sim ? { situacao: 'encerrado' } : null; } }));
import ConsignadoImportacao from '../../../components/folha/ConsignadoImportacao';

const ficha = (id: string, cpf: string, nome: string, consignados: FichaFuncionario['consignados']): FichaFuncionario =>
    ({ id, empresaId: 'E1', cnpj: '29463877000109', cpf, matriculaEsocial: `M${id}`, situacao: 'ativo', dados: { nome, admissao: '2024-01-02' }, dependentes: [], origens: {}, pendenciasImportacao: [], consignados } as FichaFuncionario);
const FICHAS = [ficha('a', '11144477735', 'ANA', [{ instFinanc: '341', nrDoc: 'A1', parcela: 40000, inicio: '2026-03' }]), ficha('b', '22255588846', 'BRUNO', [{ instFinanc: '104', nrDoc: 'B1', parcela: 20000, inicio: '2026-03' }])];
const CSV = 'cpf;ifConcessora.codigo;contrato;valorParcela;competencia\n11144477735;341;A1;450,00;2026-10\n22255588846;341;B2;100,00;2026-10\n';
const arquivo = (texto: string) => { const f = new File([texto], 'emprestimos-102026.csv', { type: 'text/csv' }); Object.defineProperty(f, 'arrayBuffer', { value: async () => new TextEncoder().encode(texto).buffer }); return f; };

afterEach(() => { cleanup(); gravados.length = 0; encerrado.sim = false; encerrado.falha = 0; vi.restoreAllMocks(); });

describe('Crédito do Trabalhador: importar o arquivo do Portal (tela)', () => {
    it('mostra a prévia e grava só o que ficou marcado, com a origem do arquivo', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const onGravado = vi.fn();
        render(<ConsignadoImportacao empresaId="E1" cnpj="29.463.877/0001-09" competencia="2026-10" fichas={FICHAS} usuario={{ id: 'u', email: 'u@x' }} onGravado={onGravado} />);
        fireEvent.change(screen.getByLabelText('Arquivo de empréstimos'), { target: { files: [arquivo(CSV)] } });
        expect(await screen.findByText('Parcela alterada')).toBeTruthy();
        expect(screen.getByText('Contrato novo')).toBeTruthy();
        expect(screen.getByText('Fora do arquivo')).toBeTruthy();
        expect((screen.getByLabelText('Coluna: Instituição (código da Tabela 37)') as HTMLSelectElement).value).toBe('ifConcessora.codigo');
        // Desmarca o contrato fora do arquivo: a ficha do Bruno só ganha o contrato novo.
        fireEvent.click(screen.getByLabelText('Aplicar BRUNO B1'));
        await waitFor(() => expect((screen.getByRole('button', { name: /Gravar 2 alteração/ }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: /Gravar 2 alteração/ }));
        await waitFor(() => expect(gravados).toHaveLength(1));
        expect(gravados[0].fonte).toBe('Arquivo de empréstimos do Portal Emprega Brasil');
        expect(gravados[0].arquivos).toEqual(['emprestimos-102026.csv']);
        const b = gravados[0].fichas.find(f => f.id === 'b')!;
        expect(b.consignados).toEqual([{ instFinanc: '104', nrDoc: 'B1', parcela: 20000, inicio: '2026-03' }, { instFinanc: '341', nrDoc: 'B2', parcela: 10000, inicio: '2026-10' }]);
        expect(gravados[0].fichas.find(f => f.id === 'a')!.consignados?.map(c => [c.parcela, c.inicio, c.fim])).toEqual([[40000, '2026-03', '2026-09'], [45000, '2026-10', undefined]]);
        expect(onGravado).toHaveBeenCalled();
        expect(await screen.findByText(/Gravado: 2 alteração/)).toBeTruthy();
    });

    it('competência encerrada: mostra o aviso e não grava', async () => {
        encerrado.sim = true;
        render(<ConsignadoImportacao empresaId="E1" cnpj="" competencia="2026-10" fichas={FICHAS} usuario={{ id: 'u', email: 'u@x' }} onGravado={() => {}} />);
        fireEvent.change(screen.getByLabelText('Arquivo de empréstimos'), { target: { files: [arquivo(CSV)] } });
        expect(await screen.findByText('Parcela alterada')).toBeTruthy();
        expect(await screen.findByText(/está encerrada \(Fim de mês\)/)).toBeTruthy();
        expect((screen.getByRole('button', { name: /Gravar 3 alteração/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('sem ler a situação da competência, não grava; "Tentar de novo" libera (Codex #277)', async () => {
        encerrado.falha = 1;
        render(<ConsignadoImportacao empresaId="E1" cnpj="" competencia="2026-10" fichas={FICHAS} usuario={{ id: 'u', email: 'u@x' }} onGravado={() => {}} />);
        fireEvent.change(screen.getByLabelText('Arquivo de empréstimos'), { target: { files: [arquivo(CSV)] } });
        expect(await screen.findByText(/Não consegui ler a situação da competência/)).toBeTruthy();
        expect((screen.getByRole('button', { name: /Gravar 3 alteração/ }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
        await waitFor(() => expect((screen.getByRole('button', { name: /Gravar 3 alteração/ }) as HTMLButtonElement).disabled).toBe(false));
    });
});
