// scripts/genVersion.mjs
// Gera public/version.json com versão (package.json) + build (git short SHA) +
// release (contador YYYYMMDD-NNN baseado em commits do dia) + timestamp.
//
// Roda no `prebuild` (ver package.json). O arquivo resultante é servido como
// estático em `<base>/version.json` e consultado em runtime pelo updateService
// para detectar quando há nova versão publicada.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function safeExec(cmd, fallback = '') {
    try {
        return execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch {
        return fallback;
    }
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version || '0.0.0';
const sha = safeExec('git rev-parse --short HEAD', 'dev');
const branch = safeExec('git rev-parse --abbrev-ref HEAD', 'main');

// Release: YYYYMMDD-NNN, onde NNN é o nº de commits do dia atual no repo.
const today = new Date();
const yyyy = today.getUTCFullYear();
const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
const dd = String(today.getUTCDate()).padStart(2, '0');
const dateStr = `${yyyy}${mm}${dd}`;
const sinceMidnight = `${yyyy}-${mm}-${dd}T00:00:00Z`;
const todayCommitCount = Number(
    safeExec(`git rev-list --count --since="${sinceMidnight}" HEAD`, '1')
) || 1;
const release = `${dateStr}-${String(todayCommitCount).padStart(3, '0')}`;

const payload = {
    version,
    build: sha,
    release,
    branch,
    builtAt: new Date().toISOString(),
};

const outDir = resolve(root, 'public');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'version.json');
writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`[genVersion] ${outFile} → v${version} build ${sha} release ${release}`);
