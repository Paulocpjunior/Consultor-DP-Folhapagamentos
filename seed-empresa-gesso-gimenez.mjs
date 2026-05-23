// seed-empresa-gesso-gimenez.mjs
import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const saPath = resolve(__dirname, 'service-account.json');
const serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}
const db = admin.firestore();

const CNPJ = '59461616000102', SAGE = '0685';
const RAZAO = 'GESSO GIMENEZ', FANTASIA = 'GESSO GIMENEZ';

const MAPA = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: CNPJ, empresa_base: SAGE, competencia_default: '',
    observacoes: ['Grade de presença transposta. Parser conta FALTOU/FERIAS e extrai VALE/VT.'],
    empresas: { [FANTASIA]: { codigo_sage: SAGE, ativa: true } },
    mapeamento_colunas: {
        'FALTAS': { evento: '5650', descricao_evento: 'FALTAS (DIAS)', tipo: 'D', rv: 'R', ignorar_se_zero: true },
        'VALE':   { evento: '5610', descricao_evento: 'ADIANTAMENTO (VALE)', tipo: 'D', rv: 'V', ignorar_se_zero: true },
        'VT':     { evento: '5780', descricao_evento: 'VALE TRANSPORTE', tipo: 'D', rv: 'R', valor_fixo: 1, condicao_celula: { igual_a: ['SIM', 'S'] }, nota: 'ref=1 quando SIM' },
    },
    regra_salario: null, matriculas: {},
};

console.log('\n🌱  Seed Gesso Gimenez (SAGE 0685) — iniciando…\n');

const col = db.collection('empresas');
const ja = await col.where('cnpj', '==', CNPJ).limit(1).get();
if (ja.empty) {
    await col.add({ cnpj: CNPJ, razaoSocial: RAZAO, nomeFantasia: FANTASIA, codigoSage: SAGE, criadoPor: 'seed', criadoEm: admin.firestore.FieldValue.serverTimestamp(), atualizadoEm: admin.firestore.FieldValue.serverTimestamp() });
    console.log('✓ Empresa criada.');
} else { console.log('✓ Empresa já existe.'); }

const ref = db.collection('folha_mapeamentos').doc(CNPJ);
if (!(await ref.get()).exists) { await ref.set(MAPA); console.log('✓ Mapeamento criado.'); }
else { console.log('✓ Mapeamento já existe.'); }

console.log(`
📋  Colunas sintéticas (grade de presença):
    FALTAS (contagem de "FALTOU")  → 5650 FALTAS (DIAS)       (D, R)
    VALE (R$ do rodapé)            → 5610 ADIANTAMENTO (VALE)  (D, V)
    VT (SIM/NAO do rodapé)         → 5780 VALE TRANSPORTE      (D, R) — ref=1

⚠️  7 funcionários (só primeiro nome). Cadastre as matrículas na 1ª vez.
✅  Seed concluído.
`);
