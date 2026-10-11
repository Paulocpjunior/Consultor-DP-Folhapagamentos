// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FORNECEDORES, contratadoVazio, linkDoContratado, linkValido, proximoPedido, validarContratados } from '../fornecedores';

describe('catálogo de fornecedores', () => {
    it('links https válidos, ids únicos e as marcas novas com o nome antigo', () => {
        expect(new Set(FORNECEDORES.map(f => f.id)).size).toBe(FORNECEDORES.length);
        for (const f of FORNECEDORES) expect(linkValido(f.url), f.id).toBe(true);
        const nomes = FORNECEDORES.map(f => f.nome);
        for (const n of ['SPTrans — Bilhete Único', 'Metrô de São Paulo', 'CPTM', 'EMTU/SP', 'TOP', 'Pluxee', 'Caju', 'Sólides Benefícios', 'Porto Seguro Odonto', 'Wellhub', 'TotalPass']) expect(nomes).toContain(n);
        expect(FORNECEDORES.find(f => f.id === 'pluxee')?.antes).toBe('Sodexo Benefícios');
        expect(FORNECEDORES.find(f => f.id === 'wellhub')?.antes).toBe('Gympass');
        expect(FORNECEDORES.find(f => f.id === 'top')).toMatchObject({ antes: 'Cartão BOM', url: 'https://boradetop.com.br/' });
    });
    it('link: só https sem credenciais', () => {
        expect([linkValido('https://www.caju.com.br/'), linkValido('http://x.com.br'), linkValido('javascript:alert(1)'), linkValido('https://user:senha@x.com.br'), linkValido('https://localhost')]).toEqual([true, false, false, false, false]);
    });
    it('contratado: link próprio vale no lugar do catálogo; validação', () => {
        const b = { ...contratadoVazio(), id: 'b1', fornecedorId: 'alelo' };
        expect(linkDoContratado(b)).toBe('https://www.alelo.com.br/');
        expect(linkDoContratado({ ...b, url: 'https://meuportal.alelo.com.br/' })).toBe('https://meuportal.alelo.com.br/');
        expect(validarContratados([b])).toEqual([]);
        expect(validarContratados([{ ...b, url: 'http://inseguro', diaPedido: '32' }])).toEqual(['Benefício 1 (Alelo): o link próprio precisa ser um endereço https válido.', 'Benefício 1 (Alelo): dia do pedido de 1 a 31.']);
        expect(validarContratados([{ ...contratadoVazio(), id: 'x' }])).toEqual(['Benefício 1 (Fornecedor): escolha o fornecedor ou informe o nome.']);
    });
    it('próximo pedido: no mês, no seguinte e no último dia do mês curto', () => {
        expect(proximoPedido('25', '2026-10-11')).toEqual({ data: '2026-10-25', dias: 14 });
        expect(proximoPedido('5', '2026-10-11')).toEqual({ data: '2026-11-05', dias: 25 });
        expect(proximoPedido('31', '2026-02-10')).toEqual({ data: '2026-02-28', dias: 18 });
        expect(proximoPedido('10', '2026-12-20')).toEqual({ data: '2027-01-10', dias: 21 });
        expect(proximoPedido('', '2026-10-11')).toBeNull();
    });
});

const srv = vi.hoisted(() => ({ gravados: [] as unknown[] }));
vi.mock('../../empresas/empresasService', () => ({
    listarEmpresasVisiveis: async () => [{ id: 'E1', cnpj: '29463877000109', razaoSocial: 'EMPRESA X', nomeFantasia: 'X', codigoSage: '1', criadoPor: 'u', beneficiosContratados: [] }],
    salvarBeneficiosContratados: async (_id: string, l: unknown) => { srv.gravados.push(l); },
}));
import AdministracaoBeneficios from '../../../components/beneficios/AdministracaoBeneficios';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
afterEach(() => { cleanup(); srv.gravados.length = 0; });

describe('administração de benefícios (tela)', () => {
    it('busca no catálogo, contrata, informa o dia do pedido e grava', async () => {
        const ATIVA = { id: 'E1', nome: 'X', cnpj: '29463877000109', codigoSage: '1', competencia: '2026-10', ativadaPor: 'x', ativadaEm: 1 };
        render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><AdministracaoBeneficios /></EmpresaAtivaProvider>);
        expect(await screen.findByText(/Benefícios contratados — X/)).toBeTruthy();
        expect((screen.getByRole('link', { name: 'Metrô de São Paulo' }) as HTMLAnchorElement).href).toBe('https://www.metro.sp.gov.br/');
        fireEvent.change(screen.getByLabelText('Buscar fornecedor'), { target: { value: 'sodexo' } });
        expect(screen.getAllByRole('link').map(a => a.textContent)).toEqual(['Pluxee']);
        await waitFor(() => expect((screen.getByRole('button', { name: 'Contratar' }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: 'Contratar' }));
        fireEvent.change(screen.getByLabelText('Dia do pedido de Pluxee'), { target: { value: '25' } });
        fireEvent.change(screen.getByLabelText('Produto de Pluxee'), { target: { value: 'VR' } });
        expect(screen.getByText(/próximo pedido/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Gravar' }));
        await waitFor(() => expect(srv.gravados).toHaveLength(1));
        expect(srv.gravados[0]).toEqual([expect.objectContaining({ fornecedorId: 'pluxee', diaPedido: '25', produto: 'VR' })]);
        expect(screen.getByRole('status').textContent).toMatch(/gravados/);
    });
});
