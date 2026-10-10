// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Cabecalho from '../../../components/layout/Cabecalho';
import { MENU, menuDoPapel, ondeEsta } from '../menu';

afterEach(cleanup);
const ATIVA = { id: 'e1', nome: 'EMPRESA UM', cnpj: '11222333000181', codigoSage: '1200', competencia: '2026-09', ativadaPor: 'x', ativadaEm: 1 };

describe('menu do app', () => {
    it('em ordem: começa por Empresas, configurações por último; ids únicos', () => {
        expect(MENU.map(g => g.rotulo)).toEqual(['Empresas', 'Cadastros', 'Folha do mês', 'Conferência', 'eSocial', 'Prazos', 'Fim de mês', 'Configurações']);
        expect(MENU[0].itens[0].destino).toEqual({ aba: 'trocar' });
        for (const g of MENU) expect(new Set(g.itens.map(i => i.id)).size).toBe(g.itens.length);
    });

    it('Usuários só para admin', () => {
        expect(menuDoPapel(false).flatMap(g => g.itens).some(i => i.destino.aba === 'admin')).toBe(false);
        expect(menuDoPapel(true).flatMap(g => g.itens).some(i => i.destino.aba === 'admin')).toBe(true);
    });

    it('acha o grupo e o item do destino', () => {
        expect(ondeEsta({ aba: 'calculo', folha: 'ferias' })?.item.rotulo).toBe('Férias');
        expect(ondeEsta({ aba: 'folha', sub: 'eventos' })?.grupo.rotulo).toBe('Cadastros');
        expect(ondeEsta({ aba: 'folha', sub: 'conferencia' })?.grupo.rotulo).toBe('Conferência');
    });
});

describe('cabeçalho', () => {
    const props = () => ({ menu: menuDoPapel(false), destino: { aba: 'calculo', folha: 'mensal' } as const, onNavegar: vi.fn(), ativa: ATIVA, onTrocar: vi.fn(),
        usuario: 'dp@escritorio.com.br', escuro: false, onTema: vi.fn(), onSair: vi.fn() });

    it('mostra a empresa e a competência ativas e troca', () => {
        const p = props();
        render(<Cabecalho {...p} />);
        const ctx = screen.getByLabelText('Empresa e período ativos');
        expect(ctx.textContent).toContain('EMPRESA UM');
        expect(ctx.textContent).toContain('09/2026');
        fireEvent.click(within(ctx).getByTitle('Trocar empresa ou período'));
        expect(p.onTrocar).toHaveBeenCalled();
    });

    it('abre o grupo, navega pelo item e fecha; "Ativar empresa e período" abre a troca', () => {
        const p = props();
        render(<Cabecalho {...p} />);
        fireEvent.click(screen.getByRole('button', { name: /Folha do mês/ }));
        fireEvent.click(within(screen.getByRole('menu', { name: 'Folha do mês' })).getByText('Férias'));
        expect(p.onNavegar).toHaveBeenCalledWith({ aba: 'calculo', folha: 'ferias' });
        expect(screen.queryByRole('menu')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /Empresas/ }));
        fireEvent.click(screen.getByText('Ativar empresa e período'));
        expect(p.onTrocar).toHaveBeenCalled();
    });

    it('item bloqueado mostra o motivo e não navega; Esc fecha', () => {
        const p = props();
        render(<Cabecalho {...p} bloqueados={{ apontamento: 'Nenhuma empresa na sua carteira' }} />);
        fireEvent.click(screen.getByRole('button', { name: /Folha do mês/ }));
        const item = screen.getByText('Apontamento').closest('button')!;
        expect(item.disabled).toBe(true);
        expect(item.textContent).toContain('Nenhuma empresa na sua carteira');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('sem empresa ativa: botão para ativar', () => {
        const p = props();
        render(<Cabecalho {...p} ativa={null} />);
        fireEvent.click(screen.getByText('Ativar empresa e período'));
        expect(p.onTrocar).toHaveBeenCalled();
    });
});
