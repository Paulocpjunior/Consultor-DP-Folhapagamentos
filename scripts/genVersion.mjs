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

// Novidades: os últimos commits do main (sem os de merge), para o aviso de
// atualização listar o que mudou desde a versão que o colaborador tem aberta.
// O título vem sem o "(#NN)" do squash; os itens "- ..." do corpo viram detalhes.
// O deploy faz checkout com histórico (fetch-depth) para isto funcionar.
function novidades(max = 40) {
    const SEP = '\x1e', CAMPO = '\x1f';
    const log = safeExec(`git log -n ${max} --no-merges --format=%h%x1f%cI%x1f%s%x1f%b%x1e HEAD`, '');
    return log.split(SEP).map(r => r.trim()).filter(Boolean).map(r => {
        const [build, data, titulo, corpo = ''] = r.split(CAMPO);
        const itens = [];
        for (const l of corpo.split('\n')) {
            if (/^(co-authored-by|claude-session|signed-off-by):/i.test(l.trim()) || /^https?:\/\//.test(l.trim())) continue;
            const m = l.match(/^\s*[-*]\s+(.*)$/);
            if (m) itens.push(m[1].trim());
            else if (itens.length && /^\s{2,}\S/.test(l)) itens[itens.length - 1] += ' ' + l.trim();
        }
        return { build, data: (data || '').slice(0, 10), titulo: (titulo || '').replace(/\s*\(#\d+\)\s*$/, '').trim(), itens: itens.slice(0, 6) };
    }).filter(n => n.build && n.titulo && !/^merge\b/i.test(n.titulo));
}

const payload = {
    version,
    build: sha,
    release,
    branch,
    builtAt: new Date().toISOString(),
    novidades: novidades(),
};

const outDir = resolve(root, 'public');
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, 'version.json');
writeFileSync(outFile, JSON.stringify(payload, null, 2) + '\n', 'utf8');

console.log(`[genVersion] ${outFile} → v${version} build ${sha} release ${release}`);
