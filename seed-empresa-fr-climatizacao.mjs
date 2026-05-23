// seed-empresa-fr-climatizacao.mjs
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

const CNPJ = '08836321000132', SAGE = '0813';
const RAZAO = 'FR CLIMATIZACAO EIRELI LTDA', FANTASIA = 'FR CLIMATIZAÇÃO';

const regra = (evento, descricao, tipo, rv) => ({ evento, descricao_evento: descricao, tipo, rv, ignorar_se_zero: true });
const MAPA = {
    $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
    cliente: CNPJ, empresa_base: SAGE, competencia_default: '',
    observacoes: ['Layout WIDE com header 2 linhas + centros de custo. HE em Excel time.'],
    empresas: { [FANTASIA]: { codigo_sage: SAGE, ativa: true } },
    mapeamento_colunas: {
        'FALTAS DIAS':           regra('5650', 'FALTAS (DIAS)',           'D', 'R'),
        'DESCONTO DSR (DIAS)':   regra('5651', 'DESCONTO DSR',           'D', 'R'),
        'VALES':                 regra('5610', 'ADIANTAMENTO (VALE)',     'D', 'V'),
        'DEVOLUCAO TRANSPORTE':  regra('5790', 'DEVOLUCAO TRANSPORTE',   'D', 'V'),
        'DEVOLUCAO REFEICAO':    regra('5792', 'DEVOLUCAO VR',           'D', 'V'),
        'ANTECIPACAO':           regra('5610', 'ADIANTAMENTO (VALE)',     'D', 'V'),
        'HE 100%':               { ...regra('0820', 'HORA EXTRA 100%',        'V', 'R'), excelTime: true },
        'HE 60%':                { ...regra('0811', 'HORA EXTRA 60%',         'V', 'R'), excelTime: true },
        'Adicional Noturno 20%': { ...regra('0211', 'ADICIONAL NOTURNO 25%',  'V', 'R'), excelTime: true },
        'Hora Extra Noturna 80%': { ...regra('0825', 'HE NOTURNA 80%',       'V', 'R'), excelTime: true },
        'REEMBOLSO':             regra('0150', 'REEMBOLSO',              'V', 'V'),
        'BONIFICACAO':           regra('0034', 'PREMIO VALOR',           'V', 'V'),
        'DIF DISSIDIO':          regra('0170', 'DIF DISSIDIO',           'V', 'V'),
    },
    regra_salario: null, matriculas: {},
};

console.log('\n🌱  Seed FR Climatização (SAGE 0813) — iniciando…\n');

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
📋  Colunas mapeadas (13):
    FALTAS DIAS           → 5650  (D, R)
    DESCONTO DSR (DIAS)   → 5651  (D, R)
    VALES                 → 5610  (D, V)
    DEVOLUCAO TRANSPORTE  → 5790  (D, V)
    DEVOLUCAO REFEICAO    → 5792  (D, V)
    ANTECIPACAO           → 5610  (D, V)
    HE 100%               → 0820  (V, R)  — Excel time → horas
    HE 60%                → 0811  (V, R)  — Excel time → horas
    Adicional Noturno 20% → 0211  (V, R)  — Excel time → horas
    Hora Extra Noturna 80%→ 0825  (V, R)  — Excel time → horas
    REEMBOLSO             → 0150  (V, V)
    BONIFICACAO           → 0034  (V, V)
    DIF DISSIDIO          → 0170  (V, V)

⚠️  Não mapeadas: FALTAS HORAS (texto), CONTRIBUICAO ASSISTENCIAL ("1 por cento"), DIA DO COMERCIARIO, OBSERVACAO.
✅  Seed concluído.
`);
