// @vitest-environment jsdom
// Página do GitHub Pages que leva ao endereço novo do DP (domínio da SP, Firebase Hosting).
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enderecoNovo, gravarRedirecionamento, htmlRedirecionamento } from '../../../scripts/hosting/paginaRedirecionamento.mjs';

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
});
