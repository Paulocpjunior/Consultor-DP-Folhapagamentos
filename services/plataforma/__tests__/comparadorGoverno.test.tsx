// @vitest-environment jsdom
// Comparador CFI × plataforma do governo (Configurações › Serviços externos): só leitura, só admin/gestor, diff sem
// campos voláteis, mesmo token nos dois hosts. Dados fictícios: CNPJ 11.222.333/0001-81.
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/tokenCfi', () => ({
    tokenParaCfi: async () => 'tok-teste',
    comTokenCfi: (f: (t: string) => Promise<unknown>) => f('tok-teste'),
    erroCfi: (m: string, status: number) => Object.assign(new Error(m), { status }),
}));

import ServicosExternosPanel from '../../../components/plataforma/ServicosExternosPanel';
import { EmpresaAtivaProvider } from '../../empresaAtiva/empresaAtivaContext';
import { CONSULTAS_COBRADAS, ROTAS_COMPARADAS, compararRota, diffNegocio, hostDaPlataforma } from '../comparadorGoverno';
import { HOST_CFI_INTEGRACAO } from '../servicos';

const ATIVA = { id: 'emp-1', nome: 'EMPRESA TESTE LTDA', cnpj: '11.222.333/0001-81', codigoSage: '1', competencia: '2026-09', ativadaPor: 'u', ativadaEm: 0 };
const PLATAFORMA = 'https://plataforma.exemplo.com.br';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('diff dos campos de negócio', () => {
    it('ignora carimbos de hora, ids de requisição e diagnóstico (em qualquer nível)', () => {
        const cfi = { ok: true, situacao: 'TRANSMITIDA', consultadoEm: '2026-10-13T10:00:00Z', requestId: 'a1', diagnostico: { ms: 120 }, _debug: 'x', itens: [{ valor: 10, conferidoEm: '2026-10-12' }] };
        const plat = { ok: true, situacao: 'TRANSMITIDA', consultadoEm: '2026-10-13T10:00:05Z', requestId: 'b2', diagnostico: { ms: 80, host: 'p' }, itens: [{ valor: 10, conferidoEm: '2026-10-13', traceId: 't' }] };
        expect(diffNegocio(cfi, plat)).toEqual([]);
    });
    it('aponta a diferença de negócio, campo ausente de um lado e item a mais na lista', () => {
        const cfi = { ok: true, debitos: [{ codReceita: '108201', valor: 810 }], fonte: 'serpro' };
        const plat = { ok: true, debitos: [{ codReceita: '108201', valor: 800 }, { codReceita: '113801', valor: 2050 }], fonte: 'serpro', avisos: ['x'] };
        expect(diffNegocio(cfi, plat)).toEqual([
            { caminho: 'avisos[0]', cfi: undefined, plataforma: 'x' },
            { caminho: 'debitos[0].valor', cfi: 810, plataforma: 800 },
            { caminho: 'debitos[1].codReceita', cfi: undefined, plataforma: '113801' },
            { caminho: 'debitos[1].valor', cfi: undefined, plataforma: 2050 },
        ]);
        expect(diffNegocio(null, { ok: false })).toEqual([{ caminho: '(resposta)', cfi: null, plataforma: undefined }, { caminho: 'ok', cfi: undefined, plataforma: false }]);
    });
});

describe('só leitura', () => {
    it('a lista é fechada em rotas de leitura e qualquer outra é recusada sem chamar ninguém', async () => {
        expect(ROTAS_COMPARADAS.map(r => r.rota)).toEqual(['/dctfweb/status', '/dctfweb/debitos', '/pagamentos/situacao-darf']);
        expect(CONSULTAS_COBRADAS).toBe(4);
        const f = vi.fn();
        for (const rota of ['/dctfweb/darf', '/dctfweb/transmitir', '/esocial/envio/lote', '/esocial/download/identificadores', '/esocial/download/eventos', '/pagamentos/comprovante', '/pagamentos/consultar']) {
            await expect(compararRota(rota, { empresaId: 'emp-1', cnpj: '11222333000181', competencia: '2026-09' }, { cfi: HOST_CFI_INTEGRACAO, plataforma: PLATAFORMA }, 't', f as never)).rejects.toThrow(/só leitura/);
        }
        expect(f).not.toHaveBeenCalled();
    });
    it('endereço da plataforma: o do build vence; colado só https e nunca o próprio CFI', () => {
        expect(hostDaPlataforma('', { VITE_SERVICO_GOVERNO_URL: 'https://gov.exemplo.com.br/' })).toEqual({ url: 'https://gov.exemplo.com.br', doBuild: true });
        expect(hostDaPlataforma('', {})).toEqual({ url: null, doBuild: false });
        expect(hostDaPlataforma('http://plataforma.exemplo.com.br', {}).url).toBeNull();
        expect(hostDaPlataforma('http://plataforma.exemplo.com.br', {}).aviso).toMatch(/não é https/);
        expect(hostDaPlataforma(HOST_CFI_INTEGRACAO, {})).toEqual({ url: null, doBuild: false, aviso: 'Este é o endereço do próprio CFI.' });
        expect(hostDaPlataforma(`${PLATAFORMA}/`, {})).toEqual({ url: PLATAFORMA, doBuild: false });
    });
});

describe('na tela', () => {
    const tela = (papel?: string) => render(<EmpresaAtivaProvider ativa={ATIVA} trocar={() => {}}><ServicosExternosPanel papel={papel} /></EmpresaAtivaProvider>);

    it.each([['colaborador'], ['pendente'], [undefined]])('escondido para %s', (papel) => {
        tela(papel);
        expect(screen.queryByText('Comparar CFI × plataforma (governo)')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Comparar' })).toBeNull();
    });

    it.each([['admin'], ['gestor']])('visível para %s, desabilitado sem endereço da plataforma e sem o aviso de custo aceito', (papel) => {
        tela(papel);
        expect(screen.getByText('Comparar CFI × plataforma (governo)')).toBeTruthy();
        const botao = screen.getByRole('button', { name: 'Comparar' }) as HTMLButtonElement;
        fireEvent.click(screen.getByLabelText(/Entendi o custo/));
        expect(botao.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Endereço da plataforma'), { target: { value: 'http://plataforma.exemplo.com.br' } });
        expect(screen.getByText(/não é https/)).toBeTruthy();
        expect(botao.disabled).toBe(true);
        expect(screen.getByRole('note').textContent).toMatch(/cobrada.*2× por item.*4 consultas/);
    });

    it('compara as rotas de leitura nos dois hosts com o mesmo token, mostra o diff e não grava nada', async () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem');
        const pedidos: { url: string; auth: string; corpo: Record<string, unknown> }[] = [];
        vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
            pedidos.push({ url, auth: (init.headers as Record<string, string>).Authorization, corpo: JSON.parse(String(init.body)) });
            const plat = url.startsWith(PLATAFORMA);
            if (url.endsWith('/dctfweb/status')) return new Response(JSON.stringify({ ok: true, entregue: true, situacao: 'TRANSMITIDA', dataEntrega: null, consultadoEm: plat ? 'b' : 'a' }), { status: 200 });
            if (url.endsWith('/dctfweb/debitos')) return new Response(JSON.stringify({ ok: true, fonte: 'serpro', debitos: [{ codReceita: '108201', valor: plat ? 800 : 810 }] }), { status: 200 });
            return plat ? new Response(JSON.stringify({ error: 'empresaId obrigatório' }), { status: 400 }) : new Response(JSON.stringify({ ok: true, situacoes: [] }), { status: 200 });
        }));
        tela('gestor');
        fireEvent.change(screen.getByLabelText('Endereço da plataforma'), { target: { value: PLATAFORMA } });
        const botao = screen.getByRole('button', { name: 'Comparar' }) as HTMLButtonElement;
        expect(botao.disabled).toBe(true);
        fireEvent.click(screen.getByLabelText(/Entendi o custo/));
        expect(botao.disabled).toBe(false);
        fireEvent.click(botao);
        await screen.findByText('iguais');
        // Três rotas de leitura × dois hosts, com o mesmo token e a empresa ativa no corpo.
        expect(pedidos.map(p => p.url).sort()).toEqual([
            `${HOST_CFI_INTEGRACAO}/api/dp-integration/dctfweb/debitos`, `${HOST_CFI_INTEGRACAO}/api/dp-integration/dctfweb/status`, `${HOST_CFI_INTEGRACAO}/api/dp-integration/pagamentos/situacao-darf`,
            `${PLATAFORMA}/api/dp-integration/dctfweb/debitos`, `${PLATAFORMA}/api/dp-integration/dctfweb/status`, `${PLATAFORMA}/api/dp-integration/pagamentos/situacao-darf`,
        ]);
        expect(pedidos.every(p => p.auth === 'Bearer tok-teste')).toBe(true);
        expect(pedidos.find(p => p.url.endsWith('/dctfweb/status'))!.corpo).toEqual({ empresaId: 'emp-1', cnpj: '11222333000181', competencia: '2026-09' });
        expect(pedidos.find(p => p.url.endsWith('/situacao-darf'))!.corpo).toEqual({ empresaId: 'emp-1', cnpj: '11222333000181' });
        expect(pedidos.some(p => /dctfweb\/darf$|transmitir|envio|download|comprovante|pagamentos\/consultar/.test(p.url))).toBe(false);
        // Lado a lado: status igual (o carimbo não conta), débito diferente, situação com HTTP diferente.
        const linha = (rota: string) => within(document.querySelector(`tr[data-rota="${rota}"]`) as HTMLElement);
        expect(linha('/dctfweb/status').getByText('iguais')).toBeTruthy();
        expect(linha('/dctfweb/debitos').getByText('debitos[0].valor')).toBeTruthy();
        expect(linha('/pagamentos/situacao-darf').getByText(/HTTP 400 · ok — · empresaId obrigatório/)).toBeTruthy();
        expect(linha('/pagamentos/situacao-darf').getByText(/HTTP 200 · ok true/)).toBeTruthy();
        // O aviso de custo vale para uma rodada; nada foi gravado no navegador.
        await waitFor(() => expect((screen.getByLabelText(/Entendi o custo/) as HTMLInputElement).checked).toBe(false));
        expect(setItem).not.toHaveBeenCalled();
    });
});
