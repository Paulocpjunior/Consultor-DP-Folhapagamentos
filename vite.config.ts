import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function safeExec(cmd: string, fallback = ''): string {
    try {
        return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
        return fallback;
    }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const APP_VERSION = pkg.version || '0.0.0';
const APP_BUILD = safeExec('git rev-parse --short HEAD', 'dev');
// Mesma fórmula do scripts/genVersion.mjs — mantém consistência.
const today = new Date();
const dateStr =
    today.getUTCFullYear() +
    String(today.getUTCMonth() + 1).padStart(2, '0') +
    String(today.getUTCDate()).padStart(2, '0');
const sinceMidnight =
    today.getUTCFullYear() + '-' +
    String(today.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(today.getUTCDate()).padStart(2, '0') + 'T00:00:00Z';
const todayCommitCount =
    Number(safeExec(`git rev-list --count --since="${sinceMidnight}" HEAD`, '1')) || 1;
const APP_RELEASE = `${dateStr}-${String(todayCommitCount).padStart(3, '0')}`;
const APP_BUILT_AT = new Date().toISOString();

export default defineConfig({
  base: "/Consultor-DP-Folhapagamentos/",
    plugins: [react()],
    define: {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
        __APP_VERSION__: JSON.stringify(APP_VERSION),
        __APP_BUILD__: JSON.stringify(APP_BUILD),
        __APP_RELEASE__: JSON.stringify(APP_RELEASE),
        __APP_BUILT_AT__: JSON.stringify(APP_BUILT_AT),
    },
    server: {
        host: '0.0.0.0',
        port: parseInt(process.env.PORT || '3000'),
        proxy: {
            '/api/gemini': {
                target: 'https://generativelanguage.googleapis.com',
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/api\/gemini/, ''),
                secure: true,
            },
        },
    },
    preview: {
        host: '0.0.0.0',
        port: parseInt(process.env.PORT || '3000'),
    }
});
