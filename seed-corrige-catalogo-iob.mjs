// scripts/seed-corrige-catalogo-iob.mjs
//
// Corrige divergências entre o catálogo IOB SAGE no Firestore e os dados
// oficiais do PDF do IOB SAGE FOLHAMATIC (`data/eventos-iob-sage.json`).
//
// Caso conhecido (descoberto no teste de holerite da Bruna, EDUCATI):
//   - Evento 1490 HORA ATIVIDADE estava como `rv=R` no Firestore.
//   - PDF oficial e JSON local: `rv=V`.
//   - O parser força o rv do catálogo, gerando lançamento `rv=R valor=154,58`
//     que vai pro campo HORAS do TXT — IOB SAGE mostra como REF=154,58
//     (ao invés de VENC=R$ 154,58).
//
// IDEMPOTENTE: rodar várias vezes mantém o estado final igual.
//   - Se evento não existe no Firestore: insere com o registro oficial.
//   - Se existe e diverge: aplica patch e mostra antes/depois.
//   - Se existe e bate: log "já correto, sem ação".
//
// Uso:
//   cd ~/Consultor-DP-Folhapagamentos
//   node seed-corrige-catalogo-iob.mjs

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// Lista de códigos a re-sincronizar com o JSON oficial em data/eventos-iob-sage.json.
// Adicione aqui qualquer evento cujo cadastro no Firestore tenha divergido
// do PDF oficial do IOB SAGE FOLHAMATIC.
const CODIGOS_A_CORRIGIR = ['1490'];

// ─── Bootstrap ────────────────────────────────────────────────────────────
const saPath = resolve(ROOT, 'service-account.json');
let serviceAccount;
try {
    serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
} catch (e) {
    console.error(`❌  Erro ao ler ${saPath}:`, e.message);
    console.error('    Copie a chave da Service Account do Firebase Console.');
    process.exit(1);
}

const jsonOficialPath = resolve(ROOT, 'data', 'eventos-iob-sage.json');
let catalogoOficial;
try {
    catalogoOficial = JSON.parse(readFileSync(jsonOficialPath, 'utf8'));
} catch (e) {
    console.error(`❌  Erro ao ler ${jsonOficialPath}:`, e.message);
    process.exit(1);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
    });
}
const db = admin.firestore();

console.log('\n🌱  Corrige catálogo IOB SAGE no Firestore — iniciando…\n');

const ref = db.collection('folha_catalogo').doc('iob_sage');
const snap = await ref.get();
if (!snap.exists) {
    console.log('⚠️   folha_catalogo/iob_sage NÃO existe no Firestore.');
    console.log('     Importe o catálogo pela UI antes (Catálogo de Eventos → Importar).');
    process.exit(2);
}

const cat = snap.data();
const eventos = Array.isArray(cat.eventos) ? [...cat.eventos] : [];
let mudou = 0;

for (const codigo of CODIGOS_A_CORRIGIR) {
    const oficial = catalogoOficial.eventos.find((e) => e.codigo === codigo);
    if (!oficial) {
        console.log(`⚠️   ${codigo}: não está no JSON oficial. Pulando.`);
        continue;
    }

    const idx = eventos.findIndex((e) => e.codigo === codigo);
    if (idx < 0) {
        eventos.push(oficial);
        eventos.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
        mudou++;
        console.log(`✓   ${codigo} ${oficial.descricao}: INSERIDO (tipo ${oficial.tipo}, rv ${oficial.rv}, ro ${oficial.ro}).`);
        continue;
    }

    const atual = eventos[idx];
    const camposDivergentes = [];
    for (const k of ['descricao', 'tipo', 'rv', 'coeficiente', 'ro']) {
        if (String(atual[k]) !== String(oficial[k])) {
            camposDivergentes.push(`${k}: "${atual[k]}" → "${oficial[k]}"`);
        }
    }

    if (camposDivergentes.length === 0) {
        console.log(`✓   ${codigo} ${oficial.descricao}: já correto, sem ação.`);
        continue;
    }

    eventos[idx] = { ...atual, ...oficial };
    mudou++;
    console.log(`✓   ${codigo} ${oficial.descricao}: ATUALIZADO.`);
    for (const d of camposDivergentes) {
        console.log(`     └─ ${d}`);
    }
}

if (mudou === 0) {
    console.log('\nNada a fazer — catálogo já está sincronizado.\n');
    process.exit(0);
}

await ref.update({
    eventos,
    total_eventos: eventos.length,
    total_vencimentos: eventos.filter((e) => e.tipo === 'V').length,
    total_descontos: eventos.filter((e) => e.tipo === 'D').length,
});

console.log(`\n✅  ${mudou} evento(s) corrigido(s) em folha_catalogo/iob_sage.\n`);
