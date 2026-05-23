// scripts/seed-empresa-betinho.mjs
//
// Cadastra a empresa 0606 — Casa da Criança Betinho no Firestore e grava
// o mapeamento default em folha_mapeamentos/<CNPJ>.
// Também garante que o evento 1041 INSALUBRIDADE exista no catálogo IOB SAGE.
//
// IDEMPOTENTE: rodar várias vezes mantém o estado final igual.
//
// Uso:
//   cd ~/Consultor-DP-Folhapagamentos
//   node seed-empresa-betinho.mjs

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ─── Dados ───────────────────────────────────────────────────────────────────
const CNPJ          = '62827860000173';
const CODIGO_SAGE   = '0606';
const RAZAO_SOCIAL  = 'CASA DA CRIANCA BETINHO LAR ESCOLA';
const NOME_FANTASIA = 'CASA DA CRIANCA BETINHO';

const EVENTO_1041_PADRAO = {
    codigo: '1041',
    descricao: 'INSALUBRIDADE',
    tipo: 'V',
    incidencias: { ir: 'S', in: 'S', irf: 'N', inf: 'N', fg: 'S', rt: 'S', vr: 'S' },
    rv: 'V',
    coeficiente: 1,
    ro: '060',
};

// Mesmo conteúdo exportado de mapeamentoBetinhoDefault.ts
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
        'Aba: "Planilha1". Cabeçalho na linha 5 (R4).',
        'Coluna "Codigo" = matrícula. Coluna "Nome_Completo" = nome.',
        'VT vem como 0,06 (referência). CONT.ASSI mapeado para 5840.',
    ],
    empresas: {
        [NOME_FANTASIA]: { codigo_sage: CODIGO_SAGE, ativa: true },
    },
    campo_matricula: 'Codigo',
    mapeamento_colunas: {
        'Insalub':    regra('1041', 'INSALUBRIDADE',         'V', 'V'),
        'Ad.Not':     regra('1112', 'ADICIONAL NOTURNO 20%', 'V', 'R'),
        'HE70%':      regra('0863', 'HORA EXTRA 70%',        'V', 'R'),
        'Feriado':    regra('0870', 'FERIADO',                'V', 'R'),
        'premio':     regra('1123', 'PREMIO',                 'V', 'V'),
        'Adiant':     regra('5610', 'ADIANTAMENTO (VALE)',    'D', 'V'),
        'Creche':     regra('0256', 'AUXILIO CRECHE',         'V', 'V'),
        'Falta':      regra('5650', 'FALTAS (DIAS)',          'D', 'R'),
        'DSR':        regra('5651', 'DESCONTO DSR',           'D', 'R'),
        'Atraso':     regra('5850', 'FALTAS E ATRASOS (T/H)', 'D', 'R'),
        'Gratif':     regra('1280', 'GRATIFICACAO',           'V', 'V'),
        'CONT.ASSI':  regra('5840', 'CONTRIB. ASSISTENCIAL',  'D', 'V'),
        'Sindic':     regra('5004', 'MENSALIDADE SINDICATO',  'D', 'V'),
        'Consig':     regra('8001', 'EMPRESTIMO CONSIGNADO',  'D', 'V'),
        'VT':         regra('5780', 'VALE TRANSPORTE',        'D', 'R'),
        'VR':         regra('5002', 'VALE REFEICAO',          'D', 'V'),
    },
    regras_descontos_empresa: {
        coluna: '', campo_obs: '',
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

console.log('\n🌱  Seed Casa Betinho (SAGE 0606) — iniciando…\n');

// ─── 1) Garantir evento 1041 INSALUBRIDADE no catálogo ───────────────────────
{
    const ref = db.collection('folha_catalogo').doc('iob_sage');
    const snap = await ref.get();
    if (!snap.exists) {
        console.log('⚠️   folha_catalogo/iob_sage não existe. Pulando.');
    } else {
        const cat = snap.data();
        const eventos = Array.isArray(cat.eventos) ? cat.eventos : [];
        const existe = eventos.some((e) => e.codigo === '1041');
        if (existe) {
            console.log('✓   Evento 1041 INSALUBRIDADE já existe no catálogo.');
        } else {
            eventos.push(EVENTO_1041_PADRAO);
            eventos.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
            await ref.update({
                eventos,
                total_eventos: eventos.length,
                total_vencimentos: eventos.filter((e) => e.tipo === 'V').length,
                total_descontos: eventos.filter((e) => e.tipo === 'D').length,
            });
            console.log('✓   Evento 1041 INSALUBRIDADE adicionado ao catálogo (V, V, ro 060).');
        }
    }
}

// ─── 2) Garantir empresa 0606 cadastrada ──────────────────────────────────────
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
            criadoPor: 'seed-empresa-betinho',
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
        empresaId = ref.id;
        console.log(`✓   Empresa criada (id=${empresaId}, SAGE ${CODIGO_SAGE}).`);
    }
}

// ─── 3) Gravar mapeamento ────────────────────────────────────────────────────
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
📋  Eventos mapeados (16 colunas):
    Insalub                      → 1041 INSALUBRIDADE          (V, V)
    Ad.Not                       → 1112 ADIC. NOTURNO 20%      (V, R)  — horas
    HE70%                        → 0863 HORA EXTRA 70%         (V, R)  — horas
    Feriado                      → 0870 FERIADO                (V, R)
    premio                       → 1123 PREMIO                 (V, V)
    Adiant                       → 5610 ADIANTAMENTO           (D, V)
    Creche                       → 0256 AUXILIO CRECHE         (V, V)
    Falta                        → 5650 FALTAS (DIAS)          (D, R)
    DSR                          → 5651 DESCONTO DSR           (D, R)
    Atraso                       → 5850 ATRASOS                (D, R)
    Gratif                       → 1280 GRATIFICAÇÃO           (V, V)
    CONT.ASSI                    → 5840 CONTRIB. ASSISTENCIAL  (D, V)
    Sindic                       → 5004 SINDICATO              (D, V)
    VT                           → 5780 VALE TRANSPORTE        (D, R)  — ref 0,06
    VR                           → 5002 VALE REFEIÇÃO          (D, V)
    Consig                       → 8001 EMPRÉSTIMO CONSIGNADO  (D, V)

    Matrícula lida da coluna "Codigo" (campo_matricula).

✅  Seed Casa Betinho concluído.
`);
