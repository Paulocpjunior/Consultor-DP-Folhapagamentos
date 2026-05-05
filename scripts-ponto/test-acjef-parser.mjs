// scripts/test-acjef-parser.mjs
//
// Script standalone pra validar o parser ACJEF antes de subir UI.
// Le um arquivo ACJEF real e o JSON do modelo (do seed), e imprime o que extraiu.
// Junior, depois de receber o 1o arquivo de ponto de um cliente, roda assim:
//
//   node scripts/test-acjef-parser.mjs ./caminho-pro-arquivo.txt ./seed/acjef_p1510_v1.json 60882552000100
//
// O 3o argumento e o CNPJ esperado (so digitos).
//
// Saida: cabecalho extraido, primeiros 5 eventos, lista de codigos sem mapeamento, avisos e erros.
// Se algo sair desalinhado (CNPJ vier picado, razao vazia, etc), e sinal pra ajustar
// posicoes no JSON do schema.

import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const [, , arquivoAcjef, arquivoModelo, cnpjEsperado] = argv;
if (!arquivoAcjef || !arquivoModelo || !cnpjEsperado) {
  console.error('Uso: node test-acjef-parser.mjs <arquivo.acjef> <modelo.json> <cnpj-so-digitos>');
  exit(1);
}

const modelo = JSON.parse(readFileSync(arquivoModelo, 'utf8'));
const buffer = readFileSync(arquivoAcjef); // Buffer (bytes)

// Decoder ISO-8859-1 (Portaria 1510)
const conteudo = buffer.toString('latin1');

// ----- Helpers (espelhados do parser TS) -----

function extrairCampo(linha, inicio, tamanho) {
  return linha.substring(inicio - 1, inicio - 1 + tamanho);
}
function converter(raw, tipo) {
  const t = String(raw).trim();
  if (t === '') return null;
  if (tipo === 'number') {
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  if (tipo === 'data_ddmmaaaa') {
    if (!/^\d{8}$/.test(t)) return null;
    return `${t.substring(0, 2)}/${t.substring(2, 4)}/${t.substring(4, 8)}`;
  }
  if (tipo === 'hora_hhmm' || tipo === 'tempo_hhmm') {
    if (!/^\d{4}$/.test(t)) return null;
    const h = Number(t.substring(0, 2)), m = Number(t.substring(2, 4));
    return tipo === 'tempo_hhmm' ? h * 60 + m : `${t.substring(0, 2)}:${t.substring(2, 4)}`;
  }
  return t;
}
function lerTipo(linha) {
  return linha.length >= 10 ? linha.charAt(9) : null;
}

// ----- Parsing -----

const linhas = conteudo.split(/\r?\n/).filter((l) => l.length > 0);
console.log(`\n=== ARQUIVO ===`);
console.log(`  Caminho: ${arquivoAcjef}`);
console.log(`  Tamanho: ${buffer.length} bytes`);
console.log(`  Linhas: ${linhas.length}`);

const schemasPorTipo = new Map(modelo.schemas.map((s) => [s.tipo, s]));

// Cabecalho
const linhaCab = linhas.find((l) => lerTipo(l) === '1');
if (!linhaCab) {
  console.error('\n!! CABECALHO (tipo 1) NAO ENCONTRADO. Verifique se o arquivo e ACJEF mesmo.');
  exit(2);
}
const schemaCab = schemasPorTipo.get('1');
console.log(`\n=== CABECALHO (tipo 1) ===`);
console.log(`  Linha bruta (primeiros 80 chars): "${linhaCab.substring(0, 80)}..."`);
const cab = {};
for (const c of schemaCab.campos) {
  cab[c.nome] = converter(extrairCampo(linhaCab, c.inicio, c.tamanho), c.tipo);
}
for (const [k, v] of Object.entries(cab)) console.log(`  ${k.padEnd(30)} = ${JSON.stringify(v)}`);

const cnpjExtraido = String(cab.cnpj || '').replace(/\D/g, '');
const cnpjEsperadoLimpo = cnpjEsperado.replace(/\D/g, '');
if (cnpjExtraido !== cnpjEsperadoLimpo) {
  console.warn(`\n!! ATENCAO: CNPJ extraido (${cnpjExtraido}) nao bate com esperado (${cnpjEsperadoLimpo})`);
  console.warn(`   Pode ser: arquivo errado OU posicao do CNPJ no schema esta deslocada.`);
}

// Eventos (tipo 4)
const linhasEventos = linhas.filter((l) => lerTipo(l) === '4');
console.log(`\n=== EVENTOS (tipo 4) ===`);
console.log(`  Total de registros tipo 4: ${linhasEventos.length}`);

const schemaEv = schemasPorTipo.get('4');
const codigosUnicos = new Set();
const pisUnicos = new Set();

console.log(`\n  Primeiros 5 registros decodificados:`);
for (let i = 0; i < Math.min(5, linhasEventos.length); i++) {
  const ev = {};
  for (const c of schemaEv.campos) {
    ev[c.nome] = converter(extrairCampo(linhasEventos[i], c.inicio, c.tamanho), c.tipo);
  }
  console.log(`  --- Evento ${i + 1} ---`);
  for (const [k, v] of Object.entries(ev)) console.log(`    ${k.padEnd(25)} = ${JSON.stringify(v)}`);
}

// Inventario completo de codigos e PIS
for (const linha of linhasEventos) {
  const cod = converter(
    extrairCampo(linha, schemaEv.campoCodigoEvento ? schemaEv.campos.find((c) => c.nome === schemaEv.campoCodigoEvento).inicio : 47, 4),
    'string',
  );
  const pis = converter(
    extrairCampo(linha, schemaEv.campos.find((c) => c.nome === (schemaEv.campoPIS ?? 'pis')).inicio, 12),
    'string',
  );
  if (cod) codigosUnicos.add(cod);
  if (pis) pisUnicos.add(pis);
}

console.log(`\n=== INVENTARIO ===`);
console.log(`  PIS distintos: ${pisUnicos.size}`);
console.log(`  Codigos de evento distintos: ${codigosUnicos.size}`);
console.log(`  Codigos encontrados: ${Array.from(codigosUnicos).sort().join(', ')}`);

const sePresentes = Array.from(codigosUnicos).filter((c) => modelo.deParaEventos[c]);
const semMapa = Array.from(codigosUnicos).filter((c) => !modelo.deParaEventos[c]);
console.log(`  Codigos COM mapeamento no modelo: ${sePresentes.length}`);
console.log(`  Codigos SEM mapeamento (precisa cadastrar): ${semMapa.length}`);
if (semMapa.length > 0) {
  console.log(`\n  Para mapear, edite "deParaEventos" no Firestore (ou no JSON do seed) com:`);
  for (const c of semMapa) {
    console.log(`    "${c}": { "eventoSAGE": "????", "descricao": "????", "unidade": "horas|dias|valor_brl", "rv": "R|V", "ignorarSeZero": true },`);
  }
}

console.log(`\n=== TRAILER ===`);
const linhaTrail = linhas.find((l) => lerTipo(l) === '5');
if (linhaTrail) {
  const schemaT = schemasPorTipo.get('5');
  for (const c of schemaT.campos) {
    console.log(`  ${c.nome.padEnd(20)} = ${JSON.stringify(converter(extrairCampo(linhaTrail, c.inicio, c.tamanho), c.tipo))}`);
  }
} else {
  console.log('  (sem trailer encontrado)');
}

console.log('\nOK. Se os valores acima parecem corretos, schema ta bom.');
console.log('Se algo veio cortado/embaralhado, ajuste posicoes no seed JSON e rode de novo.\n');
