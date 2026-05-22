// scripts/seed-empresa-educati.mjs
//
// Cadastra a empresa 0162 — EDUCATI no Firestore e grava o mapeamento
// default em folha_mapeamentos/<CNPJ>. Também garante que o evento
// 1010 DSR exista no catálogo IOB SAGE.
//
// IDEMPOTENTE: rodar várias vezes mantém o estado final igual.
//   - Empresa: cria se não existir; atualiza campos se já existir.
//   - Mapeamento: cria com regra_salario:null se não existir; preserva
//     ajustes manuais da contadora se já existir (não sobrescreve).
//   - Evento 1010: adiciona ao catálogo se não existir; não toca se já existir.
//
// Pré-requisitos:
//   1. service-account.json na raiz do projeto (chave de Service Account
//      do Firebase Admin com permissão de escrita em Firestore).
//   2. npm install (firebase-admin já está em devDependencies).
//
// Uso:
//   cd ~/Consultor-DP-Folhapagamentos
//   node seed-empresa-educati.mjs

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ─── Dados da EDUCATI (mantidos em sync com mapeamentoEducatiDefault.ts) ──
const CNPJ          = '07067084000120';
const CODIGO_SAGE   = '0162';
const RAZAO_SOCIAL  = 'EDUCATI';
const NOME_FANTASIA = 'EDUCATI';

const EVENTOS_EDUCATI = [
    { codigo: '0033', descricao: 'HORA AULA' },
    { codigo: '0820', descricao: 'HORA EXTRA 100%' },
    { codigo: '1010', descricao: 'DSR' },
    { codigo: '1080', descricao: 'D.S.R. S/ HORAS EXTRAS' },
    { codigo: '1490', descricao: 'HORA ATIVIDADE' },
    { codigo: '8920', descricao: 'FALTAS (VALOR)' },
];

// Tabela de valor-hora-aula por matrícula (R$/hora).
// Mantenha sincronizada com EDUCATI_VALORES_HORA_AULA em
// services/folha/mapeamentoEducatiDefault.ts.
const VALORES_HORA_AULA = {
    '000046': 33.95, // Eduardo Fernando do Nascimento Batata
    '000049': 33.95, // Paulo dos Santos
    '000052': 33.95, // Célia Cristina Pereira da Silva
    '000055': 33.95, // Flavio Lotto
    '000075': 34.35, // Gislene do Carmo Lima
    '000076': 34.35, // Euclides Contrucci de Oliveira
    '000077': 34.35, // Bruna Michelle Nogueira da Silva
};

const EVENTO_1010_PADRAO = {
    codigo: '1010',
    descricao: 'DSR',
    tipo: 'V',
    incidencias: { ir: 'S', in: 'S', irf: 'N', inf: 'N', fg: 'S', rt: 'S', vr: 'S' },
    rv: 'V',
    coeficiente: 1,
    ro: '060',
};

// ─── Inicialização Firebase Admin ─────────────────────────────────────────
const saPath = resolve(ROOT, 'service-account.json');
let sa;
try {
    sa = JSON.parse(readFileSync(saPath, 'utf8'));
} catch (e) {
    console.error(
        `\n❌  service-account.json não encontrado em ${saPath}\n` +
        `    Baixe a chave da Service Account do Firebase Console:\n` +
        `    https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk\n`
    );
    process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

console.log('\n🌱  Seed EDUCATI (SAGE 0162) — iniciando…\n');

// ─── 1) Garantir evento 1010 DSR no catálogo IOB SAGE ─────────────────────
{
    const ref = db.collection('folha_catalogo').doc('iob_sage');
    const snap = await ref.get();
    if (!snap.exists) {
        console.log('⚠️   folha_catalogo/iob_sage NÃO existe no Firestore.');
        console.log('     Importe o catálogo pela UI antes (Catálogo de Eventos → Importar).');
        console.log('     Pulando esta etapa.\n');
    } else {
        const cat = snap.data();
        const eventos = Array.isArray(cat.eventos) ? cat.eventos : [];
        const existe = eventos.some((e) => e.codigo === '1010');
        if (existe) {
            console.log('✓   Evento 1010 DSR já existe no catálogo. Sem ação.');
        } else {
            eventos.push(EVENTO_1010_PADRAO);
            eventos.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo)));
            await ref.update({
                eventos,
                total_eventos: eventos.length,
                total_vencimentos: eventos.filter((e) => e.tipo === 'V').length,
                total_descontos: eventos.filter((e) => e.tipo === 'D').length,
            });
            console.log('✓   Evento 1010 DSR adicionado ao catálogo (tipo V, rv V, ro 060).');
        }
    }
}

// ─── 2) Garantir empresa 0162 EDUCATI cadastrada ──────────────────────────
let empresaId;
{
    const col = db.collection('empresas');
    const ja = await col.where('cnpj', '==', CNPJ).limit(1).get();
    if (!ja.empty) {
        empresaId = ja.docs[0].id;
        const d = ja.docs[0].data();
        console.log(`✓   Empresa já cadastrada (id=${empresaId}, SAGE ${d.codigoSage}).`);
        // Atualiza campos canônicos se divergirem (sem mexer em criadoPor)
        const patch = {};
        if (d.codigoSage !== CODIGO_SAGE) patch.codigoSage = CODIGO_SAGE;
        if (d.razaoSocial !== RAZAO_SOCIAL) patch.razaoSocial = RAZAO_SOCIAL;
        if (d.nomeFantasia !== NOME_FANTASIA) patch.nomeFantasia = NOME_FANTASIA;
        if (Object.keys(patch).length > 0) {
            patch.atualizadoEm = admin.firestore.FieldValue.serverTimestamp();
            await col.doc(empresaId).update(patch);
            console.log(`    └─ ajustes aplicados: ${Object.keys(patch).filter(k => k !== 'atualizadoEm').join(', ')}`);
        }
    } else {
        const ref = await col.add({
            cnpj: CNPJ,
            razaoSocial: RAZAO_SOCIAL,
            nomeFantasia: NOME_FANTASIA,
            codigoSage: CODIGO_SAGE,
            criadoPor: 'seed-empresa-educati',
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
        empresaId = ref.id;
        console.log(`✓   Empresa cadastrada (id=${empresaId}).`);
    }
}

// ─── 3) Garantir mapeamento default em folha_mapeamentos/<CNPJ> ───────────
{
    const ref = db.collection('folha_mapeamentos').doc(CNPJ);
    const snap = await ref.get();
    if (snap.exists) {
        console.log('✓   Mapeamento folha_mapeamentos/' + CNPJ + ' já existe.');
        // Garante apenas que regra_salario esteja explicitamente null
        // (para evitar a migração silenciosa em getMapeamento reaplicar default)
        // e que a tabela valoresHoraAula esteja sincronizada com o código.
        const d = snap.data();
        const patch = {};
        if (d.regra_salario !== null) patch.regra_salario = null;
        if (JSON.stringify(d.valoresHoraAula ?? {}) !== JSON.stringify(VALORES_HORA_AULA)) {
            patch.valoresHoraAula = VALORES_HORA_AULA;
        }
        if (Object.keys(patch).length > 0) {
            patch.observacoes = admin.firestore.FieldValue.arrayUnion(
                `[${new Date().toISOString()}] seed-empresa-educati: ` +
                `ajustes aplicados: ${Object.keys(patch).join(', ')}.`,
            );
            await ref.update(patch);
            console.log('    └─ ajustes aplicados:', Object.keys(patch).filter(k => k !== 'observacoes').join(', '));
        }
    } else {
        const mapa = {
            $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
            cliente: CNPJ,
            empresa_base: CODIGO_SAGE,
            competencia_default: '',
            observacoes: [
                `Seed inicial em ${new Date().toISOString()} — script seed-empresa-educati.mjs.`,
                'Layout: Template Padrão IOB SAGE (long, 1 linha = 1 lançamento).',
                'Reconhecido automaticamente pelo templatePadraoDetector v2.1.0.',
                'Aba de dados: "Lançamentos" — cabeçalho na linha 4.',
                'Competência atualizada a cada upload (lida da célula A2 do XLSX).',
                'SAGE calcula salário automaticamente — regra_salario desativada.',
            ],
            empresas: {
                EDUCATI: { codigo_sage: CODIGO_SAGE, ativa: true },
            },
            mapeamento_colunas: {},
            regras_descontos_empresa: {
                coluna: '',
                campo_obs: '',
                evento_padrao: { evento: '', descricao_evento: '', tipo: 'D', rv: 'V' },
                regras: [],
            },
            regra_salario: null,
            valoresHoraAula: VALORES_HORA_AULA,
            matriculas: {
                // Chave = nome da aba que o parser detecta.
                Lançamentos: {},
            },
        };
        await ref.set(mapa);
        console.log('✓   Mapeamento folha_mapeamentos/' + CNPJ + ' criado.');
    }
}

console.log('\n📋  Eventos esperados no apontamento EDUCATI:');
for (const ev of EVENTOS_EDUCATI) {
    console.log(`    ${ev.codigo}  ${ev.descricao}`);
}

console.log('\n💰  Tabela de valor-hora-aula (R$/hora):');
for (const [matricula, valor] of Object.entries(VALORES_HORA_AULA)) {
    console.log(`    ${matricula}  R$ ${valor.toFixed(2).replace('.', ',')}`);
}
console.log('    (Aplicada ao evento 0033 HORA AULA — converte horas → R$.)');

console.log('\n✅  Seed EDUCATI concluído.');
console.log('    Próximos passos:');
console.log('    1. Acessar Folha → Apontamento, selecionar EDUCATI (SAGE 0162).');
console.log('    2. Subir o XLSX 0162__EDUCATI.xlsx — Template Padrão será detectado.');
console.log('    3. Conferir lançamentos e exportar TXT para IOB SAGE.\n');

process.exit(0);
