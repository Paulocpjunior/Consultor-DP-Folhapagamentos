// seed-empresa-waldesa.mjs
//
// Cadastra as empresas do grupo Waldesa no Firestore e grava os
// mapeamentos default em folha_mapeamentos/<CNPJ>:
//   - 0026  WALDESA MOTOMERCANTIL LTDA  (CNPJ 05.049.535/0001-70)
//   - 0027  WALDESA COMÉRCIO            (CNPJ 61.082.673/0001-22)
//
// IDEMPOTENTE: rodar várias vezes mantém o estado final.
//   - Empresa: cria se não existir; atualiza razão/nome/SAGE se divergir.
//   - Mapeamento: cria se não existir; preserva ajustes manuais da
//     contadora se já existir (não sobrescreve mapeamento_colunas).
//
// Pré-requisitos:
//   1. service-account.json na raiz do projeto.
//   2. npm install.
//
// Uso:
//   cd ~/Consultor-DP-Folhapagamentos
//   node seed-empresa-waldesa.mjs

import admin from 'firebase-admin';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ─── Empresas ────────────────────────────────────────────────────────────
const EMPRESAS = [
    {
        cnpj:          '05049535000170',
        codigoSage:    '0026',
        razaoSocial:   'WALDESA MOTOMERCANTIL LTDA',
        nomeFantasia:  'WALDESA MOTOMERCANTIL',
        chaveAba:      'WALDESA MOTOMERCANTIL', // chave em empresas{} do mapeamento
    },
    {
        cnpj:          '61082673000122',
        codigoSage:    '0027',
        razaoSocial:   'WALDESA COMERCIO LTDA',
        nomeFantasia:  'WALDESA COMERCIO',
        chaveAba:      'WALDESA COMERCIO',
    },
];

// Regras compartilhadas
function regra(evento, descricao, tipo, rv, extra = {}) {
    return {
        evento, descricao_evento: descricao, tipo, rv,
        ignorar_se_zero: true, ...extra,
    };
}
const R_CONV_MED  = regra('5001', 'ASSISTENCIA MEDICA',     'D', 'V');
const R_CONV_DEP  = regra('5021', 'CONVENIO DEPENDENTE',    'D', 'V');
const R_COMISSAO  = regra('0770', 'COMISSÃO',               'V', 'V');
const R_DSR_COM   = regra('1220', 'D.S.R. S/ COMISSÕES',    'V', 'V');
const R_PREMIO    = regra('0034', 'PREMIO VALOR',           'V', 'V');
const R_CONT_ASS  = {
    evento: '5840', descricao_evento: 'CONTRIB. ASSISTENCIAL',
    tipo: 'D', rv: 'V',
    valor_fixo: 30.00,
    condicao_celula: { igual_a: ['SIM', 'S'] },
    nota: 'Quando SIM, gera lançamento de R$ 30,00. NÃO/vazio = ignora.',
};
const R_ATRASOS   = regra('5850', 'FALTAS E ATRASOS (T/H)', 'D', 'R');
const R_FALTAS    = regra('5650', 'FALTAS (DIAS)',          'D', 'R');
const R_DSR_FAL   = regra('5651', 'DESCONTO DSR',           'D', 'R');
const R_HE_60     = regra('0811', 'HORA EXTRA 60%',         'V', 'R');
const R_HE_100    = regra('0820', 'HORA EXTRA 100%',        'V', 'R');
const R_AD_NOT    = regra('0211', 'ADICIONAL NOTURNO 25%',  'V', 'R', {
    nota: 'Confirmar com sindicato Waldesa o % (25/30/37). Default 25%.',
});
const R_VT        = {
    evento: '5780', descricao_evento: 'VALE TRANSPORTE',
    tipo: 'D', rv: 'R',
    valor_fixo: 1,
    condicao_celula: { igual_a: ['SIM', 'S'] },
    nota: 'Quando SIM, gera 5780 com referência=1; SAGE calcula 6% do salário.',
};

const MAPEAMENTO_MOTO = {
    mapeamento_colunas: {
        'CONVÊNIO MÉDICO':           R_CONV_MED,
        'CONVÊNIO DEPENDENTE 1':     R_CONV_DEP,
        'CONVÊNIO DEPENDENTE 2':     R_CONV_DEP,
        'CONVÊNIO DEPENDENTE 3':     R_CONV_DEP,
        'COMISSÃO  770':             R_COMISSAO,
        'DSR S/ COMISSÕES 1220':     R_DSR_COM,
        'PRÊMIO':                    R_PREMIO,
        'CONTRIBUIÇÃO ASSISTENCIAL': R_CONT_ASS,
        'ATRASOS  5850':             R_ATRASOS,
        'FALTAS  5650':              R_FALTAS,
        'DSR        5651':           R_DSR_FAL,
        'H. E 60%      811':         R_HE_60,
        'H. E  100%':                R_HE_100,
        'ADICIONAL NOTURNO':         R_AD_NOT,
        'VT':                        R_VT,
    },
    observacao: 'CONTRIBUIÇÃO ASSISTENCIAL (SIM/NÃO) → 5840 R$ 30,00 quando SIM.',
};

const MAPEAMENTO_COM = {
    mapeamento_colunas: {
        'CONVÊNIO MÉDICO':                       R_CONV_MED,
        'CONVÊNIO DEPENDENTE 1':                 R_CONV_DEP,
        'CONVÊNIO DEPENDENTE 2':                 R_CONV_DEP,
        'COMISSÃO 770':                          R_COMISSAO,
        'DSR S/ COMISSÕES 1220':                 R_DSR_COM,
        'PRÊMIO':                                R_PREMIO,
        'DESCONTO DE CONTRIBUIÇÃO ASSISTENCIAL': R_CONT_ASS,
        'ATRASOS  5850':                         R_ATRASOS,
        'FALTAS  5650':                          R_FALTAS,
        'DSR      5651':                         R_DSR_FAL,
        'H. E 60%      811':                     R_HE_60,
        'H. E  100%':                            R_HE_100,
        'ADICIONAL NOTURNO':                     R_AD_NOT,
        'VT':                                    R_VT,
    },
    observacao: 'DESCONTO DE CONTRIBUIÇÃO ASSISTENCIAL (SIM/NÃO) → 5840 R$ 30,00 quando SIM.',
};

// ─── Init Firebase Admin ─────────────────────────────────────────────────
const saPath = resolve(ROOT, 'service-account.json');
let sa;
try { sa = JSON.parse(readFileSync(saPath, 'utf8')); }
catch {
    console.error(`\n❌  service-account.json não encontrado em ${saPath}\n`);
    process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

console.log('\n🌱  Seed Waldesa (0026 + 0027) — iniciando…\n');

for (const e of EMPRESAS) {
    console.log(`\n─── ${e.razaoSocial} (SAGE ${e.codigoSage}) ───`);

    // 1) Empresa
    let empresaId;
    const col = db.collection('empresas');
    const ja = await col.where('cnpj', '==', e.cnpj).limit(1).get();
    if (!ja.empty) {
        empresaId = ja.docs[0].id;
        const d = ja.docs[0].data();
        const patch = {};
        if (d.codigoSage !== e.codigoSage) patch.codigoSage = e.codigoSage;
        if (d.razaoSocial !== e.razaoSocial) patch.razaoSocial = e.razaoSocial;
        if (d.nomeFantasia !== e.nomeFantasia) patch.nomeFantasia = e.nomeFantasia;
        if (Object.keys(patch).length > 0) {
            patch.atualizadoEm = admin.firestore.FieldValue.serverTimestamp();
            await col.doc(empresaId).update(patch);
            console.log(`✓ Empresa atualizada (${Object.keys(patch).filter(k => k !== 'atualizadoEm').join(', ')}).`);
        } else {
            console.log('✓ Empresa já cadastrada — sem alterações.');
        }
    } else {
        const ref = await col.add({
            cnpj: e.cnpj,
            razaoSocial: e.razaoSocial,
            nomeFantasia: e.nomeFantasia,
            codigoSage: e.codigoSage,
            criadoPor: 'seed-empresa-waldesa',
            criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp(),
        });
        empresaId = ref.id;
        console.log(`✓ Empresa cadastrada (id=${empresaId}).`);
    }

    // 2) Mapeamento
    const cfg = e.codigoSage === '0026' ? MAPEAMENTO_MOTO : MAPEAMENTO_COM;
    const ref = db.collection('folha_mapeamentos').doc(e.cnpj);
    const snap = await ref.get();
    if (snap.exists) {
        console.log(`✓ Mapeamento folha_mapeamentos/${e.cnpj} já existe — preservando ajustes manuais.`);
        // Garante apenas que regra_salario seja null
        const d = snap.data();
        if (d.regra_salario !== null) {
            await ref.update({
                regra_salario: null,
                observacoes: admin.firestore.FieldValue.arrayUnion(
                    `[${new Date().toISOString()}] seed-empresa-waldesa: regra_salario=null.`,
                ),
            });
            console.log('    └─ regra_salario ajustada para null.');
        }
    } else {
        const mapa = {
            $schema: 'processador-extrato-bancario/folha/mapeamento-apontamento/v1',
            cliente: e.cnpj,
            empresa_base: e.codigoSage,
            competencia_default: '',
            observacoes: [
                `Seed inicial em ${new Date().toISOString()} — script seed-empresa-waldesa.mjs.`,
                'Layout WIDE — 1 linha = 1 funcionário (apontamentoParser legado).',
                'Aba: nome da competência (ex.: "04-2026"). Cabeçalho na linha 2.',
                'Coluna CÓDIGO = matrícula. Coluna FUNCIONÁRIOS = nome.',
                'SALÁRIO/FUNÇÃO da planilha são informativos — não viram evento.',
                cfg.observacao,
                'ATRASOS 5850 vem como HH:MM:SS — convertido para horas decimais.',
                'DIFERENÇA 13º: código pendente — coluna sem mapeamento por enquanto.',
            ],
            empresas: {
                [e.chaveAba]: { codigo_sage: e.codigoSage, ativa: true },
            },
            mapeamento_colunas: cfg.mapeamento_colunas,
            regras_descontos_empresa: {
                coluna: '',
                campo_obs: 'OBSERVAÇÕES',
                evento_padrao: { evento: '', descricao_evento: '', tipo: 'D', rv: 'V' },
                regras: [],
            },
            regra_salario: null,
            matriculas: {
                [e.chaveAba]: {},
            },
        };
        await ref.set(mapa);
        console.log(`✓ Mapeamento folha_mapeamentos/${e.cnpj} criado.`);
    }
}

console.log('\n📋  Eventos mapeados (mesmos para Moto e Comércio):');
const eventos = [
    ['CONVÊNIO MÉDICO',            '5001 ASSISTENCIA MEDICA      (D, V)'],
    ['CONVÊNIO DEPENDENTE 1/2/3',  '5021 CONVENIO DEPENDENTE     (D, V)  — 1 lanç. por coluna preenchida'],
    ['COMISSÃO 770',               '0770 COMISSÃO                (V, V)'],
    ['DSR S/ COMISSÕES 1220',      '1220 D.S.R. S/ COMISSÕES     (V, V)'],
    ['PRÊMIO',                     '0034 PREMIO VALOR            (V, V)'],
    ['CONTRIBUIÇÃO ASSISTENCIAL',  '5840 CONTRIB. ASSISTENCIAL   (D, V)  — R$ 30,00 quando SIM'],
    ['ATRASOS 5850',               '5850 FALTAS E ATRASOS (T/H)  (D, R)  — HH:MM:SS → horas dec'],
    ['FALTAS 5650',                '5650 FALTAS (DIAS)           (D, R)  — em dias'],
    ['DSR 5651',                   '5651 DESCONTO DSR            (D, R)  — em dias'],
    ['H. E 60% 811',               '0811 HORA EXTRA 60%          (V, R)  — em horas'],
    ['H. E 100%',                  '0820 HORA EXTRA 100%         (V, R)  — em horas'],
    ['ADICIONAL NOTURNO',          '0211 ADICIONAL NOTURNO 25%   (V, R)  — confirmar % com sindicato'],
    ['VT (SIM/NÃO)',               '5780 VALE TRANSPORTE         (D, R)  — refer=1 quando SIM (SAGE calcula 6%)'],
];
for (const [col, ev] of eventos) console.log(`    ${col.padEnd(28)} → ${ev}`);
console.log('\n⚠️  Pendente: DIFERENÇA 13º (sem código IOB confirmado — coluna ignorada por ora).');

console.log('\n✅  Seed Waldesa concluído.');
console.log('    Próximos passos:');
console.log('    1. Folha → Apontamento, selecione Waldesa (Moto OU Comércio).');
console.log('    2. Suba o XLSX da competência — apontamentoParser detecta automaticamente.');
console.log('    3. Confira pré-visualização (matrículas vêm da coluna CÓDIGO).');
console.log('    4. Salve matrículas se for 1ª execução, depois exporte TXT.\n');

process.exit(0);
