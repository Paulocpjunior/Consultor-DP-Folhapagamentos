// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AtivarEmpresaScreen from '../../../components/empresaAtiva/AtivarEmpresaScreen';
import EmpresaAtivaFixa from '../../../components/empresaAtiva/EmpresaAtivaFixa';
import { EmpresaAtivaProvider } from '../empresaAtivaContext';

const emp = (id: string, nome: string, sage: string) => ({ id, cnpj: `1122233300018${id.length}`, razaoSocial: `${nome} LTDA`, nomeFantasia: nome, codigoSage: sage, criadoPor: 'g' }) as never;
afterEach(cleanup);
const base = { erro: '', competenciaInicial: '2026-09', atual: null, usuarioEmail: 'eu@x', onIrParaEmpresas: () => {}, onSair: () => {} };

describe('tela de ativação de empresa e período', () => {
    it('busca, exige a competência e ativa com empresa, período e autor', () => {
        const onAtivar = vi.fn();
        render(<AtivarEmpresaScreen {...base} empresas={[emp('A', 'Alfa', '0001'), emp('B', 'Beta', '0002')]} onAtivar={onAtivar} />);
        fireEvent.change(screen.getByLabelText('Buscar empresa'), { target: { value: '0002' } });
        expect(screen.queryByText('Alfa')).toBeNull();
        fireEvent.change(screen.getByLabelText('Competência de trabalho'), { target: { value: '' } });
        expect((screen.getByRole('button', { name: 'Ativar Beta' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Competência de trabalho'), { target: { value: '2026-08' } });
        fireEvent.click(screen.getByRole('button', { name: 'Ativar Beta' }));
        expect(onAtivar).toHaveBeenCalledWith(expect.objectContaining({ id: 'B', nome: 'Beta', codigoSage: '0002', competencia: '2026-08', ativadaPor: 'eu@x' }));
    });

    it('carteira vazia: explica e leva ao cadastro de empresas; sem "Voltar" sem ativação', () => {
        const ir = vi.fn();
        render(<AtivarEmpresaScreen {...base} empresas={[]} onAtivar={() => {}} onIrParaEmpresas={ir} />);
        expect(screen.getByText('Nenhuma empresa na sua carteira.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Cadastrar empresa' }));
        expect(ir).toHaveBeenCalled();
    });

    it('troca: marca a ativa, abre na competência dela e permite voltar', () => {
        const voltar = vi.fn();
        const atual = { id: 'A', nome: 'Alfa', cnpj: '1', codigoSage: '0001', competencia: '2026-07', ativadaPor: 'eu@x', ativadaEm: 1 };
        render(<AtivarEmpresaScreen {...base} atual={atual} empresas={[emp('A', 'Alfa', '0001')]} onAtivar={() => {}} onCancelar={voltar} />);
        expect(screen.getByText('ativa')).toBeTruthy();
        expect((screen.getByLabelText('Competência de trabalho') as HTMLInputElement).value).toBe('2026-07');
        fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
        expect(voltar).toHaveBeenCalled();
    });

    it('nas telas, a empresa ativa aparece fixa com o atalho de troca', () => {
        const trocar = vi.fn();
        const ativa = { id: 'A', nome: 'Alfa', cnpj: '1', codigoSage: '0001', competencia: '2026-09', ativadaPor: 'eu@x', ativadaEm: 1 };
        render(<EmpresaAtivaProvider ativa={ativa} trocar={trocar}><EmpresaAtivaFixa /></EmpresaAtivaProvider>);
        expect(screen.getByLabelText('Empresa ativa').textContent).toBe('0001 · Alfa');
        fireEvent.click(screen.getByRole('button', { name: '⇄ trocar' }));
        expect(trocar).toHaveBeenCalled();
    });
});
