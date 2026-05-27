#!/usr/bin/env node
/**
 * seed-rede-genesis-v2.mjs
 * --------------------------------------------------------------------------
 * Parametrização Firestore — 6 empresas atendidas via planilha multi-aba
 * "Planilha de Pontamento da Folha de Pagamento" (escritório contábil).
 *
 * v2 — Refeito do zero seguindo schema REAL `MapeamentoApontamento` validado
 *      contra doc Ferrante existente (folha_mapeamentos/44687819000144).
 *
 * Diferenças vs v1 (descartado):
 *   - Chave de `mapeamento_colunas` = TEXTO LITERAL do header da planilha
 *     (não a letra de coluna A/B/C — esse era o erro do v1)
 *   - Stub completo de `regras_descontos_empresa` mesmo quando vazio (schema obriga)
 *   - `empresa_base`, `empresas`, `matriculas`, `regra_salario:null`, `observacoes`
 *     todos presentes — mesma forma do Ferrante
 *
 * FASE 1 (este script): cobre apenas as colunas que o parser/mapper atuais já
 * processam corretamente. Colunas adiadas para FASE 2 (precisam patch v1.7
 * com `flag_adesao` e `rv:"P"`):
 *   - ANUÊNIO, QUINQUÊNIO (números puros 0.15 = 15%; cairiam na lógica
 *     fração-de-dia *24 que dá resultado errado)
 *   - "6% VT", "REFEIÇÃO", "SINDICATO" (recebem "SIM"/"Não", extrairValor()
 *     retorna null e o lançamento é silenciosamente perdido)
 *
 * LEGACY (14.583.444/0001-01): IGNORADA — só tem pró-labore.
 *
 * ABA: doc com `mapeamento_colunas` VAZIO (decisão Paulo, 14/05/2026).
 *      Todas as suas 3 verbas dependem da Fase 2.
 *
 * Schema do header (descoberto via inspect-todas.cjs sobre o XLSX real):
 *   - Linha 4 = cabeçalho (parser v2.2.0 detecta porque C4="NOME ")
 *   - Linha 5 = códigos SAGE inline fornecidos pelo cliente (ignorados — usamos os do registro)
 *   - Linha 6+ = dados
 *
 * CNPJ Rede Gênesis: NÃO usar o da planilha (06.255.895/0002-72). Empresa
 * cadastrada com CNPJ 04.083.175/0001-60 (matriz, SAGE 0361).
 *
 * Execução:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *   node seed-rede-genesis-v2.mjs
 * --------------------------------------------------------------------------
 */

import admin from 'firebase-admin';
import fs from 'fs';

const SERVICE_ACCOUNT_PATH = './service-account.json';
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(`❌ ${SERVICE_ACCOUNT_PATH} não encontrado.`);
  process.exit(1);
}
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// --------------------------------------------------------------------------
// Stub de regras_descontos_empresa — schema obriga existir, mas estes clientes
// não usam o conceito de "DESCONTOS EMPRESA com OBS". Mantém Ferrante-style.
// --------------------------------------------------------------------------
const STUB_REGRAS_DE = {
  coluna: '',
  campo_obs: '',
  evento_padrao: {
    evento: '',
    descricao_evento: '',
    tipo: 'D',
    rv: 'V',
  },
  regras: [],
};

const OBS_PADRAO = [
  'Layout fixo do escritório contábil — não muda mês a mês.',
  'Linha 2 = título; Linha 4 = cabeçalho; Linha 5 = códigos SAGE do cliente (ignorados, usar SAGE do registro de empresas); Linha 6+ = dados.',
  'FASE 1: cobre só colunas com valor monetário, horas decimais e percentual em string. ANUÊNIO/QUINQUÊNIO (frações puras) e colunas SIM/Não (6% VT, REFEIÇÃO, SINDICATO) ficam para FASE 2 (precisa patch apontamentoMapper v1.7 com rv:"P" e tipo:"flag_adesao").',
  'regra_salario:null — SAGE calcula salário automaticamente.',
];

// --------------------------------------------------------------------------
// EMPRESAS — chaves do `mapeamento_colunas` são os textos LITERAIS dos headers
// L4 conforme inspecionado no XLSX. Preservar espaços, acentos, capitalização.
// --------------------------------------------------------------------------

const EMPRESAS = [
  // ========================================================================
  // 1) REDE GENESIS — CNPJ matriz 04.083.175/0001-60, SAGE 0361
  // ========================================================================
  {
    docId: '04083175000160',
    empresa_base: 'REDE GENESIS DE SERVICOS SOCIEDADE SIMPLES LTDA',
    abaPlanilha: 'REDE GENESIS',
    sage: '0361',
    mapeamento_colunas: {
      'GRATIFICAÇÃO':  { evento: '1280', descricao_evento: 'GRATIFICAÇÃO',           tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'COMP SALARIO':  { evento: '0216', descricao_evento: 'COMPLEMENTO DE SALÁRIO', tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'ACUM FUN':      { evento: '1143', descricao_evento: 'ACÚMULO DE FUNÇÃO',      tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'ADC PERICULO ': { evento: '4910', descricao_evento: 'ADIC. PERICULOSIDADE',   tipo: 'V', rv: 'V', ignorar_se_zero: true },
      ' ADC NOT':      { evento: '1009', descricao_evento: 'ADIC. NOTURNO (HORAS)',  tipo: 'V', rv: 'R', ignorar_se_zero: true,
                         nota: 'Hora decimal direto da planilha (não fração-de-dia Excel).' },
      'HORAS À 50%':   { evento: '0810', descricao_evento: 'HORA EXTRA 50%',         tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'HORAS À 100%':  { evento: '0820', descricao_evento: 'HORA EXTRA 100%',        tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'HORAS FALTAS':  { evento: '5854', descricao_evento: 'ATRASOS EM HORAS',       tipo: 'D', rv: 'R', ignorar_se_zero: true },
      'PENSÃO ':       { evento: '5821', descricao_evento: 'PENSÃO ALIMENTÍCIA',     tipo: 'D', rv: 'R', ignorar_se_zero: true,
                         nota: 'Célula pode chegar como string "20%" — extrairValor() captura o número.' },
    },
  },

  // ========================================================================
  // 2) VITA — CNPJ 04.144.798/0001-04, SAGE 0358
  // ========================================================================
  {
    docId: '04144798000104',
    empresa_base: 'VITA',
    abaPlanilha: 'VITA',
    sage: '0358',
    mapeamento_colunas: {
      'GRATIFICAÇÃO':     { evento: '1280', descricao_evento: 'GRATIFICAÇÃO',         tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'ACUM FUN':         { evento: '1143', descricao_evento: 'ACÚMULO DE FUNÇÃO',    tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'DIARIA DE VIAGEM': { evento: '0489', descricao_evento: 'DIÁRIA DE VIAGEM',     tipo: 'V', rv: 'V', ignorar_se_zero: true },
      ' ADC NOT':         { evento: '1009', descricao_evento: 'ADIC. NOTURNO (HORAS)', tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'HORAS 100%':       { evento: '0820', descricao_evento: 'HORA EXTRA 100%',      tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'ASSIS. MED':       { evento: '5001', descricao_evento: 'ASSIST. MÉDICA',       tipo: 'D', rv: 'V', ignorar_se_zero: true },
      'A. MED. DEP':      { evento: '5037', descricao_evento: 'ASSIST. MÉDICA DEP.',  tipo: 'D', rv: 'V', ignorar_se_zero: true },
      'FALTAS ':          { evento: '5650', descricao_evento: 'FALTAS',               tipo: 'D', rv: 'R', ignorar_se_zero: true },
      'ATRASOS ':         { evento: '5850', descricao_evento: 'ATRASOS',              tipo: 'D', rv: 'V', ignorar_se_zero: true },
    },
  },

  // ========================================================================
  // 3) ABA — CNPJ 26.444.489/0001-84, SAGE 0272 — DOC VAZIO (FASE 1)
  // ========================================================================
  {
    docId: '26444489000184',
    empresa_base: 'ABA',
    abaPlanilha: 'ABA',
    sage: '0272',
    mapeamento_colunas: {},
    obsExtra: [
      'FASE 1 = doc vazio. Todas as 3 colunas da ABA (Anuênio, 6% VT, Sindicato) precisam de Fase 2.',
    ],
  },

  // ========================================================================
  // 4) COLORADO — CNPJ 10.324.380/0001-73, SAGE 0570
  // ========================================================================
  {
    docId: '10324380000173',
    empresa_base: 'COLORADO',
    abaPlanilha: 'COLORADO',
    sage: '0570',
    mapeamento_colunas: {
      'COMISSÃO':        { evento: '0770', descricao_evento: 'COMISSÃO',              tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'GRATIFICAÇÃO':    { evento: '1280', descricao_evento: 'GRATIFICAÇÃO',          tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'BONIFICAÇÃO':     { evento: '1286', descricao_evento: 'BONIFICAÇÃO',           tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'DIARIA VIAGEM':   { evento: '0489', descricao_evento: 'DIÁRIA DE VIAGEM',      tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'ADC PERICULO ':   { evento: '4910', descricao_evento: 'ADIC. PERICULOSIDADE',  tipo: 'V', rv: 'V', ignorar_se_zero: true },
      ' ADC NOT':        { evento: '0211', descricao_evento: 'ADIC. NOTURNO 25%',     tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'EXTRA 50%':       { evento: '0810', descricao_evento: 'HORA EXTRA 50%',        tipo: 'V', rv: 'R', ignorar_se_zero: true },
      ' EXTRA  100%':    { evento: '0820', descricao_evento: 'HORA EXTRA 100%',       tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'ASSIS. MED':      { evento: '5001', descricao_evento: 'ASSIST. MÉDICA',        tipo: 'D', rv: 'V', ignorar_se_zero: true },
      'ASSIS. MED. DEP': { evento: '5037', descricao_evento: 'ASSIST. MÉDICA DEP.',   tipo: 'D', rv: 'V', ignorar_se_zero: true },
      'FALTAS ':         { evento: '5650', descricao_evento: 'FALTAS',                tipo: 'D', rv: 'R', ignorar_se_zero: true },
      'ATRASOS ':        { evento: '5850', descricao_evento: 'ATRASOS',               tipo: 'D', rv: 'V', ignorar_se_zero: true },
    },
  },

  // ========================================================================
  // 5) EMBAIXADA — CNPJ 20.069.635/0001-52, SAGE 2045
  // ========================================================================
  {
    docId: '20069635000152',
    empresa_base: 'EMBAIXADA',
    abaPlanilha: 'EMBAIXADA',
    sage: '2045',
    mapeamento_colunas: {
      'GRATIFICAÇÃO':  { evento: '1280', descricao_evento: 'GRATIFICAÇÃO',          tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'DUPLA FUNC':    { evento: '0837', descricao_evento: 'DUPLA FUNÇÃO',          tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'ADC PERICULO ': { evento: '4910', descricao_evento: 'ADIC. PERICULOSIDADE',  tipo: 'V', rv: 'V', ignorar_se_zero: true },
      ' ADC NOT':      { evento: '0211', descricao_evento: 'ADIC. NOTURNO 25%',     tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'HORA À 50%':    { evento: '0810', descricao_evento: 'HORA EXTRA 50%',        tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'HORA À 100%':   { evento: '0820', descricao_evento: 'HORA EXTRA 100%',       tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'FALTA':         { evento: '5650', descricao_evento: 'FALTAS',                tipo: 'D', rv: 'R', ignorar_se_zero: true },
      'ASSIS. MED':    { evento: '5001', descricao_evento: 'ASSIST. MÉDICA',        tipo: 'D', rv: 'V', ignorar_se_zero: true },
      'VA':            { evento: '1060', descricao_evento: 'VALE ALIMENTAÇÃO',      tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'VT':            { evento: '4978', descricao_evento: 'VALE TRANSPORTE',       tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'PENSÃO ':       { evento: '5821', descricao_evento: 'PENSÃO ALIMENTÍCIA',    tipo: 'D', rv: 'R', ignorar_se_zero: true },
    },
  },

  // ========================================================================
  // 6) SBE EDIÇÕES — CNPJ 04.496.421/0001-06, SAGE 0181
  //    ATENÇÃO: cliente trocou colunas I↔J no L5 da planilha. O Firestore tem
  //    precedência: I="GRATIFICAÇÃO"→1280, J="VA "→1060 (correto).
  // ========================================================================
  {
    docId: '04496421000106',
    empresa_base: 'SBE EDIÇÕES',
    abaPlanilha: 'SBE EDIÇÕES',
    sage: '0181',
    mapeamento_colunas: {
      'GRATIFICAÇÃO':            { evento: '1280', descricao_evento: 'GRATIFICAÇÃO',           tipo: 'V', rv: 'V', ignorar_se_zero: true,
                                    nota: 'Cliente trocou I↔J no L5 da planilha. Mapeamento Firestore tem precedência.' },
      'VA ':                     { evento: '1060', descricao_evento: 'VALE ALIMENTAÇÃO',      tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'VT':                      { evento: '4978', descricao_evento: 'VALE TRANSPORTE',       tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'AUX. MORADIA':            { evento: '0481', descricao_evento: 'SALÁRIO HABITAÇÃO',     tipo: 'V', rv: 'V', ignorar_se_zero: true },
      'HORA 100%':               { evento: '0820', descricao_evento: 'HORA EXTRA 100%',       tipo: 'V', rv: 'R', ignorar_se_zero: true },
      'DESCONTAR AUX. MORADIRA': { evento: '5024', descricao_evento: 'DESC. SALÁRIO HABITAÇÃO', tipo: 'D', rv: 'V', ignorar_se_zero: true,
                                    nota: 'Sic do cliente: "MORADIRA" com R extra; mantemos a chave igual ao header.' },
    },
  },
];

// --------------------------------------------------------------------------
// Construção do doc no schema MapeamentoApontamento (igual Ferrante)
// --------------------------------------------------------------------------
function montarDoc(emp) {
  return {
    $schema: 'MapeamentoApontamento',
    cliente: emp.docId,                       // padrão Ferrante: CNPJ sem máscara
    empresa_base: emp.empresa_base,
    competencia_default: '',
    empresas: {
      [emp.abaPlanilha]: {
        codigo_sage: emp.sage,
        ativa: true,
      },
    },
    regras_descontos_empresa: STUB_REGRAS_DE,
    mapeamento_colunas: emp.mapeamento_colunas,
    matriculas: {},                            // será preenchido via UI conforme uso
    observacoes: [...OBS_PADRAO, ...(emp.obsExtra ?? [])],
    regra_salario: null,
  };
}

// --------------------------------------------------------------------------
// Execução
// --------------------------------------------------------------------------
async function main() {
  console.log(`\n🌱 Seed Firestore v2 — ${EMPRESAS.length} empresas (FASE 1)\n`);
  console.log('Schema: MapeamentoApontamento (igual Ferrante)\n');

  let ok = 0, erros = 0;
  for (const emp of EMPRESAS) {
    try {
      const doc = montarDoc(emp);
      await db.collection('folha_mapeamentos').doc(emp.docId).set(doc, { merge: false });
      const n = Object.keys(emp.mapeamento_colunas).length;
      const tag = n === 0 ? '(vazio - Fase 2)' : `(${n} colunas)`;
      console.log(`  ✅ ${emp.abaPlanilha.padEnd(15)} SAGE ${emp.sage}  doc=${emp.docId}  ${tag}`);
      ok++;
    } catch (e) {
      console.error(`  ❌ ${emp.abaPlanilha}: ${e.message}`);
      erros++;
    }
  }

  console.log(`\nResumo: ${ok} ok, ${erros} erros\n`);
  console.log('Próximos passos:');
  console.log('  1. Subir o XLSX no app (selecionar QUALQUER uma das 6 empresas)');
  console.log('  2. O modal "Mapear layout" não deve mais aparecer (doc já existe)');
  console.log('  3. App deve detectar a aba correta e gerar TXT da empresa selecionada');
  console.log('  4. Verificar TXT gerado — colunas Fase 1 devem aparecer');
  console.log('  5. Para multi-empresa em 1 upload + ZIP: depois de validar 1 empresa, implementar orquestração');
  console.log('  6. Para colunas Fase 2 (ANUENIO%, QUINQUENIO%, SIM/Não): aplicar patch apontamentoMapper v1.7\n');

  process.exit(erros === 0 ? 0 : 1);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
