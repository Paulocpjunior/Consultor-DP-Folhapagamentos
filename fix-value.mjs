// fix-value.mjs
// Corrige folha_mapeamentos/53618876000162 (VALUE PROJETOS LTDA)
//
// Bugs corrigidos automaticamente (decisões aprovadas pelo CEO):
//   1. HE 50% saindo no recibo: remove qualquer coluna que mapeie pra 0810.
//      Mantém apenas HE 60% (0811), 100% (0820) e Adicional Noturno (0006).
//   3. OUTROS DESCONTOS (5006) somando só ILIMITADA: adiciona "Plano celular"
//      também → 5006. O mapper v1.6 consolida em 1 linha automaticamente.
//   4. SALÁRIO 0001 + BOLSA 0073 saindo juntos: REMOVE regra_salario.
//      SAGE calcula o salário automaticamente pelo cadastro do funcionário.
//   5. Vale Transporte saindo: remove a coluna VT do mapeamento_colunas.
//      (Cliente: VT é controle interno.)
//
// Item 2 do report do CEO (dependentes do plano de saúde) NÃO é bug — SAGE
// complementa automaticamente.
//
// O script é idempotente: rodar múltiplas vezes deixa o documento no mesmo
// estado final.
//
// Uso: node fix-value.mjs
// Pré-req: ./service-account.json no diretório de execução.

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./service-account.json', 'utf-8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const CNPJ = '53618876000162';
const ref = db.collection('folha_mapeamentos').doc(CNPJ);

const snap = await ref.get();
if (!snap.exists) {
    console.error(`❌ Documento folha_mapeamentos/${CNPJ} não encontrado.`);
    process.exit(1);
}

const antes = snap.data();
console.log('📋 Estado anterior:');
console.log('  - empresas:', Object.keys(antes.empresas ?? {}).length);
console.log('  - mapeamento_colunas:', Object.keys(antes.mapeamento_colunas ?? {}).length);
console.log('  - regra_salario:', antes.regra_salario ? 'presente' : 'ausente');
console.log();

// ─── Definição autoritativa do mapeamento_colunas (baseada no XLSX da VALUE) ─
// Mapeia cada cabeçalho exato do XLSX (PRE_VIA_FOLHA_VALUE_-_ABRIL_2026.xlsx,
// aba "MAIO 2026 ", linha 4) para o evento IOB SAGE correto.
//
// Ignorados (não aparecem no mapeamento_colunas, NÃO viram lançamento):
//   - "Salário" (C) — SAGE calcula
//   - "Vale Transporte" (E) — controle interno
//   - "INSS" (F), "FGTS" (G) — SAGE calcula
//   - "Plano de Saúde Dependentes2" (Q) — SAGE complementa por dependente
//   - "IRF - BASE DE CALCULO" (U), "IRF" (V), "TOTAL" (W) — SAGE calcula
//   - "Função" (B) — informativo
const mapeamento_colunas_novo = {
    "Vale alimentação ": {
        evento: "5028",
        descricao_evento: "DESCONTO VR/VA",
        tipo: "D",
        rv: "V",
        ignorar_se_zero: true,
    },
    "PREMIAÇÃO": {
        evento: "1103",
        descricao_evento: "PREMIACAO",
        tipo: "V",
        rv: "V",
        ignorar_se_zero: true,
    },
    "BOLSA DE ESTUDOS": {
        evento: "0073",
        descricao_evento: "BOLSA AUXILIO ESTAGIO",
        tipo: "V",
        rv: "V",
        ignorar_se_zero: true,
    },
    "Plano celular": {
        evento: "5006",
        descricao_evento: "OUTROS DESCONTOS",
        tipo: "D",
        rv: "V",
        ignorar_se_zero: true,
    },
    // Hora extra GENÉRICA → 0811 (HE 60%) — cliente NÃO usa 50%
    "Hora extra": {
        evento: "0811",
        descricao_evento: "HORA EXTRA 60%",
        tipo: "V",
        rv: "R",
        ignorar_se_zero: true,
    },
    "Hora extra 100%": {
        evento: "0820",
        descricao_evento: "HORA EXTRA 100%",
        tipo: "V",
        rv: "R",
        ignorar_se_zero: true,
    },
    "Hora extra Noturna": {
        evento: "0006",
        descricao_evento: "ADICIONAL NOTURNO",
        tipo: "V",
        rv: "R",
        ignorar_se_zero: true,
    },
    "Auxilio moradia": {
        evento: "1057",
        descricao_evento: "AUXILIO MORADIA",
        tipo: "V",
        rv: "V",
        ignorar_se_zero: true,
    },
    "Plano de Saúde": {
        evento: "5054",
        descricao_evento: "ASSISTENCIA MEDICA",
        tipo: "D",
        rv: "V",
        ignorar_se_zero: true,
    },
    "Plano de Saúde Cooparticipação": {
        evento: "5091",
        descricao_evento: "PLANO DE SAUDE COPARTICIPACAO",
        tipo: "D",
        rv: "V",
        ignorar_se_zero: true,
    },
    "Plano Odonto": {
        evento: "7001",
        descricao_evento: "ASSISTENCIA ODONTOLOGICA",
        tipo: "D",
        rv: "V",
        ignorar_se_zero: true,
    },
    "Ilimitada assessoria": {
        evento: "5006",                   // mesmo evento que "Plano celular"
        descricao_evento: "OUTROS DESCONTOS",
        tipo: "D",
        rv: "V",
        ignorar_se_zero: true,
    },
    "Emprestimo": {
        evento: "8000",
        descricao_evento: "EMPRESTIMO CONSIGNADO",
        tipo: "D",
        rv: "V",
        ignorar_se_zero: true,
    },
};

// ─── Diff: o que mudou? ─────────────────────────────────────────────────
const colunasAntes = Object.keys(antes.mapeamento_colunas ?? {});
const colunasDepois = Object.keys(mapeamento_colunas_novo);
const removidas = colunasAntes.filter((c) => !colunasDepois.includes(c));
const adicionadas = colunasDepois.filter((c) => !colunasAntes.includes(c));
const eventoAlterados = colunasAntes
    .filter((c) => colunasDepois.includes(c))
    .filter((c) => antes.mapeamento_colunas[c]?.evento !== mapeamento_colunas_novo[c]?.evento)
    .map((c) => ({
        coluna: c,
        de: antes.mapeamento_colunas[c]?.evento,
        para: mapeamento_colunas_novo[c]?.evento,
    }));

console.log('📊 Diff do mapeamento_colunas:');
console.log('  - removidas:', removidas.length ? removidas : '(nenhuma)');
console.log('  - adicionadas:', adicionadas.length ? adicionadas : '(nenhuma)');
console.log('  - evento alterado:', eventoAlterados.length ? eventoAlterados : '(nenhum)');
console.log();

// ─── Atualização ────────────────────────────────────────────────────────
const update = {
    mapeamento_colunas: mapeamento_colunas_novo,
    // v1.1: grava null explícito (NÃO delete), senão a migração silenciosa
    // em folhaFirestoreService.getMapeamento ressuscita o default 0001.
    regra_salario: null,  // remove (SAGE calcula)
    observacoes: admin.firestore.FieldValue.arrayUnion(
        `[${new Date().toISOString()}] fix-value v1.0: HE 50% removida, ` +
        `regra_salario removida (SAGE calcula), "Plano celular" + "Ilimitada assessoria" → 5006 ` +
        `(consolidam via mapper v1.6), VT removido (controle interno).`,
    ),
};

await ref.update(update);
console.log('✅ Documento atualizado.');

// Verifica resultado
const depois = (await ref.get()).data();
console.log();
console.log('📋 Estado posterior:');
console.log('  - mapeamento_colunas:', Object.keys(depois.mapeamento_colunas ?? {}).length, 'coluna(s)');
console.log('  - regra_salario:', depois.regra_salario ? 'presente (FALHA)' : 'ausente ✓');
console.log('  - colunas pra 5006:',
    Object.entries(depois.mapeamento_colunas)
        .filter(([_, r]) => r.evento === '5006')
        .map(([c]) => c));
console.log();
console.log('🎯 Próximo upload da folha VALUE deve gerar TXT correto.');

process.exit(0);
