import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../auth/tokenCfi', () => ({
    comTokenCfi: (f: (t: string) => Promise<unknown>) => f('tok'),
    erroCfi: (m: string, status: number) => Object.assign(new Error(m), { status }),
}));

import {
    HOST_CFI, HOST_CFI_INTEGRACAO, PAINEL_MENSAGENS_CFI, configuracaoDoServico, configuracaoDosServicos, enderecoExibido,
    enderecoValido, painelDeMensagens, postarNoServico, servicoDaRota, testarAlcance, urlDoServico,
} from '../servicos';
import { callFiscal } from '../../serpro/serproIntegrationService';

afterEach(() => { vi.unstubAllGlobals(); });

describe('sem configuração: o CFI de sempre', () => {
    it('cada rota vai ao mesmo host de antes', () => {
        expect(urlDoServico('cadastro', '/api/admin/cadastro/empresas', {})).toBe(`${HOST_CFI}/api/admin/cadastro/empresas`);
        expect(urlDoServico('cofre', '/api/admin/cadastro/certificados?cnpjs=1', {})).toBe(`${HOST_CFI}/api/admin/cadastro/certificados?cnpjs=1`);
        expect(urlDoServico('whatsapp', '/api/admin/whatsapp/enviar', {})).toBe(`${HOST_CFI}/api/admin/whatsapp/enviar`);
        expect(urlDoServico('email', '/api/dp-integration/email/enviar', {})).toBe(`${HOST_CFI_INTEGRACAO}/api/dp-integration/email/enviar`);
        expect(urlDoServico('governo', '/api/dp-integration/esocial/envio/lote', {})).toBe(`${HOST_CFI_INTEGRACAO}/api/dp-integration/esocial/envio/lote`);
        expect(configuracaoDosServicos({}).every(c => c.origem === 'cfi' && c.base === null && !c.avisos.length)).toBe(true);
        expect(painelDeMensagens({})).toBe(PAINEL_MENSAGENS_CFI);
    });
    it('variável vazia (vars do GitHub não criada) é o mesmo que não ter', () => {
        expect(configuracaoDoServico('governo', { VITE_PLATAFORMA_URL: '', VITE_SERVICO_GOVERNO_URL: '  ' })).toEqual({ servico: 'governo', origem: 'cfi', base: null, avisos: [] });
    });
});

describe('plataforma comum e serviço próprio', () => {
    const env = { VITE_PLATAFORMA_URL: 'https://plataforma.exemplo.com.br/', VITE_SERVICO_GOVERNO_URL: 'https://gov.exemplo.com.br/dp' };
    it('a plataforma leva todos; o próprio vence a plataforma', () => {
        expect(urlDoServico('cofre', '/api/admin/cadastro/certificados', env)).toBe('https://plataforma.exemplo.com.br/api/admin/cadastro/certificados');
        expect(urlDoServico('ia', '/api/dp-integration/assistente/mia', env)).toBe('https://plataforma.exemplo.com.br/api/dp-integration/assistente/mia');
        expect(urlDoServico('governo', '/api/dp-integration/esocial/envio/lote', env)).toBe('https://gov.exemplo.com.br/dp/api/dp-integration/esocial/envio/lote');
        expect(configuracaoDosServicos(env).map(c => c.origem)).toEqual(['plataforma', 'plataforma', 'proprio', 'plataforma', 'cfi', 'plataforma']);
    });
    it('o WhatsApp não vai para a plataforma: só a variável dele o leva (SP Connect)', () => {
        expect(urlDoServico('whatsapp', '/api/admin/whatsapp/enviar', env)).toBe(`${HOST_CFI}/api/admin/whatsapp/enviar`);
        const sp = { ...env, VITE_SERVICO_WHATSAPP_URL: 'https://app.spassessoriacontabil.com.br' };
        expect(urlDoServico('whatsapp', '/api/admin/whatsapp/enviar', sp)).toBe('https://app.spassessoriacontabil.com.br/api/admin/whatsapp/enviar');
    });
    it('o que a tela mostra', () => {
        expect(enderecoExibido(configuracaoDoServico('governo', env))).toBe('https://gov.exemplo.com.br/dp');
        expect(enderecoExibido(configuracaoDoServico('cofre', {}))).toBe(HOST_CFI);
        expect(enderecoExibido(configuracaoDoServico('ia', {}))).toBe(HOST_CFI_INTEGRACAO);
    });
});

describe('endereço inválido nunca recebe o token', () => {
    it.each([
        ['http://plataforma.exemplo.com.br', 'não é https'],
        ['plataforma.exemplo.com.br', 'não é um endereço'],
        ['https://x.com.br/?a=1', 'parâmetros'],
        ['https://user:senha@x.com.br', 'usuário'],
        ['javascript:alert(1)', 'não é https'],
    ])('%s', (v, motivo) => {
        expect(enderecoValido(v).url).toBeNull();
        const c = configuracaoDoServico('email', { VITE_SERVICO_EMAIL_URL: v });
        expect(c.origem).toBe('cfi');
        expect(c.avisos[0]).toContain('VITE_SERVICO_EMAIL_URL ignorado');
        expect(c.avisos[0]).toContain(motivo);
    });
    it('inválido no próprio cai na plataforma, com aviso', () => {
        const c = configuracaoDoServico('ia', { VITE_SERVICO_IA_URL: 'ftp://x', VITE_PLATAFORMA_URL: 'https://p.com.br' });
        expect(c).toMatchObject({ origem: 'plataforma', base: 'https://p.com.br' });
        expect(c.avisos).toHaveLength(1);
    });
    it('http só no próprio computador (desenvolvimento)', () => {
        expect(enderecoValido('http://localhost:8080/').url).toBe('http://localhost:8080');
        expect(enderecoValido('http://127.0.0.1:5001/proj/us-central1').url).toBe('http://127.0.0.1:5001/proj/us-central1');
    });
    it('painel de mensagens configurável, também só https', () => {
        expect(painelDeMensagens({ VITE_PAINEL_MENSAGENS_URL: 'https://p.com.br/comunicacao' })).toBe('https://p.com.br/comunicacao');
        expect(painelDeMensagens({ VITE_PAINEL_MENSAGENS_URL: 'http://p.com.br' })).toBe(PAINEL_MENSAGENS_CFI);
    });
});

describe('rotas do túnel', () => {
    it('cada trecho tem dono', () => {
        expect(servicoDaRota('/esocial/envio/lote')).toBe('governo');
        expect(servicoDaRota('/empresa-completo')).toBe('governo');
        expect(servicoDaRota('/email/enviar')).toBe('email');
        expect(servicoDaRota('/holerites/extrair')).toBe('ia');
        expect(servicoDaRota('/nova-rota')).toBeNull();
    });
    it('toda chamada do código ao túnel tem serviço (rota nova entra em SERVICO_DA_ROTA)', () => {
        const raiz = join(__dirname, '../../..');
        const arquivos: string[] = [];
        const andar = (d: string) => {
            for (const n of readdirSync(d)) {
                if (['node_modules', 'dist', '.git', '__tests__'].includes(n)) continue;
                const p = join(d, n);
                if (statSync(p).isDirectory()) andar(p); else if (/\.tsx?$/.test(n)) arquivos.push(p);
            }
        };
        andar(join(raiz, 'services')); andar(join(raiz, 'components'));
        const rotas = new Set<string>();
        for (const a of arquivos) for (const m of readFileSync(a, 'utf8').matchAll(/(?:callFiscal|chamar)(?:<[^>(]*(?:\([^)]*\))?[^>]*>)?\('(\/[a-z0-9/-]+)'/g)) rotas.add(m[1]);
        expect(rotas.size).toBeGreaterThanOrEqual(13);
        expect([...rotas].filter(r => !servicoDaRota(r))).toEqual([]);
    });
});

describe('chamadas', () => {
    it('postarNoServico: POST com o token na rota do serviço', async () => {
        const f = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        await expect(postarNoServico('cofre', '/api/x', { a: 1 }, f as unknown as typeof fetch)).resolves.toEqual({ ok: true });
        expect(f).toHaveBeenCalledWith(`${HOST_CFI}/api/x`, expect.objectContaining({ method: 'POST', body: '{"a":1}', headers: expect.objectContaining({ Authorization: 'Bearer tok' }) }));
    });
    it('recusa vira erro com o status', async () => {
        const f = vi.fn(async () => new Response(JSON.stringify({ error: 'Sem certificado' }), { status: 403 }));
        await expect(postarNoServico('governo', '/api/x', {}, f as unknown as typeof fetch)).rejects.toMatchObject({ message: 'Sem certificado', status: 403 });
    });
    it('callFiscal segue no host de integração do CFI', async () => {
        const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response('{"texto":"oi"}', { status: 200 }));
        vi.stubGlobal('fetch', f);
        await callFiscal('/assistente/mia', { m: 1 });
        expect(f.mock.calls[0][0]).toBe(`${HOST_CFI_INTEGRACAO}/api/dp-integration/assistente/mia`);
    });
    it('testarAlcance: responde ou não, sem token', async () => {
        const ok = vi.fn(async () => new Response(null, { status: 200 }));
        expect(await testarAlcance('https://p.com.br', ok as unknown as typeof fetch)).toMatchObject({ ok: true });
        expect(ok).toHaveBeenCalledWith('https://p.com.br', expect.objectContaining({ mode: 'no-cors', method: 'GET' }));
        expect((ok.mock.calls[0] as unknown[])[1]).not.toHaveProperty('headers');
        const falha = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
        expect(await testarAlcance('https://p.com.br', falha as unknown as typeof fetch)).toMatchObject({ ok: false, erro: 'Failed to fetch' });
    });
});
