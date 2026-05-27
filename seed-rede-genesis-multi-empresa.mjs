#!/usr/bin/env node
/**
 * seed-rede-genesis-multi-empresa.mjs
 * --------------------------------------------------------------------------
 * Parametrização Firestore — 7 empresas atendidas via planilha multi-aba
 * "Planilha de Apontamento da Folha de Pagamento" (Rede Gênesis Contábil?).
 *
 * Layout (todas as abas seguem o MESMO padrão):
 *   - B2  = "<COD_INTERNO> <RAZAO> | <CNPJ>"  (separador pipe)
 *   - L4  = cabeçalho com nomes das verbas (texto livre)
 *   - L5  = códigos SAGE inline fornecidos pelo cliente (parcial)
 *   - L6+ = dados dos funcionários
 *   - B-E = CÓD / NOME / ADMISSÃO / SITUAÇÃO (fixo)
 *   - F   = SALÁRIO (ignorado — regra_salario:null em todas)
 *   - Demais colunas = verbas (variam por empresa)
 *
 * Particularidades:
 *   - ANUENIO/QUINQUÊNIO ocupam 2 colunas (% + valor calculado). Mapeamos
 *     a coluna do VALOR com rv=V (cliente já fez a conta).
 *   - Colunas "6% VT", "REFEIÇÃO", "SINDICATO" recebem "SIM"/"Não" como
 *     flag de adesão. Marcamos tipo:"flag_adesao" — mapper deve gerar
 *     evento com referência=1 quando SIM, omitir quando Não/em branco.
 *   - SBE Edições: cliente trocou colunas I (GRATIFICAÇÃO) ↔ J (VA) no
 *     próprio L5. Mapeamento Firestore tem PRECEDÊNCIA: I→1280, J→1060.
 *   - LEGACY: funcionários com SITUAÇÃO="PROLABORE" devem ser ignorados
 *     pelo mapper (não há evento correspondente de pró-labore aqui).
 *   - Coluna OBS (texto livre): NÃO mapear; mapper deve emitir aviso
 *     de revisão humana sempre que houver conteúdo.
 *
 * Pendências (procurar // TODO no array EMPRESAS):
 *   - VITA col N (DIARIA DE VIAGEM) — assumido 0489
 *   - VITA col O (ADC NOT) — assumido 1009
 *
 * Após rodar: auditar contra folha_catalogo/iob_sage (599 eventos) com
 * o script padrão de auditoria de de-para.
 *
 * Execução:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json \
 *   node seed-rede-genesis-multi-empresa.mjs
 * --------------------------------------------------------------------------
 */

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();

// --------------------------------------------------------------------------
// EMPRESAS — uma entrada por aba do arquivo (Planilha1 é auxiliar, ignorada)
// --------------------------------------------------------------------------
const EMPRESAS = [
  {
    aba: 'REDE GENESIS',
    cnpj: '06.255.895/0002-72',
    razao: 'Rede Gênesis',
    codigo_interno_cliente: null,
    colunas_verbas: {
      I: { evento: '1537', rv: 'V',  descricao: 'ANUÊNIO (valor calculado)' },
      K: { evento: '0981', rv: 'V',  descricao: 'QUINQUÊNIO (valor calculado)' },
      L: { evento: '1280', rv: 'V',  descricao: 'GRATIFICAÇÃO' },
      M: { evento: '0216', rv: 'V',  descricao: 'COMP. SALÁRIO' },
      N: { evento: '1143', rv: 'V',  descricao: 'ACÚM. FUNÇÃO' },
      Q: { evento: '4910', rv: 'V',  descricao: 'ADIC. PERICULOSIDADE' },
      R: { evento: '1009', rv: 'R',  descricao: 'ADIC. NOTURNO (horas)' },
      S: { evento: '0810', rv: 'R',  descricao: 'HORAS EXTRA 50%' },
      T: { evento: '0820', rv: 'R',  descricao: 'HORAS EXTRA 100%' },
      U: { evento: '5854', rv: 'R',  descricao: 'ATRASOS EM HORAS' },
      V: { evento: '5780', rv: 'V',  descricao: 'DESC. VT 6%',     tipo: 'flag_adesao' },
      W: { evento: '5002', rv: 'V',  descricao: 'VR / REFEIÇÃO',   tipo: 'flag_adesao' },
      X: { evento: '5004', rv: 'V',  descricao: 'CONTR. SINDICAL', tipo: 'flag_adesao' },
      Y: { evento: '5821', rv: 'R%', descricao: 'PENSÃO ALIMENTÍCIA (%)' },
      // O (AUX ALIM) e P (AUX TRANSP): NÃO utilizados nesta empresa (Paulo, 14/05/2026)
    },
  },
  {
    aba: 'VITA',
    cnpj: '04.144.798/0001-04',
    razao: 'VITA',
    codigo_interno_cliente: '0358',
    colunas_verbas: {
      I: { evento: '1537', rv: 'V',  descricao: 'ANUÊNIO (valor calculado)' },
      K: { evento: '0981', rv: 'V',  descricao: 'QUINQUÊNIO (valor calculado)' },
      L: { evento: '1280', rv: 'V',  descricao: 'GRATIFICAÇÃO' },
      M: { evento: '1143', rv: 'V',  descricao: 'ACÚM. FUNÇÃO' },
      N: { evento: '0489', rv: 'V',  descricao: 'DIÁRIA DE VIAGEM' }, // TODO confirmar com Paulo
      O: { evento: '1009', rv: 'R',  descricao: 'ADIC. NOTURNO (horas)' }, // TODO confirmar
      P: { evento: '0820', rv: 'R',  descricao: 'HORAS 100%' },
      Q: { evento: '5001', rv: 'V',  descricao: 'ASSIST. MÉDICA' },
      R: { evento: '5037', rv: 'V',  descricao: 'ASSIST. MÉDICA DEPENDENTES' },
      S: { evento: '5650', rv: 'R',  descricao: 'FALTAS' },
      T: { evento: '5850', rv: 'R',  descricao: 'ATRASOS' },
      U: { evento: '5780', rv: 'V',  descricao: 'DESC. VT 6%',   tipo: 'flag_adesao' },
      V: { evento: '5002', rv: 'V',  descricao: 'VR / REFEIÇÃO', tipo: 'flag_adesao' },
    },
  },
  {
    aba: 'ABA',
    cnpj: '26.444.489/0001-84',
    razao: 'ABA',
    codigo_interno_cliente: '0272',
    colunas_verbas: {
      H: { evento: '1537', rv: 'V', descricao: 'ANUÊNIO (valor calculado)' },
      I: { evento: '5780', rv: 'V', descricao: 'DESC. VT 6%',     tipo: 'flag_adesao' },
      J: { evento: '5004', rv: 'V', descricao: 'CONTR. SINDICAL', tipo: 'flag_adesao' },
    },
  },
  {
    aba: 'COLORADO',
    cnpj: '10.324.380/0001-73',
    razao: 'COLORADO',
    codigo_interno_cliente: '0570',
    // OBS: COLORADO tem F=salário base, G=anuênio valor, H=salário total —
    // ignorados pois regra_salario:null. ANUÊNIO mapeado em J (valor).
    colunas_verbas: {
      J: { evento: '1537', rv: 'V',  descricao: 'ANUÊNIO (valor calculado)' },
      L: { evento: '0981', rv: 'V',  descricao: 'QUINQUÊNIO (valor calculado)' },
      M: { evento: '0770', rv: 'V',  descricao: 'COMISSÃO' },
      N: { evento: '1280', rv: 'V',  descricao: 'GRATIFICAÇÃO' },
      O: { evento: '1286', rv: 'V',  descricao: 'BONIFICAÇÃO' },
      P: { evento: '0489', rv: 'V',  descricao: 'DIÁRIA DE VIAGEM' },
      Q: { evento: '4910', rv: 'V',  descricao: 'ADIC. PERICULOSIDADE' },
      R: { evento: '0211', rv: 'R',  descricao: 'ADIC. NOTURNO 25%' },
      S: { evento: '0810', rv: 'R',  descricao: 'HORAS EXTRA 50%' },
      T: { evento: '0820', rv: 'R',  descricao: 'HORAS EXTRA 100%' },
      U: { evento: '5001', rv: 'V',  descricao: 'ASSIST. MÉDICA' },
      V: { evento: '5037', rv: 'V',  descricao: 'ASSIST. MÉDICA DEPENDENTES' },
      W: { evento: '5650', rv: 'R',  descricao: 'FALTAS' },
      X: { evento: '5850', rv: 'R',  descricao: 'ATRASOS' },
      Y: { evento: '5780', rv: 'V',  descricao: 'DESC. VT 6%',   tipo: 'flag_adesao' },
      Z: { evento: '5002', rv: 'V',  descricao: 'VR / REFEIÇÃO', tipo: 'flag_adesao' },
    },
  },
  {
    aba: 'EMBAIXADA',
    cnpj: '20.069.635/0001-52',
    razao: 'EMBAIXADA',
    codigo_interno_cliente: '2045',
    colunas_verbas: {
      I: { evento: '1537', rv: 'V',  descricao: 'ANUÊNIO (valor calculado)' },
      J: { evento: '0981', rv: 'R%', descricao: 'QUINQUÊNIO (% — coluna única)' },
      K: { evento: '1280', rv: 'V',  descricao: 'GRATIFICAÇÃO' },
      L: { evento: '0837', rv: 'V',  descricao: 'DUPLA FUNÇÃO' },
      M: { evento: '4910', rv: 'V',  descricao: 'ADIC. PERICULOSIDADE' },
      N: { evento: '0211', rv: 'R',  descricao: 'ADIC. NOTURNO 25%' },
      O: { evento: '0810', rv: 'R',  descricao: 'HORAS EXTRA 50%' },
      P: { evento: '0820', rv: 'R',  descricao: 'HORAS EXTRA 100%' },
      Q: { evento: '5650', rv: 'R',  descricao: 'FALTAS' },
      R: { evento: '5001', rv: 'V',  descricao: 'ASSIST. MÉDICA' },
      S: { evento: '1060', rv: 'V',  descricao: 'VA — VALE ALIMENTAÇÃO' },
      T: { evento: '4978', rv: 'V',  descricao: 'VT — VALE TRANSPORTE' },
      U: { evento: '5780', rv: 'V',  descricao: 'DESC. VT 6%',     tipo: 'flag_adesao' },
      V: { evento: '5004', rv: 'V',  descricao: 'CONTR. SINDICAL', tipo: 'flag_adesao' },
      W: { evento: '5821', rv: 'R%', descricao: 'PENSÃO ALIMENTÍCIA (%)' },
    },
  },
  {
    aba: 'LEGACY',
    cnpj: '14.583.444/0001-01',
    razao: 'LEGACY',
    codigo_interno_cliente: '0360',
    // PROLABORE: mapper deve ignorar linhas com SITUAÇÃO="PROLABORE"
    colunas_verbas: {
      H: { evento: '1537', rv: 'V', descricao: 'ANUÊNIO (valor calculado)' },
      I: { evento: '1280', rv: 'V', descricao: 'GRATIFICAÇÃO' },
      J: { evento: '0820', rv: 'R', descricao: 'HORAS EXTRA 100%' },
      K: { evento: '5780', rv: 'V', descricao: 'DESC. VT 6%',   tipo: 'flag_adesao' },
      L: { evento: '5002', rv: 'V', descricao: 'VR / REFEIÇÃO', tipo: 'flag_adesao' },
    },
  },
  {
    aba: 'SBE EDIÇÕES',
    cnpj: '04.496.421/0001-06',
    razao: 'SBE Edições',
    codigo_interno_cliente: '181',
    // ATENÇÃO: cliente trocou cabeçalhos I↔J no próprio arquivo (L5 da SBE
    // tem 1280 em J=VA, errado). Firestore tem precedência: I=GRAT, J=VA.
    colunas_verbas: {
      H: { evento: '1537', rv: 'V', descricao: 'ANUÊNIO (valor calculado)' },
      I: { evento: '1280', rv: 'V', descricao: 'GRATIFICAÇÃO (correção: cliente trocou com VA)' },
      J: { evento: '1060', rv: 'V', descricao: 'VA — VALE ALIMENTAÇÃO (correção: cliente trocou com GRAT)' },
      K: { evento: '4978', rv: 'V', descricao: 'VT — VALE TRANSPORTE' },
      L: { evento: '0481', rv: 'V', descricao: 'SALÁRIO HABITAÇÃO (prov.) — AUX. MORADIA' },
      M: { evento: '0820', rv: 'R', descricao: 'HORAS EXTRA 100%' },
      N: { evento: '5780', rv: 'V', descricao: 'DESC. VT 6%',   tipo: 'flag_adesao' },
      O: { evento: '5002', rv: 'V', descricao: 'VR / REFEIÇÃO', tipo: 'flag_adesao' },
      P: { evento: '5024', rv: 'V', descricao: 'SALÁRIO HABITAÇÃO (desc.) — DESC. AUX. MORADIA' },
    },
  },
];

// --------------------------------------------------------------------------
// Schema do documento gravado em folha_mapeamentos/{CNPJ}
// --------------------------------------------------------------------------
function montarDoc(emp) {
  return {
    cnpj: emp.cnpj,
    razao: emp.razao,
    codigo_interno_cliente: emp.codigo_interno_cliente,
    layout: 'multi_empresa_aba',           // novo tipo de layout
    detector_origem: 'rede_genesis_multi_v1',
    aba_origem: emp.aba,
    regra_salario: null,                   // SAGE calcula salário automaticamente
    linha_cabecalho: 4,
    linha_codigos_sage_cliente: 5,         // L5 vem preenchido (parcial) pelo cliente
    linha_dados_inicio: 6,
    colunas_metadados: {
      codigo_func: 'B',
      nome_func:  'C',
      admissao:   'D',
      situacao:   'E',
      salario:    'F',                     // ignorado (regra_salario:null)
    },
    ignorar_situacoes: emp.aba === 'LEGACY' ? ['PROLABORE'] : [],
    coluna_obs: emp.aba === 'ABA' ? 'K'
      : emp.aba === 'LEGACY' ? 'M'
      : emp.aba === 'SBE EDIÇÕES' ? 'Q'
      : emp.aba === 'VITA' ? 'W'
      : emp.aba === 'EMBAIXADA' ? 'X'
      : emp.aba === 'COLORADO' ? 'AA'
      : 'Z',                               // RGênesis
    aviso_revisao_obs: true,               // mapper emite aviso quando OBS preenchido
    colunas_verbas: emp.colunas_verbas,
    atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
    atualizado_por: 'seed-rede-genesis-multi-empresa.mjs',
  };
}

// --------------------------------------------------------------------------
// Execução
// --------------------------------------------------------------------------
async function main() {
  console.log(`\n🌱 Seed Firestore — ${EMPRESAS.length} empresas multi-aba\n`);

  let ok = 0, erros = 0;
  for (const emp of EMPRESAS) {
    try {
      const docId = emp.cnpj;             // padrão do app: {CNPJ} como id
      const doc = montarDoc(emp);
      await db.collection('folha_mapeamentos').doc(docId).set(doc, { merge: true });
      const n = Object.keys(emp.colunas_verbas).length;
      console.log(`  ✅ ${emp.aba.padEnd(15)} ${emp.cnpj}  (${n} colunas)`);
      ok++;
    } catch (e) {
      console.error(`  ❌ ${emp.aba}: ${e.message}`);
      erros++;
    }
  }

  console.log(`\nResumo: ${ok} ok, ${erros} erros\n`);
  console.log('Próximos passos:');
  console.log('  1. Auditar de-para contra folha_catalogo/iob_sage');
  console.log('  2. Confirmar pendências marcadas // TODO (VITA col N, O)');
  console.log('  3. Cadastrar códigos SAGE das 7 empresas no registro de empresas');
  console.log('  4. Implementar redeGenesisMultiDetector no app');
  console.log('  5. Estender resolverEmpresa para roteamento por aba (B2 → CNPJ)');
  console.log('  6. Implementar coluna_obs → aviso de revisão no mapper');
  console.log('  7. Implementar ignorar_situacoes:["PROLABORE"] no mapper (LEGACY)\n');

  process.exit(erros === 0 ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
