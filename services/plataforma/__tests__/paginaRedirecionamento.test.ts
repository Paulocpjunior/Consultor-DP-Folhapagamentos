// @vitest-environment jsdom
// Página do GitHub Pages que leva ao endereço novo do DP (domínio da SP, Firebase Hosting).
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enderecoNovo, gravarRedirecionamento, htmlRedirecionamento } from '../../../scripts/hosting/paginaRedirecionamento.mjs';
import { aplicarMigracao, lerMigracao } from '../../migracaoEndereco';

describe('redirecionamento do GitHub Pages para o domínio da SP', () => {
    it('só https, sem barra no fim', () => {
        expect(enderecoNovo('https://dp.spassessoriacontabil.com.br/')).toBe('https://dp.spassessoriacontabil.com.br');
        expect(() => enderecoNovo('http://dp.spassessoriacontabil.com.br')).toThrow(/https/);
        expect(() => enderecoNovo('')).toThrow();
    });

    it('leva o caminho depois da base antiga, a busca e o # da tela', () => {
        const html = htmlRedirecionamento('https://dp.spassessoriacontabil.com.br');
        const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
        const ir = (pathname: string, search = '', hash = '') => {
            let destino = '';
            const location = { pathname, search, hash, replace: (u: string) => { destino = u; } };
            new Function('location', script)(location);
            return destino;
        };
        expect(ir('/Consultor-DP-Folhapagamentos/', '', '#/folha')).toBe('https://dp.spassessoriacontabil.com.br/#/folha');
        expect(ir('/Consultor-DP-Folhapagamentos/manuais/implantacao-funcionarios.html', '?x=1')).toBe('https://dp.spassessoriacontabil.com.br/manuais/implantacao-funcionarios.html?x=1');
        expect(ir('/outro')).toBe('https://dp.spassessoriacontabil.com.br/');
        expect(html).toContain('<meta http-equiv="refresh" content="3;url=https://dp.spassessoriacontabil.com.br/">');
    });

    it('troca o conteúdo da pasta pelo index.html e o 404.html', () => {
        const pasta = mkdtempSync(join(tmpdir(), 'dist-'));
        writeFileSync(join(pasta, 'velho.js'), 'x');
        gravarRedirecionamento(pasta, 'https://dp.spassessoriacontabil.com.br');
        expect(readdirSync(pasta).sort()).toEqual(['404.html', 'index.html']);
        expect(readFileSync(join(pasta, '404.html'), 'utf8')).toContain('mudou de endereço');
    });

    it('leva o tema e a empresa ativa do endereço antigo, e o app grava no novo sem sobrescrever', () => {
        const html = htmlRedirecionamento('https://dp.spassessoriacontabil.com.br');
        const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
        localStorage.clear();
        localStorage.setItem('consultor-dp:tema', 'escuro');
        localStorage.setItem('dp_empresa_ativa:uid123', JSON.stringify({ id: 'E1', nome: 'SP Assessoria', competencia: '2026-09' }));
        localStorage.setItem('outra-coisa', 'nao vai');
        let destino = '';
        new Function('location', script)({ pathname: '/Consultor-DP-Folhapagamentos/', search: '?_v=1792241946626', hash: '', replace: (u: string) => { destino = u; } });
        const u = new URL(destino);
        expect(u.origin + u.pathname).toBe('https://dp.spassessoriacontabil.com.br/');
        expect(u.searchParams.get('_v')).toBe('1792241946626');
        const levado = lerMigracao(u.searchParams.get('migrar'));
        expect(levado).toEqual({ 'consultor-dp:tema': 'escuro', 'dp_empresa_ativa:uid123': JSON.stringify({ id: 'E1', nome: 'SP Assessoria', competencia: '2026-09' }) });

        // No endereço novo: grava o que falta, mantém o que já existe e tira o parâmetro da barra.
        localStorage.clear();
        localStorage.setItem('consultor-dp:tema', 'claro');
        let barra = '';
        const n = aplicarMigracao({ location: { href: destino } as Location, history: { state: null, replaceState: (_s: unknown, _t: string, url: string) => { barra = url; } } as unknown as History, localStorage });
        expect(n).toBe(1);
        expect(localStorage.getItem('consultor-dp:tema')).toBe('claro');
        expect(JSON.parse(localStorage.getItem('dp_empresa_ativa:uid123')!).nome).toBe('SP Assessoria');
        expect(barra).toBe('/?_v=1792241946626');
        expect(lerMigracao(btoa(JSON.stringify({ 'chave-estranha': 'x' })))).toEqual({});
        expect(lerMigracao('não é base64')).toEqual({});
    });
});

