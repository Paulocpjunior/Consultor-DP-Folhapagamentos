// scripts/seed-empresa-staff.mjs
//
// Cadastra a empresa 0146 — Staff Digital no Firestore e grava o
// mapeamento default em folha_mapeamentos/<CNPJ>.
//
// IDEMPOTENTE: rodar várias vezes mantém o estado final igual.
//
// Uso:
//   cd ~/Consultor-DP-Folhapagamentos
//   node seed-empresa-staff.mjs

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ─── Dados ───────────────────────────────────────────────────────────────────
const CNPJ          = '06255895000191';
const CODIGO_SAGE   = '0146';
const RAZAO_SOCIAL  = 'STAFF DIGITAL SERVICOS ADMINISTRATIVOS';
const NOME_FANTASIA = 'STAFF DIGITAL';

const regra = (evento, descricao, tipo, rv) => ({
    evento, descricao_evento: descricao, tipo, rv, ignorar_se_zero: true,
});

const MAPEAMENTO = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: CNPJ,
    empresa_base: CODIGO_SAGE,
    competencia_default: '',
    observacoes: [
        'Layout WIDE — 1 linha = 1 funcionário.',
        'Abas mensais: "Jan", "Fev", ..., "Abr26". Selecione a aba correta.',
        'SEM matrículas na planilha — cadastre pelo Wizard na 1ª vez.',
        'Atrasos vem como Excel time (fração de dia) — convertido p/ horas.',
        'OBS: processar manualmente. Colunas 1/0.8/0.6 não mapeadas.',
    ],
    empresas: {
        [NOME_FANTASIA]: { codigo_sage: CODIGO_SAGE, ativa: true },
    },
    mapeamento_colunas: {
        'Atrasos':          regra('5850', 'FALTAS E ATRASOS (T/H)', 'D', 'R'),
        'Faltas':           regra('5650', 'FALTAS (DIAS)',           'D', 'R'),
        'Meta':             regra('0034', 'PREMIO VALOR',            'V', 'V'),
        'VT':               {
            evento: '5780', descricao_evento: 'VALE TRANSPORTE',
            tipo: 'D', rv: 'R',
            valor_fixo: 1,
            condicao_celula: { igual_a: ['SIM', 'S'] },
            nota: 'VT SIM = referência 1; SAGE calcula 6%. Pausado/vazio = ignora.',
        },
        '½ Seguro Vida':  regra('5662', 'SEGURO DE VIDA',         'D', 'V'),
    },
    regras_descontos_empresa: {
        coluna: '', campo_obs: 'OBS:',
        evento_padrao: { evento: '', descricao_evento: '', tipo: 'D', rv: 'V' },
        regras: [],
    },
    regra_salario: null,
    matriculas: {},
};

// ─── Bootstrap Firebase ──────────────────────────────────────────────────────
const saPath = resolve(ROOT, 'service-account.json');
let serviceAccount;
try {
    serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
} catch (e) {
    console.error(`❌  Erro ao ler ${saPath}:`, e.message);
    process.exit(1);
}
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
    });
}
const db = admin.firestore();

console.log('\n🌱  Seed Staff Digital (SAGE 0146) — iniciando…\n');

// ─── 1) Garantir empresa cadastrada ─────────────────────────────────────────
let empresaId;
{
    const col = db.collection('empresas');
    const ja = await col.where('cnpj', '==', CNPJ).limit(1).get();
    if (!ja.empty) {
        empresaId = ja.docs[0].id;
        const d = ja.docs[0].data();
        console.log(`✓   Empresa já cadastrada (id=${empresaId}, SAGE ${d.codigoSage}).`);
        const patch = {};
        if (d.codigoSage !== CODIGO_SAGE) patch.codigoSage = CODIGO_SAGE;
        if (d.razaoSocial !== RAZAO_SOCIAL) patch.razaoSocial = RAZAO_SOCIAL;
        if (d.nomeFantasia !== NOME_FANTASIA) patch.nomeFantasia = NOME_FANTASIA;
        if (Object.keys(patch).length > 0) {
            patch.atualizadoEm = admin.firestore.FieldValue.serverTimestamp();
            await col.doc(empresaId).update(patch);
            console.log(`    └─ ajustes: ${Object.keys(patch).filter(k => k !== 'atualizadoEm').join(', ')}`);
        }
    } else {
        const ref = await col.add({
            cnpj: CNPJ,
            razaoSocial: RAZAO_SOCIAL,
            nomeFantasia: NOME_FANTASIA,
            codigoSage: CODIGO_SAGE,
            criadoPor: 'seed-empresa-staff',
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
        empresaId = ref.id;
        console.log(`✓   Empresa criada (id=${empresaId}, SAGE ${CODIGO_SAGE}).`);
    }
}

// ─── 2) Gravar mapeamento ────────────────────────────────────────────────────
{
    const ref = db.collection('folha_mapeamentos').doc(CNPJ);
    const snap = await ref.get();
    if (snap.exists) {
        console.log('✓   Mapeamento folha_mapeamentos/' + CNPJ + ' já existe. Sem sobrescrever.');
    } else {
        await ref.set(MAPEAMENTO);
        console.log('✓   Mapeamento folha_mapeamentos/' + CNPJ + ' criado.');
    }
}

console.log(`
📋  Colunas mapeadas (5):
    Atrasos              → 5850 FALTAS E ATRASOS (T/H)  (D, R)  — Excel time → horas
    Faltas               → 5650 FALTAS (DIAS)            (D, R)
    Meta                 → 0034 PRÊMIO VALOR             (V, V)
    VT (SIM/NÃO)         → 5780 VALE TRANSPORTE          (D, R)  — ref=1 quando SIM
    1/2 Seguro Vida      → 5662 SEGURO DE VIDA           (D, V)  — R$ ou "NAO"

⚠️  Colunas NÃO mapeadas (processamento manual):
    OBS                  — instruções mistas (férias, gratificações, etc.)
    Vale (SIM/NÃO)       — adiantamento sem valor fixo definido
    1 / 0.8 / 0.6        — fatores de atraso (cálculo interno)
    Folha 13o            — mês referência 13º (informativo)

⚠️  Sem matrículas na planilha. Na 1ª execução, o app vai pedir para
    cadastrar as matrículas de cada funcionário pelo nome.

✅  Seed Staff Digital concluído.
`);
