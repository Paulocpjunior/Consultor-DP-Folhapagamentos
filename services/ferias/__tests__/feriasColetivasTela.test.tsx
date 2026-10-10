// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fichaVazia, type FichaFuncionario } from '../../cadastros/funcionarios';
import type { Afastamento } from '../../cadastros/afastamentos';
import { planejarColetiva } from '../feriasColetivas';
import { comunicacaoColetivaPdf } from '../comunicacaoColetivaPdf';

const srv = vi.hoisted(() => ({ gravados: [] as Afastamento[][] }));
vi.mock('../../cadastros/cadastrosService', () => ({
    gravarAfastamentosColetiva: async (itens: Afastamento[]) => { srv.gravados.push(itens); },
    mensagemErro: (e: unknown) => String(e),
}));
import FeriasColetivasModal from '../../../components/ferias/FeriasColetivasModal';

const ficha = (id: string, dados: Partial<FichaFuncionario['dados']> = {}): FichaFuncionario => ({ ...fichaVazia({ id: 'E1', cnpj: '29463877000109' }), id, cpf: '52998224725', matriculaEsocial: id, situacao: 'ativo',
    dados: { nome: id.toUpperCase(), admissao: '2025-03-10', salario: '3000.00', unidadeSalario: '5', horasSemanais: '44', categoria: '101', departamentoIob: 'PRODUCAO', ...dados } });
const FICHAS = [ficha('ana'), ficha('bia', { admissao: '2026-06-01' }), ficha('fabi', { departamentoIob: 'ADMINISTRACAO' })];
const EMPRESA = { id: 'E1', cnpj: '29.463.877/0001-09', razaoSocial: 'EMPRESA X LTDA', codigoSage: '1200' };
afterEach(() => { cleanup(); srv.gravados.length = 0; vi.restoreAllMocks(); });

describe('férias coletivas (tela)', () => {
    it('planeja por setor, mostra quem entra e grava os afastamentos', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const onGravado = vi.fn();
        render(<FeriasColetivasModal empresa={EMPRESA} fichas={FICHAS} afastamentos={[]} movimentos={{}} usuario={{ id: 'u', email: 'dp@x' }} onFechar={() => undefined} onGravado={onGravado} />);
        fireEvent.change(screen.getByLabelText('Início das férias coletivas'), { target: { value: '2026-12-14' } });
        fireEvent.change(screen.getByLabelText('Abrangência'), { target: { value: 'departamento' } });
        expect(Array.from((screen.getByLabelText('Setor') as HTMLSelectElement).options).map(o => o.value)).toEqual(['', 'ADMINISTRACAO', 'PRODUCAO']);
        fireEvent.change(screen.getByLabelText('Setor'), { target: { value: 'PRODUCAO' } });
        expect(screen.getByText('ANA')).toBeTruthy();
        expect(screen.queryByText('FABI')).toBeNull();
        expect(screen.getByText('Proporcionais (art. 140)')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Gravar em Afastamentos (2)' }));
        await waitFor(() => expect(onGravado).toHaveBeenCalledWith('2026-12-14'));
        expect(srv.gravados[0].map(a => [a.fichaId, a.motivo, a.dtInicio])).toEqual([['ana', '15', '2026-12-14'], ['bia', '15', '2026-12-14'], ['bia', '16', '2026-12-29']]);
    });
    it('com erro na regra (menos de 10 dias), não grava', () => {
        render(<FeriasColetivasModal empresa={EMPRESA} fichas={FICHAS} afastamentos={[]} movimentos={{}} usuario={{ id: 'u', email: 'dp@x' }} onFechar={() => undefined} onGravado={() => undefined} />);
        fireEvent.change(screen.getByLabelText('Início das férias coletivas'), { target: { value: '2026-12-14' } });
        fireEvent.change(screen.getByLabelText('Dias das férias coletivas'), { target: { value: '8' } });
        expect(screen.getByRole('alert').textContent).toMatch(/mínimo 10 dias/);
        expect((screen.getByRole('button', { name: /Gravar em Afastamentos/ }) as HTMLButtonElement).disabled).toBe(true);
    });
});

describe('comunicação das férias coletivas (PDF)', () => {
    it('Ministério do Trabalho, sindicato e aviso; ME/EPP sem a do Ministério', () => {
        const plano = { inicio: '2026-12-14', dias: 20, setor: { tipo: 'todos' as const }, restante: 'licenca' as const, meEpp: false, hoje: '2026-11-20' };
        const r = planejarColetiva(plano, FICHAS, [], {});
        const dados = { razaoSocial: 'EMPRESA X LTDA', cnpj: '29463877000109', cidade: 'São Paulo', sindicato: 'Sindicato dos Comerciários de São Paulo', setor: '' };
        const o = { empresa: { razaoSocial: 'EMPRESA X LTDA', cnpj: '29463877000109' } };
        const doc = comunicacaoColetivaPdf(plano, r, dados, o);
        expect(doc.getNumberOfPages()).toBe(3);
        const texto = doc.output();
        expect(texto).toContain('de 14/12/2026 a 02/01/2027 \\(20 dias\\)');
        expect(texto).toContain('Sindicato dos Comerci');
        expect(comunicacaoColetivaPdf({ ...plano, meEpp: true }, r, dados, o).getNumberOfPages()).toBe(2);
    });
});
