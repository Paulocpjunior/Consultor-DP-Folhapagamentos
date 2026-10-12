// @vitest-environment jsdom
// Aviso de atualização em popup, com a lista do que mudou.
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { mesmoBuild, novidadesDesde, type Novidade, type RemoteVersion } from '../updateService';

const NOVIDADES: Novidade[] = [
    { build: 'ccc3333', data: '2026-10-06', titulo: 'Ficha pelo eSocial que o IOB transmitiu', itens: ['Importar do eSocial aceita o .backup'] },
    { build: 'bbb2222', data: '2026-10-05', titulo: 'Busca de empresa na carteira toda', itens: [] },
    { build: 'aaa1111', data: '2026-10-04', titulo: 'Boas-vindas antes do portão', itens: [] },
];

describe('o que mudou desde a versão aberta', () => {
    it('lista as mais novas até a build aberta; sem ela, as mais recentes', () => {
        expect(novidadesDesde(NOVIDADES, 'bbb2222').itens.map(n => n.build)).toEqual(['ccc3333']);
        expect(novidadesDesde(NOVIDADES, 'aaa1111abc').itens.map(n => n.build)).toEqual(['ccc3333', 'bbb2222']);
        expect(novidadesDesde(NOVIDADES, 'zzz', 2)).toEqual({ itens: NOVIDADES.slice(0, 2), mais: 1 });
        expect(novidadesDesde(undefined, 'x')).toEqual({ itens: [], mais: 0 });
        expect(mesmoBuild('abc1234', 'abc12345')).toBe(true);
        expect(mesmoBuild('', 'abc')).toBe(false);
    });
});

const svc = vi.hoisted(() => ({
    listener: null as ((r: RemoteVersion) => void) | null,
    remotoAtual: null as RemoteVersion | null,
    reload: vi.fn(async () => undefined),
}));
vi.mock('../updateService', async (orig) => {
    const real = await orig<typeof import('../updateService')>();
    return {
        ...real,
        APP_INFO: { version: '2.4.0', build: 'aaa1111', release: '20261004-001', builtAt: '' },
        subscribeUpdates: (fn: (r: RemoteVersion) => void) => { svc.listener = fn; return () => { svc.listener = null; }; },
        fetchRemoteVersion: async () => svc.remotoAtual,
        reloadForUpdate: svc.reload,
    };
});
import UpdateBanner from '../../components/UpdateBanner';

const REMOTO: RemoteVersion = { version: '2.4.0', build: 'ccc3333', release: '20261006-002', builtAt: '', novidades: NOVIDADES };

describe('popup de atualização', () => {
    beforeEach(() => { localStorage.clear(); svc.remotoAtual = null; svc.reload.mockClear(); localStorage.setItem('spc_update_ultima_build_vista', 'aaa1111'); });
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('nova versão abre popup com o que mudou e atualiza', async () => {
        render(<UpdateBanner />);
        expect(screen.queryByRole('alertdialog')).toBeNull();
        act(() => svc.listener!(REMOTO));
        const d = screen.getByRole('alertdialog', { name: 'Nova versão do Consultor DP' });
        expect(d.textContent).toContain('Ficha pelo eSocial que o IOB transmitiu');
        expect(d.textContent).toContain('Importar do eSocial aceita o .backup');
        expect(d.textContent).toContain('Busca de empresa na carteira toda');
        expect(d.textContent).not.toContain('Boas-vindas antes do portão');
        expect(document.activeElement?.textContent).toBe('Atualizar agora');
        fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }));
        expect(svc.reload).toHaveBeenCalled();
    });

    it('"Depois" só adia: fica a faixa no topo e o popup volta em 10 minutos', () => {
        vi.useFakeTimers();
        render(<UpdateBanner />);
        act(() => svc.listener!(REMOTO));
        fireEvent.click(screen.getByRole('button', { name: /Depois/ }));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(screen.getByRole('status').textContent).toContain('Nova versão esperando');
        act(() => { vi.advanceTimersByTime(10 * 60_000); });
        expect(screen.getByRole('alertdialog')).toBeTruthy();
        // Recarregou a página no meio do adiamento: continua a faixa, não o popup.
        cleanup();
        vi.setSystemTime(Date.now() - 60_000);
        render(<UpdateBanner />);
        act(() => svc.listener!(REMOTO));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(screen.getByRole('status')).toBeTruthy();
    });

    it('depois de atualizar mostra "Sistema atualizado" com o que mudou desde a última versão vista', async () => {
        localStorage.setItem('spc_update_ultima_build_vista', 'zzz0000');
        svc.remotoAtual = { ...REMOTO, build: 'aaa1111' };
        render(<UpdateBanner />);
        const d = await screen.findByRole('alertdialog', { name: 'Sistema atualizado' });
        expect(d.textContent).toContain('Boas-vindas antes do portão');
        expect(localStorage.getItem('spc_update_ultima_build_vista')).toBe('aaa1111');
        fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
        expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('primeiro acesso no navegador não mostra nada', async () => {
        localStorage.clear();
        svc.remotoAtual = { ...REMOTO, build: 'aaa1111' };
        render(<UpdateBanner />);
        await act(async () => { await Promise.resolve(); });
        expect(screen.queryByRole('alertdialog')).toBeNull();
        expect(localStorage.getItem('spc_update_ultima_build_vista')).toBe('aaa1111');
    });
});

describe('novidades pelo botão da versão (cabeçalho)', () => {
    beforeEach(() => { localStorage.clear(); svc.remotoAtual = null; localStorage.setItem('spc_update_ultima_build_vista', 'aaa1111'); });
    afterEach(() => cleanup());

    it('abre a lista das últimas novidades publicadas e fecha', async () => {
        const { abrirNovidades } = await import('../updateService');
        svc.remotoAtual = { ...REMOTO, build: 'aaa1111' };
        render(<UpdateBanner />);
        await act(async () => { abrirNovidades(); });
        const d = await screen.findByRole('dialog', { name: 'Novidades do Consultor DP' });
        expect(d.textContent).toContain('Versão 2.4.0');
        expect(d.textContent).toContain('Ficha pelo eSocial que o IOB transmitiu');
        expect(d.textContent).toContain('Boas-vindas antes do portão');
        fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('sem o version.json, avisa que não carregou (não mostra lista vazia como se nada tivesse mudado)', async () => {
        const { abrirNovidades } = await import('../updateService');
        render(<UpdateBanner />);
        await act(async () => { abrirNovidades(); });
        expect((await screen.findByRole('dialog')).textContent).toContain('Não foi possível carregar a lista de novidades');
    });

    it('com versão nova esperando, o botão abre o aviso dela', async () => {
        const { abrirNovidades } = await import('../updateService');
        render(<UpdateBanner />);
        act(() => svc.listener!(REMOTO));
        fireEvent.click(screen.getByRole('button', { name: /Depois/ }));
        expect(screen.queryByRole('alertdialog')).toBeNull();
        await act(async () => { abrirNovidades(); });
        expect(screen.getByRole('alertdialog', { name: 'Nova versão do Consultor DP' })).toBeTruthy();
    });

    it('data da versão no fuso de Brasília; sem builtAt, pela release', async () => {
        const { dataDaVersao } = await import('../updateService');
        expect(dataDaVersao('2026-10-12T21:40:00Z', '')).toBe('12/10/2026 18:40');
        expect(dataDaVersao('', '20261012-007')).toBe('12/10/2026');
        expect(dataDaVersao('', '')).toBe('');
    });
});
